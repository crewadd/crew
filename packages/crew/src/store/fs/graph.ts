/**
 * Dependency Graph
 *
 * Computed graph resolution from `deps` files. No bidirectional storage.
 * Dependents are computed by scanning all tasks — not stored anywhere.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readDeps } from './deps-io.ts';
import { readStatus } from './status-io.ts';
import { readYaml } from './yaml-io.ts';
import { listOrdered } from './ordering.ts';
import type { EpicYaml, TaskStatus } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Adjacency list: taskDir → resolved dependency taskDirs */
export type Graph = Map<string, string[]>;

export interface DepWarning {
  /** Absolute path to the source task directory */
  source: string;
  /** The raw line from the deps file */
  line: string;
  /** Resolved absolute path that was referenced */
  resolved: string;
  /** Warning message */
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Internal: collect all task dirs                                    */
/* ------------------------------------------------------------------ */

interface TaskEntry {
  dir: string;
  epicDir: string;
}

function allTaskEntries(root: string): TaskEntry[] {
  const epicsDir = join(root, 'epics');
  const epicSlugs = listOrdered(epicsDir);
  const entries: TaskEntry[] = [];

  for (const epicSlug of epicSlugs) {
    const epicDir = join(epicsDir, epicSlug);
    const tasksDir = join(epicDir, 'tasks');
    const taskSlugs = listOrdered(tasksDir);
    for (const taskSlug of taskSlugs) {
      entries.push({ dir: join(tasksDir, taskSlug), epicDir });
    }
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/*  buildGraph                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build adjacency list from all deps files across all epics.
 * Keys are absolute task directory paths; values are resolved dependency paths.
 */
export function buildGraph(root: string): Graph {
  const graph: Graph = new Map();
  const entries = allTaskEntries(root);

  for (const { dir } of entries) {
    const deps = readDeps(dir);
    graph.set(dir, deps);
  }

  return graph;
}

/* ------------------------------------------------------------------ */
/*  getDependencies                                                    */
/* ------------------------------------------------------------------ */

/**
 * Return resolved dependency task directories from a task's deps file.
 * Filters out broken references (non-existent directories).
 * Warnings are collected but not thrown.
 */
export function getDependencies(taskDir: string): { deps: string[]; warnings: DepWarning[] } {
  const raw = readDeps(taskDir);
  const deps: string[] = [];
  const warnings: DepWarning[] = [];

  for (const resolved of raw) {
    if (existsSync(resolved)) {
      deps.push(resolved);
    } else {
      warnings.push({
        source: taskDir,
        line: resolved,
        resolved,
        message: `Broken dependency: ${resolved} does not exist`,
      });
    }
  }

  return { deps, warnings };
}

/* ------------------------------------------------------------------ */
/*  getDependents                                                      */
/* ------------------------------------------------------------------ */

/**
 * Scan all tasks to find which reference this task in their deps.
 * Computed, not stored.
 */
export function getDependents(taskDir: string, root: string): string[] {
  const graph = buildGraph(root);
  const dependents: string[] = [];

  for (const [dir, deps] of graph) {
    if (deps.includes(taskDir)) {
      dependents.push(dir);
    }
  }

  return dependents;
}

/* ------------------------------------------------------------------ */
/*  getReady                                                           */
/* ------------------------------------------------------------------ */

/**
 * Return tasks where all deps have status "done" and task status is "pending".
 *
 * Respects:
 * - Epic ordering: earlier epics must complete first (when sequential — default)
 * - Gate checking: skips tasks in epics with incomplete required gates
 * - Optional limit on result count
 */
export function getReady(root: string, limit?: number): string[] {
  const epicsDir = join(root, 'epics');
  const epicSlugs = listOrdered(epicsDir);
  const ready: string[] = [];

  for (const epicSlug of epicSlugs) {
    const epicDir = join(epicsDir, epicSlug);

    // Check gates
    if (hasIncompleteRequiredGates(epicDir)) continue;

    // Check sequential constraint: if prior epic is not fully done, skip
    const epicIdx = epicSlugs.indexOf(epicSlug);
    if (epicIdx > 0 && !isEpicComplete(join(epicsDir, epicSlugs[epicIdx - 1]))) {
      continue;
    }

    const tasksDir = join(epicDir, 'tasks');
    const taskSlugs = listOrdered(tasksDir);

    for (const taskSlug of taskSlugs) {
      const taskDir = join(tasksDir, taskSlug);
      const status = readStatus(taskDir) as TaskStatus;
      if (status !== 'pending') continue;

      const deps = readDeps(taskDir);
      const allDepsDone = deps.every(dep => {
        if (!existsSync(dep)) return false;
        return readStatus(dep) === 'done';
      });

      if (allDepsDone) {
        ready.push(taskDir);
        if (limit !== undefined && ready.length >= limit) return ready;
      }
    }
  }

  return ready;
}

function hasIncompleteRequiredGates(epicDir: string): boolean {
  const config = readYaml<EpicYaml>(join(epicDir, 'epic.yaml'));
  if (!config?.gates) return false;
  return config.gates.some(g => g.required && !g.completed);
}

function isEpicComplete(epicDir: string): boolean {
  const tasksDir = join(epicDir, 'tasks');
  const taskSlugs = listOrdered(tasksDir);
  if (taskSlugs.length === 0) return true; // empty epic is complete

  return taskSlugs.every(slug => {
    const status = readStatus(join(tasksDir, slug));
    return status === 'done';
  });
}

/* ------------------------------------------------------------------ */
/*  validateDeps                                                       */
/* ------------------------------------------------------------------ */

/**
 * Validate all deps files across the project.
 * Returns warnings for:
 * - Broken references (missing directories)
 * - Circular dependencies
 */
export function validateDeps(root: string): DepWarning[] {
  const warnings: DepWarning[] = [];
  const graph = buildGraph(root);

  // Check broken references
  for (const [source, deps] of graph) {
    for (const dep of deps) {
      if (!existsSync(dep)) {
        warnings.push({
          source,
          line: dep,
          resolved: dep,
          message: `Broken reference: ${dep} does not exist`,
        });
      }
    }
  }

  // Check circular dependencies
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      warnings.push({
        source: node,
        line: '',
        resolved: '',
        message: `Circular dependency: ${cycle.join(' → ')}`,
      });
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      if (graph.has(dep)) {
        dfs(dep, [...path, node]);
      }
    }

    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node, []);
  }

  return warnings;
}
