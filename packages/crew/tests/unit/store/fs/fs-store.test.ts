/**
 * Unit tests for FsStore facade
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FsStore } from '../../../../src/store/fs/index.ts';
import { writeStatus } from '../../../../src/store/fs/status-io.ts';
import { writeDeps } from '../../../../src/store/fs/deps-io.ts';
import { writeYaml } from '../../../../src/store/fs/yaml-io.ts';

let testDir: string;
let store: FsStore;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-fs-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  store = new FsStore(testDir);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  initialization                                                     */
/* ------------------------------------------------------------------ */

describe('initialization', () => {
  it('creates .crew/epics/ directory on construction', () => {
    expect(existsSync(join(testDir, '.crew', 'epics'))).toBe(true);
  });

  it('accepts planDirOverride', () => {
    const customDir = join(testDir, 'custom-plan');
    const customStore = new FsStore(testDir, customDir);
    expect(existsSync(join(customDir, 'epics'))).toBe(true);
    expect(customStore.root).toBe(customDir);
  });
});

/* ------------------------------------------------------------------ */
/*  project operations                                                 */
/* ------------------------------------------------------------------ */

describe('project operations', () => {
  it('reads project.yaml', () => {
    store.saveProject({ name: 'test', goal: 'Build it' });
    const project = store.getProject();
    expect(project!.name).toBe('test');
    expect(project!.goal).toBe('Build it');
  });

  it('saves and reloads project', () => {
    store.saveProject({ name: 'myapp', description: 'Cool app', goal: 'Ship' });
    const project = store.getProject();
    expect(project!.name).toBe('myapp');
    expect(project!.description).toBe('Cool app');
  });

  it('returns null when project.yaml missing', () => {
    expect(store.getProject()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  epic operations                                                    */
/* ------------------------------------------------------------------ */

describe('epic operations', () => {
  it('creates and lists epics', () => {
    store.createEpic({ title: 'Bootstrap' });
    store.createEpic({ title: 'Build' });
    const epics = store.listEpics();
    expect(epics).toHaveLength(2);
    expect(epics[0].title).toBe('Bootstrap');
    expect(epics[1].title).toBe('Build');
  });

  it('retrieves epic by directory name', () => {
    const created = store.createEpic({ title: 'Bootstrap' });
    const epic = store.getEpicBySlug(created.slug);
    expect(epic).not.toBeNull();
    expect(epic!.title).toBe('Bootstrap');
  });

  it('retrieves epic by number (from prefix)', () => {
    store.createEpic({ title: 'First' });
    store.createEpic({ title: 'Second' });
    const epic = store.getEpicByNumber(2);
    expect(epic).not.toBeNull();
    expect(epic!.title).toBe('Second');
  });

  it('saves updated epic (writes to epic.yaml + status)', () => {
    const created = store.createEpic({ title: 'Bootstrap' });
    store.saveEpic(created.dir, { title: 'Bootstrap v2', status: 'active' });

    const updated = store.getEpic(created.dir);
    expect(updated!.status).toBe('active');
    expect(updated!.config.title).toBe('Bootstrap v2');
  });

  it('removes epic', () => {
    const created = store.createEpic({ title: 'Temp' });
    expect(store.removeEpic(created.dir)).toBe(true);
    expect(store.getEpic(created.dir)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  task operations                                                    */
/* ------------------------------------------------------------------ */

describe('task operations', () => {
  let epicDir: string;

  beforeEach(() => {
    const epic = store.createEpic({ title: 'Bootstrap' });
    epicDir = epic.dir;
  });

  it('creates task with prompt', () => {
    const task = store.createTask(epicDir, {
      title: 'Setup',
      prompt: '# Do the setup',
    });
    expect(task.title).toBe('Setup');
    expect(task.prompt).toBe('# Do the setup');
  });

  it('retrieves task by directory path', () => {
    const created = store.createTask(epicDir, { title: 'Build' });
    const task = store.getTask(created.dir);
    expect(task).not.toBeNull();
    expect(task!.title).toBe('Build');
  });

  it('lists tasks for epic', () => {
    store.createTask(epicDir, { title: 'A' });
    store.createTask(epicDir, { title: 'B' });
    expect(store.listTasks(epicDir)).toHaveLength(2);
  });

  it('lists all tasks across epics', () => {
    const epic2 = store.createEpic({ title: 'Second' });
    store.createTask(epicDir, { title: 'T1' });
    store.createTask(epic2.dir, { title: 'T2' });
    expect(store.listAllTasks()).toHaveLength(2);
  });

  it('updates task status (writes status file + log)', () => {
    const task = store.createTask(epicDir, { title: 'Build' });
    store.setTaskStatus(task.dir, 'done', 'agent_builder');
    const updated = store.getTask(task.dir);
    expect(updated!.status).toBe('done');
  });

  it('starts task (active status + new log attempt)', () => {
    const task = store.createTask(epicDir, { title: 'Build' });
    store.startTask(task.dir, 'agent_builder');
    const updated = store.getTask(task.dir);
    expect(updated!.status).toBe('active');
    expect(updated!.attemptCount).toBe(1);
  });

  it('removes task', () => {
    const task = store.createTask(epicDir, { title: 'Temp' });
    expect(store.removeTask(task.dir)).toBe(true);
    expect(store.getTask(task.dir)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  dependency resolution                                              */
/* ------------------------------------------------------------------ */

describe('dependency resolution', () => {
  it('getReady returns tasks with all deps done', () => {
    const epic = store.createEpic({ title: 'Bootstrap' });
    const t1 = store.createTask(epic.dir, { title: 'Setup' });
    const t2 = store.createTask(epic.dir, { title: 'Build', deps: ['../01-setup'] });

    // t1 pending, t2 has unmet dep → only t1 ready
    let ready = store.getReady();
    expect(ready).toContain(t1.dir);
    expect(ready).not.toContain(t2.dir);

    // Complete t1 → t2 should be ready
    store.setTaskStatus(t1.dir, 'done', 'agent');
    ready = store.getReady();
    expect(ready).toContain(t2.dir);
  });

  it('getReady returns empty when gate incomplete', () => {
    const epic = store.createEpic({
      title: 'Gated',
      gates: [{ type: 'review', required: true, completed: false }],
    });
    store.createTask(epic.dir, { title: 'Task' });

    expect(store.getReady()).toEqual([]);
  });

  it('getReady skips tasks with unmet deps', () => {
    const epic = store.createEpic({ title: 'Test' });
    const t1 = store.createTask(epic.dir, { title: 'First' });
    const t2 = store.createTask(epic.dir, { title: 'Second', deps: ['../01-first'] });

    const ready = store.getReady();
    expect(ready).toContain(t1.dir);
    expect(ready).not.toContain(t2.dir);
  });
});

/* ------------------------------------------------------------------ */
/*  display IDs                                                        */
/* ------------------------------------------------------------------ */

describe('display IDs', () => {
  it('maps task to m{epic}.{task} format', () => {
    const epic = store.createEpic({ title: 'Bootstrap' });
    const t1 = store.createTask(epic.dir, { title: 'Setup' });
    const t2 = store.createTask(epic.dir, { title: 'Build' });

    expect(store.getDisplayId(t1.dir)).toBe('m1.1');
    expect(store.getDisplayId(t2.dir)).toBe('m1.2');
  });

  it('resolves display ID back to task', () => {
    const epic = store.createEpic({ title: 'Bootstrap' });
    const t1 = store.createTask(epic.dir, { title: 'Setup' });
    const t2 = store.createTask(epic.dir, { title: 'Build' });

    expect(store.resolveDisplayId('m1.1')).toBe(t1.dir);
    expect(store.resolveDisplayId('m1.2')).toBe(t2.dir);
    expect(store.resolveDisplayId('m99.99')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  statistics                                                         */
/* ------------------------------------------------------------------ */

describe('statistics', () => {
  it('counts tasks by status', () => {
    const epic = store.createEpic({ title: 'Test' });
    const t1 = store.createTask(epic.dir, { title: 'A' });
    const t2 = store.createTask(epic.dir, { title: 'B' });
    const t3 = store.createTask(epic.dir, { title: 'C' });

    store.setTaskStatus(t1.dir, 'done', 'agent');
    store.setTaskStatus(t2.dir, 'active', 'agent');
    // t3 remains pending

    const stats = store.getStats();
    expect(stats.epics).toBe(1);
    expect(stats.tasks).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('returns zero counts for empty store', () => {
    const stats = store.getStats();
    expect(stats.epics).toBe(0);
    expect(stats.tasks).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.blocked).toBe(0);
    expect(stats.failed).toBe(0);
  });
});
