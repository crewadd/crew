/**
 * Task Log Utilities — resolve log file paths for task executions.
 *
 * New structure:
 *   .crew/epics/<epic-slug>/tasks/<task-slug>/logs/attempt-<N>.log
 *
 * Each attempt gets its own log file (no more truncation on retry).
 * Falls back to flat `.crew/logs/<taskId>.log` when task dir is unavailable.
 */

import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FLAT_LOG_DIR = '.crew/logs';

/* ------------------------------------------------------------------ */
/*  Task directory resolution                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the task directory from a display ID (e.g. "m1.1") by scanning
 * the epics directory structure. This avoids importing the full store.
 */
export function resolveTaskDir(appDir: string, taskDisplayId: string): string | null {
  const match = taskDisplayId.match(/^m(\d+)\.(\d+)$/);
  if (!match) return null;

  const epicNum = parseInt(match[1], 10);
  const taskNum = parseInt(match[2], 10);

  const epicsDir = join(appDir, '.crew', 'epics');
  if (!existsSync(epicsDir)) return null;

  // Find epic directory matching the number prefix
  const epicPrefix = epicNum.toString().padStart(2, '0') + '-';
  let epicDir: string | null = null;
  try {
    for (const entry of readdirSync(epicsDir)) {
      if (entry.startsWith(epicPrefix)) {
        epicDir = join(epicsDir, entry);
        break;
      }
    }
  } catch {
    return null;
  }

  if (!epicDir) return null;

  // Find task directory matching the number prefix
  const tasksDir = join(epicDir, 'tasks');
  if (!existsSync(tasksDir)) return null;

  const taskPrefix = taskNum.toString().padStart(2, '0') + '-';
  try {
    for (const entry of readdirSync(tasksDir)) {
      if (entry.startsWith(taskPrefix)) {
        return join(tasksDir, entry);
      }
    }
  } catch {
    return null;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Log path resolution                                                */
/* ------------------------------------------------------------------ */

export interface TaskLogPaths {
  /** Directory where log files live */
  logDir: string;
  /** Full path to the attempt log file */
  logFile: string;
  /** Whether this is co-located with the task (true) or flat fallback (false) */
  colocated: boolean;
}

/**
 * Generate a timestamp string for log file names.
 * Format: YYYYMMDD-HHmmss (e.g., "20260308-061500")
 */
function logTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Resolve the log file path for a given task + attempt.
 *
 * Tries co-located path first:
 *   .crew/epics/<epic>/tasks/<task>/logs/<timestamp>-attempt-<N>.log
 *
 * Falls back to flat path:
 *   .crew/logs/<taskId>-<timestamp>-attempt-<N>.log
 *
 * Creates the log directory if it doesn't exist.
 */
export function resolveTaskLogPath(
  appDir: string,
  taskDisplayId: string,
  attempt: number,
): TaskLogPaths {
  const ts = logTimestamp();
  const taskDir = resolveTaskDir(appDir, taskDisplayId);

  if (taskDir) {
    const logDir = join(taskDir, 'logs');
    mkdirSync(logDir, { recursive: true });
    return {
      logDir,
      logFile: join(logDir, `${ts}-attempt-${attempt}.log`),
      colocated: true,
    };
  }

  // Fallback to flat log directory
  const logDir = join(appDir, FLAT_LOG_DIR);
  mkdirSync(logDir, { recursive: true });
  return {
    logDir,
    logFile: join(logDir, `${taskDisplayId}-${ts}-attempt-${attempt}.log`),
    colocated: false,
  };
}

/**
 * Count existing attempt logs for a task (useful for determining next attempt number).
 */
export function countAttemptLogs(appDir: string, taskDisplayId: string): number {
  const taskDir = resolveTaskDir(appDir, taskDisplayId);
  if (!taskDir) return 0;

  const logDir = join(taskDir, 'logs');
  if (!existsSync(logDir)) return 0;

  try {
    return readdirSync(logDir).filter(f => f.includes('-attempt-') && f.endsWith('.log')).length;
  } catch {
    return 0;
  }
}
