/**
 * Session Manager — tracks the active `crew run` session on disk.
 *
 * Writes `.crew/session.json` when a task starts running and updates it
 * throughout the lifecycle.  On clean exit the file is removed; on crash
 * it stays behind so the next invocation can detect the orphaned session
 * and recover deterministically (no stale-timeout heuristic needed).
 *
 * File format:
 * ```json
 * {
 *   "pid": 12345,
 *   "taskId": "m1.3",
 *   "taskTitle": "Build login page",
 *   "startedAt": "2026-03-07T10:00:00Z",
 *   "attempt": 1,
 *   "status": "running",
 *   "updatedAt": "2026-03-07T10:05:00Z",
 *   "checkpoint": { "lastEvent": "task:stream", "at": "..." }
 * }
 * ```
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const SESSION_FILE = 'session.json';
const CREW_DIR = '.crew';
const SESSIONS_DIR = 'sessions';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SessionStatus = 'running' | 'cancelled' | 'completed' | 'failed';

export interface SessionData {
  /** OS process ID of the `crew run` process */
  pid: number;
  /** Unique session ID (timestamp-based). Added in v2 — may be absent on older session files. */
  sessionId?: string;
  /** Task display ID (e.g. "m1.3") */
  taskId: string;
  /** Human-readable task title */
  taskTitle: string;
  /** ISO timestamp when the session started */
  startedAt: string;
  /** Current attempt number */
  attempt: number;
  /** Session status */
  status: SessionStatus;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Path to session directory (for session-scoped logs) */
  sessionDir?: string;
  /** Latest checkpoint info */
  checkpoint?: {
    lastEvent: string;
    at: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Session class                                                      */
/* ------------------------------------------------------------------ */

export class Session {
  readonly path: string;

  constructor(private readonly appDir: string) {
    const dir = join(appDir, CREW_DIR);
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, SESSION_FILE);
  }

  /* ── Write operations ───────────────────────────────────────── */

  /** Create a new session file and session directory. Overwrites any existing one. */
  start(taskId: string, taskTitle: string, attempt: number = 1): SessionData {
    const now = new Date().toISOString();
    const sessionId = generateSessionId();
    const sessionDir = join(this.appDir, CREW_DIR, SESSIONS_DIR, sessionId);
    mkdirSync(sessionDir, { recursive: true });

    const data: SessionData = {
      pid: process.pid,
      sessionId,
      taskId,
      taskTitle,
      startedAt: now,
      attempt,
      status: 'running',
      updatedAt: now,
      sessionDir,
    };
    this._write(data);

    // Write initial session metadata to the session directory
    writeFileSync(
      join(sessionDir, 'session.json'),
      JSON.stringify(data, null, 2) + '\n',
    );

    return data;
  }

  /** Record a checkpoint (latest event) without changing status. */
  checkpoint(eventType: string): void {
    const data = this.read();
    if (!data) return;
    const now = new Date().toISOString();
    data.updatedAt = now;
    data.checkpoint = { lastEvent: eventType, at: now };
    this._write(data);
  }

  /** Update attempt number (e.g. on retry). */
  setAttempt(attempt: number): void {
    const data = this.read();
    if (!data) return;
    data.attempt = attempt;
    data.updatedAt = new Date().toISOString();
    this._write(data);
  }

  /** Mark session as cancelled — file stays for next run to detect. */
  cancel(): void {
    this._setStatus('cancelled');
  }

  /** Mark session as completed and remove the file. */
  complete(): void {
    this._setStatus('completed');
    this._finalizeSessionDir();
    this._remove();
  }

  /** Mark session as failed — file stays for diagnostics. */
  fail(): void {
    this._setStatus('failed');
    this._finalizeSessionDir();
  }

  /** Remove the session file unconditionally. */
  clear(): void {
    this._remove();
  }

  /* ── Read operations ────────────────────────────────────────── */

  /** Read the current session data, or null if no session file exists. */
  read(): SessionData | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = readFileSync(this.path, 'utf-8');
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  /** Check whether a session file exists on disk. */
  exists(): boolean {
    return existsSync(this.path);
  }

  /**
   * Check if the PID recorded in the session is still alive.
   * Returns false if no session exists or the process is dead.
   */
  isProcessAlive(): boolean {
    const data = this.read();
    if (!data) return false;
    return isPidAlive(data.pid);
  }

  /**
   * Detect whether a previous session crashed (file exists, status is
   * "running", and the PID is no longer alive).
   */
  detectCrash(): SessionData | null {
    const data = this.read();
    if (!data) return null;
    if (data.status !== 'running') return null;
    if (isPidAlive(data.pid)) return null; // still running
    return data; // crashed — PID is dead but status is "running"
  }

  /**
   * Detect a cancelled session (file exists with status "cancelled").
   */
  detectCancelled(): SessionData | null {
    const data = this.read();
    if (!data) return null;
    if (data.status !== 'cancelled') return null;
    return data;
  }

  /**
   * Append a structured event to the session's events.jsonl file.
   * Only writes if a session directory exists (i.e., session has been started).
   */
  logEvent(entry: Record<string, unknown>): void {
    const data = this.read();
    if (!data?.sessionDir || !existsSync(data.sessionDir)) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    appendFileSync(join(data.sessionDir, 'events.jsonl'), line + '\n');
  }

  /** Get the current session directory path, or null if no session. */
  getSessionDir(): string | null {
    const data = this.read();
    return data?.sessionDir ?? null;
  }

  /* ── Private helpers ────────────────────────────────────────── */

  /** Write final session.json to session directory with terminal status. */
  private _finalizeSessionDir(): void {
    const data = this.read();
    if (!data?.sessionDir || !existsSync(data.sessionDir)) return;
    writeFileSync(
      join(data.sessionDir, 'session.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
  }

  private _write(data: SessionData): void {
    writeFileSync(this.path, JSON.stringify(data, null, 2) + '\n');
  }

  private _setStatus(status: SessionStatus): void {
    const data = this.read();
    if (!data) return;
    data.status = status;
    data.updatedAt = new Date().toISOString();
    this._write(data);
  }

  private _remove(): void {
    try {
      if (existsSync(this.path)) unlinkSync(this.path);
    } catch {
      // Best-effort removal
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate a unique session ID based on timestamp + PID.
 * Format: YYYYMMDD-HHmmss-<pid> (e.g., "20260308-061500-60775")
 */
function generateSessionId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6})/, '$1-$2');
  return `${ts}-${process.pid}`;
}

/** Check if a process with the given PID is still alive. */
function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 doesn't kill the process — it just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // ESRCH = No such process → dead
    // EPERM = Permission denied → alive but we can't signal it
    return err.code === 'EPERM';
  }
}
