/**
 * Module Integration: Store + Manager
 * Tests that manager functions correctly read/write through the hierarchical store
 * without mocking the store layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HierarchicalStore } from '../../src/store/hierarchical-store.ts';
import {
  createBuildContext,
  createMilestone,
  addTask,
  editTask,
  statusJson,
  nextTasks,
} from '../../src/manager/index.ts';

describe('Store + Manager Integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'crew-sm-'));
    mkdirSync(join(testDir, '.crew'), { recursive: true });
    writeFileSync(join(testDir, '.crew', 'project.json'), JSON.stringify({
      version: 1, name: 'Integration Test', goal: 'Test',
      workflow: [], milestones: [], agents: [], skills: [],
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }, null, 2));
    // Ensure plan dir exists
    mkdirSync(join(testDir, '.crew', 'epics'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('creates milestones and tasks visible in store', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 0, 'Foundation');
    await createMilestone(ctx, 1, 'Implementation');

    const store = new HierarchicalStore(testDir);
    const milestones = store.listMilestones();
    expect(milestones.length).toBe(2);
    expect(milestones.map(m => m.title)).toContain('Foundation');
    expect(milestones.map(m => m.title)).toContain('Implementation');
  });

  it('adds tasks with dependency wiring', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 1, 'Setup');
    const id1 = await addTask(ctx, 'Create project', { milestone: 1, prompt: 'Init' });
    const id2 = await addTask(ctx, 'Install deps', { milestone: 1, prompt: 'Install', deps: [id1] });

    expect(id1).toBe('m1.1');
    expect(id2).toBe('m1.2');

    const store = new HierarchicalStore(testDir);
    const ms = store.getMilestoneByNumber(1);
    expect(ms?.task_ids.length).toBe(2);

    // Check dependency wiring
    const task2 = store.getTask(ms!.task_ids[1]);
    expect(task2?.dependencies.length).toBe(1);
  });

  it('statusJson reflects store state accurately', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 1, 'Build');
    await addTask(ctx, 'Task A', { milestone: 1, prompt: 'Do A' });
    await addTask(ctx, 'Task B', { milestone: 1, prompt: 'Do B' });

    const status = await statusJson(ctx);
    expect(status.name).toBe('Integration Test');
    expect(status.milestones.length).toBeGreaterThanOrEqual(1);

    const buildMs = status.milestones.find(m => m.title === 'Build');
    expect(buildMs?.tasks.length).toBe(2);
    expect(buildMs?.complete).toBe(false);
  });

  it('editTask changes status in store', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 1, 'Work');
    const id = await addTask(ctx, 'My Task', { milestone: 1, prompt: 'Do it' });

    await editTask(ctx, id, 'active');

    const store = new HierarchicalStore(testDir);
    const ms = store.getMilestoneByNumber(1);
    const task = store.getTask(ms!.task_ids[0]);
    expect(task?.status).toBe('active');
  });

  it('nextTasks returns tasks with met dependencies', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 1, 'Work');
    const id1 = await addTask(ctx, 'First', { milestone: 1, prompt: 'Do first' });
    await addTask(ctx, 'Second', { milestone: 1, prompt: 'Do second', deps: [id1] });

    const result = await nextTasks(ctx);
    // Only first task should be ready (no deps)
    const allNext = [...result.next, ...result.queue];
    expect(allNext.some(t => t.title === 'First')).toBe(true);
  });

  it('skips duplicate milestone creation', async () => {
    const ctx = createBuildContext(testDir);

    await createMilestone(ctx, 1, 'Setup');
    await createMilestone(ctx, 1, 'Setup'); // duplicate — should be idempotent

    const store = new HierarchicalStore(testDir);
    const milestones = store.listMilestones();
    const setupMs = milestones.filter(m => m.number === 1);
    expect(setupMs.length).toBe(1);
  });
});
