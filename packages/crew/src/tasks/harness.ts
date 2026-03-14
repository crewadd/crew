/**
 * Task Harness — the core execution abstraction.
 *
 * Every task runs through a harness: propose → validate → refine → repeat.
 *
 * This module provides:
 *   - DefaultHarness: wraps existing executor behavior (propose=agent, validate=checks, refine=feedback)
 *   - AutoHarness: LLM-synthesizes the validate step as executable code
 *   - createHarness(): factory that picks the right harness based on TaskDef
 *
 * The key insight from AutoHarness (arXiv:2603.03329): the LLM generates a
 * validation **function** — executable code — not a list of rules. This function
 * runs deterministically at evaluation time with no LLM in the loop, using
 * ctx.tools to read files, run commands, and inspect output.
 *
 * The synthesized function is persisted as `harness.js` in the task directory,
 * enabling inspection, caching, and the harness-as-policy progression.
 *
 * @see https://arxiv.org/abs/2603.03329
 */

import type {
  TaskContext,
  TaskResult,
  TaskHarness,
  HarnessVerdict,
  HarnessIssue,
  HarnessConfig,
  CheckResult,
} from './types.ts';
import { collectChecks, runChecks } from './task-types.ts';
import {
  readHarnessCode,
  writeHarnessCode,
  clearHarnessCode,
  writeHarnessVerdict,
} from '../store/fs/harness-io.ts';

/* ------------------------------------------------------------------ */
/*  DefaultHarness — wraps existing executor behavior                  */
/* ------------------------------------------------------------------ */

export interface DefaultHarnessOptions {
  /** The propose function — defaults to agent execution */
  proposeFn: (ctx: TaskContext) => Promise<TaskResult>;
  /** The refine function — defaults to agent feedback */
  refineFn?: (ctx: TaskContext, verdict: HarnessVerdict) => Promise<void>;
}

/**
 * Default harness that wraps the existing executor behavior.
 *
 * - propose: delegates to the provided propose function (typically agent execution)
 * - validate: runs all declared checks (tsc, build, prompt checks, cmd checks)
 * - refine: sends error feedback to the agent session
 *
 * This is Phase 1 — zero behavior change, just naming the pattern.
 */
export class DefaultHarness implements TaskHarness {
  private proposeFn: (ctx: TaskContext) => Promise<TaskResult>;
  private refineFn?: (ctx: TaskContext, verdict: HarnessVerdict) => Promise<void>;

  constructor(opts: DefaultHarnessOptions) {
    this.proposeFn = opts.proposeFn;
    this.refineFn = opts.refineFn;
  }

  async propose(ctx: TaskContext): Promise<TaskResult> {
    return this.proposeFn(ctx);
  }

  async validate(ctx: TaskContext, result: TaskResult): Promise<HarnessVerdict> {
    if (!result.success) {
      return {
        accepted: false,
        issues: [{
          message: result.error || 'Task execution failed',
          severity: 'error',
        }],
        score: 0,
      };
    }

    const checks = collectChecks(ctx.task);
    if (checks.length === 0) {
      return { accepted: true, issues: [], score: 1.0 };
    }

    const checkResults = await runChecks(checks, ctx);
    const issues: HarnessIssue[] = checkResults.results
      .filter(r => !r.passed)
      .flatMap(r => r.issues.map(issue => ({
        message: issue,
        severity: 'error' as const,
      })));

    const totalChecks = checkResults.results.length;
    const passedChecks = checkResults.results.filter(r => r.passed).length;
    const score = totalChecks > 0 ? passedChecks / totalChecks : 1.0;

    return {
      accepted: checkResults.allPassed,
      issues,
      score,
    };
  }

  async refine(ctx: TaskContext, verdict: HarnessVerdict): Promise<void> {
    if (this.refineFn) {
      await this.refineFn(ctx, verdict);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  AutoHarness — LLM-synthesized validation function                  */
/* ------------------------------------------------------------------ */

/**
 * Build the prompt that asks the LLM to synthesize a validation function.
 *
 * The LLM generates an async JavaScript function body that:
 *   - Reads output files via `await file.read(path)`
 *   - Checks file existence via `await file.exists(path)`
 *   - Runs shell commands via `await shell.run(cmd)`
 *   - Collects issues into the `issues` array
 *   - Returns nothing (the framework reads the issues array)
 *
 * The generated code runs deterministically — no LLM at evaluation time.
 */
export function buildHarnessSynthesisPrompt(
  config: HarnessConfig,
  taskPrompt?: string,
  inputs?: string[],
  outputs?: string[],
): string {
  const parts: string[] = [];

  parts.push('You are generating a **validation function** (JavaScript) for a code generation task.');
  parts.push('The function runs AFTER the agent produces output. It checks whether the output is correct.');
  parts.push('');

  if (config.prompt) {
    parts.push(`## Validation Criteria`);
    parts.push(config.prompt);
  } else if (config.from === 'inputs' && inputs?.length) {
    parts.push(`## Derive validation from these input files:`);
    for (const f of inputs) parts.push(`- ${f}`);
  } else if (taskPrompt) {
    parts.push(`## Task Requirements (derive validation from this):`);
    parts.push(taskPrompt);
  }

  if (inputs?.length) {
    parts.push('');
    parts.push('## Input files available:');
    for (const f of inputs) parts.push(`- ${f}`);
  }

  if (outputs?.length) {
    parts.push('');
    parts.push('## Output files to validate:');
    for (const f of outputs) parts.push(`- ${f}`);
  }

  parts.push('');
  parts.push('## Available API');
  parts.push('');
  parts.push('Your code runs inside an async function with these variables in scope:');
  parts.push('');
  parts.push('```javascript');
  parts.push('// Read a file (returns string content, throws if missing)');
  parts.push('const content = await file.read("src/Nav.tsx");');
  parts.push('');
  parts.push('// Check if file exists (returns boolean)');
  parts.push('const exists = await file.exists("src/Nav.tsx");');
  parts.push('');
  parts.push('// List files matching glob pattern');
  parts.push('const files = await file.glob("src/**/*.tsx");');
  parts.push('');
  parts.push('// Run a shell command');
  parts.push('const result = await shell.run("grep -r \'export default\' src/");');
  parts.push('// result = { stdout, stderr, exitCode }');
  parts.push('');
  parts.push('// Report an issue (error = blocks acceptance, warning = informational)');
  parts.push('issues.push({ message: "Missing default export", severity: "error" });');
  parts.push('issues.push({ message: "No responsive styles", severity: "warning" });');
  parts.push('```');
  parts.push('');
  parts.push('## Instructions');
  parts.push('');
  parts.push('Write the function body that validates the task output.');
  parts.push('Use `file.read`, `file.exists`, `file.glob`, and `shell.run` to inspect output files.');
  parts.push('Push to `issues` array for any problems found.');
  parts.push('Do NOT use `import`, `require`, or `process` — only the provided API.');
  parts.push('');
  parts.push('Respond with ONLY the JavaScript function body inside a code block:');
  parts.push('');
  parts.push('```javascript');
  parts.push('const nav = await file.read("src/components/Nav.tsx");');
  parts.push('');
  parts.push('if (!nav.includes("from \'next/link\'")) {');
  parts.push('  issues.push({ message: "Must use Next.js Link for navigation", severity: "error" });');
  parts.push('}');
  parts.push('');
  parts.push('if (!nav.includes("@media") && !nav.includes("md:")) {');
  parts.push('  issues.push({ message: "No responsive breakpoints found", severity: "warning" });');
  parts.push('}');
  parts.push('```');

  return parts.join('\n');
}

/**
 * Extract JavaScript code from LLM response.
 * Handles markdown code blocks and raw code.
 */
export function extractHarnessCode(raw: string): string | null {
  // Try to extract from ```javascript or ```js code block
  const jsMatch = raw.match(/```(?:javascript|js)\n([\s\S]*?)```/);
  if (jsMatch) return jsMatch[1].trim();

  // Try generic code block
  const genericMatch = raw.match(/```\n([\s\S]*?)```/);
  if (genericMatch) return genericMatch[1].trim();

  // If the response looks like raw code (has await, issues.push, etc.)
  const trimmed = raw.trim();
  if (trimmed.includes('await ') || trimmed.includes('issues.push')) {
    return trimmed;
  }

  return null;
}

/**
 * Execute a synthesized harness function in a sandboxed scope.
 *
 * The function body has access to:
 *   - `file` — { read, exists, glob } from ctx.tools.file
 *   - `shell` — { run } from ctx.tools.shell
 *   - `issues` — mutable array to push HarnessIssue objects into
 *
 * No access to: require, import, process, global, __dirname, etc.
 */
export async function executeHarnessCode(
  code: string,
  ctx: TaskContext,
): Promise<HarnessIssue[]> {
  const issues: HarnessIssue[] = [];

  // Build the async function from the code string
  // The function body has `file`, `shell`, `issues` in scope
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  const fn = new AsyncFunction(
    'file', 'shell', 'issues',
    code,
  );

  await fn(ctx.tools.file, ctx.tools.shell, issues);

  // Normalize issues — ensure severity is valid
  return issues.map(issue => ({
    message: String(issue.message || 'Unknown issue'),
    severity: issue.severity === 'warning' ? 'warning' as const : 'error' as const,
    ...(issue.file ? { file: String(issue.file) } : {}),
    ...(issue.line ? { line: Number(issue.line) } : {}),
  }));
}

/**
 * Consolidate harness issues for cleaner feedback to the LLM.
 *
 * The critic deduplicates identical messages, groups by file, and
 * prioritizes errors over warnings. This gives the re-synthesis prompt
 * a clean, actionable summary instead of raw duplicated noise.
 */
export function consolidateIssues(issues: HarnessIssue[]): HarnessIssue[] {
  // Deduplicate by message (keep highest severity)
  const seen = new Map<string, HarnessIssue>();
  for (const issue of issues) {
    const key = issue.message;
    const existing = seen.get(key);
    if (!existing || (issue.severity === 'error' && existing.severity === 'warning')) {
      seen.set(key, issue);
    }
  }

  // Sort: errors first, then warnings; within each group, sort by file
  return [...seen.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return (a.file ?? '').localeCompare(b.file ?? '');
  });
}

/**
 * Build a refinement prompt for re-synthesizing the harness function.
 *
 * Includes the original synthesis context PLUS the previous verdict's issues,
 * so the LLM can improve its validation function based on what was found.
 * The previous harness code is included so the LLM can see what it generated
 * before and fix false positives/negatives.
 */
export function buildHarnessRefinementPrompt(
  config: HarnessConfig,
  previousIssues: HarnessIssue[],
  previousCode: string,
  taskPrompt?: string,
  inputs?: string[],
  outputs?: string[],
): string {
  // Start with the base synthesis prompt
  const base = buildHarnessSynthesisPrompt(config, taskPrompt, inputs, outputs);

  const consolidated = consolidateIssues(previousIssues);

  const parts: string[] = [base];
  parts.push('');
  parts.push('## Previous Harness (needs improvement)');
  parts.push('');
  parts.push('The previous validation function found these issues, but the agent has');
  parts.push('since revised its output. Refine the harness to be more precise:');
  parts.push('');
  parts.push('### Issues found last run:');
  for (const issue of consolidated) {
    const loc = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
    parts.push(`- [${issue.severity}]${loc} ${issue.message}`);
  }

  parts.push('');
  parts.push('### Previous harness code:');
  parts.push('```javascript');
  parts.push(previousCode);
  parts.push('```');

  parts.push('');
  parts.push('### Refinement instructions:');
  parts.push('- Keep checks that are still valid');
  parts.push('- Remove or fix checks that were false positives');
  parts.push('- Add new checks if the previous harness missed something');
  parts.push('- The agent may have fixed some issues — verify before flagging');

  return parts.join('\n');
}

/**
 * AutoHarness — wraps a base harness and adds LLM-synthesized validation.
 *
 * The LLM generates an executable JavaScript function from the task prompt.
 * This function reads output files, runs commands, and reports issues —
 * all deterministically, with no LLM in the evaluation loop.
 *
 * The synthesized code is persisted as `harness.js` in the task directory
 * for inspection, caching, and the harness-as-policy progression:
 *
 *   LLM synthesizes → harness.js → runs deterministically → cached across retries
 *
 * On refinement (when `config.refinable` is true), the previous verdict's
 * issues are fed back into the synthesis prompt so the LLM can improve the
 * harness function. Issues are consolidated by a critic before being passed
 * to avoid noise and duplication.
 *
 * This is Phase 2 — the `.harness()` feature.
 *
 * @see https://arxiv.org/abs/2603.03329
 */
export class AutoHarness implements TaskHarness {
  private base: TaskHarness;
  private config: HarnessConfig;
  private synthesizedCode: string | null = null;
  private attempt = 0;
  private previousIssues: HarnessIssue[] | null = null;
  private previousCode: string | null = null;

  constructor(base: TaskHarness, config: HarnessConfig) {
    this.base = base;
    this.config = config;
  }

  /** Get the synthesized code (for testing/inspection) */
  get code(): string | null {
    return this.synthesizedCode;
  }

  async propose(ctx: TaskContext): Promise<TaskResult> {
    return this.base.propose(ctx);
  }

  async validate(ctx: TaskContext, result: TaskResult): Promise<HarnessVerdict> {
    // First run base validation (structural checks)
    const baseVerdict = await this.base.validate(ctx, result);

    // If base failed with score 0 (execution error), skip AutoHarness
    if (baseVerdict.score === 0 && !baseVerdict.accepted) {
      return baseVerdict;
    }

    // Synthesize harness code if not already done
    if (this.synthesizedCode === null) {
      this.synthesizedCode = await this.synthesizeCode(ctx);
    }

    // If no code was synthesized, return base verdict
    if (!this.synthesizedCode) {
      return baseVerdict;
    }

    // Execute the synthesized function — deterministic, no LLM needed
    const harnessIssues = await this.executeCode(ctx, this.synthesizedCode);

    // Merge with base verdict
    const allIssues = [...baseVerdict.issues, ...harnessIssues];
    const errorCount = allIssues.filter(i => i.severity === 'error').length;

    // Score: count base checks + harness as one unit
    const baseCheckCount = Math.max(1, baseVerdict.issues.length + (baseVerdict.accepted ? 1 : 0));
    const harnessCheckCount = 1; // The harness function is one validation unit
    const totalChecks = baseCheckCount + harnessCheckCount;
    const failedChecks = (baseVerdict.accepted ? 0 : 1) + (harnessIssues.some(i => i.severity === 'error') ? 1 : 0);
    const score = Math.max(0, (totalChecks - failedChecks) / totalChecks);

    const verdict: HarnessVerdict = {
      accepted: baseVerdict.accepted && errorCount === 0,
      issues: allIssues,
      score,
    };

    // Persist verdict to disk
    this.attempt++;
    if (ctx.taskDir) {
      try {
        writeHarnessVerdict(ctx.taskDir, {
          attempt: this.attempt,
          accepted: verdict.accepted,
          score: verdict.score,
          issues: verdict.issues,
        });
      } catch {
        // Persistence is non-fatal
      }
    }

    return verdict;
  }

  async refine(ctx: TaskContext, verdict: HarnessVerdict): Promise<void> {
    await this.base.refine(ctx, verdict);

    // If refinable, store issues + code for feedback-aware re-synthesis
    if (this.config.refinable) {
      // Save current state for the refinement prompt
      this.previousIssues = consolidateIssues(verdict.issues);
      this.previousCode = this.synthesizedCode;
      this.synthesizedCode = null;

      ctx.log.debug('Stored verdict issues for harness re-synthesis', {
        issueCount: this.previousIssues.length,
      });

      // Clear disk cache so next synthesis is fresh
      if (ctx.taskDir) {
        try {
          clearHarnessCode(ctx.taskDir);
          ctx.log.debug('Cleared cached harness code for re-synthesis');
        } catch {
          // Non-fatal
        }
      }
    }
  }

  /**
   * Synthesize the validation function from the task definition.
   *
   * Checks disk cache first (harness.js in taskDir). If cached code
   * exists and `config.cache` is enabled, reuses it without LLM call.
   * After synthesis, persists code to disk for inspection and reuse.
   */
  private async synthesizeCode(ctx: TaskContext): Promise<string | null> {
    // Check disk cache (when cache is enabled and taskDir is available)
    if (this.config.cache && ctx.taskDir) {
      try {
        const cached = readHarnessCode(ctx.taskDir);
        if (cached) {
          ctx.log.info('AutoHarness loaded cached harness.js from disk');
          return cached;
        }
      } catch {
        // Cache read failed — proceed with synthesis
      }
    }

    // Use refinement prompt if we have feedback from a previous attempt
    const prompt = (this.previousIssues?.length && this.previousCode)
      ? buildHarnessRefinementPrompt(
          this.config,
          this.previousIssues,
          this.previousCode,
          ctx.task.prompt,
          ctx.task.inputs,
          ctx.task.outputs,
        )
      : buildHarnessSynthesisPrompt(
          this.config,
          ctx.task.prompt,
          ctx.task.inputs,
          ctx.task.outputs,
        );

    try {
      const result = await ctx.agent(prompt, {
        timeout: 30_000,
      });

      if (!result.success) {
        ctx.log.warn(`AutoHarness synthesis failed: ${result.error}`);
        return null;
      }

      const code = extractHarnessCode(result.output);
      if (!code) {
        ctx.log.warn('AutoHarness: could not extract code from LLM response');
        return null;
      }

      ctx.log.info('AutoHarness synthesized validation function', {
        codeLength: code.length,
      });

      // Persist synthesized code to disk
      if (ctx.taskDir) {
        try {
          writeHarnessCode(ctx.taskDir, code, {
            from: this.config.from,
            prompt: this.config.prompt,
          });
          ctx.log.debug('Saved harness function to harness.js');
        } catch {
          // Persistence is non-fatal
        }
      }

      return code;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ctx.log.warn(`AutoHarness synthesis error: ${err.message}`);
      return null;
    }
  }

  /**
   * Execute the synthesized harness function.
   *
   * The function runs with access to file/shell tools but in a restricted
   * scope — no require, import, process, global, etc.
   *
   * If the function throws, the error is caught and reported as an issue.
   */
  private async executeCode(
    ctx: TaskContext,
    code: string,
  ): Promise<HarnessIssue[]> {
    try {
      return await executeHarnessCode(code, ctx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ctx.log.warn(`AutoHarness execution error: ${err.message}`);
      return [{
        message: `Harness function threw: ${err.message}`,
        severity: 'error',
      }];
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create the appropriate harness for a task.
 *
 * - If task has `.harness()` config → AutoHarness wrapping DefaultHarness
 * - Otherwise → DefaultHarness
 */
export function createHarness(
  opts: DefaultHarnessOptions,
  harnessConfig?: HarnessConfig,
): TaskHarness {
  const base = new DefaultHarness(opts);

  if (harnessConfig) {
    return new AutoHarness(base, harnessConfig);
  }

  return base;
}
