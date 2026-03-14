/**
 * Manager - Simplified interface over hierarchical store
 *
 * This module provides a thin compatibility layer for existing code
 * that expects manager functions. All operations delegate to the
 * hierarchical store.
 */

import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import type { HierarchicalStore } from '../store/hierarchical-store.ts';
import type { Epic, Task } from '../store/types.ts';
import type { BuildContext, CompoundStatus, CompoundTask, CompoundEpic } from '../types.ts';
import { numberedSlug } from '../store/slug-utils.ts';

export type { BuildContext, CompoundStatus, CompoundTask, CompoundEpic };

/* ------------------------------------------------------------------ */
/*  Store Management                                                  */
/* ------------------------------------------------------------------ */

async function getStore(appDir: string, planDir?: string): Promise<HierarchicalStore> {
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  return new HierarchicalStore(appDir, {}, planDir);
}

/* ------------------------------------------------------------------ */
/*  Build Context                                                     */
/* ------------------------------------------------------------------ */

export function createBuildContext(appDir: string): BuildContext {
  return {
    appDir: resolve(appDir),
  };
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */

function generateUlid(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const rand = Math.random().toString(36).slice(2, 14);
  return `${time}${rand}`;
}


/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export async function createEpic(ctx: BuildContext, num: number, title: string): Promise<void> {
  const store = await getStore(ctx.appDir, ctx.planDir);

  // Check if epic already exists
  const existing = store.getEpicByNumber(num);
  if (existing) {
    return; // Already exists
  }

  const id = `epic_${generateUlid()}`;
  const now = new Date().toISOString();

  const ms: Epic = {
    id: id as import('../store/types.ts').EpicId,
    version: 1,
    number: num,
    title,
    status: num === 0 ? 'active' : 'planned',
    task_ids: [],
    gates: [{
      type: 'plan',
      required: true,
      completed: true,  // Auto-complete plan gate when epic is created via crew plan init
      message: `M${num} planning complete`,
    }],
    // Default epic constraints (sequential execution, auto-resolve empty)
    constraints: {
      sequential: true,    // Wait for previous epic to complete
      autoResolve: true,   // Auto-complete if no tasks
    },
    created: { at: now, by: 'agent_system' as import('../store/types.ts').AgentId },
    updated: { at: now, by: 'agent_system' as import('../store/types.ts').AgentId },
  };

  // Create epic directory with README
  // This delegates to Store layer which handles all file generation
  const readme = `# ${title}\n\nEpic ${num}: ${title}\n\nStatus: ${num === 0 ? 'Active' : 'Planned'}\n`;
  store.createEpicDir(ms, readme);

  // Update project.json
  const projectPath = join(ctx.appDir, '.crew', 'project.json');
  if (existsSync(projectPath)) {
    const project = JSON.parse(readFileSync(projectPath, 'utf-8'));
    if (!project.epics.includes(id)) {
      project.epics.push(id);
      project.updated = now;
      writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf-8');
    }
  }
}

export async function addTask(
  ctx: BuildContext,
  title: string,
  opts: {
    epic: number;
    type?: string;
    input?: string;
    output?: string;
    deps?: string[];
    prompt?: string;
    executorFile?: string;
    vars?: Record<string, unknown>; // Variables for executor/prompt templating
    planId?: string; // Optional plan-level ID for dependency resolution
    skills?: string[]; // Skill names to inject into the prompt (from .crew/skills/)
    yields?: import('../tasks/types.ts').YieldsDeclarative; // Yields config for incremental planning
    checks?: import('../store/fs/types.ts').TaskYamlCheck[]; // Serializable checks
    maxAttempts?: number; // Max check→feedback→retry attempts
  }
): Promise<string> {
  const store = await getStore(ctx.appDir, ctx.planDir);

  const epic = store.getEpicByNumber(opts.epic);
  if (!epic) {
    throw new Error(`Epic M${opts.epic} not found`);
  }

  // Convert deps (m1.2) to task IDs
  const depIds = opts.deps?.map(d => {
    if (d.match(/^m\d+\.\d+$/)) {
      const task = store.getTaskByDisplayId(d);
      return task?.id;
    }
    return d;
  }).filter(Boolean) as string[] || [];

  const now = new Date().toISOString();
  const id = `task_${generateUlid()}`;

  const task: Task = {
    id: id as import('../store/types.ts').TaskId,
    version: 1,
    title,
    type: opts.type,
    status: 'pending', // Always start as pending; dependencies are checked when selecting next task
    epic_id: epic.id,
    assignee: undefined,
    input: opts.input ? { description: opts.input } : undefined,
    output: opts.output ? { description: opts.output } : undefined,
    executorFile: opts.executorFile,
    skills: opts.skills,
    vars: opts.vars,
    checks: opts.checks,
    maxAttempts: opts.maxAttempts,
    yields: opts.yields,
    dependencies: depIds as import('../store/types.ts').TaskId[],
    dependents: [],
    attempts: [],
    status_history: [{
      from: 'pending',
      to: 'pending',
      at: now,
      by: 'agent_system' as import('../store/types.ts').AgentId,
    }],
    created: { at: now, by: 'agent_system' as import('../store/types.ts').AgentId },
    updated: { at: now, by: 'agent_system' as import('../store/types.ts').AgentId },
  };

  // Add task to epic
  epic.task_ids.push(id as import('../store/types.ts').TaskId);
  epic.updated = { at: now, by: 'agent_system' as import('../store/types.ts').AgentId };
  store.saveEpic(epic);

  // Create task directory with all files (task.json, PROMPT.md, README.md)
  // This delegates to Store layer which handles all file generation
  store.createTaskDir(task, epic, opts.prompt);

  // Update dependents
  for (const depId of depIds) {
    const dep = store.getTask(depId as import('../store/types.ts').TaskId);
    if (dep && !dep.dependents.includes(id as import('../store/types.ts').TaskId)) {
      dep.dependents.push(id as import('../store/types.ts').TaskId);
      dep.updated = { at: now, by: 'agent_system' as import('../store/types.ts').AgentId };

      // Use Store layer to save task
      const location = store.getTaskLocation(depId as import('../store/types.ts').TaskId);
      if (location) {
        store.saveTask(dep, location.epic);
      }
    }
  }

  // Return display ID
  const index = epic.task_ids.indexOf(task.id);
  return `m${epic.number}.${index + 1}`;
}

export async function editTask(
  ctx: BuildContext,
  taskId: string,
  status: Task['status']
): Promise<void> {
  const store = await getStore(ctx.appDir, ctx.planDir);

  // Parse display ID or use task ID directly
  let task: Task | null = null;

  if (taskId.match(/^m\d+\.\d+$/)) {
    const [, msNum, taskNum] = taskId.match(/^m(\d+)\.(\d+)$/) || [];
    const epic = store.getEpicByNumber(parseInt(msNum, 10));
    if (epic && epic.task_ids[parseInt(taskNum, 10) - 1]) {
      task = store.getTask(epic.task_ids[parseInt(taskNum, 10) - 1]);
    }
  } else {
    task = store.getTask(taskId as import('../store/types.ts').TaskId);
  }

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const location = store.getTaskLocation(task.id);
  if (!location) {
    throw new Error(`Task location not found for: ${taskId}`);
  }

  store.updateTaskStatus(task, status, 'system');
}

export async function statusJson(ctx: BuildContext): Promise<CompoundStatus> {
  const store = await getStore(ctx.appDir, ctx.planDir);
  const project = store.getProject();
  const epics = store.listEpics();

  return {
    name: project?.name || 'Project',
    epics: epics.map(ms => ({
      id: ms.number,
      title: ms.title,
      tasks: store.listTasksForEpic(ms).map((t, idx) => ({
        id: `m${ms.number}.${idx + 1}`,
        title: t.title,
        status: t.status as CompoundTask['status'],
        type: t.type,
        assignee: t.assignee,
        skills: t.skills,
        input: t.input?.description,
        output: t.output?.description,
        deps: t.dependencies,
        prompt: t.prompt,
        executorFile: t.executorFile,
        epicNum: ms.number,
        yields: t.yields,
        checks: t.checks,
        maxAttempts: t.maxAttempts,
      } as CompoundTask)),
      complete: store.listTasksForEpic(ms).every(t => t.status === 'done'),
    })),
  };
}

export async function nextTasks(ctx: BuildContext): Promise<{
  gates: string[];
  next: CompoundTask[];
  queue: CompoundTask[];
  blockedByFailure?: { epicNum: number; epicTitle: string; failedTasks: string[] };
}> {
  const store = await getStore(ctx.appDir, ctx.planDir);
  const ready = store.getNextReady(10);

  // Check for epic locking: scan epics for failed tasks that block progression
  let blockedByFailure: { epicNum: number; epicTitle: string; failedTasks: string[] } | undefined;
  if (ready.length === 0) {
    const epics = store.listEpics();
    for (const epic of epics) {
      const epicTasks = store.listTasksForEpic(epic);
      const failedTasks = epicTasks.filter(t => t.status === 'failed');
      if (failedTasks.length > 0) {
        blockedByFailure = {
          epicNum: epic.number,
          epicTitle: epic.title,
          failedTasks: failedTasks.map(t => {
            const idx = epic.task_ids.indexOf(t.id);
            return `m${epic.number}.${idx + 1}`;
          }),
        };
        break;
      }
    }
  }

  const toCompound = (t: typeof ready[0]): CompoundTask => {
    const location = store.getTaskLocation(t.id);
    const displayId = location ? `m${location.epic.number}.${location.epic.task_ids.indexOf(t.id) + 1}` : t.id;
    return {
      id: displayId,
      title: t.title,
      status: t.status as CompoundTask['status'],
      type: t.type,
      assignee: t.assignee,
      skills: t.skills,
      input: t.input?.description,
      output: t.output?.description,
      deps: t.dependencies,
      prompt: t.prompt,
      executorFile: t.executorFile,
      epicNum: location?.epic.number,
      yields: t.yields,
      checks: t.checks,
      maxAttempts: t.maxAttempts,
    };
  };

  return {
    gates: [],
    next: ready.slice(0, 1).map(toCompound),
    queue: ready.slice(1).map(toCompound),
    blockedByFailure,
  };
}
