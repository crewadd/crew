/**
 * Constraint Engine - Core constraint evaluation for tasks and epics
 *
 * Provides:
 * - canTaskStart: Check if a task can execute based on constraints
 * - canEpicStart: Check if a epic can execute based on constraints
 * - computeBatches: Compute parallel execution batches respecting constraints
 * - evaluateCondition: Evaluate condition expressions
 */

import type { Task, Epic, EpicConstraints } from '../store/types.ts';
import type { TaskConstraints, ExecutionFlow } from '../tasks/types.ts';

/**
 * Task status that indicates completion (resolved state).
 * Used for within-epic sequential checks: a failed task still "resolves"
 * the sequential constraint so the next task in the same epic can proceed.
 */
export function isResolved(status: string): boolean {
  return ['done', 'failed', 'cancelled'].includes(status);
}

/**
 * Task status that indicates successful completion.
 * Used for cross-epic transitions: an epic with failed tasks should NOT
 * allow the next epic to start. Only 'done' counts as success.
 */
export function isSuccessfullyDone(status: string): boolean {
  return status === 'done';
}

/**
 * Check if an epic has any failed tasks.
 * Used to determine if an epic is "locked" due to failures.
 */
export function hasFailedTasks(epic: Epic, allTasks: Task[]): boolean {
  return epic.task_ids.some(taskId => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.status === 'failed';
  });
}

/**
 * Check if ALL tasks in an epic are successfully done (not just resolved).
 * Unlike areAllTasksResolved, this requires 'done' status — failed/cancelled don't count.
 * Used for cross-epic transitions.
 */
export function areAllTasksDone(epic: Epic, allTasks: Task[]): boolean {
  if (epic.task_ids.length === 0) return true;
  return epic.task_ids.every(taskId => {
    const task = allTasks.find(t => t.id === taskId);
    return task && isSuccessfullyDone(task.status);
  });
}

/**
 * Get default constraint values if not specified
 */
export function getDefaultTaskConstraints(): Required<
  Pick<TaskConstraints, 'sequential'>
> {
  return {
    sequential: true,
  };
}

export function getDefaultEpicConstraints(): Required<
  Pick<EpicConstraints, 'sequential' | 'autoResolve'>
> {
  return {
    sequential: true,
    autoResolve: true,
  };
}

/**
 * Evaluate a condition (string expression or function)
 */
export function evaluateCondition(
  condition: string | ((vars: Record<string, unknown>) => boolean) | undefined,
  vars: Record<string, unknown>
): boolean {
  if (!condition) return true;

  if (typeof condition === 'function') {
    return condition(vars);
  }

  // String expression evaluation (simple implementation)
  // For security, use a limited eval context
  try {
    // Create a safe evaluation context with only the provided variables
    const keys = Object.keys(vars);
    const values = Object.values(vars);

    // Simple expression evaluation (supports basic boolean logic)
    // Example: "hasAnimationData === true", "count > 5", etc.
    const expr = condition.trim();

    // For now, use Function constructor with limited scope
    // In production, consider using a safer expression parser
    const fn = new Function(...keys, `return ${expr};`);
    return !!fn(...values);
  } catch (error) {
    console.warn(`Failed to evaluate condition: ${condition}`, error);
    return false;
  }
}

/**
 * Check if a task can start based on constraints
 */
export interface CanTaskStartOptions {
  task: Task;
  allTasks: Task[];
  allEpics: Epic[];
  vars?: Record<string, unknown>;
}

export function canTaskStart(opts: CanTaskStartOptions): boolean {
  const { task, allTasks, allEpics, vars = {} } = opts;

  // Check explicit dependencies first
  if (task.dependencies && task.dependencies.length > 0) {
    const depsMet = task.dependencies.every((depId) => {
      const dep = allTasks.find((t) => t.id === depId);
      return dep && isResolved(dep.status);
    });

    if (!depsMet) return false;
  }

  // Get constraints with defaults
  const constraints = task.constraints || {};
  const sequential = constraints.sequential ?? true;

  // Check sequential constraint
  if (sequential) {
    const prevTask = getPreviousTaskInEpic(task, allTasks, allEpics);
    if (prevTask && !isResolved(prevTask.status)) {
      return false;
    }
  }

  // Check explicit blockedBy constraints
  if (constraints.blockedBy && constraints.blockedBy.length > 0) {
    for (const blockerId of constraints.blockedBy) {
      const blocker = allTasks.find((t) => t.id === blockerId);
      if (blocker && !isResolved(blocker.status)) {
        return false;
      }
    }
  }

  // Check condition
  if (constraints.condition) {
    if (!evaluateCondition(constraints.condition, vars as Record<string, unknown>)) {
      return false;
    }
  }

  // Check flow condition
  if (task.flow?.condition) {
    if (!evaluateCondition(task.flow.condition, vars as Record<string, unknown>)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a epic can start based on constraints
 */
export interface CanEpicStartOptions {
  epic: Epic;
  allEpics: Epic[];
  allTasks: Task[];
  vars?: Record<string, unknown>;
}

export function canEpicStart(opts: CanEpicStartOptions): {
  canStart: boolean;
  autoResolved?: boolean;
  reason?: string;
} {
  const { epic, allEpics, allTasks, vars = {} } = opts;

  // Get constraints with defaults
  const constraints = epic.constraints || {};
  const sequential = constraints.sequential ?? true;
  const autoResolve = constraints.autoResolve ?? true;

  // Check auto-resolve for empty epics
  if (autoResolve && epic.task_ids.length === 0) {
    return {
      canStart: false,
      autoResolved: true,
      reason: 'Empty epic auto-resolved',
    };
  }

  // Check sequential constraint
  if (sequential) {
    const prevEpic = getPreviousEpic(epic, allEpics);
    if (prevEpic) {
      // Epic locking: require ALL tasks to be 'done' (not just resolved).
      // Failed tasks lock the epic and block downstream epic transitions.
      if (hasFailedTasks(prevEpic, allTasks)) {
        return {
          canStart: false,
          reason: `Previous epic (${prevEpic.title}) has failed tasks — epic is locked`,
        };
      }
      const allPrevTasksDone = areAllTasksDone(prevEpic, allTasks);
      if (!allPrevTasksDone) {
        return {
          canStart: false,
          reason: `Waiting for previous epic (${prevEpic.title}) to complete`,
        };
      }
    }
  }

  // Check explicit blockedBy constraints
  if (constraints.blockedBy && constraints.blockedBy.length > 0) {
    for (const blockerId of constraints.blockedBy) {
      const blocker = allEpics.find((m) => m.id === blockerId);
      if (blocker) {
        // Epic locking: failed tasks in blocking epic prevent start
        if (hasFailedTasks(blocker, allTasks)) {
          return {
            canStart: false,
            reason: `Blocked by epic ${blocker.title} (has failed tasks)`,
          };
        }
        const allBlockerTasksDone = areAllTasksDone(blocker, allTasks);
        if (!allBlockerTasksDone) {
          return {
            canStart: false,
            reason: `Blocked by epic ${blocker.title}`,
          };
        }
      }
    }
  }

  // Check condition
  if (constraints.condition) {
    if (!evaluateCondition(constraints.condition, vars as Record<string, unknown>)) {
      return {
        canStart: false,
        reason: 'Condition not met',
      };
    }
  }

  return {
    canStart: true,
  };
}

/**
 * Compute parallel execution batches respecting constraints
 */
export interface TaskBatch {
  tasks: Task[];
  parallel: boolean;
}

export function computeBatches(
  tasks: Task[],
  options?: {
    vars?: Record<string, unknown>;
    allTasks?: Task[];
    allEpics?: Epic[];
  }
): TaskBatch[] {
  const { vars = {}, allTasks = tasks, allEpics = [] } = options || {};

  // Filter out completed tasks
  const pending = tasks.filter((t) => t.status !== 'done');
  if (pending.length === 0) return [];

  const batches: TaskBatch[] = [];
  const placed = new Set<string>();
  let remaining = [...pending];

  while (remaining.length > 0) {
    const batch: Task[] = [];

    // Find tasks that can start now
    for (const task of remaining) {
      const constraints = task.constraints || {};
      const sequential = constraints.sequential ?? true;

      // Check if task can start
      const canStart = canTaskStart({
        task,
        allTasks,
        allEpics,
        vars,
      });

      if (!canStart) continue;

      // Check if task is parallel or sequential
      if (sequential) {
        // Sequential tasks go one at a time
        if (batch.length === 0) {
          batch.push(task);
        }
      } else {
        // Parallel tasks can be grouped
        batch.push(task);
      }
    }

    // If no tasks can be placed, we might have a cycle or all are blocked
    if (batch.length === 0) {
      // Place remaining tasks in final batch (they may have unresolvable constraints)
      if (remaining.length > 0) {
        batches.push({ tasks: remaining, parallel: false });
      }
      break;
    }

    // Determine if batch is parallel
    const isParallel = batch.some((t) => !(t.constraints?.sequential ?? true));

    batches.push({ tasks: batch, parallel: isParallel });

    // Mark tasks as placed
    for (const t of batch) {
      placed.add(t.id);
    }

    // Update remaining
    remaining = remaining.filter((t) => !placed.has(t.id));
  }

  return batches;
}

/**
 * Get the previous task in the same epic
 */
function getPreviousTaskInEpic(
  task: Task,
  allTasks: Task[],
  allEpics: Epic[]
): Task | null {
  const epic = allEpics.find((m) => m.id === task.epic_id);
  if (!epic) return null;

  const taskIndex = epic.task_ids.indexOf(task.id);
  if (taskIndex <= 0) return null;

  const prevTaskId = epic.task_ids[taskIndex - 1];
  return allTasks.find((t) => t.id === prevTaskId) || null;
}

/**
 * Get the previous epic
 */
function getPreviousEpic(
  epic: Epic,
  allEpics: Epic[]
): Epic | null {
  const sorted = [...allEpics].sort((a, b) => a.number - b.number);
  const index = sorted.findIndex((m) => m.id === epic.id);
  if (index <= 0) return null;
  return sorted[index - 1];
}

/**
 * Check if all tasks in a epic are resolved
 */
function areAllTasksResolved(epic: Epic, allTasks: Task[]): boolean {
  if (epic.task_ids.length === 0) return true;

  return epic.task_ids.every((taskId) => {
    const task = allTasks.find((t) => t.id === taskId);
    return task && isResolved(task.status);
  });
}

/**
 * Get tasks that are blocking a given task
 */
export function getBlockers(
  task: Task,
  allTasks: Task[],
  allEpics: Epic[]
): string[] {
  const blockers: string[] = [];

  // Check explicit dependencies
  if (task.dependencies) {
    for (const depId of task.dependencies) {
      const dep = allTasks.find((t) => t.id === depId);
      if (dep && !isResolved(dep.status)) {
        blockers.push(depId);
      }
    }
  }

  // Check sequential constraint
  const sequential = task.constraints?.sequential ?? true;
  if (sequential) {
    const prevTask = getPreviousTaskInEpic(task, allTasks, allEpics);
    if (prevTask && !isResolved(prevTask.status)) {
      blockers.push(prevTask.id);
    }
  }

  // Check explicit blockedBy
  if (task.constraints?.blockedBy) {
    for (const blockerId of task.constraints.blockedBy) {
      const blocker = allTasks.find((t) => t.id === blockerId);
      if (blocker && !isResolved(blocker.status)) {
        blockers.push(blockerId);
      }
    }
  }

  return blockers;
}

/**
 * Get epics that are blocking a given epic
 */
export function getEpicBlockers(
  epic: Epic,
  allEpics: Epic[],
  allTasks: Task[]
): string[] {
  const blockers: string[] = [];

  // Check sequential constraint
  const sequential = epic.constraints?.sequential ?? true;
  if (sequential) {
    const prevEpic = getPreviousEpic(epic, allEpics);
    // Epic locking: use areAllTasksDone (not areAllTasksResolved)
    // Failed tasks in previous epic block downstream epics
    if (prevEpic && !areAllTasksDone(prevEpic, allTasks)) {
      blockers.push(prevEpic.id);
    }
  }

  // Check explicit blockedBy
  if (epic.constraints?.blockedBy) {
    for (const blockerId of epic.constraints.blockedBy) {
      const blocker = allEpics.find((m) => m.id === blockerId);
      if (blocker && !areAllTasksDone(blocker, allTasks)) {
        blockers.push(blockerId);
      }
    }
  }

  return blockers;
}
