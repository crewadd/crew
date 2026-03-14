/**
 * Unit tests for fs/views
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateTaskReadme,
  generateEpicReadme,
  generatePlanReadme,
  generateStateJson,
} from '../../../../src/store/fs/views.ts';
import { writeYaml } from '../../../../src/store/fs/yaml-io.ts';
import { writeStatus } from '../../../../src/store/fs/status-io.ts';
import { writeDeps } from '../../../../src/store/fs/deps-io.ts';
import { startNewAttempt } from '../../../../src/store/fs/log-io.ts';

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `crew-views-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'epics'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEpic(slug: string, title: string, status?: string): string {
  const dir = join(root, 'epics', slug);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeYaml(join(dir, 'epic.yaml'), { title });
  if (status) writeStatus(dir, status);
  return dir;
}

function makeTask(epicSlug: string, taskSlug: string, opts?: {
  title?: string;
  status?: string;
  deps?: string[];
  prompt?: string;
}): string {
  const dir = join(root, 'epics', epicSlug, 'tasks', taskSlug);
  mkdirSync(dir, { recursive: true });
  writeYaml(join(dir, 'task.yaml'), { title: opts?.title ?? taskSlug });
  if (opts?.status) writeStatus(dir, opts.status);
  if (opts?.deps) writeDeps(dir, opts.deps);
  if (opts?.prompt) writeFileSync(join(dir, 'PROMPT.md'), opts.prompt, 'utf-8');
  return dir;
}

/* ------------------------------------------------------------------ */
/*  generateTaskReadme                                                 */
/* ------------------------------------------------------------------ */

describe('generateTaskReadme', () => {
  it('includes task title from task.yaml', () => {
    const dir = makeTask('01-epic', 'task', { title: 'Install deps' });
    makeEpic('01-epic', 'Epic');
    const readme = generateTaskReadme(dir);
    expect(readme).toContain('# Install deps');
  });

  it('includes current status from status file', () => {
    makeEpic('01-epic', 'Epic');
    const dir = makeTask('01-epic', '01-task', { title: 'Build', status: 'active' });
    const readme = generateTaskReadme(dir);
    expect(readme).toContain('active');
  });

  it('includes dependency list with titles (reads neighbor task.yaml)', () => {
    makeEpic('01-epic', 'Epic');
    const t1 = makeTask('01-epic', '01-setup', { title: 'Setup' });
    const t2 = makeTask('01-epic', '02-build', {
      title: 'Build',
      deps: ['../01-setup'],
    });
    const readme = generateTaskReadme(t2);
    expect(readme).toContain('Dependencies');
    expect(readme).toContain('Setup');
  });

  it('includes attempt count from events/ directory', () => {
    makeEpic('01-epic', 'Epic');
    const dir = makeTask('01-epic', '01-task', { title: 'Task' });
    startNewAttempt(dir);
    startNewAttempt(dir);
    const readme = generateTaskReadme(dir);
    expect(readme).toContain('Attempts');
    expect(readme).toContain('2');
  });

  it('includes prompt excerpt from PROMPT.md', () => {
    makeEpic('01-epic', 'Epic');
    const dir = makeTask('01-epic', '01-task', {
      title: 'Task',
      prompt: '# Instructions\n\nDo the thing carefully.',
    });
    const readme = generateTaskReadme(dir);
    expect(readme).toContain('Prompt');
    expect(readme).toContain('Do the thing carefully');
  });

  it('works without optional files (no deps, no log, no PROMPT.md)', () => {
    makeEpic('01-epic', 'Epic');
    const dir = makeTask('01-epic', '01-task', { title: 'Simple' });
    const readme = generateTaskReadme(dir);
    expect(readme).toContain('# Simple');
    expect(readme).toContain('pending');
    expect(readme).not.toContain('Dependencies');
    expect(readme).not.toContain('Attempts');
    expect(readme).not.toContain('Prompt');
  });
});

/* ------------------------------------------------------------------ */
/*  generateEpicReadme                                                 */
/* ------------------------------------------------------------------ */

describe('generateEpicReadme', () => {
  it('includes epic title from epic.yaml', () => {
    const dir = makeEpic('01-bootstrap', 'Bootstrap');
    const readme = generateEpicReadme(dir);
    expect(readme).toContain('# Bootstrap');
  });

  it('includes epic status from status file', () => {
    const dir = makeEpic('01-bootstrap', 'Bootstrap', 'active');
    const readme = generateEpicReadme(dir);
    expect(readme).toContain('active');
  });

  it('includes task table with status for each task', () => {
    const epicDir = makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });
    makeTask('01-bootstrap', '02-build', { title: 'Build', status: 'pending' });

    const readme = generateEpicReadme(epicDir);
    expect(readme).toContain('Setup');
    expect(readme).toContain('Build');
    expect(readme).toContain('done');
    expect(readme).toContain('pending');
    // Table headers
    expect(readme).toContain('| # | Task | Status |');
  });

  it('includes progress bar (done/total)', () => {
    const epicDir = makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });
    makeTask('01-bootstrap', '02-build', { title: 'Build', status: 'pending' });

    const readme = generateEpicReadme(epicDir);
    expect(readme).toContain('Progress');
    expect(readme).toContain('1/2');
    expect(readme).toContain('50%');
  });

  it('includes dependency tree visualization', () => {
    const epicDir = makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup' });
    makeTask('01-bootstrap', '02-build', {
      title: 'Build',
      deps: ['../01-setup'],
    });

    const readme = generateEpicReadme(epicDir);
    expect(readme).toContain('Dependencies');
    expect(readme).toContain('Build');
    expect(readme).toContain('Setup');
  });
});

/* ------------------------------------------------------------------ */
/*  generatePlanReadme                                                 */
/* ------------------------------------------------------------------ */

describe('generatePlanReadme', () => {
  it('includes all epics with status summary', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'MyApp', goal: 'Ship it' });
    makeEpic('01-bootstrap', 'Bootstrap', 'active');
    makeEpic('02-build', 'Build', 'planned');

    const readme = generatePlanReadme(root);
    expect(readme).toContain('Bootstrap');
    expect(readme).toContain('Build');
    expect(readme).toContain('active');
    expect(readme).toContain('planned');
  });

  it('includes overall progress across all tasks', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'MyApp' });
    makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });
    makeTask('01-bootstrap', '02-build', { title: 'Build', status: 'pending' });

    makeEpic('02-deploy', 'Deploy');
    makeTask('02-deploy', '01-ship', { title: 'Ship', status: 'done' });

    const readme = generatePlanReadme(root);
    expect(readme).toContain('Overall Progress');
    expect(readme).toContain('2/3');
    expect(readme).toContain('67%');
  });

  it('includes epic ordering by directory prefix', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'App' });
    makeEpic('03-deploy', 'Deploy');
    makeEpic('01-bootstrap', 'Bootstrap');
    makeEpic('02-build', 'Build');

    const readme = generatePlanReadme(root);
    const bootstrapIdx = readme.indexOf('Bootstrap');
    const buildIdx = readme.indexOf('Build');
    const deployIdx = readme.indexOf('Deploy');
    expect(bootstrapIdx).toBeLessThan(buildIdx);
    expect(buildIdx).toBeLessThan(deployIdx);
  });
});

/* ------------------------------------------------------------------ */
/*  generateStateJson                                                  */
/* ------------------------------------------------------------------ */

describe('generateStateJson', () => {
  it('produces CrewState-compatible JSON', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'MyApp' });
    makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });

    const state = generateStateJson(root);
    expect(state).toHaveProperty('version', 1);
    expect(state).toHaveProperty('project', 'MyApp');
    expect(state).toHaveProperty('generated_at');
    expect(state).toHaveProperty('summary');
    expect(state).toHaveProperty('epics');
    expect(state).toHaveProperty('next_tasks');
  });

  it('scans filesystem — no stored IDs needed', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'App' });
    makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });
    makeTask('01-bootstrap', '02-build', { title: 'Build', status: 'pending' });

    const state = generateStateJson(root);
    const epics = state.epics as Array<Record<string, unknown>>;
    expect(epics).toHaveLength(1);
    expect(epics[0].title).toBe('Bootstrap');
    expect(epics[0].task_count).toBe(2);
    expect(epics[0].completed_count).toBe(1);
  });

  it('includes summary counts, epic list, next_tasks', () => {
    writeYaml(join(root, 'project.yaml'), { name: 'App' });
    makeEpic('01-bootstrap', 'Bootstrap');
    makeTask('01-bootstrap', '01-setup', { title: 'Setup', status: 'done' });
    makeTask('01-bootstrap', '02-build', { title: 'Build' });

    const state = generateStateJson(root);
    const summary = state.summary as Record<string, number>;
    expect(summary.total_tasks).toBe(2);
    expect(summary.completed_tasks).toBe(1);
    expect(summary.pending_tasks).toBe(1);
    expect(summary.progress_pct).toBe(50);

    const nextTasks = state.next_tasks as Array<Record<string, unknown>>;
    expect(nextTasks.length).toBeGreaterThanOrEqual(1);
    expect(nextTasks[0].title).toBe('Build');
  });
});
