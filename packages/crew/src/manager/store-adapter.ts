/**
 * Manager Store Adapter
 * 
 * Adapter layer that makes the hierarchical store work with the existing manager API.
 * Uses HierarchicalStore as the source of truth.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  Task,
  TaskId,
  Epic,
  EpicId,
  AgentId,
} from '../store/types.ts';
import { HierarchicalStore } from '../store/hierarchical-store.ts';
import type { BuildContext } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Store Instance Management                                         */
/* ------------------------------------------------------------------ */

const storeCache = new Map<string, HierarchicalStore>();

export function getStore(appDir: string): HierarchicalStore {
  const key = resolve(appDir);
  
  if (!storeCache.has(key)) {
    storeCache.set(key, new HierarchicalStore(appDir));
  }
  
  return storeCache.get(key)!;
}

export function clearStoreCache(): void {
  storeCache.clear();
}

/* ------------------------------------------------------------------ */
/*  Legacy API Adapters (store is source of truth)                    */
/* ------------------------------------------------------------------ */

export interface LegacyTask {
  id: string;  // m1.2 format
  task: string;
  status: 'pending' | 'active' | 'done' | 'blocked' | 'failed' | 'cancelled' | 'awaiting_review';
  assignee: string;
  deps: string[];
  input: string;
  output: string;
  executorFile?: string;  // NEW: External executor file reference
  epicNum: number;
}

export interface LegacyEpic {
  num: number;
  title: string;
  tasks: LegacyTask[];
  complete: boolean;
  current: boolean;
}

export interface LegacyStatus {
  project: string;
  progress: { done: number; total: number; pct: number };
  epics: LegacyEpic[];
  next?: { id: string; task: string; input: string; output: string };
}

/* ------------------------------------------------------------------ */
/*  ID Conversion                                                     */
/* ------------------------------------------------------------------ */

/** Convert task to legacy display ID (m1.2) */
export function toDisplayId(task: Task, epic: Epic): string {
  const index = epic.task_ids.indexOf(task.id);
  if (index === -1) return task.id;
  return `m${epic.number}.${index + 1}`;
}

/** Parse legacy ID (m1.2) to find task */
export function fromDisplayId(displayId: string, store: HierarchicalStore): Task | null {
  const match = displayId.match(/^[Mm]?(\d+)[\.-](\d+)$/);
  if (!match) {
    // Try as UUID
    if (displayId.startsWith('task_')) {
      return store.getTask(displayId as TaskId);
    }
    return null;
  }
  
  const epicNum = parseInt(match[1], 10);
  const taskIndex = parseInt(match[2], 10) - 1;
  
  const epic = store.getEpicByNumber(epicNum);
  if (!epic || taskIndex < 0 || taskIndex >= epic.task_ids.length) {
    return null;
  }
  
  return store.getTask(epic.task_ids[taskIndex]);
}

/** Get all tasks across all epics */
function listAllTasks(store: HierarchicalStore): Task[] {
  const tasks: Task[] = [];
  for (const ms of store.listEpics()) {
    tasks.push(...store.listTasksForEpic(ms));
  }
  return tasks;
}

/** Get next ready tasks.
 * Epic locking: If any epic has failed tasks, block it and all subsequent epics.
 */
function getNextTasks(store: HierarchicalStore, limit = 10): Task[] {
  const ready: Task[] = [];

  for (const epic of store.listEpics()) {
    // Check epic gates - if any required gate is incomplete, BLOCK this and all subsequent epics
    const requiredGate = epic.gates?.find(g => g.required && !g.completed);
    if (requiredGate) {
      break;
    }

    const epicTasks = store.listTasksForEpic(epic);

    // Epic locking: if this epic has any failed tasks, block progression
    const hasFailed = epicTasks.some(t => t.status === 'failed');
    if (hasFailed) {
      break;
    }

    for (const task of epicTasks) {
      if (task.status === 'pending' && depsMet(task, store)) {
        ready.push(task);
        if (ready.length >= limit) break;
      }
    }
    if (ready.length >= limit) break;
  }

  return ready;
}

/** Check if task dependencies are met */
function depsMet(task: Task, store: HierarchicalStore): boolean {
  if (!task.dependencies.length) return true;
  
  for (const depId of task.dependencies) {
    const dep = store.getTask(depId);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Status & Query Adapters                                           */
/* ------------------------------------------------------------------ */

export function getStatus(store: HierarchicalStore): LegacyStatus {
  // Read project name from project.json
  let projectName = 'Unknown';
  try {
    const projectPath = join(store.rootDir, '.crew', 'project.json');
    if (existsSync(projectPath)) {
      const project = JSON.parse(readFileSync(projectPath, 'utf-8'));
      projectName = project.name || 'Unknown';
    }
  } catch {
    // Ignore
  }
  
  const epics = store.listEpics();
  const tasks = listAllTasks(store);
  
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  
  const legacyEpics: LegacyEpic[] = epics.map(ms => {
    const msTasks = store.listTasksForEpic(ms);
    const msDone = msTasks.filter(t => t.status === 'done').length;
    
    return {
      num: ms.number,
      title: ms.title,
      tasks: msTasks.map(t => toLegacyTask(t, ms, store)),
      complete: msTasks.length > 0 && msTasks.every(t => t.status === 'done'),
      current: ms.status === 'active',
    };
  });
  
  // Find next task
  const nextTasks = getNextTasks(store, 1);
  let next: LegacyStatus['next'];
  
  if (nextTasks.length > 0) {
    const t = nextTasks[0];
    const ms = epics.find(m => m.id === t.epic_id);
    if (ms) {
      next = {
        id: toDisplayId(t, ms),
        task: t.title,
        input: t.input?.description || '—',
        output: t.output?.description || '—',
      };
    }
  }
  
  return {
    project: projectName,
    progress: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    epics: legacyEpics,
    next,
  };
}

export function toLegacyTask(task: Task, epic: Epic, store: HierarchicalStore): LegacyTask {
  const epics = store.listEpics();

  return {
    id: toDisplayId(task, epic),
    task: task.title,
    status: task.status,
    assignee: task.assignee ? task.assignee.replace(/^agent_/, '') : '—',
    deps: task.dependencies?.map(depId => {
      const dep = store.getTask(depId);
      if (!dep) return depId;
      const depMs = epics.find(m => m.id === dep.epic_id);
      return depMs ? toDisplayId(dep, depMs) : depId;
    }) || [],
    input: task.input?.description || '—',
    output: task.output?.description || '—',
    executorFile: task.executorFile,  // NEW: Include executor file reference
    epicNum: epic.number,
  };
}

/* ------------------------------------------------------------------ */
/*  Command Implementations                                           */
/* ------------------------------------------------------------------ */

export async function cmdStatus(ctx: BuildContext): Promise<LegacyStatus> {
  const store = getStore(ctx.appDir);
  return getStatus(store);
}

export async function cmdNext(ctx: BuildContext): Promise<{
  gates: string[];
  next: LegacyTask | null;
  queue: LegacyTask[];
}> {
  const store = getStore(ctx.appDir);
  const epics = store.listEpics();
  const nextTasks = getNextTasks(store, 10);
  
  const toLegacy = (t: Task): LegacyTask => {
    const ms = epics.find(m => m.id === t.epic_id)!;
    return toLegacyTask(t, ms, store);
  };
  
  return {
    gates: [],
    next: nextTasks.length > 0 ? toLegacy(nextTasks[0]) : null,
    queue: nextTasks.map(toLegacy),
  };
}

export async function cmdDone(ctx: BuildContext, taskId: string): Promise<void> {
  const store = getStore(ctx.appDir);
  
  const task = fromDisplayId(taskId, store);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  store.updateTaskStatus(task, 'done', 'system');
}

export async function cmdEdit(ctx: BuildContext, taskId: string, status: Task['status']): Promise<void> {
  const store = getStore(ctx.appDir);
  
  const task = fromDisplayId(taskId, store);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  store.updateTaskStatus(task, status, 'system');
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

export async function initStore(ctx: BuildContext, name?: string, epicCount = 3): Promise<void> {
  const store = getStore(ctx.appDir);
  
  // Check if already initialized (has epics)
  if (store.listEpics().length > 0) {
    return;
  }
  
  // Initialize project.json
  const projectPath = join(ctx.appDir, '.crew', 'project.json');
  const project = {
    version: 1,
    name: name || 'Project',
    description: `Build ${name || 'Project'}`,
    goal: `Build ${name || 'Project'}`,
    workflow: [
      { name: 'plan', description: 'Plan epic tasks' },
      { name: 'execute', description: 'Execute tasks in priority order' },
      { name: 'verify', description: 'Verify epic completion' },
    ],
    epics: [] as string[],
    agents: [],
    skills: [],
    current: undefined as { epic: string } | undefined,
    config: {
      sync_to_claude: true,
      require_reviews: true,
      parallel_limit: 3,
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  
  writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf-8');
}
