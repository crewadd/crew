/**
 * Tests for Constraint Engine
 */

import { describe, it, expect } from 'vitest';
import type { Task, Epic } from '../src/store/types.ts';
import type { TaskConstraints } from '../src/tasks/types.ts';
import {
  canTaskStart,
  canEpicStart,
  computeBatches,
  evaluateCondition,
  isResolved,
  getBlockers,
  getEpicBlockers,
} from '../src/constraints/engine.ts';

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */

function makeTask(
  id: string,
  epicId: string,
  status: Task['status'] = 'pending',
  dependencies?: string[],
  constraints?: TaskConstraints
): Task {
  return {
    id: id as `task_${string}`,
    version: 1,
    title: `Task ${id}`,
    status,
    status_history: [],
    epic_id: epicId as `epic_${string}`,
    dependencies: dependencies || [],
    dependents: [],
    attempts: [],
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    constraints,
  };
}

function makeEpic(
  id: string,
  number: number,
  title: string,
  taskIds: string[],
  status: Epic['status'] = 'planned',
  constraints?: Epic['constraints']
): Epic {
  return {
    id: id as `epic_${string}`,
    version: 1,
    number,
    title,
    status,
    task_ids: taskIds as `task_${string}`[],
    gates: [],
    constraints,
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  };
}

/* ------------------------------------------------------------------ */
/*  isResolved Tests                                                  */
/* ------------------------------------------------------------------ */

describe('isResolved', () => {
  it('should return true for done status', () => {
    expect(isResolved('done')).toBe(true);
  });

  it('should return true for failed status', () => {
    expect(isResolved('failed')).toBe(true);
  });

  it('should return true for cancelled status', () => {
    expect(isResolved('cancelled')).toBe(true);
  });

  it('should return false for pending status', () => {
    expect(isResolved('pending')).toBe(false);
  });

  it('should return false for active status', () => {
    expect(isResolved('active')).toBe(false);
  });

  it('should return false for blocked status', () => {
    expect(isResolved('blocked')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateCondition Tests                                           */
/* ------------------------------------------------------------------ */

describe('evaluateCondition', () => {
  it('should return true for undefined condition', () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  it('should evaluate function conditions', () => {
    const condition = (vars: Record<string, unknown>) => vars.hasData === true;
    expect(evaluateCondition(condition, { hasData: true })).toBe(true);
    expect(evaluateCondition(condition, { hasData: false })).toBe(false);
  });

  it('should evaluate string conditions', () => {
    expect(evaluateCondition('value === true', { value: true })).toBe(true);
    expect(evaluateCondition('value === false', { value: true })).toBe(false);
  });

  it('should handle complex expressions', () => {
    const vars = { a: 5, b: 10, c: 15 };
    expect(evaluateCondition('a + b === c', vars)).toBe(true);
    expect(evaluateCondition('a > b', vars)).toBe(false);
    expect(evaluateCondition('a < b && b < c', vars)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  canTaskStart Tests - Dependencies                                 */
/* ------------------------------------------------------------------ */

describe('canTaskStart - Dependencies', () => {
  it('should allow task with no dependencies', () => {
    const task = makeTask('task_1', 'ms_1');
    const allTasks = [task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1'])];

    expect(canTaskStart({ task, allTasks, allEpics })).toBe(true);
  });

  it('should allow task when all dependencies are resolved', () => {
    const task1 = makeTask('task_1', 'ms_1', 'done');
    const task2 = makeTask('task_2', 'ms_1', 'pending', ['task_1']);
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(true);
  });

  it('should block task when dependencies are not resolved', () => {
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const task2 = makeTask('task_2', 'ms_1', 'pending', ['task_1']);
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  canTaskStart Tests - Sequential Constraint                        */
/* ------------------------------------------------------------------ */

describe('canTaskStart - Sequential Constraint', () => {
  it('should block task when sequential and previous task not resolved', () => {
    const task1 = makeTask('task_1', 'ms_1', 'pending', undefined, { sequential: true });
    const task2 = makeTask('task_2', 'ms_1', 'pending', undefined, { sequential: true });
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(false);
  });

  it('should allow task when sequential and previous task is resolved', () => {
    const task1 = makeTask('task_1', 'ms_1', 'done', undefined, { sequential: true });
    const task2 = makeTask('task_2', 'ms_1', 'pending', undefined, { sequential: true });
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(true);
  });

  it('should allow parallel task regardless of previous task', () => {
    // Note: parallel constraint only affects batching, not canTaskStart
    // canTaskStart still checks sequential constraint by default
    const task1 = makeTask('task_1', 'ms_1', 'pending', undefined, { parallel: true });
    const task2 = makeTask('task_2', 'ms_1', 'pending', undefined, { parallel: true, sequential: false });
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    // With sequential: false, task2 can start regardless of task1
    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(true);
  });

  it('should use sequential: true when explicitly set', () => {
    const task1 = makeTask('task_1', 'ms_1', 'pending', undefined, { sequential: true });
    const task2 = makeTask('task_2', 'ms_1', 'pending', undefined, { sequential: true });
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    // With explicit sequential: true, task2 should be blocked by task1
    expect(canTaskStart({ task: task2, allTasks, allEpics })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  canTaskStart Tests - Custom blockedBy                            */
/* ------------------------------------------------------------------ */

describe('canTaskStart - Custom blockedBy', () => {
  it('should block task when blockedBy task is not resolved', () => {
    const blocker = makeTask('task_blocker', 'ms_1', 'pending');
    const task = makeTask('task_2', 'ms_1', 'pending', undefined, {
      blockedBy: ['task_blocker'],
    });
    const allTasks = [blocker, task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_blocker', 'task_2'])];

    expect(canTaskStart({ task, allTasks, allEpics })).toBe(false);
  });

  it('should allow task when blockedBy task is resolved', () => {
    const blocker = makeTask('task_blocker', 'ms_1', 'done');
    const task = makeTask('task_2', 'ms_1', 'pending', undefined, {
      blockedBy: ['task_blocker'],
    });
    const allTasks = [blocker, task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_blocker', 'task_2'])];

    expect(canTaskStart({ task, allTasks, allEpics })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  canTaskStart Tests - Conditions                                   */
/* ------------------------------------------------------------------ */

describe('canTaskStart - Conditions', () => {
  it('should block task when condition is not met', () => {
    const task = makeTask('task_1', 'ms_1', 'pending', undefined, {
      condition: 'enabled === true',
    });
    const allTasks = [task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1'])];
    const vars = { enabled: false };

    expect(canTaskStart({ task, allTasks, allEpics, vars })).toBe(false);
  });

  it('should allow task when condition is met', () => {
    const task = makeTask('task_1', 'ms_1', 'pending', undefined, {
      condition: 'enabled === true',
    });
    const allTasks = [task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1'])];
    const vars = { enabled: true };

    expect(canTaskStart({ task, allTasks, allEpics, vars })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  getBlockers Tests                                                 */
/* ------------------------------------------------------------------ */

describe('getBlockers', () => {
  it('should return empty array when no blockers', () => {
    const task = makeTask('task_1', 'ms_1', 'pending');
    const allTasks = [task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1'])];

    expect(getBlockers(task, allTasks, allEpics)).toEqual([]);
  });

  it('should return dependency blockers', () => {
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const task2 = makeTask('task_2', 'ms_1', 'pending', ['task_1']);
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    const blockers = getBlockers(task2, allTasks, allEpics);
    expect(blockers).toContain('task_1');
  });

  it('should return sequential blocker', () => {
    const task1 = makeTask('task_1', 'ms_1', 'pending', undefined, { sequential: true });
    const task2 = makeTask('task_2', 'ms_1', 'pending', undefined, { sequential: true });
    const allTasks = [task1, task2];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2'])];

    const blockers = getBlockers(task2, allTasks, allEpics);
    expect(blockers).toContain('task_1');
  });

  it('should return custom blockedBy blockers', () => {
    const blocker = makeTask('task_blocker', 'ms_1', 'pending');
    const task = makeTask('task_2', 'ms_1', 'pending', undefined, {
      blockedBy: ['task_blocker'],
    });
    const allTasks = [blocker, task];
    const allEpics = [makeEpic('ms_1', 1, 'Epic 1', ['task_blocker', 'task_2'])];

    const blockersList = getBlockers(task, allTasks, allEpics);
    expect(blockersList).toContain('task_blocker');
  });
});

/* ------------------------------------------------------------------ */
/*  canEpicStart Tests                                           */
/* ------------------------------------------------------------------ */

describe('canEpicStart', () => {
  it('should allow first epic to start', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const allEpics = [ms1];
    const allTasks = [task1];

    const result = canEpicStart({ epic: ms1, allEpics, allTasks });
    expect(result.canStart).toBe(true);
  });

  it('should block epic when previous epic tasks not resolved', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', ['task_2']);
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const task2 = makeTask('task_2', 'ms_2', 'pending');
    const allEpics = [ms1, ms2];
    const allTasks = [task1, task2];

    const result = canEpicStart({ epic: ms2, allEpics, allTasks });
    expect(result.canStart).toBe(false);
    expect(result.reason).toContain('Waiting for previous epic');
  });

  it('should allow epic when previous epic tasks are resolved', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', ['task_2']);
    const task1 = makeTask('task_1', 'ms_1', 'done');
    const task2 = makeTask('task_2', 'ms_2', 'pending');
    const allEpics = [ms1, ms2];
    const allTasks = [task1, task2];

    const result = canEpicStart({ epic: ms2, allEpics, allTasks });
    expect(result.canStart).toBe(true);
  });

  it('should auto-resolve empty epic', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', []);
    const allEpics = [ms1];
    const allTasks: Task[] = [];

    const result = canEpicStart({ epic: ms1, allEpics, allTasks });
    expect(result.canStart).toBe(false);
    expect(result.autoResolved).toBe(true);
  });

  it('should respect custom blockedBy', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', ['task_2'], 'planned', {
      blockedBy: ['ms_1'],
    });
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const task2 = makeTask('task_2', 'ms_2', 'pending');
    const allEpics = [ms1, ms2];
    const allTasks = [task1, task2];

    const result = canEpicStart({ epic: ms2, allEpics, allTasks });
    expect(result.canStart).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  getEpicBlockers Tests                                        */
/* ------------------------------------------------------------------ */

describe('getEpicBlockers', () => {
  it('should return empty array when no blockers', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const task1 = makeTask('task_1', 'ms_1', 'done');
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', ['task_2']);
    const task2 = makeTask('task_2', 'ms_2', 'pending');
    const allEpics = [ms1, ms2];
    const allTasks = [task1, task2];

    const blockers = getEpicBlockers(ms2, allEpics, allTasks);
    expect(blockers).toEqual([]);
  });

  it('should return previous epic as blocker', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', ['task_2']);
    const task1 = makeTask('task_1', 'ms_1', 'pending');
    const task2 = makeTask('task_2', 'ms_2', 'pending');
    const allEpics = [ms1, ms2];
    const allTasks = [task1, task2];

    const blockers = getEpicBlockers(ms2, allEpics, allTasks);
    expect(blockers).toContain('ms_1');
  });
});
