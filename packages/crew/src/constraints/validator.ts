/**
 * Constraint Validator - Validate constraint configurations
 *
 * Checks for:
 * - Circular dependencies
 * - Impossible conditions
 * - Orphaned tasks (blocked by non-existent tasks)
 * - Potential deadlocks
 */

import type { Task, Epic } from '../store/types.ts';
import type { TaskDef, ExecutionFlow } from '../tasks/types.ts';

export interface ValidationError {
  type: 'error' | 'warning';
  code: string;
  message: string;
  taskId?: string;
  epicId?: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate all constraints in a plan
 */
export interface ValidatePlanOptions {
  tasks: Task[];
  epics: Epic[];
  vars?: Record<string, unknown>;
}

export function validatePlan(opts: ValidatePlanOptions): ValidationResult {
  const { tasks, epics, vars = {} } = opts;
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate task constraints
  for (const task of tasks) {
    const taskErrors = validateTaskConstraints(task, tasks, epics, vars);
    for (const err of taskErrors) {
      if (err.type === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    }
  }

  // Validate epic constraints
  for (const epic of epics) {
    const msErrors = validateEpicConstraints(epic, epics, tasks, vars);
    for (const err of msErrors) {
      if (err.type === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    }
  }

  // Check for circular dependencies
  const cycles = detectCircularDependencies(tasks);
  for (const cycle of cycles) {
    errors.push({
      type: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      details: { cycle },
    });
  }

  // Check for potential deadlocks
  const deadlocks = detectPotentialDeadlocks(tasks, epics);
  for (const deadlock of deadlocks) {
    warnings.push({
      type: 'warning',
      code: 'POTENTIAL_DEADLOCK',
      message: `Potential deadlock: ${deadlock.join(' ↔ ')}`,
      details: { tasks: deadlock },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate constraints for a single task
 */
export function validateTaskConstraints(
  task: Task,
  allTasks: Task[],
  allEpics: Epic[],
  vars: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const constraints = task.constraints || {};

  // Check for orphaned blockedBy references
  if (constraints.blockedBy) {
    for (const blockerId of constraints.blockedBy) {
      const blocker = allTasks.find((t) => t.id === blockerId);
      if (!blocker) {
        errors.push({
          type: 'error',
          code: 'ORPHANED_BLOCKED_BY',
          message: `Task "${task.title}" references non-existent blocker: ${blockerId}`,
          taskId: task.id,
          details: { blockerId },
        });
      }
    }
  }

  // Check for orphaned blocking references
  if (constraints.blocking) {
    for (const blockedId of constraints.blocking) {
      const blocked = allTasks.find((t) => t.id === blockedId);
      if (!blocked) {
        warnings.push({
          type: 'warning',
          code: 'ORPHANED_BLOCKING',
          message: `Task "${task.title}" blocks non-existent task: ${blockedId}`,
          taskId: task.id,
          details: { blockedId },
        });
      }
    }
  }

  // Check for conflicting constraints
  if (constraints.sequential && constraints.parallel) {
    warnings.push({
      type: 'warning',
      code: 'CONFLICTING_CONSTRAINTS',
      message: `Task "${task.title}" has both sequential and parallel constraints`,
      taskId: task.id,
    });
  }

  // Check flow configuration
  if (task.flow) {
    const flowErrors = validateExecutionFlow(task, task.flow, allTasks);
    errors.push(...flowErrors);
  }

  // Validate condition syntax (basic check)
  if (typeof constraints.condition === 'string') {
    try {
      // Try to parse the condition
      new Function(...Object.keys(vars), `return ${constraints.condition};`);
    } catch (error) {
      warnings.push({
        type: 'warning',
        code: 'INVALID_CONDITION',
        message: `Task "${task.title}" has invalid condition syntax: ${constraints.condition}`,
        taskId: task.id,
        details: { condition: constraints.condition },
      });
    }
  }

  return [...errors, ...warnings];
}

/**
 * Validate constraints for a single epic
 */
export function validateEpicConstraints(
  epic: Epic,
  allEpics: Epic[],
  allTasks: Task[],
  vars: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const constraints = epic.constraints || {};

  // Check for orphaned blockedBy references
  if (constraints.blockedBy) {
    for (const blockerId of constraints.blockedBy) {
      const blocker = allEpics.find((m) => m.id === blockerId);
      if (!blocker) {
        errors.push({
          type: 'error',
          code: 'ORPHANED_BLOCKED_BY',
          message: `Epic "${epic.title}" references non-existent blocker: ${blockerId}`,
          epicId: epic.id,
          details: { blockerId },
        });
      }
    }
  }

  // Check for orphaned blocking references
  if (constraints.blocking) {
    for (const blockedId of constraints.blocking) {
      const blocked = allEpics.find((m) => m.id === blockedId);
      if (!blocked) {
        warnings.push({
          type: 'warning',
          code: 'ORPHANED_BLOCKING',
          message: `Epic "${epic.title}" blocks non-existent epic: ${blockedId}`,
          epicId: epic.id,
          details: { blockedId },
        });
      }
    }
  }

  // Validate condition syntax
  if (typeof constraints.condition === 'string') {
    try {
      new Function(...Object.keys(vars), `return ${constraints.condition};`);
    } catch (error) {
      warnings.push({
        type: 'warning',
        code: 'INVALID_CONDITION',
        message: `Epic "${epic.title}" has invalid condition syntax: ${constraints.condition}`,
        epicId: epic.id,
        details: { condition: constraints.condition },
      });
    }
  }

  return [...errors, ...warnings];
}

/**
 * Validate execution flow configuration
 */
export function validateExecutionFlow(
  task: Task,
  flow: ExecutionFlow,
  allTasks: Task[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate fanOut branches
  if (flow.type === 'fanOut' && flow.branches) {
    for (const branchId of flow.branches) {
      const branch = allTasks.find((t) => t.id === branchId);
      if (!branch) {
        errors.push({
          type: 'error',
          code: 'INVALID_FANOUT_BRANCH',
          message: `Task "${task.title}" has fanOut branch to non-existent task: ${branchId}`,
          taskId: task.id,
          details: { branchId },
        });
      }
    }
  }

  // Validate fanIn sync barrier
  if (flow.type === 'fanIn' && flow.syncBarrier) {
    for (const syncId of flow.syncBarrier) {
      const sync = allTasks.find((t) => t.id === syncId);
      if (!sync) {
        errors.push({
          type: 'error',
          code: 'INVALID_FANIN_SYNC',
          message: `Task "${task.title}" has fanIn sync barrier referencing non-existent task: ${syncId}`,
          taskId: task.id,
          details: { syncId },
        });
      }
    }
  }

  // Validate DAG edges
  if (flow.type === 'dag' && flow.edges) {
    for (const edge of flow.edges) {
      const from = allTasks.find((t) => t.id === edge.from);
      const to = allTasks.find((t) => t.id === edge.to);

      if (!from) {
        errors.push({
          type: 'error',
          code: 'INVALID_DAG_EDGE',
          message: `Task "${task.title}" has DAG edge from non-existent task: ${edge.from}`,
          taskId: task.id,
          details: { edge },
        });
      }

      if (!to) {
        errors.push({
          type: 'error',
          code: 'INVALID_DAG_EDGE',
          message: `Task "${task.title}" has DAG edge to non-existent task: ${edge.to}`,
          taskId: task.id,
          details: { edge },
        });
      }
    }
  }

  return errors;
}

/**
 * Detect circular dependencies in task graph
 */
export function detectCircularDependencies(tasks: Task[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(taskId: string): void {
    if (recursionStack.has(taskId)) {
      // Found a cycle
      const cycleStart = path.indexOf(taskId);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), taskId]);
      }
      return;
    }

    if (visited.has(taskId)) {
      return;
    }

    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = tasks.find((t) => t.id === taskId);
    if (task?.dependencies) {
      for (const depId of task.dependencies) {
        dfs(depId);
      }
    }

    path.pop();
    recursionStack.delete(taskId);
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  }

  return cycles;
}

/**
 * Detect potential deadlocks (tasks that may never be able to start)
 */
export function detectPotentialDeadlocks(tasks: Task[], epics: Epic[]): string[][] {
  const deadlocks: string[][] = [];

  // Check for mutual blocking
  for (const taskA of tasks) {
    const blockedByA = new Set(taskA.constraints?.blockedBy || []);

    for (const taskB of tasks) {
      if (taskA.id === taskB.id) continue;

      const blockedByB = new Set(taskB.constraints?.blockedBy || []);

      // Check if A blocks B and B blocks A (mutual deadlock)
      if (blockedByA.has(taskB.id) && blockedByB.has(taskA.id)) {
        deadlocks.push([taskA.id, taskB.id]);
      }
    }
  }

  // Check for epic-level deadlocks
  for (const msA of epics) {
    const blockedByA = new Set(msA.constraints?.blockedBy || []);

    for (const msB of epics) {
      if (msA.id === msB.id) continue;

      const blockedByB = new Set(msB.constraints?.blockedBy || []);

      if (blockedByA.has(msB.id) && blockedByB.has(msA.id)) {
        deadlocks.push([msA.id, msB.id]);
      }
    }
  }

  // Deduplicate
  const unique = deadlocks.filter(
    (d, i) => deadlocks.findIndex((x) => x[0] === d[0] && x[1] === d[1]) === i
  );

  return unique;
}

/**
 * Validate a single task definition (for use during plan creation)
 */
export function validateTaskDef(task: TaskDef, allTasks: TaskDef[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for duplicate IDs
  const duplicates = allTasks.filter((t) => t.id === task.id && t !== task);
  if (duplicates.length > 0) {
    errors.push({
      type: 'error',
      code: 'DUPLICATE_TASK_ID',
      message: `Duplicate task ID: ${task.id}`,
      taskId: task.id,
    });
  }

  // Check for self-dependency
  if (task.deps?.includes(task.id)) {
    errors.push({
      type: 'error',
      code: 'SELF_DEPENDENCY',
      message: `Task "${task.title}" depends on itself`,
      taskId: task.id,
    });
  }

  return errors;
}
