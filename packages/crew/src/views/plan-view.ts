/**
 * Plan View - Generate comprehensive plan README with rich structure and links
 */

import { MdBuilder } from '@crew/codegen';
import type { ViewableStore } from './types.ts';

/**
 * Generate comprehensive plan README with rich structure and links
 */
export function generatePlanReadme(store: ViewableStore): string {
  const project = store.getProject();
  const projectName = project?.name || 'Project';
  const projectGoal = project?.goal || project?.description || 'Not specified';

  const epics = store.listEpics();
  const tasks = store.listAllTasks?.() ?? [];

  // Calculate overall stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const activeTasks = tasks.filter(t => t.status === 'active').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Generate timestamp
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const md = new MdBuilder();

  // Build header
  md.h1(`${projectName} — Project Plan`);
  md.line(`> **Generated:** ${timestamp}`);
  md.line(`> **Source:** \`./\` (DO NOT EDIT - Regenerate with \`crew plan\`)`);
  md.line(`> **Location:** \`./README.md\``);
  md.blank();
  md.line('---');
  md.blank();

  // Project overview
  md.h2('📋 Project Overview');
  md.line(`**Goal:** ${projectGoal}`);
  md.blank();

  if (project?.workflow && project.workflow.length > 0) {
    md.line('**Workflow:**');
    project.workflow.forEach((step, idx) => {
      md.line(`${idx + 1}. **${step.name}**${step.description ? `: ${step.description}` : ''}`);
    });
    md.blank();
  }

  // Progress summary
  md.h2('📊 Progress Summary');
  md.codeBlock('',
`Total Progress: ${doneTasks}/${totalTasks} tasks (${pct}%)
Epics:     ${epics.length} total

Task Status:
  ✓ Done:       ${doneTasks.toString().padStart(3)}
  ▶ Active:     ${activeTasks.toString().padStart(3)}
  ○ Pending:    ${pendingTasks.toString().padStart(3)}
  ⊗ Blocked:    ${blockedTasks.toString().padStart(3)}
  ✗ Failed:     ${failedTasks.toString().padStart(3)}`);
  md.blank();

  // Progress bar
  const barLength = 50;
  const filled = Math.round((doneTasks / totalTasks) * barLength);
  const empty = barLength - filled;
  md.line('**Progress Bar:**');
  md.blank();
  md.line(`\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\` ${pct}%`);
  md.blank();

  // Table of contents
  md.h2('📑 Table of Contents');
  epics.forEach(ms => {
    const msTasks = ms.task_ids.map(id => store.getTask(id)).filter(Boolean);
    const msDone = msTasks.filter(t => t?.status === 'done').length;
    const msStatus = ms.status === 'completed' ? '✓' :
                     ms.status === 'active' ? '▶' :
                     ms.status === 'planned' ? '○' : '—';
    md.line(`- ${msStatus} [M${ms.number}: ${ms.title}](#m${ms.number}--${ms.title.toLowerCase().replace(/\s+/g, '-')}) — ${msDone}/${msTasks.length} tasks`);
  });
  md.blank();
  md.line('---');
  md.blank();

  // Epic details
  md.h2('🎯 Epics');

  epics.forEach(ms => {
    const msTasks = ms.task_ids
      .map(id => store.getTask(id))
      .filter(Boolean)
      .map((t, idx) => ({ ...t, displayId: `m${ms.number}.${idx + 1}`, taskNum: idx + 1 }));

    const done = msTasks.filter(t => t.status === 'done').length;
    const msProgress = msTasks.length ? Math.round((done / msTasks.length) * 100) : 0;

    // Epic header
    md.h3(`M${ms.number} — ${ms.title}`);

    // Epic metadata
    md.line(`**Status:** ${ms.status} | **Progress:** ${done}/${msTasks.length} (${msProgress}%)`);
    md.blank();

    if (ms.description) {
      md.line(`**Description:** ${ms.description}`);
      md.blank();
    }

    // Epic path
    const msSlug = `${ms.number.toString().padStart(2, '0')}-${ms.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    md.line(`**Location:** [\`./${msSlug}/\`](./${msSlug}/)`);
    md.blank();

    // Gates
    if (ms.gates && ms.gates.length > 0) {
      md.line('**Gates:**');
      ms.gates.forEach(gate => {
        const gateIcon = gate.completed ? '✓' : gate.required ? '!' : '○';
        md.line(`- ${gateIcon} ${gate.type}: ${gate.message || 'No message'}`);
      });
      md.blank();
    }

    // Tasks table
    if (msTasks.length > 0) {
      md.h3('#### Tasks');

      const headers = ['#', 'ID', 'Status', 'Constraint', 'Task', 'Dependencies'];
      const rows = msTasks.map(t => {
        const statusIcon = t.status ? {
          done: '✓',
          active: '▶',
          pending: '○',
          blocked: '⊗',
          failed: '✗',
          cancelled: '⊘',
          awaiting_review: '⧗'
        }[t.status] || '?' : '?';

        // Constraint icon
        const constraintIcon = t.constraints?.parallel ? '∥' :
                               t.constraints?.condition ? '◊' :
                               t.constraints?.blocking ? '⊣' :
                               t.constraints?.sequential !== false ? '→' : '•';

        const deps = t.dependencies && t.dependencies.length > 0
          ? t.dependencies.map(d => {
              const dep = store.getTask(d);
              if (!dep) return d;
              const depMs = epics.find(m => m.id === dep.epic_id);
              if (!depMs) return d;
              const depIdx = depMs.task_ids.indexOf(dep.id);
              return `m${depMs.number}.${depIdx + 1}`;
            }).join(', ')
          : '—';

        // Task path
        const taskSlug = `${t.taskNum.toString().padStart(2, '0')}-${(t.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
        const taskPath = `./${msSlug}/tasks/${taskSlug}/`;

        return [
          t.taskNum.toString(),
          `\`${t.displayId}\``,
          statusIcon,
          constraintIcon,
          `[${t.title}](${taskPath})`,
          deps
        ];
      });

      md.table(headers, rows);
      md.blank();

      // Constraint legend
      md.line('**Constraint Legend:** `→` Sequential | `∥` Parallel | `◊` Conditional | `⊣` Blocking | `•` Custom');
      md.blank();

      // Task details
      md.line('<details>');
      md.line('<summary>Task Details</summary>');
      md.blank();

      msTasks.forEach(t => {
        md.line(`**${t.displayId}: ${t.title}**`);
        md.blank();

        if (t.input?.description) {
          md.line(`- **Input:** ${t.input.description}`);
        }
        if (t.output?.description) {
          md.line(`- **Output:** ${t.output.description}`);
        }
        if (t.assignee) {
          md.line(`- **Assignee:** ${t.assignee.replace(/^agent_/, '')}`);
        }
        if (t.type) {
          md.line(`- **Type:** ${t.type}`);
        }

        // Constraint info
        if (t.constraints) {
          const constraintInfo = [];
          if (t.constraints.sequential !== false) constraintInfo.push('Sequential');
          if (t.constraints.parallel) constraintInfo.push('Parallel');
          if (t.constraints.condition) constraintInfo.push('Conditional');
          if (t.constraints.blockedBy && t.constraints.blockedBy.length > 0) {
            constraintInfo.push(`Blocked by: ${t.constraints.blockedBy.join(', ')}`);
          }
          if (t.constraints.blocking && t.constraints.blocking.length > 0) {
            constraintInfo.push(`Blocks: ${t.constraints.blocking.join(', ')}`);
          }
          if (constraintInfo.length > 0) {
            md.line(`- **Constraints:** ${constraintInfo.join(' | ')}`);
          }
        }

        // Flow info
        if (t.flow) {
          md.line(`- **Flow:** ${t.flow.type}${t.flow.branches ? ` (${t.flow.branches.length} branches)` : ''}`);
        }

        const taskSlug = `${t.taskNum.toString().padStart(2, '0')}-${(t.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
        const taskPath = `./${msSlug}/tasks/${taskSlug}/`;
        md.line(`- **Path:** [${taskPath}](${taskPath})`);
        md.blank();
      });

      md.line('</details>');
      md.blank();
    } else {
      md.line('*No tasks defined yet*');
      md.blank();
    }

    md.line('---');
    md.blank();
  });

  // Quick reference
  md.h2('🔍 Quick Reference');

  md.h3('### Commands');
  md.codeBlock('bash',
`crew status          # View current status
crew next            # Get next task to work on
crew task <id>       # View task details (e.g., crew task m1.1)
crew execute         # Start automated execution
crew done <id>       # Mark task as done (e.g., crew done m1.1)`);
  md.blank();

  md.h3('### File Structure');
  md.codeBlock('',
`.crew/
├── project.json              # Project metadata
└── plan/                     # All epics and tasks
    ├── README.md             # This plan file (regenerate with: crew plan)
    ├── 00-foundation/
    │   ├── epic.json    # Epic data
    │   ├── README.md         # Epic docs
    │   └── tasks/
    │       ├── 01-task-name/
    │       │   ├── task.json # Task data
    │       │   └── README.md # Task docs
    │       └── ...
    └── ...`);
  md.blank();

  md.h3('### Search Patterns');
  md.codeBlock('bash',
`# Find pending tasks
grep -r '"status": "pending"' ./*/tasks/*/task.json

# Find tasks by title
grep -r '"title".*<keyword>' ./*/tasks/*/task.json

# List all tasks in epic 2
ls ./*/tasks/

# View specific task (m2.3 = epic 2, task 3)
cat ./*/tasks/03-*/task.json`);
  md.blank();

  // Footer
  md.line('---');
  md.blank();
  md.line(`*Generated by \`crew plan\` — Last updated: ${timestamp}*`);
  md.line('*Source of truth: `./` JSON files*');
  md.line('*To regenerate: Run `crew plan` again*');

  return md.toString();
}
