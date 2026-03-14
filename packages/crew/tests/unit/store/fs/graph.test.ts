/**
 * Unit tests for fs/graph
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildGraph,
  getDependencies,
  getDependents,
  getReady,
  validateDeps,
} from '../../../../src/store/fs/graph.ts';
import { writeYaml } from '../../../../src/store/fs/yaml-io.ts';
import { writeStatus } from '../../../../src/store/fs/status-io.ts';
import { writeDeps } from '../../../../src/store/fs/deps-io.ts';

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `crew-graph-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'epics'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEpic(slug: string, opts?: { gates?: Array<{ type: string; required: boolean; completed: boolean }> }): string {
  const dir = join(root, 'epics', slug);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  const yaml: Record<string, unknown> = { title: slug };
  if (opts?.gates) yaml.gates = opts.gates;
  writeYaml(join(dir, 'epic.yaml'), yaml);
  writeStatus(dir, 'planned');
  return dir;
}

function makeTask(epicSlug: string, taskSlug: string, opts?: { status?: string; deps?: string[] }): string {
  const dir = join(root, 'epics', epicSlug, 'tasks', taskSlug);
  mkdirSync(dir, { recursive: true });
  writeYaml(join(dir, 'task.yaml'), { title: taskSlug });
  if (opts?.status) writeStatus(dir, opts.status);
  if (opts?.deps) writeDeps(dir, opts.deps);
  return dir;
}

/* ------------------------------------------------------------------ */
/*  buildGraph                                                         */
/* ------------------------------------------------------------------ */

describe('buildGraph', () => {
  it('builds adjacency list from all deps files across all epics', () => {
    const epic = makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');
    const t2 = makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });

    const graph = buildGraph(root);
    expect(graph.size).toBe(2);
    expect(graph.get(t1)).toEqual([]);
    expect(graph.get(t2)).toHaveLength(1);
    expect(graph.get(t2)![0]).toContain('01-setup');
  });

  it('returns empty graph for project with no deps', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-setup');
    makeTask('01-bootstrap', '02-build');

    const graph = buildGraph(root);
    expect(graph.get(join(root, 'epics', '01-bootstrap', 'tasks', '01-setup'))).toEqual([]);
    expect(graph.get(join(root, 'epics', '01-bootstrap', 'tasks', '02-build'))).toEqual([]);
  });

  it('resolves relative paths to absolute task directory paths', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-setup');
    const t2 = makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });

    const graph = buildGraph(root);
    const deps = graph.get(t2)!;
    expect(deps[0]).toMatch(/^\//); // absolute path
    expect(deps[0]).toContain('01-setup');
  });
});

/* ------------------------------------------------------------------ */
/*  getDependencies                                                    */
/* ------------------------------------------------------------------ */

describe('getDependencies', () => {
  it('returns resolved dependency task directories from deps file', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');
    const t2 = makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });

    const { deps, warnings } = getDependencies(t2);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toBe(t1);
    expect(warnings).toHaveLength(0);
  });

  it('returns empty array when no deps file', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');

    const { deps } = getDependencies(t1);
    expect(deps).toEqual([]);
  });

  it('filters out broken references (logs warning)', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-build', { deps: ['../99-nonexistent'] });

    const { deps, warnings } = getDependencies(t1);
    expect(deps).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('Broken dependency');
    expect(warnings[0].source).toBe(t1);
  });
});

/* ------------------------------------------------------------------ */
/*  getDependents                                                      */
/* ------------------------------------------------------------------ */

describe('getDependents — computed, not stored', () => {
  it('scans all tasks to find which reference this task in their deps', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');
    const t2 = makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });
    const t3 = makeTask('01-bootstrap', '03-test', { deps: ['../01-setup'] });

    const dependents = getDependents(t1, root);
    expect(dependents).toContain(t2);
    expect(dependents).toContain(t3);
    expect(dependents).toHaveLength(2);
  });

  it('returns empty array if nothing depends on this task', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');
    makeTask('01-bootstrap', '02-build');

    expect(getDependents(t1, root)).toEqual([]);
  });

  it('works across epic boundaries (cross-epic deps)', () => {
    makeEpic('01-bootstrap');
    makeEpic('02-build');
    const t1 = makeTask('01-bootstrap', '01-setup');
    const t2 = makeTask('02-build', '01-compile', {
      deps: ['../../../01-bootstrap/tasks/01-setup'],
    });

    const dependents = getDependents(t1, root);
    expect(dependents).toContain(t2);
  });
});

/* ------------------------------------------------------------------ */
/*  getReady                                                           */
/* ------------------------------------------------------------------ */

describe('getReady', () => {
  it('returns tasks where all deps have status "done" and task status is "pending"', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup', { status: 'done' });
    const t2 = makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });

    const ready = getReady(root);
    expect(ready).toContain(t2);
  });

  it('returns tasks with no deps and status "pending"', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-setup');

    const ready = getReady(root);
    expect(ready).toContain(t1);
  });

  it('skips tasks in epics with incomplete required gates', () => {
    makeEpic('01-gated', {
      gates: [{ type: 'review', required: true, completed: false }],
    });
    makeTask('01-gated', '01-task');

    const ready = getReady(root);
    expect(ready).toEqual([]);
  });

  it('respects epic ordering — earlier epics must complete first (when sequential)', () => {
    makeEpic('01-first');
    makeEpic('02-second');
    makeTask('01-first', '01-setup'); // pending — blocks epic 2
    makeTask('02-second', '01-build');

    const ready = getReady(root);
    // Only tasks from epic 01 should be ready
    expect(ready).toHaveLength(1);
    expect(ready[0]).toContain('01-first');
  });

  it('returns empty array when all tasks are done or blocked', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-setup', { status: 'done' });
    makeTask('01-bootstrap', '02-build', { status: 'done' });

    expect(getReady(root)).toEqual([]);
  });

  it('limits results to requested count', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-a');
    makeTask('01-bootstrap', '02-b');
    makeTask('01-bootstrap', '03-c');

    const ready = getReady(root, 2);
    expect(ready).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  validateDeps                                                       */
/* ------------------------------------------------------------------ */

describe('validateDeps', () => {
  it('returns empty array when all deps resolve', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-setup');
    makeTask('01-bootstrap', '02-build', { deps: ['../01-setup'] });

    expect(validateDeps(root)).toEqual([]);
  });

  it('returns warnings for broken references (missing directories)', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-build', { deps: ['../99-missing'] });

    const warnings = validateDeps(root);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const broken = warnings.find(w => w.message.includes('Broken'));
    expect(broken).toBeDefined();
    expect(broken!.source).toContain('01-build');
  });

  it('returns warnings for circular dependencies', () => {
    makeEpic('01-bootstrap');
    makeTask('01-bootstrap', '01-a', { deps: ['../02-b'] });
    makeTask('01-bootstrap', '02-b', { deps: ['../01-a'] });

    const warnings = validateDeps(root);
    const circular = warnings.find(w => w.message.includes('Circular'));
    expect(circular).toBeDefined();
  });

  it('each warning includes: source task dir, deps file line, referenced path', () => {
    makeEpic('01-bootstrap');
    const t1 = makeTask('01-bootstrap', '01-build', { deps: ['../99-missing'] });

    const warnings = validateDeps(root);
    const broken = warnings.find(w => w.message.includes('Broken'))!;
    expect(broken.source).toBe(t1);
    expect(broken.line).toBeTruthy();
    expect(broken.resolved).toBeTruthy();
  });
});
