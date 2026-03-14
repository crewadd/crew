/**
 * Views — Central export for all view generation functionality
 *
 * Two layers:
 *   Core      — filesystem-native generators (take directory paths)
 *   Dedicated — rich generators (take ViewableStore / context objects)
 */

// ─── Types ──────────────────────────────────────────────────────────
export type { ViewableStore, Task, Epic, CrewProject } from './types.ts';
export type { TaskViewContext } from './task-view.ts';
export type { EpicViewContext } from './epic-view.ts';

// ─── Core generators (re-exported from fs/views.ts) ─────────────────
export {
  generateTaskReadme as coreTaskReadme,
  generateEpicReadme as coreEpicReadme,
  generatePlanReadme as corePlanReadme,
  generateStateJson as coreStateJson,
} from '../store/fs/views.ts';

// ─── Dedicated generators (rich, context-aware) ─────────────────────
export { generatePlanReadme } from './plan-view.ts';
export { generateStateJson } from './state-view.ts';
export { generateTaskReadme } from './task-view.ts';
export { generateEpicReadme } from './epic-view.ts';

// ─── Writers (ViewableStore → disk) ─────────────────────────────────
export {
  writeStateJson,
  writePlanReadme,
  writeEpicReadme,
  writeCoreTaskReadme,
  writeCoreEpicReadme,
  writeCorePlanReadme,
  writeCoreStateJson,
} from './writers.ts';
