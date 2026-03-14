/**
 * Views — README & State Generation
 *
 * Decoupled view generation that reads directly from the filesystem.
 * No store facade required — operates on raw directories.
 *
 * Uses codegen's MdBuilder for structured markdown output.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { MdBuilder } from 'codets';
import { readYaml } from './yaml-io.ts';
import { readStatus } from './status-io.ts';
import { readDeps } from './deps-io.ts';
import { listAttempts } from './log-io.ts';
import { listOrdered, parsePrefix } from './ordering.ts';
import { getReady } from './graph.ts';
import type { TaskYaml, EpicYaml, ProjectYaml } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Status emoji helper                                                */
/* ------------------------------------------------------------------ */

function statusIcon(status: string): string {
  switch (status) {
    case 'done':
    case 'completed': return '✅';
    case 'active': return '🔄';
    case 'failed': return '❌';
    case 'blocked': return '🚫';
    case 'pending':
    case 'planned': return '⏳';
    case 'archived': return '📦';
    default: return '❓';
  }
}

/* ------------------------------------------------------------------ */
/*  Progress bar helper                                                */
/* ------------------------------------------------------------------ */

function progressBar(done: number, total: number): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `${bar} ${done}/${total} (${pct}%)`;
}

/* ------------------------------------------------------------------ */
/*  generateTaskReadme                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a README.md for a single task directory.
 */
export function generateTaskReadme(taskDir: string): string {
  const config = readYaml<TaskYaml>(join(taskDir, 'task.yaml'));
  const title = config?.title ?? basename(taskDir);
  const status = readStatus(taskDir);
  const deps = readDeps(taskDir);
  const attempts = listAttempts(taskDir);

  const md = new MdBuilder();

  md.h1(title);
  md.kv('Status', `${statusIcon(status)} ${status}`);
  md.blank();

  // Dependencies
  if (deps.length > 0) {
    md.h2('Dependencies');
    for (const dep of deps) {
      const depConfig = readYaml<TaskYaml>(join(dep, 'task.yaml'));
      const depTitle = depConfig?.title ?? basename(dep);
      const depStatus = existsSync(dep) ? readStatus(dep) : 'missing';
      md.bullet(`${statusIcon(depStatus)} **${depTitle}** (${depStatus})`);
    }
    md.blank();
  }

  // Attempts
  if (attempts.length > 0) {
    md.kv('Attempts', attempts.length);
    md.blank();
  }

  // Prompt excerpt
  const promptPath = join(taskDir, 'PROMPT.md');
  if (existsSync(promptPath)) {
    const prompt = readFileSync(promptPath, 'utf-8');
    const excerpt = prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt;
    md.h2('Prompt');
    md.raw(excerpt);
    md.blank();
  }

  return md.toString();
}

/* ------------------------------------------------------------------ */
/*  generateEpicReadme                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a README.md for an epic directory.
 */
export function generateEpicReadme(epicDir: string): string {
  const config = readYaml<EpicYaml>(join(epicDir, 'epic.yaml'));
  const title = config?.title ?? basename(epicDir);
  const status = readStatus(epicDir);
  const tasksDir = join(epicDir, 'tasks');
  const taskSlugs = listOrdered(tasksDir);

  const md = new MdBuilder();

  md.h1(title);
  md.kv('Status', `${statusIcon(status)} ${status}`);
  md.blank();

  // Task table
  if (taskSlugs.length > 0) {
    const doneCount = taskSlugs.filter(slug =>
      readStatus(join(tasksDir, slug)) === 'done',
    ).length;

    md.kv('Progress', progressBar(doneCount, taskSlugs.length));
    md.blank();

    // Task table
    const rows: string[][] = [];
    for (const slug of taskSlugs) {
      const dir = join(tasksDir, slug);
      const taskConfig = readYaml<TaskYaml>(join(dir, 'task.yaml'));
      const taskTitle = taskConfig?.title ?? slug;
      const taskStatus = readStatus(dir);
      const num = parsePrefix(slug).num;
      rows.push([String(num), taskTitle, `${statusIcon(taskStatus)} ${taskStatus}`]);
    }
    md.table(['#', 'Task', 'Status'], rows);
    md.blank();

    // Dependency tree
    const hasDeps = taskSlugs.some(slug => readDeps(join(tasksDir, slug)).length > 0);
    if (hasDeps) {
      md.h2('Dependencies');
      const depLines: string[] = [];
      for (const slug of taskSlugs) {
        const dir = join(tasksDir, slug);
        const taskConfig = readYaml<TaskYaml>(join(dir, 'task.yaml'));
        const taskTitle = taskConfig?.title ?? slug;
        const deps = readDeps(dir);
        if (deps.length > 0) {
          const depNames = deps.map(d => {
            const dc = readYaml<TaskYaml>(join(d, 'task.yaml'));
            return dc?.title ?? basename(d);
          });
          depLines.push(`${taskTitle} ← ${depNames.join(', ')}`);
        } else {
          depLines.push(`${taskTitle}`);
        }
      }
      md.codeBlock('', depLines.join('\n'));
      md.blank();
    }
  }

  return md.toString();
}

/* ------------------------------------------------------------------ */
/*  generatePlanReadme                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a top-level plan README covering all epics.
 */
export function generatePlanReadme(root: string): string {
  const project = readYaml<ProjectYaml>(join(root, 'project.yaml'));
  const epicsDir = join(root, 'epics');
  const epicSlugs = listOrdered(epicsDir);

  const md = new MdBuilder();

  // Header
  const projectName = project?.name ?? 'Project';
  md.h1(`${projectName} — Plan`);

  if (project?.goal) {
    md.kv('Goal', project.goal);
    md.blank();
  }

  // Overall progress
  let totalTasks = 0;
  let doneTasks = 0;
  for (const epicSlug of epicSlugs) {
    const tasksDir = join(epicsDir, epicSlug, 'tasks');
    const taskSlugs = listOrdered(tasksDir);
    totalTasks += taskSlugs.length;
    doneTasks += taskSlugs.filter(s => readStatus(join(tasksDir, s)) === 'done').length;
  }

  if (totalTasks > 0) {
    md.kv('Overall Progress', progressBar(doneTasks, totalTasks));
    md.blank();
  }

  // Epic table
  if (epicSlugs.length > 0) {
    md.h2('Epics');

    const rows: string[][] = [];
    for (const epicSlug of epicSlugs) {
      const dir = join(epicsDir, epicSlug);
      const config = readYaml<EpicYaml>(join(dir, 'epic.yaml'));
      const epicTitle = config?.title ?? epicSlug;
      const status = readStatus(dir);
      const num = parsePrefix(epicSlug).num;

      const tasksDir = join(dir, 'tasks');
      const taskSlugs = listOrdered(tasksDir);
      const done = taskSlugs.filter(s => readStatus(join(tasksDir, s)) === 'done').length;
      const taskSummary = taskSlugs.length > 0 ? `${done}/${taskSlugs.length}` : '-';

      rows.push([String(num), epicTitle, `${statusIcon(status)} ${status}`, taskSummary]);
    }
    md.table(['#', 'Epic', 'Status', 'Tasks'], rows);
    md.blank();
  }

  return md.toString();
}

/* ------------------------------------------------------------------ */
/*  generateStateJson                                                  */
/* ------------------------------------------------------------------ */

/**
 * Produce a CrewState-compatible JSON object by scanning the filesystem.
 * No stored IDs needed — everything computed from directory structure.
 */
export function generateStateJson(root: string): Record<string, unknown> {
  const project = readYaml<ProjectYaml>(join(root, 'project.yaml'));
  const epicsDir = join(root, 'epics');
  const epicSlugs = listOrdered(epicsDir);

  // Collect all task stats
  let totalTasks = 0;
  let completedTasks = 0;
  let activeTasks = 0;
  let pendingTasks = 0;
  let blockedTasks = 0;

  const epicList: Array<Record<string, unknown>> = [];

  for (const epicSlug of epicSlugs) {
    const dir = join(epicsDir, epicSlug);
    const config = readYaml<EpicYaml>(join(dir, 'epic.yaml'));
    const status = readStatus(dir);
    const num = parsePrefix(epicSlug).num;

    const tasksDir = join(dir, 'tasks');
    const taskSlugs = listOrdered(tasksDir);
    let epicDone = 0;

    for (const taskSlug of taskSlugs) {
      const taskStatus = readStatus(join(tasksDir, taskSlug));
      totalTasks++;
      switch (taskStatus) {
        case 'done': completedTasks++; epicDone++; break;
        case 'active': activeTasks++; break;
        case 'pending': pendingTasks++; break;
        case 'blocked': blockedTasks++; break;
      }
    }

    const isComplete = taskSlugs.length > 0 && epicDone === taskSlugs.length;

    epicList.push({
      slug: epicSlug,
      number: num,
      title: config?.title ?? epicSlug,
      status,
      task_count: taskSlugs.length,
      completed_count: epicDone,
      is_complete: isComplete,
    });
  }

  // Next ready tasks
  const readyDirs = getReady(root, 5);
  const nextTasks = readyDirs.map(dir => {
    const config = readYaml<TaskYaml>(join(dir, 'task.yaml'));
    return {
      dir,
      title: config?.title ?? basename(dir),
    };
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    version: 1,
    project: project?.name ?? '',
    generated_at: new Date().toISOString(),
    summary: {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      active_tasks: activeTasks,
      pending_tasks: pendingTasks,
      blocked_tasks: blockedTasks,
      progress_pct: progressPct,
    },
    epics: epicList,
    next_tasks: nextTasks,
  };
}
