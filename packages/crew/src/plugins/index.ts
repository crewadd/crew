/**
 * Plugin System — Public API
 *
 * Re-exports everything needed to create, load, and inspect plugins.
 */

export type {
  CrewPlugin,
  PluginAPI,
  PluginEntry,
  PluginState,
  PluginManifest,
  HookEvent,
  HookFn,
  ToolFactory,
} from './types.ts';

export { loadPlugins, formatPluginList } from './loader.ts';
export { getBuiltinPlugin, listBuiltinPlugins, getBuiltinPluginDir } from './builtins/index.ts';
