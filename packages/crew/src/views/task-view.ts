/**
 * Task View - Generate comprehensive task README as entry point
 *
 * This generates a README.md that serves as:
 * - Quick reference for task context
 * - Navigation to related files (PROMPT.md, task.json)
 * - Summary of inputs, outputs, dependencies
 * - Status and history
 */

import { MdBuilder } from '@crew/codegen';
import type { Task, Epic } from '../store/types.ts';

export interface TaskViewContext {
  task: Task;
  epic: Epic;
  taskNumber: number; // Position in epic (1-indexed)
  epicSlug: string;
  taskSlug: string;
  dependencies?: Task[];
  dependents?: Task[];
}

/**
 * Generate comprehensive task README
 */
export function generateTaskReadme(ctx: TaskViewContext): string {
  const { task, epic, taskNumber, epicSlug, taskSlug } = ctx;

  const md = new MdBuilder();

  // Header
  md.h1(`${task.title}`);
  md.line(`> **Task ID:** \`m${epic.number}.${taskNumber}\` (\`${task.id}\`)`);
  md.line(`> **Epic:** [M${epic.number}: ${epic.title}](../../epic.json)`);
  md.line(`> **Status:** ${getStatusEmoji(task.status)} \`${task.status}\``);
  md.line(`> **Last Updated:** ${task.updated?.at || task.created.at}`);
  md.blank();
  md.line('---');
  md.blank();

  // Quick Links
  md.h2('📁 Files');
  md.bullet('**[PROMPT.md](./PROMPT.md)** — Task prompt and configuration');
  md.bullet('**[task.json](./task.json)** — Task metadata and state');
  md.bullet('**[README.md](./README.md)** — This file (overview)');
  md.blank();

  // Task Overview
  md.h2('📋 Overview');

  if (task.type) {
    md.line(`**Type:** \`${task.type}\``);
  }

  if (task.assignee) {
    md.line(`**Assignee:** ${task.assignee.replace(/^agent_/, '@')}`);
  }

  md.blank();

  // Inputs and Outputs
  if (task.input || task.output) {
    md.h2('🔄 I/O');

    if (task.input) {
      md.h3('Inputs');
      const inputs = typeof task.input === 'string'
        ? [task.input]
        : task.input.description?.split(',').map(s => s.trim()) || [];

      if (inputs.length > 0) {
        inputs.forEach(input => md.line(`- ${input}`));
      } else {
        md.line('*No inputs specified*');
      }
      md.blank();
    }

    if (task.output) {
      md.h3('Outputs');
      const outputs = typeof task.output === 'string'
        ? [task.output]
        : task.output.description?.split(',').map(s => s.trim()) || [];

      if (outputs.length > 0) {
        outputs.forEach(output => md.line(`- ${output}`));
      } else {
        md.line('*No outputs specified*');
      }
      md.blank();
    }
  }

  // Dependencies
  if ((task.dependencies && task.dependencies.length > 0) ||
      (task.dependents && task.dependents.length > 0) ||
      (ctx.dependencies && ctx.dependencies.length > 0) ||
      (ctx.dependents && ctx.dependents.length > 0)) {
    md.h2('🔗 Dependencies');

    if (ctx.dependencies && ctx.dependencies.length > 0) {
      md.h3('Depends On');
      md.line('This task requires the following tasks to be completed first:');
      md.blank();

      ctx.dependencies.forEach(dep => {
        const depStatus = getStatusEmoji(dep.status);
        md.line(`- ${depStatus} **${dep.title}** (\`${dep.id}\`)`);
      });
      md.blank();
    } else if (task.dependencies && task.dependencies.length > 0) {
      md.h3('Depends On');
      task.dependencies.forEach(depId => {
        md.line(`- \`${depId}\``);
      });
      md.blank();
    }

    if (ctx.dependents && ctx.dependents.length > 0) {
      md.h3('Required By');
      md.line('The following tasks depend on this task:');
      md.blank();

      ctx.dependents.forEach(dep => {
        const depStatus = getStatusEmoji(dep.status);
        md.line(`- ${depStatus} **${dep.title}** (\`${dep.id}\`)`);
      });
      md.blank();
    } else if (task.dependents && task.dependents.length > 0) {
      md.h3('Required By');
      task.dependents.forEach(depId => {
        md.line(`- \`${depId}\``);
      });
      md.blank();
    }
  }

  // Execution History
  if (task.attempts && task.attempts.length > 0) {
    md.h2('📊 Execution History');
    md.blank();

    task.attempts.forEach((attempt, idx) => {
      const attemptStatus = attempt.success ? '✓' : '✗';
      md.line(`**Attempt ${idx + 1}** ${attemptStatus}`);
      md.line(`- **Started:** ${attempt.started_at}`);
      if (attempt.completed_at) {
        md.line(`- **Completed:** ${attempt.completed_at}`);
      }
      if (attempt.duration_ms) {
        md.line(`- **Duration:** ${formatDuration(attempt.duration_ms)}`);
      }
      if (attempt.error) {
        md.line(`- **Error:** ${attempt.error}`);
      }
      md.blank();
    });
  }

  // Status History
  if (task.status_history && task.status_history.length > 0) {
    md.h2('📜 Status History');
    md.blank();

    // Show last 5 status changes
    const recentHistory = task.status_history.slice(-5).reverse();

    recentHistory.forEach(change => {
      const fromIcon = typeof change.from === 'string' ? getStatusEmoji(change.from) : '—';
      const toIcon = typeof change.to === 'string' ? getStatusEmoji(change.to) : '—';
      const from = typeof change.from === 'string' ? change.from : 'complex';
      const to = typeof change.to === 'string' ? change.to : 'complex';

      md.line(`- ${fromIcon} \`${from}\` → ${toIcon} \`${to}\` — ${formatTimestamp(change.at)} by \`${change.by}\``);
    });
    md.blank();

    if (task.status_history.length > 5) {
      md.line(`*Showing last 5 of ${task.status_history.length} changes. See [task.json](./task.json) for full history.*`);
      md.blank();
    }
  }

  // Metadata
  md.h2('ℹ️ Metadata');
  md.blank();

  md.line('```json');
  md.line(JSON.stringify({
    id: task.id,
    version: task.version,
    created: task.created,
    updated: task.updated,
    epic_id: task.epic_id,
  }, null, 2));
  md.line('```');
  md.blank();

  // Quick Actions
  md.h2('⚡ Quick Actions');
  md.blank();

  md.codeBlock('bash',
`# View task details
crew task m${epic.number}.${taskNumber}

# Update task status
crew task m${epic.number}.${taskNumber} --status=active

# Mark as done
crew done m${epic.number}.${taskNumber}

# View prompt
cat PROMPT.md

# View full task data
cat task.json`);
  md.blank();

  // Footer
  md.line('---');
  md.blank();
  md.line(`*Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}*`);
  md.line(`*Location: \`.crew/epics/${epicSlug}/tasks/${taskSlug}/\`*`);

  return md.toString();
}

/**
 * Get emoji for status
 */
function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    done: '✓',
    active: '▶',
    pending: '○',
    blocked: '⊗',
    failed: '✗',
    cancelled: '⊘',
  };
  return emojiMap[status] || '?';
}

/**
 * Format duration in ms to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format ISO timestamp to readable format
 */
function formatTimestamp(iso: string): string {
  return iso.replace('T', ' ').substring(0, 19);
}
