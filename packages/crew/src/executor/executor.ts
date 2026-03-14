import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { agentfn } from '@crew/agentfn';
import type { BuildContext, CompoundTask, TaskResult } from '../types.ts';
import type { OrchestratorEvent, OrchestratorConfig } from '../orchestrator/types.ts';
import { loadAgentPersona } from '../agent-loader.ts';
import { resolveTaskLogPath } from '../task-log.ts';

/* ------------------------------------------------------------------ */
/*  Abort helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Race a promise against an AbortSignal.
 * Returns null if the signal fires before the promise resolves.
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve) => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (err) => { signal.removeEventListener('abort', onAbort); throw err; },
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Semaphore for concurrency control                                  */
/* ------------------------------------------------------------------ */

class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

/* ------------------------------------------------------------------ */
/*  Execute single task                                                */
/* ------------------------------------------------------------------ */

async function executeOneTask(
  ctx: BuildContext,
  task: CompoundTask,
  config: OrchestratorConfig,
  attempt: number,
  previousError?: string,
  previousCheckFailures?: string,
  onStream?: (chunk: string) => void,
  logFile?: string,
  signal?: AbortSignal,
  checksOnly?: boolean,
  resumeSessionId?: string,
): Promise<TaskResult> {
  // ALWAYS use programmable executor with full hook chain
  // The hook chain (task > task type > project) handles all execution paths
  const { executeTaskWithHooks } = await import('./task-adapter.ts');
  const agent = task.assignee ? loadAgentPersona(ctx, task.assignee) : null;

  return await executeTaskWithHooks(
    task,
    ctx,
    config,
    attempt,
    agent?.config,
    previousError,
    previousCheckFailures,
    onStream,
    logFile,
    signal,
    checksOnly,
    resumeSessionId,
  );
}

/* ------------------------------------------------------------------ */
/*  Execute batch with streaming events                                */
/* ------------------------------------------------------------------ */

/**
 * Execute a batch of tasks with concurrency control and retry.
 * Yields task-level events as they occur.
 *
 * @param signal - Optional AbortSignal to cancel execution. When aborted,
 *                 running tasks are interrupted and a task:cancelled event is emitted.
 */
export async function* executeBatchStreaming(
  ctx: BuildContext,
  tasks: CompoundTask[],
  config: OrchestratorConfig,
  signal?: AbortSignal,
  checksOnly?: boolean,
  resumeSessionId?: string,
): AsyncGenerator<OrchestratorEvent> {
  if (tasks.length === 0) return;

  const sem = new Semaphore(config.maxConcurrent);

  // For sequential behavior when there's one task, just do it inline.
  // For parallel, collect events from concurrent executions.
  type CollectedEvent = OrchestratorEvent;
  const events: CollectedEvent[] = [];
  let resolveWait: (() => void) | undefined;

  function pushEvent(event: CollectedEvent): void {
    events.push(event);
    resolveWait?.();
  }

  let completed = 0;
  const total = tasks.length;

  const taskPromises = tasks.map(async (task) => {
    await sem.acquire();
    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        pushEvent({ type: 'task:cancelled', taskId: task.id, reason: 'Aborted before start' });
        return;
      }

      const epicId = parseInt(task.id.match(/^m(\d+)/)?.[1] ?? '0', 10);

      let lastError: string | undefined;
      let lastCheckFailures: string | undefined;

      for (let attempt = 1; attempt <= config.maxTaskRetries; attempt++) {
        // Check abort before each attempt
        if (signal?.aborted) {
          pushEvent({ type: 'task:cancelled', taskId: task.id, reason: 'Cancelled by user' });
          return;
        }

        // Each attempt gets its own log file:
        //   .crew/epics/<epic>/tasks/<task>/logs/attempt-<N>.log
        const logPaths = resolveTaskLogPath(ctx.appDir, task.id, attempt);
        const logFile = logPaths.logFile;
        writeFileSync(logFile, '');

        const onStream = (chunk: string): void => {
          appendFileSync(logFile, chunk);
          pushEvent({ type: 'task:stream', taskId: task.id, chunk });
        };

        pushEvent({
          type: 'task:start',
          taskId: task.id,
          epicId,
          attempt,
          logFile,
        });

        // Race the task execution against the abort signal
        const result = await (signal
          ? raceAbort(
              executeOneTask(ctx, task, config, attempt, attempt > 1 ? lastError : undefined, attempt > 1 ? lastCheckFailures : undefined, onStream, logFile, signal, checksOnly, resumeSessionId),
              signal,
            )
          : executeOneTask(ctx, task, config, attempt, attempt > 1 ? lastError : undefined, attempt > 1 ? lastCheckFailures : undefined, onStream, logFile, undefined, checksOnly, resumeSessionId));

        // If aborted during execution, the raceAbort returns null
        if (result === null) {
          pushEvent({ type: 'task:cancelled', taskId: task.id, reason: 'Cancelled by user' });
          return;
        }

        if (result.success) {
          pushEvent({ type: 'task:done', taskId: task.id, result });
          break;
        }

        // Capture error for retry context on next attempt
        lastError = result.error ?? 'Unknown error';

        // Extract structured check failures for retry context
        const checks = (result as any).metadata?.checks as Array<{ name: string; passed: boolean; issues: string[] }> | undefined;
        if (checks?.length) {
          lastCheckFailures = checks
            .filter(c => !c.passed)
            .map(c => `### ${c.name}\n${c.issues.join('\n')}`)
            .join('\n\n');
        } else {
          lastCheckFailures = undefined;
        }

        // Failed — retry or give up
        if (attempt < config.maxTaskRetries) {
          pushEvent({
            type: 'task:retry',
            taskId: task.id,
            attempt: attempt + 1,
            error: lastError,
          });
        } else {
          pushEvent({ type: 'task:failed', taskId: task.id, result });
        }
      }
    } finally {
      sem.release();
      completed++;
      if (completed === total) pushEvent({ type: 'task:start', taskId: '__done__', epicId: 0, attempt: 0 });
    }
  });

  // Yield events as they arrive
  const allDone = Promise.all(taskPromises);
  let done = false;
  allDone.then(() => { done = true; resolveWait?.(); });

  while (!done || events.length > 0) {
    if (events.length > 0) {
      const event = events.shift()!;
      // Skip the sentinel event
      if (event.type === 'task:start' && 'taskId' in event && event.taskId === '__done__') continue;
      yield event;
    } else {
      await new Promise<void>((resolve) => { resolveWait = resolve; });
    }
  }
}
