/**
 * Plugin API Implementation
 *
 * Bridges plugin calls to existing crew registries.
 * Each plugin gets its own PluginAPIImpl instance that tracks
 * what the plugin contributed (for manifest generation).
 */

import type {
  PluginAPI,
  HookEvent,
  HookFn,
  ToolFactory,
  PluginState,
  PluginManifest,
} from './types.ts';
import type { TaskType, CheckPlugin, CheckRegistry } from '../tasks/types.ts';
import type { TaskTypeExtension } from '../tasks/task-types.ts';
import { registerCheck, registerChecks, registerTaskType, extendTaskType } from '../tasks/task-types.ts';

export class PluginAPIImpl implements PluginAPI {
  readonly options: Record<string, unknown>;
  readonly projectDir: string;

  private _state: PluginState;
  private _pluginName: string;

  // Track contributions for manifest
  private _checks: string[] = [];
  private _taskTypes: string[] = [];
  private _extendedTypes: string[] = [];
  private _hooks: HookEvent[] = [];
  private _vars: string[] = [];
  private _tools: string[] = [];

  constructor(
    pluginName: string,
    projectDir: string,
    options: Record<string, unknown>,
    state: PluginState,
  ) {
    this._pluginName = pluginName;
    this.projectDir = projectDir;
    this.options = options;
    this._state = state;
  }

  addCheck(name: string, plugin: CheckPlugin): void {
    registerCheck(name, plugin);
    this._checks.push(name);
  }

  addChecks(checks: CheckRegistry): void {
    registerChecks(checks);
    this._checks.push(...Object.keys(checks));
  }

  addTaskType(type: TaskType): void {
    registerTaskType(type);
    this._taskTypes.push(type.name);
  }

  extendTaskType(name: string, extension: TaskTypeExtension): void {
    extendTaskType(name, extension);
    if (!this._extendedTypes.includes(name)) {
      this._extendedTypes.push(name);
    }
  }

  addHook(event: HookEvent, fn: HookFn): void {
    const hooks = this._state.hooks.get(event) || [];
    hooks.push(fn);
    this._state.hooks.set(event, hooks);
    if (!this._hooks.includes(event)) {
      this._hooks.push(event);
    }
  }

  addVars(vars: Record<string, unknown>): void {
    Object.assign(this._state.vars, vars);
    this._vars.push(...Object.keys(vars));
  }

  addTool(name: string, factory: ToolFactory): void {
    this._state.tools.set(name, factory);
    this._tools.push(name);
  }

  getVar(key: string): unknown {
    return this._state.vars[key];
  }

  hasPlugin(name: string): boolean {
    return this._state.loaded.includes(name);
  }

  /**
   * Build a manifest of what this plugin contributed.
   * Used for CLI display and debugging.
   */
  buildManifest(plugin: { name: string; version: string; description?: string; requires?: string[] }): PluginManifest {
    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      requires: plugin.requires,
      checks: this._checks,
      taskTypes: this._taskTypes,
      extendedTypes: this._extendedTypes,
      hooks: this._hooks,
      vars: this._vars,
      tools: this._tools,
    };
  }
}
