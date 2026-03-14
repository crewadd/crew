/**
 * Programmable Task System
 *
 * Export all task-related types and functions.
 */

// Types
export type {
  TaskContext,
  TaskState,
  TaskLogger,
  EpicContext,
  ProjectContext,
  AgentFn,
  AgentOptions,
  AgentResult,
  TaskTools,
  FileTools,
  ShellTools,
  ShellResult,
  GitTools,
  TaskDef,
  TaskProgram,
  TaskResult,
  TaskType,
  TaskTypeDefaults,
  EpicDef,
  EpicHooks,
  PlanDef,
  ProjectHooks,
  CheckRef,
  CheckResult,
  CheckPlugin,
  CheckRegistry,
  PromptCheck,
  CmdCheck,
  TaskConstraints,
  ExecutionFlow,
  ReviewGate,
  ReviewResult,
  YieldsConfig,
  YieldsFn,
  YieldsDeclarative,
  SpawnedTask,
  HarnessIssue,
  HarnessVerdict,
  TaskHarness,
  HarnessConfig,
} from './types.ts';

// Task Types Registry
export {
  registerTaskType,
  getTaskType,
  hasTaskType,
  listTaskTypes,
  extendTaskType,
  // Check registry
  registerCheck,
  registerChecks,
  getCheck,
  listChecks,
  // Check runner
  runCheck,
  runChecks,
  collectChecks,
  collectTaskReviewGates,
  collectTaskReportPrompt,
  type TaskTypeExtension,
} from './task-types.ts';

// Task Executor
export {
  createTaskContext,
  executeTask,
} from './executor.ts';

// Tools
export { createTools } from './tools.ts';

// Agent
export { createAgent } from './agent.ts';

// Harness
export {
  DefaultHarness,
  AutoHarness,
  createHarness,
  buildHarnessSynthesisPrompt,
  extractHarnessCode,
  executeHarnessCode,
  type DefaultHarnessOptions,
} from './harness.ts';

// Fluent Builder
export {
  TaskBuilder,
  PlanningBuilder,
  EpicBuilder,
  PlanBuilder,
  createTask,
  createEpic,
  createPlan,
  type TaskOptions,
} from './fluent-builder.ts';

// Task Expanders
export {
  registerExpander,
  expandTask,
  expandPlan,
  hasSubtasks,
  type TaskExpander,
  type ExpanderMatcher,
} from './expanders.ts';
