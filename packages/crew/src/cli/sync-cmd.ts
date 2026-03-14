/**
 * crew sync - Regenerate all views (state.json, plan READMEs, epic READMEs)
 *           - Sync todo.yaml for all tasks (merge new checks, preserve done status)
 *           - Log sync events to task events/NNN.jsonl
 */

import { validateProjectDir } from './utils.ts';
import type { HierarchicalStore } from '../store/hierarchical-store.ts';

/**
 * Run sync command - regenerate all views + sync todos
 */
export async function runSync(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  // Use hierarchical store
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  const store = new HierarchicalStore(absDir);

  if (store.listEpicDirs().length === 0) {
    console.error(`[crew] Error: No .crew project found in ${absDir}`);
    console.error(`[crew] Run \`crew init\` first to initialize the project.`);
    process.exit(1);
  }

  console.error(`[crew] Syncing project: ${absDir}`);

  // Sync todo.yaml for all tasks
  console.error(`[crew] Syncing task todos...`);
  const todoStats = await syncAllTodos(store);
  if (todoStats.synced > 0) {
    console.error(`[crew] Synced ${todoStats.synced} tasks (${todoStats.newPending} with new pending items)`);
  }

  // Regenerate all views
  console.error(`[crew] Regenerating views...`);
  await regenerateAllViews(store);
  console.error(`[crew] Views regenerated!`);

  console.error(`[crew] Sync complete!`);
}

/**
 * Sync todo.yaml for all tasks that have checks defined.
 *
 * For each task with checks:
 *   - Generate/merge todo.yaml preserving existing done/failed status
 *   - Log a sync event to events/NNN.jsonl
 *   - Track which tasks gained new pending items (need re-execution)
 */
async function syncAllTodos(store: HierarchicalStore): Promise<{ synced: number; newPending: number }> {
  const { FsStore } = await import('../store/fs/index.ts');
  const { syncTodos } = await import('../store/fs/todo-io.ts');
  const { appendLog } = await import('../store/fs/log-io.ts');

  // Access the raw FsStore for TaskInfo (has dir + config)
  const fsStore = new FsStore(store.rootDir, store.planDirOverride);
  const allTasks = fsStore.listAllTasks();

  let synced = 0;
  let newPending = 0;

  for (const task of allTasks) {
    if (!task.config.checks || task.config.checks.length === 0) continue;

    const hadNew = syncTodos(task.dir, task.config.checks, task.config.title);
    synced++;

    // Log sync event to task events/NNN.jsonl
    appendLog(task.dir, {
      event: 'todo:sync',
      checksCount: task.config.checks.length,
      newPending: hadNew,
    });

    if (hadNew) {
      newPending++;
      console.error(`[crew]   ${task.slug}: new pending checks added`);
    }
  }

  return { synced, newPending };
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
