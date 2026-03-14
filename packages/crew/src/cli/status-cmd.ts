/**
 * crew status - AI-First Project Status
 *
 * Optimized for AI agents reading first N lines.
 * Critical info first: current state, next action, blockers.
 * Enhanced with: recent activity, dependency chains, epic gates, agent stats.
 */

import type { Task, Epic } from '../store/types.ts';
import {
  collectActivityEvents,
  formatActivityEvent,
  resolveBlockers,
  formatBlockerInfo,
  generateGatesSection,
  collectAgentStats,
  generateAgentsSection,
  countBlockedTasksPerEpic,
  formatTaskContext,
  formatEpicContext,
  formatEpicProgression,
  formatProjectOverview,
  formatRelativeTime,
  type StatusStore,
} from './status-helpers.ts';
import {
  buildTaskContext,
  buildEpicContext,
  buildProjectContext,
} from './context-builder.ts';

// Re-export StatusStore for convenience
export type { StatusStore } from './status-helpers.ts';

function getDisplayId(task: Task, epic: Epic): string {
  const idx = epic.task_ids.indexOf(task.id);
  return idx >= 0 ? `m${epic.number}.${idx + 1}` : task.id;
}

/**
 * Generate status - AI optimized, hierarchical local → global context
 * Enhanced with activity, gates, dependencies, and optional agent stats
 */
export function generateStatus(store: StatusStore, options: { agents?: boolean; activity?: boolean; blockers?: boolean } = {}): string {
  const project = store.getProject();
  if (!project) {
    return `STATE: NO_PROJECT
ACTION: Run 'crew init' to initialize`;
  }

  const epics = store.listEpics();
  const epicIds = new Set(epics.map(m => m.id));
  // Filter to only tasks whose epic exists in this project
  const tasks = store.listTasks().filter(t => epicIds.has(t.epic_id));

  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Determine current epic dynamically based on active tasks or next ready task
  const activeTasks = tasks.filter(t => t.status === 'active');
  const failedTasks = tasks.filter(t => t.status === 'failed');
  const currentTask = activeTasks[0] || null;

  let currentMs: Epic | null = null;
  if (currentTask) {
    // Use epic of active task
    currentMs = epics.find(m => m.id === currentTask.epic_id) || null;
  }

  if (!currentMs) {
    // If no active task, use epic of next ready task
    const nextReadyTask = store.getNextReady ? store.getNextReady(1)[0] : null;
    if (nextReadyTask) {
      currentMs = epics.find(m => m.id === nextReadyTask.epic_id) || null;
    }
  }

  if (!currentMs && failedTasks.length > 0) {
    // If blocked by a failed task, point to that epic
    currentMs = epics.find(m => m.task_ids.some(id => failedTasks.some(t => t.id === id))) || null;
  }

  if (!currentMs) {
    // Fallback: find the furthest epic with unfinished tasks
    const epicWithWork = [...epics].reverse().find(m =>
      m.task_ids.some(id => {
        const t = store.getTask(id);
        return t && t.status !== 'done' && t.status !== 'cancelled';
      })
    );
    currentMs = epicWithWork || epics.find(m => m.id === project.current?.epic) || epics[0];
  }

  // Get ready tasks - use getNextReady if available
  const readyTasks = store.getNextReady
    ? store.getNextReady(5).filter(t => t.status === 'pending' && epicIds.has(t.epic_id))
    : tasks.filter(t => t.status === 'pending' && epicIds.has(t.epic_id)).slice(0, 5);
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  // Detect effective deadlock: unfinished tasks remain but nothing is actionable
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const isDeadlocked = activeTasks.length === 0 && readyTasks.length === 0 &&
    blockedTasks.length === 0 && (pendingTasks.length > 0 || failedTasks.length > 0) &&
    done < total;

  const lines: string[] = [];

  // ============================================================
  // SECTION 0: Critical Lines 1-4 (unchanged - proven pattern)
  // ============================================================

  // LINE 1: State summary (most critical)
  if (currentTask && currentMs) {
    const taskId = getDisplayId(currentTask, currentMs);
    lines.push(`STATE: WORKING on ${taskId} in M${currentMs.number}`);
  } else if (readyTasks.length > 0) {
    lines.push(`STATE: READY to start next task (${readyTasks.length} queued)`);
  } else if (blockedTasks.length > 0) {
    lines.push(`STATE: BLOCKED (${blockedTasks.length} tasks waiting)`);
  } else if (isDeadlocked && failedTasks.length > 0) {
    lines.push(`STATE: DEADLOCKED — ${failedTasks.length} failed task(s) blocking progress`);
  } else if (isDeadlocked) {
    lines.push(`STATE: DEADLOCKED — ${pendingTasks.length} pending tasks have unmet dependencies`);
  } else if (done === total && total > 0) {
    lines.push(`STATE: COMPLETE (${done}/${total} tasks done)`);
  } else {
    lines.push(`STATE: EMPTY (no tasks)`);
  }

  // LINE 2: Project context
  const msCount = epics.length;
  const msComplete = epics.filter(ms => {
    const msTasks = ms.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    return msTasks.length > 0 && msTasks.every(t => t.status === 'done');
  }).length;
  lines.push(`PROJECT: ${project.name} [${pct}% ${done}/${total}] @ M${currentMs?.number || 0}: ${currentMs?.title || '?'} (${msComplete}/${msCount} ms complete)`);

  // LINE 3: Current task or next ready task
  if (currentTask && currentMs) {
    const taskId = getDisplayId(currentTask, currentMs);
    const assignee = currentTask.assignee?.replace(/^agent_/, '') || 'unassigned';
    // Add timing if available
    let timing = '';
    if (currentTask.status_history) {
      const startEvent = currentTask.status_history.find(h => h.to === 'active');
      if (startEvent) {
        timing = ` [started ${formatRelativeTime(startEvent.at)}]`;
      }
    }
    lines.push(`ACTIVE: ${taskId}: ${currentTask.title} @${assignee}${timing}`);
  } else if (readyTasks.length > 0 && currentMs) {
    const t = readyTasks[0];
    const ms = epics.find(m => m.id === t.epic_id)!;
    const taskId = getDisplayId(t, ms);
    const assignee = t.assignee?.replace(/^agent_/, '') || 'unassigned';
    lines.push(`NEXT: ${taskId}: ${t.title} @${assignee}`);
  } else if (isDeadlocked && failedTasks.length > 0 && currentMs) {
    const ft = failedTasks[0];
    const ftMs = epics.find(m => m.id === ft.epic_id) || currentMs;
    const taskId = getDisplayId(ft, ftMs);
    lines.push(`BLOCKER: ${taskId}: ${ft.title} [failed] — fix or retry to unblock`);
  } else {
    lines.push(`NEXT: (none ready)`);
  }

  // LINE 4: Action command
  if (currentTask && currentMs) {
    lines.push(`ACTION: crew done ${getDisplayId(currentTask, currentMs)}`);
  } else if (readyTasks.length > 0) {
    lines.push(`ACTION: crew run next`);
  } else if (isDeadlocked && failedTasks.length > 0 && currentMs) {
    const ft = failedTasks[0];
    const ftMs = epics.find(m => m.id === ft.epic_id) || currentMs;
    const taskId = getDisplayId(ft, ftMs);
    lines.push(`ACTION: crew run ${taskId}  # retry failed task, or fix and mark done`);
  } else if (blockedTasks.length > 0) {
    lines.push(`ACTION: Review blocked tasks`);
  } else {
    lines.push(`ACTION: Add new tasks`);
  }

  // ============================================================
  // SECTION 1: Current Task Context (local focus)
  // ============================================================
  if (currentTask && currentMs) {
    const taskCtx = buildTaskContext(store, currentTask.id);
    if (taskCtx) {
      lines.push('');
      lines.push(formatTaskContext(taskCtx));
    }
  }

  // ============================================================
  // SECTION 2: Current Epic Context (scope boundary)
  // ============================================================
  if (currentMs) {
    const msCtx = buildEpicContext(store, currentMs.id);
    if (msCtx) {
      lines.push('');
      lines.push(formatEpicContext(msCtx));
    }
  }

  // ============================================================
  // SECTION 3: Epic Progression (timeline)
  // ============================================================
  const projCtx = buildProjectContext(store);
  if (projCtx) {
    lines.push('');
    lines.push(formatEpicProgression(projCtx));
  }

  // ============================================================
  // SECTION 4: Project Overview (big picture)
  // ============================================================
  if (projCtx) {
    lines.push('');
    lines.push(formatProjectOverview(projCtx, store));
  }

  // ============================================================
  // OPTIONAL SECTIONS (controlled by flags)
  // ============================================================

  // Extended activity history (--activity flag)
  if (options.activity) {
    const activityEvents = collectActivityEvents(store, 10);
    if (activityEvents.length > 0) {
      lines.push('');
      lines.push(`ACTIVITY HISTORY (last ${activityEvents.length}):`);
      for (const event of activityEvents) {
        lines.push(`  ${formatActivityEvent(event)}`);
      }
    }
  }

  // Cross-epic blockers (--blockers flag)
  if (options.blockers && blockedTasks.length > 0) {
    lines.push('');
    lines.push(`ALL BLOCKERS (${blockedTasks.length} total):`);

    // Group by epic
    const blockersByMs = new Map<string, Task[]>();
    for (const task of blockedTasks) {
      const ms = epics.find(m => m.id === task.epic_id);
      if (ms) {
        const key = `M${ms.number}`;
        if (!blockersByMs.has(key)) {
          blockersByMs.set(key, []);
        }
        blockersByMs.get(key)!.push(task);
      }
    }

    for (const [msKey, msTasks] of Array.from(blockersByMs.entries()).sort()) {
      lines.push(`  ${msKey}:`);
      const blockerInfos = resolveBlockers(store, msTasks.slice(0, 5));
      for (const info of blockerInfos) {
        const ms = epics.find(m => m.id === info.task.epic_id);
        if (ms) {
          lines.push(formatBlockerInfo(info, ms).replace(/^  /, '    '));
        }
      }
    }
  }

  // Agent workload dashboard (--agents flag)
  if (options.agents) {
    const agentStats = collectAgentStats(store);
    const agentsSection = generateAgentsSection(agentStats);
    if (agentsSection) {
      lines.push('');
      lines.push(agentsSection);
    }
  }

  return lines.join('\n');
}

/**
 * Generate inline one-line status
 * Format: project | Epic X N/M | taskId STATUS | done/total
 */
export function generateStatusInline(store: StatusStore): string {
  const project = store.getProject();
  if (!project) return 'NO_PROJECT | ? | ? | 0/0';

  const epics = store.listEpics();
  const epicIds = new Set(epics.map(m => m.id));
  const tasks = store.listTasks().filter(t => epicIds.has(t.epic_id));
  const activeTasks = tasks.filter(t => t.status === 'active');
  const readyTasks = store.getNextReady
    ? store.getNextReady(3).filter(t => t.status === 'pending' && epicIds.has(t.epic_id))
    : tasks.filter(t => t.status === 'pending' && epicIds.has(t.epic_id)).slice(0, 3);

  // Determine current epic dynamically
  let currentMs: Epic | undefined = undefined;
  if (activeTasks.length > 0) {
    currentMs = epics.find(m => m.id === activeTasks[0].epic_id);
  }
  if (!currentMs && readyTasks.length > 0) {
    currentMs = epics.find(m => m.id === readyTasks[0].epic_id);
  }
  if (!currentMs) {
    currentMs = epics.find(m => m.id === project.current?.epic);
  }
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  
  const msCount = epics.length;
  const msComplete = epics.filter(ms => {
    const msTasks = ms.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    return msTasks.length > 0 && msTasks.every(t => t.status === 'done');
  }).length;
  
  // Project name (truncated if too long)
  const projName = project.name.length > 15 ? project.name.slice(0, 12) + '...' : project.name;
  
  // Epic info: "Epic X N/M" or just "M?" if no tasks
  let msInfo: string;
  if (currentMs) {
    const msTasks = currentMs.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    const msDone = msTasks.filter(t => t.status === 'done').length;
    msInfo = `M${currentMs.number} ${msDone}/${msTasks.length || 0}`;
  } else {
    msInfo = 'M?';
  }
  
  // Task info
  let taskInfo: string;
  if (activeTasks.length > 0 && currentMs) {
    const t = activeTasks[0];
    const taskId = getDisplayId(t, currentMs);
    taskInfo = `${taskId} ACTIVE`;
  } else if (readyTasks.length > 0 && currentMs) {
    const t = readyTasks[0];
    const taskId = getDisplayId(t, currentMs);
    taskInfo = `${taskId} READY`;
  } else if (done === total && total > 0) {
    taskInfo = 'DONE';
  } else {
    taskInfo = 'IDLE';
  }
  
  // Format: project | current_ms | task_state | overall_progress
  // Example: myproject | M2 3/5 | m2.1 ACTIVE | 5/12
  return `${projName} | ${msInfo} | ${taskInfo} | ${done}/${total}`;
}

/**
 * Generate minimal multi-line status (name: value format, ~5 lines)
 */
export function generateStatusMinimal(store: StatusStore): string {
  const project = store.getProject();
  if (!project) return 'Project: ?\nRun: crew init';

  const epics = store.listEpics();
  const epicIds = new Set(epics.map(m => m.id));
  const tasks = store.listTasks().filter(t => epicIds.has(t.epic_id));
  const activeTasks = tasks.filter(t => t.status === 'active');
  const readyTasks = store.getNextReady
    ? store.getNextReady(5).filter(t => t.status === 'pending' && epicIds.has(t.epic_id))
    : tasks.filter(t => t.status === 'pending' && epicIds.has(t.epic_id)).slice(0, 5);
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  // Determine current epic dynamically
  let currentMs: Epic | undefined = undefined;
  if (activeTasks.length > 0) {
    currentMs = epics.find(m => m.id === activeTasks[0].epic_id);
  }
  if (!currentMs && readyTasks.length > 0) {
    currentMs = epics.find(m => m.id === readyTasks[0].epic_id);
  }
  if (!currentMs) {
    currentMs = epics.find(m => m.id === project.current?.epic);
  }
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  
  const msCount = epics.length;
  const msComplete = epics.filter(ms => {
    const msTasks = ms.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    return msTasks.length > 0 && msTasks.every(t => t.status === 'done');
  }).length;
  
  const lines: string[] = [];
  
  // Line 1: Project with epic count
  lines.push(`Project: ${project.name} (${msComplete}/${msCount} ms)`);
  
  // Line 2: Current epic
  if (currentMs) {
    const msTasks = currentMs.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    const msDone = msTasks.filter(t => t.status === 'done').length;
    lines.push(`Epic: M${currentMs.number} ${currentMs.title} (${msDone}/${msTasks.length || 0})`);
  } else {
    lines.push('Epic: ?');
  }
  
  // Line 3: Current task or next ready
  if (activeTasks.length > 0 && currentMs) {
    const t = activeTasks[0];
    lines.push(`Task: ${getDisplayId(t, currentMs)} ${t.title} [ACTIVE]`);
  } else if (readyTasks.length > 0 && currentMs) {
    const t = readyTasks[0];
    lines.push(`Task: ${getDisplayId(t, currentMs)} ${t.title} [READY]`);
  } else if (done === total && total > 0) {
    lines.push('Task: COMPLETE');
  } else {
    lines.push('Task: IDLE');
  }
  
  // Line 4: Overall progress
  lines.push(`Progress: ${done}/${total} (${pct}%)`);
  
  // Line 5: Blockers or next action
  if (blockedTasks.length > 0) {
    lines.push(`Blocked: ${blockedTasks.length} tasks`);
  } else if (activeTasks.length > 0 && currentMs) {
    lines.push(`Next: crew done ${getDisplayId(activeTasks[0], currentMs)}`);
  } else if (readyTasks.length > 0) {
    lines.push('Next: crew run next');
  } else {
    lines.push('Next: add tasks');
  }
  
  return lines.join('\n');
}

/**
 * Generate JSON status for programmatic use
 */
export function generateStatusJson(store: StatusStore): object {
  const project = store.getProject();
  if (!project) return { error: 'No project' };

  const epics = store.listEpics();
  const epicIds = new Set(epics.map(m => m.id));
  const tasks = store.listTasks().filter(t => epicIds.has(t.epic_id));
  const readyTasks = store.getNextReady
    ? store.getNextReady(10).filter(t => t.status === 'pending' && epicIds.has(t.epic_id))
    : tasks.filter(t => t.status === 'pending' && epicIds.has(t.epic_id)).slice(0, 10);
  const activeTasks = tasks.filter(t => t.status === 'active');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  // Determine current epic dynamically
  let currentMs: Epic | undefined = undefined;
  if (activeTasks.length > 0) {
    currentMs = epics.find(m => m.id === activeTasks[0].epic_id);
  }
  if (!currentMs && readyTasks.length > 0) {
    currentMs = epics.find(m => m.id === readyTasks[0].epic_id);
  }
  if (!currentMs) {
    currentMs = epics.find(m => m.id === project.current?.epic);
  }

  const done = tasks.filter(t => t.status === 'done').length;
  
  return {
    state: activeTasks.length > 0 ? 'working' : 
           readyTasks.length > 0 ? 'ready' :
           blockedTasks.length > 0 ? 'blocked' :
           done === tasks.length && tasks.length > 0 ? 'complete' : 'empty',
    project: project.name,
    progress: { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 },
    epic: currentMs ? { number: currentMs.number, title: currentMs.title } : null,
    current: activeTasks.length > 0 ? {
      id: activeTasks[0].id,
      displayId: currentMs ? getDisplayId(activeTasks[0], currentMs) : activeTasks[0].id,
      title: activeTasks[0].title,
      assignee: activeTasks[0].assignee?.replace(/^agent_/, '') || null,
    } : null,
    next: readyTasks.slice(0, 3).map(t => ({
      id: t.id,
      displayId: currentMs ? getDisplayId(t, currentMs) : t.id,
      title: t.title,
      assignee: t.assignee?.replace(/^agent_/, '') || null,
    })),
    blocked: blockedTasks.slice(0, 3).map(t => ({
      id: t.id,
      displayId: currentMs ? getDisplayId(t, currentMs) : t.id,
      title: t.title,
    })),
    action: activeTasks.length > 0 ? `crew done ${currentMs ? getDisplayId(activeTasks[0], currentMs) : activeTasks[0].id}` :
            readyTasks.length > 0 ? 'crew run next' :
            blockedTasks.length > 0 ? 'review blocked' : 'add tasks',
  };
}

/* ------------------------------------------------------------------ */
/*  CLI Command Entry Point                                           */
/* ------------------------------------------------------------------ */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { validateProjectDir } from './utils.ts';

/**
 * Run status command
 */
export async function runStatus(projectDir: string, flags: Record<string, string | boolean> = {}): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  // Use hierarchical store only
  const { HierarchicalStore, generateTreeView } = await import('../store/hierarchical-store.ts');
  const hStore = new HierarchicalStore(absDir);

  if (hStore.listEpicDirs().length === 0) {
    console.error('ERROR: No project. Run: crew init');
    process.exit(1);
  }

  const stats = hStore.getStats();

  if (flags.json) {
    // Build JSON state manually since generateState doesn't exist
    const epics = hStore.listEpics();
    const allTasks = epics.flatMap(ms => hStore.listTasksForEpic(ms));
    const projectJson = JSON.parse(readFileSync(join(absDir, '.crew', 'project.json'), 'utf-8'));
    const state = {
      project: projectJson.name,
      epics: epics.map(m => ({
        id: m.id,
        number: m.number,
        title: m.title,
        status: m.status,
        tasks: hStore.listTasksForEpic(m).map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assignee: t.assignee,
        })),
      })),
      summary: {
        tasks: { total: stats.tasks, done: stats.completed, active: stats.active, pending: stats.pending },
        epics: { total: stats.epics, active: 0 },
      },
    };
    process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  } else if (flags.inline) {
    let projectName = 'project';
    try {
      const projectJson = JSON.parse(readFileSync(join(absDir, '.crew', 'project.json'), 'utf-8'));
      projectName = projectJson.name || 'project';
    } catch {}
    console.log(`${projectName} | ${stats.epics} ms | ${stats.completed}/${stats.tasks}`);
  } else if (flags.minimal) {
    let projectName = 'project';
    try {
      const projectJson = JSON.parse(readFileSync(join(absDir, '.crew', 'project.json'), 'utf-8'));
      projectName = projectJson.name || 'project';
    } catch {}
    console.log(`Project: ${projectName}`);
    console.log(`Tasks: ${stats.completed}/${stats.tasks} done`);
    console.log(`Status: ${stats.active > 0 ? 'active' : stats.pending > 0 ? 'ready' : 'idle'}`);
  } else {
    // Use enhanced AI-optimized status with all features
    // Create adapter to make HierarchicalStore compatible with StatusStore interface
    const storeAdapter: StatusStore = {
      getProject: () => hStore.getProject(),
      listEpics: () => hStore.listEpics(),
      listTasks: () => hStore.listAllTasks(),
      getTask: (id: string) => hStore.getTask(id as import('../store/types.ts').TaskId),
      getNextReady: (limit: number) => hStore.getNextReady(limit),
    };

    const output = generateStatus(storeAdapter, {
      agents: flags.agents === true,
      activity: flags.activity === true,
      blockers: flags.blockers === true,
    });
    console.log(output);
  }
}
