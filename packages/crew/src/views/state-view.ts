/**
 * State View - Generate state.json summary
 *
 * Delegates to the core fs/views.ts generator, bridging from
 * ViewableStore → filesystem root path.
 */

import { join } from 'node:path';
import { generateStateJson as coreGenerateStateJson } from '../store/fs/views.ts';
import type { ViewableStore } from './types.ts';

/**
 * Resolve the .crew root directory from a ViewableStore.
 */
function resolveCrewRoot(store: ViewableStore): string {
  return store.planDirOverride
    ? join(store.planDirOverride, '..')   // planDirOverride points to epics dir
    : join(store.rootDir, '.crew');
}

/**
 * Generate state.json summary (returns JSON string).
 *
 * Delegates to the core filesystem-native generator and
 * JSON-stringifies the result.
 */
export function generateStateJson(store: ViewableStore): string {
  const root = resolveCrewRoot(store);
  const state = coreGenerateStateJson(root);
  return JSON.stringify(state, null, 2);
}
