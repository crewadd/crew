/**
 * CrewLogger — Pretty terminal output for crew run.
 *
 * Design goals:
 *  - Scannable: epic headers, indented task lines, clear status icons
 *  - Colorful: ANSI colors (respects NO_COLOR / non-TTY)
 *  - Concise: no redundant prefixes, metadata only when useful
 *  - Screenshot-worthy: clean enough for demos and marketing
 */

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, mkdirSync, appendFileSync, writeFileSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { formatDuration } from './status-helpers.ts';

/* ------------------------------------------------------------------ */
/*  ANSI helpers                                                       */
/* ------------------------------------------------------------------ */

const useColor = !process.env.NO_COLOR && process.stderr.isTTY;

function ansi(code: string, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

const c = {
  bold:    (s: string) => ansi('1', s),
  dim:     (s: string) => ansi('2', s),
  green:   (s: string) => ansi('32', s),
  red:     (s: string) => ansi('31', s),
  yellow:  (s: string) => ansi('33', s),
  cyan:    (s: string) => ansi('36', s),
  magenta: (s: string) => ansi('35', s),
  white:   (s: string) => ansi('37', s),
  boldGreen:  (s: string) => ansi('1;32', s),
  boldRed:    (s: string) => ansi('1;31', s),
  boldYellow: (s: string) => ansi('1;33', s),
  boldCyan:   (s: string) => ansi('1;36', s),
  boldWhite:  (s: string) => ansi('1;37', s),
};

/* ------------------------------------------------------------------ */
/*  Circled number digits (①–⑳, fallback to plain numbers)            */
/* ------------------------------------------------------------------ */

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.split(
  /(?=[\u2460-\u2473])/u,
);

// Split by Unicode circled number characters
function circled(n: number): string {
  // Each character is a single code point, split properly
  const chars = [
    '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
    '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
  ];
  return n >= 1 && n <= 20 ? chars[n - 1] : `(${n})`;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const icon = {
  done:    c.green('✔'),
  fail:    c.red('✘'),
  warn:    c.yellow('⚠'),
  retry:   c.yellow('↻'),
  run:     c.cyan('▸'),
  skip:    c.dim('–'),
  check:   c.green('✓'),
  cross:   c.red('✗'),
  info:    c.cyan('ℹ'),
  arrow:   c.dim('↳'),
};

/* ------------------------------------------------------------------ */
/*  Line width for separators                                          */
/* ------------------------------------------------------------------ */

const WIDTH = 48;

function rule(char = '─'): string {
  return c.dim(char.repeat(WIDTH));
}

/* ------------------------------------------------------------------ */
/*  ASCII Logo                                                         */
/* ------------------------------------------------------------------ */

/**
 * ASCII logo for "crew" in figlet-style font.
 *
 *  C = open bracket     R = vertical+bump+kick
 *  E = standard E       W = descending V shape   + = cross
 *  + = small plus floating top-right
 */
const LOGO_LINES = [
  '   ____   ____    _____  __          __    +',
  '  / ___| |  _ \\  | ____| \\ \\        / /  + + +',
  ' | |     | |_) | |  _|    \\ \\  /\\  / /     +',
  ' | |___  |  _ <  | |___    \\ \\/  \\/ /',
  '  \\____| |_| \\_\\ |_____|    \\__/\\__/',
];

/* ------------------------------------------------------------------ */
/*  System info gathering                                              */
/* ------------------------------------------------------------------ */

interface HeaderInfo {
  projectName: string;
  projectDir: string;
  goal?: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  pid: number;
  startedAt: string;
  crewVersion?: string;
  epicCount?: number;
  taskCount?: number;
  shell?: string;
  cwd: string;
}

function gatherHeaderInfo(projectDir?: string): HeaderInfo {
  const dir = projectDir || process.cwd();
  const folderName = dir.split('/').pop() || 'crew';

  // Read project.yaml for name/goal
  let projectName = folderName;
  let goal: string | undefined;
  let epicCount: number | undefined;
  let taskCount: number | undefined;

  try {
    // Try YAML project file
    const projectPath = join(dir, '.crew', 'project.yaml');
    if (existsSync(projectPath)) {
      const raw = readFileSync(projectPath, 'utf-8');
      const nameMatch = raw.match(/^name:\s*(.+)$/m);
      const goalMatch = raw.match(/^goal:\s*(.+)$/m);
      if (nameMatch) projectName = nameMatch[1].trim().replace(/^["']|["']$/g, '');
      if (goalMatch) goal = goalMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Best effort
  }

  // Count epics/tasks from filesystem
  try {
    const epicsDir = join(dir, '.crew', 'epics');
    if (existsSync(epicsDir)) {
      const epicDirs = readdirSync(epicsDir).filter(d => !d.startsWith('.'));
      epicCount = epicDirs.length;
      let total = 0;
      for (const epicDir of epicDirs) {
        const tasksDir = join(epicsDir, epicDir, 'tasks');
        if (existsSync(tasksDir)) {
          total += readdirSync(tasksDir).filter(d => !d.startsWith('.')).length;
        }
      }
      taskCount = total;
    }
  } catch {
    // Best effort
  }

  // Read crew version from package.json
  let crewVersion: string | undefined;
  try {
    // Walk up from this file to find the crew package.json
    const pkgPath = join(dir, 'node_modules', '@uirip', 'crew', 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      crewVersion = pkg.version;
    }
  } catch {
    // Best effort
  }

  const now = new Date();

  return {
    projectName,
    projectDir: dir,
    goal,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    arch: process.arch,
    pid: process.pid,
    startedAt: now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    crewVersion,
    epicCount,
    taskCount,
    shell: process.env.SHELL?.split('/').pop(),
    cwd: dir,
  };
}

/* ------------------------------------------------------------------ */
/*  CrewLogger                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Run tracker — collects task results for the summary report          */
/* ------------------------------------------------------------------ */

/** Metadata passed to taskStart for rich recording. */
export interface TaskMeta {
  skill?: string;
  attempt?: number;
  assignee?: string;
  skills?: string[];
  prompt?: string;
  type?: string;
  input?: string;
  output?: string;
  logDir?: string;
  epicNum?: number;
  epicTitle?: string;
}

type PhaseStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface PhaseRecord {
  name: string;
  group: 'pre' | 'main' | 'post';
  status: PhaseStatus;
  startedAt?: string;
  durationMs?: number;
}

interface TaskRecord {
  taskId: string;
  title: string;
  startedAt: string;
  durationMs?: number;
  outcome?: 'done' | 'failed' | 'cancelled';
  error?: string;
  retries: number;
  checks: { name: string; passed: boolean }[];
  yieldedCount: number;
  /** Rich metadata */
  assignee?: string;
  skills?: string[];
  prompt?: string;
  type?: string;
  input?: string;
  output?: string;
  logDir?: string;
  epicNum?: number;
  epicTitle?: string;
  phases: PhaseRecord[];
}

export interface RunSummary {
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  outcome: 'success' | 'failure' | 'cancelled';
  pid: number;
  mode?: string;
  startTaskId?: string;
  tasks: TaskRecord[];
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  totalRetries: number;
  warnings: string[];
  errors: string[];
  logFile?: string;
}

export class CrewLogger {
  private seq = 0;       // global task counter across the run
  private currentEpicNum = -1;
  private currentEpicTitle = '';
  private runLogPath: string | null = null;
  private _sessionDir: string | null = null;

  /* ── Run tracker state ───────────────────────────────────────── */
  private _runStart = Date.now();
  private _runStartIso = new Date().toISOString();
  private _taskRecords: TaskRecord[] = [];
  private _currentTask: TaskRecord | null = null;
  private _warnings: string[] = [];
  private _errors: string[] = [];
  private _mode: string | undefined;
  private _startTaskId: string | undefined;

  /**
   * Attach a JSONL run log — every logger call will also append a structured
   * entry to this file. Creates parent dirs if needed.
   */
  attachRunLog(filePath: string): void {
    mkdirSync(join(filePath, '..'), { recursive: true });
    this.runLogPath = filePath;
  }

  /**
   * Set the session directory for this run. When set, run logs are placed
   * under `<sessionDir>/logs/` and summaries are written to `<sessionDir>/`.
   */
  setSessionDir(sessionDir: string): void {
    this._sessionDir = sessionDir;

    // Create logs subdir and attach the JSONL run log inside it
    const logsDir = join(sessionDir, 'logs');
    mkdirSync(logsDir, { recursive: true });

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const logFile = join(logsDir, `${ts}-${process.pid}.jsonl`);
    this.runLogPath = logFile;
  }

  /** The session directory for this run (if any). */
  getSessionDir(): string | null {
    return this._sessionDir;
  }

  /** The path of the attached run log (if any). */
  getRunLogPath(): string | null {
    return this.runLogPath;
  }

  /** Append a structured JSONL entry to the run log (no-op if not attached). */
  private _jl(event: string, data?: Record<string, unknown>): void {
    if (!this.runLogPath) return;
    const entry = { ts: new Date().toISOString(), event, ...data };
    try {
      appendFileSync(this.runLogPath, JSON.stringify(entry) + '\n');
    } catch {
      // Best-effort — don't crash the run for a log write failure
    }
  }

  /** Print the full banner with ASCII logo and system info */
  header(projectNameOrDir?: string): void {
    const info = gatherHeaderInfo(projectNameOrDir);

    this._jl('header', {
      projectName: info.projectName,
      projectDir: info.projectDir,
      goal: info.goal,
      nodeVersion: info.nodeVersion,
      platform: info.platform,
      pid: info.pid,
      crewVersion: info.crewVersion,
      epicCount: info.epicCount,
      taskCount: info.taskCount,
    });

    const e = console.error.bind(console);
    e('');

    // Print logo lines with color
    for (const line of LOGO_LINES) {
      e(` ${c.boldCyan(line)}`);
    }

    e('');
    e(` ${c.boldWhite(info.projectName)}${info.crewVersion ? c.dim(` v${info.crewVersion}`) : ''}`);
    if (info.goal) {
      e(` ${c.dim(info.goal.length > 70 ? info.goal.slice(0, 67) + '...' : info.goal)}`);
    }

    e('');
    e(` ${c.dim('dir')}    ${info.cwd}`);
    e(` ${c.dim('node')}   ${info.nodeVersion}  ${c.dim('pid')} ${info.pid}  ${c.dim('os')} ${info.platform}`);
    if (info.shell) {
      e(` ${c.dim('shell')}  ${info.shell}`);
    }
    e(` ${c.dim('start')}  ${info.startedAt}`);

    if (info.epicCount !== undefined || info.taskCount !== undefined) {
      const parts: string[] = [];
      if (info.epicCount !== undefined) parts.push(`${info.epicCount} epic${info.epicCount !== 1 ? 's' : ''}`);
      if (info.taskCount !== undefined) parts.push(`${info.taskCount} task${info.taskCount !== 1 ? 's' : ''}`);
      e(` ${c.dim('plan')}   ${parts.join(' · ')}`);
    }

    e('');
    e(` ${rule()}`);
    e('');
  }

  /**
   * Starting-point section — shows where this run begins, progress, and mode.
   * Printed once, right after the banner, before any task output.
   */
  startSection(info: {
    /** The task we're starting from (e.g. "m1.3") */
    taskId: string;
    /** Human-readable title of the starting task */
    taskTitle: string;
    /** How many tasks are already done */
    doneTasks: number;
    /** Total number of tasks in the project */
    totalTasks: number;
    /** Current epic label, e.g. "M1" */
    epicLabel: string;
    /** Run mode description */
    mode: string;
    /** Optional: reason for starting here (e.g. "resumed from checkpoint") */
    reason?: string;
  }): void {
    this._jl('start_section', { ...info });
    this._mode = info.mode;
    this._startTaskId = info.taskId;

    const e = console.error.bind(console);
    const pct = info.totalTasks > 0 ? Math.round((info.doneTasks / info.totalTasks) * 100) : 0;

    e(` ${c.dim('from')}     ${c.boldWhite(info.taskId)} ${c.dim('—')} ${info.taskTitle}`);
    e(` ${c.dim('progress')} ${info.doneTasks}/${info.totalTasks} tasks done (${pct}%) ${c.dim('·')} ${info.epicLabel}`);
    e(` ${c.dim('mode')}     ${info.mode}`);
    if (info.reason) {
      e(` ${c.dim('reason')}   ${c.dim(info.reason)}`);
    }

    e('');
    e(` ${rule()}`);
    e('');
  }

  /** Epic section header — only printed when we move to a new epic */
  epicHeader(epicNum: number, title: string): void {
    if (epicNum === this.currentEpicNum) return;
    this.currentEpicNum = epicNum;
    this.currentEpicTitle = title;
    this._jl('epic_header', { epicNum, title });
    console.error('');
    console.error(` ${c.boldCyan(`M${epicNum}`)} ${c.dim('·')} ${c.bold(title)}`);
    console.error(` ${c.dim('─'.repeat(WIDTH))}`);
  }

  /** Task started — increments the global sequence */
  taskStart(taskId: string, title: string, meta?: TaskMeta): void {
    this.seq++;
    this._jl('task_start', {
      taskId, title, seq: this.seq,
      skill: meta?.skill, attempt: meta?.attempt,
      assignee: meta?.assignee, skills: meta?.skills,
      type: meta?.type,
      prompt: meta?.prompt?.slice(0, 120),
      input: meta?.input, output: meta?.output,
    });

    // Track task in run recorder
    const epicNum = meta?.epicNum ?? this.currentEpicNum;
    const epicTitle = meta?.epicTitle ?? this.currentEpicTitle;
    this._currentTask = {
      taskId,
      title,
      startedAt: new Date().toISOString(),
      retries: 0,
      checks: [],
      yieldedCount: 0,
      assignee: meta?.assignee,
      skills: meta?.skills,
      prompt: meta?.prompt,
      type: meta?.type,
      input: meta?.input,
      output: meta?.output,
      logDir: meta?.logDir,
      epicNum: epicNum > 0 ? epicNum : undefined,
      epicTitle: epicTitle || undefined,
      phases: [],
    };
    this._taskRecords.push(this._currentTask);
    const num = c.bold(circled(this.seq));
    const id = c.dim(`${taskId}`);
    console.error('');
    console.error(` ${num} ${c.bold(title)} ${id}`);

    // Metadata lines — compact key=value style
    const metaParts: string[] = [];
    if (meta?.type)     metaParts.push(`type=${meta.type}`);
    if (meta?.assignee) metaParts.push(`agent=${meta.assignee}`);
    if (meta?.skills && meta.skills.length > 0) {
      metaParts.push(`skills=${meta.skills.join(',')}`);
    } else if (meta?.skill) {
      metaParts.push(`skill=${meta.skill}`);
    }
    if (metaParts.length > 0) {
      console.error(`    ${icon.arrow} ${c.dim(metaParts.join('  '))}`);
    }
    if (meta?.prompt) {
      const short = meta.prompt.replace(/\n/g, ' ').slice(0, 80);
      console.error(`    ${icon.arrow} ${c.dim(short)}${meta.prompt.length > 80 ? c.dim('…') : ''}`);
    }
    if (meta?.input || meta?.output) {
      const ioParts: string[] = [];
      if (meta?.input) ioParts.push(`in=${meta.input}`);
      if (meta?.output) ioParts.push(`out=${meta.output}`);
      console.error(`    ${icon.arrow} ${c.dim(ioParts.join('  '))}`);
    }
    if (meta?.attempt && meta.attempt > 1) {
      console.error(`    ${icon.retry} ${c.yellow(`attempt ${meta.attempt}`)}`);
    }
  }

  /** Task completed */
  taskDone(taskId: string, durationMs: number, filesModified?: number): void {
    this.stopHeartbeat();
    this._jl('task_done', { taskId, durationMs, filesModified });
    if (this._currentTask) {
      this._currentTask.durationMs = durationMs;
      this._currentTask.outcome = 'done';
    }
    const parts = [c.green('done'), c.dim(formatDuration(durationMs))];
    if (filesModified !== undefined && filesModified > 0) {
      parts.push(c.dim(`${filesModified} file${filesModified !== 1 ? 's' : ''} modified`));
    }
    console.error(`    ${icon.done} ${parts.join(` ${c.dim('·')} `)}`);
  }

  /** Task failed */
  taskFailed(taskId: string, error?: string): void {
    this.stopHeartbeat();
    this._jl('task_failed', { taskId, error: error?.split('\n')[0]?.slice(0, 200) });
    const durationMs = this._currentTask
      ? Date.now() - new Date(this._currentTask.startedAt).getTime()
      : undefined;
    if (this._currentTask) {
      this._currentTask.outcome = 'failed';
      this._currentTask.error = error?.split('\n')[0]?.slice(0, 200);
      if (durationMs) this._currentTask.durationMs = durationMs;
    }
    const durStr = durationMs ? ` ${c.dim('·')} ${c.dim(formatDuration(durationMs))}` : '';
    console.error(`    ${icon.fail} ${c.red('failed')}${durStr}`);
    if (error) {
      // Show first line of error, truncated
      const firstLine = error.split('\n')[0].slice(0, 120);
      console.error(`    ${c.dim('│')} ${c.red(firstLine)}`);
    }
  }

  /** Task cancelled */
  taskCancelled(taskId: string, reason?: string): void {
    this.stopHeartbeat();
    this._jl('task_cancelled', { taskId, reason });
    if (this._currentTask) {
      this._currentTask.outcome = 'cancelled';
    }
    console.error(`    ${c.yellow('⊘')} ${c.yellow('cancelled')}${reason ? ` — ${c.dim(reason)}` : ''}`);
  }

  /** Task retry */
  taskRetry(taskId: string, attempt: number, reason: string): void {
    this._jl('task_retry', { taskId, attempt, reason: reason.split('\n')[0].slice(0, 200) });
    if (this._currentTask) {
      this._currentTask.retries++;
    }
    // Show compact reason (first line, truncated)
    const firstLine = reason.split('\n')[0].slice(0, 100);
    console.error(`    ${icon.retry} ${c.yellow(`retry → attempt ${attempt}`)}`);
    console.error(`    ${c.dim('│')} ${c.dim(firstLine)}`);
  }

  /** Check passed */
  checkPassed(name: string): void {
    this._jl('check_passed', { name });
    if (this._currentTask) this._currentTask.checks.push({ name, passed: true });
    console.error(`    ${icon.check} ${c.dim(`check: ${name}`)}`);
  }

  /** Check failed */
  checkFailed(name: string, summary: string): void {
    this._jl('check_failed', { name, summary: summary.split('\n')[0].slice(0, 200) });
    if (this._currentTask) this._currentTask.checks.push({ name, passed: false });
    console.error(`    ${icon.cross} ${c.red(`check: ${name}`)}`);
    // Show a concise version of the failure (first ~120 chars)
    const short = summary.split('\n')[0].slice(0, 120);
    console.error(`    ${c.dim('│')} ${short}`);
  }

  /** Check skipped / not found */
  checkSkipped(name: string): void {
    this._jl('check_skipped', { name });
    console.error(`    ${icon.skip} ${c.dim(`check: ${name} (not found, skipped)`)}`);
  }

  /** Log file path — always displayed so users can tail the output */
  logFile(path: string): void {
    this._jl('log_file', { path });
    if (this._currentTask && !this._currentTask.logDir) {
      // Store the parent dir as logDir
      this._currentTask.logDir = join(path, '..');
    }
    console.error(`    ${icon.arrow} log: ${c.dim(path)}`);
  }

  /** Yielded tasks */
  yieldedTasks(count: number): void {
    this._jl('yielded_tasks', { count });
    if (this._currentTask) this._currentTask.yieldedCount += count;
    console.error(`    ${icon.info} ${c.cyan(`${count} yielded task${count > 1 ? 's' : ''} queued`)}`);
  }

  /* ── Heartbeat — periodic status during long-running tasks ───── */

  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _heartbeatLogFile: string | null = null;
  private _heartbeatTaskId: string | null = null;
  private _heartbeatStart: number = 0;

  /**
   * Start a periodic heartbeat that prints elapsed time and the last
   * non-empty line from the agent log file. Keeps the terminal alive
   * so the task doesn't appear hung.
   */
  startHeartbeat(taskId: string, logFile: string, intervalMs = 60_000): void {
    this.stopHeartbeat();
    this._heartbeatLogFile = logFile;
    this._heartbeatTaskId = taskId;
    this._heartbeatStart = Date.now();

    this._heartbeatTimer = setInterval(() => {
      const elapsed = formatDuration(Date.now() - this._heartbeatStart);
      let lastLine = '';

      // Read the tail of the log file for a status hint
      try {
        const buf = Buffer.alloc(2048);
        const fd = openSync(this._heartbeatLogFile!, 'r');
        const stat = fstatSync(fd);
        const readFrom = Math.max(0, stat.size - 2048);
        const bytesRead = readSync(fd, buf, 0, 2048, readFrom);
        closeSync(fd);

        const tail = buf.slice(0, bytesRead).toString('utf-8');
        const lines = tail.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          lastLine = lines[lines.length - 1].trim();
          if (lastLine.length > 80) lastLine = lastLine.slice(0, 77) + '...';
        }
      } catch {
        // Log file may not exist yet or be empty
      }

      const hint = lastLine ? ` ${c.dim('·')} ${c.dim(lastLine)}` : '';
      console.error(`    ${c.dim('⏳')} ${c.dim(`still running`)} ${c.dim('·')} ${c.dim(elapsed)}${hint}`);
    }, intervalMs);

    // Don't let the heartbeat timer keep Node alive
    if (this._heartbeatTimer && typeof this._heartbeatTimer === 'object' && 'unref' in this._heartbeatTimer) {
      this._heartbeatTimer.unref();
    }
  }

  /** Stop the heartbeat timer */
  stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this._heartbeatLogFile = null;
    this._heartbeatTaskId = null;
  }

  /* ── Phase tracking ───────────────────────────────────────────── */

  /**
   * Record a phase transition for the current task.
   * Phases follow the pre → main → post lifecycle.
   */
  taskPhase(name: string, group: 'pre' | 'main' | 'post', status: PhaseStatus): void {
    this._jl('task_phase', { name, group, status, taskId: this._currentTask?.taskId });

    if (this._currentTask) {
      const existing = this._currentTask.phases.find(p => p.name === name && p.group === group);
      if (existing) {
        existing.status = status;
        if (status === 'done' || status === 'failed') {
          const startMs = existing.startedAt ? new Date(existing.startedAt).getTime() : 0;
          existing.durationMs = startMs ? Date.now() - startMs : undefined;
        }
      } else {
        this._currentTask.phases.push({
          name,
          group,
          status,
          startedAt: status === 'running' ? new Date().toISOString() : undefined,
        });
      }
    }

    const statusIcon = status === 'done' ? icon.check
      : status === 'failed' ? icon.cross
      : status === 'running' ? icon.run
      : status === 'skipped' ? icon.skip
      : c.dim('○');
    console.error(`    ${statusIcon} ${c.dim(`${group}:`)} ${name}`);
  }

  /* ── Status / intent messages ───────────────────────────────── */

  /** Status check result (replaces [crew] formatIntent(...)) */
  statusIntent(formatted: string): void {
    this._jl('status_intent', { formatted });
    console.error(` ${c.dim('▸')} ${formatted}`);
  }

  /** Generic info message */
  info(msg: string): void {
    this._jl('info', { msg });
    console.error(` ${icon.info} ${msg}`);
  }

  /** Warning */
  warn(msg: string): void {
    this._jl('warn', { msg });
    this._warnings.push(msg);
    console.error(` ${icon.warn} ${c.yellow(msg)}`);
  }

  /** Error */
  error(msg: string): void {
    this._jl('error', { msg });
    this._errors.push(msg);
    console.error(` ${icon.fail} ${c.red(msg)}`);
  }

  /* ── Loop / iteration chrome ────────────────────────────────── */

  /** Iteration divider in loop mode */
  iteration(n: number, elapsedMs: number): void {
    this._jl('iteration', { n, elapsedMs });
    const elapsed = formatDuration(elapsedMs);
    const done = this._taskRecords.filter(t => t.outcome === 'done').length;
    const progressNote = done > 0 ? ` ${c.dim('·')} ${c.green(`${done} done`)}` : '';
    console.error('');
    console.error(` ${c.dim('───')} ${c.bold(`#${n}`)} ${c.dim('·')} ${c.dim(elapsed)}${progressNote} ${c.dim('───')}`);
  }

  /** Next task announcement in loop */
  nextTask(taskId: string, title: string): void {
    this._jl('next_task', { taskId, title });
    console.error(` ${icon.run} ${c.bold('next')}: ${c.cyan(taskId)} ${c.dim('—')} ${title}`);
  }

  /* ── Footers ────────────────────────────────────────────────── */

  /** Summary footer at end of run */
  footer(taskCount: number, elapsedMs: number, outcome: 'success' | 'failure' | 'cancelled'): void {
    this._jl('footer', { taskCount, elapsedMs, outcome });
    const elapsed = formatDuration(elapsedMs);
    const e = console.error.bind(console);

    e('');
    e(` ${rule()}`);

    // ── Per-task breakdown ──
    if (this._taskRecords.length > 0) {
      e('');
      for (const t of this._taskRecords) {
        const statusIcon = t.outcome === 'done' ? icon.done
          : t.outcome === 'failed' ? icon.fail
          : t.outcome === 'cancelled' ? c.yellow('⊘')
          : c.dim('○');
        const dur = t.durationMs ? c.dim(formatDuration(t.durationMs)) : '';
        const title = t.title.length > 36 ? t.title.slice(0, 33) + '...' : t.title;
        const retryNote = t.retries > 0 ? c.yellow(` (${t.retries} retr${t.retries > 1 ? 'ies' : 'y'})`) : '';
        e(`   ${statusIcon} ${c.dim(t.taskId.padEnd(6))} ${title.padEnd(38)} ${dur}${retryNote}`);
      }
    }

    e('');

    // ── Aggregate stats ──
    const done = this._taskRecords.filter(t => t.outcome === 'done').length;
    const failed = this._taskRecords.filter(t => t.outcome === 'failed').length;
    const cancelled = this._taskRecords.filter(t => t.outcome === 'cancelled').length;
    const retries = this._taskRecords.reduce((s, t) => s + t.retries, 0);
    const total = this._taskRecords.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const parts: string[] = [];
    parts.push(`${c.green(`${done} done`)}/${total} (${pct}%)`);
    if (failed > 0) parts.push(c.red(`${failed} failed`));
    if (cancelled > 0) parts.push(c.yellow(`${cancelled} cancelled`));
    if (retries > 0) parts.push(c.yellow(`${retries} retr${retries > 1 ? 'ies' : 'y'}`));

    e(` ${c.dim('stats')}  ${parts.join(c.dim(' · '))}`);
    e(` ${c.dim('time')}   ${elapsed}`);

    e('');
    e(` ${rule()}`);

    // ── Outcome line ──
    if (outcome === 'success') {
      e(` ${icon.done} ${c.boldGreen('Run complete')}`);
    } else if (outcome === 'failure') {
      e(` ${icon.fail} ${c.boldRed('Run failed')}`);
    } else {
      e(` ${c.yellow('⊘')} ${c.boldYellow('Run cancelled')}`);
    }

    e('');
  }

  /** Target reached footer */
  targetReached(targetId: string, taskCount: number, elapsedMs: number): void {
    this._jl('target_reached', { targetId, taskCount, elapsedMs });
    const elapsed = formatDuration(elapsedMs);
    console.error('');
    console.error(` ${rule()}`);
    console.error(` ${icon.done} ${c.green(`target ${targetId} reached`)} ${c.dim('·')} ${taskCount} task${taskCount > 1 ? 's' : ''} ${c.dim('·')} ${c.dim(elapsed)}`);
    console.error('');
  }

  /* ── Shutdown messages ──────────────────────────────────────── */

  shutdown(): void {
    this._jl('shutdown');
    console.error('');
    console.error(` ${c.yellow('⊘')} ${c.yellow('shutting down gracefully...')}`);
  }

  checkpoint(resumeCmd: string): void {
    this._jl('checkpoint', { resumeCmd });
    console.error(` ${icon.info} checkpoint saved — resume with: ${c.cyan(resumeCmd)}`);
  }

  /**
   * Report a fatal/unhandled error.
   * Prints a crash banner, writes footer + summary, and returns the summary.
   * Safe to call even if no tasks were tracked (early crash).
   */
  fatal(error: unknown): RunSummary | null {
    const errMsg = error instanceof Error
      ? error.stack || error.message
      : String(error);
    const shortMsg = errMsg.split('\n')[0].slice(0, 200);

    this._jl('fatal', { error: shortMsg });
    this._errors.push(shortMsg);

    // Mark in-flight task as failed
    if (this._currentTask && !this._currentTask.outcome) {
      this._currentTask.outcome = 'failed';
      this._currentTask.error = shortMsg;
      this._currentTask.durationMs = Date.now() - new Date(this._currentTask.startedAt).getTime();
    }

    const e = console.error.bind(console);
    e('');
    e(` ${c.boldRed('FATAL')} ${c.red(shortMsg)}`);

    // Show stack (up to 6 lines) if available
    if (error instanceof Error && error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 7);
      for (const line of stackLines) {
        e(`   ${c.dim(line.trim())}`);
      }
    }

    // Print footer with whatever we have
    const elapsed = Date.now() - this._runStart;
    const completed = this._taskRecords.filter(t => t.outcome === 'done').length;
    this.footer(completed, elapsed, 'failure');

    return this.writeSummary('failure');
  }

  /* ── Summary report ──────────────────────────────────────────── */

  /**
   * Build the run summary from tracked state.
   * Called internally by writeSummary(); also useful for testing.
   */
  buildSummary(outcome: 'success' | 'failure' | 'cancelled'): RunSummary {
    const now = Date.now();
    return {
      startedAt: this._runStartIso,
      endedAt: new Date().toISOString(),
      elapsedMs: now - this._runStart,
      outcome,
      pid: process.pid,
      mode: this._mode,
      startTaskId: this._startTaskId,
      tasks: this._taskRecords,
      totalCompleted: this._taskRecords.filter(t => t.outcome === 'done').length,
      totalFailed: this._taskRecords.filter(t => t.outcome === 'failed').length,
      totalCancelled: this._taskRecords.filter(t => t.outcome === 'cancelled').length,
      totalRetries: this._taskRecords.reduce((sum, t) => sum + t.retries, 0),
      warnings: this._warnings,
      errors: this._errors,
      logFile: this.runLogPath ?? undefined,
    };
  }

  /**
   * Write the summary report.
   *
   * When a session directory is set, writes `summary.json` and `summary.txt`
   * directly into the session directory (`.crew/sessions/<id>/`).
   * Otherwise falls back to writing next to the JSONL run log.
   * Also appends a `summary` event to the JSONL log.
   */
  writeSummary(outcome: 'success' | 'failure' | 'cancelled'): RunSummary | null {
    const summary = this.buildSummary(outcome);
    this._jl('summary', summary as unknown as Record<string, unknown>);

    // Determine where to write summary files
    const summaryDir = this._sessionDir;
    const fallbackBase = this.runLogPath ? this.runLogPath.replace(/\.jsonl$/, '') : null;

    if (!summaryDir && !fallbackBase) return summary;

    const jsonPath = summaryDir ? join(summaryDir, 'summary.json') : `${fallbackBase}.summary.json`;
    const txtPath = summaryDir ? join(summaryDir, 'summary.txt') : `${fallbackBase}.summary.txt`;

    // ── JSON summary ──
    try {
      writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n');
    } catch { /* best effort */ }

    // ── Plain-text summary (summary.txt) ──
    try {
      const txt = this._buildSummaryText(summary);
      writeFileSync(txtPath, txt);
      console.error(` ${icon.info} summary: ${c.dim(txtPath)}`);
    } catch { /* best effort */ }

    // Print JSON location to stderr
    console.error(` ${icon.info} summary: ${c.dim(jsonPath)}`);

    return summary;
  }

  /**
   * Build a human-readable plain-text summary of the run.
   */
  private _buildSummaryText(summary: RunSummary): string {
    const lines: string[] = [];

    // ── Header ──
    lines.push('CREW RUN SUMMARY');
    lines.push('═'.repeat(48));
    lines.push('');
    lines.push(`Outcome:   ${summary.outcome.toUpperCase()}`);
    lines.push(`Started:   ${summary.startedAt}`);
    lines.push(`Ended:     ${summary.endedAt}`);
    lines.push(`Elapsed:   ${formatDuration(summary.elapsedMs)}`);
    if (summary.mode) lines.push(`Mode:      ${summary.mode}`);
    if (summary.startTaskId) lines.push(`From:      ${summary.startTaskId}`);
    lines.push(`PID:       ${summary.pid}`);
    lines.push('');

    // ── Task breakdown ──
    if (summary.tasks.length > 0) {
      lines.push('TASKS');
      lines.push('─'.repeat(48));

      let currentEpic = '';
      for (const t of summary.tasks) {
        // Epic sub-header
        const epicLabel = t.epicNum ? `M${t.epicNum}` : '';
        if (epicLabel && epicLabel !== currentEpic) {
          currentEpic = epicLabel;
          const epicTitle = t.epicTitle || '';
          lines.push('');
          lines.push(`  ${epicLabel} · ${epicTitle}`);
        }

        const statusChar = t.outcome === 'done' ? '✔'
          : t.outcome === 'failed' ? '✘'
          : t.outcome === 'cancelled' ? '⊘'
          : '○';
        const dur = t.durationMs ? formatDuration(t.durationMs) : '-';
        const retryNote = t.retries > 0 ? ` (${t.retries} retry)` : '';
        lines.push(`    ${statusChar} ${t.taskId.padEnd(6)} ${t.title.slice(0, 36).padEnd(38)} ${dur}${retryNote}`);

        // Show error for failed tasks
        if (t.outcome === 'failed' && t.error) {
          lines.push(`      └─ ${t.error.slice(0, 100)}`);
        }

        // Show failed checks
        const failedChecks = t.checks.filter(ch => !ch.passed);
        for (const ch of failedChecks) {
          lines.push(`      ✗ check: ${ch.name}`);
        }
      }
      lines.push('');
    }

    // ── Stats ──
    lines.push('STATS');
    lines.push('─'.repeat(48));
    lines.push(`  Completed:  ${summary.totalCompleted}/${summary.tasks.length}`);
    if (summary.totalFailed > 0) lines.push(`  Failed:     ${summary.totalFailed}`);
    if (summary.totalCancelled > 0) lines.push(`  Cancelled:  ${summary.totalCancelled}`);
    if (summary.totalRetries > 0) lines.push(`  Retries:    ${summary.totalRetries}`);
    lines.push(`  Duration:   ${formatDuration(summary.elapsedMs)}`);
    lines.push('');

    // ── Warnings / errors ──
    if (summary.warnings.length > 0) {
      lines.push('WARNINGS');
      lines.push('─'.repeat(48));
      for (const w of summary.warnings) lines.push(`  ⚠ ${w}`);
      lines.push('');
    }
    if (summary.errors.length > 0) {
      lines.push('ERRORS');
      lines.push('─'.repeat(48));
      for (const err of summary.errors) lines.push(`  ✘ ${err}`);
      lines.push('');
    }

    // ── Log file ──
    if (summary.logFile) {
      lines.push(`Log: ${summary.logFile}`);
    }

    lines.push('');
    return lines.join('\n');
  }
}

/** Singleton logger instance */
export const log = new CrewLogger();
