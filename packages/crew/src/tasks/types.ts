/**
 * Programmable Task System - Core Types
 *
 * Framework-agnostic orchestration types.
 * No language, framework, or process assumptions.
 *
 * Tasks are fully programmable with lifecycle hooks:
 *   Task Hook > Task Type Hook > Epic Hook > Project Hook
 *
 * Each task runs in its own TaskContext with access to:
 *   - AI agent (agentfn)
 *   - Tools (file, shell, git + project-provided extensions)
 *   - State
 *   - Parent epic/project context
 */

import type { BuildContext } from '../types.ts';

/* ------------------------------------------------------------------ */
/*  Task Context - Runtime environment for task execution             */
/* ------------------------------------------------------------------ */

export interface TaskContext {
  /** Unique task ID */
  readonly taskId: string;

  /** Task definition */
  readonly task: TaskDef;

  /** Compound task (from store) */
  readonly compoundTask: import('../types.ts').CompoundTask;

  /** Parent epic */
  readonly epic: EpicContext;

  /** Project context */
  readonly project: ProjectContext;

  /** Build context (file paths, etc) */
  readonly buildCtx: BuildContext;

  /** Task directory (for loading executors) */
  readonly taskDir: string;

  /** AI Agent function - delegates to agentfn */
  readonly agent: AgentFn;

  /** Available tools */
  readonly tools: TaskTools;

  /** Task-local state (persists during task execution) */
  readonly state: TaskState;

  /** Shared plan variables */
  readonly vars: Record<string, unknown>;

  /** Logger */
  readonly log: TaskLogger;
}

export interface EpicContext {
  readonly id: string;
  readonly title: string;
  readonly num: number;
  readonly tasks: TaskDef[];
}

export interface ProjectContext {
  readonly name: string;
  readonly title: string;
  readonly vars: Record<string, unknown>;
}

export interface TaskState {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
}

export interface TaskLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/* ------------------------------------------------------------------ */
/*  AI Agent Function                                                 */
/* ------------------------------------------------------------------ */

export type AgentFn = (
  prompt: string,
  opts?: AgentOptions
) => Promise<AgentResult>;

export interface AgentOptions {
  skill?: string;
  /** Multiple skills to load (alternative to single skill) */
  skills?: string[];
  /** Agent persona name (from .crew/agents/) */
  agent?: string;
  inputs?: string[];
  outputs?: string[];
  context?: Record<string, unknown>;
  timeout?: number;
  stream?: boolean;
  /**
   * Claude Code permission mode.
   * Use 'plan' for planning phase (read-only, no edits).
   */
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  /**
   * Resume a previous session by ID.
   * Used to continue from planning phase into execution phase.
   */
  resume?: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  files?: string[];
  durationMs: number;
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
  /** Session ID for sending follow-up feedback */
  sessionId?: string;
}

/* ------------------------------------------------------------------ */
/*  Task Tools                                                        */
/* ------------------------------------------------------------------ */

/**
 * Core tools provided by the framework.
 * Projects can extend with additional tools via setup.
 */
export interface TaskTools {
  /** File operations */
  file: FileTools;

  /** Shell execution */
  shell: ShellTools;

  /** Git operations */
  git: GitTools;

  /** Project-provided extensions */
  [key: string]: unknown;
}

export interface FileTools {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  glob(pattern: string): Promise<string[]>;
}

export interface ShellTools {
  run(command: string, opts?: { cwd?: string; env?: Record<string, string> }): Promise<ShellResult>;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitTools {
  status(): Promise<string>;
  diff(): Promise<string>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Checks                                                            */
/* ------------------------------------------------------------------ */

/**
 * Check result returned by a check function.
 */
export interface CheckResult {
  passed: boolean;
  output?: string;
  issues?: string[];
  /**
   * Structured feedback for the agent (used by the check→feedback→retry loop).
   * More actionable than raw output — tells the agent exactly what to fix.
   * AI-based checks populate this automatically from the evaluator's response.
   */
  feedback?: string;
}

/**
 * A check reference — how tasks declare what checks to run.
 *
 * Five forms:
 *   - string:   name-based, resolved from project's check registry
 *   - object:   name-based with options (autoFix, maxRetries)
 *   - inline:   function that runs the check directly
 *   - prompt:   AI-based evaluation — an agent evaluates the task output
 *               against the prompt criteria and returns pass/fail + feedback
 *   - cmd:      shell command — passes if exit code is 0, fails otherwise
 */
export type CheckRef =
  | string
  | { name: string; autoFix?: boolean; maxRetries?: number }
  | { fn: (ctx: TaskContext) => Promise<CheckResult> }
  | PromptCheck
  | CmdCheck;

/**
 * AI-based prompt check — uses a lightweight agentfn call to evaluate
 * whether the task output meets the criteria described in the prompt.
 *
 * The evaluator reads the task's output files, applies the prompt as
 * evaluation criteria, and returns a structured pass/fail with feedback.
 *
 * @example
 *   .check({ prompt: 'All React components must be exported as named exports' })
 *   .check({ prompt: 'The animation file must import from framer-motion', name: 'framer-check' })
 *   .check({ prompt: 'No TODO or FIXME comments in the output', files: ['src/app/page.tsx'] })
 */
export interface PromptCheck {
  /** Evaluation prompt — the criteria the AI checks against */
  prompt: string;
  /** Display name for logs. Default: first 40 chars of prompt */
  name?: string;
  /**
   * Specific files to evaluate. Default: task's declared outputs.
   * Glob patterns are expanded. Non-existent files are reported as issues.
   */
  files?: string[];
}

/**
 * Shell command check — runs a command and checks the exit code.
 *
 * Passes if exit code is 0. Fails otherwise, with stdout+stderr as feedback.
 * The command runs in the project root directory by default.
 *
 * @example
 *   .check({ cmd: 'test -f src/app/page.tsx' })
 *   .check({ cmd: 'ls src/components/', name: 'components-exist' })
 *   .check({ cmd: 'grep -q "export default" src/app/page.tsx', name: 'has-default-export' })
 */
export interface CmdCheck {
  /** Shell command to execute */
  cmd: string;
  /** Display name for logs. Default: the command itself (truncated) */
  name?: string;
  /** Working directory. Default: project root */
  cwd?: string;
}

/**
 * A check plugin registered at project level in .crew/setup.
 * The framework resolves named CheckRefs against these.
 */
export type CheckPlugin = (ctx: TaskContext) => Promise<CheckResult>;

/**
 * Project-level check registry.
 * Defined in .crew/setup/index.js as `export const checks = { ... }`
 */
export type CheckRegistry = Record<string, CheckPlugin>;

/* ------------------------------------------------------------------ */
/*  Programmable Task Definition                                      */
/* ------------------------------------------------------------------ */

export interface TaskDef {
  /** Task ID */
  id: string;

  /** Display title */
  title: string;

  /**
   * Task type — resolved from project-level type registry.
   * No built-in types. Projects define their own via setup.
   */
  type?: string;

  /** Optional tags for metadata/filtering (no behavioral coupling) */
  tags?: string[];

  /** Skill/agent to use for AI delegation */
  skill?: string;

  /** Multiple skills to load (alternative to single skill) */
  skills?: string[];

  /** Input files */
  inputs?: string[];

  /** Expected outputs */
  outputs?: string[];

  /** Dependencies */
  deps?: string[];

  /** Prompt for AI agent */
  prompt?: string;
  promptRef?: string;

  /** Prompt template file path (resolved at plan time) */
  promptTemplateFile?: string;

  /** Variables for templating */
  vars?: Record<string, unknown>;

  /** Checks to run after execution */
  checks?: CheckRef[];

  /**
   * Max check→feedback→retry attempts when checks fail.
   * The feedback loop is automatic when checks exist and a session is open.
   * Default: 3
   */
  maxAttempts?: number;

  /** Condition for task inclusion */
  when?: (vars: Record<string, unknown>) => boolean;

  /** External executor file path (relative to setup dir) */
  executorFilePath?: string;

  /** Executor code as string (alternative to executorFilePath) */
  executorCode?: string;

  /** Custom programmable behavior (overrides type defaults) */
  program?: TaskProgram;

  /** Execution constraints and flow control */
  constraints?: TaskConstraints;

  /** Execution flow pattern */
  flow?: ExecutionFlow;

  /** Report prompt — instructions for generating a structured task completion report */
  reportPrompt?: string;

  /** Review gate — requires approval before task completes */
  review?: ReviewGate | ReviewGate[];

  /** Planning config — enables plan-then-execute pattern */
  planning?: PlanningConfig;

  /** Yields config — enables incremental planning (dynamic follow-up tasks) */
  yields?: YieldsConfig;

  /**
   * AutoHarness config — LLM-synthesized validation policy.
   *
   * When set, the framework generates a semantic validator from the task
   * prompt/inputs before execution. The generated harness runs alongside
   * hand-coded checks (tsc, build) to catch domain-specific errors.
   *
   * @see HarnessConfig
   */
  harness?: HarnessConfig;
}

/* ------------------------------------------------------------------ */
/*  Planning Config                                                   */
/* ------------------------------------------------------------------ */

/**
 * Planning configuration — enables a plan-then-execute pattern.
 *
 * When a task has planning enabled, execution becomes two phases:
 *   1. **Plan phase**: Agent creates an implementation plan (no code changes)
 *   2. **Execute phase**: Agent executes the approved plan
 *
 * The plan is saved to the task directory as `plan.md` for auditability.
 *
 * Builder API:
 *   - `.planning()`              → auto-approve: plan + execute in one shot
 *   - `.planning().review()`     → human review: save plan.md, close session, wait
 *   - `.planning().review('agent')` → agent writes review.md, then wait for human
 *
 * Approval modes:
 *   - `'auto'` (default): Plan is auto-approved, execution proceeds immediately
 *   - `'review'`: Plan saved, session closes, human reviews plan.md offline
 *   - `'agent'`: Agent reviews plan and writes review.md, then waits for human
 */
export interface PlanningConfig {
  /** Whether planning is enabled. Default: false */
  enabled: boolean;

  /** Approval mode after plan is generated. Default: 'auto' */
  approval?: 'auto' | 'review' | 'agent';

  /** Custom prompt for the planning phase (prepended to task prompt) */
  prompt?: string;

  /** Agent persona for plan review (when approval is 'agent') */
  reviewAgent?: string;

  /** Maximum planning iterations before giving up. Default: 1 */
  maxIterations?: number;

  /**
   * Whether to close the session after saving the plan (for human review).
   * When true, the executor saves plan.md and returns early so the human
   * can review offline. The task resumes on next run if plan.md exists.
   * Default: true when approval is 'review' or 'agent'.
   */
  closeSession?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Yields Config — Incremental Planning                              */
/* ------------------------------------------------------------------ */

/**
 * Yields configuration — enables incremental, elastic planning.
 *
 * When a task completes successfully, it can dynamically generate follow-up
 * tasks based on its output. This creates a "plan-as-you-go" pattern where
 * each task can shape the remainder of the plan.
 *
 * Two modes:
 *
 * 1. **Programmatic** — A function that receives the task context and result,
 *    reads outputs, and returns TaskDef[]:
 *
 *    ```ts
 *    .yields(async (ctx, result) => {
 *      const doc = await ctx.tools.file.read('docs/animations.md');
 *      return parseAnimationGroups(doc).map(group =>
 *        ctx.createTask(`impl-${group.id}`, `Implement ${group.name}`)
 *          .skill('animation-implement')
 *          .inputs(['docs/animations.md'])
 *          .build()
 *      );
 *    })
 *    ```
 *
 * 2. **AI-driven** — An agent analyzes the task output and produces a
 *    structured plan of follow-up tasks:
 *
 *    ```ts
 *    .yields({
 *      plan: 'Based on the animation spec, create one task per animation group',
 *      skill: 'planner',
 *    })
 *    ```
 *
 * Yielded tasks are injected into the plan at runtime:
 *   - `target: 'current-epic'` — appended to the current epic (default)
 *   - `target: 'next-epic'` — creates a new epic after the current one
 *   - `target: { epic: 'my-epic-id' }` — appended to a specific epic
 *
 * Flow: task completes → yields resolves → orchestrator injects → execution continues
 */
export type YieldsConfig =
  | YieldsFn
  | YieldsDeclarative;

/**
 * Programmatic yields — a function that generates follow-up tasks.
 *
 * Receives the full task context and result, can read files, inspect
 * output, and return any number of TaskDef[].
 */
export type YieldsFn = (
  ctx: TaskContext,
  result: TaskResult,
) => TaskDef[] | Promise<TaskDef[]>;

/**
 * Declarative yields — AI-driven or template-based follow-up task generation.
 */
export interface YieldsDeclarative {
  /**
   * AI planning prompt. The agent reads the task's output files and this
   * prompt to generate a list of follow-up tasks.
   *
   * The agent response must be structured task definitions (parsed by the framework).
   */
  plan?: string;

  /**
   * Skill/agent to use for AI-driven planning.
   * Defaults to the task's own skill if not specified.
   */
  skill?: string;

  /**
   * Static list of task templates to spawn. Each template is expanded with
   * the parent task's vars and output.
   */
  tasks?: TaskDef[];

  /**
   * Where to inject the yielded tasks.
   *   - `'current-epic'` (default) — append to the current epic
   *   - `'next-epic'` — create a new epic titled "{task.title} — Follow-up"
   *   - `{ epic: string }` — append to a named epic
   */
  target?: 'current-epic' | 'next-epic' | { epic: string };

  /**
   * Condition for yielding. Only spawn follow-up tasks if this returns true.
   * Default: yield only on success.
   */
  when?: (result: TaskResult) => boolean;

  /**
   * Approval mode for yielded tasks.
   *   - `'auto'` (default) — tasks are immediately added and executed
   *   - `'review'` — tasks are saved to a plan file for human review
   */
  approval?: 'auto' | 'review';

  /**
   * Maximum number of tasks that can be yielded. Safety limit.
   * Default: 20
   */
  maxTasks?: number;

  /**
   * Checks to apply to ALL yielded tasks. Ensures every spawned task
   * is verifiable. These are merged with any per-task checks from AI planning.
   *
   * @example
   *   .yields({ plan: '...', checks: ['build', 'tsc'] })
   */
  checks?: CheckRef[];

  /**
   * Task type to apply to all yielded tasks.
   * Inherits the type's default checks, skill, and hooks.
   *
   * @example
   *   .yields({ plan: '...', taskType: 'coding' })
   */
  taskType?: string;
}

/**
 * Spawned task — a task definition with metadata about its origin.
 * Returned in TaskResult.spawnedTasks after yields resolution.
 */
export interface SpawnedTask {
  /** The task definition to create */
  task: TaskDef;

  /** ID of the parent task that spawned this */
  parentTaskId: string;

  /** Where to inject this task */
  target: 'current-epic' | 'next-epic' | { epic: string };
}

/* ------------------------------------------------------------------ */
/*  Review Gate                                                       */
/* ------------------------------------------------------------------ */

/** Review gate — a checkpoint requiring explicit approval before task completes */
export interface ReviewGate {
  /** Who reviews: a human or an AI agent */
  type: 'human' | 'agent';

  /** Prompt/instructions for the reviewer */
  prompt?: string;

  /** Agent persona name (for type: 'agent') — loads .crew/agents/{name}.md */
  agent?: string;

  /** Assignee hint for human review (informational) */
  assignee?: string;

  /** Timeout before auto-action. Format: "1h", "24h", "7d" */
  timeout?: string;

  /** Action on timeout: 'approve' | 'reject'. Default: 'reject' */
  onTimeout?: 'approve' | 'reject';

  /** For agent reviews: auto-approve if agent says approve, or still require human confirmation */
  autoApprove?: boolean;
}

/** Result of a review decision */
export interface ReviewResult {
  /** The decision */
  decision: 'approve' | 'request-changes' | 'reject';

  /** Who made the decision */
  reviewer: string;

  /** Feedback — injected into task context on request-changes */
  feedback?: string;

  /** When the review happened */
  at: string;

  /** Review type */
  type: 'human' | 'agent';
}

/* ------------------------------------------------------------------ */
/*  Harness — AutoHarness pattern                                     */
/* ------------------------------------------------------------------ */

/**
 * A single issue found by the harness validator.
 */
export interface HarnessIssue {
  /** Human-readable description */
  message: string;
  /** Severity: errors block acceptance, warnings don't */
  severity: 'error' | 'warning';
  /** Optional file path where the issue was found */
  file?: string;
  /** Optional line number */
  line?: number;
}

/**
 * Verdict returned by the harness `validate` step.
 *
 * Maps to AutoHarness's `is_legal_action(obs, action) → bool`
 * but with richer feedback for the `refine` step.
 */
export interface HarnessVerdict {
  /** Whether the proposal is accepted (all errors resolved) */
  accepted: boolean;
  /** Issues found during validation */
  issues: HarnessIssue[];
  /**
   * Heuristic score in [0, 1] for tree search ranking.
   * 1.0 = perfect, 0.0 = completely invalid.
   * Used by Thompson sampling to choose which branch to refine.
   */
  score: number;
}

/**
 * The harness execution interface — the core abstraction.
 *
 * Every task runs through a harness: propose → validate → refine → repeat.
 * The default harness wraps the existing executor behavior.
 * AutoHarness (.harness()) generates the validate step via LLM.
 */
export interface TaskHarness {
  /** Generate candidate output — the agent's proposal (propose_action) */
  propose(ctx: TaskContext): Promise<TaskResult>;

  /** Validate the proposal — the harness policy (is_legal_action) */
  validate(ctx: TaskContext, result: TaskResult): Promise<HarnessVerdict>;

  /** Refine on rejection — feedback to the agent */
  refine(ctx: TaskContext, verdict: HarnessVerdict): Promise<void>;
}

/**
 * Configuration for AutoHarness — LLM-synthesized validation policy.
 *
 * When a task has `.harness()`, the framework uses the LLM to generate
 * a validation function before execution. This function checks semantic
 * correctness beyond what `tsc`/`build` can catch.
 *
 * Credits the AutoHarness paper (arXiv:2603.03329) which demonstrated
 * that LLMs can synthesize their own code harnesses to prevent invalid
 * actions, achieving 100% legal action rate across 145 TextArena games.
 *
 * @see https://arxiv.org/abs/2603.03329
 */
export interface HarnessConfig {
  /** Source for deriving the harness. Default: 'task-prompt' */
  from?: 'task-prompt' | 'inputs' | 'outputs';
  /** Custom prompt for harness generation (overrides from) */
  prompt?: string;
  /** Allow the harness itself to be refined on false positives/negatives. Default: false */
  refinable?: boolean;
  /** Cache the generated harness for reuse across similar tasks. Default: false */
  cache?: boolean;
  /** Max iterations for harness refinement. Default: 5 */
  maxRefinements?: number;
}

/* ------------------------------------------------------------------ */
/*  Task Constraints & Flow                                           */
/* ------------------------------------------------------------------ */

export interface TaskConstraints {
  sequential?: boolean;
  parallel?: boolean;
  blocking?: string[];
  blockedBy?: string[];
  condition?: string | ((vars: Record<string, unknown>) => boolean);
  maxParallel?: number;
  priority?: number;
}

export interface ExecutionFlow {
  type: 'sequence' | 'parallel' | 'conditional' | 'fanOut' | 'fanIn' | 'dag';
  branches?: string[];
  syncBarrier?: string[];
  condition?: string | ((vars: Record<string, unknown>) => boolean);
  edges?: Array<{ from: string; to: string }>;
}

/**
 * Programmable task behavior
 * Any hook not provided falls back to task type defaults
 */
export interface TaskProgram {
  shouldStart?(ctx: TaskContext): boolean | Promise<boolean>;
  onStart?(ctx: TaskContext): void | Promise<void>;
  execute?(ctx: TaskContext): Promise<TaskResult>;
  onComplete?(ctx: TaskContext, result: TaskResult): void | Promise<void>;
  onFail?(ctx: TaskContext, error: Error): void | Promise<void>;
  expand?(parent: TaskDef): TaskDef[] | undefined;
}

export interface TaskResult {
  success: boolean;
  durationMs: number;
  output?: string;
  error?: string;
  files?: string[];
  metadata?: Record<string, unknown>;

  /**
   * Tasks spawned via incremental planning (yields).
   * Populated by the executor after successful task completion.
   * The orchestrator reads these and injects them into the plan.
   */
  spawnedTasks?: SpawnedTask[];
}

/* ------------------------------------------------------------------ */
/*  Task Type - Project-defined shared behavior                       */
/* ------------------------------------------------------------------ */

/**
 * Task type definition — registered at project level via .crew/setup.
 * The framework provides the registry mechanism but ships zero built-in types.
 */
export interface TaskType {
  readonly name: string;
  readonly description?: string;
  readonly defaults: TaskTypeDefaults;
  readonly checks?: CheckRef[];
  /** Default report prompt for tasks of this type */
  readonly reportPrompt?: string;
  /** Default review gate for tasks of this type */
  readonly review?: ReviewGate;
}

export interface TaskTypeDefaults {
  skill?: string;
  shouldStart?(ctx: TaskContext): boolean | Promise<boolean>;
  onStart?(ctx: TaskContext): void | Promise<void>;
  execute?(ctx: TaskContext): Promise<TaskResult>;
  onComplete?(ctx: TaskContext, result: TaskResult): void | Promise<void>;
  onFail?(ctx: TaskContext, error: Error): void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Epic & Plan                                                       */
/* ------------------------------------------------------------------ */

export interface EpicDef {
  id: string;
  title: string;
  tasks: TaskDef[];
  basePath?: string;
  hooks?: EpicHooks;
}

export interface EpicHooks {
  onStart?(ctx: TaskContext): void | Promise<void>;
  onComplete?(ctx: TaskContext, results: TaskResult[]): void | Promise<void>;
}

export interface PlanDef {
  title: string;
  vars?: Record<string, unknown>;
  epics: EpicDef[];
  hooks?: ProjectHooks;
}

export interface ProjectHooks {
  onStart?(ctx: TaskContext): void | Promise<void>;
  onComplete?(ctx: TaskContext, results: TaskResult[]): void | Promise<void>;
}
