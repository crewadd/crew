/**
 * crew run - Execute tasks
 *
 * When run with `next` or `auto`, performs a status check phase first:
 *   - Detects stale active tasks (crashed process) and auto-resets them
 *   - Retries failed tasks that block downstream work
 *   - Surfaces deadlocks and hard blockers with actionable messages
 *   - Falls through to normal next-task selection on happy path
 */

import { join } from 'node:path';
import { createBuildContext, nextTasks, statusJson, editTask, addTask } from '../manager/index.ts';
import { executeBatchStreaming } from '../executor/index.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../orchestrator/types.ts';
import type { OrchestratorConfig, OrchestratorEvent } from '../orchestrator/types.ts';
import type { CompoundTask } from '../types.ts';
import { ProgressLogger } from '../progress.ts';
import { Session } from '../session.ts';
import { validateProjectDir } from './utils.ts';
import { loadConfig } from '../config-loader.ts';
import { resolveNextIntent, formatIntent, type StatusCheckStore } from '../status-check.ts';
import { HierarchicalStore } from '../store/hierarchical-store.ts';
import type { BuildContext } from '../manager/types.ts';
import { formatDuration } from './status-helpers.ts';
import { log } from './logger.ts';

const KNOWN_COMMANDS = ['status', 'plan', 'task', 'epic', 'sync', 'tree', 'verify', 'init', 'search', 'next', 'auto'];

/** Generate a timestamped JSONL run-log path under `.crew/sessions/logs/`. */
function runLogPath(appDir: string): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return join(appDir, '.crew', 'sessions', 'logs', `${ts}-${process.pid}.jsonl`);
}

/** Levenshtein distance for typo detection */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Return a suggested command if the input looks like a typo of a known one */
function suggestCommand(input: string): string | null {
  const lower = input.toLowerCase();
  // Exact match
  if (KNOWN_COMMANDS.includes(lower)) return lower;
  // Fuzzy match within edit distance 2
  for (const cmd of KNOWN_COMMANDS) {
    if (levenshtein(lower, cmd) <= 2) return cmd;
  }
  return null;
}

/**
 * Topological sort of all transitive dependencies for a task (excluding the target itself).
 * Returns task IDs in run order (deps first).
 */
function buildDepChain(targetId: string, allTasks: Map<string, CompoundTask>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function dfs(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const task = allTasks.get(id);
    if (!task) return;
    for (const depId of task.deps ?? []) dfs(depId);
    if (id !== targetId) result.push(id);
  }

  dfs(targetId);
  return result;
}

/** Extract epic number from a task display ID like "m2.4" */
function epicNumFromTaskId(taskId: string): number {
  const m = taskId.match(/^m(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

/** Resolve epic title from status JSON for a given epic number */
async function resolveEpicTitle(ctx: BuildContext, epicNum: number): Promise<string | undefined> {
  const st = await statusJson(ctx);
  const epic = st.epics.find(e => e.id === epicNum);
  return epic?.title;
}

/**
 * Handle yielded tasks event - persist spawned tasks to epic
 * Returns array of created task IDs
 */
async function handleYieldedTasks(
  event: Extract<OrchestratorEvent, { type: 'task:yielded' }>,
  mgr: BuildContext,
  session: Session
): Promise<string[]> {
  const { spawnedTasks, epicId } = event;
  const createdTaskIds: string[] = [];

  if (!spawnedTasks || spawnedTasks.length === 0) {
    return createdTaskIds;
  }

  log.info(`Persisting ${spawnedTasks.length} yielded task(s) to epic ${epicId}`);

  for (const spawned of spawnedTasks) {
    const { task: taskDef, target } = spawned;

    // Determine target epic number
    let targetEpicNum: number;

    if (target === 'current-epic') {
      targetEpicNum = epicId;
    } else if (target === 'next-epic') {
      targetEpicNum = epicId + 1;
    } else {
      // target is { epic: string } - parse epic number from string like "m2" or "epic_xyz"
      const epicStr = typeof target === 'object' ? target.epic : target;
      const match = epicStr.match(/^m?(\d+)$/);
      if (match) {
        targetEpicNum = parseInt(match[1], 10);
      } else {
        log.warn(`Cannot parse epic number from "${epicStr}", defaulting to current epic`);
        targetEpicNum = epicId;
      }
    }

    try {
      // Add task to epic using manager API
      const newTaskId = await addTask(
        mgr,
        taskDef.title,
        {
          epic: targetEpicNum,
          type: taskDef.type,
          input: taskDef.input,
          output: taskDef.output,
          deps: taskDef.deps,
          prompt: taskDef.prompt,
          skills: taskDef.skill ? [taskDef.skill] : undefined,
        }
      );

      createdTaskIds.push(newTaskId);
      log.info(`Created task ${newTaskId}: ${taskDef.title}`);
      session.logEvent({
        event: 'task:spawned',
        taskId: newTaskId,
        parentTaskId: spawned.parentTaskId,
        epicNum: targetEpicNum
      });
    } catch (err) {
      log.error(`Failed to create task "${taskDef.title}": ${err}`);
    }
  }

  return createdTaskIds;
}

/**
 * Run task execution command
 */
export async function runTask(
  projectDir: string,
  taskIdOrNext: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  // ── --from mode: reset target + dependents, then loop ──────────
  const fromTask = flags.from && typeof flags.from === 'string' ? flags.from as string : undefined;
  if (fromTask) {
    const store = new HierarchicalStore(absDir);
    const { resetTask } = await import('./reset-cmd.ts');
    try {
      await resetTask(store, fromTask, { deps: true, yes: true });
    } catch (err) {
      log.error(`Failed to reset from ${fromTask}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    // Clean up any stale session
    const session = new Session(absDir);
    session.clear();
    // Enter loop — it will naturally pick up the reset task next
    const untilTask = flags.until && typeof flags.until === 'string' ? flags.until as string : undefined;
    await runTaskLoop(absDir, { until: untilTask });
    return;
  }

  // Bare `crew run` (no arg) = autopilot loop
  const isLoopMode = !taskIdOrNext || flags.loop === true;
  const untilTask = flags.until && typeof flags.until === 'string' ? flags.until as string : undefined;
  const withDeps = flags.deps === true;

  // Pure loop / until mode (no --deps): existing behavior
  if (!withDeps && (isLoopMode || untilTask)) {
    await runTaskLoop(absDir, { until: untilTask });
    return;
  }

  // bare `crew run --deps` with no target makes no sense — just loop normally
  if (withDeps && isLoopMode && !untilTask) {
    await runTaskLoop(absDir);
    return;
  }

  const ctx = createBuildContext(absDir);

  // Load orchestrator config from crew.json (merge with defaults)
  const loaded = await loadConfig(absDir);
  const orchestratorOverrides = (loaded?.config as any)?.orchestrator ?? {};
  const config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...orchestratorOverrides };

  // Resolve target task
  let task: CompoundTask | undefined;

  if (taskIdOrNext === 'auto' || taskIdOrNext === 'next') {
    // ── Status Check Phase ──────────────────────────────────────
    // Analyze full project state before picking the next task.
    const store = new HierarchicalStore(absDir);
    const sessionObj = new Session(absDir);
    const storeAdapter: StatusCheckStore = {
      listEpics: () => store.listEpics(),
      listAllTasks: () => store.listAllTasks(),
      getTask: (id: string) => store.getTask(id as import('../store/types.ts').TaskId),
      getNextReady: (limit: number) => store.getNextReady(limit),
      getEpic: (id: string) => store.getEpic(id),
      getSession: () => sessionObj.read(),
      isSessionProcessAlive: () => sessionObj.isProcessAlive(),
      detectCrashedSession: () => sessionObj.detectCrash(),
      detectCancelledSession: () => sessionObj.detectCancelled(),
    };

    const statusCheckOpts = (loaded?.config as any)?.statusCheck ?? {};
    const intent = resolveNextIntent(storeAdapter, statusCheckOpts);

    log.statusIntent(formatIntent(intent));

    let result: Awaited<ReturnType<typeof nextTasks>> | undefined;

    switch (intent.action) {
      case 'run': {
        // Happy path — resolve task from the store
        result = await nextTasks(ctx);
        const nextVal = result.next;
        if (Array.isArray(nextVal)) {
          task = nextVal[0];
        } else if (nextVal && typeof nextVal === 'object' && 'id' in nextVal) {
          task = nextVal as CompoundTask;
        }
        break;
      }

      case 'retry': {
        // Retry a failed/cancelled task — reset it to pending first, then run it
        const failedTask = store.getTask(intent.task.id);
        if (failedTask) {
          store.updateTaskStatus(failedTask, 'pending', 'crew');
          log.info(`Reset ${intent.task.displayId} to pending for retry`);
        }
        // Clean up leftover session file from crashed/cancelled run
        sessionObj.clear();
        // Re-resolve after reset
        result = await nextTasks(ctx);
        const nextVal = result.next;
        if (Array.isArray(nextVal)) {
          task = nextVal[0];
        } else if (nextVal && typeof nextVal === 'object' && 'id' in nextVal) {
          task = nextVal as CompoundTask;
        }
        break;
      }

      case 'reset_and_run': {
        // Reset stale task, then pick the recommended next
        const staleTask = store.getTask(intent.stale.id as import('../store/types.ts').TaskId);
        if (staleTask) {
          store.updateTaskStatus(staleTask, 'pending', 'crew');
          log.info(`Reset stale task ${intent.stale.displayId} to pending`);
        }
        // Clean up leftover session file from crashed/cancelled run
        sessionObj.clear();
        const result = await nextTasks(ctx);
        const nextVal = result.next;
        if (Array.isArray(nextVal)) {
          task = nextVal[0];
        } else if (nextVal && typeof nextVal === 'object' && 'id' in nextVal) {
          task = nextVal as CompoundTask;
        }
        break;
      }

      case 'awaiting_review':
        // Tasks are waiting for review — exit without error but don't run anything
        process.exit(0);
        break;

      case 'block':
      case 'empty':
        if (flags.ai) {
          log.info('Analyzing blocked situation with AI...');
          const { runAiDiagnose } = await import('./ai-unblock.ts');
          try {
            await runAiDiagnose(intent, store, absDir);
          } catch (err) {
            log.error(`AI diagnostic failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        process.exit(1);
        break;

      case 'complete':
        process.exit(0);
        break;
    }

    if (!task) {
      // Check if blocked by a failed task in a previous/current epic
      if (result?.blockedByFailure) {
        const { epicNum, epicTitle, failedTasks } = result.blockedByFailure;
        log.error(`Epic M${epicNum} (${epicTitle}) is locked — has failed tasks: ${failedTasks.join(', ')}`);
        log.info(`Resolve the failed task(s) before running next. Use: crew run ${failedTasks[0]}`);
        process.exit(1);
      }
      log.error('No pending tasks found');
      process.exit(1);
    }
  } else if (withDeps && isLoopMode && untilTask) {
    // `crew run --until m2.9 --deps`: target is the until task
    const st = await statusJson(ctx);
    for (const epic of st.epics) {
      task = epic.tasks.find((t) => t.id === untilTask);
      if (task) break;
    }
    if (!task) {
      log.error(`Task not found: ${untilTask}`);
      process.exit(1);
    }
  } else {
    const st = await statusJson(ctx);
    for (const epic of st.epics) {
      task = epic.tasks.find((t) => t.id === taskIdOrNext);
      if (task) break;
    }
    if (!task) {
      const suggestion = suggestCommand(taskIdOrNext);
      if (suggestion) {
        log.error(`Task not found: ${taskIdOrNext}`);
        log.info(`Did you mean: crew ${suggestion}?`);
      } else {
        log.error(`Task not found: ${taskIdOrNext}`);
      }
      process.exit(1);
    }
  }

  // ── Deps mode: build dep chain and run via loop ──────────────
  if (withDeps) {
    const st = await statusJson(ctx);
    const allTasks = new Map<string, CompoundTask>();
    for (const epic of st.epics) for (const t of epic.tasks) allTasks.set(t.id, t);

    const depIds = buildDepChain(task!.id, allTasks);
    const queue = [...depIds, task!.id].filter(id => allTasks.get(id)?.status !== 'done');

    if (queue.length === 0) {
      log.info('All deps and target already done');
      process.exit(0);
    }

    log.info(`Running ${queue.length} task(s) in order: ${queue.join(' → ')}`);
    await runTaskLoop(absDir, { queue, until: task!.id });
    return;
  }

  const taskTitle = task.title || (task as unknown as Record<string, string>).task;
  const startTime = Date.now();

  const progressLogger = new ProgressLogger(absDir);
  const session = new Session(absDir);

  // ── Session lifecycle: start ────────────────────────────────
  const sessionData = session.start(task.id, taskTitle);
  progressLogger.log({ event: 'session:start', pid: process.pid, singleTask: task.id });

  // Attach run log inside the session directory (.crew/sessions/<id>/logs/)
  if (sessionData.sessionDir) {
    log.setSessionDir(sessionData.sessionDir);
  } else {
    log.attachRunLog(runLogPath(absDir));
  }

  // Print header
  log.header(absDir);

  // Print starting-point section
  const epicNum = epicNumFromTaskId(task.id);
  {
    const st = await statusJson(ctx);
    const allTasksFlat = st.epics.flatMap(e => e.tasks);
    const doneCount = allTasksFlat.filter(t => t.status === 'done').length;
    const epicTitle = st.epics.find(e => e.id === epicNum)?.title ?? '';
    const mode = withDeps ? 'single task + deps' : 'single task';

    log.startSection({
      taskId: task.id,
      taskTitle,
      doneTasks: doneCount,
      totalTasks: allTasksFlat.length,
      epicLabel: epicNum > 0 ? `M${epicNum}` : '',
      mode,
    });
  }

  // Print epic header for this task
  if (epicNum > 0) {
    const epicTitle = await resolveEpicTitle(ctx, epicNum);
    if (epicTitle) log.epicHeader(epicNum, epicTitle);
  }

  // Print task start
  log.taskStart(task.id, taskTitle, {
    assignee: task.assignee,
    skills: task.skills,
    prompt: task.prompt,
    type: task.type,
    input: task.input,
    output: task.output,
  });

  // ── Abort controller for graceful cancellation ──────────────
  const ac = new AbortController();
  let cancelled = false;
  let cleanupDone = false;

  const cleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;

    cancelled = true;
    log.stopHeartbeat();
    log.shutdown();
    ac.abort();

    // Mark task as cancelled in the store so it can be resumed
    try {
      const store = new HierarchicalStore(absDir);
      const storeTask = store.getTask(task.id);
      if (storeTask && storeTask.status === 'active') {
        store.updateTaskStatus(storeTask, 'cancelled', 'crew');
      }
    } catch (err) {
      // Fallback: use editTask from manager (works with display IDs like m1.1)
      try {
        editTask(ctx, task.id, 'cancelled');
      } catch {
        log.warn('Could not update task status');
      }
    }

    // Update session file → cancelled (stays on disk for next run to detect)
    session.cancel();

    // Log cancellation checkpoint
    progressLogger.logEvent({ type: 'task:cancelled', taskId: task.id, reason: 'User cancelled (SIGINT)' });
    progressLogger.log({ event: 'session:end', reason: 'cancelled' });

    log.taskCancelled(task.id);
    log.checkpoint(`crew run ${task.id}`);
  };

  // Register signal handlers
  const onSignal = () => {
    cleanup();
    // Give a moment for sync I/O to flush, then exit
    setTimeout(() => process.exit(130), 100);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let success = false;
  const checksOnly = flags.checks === true;
  let resumeSessionId: string | undefined = undefined;

  // Handle --resume flag
  if (flags.resume !== undefined) {
    if (typeof flags.resume === 'string' && flags.resume) {
      // Explicit session ID provided: crew run m3.2 --resume <session-id>
      resumeSessionId = flags.resume;
      log.info(`Resuming from session: ${resumeSessionId}`);
    } else if (flags.resume === true) {
      // No session ID provided: crew run m3.2 --resume
      // Try to find the last session for this task from the session manager
      const session = new Session(absDir);
      const sessionData = session.read();
      if (sessionData && sessionData.taskId === task.id && sessionData.sessionId) {
        resumeSessionId = sessionData.sessionId;
        log.info(`Resuming from last session: ${resumeSessionId} (task ${task.id})`);
      } else {
        log.warn(`No previous session found for task ${task.id}, starting fresh`);
      }
    }
  }

  if (checksOnly) {
    log.info('Running in checks-only mode (--checks flag)');
  }

  try {
    for await (const event of executeBatchStreaming(ctx, [task], config, ac.signal, checksOnly, resumeSessionId)) {
      progressLogger.logEvent(event);

      // Update session checkpoint for crash detection
      if (event.type !== 'task:stream') {
        session.checkpoint(event.type);
      }

      // Write event to session-scoped log
      if (event.type !== 'task:stream') {
        session.logEvent({ event: event.type, taskId: 'taskId' in event ? event.taskId : undefined });
      }

      switch (event.type) {
        case 'task:start':
          session.setAttempt(event.attempt);
          if (event.logFile) {
            log.logFile(event.logFile);
            log.startHeartbeat(event.taskId, event.logFile);
          }
          break;
        case 'task:stream':
          break;
        case 'task:retry':
          log.taskRetry(event.taskId, event.attempt, event.error);
          break;
        case 'task:done':
          log.taskDone(event.taskId, event.result.durationMs);

          // Handle yielded tasks from task result
          if (event.result.spawnedTasks && event.result.spawnedTasks.length > 0) {
            // Extract epic number from task ID (e.g., "m2.4" -> 2)
            const epicId = epicNumFromTaskId(event.taskId) || 1;

            const createdTaskIds = await handleYieldedTasks(
              {
                type: 'task:yielded',
                taskId: event.taskId,
                spawnedTasks: event.result.spawnedTasks,
                epicId,
              },
              ctx,
              session
            );

            if (createdTaskIds.length > 0) {
              log.yieldedTasks(createdTaskIds.length);
            }
          }

          success = true;
          break;
        case 'task:failed':
          log.taskFailed(event.taskId, event.result.error);
          break;
        case 'task:cancelled':
          log.taskCancelled(event.taskId, event.reason);
          break;
      }
    }
  } finally {
    // Remove signal handlers to avoid double-cleanup
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);

    if (!cancelled) {
      progressLogger.log({ event: 'session:end', reason: success ? 'completed' : 'error' });

      // Session lifecycle: terminal state
      if (success) {
        session.complete(); // removes session file
      } else {
        session.fail(); // keeps file for diagnostics
      }
    }
  }

  // Print footer + summary report
  const outcome = cancelled ? 'cancelled' : success ? 'success' : 'failure';
  log.footer(success ? 1 : 0, Date.now() - startTime, outcome);
  log.writeSummary(outcome);

  if (cancelled) process.exit(130);
  if (!success) process.exit(1);
}

/**
 * Run tasks in a loop until completion, failure, or target task
 */
async function runTaskLoop(
  projectDir: string,
  opts: { until?: string; queue?: string[] } = {},
): Promise<void> {
  const { until, queue } = opts;
  const absDir = validateProjectDir(projectDir);

  let iteration = 0;
  let lastTaskId: string | undefined;
  let completedCount = 0;
  const loopStartTime = Date.now();
  const yieldedTasksQueue: string[] = queue ? [...queue] : [];  // FIFO queue; pre-seeded for --deps

  // Load config once for the loop
  const loaded = await loadConfig(absDir);

  // Create a session for the loop run and attach logs inside it
  const loopSession = new Session(absDir);
  const loopSessionData = loopSession.start('loop', until ? `loop · until ${until}` : 'loop');
  if (loopSessionData.sessionDir) {
    log.setSessionDir(loopSessionData.sessionDir);
  } else {
    log.attachRunLog(runLogPath(absDir));
  }

  // Print header
  log.header(absDir);

  // Print starting-point section — resolve the first task for display
  {
    const ctx = createBuildContext(absDir);
    const st = await statusJson(ctx);
    const allTasksFlat = st.epics.flatMap(e => e.tasks);
    const doneCount = allTasksFlat.filter(t => t.status === 'done').length;

    // Find the first non-done task as the starting point
    let startTaskId = '';
    let startTaskTitle = '';
    let startEpicNum = 0;

    // Use yielded queue head if available, otherwise use status check
    if (queue && queue.length > 0) {
      for (const epic of st.epics) {
        const found = epic.tasks.find(t => t.id === queue[0]);
        if (found) {
          startTaskId = found.id;
          startTaskTitle = found.title || (found as unknown as Record<string, string>).task || '';
          startEpicNum = epicNumFromTaskId(found.id);
          break;
        }
      }
    }

    if (!startTaskId) {
      // Resolve via status check
      const preStore = new HierarchicalStore(absDir);
      const preSession = new Session(absDir);
      const preAdapter: StatusCheckStore = {
        listEpics: () => preStore.listEpics(),
        listAllTasks: () => preStore.listAllTasks(),
        getTask: (id: string) => preStore.getTask(id as import('../store/types.ts').TaskId),
        getNextReady: (limit: number) => preStore.getNextReady(limit),
        getEpic: (id: string) => preStore.getEpic(id),
        getSession: () => preSession.read(),
        isSessionProcessAlive: () => preSession.isProcessAlive(),
        detectCrashedSession: () => preSession.detectCrash(),
        detectCancelledSession: () => preSession.detectCancelled(),
      };
      const preIntent = resolveNextIntent(preAdapter, (loaded?.config as any)?.statusCheck ?? {});

      if (preIntent.action === 'run' || preIntent.action === 'retry') {
        startTaskId = preIntent.task.displayId;
        startTaskTitle = preIntent.task.title;
        startEpicNum = preIntent.task.epicNumber;
      } else if (preIntent.action === 'reset_and_run') {
        startTaskId = preIntent.next.displayId;
        startTaskTitle = preIntent.next.title;
        startEpicNum = preIntent.next.epicNumber;
      }
    }

    if (startTaskId) {
      const mode = until ? `loop · until ${until}` : 'loop';
      log.startSection({
        taskId: startTaskId,
        taskTitle: startTaskTitle,
        doneTasks: doneCount,
        totalTasks: allTasksFlat.length,
        epicLabel: startEpicNum > 0 ? `M${startEpicNum}` : '',
        mode,
      });
    }
  }

  // Check if the until target is already done before starting
  if (until) {
    const ctx = createBuildContext(absDir);
    const st = await statusJson(ctx);
    for (const epic of st.epics) {
      const targetTask = epic.tasks.find((t) => t.id === until);
      if (targetTask && targetTask.status === 'done') {
        log.info(`Target task ${until} is already completed`);
        process.exit(0);
      }
    }
  }

  if (until) {
    log.info(`Running until ${until}`);
  }

  // ── Abort controller for graceful cancellation ──────────────
  const ac = new AbortController();
  let cancelled = false;

  const onSignal = () => {
    if (cancelled) return; // second Ctrl+C → let Node handle it
    cancelled = true;
    log.stopHeartbeat();
    log.shutdown();
    ac.abort();

    // Mark current task as cancelled if possible
    if (currentTaskId) {
      try {
        const store = new HierarchicalStore(absDir);
        const storeTask = store.getTask(currentTaskId as import('../store/types.ts').TaskId);
        if (storeTask && storeTask.status === 'active') {
          store.updateTaskStatus(storeTask, 'cancelled', 'crew');
        }
      } catch {
        // Best effort
      }
    }

    log.checkpoint('crew run --loop');
    log.footer(completedCount, Date.now() - loopStartTime, 'cancelled');
    log.writeSummary('cancelled');
    loopSession.cancel();

    // Give a moment for sync I/O to flush, then exit
    setTimeout(() => process.exit(130), 200);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let currentTaskId: string | undefined;

  try {
  while (true) {
    iteration++;
    log.iteration(iteration, Date.now() - loopStartTime);

    // Check if we've reached the target (by display ID like "m2.2")
    if (until && lastTaskId === until) {
      log.targetReached(until, completedCount, Date.now() - loopStartTime);
      log.writeSummary('success');
      loopSession.complete();
      process.exit(0);
    }

    // ── Status Check Phase (same as single-task mode) ──────────────────
    const store = new HierarchicalStore(absDir);
    const sessionObj = new Session(absDir);
    const storeAdapter: StatusCheckStore = {
      listEpics: () => store.listEpics(),
      listAllTasks: () => store.listAllTasks(),
      getTask: (id: string) => store.getTask(id as import('../store/types.ts').TaskId),
      getNextReady: (limit: number) => store.getNextReady(limit),
      getEpic: (id: string) => store.getEpic(id),
      getSession: () => sessionObj.read(),
      isSessionProcessAlive: () => sessionObj.isProcessAlive(),
      detectCrashedSession: () => sessionObj.detectCrash(),
      detectCancelledSession: () => sessionObj.detectCancelled(),
    };

    const statusCheckOpts = (loaded?.config as any)?.statusCheck ?? {};
    const intent = resolveNextIntent(storeAdapter, statusCheckOpts);

    // Handle status check result before proceeding
    if (intent.action === 'block') {
      log.statusIntent(formatIntent(intent));
      log.writeSummary('failure');
      loopSession.fail();
      process.exit(1);
    }

    if (intent.action === 'complete') {
      log.footer(completedCount, Date.now() - loopStartTime, 'success');
      log.writeSummary('success');
      loopSession.complete();
      process.exit(0);
    }

    if (intent.action === 'awaiting_review') {
      log.statusIntent(formatIntent(intent));
      log.writeSummary('success');
      loopSession.complete();
      process.exit(0);
    }

    // Resolve the task to run based on status check intent
    const ctx = createBuildContext(absDir);
    let task: CompoundTask | undefined;

    // Prioritize yielded tasks if any exist
    if (yieldedTasksQueue.length > 0) {
      const nextYieldedId = yieldedTasksQueue[0];  // Peek first
      const st = await statusJson(ctx);

      // Find the task in epics
      for (const epic of st.epics) {
        const yieldedTask = epic.tasks.find((t) => t.id === nextYieldedId);
        if (yieldedTask && yieldedTask.status === 'pending') {
          task = yieldedTask;
          log.info(`Prioritizing yielded task: ${task.id}`);
          yieldedTasksQueue.shift();  // Remove from queue
          break;
        } else if (yieldedTask && yieldedTask.status !== 'pending') {
          // Task is no longer pending (done/failed/cancelled), remove from queue
          yieldedTasksQueue.shift();
        }
      }
    }

    // If no yielded tasks or yielded task not found, use normal resolution
    if (!task && intent.action === 'reset_and_run') {
      log.statusIntent(formatIntent(intent));
      // Reset stale task
      const staleTask = store.getTask(intent.stale.id as import('../store/types.ts').TaskId);
      if (staleTask) {
        store.updateTaskStatus(staleTask, 'pending', 'crew');
      }
      sessionObj.clear();

      // Use the task recommended by status check (intent.next)
      const st = await statusJson(ctx);
      for (const epic of st.epics) {
        task = epic.tasks.find((t) => t.id === intent.next.displayId);
        if (task) break;
      }
    } else if (intent.action === 'retry') {
      log.statusIntent(formatIntent(intent));
      // Reset failed/cancelled task
      const failedTask = store.getTask(intent.task.id);
      if (failedTask) {
        store.updateTaskStatus(failedTask, 'pending', 'crew');
      }
      sessionObj.clear();

      // Use the task recommended by status check (intent.task)
      const st = await statusJson(ctx);
      for (const epic of st.epics) {
        task = epic.tasks.find((t) => t.id === intent.task.displayId);
        if (task) break;
      }
    } else if (intent.action === 'run') {
      // Normal run - use the task recommended by status check
      const st = await statusJson(ctx);
      for (const epic of st.epics) {
        task = epic.tasks.find((t) => t.id === intent.task.displayId);
        if (task) break;
      }
    } else {
      // Fallback: use nextTasks()
      const result = await nextTasks(ctx);
      const nextVal = result.next;
      if (Array.isArray(nextVal)) {
        task = nextVal[0];
      } else if (nextVal && typeof nextVal === 'object' && 'id' in nextVal) {
        task = nextVal as CompoundTask;
      }
    }

    if (!task) {
      log.error('Could not resolve task to run');
      process.exit(1);
    }

    const taskDisplayId = task.id;  // CompoundTask.id is already the display ID (e.g., "m1.1")
    currentTaskId = taskDisplayId;

    // Check if we've reached the target before starting execution
    if (until && lastTaskId === until) {
      log.targetReached(until, completedCount, Date.now() - loopStartTime);
      log.writeSummary('success');
      loopSession.complete();
      process.exit(0);
    }

    // Check if cancelled before starting next task
    if (cancelled) break;

    // Emit epic header if we moved to a new epic
    const epicNum = epicNumFromTaskId(taskDisplayId);
    if (epicNum > 0) {
      const epicTitle = await resolveEpicTitle(ctx, epicNum);
      if (epicTitle) log.epicHeader(epicNum, epicTitle);
    }

    // Run single task execution
    const orchestratorOverrides = (loaded?.config as any)?.orchestrator ?? {};
    const config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...orchestratorOverrides };

    const taskTitle = task.title || (task as unknown as Record<string, string>).task;

    // Print task start
    log.taskStart(taskDisplayId, taskTitle, {
      assignee: task.assignee,
      skills: task.skills,
      prompt: task.prompt,
      type: task.type,
      input: task.input,
      output: task.output,
    });

    const progressLogger = new ProgressLogger(absDir);
    progressLogger.log({ event: 'session:start', pid: process.pid, singleTask: task.id });

    let success = false;
    try {
      // Note: checksOnly and resumeSessionId flags don't apply to loop mode
      for await (const event of executeBatchStreaming(ctx, [task], config, ac.signal)) {
        progressLogger.logEvent(event);

        switch (event.type) {
          case 'task:start':
            if (event.attempt > 1) {
              log.taskRetry(event.taskId, event.attempt, 'retrying');
            }
            if (event.logFile) {
              log.logFile(event.logFile);
              log.startHeartbeat(event.taskId, event.logFile);
            }
            break;
          case 'task:retry':
            log.taskRetry(event.taskId, event.attempt, event.error);
            break;
          case 'task:done':
            log.taskDone(event.taskId, event.result.durationMs);

            // Handle yielded tasks
            if (event.result.spawnedTasks && event.result.spawnedTasks.length > 0) {
              const epicId = epicNumFromTaskId(event.taskId) || 1;
              const sessionObj = new Session(absDir);

              const createdTaskIds = await handleYieldedTasks(
                {
                  type: 'task:yielded',
                  taskId: event.taskId,
                  spawnedTasks: event.result.spawnedTasks,
                  epicId,
                },
                ctx,
                sessionObj
              );

              yieldedTasksQueue.push(...createdTaskIds);
              if (createdTaskIds.length > 0) {
                log.yieldedTasks(createdTaskIds.length);
              }
            }

            success = true;
            break;
          case 'task:failed':
            log.taskFailed(event.taskId, event.result.error);
            break;
          case 'task:cancelled':
            log.taskCancelled(event.taskId, event.reason);
            break;
        }
      }
    } finally {
      progressLogger.log({ event: 'session:end', reason: cancelled ? 'cancelled' : success ? 'completed' : 'error' });
    }

    if (cancelled) break;

    if (!success) {
      log.footer(completedCount, Date.now() - loopStartTime, 'failure');
      log.writeSummary('failure');
      loopSession.fail();
      process.exit(1);
    }

    completedCount++;
    lastTaskId = taskDisplayId;

    // Brief pause between iterations
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  } finally {
    // Remove signal handlers
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }

  if (cancelled) {
    log.writeSummary('cancelled');
    loopSession.cancel();
    process.exit(130);
  }
}
