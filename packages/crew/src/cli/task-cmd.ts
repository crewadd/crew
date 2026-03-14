/**
 * Task CLI commands
 */

import { loadStore } from '../planner/index.ts';
import {
  getTaskDetails,
  createTask,
  updateTask,
  deleteTask,
  getNextReadyTask,
  type TaskCreateInput,
  type TaskUpdateInput,
} from '../manager/task-operations.ts';
import { validateProjectDir } from './utils.ts';
import { handleTaskReviewCommand } from './review-cmd.ts';
import { resetTask } from './reset-cmd.ts';

/**
 * View task details
 */
export async function runTaskView(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);
  const details = getTaskDetails(store, taskId);

  if (!details) {
    console.error(`[crew] Task not found: ${taskId}`);
    process.exit(1);
  }

  const { task, epic, displayId, location } = details;

  if (flags.json) {
    console.log(JSON.stringify({
      id: displayId,
      title: task.title,
      status: task.status,
      epic: epic.number,
      epic_title: epic.title,
      assignee: task.assignee,
      type: task.type,
      input: task.input?.description,
      output: task.output?.description,
      dependencies: task.dependencies,
      location: location.path,
    }, null, 2));
    return;
  }

  console.error('');
  console.error(`Task ${displayId}: ${task.title}`);
  console.error('═'.repeat(70));
  console.error('');
  console.error(`Status:     ${task.status}`);
  console.error(`Epic:  M${epic.number}: ${epic.title}`);
  if (task.assignee) {
    console.error(`Assignee:   ${task.assignee.replace(/^agent_/, '')}`);
  }
  if (task.type) {
    console.error(`Type:       ${task.type}`);
  }
  console.error('');

  if (task.input?.description) {
    console.error(`Input:      ${task.input.description}`);
  }
  if (task.output?.description) {
    console.error(`Output:     ${task.output.description}`);
  }
  console.error('');

  if (task.dependencies && task.dependencies.length > 0) {
    console.error('Dependencies:');
    task.dependencies.forEach(depId => {
      const dep = getTaskDetails(store, depId);
      if (dep) {
        console.error(`  • ${dep.displayId}: ${dep.task.title}`);
      }
    });
    console.error('');
  }

  console.error(`Location:   ${location.path}`);
  console.error('');
}

/**
 * Add a new task
 */
export async function runTaskAdd(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const title = args[0];
  if (!title) {
    console.error('[crew] Error: Task title required');
    console.error('[crew] Usage: crew task add "<title>" --epic <n> [options]');
    process.exit(1);
  }

  const epicNumber = parseInt(flags.epic as string, 10);
  if (isNaN(epicNumber)) {
    console.error('[crew] Error: --epic <number> required');
    process.exit(1);
  }

  const input: TaskCreateInput = {
    title,
    epicNumber,
    assignee: flags.assignee as string,
    input: flags.input as string,
    output: flags.output as string,
    prompt: flags.prompt as string,
    type: flags.type as string,
  };

  try {
    const taskId = await createTask(store, input);
    const details = getTaskDetails(store, taskId);

    console.error('');
    console.error(`✓ Task created: ${details?.displayId}`);
    console.error(`  Title: ${title}`);
    console.error(`  Epic: M${epicNumber}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error creating task: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Edit an existing task
 */
export async function runTaskEdit(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const taskId = args[0];
  if (!taskId) {
    console.error('[crew] Error: Task ID required');
    console.error('[crew] Usage: crew task edit <id> --status <status> [options]');
    process.exit(1);
  }

  const updates: TaskUpdateInput = {};

  if (flags.status) {
    updates.status = flags.status as any;
  }
  if (flags.assignee !== undefined) {
    updates.assignee = flags.assignee as string;
  }
  if (flags.input !== undefined) {
    updates.input = flags.input as string;
  }
  if (flags.output !== undefined) {
    updates.output = flags.output as string;
  }
  if (flags.prompt !== undefined) {
    updates.prompt = flags.prompt as string;
  }
  if (flags['add-dep']) {
    updates.addDependency = flags['add-dep'] as import('../store/types.ts').TaskId;
  }

  try {
    await updateTask(store, taskId, updates);
    console.error('');
    console.error(`✓ Task updated: ${taskId}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error updating task: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Remove a task
 */
export async function runTaskRemove(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const taskId = args[0];
  if (!taskId) {
    console.error('[crew] Error: Task ID required');
    console.error('[crew] Usage: crew task remove <id>');
    process.exit(1);
  }

  try {
    await deleteTask(store, taskId);
    console.error('');
    console.error(`✓ Task removed: ${taskId}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error removing task: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Show the next upcoming ready task
 */
export async function runTaskNext(
  projectDir: string,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const nextTask = getNextReadyTask(store);

  if (!nextTask) {
    console.error('');
    console.error('No upcoming tasks found.');
    console.error('All tasks may be complete or blocked.');
    console.error('');
    console.error('Run `crew status` for full project overview.');
    console.error('');
    return;
  }

  const { task, epic, displayId } = nextTask;

  if (flags.json) {
    console.log(JSON.stringify({
      id: displayId,
      title: task.title,
      status: task.status,
      epic: epic.number,
      epic_title: epic.title,
      assignee: task.assignee,
      type: task.type,
      input: task.input?.description,
      output: task.output?.description,
      dependencies: task.dependencies,
    }, null, 2));
    return;
  }

  console.error('');
  console.error('📋 NEXT TASK');
  console.error('═'.repeat(70));
  console.error('');
  console.error(`${displayId}: ${task.title}`);
  console.error('');
  console.error(`Epic:  M${epic.number}: ${epic.title}`);
  console.error(`Status:     ${task.status}`);
  if (task.assignee) {
    console.error(`Assignee:   ${task.assignee.replace(/^agent_/, '')}`);
  }
  if (task.type) {
    console.error(`Type:       ${task.type}`);
  }
  console.error('');

  if (task.input?.description) {
    console.error(`Input:      ${task.input.description}`);
  }
  if (task.output?.description) {
    console.error(`Output:     ${task.output.description}`);
  }
  console.error('');

  if (task.dependencies && task.dependencies.length > 0) {
    console.error('Dependencies:');
    task.dependencies.forEach(depId => {
      const dep = getTaskDetails(store, depId);
      if (dep) {
        console.error(`  • ${dep.displayId}: ${dep.task.title} (${dep.task.status})`);
      }
    });
    console.error('');
  }

  console.error('Commands:');
  console.error(`  crew run ${displayId}     # Run this task`);
  console.error(`  crew task ${displayId}    # View full details`);
  console.error('');
}

/**
 * Reset a task
 */
export async function runTaskReset(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  try {
    await resetTask(store, taskId, {
      deps: Boolean(flags.deps),
      yes: Boolean(flags.yes || flags.y),
    });
  } catch (error) {
    console.error(`[crew] Error resetting task: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Show current task context when no task ID is provided
 */
async function showCurrentTaskContext(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  if (store.listEpicDirs().length === 0) {
    console.error('ERROR: No project. Run: crew init');
    process.exit(1);
  }

  const epics = store.listEpics();
  const project = store.getProject();

  // Find current epic - skip empty ones
  const currentMsId = project?.current?.epic;
  let currentMs = epics.find(m => m.id === currentMsId);
  if (!currentMs || store.listTasksForEpic(currentMs).length === 0) {
    // Fall back to first incomplete epic with tasks
    currentMs = epics.find(m => {
      const tasks = store.listTasksForEpic(m);
      return tasks.length > 0 && tasks.some(t => t.status !== 'done');
    });
  }

  if (!currentMs) {
    console.error('No current epic found. All tasks may be complete.');
    console.error('Usage: crew task <id>');
    process.exit(1);
  }

  const tasks = store.listTasksForEpic(currentMs);

  // Find current task (first non-done task)
  const currentTaskIdx = tasks.findIndex(t => t.status !== 'done');
  const currentTask = currentTaskIdx >= 0 ? tasks[currentTaskIdx] : null;

  console.error('CURRENT CONTEXT:');
  console.error('');
  console.error(`Epic: M${currentMs.number} ${currentMs.title}`);
  console.error(`Progress: ${tasks.filter(t => t.status === 'done').length}/${tasks.length} tasks done`);
  console.error('');

  if (currentTask) {
    const displayId = `m${currentMs.number}.${currentTaskIdx + 1}`;
    console.error(`Current Task: ${displayId} ${currentTask.title} (${currentTask.status})`);

    // Show previous task if exists
    if (currentTaskIdx > 0) {
      const prevTask = tasks[currentTaskIdx - 1];
      const prevDisplayId = `m${currentMs.number}.${currentTaskIdx}`;
      console.error(`  ← Previous: ${prevDisplayId} ${prevTask.title} (${prevTask.status})`);
    }

    // Show next task if exists
    if (currentTaskIdx < tasks.length - 1) {
      const nextTask = tasks[currentTaskIdx + 1];
      const nextDisplayId = `m${currentMs.number}.${currentTaskIdx + 2}`;
      console.error(`  → Next: ${nextDisplayId} ${nextTask.title} (${nextTask.status})`);
    }

    console.error('');
    console.error('Usage:');
    console.error(`  crew task ${displayId}       # View current task details`);
    console.error(`  crew epic m${currentMs.number}    # View current epic details`);
    console.error(`  crew status            # View full project status`);
  } else {
    console.error('All tasks in this epic are complete.');
    console.error('');
    console.error('Usage: crew task <id>');
    console.error('Example: crew task m1.1');
  }
}

/**
 * Handle task command routing
 */
export async function handleTaskCommand(
  projectDir: string,
  taskIdOrNext: string | undefined,
  subcommand: string | undefined,
  subcommandArgs: string[] | undefined,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  if (subcommand) {
    const args = subcommandArgs || [];
    switch (subcommand) {
      case 'add':
        await runTaskAdd(projectDir, args, flags);
        break;
      case 'edit':
        await runTaskEdit(projectDir, args, flags);
        break;
      case 'remove':
        await runTaskRemove(projectDir, args, flags);
        break;
      case 'next':
        await runTaskNext(projectDir, flags);
        break;
      case 'review':
        if (!taskIdOrNext) {
          console.error('[crew] Error: Task ID required for review');
          console.error('[crew] Usage: crew task <id> review {show|approve|request-changes|reject}');
          process.exit(1);
        }
        await handleTaskReviewCommand(projectDir, taskIdOrNext, args[0], flags);
        break;
      case 'reset':
        if (!taskIdOrNext) {
          console.error('[crew] Error: Task ID required for reset');
          console.error('[crew] Usage: crew task <id> reset [--deps] [--yes]');
          process.exit(1);
        }
        await runTaskReset(projectDir, taskIdOrNext, flags);
        break;
      default:
        console.error(`[crew] Unknown task subcommand: ${subcommand}`);
        process.exit(1);
    }
  } else {
    if (!taskIdOrNext) {
      // Show current task context when no ID provided
      await showCurrentTaskContext(projectDir);
      return;
    }
    await runTaskView(projectDir, taskIdOrNext, flags);
  }
}
