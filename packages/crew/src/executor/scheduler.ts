import type { CompoundEpic, CompoundTask } from '../types.ts';
import { isResolved } from '../constraints/engine.ts';

export interface TaskBatch {
  tasks: CompoundTask[];
  parallel: boolean;
}

/**
 * Compute parallel execution batches from a epic's tasks.
 *
 * Respects task:
 * - Explicit dependencies (task.deps)
 * - Sequential constraint (when explicitly set) - tasks run one-by-one
 * - Parallel constraint - tasks can run concurrently
 * - Custom blockedBy constraints
 *
 * Handles cycles by placing stuck tasks in the final batch.
 *
 * Backward compatibility: Tasks without explicit constraints run in parallel
 * (old behavior). Set sequential: true to enforce sequential execution.
 */
export function computeBatches(epic: CompoundEpic): TaskBatch[] {
  const pending = epic.tasks.filter((t) => t.status !== 'done');
  if (pending.length === 0) return [];

  const placed = new Set<string>();
  const batches: TaskBatch[] = [];
  let remaining = [...pending];

  while (remaining.length > 0) {
    const batch: CompoundTask[] = [];

    for (const task of remaining) {
      // Check if task can start
      const canStart = canTaskStart(task, remaining, placed);

      if (!canStart) continue;

      // Task can start - add to batch
      batch.push(task);
    }

    // If no tasks could be placed, we have a cycle or all are blocked
    if (batch.length === 0) {
      // Place remaining tasks in final batch (they may have unresolvable constraints)
      if (remaining.length > 0) {
        batches.push({ tasks: remaining, parallel: false });
      }
      break;
    }

    // Check if any task in batch is explicitly sequential
    const hasSequential = batch.some(t => t.constraints?.sequential === true);

    for (const t of batch) placed.add(t.id);

    if (hasSequential) {
      // If there's a sequential task, only run that one
      const sequentialTask = batch.find(t => t.constraints?.sequential === true);
      if (sequentialTask) {
        batches.push({ tasks: [sequentialTask], parallel: false });
        placed.delete(sequentialTask.id); // Will be re-added in next iteration
        remaining = remaining.filter((t) => !placed.has(t.id));
        continue;
      }
    }

    batches.push({ tasks: batch, parallel: true });
    remaining = remaining.filter((t) => !placed.has(t.id));
  }

  return batches;
}

/**
 * Check if a task can start based on constraints
 */
function canTaskStart(
  task: CompoundTask,
  remaining: CompoundTask[],
  placed: Set<string>
): boolean {
  // Get task IDs in remaining (pending tasks in epic)
  const remainingIds = new Set(remaining.map(t => t.id));

  // Check explicit dependencies
  // Only consider dependencies that are in the epic (pending)
  // Dependencies on done tasks are already satisfied
  if (task.deps && task.deps.length > 0) {
    const unresolved = task.deps.filter(
      (dep) => remainingIds.has(dep) && !placed.has(dep)
    );
    if (unresolved.length > 0) {
      return false;
    }
  }

  // Check sequential constraint
  // Only enforce sequential if explicitly set (for backward compatibility)
  const sequential = task.constraints?.sequential === true;

  if (sequential) {
    // Find previous tasks in epic that haven't been placed
    const taskIndex = remaining.findIndex((t) => t.id === task.id);
    if (taskIndex > 0) {
      const prevTask = remaining[taskIndex - 1];
      if (prevTask && !placed.has(prevTask.id) && prevTask.status !== 'done') {
        return false;
      }
    }
  }

  // Check explicit blockedBy constraints
  if (task.constraints?.blockedBy && task.constraints.blockedBy.length > 0) {
    for (const blockerId of task.constraints.blockedBy) {
      if (!placed.has(blockerId)) {
        const blocker = remaining.find((t) => t.id === blockerId);
        if (blocker && blocker.status !== 'done') {
          return false;
        }
      }
    }
  }

  // Check condition constraint
  if (task.constraints?.condition) {
    // For now, assume condition is met (actual evaluation happens at runtime)
    // In production, you'd evaluate the condition here
  }

  return true;
}
