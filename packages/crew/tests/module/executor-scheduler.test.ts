/**
 * Module Integration: Executor + Scheduler
 * Tests that computeBatches and executeBatchStreaming work together
 * to process tasks in the correct order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeBatches } from '../../src/executor/scheduler.ts';
import type { CompoundMilestone, CompoundTask } from '../../src/types.ts';
import type { OrchestratorEvent } from '../../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../../src/orchestrator/types.ts';

/* ---- Mocks ---- */

// Mock agentfn (executor.ts imports at top level, transitively loads qwenfn)
vi.mock('agentfn', () => ({
  agentfn: vi.fn(() => async () => ({ data: 'ok', raw: 'done', durationMs: 10 })),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

// Mock agent-loader (executor.ts imports at top level)
vi.mock('../../src/agent-loader.ts', () => ({
  loadAgentPersona: vi.fn().mockReturnValue(null),
}));

// Mock task-adapter — the executor dynamically imports this.
// Return a successful task result to prevent timeouts.
const mockExecuteTaskWithHooks = vi.fn();
vi.mock('../../src/executor/task-adapter.ts', () => ({
  executeTaskWithHooks: (...args: any[]) => mockExecuteTaskWithHooks(...args),
  createMilestoneTransitionContext: vi.fn(),
  createTools: vi.fn(),
}));

import { executeBatchStreaming } from '../../src/executor/executor.ts';

/* ---- Helpers ---- */

function task(id: string, deps?: string[], status: CompoundTask['status'] = 'pending'): CompoundTask {
  return { id, title: `Task ${id}`, status, deps };
}

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/* ---- Tests ---- */

describe('Executor + Scheduler Integration', () => {
  let tmpDir: string;
  let ctx: any;
  // Use maxConcurrent: 1 to avoid vitest race condition with concurrent
  // dynamic imports (vi.mock doesn't reliably intercept concurrent `await import()`)
  const config = { ...DEFAULT_ORCHESTRATOR_CONFIG, maxConcurrent: 1, maxTaskRetries: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-es-'));
    mkdirSync(join(tmpDir, '.crew', 'tasks'), { recursive: true });
    ctx = { appDir: tmpDir };

    // Default: executeTaskWithHooks returns success
    mockExecuteTaskWithHooks.mockImplementation(async (task: CompoundTask) => ({
      taskId: task.id,
      raw: 'done',
      durationMs: 10,
      success: true,
    }));
  });

  it('scheduler batches → executor processes all tasks', async () => {
    const ms: CompoundMilestone = {
      id: 1, title: 'M1', complete: false,
      tasks: [task('m1.1'), task('m1.2', ['m1.1']), task('m1.3', ['m1.1'])],
    };

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);

    // Execute each batch
    let totalDone = 0;
    for (const batch of batches) {
      const events = await collectEvents(executeBatchStreaming(ctx, batch.tasks, config));
      totalDone += events.filter(e => e.type === 'task:done').length;
    }
    expect(totalDone).toBe(3);
  });

  it('respects batch ordering for diamond dependency', async () => {
    const ms: CompoundMilestone = {
      id: 1, title: 'M1', complete: false,
      tasks: [
        task('m1.0'),
        task('m1.1', ['m1.0']),
        task('m1.2', ['m1.0']),
        task('m1.3', ['m1.1', 'm1.2']),
      ],
    };

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(3);

    expect(batches[0].tasks.map(t => t.id)).toEqual(['m1.0']);
    expect(batches[1].tasks.map(t => t.id).sort()).toEqual(['m1.1', 'm1.2']);
    expect(batches[2].tasks.map(t => t.id)).toEqual(['m1.3']);

    // Execute all batches sequentially
    const executionOrder: string[] = [];
    for (const batch of batches) {
      const events = await collectEvents(executeBatchStreaming(ctx, batch.tasks, config));
      for (const e of events) {
        if (e.type === 'task:done') executionOrder.push((e as any).taskId);
      }
    }

    // m1.3 must come after m1.1 and m1.2
    const bottomIdx = executionOrder.indexOf('m1.3');
    const leftIdx = executionOrder.indexOf('m1.1');
    const rightIdx = executionOrder.indexOf('m1.2');
    expect(bottomIdx).toBeGreaterThan(leftIdx);
    expect(bottomIdx).toBeGreaterThan(rightIdx);
  });

  it('handles empty milestone gracefully', () => {
    const ms: CompoundMilestone = { id: 1, title: 'Empty', complete: false, tasks: [] };
    const batches = computeBatches(ms);
    expect(batches).toEqual([]);
  });
});
