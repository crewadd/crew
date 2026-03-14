/**
 * Unit tests for process cancellation / abort signal handling
 * Tests: AbortSignal integration with executeBatchStreaming
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompoundTask } from '../../../src/types.ts';
import type { OrchestratorEvent, OrchestratorConfig } from '../../../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../../../src/orchestrator/types.ts';

// Mock agentfn
vi.mock('agentfn', () => ({
  agentfn: vi.fn(() => async () => ({ data: 'ok', raw: 'done', durationMs: 10 })),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

// Mock agent-loader
vi.mock('../../../src/agent-loader.ts', () => ({
  loadAgentPersona: vi.fn().mockReturnValue(null),
}));

// Mock task-adapter
const mockExecuteTaskWithHooks = vi.fn();
vi.mock('../../../src/executor/task-adapter.ts', () => ({
  executeTaskWithHooks: (...args: any[]) => mockExecuteTaskWithHooks(...args),
  createMilestoneTransitionContext: vi.fn(),
  createTools: vi.fn(),
}));

import { executeBatchStreaming } from '../../../src/executor/executor.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let tmpDir: string;
let ctx: { appDir: string };

function makeTask(id: string): CompoundTask {
  return { id, title: `Task ${id}`, status: 'pending', prompt: 'test' };
}

const config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG, maxConcurrent: 1, maxTaskRetries: 2 };

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('executeBatchStreaming with AbortSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-cancel-'));
    mkdirSync(join(tmpDir, '.crew', 'tasks'), { recursive: true });
    ctx = { appDir: tmpDir };

    // Default: tasks succeed
    mockExecuteTaskWithHooks.mockImplementation(async (task: CompoundTask) => ({
      taskId: task.id,
      raw: 'done',
      durationMs: 10,
      success: true,
    }));
  });

  it('emits task:cancelled when signal is already aborted before start', async () => {
    const ac = new AbortController();
    ac.abort();

    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1')], config, ac.signal));

    const cancelled = events.filter(e => e.type === 'task:cancelled');
    expect(cancelled).toHaveLength(1);
    expect((cancelled[0] as any).taskId).toBe('m1.1');
    expect((cancelled[0] as any).reason).toContain('Aborted before start');
  });

  it('emits task:cancelled when signal fires during execution', async () => {
    const ac = new AbortController();

    // Simulate a long-running task that gets aborted mid-execution
    mockExecuteTaskWithHooks.mockImplementation(async () => {
      return new Promise((resolve) => {
        // Abort after a short delay
        setTimeout(() => ac.abort(), 10);
        // Task would normally take longer
        setTimeout(() => resolve({
          taskId: 'm1.1',
          raw: 'done',
          durationMs: 100,
          success: true,
        }), 500);
      });
    });

    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1')], config, ac.signal));

    const cancelled = events.filter(e => e.type === 'task:cancelled');
    expect(cancelled).toHaveLength(1);
    expect((cancelled[0] as any).reason).toContain('Cancelled by user');
  });

  it('does not retry after cancellation', async () => {
    const ac = new AbortController();

    // First attempt: abort during execution
    let callCount = 0;
    mockExecuteTaskWithHooks.mockImplementation(async () => {
      callCount++;
      return new Promise((resolve) => {
        setTimeout(() => ac.abort(), 5);
        setTimeout(() => resolve({
          taskId: 'm1.1',
          raw: '',
          durationMs: 10,
          success: false,
          error: 'should not retry',
        }), 200);
      });
    });

    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1')], config, ac.signal));

    // Should only have been called once (no retry after cancel)
    expect(callCount).toBe(1);

    const retries = events.filter(e => e.type === 'task:retry');
    expect(retries).toHaveLength(0);
  });

  it('cancels remaining tasks in a batch when signal fires', async () => {
    const ac = new AbortController();

    // First task aborts the signal, second should be cancelled before starting
    let taskOrder: string[] = [];
    mockExecuteTaskWithHooks.mockImplementation(async (task: CompoundTask) => {
      taskOrder.push(task.id);
      if (task.id === 'm1.1') {
        ac.abort();
        return { taskId: task.id, raw: '', durationMs: 10, success: true };
      }
      // Second task should never be reached due to abort
      return { taskId: task.id, raw: 'done', durationMs: 10, success: true };
    });

    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1'), makeTask('m1.2')], config, ac.signal),
    );

    // m1.2 should have a cancelled event (abort was checked before attempt loop)
    const cancelledEvents = events.filter(e => e.type === 'task:cancelled');
    expect(cancelledEvents.length).toBeGreaterThanOrEqual(1);
    expect(cancelledEvents.some((e: any) => e.taskId === 'm1.2')).toBe(true);
  });

  it('works normally when no signal is provided', async () => {
    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1')], config));

    expect(events.filter(e => e.type === 'task:done')).toHaveLength(1);
    expect(events.filter(e => e.type === 'task:cancelled')).toHaveLength(0);
  });
});
