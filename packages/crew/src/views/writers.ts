/**
 * View Writers - Write generated views to disk
 *
 * Bridges ViewableStore → disk I/O.
 * - state.json:    delegates to core (fs/views.ts via state-view.ts)
 * - plan README:   uses dedicated rich plan-view generator
 * - epic README:   uses dedicated rich epic-view generator
 * - task README:   uses dedicated rich task-view generator
 *
 * Also exposes core writers that operate on raw directory paths
 * (no ViewableStore needed).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { generatePlanReadme } from './plan-view.ts';
import { generateStateJson } from './state-view.ts';
import { generateEpicReadme } from './epic-view.ts';
import { generateTaskReadme } from './task-view.ts';
import {
  generateTaskReadme as coreGenerateTaskReadme,
  generateEpicReadme as coreGenerateEpicReadme,
  generatePlanReadme as coreGeneratePlanReadme,
  generateStateJson as coreGenerateStateJson,
} from '../store/fs/views.ts';
import { numberedSlug } from '../store/slug-utils.ts';
import type { ViewableStore, Epic, Task } from './types.ts';
import type { TaskViewContext } from './task-view.ts';

/* ------------------------------------------------------------------ */
/*  ViewableStore-based writers (rich / dedicated views)               */
/* ------------------------------------------------------------------ */

/**
 * Write state.json to disk (delegates to core via state-view bridge).
 */
export function writeStateJson(store: ViewableStore): void {
  const content = generateStateJson(store);
  writeFileSync(join(store.rootDir, '.crew', 'state.json'), content + '\n', 'utf-8');
}

/**
 * Write comprehensive plan README to .crew/epics/README.md
 */
export function writePlanReadme(store: ViewableStore & { planDirOverride?: string }): void {
  const content = generatePlanReadme(store);

  // Use planDirOverride if available, otherwise default to .crew/epics
  const planDir = store.planDirOverride || join(store.rootDir, '.crew', 'epics');
  mkdirSync(planDir, { recursive: true });

  writeFileSync(join(planDir, 'README.md'), content, 'utf-8');
}

/**
 * Write epic README to .crew/epics/{epic-slug}/README.md
 */
export function writeEpicReadme(
  store: ViewableStore & { planDirOverride?: string },
  epic: Epic,
  tasks: Task[]
): void {
  const epicSlug = numberedSlug(epic.number, epic.title);

  // Use planDirOverride if available, otherwise default to .crew/epics
  const planDir = store.planDirOverride || join(store.rootDir, '.crew', 'epics');
  const epicDir = join(planDir, epicSlug);

  mkdirSync(epicDir, { recursive: true });

  const content = generateEpicReadme({
    epic,
    tasks,
    epicSlug,
  });

  writeFileSync(join(epicDir, 'README.md'), content, 'utf-8');
}

/**
 * Write task README to .crew/epics/{epic-slug}/tasks/{task-slug}/README.md
 */
export function writeTaskReadme(
  store: ViewableStore & { planDirOverride?: string },
  task: Task,
  epic: Epic,
  taskNumber: number,
  allTasks?: Task[]
): void {
  const epicSlug = numberedSlug(epic.number, epic.title);
  const taskSlug = numberedSlug(taskNumber, task.title);

  // Use planDirOverride if available, otherwise default to .crew/epics
  const planDir = store.planDirOverride || join(store.rootDir, '.crew', 'epics');
  const taskDir = join(planDir, epicSlug, 'tasks', taskSlug);

  mkdirSync(taskDir, { recursive: true });

  // Resolve dependency/dependent Task objects if we have all tasks
  let dependencies: Task[] | undefined;
  let dependents: Task[] | undefined;

  if (allTasks && task.dependencies && task.dependencies.length > 0) {
    dependencies = task.dependencies
      .map(depId => allTasks.find(t => t.id === depId))
      .filter((t): t is Task => t !== undefined);
  }

  if (allTasks && task.dependents && task.dependents.length > 0) {
    dependents = task.dependents
      .map(depId => allTasks.find(t => t.id === depId))
      .filter((t): t is Task => t !== undefined);
  }

  const content = generateTaskReadme({
    task,
    epic,
    taskNumber,
    epicSlug,
    taskSlug,
    dependencies,
    dependents,
  });

  writeFileSync(join(taskDir, 'README.md'), content, 'utf-8');
}

/* ------------------------------------------------------------------ */
/*  Core writers (filesystem-native, raw directory paths)              */
/* ------------------------------------------------------------------ */

/**
 * Write core task README directly from a task directory path.
 */
export function writeCoreTaskReadme(taskDir: string): void {
  const content = coreGenerateTaskReadme(taskDir);
  writeFileSync(join(taskDir, 'README.md'), content, 'utf-8');
}

/**
 * Write core epic README directly from an epic directory path.
 */
export function writeCoreEpicReadme(epicDir: string): void {
  const content = coreGenerateEpicReadme(epicDir);
  writeFileSync(join(epicDir, 'README.md'), content, 'utf-8');
}

/**
 * Write core plan README directly from a .crew root path.
 */
export function writeCorePlanReadme(root: string): void {
  const epicsDir = join(root, 'epics');
  mkdirSync(epicsDir, { recursive: true });
  const content = coreGeneratePlanReadme(root);
  writeFileSync(join(epicsDir, 'README.md'), content, 'utf-8');
}

/**
 * Write core state.json directly from a .crew root path.
 */
export function writeCoreStateJson(root: string): void {
  const state = coreGenerateStateJson(root);
  writeFileSync(join(root, 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

