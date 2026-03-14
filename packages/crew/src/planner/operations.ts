/**
 * Plan operations - viewing, managing, and interacting with existing plans
 *
 * This module complements planner.ts (which generates plans from strategies)
 * by providing operations to view and manage already-created plans.
 */

import { join, resolve } from 'node:path';
import { existsSync, rmSync, mkdirSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { BuildContext } from '../types.ts';
import type { HierarchicalStore } from '../store/hierarchical-store.ts';

export interface PlanViewOptions {
  maxTasksPerEpic?: number;
}

export interface PlanInitOptions {
  force?: boolean;
  dryRun?: boolean;
}

export interface PlanSummary {
  project: {
    name: string;
    goal: string;
  };
  stats: {
    epics: number;
    tasks: number;
  };
  epics: Array<{
    number: number;
    title: string;
    status: string;
    tasks: Array<{
      id: string;
      displayId: string;
      title: string;
      status: string;
    }>;
    totalTasks: number;
    doneTasks: number;
  }>;
}

/**
 * Check if plan exists
 */
export function planExists(store: HierarchicalStore): boolean {
  return store.listEpicDirs().length > 0;
}

/**
 * Get plan summary for display
 */
export function getPlanSummary(store: HierarchicalStore, options: PlanViewOptions = {}): PlanSummary {
  const { maxTasksPerEpic = 5 } = options;

  const project = store.getProject();
  const projectName = project?.name || 'Project';
  const projectGoal = project?.goal || project?.description || 'No goal specified';

  const epics = store.listEpics();
  const stats = store.getStats();

  return {
    project: {
      name: projectName,
      goal: projectGoal,
    },
    stats: {
      epics: stats.epics,
      tasks: stats.tasks,
    },
    epics: epics.map(epic => {
      const tasks = store.listTasksForEpic(epic);
      const doneTasks = tasks.filter(t => t.status === 'done').length;

      return {
        number: epic.number,
        title: epic.title,
        status: epic.status,
        tasks: tasks.slice(0, maxTasksPerEpic).map((task, idx) => ({
          id: task.id,
          displayId: `m${epic.number}.${idx + 1}`,
          title: task.title,
          status: task.status,
        })),
        totalTasks: tasks.length,
        doneTasks,
      };
    }),
  };
}

/**
 * Initialize plan from config with transactional commit/rollback
 * 
 * Uses a temp directory for atomic operations:
 * 1. Create temp directory
 * 2. Write all plan files to temp
 * 3. On success: atomic rename to .crew/epics (commit)
 * 4. On failure: delete temp directory (rollback)
 */
export async function initializePlan(
  ctx: BuildContext,
  config: { name?: string; onInitCrew?: (ctx: any) => any; onInitPlan?: (ctx: any) => any },
  options: PlanInitOptions = {}
): Promise<void> {
  const { force = false, dryRun = false } = options;

  // Check if plan exists
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  const store = new HierarchicalStore(ctx.appDir);

  if (planExists(store) && !force) {
    throw new Error('Plan already exists. Use force option to overwrite.');
  }

  if (dryRun) {
    // In dry run mode, only validate the config without writing
    console.error('[crew] Dry run mode: validating configuration...');
    return;
  }

  // Transactional approach: write to temp directory, then atomic move
  const tempDirName = `.crew.plan.tmp.${randomBytes(8).toString('hex')}`;
  const tempCrewRoot = join(ctx.appDir, tempDirName);
  const epicsDir = join(ctx.appDir, '.crew', 'epics');

  try {
    // Create temp directory structure
    mkdirSync(join(tempCrewRoot, 'epics'), { recursive: true });

    // Execute config hook to create plan in temp directory
    // Pass temp crew root as planDir override
    const tempCtx = { ...ctx, planDir: tempCrewRoot };
    const { executeConfigInit } = await import('../config-loader.ts');
    await executeConfigInit(tempCtx, config);

    // Generate PLAN.md in temp directory
    const tempStore = new HierarchicalStore(ctx.appDir, {}, tempCrewRoot);
    const { writePlanReadme } = await import('../views/writers.ts');
    writePlanReadme(tempStore);

    // Commit: atomic rename (works on same filesystem)
    // First remove existing plan if force mode
    if (existsSync(epicsDir)) {
      rmSync(epicsDir, { recursive: true, force: true });
    }

    // Atomic rename from temp/epics to .crew/epics
    const tempEpicsDir = join(tempCrewRoot, 'epics');
    renameSync(tempEpicsDir, epicsDir);

    // Clean up temp directory (only README.md should remain)
    rmSync(tempCrewRoot, { recursive: true, force: true });

    console.error('[crew] Plan initialized successfully (transactional commit)');
  } catch (error) {
    // Rollback: delete temp directory if it exists
    if (existsSync(tempCrewRoot)) {
      try {
        rmSync(tempCrewRoot, { recursive: true, force: true });
        console.error('[crew] Plan initialization failed - rolled back changes');
      } catch (cleanupError) {
        console.error('[crew] Warning: failed to clean up temp directory:', tempCrewRoot);
      }
    }

    // Re-throw the original error
    throw error;
  }
}

/**
 * Reset plan (delete all epics)
 */
export async function resetPlan(projectDir: string): Promise<void> {
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  const store = new HierarchicalStore(projectDir);

  if (!planExists(store)) {
    throw new Error('No plan to reset');
  }

  const planDir = join(projectDir, '.crew', 'epics');
  if (existsSync(planDir)) {
    rmSync(planDir, { recursive: true, force: true });
  }
}

/**
 * Load hierarchical store
 */
export async function loadStore(projectDir: string): Promise<HierarchicalStore> {
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  return new HierarchicalStore(projectDir);
}
