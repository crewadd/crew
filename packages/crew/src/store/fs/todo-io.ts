/**
 * Task Todo I/O
 *
 * Reads/writes the task checklist (todo.yaml) in each task directory.
 * The todo file breaks a task into subtask phases:
 *   pre (pre-checks) → main (agent execution) → post (post-checks)
 *
 * This enables:
 *   - Tracking which subtasks are done vs pending
 *   - Partial re-execution when checks are added to completed tasks
 *   - Migration: adding checks to "done" tasks without re-running the main pass
 */

import { join } from 'node:path';
import { readYaml, writeYaml } from './yaml-io.ts';
import type { TodoItem, TodoPhase, TaskYamlCheck } from './types.ts';

const TODO_FILE = 'todo.yaml';

/* ------------------------------------------------------------------ */
/*  Read / Write                                                       */
/* ------------------------------------------------------------------ */

/**
 * Read the todo checklist from a task directory.
 * Returns empty array if no todo.yaml exists.
 */
export function readTodos(taskDir: string): TodoItem[] {
  const items = readYaml<TodoItem[]>(join(taskDir, TODO_FILE));
  return Array.isArray(items) ? items : [];
}

/**
 * Write the todo checklist to a task directory.
 */
export function writeTodos(taskDir: string, items: TodoItem[]): void {
  writeYaml(join(taskDir, TODO_FILE), items);
}

/* ------------------------------------------------------------------ */
/*  Item Operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Mark a todo item as done.
 */
export function markTodoDone(taskDir: string, todoId: string): void {
  const items = readTodos(taskDir);
  const item = items.find(i => i.id === todoId);
  if (item) {
    item.status = 'done';
    item.completedAt = new Date().toISOString();
    delete item.error;
    writeTodos(taskDir, items);
  }
}

/**
 * Mark a todo item as failed.
 */
export function markTodoFailed(taskDir: string, todoId: string, error?: string): void {
  const items = readTodos(taskDir);
  const item = items.find(i => i.id === todoId);
  if (item) {
    item.status = 'failed';
    item.completedAt = new Date().toISOString();
    if (error) item.error = error;
    writeTodos(taskDir, items);
  }
}

/**
 * Get all pending items (optionally filtered by phase).
 */
export function getPendingTodos(taskDir: string, phase?: TodoPhase): TodoItem[] {
  const items = readTodos(taskDir);
  return items.filter(i => i.status === 'pending' && (!phase || i.phase === phase));
}

/**
 * Check if all items in a phase are done.
 */
export function isPhaseComplete(taskDir: string, phase: TodoPhase): boolean {
  const items = readTodos(taskDir);
  const phaseItems = items.filter(i => i.phase === phase);
  if (phaseItems.length === 0) return true; // No items = complete
  return phaseItems.every(i => i.status === 'done' || i.status === 'skipped');
}

/**
 * Check if the task has any pending work remaining.
 */
export function hasPendingWork(taskDir: string): boolean {
  const items = readTodos(taskDir);
  return items.some(i => i.status === 'pending' || i.status === 'failed');
}

/* ------------------------------------------------------------------ */
/*  Generate from Checks                                               */
/* ------------------------------------------------------------------ */

/**
 * Get a display name for a check reference.
 */
function checkDisplayName(check: TaskYamlCheck): string {
  if ('cmd' in check) return check.name || check.cmd.slice(0, 60);
  if ('prompt' in check) return check.name || check.prompt.slice(0, 40);
  return check.name;
}

/**
 * Get a stable ID for a check reference.
 */
function checkId(check: TaskYamlCheck, phase: TodoPhase): string {
  if ('cmd' in check) return `${phase}:${check.name || 'cmd-' + simpleHash(check.cmd)}`;
  if ('prompt' in check) return `${phase}:${check.name || 'prompt-' + simpleHash(check.prompt)}`;
  return `${phase}:${check.name}`;
}

/**
 * Simple string hash for generating stable IDs.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

/**
 * Classify a check as pre or post phase.
 *
 * Pre-checks are fast, deterministic checks that can run before the agent:
 *   - cmd checks (file existence, dir existence)
 *
 * Post-checks require the agent's output:
 *   - Named checks (build, tsc)
 *   - AI prompt checks
 *   - Cmd checks that inspect output files (heuristic: contains output path refs)
 */
function classifyCheck(check: TaskYamlCheck): TodoPhase {
  // Named checks (build, tsc, lint) are always post
  if (!('cmd' in check) && !('prompt' in check)) return 'post';

  // AI prompt checks are always post (need output files to evaluate)
  if ('prompt' in check) return 'post';

  // Cmd checks: classify based on command pattern
  // Pre-checks are typically input existence checks (test -f, test -d on input paths)
  // Post-checks verify outputs (build, test commands on output paths)
  // Default to post for safety — pre-checks must not depend on agent output
  return 'post';
}

/**
 * Generate a todo checklist from task checks.
 *
 * Produces items in execution order:
 *   1. pre-checks (cmd checks on inputs)
 *   2. main (agent execution)
 *   3. post-checks (build, tsc, AI quality)
 *
 * If a todo.yaml already exists, merges: preserves done/failed status for
 * existing items, adds new items as pending.
 */
export function generateTodos(
  taskDir: string,
  checks: TaskYamlCheck[],
  taskTitle: string,
): TodoItem[] {
  // Read existing todos for merge
  const existing = readTodos(taskDir);
  const existingById = new Map(existing.map(i => [i.id, i]));

  const items: TodoItem[] = [];

  // Classify checks into phases
  const preChecks = checks.filter(c => classifyCheck(c) === 'pre');
  const postChecks = checks.filter(c => classifyCheck(c) === 'post');

  // Pre-checks
  for (const check of preChecks) {
    const id = checkId(check, 'pre');
    const prev = existingById.get(id);
    items.push(prev ?? {
      id,
      title: checkDisplayName(check),
      phase: 'pre',
      status: 'pending',
      check,
    });
  }

  // Main execution
  const mainId = 'main';
  const prevMain = existingById.get(mainId);
  items.push(prevMain ?? {
    id: mainId,
    title: taskTitle,
    phase: 'main',
    status: 'pending',
  });

  // Post-checks
  for (const check of postChecks) {
    const id = checkId(check, 'post');
    const prev = existingById.get(id);
    items.push(prev ?? {
      id,
      title: checkDisplayName(check),
      phase: 'post',
      status: 'pending',
      check,
    });
  }

  return items;
}

/**
 * Sync todo.yaml with current task checks.
 *
 * Call this when checks are updated (e.g., migration).
 * Preserves status of existing items, adds new ones as pending.
 * Returns true if new pending items were added.
 */
export function syncTodos(
  taskDir: string,
  checks: TaskYamlCheck[],
  taskTitle: string,
): boolean {
  const before = readTodos(taskDir);
  const beforeIds = new Set(before.map(i => i.id));

  const updated = generateTodos(taskDir, checks, taskTitle);
  writeTodos(taskDir, updated);

  // Check if any new pending items were added
  return updated.some(i => i.status === 'pending' && !beforeIds.has(i.id));
}
