/**
 * Fluent Builder API for Programmable Tasks
 *
 * Single entry point: ctx.createTask(id, title)
 * Everything is chainable. No fixed types, no fixed checks.
 *
 *   ctx.createTask('install', 'Install dependencies')
 *     .skill('repo/install')
 *     .inputs(['package.json'])
 *     .prompt('Install all deps')
 *     .check('build')
 *     .check('tsc', { autoFix: true, maxRetries: 3 })
 *
 * Task types are project-defined and applied via .ofType():
 *
 *   ctx.createTask('api', 'Build API')
 *     .ofType('coding')        // project-defined type
 *     .check('tsc')
 */

import type {
  TaskDef,
  TaskProgram,
  TaskResult,
  TaskContext,
  CheckRef,
  PromptCheck,
  CmdCheck,
  EpicDef,
  PlanDef,
  ReviewGate,
  PlanningConfig,
  YieldsConfig,
  YieldsFn,
  YieldsDeclarative,
  HarnessConfig,
} from './types.ts';
import { TASK_COMPLETION_PROMPT } from './feedback.ts';

/* ------------------------------------------------------------------ */
/*  Task Builder                                                      */
/* ------------------------------------------------------------------ */

export class TaskBuilder {
  private _task: Partial<TaskDef> = {};
  private _program: TaskProgram = {};
  private _checks: CheckRef[] = [];

  constructor(id: string, title: string) {
    this._task.id = id;
    this._task.title = title;
  }

  /** Set task type (resolved from project-level registry) */
  type(typeName: string): this {
    this._task.type = typeName;
    return this;
  }

  /** Alias for type() — more fluent syntax */
  ofType(typeName: string): this {
    return this.type(typeName);
  }

  /** Add metadata tag (no behavioral coupling) */
  tag(tagName: string): this {
    this._task.tags = this._task.tags || [];
    if (!this._task.tags.includes(tagName)) {
      this._task.tags.push(tagName);
    }
    return this;
  }

  /** Add multiple metadata tags */
  tags(tagNames: string[]): this {
    for (const t of tagNames) {
      this.tag(t);
    }
    return this;
  }

  /** Set skill/agent for AI delegation */
  skill(skillName: string): this {
    this._task.skill = skillName;
    return this;
  }

  /** Set input files */
  inputs(paths: string[]): this {
    this._task.inputs = paths;
    return this;
  }

  /** Set output files */
  outputs(paths: string[]): this {
    this._task.outputs = paths;
    return this;
  }

  /** Set dependencies */
  deps(taskIds: string[]): this {
    this._task.deps = taskIds;
    return this;
  }

  /** Set prompt for AI agent */
  prompt(text: string): this {
    this._task.prompt = text;
    return this;
  }

  /** Set prompt reference */
  promptRef(ref: string): this {
    this._task.promptRef = ref;
    return this;
  }

  /** Set variables */
  vars(vars: Record<string, unknown>): this {
    this._task.vars = { ...this._task.vars, ...vars };
    return this;
  }

  /** Set condition for task inclusion */
  when(condition: string | ((vars: Record<string, unknown>) => boolean)): this {
    if (typeof condition === 'function') {
      this._task.when = condition;
    } else {
      this._task.constraints = { ...this._task.constraints, condition };
    }
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Programmable Hooks                                              */
  /* ---------------------------------------------------------------- */

  /** Set shouldStart hook */
  shouldStart(fn: (ctx: TaskContext) => boolean | Promise<boolean>): this {
    this._program.shouldStart = fn;
    return this;
  }

  /** Set onStart hook */
  onStart(fn: (ctx: TaskContext) => void | Promise<void>): this {
    this._program.onStart = fn;
    return this;
  }

  /**
   * Set execute hook as a JavaScript code string.
   * Use executeFrom() to load from an external file.
   *
   * NOTE: Functions are not accepted — they cannot be serialized to the plan
   * and will be silently lost when the plan is reloaded from disk.
   */
  execute(code: string): this {
    if (typeof code !== 'string') {
      throw new Error(
        'execute() only accepts a string of JavaScript code. ' +
        'Inline functions cannot be serialized to the plan and will not survive a restart. ' +
        'Use executeFrom("path/to/executor.js") with a file that exports a default async function instead.'
      );
    }
    this._task.executorCode = code;
    return this;
  }

  /** Set execute hook from external file */
  executeFrom(filepath: string, vars?: Record<string, unknown>): this {
    this._task.executorFilePath = filepath;
    if (vars) {
      this._task.vars = { ...this._task.vars, ...vars };
    }
    return this;
  }

  /**
   * Set prompt from external markdown template file with variable interpolation
   */
  promptFrom(filepath: string, vars?: Record<string, unknown>): this {
    this._task.promptTemplateFile = filepath;
    if (vars) {
      this._task.vars = { ...this._task.vars, ...vars };
    }
    return this;
  }

  /** Set onComplete hook */
  onComplete(fn: (ctx: TaskContext, result: TaskResult) => void | Promise<void>): this {
    this._program.onComplete = fn;
    return this;
  }

  /** Set onFail hook */
  onFail(fn: (ctx: TaskContext, error: Error) => void | Promise<void>): this {
    this._program.onFail = fn;
    return this;
  }

  /**
   * Set expand hook to generate subtasks
   */
  expand(fn: (parent: TaskDef) => TaskDef[] | undefined): this {
    this._program.expand = fn;
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Checks (generic, project-defined)                               */
  /* ---------------------------------------------------------------- */

  /**
   * Add a check to run after task execution.
   *
   * Five forms:
   *   - Named:   `.check('tsc')` — resolved from project check registry
   *   - Options: `.check('build', { autoFix: true })` — named with options
   *   - Inline:  `.check(async (ctx) => { ... })` — custom function
   *   - Prompt:  `.check({ prompt: 'All components must be exported' })` — AI evaluator
   *   - Cmd:     `.check({ cmd: 'test -f src/app/page.tsx' })` — shell command
   *
   * @example
   *   .check('tsc')
   *   .check('build', { autoFix: true, maxRetries: 3 })
   *   .check(async (ctx) => {
   *     const r = await ctx.tools.shell.run('cargo test');
   *     return { passed: r.exitCode === 0, output: r.stderr };
   *   })
   *   .check({ prompt: 'All React components must use named exports' })
   *   .check({ cmd: 'test -f src/app/page.tsx', name: 'page-exists' })
   */
  check(
    nameOrFnOrPrompt: string | ((ctx: TaskContext) => Promise<import('./types.ts').CheckResult>) | PromptCheck | CmdCheck,
    opts?: { autoFix?: boolean; maxRetries?: number },
  ): this {
    if (typeof nameOrFnOrPrompt === 'function') {
      this._checks.push({ fn: nameOrFnOrPrompt });
    } else if (typeof nameOrFnOrPrompt === 'object' && 'cmd' in nameOrFnOrPrompt) {
      // Shell command check
      this._checks.push(nameOrFnOrPrompt);
    } else if (typeof nameOrFnOrPrompt === 'object' && 'prompt' in nameOrFnOrPrompt) {
      // AI prompt-based check
      this._checks.push(nameOrFnOrPrompt);
    } else if (opts) {
      this._checks.push({ name: nameOrFnOrPrompt, ...opts });
    } else {
      // Named check without options - wrap in object
      this._checks.push({ name: nameOrFnOrPrompt });
    }
    return this;
  }

  /**
   * Set the maximum number of check→feedback→retry attempts.
   *
   * When checks exist and a session is open, the framework automatically
   * sends failure details back to the agent for fixing. This controls
   * how many times to retry before giving up (panic).
   *
   * Default is 3 attempts. Only needed when you want a different limit.
   *
   * @example
   *   .check('build')
   *   .check('tsc')
   *   .attempts(5)
   */
  attempts(n: number): this {
    this._task.maxAttempts = n;
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Review Gates                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Add a review gate — requires approval before task completes.
   * Multiple .review() calls create sequential reviews; all must approve.
   *
   * @example
   *   .review('human')
   *   .review('human', { prompt: 'Review API design', assignee: '@lead' })
   *   .review('agent', { agent: 'security-reviewer', prompt: 'Check OWASP Top 10' })
   */
  review(
    type: 'human' | 'agent',
    opts?: {
      prompt?: string;
      agent?: string;
      assignee?: string;
      timeout?: string;
      onTimeout?: 'approve' | 'reject';
      autoApprove?: boolean;
    },
  ): this {
    const gate: ReviewGate = { type, ...opts };
    const existing = this._task.review;
    if (existing) {
      // Support multiple review gates — store as array
      if (Array.isArray(existing)) {
        existing.push(gate);
      } else {
        this._task.review = [existing, gate];
      }
    } else {
      this._task.review = gate;
    }
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Planning (plan-then-execute)                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Enable plan-then-execute pattern for this task.
   *
   * The agent first creates an implementation plan (saved as plan.md),
   * then executes it after approval.
   *
   * Returns a PlanningBuilder for optional chaining:
   *
   * @example
   *   .planning()                          // auto-approve: plan + execute in one shot
   *   .planning().review()                 // human review: save plan.md, close session
   *   .planning().review('agent')          // agent reviews + writes review.md, then wait for human
   *   .planning({ prompt: 'Focus on...' }) // custom planning prompt, auto-approve
   *   .planning().review('agent', { reviewAgent: 'architect' })
   */
  planning(opts?: { prompt?: string; maxIterations?: number }): PlanningBuilder {
    this._task.planning = {
      enabled: true,
      approval: 'auto',
      ...opts,
    };
    return new PlanningBuilder(this);
  }

  /**
   * Enable a structured completion report for this task.
   * After the agent finishes, a follow-up message is sent asking for
   * status, summary, errors, and follow-up action suggestions.
   *
   * When called with no arguments, uses TASK_COMPLETION_PROMPT (XML format).
   * Pass a custom prompt to override the default report format.
   *
   * @example
   *   .report()                          // default: structured task completion report
   *   .report('List: new files, modified files, new deps, breaking changes')
   */
  report(prompt?: string): this {
    this._task.reportPrompt = prompt ?? TASK_COMPLETION_PROMPT;
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Yields — Incremental Planning                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Enable incremental planning — dynamically spawn follow-up tasks
   * when this task completes.
   *
   * Two calling conventions:
   *
   * 1. **Programmatic** — pass a function:
   *    ```ts
   *    .yields(async (ctx, result) => {
   *      const doc = await ctx.tools.file.read('docs/animations.md');
   *      return parseGroups(doc).map(g =>
   *        ctx.createTask(`impl-${g.id}`, `Implement ${g.name}`).build()
   *      );
   *    })
   *    ```
   *
   * 2. **Declarative** — pass a config object:
   *    ```ts
   *    .yields({
   *      plan: 'Create one task per animation group from the spec',
   *      target: 'next-epic',
   *    })
   *    ```
   *
   * 3. **AI planning shorthand** — pass just a prompt string:
   *    ```ts
   *    .yields('Create implementation tasks for each animation group')
   *    ```
   */
  yields(config: YieldsFn | YieldsDeclarative | string): this {
    if (typeof config === 'string') {
      this._task.yields = { plan: config };
    } else {
      this._task.yields = config;
    }
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Harness — AutoHarness policy synthesis                          */
  /* ---------------------------------------------------------------- */

  /**
   * Enable AutoHarness — LLM-synthesized validation policy.
   *
   * The agent generates semantic validation rules from the task prompt,
   * inputs, and outputs. These rules are evaluated alongside structural
   * checks (tsc, build, etc.) during the validate step.
   *
   * Inspired by the AutoHarness paper (arXiv:2603.03329).
   *
   * @example
   *   .harness()                              // derive from task prompt
   *   .harness({ from: 'inputs' })           // derive from input files
   *   .harness({ prompt: 'Check that...' })  // custom validation criteria
   *   .harness({ refinable: true })          // refine harness on false pos/neg
   */
  harness(config?: HarnessConfig): this {
    this._task.harness = config ?? {};
    return this;
  }

  /* ---------------------------------------------------------------- */
  /*  Constraint & Flow Methods                                       */
  /* ---------------------------------------------------------------- */

  sequential(): this {
    this._task.constraints = { ...this._task.constraints, sequential: true, parallel: false };
    return this;
  }

  parallel(): this {
    this._task.constraints = { ...this._task.constraints, parallel: true, sequential: false };
    return this;
  }

  blocks(taskIds: string[]): this {
    this._task.constraints = { ...this._task.constraints, blocking: taskIds };
    return this;
  }

  blockedBy(taskIds: string[]): this {
    this._task.constraints = { ...this._task.constraints, blockedBy: taskIds };
    return this;
  }

  priority(value: number): this {
    this._task.constraints = { ...this._task.constraints, priority: value };
    return this;
  }

  fanOut(branchIds: string[]): this {
    this._task.flow = { type: 'fanOut', branches: branchIds };
    return this;
  }

  fanIn(syncBarrier: string[]): this {
    this._task.flow = { type: 'fanIn', syncBarrier };
    return this;
  }

  dagFlow(edges: Array<{ from: string; to: string }>): this {
    this._task.flow = { type: 'dag', edges };
    return this;
  }

  /** Build and return the TaskDef */
  build(): TaskDef {
    return {
      ...this._task,
      checks: this._checks.length > 0 ? this._checks : undefined,
      maxAttempts: this._task.maxAttempts,
      program: Object.keys(this._program).length > 0 ? this._program : undefined,
    } as TaskDef;
  }
}

/* ------------------------------------------------------------------ */
/*  Planning Builder (sub-builder for .planning() chain)              */
/* ------------------------------------------------------------------ */

/**
 * Sub-builder returned by TaskBuilder.planning().
 *
 * Proxies all TaskBuilder methods so chaining continues seamlessly.
 * Adds .review() to switch from auto-approve to human/agent review.
 *
 * @example
 *   ctx.createTask('build', 'Build page')
 *     .skill('react-prune')
 *     .planning()                    // ← returns PlanningBuilder (auto-approve)
 *     .review()                      // ← switch to human review, close session
 *     .inputs(['page.tsx'])          // ← still chainable (proxied to TaskBuilder)
 *     .check('tsc')
 */
export class PlanningBuilder {
  constructor(private _parent: TaskBuilder) {}

  /**
   * Switch to human-in-the-loop or agent review mode.
   *
   * - `.review()` — human reviews plan.md offline, session closes
   * - `.review('agent')` — agent writes review.md, then waits for human
   * - `.review('agent', { reviewAgent: 'architect' })` — specific agent persona
   */
  review(
    mode?: 'human' | 'agent',
    opts?: { reviewAgent?: string; prompt?: string },
  ): PlanningBuilder {
    const planning = (this._parent as any)._task.planning as PlanningConfig;
    planning.approval = mode === 'agent' ? 'agent' : 'review';
    planning.closeSession = true;
    if (opts?.reviewAgent) planning.reviewAgent = opts.reviewAgent;
    if (opts?.prompt) planning.prompt = opts.prompt;
    return this;
  }

  // --- Proxy all TaskBuilder methods so chaining continues ---
  type(t: string) { this._parent.type(t); return this; }
  ofType(t: string) { this._parent.ofType(t); return this; }
  tag(t: string) { this._parent.tag(t); return this; }
  tags(t: string[]) { this._parent.tags(t); return this; }
  skill(s: string) { this._parent.skill(s); return this; }
  inputs(i: string[]) { this._parent.inputs(i); return this; }
  outputs(o: string[]) { this._parent.outputs(o); return this; }
  deps(d: string[]) { this._parent.deps(d); return this; }
  prompt(t: string) { this._parent.prompt(t); return this; }
  promptRef(r: string) { this._parent.promptRef(r); return this; }
  vars(v: Record<string, unknown>) { this._parent.vars(v); return this; }
  when(c: string | ((vars: Record<string, unknown>) => boolean)) { this._parent.when(c); return this; }
  shouldStart(fn: (ctx: TaskContext) => boolean | Promise<boolean>) { this._parent.shouldStart(fn); return this; }
  onStart(fn: (ctx: TaskContext) => void | Promise<void>) { this._parent.onStart(fn); return this; }
  execute(code: string) { this._parent.execute(code); return this; }
  executeFrom(filepath: string, vars?: Record<string, unknown>) { this._parent.executeFrom(filepath, vars); return this; }
  promptFrom(filepath: string, vars?: Record<string, unknown>) { this._parent.promptFrom(filepath, vars); return this; }
  onComplete(fn: (ctx: TaskContext, result: TaskResult) => void | Promise<void>) { this._parent.onComplete(fn); return this; }
  onFail(fn: (ctx: TaskContext, error: Error) => void | Promise<void>) { this._parent.onFail(fn); return this; }
  check(nameOrFnOrPrompt: string | ((ctx: TaskContext) => Promise<import('./types.ts').CheckResult>) | PromptCheck | CmdCheck, opts?: { autoFix?: boolean; maxRetries?: number }) { this._parent.check(nameOrFnOrPrompt, opts); return this; }
  attempts(n: number) { this._parent.attempts(n); return this; }
  reviewGate(type: 'human' | 'agent', opts?: { prompt?: string; agent?: string; assignee?: string; timeout?: string; onTimeout?: 'approve' | 'reject'; autoApprove?: boolean }) { this._parent.review(type, opts); return this; }
  report(prompt?: string) { this._parent.report(prompt); return this; }
  sequential() { this._parent.sequential(); return this; }
  parallel() { this._parent.parallel(); return this; }
  blocks(ids: string[]) { this._parent.blocks(ids); return this; }
  blockedBy(ids: string[]) { this._parent.blockedBy(ids); return this; }
  priority(v: number) { this._parent.priority(v); return this; }
  expand(fn: (parent: TaskDef) => TaskDef[] | undefined) { this._parent.expand(fn); return this; }
  yields(config: YieldsFn | YieldsDeclarative | string) { this._parent.yields(config); return this; }
  harness(config?: HarnessConfig) { this._parent.harness(config); return this; }

  /** Build the underlying TaskDef */
  build(): TaskDef { return this._parent.build(); }
}

/* ------------------------------------------------------------------ */
/*  Epic Builder                                                      */
/* ------------------------------------------------------------------ */

export class EpicBuilder {
  private _id: string;
  private _title: string;
  private _tasks: TaskBuilder[] = [];
  private _basePath?: string;

  constructor(id: string, title: string) {
    this._id = id;
    this._title = title;
  }

  /**
   * Set base path for this epic's resources.
   * Makes all promptFrom/executeFrom paths relative to this base.
   */
  basePath(path: string): this {
    this._basePath = path;
    return this;
  }

  /** Add a task to this epic. Accepts TaskBuilder or PlanningBuilder (unwraps automatically). */
  addTask(task: TaskBuilder | PlanningBuilder): this {
    if (task instanceof PlanningBuilder) {
      this._tasks.push((task as any)._parent as TaskBuilder);
    } else {
      this._tasks.push(task);
    }
    return this;
  }

  /** Build and return the EpicDef */
  build(): EpicDef {
    const tasks = this._tasks.map(t => t.build());

    if (this._basePath) {
      for (const task of tasks) {
        if (task.promptTemplateFile && task.promptTemplateFile.startsWith('./')) {
          task.promptTemplateFile = `${this._basePath}/${task.promptTemplateFile.slice(2)}`;
        }
        if (task.executorFilePath && task.executorFilePath.startsWith('./')) {
          task.executorFilePath = `${this._basePath}/${task.executorFilePath.slice(2)}`;
        }
      }
    }

    return {
      id: this._id,
      title: this._title,
      tasks,
      basePath: this._basePath,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Plan Builder                                                      */
/* ------------------------------------------------------------------ */

export class PlanBuilder {
  private _title: string;
  private _vars: Record<string, unknown> = {};
  private _epics: EpicBuilder[] = [];

  constructor(title: string) {
    this._title = title;
  }

  /** Set shared variables */
  vars(vars: Record<string, unknown>): this {
    this._vars = { ...this._vars, ...vars };
    return this;
  }

  /** Add an epic */
  addEpic(epic: EpicBuilder): this {
    this._epics.push(epic);
    return this;
  }

  /** Add multiple epics */
  addEpics(epics: EpicBuilder[]): this {
    for (const m of epics) {
      this._epics.push(m);
    }
    return this;
  }

  /** Build and return the PlanDef */
  build(): PlanDef {
    return {
      title: this._title,
      vars: this._vars,
      epics: this._epics.map(m => m.build()),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience Functions                                             */
/* ------------------------------------------------------------------ */

export interface TaskOptions {
  type?: string;
  skill?: string;
  inputs?: string[];
  outputs?: string[];
  deps?: string[];
  prompt?: string;
  vars?: Record<string, unknown>;
}

/** Create a new TaskBuilder with optional inline configuration */
export function createTask(id: string, title: string, opts?: TaskOptions): TaskBuilder {
  const builder = new TaskBuilder(id, title);

  if (opts?.type) builder.type(opts.type);
  if (opts?.skill) builder.skill(opts.skill);
  if (opts?.inputs) builder.inputs(opts.inputs);
  if (opts?.outputs) builder.outputs(opts.outputs);
  if (opts?.deps) builder.deps(opts.deps);
  if (opts?.prompt) builder.prompt(opts.prompt);
  if (opts?.vars) builder.vars(opts.vars);

  return builder;
}

/** Create a new EpicBuilder */
export function createEpic(id: string, title: string): EpicBuilder {
  return new EpicBuilder(id, title);
}

/** Create a new PlanBuilder */
export function createPlan(title: string): PlanBuilder {
  return new PlanBuilder(title);
}
