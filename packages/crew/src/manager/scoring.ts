/**
 * Manager - Task scoring, dependency checking, and cycle detection
 */

// @ts-nocheck - This file uses an old API structure and is currently unused
import type { Task, Epic } from '../store/types.ts';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Get the current (active) epic
 */
function currentEpic(epics: Epic[]): { num: number } | undefined {
  const active = epics.find(e => e.status === 'active');
  return active ? { num: active.number } : undefined;
}

/**
 * Check if all dependencies of a task are done
 */
export function depsMet(task: Task, epics: Epic[]): boolean {
  if (!task.deps.length) return true;
  const { findTask } = require('./parser.ts');
  for (const depId of task.deps) {
    const dep = findTask(epics, depId);
    if (dep && dep.status !== 'done') return false;
  }
  return true;
}

/**
 * Find the most recently completed task
 */
export function lastDoneTask(epics: Epic[]): Task | null {
  let last: Task | null = null;
  for (const ms of epics) {
    for (const t of ms.tasks) {
      if (t.status === 'done') last = t;
    }
  }
  return last;
}

/**
 * Compute compound value score for a task
 */
export function scoreTask(task: Task, epics: Epic[]): number {
  if (task.status === 'done') return -2;
  if (task.status === 'blocked' || !depsMet(task, epics)) return -1;

  let s = 0;

  // 1. Current epic gets top priority; otherwise earlier = higher
  const cur = currentEpic(epics);
  if (cur && task.epicNum === cur.num) s += 20000;
  s += (10 - task.epicNum) * 1000;

  // 2. Active bonus
  if (task.status === 'active') s += 500;

  // 3. Agent momentum
  const lastDone = lastDoneTask(epics);
  if (lastDone && task.assignee === lastDone.assignee && task.assignee !== '—') s += 150;

  return s;
}

/**
 * Return cycle path if adding new_dep_id as dep of task_id creates a cycle
 */
export function detectCycle(
  epics: Epic[],
  taskId: string,
  newDepId: string
): string[] | null {
  const adj: Record<string, string[]> = {};
  for (const ms of epics) {
    for (const t of ms.tasks) {
      adj[t.id] = [...t.deps];
    }
  }

  // Temporarily add the new edge
  if (!adj[taskId]) adj[taskId] = [];
  adj[taskId].push(newDepId);

  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    if (node === taskId) {
      path.push(node);
      return true;
    }
    if (visited.has(node)) return false;
    visited.add(node);
    path.push(node);
    for (const dep of adj[node] ?? []) {
      if (dfs(dep)) return true;
    }
    path.pop();
    return false;
  }

  if (dfs(newDepId)) return path;
  return null;
}

/**
 * Detect all cycles in the dependency graph
 */
export function detectCyclesAll(epics: Epic[]): string[][] {
  const adj: Record<string, string[]> = {};
  const allIds = new Set<string>();
  for (const ms of epics) {
    for (const t of ms.tasks) {
      adj[t.id] = [...t.deps];
      allIds.add(t.id);
    }
  }

  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color: Record<string, number> = {};
  for (const tid of allIds) color[tid] = WHITE;
  const path: string[] = [];

  function dfs(node: string): void {
    color[node] = GRAY;
    path.push(node);
    for (const dep of adj[node] ?? []) {
      if (!(dep in color)) continue;
      if (color[dep] === GRAY) {
        const idx = path.indexOf(dep);
        const cycle = [...path.slice(idx), dep];
        cycles.push(cycle);
      } else if (color[dep] === WHITE) {
        dfs(dep);
      }
    }
    path.pop();
    color[node] = BLACK;
  }

  for (const tid of allIds) {
    if (color[tid] === WHITE) dfs(tid);
  }

  return cycles;
}

/**
 * Build a human-readable reason for why a task is next
 */
export function buildReason(task: Task, epics: Epic[]): string {
  const parts: string[] = [];
  const cur = currentEpic(epics);
  if (cur && task.epicNum === cur.num) {
    parts.push(`Current epic (M${cur.num})`);
  } else {
    parts.push(`Epic M${task.epicNum}`);
  }

  if (task.assignee !== '—') {
    const last = lastDoneTask(epics);
    if (last && task.assignee === last.assignee) {
      parts.push(`agent momentum (${task.assignee})`);
    } else {
      parts.push(`assigned to ${task.assignee}`);
    }
  }


  if (depsMet(task, epics)) {
    parts.push('no blockers');
  } else {
    parts.push('has blockers');
  }

  return parts.join(', ');
}
