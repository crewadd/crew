/**
 * Integration tests for fs-native store
 *
 * End-to-end scenarios operating on real temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FsStore } from '../../../src/store/fs/index.ts';
import { writeDeps } from '../../../src/store/fs/deps-io.ts';
import { readDeps } from '../../../src/store/fs/deps-io.ts';
import { getTask } from '../../../src/store/fs/task-ops.ts';
import { getEpic } from '../../../src/store/fs/epic-ops.ts';
import { getDependencies, validateDeps } from '../../../src/store/fs/graph.ts';
import { renumber, listOrdered } from '../../../src/store/fs/ordering.ts';
import { writeYaml } from '../../../src/store/fs/yaml-io.ts';
import { writeStatus } from '../../../src/store/fs/status-io.ts';

let testDir: string;
let store: FsStore;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  store = new FsStore(testDir);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/* ================================================================== */
/*  Full project lifecycle                                             */
/* ================================================================== */

describe('full project lifecycle', () => {
  it('create project → create epic → create tasks → set deps → run tasks → complete', () => {
    // 1. writeProject
    store.saveProject({ name: 'steep_app', goal: 'Rebuild the UI' });
    expect(store.getProject()!.name).toBe('steep_app');

    // 2. createEpic
    const epic = store.createEpic({ title: 'Bootstrap' });
    expect(epic.status).toBe('planned');

    // 3. createTask — Install deps
    const task1 = store.createTask(epic.dir, {
      title: 'Install deps',
      prompt: '# Install all dependencies\n\nRun pnpm install.',
    });
    expect(task1.title).toBe('Install deps');
    expect(task1.prompt).toContain('pnpm install');

    // 4. createTask — Fix build
    const task2 = store.createTask(epic.dir, {
      title: 'Fix build',
      prompt: '# Fix the build\n\nResolve TypeScript errors.',
    });

    // 5. writeDeps(task2, ["../01-install-deps"])
    writeDeps(task2.dir, ['../01-install-deps']);

    // 6. getReady() → returns task1 only
    let ready = store.getReady();
    expect(ready).toContain(task1.dir);
    expect(ready).not.toContain(task2.dir);

    // 7. startTask(task1, "agent_builder")
    store.startTask(task1.dir, 'agent_builder');
    const started = store.getTask(task1.dir)!;
    expect(started.status).toBe('active');
    expect(started.attemptCount).toBe(1);

    // 8. setTaskStatus(task1, "done")
    store.setTaskStatus(task1.dir, 'done', 'agent_builder');
    expect(store.getTask(task1.dir)!.status).toBe('done');

    // 9. getReady() → returns task2
    ready = store.getReady();
    expect(ready).toContain(task2.dir);

    // 10. startTask(task2, "agent_builder")
    store.startTask(task2.dir, 'agent_builder');
    expect(store.getTask(task2.dir)!.status).toBe('active');

    // 11. setTaskStatus(task2, "done")
    store.setTaskStatus(task2.dir, 'done', 'agent_builder');
    expect(store.getTask(task2.dir)!.status).toBe('done');

    // 12. getReady() → returns empty
    ready = store.getReady();
    expect(ready).toEqual([]);

    // Verify final stats
    const stats = store.getStats();
    expect(stats.tasks).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.pending).toBe(0);
  });
});

/* ================================================================== */
/*  Concurrent safety                                                  */
/* ================================================================== */

describe('concurrent safety', () => {
  it('two tasks created in same epic simultaneously — no conflict', () => {
    const epic = store.createEpic({ title: 'Parallel' });

    // Simulate simultaneous creation
    const t1 = store.createTask(epic.dir, { title: 'Task A' });
    const t2 = store.createTask(epic.dir, { title: 'Task B' });

    expect(t1.slug).not.toBe(t2.slug);
    const tasks = store.listTasks(epic.dir);
    expect(tasks).toHaveLength(2);
  });

  it('status write on task A while config edit on task B — no conflict', () => {
    const epic = store.createEpic({ title: 'Test' });
    const taskA = store.createTask(epic.dir, { title: 'A' });
    const taskB = store.createTask(epic.dir, { title: 'B' });

    // Write status on A
    store.setTaskStatus(taskA.dir, 'active', 'agent');

    // Edit config on B (write new yaml)
    writeYaml(join(taskB.dir, 'task.yaml'), { title: 'B Updated', type: 'coding' });

    // Both should be independently correct
    expect(store.getTask(taskA.dir)!.status).toBe('active');
    expect(store.getTask(taskB.dir)!.config.title).toBe('B Updated');
  });

  it('two log appends to different tasks — no conflict', () => {
    const epic = store.createEpic({ title: 'Test' });
    const taskA = store.createTask(epic.dir, { title: 'A' });
    const taskB = store.createTask(epic.dir, { title: 'B' });

    store.startTask(taskA.dir, 'agent_a');
    store.startTask(taskB.dir, 'agent_b');

    expect(store.getTask(taskA.dir)!.attemptCount).toBe(1);
    expect(store.getTask(taskB.dir)!.attemptCount).toBe(1);
  });
});

/* ================================================================== */
/*  Graceful degradation                                               */
/* ================================================================== */

describe('graceful degradation', () => {
  it('missing status file → defaults to "pending"', () => {
    const epic = store.createEpic({ title: 'Test' });
    const task = store.createTask(epic.dir, { title: 'No Status' });
    // createTask doesn't write status file (implicit pending)
    expect(existsSync(join(task.dir, 'status'))).toBe(false);
    expect(store.getTask(task.dir)!.status).toBe('pending');
  });

  it('missing deps file → no dependencies', () => {
    const epic = store.createEpic({ title: 'Test' });
    const task = store.createTask(epic.dir, { title: 'No Deps' });
    expect(existsSync(join(task.dir, 'deps'))).toBe(false);
    expect(store.getTask(task.dir)!.deps).toEqual([]);
  });

  it('missing events/ dir → zero attempts', () => {
    const epic = store.createEpic({ title: 'Test' });
    const task = store.createTask(epic.dir, { title: 'No Log' });
    expect(existsSync(join(task.dir, 'events'))).toBe(false);
    expect(store.getTask(task.dir)!.attemptCount).toBe(0);
  });

  it('missing PROMPT.md → prompt is undefined', () => {
    const epic = store.createEpic({ title: 'Test' });
    const task = store.createTask(epic.dir, { title: 'No Prompt' });
    expect(store.getTask(task.dir)!.prompt).toBeUndefined();
  });

  it('broken dep reference → warning logged, dep ignored', () => {
    const epic = store.createEpic({ title: 'Test' });
    const task = store.createTask(epic.dir, { title: 'Broken Deps' });
    writeDeps(task.dir, ['../99-nonexistent']);

    const { deps, warnings } = getDependencies(task.dir);
    expect(deps).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('Broken');
  });
});

/* ================================================================== */
/*  Delete operations                                                  */
/* ================================================================== */

describe('delete operations', () => {
  it('removing a task leaves sibling deps dangling (warned on next load)', () => {
    const epic = store.createEpic({ title: 'Test' });
    const t1 = store.createTask(epic.dir, { title: 'Setup' });
    const t2 = store.createTask(epic.dir, {
      title: 'Build',
      deps: ['../01-setup'],
    });

    // Remove t1
    store.removeTask(t1.dir);

    // t2 still has deps pointing to removed dir
    const warnings = store.validateDeps();
    const broken = warnings.find(w => w.message.includes('Broken'));
    expect(broken).toBeDefined();
  });

  it('removing an epic removes all contained tasks', () => {
    const epic = store.createEpic({ title: 'Doomed' });
    const t1 = store.createTask(epic.dir, { title: 'A' });
    const t2 = store.createTask(epic.dir, { title: 'B' });

    store.removeEpic(epic.dir);

    expect(existsSync(epic.dir)).toBe(false);
    expect(existsSync(t1.dir)).toBe(false);
    expect(existsSync(t2.dir)).toBe(false);
  });

  it('removing last task in epic → epic still valid', () => {
    const epic = store.createEpic({ title: 'Lonely' });
    const task = store.createTask(epic.dir, { title: 'Only One' });

    store.removeTask(task.dir);

    const epicInfo = store.getEpic(epic.dir);
    expect(epicInfo).not.toBeNull();
    expect(epicInfo!.title).toBe('Lonely');
    expect(store.listTasks(epic.dir)).toEqual([]);
  });
});

/* ================================================================== */
/*  Reorder operations                                                 */
/* ================================================================== */

describe('reorder operations', () => {
  it('renumber tasks: [01-a, 03-b, 05-c] → [01-a, 02-b, 03-c]', () => {
    const epic = store.createEpic({ title: 'Test' });
    const tasksDir = join(epic.dir, 'tasks');

    // Manually create gapped task directories
    mkdirSync(join(tasksDir, '01-a'), { recursive: true });
    writeYaml(join(tasksDir, '01-a', 'task.yaml'), { title: 'A' });
    mkdirSync(join(tasksDir, '03-b'), { recursive: true });
    writeYaml(join(tasksDir, '03-b', 'task.yaml'), { title: 'B' });
    mkdirSync(join(tasksDir, '05-c'), { recursive: true });
    writeYaml(join(tasksDir, '05-c', 'task.yaml'), { title: 'C' });

    renumber(tasksDir);

    expect(listOrdered(tasksDir)).toEqual(['01-a', '02-b', '03-c']);
  });

  it('renumber updates deps files referencing renamed dirs', () => {
    const epic = store.createEpic({ title: 'Test' });
    const tasksDir = join(epic.dir, 'tasks');

    // Create gapped tasks
    mkdirSync(join(tasksDir, '01-setup'), { recursive: true });
    writeYaml(join(tasksDir, '01-setup', 'task.yaml'), { title: 'Setup' });
    mkdirSync(join(tasksDir, '05-build'), { recursive: true });
    writeYaml(join(tasksDir, '05-build', 'task.yaml'), { title: 'Build' });
    writeDeps(join(tasksDir, '05-build'), ['../01-setup']);

    renumber(tasksDir);

    // 05-build → 02-build, deps should still reference 01-setup (unchanged)
    expect(listOrdered(tasksDir)).toEqual(['01-setup', '02-build']);
    const deps = readFileSync(join(tasksDir, '02-build', 'deps'), 'utf-8');
    expect(deps).toContain('01-setup');
  });

  it('move task to different epic updates its deps paths', () => {
    // Create two epics
    const epic1 = store.createEpic({ title: 'Source' });
    const epic2 = store.createEpic({ title: 'Target' });

    // Create tasks in epic1
    const t1 = store.createTask(epic1.dir, { title: 'Setup' });
    const t2 = store.createTask(epic1.dir, { title: 'Build' });

    // t2 depends on t1 via relative path within same epic
    writeDeps(t2.dir, ['../01-setup']);

    // Verify dep resolves correctly
    let deps = readDeps(t2.dir);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toContain('01-setup');

    // "Move" t2 to epic2 by creating it there with cross-epic dep
    const t2moved = store.createTask(epic2.dir, { title: 'Build' });
    writeDeps(t2moved.dir, ['../../../01-source/tasks/01-setup']);

    deps = readDeps(t2moved.dir);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toContain('01-source');
    expect(deps[0]).toContain('01-setup');
  });
});
