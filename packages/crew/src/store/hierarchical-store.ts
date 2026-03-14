/**
 * Hierarchical Store — Compatibility wrapper over FsStore
 *
 * Provides the same API surface as the old HierarchicalStore class
 * but delegates all persistence to the filesystem-native FsStore.
 *
 * Consumers can continue importing HierarchicalStore without changes;
 * under the hood everything is backed by the new fs/ layer.
 */

import { join, basename, dirname } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import type {
  Task, TaskId, Epic, EpicId, CrewProject, AgentId,
} from './types.ts';
import { FsStore } from './fs/index.ts';
import type { EpicInfo, TaskInfo } from './fs/index.ts';
import { epicInfoToEpic, taskInfoToTask, projectYamlToCrewProject } from './fs/adapter.ts';
import { listOrdered } from './fs/ordering.ts';

export { slugify, numberedSlug, parseNumberedSlug } from './slug-utils.ts';

export type TaskStatus = Task['status'];

export interface HierarchicalStoreConfig {
  crewDir: string;
}

export const DEFAULT_CONFIG: HierarchicalStoreConfig = {
  crewDir: '.crew',
};

export interface StoreStats {
  epics: number;
  tasks: number;
  completed: number;
  active: number;
  pending: number;
  blocked: number;
  failed: number;
}

/**
 * Generate a tree view of the store for display.
 */
export function generateTreeView(store: HierarchicalStore): string {
  const lines: string[] = ['.crew/'];

  const project = store.getProject();
  if (project) {
    lines.push(`├── project.json  # ${project.name}`);
  }

  const epicDirs = store.listEpicDirs();

  for (let i = 0; i < epicDirs.length; i++) {
    const epicDir = epicDirs[i];
    const epic = store.getEpicByDir(epicDir);
    const isLast = i === epicDirs.length - 1;
    const prefix = isLast ? '└── ' : '├── ';
    const indent = isLast ? '    ' : '│   ';

    if (epic) {
      const taskCount = epic.task_ids.length;
      const doneCount = store.listTasksForEpic(epic).filter(t => t.status === 'done').length;
      lines.push(`${prefix}plan/${epicDir}/  # ${epic.title} (${doneCount}/${taskCount})`);
    } else {
      lines.push(`${prefix}plan/${epicDir}/`);
    }

    if (epic) {
      const tasks = store.listTasksForEpic(epic);
      const taskDirs = store.listTaskDirs(epicDir);
      for (let j = 0; j < taskDirs.length; j++) {
        const taskDir = taskDirs[j];
        const isLastTask = j === taskDirs.length - 1;
        const taskPrefix = isLastTask ? '└── ' : '├── ';
        const task = tasks[j];

        if (task) {
          const statusIcon: Record<string, string> = {
            pending: '○', active: '◐', done: '●', blocked: '⊘',
            failed: '✗', cancelled: '⊗', awaiting_review: '⧗',
          };
          lines.push(`${indent}${taskPrefix}${taskDir}/  # ${statusIcon[task.status] || '?'} ${task.title}`);
        } else {
          lines.push(`${indent}${taskPrefix}${taskDir}/`);
        }
      }
    }
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  HierarchicalStore                                                  */
/* ------------------------------------------------------------------ */

export class HierarchicalStore {
  readonly rootDir: string;
  readonly config: HierarchicalStoreConfig;
  readonly planDirOverride?: string;

  private readonly fs: FsStore;

  constructor(
    rootDir: string,
    config: Partial<HierarchicalStoreConfig> = {},
    planDirOverride?: string,
  ) {
    this.rootDir = rootDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.planDirOverride = planDirOverride;
    this.fs = new FsStore(rootDir, planDirOverride);
  }

  /* -------------------------------------------------------------- */
  /*  Internal helpers                                               */
  /* -------------------------------------------------------------- */

  /** Resolve an epic slug from its synthetic EpicId. */
  private epicSlugFromId(id: EpicId | string): string {
    return String(id).replace(/^epic_/, '');
  }

  /** Resolve a task slug from its synthetic TaskId. */
  private taskSlugFromId(id: TaskId | string): string {
    return String(id).replace(/^task_/, '');
  }

  /** Convert EpicInfo → Epic, filling task_ids from the filesystem. */
  private toEpic(info: EpicInfo): Epic {
    const epic = epicInfoToEpic(info);
    const tasks = this.fs.listTasks(info.dir);
    epic.task_ids = tasks.map(t => `task_${t.slug}` as TaskId);
    return epic;
  }

  /** Convert TaskInfo → Task, filling dependencies from deps file. */
  private toTask(info: TaskInfo, epicSlug: string): Task {
    const task = taskInfoToTask(info, epicSlug);

    // Fill dependencies by converting absolute paths to synthetic task IDs
    for (const dep of info.deps) {
      const depSlug = basename(dep);
      task.dependencies.push(`task_${depSlug}` as TaskId);
    }

    // Fill executorFile from config (stored as extra key in TaskYaml)
    if (info.config.executorFile) {
      task.executorFile = info.config.executorFile as string;
    }

    // Fill yields from config
    if (info.config.yields) {
      task.yields = info.config.yields as any;
    }

    return task;
  }

  /** Find the epic directory that contains a given task slug. */
  private findTaskEpic(taskSlug: string): { epicInfo: EpicInfo; taskInfo: TaskInfo } | null {
    for (const epicInfo of this.fs.listEpics()) {
      for (const taskInfo of this.fs.listTasks(epicInfo.dir)) {
        if (taskInfo.slug === taskSlug) {
          return { epicInfo, taskInfo };
        }
      }
    }
    return null;
  }

  /* -------------------------------------------------------------- */
  /*  Project operations                                             */
  /* -------------------------------------------------------------- */

  getProjectPath(): string {
    return join(this.fs.root, 'project.yaml');
  }

  getProject(): CrewProject | null {
    const yaml = this.fs.getProject();
    if (!yaml) return null;
    return projectYamlToCrewProject(yaml);
  }

  saveProject(project: CrewProject): void {
    this.fs.saveProject({
      name: project.name,
      description: project.description,
      goal: project.goal,
      settings: project.config ? {
        parallel_limit: project.config.parallel_limit,
        require_reviews: project.config.require_reviews,
      } : undefined,
    });
  }

  /* -------------------------------------------------------------- */
  /*  Epic operations                                                */
  /* -------------------------------------------------------------- */

  listEpicDirs(): string[] {
    const epicsDir = join(this.fs.root, 'epics');
    if (!existsSync(epicsDir)) return [];
    return listOrdered(epicsDir);
  }

  listEpics(): Epic[] {
    return this.fs.listEpics().map(info => this.toEpic(info));
  }

  getEpicByDir(dirName: string): Epic | null {
    const info = this.fs.getEpicBySlug(dirName);
    return info ? this.toEpic(info) : null;
  }

  findEpicDir(id: EpicId): string | null {
    const slug = this.epicSlugFromId(id);
    const info = this.fs.getEpicBySlug(slug);
    return info ? info.dir : null;
  }

  getEpic(id: EpicId | string): Epic | null {
    const slug = this.epicSlugFromId(id);
    const info = this.fs.getEpicBySlug(slug);
    return info ? this.toEpic(info) : null;
  }

  getEpicByNumber(num: number): Epic | null {
    const info = this.fs.getEpicByNumber(num);
    return info ? this.toEpic(info) : null;
  }

  saveEpic(epic: Epic): void {
    const slug = this.epicSlugFromId(epic.id);
    const epicDir = join(this.fs.root, 'epics', slug);
    this.fs.saveEpic(epicDir, {
      title: epic.title,
      status: epic.status as any,
      gates: epic.gates as any[],
      constraints: epic.constraints as any,
    });
  }

  createEpicDir(epic: Epic, _readme?: string): void {
    const info = this.fs.createEpic({
      title: epic.title,
      gates: epic.gates as any[],
      constraints: epic.constraints as any,
    });
    // Set status after creation if not the default 'planned'
    if (epic.status && epic.status !== 'planned') {
      this.fs.saveEpic(info.dir, { status: epic.status as any });
    }
  }

  removeEpic(epicId: EpicId | string): boolean {
    const slug = this.epicSlugFromId(epicId);
    const epicDir = join(this.fs.root, 'epics', slug);
    return this.fs.removeEpic(epicDir);
  }

  getEpicDirPath(epic: Epic): string {
    const slug = this.epicSlugFromId(epic.id);
    return join(this.fs.root, 'epics', slug);
  }

  /* -------------------------------------------------------------- */
  /*  Task operations                                                */
  /* -------------------------------------------------------------- */

  listTaskDirs(epicDirName: string): string[] {
    const tasksDir = join(this.fs.root, 'epics', epicDirName, 'tasks');
    if (!existsSync(tasksDir)) return [];
    return listOrdered(tasksDir);
  }

  listTasksForEpic(epic: Epic): Task[] {
    const slug = this.epicSlugFromId(epic.id);
    const epicDir = join(this.fs.root, 'epics', slug);
    return this.fs.listTasks(epicDir).map(info => this.toTask(info, slug));
  }

  listAllTasks(): Task[] {
    const result: Task[] = [];
    for (const epicInfo of this.fs.listEpics()) {
      for (const taskInfo of this.fs.listTasks(epicInfo.dir)) {
        result.push(this.toTask(taskInfo, epicInfo.slug));
      }
    }
    return result;
  }

  getTask(id: TaskId | string): Task | null {
    const slug = this.taskSlugFromId(id);
    const found = this.findTaskEpic(slug);
    if (!found) return null;
    return this.toTask(found.taskInfo, found.epicInfo.slug);
  }

  getTaskLocation(id: TaskId | string): { epic: Epic; taskDir: string } | null {
    const slug = this.taskSlugFromId(id);
    const found = this.findTaskEpic(slug);
    if (!found) return null;
    return {
      epic: this.toEpic(found.epicInfo),
      taskDir: found.taskInfo.dir,
    };
  }

  saveTask(task: Task, _epic: Epic): void {
    const taskSlug = this.taskSlugFromId(task.id);
    const found = this.findTaskEpic(taskSlug);
    if (!found) return;

    // Update status
    this.fs.setTaskStatus(found.taskInfo.dir, task.status as any);

    // Update prompt if present
    if (task.prompt) {
      const promptPath = join(found.taskInfo.dir, 'PROMPT.md');
      writeFileSync(promptPath, task.prompt, 'utf-8');
    }
  }

  updateTaskStatus(task: Task, status: TaskStatus, agentName: string): void {
    const slug = this.taskSlugFromId(task.id);
    const found = this.findTaskEpic(slug);
    if (!found) return;
    this.fs.setTaskStatus(found.taskInfo.dir, status as any, agentName);
  }

  startTask(task: Task, agentName: string): void {
    const slug = this.taskSlugFromId(task.id);
    const found = this.findTaskEpic(slug);
    if (!found) return;
    this.fs.startTask(found.taskInfo.dir, agentName);
  }

  createTaskDir(task: Task, epic: Epic, prompt?: string): void {
    const epicSlug = this.epicSlugFromId(epic.id);
    const epicDir = join(this.fs.root, 'epics', epicSlug);

    const taskInfo = this.fs.createTask(epicDir, {
      title: task.title,
      type: task.type,
      prompt,
      skills: task.skills,
      input: task.input,
      output: task.output,
      vars: task.vars,
      checks: task.checks,
      maxAttempts: task.maxAttempts,
      yields: task.yields,
    });

    // Set status after creation if not default
    if (task.status && task.status !== 'pending') {
      this.fs.setTaskStatus(taskInfo.dir, task.status as any);
    }
  }

  writeTaskPrompt(task: Task, epic: Epic, prompt: string): void {
    const epicSlug = this.epicSlugFromId(epic.id);
    const taskSlug = this.taskSlugFromId(task.id);
    const promptPath = join(this.fs.root, 'epics', epicSlug, 'tasks', taskSlug, 'PROMPT.md');
    writeFileSync(promptPath, prompt, 'utf-8');
  }

  updateTaskReadme(_task: Task, _epic: Epic): void {
    // No-op: fs store generates READMEs via views
  }

  removeTask(taskId: TaskId | string): boolean {
    const slug = this.taskSlugFromId(taskId);
    const found = this.findTaskEpic(slug);
    if (!found) return false;
    return this.fs.removeTask(found.taskInfo.dir);
  }

  getTaskDirPath(task: Task, epic: Epic): string {
    const epicSlug = this.epicSlugFromId(epic.id);
    const taskSlug = this.taskSlugFromId(task.id);
    return join(this.fs.root, 'epics', epicSlug, 'tasks', taskSlug);
  }

  /* -------------------------------------------------------------- */
  /*  Display ID mapping                                             */
  /* -------------------------------------------------------------- */

  getDisplayId(task: Task): string | null {
    const taskSlug = this.taskSlugFromId(task.id);
    const found = this.findTaskEpic(taskSlug);
    if (!found) return null;
    return this.fs.getDisplayId(found.taskInfo.dir);
  }

  getTaskByDisplayId(displayId: string): Task | null {
    const taskDir = this.fs.resolveDisplayId(displayId);
    if (!taskDir) return null;

    const taskInfo = this.fs.getTask(taskDir);
    if (!taskInfo) return null;

    // Derive epic slug from task dir path
    const tasksParent = dirname(taskDir);
    const epicDir = dirname(tasksParent);
    const epicSlug = basename(epicDir);

    return this.toTask(taskInfo, epicSlug);
  }

  /* -------------------------------------------------------------- */
  /*  Statistics & queries                                           */
  /* -------------------------------------------------------------- */

  getStats(): StoreStats {
    return this.fs.getStats();
  }

  getNextReady(limit = 5): Task[] {
    const readyDirs = this.fs.getReady(limit);
    const result: Task[] = [];

    for (const taskDir of readyDirs) {
      const taskInfo = this.fs.getTask(taskDir);
      if (!taskInfo) continue;

      const tasksParent = dirname(taskDir);
      const epicDir = dirname(tasksParent);
      const epicSlug = basename(epicDir);

      result.push(this.toTask(taskInfo, epicSlug));
    }

    return result;
  }

  /* -------------------------------------------------------------- */
  /*  Migration (no-ops)                                             */
  /* -------------------------------------------------------------- */

  migrateFromFlat(_flatEpicsDir: string, _flatTasksDir: string): void {
    // No-op: migration is no longer supported
  }

  cleanupFlatFiles(_flatEpicsDir: string, _flatTasksDir: string): void {
    // No-op: migration is no longer supported
  }

  /* -------------------------------------------------------------- */
  /*  View generation                                                */
  /* -------------------------------------------------------------- */

  async writePlanReadme(): Promise<void> {
    const { writePlanReadme } = await import('../views/writers.ts');
    writePlanReadme(this);
  }
}
