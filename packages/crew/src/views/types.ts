/**
 * Shared types for view generation
 */

import type { Task, Epic, CrewProject } from '../store/types.ts';

/**
 * Minimal store interface for view generation
 */
export interface ViewableStore {
  rootDir: string;
  planDirOverride?: string;
  getProject(): CrewProject | null;
  listEpics(): Epic[];
  listTasks?(): Task[];
  listAllTasks?(): Task[];
  getTask(id: string): Task | null;
}

export type { Task, Epic, CrewProject };
