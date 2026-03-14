/**
 * Status Command Helpers
 *
 * Utility functions for enhanced status output:
 * - Time formatting (relative, duration)
 * - Activity event collection
 * - Dependency resolution
 * - Gate formatting
 */

import type { Task, Epic, StatusChange, Attempt, CrewProject, TaskView } from '../store/types.ts';

// Generic store interface for status helpers
export interface StatusStore {
  getProject(): CrewProject | null;
  listEpics(): Epic[];
  listTasks(): Task[];
  getTask(id: string): Task | null;
  getNextReady?(limit: number): Task[];
}

/* ------------------------------------------------------------------ */
/*  Time Formatting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Format timestamp as relative time
 * Examples: "2min ago", "1h ago", "3d ago", "just now"
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}min ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Format duration in milliseconds
 * Examples: 126000 → "2.1m", 5400000 → "1.5h", 45000 → "45s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return `${seconds}s`;
  if (minutes < 60) {
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m${secs}s` : `${minutes}m`;
  }

  const mins = minutes % 60;
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}

/* ------------------------------------------------------------------ */
/*  Activity Events                                                   */
/* ------------------------------------------------------------------ */

export interface ActivityEvent {
  time: Date;
  displayId: string;
  title: string;
  event: 'started' | 'completed' | 'blocked' | 'failed' | 'created';
  agent: string;
  duration?: number;
}

/**
 * Collect recent activity events from all tasks
 */
export function collectActivityEvents(store: StatusStore, limit = 5): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const tasks = store.listTasks();
  const epics = store.listEpics();

  // Build epic lookup
  const msLookup = new Map<string, Epic>();
  for (const ms of epics) {
    msLookup.set(ms.id, ms);
  }

  // Collect events from each task
  for (const task of tasks) {
    const ms = msLookup.get(task.epic_id);
    if (!ms) continue;

    const displayId = getDisplayIdForTask(task, ms);

    // Add status change events
    if (task.status_history) {
      for (const change of task.status_history) {
        const eventType = mapStatusToEvent(change.to);
        if (eventType) {
          events.push({
            time: new Date(change.at),
            displayId,
            title: task.title,
            event: eventType,
            agent: change.by.replace(/^agent_/, ''),
          });
        }
      }
    }

    // Add attempt completion events (with duration)
    if (task.attempts) {
      for (const attempt of task.attempts) {
        if (attempt.finished_at) {
          events.push({
            time: new Date(attempt.finished_at),
            displayId,
            title: task.title,
            event: attempt.success ? 'completed' : 'failed',
            agent: attempt.agent.replace(/^agent_/, ''),
            duration: attempt.duration_ms,
          });
        }
      }
    }

    // Add creation event
    events.push({
      time: new Date(task.created.at),
      displayId,
      title: task.title,
      event: 'created',
      agent: task.created.by.replace(/^agent_/, ''),
    });
  }

  // Sort by time DESC, take first N
  events.sort((a, b) => b.time.getTime() - a.time.getTime());
  return events.slice(0, limit);
}

/**
 * Map task status to event type
 */
function mapStatusToEvent(status: Task['status']): ActivityEvent['event'] | null {
  switch (status) {
    case 'active': return 'started';
    case 'done': return 'completed';
    case 'blocked': return 'blocked';
    case 'failed': return 'failed';
    default: return null;
  }
}

/**
 * Get display ID for a task (m1.2 format)
 */
function getDisplayIdForTask(task: Task, epic: Epic): string {
  const idx = epic.task_ids.indexOf(task.id);
  return idx >= 0 ? `m${epic.number}.${idx + 1}` : task.id;
}

/**
 * Format an activity event as a string
 */
export function formatActivityEvent(event: ActivityEvent): string {
  const time = formatRelativeTime(event.time.toISOString());
  const duration = event.duration ? ` (${formatDuration(event.duration)})` : '';
  const verb = {
    started: 'started',
    completed: 'completed',
    blocked: 'blocked',
    failed: 'failed',
    created: 'created',
  }[event.event];

  return `${time.padEnd(10)} ${event.displayId} ${event.title} ${verb} by ${event.agent}${duration}`;
}

/* ------------------------------------------------------------------ */
/*  Dependency Resolution                                             */
/* ------------------------------------------------------------------ */

export interface BlockerInfo {
  task: Task;
  blockers: Array<{ displayId: string; title: string }>;
}

/**
 * Resolve blockers for tasks with unmet dependencies
 */
export function resolveBlockers(store: StatusStore, tasks: Task[]): BlockerInfo[] {
  const epics = store.listEpics();
  const msLookup = new Map<string, Epic>();
  for (const ms of epics) {
    msLookup.set(ms.id, ms);
  }

  const result: BlockerInfo[] = [];

  for (const task of tasks) {
    if (task.status !== 'blocked' && task.dependencies.length === 0) continue;

    const blockers: Array<{ displayId: string; title: string }> = [];

    for (const depId of task.dependencies) {
      const depTask = store.getTask(depId);
      if (!depTask || depTask.status === 'done') continue;

      const depMs = msLookup.get(depTask.epic_id);
      if (!depMs) continue;

      const displayId = getDisplayIdForTask(depTask, depMs);
      blockers.push({ displayId, title: depTask.title });
    }

    if (blockers.length > 0) {
      result.push({ task, blockers });
    }
  }

  return result;
}

/**
 * Format blocker information
 */
export function formatBlockerInfo(
  info: BlockerInfo,
  epic: Epic,
): string {
  const displayId = getDisplayIdForTask(info.task, epic);
  const lines = [`  ${displayId}: ${info.task.title}`];

  if (info.blockers.length > 0) {
    const blockerList = info.blockers
      .map(b => `${b.displayId} ${b.title}`)
      .join(', ');
    lines.push(`    ↳ waiting for: ${blockerList}`);
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Gate Formatting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Format gate status symbol
 */
export function formatGateStatus(
  completed: boolean,
  epicActive: boolean,
): string {
  if (completed) return '✓';
  if (epicActive) return '◐';
  return ' ';
}

/**
 * Format epic gates section
 */
export function generateGatesSection(
  epics: Epic[],
  currentEpicId?: string,
): string {
  const lines = ['EPIC GATES:'];

  for (const ms of epics) {
    if (ms.gates.length === 0) continue;

    const isActive = ms.id === currentEpicId;
    const gateStatus = ms.gates
      .map(g => formatGateStatus(g.completed, isActive))
      .join('] [');

    const gateNames = ms.gates.map(g => g.type).join('] [');
    lines.push(`  M${ms.number} ${ms.title} [${gateStatus}]  # [${gateNames}]`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/* ------------------------------------------------------------------ */
/*  Agent Stats                                                       */
/* ------------------------------------------------------------------ */

export interface AgentStats {
  name: string;
  active: number;
  completed: number;
  avgDurationMs: number;
}

/**
 * Collect agent workload statistics
 */
export function collectAgentStats(store: StatusStore): AgentStats[] {
  const tasks = store.listTasks();
  const agentMap = new Map<string, AgentStats>();

  for (const task of tasks) {
    const agentName = task.assignee?.replace(/^agent_/, '') || 'unassigned';

    if (!agentMap.has(agentName)) {
      agentMap.set(agentName, {
        name: agentName,
        active: 0,
        completed: 0,
        avgDurationMs: 0,
      });
    }

    const stats = agentMap.get(agentName)!;

    if (task.status === 'active') {
      stats.active++;
    } else if (task.status === 'done') {
      stats.completed++;
    }
  }

  // Calculate average durations
  for (const task of tasks) {
    if (task.status !== 'done' || !task.attempts.length) continue;

    const agentName = task.assignee?.replace(/^agent_/, '') || 'unassigned';
    const stats = agentMap.get(agentName);
    if (!stats || stats.completed === 0) continue;

    const totalDuration = task.attempts.reduce((sum, a) => sum + (a.duration_ms || 0), 0);
    stats.avgDurationMs = (stats.avgDurationMs * (stats.completed - 1) + totalDuration) / stats.completed;
  }

  return Array.from(agentMap.values())
    .filter(s => s.active > 0 || s.completed > 0)
    .sort((a, b) => (b.active + b.completed) - (a.active + a.completed));
}

/**
 * Format agent stats section
 */
export function generateAgentsSection(stats: AgentStats[]): string {
  if (stats.length === 0) return '';

  const lines = ['AGENTS:'];

  for (const agent of stats) {
    const parts: string[] = [];

    if (agent.active > 0) {
      parts.push(`${agent.active} active`);
    }
    if (agent.completed > 0) {
      const avgDuration = formatDuration(agent.avgDurationMs);
      parts.push(`${agent.completed} completed (avg ${avgDuration}/task)`);
    }

    lines.push(`  ${agent.name}: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Epic Enhancement                                             */
/* ------------------------------------------------------------------ */

/**
 * Count blocked tasks per epic
 */
export function countBlockedTasksPerEpic(
  store: StatusStore,
  epic: Epic,
): number {
  const tasks = epic.task_ids
    .map(id => store.getTask(id))
    .filter((t): t is Task => !!t);
  return tasks.filter(t => t.status === 'blocked').length;
}

/* ------------------------------------------------------------------ */
/*  Context Formatters (Hierarchical Status)                         */
/* ------------------------------------------------------------------ */

import type {
  TaskContext,
  EpicContext,
  ProjectContext,
} from './context-builder.ts';

/**
 * Format task context section
 */
export function formatTaskContext(ctx: TaskContext): string {
  const lines = ['CURRENT TASK:'];

  // Current task details
  lines.push(`  ${ctx.current.displayId}: ${ctx.current.title}`);
  lines.push(`  Status: ${ctx.current.statusDetail}`);

  if (ctx.current.input) {
    lines.push(`  Input: ${ctx.current.input}`);
  }
  if (ctx.current.output) {
    lines.push(`  Output: ${ctx.current.output}`);
  }

  // Blockers if any
  if (ctx.blockers.length > 0) {
    const blockerList = ctx.blockers.map(b => b.displayId).join(', ');
    lines.push(`  Blockers: ${blockerList}`);
  } else {
    lines.push(`  Blockers: none`);
  }

  lines.push('');

  // Previous/next navigation
  if (ctx.previous) {
    lines.push(`  ← Previous: ${ctx.previous.displayId} ${ctx.previous.title} (${ctx.previous.statusSummary})`);
  }
  if (ctx.next) {
    lines.push(`  → Next: ${ctx.next.displayId} ${ctx.next.title} (${ctx.next.statusSummary})`);
  }

  return lines.join('\n');
}

/**
 * Format epic context section
 */
export function formatEpicContext(ctx: EpicContext): string {
  const lines = ['CURRENT EPIC:'];

  // Epic header
  const gateStr = ctx.current.gates.length > 0
    ? ', ' + ctx.current.gates
        .map(g => `${g.type}-gate${g.completed ? '✓' : ' '}`)
        .join(' ')
    : '';
  lines.push(`  > M${ctx.current.number}: ${ctx.current.title} (${ctx.current.progress})`);
  lines.push(`  Status: ${ctx.current.status}${gateStr}`);
  lines.push('');

  // Recent completions
  if (ctx.recentCompletions.length > 0) {
    lines.push(`  Recent completions:`);
    for (const task of ctx.recentCompletions) {
      lines.push(`    ${task.displayId}: ${task.title} (${task.completionSummary})`);
    }
    lines.push('');
  }

  // Blocked tasks
  if (ctx.blockedTasks.length > 0) {
    lines.push(`  Blocked tasks:`);
    for (const task of ctx.blockedTasks) {
      const blockers = task.blockers.map(b => b.displayId).join(', ');
      lines.push(`    ${task.displayId}: ${task.title} → waiting for: ${blockers}`);
    }
    lines.push('');
  }

  // Ready queue
  if (ctx.readyQueue.length > 0) {
    lines.push(`  Ready queue (${ctx.readyQueue.length}):`);
    for (const task of ctx.readyQueue.slice(0, 3)) {
      lines.push(`    ${task.displayId}: ${task.title} @${task.assignee}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format epic progression section
 */
export function formatEpicProgression(ctx: ProjectContext): string {
  const lines = ['EPIC PROGRESSION:'];

  // Previous epic (if exists)
  if (ctx.epicPrevious) {
    const gates = ctx.epicPrevious.gates.map(g =>
      `${g.type}${g.completed ? '✓' : ' '}`
    ).join(' ');
    const gateStr = gates ? ` [${gates}]` : '';
    lines.push(`  ✓ M${ctx.epicPrevious.number}: ${ctx.epicPrevious.title} (${ctx.epicPrevious.progress})${gateStr}`);
  }

  // Current epic
  const currentGates = ctx.epicCurrent.gates.map(g =>
    `${g.type}${g.completed ? '✓' : ' '}`
  ).join(' ');
  const currentGateStr = currentGates ? ` [${currentGates}]` : '';
  lines.push(`  > M${ctx.epicCurrent.number}: ${ctx.epicCurrent.title} (${ctx.epicCurrent.progress})${currentGateStr}`);

  // Next epics
  if (ctx.epicNext) {
    for (const ms of ctx.epicNext) {
      const gates = ms.gates.map(g =>
        `${g.type}${g.completed ? '✓' : ' '}`
      ).join(' ');
      const gateStr = gates ? ` [${gates}]` : '';
      lines.push(`    M${ms.number}: ${ms.title} (${ms.progress})${gateStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format project overview section
 */
export function formatProjectOverview(ctx: ProjectContext, store: StatusStore): string {
  const project = store.getProject();
  if (!project) return 'PROJECT OVERVIEW: No project';

  const lines = ['PROJECT OVERVIEW:'];
  lines.push(`  Name: ${project.name}`);

  if (project.goal) {
    lines.push(`  Goal: ${project.goal}`);
  }

  lines.push(`  Progress: ${ctx.overallProgress.pct}% (${ctx.overallProgress.done}/${ctx.overallProgress.total} tasks), ${ctx.overallProgress.msComplete}/${ctx.overallProgress.msTotal} epics complete`);

  // Active agents
  const tasks = store.listTasks();
  const activeTasks = tasks.filter(t => t.status === 'active');
  if (activeTasks.length > 0) {
    const agentNames = activeTasks
      .map(t => t.assignee?.replace(/^agent_/, '') || 'unassigned')
      .filter((v, i, a) => a.indexOf(v) === i);

    const agentStats = agentNames.map(name => {
      const agentActiveTasks = activeTasks.filter(t =>
        (t.assignee?.replace(/^agent_/, '') || 'unassigned') === name
      );
      const agentCompletedTasks = tasks.filter(t =>
        t.status === 'done' && (t.assignee?.replace(/^agent_/, '') || 'unassigned') === name
      );

      // Calculate average duration
      let avgDuration = '';
      if (agentCompletedTasks.length > 0) {
        const totalDuration = agentCompletedTasks.reduce((sum, t) => {
          const lastAttempt = t.attempts[t.attempts.length - 1];
          return sum + (lastAttempt?.duration_ms || 0);
        }, 0);
        const avgMs = totalDuration / agentCompletedTasks.length;
        avgDuration = `, avg ${formatDuration(avgMs)}`;
      }

      return `${name} (${agentActiveTasks.length} active, ${agentCompletedTasks.length} completed${avgDuration})`;
    }).join(', ');

    lines.push(`  Active agents: ${agentStats}`);
  }

  // Last activity
  const allEvents: Array<{ time: Date; desc: string }> = [];
  for (const task of tasks) {
    if (task.status_history) {
      for (const change of task.status_history) {
        const epics = store.listEpics();
        const ms = epics.find(m => m.id === task.epic_id);
        if (ms) {
          const displayId = getDisplayIdForTask(task, ms);
          allEvents.push({
            time: new Date(change.at),
            desc: `${displayId} ${change.to} by ${change.by.replace(/^agent_/, '')}`,
          });
        }
      }
    }
  }
  allEvents.sort((a, b) => b.time.getTime() - a.time.getTime());
  if (allEvents.length > 0) {
    const lastEvent = allEvents[0];
    lines.push(`  Last activity: ${formatRelativeTime(lastEvent.time.toISOString())} (${lastEvent.desc})`);
  }

  return lines.join('\n');
}
