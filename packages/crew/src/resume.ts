import { editTask, statusJson } from './manager/index.ts';
import type { BuildContext } from './types.ts';
import type { ProgressLogger, ProgressEntry } from './progress.ts';

export interface ResumeState {
  /** A previous run completed successfully — nothing to do. */
  alreadyDone: boolean;
  /** Task IDs that were stuck as 'active' and reset to 'pending'. */
  activeTasksReset: string[];
  /** Project already has epics — skip initial planning. */
  skipPlanning: boolean;
}

/**
 * Inspect progress log and crew store to determine resume state.
 *
 * 1. If the log contains a `project:done` with `success: true`, the project
 *    is already complete → `alreadyDone: true`.
 * 2. If the crew store has epics, planning was already done → `skipPlanning: true`.
 * 3. Any tasks stuck as `active` (from a crashed run) are reset to `pending`.
 */
export async function prepareResume(
  ctx: BuildContext,
  logger: ProgressLogger,
): Promise<ResumeState> {
  // 1. Check progress log for successful completion
  const entries = logger.readAll();
  const alreadyDone = hasSuccessfulCompletion(entries);

  if (alreadyDone) {
    return { alreadyDone: true, activeTasksReset: [], skipPlanning: false };
  }

  // 2. Check crew store for existing epics
  let skipPlanning = false;
  let activeTasksReset: string[] = [];

  try {
    const status = await statusJson(ctx);
    if (status.epics.length > 0) {
      skipPlanning = true;
    }

    // 3. Reset stale 'active' tasks to 'pending'
    for (const ms of status.epics) {
      for (const task of ms.tasks) {
        if (task.status === 'active') {
          await editTask(ctx, task.id, 'pending');
          activeTasksReset.push(task.id);
        }
      }
    }
  } catch {
    // No existing plan or statusJson failed — fresh run
  }

  return { alreadyDone, activeTasksReset, skipPlanning };
}

function hasSuccessfulCompletion(entries: ProgressEntry[]): boolean {
  // Find the last project:done entry
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].event === 'project:done') {
      return entries[i].success === true;
    }
  }
  return false;
}
