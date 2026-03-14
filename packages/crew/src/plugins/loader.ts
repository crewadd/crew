/**
 * Plugin Loader
 *
 * Resolves, orders, and initializes plugins from crew.json.
 *
 * Resolution order:
 *   1. Project-local plugins (.crew/plugins/{name}/)
 *   2. Built-in plugins (bundled with crew)
 *   3. Local file paths (relative to crew.json)
 *   4. npm packages (from node_modules)
 *
 * Plugins are loaded in declaration order after topological sort
 * respects `requires` dependencies.
 */

import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import type { CrewPlugin, PluginEntry, PluginState, HookEvent } from './types.ts';
import { PluginAPIImpl } from './api.ts';
import { getBuiltinPlugin } from './builtins/index.ts';

/* ------------------------------------------------------------------ */
/*  Plugin Entry Parsing                                               */
/* ------------------------------------------------------------------ */

interface ParsedEntry {
  name: string;
  options: Record<string, unknown>;
}

function parseEntry(entry: PluginEntry): ParsedEntry {
  if (typeof entry === 'string') {
    return { name: entry, options: {} };
  }
  if (Array.isArray(entry)) {
    return { name: entry[0], options: entry[1] || {} };
  }
  return { name: entry.name, options: entry.options || {} };
}

/* ------------------------------------------------------------------ */
/*  Plugin Resolution                                                  */
/* ------------------------------------------------------------------ */

async function resolvePlugin(name: string, projectDir: string): Promise<CrewPlugin> {
  // 1. Project-local plugin in .crew/plugins/{name}/
  const crewPluginDir = join(projectDir, '.crew', 'plugins', name);
  const crewPluginIndex = join(crewPluginDir, 'index.ts');
  const crewPluginIndexJs = join(crewPluginDir, 'index.js');
  const localPath = existsSync(crewPluginIndex) ? crewPluginIndex
    : existsSync(crewPluginIndexJs) ? crewPluginIndexJs
    : null;

  if (localPath) {
    const mod = await import(pathToFileURL(localPath).href);
    const plugin = mod.default || mod;
    validatePlugin(plugin, name);
    return plugin;
  }

  // 2. Built-in plugin (fallback when not copied to project)
  const builtin = getBuiltinPlugin(name);
  if (builtin) return builtin;

  // 3. Local file path (starts with ./ or ../ or /)
  if (name.startsWith('./') || name.startsWith('../') || name.startsWith('/')) {
    const absPath = resolve(projectDir, name);
    if (!existsSync(absPath)) {
      throw new Error(`Plugin file not found: ${absPath}`);
    }
    const mod = await import(pathToFileURL(absPath).href);
    const plugin = mod.default || mod;
    validatePlugin(plugin, name);
    return plugin;
  }

  // 4. npm package
  try {
    const mod = await import(name);
    const plugin = mod.default || mod;
    validatePlugin(plugin, name);
    return plugin;
  } catch (err) {
    throw new Error(
      `Plugin "${name}" not found. Checked:\n` +
      `  - .crew/plugins/${name}/\n` +
      `  - Built-in plugins\n` +
      `  - Local file "${name}"\n` +
      `  - npm package "${name}"\n\n` +
      `Install it with: npm install ${name}\n` +
      `Or create a local plugin in .crew/plugins/${name}/.`
    );
  }
}

function validatePlugin(plugin: unknown, source: string): asserts plugin is CrewPlugin {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error(`Plugin "${source}" does not export a valid plugin object.`);
  }
  const p = plugin as Record<string, unknown>;
  if (typeof p.name !== 'string' || !p.name) {
    throw new Error(`Plugin "${source}" is missing a "name" field.`);
  }
  if (typeof p.version !== 'string' || !p.version) {
    throw new Error(`Plugin "${source}" is missing a "version" field.`);
  }
  if (typeof p.setup !== 'function') {
    throw new Error(`Plugin "${source}" is missing a "setup" function.`);
  }
}

/* ------------------------------------------------------------------ */
/*  Dependency Resolution (Topological Sort)                           */
/* ------------------------------------------------------------------ */

interface ResolvedPlugin {
  plugin: CrewPlugin;
  options: Record<string, unknown>;
}

function topologicalSort(
  plugins: ResolvedPlugin[],
): ResolvedPlugin[] {
  const nameToPlugin = new Map<string, ResolvedPlugin>();
  for (const rp of plugins) {
    nameToPlugin.set(rp.plugin.name, rp);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: ResolvedPlugin[] = [];

  function visit(name: string, chain: string[]): void {
    if (visited.has(name)) return;

    if (visiting.has(name)) {
      throw new Error(
        `Circular plugin dependency detected: ${[...chain, name].join(' → ')}`
      );
    }

    const rp = nameToPlugin.get(name);
    if (!rp) return; // dependency not in list — will be caught later

    visiting.add(name);

    for (const req of rp.plugin.requires || []) {
      if (!nameToPlugin.has(req)) {
        throw new Error(
          `Plugin "${name}" requires "${req}", but it is not in the plugins list.\n` +
          `Add "${req}" before "${name}" in crew.json plugins array.`
        );
      }
      visit(req, [...chain, name]);
    }

    visiting.delete(name);
    visited.add(name);
    sorted.push(rp);
  }

  for (const rp of plugins) {
    visit(rp.plugin.name, []);
  }

  return sorted;
}

/* ------------------------------------------------------------------ */
/*  Plugin Loading                                                     */
/* ------------------------------------------------------------------ */

/**
 * Load and initialize all plugins from crew.json plugin entries.
 *
 * Returns the accumulated PluginState with all merged contributions.
 */
export async function loadPlugins(
  entries: PluginEntry[],
  projectDir: string,
): Promise<PluginState> {
  const state: PluginState = {
    vars: {},
    hooks: new Map(),
    tools: new Map(),
    loaded: [],
    manifests: [],
  };

  if (!entries || entries.length === 0) return state;

  // Parse entries
  const parsed = entries.map(parseEntry);

  // Resolve all plugins
  const resolved: ResolvedPlugin[] = [];
  for (const { name, options } of parsed) {
    const plugin = await resolvePlugin(name, projectDir);
    resolved.push({ plugin, options });
  }

  // Topological sort (respects `requires`)
  const sorted = topologicalSort(resolved);

  // Initialize plugins in order
  for (const { plugin, options } of sorted) {
    const api = new PluginAPIImpl(plugin.name, projectDir, options, state);

    await plugin.setup(api);

    state.loaded.push(plugin.name);
    state.manifests.push(api.buildManifest(plugin));
  }

  return state;
}

/**
 * Format plugin state for CLI display.
 */
export function formatPluginList(state: PluginState): string {
  if (state.manifests.length === 0) {
    return 'No plugins loaded.';
  }

  const lines: string[] = [`Plugins (${state.manifests.length}):`];

  for (const m of state.manifests) {
    const req = m.requires?.length ? ` (requires: ${m.requires.join(', ')})` : '';
    lines.push(`  ${m.name}@${m.version}${m.description ? ` — ${m.description}` : ''}${req}`);

    const details: string[] = [];
    if (m.checks.length) details.push(`checks: ${m.checks.join(', ')}`);
    if (m.taskTypes.length) details.push(`types: ${m.taskTypes.join(', ')}`);
    if (m.extendedTypes.length) details.push(`extends: ${m.extendedTypes.map(t => `${t}`).join(', ')}`);
    if (m.hooks.length) details.push(`hooks: ${m.hooks.join(', ')}`);
    if (m.tools.length) details.push(`tools: ${m.tools.join(', ')}`);

    for (const d of details) {
      lines.push(`    ${d}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
