/**
 * Unit tests for executor/executor
 * Tests: executeBatchStreaming — task execution, retries, concurrency, streaming
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompoundTask } from '../../../src/types.ts';
import type { OrchestratorEvent, OrchestratorConfig } from '../../../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../../../src/orchestrator/types.ts';

// Mock agentfn (executor.ts imports at top level, transitively loads qwenfn)
vi.mock('agentfn', () => ({
  agentfn: vi.fn(() => async () => ({ data: 'ok', raw: 'done', durationMs: 10 })),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

// Mock agent-loader (executor.ts imports at top level)
vi.mock('../../../src/agent-loader.ts', () => ({
  loadAgentPersona: vi.fn().mockReturnValue(null),
}));

// Mock task-adapter — the executor dynamically imports this.
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

function makeTask(id: string, prompt?: string): CompoundTask {
  return { id, title: `Task ${id}`, status: 'pending', prompt };
}

// Use maxConcurrent: 1 to avoid vitest race condition with concurrent
// dynamic imports (vi.mock doesn't reliably intercept concurrent `await import()`)
const config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG, maxConcurrent: 1, maxTaskRetries: 2 };

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('executeBatchStreaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-exec-'));
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

  it('returns empty for empty task list', async () => {
    const events = await collectEvents(executeBatchStreaming(ctx, [], config));
    expect(events).toHaveLength(0);
  });

  it('yields task:start and task:done for successful task', async () => {
    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'Build page')], config));

    expect(events.filter(e => e.type === 'task:start')).toHaveLength(1);
    expect(events.filter(e => e.type === 'task:done')).toHaveLength(1);
    expect((events.find(e => e.type === 'task:done') as any).result.success).toBe(true);
  });

  it('calls executeTaskWithHooks for each task', async () => {
    await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config));

    expect(mockExecuteTaskWithHooks).toHaveBeenCalledTimes(1);
    expect(mockExecuteTaskWithHooks.mock.calls[0][0].id).toBe('m1.1');
  });

  it('retries failed tasks and yields retry events', async () => {
    mockExecuteTaskWithHooks
      .mockResolvedValueOnce({ taskId: 'm1.1', raw: '', durationMs: 10, success: false, error: 'timeout' })
      .mockResolvedValueOnce({ taskId: 'm1.1', raw: 'done', durationMs: 10, success: true });

    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config));

    const retries = events.filter(e => e.type === 'task:retry');
    expect(retries).toHaveLength(1);
    expect(events.filter(e => e.type === 'task:done')).toHaveLength(1);
  });

  it('yields task:failed after exhausting retries', async () => {
    mockExecuteTaskWithHooks.mockResolvedValue({
      taskId: 'm1.1', raw: '', durationMs: 10, success: false, error: 'persistent failure',
    });

    const events = await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config));

    const failed = events.filter(e => e.type === 'task:failed');
    expect(failed).toHaveLength(1);
    expect((failed[0] as any).result.error).toContain('persistent failure');
  });

  it('executes multiple tasks sequentially', async () => {
    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'a'), makeTask('m1.2', 'b'), makeTask('m1.3', 'c')], config),
    );
    expect(events.filter(e => e.type === 'task:done')).toHaveLength(3);
  });

  it('creates per-task log file', async () => {
    await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'Build page')], config));

    const logFile = join(tmpDir, '.crew', 'tasks', 'm1.1.log');
    expect(existsSync(logFile)).toBe(true);
  });

  it('appends retry separator to log file on retry', async () => {
    mockExecuteTaskWithHooks
      .mockResolvedValueOnce({ taskId: 'm1.1', raw: '', durationMs: 10, success: false, error: 'timeout' })
      .mockResolvedValueOnce({ taskId: 'm1.1', raw: 'done', durationMs: 10, success: true });

    await collectEvents(executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config));

    const logFile = join(tmpDir, '.crew', 'tasks', 'm1.1.log');
    const content = readFileSync(logFile, 'utf-8');
    expect(content).toContain('--- Retry attempt 2 ---');
  });
});
