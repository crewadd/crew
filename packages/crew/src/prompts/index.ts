/**
 * Provider-aware prompt adapters for crew.
 *
 * Framework-generic prompt formatting — no application-specific content.
 *
 * Kimi vs Claude differences:
 * - Claude: XML-tagged sections for clear boundaries
 * - Kimi: Markdown structure with numbered steps
 * - Both: Retry context, task identity
 *
 * Skill resolution happens upstream in task-adapter.ts via injectSkillRefs()
 * before prompts reach these adapters. Adapters only handle formatting.
 */

import { getDefaultProvider } from '@crew/agentfn';

/** Provider type */
export type Provider = 'claude' | 'kimi';

/** Get current provider */
export function getProvider(): Provider {
  return getDefaultProvider() as Provider;
}

/** Adapter interface for provider-specific prompt formatting */
export interface PromptAdapter {
  /** Format a task prompt for the provider */
  formatTask(prompt: string, meta: TaskMeta): string;
}

/** Task metadata for prompt formatting */
export interface TaskMeta {
  taskId: string;
  title: string;
  attempt: number;
  /** Previous error message (populated on retry) */
  previousError?: string;
  /** Previous check failure details (populated on retry) */
  previousCheckFailures?: string;
  /** Agent persona name (from .crew/agents/) */
  agent?: string;
  /** Epic context */
  epic?: string;
}

/* ------------------------------------------------------------------ */
/*  Base adapter (common formatting)                                   */
/* ------------------------------------------------------------------ */

const baseAdapter: PromptAdapter = {
  formatTask(prompt: string, _meta: TaskMeta): string {
    return prompt;
  },
};

/* ------------------------------------------------------------------ */
/*  Claude adapter                                                     */
/* ------------------------------------------------------------------ */

const claudeAdapter: PromptAdapter = {
  formatTask(prompt: string, meta: TaskMeta): string {
    const parts: string[] = [];

    // Task identity with XML tags
    parts.push(`<task id="${meta.taskId}" title="${meta.title}">`);

    // Retry context (critical for attempt > 1)
    if (meta.attempt > 1) {
      parts.push('');
      parts.push(`<previous_failure attempt="${meta.attempt - 1}">`);

      if (meta.previousCheckFailures) {
        // Structured check failures — most actionable, show first
        parts.push('## Check Failures');
        parts.push('');
        parts.push('The following quality checks failed on your previous output:');
        parts.push('');
        parts.push(meta.previousCheckFailures);
      } else if (meta.previousError) {
        // Generic error fallback
        parts.push(meta.previousError);
      }

      parts.push('</previous_failure>');
      parts.push('');
      parts.push('<retry_instruction>');
      if (meta.previousCheckFailures) {
        parts.push('Fix the specific check failures listed above. Read the failing output files to understand what needs to change, then make targeted fixes.');
      } else {
        parts.push('Take a different approach than the previous attempt. If the error was a type error, read the relevant type definitions first. If it was a build error, check the build output carefully.');
      }
      parts.push('</retry_instruction>');
    }

    // Main instruction
    parts.push('');
    parts.push(prompt);

    parts.push('');
    parts.push('</task>');
    return parts.join('\n');
  },
};

/* ------------------------------------------------------------------ */
/*  Kimi adapter                                                       */
/* ------------------------------------------------------------------ */

const kimiAdapter: PromptAdapter = {
  formatTask(prompt: string, meta: TaskMeta): string {
    const parts: string[] = [];

    // Kimi benefits from clear role definition upfront
    parts.push(`# Task: ${meta.title}`);
    parts.push(`**Task ID:** ${meta.taskId}`);
    if (meta.attempt > 1) {
      parts.push(`**Attempt:** ${meta.attempt}`);

      if (meta.previousCheckFailures) {
        parts.push('');
        parts.push('**Previous check failures:**');
        parts.push('');
        parts.push(meta.previousCheckFailures);
        parts.push('');
        parts.push('Fix the specific check failures listed above.');
      } else if (meta.previousError) {
        parts.push('');
        parts.push('**Previous error:**');
        parts.push(`\`\`\`\n${meta.previousError}\n\`\`\``);
        parts.push('');
        parts.push('Take a different approach than the previous attempt.');
      }
    }
    parts.push('');

    // Main prompt with explicit structure
    parts.push('## Instructions');
    parts.push(prompt);

    // Generic closing guidance (no application-specific constraints)
    parts.push('');
    parts.push('## Requirements');
    parts.push('- Make minimal, focused changes');
    parts.push('- Do not add features beyond what is requested');

    return parts.join('\n');
  },
};

/* ------------------------------------------------------------------ */
/*  Provider registry                                                  */
/* ------------------------------------------------------------------ */

const adapters: Record<Provider, PromptAdapter> = {
  claude: claudeAdapter,
  kimi: kimiAdapter,
};

/** Get the adapter for the current (or specified) provider */
export function getAdapter(provider?: Provider): PromptAdapter {
  const p = provider ?? getProvider();
  return adapters[p] ?? baseAdapter;
}

/** Format a task prompt for the current provider */
export function formatTaskPrompt(prompt: string, meta: TaskMeta): string {
  return getAdapter().formatTask(prompt, meta);
}
