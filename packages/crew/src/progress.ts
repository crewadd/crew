import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { OrchestratorEvent } from './orchestrator/types.ts';

const PROGRESS_DIR = '.crew';
const PROGRESS_FILE = 'progress.jsonl';

export interface ProgressEntry {
  ts: string;
  event: string;
  [key: string]: unknown;
}

/**
 * ProgressLogger — append-only JSONL log for crash-safe progress tracking.
 *
 * Writes to `<appDir>/.crew/progress.jsonl`, one JSON object per line.
 * Uses `appendFileSync` so entries survive process crashes.
 */
export class ProgressLogger {
  readonly path: string;

  constructor(appDir: string) {
    const dir = join(appDir, PROGRESS_DIR);
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, PROGRESS_FILE);
  }

  /** Append a single entry to the JSONL file. */
  log(entry: Record<string, unknown>): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    appendFileSync(this.path, line + '\n');
  }

  /** Read all entries from the log file. Returns empty array if file doesn't exist. */
  readAll(): ProgressEntry[] {
    if (!existsSync(this.path)) return [];
    const content = readFileSync(this.path, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ProgressEntry);
  }

  /**
   * Map an OrchestratorEvent to a log entry and append it.
   * Skips `task:stream` (high volume, ephemeral).
   */
  logEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'project:start':
        this.log({ event: 'project:start', iteration: event.iteration });
        break;

      case 'project:planned':
        this.log({ event: 'project:planned', epicCount: event.epics.length });
        break;

      case 'project:verified':
        this.log({
          event: 'project:verified',
          passed: event.report.passed,
          issueCount: event.report.issues.length,
          iteration: event.iteration,
        });
        break;

      case 'project:fix':
        this.log({
          event: 'project:fix',
          epicCount: event.fixEpics.length,
          iteration: event.iteration,
        });
        break;

      case 'project:done':
        this.log({
          event: 'project:done',
          success: event.result.success,
          iterations: event.result.iterations,
          totalDurationMs: event.result.totalDurationMs,
        });
        break;

      case 'epic:start':
        this.log({
          event: 'epic:start',
          epicId: event.epicId,
          title: event.title,
          iteration: event.iteration,
        });
        break;

      case 'epic:verified':
        this.log({
          event: 'epic:verified',
          epicId: event.epicId,
          passed: event.report.passed,
          issueCount: event.report.issues.length,
          iteration: event.iteration,
        });
        break;

      case 'epic:fix':
        this.log({
          event: 'epic:fix',
          epicId: event.epicId,
          taskCount: event.fixTasks.length,
          iteration: event.iteration,
        });
        break;

      case 'epic:done':
        this.log({
          event: 'epic:done',
          epicId: event.epicId,
          success: event.result.success,
          iterations: event.result.iterations,
        });
        break;

      case 'task:start':
        this.log({
          event: 'task:start',
          taskId: event.taskId,
          epicId: event.epicId,
          attempt: event.attempt,
          ...(event.logFile ? { logFile: event.logFile } : {}),
        });
        break;

      case 'task:done':
        this.log({
          event: 'task:done',
          taskId: event.taskId,
          durationMs: event.result.durationMs,
        });
        break;

      case 'task:failed':
        this.log({
          event: 'task:failed',
          taskId: event.taskId,
          durationMs: event.result.durationMs,
          error: event.result.error,
        });
        break;

      case 'task:retry':
        this.log({
          event: 'task:retry',
          taskId: event.taskId,
          attempt: event.attempt,
          error: event.error,
        });
        break;

      case 'task:cancelled':
        this.log({
          event: 'task:cancelled',
          taskId: event.taskId,
          reason: event.reason,
        });
        break;

      case 'task:stream':
        // Skip — high volume, ephemeral
        break;
    }
  }
}
