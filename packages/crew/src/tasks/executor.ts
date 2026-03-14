/**
 * Programmable Task Executor
 *
 * Executes tasks with full lifecycle hooks:
 *   1. Task.program.shouldStart (or task type default)
 *   2. Task.program.onStart (or task type default)
 *   3. Planning phase (if task.planning.enabled) — uses Claude Code --permission-mode plan
 *   4. Task type default execute → AI agent handoff (resumes planning session if available)
 *   5. Checks (task + task type checks)
 *   6. Task.program.onComplete (or task type default)
 *   7. Yields — incremental planning (spawn follow-up tasks from output)
 *   8. On failure: Task.program.onFail (or task type default)
 *
 * Hook execution order: Task > Task Type > Epic > Project
 */

import type {
  TaskContext,
  TaskDef,
  TaskResult,
  TaskState,
  TaskLogger,
  EpicContext,
  ProjectContext,
  TaskTools,
  AgentFn,
  AgentResult,
  PlanningConfig,
  YieldsConfig,
  YieldsDeclarative,
  SpawnedTask,
} from './types.ts';
import type { BuildContext, CompoundTask } from '../types.ts';
import { getTaskType, collectChecks, runChecks } from './task-types.ts';
import { collectTaskReport } from './feedback.ts';
import { agentSendFeedback } from '@crew/agentfn';
import type { Provider } from '@crew/agentfn';
import {
  readTodos, markTodoDone, markTodoFailed,
  generateTodos, writeTodos,
} from '../store/fs/todo-io.ts';
import type { TaskYamlCheck } from '../store/fs/types.ts';

/* ------------------------------------------------------------------ */
/*  Task Context Factory                                              */
/* ------------------------------------------------------------------ */

interface CreateContextOptions {
  task: TaskDef;
  compoundTask: CompoundTask;
  epic: EpicContext;
  project: ProjectContext;
  buildCtx: BuildContext;
  taskDir: string;
  vars: Record<string, unknown>;
  agent: AgentFn;
  tools: TaskTools;
}

export function createTaskContext(opts: CreateContextOptions): TaskContext {
  const stateStore = new Map<string, unknown>();

  const state: TaskState = {
    get<T>(key: string): T | undefined {
      return stateStore.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      stateStore.set(key, value);
    },
    has(key: string): boolean {
      return stateStore.has(key);
    },
    delete(key: string): boolean {
      return stateStore.delete(key);
    },
  };

  const log: TaskLogger = {
    info(message: string, meta?: Record<string, unknown>): void {
      console.error(`[task:${opts.compoundTask.id}] ${message}`, meta || '');
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      console.error(`[task:${opts.compoundTask.id}] WARN: ${message}`, meta || '');
    },
    error(message: string, meta?: Record<string, unknown>): void {
      console.error(`[task:${opts.compoundTask.id}] ERROR: ${message}`, meta || '');
    },
    debug(message: string, meta?: Record<string, unknown>): void {
      if (process.env.DEBUG) {
        console.error(`[task:${opts.compoundTask.id}] DEBUG: ${message}`, meta || '');
      }
    },
  };

  return {
    taskId: opts.compoundTask.id,
    task: opts.task,
    compoundTask: opts.compoundTask,
    epic: opts.epic,
    project: opts.project,
    buildCtx: opts.buildCtx,
    taskDir: opts.taskDir,
    agent: opts.agent,
    tools: opts.tools,
    state,
    vars: opts.vars,
    log,
  };
}

/* ------------------------------------------------------------------ */
/*  Task Executor                                                     */
/* ------------------------------------------------------------------ */

export interface ExecuteOptions {
  task: TaskDef;
  compoundTask: CompoundTask;
  epic: EpicContext;
  project: ProjectContext;
  buildCtx: BuildContext;
  taskDir: string;
  vars: Record<string, unknown>;
  agent: AgentFn;
  tools: TaskTools;
  attempt: number;
  /** Error from previous attempt (for retry context) */
  previousError?: string;
  /** Check failure details from previous attempt */
  previousCheckFailures?: string;
  /** Skip execution and run only checks */
  checksOnly?: boolean;
  /** Session ID to resume from */
  resumeSessionId?: string;
}

export async function executeTask(opts: ExecuteOptions): Promise<TaskResult> {
  const ctx = createTaskContext({
    task: opts.task,
    compoundTask: opts.compoundTask,
    epic: opts.epic,
    project: opts.project,
    buildCtx: opts.buildCtx,
    taskDir: opts.taskDir,
    vars: opts.vars,
    agent: opts.agent,
    tools: opts.tools,
  });

  const startTime = Date.now();

  try {
    // Checks-only mode: skip execution, run only checks
    if (opts.checksOnly) {
      ctx.log.info('Running checks only (--checks flag)');

      const checks = collectChecks(opts.task);
      if (checks.length === 0) {
        ctx.log.warn('No checks defined for this task');
        return {
          success: true,
          durationMs: Date.now() - startTime,
          output: 'No checks to run',
          metadata: { checksOnly: true },
        };
      }

      ctx.log.info(`Running ${checks.length} checks`);
      const checkResults = await runChecks(checks, ctx);

      if (checkResults.allPassed) {
        ctx.log.info('All checks passed');
        return {
          success: true,
          durationMs: Date.now() - startTime,
          output: 'All checks passed',
          metadata: {
            checksOnly: true,
            checks: checkResults.results,
          },
        };
      } else {
        const details = checkResults.results
          .filter(r => !r.passed)
          .map(r => `[${r.name}]\n${r.issues.join('\n')}`)
          .join('\n\n');

        ctx.log.error(`Checks failed:\n${details}`);
        return {
          success: false,
          durationMs: Date.now() - startTime,
          error: `Checks failed: ${checkResults.failed.join(', ')}\n\n${details}`,
          metadata: {
            checksOnly: true,
            checks: checkResults.results,
          },
        };
      }
    }

    // Step 0: Initialize todo.yaml from task checks (if any)
    if (opts.taskDir && opts.task.checks) {
      try {
        const yamlChecks = opts.task.checks.filter(
          (c): c is TaskYamlCheck => typeof c === 'object' && c !== null && !('fn' in c),
        );
        if (yamlChecks.length > 0) {
          const todos = generateTodos(opts.taskDir, yamlChecks, opts.task.title || 'Execute task');
          writeTodos(opts.taskDir, todos);
        }
      } catch { /* non-fatal */ }
    }

    // Step 1: shouldStart check
    const shouldStart = await runShouldStart(ctx);
    if (!shouldStart) {
      ctx.log.info('Task skipped (shouldStart returned false)');
      return {
        success: true,
        durationMs: 0,
        output: 'Task skipped',
        metadata: { skipped: true },
      };
    }

    // Step 2: onStart hook
    await runOnStart(ctx);

    // Step 3: Planning phase (if enabled and not resuming)
    if (ctx.task.planning?.enabled && !opts.resumeSessionId) {
      const planResult = await runPlanningPhase(ctx);
      if (!planResult.approved) {
        ctx.log.info('Planning phase did not approve — task awaiting review', {
          closeSession: planResult.closeSession,
        });
        return {
          success: true,
          durationMs: Date.now() - startTime,
          output: planResult.plan || 'Plan created, awaiting review',
          metadata: {
            planning: {
              plan: planResult.plan,
              planPath: planResult.planPath,
              reviewPath: planResult.reviewPath,
              sessionId: planResult.sessionId,
              approved: false,
              approval: ctx.task.planning.approval,
            },
            // Signals to orchestrator: close the Claude Code session
            // Human reviews plan.md (and review.md if agent mode) offline,
            // marks plan as APPROVED, then re-runs to resume execution
            awaitingPlanReview: true,
            closeSession: planResult.closeSession,
          },
        };
      }
      ctx.log.info('Plan approved, proceeding to execution', {
        approval: ctx.task.planning.approval,
        planPath: planResult.planPath,
        sessionId: planResult.sessionId,
      });
      // Store session ID for resume (same machine, recent session)
      // AND plan text as fallback (different machine, expired session)
      if (planResult.sessionId) {
        ctx.state.set('planSessionId', planResult.sessionId);
      }
      ctx.state.set('approvedPlan', planResult.plan);
      ctx.state.set('planPath', planResult.planPath);
    } else if (opts.resumeSessionId) {
      ctx.log.info('Resuming from provided session', { sessionId: opts.resumeSessionId });
      ctx.state.set('planSessionId', opts.resumeSessionId);
    }

    // Step 4: Execute (AI handoff by default)
    ctx.log.info(`Executing (attempt ${opts.attempt})`);
    let result = await runExecute(ctx);

    // Update todo: mark main execution as done/failed
    if (opts.taskDir) {
      try {
        if (result.success) {
          markTodoDone(opts.taskDir, 'main');
        } else {
          markTodoFailed(opts.taskDir, 'main', result.error);
        }
      } catch { /* todo.yaml may not exist — non-fatal */ }
    }

    // Step 5: Run checks with automatic feedback loop
    // When checks exist and a session is open, failed checks trigger a
    // feedback→retry loop (up to maxAttempts, default 3).
    const checks = collectChecks(opts.task);
    if (checks.length > 0 && result.success) {
      const sessionId = ctx.state.get<string>('agentSessionId');
      const canFeedback = !!sessionId;

      const maxAttempts = opts.task.maxAttempts ?? 3;
      const feedbackTimeoutMs = 120_000;

      let checkAttempt = 0;

      while (checkAttempt < (canFeedback ? maxAttempts : 1)) {
        checkAttempt++;
        ctx.log.info(`Running ${checks.length} checks (attempt ${checkAttempt}/${canFeedback ? maxAttempts : 1})`);
        const checkResults = await runChecks(checks, ctx);

        // Update todo items for each check result
        if (opts.taskDir) {
          try {
            for (const cr of checkResults.results) {
              const todoId = `post:${cr.name}`;
              if (cr.passed) {
                markTodoDone(opts.taskDir, todoId);
              } else {
                markTodoFailed(opts.taskDir, todoId, cr.issues.join('\n'));
              }
            }
          } catch { /* todo.yaml may not exist — non-fatal */ }
        }

        if (checkResults.allPassed) {
          ctx.log.info('All checks passed');
          break;
        }

        // Checks failed — build failure details
        const details = checkResults.results
          .filter(r => !r.passed)
          .map(r => `[${r.name}]\n${r.issues.join('\n')}`)
          .join('\n\n');

        // If we can't send feedback or this was the last attempt, fail
        if (!canFeedback || checkAttempt >= maxAttempts) {
          if (canFeedback) {
            ctx.log.error(`Checks still failing after ${maxAttempts} attempts`);
          }
          ctx.log.error(`Checks failed:\n${details}`);
          result = {
            ...result,
            success: false,
            error: `Checks failed${canFeedback ? ` (${checkAttempt}/${maxAttempts} attempts exhausted)` : ''}: ${checkResults.failed.join(', ')}\n\n${details}`,
            metadata: {
              ...result.metadata,
              checks: checkResults.results,
              autofix: canFeedback ? {
                attempts: checkAttempt,
                maxAttempts,
              } : undefined,
            },
          };
          break;
        }

        // Send feedback to the agent session asking it to fix the failures
        ctx.log.info(`Checks failed (attempt ${checkAttempt}/${maxAttempts}), sending feedback to agent to fix`, {
          failed: checkResults.failed,
        });

        const feedbackPrompt = buildCheckFeedback(checkResults, checkAttempt, maxAttempts);

        try {
          const provider = (ctx.buildCtx as { provider?: string }).provider as Provider | undefined;
          await agentSendFeedback({
            sessionId: sessionId!,
            prompt: feedbackPrompt,
            provider,
            cwd: ctx.buildCtx.appDir,
            timeoutMs: feedbackTimeoutMs,
          });
          ctx.log.info('Agent feedback delivered, re-running checks');
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          ctx.log.error(`Check feedback failed: ${err.message}`);
          result = {
            ...result,
            success: false,
            error: `Check feedback failed (attempt ${checkAttempt}): ${err.message}\n\nOriginal check failures:\n${details}`,
            metadata: {
              ...result.metadata,
              checks: checkResults.results,
              autofix: {
                attempts: checkAttempt,
                maxAttempts,
                feedbackError: err.message,
              },
            },
          };
          break;
        }
      }

      // If feedback loop was active and checks passed, collect the report now
      // (we deferred it earlier to keep the session open for fixes)
      if (result.success && canFeedback && sessionId) {
        try {
          const agentResult: AgentResult = {
            success: true,
            output: result.output || '',
            durationMs: result.durationMs,
            sessionId,
          };
          const taskReport = await collectTaskReport(ctx, agentResult);
          result = {
            ...result,
            metadata: {
              ...result.metadata,
              report: {
                status: taskReport.report.status,
                summary: taskReport.report.summary,
                errors: taskReport.report.errors,
                followUpActions: taskReport.report.followUpActions,
                reportPath: taskReport.savedPath,
                reportDurationMs: taskReport.durationMs,
              },
              autofix: {
                attempts: checkAttempt,
                maxAttempts,
              },
            },
          };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          ctx.log.warn(`Post-check report collection failed (non-fatal): ${err.message}`);
        }
      }
    }

    // Step 6: onComplete hook (only on success)
    if (result.success) {
      await runOnComplete(ctx, result);
    }

    // Step 7: Yields — incremental planning (only on success)
    if (result.success && ctx.task.yields) {
      const spawnedTasks = await runYields(ctx, result);
      if (spawnedTasks.length > 0) {
        ctx.log.info(`Yielded ${spawnedTasks.length} follow-up tasks`, {
          tasks: spawnedTasks.map(s => s.task.title),
        });
        result = {
          ...result,
          spawnedTasks,
        };
      }
    }

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };

  } catch (error) {
    // Step 7: onFail hook
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.error('Task execution failed', { error: err.message });

    await runOnFail(ctx, err);

    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Hook Runners                                                      */
/* ------------------------------------------------------------------ */

async function runShouldStart(ctx: TaskContext): Promise<boolean> {
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;

  // Priority: Task.program.shouldStart > TaskType.defaults.shouldStart > true
  if (ctx.task.program?.shouldStart) {
    return ctx.task.program.shouldStart(ctx);
  }

  if (taskType?.defaults.shouldStart) {
    return taskType.defaults.shouldStart(ctx);
  }

  return true;
}

async function runOnStart(ctx: TaskContext): Promise<void> {
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;

  // Run task type hook first, then task-specific hook
  if (taskType?.defaults.onStart) {
    await taskType.defaults.onStart(ctx);
  }

  if (ctx.task.program?.onStart) {
    await ctx.task.program.onStart(ctx);
  }
}

async function runExecute(ctx: TaskContext): Promise<TaskResult> {
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;

  // Priority: executorFile > TaskType.defaults.execute > AI handoff

  // Check for external executor file
  if (ctx.compoundTask.executorFile) {
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');

    const executorPath = join(ctx.taskDir, ctx.compoundTask.executorFile);

    try {
      ctx.log.debug(`Loading external executor: ${executorPath}`);
      const executor = await import(pathToFileURL(executorPath).href);

      if (!executor.default || typeof executor.default !== 'function') {
        throw new Error(`Executor file must export a default async function`);
      }

      ctx.log.info('Executing external executor');
      return await executor.default(ctx);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ctx.log.error(`Failed to load/execute external executor: ${msg}`);
      throw error;
    }
  }

  if (taskType?.defaults.execute) {
    return taskType.defaults.execute(ctx);
  }

  // Default: AI handoff (95% of tasks)
  return defaultAIExecution(ctx);
}

async function runOnComplete(ctx: TaskContext, result: TaskResult): Promise<void> {
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;

  if (taskType?.defaults.onComplete) {
    await taskType.defaults.onComplete(ctx, result);
  }

  if (ctx.task.program?.onComplete) {
    await ctx.task.program.onComplete(ctx, result);
  }
}

async function runOnFail(ctx: TaskContext, error: Error): Promise<void> {
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;

  if (taskType?.defaults.onFail) {
    await taskType.defaults.onFail(ctx, error);
  }

  if (ctx.task.program?.onFail) {
    await ctx.task.program.onFail(ctx, error);
  }
}

/* ------------------------------------------------------------------ */
/*  Planning Phase                                                    */
/* ------------------------------------------------------------------ */

interface PlanningResult {
  plan: string;
  planPath?: string;
  reviewPath?: string;
  /** Session ID from the planning call — used to resume for execution */
  sessionId?: string;
  approved: boolean;
  /** When true, the orchestrator should close the session after returning */
  closeSession: boolean;
}

/**
 * Resolve the plan file path for a task.
 */
function getPlanFilePath(ctx: TaskContext): string {
  return ctx.taskDir
    ? `${ctx.taskDir}/plan.md`
    : `.crew/plans/${ctx.taskId.replace(/\./g, '-')}-plan.md`;
}

/**
 * Check if a previously generated plan exists and was approved by a human.
 * Also loads the sessionId so we can resume the same Claude Code session.
 */
async function loadApprovedPlan(ctx: TaskContext): Promise<{
  plan: string;
  sessionId?: string;
} | null> {
  const planFile = getPlanFilePath(ctx);

  try {
    if (await ctx.tools.file.exists(planFile)) {
      const content = await ctx.tools.file.read(planFile);
      if (content.includes('> Status: APPROVED')) {
        // Extract sessionId from plan metadata
        const sessionMatch = content.match(/> Session: (.+)/);
        ctx.log.info('Found previously approved plan', { path: planFile });
        return {
          plan: content,
          sessionId: sessionMatch?.[1],
        };
      }
    }
  } catch {
    // Plan file doesn't exist or can't be read
  }
  return null;
}

/**
 * Run the planning phase using Claude Code's native `--permission-mode plan`.
 *
 * This uses Claude Code's actual plan mode — the agent runs in read-only mode
 * where it can analyze code, read files, and reason, but cannot make edits.
 * The output is saved as plan.md.
 *
 * For auto-approve: the same session is resumed for execution (via sessionId).
 * For review: the session is saved and resumed after human approval.
 */
async function runPlanningPhase(ctx: TaskContext): Promise<PlanningResult> {
  const planning = ctx.task.planning!;
  const approval = planning.approval || 'auto';
  const closeSession = planning.closeSession ?? (approval !== 'auto');

  // On resume: check if plan was previously generated and approved by human
  if (approval === 'review' || approval === 'agent') {
    const existing = await loadApprovedPlan(ctx);
    if (existing) {
      ctx.log.info('Resuming with previously approved plan');
      return {
        plan: existing.plan,
        sessionId: existing.sessionId,
        approved: true,
        closeSession: false,
      };
    }
  }

  const taskPrompt = ctx.task.prompt || ctx.task.promptRef || ctx.task.title;

  // Build the planning prompt — Claude Code's plan mode already restricts
  // the agent to read-only, so the prompt focuses on what to analyze
  const planPrompt = planning.prompt
    ? [planning.prompt, '', '---', '', `## Task: ${ctx.task.title}`, '', taskPrompt].join('\n')
    : taskPrompt;

  ctx.log.info('Starting planning phase (--permission-mode plan)', {
    approval,
    closeSession,
  });

  // Call the agent with Claude Code's native plan mode
  // --permission-mode plan: agent can read/analyze but NOT edit files or run commands
  const planResult = await ctx.agent(planPrompt, {
    skill: ctx.task.skill,
    skills: ctx.task.skills,
    inputs: ctx.task.inputs,
    outputs: ctx.task.outputs,
    permissionMode: 'plan',
    context: {
      phase: 'planning',
      taskType: ctx.task.type,
      taskId: ctx.taskId,
      epic: ctx.epic.title,
      ...ctx.task.vars,
    },
  });

  const plan = planResult.output || 'No plan generated';
  const sessionId = planResult.sessionId;

  // Save plan.md to task directory
  let planPath: string | undefined;
  const statusLine = approval === 'auto' ? '> Status: APPROVED' : '> Status: PENDING_REVIEW';
  try {
    const planFile = getPlanFilePath(ctx);
    await ctx.tools.file.write(planFile, [
      `# Plan: ${ctx.task.title}`,
      '',
      `> Generated at ${new Date().toISOString()}`,
      `> Approval: ${approval}`,
      statusLine,
      ...(sessionId ? [`> Session: ${sessionId}`] : []),
      '',
      plan,
      '',
      ...(approval !== 'auto' ? [
        '---',
        '',
        '## How to approve',
        '',
        'To approve this plan, change the status line above to:',
        '```',
        '> Status: APPROVED',
        '```',
        'Then re-run the task. The executor will resume the Claude Code session and execute.',
      ] : []),
    ].join('\n'));
    planPath = planFile;
    ctx.log.info('Plan saved', { path: planFile, sessionId });
  } catch (err) {
    ctx.log.warn(`Failed to save plan file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Auto-approve: proceed immediately
  if (approval === 'auto') {
    ctx.log.info('Plan auto-approved');
    return { plan, planPath, sessionId, approved: true, closeSession: false };
  }

  // Agent review: agent writes review.md, then still waits for human
  let reviewPath: string | undefined;
  if (approval === 'agent') {
    const reviewAgent = planning.reviewAgent || 'reviewer';
    ctx.log.info('Requesting agent plan review', { agent: reviewAgent });

    const reviewPrompt = [
      `You are a senior architect reviewing an implementation plan.`,
      `Review the plan below and write a structured review document.`,
      ``,
      `Your review should include:`,
      `1. **Summary** — Brief summary of the plan`,
      `2. **Strengths** — What the plan does well`,
      `3. **Concerns** — Issues, risks, or missing considerations`,
      `4. **Recommendation** — APPROVE, NEEDS_CHANGES, or REJECT with reasoning`,
      ``,
      `## Plan`,
      ``,
      plan,
    ].join('\n');

    // Agent review also runs in plan mode (read-only)
    const reviewResult = await ctx.agent(reviewPrompt, {
      agent: reviewAgent,
      permissionMode: 'plan',
      context: {
        phase: 'plan-review',
        taskId: ctx.taskId,
      },
    });

    const reviewOutput = reviewResult.output || 'No review generated';

    // Save review.md alongside plan.md
    try {
      const reviewFile = ctx.taskDir
        ? `${ctx.taskDir}/review.md`
        : `.crew/plans/${ctx.taskId.replace(/\./g, '-')}-review.md`;
      await ctx.tools.file.write(reviewFile, [
        `# Review: ${ctx.task.title}`,
        '',
        `> Reviewed by: ${reviewAgent}`,
        `> Reviewed at: ${new Date().toISOString()}`,
        '',
        reviewOutput,
      ].join('\n'));
      reviewPath = reviewFile;
      ctx.log.info('Agent review saved', { path: reviewFile });
    } catch (err) {
      ctx.log.warn(`Failed to save review file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Both 'review' and 'agent' modes: wait for human
  // The orchestrator will close the session so human can review offline
  ctx.log.info('Plan awaiting human review — session will close', {
    planPath,
    reviewPath,
    sessionId,
    closeSession,
  });

  return { plan, planPath, reviewPath, sessionId, approved: false, closeSession };
}

/* ------------------------------------------------------------------ */
/*  Default AI Execution                                              */
/* ------------------------------------------------------------------ */

/** Resolve agent name from compound task assignee or task type defaults */
function resolveAgentName(ctx: TaskContext): string | undefined {
  // Explicit assignee on compound task (e.g. "@page-builder" → "page-builder")
  if (ctx.compoundTask.assignee) {
    return ctx.compoundTask.assignee.replace(/^@/, '');
  }
  // Task type may have a default agent (via skill name)
  const taskType = ctx.task.type ? getTaskType(ctx.task.type) : undefined;
  return taskType?.defaults.skill;
}

async function defaultAIExecution(ctx: TaskContext): Promise<TaskResult> {
  let prompt = ctx.task.prompt || ctx.task.promptRef || `Execute: ${ctx.task.title}`;

  // Try to resume the planning session (same machine, session still alive).
  // Falls back to injecting plan text (cross-machine, expired session).
  const planSessionId = ctx.state.get<string>('planSessionId');
  const approvedPlan = ctx.state.get<string>('approvedPlan');

  let resumeSessionId: string | undefined;

  if (planSessionId) {
    // Session resume is best — agent has full context from planning phase.
    // But sessions are machine-local and expire, so this may fail.
    resumeSessionId = planSessionId;
    prompt = 'The plan has been approved. Now execute it — make all the code changes described in the plan.';
    ctx.log.info('Will resume planning session for execution', { sessionId: planSessionId });
  } else if (approvedPlan) {
    // Fallback: inject the plan text into the prompt.
    // Works cross-machine and after session expiry.
    prompt = [
      `## Approved Plan`,
      ``,
      `The following implementation plan has been approved. Execute it precisely.`,
      ``,
      approvedPlan,
      ``,
      `---`,
      ``,
      `## Task`,
      ``,
      prompt,
    ].join('\n');
    ctx.log.info('Using plan text fallback (no session to resume)');
  }

  // Determine agent persona from task assignee or type defaults
  const agentName = resolveAgentName(ctx);

  {
    const mode = resumeSessionId ? 'resume' : approvedPlan ? 'plan-fallback' : 'fresh';
    const skill = ctx.task.skill || 'default';
    const agent = agentName || 'none';
    ctx.log.info(`Delegating to agent (skill=${skill}, agent=${agent}, mode=${mode})`);
  }

  const agentResult = await ctx.agent(prompt, {
    skill: ctx.task.skill,
    skills: ctx.task.skills,
    agent: agentName,
    inputs: ctx.task.inputs,
    outputs: ctx.task.outputs,
    // Resume planning session if available (best path)
    resume: resumeSessionId,
    context: {
      taskType: ctx.task.type,
      taskId: ctx.taskId,
      epic: ctx.epic.title,
      ...ctx.task.vars,
    },
  });

  // Store session ID for quality gate feedback loop
  if (agentResult.sessionId) {
    ctx.state.set('agentSessionId', agentResult.sessionId);
  }

  // Step 3b: Collect structured feedback from the agent session.
  // After the oneshot task completes, send a follow-up prompt asking
  // for a structured completion report (status, summary, errors,
  // follow-up actions). The report is saved as markdown in the plan dir.
  // NOTE: Report collection is deferred when checks exist (to keep
  // the session open for the feedback→retry loop).
  const hasChecks = ctx.task.checks?.length && agentResult.sessionId;
  let reportMeta: Record<string, unknown> = {};

  if (!hasChecks) {
    // No checks — collect report immediately
    try {
      const taskReport = await collectTaskReport(ctx, agentResult);
      reportMeta = {
        report: {
          status: taskReport.report.status,
          summary: taskReport.report.summary,
          errors: taskReport.report.errors,
          followUpActions: taskReport.report.followUpActions,
          reportPath: taskReport.savedPath,
          reportDurationMs: taskReport.durationMs,
        },
      };
      ctx.log.info(`Report: ${taskReport.report.status}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ctx.log.warn(`Report collection failed (non-fatal): ${err.message}`);
    }
  }

  return {
    success: agentResult.success,
    durationMs: agentResult.durationMs,
    output: agentResult.output,
    error: agentResult.error,
    files: agentResult.files,
    metadata: {
      tokens: agentResult.tokens,
      agentSessionId: agentResult.sessionId,
      ...reportMeta,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Check Feedback                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build the feedback prompt sent to the agent when checks fail.
 *
 * Includes:
 *   - Which checks failed and their error output
 *   - Which attempt this is (urgency escalation)
 */
function buildCheckFeedback(
  checkResults: { failed: string[]; results: Array<{ name: string; passed: boolean; issues: string[] }> },
  attempt: number,
  maxAttempts: number,
): string {
  const failedChecks = checkResults.results.filter(r => !r.passed);
  const remaining = maxAttempts - attempt;

  const lines: string[] = [];

  // Urgency header
  if (remaining <= 1) {
    lines.push(`## CRITICAL: Last chance to fix (attempt ${attempt}/${maxAttempts})`);
    lines.push('');
    lines.push('This is your **final attempt**. If the checks fail again, the task will be marked as failed.');
  } else {
    lines.push(`## Checks Failed (attempt ${attempt}/${maxAttempts}, ${remaining} remaining)`);
  }
  lines.push('');

  // Check failure details
  lines.push('The following checks failed after your changes. Please fix the issues and try again:');
  lines.push('');

  for (const check of failedChecks) {
    lines.push(`### ❌ ${check.name}`);
    lines.push('');
    if (check.issues.length > 0) {
      lines.push('```');
      lines.push(check.issues.join('\n'));
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Fix the issues above. After making your changes, the checks will be re-run automatically.');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Yields — Incremental Planning                                     */
/* ------------------------------------------------------------------ */

/**
 * Prompt template for AI-driven yields.
 * The agent reads the task's output and produces structured task definitions.
 *
 * Enforces the atomic/transferable/verifiable task principle:
 *   - Atomic: one clear deliverable per task
 *   - Transferable: all context in inputs + prompt, no implicit knowledge
 *   - Verifiable: explicit output files + check criteria
 */
const YIELDS_PLANNING_PROMPT = `You are a planning agent. A task just completed and produced output files.
Your job is to analyze the output and create follow-up tasks.

## Instructions

{{prompt}}

## Task that just completed

- **Title:** {{taskTitle}}
- **Output files:** {{outputs}}

## Task Design Principles — MANDATORY

Every yielded task MUST be:

### 1. ATOMIC
- One clear deliverable per task (one file, one component, one concern)
- If a task has "and" in the description, split it into two tasks
- Title should complete the sentence "This task will ___"
- A single agent session should complete it in under 10 minutes

### 2. TRANSFERABLE
- All required context must be in the inputs and prompt — no implicit knowledge
- List every file the agent needs to read in inputs array
- The prompt must be self-contained: another agent with no prior context can execute it
- Reference specific sections/headings from input docs, not vague "see the spec"

### 3. VERIFIABLE
- Every task MUST declare at least one output file in outputs array
- The output file must be something that exists (or can be checked) after completion
- Include checks array with the verification command(s)
- If it produces code: the check should be "build" or "tsc"
- If it produces docs: the check should be "file-exists"

## BAD task (too large, vague, unverifiable):
- "Implement all animations" — too broad
- "Fix issues" — no clear deliverable
- "Update the page" — no specific output

## GOOD task (atomic, transferable, verifiable):
- "Implement GSAP scroll-pinned hero animation" — one animation group
- "Add CSS keyframe animation: carousel-scroll" — one animation
- "Create scroll-reveal component for heading reveals" — one component

## Output Format

Use the Write tool to create a file at {{yieldsJsonPath}} with a JSON array of tasks.

Each task object must have these fields:
- "id": short-kebab-id
- "title": Human readable title (one deliverable)
- "inputs": Array of file paths the agent needs to read
- "outputs": Array of file paths this task will create
- "checks": Array of verification commands (e.g., ["build"], ["tsc"])
- "prompt": Self-contained instructions (keep under 500 words)

Optional fields:
- "skill": skill-name
- "deps": Array of task ids this depends on

Example:
[
  {
    "id": "task-1",
    "title": "Do something",
    "inputs": ["file.md"],
    "outputs": ["output.tsx"],
    "checks": ["build"],
    "prompt": "Instructions here"
  }
]`;

/**
 * Parse yielded tasks from JSON string.
 * Direct JSON parsing - no markdown code block extraction needed.
 */
function parseYieldedTasks(raw: string): TaskDef[] {
  const tasks: TaskDef[] = [];

  try {
    const parsed = JSON.parse(raw);
    const taskArray = Array.isArray(parsed) ? parsed : [parsed];

    for (const taskObj of taskArray) {
      if (!taskObj.title) continue; // title is required

      // Map JSON fields to TaskDef format
      const task: TaskDef = {
        id: taskObj.id || undefined,
        title: taskObj.title,
        skill: taskObj.skill || undefined,
        inputs: taskObj.inputs || undefined,
        outputs: taskObj.outputs || undefined,
        deps: taskObj.deps || undefined,
        prompt: taskObj.prompt || undefined,
        checks: taskObj.checks || undefined,
      };

      tasks.push(task);
    }
  } catch (err) {
    // If JSON parsing fails, return empty array (will be caught by validation)
    return [];
  }

  return tasks;
}

/**
 * Validate yielded tasks against atomic/transferable/verifiable principles.
 * Logs warnings for violations but does not reject tasks.
 */
function validateYieldedTasks(tasks: TaskDef[], log: import('./types.ts').TaskLogger): TaskDef[] {
  const valid: TaskDef[] = [];

  for (const task of tasks) {
    const warnings: string[] = [];

    // Atomic: title should not contain "and" suggesting multiple concerns
    if (/\band\b/i.test(task.title) && task.title.length > 60) {
      warnings.push(`title may describe multiple concerns: "${task.title}"`);
    }

    // Transferable: must have inputs
    if (!task.inputs?.length) {
      warnings.push('no inputs declared — task may not be transferable');
    }

    // Transferable: must have a prompt
    if (!task.prompt) {
      warnings.push('no prompt — task is not self-contained');
    }

    // Verifiable: must have outputs
    if (!task.outputs?.length) {
      warnings.push('no outputs declared — task is not verifiable');
    }

    // Prompt length check (should be concise, not a wall of text)
    if (task.prompt && task.prompt.length > 3000) {
      warnings.push(`prompt is ${task.prompt.length} chars — consider splitting into smaller tasks`);
    }

    if (warnings.length > 0) {
      log.warn(`Yielded task "${task.title}" has issues:\n  - ${warnings.join('\n  - ')}`);
    }

    valid.push(task);
  }

  return valid;
}

/**
 * Run the yields phase — resolve follow-up tasks from a completed task.
 *
 * Handles both programmatic (function) and declarative (AI/template) yields.
 */
async function runYields(ctx: TaskContext, result: TaskResult): Promise<SpawnedTask[]> {
  const yields = ctx.task.yields!;
  const MAX_TASKS_DEFAULT = 20;

  try {
    // Determine target (default: current-epic)
    let target: SpawnedTask['target'] = 'current-epic';

    // Check if this is a function (programmatic yields)
    if (typeof yields === 'function') {
      ctx.log.info('Running programmatic yields');
      const rawDefs = await yields(ctx, result);
      const taskDefs = validateYieldedTasks(rawDefs, ctx.log);

      return taskDefs.slice(0, MAX_TASKS_DEFAULT).map(task => ({
        task,
        parentTaskId: ctx.taskId,
        target,
      }));
    }

    // Declarative yields
    const decl = yields as YieldsDeclarative;
    target = decl.target || 'current-epic';
    const maxTasks = decl.maxTasks || MAX_TASKS_DEFAULT;

    // Check condition
    if (decl.when && !decl.when(result)) {
      ctx.log.info('Yields condition not met, skipping');
      return [];
    }

    let taskDefs: TaskDef[] = [];

    if (decl.plan) {
      // AI-driven yields — agent analyzes output and generates tasks
      ctx.log.info('Running AI-driven yields planning');

      // Interpolate variables in the plan prompt: ${varName} → value
      let interpolatedPlan = decl.plan;
      if (ctx.task.vars) {
        for (const [key, value] of Object.entries(ctx.task.vars)) {
          const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
          interpolatedPlan = interpolatedPlan.replace(placeholder, String(value));
        }
      }

      // Determine where the agent should write the JSON file
      const yieldsJsonPath = ctx.taskDir
        ? `${ctx.taskDir}/yields.json`
        : `.crew/plans/${ctx.taskId.replace(/\./g, '-')}-yields.json`;

      const outputFiles = ctx.task.outputs?.join(', ') || 'none';
      const planPrompt = YIELDS_PLANNING_PROMPT
        .replace('{{prompt}}', interpolatedPlan)
        .replace('{{taskTitle}}', ctx.task.title)
        .replace('{{outputs}}', outputFiles)
        .replace('{{yieldsJsonPath}}', yieldsJsonPath);

      const planResult = await ctx.agent(planPrompt, {
        // Don't use skill for yields planning - the planner should be skill-agnostic
        // The skill field in yields config is for the YIELDED tasks, not the planner
        inputs: ctx.task.outputs, // agent reads the parent's outputs
        outputs: [yieldsJsonPath], // Tell agent where to write
        permissionMode: 'plan',
        context: {
          phase: 'yields-planning',
          parentTaskId: ctx.taskId,
          parentTaskTitle: ctx.task.title,
          ...ctx.task.vars,
        },
      });

      // Read the JSON file instead of parsing markdown
      let agentOutput = '';
      if (await ctx.tools.file.exists(yieldsJsonPath)) {
        agentOutput = await ctx.tools.file.read(yieldsJsonPath);
      }

      // Validate that yields.json exists and is valid JSON
      if (!agentOutput) {
        ctx.log.error('Yields agent did not create yields.json file');
        throw new Error(
          `Yields agent must write tasks to ${yieldsJsonPath}.\n` +
          'See YIELDS_PLANNING_PROMPT for required JSON structure.'
        );
      }

      const rawDefs = parseYieldedTasks(agentOutput);
      taskDefs = validateYieldedTasks(rawDefs, ctx.log);

      if (taskDefs.length === 0) {
        ctx.log.warn('AI yields produced no valid tasks');
      }
    } else if (decl.tasks) {
      // Static template yields — expand with parent vars
      const rawDefs = decl.tasks.map(t => ({
        ...t,
        vars: { ...ctx.task.vars, ...t.vars },
      }));
      taskDefs = validateYieldedTasks(rawDefs, ctx.log);
    }

    // Save yields plan for auditability
    if (taskDefs.length > 0) {
      try {
        const yieldsFile = ctx.taskDir
          ? `${ctx.taskDir}/yields.md`
          : `.crew/plans/${ctx.taskId.replace(/\./g, '-')}-yields.md`;

        const content = [
          `# Yielded Tasks: ${ctx.task.title}`,
          '',
          `> Generated at ${new Date().toISOString()}`,
          `> Parent task: ${ctx.taskId}`,
          `> Target: ${typeof target === 'string' ? target : `epic:${target.epic}`}`,
          `> Approval: ${decl.approval || 'auto'}`,
          '',
          `## Tasks (${taskDefs.length})`,
          '',
          ...taskDefs.map((t, i) => {
            // Inline validation markers
            const atomic = (t.prompt?.length || 0) <= 3000 ? 'yes' : 'WARN: prompt too long';
            const transferable = (t.inputs?.length && t.prompt) ? 'yes' : 'WARN: missing inputs or prompt';
            const verifiable = t.outputs?.length ? 'yes' : 'WARN: no outputs';

            return [
              `### ${i + 1}. ${t.title}`,
              t.id ? `- **ID:** ${t.id}` : '',
              t.skill ? `- **Skill:** ${t.skill}` : '',
              t.inputs?.length ? `- **Inputs:** ${t.inputs.join(', ')}` : '- **Inputs:** _(none)_',
              t.outputs?.length ? `- **Outputs:** ${t.outputs.join(', ')}` : '- **Outputs:** _(none)_',
              t.deps?.length ? `- **Deps:** ${t.deps.join(', ')}` : '',
              t.checks?.length ? `- **Checks:** ${t.checks.map(c => typeof c === 'string' ? c : (c as any).name || 'custom').join(', ')}` : '',
              `- **Atomic:** ${atomic} | **Transferable:** ${transferable} | **Verifiable:** ${verifiable}`,
              t.prompt ? `\n${t.prompt}` : '',
              '',
            ].filter(Boolean).join('\n');
          }),
        ].join('\n');

        await ctx.tools.file.write(yieldsFile, content);
        ctx.log.info('Yields plan saved', { path: yieldsFile });
      } catch (err) {
        ctx.log.warn(`Failed to save yields plan: ${err instanceof Error ? err.message : String(err)}`);
      }

      // If approval is 'review', don't return tasks yet — wait for human
      if (decl.approval === 'review') {
        ctx.log.info('Yielded tasks await human review');
        return [];
      }
    }

    // Apply inherited checks and taskType to all yielded tasks
    const enrichedDefs = taskDefs.slice(0, maxTasks).map(task => {
      const enriched = { ...task };

      // Inherit taskType if declared on yields config
      if (decl.taskType && !enriched.type) {
        enriched.type = decl.taskType;
      }

      // Merge inherited checks (yields-level) with per-task checks
      if (decl.checks?.length) {
        const existing = enriched.checks || [];
        enriched.checks = [...existing, ...decl.checks];
      }

      // Inherit skill from yields config OR parent task
      if (!enriched.skill) {
        // First try yields config skill
        if (decl.skill) {
          enriched.skill = decl.skill;
        }
        // Fall back to parent task's skill
        else if (ctx.task.skill) {
          enriched.skill = ctx.task.skill;
        }
      }

      return enriched;
    });

    return enrichedDefs.map(task => ({
      task,
      parentTaskId: ctx.taskId,
      target,
    }));

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.error(`Yields execution failed (non-fatal): ${err.message}`);
    return [];
  }
}
