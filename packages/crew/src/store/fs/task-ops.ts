/**
 * Task CRUD Operations
 *
 * Directory-level operations for creating, reading, updating, and removing tasks.
 * Each task is a directory under {epicDir}/tasks/ with a numeric prefix.
 */

import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readYaml, writeYaml } from './yaml-io.ts';
import { readStatus, writeStatus } from './status-io.ts';
import { readDeps, writeDeps } from './deps-io.ts';
import { appendLog, listAttempts, startNewAttempt } from './log-io.ts';
import { listOrdered, nextPrefix } from './ordering.ts';
import { slugify } from '../slug-utils.ts';
import type { TaskYaml, TaskStatus } from './types.ts';
import { generateTodos, writeTodos } from './todo-io.ts';

/* ------------------------------------------------------------------ */
/*  Return shape for task queries                                      */
/* ------------------------------------------------------------------ */

export interface TaskInfo {
  /** Absolute path to the task directory — this IS the identity */
  dir: string;
  /** Directory basename (e.g. "02-fix-build") */
  slug: string;
  /** Title from task.yaml */
  title: string;
  /** Current status from status file */
  status: TaskStatus;
  /** Full task.yaml contents */
  config: TaskYaml;
  /** Resolved absolute dependency paths from deps file */
  deps: string[];
  /** PROMPT.md contents if present */
  prompt?: string;
  /** Number of log attempts */
  attemptCount: number;
}

/* ------------------------------------------------------------------ */
/*  Config for createTask                                              */
/* ------------------------------------------------------------------ */

export interface CreateTaskConfig {
  title: string;
  type?: string;
  skills?: string[];
  input?: TaskYaml['input'];
  output?: TaskYaml['output'];
  vars?: Record<string, unknown>;
  deps?: string[];
  prompt?: string;
  yields?: import('../../tasks/types.ts').YieldsDeclarative;
  checks?: TaskYaml['checks'];
  maxAttempts?: TaskYaml['maxAttempts'];
}

/* ------------------------------------------------------------------ */
/*  Operations                                                         */
/* ------------------------------------------------------------------ */

/**
 * List all tasks in an epic in directory-prefix order.
 */
export function listTasks(epicDir: string): TaskInfo[] {
  const tasksDir = join(epicDir, 'tasks');
  const dirs = listOrdered(tasksDir);

  return dirs.map(slug => {
    const dir = join(tasksDir, slug);
    return readTaskInfo(dir, slug);
  });
}

/**
 * Get a single task by its directory path.
 * Returns null for non-existent directory.
 */
export function getTask(taskDir: string): TaskInfo | null {
  if (!existsSync(taskDir)) return null;
  const slug = basename(taskDir);
  return readTaskInfo(taskDir, slug);
}

/**
 * Create a new task directory with the next numeric prefix.
 * Returns the TaskInfo for the created task.
 */
export function createTask(epicDir: string, config: CreateTaskConfig): TaskInfo {
  const tasksDir = join(epicDir, 'tasks');
  mkdirSync(tasksDir, { recursive: true });

  const prefix = nextPrefix(tasksDir);
  const slug = `${prefix}-${slugify(config.title) || 'untitled'}`;
  const dir = join(tasksDir, slug);
  mkdirSync(dir, { recursive: true });

  // Write task.yaml
  const yaml: TaskYaml = { title: config.title };
  if (config.type) yaml.type = config.type;
  if (config.skills) yaml.skills = config.skills;
  if (config.input) yaml.input = config.input;
  if (config.output) yaml.output = config.output;
  if (config.vars) yaml.vars = config.vars;
  if (config.checks) yaml.checks = config.checks;
  if (config.maxAttempts) yaml.maxAttempts = config.maxAttempts;
  if (config.yields) yaml.yields = config.yields;
  writeYaml(join(dir, 'task.yaml'), yaml);

  // Write PROMPT.md if provided
  if (config.prompt) {
    writeFileSync(join(dir, 'PROMPT.md'), config.prompt, 'utf-8');
  }

  // Write deps file if dependencies provided (as relative paths)
  if (config.deps && config.deps.length > 0) {
    writeDeps(dir, config.deps);
  }

  // No status file — implicit "pending"

  // Generate todo.yaml if checks are defined
  if (config.checks && config.checks.length > 0) {
    const todos = generateTodos(dir, config.checks, config.title);
    writeTodos(dir, todos);
  }

  return readTaskInfo(dir, slug);
}

/**
 * Remove an entire task directory recursively.
 * Returns false if the directory didn't exist.
 */
export function removeTask(taskDir: string): boolean {
  if (!existsSync(taskDir)) return false;
  rmSync(taskDir, { recursive: true, force: true });
  return true;
}

/**
 * Get task status from status file.
 * Defaults to "pending" when no status file exists.
 */
export function getTaskStatus(taskDir: string): TaskStatus {
  return readStatus(taskDir) as TaskStatus;
}

/**
 * Set task status and log the transition.
 */
export function setTaskStatus(taskDir: string, status: TaskStatus, agent?: string): void {
  writeStatus(taskDir, status);
  appendLog(taskDir, {
    event: 'status',
    status,
    ...(agent ? { agent } : {}),
  });
}

/**
 * Start a task: set status to "active", create new log attempt, log start event.
 */
export function startTask(taskDir: string, agent: string): void {
  writeStatus(taskDir, 'active');
  startNewAttempt(taskDir);
  appendLog(taskDir, {
    event: 'start',
    agent,
  });
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function readTaskInfo(dir: string, slug: string): TaskInfo {
  const config = readYaml<TaskYaml>(join(dir, 'task.yaml')) ?? { title: slug };
  const status = readStatus(dir) as TaskStatus;
  const deps = readDeps(dir);
  const attempts = listAttempts(dir);

  let prompt: string | undefined;
  const promptPath = join(dir, 'PROMPT.md');
  if (existsSync(promptPath)) {
    prompt = readFileSync(promptPath, 'utf-8');
  }

  return {
    dir,
    slug,
    title: config.title,
    status: status || 'pending',
    config,
    deps,
    prompt,
    attemptCount: attempts.length,
  };
}
