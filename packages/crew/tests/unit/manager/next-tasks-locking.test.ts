/**
 * Unit tests for nextTasks with epic locking
 *
 * Verifies that the manager's nextTasks function properly reports
 * blocked-by-failure when a task has failed in a previous epic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBuildContext, nextTasks, createEpic, addTask, editTask } from '../../../src/manager/index.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function setupProject(testDir: string): void {
  mkdirSync(join(testDir, '.crew'), { recursive: true });
  writeFileSync(
    join(testDir, '.crew', 'project.json'),
    JSON.stringify({
      version: 1,
      name: 'Test Project',
      goal: 'Test goal',
      workflow: [],
      epics: [],
      agents: [],
      skills: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    }, null, 2),
    'utf-8',
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('nextTasks with epic locking', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `crew-next-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setupProject(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns next task when no failures', async () => {
    const ctx = createBuildContext(testDir);

    await createEpic(ctx, 1, 'Epic 1');
    await createEpic(ctx, 2, 'Epic 2');

    await addTask(ctx, 'Task 1.1', { epic: 1 });
    await addTask(ctx, 'Task 2.1', { epic: 2 });

    // Complete all epic 1 tasks
    await editTask(ctx, 'm1.1', 'done');

    const result = await nextTasks(ctx);
    expect(result.next.length).toBe(1);
    expect(result.next[0].title).toBe('Task 2.1');
    expect(result.blockedByFailure).toBeUndefined();
  });

  it('reports blockedByFailure when task failed blocks next epic', async () => {
    const ctx = createBuildContext(testDir);

    await createEpic(ctx, 1, 'Foundation');
    await createEpic(ctx, 2, 'Features');

    await addTask(ctx, 'Setup repo', { epic: 1 });
    await addTask(ctx, 'Build feature', { epic: 2 });

    // Fail the task in epic 1
    await editTask(ctx, 'm1.1', 'failed');

    const result = await nextTasks(ctx);
    expect(result.next.length).toBe(0);
    expect(result.blockedByFailure).toBeDefined();
    expect(result.blockedByFailure!.epicNum).toBe(1);
    expect(result.blockedByFailure!.epicTitle).toBe('Foundation');
    expect(result.blockedByFailure!.failedTasks).toContain('m1.1');
  });

  it('reports blockedByFailure for failed task in middle of epic', async () => {
    const ctx = createBuildContext(testDir);

    await createEpic(ctx, 2, 'Core');
    await addTask(ctx, 'Task 2.1', { epic: 2 });
    await addTask(ctx, 'Task 2.2', { epic: 2 });
    await addTask(ctx, 'Task 2.3', { epic: 2 });

    await createEpic(ctx, 3, 'Polish');
    await addTask(ctx, 'Task 3.1', { epic: 3 });

    // Complete first two, fail the third
    await editTask(ctx, 'm2.1', 'done');
    await editTask(ctx, 'm2.2', 'done');
    await editTask(ctx, 'm2.3', 'failed');

    const result = await nextTasks(ctx);
    expect(result.next.length).toBe(0);
    expect(result.blockedByFailure).toBeDefined();
    expect(result.blockedByFailure!.epicNum).toBe(2);
    expect(result.blockedByFailure!.failedTasks).toContain('m2.3');
  });

  it('resumes after failed task is marked done', async () => {
    const ctx = createBuildContext(testDir);

    await createEpic(ctx, 1, 'Foundation');
    await createEpic(ctx, 2, 'Features');

    await addTask(ctx, 'Setup', { epic: 1 });
    await addTask(ctx, 'Build', { epic: 2 });

    // Fail then fix the task
    await editTask(ctx, 'm1.1', 'failed');

    let result = await nextTasks(ctx);
    expect(result.next.length).toBe(0);
    expect(result.blockedByFailure).toBeDefined();

    // Now mark it done (simulating a successful retry)
    await editTask(ctx, 'm1.1', 'done');

    result = await nextTasks(ctx);
    expect(result.next.length).toBe(1);
    expect(result.next[0].title).toBe('Build');
    expect(result.blockedByFailure).toBeUndefined();
  });
});
