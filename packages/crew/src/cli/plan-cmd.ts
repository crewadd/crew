/**
 * Plan CLI commands - handles user interaction for plan operations
 */

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createBuildContext, addTask } from '../manager/index.ts';
import { loadConfig } from '../config-loader.ts';
import {
  loadStore,
  planExists,
  getPlanSummary,
  initializePlan,
  resetPlan,
} from '../planner/index.ts';
import type { Task } from '../store/types.ts';

function validateProjectDir(projectDir: string): string {
  const absDir = resolve(projectDir);
  if (!existsSync(absDir)) {
    console.error(`Error: project directory not found: ${absDir}`);
    process.exit(1);
  }
  return absDir;
}

/**
 * View existing plan summary
 */
export async function runPlanView(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  if (!planExists(store)) {
    console.error(`[crew] No plan found in ${absDir}`);
    console.error(`[crew] Run \`crew plan init\` to create a plan`);
    process.exit(1);
  }

  const summary = getPlanSummary(store, { maxTasksPerEpic: 5 });

  console.error('');
  console.error('═'.repeat(70));
  console.error('PLAN SUMMARY');
  console.error('═'.repeat(70));
  console.error('');
  console.error(`Project: ${summary.project.name}`);
  console.error(`Goal: ${summary.project.goal}`);
  console.error('');
  console.error(`Epics: ${summary.stats.epics}`);
  console.error(`Total Tasks: ${summary.stats.tasks}`);
  console.error('');
  console.error('─'.repeat(70));
  console.error('');

  // Display each epic with its tasks
  for (const epic of summary.epics) {
    console.error(`M${epic.number}: ${epic.title}`);
    console.error(`     Status: ${epic.status} | Tasks: ${epic.totalTasks} (${epic.doneTasks} done)`);

    if (epic.tasks.length > 0) {
      console.error('');
      epic.tasks.forEach(task => {
        const statusIcon = task.status === 'done' ? '✓' :
                          task.status === 'active' ? '▶' :
                          task.status === 'blocked' ? '⊗' :
                          task.status === 'failed' ? '✗' : '○';
        console.error(`     ${statusIcon} ${task.displayId.padEnd(6)} ${task.title}`);
      });

      const remainingCount = epic.totalTasks - epic.tasks.length;
      if (remainingCount > 0) {
        console.error(`     ... and ${remainingCount} task${remainingCount === 1 ? '' : 's'} more`);
      }
      console.error('');
    }
    console.error('─'.repeat(70));
    console.error('');
  }

  console.error('Commands:');
  console.error(`  • View full plan: \`cat .crew/epics/README.md\` or open in your editor`);
  console.error(`  • Reset plan: \`crew plan reset\``);
  console.error(`  • View status: \`crew status\``);
  console.error(`  • Start execution: \`crew execute\``);
  console.error('');
}

/**
 * Initialize/regenerate plan from config
 */
export async function runPlanInit(projectDir: string, force = false, dryRun = false): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const ctx = createBuildContext(absDir);
  const store = await loadStore(absDir);

  // Check if plan already exists
  if (planExists(store) && !force) {
    console.error(`[crew] Plan already exists in ${absDir}`);
    console.error(`[crew] Use \`crew plan reset\` to reset and regenerate`);
    console.error(`[crew] Or use \`crew plan\` to view the current plan`);
    process.exit(1);
  }

  // Load config file
  const loaded = await loadConfig(absDir);
  if (!loaded) {
    console.error(`[crew] Error: No crew.json found in ${absDir}`);
    console.error(`[crew] Run \`crew init\` to create a sample config.`);
    process.exit(1);
  }

  console.error(`[crew] Using config: ${loaded.path}`);
  console.error(`[crew] Project: ${loaded.config.name || 'Unnamed'}`);

  if (dryRun) {
    console.error(`[crew] Dry run mode: validating configuration without writing files...`);
  } else {
    console.error(`[crew] ${force ? 'Regenerating' : 'Initializing'} plan...`);
  }

  // Initialize plan
  await initializePlan(ctx, loaded.config, { force, dryRun });

  if (dryRun) {
    console.error('');
    console.error('═'.repeat(70));
    console.error('DRY RUN COMPLETE');
    console.error('═'.repeat(70));
    console.error('');
    console.error('✓ Configuration is valid');
    console.error('');
    console.error('To create the plan for real, run:');
    console.error(`  crew plan init`);
    console.error('');
    return;
  }

  // Load summary
  const newStore = await loadStore(absDir);
  const summary = getPlanSummary(newStore, { maxTasksPerEpic: 5 });

  console.error('');
  console.error('═'.repeat(70));
  console.error('PLAN CREATED');
  console.error('═'.repeat(70));
  console.error('');
  console.error(`Project: ${summary.project.name}`);
  console.error(`Goal: ${summary.project.goal}`);
  console.error('');
  console.error(`Epics: ${summary.stats.epics}`);
  console.error(`Total Tasks: ${summary.stats.tasks}`);
  console.error('');
  console.error('─'.repeat(70));
  console.error('');

  // Display each epic with its tasks
  for (const epic of summary.epics) {
    console.error(`M${epic.number}: ${epic.title}`);
    console.error(`     Status: ${epic.status} | Tasks: ${epic.totalTasks} (${epic.doneTasks} done)`);

    if (epic.tasks.length > 0) {
      console.error('');
      epic.tasks.forEach(task => {
        const statusIcon = task.status === 'done' ? '✓' :
                          task.status === 'active' ? '▶' :
                          task.status === 'blocked' ? '⊗' :
                          task.status === 'failed' ? '✗' : '○';
        console.error(`     ${statusIcon} ${task.displayId.padEnd(6)} ${task.title}`);
      });

      const remainingCount = epic.totalTasks - epic.tasks.length;
      if (remainingCount > 0) {
        console.error(`     ... and ${remainingCount} task${remainingCount === 1 ? '' : 's'} more`);
      }
      console.error('');
    }
    console.error('─'.repeat(70));
    console.error('');
  }

  console.error('Next Steps:');
  console.error(`  • View comprehensive plan: \`cat .crew/epics/README.md\` or open in your editor`);
  console.error(`  • View plan summary: \`crew plan\``);
  console.error(`  • View current status: \`crew status\``);
  console.error(`  • Start execution: \`crew execute\``);
  console.error(`  • View task details: \`crew task <id>\` (e.g., \`crew task m1.1\`)`);
  console.error('');
  console.error(`✓ Generated: .crew/epics/README.md (comprehensive plan with links to all epics and tasks)`);
  console.error('');
}

/**
 * Reset plan (remove and reinitialize)
 */
export async function runPlanReset(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  if (!planExists(store)) {
    console.error(`[crew] No plan to reset in ${absDir}`);
    console.error(`[crew] Run \`crew plan init\` to create a plan`);
    process.exit(1);
  }

  console.error(`[crew] Resetting plan in ${absDir}...`);
  await resetPlan(absDir);
  console.error(`[crew] Plan cleared`);
  console.error(`[crew] Run \`crew plan init\` to create a new plan`);
  console.error('');
}

/**
 * Yields task definition schema
 */
interface YieldsTaskDef {
  id: string;
  title: string;
  inputs?: string[];
  outputs?: string[];
  checks?: string[];
  prompt?: string;
  deps?: string[];
  skill?: string;
  type?: string;
  vars?: Record<string, unknown>;
}

/**
 * Validate yields.json task definitions
 */
function validateYieldsTasks(tasks: any[]): asserts tasks is YieldsTaskDef[] {
  const seenIds = new Set<string>();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    if (!task.id || typeof task.id !== 'string') {
      console.error(`[crew] Error: Task at index ${i} missing or invalid 'id' field`);
      process.exit(1);
    }

    if (seenIds.has(task.id)) {
      console.error(`[crew] Error: Duplicate task ID: ${task.id}`);
      process.exit(1);
    }
    seenIds.add(task.id);

    if (!task.title || typeof task.title !== 'string') {
      console.error(`[crew] Error: Task "${task.id}" missing or invalid 'title' field`);
      process.exit(1);
    }
  }

  // Validate dependency references
  for (const task of tasks) {
    if (task.deps && Array.isArray(task.deps)) {
      for (const depId of task.deps) {
        if (!seenIds.has(depId)) {
          console.error(`[crew] Error: Task "${task.id}" depends on unknown task "${depId}"`);
          process.exit(1);
        }
      }
    }
  }
}

/**
 * Import tasks from a yields.json file
 */
export async function runPlanYields(
  projectDir: string,
  yieldsPath: string,
  flags: Record<string, string | boolean>
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const absYieldsPath = resolve(yieldsPath);

  // 1. Validate file exists
  if (!existsSync(absYieldsPath)) {
    console.error(`[crew] Error: File not found: ${absYieldsPath}`);
    process.exit(1);
  }

  // 2. Read and parse JSON
  let yieldsTasks: YieldsTaskDef[];
  try {
    const content = readFileSync(absYieldsPath, 'utf8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      console.error('[crew] Error: yields.json must be an array');
      process.exit(1);
    }

    yieldsTasks = parsed;
  } catch (error) {
    console.error('[crew] Error: Invalid JSON in yields.json');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // 3. Validate task definitions
  validateYieldsTasks(yieldsTasks);

  if (yieldsTasks.length === 0) {
    console.error('[crew] Warning: No tasks found in yields.json');
    return;
  }

  // 4. Auto-detect epic from path (e.g., .crew/epics/02-page-homepage/...)
  const epicMatch = absYieldsPath.match(/epics\/(\d+)-/);
  const epicNum = epicMatch ? parseInt(epicMatch[1], 10) : null;

  if (!epicNum) {
    console.error('[crew] Error: Cannot determine epic from path');
    console.error(`[crew] Path: ${absYieldsPath}`);
    console.error('[crew] Expected format: .crew/epics/NN-name/tasks/.../yields.json');
    process.exit(1);
  }

  // 5. Load store and validate epic exists
  const store = await loadStore(absDir);
  const epic = store.getEpicByNumber(epicNum);

  if (!epic) {
    console.error(`[crew] Error: Epic ${epicNum} not found`);
    process.exit(1);
  }

  const ctx = createBuildContext(absDir);

  // 6. Find parent task from yields.json path
  // Path format: .crew/epics/02-page-homepage/tasks/01-analyze-animations/yields.json
  const taskMatch = absYieldsPath.match(/tasks\/(\d+[a-z]?-[^/]+)\//);
  const parentTaskDir = taskMatch ? taskMatch[1] : null;

  if (!parentTaskDir) {
    console.error('[crew] Error: Cannot determine parent task from path');
    console.error(`[crew] Path: ${absYieldsPath}`);
    console.error('[crew] Expected format: .crew/epics/NN-name/tasks/NN-taskname/yields.json');
    process.exit(1);
  }

  console.error(`[crew] Importing ${yieldsTasks.length} tasks from yields.json...`);
  console.error(`[crew] Target: Epic ${epicNum} (${epic.title})`);
  console.error(`[crew] Insert after: ${parentTaskDir}`);
  console.error('');

  // 7. Create tasks with letter suffixes to insert after parent
  // Parent is 01, so we create 01a, 01b, 01c, 01d
  // Then renumber will fix everything to 01, 02, 03, 04, 05...
  const { parsePrefix, renumber } = await import('../store/fs/ordering.ts');
  const { join } = await import('node:path');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { slugify } = await import('../store/slug-utils.ts');
  const { writeYaml } = await import('../store/fs/yaml-io.ts');

  const parentPrefix = parsePrefix(parentTaskDir);
  const epicSlug = store.listEpicDirs().find(dir => {
    const dirEpic = store.getEpicByDir(dir);
    return dirEpic?.number === epicNum;
  });

  if (!epicSlug) {
    console.error(`[crew] Error: Epic directory not found for epic ${epicNum}`);
    process.exit(1);
  }

  const epicDir = join(absDir, '.crew', 'epics', epicSlug);
  const tasksDir = join(epicDir, 'tasks');

  // Create task directories with letter suffixes
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const createdDirs: string[] = [];

  for (let i = 0; i < yieldsTasks.length; i++) {
    const taskDef = yieldsTasks[i];
    const suffix = letters[i];
    const slug = `${parentPrefix.num.toString().padStart(2, '0')}${suffix}-${slugify(taskDef.title) || 'untitled'}`;
    const taskDir = join(tasksDir, slug);

    try {
      mkdirSync(taskDir, { recursive: true });
      mkdirSync(join(taskDir, 'events'), { recursive: true });

      // Write task.yaml
      const yaml: any = { title: taskDef.title };
      if (taskDef.type) yaml.type = taskDef.type;
      if (taskDef.skill) yaml.skills = [taskDef.skill];
      if (taskDef.inputs && taskDef.inputs.length > 0) {
        yaml.input = { description: taskDef.inputs.join('\n') };
      }
      if (taskDef.outputs && taskDef.outputs.length > 0) {
        yaml.output = { description: taskDef.outputs.join('\n') };
      }
      if (taskDef.vars) yaml.vars = taskDef.vars;

      writeYaml(join(taskDir, 'task.yaml'), yaml);

      // Write PROMPT.md if provided
      if (taskDef.prompt) {
        writeFileSync(join(taskDir, 'PROMPT.md'), taskDef.prompt, 'utf-8');
      }

      // Write status file (pending)
      writeFileSync(join(taskDir, 'status'), 'pending\n', 'utf-8');

      createdDirs.push(slug);
      console.error(`  ✓ Created ${slug}: ${taskDef.title}`);
    } catch (error) {
      console.error(`  ✗ Failed to create task "${taskDef.title}"`);
      console.error(`    Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // 8. Renumber to fix sequential ordering
  console.error('');
  console.error('[crew] Renumbering tasks...');
  renumber(tasksDir);

  // 9. Reload store to get updated display IDs
  const reloadedStore = await loadStore(absDir);
  const reloadedEpic = reloadedStore.getEpicByNumber(epicNum);
  if (!reloadedEpic) {
    console.error(`[crew] Error: Epic ${epicNum} not found after reload`);
    process.exit(1);
  }

  // Build ID map with new display IDs
  const idMap = new Map<string, string>(); // local-id → display-id (m2.3)
  const createdTasks: { displayId: string; title: string; localId: string }[] = [];

  // Find the newly created tasks by matching titles
  const allTasks = reloadedStore.listTasksForEpic(reloadedEpic);
  for (const taskDef of yieldsTasks) {
    const task = allTasks.find(t => t.title === taskDef.title);
    if (task) {
      const location = reloadedStore.getTaskLocation(task.id);
      if (location) {
        const idx = reloadedEpic.task_ids.indexOf(task.id);
        const displayId = `m${epicNum}.${idx + 1}`;
        idMap.set(taskDef.id, displayId);
        createdTasks.push({
          displayId,
          title: task.title,
          localId: taskDef.id,
        });
      }
    }
  }

  // 10. Resolve dependencies (second pass)
  if (yieldsTasks.some(t => t.deps && t.deps.length > 0)) {
    console.error('');
    console.error('[crew] Resolving dependencies...');

    for (const taskDef of yieldsTasks) {
      if (taskDef.deps && taskDef.deps.length > 0) {
        const displayId = idMap.get(taskDef.id);
        if (!displayId) continue;

        const resolvedDeps: string[] = [];
        for (const localDepId of taskDef.deps) {
          const depDisplayId = idMap.get(localDepId);
          if (depDisplayId) {
            resolvedDeps.push(depDisplayId);
          } else {
            console.error(`  ⚠ Warning: Task "${taskDef.id}" depends on unknown task "${localDepId}"`);
          }
        }

        if (resolvedDeps.length > 0) {
          try {
            await updateTaskDependencies(ctx, displayId, resolvedDeps, reloadedStore);
            console.error(`  ✓ ${displayId} → ${resolvedDeps.join(', ')}`);
          } catch (error) {
            console.error(`  ✗ Failed to update dependencies for ${displayId}`);
            console.error(`    Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }

  console.error('');
  console.error(`[crew] ✓ Successfully imported ${createdTasks.length} tasks`);
  console.error(`[crew] Run 'crew status' to view updated plan`);
}

/**
 * Update task dependencies after creation
 */
async function updateTaskDependencies(
  ctx: { appDir: string; planDir?: string },
  taskDisplayId: string,
  depDisplayIds: string[],
  store?: import('../store/hierarchical-store.ts').HierarchicalStore
): Promise<void> {
  const { writeDeps } = await import('../store/fs/deps-io.ts');
  const { relative } = await import('node:path');

  // Use provided store or create new one
  if (!store) {
    const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
    store = new HierarchicalStore(ctx.appDir, {}, ctx.planDir);
  }

  const task = store.getTaskByDisplayId(taskDisplayId);
  if (!task) {
    throw new Error(`Task ${taskDisplayId} not found`);
  }

  // Get task location
  const location = store.getTaskLocation(task.id);
  if (!location) {
    throw new Error(`Task location not found for ${taskDisplayId}`);
  }

  // Build list of relative paths to dependency tasks
  const relativePaths: string[] = [];
  for (const displayId of depDisplayIds) {
    const depTask = store.getTaskByDisplayId(displayId);
    if (!depTask) continue;

    const depLocation = store.getTaskLocation(depTask.id);
    if (!depLocation) continue;

    // Calculate relative path from current task to dependency task
    // Task dirs are at .crew/epics/<epic>/tasks/<task>
    const taskDir = location.taskDir;
    const depTaskDir = depLocation.taskDir;

    const relPath = relative(taskDir, depTaskDir);
    relativePaths.push(relPath);
  }

  if (relativePaths.length === 0) {
    return;
  }

  // Write deps file
  writeDeps(location.taskDir, relativePaths);

  // Update in-memory task objects
  const depIds: string[] = [];
  for (const displayId of depDisplayIds) {
    const depTask = store.getTaskByDisplayId(displayId);
    if (depTask) {
      depIds.push(depTask.id);
    }
  }

  task.dependencies = depIds as import('../store/types.ts').TaskId[];
  task.updated = {
    at: new Date().toISOString(),
    by: 'agent_system' as import('../store/types.ts').AgentId,
  };

  // Update dependents on referenced tasks
  for (const depId of depIds) {
    const depTask = store.getTask(depId as import('../store/types.ts').TaskId);
    if (depTask && !depTask.dependents.includes(task.id)) {
      depTask.dependents.push(task.id);
      depTask.updated = task.updated;
    }
  }
}

/**
 * Main plan command router
 */
export async function handlePlanCommand(
  projectDir: string,
  subcommand?: string,
  subcommandArgs?: string[],
  flags?: Record<string, string | boolean>
): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  // Check for --yields flag (takes precedence over subcommands)
  if (flags?.yields && typeof flags.yields === 'string') {
    await runPlanYields(absDir, flags.yields, flags);
    return;
  }

  const store = await loadStore(absDir);
  const hasPlan = planExists(store);

  // Handle subcommands
  if (subcommand) {
    switch (subcommand) {
      case 'init': {
        const dryRun = flags?.['dry-run'] === true || flags?.dry === true;
        await runPlanInit(absDir, false, dryRun);
        break;
      }
      case 'reset':
        await runPlanReset(absDir);
        break;
      default:
        console.error(`[crew] Unknown plan subcommand: ${subcommand}`);
        console.error(`[crew] Available subcommands: init, reset`);
        process.exit(1);
    }
    return;
  }

  // Default behavior: view if exists, otherwise prompt to init
  if (hasPlan) {
    await runPlanView(absDir);
  } else {
    console.error(`[crew] No plan found in ${absDir}`);
    console.error(`[crew] Run \`crew plan init\` to create a plan`);
    console.error('');
    console.error(`Hint: Make sure you have a crew.json file with setup reference`);
    process.exit(1);
  }
}
