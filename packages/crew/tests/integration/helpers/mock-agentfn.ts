/**
 * Configurable mock for Claude API (agentfn)
 * Used in integration tests to simulate task execution without real API calls
 */

export interface MockAgentConfig {
  /** Simulate latency (milliseconds) */
  delay?: number;
  /** Random failure rate (0-1) */
  failureRate?: number;
  /** Emit intermediate streaming events */
  streamEvents?: boolean;
  /** Override specific tasks with custom results */
  taskResults?: Map<string, {
    success: boolean;
    output?: string;
    error?: string;
    attempts?: number; // Fail this many times before succeeding
  }>;
}

export interface MockAgentResult {
  data: string;
  raw: string;
  durationMs: number;
}

/**
 * Create a mock agentfn function with configurable behavior
 */
export function createMockAgentFn(config: MockAgentConfig = {}) {
  const {
    delay = 5,
    failureRate = 0,
    streamEvents = true,
    taskResults = new Map(),
  } = config;

  // Track how many times each task has been attempted
  const attemptCounts = new Map<string, number>();

  return (opts: any) => {
    return async function* () {
      // Extract task ID from options (could be in various places)
      const taskId = opts?.vars?.taskId || opts?.taskId || 'unknown';

      // Track attempts
      const currentAttempt = (attemptCounts.get(taskId) || 0) + 1;
      attemptCounts.set(taskId, currentAttempt);

      // Simulate delay
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Stream intermediate events if enabled
      if (streamEvents && opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] Starting task execution...\n`);
        await new Promise(resolve => setTimeout(resolve, delay / 2));
        opts.hooks.onStream(`[${taskId}] Processing...\n`);
        await new Promise(resolve => setTimeout(resolve, delay / 2));
      }

      // Check for task-specific override
      const taskOverride = taskResults.get(taskId);
      if (taskOverride) {
        // Check if we should fail based on attempt count
        if (taskOverride.attempts && currentAttempt <= taskOverride.attempts) {
          throw new Error(taskOverride.error || `Task ${taskId} failed (attempt ${currentAttempt})`);
        }

        if (!taskOverride.success) {
          throw new Error(taskOverride.error || `Task ${taskId} failed`);
        }

        const output = taskOverride.output || `Task ${taskId} completed successfully`;
        if (streamEvents && opts?.hooks?.onStream) {
          opts.hooks.onStream(`${output}\n`);
        }

        return {
          data: output,
          raw: output,
          durationMs: delay * 2,
        };
      }

      // Random failure simulation
      if (failureRate > 0 && Math.random() < failureRate) {
        throw new Error(`Random failure for task ${taskId}`);
      }

      // Default success
      const successOutput = `Task ${taskId} completed successfully`;
      if (streamEvents && opts?.hooks?.onStream) {
        opts.hooks.onStream(`${successOutput}\n`);
      }

      return {
        data: successOutput,
        raw: successOutput,
        durationMs: delay * 2,
      };
    };
  };
}

/**
 * Create a simple mock that always succeeds
 */
export function createSimpleMock() {
  return createMockAgentFn({ delay: 5, streamEvents: true });
}

/**
 * Create a mock that fails specific tasks
 */
export function createFailingMock(failingTaskIds: string[]) {
  const taskResults = new Map<string, { success: boolean; error?: string }>();
  for (const taskId of failingTaskIds) {
    taskResults.set(taskId, {
      success: false,
      error: `Simulated failure for ${taskId}`,
    });
  }
  return createMockAgentFn({ delay: 5, taskResults });
}

/**
 * Create a mock that retries before succeeding
 */
export function createRetryMock(taskId: string, attemptsBeforeSuccess: number) {
  const taskResults = new Map();
  taskResults.set(taskId, {
    success: true,
    attempts: attemptsBeforeSuccess,
    error: `Task ${taskId} temporarily failed`,
  });
  return createMockAgentFn({ delay: 5, taskResults });
}
