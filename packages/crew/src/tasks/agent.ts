/**
 * AI Agent Implementation
 *
 * Wraps the actual agentfn execution for task delegation.
 * This is where 95% of tasks hand off to AI.
 *
 * Prompt assembly order (research-optimal):
 *   1. Agent persona (behavioral constraints — highest priority)
 *   2. Skill workflow (on-demand knowledge)
 *   3. Context (structured inputs/outputs/vars)
 *   4. Task instruction (the actual work — last, most immediate)
 */

import type { AgentFn, AgentOptions, AgentResult } from './types.ts';
import type { BuildContext, AgentConfig } from '../types.ts';
import { agentfn as createAgentFn } from '@crew/agentfn';
import type { Provider } from '@crew/agentfn';
import {
  loadAgentPersona,
  buildSystemPromptFromPersona,
  getSkillsRoot,
  discoverSkills,
  parseSkillInvocation,
  expandSkillInvocation,
} from '../agent-loader.ts';

export interface CreateAgentOptions {
  buildCtx: BuildContext;

  /**
   * Agent configuration (provider, model, etc.).
   * If not provided, uses the default provider from agentfn.
   */
  agentConfig?: AgentConfig;

  /**
   * Optional custom agent implementation.
   * If not provided, uses the default agent wrapper.
   */
  customAgent?: AgentFn;
}

/**
 * Create an AI agent function for task delegation.
 *
 * The agent function handles:
 *   1. Loading the appropriate skill/persona
 *   2. Assembling structured prompts with XML tags
 *   3. Executing the agent with context
 *   4. Tracking results and timing
 */
export function createAgent(opts: CreateAgentOptions): AgentFn {
  if (opts.customAgent) {
    return opts.customAgent;
  }

  return async function agent(prompt: string, options?: AgentOptions): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Load agent persona if specified (via agent-loader, not duplicated)
      const persona = options?.agent
        ? loadAgentPersona(opts.buildCtx, options.agent)
        : null;

      // Build structured prompt with XML tags (user message)
      let fullPrompt = assemblePrompt(prompt, {
        context: options?.context,
        inputs: options?.inputs,
        outputs: options?.outputs,
        epic: options?.context?.epic as string | undefined,
      });

      // Collect linked skills
      const linkedSkills = new Set<string>();
      if (options?.skill) linkedSkills.add(options.skill);
      if (options?.skills?.length) {
        for (const s of options.skills) linkedSkills.add(s);
      }
      if (persona?.skills?.length) {
        for (const s of persona.skills) linkedSkills.add(s);
      }

      // /skill-name at prompt start → expand (provider-aware)
      const provider = (opts.agentConfig?.provider ?? 'claude') as string;
      const invocation = parseSkillInvocation(fullPrompt);
      if (invocation) {
        const expanded = expandSkillInvocation(opts.buildCtx, invocation, provider);
        if (expanded) {
          fullPrompt = expanded;
          linkedSkills.add(invocation.skillName);
        }
      }

      // /skill-name mid-prompt → add to linked list
      const discovered = discoverSkills(opts.buildCtx);
      if (discovered.length > 0) {
        const knownByName = new Set(discovered.map(s => s.name));
        const knownByDir = new Set(discovered.map(s => s.dirName));
        fullPrompt = fullPrompt.replace(/\/([\w-]+)/g, (match, name) => {
          if (knownByDir.has(name) || knownByName.has(name)) {
            linkedSkills.add(name);
            return name;
          }
          return match;
        });
      }

      // Build system prompt: persona constraints
      const systemParts: string[] = [];
      if (persona) {
        systemParts.push(buildSystemPromptFromPersona(persona));
      }
      const systemPrompt = systemParts.length > 0
        ? systemParts.join('\n\n')
        : undefined;

      // Append skill references to user prompt (Claude Code loads them from .claude/skills/)
      if (linkedSkills.size > 0) {
        const { buildSkillPromptSection } = await import('../agent-loader.ts');
        const skillPromptSection = buildSkillPromptSection(opts.buildCtx, linkedSkills);
        if (skillPromptSection) {
          fullPrompt = `${fullPrompt}\n\n${skillPromptSection}`;
        }
        console.error(`[agent] Linked skills: ${[...linkedSkills].join(', ')}`);
      }

      // Execute via agentfn — delegates to configured provider
      const result = await executeAgentFn(
        fullPrompt,
        { ...options, cwd: opts.buildCtx.appDir, systemPrompt },
        opts.agentConfig,
        opts.buildCtx,
        linkedSkills,
      );

      return {
        success: result.success,
        output: result.output,
        files: result.files,
        durationMs: Date.now() - startTime,
        tokens: result.tokens,
        error: result.error,
        sessionId: result.sessionId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        output: '',
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Structured Prompt Assembly                                         */
/* ------------------------------------------------------------------ */

/**
 * Assemble a structured prompt with XML tags for clear section boundaries.
 *
 * Order: context → instruction
 *
 * Skills are NOT inlined here — they're listed in system prompt and loaded on demand.
 * Agent persona also goes in system prompt via --append-system-prompt.
 */
export function assemblePrompt(
  prompt: string,
  opts: {
    context?: Record<string, unknown>;
    inputs?: string[];
    outputs?: string[];
    epic?: string;
  }
): string {
  const parts: string[] = [];

  // 1. Context (structured, not scattered)
  const hasContext = opts.context || opts.inputs?.length || opts.outputs?.length || opts.epic;
  if (hasContext) {
    parts.push('<context>');
    if (opts.epic) {
      parts.push(`Epic: ${opts.epic}`);
    }
    if (opts.inputs?.length) {
      parts.push(`Input files: ${opts.inputs.join(', ')}`);
    }
    if (opts.outputs?.length) {
      parts.push(`Expected outputs: ${opts.outputs.join(', ')}`);
    }
    if (opts.context) {
      for (const [key, value] of Object.entries(opts.context)) {
        if (key === 'epic') continue; // Already handled above
        parts.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      }
    }
    parts.push('</context>');
    parts.push('');
  }

  // 4. Task instruction (the actual work — last, most immediate)
  parts.push(prompt);

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Skill & Agent Loaders                                              */
/* ------------------------------------------------------------------ */


/**
 * Execute via agentfn — delegates to the configured provider
 * (claude, kimi, qwen, gemini).
 */
interface AgentFnExecResult {
  success: boolean;
  output: string;
  files?: string[];
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
  /** Session ID for sending follow-up feedback */
  sessionId?: string;
}

async function executeAgentFn(
  prompt: string,
  opts: AgentOptions & { cwd: string; systemPrompt?: string },
  agentConfig?: AgentConfig,
  buildCtx?: BuildContext,
  linkedSkills?: Set<string>,
): Promise<AgentFnExecResult> {
  const provider = (agentConfig?.provider ?? 'claude') as Provider;

  const cliFlags: string[] = [];
  if (opts.systemPrompt) {
    cliFlags.push('--append-system-prompt', opts.systemPrompt);
  }

  // Support --permission-mode (e.g. 'plan' for planning phase)
  if (opts.permissionMode) {
    cliFlags.push('--permission-mode', opts.permissionMode);
  }

  const agentFnOpts: Record<string, any> = {
    provider,
    prompt,
    cwd: opts.cwd,
    timeoutMs: opts.timeout,
    mode: opts.stream ? 'stream' : 'call',
    allowedTools: undefined, // let the provider decide
    cliFlags: cliFlags.length > 0 ? cliFlags : undefined,
    enableSkills: true,  // enable Claude Code's native skill loading from .claude/skills/
    // Pass skillsRoot + skills for symlink management by agentfn
    ...(buildCtx && { skillsRoot: getSkillsRoot(buildCtx) }),
    ...(linkedSkills && linkedSkills.size > 0 && { skills: [...linkedSkills] }),
  };

  // Resume a previous session (used for plan → execute flow)
  if (opts.resume) {
    agentFnOpts.resume = opts.resume;
  }

  const fn = createAgentFn(agentFnOpts);

  try {
    const result = await fn();
    return {
      success: true,
      output: result.raw,
      files: opts.outputs,
      sessionId: result.sessionId,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      output: '',
      error: err.message,
    };
  }
}

