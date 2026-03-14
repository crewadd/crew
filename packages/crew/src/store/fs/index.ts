/**
 * FsStore — Filesystem-native store facade
 *
 * Unified class composing all fs/ operations.
 * Mirrors HierarchicalStore API surface so consumers can swap.
 */

import { mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { PathResolver } from './path-resolver.ts';
import { readProject, writeProject } from './project-ops.ts';
import {
  listEpics, getEpic, createEpic, removeEpic,
  getEpicStatus, setEpicStatus,
  type EpicInfo, type CreateEpicConfig,
} from './epic-ops.ts';
import {
  listTasks, getTask, createTask, removeTask,
  setTaskStatus, startTask,
  type TaskInfo, type CreateTaskConfig,
} from './task-ops.ts';
import { getReady, validateDeps, type DepWarning } from './graph.ts';
import { listOrdered, parsePrefix } from './ordering.ts';
import { readStatus } from './status-io.ts';
import { writeYaml } from './yaml-io.ts';
import type { ProjectYaml, TaskStatus, EpicStatus } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Stats type                                                         */
/* ------------------------------------------------------------------ */

export interface FsStoreStats {
  epics: number;
  tasks: number;
  completed: number;
  active: number;
  pending: number;
  blocked: number;
  failed: number;
}

/* ------------------------------------------------------------------ */
/*  FsStore                                                            */
/* ------------------------------------------------------------------ */

export class FsStore {
  readonly root: string;
  readonly paths: PathResolver;

  constructor(rootDir: string, planDirOverride?: string) {
    this.root = planDirOverride ?? join(rootDir, '.crew');
    this.paths = new PathResolver(rootDir, planDirOverride);
    this._ensureDirs();
  }

  private _ensureDirs(): void {
    mkdirSync(join(this.root, 'epics'), { recursive: true });
  }

  /* -------------------------------------------------------------- */
  /*  Project operations                                             */
  /* -------------------------------------------------------------- */

  getProject(): ProjectYaml | null {
    return readProject(this.root);
  }

  saveProject(data: ProjectYaml): void {
    writeProject(this.root, data);
  }

  /* -------------------------------------------------------------- */
  /*  Epic operations                                                */
  /* -------------------------------------------------------------- */

  listEpics(): EpicInfo[] {
    return listEpics(this.root);
  }

  getEpic(epicDir: string): EpicInfo | null {
    return getEpic(epicDir);
  }

  getEpicBySlug(slug: string): EpicInfo | null {
    return getEpic(join(this.root, 'epics', slug));
  }

  getEpicByNumber(num: number): EpicInfo | null {
    const epicsDir = join(this.root, 'epics');
    const dirs = listOrdered(epicsDir);
    const match = dirs.find(d => parsePrefix(d).num === num);
    if (!match) return null;
    return getEpic(join(epicsDir, match));
  }

  createEpic(config: CreateEpicConfig): EpicInfo {
    return createEpic(this.root, config);
  }

  saveEpic(epicDir: string, updates: { title?: string; status?: EpicStatus; gates?: any[]; constraints?: Record<string, unknown> }): void {
    if (updates.status) {
      setEpicStatus(epicDir, updates.status);
    }
    if (updates.title || updates.gates || updates.constraints) {
      const existing = getEpic(epicDir);
      if (!existing) return;
      const yamlPath = join(epicDir, 'epic.yaml');
      const config = { ...existing.config };
      if (updates.title) config.title = updates.title;
      if (updates.gates) config.gates = updates.gates;
      if (updates.constraints) config.constraints = updates.constraints;
      writeYaml(yamlPath, config);
    }
  }

  removeEpic(epicDir: string): boolean {
    return removeEpic(epicDir);
  }

  /* -------------------------------------------------------------- */
  /*  Task operations                                                */
  /* -------------------------------------------------------------- */

  listTasks(epicDir: string): TaskInfo[] {
    return listTasks(epicDir);
  }

  listAllTasks(): TaskInfo[] {
    const epics = this.listEpics();
    const all: TaskInfo[] = [];
    for (const epic of epics) {
      all.push(...listTasks(epic.dir));
    }
    return all;
  }

  getTask(taskDir: string): TaskInfo | null {
    return getTask(taskDir);
  }

  createTask(epicDir: string, config: CreateTaskConfig): TaskInfo {
    return createTask(epicDir, config);
  }

  setTaskStatus(taskDir: string, status: TaskStatus, agent?: string): void {
    setTaskStatus(taskDir, status, agent);
  }

  startTask(taskDir: string, agent: string): void {
    startTask(taskDir, agent);
  }

  removeTask(taskDir: string): boolean {
    return removeTask(taskDir);
  }

  /* -------------------------------------------------------------- */
  /*  Dependency resolution                                          */
  /* -------------------------------------------------------------- */

  getReady(limit?: number): string[] {
    return getReady(this.root, limit);
  }

  validateDeps(): DepWarning[] {
    return validateDeps(this.root);
  }

  /* -------------------------------------------------------------- */
  /*  Display IDs                                                    */
  /* -------------------------------------------------------------- */

  /**
   * Map a task to m{epic}.{task} format.
   * Epic number from prefix, task number from prefix.
   */
  getDisplayId(taskDir: string): string | null {
    const taskSlug = basename(taskDir);
    const tasksDir = dirname(taskDir);
    const epicDir = dirname(tasksDir);
    const epicSlug = basename(epicDir);

    const epicNum = parsePrefix(epicSlug).num;
    const taskNum = parsePrefix(taskSlug).num;

    if (epicNum === 0 && taskNum === 0) return null;
    return `m${epicNum}.${taskNum}`;
  }

  /**
   * Resolve a display ID (e.g. "m1.2") back to a task directory path.
   */
  resolveDisplayId(displayId: string): string | null {
    const match = displayId.match(/^m(\d+)\.(\d+)$/i);
    if (!match) return null;

    const epicNum = parseInt(match[1], 10);
    const taskNum = parseInt(match[2], 10);

    const epicsDir = join(this.root, 'epics');
    const epicDirs = listOrdered(epicsDir);
    const epicSlug = epicDirs.find(d => parsePrefix(d).num === epicNum);
    if (!epicSlug) return null;

    const tasksDir = join(epicsDir, epicSlug, 'tasks');
    const taskDirs = listOrdered(tasksDir);
    const taskSlug = taskDirs.find(d => parsePrefix(d).num === taskNum);
    if (!taskSlug) return null;

    return join(tasksDir, taskSlug);
  }

  /* -------------------------------------------------------------- */
  /*  Statistics                                                     */
  /* -------------------------------------------------------------- */

  getStats(): FsStoreStats {
    const epics = this.listEpics();
    const allTasks = this.listAllTasks();

    return {
      epics: epics.length,
      tasks: allTasks.length,
      completed: allTasks.filter(t => t.status === 'done').length,
      active: allTasks.filter(t => t.status === 'active').length,
      pending: allTasks.filter(t => t.status === 'pending').length,
      blocked: allTasks.filter(t => t.status === 'blocked').length,
      failed: allTasks.filter(t => t.status === 'failed').length,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Re-exports                                                         */
/* ------------------------------------------------------------------ */

export type { EpicInfo, CreateEpicConfig } from './epic-ops.ts';
export type { TaskInfo, CreateTaskConfig } from './task-ops.ts';
export type { ProjectYaml, TaskStatus, EpicStatus, TaskYaml, EpicYaml, LogEntry } from './types.ts';
export type { DepWarning } from './graph.ts';
export { PathResolver } from './path-resolver.ts';
export type { TodoItem, TodoPhase, TodoStatus } from './types.ts';
export {
  readTodos, writeTodos,
  markTodoDone, markTodoFailed,
  getPendingTodos, isPhaseComplete, hasPendingWork,
  generateTodos, syncTodos,
} from './todo-io.ts';
export type { HarnessVerdictYaml, VerdictIssueEntry } from './harness-io.ts';
export {
  readHarnessCode, writeHarnessCode, clearHarnessCode,
  readHarnessVerdict, writeHarnessVerdict,
} from './harness-io.ts';
