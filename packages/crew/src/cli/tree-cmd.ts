/**
 * crew tree - Display project tree view
 */

import { validateProjectDir } from './utils.ts';

/**
 * Run tree command - display hierarchical tree view of project
 */
export async function runTree(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  const { HierarchicalStore, generateTreeView } = await import('../store/hierarchical-store.ts');
  const store = new HierarchicalStore(absDir);

  const msCount = store.listEpicDirs().length;
  if (msCount === 0) {
    console.error(`[crew] No epics found. Run 'crew init' to initialize.`);
    process.exit(1);
  }

  console.log(generateTreeView(store));

  // Also show quick stats
  const stats = store.getStats();
  console.error('');
  console.error(`Stats: ${stats.epics} epics, ${stats.tasks} tasks (${stats.completed} done, ${stats.active} active, ${stats.pending} pending)`);
}
