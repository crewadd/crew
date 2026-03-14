/**
 * Log file I/O
 *
 * Append-only JSONL log files stored in `{taskDir}/events/NNN.jsonl`.
 * Each attempt is a separate file numbered 001, 002, etc.
 */

import {
  readFileSync, writeFileSync, appendFileSync,
  existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import type { LogEntry } from './types.ts';

const LOG_DIR = 'events';

function logDir(taskDir: string): string {
  return join(taskDir, LOG_DIR);
}

function attemptFile(taskDir: string, num: number): string {
  return join(logDir(taskDir), `${String(num).padStart(3, '0')}.jsonl`);
}

/**
 * List attempt numbers present in the log directory.
 * Returns sorted ascending: [1, 2, 3].
 */
export function listAttempts(taskDir: string): number[] {
  const dir = logDir(taskDir);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => parseInt(f.replace('.jsonl', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

/**
 * Get the current (latest) attempt number.
 * Returns 0 if no attempts exist.
 */
function currentAttempt(taskDir: string): number {
  const attempts = listAttempts(taskDir);
  return attempts.length > 0 ? attempts[attempts.length - 1] : 0;
}

/**
 * Start a new attempt, returning the new attempt number.
 */
export function startNewAttempt(taskDir: string): number {
  const next = currentAttempt(taskDir) + 1;
  const dir = logDir(taskDir);
  mkdirSync(dir, { recursive: true });
  // Create the empty file to reserve the attempt number
  writeFileSync(attemptFile(taskDir, next), '', 'utf-8');
  return next;
}

/**
 * Append a log entry to the current attempt file.
 * Creates events/ directory and 001.jsonl if no attempts exist yet.
 * Automatically adds the "t" (timestamp) field if missing.
 */
export function appendLog(taskDir: string, entry: Omit<LogEntry, 't'> & { t?: string }): void {
  let attempt = currentAttempt(taskDir);
  if (attempt === 0) {
    attempt = startNewAttempt(taskDir);
  }

  const fullEntry = {
    ...entry,
    t: entry.t || new Date().toISOString(),
  } as LogEntry;

  const line = JSON.stringify(fullEntry) + '\n';
  appendFileSync(attemptFile(taskDir, attempt), line, 'utf-8');
}

/**
 * Read all log entries from a specific attempt file.
 * Returns empty array for missing attempt.
 * Skips malformed lines gracefully.
 */
export function readAttempt(taskDir: string, num: number): LogEntry[] {
  const file = attemptFile(taskDir, num);
  if (!existsSync(file)) return [];

  const raw = readFileSync(file, 'utf-8');
  return raw
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is LogEntry => entry !== null);
}
