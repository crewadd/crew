/**
 * Context Builder - Hierarchical Context for Status Output
 *
 * Builds context in LOCAL → GLOBAL order:
 * 1. Current task (immediate focus)
 * 2. Prev/next tasks (local context)
 * 3. Current epic (scope boundary)
 * 4. Prev/next epics (progression path)
 * 5. Project (big picture)
 */

import type { Task, Epic } from '../store/types.ts';
import type { StatusStore } from './status-helpers.ts';
import { formatRelativeTime, formatDuration } from './status-helpers.ts';

/* ------------------------------------------------------------------ */
/*  Context Interfaces                                                */
/* ------------------------------------------------------------------ */

export interface TaskInfo {
  task: Task;
  epic: Epic;
  displayId: string;
  title: string;
  status: string;
  statusDetail: string;
  statusSummary: string;
  completionSummary: string;
  input?: string;
  output?: string;
  assignee: string;
  blockers: Array<{ displayId: string; title: string }>;
}

export interface TaskContext {
  current: TaskInfo;
  previous?: TaskInfo;
  next?: TaskInfo;
  blockers: Array<{ displayId: string; title: string }>;
}

export interface EpicContext {
  current: EpicInfo;
  recentCompletions: TaskInfo[];
  blockedTasks: Array<TaskInfo & { blockers: Array<{ displayId: string; title: string }> }>;
  readyQueue: TaskInfo[];
}

export interface EpicInfo {
  epic: Epic;
  number: number;
  title: string;
  status: string;
  progress: string;
  gates: Array<{ type: string; completed: boolean }>;
  taskCount: number;
  doneCount: number;
  blockedCount: number;
  activeCount: number;
}

export interface ProjectContext {
  epicPrevious?: EpicInfo;
  epicCurrent: EpicInfo;
  epicNext?: EpicInfo[];
  overallProgress: ProgressInfo;
}

export interface ProgressInfo {
  done: number;
  total: number;
  pct: number;
  msComplete: number;
  msTotal: number;
}

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get display ID for a task (m1.2 format)
 */
function getDisplayId(task: Task, epic: Epic): string {
  const idx = epic.task_ids.indexOf(task.id);
  return idx >= 0 ? `m${epic.number}.${idx + 1}` : task.id;
}

/**
 * Build TaskInfo from Task
 */
function buildTaskInfo(
  task: Task,
  epic: Epic,
  store: StatusStore,
): TaskInfo {
  const displayId = getDisplayId(task, epic);
  const assignee = task.assignee?.replace(/^agent_/, '') || 'unassigned';

  // Build status detail
  let statusDetail: string = task.status;
  if (task.status === 'active' && task.status_history) {
    const startEvent = task.status_history.find(h => h.to === 'active');
    if (startEvent) {
      statusDetail = `started ${formatRelativeTime(startEvent.at)}`;
      if (startEvent.by) {
        statusDetail += ` by ${startEvent.by.replace(/^agent_/, '')}`;
      }
    }
  } else if (task.status === 'done' && task.status_history) {
    const doneEvent = task.status_history.find(h => h.to === 'done');
    if (doneEvent) {
      statusDetail = `done ${formatRelativeTime(doneEvent.at)}`;
    }
  }

  // Build status summary (for prev/next display)
  let statusSummary: string = task.status;
  if (task.status === 'pending') {
    statusSummary = `ready, @${assignee}`;
  } else if (task.status === 'active') {
    statusSummary = `active, @${assignee}`;
  } else if (task.status === 'done' && task.attempts.length > 0) {
    const lastAttempt = task.attempts[task.attempts.length - 1];
    if (lastAttempt.finished_at && lastAttempt.duration_ms) {
      statusSummary = `done ${formatRelativeTime(lastAttempt.finished_at)}, ${formatDuration(lastAttempt.duration_ms)}`;
    }
  }

  // Build completion summary (for epic recent completions)
  let completionSummary: string = '';
  if (task.status === 'done' && task.attempts.length > 0) {
    const lastAttempt = task.attempts[task.attempts.length - 1];
    if (lastAttempt.finished_at) {
      completionSummary = `done ${formatRelativeTime(lastAttempt.finished_at)}`;
      if (lastAttempt.agent) {
        completionSummary += ` by ${lastAttempt.agent.replace(/^agent_/, '')}`;
      }
      if (lastAttempt.duration_ms) {
        completionSummary += `, ${formatDuration(lastAttempt.duration_ms)}`;
      }
    }
  }

  // Resolve blockers
  const blockers: Array<{ displayId: string; title: string }> = [];
  for (const depId of task.dependencies) {
    const depTask = store.getTask(depId);
    if (!depTask || depTask.status === 'done') continue;

    const epics = store.listEpics();
    const depMs = epics.find(m => m.id === depTask.epic_id);
    if (!depMs) continue;

    const displayId = getDisplayId(depTask, depMs);
    blockers.push({ displayId, title: depTask.title });
  }

  return {
    task,
    epic,
    displayId,
    title: task.title,
    status: task.status,
    statusDetail,
    statusSummary,
    completionSummary,
    input: task.input?.description,
    output: task.output?.description,
    assignee,
    blockers,
  };
}

/**
 * Build EpicInfo from Epic
 */
function buildEpicInfo(
  epic: Epic,
  store: StatusStore,
): EpicInfo {
  const tasks = epic.task_ids
    .map(id => store.getTask(id))
    .filter((t): t is Task => !!t);

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const blockedCount = tasks.filter(t => t.status === 'blocked').length;
  const activeCount = tasks.filter(t => t.status === 'active').length;
  const taskCount = tasks.length;

  // Build progress string
  const progress = `${doneCount}/${taskCount} tasks${blockedCount > 0 ? `, ${blockedCount} blocked` : ''}${activeCount > 0 ? `, ${activeCount} active` : ''}`;

  // Determine status
  let status: string;
  if (doneCount === taskCount && taskCount > 0) {
    status = 'complete';
  } else if (activeCount > 0) {
    status = 'active';
  } else if (blockedCount > 0) {
    status = 'blocked';
  } else {
    status = 'pending';
  }

  return {
    epic,
    number: epic.number,
    title: epic.title,
    status,
    progress,
    gates: epic.gates || [],
    taskCount,
    doneCount,
    blockedCount,
    activeCount,
  };
}

/* ------------------------------------------------------------------ */
/*  Main Context Builders                                             */
/* ------------------------------------------------------------------ */

/**
 * Build task context (Section 1)
 */
export function buildTaskContext(
  store: StatusStore,
  currentTaskId: string,
): TaskContext | null {
  const task = store.getTask(currentTaskId);
  if (!task) return null;

  const epics = store.listEpics();
  const epic = epics.find(m => m.id === task.epic_id);
  if (!epic) return null;

  const currentInfo = buildTaskInfo(task, epic, store);

  // Get previous/next tasks in epic
  const taskIds = epic.task_ids;
  const currentIndex = taskIds.indexOf(currentTaskId as import('../store/types.ts').TaskId);

  let previousInfo: TaskInfo | undefined;
  if (currentIndex > 0) {
    const prevTask = store.getTask(taskIds[currentIndex - 1]);
    if (prevTask) {
      previousInfo = buildTaskInfo(prevTask, epic, store);
    }
  }

  let nextInfo: TaskInfo | undefined;
  if (currentIndex < taskIds.length - 1) {
    const nextTask = store.getTask(taskIds[currentIndex + 1]);
    if (nextTask) {
      nextInfo = buildTaskInfo(nextTask, epic, store);
    }
  }

  return {
    current: currentInfo,
    previous: previousInfo,
    next: nextInfo,
    blockers: currentInfo.blockers,
  };
}

/**
 * Build epic context (Section 2)
 */
export function buildEpicContext(
  store: StatusStore,
  epicId: string,
): EpicContext | null {
  const epics = store.listEpics();
  const epic = epics.find(m => m.id === epicId);
  if (!epic) return null;

  const currentInfo = buildEpicInfo(epic, store);

  // Get all tasks for this epic
  const tasks = epic.task_ids
    .map(id => store.getTask(id))
    .filter((t): t is Task => !!t);

  // Recent completions (last 3 done tasks)
  const recentCompletions = tasks
    .filter(t => t.status === 'done')
    .map(t => buildTaskInfo(t, epic, store))
    .sort((a, b) => {
      const aTime = a.task.attempts[a.task.attempts.length - 1]?.finished_at;
      const bTime = b.task.attempts[b.task.attempts.length - 1]?.finished_at;
      if (!aTime || !bTime) return 0;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .slice(0, 3);

  // Blocked tasks with their blockers
  const blockedTasks = tasks
    .filter(t => t.status === 'blocked' || t.dependencies.some(depId => {
      const depTask = store.getTask(depId);
      return depTask && depTask.status !== 'done';
    }))
    .map(t => {
      const info = buildTaskInfo(t, epic, store);
      return { ...info, blockers: info.blockers };
    })
    .filter(info => info.blockers.length > 0);

  // Ready queue (pending tasks with no blockers, current epic only)
  const readyQueue = tasks
    .filter(t => t.status === 'pending')
    .filter(t => {
      // Check if all dependencies are done
      return t.dependencies.every(depId => {
        const depTask = store.getTask(depId);
        return depTask && depTask.status === 'done';
      });
    })
    .map(t => buildTaskInfo(t, epic, store))
    .slice(0, 5);

  return {
    current: currentInfo,
    recentCompletions,
    blockedTasks,
    readyQueue,
  };
}

/**
 * Build project context (Section 3-4)
 */
export function buildProjectContext(
  store: StatusStore,
): ProjectContext | null {
  const project = store.getProject();
  if (!project) return null;

  const epics = store.listEpics();
  const allTasks = store.listTasks();

  // Determine current epic dynamically based on active/ready tasks
  let currentMs: Epic | null = null;
  const activeTasks = allTasks.filter(t => t.status === 'active');

  if (activeTasks.length > 0) {
    // Use epic of first active task
    currentMs = epics.find(m => m.id === activeTasks[0].epic_id) || null;
  }

  if (!currentMs && store.getNextReady) {
    // If no active task, use epic of next ready task
    const nextReadyTask = store.getNextReady(1)[0];
    if (nextReadyTask) {
      currentMs = epics.find(m => m.id === nextReadyTask.epic_id) || null;
    }
  }

  if (!currentMs) {
    // Fallback to project.current.epic or first epic
    const currentMsId = project.current?.epic;
    currentMs = epics.find(m => m.id === currentMsId) || epics[0];
  }

  if (!currentMs) return null;

  const currentInfo = buildEpicInfo(currentMs, store);

  // Find current index
  const currentIndex = epics.findIndex(m => m.id === currentMs.id);

  // Previous epic
  let previousInfo: EpicInfo | undefined;
  if (currentIndex > 0) {
    previousInfo = buildEpicInfo(epics[currentIndex - 1], store);
  }

  // Next epics (up to 2)
  const nextInfos: EpicInfo[] = epics
    .slice(currentIndex + 1, currentIndex + 3)
    .map(ms => buildEpicInfo(ms, store));

  // Overall progress (allTasks already defined above)
  const done = allTasks.filter(t => t.status === 'done').length;
  const total = allTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const msComplete = epics.filter(ms => {
    const msTasks = ms.task_ids.map(id => store.getTask(id)).filter((t): t is Task => !!t);
    return msTasks.length > 0 && msTasks.every(t => t.status === 'done');
  }).length;

  return {
    epicPrevious: previousInfo,
    epicCurrent: currentInfo,
    epicNext: nextInfos.length > 0 ? nextInfos : undefined,
    overallProgress: {
      done,
      total,
      pct,
      msComplete,
      msTotal: epics.length,
    },
  };
}
