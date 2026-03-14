/**
 * Constraint System - Export
 *
 * Provides constraint evaluation, validation, and flow control for tasks and epics.
 *
 * @example
 * // Check if a task can start
 * import { canTaskStart, getBlockers } from './constraints';
 *
 * const canStart = canTaskStart({ task, allTasks, allEpics });
 * if (!canStart) {
 *   const blockers = getBlockers(task, allTasks, allEpics);
 *   console.log(`Task blocked by: ${blockers.join(', ')}`);
 * }
 *
 * @example
 * // Validate a plan
 * import { validatePlan } from './constraints';
 *
 * const result = validatePlan({ tasks, epics });
 * if (!result.valid) {
 *   console.error('Plan validation errors:', result.errors);
 * }
 *
 * @example
 * // Compute execution batches
 * import { computeBatches } from './constraints';
 *
 * const batches = computeBatches(tasks);
 * for (const batch of batches) {
 *   if (batch.parallel) {
 *     await Promise.all(batch.tasks.map(executeTask));
 *   } else {
 *     for (const task of batch.tasks) {
 *       await executeTask(task);
 *     }
 *   }
 * }
 */

export {
  // Core evaluation
  canTaskStart,
  canEpicStart,
  computeBatches,
  evaluateCondition,
  isResolved,

  // Helper functions
  getBlockers,
  getEpicBlockers,
  getDefaultTaskConstraints,
  getDefaultEpicConstraints,
} from './engine.ts';

export type {
  CanTaskStartOptions,
  CanEpicStartOptions,
  TaskBatch,
} from './engine.ts';

export {
  // Validation
  validatePlan,
  validateTaskConstraints,
  validateEpicConstraints,
  validateExecutionFlow,
  validateTaskDef,
  detectCircularDependencies,
  detectPotentialDeadlocks,
} from './validator.ts';

export type {
  ValidationError,
  ValidationResult,
  ValidatePlanOptions,
} from './validator.ts';
