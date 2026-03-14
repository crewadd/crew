/**
 * Status Check - Smart intent resolution for `crew run next`
 *
 * Before blindly picking the next pending task, analyze the full project
 * state and return the best action. Detects:
 *
 *   - Stale active tasks (crashed process left a task as "active")
 *   - Failed tasks that should be retried before moving on
 *   - Failed tasks blocking downstream dependents
 *   - Deadlocked state (all remaining tasks blocked, no path forward)
 *   - Normal ready state (happy path)
 *   - Project complete
 */

import type { Task, Epic } from './store/types.ts';
import type { SessionData } from './session.ts';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type NextIntent =
  | { action: 'run'; task: ResolvedTask; reason: string }
  | { action: 'retry'; task: ResolvedTask; reason: string }
  | { action: 'reset_and_run'; stale: ResolvedTask; next: ResolvedTask; reason: string }
  | { action: 'block'; reason: string; details: BlockDetails }
  | { action: 'complete'; reason: string }
  | { action: 'empty'; reason: string }
  | { action: 'awaiting_review'; tasks: ResolvedTask[]; reason: string };

export interface ResolvedTask {
  id: string;
  displayId: string;
  title: string;
  status: Task['status'];
  epicNumber: number;
  epicTitle: string;
  failCount: number;
  /** Unmet dependencies (not done) — why this task is blocked */
  blockedBy?: { displayId: string; status: Task['status'] }[];
}

export interface BlockDetails {
  type: 'active_task' | 'all_failed' | 'deadlock' | 'failed_blocker';
  activeTasks?: ResolvedTask[];
  failedTasks?: ResolvedTask[];
  blockedTasks?: ResolvedTask[];
  /** For deadlock: the circular or unresolvable dependency chain */
  chain?: string[];
}

export interface StatusCheckOptions {
  /** Max time (ms) a task can be "active" before considered stale. Default: 5 min */
  staleThresholdMs?: number;
  /** Max failed attempts before skipping a task. Default: 3 */
  maxRetries?: number;
  /** Auto-reset stale tasks instead of blocking. Default: true */
  autoResetStale?: boolean;
}

const DEFAULTS: Required<StatusCheckOptions> = {
  staleThresholdMs: 5 * 60 * 1000,
  maxRetries: 3,
  autoResetStale: true,
};

/* ------------------------------------------------------------------ */
/*  Store interface (minimal surface for testability)                   */
/* ------------------------------------------------------------------ */

export interface StatusCheckStore {
  listEpics(): Epic[];
  listAllTasks(): Task[];
  getTask(id: string): Task | null;
  getNextReady(limit: number): Task[];
  getEpic(id: string): Epic | null;
  /** Session data from `.crew/session.json` (if present). */
  getSession?(): SessionData | null;
  /** Check if the PID from the session is still alive. */
  isSessionProcessAlive?(): boolean;
  /** Detect a crashed session (status=running, PID dead). */
  detectCrashedSession?(): SessionData | null;
  /** Detect a cancelled session (status=cancelled). */
  detectCancelledSession?(): SessionData | null;
}

/* ------------------------------------------------------------------ */
/*  Core logic                                                         */
/* ------------------------------------------------------------------ */

export function resolveNextIntent(
  store: StatusCheckStore,
  opts: StatusCheckOptions = {},
): NextIntent {
  const cfg = { ...DEFAULTS, ...opts };

  const epics = store.listEpics();
  const allTasks = store.listAllTasks();

  if (allTasks.length === 0) {
    return { action: 'empty', reason: 'No tasks in project. Run crew plan to create tasks.' };
  }

  const epicById = new Map(epics.map(e => [e.id, e]));
  const toResolved = (t: Task): ResolvedTask => {
    const epic = epicById.get(t.epic_id);
    const idx = epic ? epic.task_ids.indexOf(t.id) : -1;

    const blockedBy = t.dependencies.length > 0
      ? t.dependencies
          .map(depId => {
            const dep = store.getTask(depId);
            if (!dep || dep.status === 'done') return null;
            const depEpic = epicById.get(dep.epic_id);
            const depIdx = depEpic ? depEpic.task_ids.indexOf(dep.id) : -1;
            const depDisplayId = depEpic ? `m${depEpic.number}.${depIdx + 1}` : dep.id;
            // Status cannot be 'done' here because we filtered it out above
            return { displayId: depDisplayId, status: dep.status as Exclude<Task['status'], 'done'> };
          })
          .filter((x): x is { displayId: string; status: Exclude<Task['status'], 'done'> } => x !== null)
      : [];

    return {
      id: t.id,
      displayId: epic ? `m${epic.number}.${idx + 1}` : t.id,
      title: t.title,
      status: t.status,
      epicNumber: epic?.number ?? -1,
      epicTitle: epic?.title ?? '?',
      failCount: t.attempts.filter(a => a.success === false).length,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    };
  };

  const activeTasks = allTasks.filter(t => t.status === 'active');
  const cancelledTasks = allTasks.filter(t => t.status === 'cancelled');
  const failedTasks = allTasks.filter(t => t.status === 'failed');
  const pendingTasks = allTasks.filter(t => t.status === 'pending');
  const doneTasks = allTasks.filter(t => t.status === 'done');
  const awaitingReviewTasks = allTasks.filter(t => t.status === 'awaiting_review' as Task['status']);

  // ── 1. All done? ──────────────────────────────────────────────────
  if (doneTasks.length === allTasks.length) {
    return { action: 'complete', reason: `All ${allTasks.length} tasks completed.` };
  }

  // ── 1b. Cancelled tasks → auto-reset to pending and pick next ────
  // Cancelled tasks are from interrupted `crew run` sessions (Ctrl+C).
  // They should be automatically resumed on the next run.
  if (cancelledTasks.length > 0) {
    const ready = store.getNextReady(1);
    if (ready.length > 0) {
      return {
        action: 'reset_and_run',
        stale: toResolved(cancelledTasks[0]),
        next: toResolved(ready[0]),
        reason: `Task ${toResolved(cancelledTasks[0]).displayId} was cancelled. Resetting to pending and advancing.`,
      };
    }
    // No other ready tasks — retry the cancelled task itself
    return {
      action: 'retry',
      task: toResolved(cancelledTasks[0]),
      reason: `Task ${toResolved(cancelledTasks[0]).displayId} was cancelled. Resuming.`,
    };
  }

  // ── 2. Stale / crashed active tasks ──────────────────────────────
  if (activeTasks.length > 0) {
    const stale: Task[] = [];
    const legitimate: Task[] = [];

    // Prefer session-based detection: check if the owning process is alive
    const crashedSession = store.detectCrashedSession?.();
    if (crashedSession) {
      // Session file says "running" but PID is dead → deterministic crash
      const crashedTask = activeTasks.find(t => t.id === crashedSession.taskId);
      if (crashedTask) stale.push(crashedTask);
      // All other active tasks also lack a living process → stale
      for (const t of activeTasks) {
        if (t.id !== crashedSession.taskId) stale.push(t);
      }
    } else {
      // Fallback: time-based stale detection (no session file available)
      const now = Date.now();
      for (const t of activeTasks) {
        const startEvent = [...(t.status_history || [])].reverse().find(h => h.to === 'active');
        const startedAt = startEvent ? new Date(startEvent.at).getTime() : 0;

        // If session support is available and the process is alive, it's legitimate
        if (store.isSessionProcessAlive?.()) {
          legitimate.push(t);
        } else if (now - startedAt > cfg.staleThresholdMs) {
          stale.push(t);
        } else {
          legitimate.push(t);
        }
      }
    }

    // Legitimate active tasks → block, another process is working
    if (legitimate.length > 0) {
      return {
        action: 'block',
        reason: `${legitimate.length} task(s) currently active. Wait for completion or mark done/failed.`,
        details: {
          type: 'active_task',
          activeTasks: legitimate.map(toResolved),
        },
      };
    }

    // Stale / crashed tasks → auto-reset if configured, then continue resolution
    if (stale.length > 0 && cfg.autoResetStale) {
      // We don't mutate here — caller is responsible for the reset.
      // But we can still find the next ready task and return a compound intent.
      const staleSrc = crashedSession ? 'crashed (PID dead)' : `stale (no activity for ${Math.round(cfg.staleThresholdMs / 60000)}min)`;
      const ready = store.getNextReady(1);
      if (ready.length > 0) {
        return {
          action: 'reset_and_run',
          stale: toResolved(stale[0]),
          next: toResolved(ready[0]),
          reason: `Task ${toResolved(stale[0]).displayId} is ${staleSrc}. Resetting to pending and advancing.`,
        };
      }
      // No ready tasks after reset — might need the stale task itself retried
      return {
        action: 'retry',
        task: toResolved(stale[0]),
        reason: `Task ${toResolved(stale[0]).displayId} is ${staleSrc}. Resetting and retrying.`,
      };
    }

    // Stale but auto-reset disabled → block
    if (stale.length > 0) {
      return {
        action: 'block',
        reason: `${stale.length} stale active task(s) detected. Reset manually with crew task <id> reset.`,
        details: {
          type: 'active_task',
          activeTasks: stale.map(toResolved),
        },
      };
    }
  }

  // ── 3. Failed tasks that block dependents ─────────────────────────
  if (failedTasks.length > 0) {
    // Find failed tasks that have dependents still pending/blocked
    const failedBlockers = failedTasks.filter(ft =>
      ft.dependents.some(depId => {
        const dep = store.getTask(depId);
        return dep && (dep.status === 'pending' || dep.status === 'blocked');
      }),
    );

    // A failed task with retries left should be retried first
    const retryable = failedBlockers.find(ft => {
      const failCount = ft.attempts.filter(a => a.success === false).length;
      return failCount < cfg.maxRetries;
    });

    if (retryable) {
      return {
        action: 'retry',
        task: toResolved(retryable),
        reason: `Task ${toResolved(retryable).displayId} failed but has retries left (${toResolved(retryable).failCount}/${cfg.maxRetries}). Retrying before advancing.`,
      };
    }

    // Failed blockers with no retries → surface as a hard block
    if (failedBlockers.length > 0) {
      const blocked = allTasks.filter(
        t => (t.status === 'pending' || t.status === 'blocked') &&
             t.dependencies.some(d => failedTasks.some(f => f.id === d)),
      );

      // But if there are ready tasks on other paths, still proceed
      const ready = store.getNextReady(1);
      if (ready.length > 0) {
        return {
          action: 'run',
          task: toResolved(ready[0]),
          reason: `Skipping failed path (${failedBlockers.map(f => toResolved(f).displayId).join(', ')} failed). Continuing with next available task.`,
        };
      }

      return {
        action: 'block',
        reason: `${failedBlockers.length} failed task(s) blocking ${blocked.length} downstream task(s). No alternative path available.`,
        details: {
          type: 'failed_blocker',
          failedTasks: failedBlockers.map(toResolved),
          blockedTasks: blocked.map(toResolved),
        },
      };
    }
  }

  // ── 3b. Tasks awaiting review ────────────────────────────────────
  if (awaitingReviewTasks.length > 0) {
    // Check if there are other ready tasks not blocked by the review
    const ready = store.getNextReady(1);
    if (ready.length > 0) {
      // Continue with other work while reviews are pending
      const task = ready[0];
      const resolved = toResolved(task);
      const reviewIds = awaitingReviewTasks.map(t => toResolved(t).displayId).join(', ');
      return {
        action: 'run',
        task: resolved,
        reason: `Continuing with next task while ${awaitingReviewTasks.length} task(s) await review (${reviewIds}).`,
      };
    }

    // No other work — report awaiting review
    return {
      action: 'awaiting_review',
      tasks: awaitingReviewTasks.map(toResolved),
      reason: `${awaitingReviewTasks.length} task(s) awaiting review. No other tasks can proceed.`,
    };
  }

  // ── 4. Normal: pick next ready task ───────────────────────────────
  const ready = store.getNextReady(1);
  if (ready.length > 0) {
    const task = ready[0];
    const resolved = toResolved(task);

    // Enrich reason
    let reason = `Next ready task in M${resolved.epicNumber}: ${resolved.epicTitle}.`;
    if (failedTasks.length > 0) {
      reason += ` (${failedTasks.length} failed task(s) on other paths — skipped)`;
    }

    return {
      action: 'run',
      task: resolved,
      reason,
    };
  }

  // ── 5. Deadlock detection ─────────────────────────────────────────
  const remaining = allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  if (remaining.length > 0 && remaining.every(t => t.status === 'failed' || t.status === 'blocked' || t.status === 'pending')) {
    // All pending tasks have unmet deps → deadlock
    const pendingWithUnmetDeps = pendingTasks.filter(t =>
      t.dependencies.some(d => {
        const dep = store.getTask(d);
        return !dep || dep.status !== 'done';
      }),
    );

    if (pendingWithUnmetDeps.length === pendingTasks.length && pendingTasks.length > 0) {
      return {
        action: 'block',
        reason: `Deadlock: ${remaining.length} task(s) remain but none can proceed. All pending tasks have unmet dependencies.`,
        details: {
          type: 'deadlock',
          blockedTasks: remaining.map(toResolved),
          chain: pendingWithUnmetDeps.map(t => {
            const r = toResolved(t);
            const deps = r.blockedBy?.map(b => `${b.displayId}(${b.status})`).join(', ') ?? t.dependencies.join(', ');
            return `${r.displayId} → [${deps}]`;
          }),
        },
      };
    }

    // All remaining are failed
    if (remaining.every(t => t.status === 'failed')) {
      return {
        action: 'block',
        reason: `All ${remaining.length} remaining task(s) have failed. Review errors and retry or cancel.`,
        details: {
          type: 'all_failed',
          failedTasks: remaining.map(toResolved),
        },
      };
    }
  }

  // ── 6. Fallback ───────────────────────────────────────────────────
  return {
    action: 'block',
    reason: 'No actionable tasks found. Check task statuses and dependencies.',
    details: {
      type: 'deadlock',
      blockedTasks: allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').map(toResolved),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Formatted output (for CLI display)                                 */
/* ------------------------------------------------------------------ */

export function formatIntent(intent: NextIntent): string {
  const lines: string[] = [];

  switch (intent.action) {
    case 'run':
      lines.push(`NEXT: ${intent.task.displayId} — ${intent.task.title}`);
      lines.push(`  ↳ ${intent.reason}`);
      break;

    case 'retry':
      lines.push(`RETRY: ${intent.task.displayId} — ${intent.task.title} (attempt ${intent.task.failCount + 1})`);
      lines.push(`  ↳ ${intent.reason}`);
      break;

    case 'reset_and_run':
      lines.push(`RESET: ${intent.stale.displayId} — ${intent.stale.title} (stale, resetting to pending)`);
      lines.push(`NEXT:  ${intent.next.displayId} — ${intent.next.title}`);
      lines.push(`  ↳ ${intent.reason}`);
      break;

    case 'block':
      lines.push(`BLOCKED: ${intent.reason}`);
      if (intent.details.activeTasks?.length) {
        lines.push('  Active:');
        for (const t of intent.details.activeTasks) {
          lines.push(`    ${t.displayId}: ${t.title} [${t.status}]`);
        }
      }
      if (intent.details.failedTasks?.length) {
        lines.push('  Failed:');
        for (const t of intent.details.failedTasks) {
          lines.push(`    ${t.displayId}: ${t.title} (${t.failCount} attempts)`);
        }
      }
      if (intent.details.blockedTasks?.length) {
        lines.push(`  Blocked (${intent.details.blockedTasks.length}):`);
        for (const t of intent.details.blockedTasks) {
          lines.push(`    ${t.displayId}: ${t.title} [${t.status}]`);
          if (t.blockedBy?.length) {
            const depStr = t.blockedBy.map(b => `${b.displayId}(${b.status})`).join(', ');
            lines.push(`      ↳ waiting for: ${depStr}`);
          }
        }
      }
      if (intent.details.chain?.length) {
        lines.push('  Dependency chain:');
        for (const c of intent.details.chain) {
          lines.push(`    ${c}`);
        }
      }
      break;

    case 'awaiting_review':
      lines.push(`AWAITING REVIEW: ${intent.reason}`);
      for (const t of intent.tasks) {
        lines.push(`  ${t.displayId}: ${t.title}`);
        lines.push(`    ↳ Run: crew task ${t.displayId} review approve`);
        lines.push(`    ↳  Or: crew task ${t.displayId} review reject --reason "..."`);
      }
      break;

    case 'complete':
      lines.push(`COMPLETE: ${intent.reason}`);
      break;

    case 'empty':
      lines.push(`EMPTY: ${intent.reason}`);
      break;
  }

  return lines.join('\n');
}
