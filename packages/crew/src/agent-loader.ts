/**
 * Agent persona loader for crew.
 *
 * Loads agent definitions from .crew/agents/{agent-name}.md
 * and builds structured prompts with:
 * 1. Persona (who to be)
 * 2. Capacities (skills to load if needed)
 * 3. Skill loading instructions (how to find skills at runtime)
 * 4. Context (structured inputs/outputs/vars)
 * 5. Your Task (the actual task)
 *
 * Skill discovery/loading is delegated to agentfn utilities.
 * Prompt formatting (XML tags, skill sections) stays here — it's application-level.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  parseFrontmatter,
  stripFrontmatter,
  discoverSkills as agentfnDiscoverSkills,
  loadSkillFromRoots,
} from '@crew/agentfn/skills';
import type { BuildContext, AgentConfig, AgentPersona } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Skill Path Roots                                                   */
/* ------------------------------------------------------------------ */

/** Get the ordered list of skill root directories for a build context */
export function getSkillRoots(ctx: BuildContext): string[] {
  return [
    join(ctx.appDir, '.claude', 'skills'),
    join(ctx.appDir, '.crew', 'skills'),
    join(ctx.appDir, '..', '..', 'skills'),  // project-level fallback
  ];
}

/** Get the primary skills root (.crew/skills) */
export function getSkillsRoot(ctx: BuildContext): string {
  return join(ctx.appDir, '.crew', 'skills');
}

/* ------------------------------------------------------------------ */
/*  Agent Config Parsing                                               */
/* ------------------------------------------------------------------ */

/** Parse skills array from frontmatter string like "[page-build, page-verify]" */
function parseSkills(skillsStr: string): string[] {
  if (!skillsStr) return [];
  const match = skillsStr.match(/^\[(.*)\]$/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse agent configuration from frontmatter */
function parseAgentConfig(meta: Record<string, string>): AgentConfig | undefined {
  const config: AgentConfig = {};
  let hasConfig = false;

  if (meta.provider) {
    const provider = meta.provider.trim() as 'claude' | 'kimi';
    if (provider !== 'claude' && provider !== 'kimi') {
      console.warn(`[agent-loader] Invalid provider "${meta.provider}", must be "claude" or "kimi"`);
    } else {
      config.provider = provider;
      hasConfig = true;
    }
  }

  if (meta.backend) {
    const backend = meta.backend.trim() as 'cli' | 'sdk';
    if (backend !== 'cli' && backend !== 'sdk') {
      console.warn(`[agent-loader] Invalid backend "${meta.backend}", must be "cli" or "sdk"`);
    } else {
      config.backend = backend;
      hasConfig = true;
    }
  }

  if (meta.model) {
    config.model = meta.model.trim();
    hasConfig = true;
  }

  return hasConfig ? config : undefined;
}

/** Validate agent configuration for logical consistency */
function validateAgentConfig(config: AgentConfig | undefined, agentName: string): void {
  if (!config) return;

  if (config.provider === 'kimi' && config.backend === 'sdk') {
    throw new Error(
      `[agent-loader] Agent "${agentName}": Kimi provider does not support SDK backend. Use backend: cli or omit it.`
    );
  }

  if (config.model && config.provider !== 'claude') {
    console.warn(
      `[agent-loader] Agent "${agentName}": model option is only supported with Claude provider (ignored for ${config.provider})`
    );
  }

  if (config.model && config.backend !== 'sdk') {
    console.warn(
      `[agent-loader] Agent "${agentName}": model option requires backend: sdk (current: ${config.backend || 'cli'})`
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Agent Persona Loading                                              */
/* ------------------------------------------------------------------ */

/**
 * Load an agent persona from .claude/agents/{agentName}.md
 * Returns null if agent file doesn't exist.
 */
export function loadAgentPersona(
  ctx: BuildContext,
  agentName: string,
): AgentPersona | null {
  const cleanName = agentName.startsWith('@') ? agentName.slice(1) : agentName;
  const agentPath = join(ctx.appDir, '.claude', 'agents', `${cleanName}.md`);

  if (!existsSync(agentPath)) {
    return null;
  }

  try {
    const content = readFileSync(agentPath, 'utf-8');
    const meta = parseFrontmatter(content);
    const body = stripFrontmatter(content);

    const config = parseAgentConfig(meta);
    validateAgentConfig(config, cleanName);

    return {
      name: meta.name || cleanName,
      description: meta.description || 'No description',
      skills: parseSkills(meta.skills || ''),
      content: body,
      config,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('[agent-loader]')) {
      throw err;
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Skill Loading (delegates to agentfn)                               */
/* ------------------------------------------------------------------ */

/**
 * Load a skill's metadata, body content, and file path.
 * Searches multiple roots: .claude/skills/, .crew/skills/, project-level.
 * Returns null if skill not found.
 */
export function loadSkill(
  ctx: BuildContext,
  skillName: string,
): { meta: Record<string, string>; body: string; path: string } | null {
  const roots = getSkillRoots(ctx);
  const result = loadSkillFromRoots(roots, skillName);
  if (!result) return null;
  return { meta: result.meta, body: result.body, path: result.path };
}

/* ------------------------------------------------------------------ */
/*  Skill Injection into Prompts (application-level formatting)        */
/* ------------------------------------------------------------------ */

/**
 * Inject skill definitions inline for any /skill-name references in the prompt.
 * Replaces `/skill-name` (backtick-wrapped) with the full SKILL.md content inlined
 * using XML tags.
 */
export function injectSkillRefs(ctx: BuildContext, prompt: string): string {
  return prompt.replace(
    /`\/([\w-]+)(?:\s[^`]*)?\`/g,
    (match, skillName) => {
      const skill = loadSkill(ctx, skillName);
      if (!skill) return match;

      const desc = skill.meta.description
        ? `> ${skill.meta.description.replace(/\n+/g, ' ').trim()}\n\n`
        : '';

      return `\n\n<skill name="${skillName}">\n${desc}${skill.body}\n</skill>\n`;
    }
  );
}

/**
 * Build capacities section from agent skills.
 *
 * For non-Claude providers: lightweight name + description references.
 * For Claude: empty string (skills loaded via symlinks by agentfn).
 */
function buildCapacitiesSection(ctx: BuildContext, skills: string[], provider?: string): string {
  if (skills.length === 0) return '';

  const isClaude = !provider || provider === 'claude';
  if (isClaude) {
    // Claude Code loads skills via symlinks — no need to inline anything
    return '';
  }

  // Non-Claude: lightweight references only
  const lines: string[] = [];

  for (const skillName of skills) {
    const skill = loadSkill(ctx, skillName);
    if (skill) {
      const desc = skill.meta.description
        ? skill.meta.description.replace(/\n+/g, ' ').trim()
        : 'No description';
      lines.push(`<skill-ref name="${skillName}">${desc}</skill-ref>`);
    }
  }

  return lines.join('\n');
}

/**
 * Build full prompt with XML-tagged structure:
 * 1. Agent persona (behavioral constraints)
 * 2. Capacities (skills — name+description for non-Claude, empty for Claude)
 * 3. Task instruction (the actual work)
 */
export function buildPromptWithPersona(
  ctx: BuildContext,
  agent: AgentPersona,
  taskPrompt: string,
  provider?: string,
): string {
  const parts: string[] = [];

  // 1. Agent persona
  parts.push(`<agent name="${agent.name}">`);
  parts.push(`> ${agent.description}`);
  parts.push('');
  parts.push(agent.content);
  parts.push('</agent>');
  parts.push('');

  // 2. Capacities (skills) — only for non-Claude providers
  if (agent.skills.length > 0) {
    const capacities = buildCapacitiesSection(ctx, agent.skills, provider);
    if (capacities) parts.push(capacities);
  }

  // 3. Task instruction
  parts.push(taskPrompt);

  return parts.join('\n');
}

/**
 * Build a system prompt from an agent persona for use with --append-system-prompt.
 */
export function buildSystemPromptFromPersona(agent: AgentPersona): string {
  const parts: string[] = [];

  parts.push('<identity>');
  parts.push(`You are ${agent.name} — ${agent.description}`);
  parts.push('</identity>');

  const rulesMatch = agent.content.match(/## Rules\n([\s\S]*?)(?=\n## |\n---|\s*$)/);
  if (rulesMatch) {
    parts.push('');
    parts.push('<constraints>');
    parts.push(rulesMatch[1].trim());
    parts.push('</constraints>');
  }

  return parts.join('\n');
}

/**
 * Load agent persona and build structured prompt.
 * Returns original prompt if no assignee or agent not found.
 */
export function applyAgentPersona(
  ctx: BuildContext,
  prompt: string,
  assignee?: string,
): string {
  if (!assignee) return prompt;

  const agent = loadAgentPersona(ctx, assignee);
  if (!agent) return prompt;

  return buildPromptWithPersona(ctx, agent, prompt);
}

/* ------------------------------------------------------------------ */
/*  Skill Discovery (delegates to agentfn)                             */
/* ------------------------------------------------------------------ */

/**
 * Discover available skills in the .crew/skills/ directory.
 */
export function discoverSkills(ctx: BuildContext): Array<{ name: string; dirName: string; description: string; path: string }> {
  const skillsRoot = getSkillsRoot(ctx);
  return agentfnDiscoverSkills(skillsRoot).map(info => ({
    name: info.name,
    dirName: info.dirName,
    description: info.description,
    path: relative(ctx.appDir, info.path),
  }));
}

/* ------------------------------------------------------------------ */
/*  Skill Loading Instructions (application-level prompt formatting)   */
/* ------------------------------------------------------------------ */

/**
 * Build skill loading instructions for non-Claude providers.
 * For Claude, skills are loaded via symlinks — use buildSkillPromptSection() instead.
 *
 * @deprecated Use buildSkillPromptSection() instead for Claude provider.
 * For non-Claude providers, this inlines name + description only.
 */
export function buildSkillLoadingInstructions(
  ctx: BuildContext,
  linkedSkills?: Set<string> | string[],
  provider?: string,
): string {
  const allSkills = discoverSkills(ctx);
  if (allSkills.length === 0) return '';

  const linkedSet = linkedSkills instanceof Set
    ? linkedSkills
    : new Set(linkedSkills ?? []);

  const linked = allSkills.filter(s => linkedSet.has(s.name) || linkedSet.has(s.dirName));
  if (linked.length === 0) return '';

  const isClaude = !provider || provider === 'claude';

  const sections: string[] = [];

  // Claude: no-op — skills handled via symlinks + buildSkillPromptSection()
  if (isClaude) return '';

  for (const skill of linked) {
    const loaded = loadSkill(ctx, skill.dirName) || loadSkill(ctx, skill.name);
    if (loaded) {
      const desc = loaded.meta.description
        ? loaded.meta.description.replace(/\n+/g, ' ').trim()
        : 'No description';
      sections.push(`<skill-ref name="${skill.name}">${desc}</skill-ref>`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Build a skill reference section for the user prompt (lazy-load approach).
 */
export function buildSkillPromptSection(
  ctx: BuildContext,
  linkedSkills?: Set<string> | string[],
): string {
  const allSkills = discoverSkills(ctx);
  if (allSkills.length === 0) return '';

  const linkedSet = linkedSkills instanceof Set
    ? linkedSkills
    : new Set(linkedSkills ?? []);

  const linked = allSkills.filter(s => linkedSet.has(s.name) || linkedSet.has(s.dirName));
  if (linked.length === 0) return '';

  // Invoke skills by listing them with / prefix (Claude Code skill invocation syntax)
  const skillInvocations = linked.map(s => `/${s.dirName}`).join(' ');
  return skillInvocations;
}

/* ------------------------------------------------------------------ */
/*  Context Section Builder                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a structured <context> section with inputs, outputs, and task variables.
 */
export function buildContextSection(opts: {
  inputs?: string[];
  outputs?: string[];
  context?: Record<string, unknown>;
  epic?: string;
}): string {
  const hasContent = opts.inputs?.length || opts.outputs?.length || opts.context || opts.epic;
  if (!hasContent) return '';

  const lines: string[] = [];
  lines.push('<context>');

  if (opts.epic) {
    lines.push(`Epic: ${opts.epic}`);
  }
  if (opts.inputs?.length) {
    lines.push(`Input files: ${opts.inputs.join(', ')}`);
  }
  if (opts.outputs?.length) {
    lines.push(`Expected outputs: ${opts.outputs.join(', ')}`);
  }
  if (opts.context) {
    for (const [key, value] of Object.entries(opts.context)) {
      if (key === 'epic') continue;
      lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }

  lines.push('</context>');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Skill Invocation (leading slash)                                   */
/* ------------------------------------------------------------------ */

/** Result of parsing a /skill-name invocation from prompt start */
export interface SkillInvocation {
  skillName: string;
  userInput: string;
}

/**
 * Parse a skill invocation from the start of a prompt.
 * Detects prompts starting with `/skill-name` followed by user input.
 */
export function parseSkillInvocation(prompt: string): SkillInvocation | null {
  const trimmed = prompt.trimStart();
  const match = trimmed.match(/^\/([\w-]+)(?:\s+(.*))?$/s);
  if (!match) return null;

  return {
    skillName: match[1],
    userInput: (match[2] ?? '').trim(),
  };
}

/**
 * Expand a skill invocation into user prompt.
 *
 * Provider-aware:
 * - Claude: returns ONLY user input (skill loaded via symlinks by agentfn)
 * - Other providers: returns name + description reference (not full body)
 */
export function expandSkillInvocation(
  ctx: BuildContext,
  invocation: SkillInvocation,
  provider?: string,
): string | null {
  const skill = loadSkill(ctx, invocation.skillName);
  if (!skill) return null;

  const isClaude = !provider || provider === 'claude';

  if (isClaude) {
    // Claude Code loads skills via symlinks — just pass through the user input.
    // The skill name is added to linkedSkills and agentfn handles symlink setup.
    return invocation.userInput || `Execute the /${invocation.skillName} skill.`;
  }

  // Non-Claude: lightweight reference (name + description only, NOT full body)
  const desc = skill.meta.description
    ? skill.meta.description.replace(/\n+/g, ' ').trim()
    : 'No description';

  const parts: string[] = [];
  parts.push(`<skill-ref name="${invocation.skillName}">`);
  parts.push(desc);
  parts.push('</skill-ref>');

  if (invocation.userInput) {
    parts.push('');
    parts.push(invocation.userInput);
  }

  return parts.join('\n');
}
