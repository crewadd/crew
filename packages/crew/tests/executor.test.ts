import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompoundTask } from '../src/types.ts';
import type { OrchestratorEvent, OrchestratorConfig } from '../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../src/orchestrator/types.ts';

// Hoist mock fns
const { mockClaudeFnInstance, mockClaudeFn } = vi.hoisted(() => {
  const mockClaudeFnInstance = vi.fn();
  const mockClaudeFn = vi.fn((opts: any) => {
    return async () => {
      opts?.hooks?.onStream?.('chunk1');
      opts?.hooks?.onStream?.('chunk2');
      return mockClaudeFnInstance();
    };
  });
  return { mockClaudeFnInstance, mockClaudeFn };
});

// Mock agentfn
vi.mock('agentfn', () => ({
  agentfn: mockClaudeFn,
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

// Mock manager/index.ts (which exports editTask, doneTask, taskContext)
vi.mock('../src/manager/index.ts', () => ({
  editTask: vi.fn().mockResolvedValue(undefined),
  doneTask: vi.fn().mockResolvedValue(undefined),
  taskContext: vi.fn().mockResolvedValue('Do the task'),
}));

import { executeBatchStreaming } from '../src/executor/executor.ts';
import { editTask, doneTask } from '../src/manager/index.ts';

let tmpDir: string;
let ctx: { appDir: string; compoundScript: string };

function makeTask(id: string, prompt?: string): CompoundTask {
  return { id, title: `Task ${id}`, status: 'pending', prompt };
}

const config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG, maxConcurrent: 2, maxTaskRetries: 2 };

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('executeBatchStreaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-test-'));
    ctx = { appDir: tmpDir, compoundScript: join(tmpDir, 'compound.ts') };
  });

  it('yields task:start and task:done for successful task', async () => {
    mockClaudeFnInstance.mockResolvedValue({ data: 'ok', raw: 'done', durationMs: 100 });

    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'Build page')], config),
    );

    const starts = events.filter((e) => e.type === 'task:start');
    const dones = events.filter((e) => e.type === 'task:done');
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
    expect((dones[0] as any).result.success).toBe(true);
  });

  it('marks task active then done via compound', async () => {
    mockClaudeFnInstance.mockResolvedValue({ data: 'ok', raw: 'done', durationMs: 100 });

    await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config),
    );

    expect(editTask).toHaveBeenCalledWith(ctx, 'm1.1', 'active');
    expect(doneTask).toHaveBeenCalledWith(ctx, 'm1.1');
  });

  it('retries failed tasks and yields retry events', async () => {
    mockClaudeFnInstance
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: 'ok', raw: 'done', durationMs: 100 });

    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config),
    );

    const retries = events.filter((e) => e.type === 'task:retry');
    expect(retries).toHaveLength(1);
    expect((retries[0] as any).error).toContain('timeout');

    const dones = events.filter((e) => e.type === 'task:done');
    expect(dones).toHaveLength(1);
  });

  it('yields task:failed after exhausting retries', async () => {
    mockClaudeFnInstance.mockRejectedValue(new Error('persistent failure'));

    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config),
    );

    const failed = events.filter((e) => e.type === 'task:failed');
    expect(failed).toHaveLength(1);
    expect((failed[0] as any).result.error).toContain('persistent failure');
  });

  it('returns empty for empty task list', async () => {
    const events = await collectEvents(
      executeBatchStreaming(ctx, [], config),
    );
    expect(events).toHaveLength(0);
  });

  it('executes multiple tasks concurrently', async () => {
    mockClaudeFnInstance.mockResolvedValue({ data: 'ok', raw: 'done', durationMs: 100 });

    const events = await collectEvents(
      executeBatchStreaming(
        ctx,
        [makeTask('m1.1', 'a'), makeTask('m1.2', 'b'), makeTask('m1.3', 'c')],
        config,
      ),
    );

    const dones = events.filter((e) => e.type === 'task:done');
    expect(dones).toHaveLength(3);
  });

  it('writes streaming output to per-task log file', async () => {
    mockClaudeFnInstance.mockResolvedValue({ data: 'ok', raw: 'done', durationMs: 100 });

    const events = await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'Build page')], config),
    );

    // Log file should exist with streamed chunks
    const logFile = join(tmpDir, '.crew', 'tasks', 'm1.1.log');
    expect(existsSync(logFile)).toBe(true);
    expect(readFileSync(logFile, 'utf-8')).toBe('chunk1chunk2');

    // task:stream events should have been emitted
    const streams = events.filter((e) => e.type === 'task:stream');
    expect(streams).toHaveLength(2);
    expect((streams[0] as any).chunk).toBe('chunk1');
    expect((streams[1] as any).chunk).toBe('chunk2');
  });

  it('appends retry separator to log file on retry', async () => {
    mockClaudeFnInstance
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: 'ok', raw: 'done', durationMs: 100 });

    await collectEvents(
      executeBatchStreaming(ctx, [makeTask('m1.1', 'test')], config),
    );

    const logFile = join(tmpDir, '.crew', 'tasks', 'm1.1.log');
    const content = readFileSync(logFile, 'utf-8');
    // First attempt streams chunks, then retry separator, then second attempt streams chunks
    expect(content).toContain('chunk1chunk2');
    expect(content).toContain('--- Retry attempt 2 ---');
  });
});
