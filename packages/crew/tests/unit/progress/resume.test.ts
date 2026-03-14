/**
 * Unit tests for resume module
 * Tests: prepareResume — completion detection, stale task reset, skip planning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompoundStatus, BuildContext } from '../../../src/types.ts';
import { ProgressLogger } from '../../../src/progress.ts';

const mockStatusJson = vi.fn<() => Promise<CompoundStatus>>();
const mockEditTask = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/manager/index.ts', () => ({
  statusJson: (...args: any[]) => mockStatusJson(...args),
  editTask: (...args: any[]) => mockEditTask(...args),
}));

import { prepareResume } from '../../../src/resume.ts';

describe('prepareResume', () => {
  let tempDir: string;
  let logger: ProgressLogger;
  let ctx: BuildContext;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-resume-'));
    logger = new ProgressLogger(tempDir);
    ctx = { appDir: tempDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults for fresh run', async () => {
    mockStatusJson.mockRejectedValue(new Error('no plan'));
    const state = await prepareResume(ctx, logger);
    expect(state.alreadyDone).toBe(false);
    expect(state.activeTasksReset).toEqual([]);
    expect(state.skipPlanning).toBe(false);
  });

  it('detects already-done project', async () => {
    logger.log({ event: 'project:done', success: true, iterations: 1, totalDurationMs: 5000 });
    const state = await prepareResume(ctx, logger);
    expect(state.alreadyDone).toBe(true);
  });

  it('not alreadyDone when project:done has success=false', async () => {
    logger.log({ event: 'project:done', success: false, iterations: 3, totalDurationMs: 10000 });
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [{ id: 1, title: 'M1', tasks: [], complete: false }],
    });
    const state = await prepareResume(ctx, logger);
    expect(state.alreadyDone).toBe(false);
    expect(state.skipPlanning).toBe(true);
  });

  it('resets stale active tasks to pending', async () => {
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [
        {
          id: 1, title: 'M1', complete: false,
          tasks: [
            { id: 'm1.1', title: 'Done', status: 'done' },
            { id: 'm1.2', title: 'Active', status: 'active' },
          ],
        },
        {
          id: 2, title: 'M2', complete: false,
          tasks: [{ id: 'm2.1', title: 'Also active', status: 'active' }],
        },
      ],
    });

    const state = await prepareResume(ctx, logger);
    expect(state.activeTasksReset).toEqual(['m1.2', 'm2.1']);
    expect(mockEditTask).toHaveBeenCalledTimes(2);
  });

  it('sets skipPlanning when milestones exist', async () => {
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [
        { id: 1, title: 'M1', tasks: [], complete: true },
        { id: 2, title: 'M2', tasks: [{ id: 'm2.1', title: 'T', status: 'pending' }], complete: false },
      ],
    });
    const state = await prepareResume(ctx, logger);
    expect(state.skipPlanning).toBe(true);
  });

  it('uses last project:done entry', async () => {
    logger.log({ event: 'project:done', success: false, iterations: 3, totalDurationMs: 10000 });
    logger.log({ event: 'project:done', success: true, iterations: 1, totalDurationMs: 2000 });
    const state = await prepareResume(ctx, logger);
    expect(state.alreadyDone).toBe(true);
  });

  it('handles empty milestones — no skipPlanning', async () => {
    mockStatusJson.mockResolvedValue({ name: 'Test', milestones: [] });
    const state = await prepareResume(ctx, logger);
    expect(state.skipPlanning).toBe(false);
  });
});
