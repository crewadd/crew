/**
 * Task reset functionality - Reset task and optionally its dependents
 */

import { HierarchicalStore } from '../store/hierarchical-store.ts';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { writeStatus } from '../store/fs/status-io.ts';
import type { Task } from '../store/types.ts';

/**
 * Reset a task (and optionally all its dependents) to pending status
 */
export async function resetTask(
  store: HierarchicalStore,
  taskId: string,
  flags: { deps?: boolean; yes?: boolean; y?: boolean } = {}
): Promise<void> {
  // Resolve the task
  const task = store.getTaskByDisplayId(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const location = store.getTaskLocation(task.id);
  if (!location) {
    throw new Error(`Could not find location for task: ${taskId}`);
  }

  const displayId = store.getDisplayId(task) || taskId;
  const { epic, taskDir } = location;

  // Build list of tasks to reset
  const tasksToReset: Array<{ task: Task; taskDir: string; displayId: string }> = [];

  if (flags.deps) {
    // Find all tasks that depend on this task (recursively)
    const dependents = findAllDependents(store, task);
    tasksToReset.push(
      { task, taskDir, displayId },
      ...dependents.map(dep => ({
        task: dep.task,
        taskDir: dep.taskDir,
        displayId: dep.displayId,
      }))
    );
  } else {
    tasksToReset.push({ task, taskDir, displayId });
  }

  // Confirm unless --yes flag is set
  if (!flags.yes && !flags.y) {
    console.error('');
    console.error(`[crew] WARNING: This will reset the following task(s) to 'pending' status:`);
    console.error('');
    for (const { displayId: tid, task: t } of tasksToReset) {
      console.error(`  • ${tid}: ${t.title} (current: ${t.status})`);
    }
    console.error('');
    console.error(`[crew] All event logs for these tasks will be cleared.`);
    console.error(`[crew] Use --yes or -y to confirm.`);
    console.error('');
    process.exit(0);
  }

  console.error('');
  console.error(`[crew] Resetting ${tasksToReset.length} task(s)...`);

  for (const { taskDir, displayId: tid } of tasksToReset) {
    // Reset status to pending
    writeStatus(taskDir, 'pending');

    // Clear event logs
    const eventsDir = join(taskDir, 'events');
    if (existsSync(eventsDir)) {
      try {
        rmSync(eventsDir, { recursive: true, force: true });
        console.error(`[crew]   ✓ Reset ${tid}: status → pending, events cleared`);
      } catch (err) {
        console.error(`[crew]   ✗ Reset ${tid}: status → pending, events clear failed`);
      }
    } else {
      console.error(`[crew]   ✓ Reset ${tid}: status → pending`);
    }
  }

  // Regenerate views
  console.error(`[crew] Regenerating views...`);
  await regenerateAllViews(store);
  console.error(`[crew] Views regenerated!`);
  console.error('');
  console.error(`[crew] ✓ Reset complete! ${tasksToReset.length} task(s) reset to pending.`);
  console.error('');
}

/**
 * Find all tasks that depend on the given task (recursively)
 */
function findAllDependents(
  store: HierarchicalStore,
  targetTask: Task
): Array<{ task: Task; taskDir: string; displayId: string }> {
  const result: Array<{ task: Task; taskDir: string; displayId: string }> = [];
  const visited = new Set<string>();
  const queue = [targetTask.id];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Find all tasks that have currentId as a dependency
    const allTasks = store.listAllTasks();
    for (const task of allTasks) {
      if (task.dependencies?.includes(currentId)) {
        const location = store.getTaskLocation(task.id);
        if (location) {
          const displayId = store.getDisplayId(task) || String(task.id).replace(/^task_/, '');
          result.push({ task, taskDir: location.taskDir, displayId });
          queue.push(task.id);
        }
      }
    }
  }

  return result;
}

/**
 * Regenerate all views for the project
 */
async function regenerateAllViews(store: HierarchicalStore): Promise<void> {
  const { writeStateJson, writePlanReadme, writeEpicReadme, writeTaskReadme } = await import('../views/writers.ts');

  // Regenerate state.json
  writeStateJson(store);

  // Regenerate plan README
  writePlanReadme(store);

  // Collect all tasks for dependency resolution
  const allTasks = store.listAllTasks();

  // Regenerate all epic and task READMEs
  const epics = store.listEpics();
  for (const epic of epics) {
    const tasks = store.listTasksForEpic(epic);
    writeEpicReadme(store, epic, tasks);

    // Regenerate all task READMEs within this epic
    for (let i = 0; i < tasks.length; i++) {
      writeTaskReadme(store, tasks[i], epic, i + 1, allTasks);
    }
  }
}
