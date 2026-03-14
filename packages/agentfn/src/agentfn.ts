import { claudefn } from "@crew/claudefn";
import { kimifn } from "@crew/kimifn";
import { qwenfn } from "@crew/qwenfn";
import { geminifn } from "@crew/geminifn";
import type {
  AgentFnOptions,
  AgentFnResult,
  AgentFn,
  Provider,
} from "./types.js";
import type { ClaudeFnOptions } from "@crew/claudefn";
import type { KimiFnOptions } from "@crew/kimifn";
import type { QwenFnOptions } from "@crew/qwenfn";
import type { GeminiFnOptions } from "@crew/geminifn";
import { getDefaultProvider } from "./provider.js";
import { enhancePrompt } from "./prompting.js";
import { ensureSkillSymlinks, cleanupSkillSymlinks } from "./skills.js";
import { join } from "node:path";

/**
 * Create a callable function backed by either Claude or Kimi.
 *
 * Delegates to `claudefn()` or `kimifn()` based on the `provider` option
 * (or the global default). Returns a unified result that includes a
 * `provider` field indicating which backend produced it.
 *
 * Skills handling:
 * - New API: pass `skillsRoot` (+ optional `skills` filter) for explicit control.
 *   agentfn creates symlinks for Claude and cleans up after. No prompt injection.
 * - Legacy: `enableSkills: true` (default) auto-detects .crew/ and injects
 *   prompt footnotes. Deprecated — will be removed.
 */
export function agentfn<T = string>(
  options?: AgentFnOptions<T>,
): AgentFn<T> {
  const opts = options ?? ({} as AgentFnOptions<T>);
  const provider: Provider = opts.provider ?? getDefaultProvider();

  // Determine skill handling mode:
  // - New: skillsRoot is set → explicit symlink management, no prompt injection
  // - Legacy: enableSkills (default true) → auto-detect + prompt enhancement
  const useNewSkills = !!opts.skillsRoot;
  const useLegacySkills = !useNewSkills && (opts.enableSkills ?? true);

  // ── Stream mode validation ──────────────────────────

  if (opts.mode === "stream" && provider !== "claude") {
    throw new Error(
      `Stream mode is not supported with ${provider} provider. Use Claude instead.`
    );
  }

  // ── Call mode ──────────────────────────────────────

  if (provider === "kimi") {
    const fn = kimifn<T>(toKimiOptions(opts));
    return async (input?: string): Promise<AgentFnResult<T>> => {
      let enhancedInput = input;
      if (useLegacySkills && input) {
        enhancedInput = enhancePrompt(input, { cwd: opts.cwd });
      }
      const result = await fn(enhancedInput);
      return { ...result, provider: "kimi" };
    };
  }

  if (provider === "qwen") {
    const fn = qwenfn<T>(toQwenOptions(opts));
    return async (input?: string): Promise<AgentFnResult<T>> => {
      let enhancedInput = input;
      if (useLegacySkills && input) {
        enhancedInput = enhancePrompt(input, { cwd: opts.cwd });
      }
      const result = await fn(enhancedInput);
      return { ...result, provider: "qwen" };
    };
  }

  if (provider === "gemini") {
    const fn = geminifn<T>(toGeminiOptions(opts));
    return async (input?: string): Promise<AgentFnResult<T>> => {
      let enhancedInput = input;
      if (useLegacySkills && input) {
        enhancedInput = enhancePrompt(input, { cwd: opts.cwd });
      }
      const result = await fn(enhancedInput);
      return { ...result, provider: "gemini" };
    };
  }

  // ── Claude provider ────────────────────────────────

  const fn = claudefn<T>(toClaudeOptions(opts));
  return async (input?: string): Promise<AgentFnResult<T>> => {
    // Legacy prompt enhancement (deprecated path)
    let enhancedInput = input;
    if (useLegacySkills && input) {
      enhancedInput = enhancePrompt(input, { cwd: opts.cwd });
    }

    // Symlink management — new explicit path or legacy auto-detect
    let createdSymlinks: string[] = [];
    let symlinkTarget: string | undefined;

    if (useNewSkills && opts.skillsRoot) {
      // New API: explicit skillsRoot → create symlinks in .claude/skills/
      symlinkTarget = opts.cwd
        ? join(opts.cwd, ".claude", "skills")
        : join(process.cwd(), ".claude", "skills");
      createdSymlinks = ensureSkillSymlinks(opts.skillsRoot, {
        skills: opts.skills,
        targetRoot: symlinkTarget,
      });
    } else if (useLegacySkills) {
      // Legacy: auto-detect from .crew/ (deprecated)
      const { _findProjectRoot } = await import("./skills.js");
      const root = _findProjectRoot(opts.cwd);
      if (root) {
        const crewSkillsDir = join(root, ".crew", "skills");
        symlinkTarget = join(root, ".claude", "skills");
        createdSymlinks = ensureSkillSymlinks(crewSkillsDir, {
          targetRoot: symlinkTarget,
        });
      }
    }

    try {
      const result = await fn(enhancedInput);
      return { ...result, provider: "claude" };
    } finally {
      if (createdSymlinks.length > 0 && symlinkTarget) {
        cleanupSkillSymlinks(createdSymlinks, symlinkTarget);
      }
    }
  };
}

// ─── Options Mapping ─────────────────────────────────────────

function toClaudeOptions<T>(opts: AgentFnOptions<T>): ClaudeFnOptions<T> {
  return {
    prompt: opts.prompt,
    mode: opts.mode,
    schema: opts.schema,
    hooks: opts.hooks,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    cwd: opts.cwd,
    queue: opts.queue as ClaudeFnOptions<T>["queue"],
    cliFlags: opts.cliFlags,
    allowedTools: opts.allowedTools,
    systemPrompt: opts.systemPrompt,
    systemPromptFile: opts.systemPromptFile,
    signal: opts.signal,
    // Deprecated SDK-only options — passed through for backward compat
    ...(opts.backend && { backend: opts.backend }),
    ...(opts.model && { model: opts.model }),
    ...(opts.permissionMode !== undefined && { permissionMode: opts.permissionMode }),
    ...(opts.maxTurns && { maxTurns: opts.maxTurns }),
    ...(opts.disallowedTools && { disallowedTools: opts.disallowedTools }),
    ...(opts.mcpServers && { mcpServers: opts.mcpServers }),
    ...(opts.agents && { agents: opts.agents }),
    ...(opts.resume && { resume: opts.resume }),
    ...(opts.effort && { effort: opts.effort }),
    ...(opts.maxBudgetUsd && { maxBudgetUsd: opts.maxBudgetUsd }),
    ...(opts.maxFeedbackTurns && { maxFeedbackTurns: opts.maxFeedbackTurns }),
  } as ClaudeFnOptions<T>;
}

function toKimiOptions<T>(opts: AgentFnOptions<T>): KimiFnOptions<T> {
  return {
    prompt: opts.prompt,
    schema: opts.schema,
    hooks: opts.hooks,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    cwd: opts.cwd,
    queue: opts.queue as KimiFnOptions<T>["queue"],
    cliFlags: opts.cliFlags,
  };
}

function toQwenOptions<T>(opts: AgentFnOptions<T>): QwenFnOptions<T> {
  return {
    prompt: opts.prompt,
    schema: opts.schema,
    hooks: opts.hooks,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    cwd: opts.cwd,
    queue: opts.queue as QwenFnOptions<T>["queue"],
    cliFlags: opts.cliFlags,
  };
}

function toGeminiOptions<T>(opts: AgentFnOptions<T>): GeminiFnOptions<T> {
  return {
    prompt: opts.prompt,
    schema: opts.schema,
    hooks: opts.hooks,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    cwd: opts.cwd,
    queue: opts.queue as GeminiFnOptions<T>["queue"],
    cliFlags: opts.cliFlags,
  };
}
