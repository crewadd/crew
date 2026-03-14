/**
 * Epic CLI commands
 */

import { loadStore } from '../planner/index.ts';
import {
  getEpicDetails,
  createEpic as createEpicOp,
  updateEpic,
  deleteEpic,
  type EpicCreateInput,
  type EpicUpdateInput,
} from '../manager/epic-operations.ts';
import { validateProjectDir } from './utils.ts';

/**
 * View epic details
 */
export async function runEpicView(
  projectDir: string,
  epicId: string,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  if (store.listEpicDirs().length === 0) {
    console.error('[crew] ERROR: No project. Run: crew init');
    process.exit(1);
  }

  const details = getEpicDetails(store, epicId);

  if (!details) {
    console.error(`[crew] Epic not found: ${epicId}`);
    process.exit(1);
  }

  const { epic, tasks } = details;

  if (flags.json) {
    console.log(JSON.stringify({
      id: epic.id,
      number: epic.number,
      title: epic.title,
      status: epic.status,
      gates: epic.gates,
      tasks: tasks.map((t, idx) => ({
        id: t.id,
        displayId: `m${epic.number}.${idx + 1}`,
        title: t.title,
        status: t.status,
        assignee: t.assignee,
      })),
    }, null, 2));
    return;
  }

  console.error('');
  console.error(`Epic M${epic.number}: ${epic.title}`);
  console.error('═'.repeat(70));
  console.error('');
  console.error(`Status:     ${epic.status}`);
  console.error(`Tasks:      ${tasks.length}`);
  console.error('');

  if (epic.gates && epic.gates.length > 0) {
    console.error('Gates:');
    epic.gates.forEach(gate => {
      const status = gate.completed ? '✓' : '○';
      console.error(`  ${status} ${gate.type}${gate.required ? ' (required)' : ''}`);
    });
    console.error('');
  }

  if (tasks.length > 0) {
    console.error('Tasks:');
    tasks.forEach((task, idx) => {
      const statusIcon = task.status === 'done' ? '✓' :
                        task.status === 'active' ? '▶' :
                        task.status === 'blocked' ? '⊗' :
                        task.status === 'failed' ? '✗' : '○';
      console.error(`  ${statusIcon} m${epic.number}.${idx + 1} ${task.title} [${task.status}]`);
    });
    console.error('');
  }
}

/**
 * Add a new epic
 */
export async function runEpicAdd(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const title = args[0];
  if (!title) {
    console.error('[crew] Error: Epic title required');
    console.error('[crew] Usage: crew epic add "<title>" [--number <n>]');
    process.exit(1);
  }

  const input: EpicCreateInput = {
    title,
    number: flags.number ? parseInt(flags.number as string, 10) : undefined,
  };

  try {
    const epicId = await createEpicOp(store, input);
    const details = getEpicDetails(store, epicId);

    console.error('');
    console.error(`✓ Epic created: M${details?.epic.number}`);
    console.error(`  Title: ${title}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error creating epic: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Edit an existing epic
 */
export async function runEpicEdit(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const epicId = args[0];
  if (!epicId) {
    console.error('[crew] Error: Epic ID required');
    console.error('[crew] Usage: crew epic edit <id> --title <new title> [options]');
    process.exit(1);
  }

  const updates: EpicUpdateInput = {};

  if (flags.title) {
    updates.title = flags.title as string;
  }
  if (flags.status) {
    updates.status = flags.status as any;
  }

  try {
    await updateEpic(store, epicId, updates);
    console.error('');
    console.error(`✓ Epic updated: ${epicId}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error updating epic: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Remove a epic
 */
export async function runEpicRemove(
  projectDir: string,
  args: string[],
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const epicId = args[0];
  if (!epicId) {
    console.error('[crew] Error: Epic ID required');
    console.error('[crew] Usage: crew epic remove <id>');
    process.exit(1);
  }

  try {
    await deleteEpic(store, epicId);
    console.error('');
    console.error(`✓ Epic removed: ${epicId}`);
    console.error('');
  } catch (error) {
    console.error(`[crew] Error removing epic: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Show current epic context when no epic ID is provided
 */
async function showCurrentEpicContext(projectDir: string): Promise<void> {
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
    console.error('No current epic found. All epics may be complete.');
    console.error('Usage: crew epic <id>');
    process.exit(1);
  }

  const currentIdx = epics.findIndex(m => m.id === currentMs!.id);

  console.error('CURRENT CONTEXT:');
  console.error('');

  // Show previous epic
  if (currentIdx > 0) {
    const prevMs = epics[currentIdx - 1];
    const prevTasks = store.listTasksForEpic(prevMs);
    const prevDone = prevTasks.filter(t => t.status === 'done').length;
    console.error(`  ✓ M${prevMs.number}: ${prevMs.title} (${prevDone}/${prevTasks.length} done)`);
  }

  // Show current epic
  const currentTasks = store.listTasksForEpic(currentMs);
  const currentDone = currentTasks.filter(t => t.status === 'done').length;
  console.error(`  > M${currentMs.number}: ${currentMs.title} (${currentDone}/${currentTasks.length} done) ← CURRENT`);

  // Show next epic
  if (currentIdx < epics.length - 1) {
    const nextMs = epics[currentIdx + 1];
    const nextTasks = store.listTasksForEpic(nextMs);
    const nextDone = nextTasks.filter(t => t.status === 'done').length;
    console.error(`    M${nextMs.number}: ${nextMs.title} (${nextDone}/${nextTasks.length} done)`);
  }

  console.error('');
  console.error('Usage:');
  console.error(`  crew epic m${currentMs.number}    # View current epic details`);
  if (currentIdx > 0) {
    console.error(`  crew epic m${epics[currentIdx - 1].number}    # View previous epic`);
  }
  if (currentIdx < epics.length - 1) {
    console.error(`  crew epic m${epics[currentIdx + 1].number}    # View next epic`);
  }
  console.error(`  crew status            # View full project status`);
}

/**
 * Handle epic command routing
 */
export async function handleEpicCommand(
  projectDir: string,
  epicIdOrSubcommand: string | undefined,
  subcommand: string | undefined,
  subcommandArgs: string[] | undefined,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  // If first arg is a known subcommand, treat it as such
  if (epicIdOrSubcommand && ['add', 'edit', 'remove'].includes(epicIdOrSubcommand)) {
    const args = [subcommand, ...(subcommandArgs || [])].filter(Boolean) as string[];
    switch (epicIdOrSubcommand) {
      case 'add':
        await runEpicAdd(projectDir, args, flags);
        break;
      case 'edit':
        await runEpicEdit(projectDir, args, flags);
        break;
      case 'remove':
        await runEpicRemove(projectDir, args, flags);
        break;
    }
  } else if (epicIdOrSubcommand) {
    // View operation
    await runEpicView(projectDir, epicIdOrSubcommand, flags);
  } else {
    // Show current epic context when no ID provided
    await showCurrentEpicContext(projectDir);
  }
}
