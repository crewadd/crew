/**
 * Filesystem-native store types
 *
 * Types specific to the fs-based store implementation.
 * Shared in-memory types (Epic, Task, CrewProject) remain in ../types.ts.
 */

/* ------------------------------------------------------------------ */
/*  Status values                                                      */
/* ------------------------------------------------------------------ */

export type TaskStatus = 'pending' | 'active' | 'done' | 'failed' | 'blocked';

export type EpicStatus = 'planned' | 'active' | 'completed' | 'archived';

export type StatusValue = TaskStatus | EpicStatus;

/* ------------------------------------------------------------------ */
/*  Log entry                                                          */
/* ------------------------------------------------------------------ */

export interface LogEntry {
  /** ISO-8601 timestamp — always written by the framework */
  t: string;
  /** Event type */
  event: string;
  /** Agent that produced this entry */
  agent?: string;
  /** Arbitrary payload */
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Deps file                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parsed deps file: an array of resolved absolute paths.
 * On disk the file stores one relative path per line.
 */
export type DepsFile = string[];

/* ------------------------------------------------------------------ */
/*  YAML config shapes                                                 */
/* ------------------------------------------------------------------ */

/**
 * Serializable check reference for task.yaml.
 *
 * Only JSON-serializable forms — no inline functions.
 * Four forms:
 *   - `{ name: "build" }` — named check from registry
 *   - `{ name: "tsc", autoFix: true }` — named with options
 *   - `{ prompt: "...", name?: "..." }` — AI prompt check
 *   - `{ cmd: "test -f ...", name?: "..." }` — shell command check
 */
export type TaskYamlCheck =
  | { name: string; autoFix?: boolean; maxRetries?: number }
  | { prompt: string; name?: string; files?: string[] }
  | { cmd: string; name?: string; cwd?: string };

export interface TaskYaml {
  title: string;
  type?: string;
  skills?: string[];
  input?: { files?: string[]; description?: string };
  output?: { files?: string[]; description?: string };
  vars?: Record<string, unknown>;
  checks?: TaskYamlCheck[];
  maxAttempts?: number;
  yields?: import('../../tasks/types.ts').YieldsDeclarative;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Task Todo (subtask checklist)                                      */
/* ------------------------------------------------------------------ */

/**
 * Execution phase of a todo item.
 *
 * Tasks are broken into three phases:
 *   - `pre`  — pre-checks: file existence, directory checks (cmd checks)
 *   - `main` — the actual agent execution
 *   - `post` — post-checks: build, tsc, AI quality checks
 *
 * This enables partial re-execution: if checks are added to a "done"
 * task, only the new pending items need to run.
 */
export type TodoPhase = 'pre' | 'main' | 'post';
export type TodoStatus = 'pending' | 'done' | 'failed' | 'skipped';

/**
 * A single todo item in the task's checklist.
 *
 * Stored as `todo.yaml` in the task directory.
 *
 * @example
 *   - id: pre:animations-md-exists
 *     title: "cmd: test -f docs/pages/slug/animations.md"
 *     phase: pre
 *     status: done
 *   - id: main
 *     title: "Execute task"
 *     phase: main
 *     status: done
 *   - id: post:build
 *     title: "check: build"
 *     phase: post
 *     status: pending
 */
export interface TodoItem {
  /** Unique ID within the task (e.g., "pre:file-exists", "main", "post:build") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Execution phase */
  phase: TodoPhase;
  /** Completion status */
  status: TodoStatus;
  /** Reference to check definition (for pre/post items) */
  check?: TaskYamlCheck;
  /** When this item was completed */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
}

export interface EpicYaml {
  title: string;
  gates?: Array<{ type: string; required?: boolean; completed?: boolean }>;
  constraints?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProjectYaml {
  name: string;
  description?: string;
  goal?: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}
