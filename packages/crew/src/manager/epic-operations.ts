/**
 * Epic operations - Manager layer
 * Delegates to Store layer for all persistence
 */

import type { HierarchicalStore } from '../store/hierarchical-store.ts';
import type { Epic } from '../store/types.ts';
import { generateUlid } from '../utils/ulid.ts';

export interface EpicCreateInput {
  title: string;
  number?: number;
}

export interface EpicUpdateInput {
  title?: string;
  status?: 'planned' | 'active' | 'completed' | 'archived';
}

export interface EpicDetails {
  epic: Epic;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee?: string;
  }>;
}

/**
 * Check if a status is resolved (completed state)
 */
function isResolved(status: string): boolean {
  return ['done', 'failed', 'cancelled'].includes(status);
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

/**
 * Check if all tasks in a epic are resolved
 */
function areAllTasksResolved(epic: Epic, store: HierarchicalStore): boolean {
  if (epic.task_ids.length === 0) return true;

  return epic.task_ids.every(taskId => {
    const task = store.getTask(taskId);
    return task && isResolved(task.status);
  });
}

/**
 * Check if a epic can start based on constraints
 */
export function canEpicStart(
  store: HierarchicalStore,
  epicIdOrNumber: string
): { canStart: boolean; autoResolved?: boolean; reason?: string } {
  const details = getEpicDetails(store, epicIdOrNumber);
  if (!details) {
    return { canStart: false, reason: 'Epic not found' };
  }

  const { epic } = details;
  const allEpics = store.listEpics();
  const allTasks = store.listAllTasks();

  // Check epic gates
  const requiredGate = epic.gates?.find(g => g.required && !g.completed);
  if (requiredGate) {
    return {
      canStart: false,
      reason: `Required gate incomplete: ${requiredGate.type}`,
    };
  }

  // Get constraints with defaults
  const constraints = epic.constraints || {};
  const sequential = constraints.sequential ?? true;
  const autoResolve = constraints.autoResolve ?? true;

  // Check auto-resolve for empty epics
  if (autoResolve && epic.task_ids.length === 0) {
    return {
      canStart: false,
      autoResolved: true,
      reason: 'Empty epic auto-resolved',
    };
  }

  // Check sequential constraint
  if (sequential) {
    const prevEpic = getPreviousEpic(epic, allEpics);
    if (prevEpic) {
      if (!areAllTasksResolved(prevEpic, store)) {
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
        if (!areAllTasksResolved(blocker, store)) {
          return {
            canStart: false,
            reason: `Blocked by epic ${blocker.title}`,
          };
        }
      }
    }
  }

  // Check condition constraint (basic evaluation)
  if (typeof constraints.condition === 'string') {
    // For now, assume condition is met (actual evaluation happens at runtime)
    // In production, you'd evaluate the condition with project vars
  }

  return {
    canStart: true,
  };
}

/**
 * Auto-resolve empty epic (mark as completed)
 */
export async function autoResolveEpic(
  store: HierarchicalStore,
  epicIdOrNumber: string
): Promise<void> {
  const details = getEpicDetails(store, epicIdOrNumber);
  if (!details) {
    throw new Error(`Epic not found: ${epicIdOrNumber}`);
  }

  const { epic } = details;

  // Only auto-resolve if empty
  if (epic.task_ids.length > 0) {
    throw new Error(`Cannot auto-resolve epic with tasks`);
  }

  // Mark as completed
  epic.status = 'completed';
  epic.updated = { at: new Date().toISOString(), by: 'agent_cli' };

  // Add completion gate
  epic.gates.push({
    type: 'plan',
    required: true,
    completed: true,
    message: `Auto-resolved (no tasks)`,
    completed_at: new Date().toISOString(),
  });

  store.saveEpic(epic);
}

/**
 * Get epics that are blocking a given epic
 */
export function getEpicBlockers(
  store: HierarchicalStore,
  epicIdOrNumber: string
): string[] {
  const details = getEpicDetails(store, epicIdOrNumber);
  if (!details) return [];

  const { epic } = details;
  const allEpics = store.listEpics();
  const blockers: string[] = [];

  // Check sequential constraint
  const sequential = epic.constraints?.sequential ?? true;
  if (sequential) {
    const prevEpic = getPreviousEpic(epic, allEpics);
    if (prevEpic && !areAllTasksResolved(prevEpic, store)) {
      blockers.push(prevEpic.id);
    }
  }

  // Check explicit blockedBy
  if (epic.constraints?.blockedBy) {
    for (const blockerId of epic.constraints.blockedBy) {
      const blocker = allEpics.find(m => m.id === blockerId);
      if (blocker && !areAllTasksResolved(blocker, store)) {
        blockers.push(blockerId);
      }
    }
  }

  return blockers;
}

/**
 * Get epic details by ID or number
 */
export function getEpicDetails(
  store: HierarchicalStore,
  epicIdOrNumber: string
): EpicDetails | null {
  let epic: Epic | null = null;

  // Try parsing as number (m4 or 4)
  const msNum = parseInt(epicIdOrNumber.replace(/^m/i, ''), 10);
  if (!isNaN(msNum)) {
    epic = store.getEpicByNumber(msNum);
  }

  // Try full ID
  if (!epic) {
    epic = store.getEpic(epicIdOrNumber as import('../store/types.ts').EpicId);
  }

  if (!epic) {
    return null;
  }

  const tasks = store.listTasksForEpic(epic);

  return {
    epic,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignee: t.assignee,
    })),
  };
}

/**
 * Create a new epic
 */
export async function createEpic(
  store: HierarchicalStore,
  input: EpicCreateInput
): Promise<string> {
  const now = new Date().toISOString();
  const id = `epic_${generateUlid()}`;

  // Determine epic number
  let number = input.number;
  if (number === undefined) {
    const existing = store.listEpics();
    number = existing.length > 0 ? Math.max(...existing.map(m => m.number)) + 1 : 0;
  }

  // Check if epic number already exists
  const existingEpic = store.getEpicByNumber(number);
  if (existingEpic) {
    throw new Error(`Epic M${number} already exists`);
  }

  const epic: Epic = {
    id: id as import('../store/types.ts').EpicId,
    version: 1,
    number,
    title: input.title,
    status: number === 0 ? 'active' : 'planned',
    task_ids: [],
    gates: [{
      type: 'plan',
      required: true,
      completed: true,
      message: `M${number} planning complete`,
    }],
    created: { at: now, by: 'agent_cli' as import('../store/types.ts').AgentId },
    updated: { at: now, by: 'agent_cli' as import('../store/types.ts').AgentId },
  };

  // Create epic directory with README
  const readme = `# ${input.title}\n\nEpic ${number}: ${input.title}\n\nStatus: ${epic.status}\n`;
  store.createEpicDir(epic, readme);

  return id;
}

/**
 * Update an existing epic
 */
export async function updateEpic(
  store: HierarchicalStore,
  epicIdOrNumber: string,
  updates: EpicUpdateInput
): Promise<void> {
  const details = getEpicDetails(store, epicIdOrNumber);

  if (!details) {
    throw new Error(`Epic not found: ${epicIdOrNumber}`);
  }

  const epic = details.epic;
  const now = new Date().toISOString();

  if (updates.title !== undefined) {
    epic.title = updates.title;
  }

  if (updates.status !== undefined) {
    epic.status = updates.status as Epic['status'];
  }

  epic.updated = { at: now, by: 'agent_cli' as import('../store/types.ts').AgentId };

  // Save via Store layer (automatically regenerates README)
  store.saveEpic(epic);
}

/**
 * Delete a epic
 */
export async function deleteEpic(
  store: HierarchicalStore,
  epicIdOrNumber: string
): Promise<void> {
  const details = getEpicDetails(store, epicIdOrNumber);

  if (!details) {
    throw new Error(`Epic not found: ${epicIdOrNumber}`);
  }

  const epic = details.epic;

  // Check if epic has tasks
  if (epic.task_ids.length > 0) {
    throw new Error(`Cannot remove epic with tasks. Remove tasks first.`);
  }

  // Remove via Store layer
  const removed = store.removeEpic(epic.id);

  if (!removed) {
    throw new Error(`Failed to remove epic: ${epicIdOrNumber}`);
  }
}
