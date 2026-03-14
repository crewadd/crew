/**
 * Unit tests for fs/task-ops
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listTasks,
  getTask,
  createTask,
  removeTask,
  getTaskStatus,
  setTaskStatus,
  startTask,
} from '../../../../src/store/fs/task-ops.ts';
import { writeYaml } from '../../../../src/store/fs/yaml-io.ts';
import { writeStatus } from '../../../../src/store/fs/status-io.ts';
import { writeDeps } from '../../../../src/store/fs/deps-io.ts';
import { readAttempt, listAttempts } from '../../../../src/store/fs/log-io.ts';

let testDir: string;
let epicDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-task-ops-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  epicDir = join(testDir, 'epics', '01-bootstrap');
  mkdirSync(join(epicDir, 'tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Helper to manually set up a task directory */
function setupTask(slug: string, title: string, opts?: { status?: string; deps?: string[]; prompt?: string }): string {
  const dir = join(epicDir, 'tasks', slug);
  mkdirSync(dir, { recursive: true });
  writeYaml(join(dir, 'task.yaml'), { title });
  if (opts?.status) writeStatus(dir, opts.status);
  if (opts?.deps) writeDeps(dir, opts.deps);
  if (opts?.prompt) writeFileSync(join(dir, 'PROMPT.md'), opts.prompt, 'utf-8');
  return dir;
}

describe('listTasks', () => {
  it('returns tasks in directory-prefix order within an epic', () => {
    setupTask('03-test', 'Test');
    setupTask('01-setup', 'Setup');
    setupTask('02-build', 'Build');

    const tasks = listTasks(epicDir);
    expect(tasks.map(t => t.slug)).toEqual(['01-setup', '02-build', '03-test']);
  });

  it('each task has title from task.yaml, status from status file', () => {
    setupTask('01-setup', 'Setup Phase', { status: 'done' });
    const tasks = listTasks(epicDir);
    expect(tasks[0].title).toBe('Setup Phase');
    expect(tasks[0].status).toBe('done');
  });

  it('returns empty array for epic with no tasks', () => {
    expect(listTasks(epicDir)).toEqual([]);
  });
});

describe('getTask', () => {
  it('reads task.yaml for definition (title, type, skills, input, output, vars)', () => {
    const dir = setupTask('01-lint', 'Lint');
    writeYaml(join(dir, 'task.yaml'), {
      title: 'Lint',
      type: 'coding',
      skills: ['eslint'],
      input: { files: ['src/'] },
      output: { files: ['report.json'] },
      vars: { fix: true },
    });

    const task = getTask(dir)!;
    expect(task.title).toBe('Lint');
    expect(task.config.type).toBe('coding');
    expect(task.config.skills).toEqual(['eslint']);
    expect(task.config.input).toEqual({ files: ['src/'] });
    expect(task.config.output).toEqual({ files: ['report.json'] });
    expect(task.config.vars).toEqual({ fix: true });
  });

  it('reads PROMPT.md if present', () => {
    const dir = setupTask('01-lint', 'Lint', { prompt: '# Run the linter' });
    const task = getTask(dir)!;
    expect(task.prompt).toBe('# Run the linter');
  });

  it('reads status from status file (default: "pending")', () => {
    const dir = setupTask('01-lint', 'Lint');
    expect(getTask(dir)!.status).toBe('pending');

    writeStatus(dir, 'active');
    expect(getTask(dir)!.status).toBe('active');
  });

  it('reads deps from deps file as resolved paths', () => {
    const dir = setupTask('02-build', 'Build', { deps: ['../01-setup'] });
    const task = getTask(dir)!;
    expect(task.deps).toHaveLength(1);
    expect(task.deps[0]).toContain('01-setup');
  });

  it('counts attempts from events/ directory', () => {
    const dir = setupTask('01-lint', 'Lint');
    expect(getTask(dir)!.attemptCount).toBe(0);

    startTask(dir, 'agent_builder');
    expect(getTask(dir)!.attemptCount).toBe(1);
  });

  it('does NOT contain epic_id, dependencies[], dependents[], status_history[]', () => {
    const dir = setupTask('01-lint', 'Lint');
    const task = getTask(dir)!;
    expect(task).not.toHaveProperty('epic_id');
    expect(task).not.toHaveProperty('dependencies');
    expect(task).not.toHaveProperty('dependents');
    expect(task).not.toHaveProperty('status_history');
  });

  it('returns null for non-existent task directory', () => {
    expect(getTask(join(epicDir, 'tasks', '99-missing'))).toBeNull();
  });
});

describe('createTask', () => {
  it('creates directory with next numeric prefix: 04-lint-check/', () => {
    setupTask('01-a', 'A');
    setupTask('02-b', 'B');
    setupTask('03-c', 'C');

    const task = createTask(epicDir, { title: 'Lint Check' });
    expect(task.slug).toBe('04-lint-check');
    expect(existsSync(task.dir)).toBe(true);
  });

  it('writes task.yaml with title, type, skills, vars', () => {
    const task = createTask(epicDir, {
      title: 'Build',
      type: 'coding',
      skills: ['typescript'],
      vars: { target: 'es2022' },
    });
    expect(task.config.title).toBe('Build');
    expect(task.config.type).toBe('coding');
    expect(task.config.skills).toEqual(['typescript']);
    expect(task.config.vars).toEqual({ target: 'es2022' });
  });

  it('writes PROMPT.md when prompt provided', () => {
    const task = createTask(epicDir, {
      title: 'Build',
      prompt: '# Build the project\n\nRun tsc.',
    });
    const content = readFileSync(join(task.dir, 'PROMPT.md'), 'utf-8');
    expect(content).toBe('# Build the project\n\nRun tsc.');
  });

  it('writes deps file when dependencies provided (as relative paths)', () => {
    const task = createTask(epicDir, {
      title: 'Build',
      deps: ['../01-setup'],
    });
    const depsContent = readFileSync(join(task.dir, 'deps'), 'utf-8');
    expect(depsContent).toBe('../01-setup');
  });

  it('initial status file absent (implicit "pending")', () => {
    const task = createTask(epicDir, { title: 'Build' });
    expect(existsSync(join(task.dir, 'status'))).toBe(false);
    expect(task.status).toBe('pending');
  });
});

describe('removeTask', () => {
  it('removes entire task directory recursively', () => {
    const dir = setupTask('01-lint', 'Lint');
    expect(removeTask(dir)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('returns false for non-existent task', () => {
    expect(removeTask(join(epicDir, 'tasks', '99-missing'))).toBe(false);
  });

  it('does not modify deps files in sibling tasks (dangling refs warned on load)', () => {
    const dir1 = setupTask('01-setup', 'Setup');
    const dir2 = setupTask('02-build', 'Build', { deps: ['../01-setup'] });
    removeTask(dir1);
    // dir2 deps file should still reference the now-dangling path
    const depsContent = readFileSync(join(dir2, 'deps'), 'utf-8');
    expect(depsContent).toContain('01-setup');
  });
});

describe('setTaskStatus', () => {
  it('writes single word to status file', () => {
    const dir = setupTask('01-lint', 'Lint');
    setTaskStatus(dir, 'done', 'agent_builder');
    expect(getTaskStatus(dir)).toBe('done');
  });

  it('appends status transition to current log file', () => {
    const dir = setupTask('01-lint', 'Lint');
    setTaskStatus(dir, 'active', 'agent_builder');
    const entries = readAttempt(dir, 1);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const statusEntry = entries.find(e => e.event === 'status');
    expect(statusEntry).toBeDefined();
    expect(statusEntry!.status).toBe('active');
  });

  it('valid values: pending, active, done, failed, blocked', () => {
    const dir = setupTask('01-lint', 'Lint');
    for (const status of ['pending', 'active', 'done', 'failed', 'blocked'] as const) {
      setTaskStatus(dir, status, 'agent_builder');
      expect(getTaskStatus(dir)).toBe(status);
    }
  });
});

describe('startTask', () => {
  it('sets status to "active"', () => {
    const dir = setupTask('01-lint', 'Lint');
    startTask(dir, 'agent_builder');
    expect(getTaskStatus(dir)).toBe('active');
  });

  it('creates new log attempt file (NNN.jsonl)', () => {
    const dir = setupTask('01-lint', 'Lint');
    startTask(dir, 'agent_builder');
    expect(listAttempts(dir)).toEqual([1]);

    // Start again creates attempt 2
    startTask(dir, 'agent_builder');
    expect(listAttempts(dir)).toEqual([1, 2]);
  });

  it('logs start event with timestamp and agent', () => {
    const dir = setupTask('01-lint', 'Lint');
    startTask(dir, 'agent_builder');

    const entries = readAttempt(dir, 1);
    const startEntry = entries.find(e => e.event === 'start');
    expect(startEntry).toBeDefined();
    expect(startEntry!.agent).toBe('agent_builder');
    expect(startEntry!.t).toBeDefined();
  });
});
