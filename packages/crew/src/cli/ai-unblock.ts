/**
 * AI Diagnostic for blocked pipelines (`crew run next --ai`)
 *
 * Reads the blocked situation, diagnoses the root cause, and streams
 * a report to stdout. Makes no changes.
 */

import { agentfn } from '@crew/agentfn';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextIntent } from '../status-check.ts';
import type { HierarchicalStore } from '../store/hierarchical-store.ts';

export async function runAiDiagnose(
  intent: NextIntent,
  store: HierarchicalStore,
  absDir: string,
): Promise<void> {
  // Unset CLAUDECODE so the diagnostic agent can spawn even when called from
  // inside a Claude Code session (intentional nesting).
  const savedEnv = process.env.CLAUDECODE;
  delete process.env.CLAUDECODE;
  try {
    const fn = agentfn({
      prompt: buildDiagnosePrompt(intent, store, absDir),
      cwd: absDir,
      timeoutMs: 3 * 60 * 1000,
      mode: 'stream',
      hooks: { onStream: (chunk: string) => process.stdout.write(chunk) },
    });
    await fn();
    process.stdout.write('\n');
  } finally {
    if (savedEnv !== undefined) process.env.CLAUDECODE = savedEnv;
  }
}

function buildDiagnosePrompt(
  intent: NextIntent,
  store: HierarchicalStore,
  absDir: string,
): string {
  const reason = intent.action === 'block' ? intent.reason : 'No actionable tasks found';

  // Build failed tasks section
  let failedSection = '';
  let failedId = '<task-id>';
  if (intent.action === 'block' && intent.details.failedTasks?.length) {
    failedId = intent.details.failedTasks[0].displayId;
    failedSection = intent.details.failedTasks.map(t => {
      const logPath = join(absDir, '.crew', 'logs', `${t.displayId}.log`);
      const log = existsSync(logPath)
        ? `\n**Execution log:**\n\`\`\`\n${readFileSync(logPath, 'utf-8').trim().slice(-3000)}\n\`\`\``
        : '';
      const taskRecord = store.getTaskByDisplayId(t.displayId);
      const executorHint = taskRecord?.executorFile
        ? `\n**Executor:** \`${taskRecord.executorFile}\` — find it under \`.crew/epics/\``
        : '';
      return `### ${t.displayId}: ${t.title}\nEpic: M${t.epicNumber} — ${t.epicTitle}\nFailed attempts: ${t.failCount}${log}${executorHint}`;
    }).join('\n\n');
  }

  // Build downstream section
  let downstreamSection = '';
  if (intent.action === 'block' && intent.details.blockedTasks?.length) {
    const tasks = intent.details.blockedTasks.slice(0, 8).map(t => {
      const deps = t.blockedBy?.length
        ? `\n  ↳ waiting for: ${t.blockedBy.map(b => `${b.displayId}(${b.status})`).join(', ')}`
        : '';
      return `- ${t.displayId}: ${t.title} [${t.status}]${deps}`;
    }).join('\n');
    downstreamSection = `## Downstream Impact (${intent.details.blockedTasks.length} tasks blocked)\n${tasks}`;
  }

  // Build chain section
  let chainSection = '';
  if (intent.action === 'block' && intent.details.chain?.length) {
    chainSection = `## Dependency Chain\n${intent.details.chain.map(c => `  ${c}`).join('\n')}`;
  }

  return `# Crew Pipeline Diagnostic

The crew build pipeline is blocked. Analyze and report what the user should do to fix it.
Do NOT make any changes — only read files, diagnose, and report.

## Blocked Situation
Reason: ${reason}

${failedSection ? `## Failed Task(s)\n\n${failedSection}` : ''}
${chainSection}
${downstreamSection}

## Your Task
1. Read the executor file(s), logs, and any relevant config files (package.json, etc.)
2. Identify the root cause
3. Output a diagnostic report in this format:

\`\`\`
## Diagnosis
[root cause — what is failing and why]

## Recommended Fix
[best option with exact commands to run]

## Alternative Options
Option A: Mark task done (if work already complete)
  pnpm run crew task ${failedId} edit --status done

Option B: [other approach]
  [commands]
\`\`\``;
}
