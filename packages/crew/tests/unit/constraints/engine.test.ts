/**
 * Unit tests for constraints/engine
 * Tests: isResolved, isSuccessfullyDone, evaluateCondition, canTaskStart, canEpicStart,
 *        getBlockers, getEpicBlockers, hasFailedTasks, areAllTasksDone
 */

import { describe, it, expect } from 'vitest';
import type { Task, Epic } from '../../../src/store/types.ts';
import type { TaskConstraints } from '../../../src/tasks/types.ts';
import {
  canTaskStart,
  canEpicStart,
  evaluateCondition,
  isResolved,
  isSuccessfullyDone,
  hasFailedTasks,
  areAllTasksDone,
  getBlockers,
  getEpicBlockers,
} from '../../../src/constraints/engine.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeTask(
  id: string,
  epicId: string,
  status: Task['status'] = 'pending',
  deps?: string[],
  constraints?: TaskConstraints,
): Task {
  return {
    id: id as `task_${string}`,
    version: 1,
    title: `Task ${id}`,
    status,
    status_history: [],
    epic_id: epicId as `epic_${string}`,
    dependencies: (deps || []) as `task_${string}`[],
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
  taskIds: string[],
  status: Epic['status'] = 'planned',
  constraints?: Epic['constraints'],
): Epic {
  return {
    id: id as `epic_${string}`,
    version: 1,
    number,
    title: `Epic ${number}`,
    status,
    task_ids: taskIds as `task_${string}`[],
    gates: [],
    constraints,
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  };
}

/* ------------------------------------------------------------------ */
/*  isResolved                                                         */
/* ------------------------------------------------------------------ */

describe('isResolved', () => {
  it.each([
    ['done', true],
    ['failed', true],
    ['cancelled', true],
    ['pending', false],
    ['active', false],
    ['blocked', false],
  ] as const)('status "%s" → %s', (status, expected) => {
    expect(isResolved(status)).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  isSuccessfullyDone                                                 */
/* ------------------------------------------------------------------ */

describe('isSuccessfullyDone', () => {
  it.each([
    ['done', true],
    ['failed', false],
    ['cancelled', false],
    ['pending', false],
    ['active', false],
    ['blocked', false],
  ] as const)('status "%s" → %s', (status, expected) => {
    expect(isSuccessfullyDone(status)).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  hasFailedTasks                                                     */
/* ------------------------------------------------------------------ */

describe('hasFailedTasks', () => {
  it('returns false when no tasks are failed', () => {
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'pending');
    expect(hasFailedTasks(epic, [t1, t2])).toBe(false);
  });

  it('returns true when any task is failed', () => {
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'failed');
    expect(hasFailedTasks(epic, [t1, t2])).toBe(true);
  });

  it('returns false for empty epic', () => {
    const epic = makeEpic('e1', 1, []);
    expect(hasFailedTasks(epic, [])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  areAllTasksDone                                                    */
/* ------------------------------------------------------------------ */

describe('areAllTasksDone', () => {
  it('returns true when all tasks are done', () => {
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'done');
    expect(areAllTasksDone(epic, [t1, t2])).toBe(true);
  });

  it('returns false when a task is failed (not done)', () => {
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'failed');
    expect(areAllTasksDone(epic, [t1, t2])).toBe(false);
  });

  it('returns false when a task is pending', () => {
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'pending');
    expect(areAllTasksDone(epic, [t1, t2])).toBe(false);
  });

  it('returns true for empty epic', () => {
    const epic = makeEpic('e1', 1, []);
    expect(areAllTasksDone(epic, [])).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateCondition                                                  */
/* ------------------------------------------------------------------ */

describe('evaluateCondition', () => {
  it('returns true for undefined condition', () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  it('evaluates function conditions with vars', () => {
    const cond = (vars: Record<string, unknown>) => vars.ready === true;
    expect(evaluateCondition(cond, { ready: true })).toBe(true);
    expect(evaluateCondition(cond, { ready: false })).toBe(false);
  });

  it('evaluates string conditions as expressions', () => {
    expect(evaluateCondition('x > 5', { x: 10 })).toBe(true);
    expect(evaluateCondition('x > 5', { x: 3 })).toBe(false);
  });

  it('evaluates complex expressions with multiple vars', () => {
    expect(evaluateCondition('a + b === c', { a: 5, b: 10, c: 15 })).toBe(true);
    expect(evaluateCondition('a < b && b < c', { a: 1, b: 5, c: 10 })).toBe(true);
  });

  it('returns false for malformed string conditions', () => {
    expect(evaluateCondition('invalid!!!syntax', {})).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  canTaskStart - dependency scenarios                                */
/* ------------------------------------------------------------------ */

describe('canTaskStart', () => {
  describe('dependency checks', () => {
    it('allows task with no dependencies', () => {
      const task = makeTask('t1', 'e1');
      const epic = makeEpic('e1', 1, ['t1']);
      expect(canTaskStart({ task, allTasks: [task], allEpics: [epic] })).toBe(true);
    });

    it('allows task when all deps are done', () => {
      const t1 = makeTask('t1', 'e1', 'done');
      const t2 = makeTask('t2', 'e1', 'pending', ['t1']);
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(true);
    });

    it('blocks task when deps are pending', () => {
      const t1 = makeTask('t1', 'e1', 'pending');
      const t2 = makeTask('t2', 'e1', 'pending', ['t1']);
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(false);
    });

    it('allows task when dep failed (resolved within same epic)', () => {
      const t1 = makeTask('t1', 'e1', 'failed');
      const t2 = makeTask('t2', 'e1', 'pending', ['t1']);
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(true);
    });

    it('blocks when any one dep is unresolved', () => {
      const t1 = makeTask('t1', 'e1', 'done');
      const t2 = makeTask('t2', 'e1', 'active');
      const t3 = makeTask('t3', 'e1', 'pending', ['t1', 't2']);
      const epic = makeEpic('e1', 1, ['t1', 't2', 't3']);
      expect(canTaskStart({ task: t3, allTasks: [t1, t2, t3], allEpics: [epic] })).toBe(false);
    });
  });

  describe('sequential constraint', () => {
    it('blocks when sequential and previous task pending', () => {
      const t1 = makeTask('t1', 'e1', 'pending', undefined, { sequential: true });
      const t2 = makeTask('t2', 'e1', 'pending', undefined, { sequential: true });
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(false);
    });

    it('allows when sequential and previous task done', () => {
      const t1 = makeTask('t1', 'e1', 'done', undefined, { sequential: true });
      const t2 = makeTask('t2', 'e1', 'pending', undefined, { sequential: true });
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(true);
    });

    it('allows parallel task regardless of previous', () => {
      const t1 = makeTask('t1', 'e1', 'pending', undefined, { parallel: true, sequential: false });
      const t2 = makeTask('t2', 'e1', 'pending', undefined, { parallel: true, sequential: false });
      const epic = makeEpic('e1', 1, ['t1', 't2']);
      expect(canTaskStart({ task: t2, allTasks: [t1, t2], allEpics: [epic] })).toBe(true);
    });
  });

  describe('blockedBy constraint', () => {
    it('blocks when blockedBy task is pending', () => {
      const blocker = makeTask('t_block', 'e1', 'pending');
      const task = makeTask('t2', 'e1', 'pending', undefined, { blockedBy: ['t_block'] });
      const epic = makeEpic('e1', 1, ['t_block', 't2']);
      expect(canTaskStart({ task, allTasks: [blocker, task], allEpics: [epic] })).toBe(false);
    });

    it('allows when blockedBy task is done', () => {
      const blocker = makeTask('t_block', 'e1', 'done');
      const task = makeTask('t2', 'e1', 'pending', undefined, { blockedBy: ['t_block'] });
      const epic = makeEpic('e1', 1, ['t_block', 't2']);
      expect(canTaskStart({ task, allTasks: [blocker, task], allEpics: [epic] })).toBe(true);
    });
  });

  describe('condition constraint', () => {
    it('blocks when condition evaluates false', () => {
      const task = makeTask('t1', 'e1', 'pending', undefined, { condition: 'enabled === true' });
      const epic = makeEpic('e1', 1, ['t1']);
      expect(canTaskStart({ task, allTasks: [task], allEpics: [epic], vars: { enabled: false } })).toBe(false);
    });

    it('allows when condition evaluates true', () => {
      const task = makeTask('t1', 'e1', 'pending', undefined, { condition: 'enabled === true' });
      const epic = makeEpic('e1', 1, ['t1']);
      expect(canTaskStart({ task, allTasks: [task], allEpics: [epic], vars: { enabled: true } })).toBe(true);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  canEpicStart                                                       */
/* ------------------------------------------------------------------ */

describe('canEpicStart', () => {
  it('allows first epic to start', () => {
    const epic = makeEpic('e1', 1, ['t1']);
    const t = makeTask('t1', 'e1');
    const result = canEpicStart({ epic, allEpics: [epic], allTasks: [t] });
    expect(result.canStart).toBe(true);
  });

  it('blocks when previous epic has pending tasks', () => {
    const e1 = makeEpic('e1', 1, ['t1']);
    const e2 = makeEpic('e2', 2, ['t2']);
    const t1 = makeTask('t1', 'e1', 'pending');
    const t2 = makeTask('t2', 'e2', 'pending');
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2] });
    expect(result.canStart).toBe(false);
  });

  it('allows when all previous epic tasks done', () => {
    const e1 = makeEpic('e1', 1, ['t1']);
    const e2 = makeEpic('e2', 2, ['t2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e2', 'pending');
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2] });
    expect(result.canStart).toBe(true);
  });

  it('auto-resolves empty epic', () => {
    const epic = makeEpic('e_empty', 1, []);
    const result = canEpicStart({ epic, allEpics: [epic], allTasks: [] });
    expect(result.autoResolved).toBe(true);
  });

  it('respects blockedBy constraint', () => {
    const e1 = makeEpic('e1', 1, ['t1']);
    const e2 = makeEpic('e2', 2, ['t2'], 'planned', { blockedBy: ['e1'] });
    const t1 = makeTask('t1', 'e1', 'pending');
    const t2 = makeTask('t2', 'e2', 'pending');
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2] });
    expect(result.canStart).toBe(false);
  });

  /* --- Epic locking: failed tasks block cross-epic transition --- */

  it('blocks when previous epic has failed tasks (epic locking)', () => {
    const e1 = makeEpic('e1', 1, ['t1', 't2', 't3']);
    const e2 = makeEpic('e2', 2, ['t4']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'done');
    const t3 = makeTask('t3', 'e1', 'failed');  // m2.3 equivalent - FAILED
    const t4 = makeTask('t4', 'e2', 'pending');  // m3.1 equivalent - should NOT start
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2, t3, t4] });
    expect(result.canStart).toBe(false);
    expect(result.reason).toContain('failed');
  });

  it('blocks when previous epic has mix of failed and pending tasks', () => {
    const e1 = makeEpic('e1', 1, ['t1', 't2', 't3']);
    const e2 = makeEpic('e2', 2, ['t4']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'failed');
    const t3 = makeTask('t3', 'e1', 'pending');
    const t4 = makeTask('t4', 'e2', 'pending');
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2, t3, t4] });
    expect(result.canStart).toBe(false);
  });

  it('allows when all previous epic tasks are successfully done (not just resolved)', () => {
    const e1 = makeEpic('e1', 1, ['t1', 't2']);
    const e2 = makeEpic('e2', 2, ['t3']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'done');
    const t3 = makeTask('t3', 'e2', 'pending');
    const result = canEpicStart({ epic: e2, allEpics: [e1, e2], allTasks: [t1, t2, t3] });
    expect(result.canStart).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  getBlockers                                                        */
/* ------------------------------------------------------------------ */

describe('getBlockers', () => {
  it('returns empty for no blockers', () => {
    const task = makeTask('t1', 'e1');
    const epic = makeEpic('e1', 1, ['t1']);
    expect(getBlockers(task, [task], [epic])).toEqual([]);
  });

  it('returns dependency blocker IDs', () => {
    const t1 = makeTask('t1', 'e1', 'pending');
    const t2 = makeTask('t2', 'e1', 'pending', ['t1']);
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    expect(getBlockers(t2, [t1, t2], [epic])).toContain('t1');
  });

  it('returns sequential blocker IDs', () => {
    const t1 = makeTask('t1', 'e1', 'pending', undefined, { sequential: true });
    const t2 = makeTask('t2', 'e1', 'pending', undefined, { sequential: true });
    const epic = makeEpic('e1', 1, ['t1', 't2']);
    expect(getBlockers(t2, [t1, t2], [epic])).toContain('t1');
  });

  it('returns blockedBy blocker IDs', () => {
    const blocker = makeTask('t_block', 'e1', 'pending');
    const task = makeTask('t2', 'e1', 'pending', undefined, { blockedBy: ['t_block'] });
    const epic = makeEpic('e1', 1, ['t_block', 't2']);
    expect(getBlockers(task, [blocker, task], [epic])).toContain('t_block');
  });
});

/* ------------------------------------------------------------------ */
/*  getEpicBlockers                                                    */
/* ------------------------------------------------------------------ */

describe('getEpicBlockers', () => {
  it('returns empty when no blockers', () => {
    const e1 = makeEpic('e1', 1, ['t1']);
    const e2 = makeEpic('e2', 2, ['t2']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e2', 'pending');
    expect(getEpicBlockers(e2, [e1, e2], [t1, t2])).toEqual([]);
  });

  it('returns previous epic as blocker when tasks pending', () => {
    const e1 = makeEpic('e1', 1, ['t1']);
    const e2 = makeEpic('e2', 2, ['t2']);
    const t1 = makeTask('t1', 'e1', 'pending');
    const t2 = makeTask('t2', 'e2', 'pending');
    expect(getEpicBlockers(e2, [e1, e2], [t1, t2])).toContain('e1');
  });

  it('returns previous epic as blocker when tasks failed (epic locking)', () => {
    const e1 = makeEpic('e1', 1, ['t1', 't2']);
    const e2 = makeEpic('e2', 2, ['t3']);
    const t1 = makeTask('t1', 'e1', 'done');
    const t2 = makeTask('t2', 'e1', 'failed');
    const t3 = makeTask('t3', 'e2', 'pending');
    expect(getEpicBlockers(e2, [e1, e2], [t1, t2, t3])).toContain('e1');
  });
});
