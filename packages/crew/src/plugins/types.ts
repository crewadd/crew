/**
 * Plugin System — Core Types
 *
 * Plugins are reusable configuration units that contribute checks,
 * task types, hooks, vars, and tools to a crew project.
 *
 * Users stack plugins in crew.json:
 *   { "plugins": ["typescript", "nextjs", "git", "docker"] }
 *
 * The framework deep-merges contributions in declaration order.
 */

import type { TaskType, CheckPlugin, CheckRegistry, CheckRef, TaskContext, TaskResult } from '../tasks/types.ts';
import type { TaskTypeExtension } from '../tasks/task-types.ts';

/* ------------------------------------------------------------------ */
/*  Plugin Definition                                                  */
/* ------------------------------------------------------------------ */

/**
 * A crew plugin — the unit of reusable configuration.
 *
 * Plugins register checks, task types, hooks, vars, and tools
 * via the PluginAPI passed to their setup() function.
 */
export interface CrewPlugin {
  /** Unique plugin name (e.g., "typescript", "nextjs") */
  name: string;

  /** Semver version */
  version: string;

  /** Human-readable description */
  description?: string;

  /** Plugins this one requires to be loaded first */
  requires?: string[];

  /**
   * Called during plugin initialization.
   * Receives the plugin API for registering checks, types, hooks, etc.
   */
  setup(api: PluginAPI): void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Plugin API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Hook event names for project-level lifecycle hooks.
 */
export type HookEvent =
  | 'beforeTask'
  | 'afterTask'
  | 'beforeEpic'
  | 'afterEpic'
  | 'beforePlan'
  | 'afterPlan'
  | 'onTaskFail';

/**
 * A lifecycle hook function.
 */
export type HookFn = (ctx: TaskContext, ...args: unknown[]) => void | Promise<void>;

/**
 * Factory function for creating tools injected into TaskContext.
 */
export type ToolFactory = (ctx: TaskContext) => unknown;

/**
 * The surface plugins use to contribute configuration.
 *
 * All calls bridge directly to the existing registries —
 * no new abstraction layer is created.
 */
export interface PluginAPI {
  /** Options passed from crew.json plugin configuration */
  readonly options: Record<string, unknown>;

  /** Project root path */
  readonly projectDir: string;

  /** Register a named check */
  addCheck(name: string, plugin: CheckPlugin): void;

  /** Register multiple named checks */
  addChecks(checks: CheckRegistry): void;

  /** Register a task type */
  addTaskType(type: TaskType): void;

  /** Extend an existing task type with additional hooks/checks */
  extendTaskType(name: string, extension: TaskTypeExtension): void;

  /** Register a project-level lifecycle hook */
  addHook(event: HookEvent, fn: HookFn): void;

  /** Set default plan variables */
  addVars(vars: Record<string, unknown>): void;

  /** Register a custom tool available in TaskContext.tools */
  addTool(name: string, factory: ToolFactory): void;

  /** Read a var set by a previously loaded plugin */
  getVar(key: string): unknown;

  /** Check if another plugin is loaded */
  hasPlugin(name: string): boolean;
}

/* ------------------------------------------------------------------ */
/*  Plugin Entry (crew.json format)                                    */
/* ------------------------------------------------------------------ */

/**
 * How a plugin is specified in crew.json.
 *
 * Three forms:
 *   - string:   "typescript" (name only, no options)
 *   - tuple:    ["nextjs", { appDir: true }] (name + options)
 *   - object:   { name: "docker", options: { registry: "..." } }
 */
export type PluginEntry =
  | string
  | [string, Record<string, unknown>]
  | { name: string; options?: Record<string, unknown> };

/* ------------------------------------------------------------------ */
/*  Plugin Registry State                                              */
/* ------------------------------------------------------------------ */

/**
 * Accumulated state from all loaded plugins.
 * Used by the config loader to apply plugin contributions.
 */
export interface PluginState {
  /** Merged plan variables from all plugins */
  vars: Record<string, unknown>;

  /** Accumulated hooks by event name */
  hooks: Map<HookEvent, HookFn[]>;

  /** Registered tool factories */
  tools: Map<string, ToolFactory>;

  /** Names of loaded plugins in order */
  loaded: string[];

  /** Plugin metadata for CLI display */
  manifests: PluginManifest[];
}

/**
 * Metadata about a loaded plugin for display purposes.
 */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  requires?: string[];
  checks: string[];
  taskTypes: string[];
  extendedTypes: string[];
  hooks: HookEvent[];
  vars: string[];
  tools: string[];
}
