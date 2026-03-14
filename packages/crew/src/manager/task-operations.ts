/**
 * Task operations - Enhanced task management functions
 *
 * This module extends the base manager with richer task operations
 * for CLI and API usage, building on the store-adapter layer.
 */

import type { HierarchicalStore } from '../store/hierarchical-store.ts';
import type { Task, TaskId, Epic } from '../store/types.ts';
import { addTask } from './index.ts';

export interface TaskDetails {
  task: Task;
  epic: {
    number: number;
    title: string;
  };
  displayId: string;
  location: {
    path: string;
    dir: string;
  };
}

export interface TaskCreateInput {
  title: string;
  epicNumber: number;
  assignee?: string;
  input?: string;
  output?: string;
  prompt?: string;
  type?: string;
  dependencies?: string[];
}

export interface TaskUpdateInput {
  status?: Task['status'];
  assignee?: string;
  input?: string;
  output?: string;
  prompt?: string;
  addDependency?: TaskId;
  removeDependency?: TaskId;
}

/**
 * Get task details with full context
 */
export function getTaskDetails(store: HierarchicalStore, taskId: string): TaskDetails | null {
  // Handle display ID format (m1.2)
  let task: Task | null = null;
  let displayId = taskId;

  if (taskId.match(/^m\d+\.\d+$/)) {
    const [, msNum, taskNum] = taskId.match(/^m(\d+)\.(\d+)$/) || [];
    const epic = store.getEpicByNumber(parseInt(msNum, 10));
    if (epic && epic.task_ids[parseInt(taskNum, 10) - 1]) {
      task = store.getTask(epic.task_ids[parseInt(taskNum, 10) - 1]);
      displayId = taskId;
    }
  } else {
    task = store.getTask(taskId as TaskId);
    // Calculate display ID
    const location = store.getTaskLocation(taskId as TaskId);
    if (location) {
      const taskIndex = location.epic.task_ids.indexOf(taskId as TaskId);
      displayId = `m${location.epic.number}.${taskIndex + 1}`;
    }
  }

  if (!task) return null;

  const location = store.getTaskLocation(task.id);
  if (!location) return null;

  return {
    task,
    epic: {
      number: location.epic.number,
      title: location.epic.title,
    },
    displayId,
    location: {
      path: location.taskDir,
      dir: location.taskDir,
    },
  };
}

/**
 * Create a new task
 */
export async function createTask(
  store: HierarchicalStore,
  input: TaskCreateInput
): Promise<TaskId> {
  const epic = store.getEpicByNumber(input.epicNumber);
  if (!epic) {
    throw new Error(`Epic M${input.epicNumber} not found`);
  }

  const taskId = await addTask(
    { appDir: store.rootDir },
    input.title,
    {
      epic: input.epicNumber,
      type: input.type,
      input: input.input,
      output: input.output,
      deps: input.dependencies,
      prompt: input.prompt,
    }
  );

  // Update assignee if provided
  if (input.assignee) {
    const task = store.getTask(taskId as TaskId);
    if (task) {
      task.assignee = input.assignee as any;
      const location = store.getTaskLocation(taskId as TaskId);
      if (location) {
        store.saveTask(task, location.epic);
      }
    }
  }

  return taskId as TaskId;
}

/**
 * Update an existing task
 */
export async function updateTask(
  store: HierarchicalStore,
  taskId: string,
  updates: TaskUpdateInput
): Promise<void> {
  const details = getTaskDetails(store, taskId);
  if (!details) {
    throw new Error(`Task ${taskId} not found`);
  }

  const { task } = details;
  const location = store.getTaskLocation(task.id);
  if (!location) {
    throw new Error(`Task location not found`);
  }

  // Apply updates
  if (updates.status) {
    store.updateTaskStatus(task, updates.status, 'cli');
  }

  if (updates.assignee !== undefined) {
    task.assignee = updates.assignee as any;
  }

  if (updates.input !== undefined) {
    task.input = { description: updates.input };
  }

  if (updates.output !== undefined) {
    task.output = { description: updates.output };
  }

  if (updates.prompt !== undefined) {
    store.writeTaskPrompt(task, location.epic, updates.prompt);
  }

  if (updates.addDependency) {
    if (!task.dependencies) task.dependencies = [];
    if (!task.dependencies.includes(updates.addDependency)) {
      task.dependencies.push(updates.addDependency);
    }
  }

  if (updates.removeDependency) {
    if (task.dependencies) {
      task.dependencies = task.dependencies.filter(d => d !== updates.removeDependency);
    }
  }

  task.updated = {
    at: new Date().toISOString(),
    by: 'agent_cli',
  };

  store.saveTask(task, location.epic);
}

/**
 * Delete a task
 */
export async function deleteTask(
  store: HierarchicalStore,
  taskId: string
): Promise<void> {
  const details = getTaskDetails(store, taskId);
  if (!details) {
    throw new Error(`Task ${taskId} not found`);
  }

  const success = store.removeTask(details.task.id);
  if (!success) {
    throw new Error(`Failed to remove task ${taskId}`);
  }
}

/**
 * List all tasks with optional filtering
 */
export function listTasks(
  store: HierarchicalStore,
  filter?: {
    status?: Task['status'];
    epic?: number;
    assignee?: string;
  }
): TaskDetails[] {
  let tasks = store.listAllTasks();

  if (filter) {
    if (filter.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }
    if (filter.epic !== undefined) {
      const epic = store.getEpicByNumber(filter.epic);
      if (epic) {
        tasks = tasks.filter(t => t.epic_id === epic.id);
      }
    }
    if (filter.assignee) {
      tasks = tasks.filter(t => t.assignee === filter.assignee);
    }
  }

  return tasks.map(task => {
    const details = getTaskDetails(store, task.id);
    return details!;
  }).filter(Boolean);
}

/**
 * Check if a task's dependencies are met
 */
function depsMet(task: Task, store: HierarchicalStore): boolean {
  if (!task.dependencies || task.dependencies.length === 0) {
    return true;
  }
  return task.dependencies.every(depId => {
    const dep = store.getTask(depId);
    return dep && isResolved(dep.status);
  });
}

/**
 * Check if a task can start based on constraints
 */
function canTaskStart(task: Task, store: HierarchicalStore): boolean {
  // Check explicit dependencies first
  if (!depsMet(task, store)) {
    return false;
  }

  // Check sequential constraint (default: true)
  const sequential = task.constraints?.sequential ?? true;

  if (sequential) {
    const prevTask = getPreviousTaskInEpic(task, store);
    if (prevTask && !isResolved(prevTask.status)) {
      return false;
    }
  }

  // Check explicit blockedBy constraints
  if (task.constraints?.blockedBy && task.constraints.blockedBy.length > 0) {
    for (const blockerId of task.constraints.blockedBy) {
      const blocker = store.getTask(blockerId as TaskId);
      if (blocker && !isResolved(blocker.status)) {
        return false;
      }
    }
  }

  // Check condition constraint (basic evaluation)
  if (task.constraints?.condition) {
    // For now, assume condition is met (actual evaluation happens at runtime)
    // In production, you'd evaluate the condition with project vars
  }

  return true;
}

/**
 * Get the previous task in the same epic
 */
function getPreviousTaskInEpic(task: Task, store: HierarchicalStore): Task | null {
  const epic = store.getEpic(task.epic_id);
  if (!epic) return null;

  const taskIndex = epic.task_ids.indexOf(task.id);
  if (taskIndex <= 0) return null;

  const prevTaskId = epic.task_ids[taskIndex - 1];
  return store.getTask(prevTaskId);
}

/**
 * Check if a status is resolved (completed state)
 */
function isResolved(status: string): boolean {
  return ['done', 'failed', 'cancelled'].includes(status);
}

/**
 * Get tasks that are blocking a given task
 */
export function getTaskBlockers(task: Task, store: HierarchicalStore): string[] {
  const blockers: string[] = [];

  // Check explicit dependencies
  if (task.dependencies) {
    for (const depId of task.dependencies) {
      const dep = store.getTask(depId);
      if (dep && !isResolved(dep.status)) {
        blockers.push(depId);
      }
    }
  }

  // Check sequential constraint
  const sequential = task.constraints?.sequential ?? true;
  if (sequential) {
    const prevTask = getPreviousTaskInEpic(task, store);
    if (prevTask && !isResolved(prevTask.status)) {
      blockers.push(prevTask.id);
    }
  }

  // Check explicit blockedBy
  if (task.constraints?.blockedBy) {
    for (const blockerId of task.constraints.blockedBy) {
      const blocker = store.getTask(blockerId as TaskId);
      if (blocker && !isResolved(blocker.status)) {
        blockers.push(blockerId);
      }
    }
  }

  return blockers;
}

/**
 * Get the next ready task (first pending task with all constraints met)
 */
export function getNextReadyTask(store: HierarchicalStore): TaskDetails | null {
  const allEpics = store.listEpics();
  const allTasks = store.listAllTasks();

  for (const ms of allEpics) {
    // Check epic can start
    const msCanStart = canEpicStart(ms, allEpics, allTasks, store);
    if (!msCanStart.canStart) {
      if (msCanStart.autoResolved) {
        continue; // Skip auto-resolved epic
      }
      // Gate or constraint blocks this and all subsequent epics
      break;
    }

    for (const task of store.listTasksForEpic(ms)) {
      if (task.status === 'pending' && canTaskStart(task, store)) {
        const details = getTaskDetails(store, task.id);
        return details;
      }
    }
  }

  return null;
}

/**
 * Check if a epic can start based on constraints
 */
function canEpicStart(
  ms: Epic,
  allEpics: Epic[],
  allTasks: Task[],
  store: HierarchicalStore
): { canStart: boolean; autoResolved?: boolean; reason?: string } {
  // Check epic gates
  const requiredGate = ms.gates?.find(g => g.required && !g.completed);
  if (requiredGate) {
    return {
      canStart: false,
      reason: `Required gate incomplete: ${requiredGate.type}`,
    };
  }

  // Get constraints with defaults
  const constraints = ms.constraints || {};
  const sequential = constraints.sequential ?? true;
  const autoResolve = constraints.autoResolve ?? true;

  // Check auto-resolve for empty epics
  if (autoResolve && ms.task_ids.length === 0) {
    return {
      canStart: false,
      autoResolved: true,
      reason: 'Empty epic auto-resolved',
    };
  }

  // Check sequential constraint
  if (sequential) {
    const prevEpic = getPreviousEpic(ms, allEpics);
    if (prevEpic) {
      const allPrevTasksResolved = prevEpic.task_ids.every(taskId => {
        const task = store.getTask(taskId);
        return task && isResolved(task.status);
      });

      if (!allPrevTasksResolved) {
        return {
          canStart: false,
          reason: `Waiting for previous epic (${prevEpic.title}) to complete`,
        };
      }
    }
  }

  // Check explicit blockedBy constraints
  if (constraints.blockedBy && constraints.blockedBy.length > 0) {
    for (const blockerId of constraints.blockedBy) {
      const blocker = allEpics.find(m => m.id === blockerId);
      if (blocker) {
        const allBlockerTasksResolved = blocker.task_ids.every(taskId => {
          const task = store.getTask(taskId);
          return task && isResolved(task.status);
        });

        if (!allBlockerTasksResolved) {
          return {
            canStart: false,
            reason: `Blocked by epic ${blocker.title}`,
          };
        }
      }
    }
  }

  return {
    canStart: true,
  };
}

/**
 * Get the previous epic
 */
function getPreviousEpic(
  epic: Epic,
  allEpics: Epic[]
): Epic | null {
  const sorted = [...allEpics].sort((a, b) => a.number - b.number);
  const index = sorted.findIndex(m => m.id === epic.id);
  if (index <= 0) return null;
  return sorted[index - 1];
}
