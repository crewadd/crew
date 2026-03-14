import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompoundStatus, BuildContext } from '../src/types.ts';
import { ProgressLogger } from '../src/progress.ts';

// Mock manager/index.ts (which exports statusJson and editTask)
const mockStatusJson = vi.fn<() => Promise<CompoundStatus>>();
const mockEditTask = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/manager/index.ts', () => ({
  statusJson: (...args: any[]) => mockStatusJson(...args),
  editTask: (...args: any[]) => mockEditTask(...args),
}));

import { prepareResume } from '../src/resume.ts';

describe('prepareResume', () => {
  let tempDir: string;
  let logger: ProgressLogger;
  let ctx: BuildContext;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-resume-'));
    logger = new ProgressLogger(tempDir);
    ctx = { appDir: tempDir, compoundScript: join(tempDir, 'compound.ts') };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults for fresh run (no log, no existing plan)', async () => {
    mockStatusJson.mockRejectedValue(new Error('no existing plan'));

    const state = await prepareResume(ctx, logger);

    expect(state.alreadyDone).toBe(false);
    expect(state.activeTasksReset).toEqual([]);
    expect(state.skipPlanning).toBe(false);
  });

  it('returns alreadyDone when log has project:done with success', async () => {
    logger.log({ event: 'session:start', pid: 1 });
    logger.log({ event: 'project:done', success: true, iterations: 1, totalDurationMs: 5000 });
    logger.log({ event: 'session:end', reason: 'completed' });

    const state = await prepareResume(ctx, logger);

    expect(state.alreadyDone).toBe(true);
  });

  it('returns alreadyDone false when log has project:done with success false', async () => {
    logger.log({ event: 'project:done', success: false, iterations: 3, totalDurationMs: 10000 });
    logger.log({ event: 'session:end', reason: 'completed' });

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [{ id: 1, title: 'M1', tasks: [], complete: false }],
    });

    const state = await prepareResume(ctx, logger);

    expect(state.alreadyDone).toBe(false);
    expect(state.skipPlanning).toBe(true);
  });

  it('resets stale active tasks to pending', async () => {
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [
        {
          id: 1,
          title: 'M1',
          tasks: [
            { id: 'm1.1', title: 'Done task', status: 'done' },
            { id: 'm1.2', title: 'Active task', status: 'active' },
            { id: 'm1.3', title: 'Pending task', status: 'pending' },
          ],
          complete: false,
        },
        {
          id: 2,
          title: 'M2',
          tasks: [
            { id: 'm2.1', title: 'Another active', status: 'active' },
          ],
          complete: false,
        },
      ],
    });

    const state = await prepareResume(ctx, logger);

    expect(state.activeTasksReset).toEqual(['m1.2', 'm2.1']);
    expect(mockEditTask).toHaveBeenCalledTimes(2);
    expect(mockEditTask).toHaveBeenCalledWith(ctx, 'm1.2', 'pending');
    expect(mockEditTask).toHaveBeenCalledWith(ctx, 'm2.1', 'pending');
  });

  it('sets skipPlanning when epics exist', async () => {
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [
        { id: 1, title: 'M1', tasks: [], complete: true },
        { id: 2, title: 'M2', tasks: [{ id: 'm2.1', title: 'T', status: 'pending' }], complete: false },
      ],
    });

    const state = await prepareResume(ctx, logger);

    expect(state.skipPlanning).toBe(true);
    expect(state.alreadyDone).toBe(false);
  });

  it('uses last project:done entry when multiple exist', async () => {
    // First run failed
    logger.log({ event: 'project:done', success: false, iterations: 3, totalDurationMs: 10000 });
    // Second run succeeded
    logger.log({ event: 'project:done', success: true, iterations: 1, totalDurationMs: 2000 });

    const state = await prepareResume(ctx, logger);

    expect(state.alreadyDone).toBe(true);
  });

  it('handles empty epics list — no skipPlanning', async () => {
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [],
    });

    const state = await prepareResume(ctx, logger);

    expect(state.skipPlanning).toBe(false);
  });
});
