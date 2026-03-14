/**
 * Task Expander System
 *
 * Tasks can be "expanded" into multiple subtasks at plan time.
 * This allows:
 *   - Modules to contribute subtasks to existing tasks
 *   - Task types to provide default subtasks
 *   - Project-specific task decomposition
 *
 * NOTE: As of 2025-03-10, checks are NO LONGER expanded into subtasks.
 * Checks are validation metadata executed inline by the executor.
 *
 * The framework ships with NO built-in expanders.
 * Projects register their own via .crew/setup using registerExpander().
 */

import type { TaskDef } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Expander Registry                                                 */
/* ------------------------------------------------------------------ */

export type TaskExpander = (task: TaskDef) => TaskDef[] | undefined;

const expanders: Array<{ match: ExpanderMatcher; expand: TaskExpander }> = [];

export type ExpanderMatcher =
  | { type: string }           // Match by task type
  | { skill: string }          // Match by skill
  | { tag: string }            // Match by tag
  | { id: string | RegExp }    // Match by task ID
  | ((task: TaskDef) => boolean);  // Custom matcher

function matches(matcher: ExpanderMatcher, task: TaskDef): boolean {
  if (typeof matcher === 'function') {
    return matcher(task);
  }

  if ('type' in matcher && task.type === matcher.type) {
    return true;
  }

  if ('skill' in matcher && task.skill === matcher.skill) {
    return true;
  }

  if ('tag' in matcher && task.tags?.includes(matcher.tag)) {
    return true;
  }

  if ('id' in matcher) {
    if (typeof matcher.id === 'string') {
      return task.id === matcher.id;
    }
    return matcher.id.test(task.id);
  }

  return false;
}

/**
 * Register a task expander
 */
export function registerExpander(
  match: ExpanderMatcher,
  expand: TaskExpander
): void {
  expanders.push({ match, expand });
}

/**
 * Expand a task into its subtasks
 */
export function expandTask(task: TaskDef): TaskDef[] {
  const subtasks: TaskDef[] = [];

  // Run all matching expanders
  for (const { match, expand } of expanders) {
    if (matches(match, task)) {
      const expanded = expand(task);
      if (expanded) {
        subtasks.push(...expanded);
      }
    }
  }

  // Also run task's own expand if present
  if (task.program?.expand) {
    const selfExpanded = task.program.expand(task);
    if (selfExpanded) {
      subtasks.push(...selfExpanded);
    }
  }

  return subtasks;
}

/**
 * Check if a task has subtasks (will be expanded)
 */
export function hasSubtasks(task: TaskDef): boolean {
  for (const { match } of expanders) {
    if (matches(match, task)) {
      return true;
    }
  }

  if (task.program?.expand) {
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Built-in Expanders (generic)                                      */
/* ------------------------------------------------------------------ */

/**
 * Register built-in expanders.
 *
 * NOTE: Check expansion has been removed as of 2025-03-10.
 * Checks are now validation metadata on tasks, NOT separate tasks.
 * The executor handles check execution inline (executor.ts:234-377).
 *
 * This function remains for backward compatibility and custom expanders
 * registered by project setup scripts.
 */
export function registerBuiltInExpanders(): void {
  // No built-in expanders at this time
  // Projects can still register custom expanders via registerExpander()
}

/* ------------------------------------------------------------------ */
/*  Plan Expansion                                                    */
/* ------------------------------------------------------------------ */

import type { EpicDef, PlanDef } from './types.ts';

/**
 * Expand all tasks in a plan into subtasks
 */
export function expandPlan(plan: PlanDef): PlanDef {
  return {
    ...plan,
    epics: plan.epics.map(expandEpic),
  };
}

function expandEpic(epic: EpicDef): EpicDef {
  const expandedTasks: TaskDef[] = [];

  for (const task of epic.tasks) {
    expandedTasks.push(task);
    const subtasks = expandTask(task);
    expandedTasks.push(...subtasks);
  }

  return {
    ...epic,
    tasks: expandedTasks,
  };
}
