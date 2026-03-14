/**
 * Task Type Registry & Check Runner
 *
 * Generic registry mechanism — ships with ZERO built-in types.
 * Projects define their own task types and checks in .crew/setup.
 *
 * The framework provides:
 *   - registerTaskType / getTaskType — type registry
 *   - registerCheck / runCheck — check registry + runner
 *   - extendTaskType — composable type extensions
 *
 * Projects provide:
 *   - Task type definitions (e.g., 'coding', 'planning')
 *   - Check plugins (e.g., 'tsc', 'build', 'pytest')
 */

import type {
  TaskType,
  TaskContext,
  TaskResult,
  CheckRef,
  CheckResult,
  CheckPlugin,
  CheckRegistry,
  PromptCheck,
  CmdCheck,
} from './types.ts';
import { agentfn } from '@crew/agentfn';
import type { Provider } from '@crew/agentfn';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Task Type Registry                                                */
/* ------------------------------------------------------------------ */

const registry = new Map<string, TaskType>();
const extensions = new Map<string, TaskTypeExtension[]>();

export interface TaskTypeExtension {
  onStart?: (ctx: TaskContext) => void | Promise<void>;
  onComplete?: (ctx: TaskContext, result: TaskResult) => void | Promise<void>;
  onFail?: (ctx: TaskContext, error: Error) => void | Promise<void>;
  checks?: CheckRef[];
}

export function registerTaskType(type: TaskType): void {
  registry.set(type.name, type);
}

export function getTaskType(name: string): TaskType | undefined {
  const base = registry.get(name);
  if (!base) return undefined;

  const exts = extensions.get(name);
  if (!exts || exts.length === 0) return base;

  return mergeTaskTypeExtensions(base, exts);
}

export function hasTaskType(name: string): boolean {
  return registry.has(name);
}

export function listTaskTypes(): string[] {
  return Array.from(registry.keys());
}

export function extendTaskType(name: string, extension: TaskTypeExtension): void {
  const existing = extensions.get(name) || [];
  existing.push(extension);
  extensions.set(name, existing);
}

function mergeTaskTypeExtensions(base: TaskType, exts: TaskTypeExtension[]): TaskType {
  const merged: TaskType = {
    name: base.name,
    description: base.description,
    defaults: { ...base.defaults },
    checks: [...(base.checks || [])],
  };

  for (const ext of exts) {
    if (ext.onStart) {
      const originalOnStart = merged.defaults.onStart;
      merged.defaults.onStart = async (ctx: TaskContext) => {
        await originalOnStart?.(ctx);
        await ext.onStart!(ctx);
      };
    }

    if (ext.onComplete) {
      const originalOnComplete = merged.defaults.onComplete;
      merged.defaults.onComplete = async (ctx: TaskContext, result: TaskResult) => {
        await originalOnComplete?.(ctx, result);
        await ext.onComplete!(ctx, result);
      };
    }

    if (ext.onFail) {
      const originalOnFail = merged.defaults.onFail;
      merged.defaults.onFail = async (ctx: TaskContext, error: Error) => {
        await originalOnFail?.(ctx, error);
        await ext.onFail!(ctx, error);
      };
    }

    if (ext.checks) {
      (merged.checks as CheckRef[]).push(...ext.checks);
    }
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/*  Check Registry                                                    */
/* ------------------------------------------------------------------ */

const checkRegistry = new Map<string, CheckPlugin>();

export function registerCheck(name: string, plugin: CheckPlugin): void {
  checkRegistry.set(name, plugin);
}

export function registerChecks(checks: CheckRegistry): void {
  for (const [name, plugin] of Object.entries(checks)) {
    registerCheck(name, plugin);
  }
}

export function getCheck(name: string): CheckPlugin | undefined {
  return checkRegistry.get(name);
}

export function listChecks(): string[] {
  return Array.from(checkRegistry.keys());
}

/* ------------------------------------------------------------------ */
/*  Check Runner                                                      */
/* ------------------------------------------------------------------ */

export async function runCheck(
  ref: CheckRef,
  ctx: TaskContext,
): Promise<{ name: string; passed: boolean; issues: string[] }> {
  // Inline function check
  if (typeof ref === 'object' && 'fn' in ref) {
    ctx.log.info('Running inline check');
    const result = await ref.fn(ctx);
    return {
      name: 'inline',
      passed: result.passed,
      issues: result.issues || (result.output ? [result.output] : []),
    };
  }

  // Shell command check
  if (typeof ref === 'object' && 'cmd' in ref) {
    return runCmdCheck(ref, ctx);
  }

  // AI prompt-based check
  if (typeof ref === 'object' && 'prompt' in ref) {
    return runPromptCheck(ref, ctx);
  }

  // Named check (string or object with name)
  const name = typeof ref === 'string' ? ref : ref.name;
  const plugin = checkRegistry.get(name);

  if (!plugin) {
    ctx.log.warn(`Check "${name}" not found in registry. Skipping.`);
    return { name, passed: true, issues: [`Check "${name}" not registered — skipped`] };
  }

  ctx.log.info(`Running check: ${name}`);
  const result = await plugin(ctx);

  if (!result.passed) {
    ctx.log.error(`Check "${name}" failed${result.output ? ':\n' + result.output : ''}`);
  }

  return {
    name,
    passed: result.passed,
    issues: result.issues || (result.output ? [result.output] : []),
  };
}

export async function runChecks(
  refs: CheckRef[],
  ctx: TaskContext,
): Promise<{ allPassed: boolean; failed: string[]; results: Array<{ name: string; passed: boolean; issues: string[] }> }> {
  const results: Array<{ name: string; passed: boolean; issues: string[] }> = [];
  const failed: string[] = [];

  for (const ref of refs) {
    try {
      const result = await runCheck(ref, ctx);
      results.push(result);
      if (!result.passed) {
        failed.push(result.name);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const name = typeof ref === 'string'
        ? ref
        : 'fn' in ref ? 'inline'
        : 'cmd' in ref ? (ref.name || ref.cmd.slice(0, 40))
        : 'prompt' in ref ? (ref.name || ref.prompt.slice(0, 40))
        : ref.name;
      ctx.log.error(`Check "${name}" threw error`, { error: msg });
      failed.push(name);
      results.push({ name, passed: false, issues: [msg] });
    }
  }

  return { allPassed: failed.length === 0, failed, results };
}

/* ------------------------------------------------------------------ */
/*  Shell Command Check                                               */
/* ------------------------------------------------------------------ */

/**
 * Run a shell command check.
 *
 * Executes the command via ctx.tools.shell.run() and checks the exit code.
 * Passes if exit code is 0. On failure, stdout+stderr are returned as issues.
 */
async function runCmdCheck(
  ref: CmdCheck,
  ctx: TaskContext,
): Promise<{ name: string; passed: boolean; issues: string[] }> {
  const displayName = ref.name || ref.cmd.slice(0, 60).replace(/\n/g, ' ');
  ctx.log.info(`Running cmd check: ${displayName}`);

  try {
    const cwd = ref.cwd || ctx.buildCtx.appDir;
    const result = await ctx.tools.shell.run(ref.cmd, { cwd });

    if (result.exitCode === 0) {
      ctx.log.info(`Cmd check "${displayName}" passed`);
      return { name: displayName, passed: true, issues: [] };
    }

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    ctx.log.error(`Cmd check "${displayName}" failed (exit ${result.exitCode})${output ? ':\n' + output : ''}`);
    return {
      name: displayName,
      passed: false,
      issues: [output || `Command exited with code ${result.exitCode}`],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.error(`Cmd check "${displayName}" threw error: ${err.message}`);
    return {
      name: displayName,
      passed: false,
      issues: [`Command execution failed: ${err.message}`],
    };
  }
}

/* ------------------------------------------------------------------ */
/*  AI Prompt Check                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  AI Check System Prompt                                             */
/* ------------------------------------------------------------------ */

/**
 * System prompt for AI quality check evaluator.
 *
 * Establishes the evaluator's identity, behavioral rules, and output contract
 * separately from the per-check user prompt. This ensures consistent behavior
 * across all AI checks regardless of criteria content.
 */
const AI_CHECK_SYSTEM_PROMPT = `You are a QA Gate — an automated quality checker in a CI pipeline.

## Identity

You validate task outputs against acceptance criteria. You are strict but fair:
- PASS if all criteria are genuinely met
- FAIL if any criterion is not met
- Never invent criteria — only check what is explicitly listed

## Behavioral Rules

1. Evaluate ONLY against the acceptance criteria provided — nothing else
2. Read file contents carefully; check for substance, not just presence
3. Your feedback must be specific: reference exact file paths and quote content
4. Do not check formatting, style, or best practices unless the criteria require it
5. Empty or stub files always FAIL (unless the criteria explicitly accept them)

## Output Contract

Respond with ONLY this JSON — no other text before or after:

\`\`\`json
{
  "passed": true | false,
  "feedback": "your feedback here"
}
\`\`\`

If FAILED: describe exactly what's wrong, which file/section violates the criteria, and what the agent should do to fix it.
If PASSED: briefly confirm what was verified (1-2 sentences).`;

/* buildAICheckPrompt removed — context now delivered via systemPromptFile */

/**
 * Run an AI-based prompt check.
 *
 * Reads the task's output files (or explicitly specified files),
 * sends them with full task context to a lightweight agentfn call,
 * and parses the structured pass/fail + feedback response.
 */
async function runPromptCheck(
  ref: PromptCheck,
  ctx: TaskContext,
): Promise<{ name: string; passed: boolean; issues: string[] }> {
  const displayName = ref.name || ref.prompt.slice(0, 40).replace(/\n/g, ' ');
  ctx.log.info(`Running AI check: ${displayName}`);

  // Determine which files to evaluate
  const filePaths = ref.files || ctx.task.outputs || [];

  if (filePaths.length === 0) {
    ctx.log.warn('AI check has no files to evaluate (no outputs declared)');
    return {
      name: displayName,
      passed: false,
      issues: ['No files to evaluate — declare outputs on the task or files on the check'],
    };
  }

  // Read file contents, expanding globs
  // Budget: ~120K chars (~30K tokens). Modern models support 200K tokens,
  // so this leaves ample room for system prompt and reasoning.
  const MAX_TOTAL_CHARS = 120_000;
  const fileContents: string[] = [];
  const missingFiles: string[] = [];
  let totalChars = 0;

  for (const filePath of filePaths) {
    if (totalChars >= MAX_TOTAL_CHARS) break;

    // Check if it's a glob-like pattern or directory (ends with /)
    if (filePath.includes('*') || filePath.endsWith('/')) {
      try {
        const pattern = filePath.endsWith('/') ? `${filePath}**/*` : filePath;
        const matches = await ctx.tools.file.glob(pattern);
        for (const match of matches.slice(0, 20)) { // Cap at 20 files
          if (totalChars >= MAX_TOTAL_CHARS) break;
          try {
            const content = await ctx.tools.file.read(match);
            const perFileLimit = Math.max(3000, MAX_TOTAL_CHARS - totalChars);
            const chunk = content.slice(0, perFileLimit);
            const entry = `### ${match}\n\`\`\`\n${chunk}\n\`\`\``;
            fileContents.push(entry);
            totalChars += entry.length;
          } catch {
            // Skip unreadable files (binary, etc)
          }
        }
      } catch {
        missingFiles.push(filePath);
      }
    } else {
      const exists = await ctx.tools.file.exists(filePath);
      if (exists) {
        try {
          const content = await ctx.tools.file.read(filePath);
          const perFileLimit = Math.max(3000, MAX_TOTAL_CHARS - totalChars);
          const chunk = content.slice(0, perFileLimit);
          const entry = `### ${filePath}\n\`\`\`\n${chunk}\n\`\`\``;
          fileContents.push(entry);
          totalChars += entry.length;
        } catch {
          missingFiles.push(filePath);
        }
      } else {
        missingFiles.push(filePath);
      }
    }
  }

  // If all files are missing, fail immediately
  if (fileContents.length === 0) {
    const issues = missingFiles.map(f => `File not found: ${f}`);
    return { name: displayName, passed: false, issues };
  }

  // Build context file with file contents (delivered via --append-system-prompt-file
  // to keep the user prompt short and avoid CLI arg length limits / ENAMETOOLONG).
  const filesSection = fileContents.join('\n\n')
    + (missingFiles.length > 0
      ? `\n\n**Missing files (could not be read):** ${missingFiles.join(', ')}`
      : '');

  const taskRoot = ctx.taskDir || ctx.buildCtx.appDir;
  const contextMd = `${AI_CHECK_SYSTEM_PROMPT}

## Task Context

- **Task:** ${ctx.task.title}
- **Task ID:** ${ctx.taskId}
- **Epic:** ${ctx.epic.title}
- **Task root:** \`${taskRoot}\`
${ctx.task.inputs?.length ? `- **Inputs:** ${ctx.task.inputs.join(', ')}` : ''}
${ctx.task.outputs?.length ? `- **Expected outputs:** ${ctx.task.outputs.join(', ')}` : ''}

## Files to Evaluate

${filesSection}`;

  // Write context to a temp .md file — avoids ENAMETOOLONG on spawn
  const contextFile = join(tmpdir(), `crew-check-${randomUUID()}.md`);
  writeFileSync(contextFile, contextMd, 'utf-8');

  // User prompt is kept short: just the acceptance criteria
  const evalPrompt = `## Acceptance Criteria\n\n${ref.prompt}\n\nEvaluate the files in the system context against these criteria. Respond with JSON: { "passed": boolean, "feedback": "..." }`;

  try {
    const provider = (ctx.buildCtx as { provider?: string }).provider as Provider | undefined;
    const evaluate = agentfn({
      prompt: evalPrompt,
      systemPromptFile: contextFile,
      provider,
      cwd: ctx.buildCtx.appDir,
      timeoutMs: 600_000,
    });

    const result = await evaluate();

    // Parse JSON response
    let verdict: { passed: boolean; feedback: string };
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = result.raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      verdict = JSON.parse(jsonMatch[0]);
    } catch {
      ctx.log.warn(`AI check response was not valid JSON, treating as failed:\n${result.raw.slice(0, 200)}`);
      verdict = { passed: false, feedback: result.raw.slice(0, 500) };
    }

    if (!verdict.passed) {
      ctx.log.error(`AI check "${displayName}" failed: ${verdict.feedback}`);
    } else {
      ctx.log.info(`AI check "${displayName}" passed`);
    }

    return {
      name: displayName,
      passed: verdict.passed,
      issues: verdict.passed ? [] : [verdict.feedback],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.error(`AI check "${displayName}" threw error: ${err.message}`);
    return {
      name: displayName,
      passed: false,
      issues: [`AI check evaluation failed: ${err.message}`],
    };
  } finally {
    // Clean up temp context file
    try { unlinkSync(contextFile); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Collect all checks for a task (from task + task type)
 */
export function collectChecks(task: import('./types.ts').TaskDef): CheckRef[] {
  const checks: CheckRef[] = [...(task.checks || [])];

  // Add task type checks
  const taskType = task.type ? getTaskType(task.type) : undefined;
  if (taskType?.checks) {
    checks.push(...taskType.checks);
  }

  return checks;
}

/**
 * Collect review gates for a task (task-level overrides type-level)
 */
export function collectTaskReviewGates(task: import('./types.ts').TaskDef): import('./types.ts').ReviewGate[] {
  // Task-level review gates take priority
  if (task.review) {
    return Array.isArray(task.review) ? task.review : [task.review];
  }

  // Fall back to task type default
  const taskType = task.type ? getTaskType(task.type) : undefined;
  if (taskType?.review) {
    return [taskType.review];
  }

  return [];
}

/**
 * Collect report prompt for a task (task-level overrides type-level)
 */
export function collectTaskReportPrompt(task: import('./types.ts').TaskDef): string | undefined {
  if (task.reportPrompt) return task.reportPrompt;

  const taskType = task.type ? getTaskType(task.type) : undefined;
  return taskType?.reportPrompt;
}
