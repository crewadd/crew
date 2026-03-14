/**
 * Store - Source of Truth
 *
 * .crew/ directory contains JSON files that are the source of truth.
 * Views (state.json, plan/README.md) are auto-generated from this data.
 */

// Types
export type {
  Task,
  TaskId,
  TaskView,
  TaskQuery,
  StatusChange,
  Attempt,
  Epic,
  EpicId,
  Gate,
  Agent,
  AgentId,
  AgentFile,
  Skill,
  SkillId,
  SkillFile,
  SkillExample,
  CrewProject,
  CrewState,
  WorkflowStep,
  CrewEvent,
  BaseEvent,
  ProjectEvent,
  EpicEvent,
  TaskEvent,
  AgentEvent,
  SkillEvent,
  StoreConfig,
  SyncResult,
  LegacyTaskId,
  LegacyMapping,
} from './types.ts';

export { DEFAULT_CONFIG } from './types.ts';

// Hierarchical Store (Primary — now backed by FsStore)
export {
  HierarchicalStore,
  slugify,
  numberedSlug,
  parseNumberedSlug,
  generateTreeView,
} from './hierarchical-store.ts';

export type {
  HierarchicalStoreConfig,
  TaskStatus,
} from './hierarchical-store.ts';

// FsStore (filesystem-native store)
export { FsStore } from './fs/index.ts';
export type { EpicInfo, CreateEpicConfig, TaskInfo, CreateTaskConfig } from './fs/index.ts';
export type { FsStoreStats } from './fs/index.ts';

// Views
export {
  generateStateJson,
  writeStateJson,
  generatePlanReadme,
  writePlanReadme,
} from '../views/index.ts';

export type { ViewableStore } from '../views/index.ts';

// Status
export {
  generateStatus,
  generateStatusJson,
  generateStatusMinimal,
  generateStatusInline,
} from '../cli/status-cmd.ts';
