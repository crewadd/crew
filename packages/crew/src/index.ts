// ─── Core ────────────────────────────────────────────────────────
export type {
  BuildContext,
  CompoundTask,
  CompoundEpic,
  CompoundStatus,
  EpicDef,
  TaskDef,
  TaskResult,
  EpicResult,
  ProjectResult,
  VerificationIssue,
  VerificationCheck,
  VerificationReport,
} from './types.ts';

// ─── Manager (Store-based) ───────────────────────────────────────
export {
  createBuildContext,
  createEpic,
  addTask,
  editTask,
  statusJson,
  nextTasks,
} from './manager/index.ts';

// ─── Planner ─────────────────────────────────────────────────────
export { Planner } from './planner/index.ts';
export type { PlanInput, PlannerStrategy } from './planner/index.ts';

// ─── Executor ────────────────────────────────────────────────────
export { computeBatches, type TaskBatch } from './executor/index.ts';
export { executeBatchStreaming } from './executor/index.ts';

// ─── Verifier ────────────────────────────────────────────────────
export { verify, type VerifyOptions } from './verifier/index.ts';
export type { CheckPlugin } from './verifier/index.ts';
export { tscCheck, buildCheck, imagesCheck } from './verifier/index.ts';

// ─── Orchestrator ────────────────────────────────────────────────
export { ProjectOrchestrator } from './orchestrator/index.ts';
export { EpicOrchestrator } from './orchestrator/index.ts';
export type { OrchestratorEvent, ResumePoint, OrchestratorConfig } from './orchestrator/index.ts';
export { DEFAULT_ORCHESTRATOR_CONFIG } from './orchestrator/index.ts';

// ─── Config Loader ───────────────────────────────────────────────
export {
  loadConfig,
  hasConfig,
  findConfigFile,
  executeConfigInit,
  executeConfigFix,
} from './config-loader.ts';
export type {
  CrewConfig,
  CrewConfigContext,
  PlanDefinition,
  DeclarativeEpic,
  DeclarativeTask,
} from './config-loader.ts';

// ─── Plugins ────────────────────────────────────────────────────
export {
  loadPlugins,
  formatPluginList,
  listBuiltinPlugins,
  getBuiltinPluginDir,
} from './plugins/index.ts';

export type {
  CrewPlugin,
  PluginAPI,
  PluginEntry,
  PluginState,
  PluginManifest,
  HookEvent,
  HookFn,
  ToolFactory,
} from './plugins/index.ts';

// ─── Programmable Tasks ──────────────────────────────────────────
export * from './tasks/index.ts';

// ─── Status Check ───────────────────────────────────────────────
export {
  resolveNextIntent,
  formatIntent,
} from './status-check.ts';

export type {
  NextIntent,
  ResolvedTask,
  BlockDetails,
  StatusCheckOptions,
  StatusCheckStore,
} from './status-check.ts';

// ─── Session ─────────────────────────────────────────────────────
export { Session, type SessionData, type SessionStatus } from './session.ts';

// ─── Progress ────────────────────────────────────────────────────
export { ProgressLogger, type ProgressEntry } from './progress.ts';

// ─── Resume ──────────────────────────────────────────────────────
export { prepareResume, type ResumeState } from './resume.ts';

// ─── Store (HierarchicalStore - Source of Truth) ─────────────────
export {
  HierarchicalStore,
  slugify,
  numberedSlug,
  parseNumberedSlug,
  generateTreeView,
} from './store/hierarchical-store.ts';

export type {
  HierarchicalStoreConfig,
  TaskStatus,
} from './store/hierarchical-store.ts';

export type {
  Task,
  TaskId,
  Epic,
  EpicId,
  Agent,
  AgentId,
  Skill,
  SkillId,
  CrewProject,
  CrewState,
  CrewEvent,
} from './store/types.ts';

// ─── Review ─────────────────────────────────────────────────────
export {
  listReviews,
  saveReview,
  readSummary,
  writeSummary,
  submitReview,
  getReviewGates,
  collectReviewGates,
  collectReportPrompt,
  parseTimeout,
  transitionToReview,
} from './review/index.ts';

// ─── Views ───────────────────────────────────────────────────────
export {
  generateStateJson,
  writeStateJson,
  generatePlanReadme,
  writePlanReadme,
} from './views/index.ts';

export type { ViewableStore } from './views/index.ts';
