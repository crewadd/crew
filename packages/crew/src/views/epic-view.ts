/**
 * Epic View - Generate comprehensive epic README as entry point
 *
 * This generates a README.md that serves as:
 * - Quick reference for epic context
 * - Navigation to epic.json and tasks directory
 * - Summary of all tasks with status
 * - Task dependency visualization
 * - Progress tracking
 * - Gates status
 */

import { MdBuilder } from 'codets';
import type { Task, Epic } from '../store/types.ts';

export interface EpicViewContext {
  epic: Epic;
  tasks: Task[];
  epicSlug: string;
  previousEpic?: Epic;
  nextEpic?: Epic;
}

/**
 * Generate comprehensive epic README
 */
export function generateEpicReadme(ctx: EpicViewContext): string {
  const { epic, tasks, epicSlug } = ctx;

  const md = new MdBuilder();

  // Header
  md.h1(`${epic.title}`);
  md.line(`> **Epic ID:** \`${epic.id}\``);
  md.line(`> **Number:** \`M${epic.number}\``);
  md.line(`> **Status:** ${getStatusEmoji(epic.status)} \`${epic.status}\``);
  md.line(`> **Last Updated:** ${epic.updated?.at || epic.created.at}`);
  md.blank();
  md.line('---');
  md.blank();

  // Quick Links
  md.h2('📁 Files');
  md.bullet('**[epic.json](./epic.json)** — Epic metadata and configuration');
  md.bullet('**[README.md](./README.md)** — This file (overview)');
  md.bullet('**[tasks/](./tasks/)** — Task directories');
  md.blank();

  // Overview
  md.h2('📋 Overview');
  md.line(`**Title:** ${epic.title}`);
  md.blank();

  // Constraints
  if (epic.constraints) {
    const { sequential, autoResolve, blockedBy } = epic.constraints;
    if (sequential !== undefined || autoResolve !== undefined || blockedBy) {
      md.line('**Constraints:**');
      if (sequential !== undefined) {
        md.line(`- **Sequential:** ${sequential ? 'Yes' : 'No'} — Tasks must be completed in order`);
      }
      if (autoResolve !== undefined) {
        md.line(`- **Auto Resolve:** ${autoResolve ? 'Yes' : 'No'} — Dependencies resolved automatically`);
      }
      if (blockedBy && blockedBy.length > 0) {
        md.line(`- **Blocked By:** ${blockedBy.map(id => `\`${id}\``).join(', ')}`);
      }
      md.blank();
    }
  }

  // Progress
  md.h2('📊 Progress');

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const activeTasks = tasks.filter(t => t.status === 'active').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  md.line(`**Task Summary:**`);
  md.line(`- **Total:** ${totalTasks} tasks`);
  md.line(`- **✓ Done:** ${doneTasks} (${percentage}%)`);
  if (activeTasks > 0) md.line(`- **▶ Active:** ${activeTasks}`);
  if (pendingTasks > 0) md.line(`- **○ Pending:** ${pendingTasks}`);
  if (failedTasks > 0) md.line(`- **✗ Failed:** ${failedTasks}`);
  md.blank();

  // Task Table
  md.line('| # | Task | Type | Status |');
  md.line('|---|------|------|--------|');

  tasks.forEach((task, idx) => {
    const taskNumber = idx + 1;
    const statusIcon = getStatusEmoji(task.status);
    const typeLabel = task.type ? `\`${task.type}\`` : '-';
    md.line(`| ${taskNumber} | ${task.title} | ${typeLabel} | ${statusIcon} \`${task.status}\` |`);
  });
  md.blank();

  // Task Dependencies
  if (tasks.length > 0) {
    md.h2('🔗 Task Dependencies');
    md.blank();
    md.line('```');
    md.line(renderDependencyTree(tasks));
    md.line('```');
    md.blank();
  }

  // Gates
  if (epic.gates && epic.gates.length > 0) {
    md.h2('🚧 Gates');
    md.blank();

    epic.gates.forEach((gate, idx) => {
      const gateIcon = gate.completed ? '✓' : '○';
      md.line(`### Gate: ${gate.type}`);
      md.line(`- **Required:** ${gate.required ? 'Yes' : 'No'}`);
      md.line(`- **Status:** ${gate.completed ? '✓ Completed' : '○ Pending'}`);
      if (gate.message) {
        md.line(`- **Message:** ${gate.message}`);
      }
      if (gate.completed_at) {
        md.line(`- **Completed:** ${gate.completed_at}`);
      }
      if (idx < epic.gates!.length - 1) {
        md.blank();
      }
    });
    md.blank();
  }

  // Metadata
  md.h2('ℹ️ Metadata');
  md.blank();

  md.line('```json');
  md.line(JSON.stringify({
    id: epic.id,
    version: epic.version,
    number: epic.number,
    title: epic.title,
    status: epic.status,
    created: epic.created,
    updated: epic.updated,
  }, null, 2));
  md.line('```');
  md.blank();

  // Quick Actions
  md.h2('⚡ Quick Actions');
  md.blank();

  md.codeBlock('bash',
`# View epic details
crew epic m${epic.number}

# Update epic status
crew epic m${epic.number} --status=active

# View all tasks in epic
crew tasks m${epic.number}

# View epic configuration
cat epic.json

# Navigate to tasks
cd tasks/`);
  md.blank();

  // Footer
  md.line('---');
  md.blank();
  md.line(`*Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}*`);
  md.line(`*Location: \`.crew/epics/${epicSlug}/\`*`);

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
    completed: '✓',
    planned: '○',
  };
  return emojiMap[status] || '?';
}

/**
 * Format ISO timestamp to readable format
 */
function formatTimestamp(iso: string): string {
  return iso.replace('T', ' ').substring(0, 19);
}

/**
 * Render dependency tree as ASCII art
 */
function renderDependencyTree(tasks: Task[]): string {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const taskNumbers = new Map(tasks.map((t, idx) => [t.id, idx + 1]));
  const lines: string[] = [];

  // Find root tasks (no dependencies within this epic)
  const rootTasks = tasks.filter(t => {
    if (!t.dependencies || t.dependencies.length === 0) return true;
    // Check if dependencies are outside this epic
    return t.dependencies.every(depId => !taskMap.has(depId));
  });

  // Sort roots by their position in the epic
  const sortedRoots = [...rootTasks].sort((a, b) => {
    const aIdx = tasks.findIndex(t => t.id === a.id);
    const bIdx = tasks.findIndex(t => t.id === b.id);
    return aIdx - bIdx;
  });

  function renderTask(task: Task, prefix: string, isLast: boolean, visited: Set<string>) {
    if (visited.has(task.id)) {
      lines.push(`${prefix}└─> ${task.title} (circular)`);
      return;
    }

    visited.add(task.id);
    const statusIcon = getStatusEmoji(task.status);
    const taskNum = taskNumbers.get(task.id);
    lines.push(`${prefix}${isLast ? '└─> ' : '├─> '}${taskNum}. ${task.title} ${statusIcon}`);

    // Find children (tasks that depend on this one)
    const children = tasks.filter(t => 
      t.dependencies?.includes(task.id) && taskMap.has(t.id)
    ).sort((a, b) => {
      const aIdx = tasks.findIndex(t => t.id === a.id);
      const bIdx = tasks.findIndex(t => t.id === b.id);
      return aIdx - bIdx;
    });

    children.forEach((child, idx) => {
      const childPrefix = prefix + (isLast ? '   ' : '│  ');
      const childIsLast = idx === children.length - 1;
      renderTask(child, childPrefix, childIsLast, new Set(visited));
    });
  }

  sortedRoots.forEach((root, idx) => {
    const isLast = idx === sortedRoots.length - 1;
    renderTask(root, '', isLast, new Set());
  });

  return lines.join('\n');
}
