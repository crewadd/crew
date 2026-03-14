/**
 * Tests for Constraint Validator
 */

import { describe, it, expect } from 'vitest';
import type { Task, Epic } from '../src/store/types.ts';
import {
  validatePlan,
  validateTaskDef,
  detectCircularDependencies,
  detectPotentialDeadlocks,
} from '../src/constraints/validator.ts';

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */

function makeTask(
  id: string,
  epicId: string,
  dependencies?: string[],
  constraints?: Task['constraints']
): Task {
  return {
    id: id as `task_${string}`,
    version: 1,
    title: `Task ${id}`,
    status: 'pending',
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
  constraints?: Epic['constraints']
): Epic {
  return {
    id: id as `epic_${string}`,
    version: 1,
    number,
    title,
    status: 'planned',
    task_ids: taskIds as `task_${string}`[],
    gates: [],
    constraints,
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  };
}

/* ------------------------------------------------------------------ */
/*  validatePlan Tests                                                */
/* ------------------------------------------------------------------ */

describe('validatePlan', () => {
  it('should return valid for empty plan', () => {
    const result = validatePlan({ tasks: [], epics: [] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return valid for simple plan', () => {
    const task1 = makeTask('task_1', 'ms_1');
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2']);

    const result = validatePlan({ tasks: [task1, task2], epics: [ms1] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should detect orphaned blockedBy references', () => {
    const task1 = makeTask('task_1', 'ms_1', undefined, {
      blockedBy: ['non_existent_task'],
    });
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);

    const result = validatePlan({ tasks: [task1], epics: [ms1] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ORPHANED_BLOCKED_BY')).toBe(true);
  });

  it('should warn about orphaned blocking references', () => {
    const task1 = makeTask('task_1', 'ms_1', undefined, {
      blocking: ['non_existent_task'],
    });
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);

    const result = validatePlan({ tasks: [task1], epics: [ms1] });
    expect(result.warnings.some(w => w.code === 'ORPHANED_BLOCKING')).toBe(true);
  });

  it('should warn about conflicting constraints', () => {
    const task1 = makeTask('task_1', 'ms_1', undefined, {
      sequential: true,
      parallel: true,
    });
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1']);

    const result = validatePlan({ tasks: [task1], epics: [ms1] });
    expect(result.warnings.some(w => w.code === 'CONFLICTING_CONSTRAINTS')).toBe(true);
  });

  it('should detect circular dependencies', () => {
    const task1 = makeTask('task_1', 'ms_1', ['task_2']);
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', ['task_1', 'task_2']);

    const result = validatePlan({ tasks: [task1, task2], epics: [ms1] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
  });

  it('should detect epic orphaned blockedBy', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', [], {
      blockedBy: ['non_existent_epic'],
    });

    const result = validatePlan({ tasks: [], epics: [ms1] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ORPHANED_BLOCKED_BY')).toBe(true);
  });

  it('should warn about epic orphaned blocking', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', [], {
      blocking: ['non_existent_epic'],
    });

    const result = validatePlan({ tasks: [], epics: [ms1] });
    expect(result.warnings.some(w => w.code === 'ORPHANED_BLOCKING')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  detectCircularDependencies Tests                                  */
/* ------------------------------------------------------------------ */

describe('detectCircularDependencies', () => {
  it('should return empty for no dependencies', () => {
    const task1 = makeTask('task_1', 'ms_1');
    const task2 = makeTask('task_2', 'ms_1');

    const cycles = detectCircularDependencies([task1, task2]);
    expect(cycles).toEqual([]);
  });

  it('should return empty for linear dependencies', () => {
    const task1 = makeTask('task_1', 'ms_1');
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);
    const task3 = makeTask('task_3', 'ms_1', ['task_2']);

    const cycles = detectCircularDependencies([task1, task2, task3]);
    expect(cycles).toEqual([]);
  });

  it('should detect simple cycle', () => {
    const task1 = makeTask('task_1', 'ms_1', ['task_2']);
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);

    const cycles = detectCircularDependencies([task1, task2]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should detect complex cycle', () => {
    const task1 = makeTask('task_1', 'ms_1', ['task_3']);
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);
    const task3 = makeTask('task_3', 'ms_1', ['task_2']);

    const cycles = detectCircularDependencies([task1, task2, task3]);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  detectPotentialDeadlocks Tests                                    */
/* ------------------------------------------------------------------ */

describe('detectPotentialDeadlocks', () => {
  it('should return empty for no deadlocks', () => {
    const task1 = makeTask('task_1', 'ms_1');
    const task2 = makeTask('task_2', 'ms_1', ['task_1']);

    const deadlocks = detectPotentialDeadlocks([task1, task2], []);
    expect(deadlocks).toEqual([]);
  });

  it('should detect mutual blocking', () => {
    const task1 = makeTask('task_1', 'ms_1', undefined, {
      blockedBy: ['task_2'],
    });
    const task2 = makeTask('task_2', 'ms_1', undefined, {
      blockedBy: ['task_1'],
    });

    const deadlocks = detectPotentialDeadlocks([task1, task2], []);
    expect(deadlocks.length).toBeGreaterThan(0);
  });

  it('should detect epic mutual blocking', () => {
    const ms1 = makeEpic('ms_1', 1, 'Epic 1', [], {
      blockedBy: ['ms_2'],
    });
    const ms2 = makeEpic('ms_2', 2, 'Epic 2', [], {
      blockedBy: ['ms_1'],
    });

    const deadlocks = detectPotentialDeadlocks([], [ms1, ms2]);
    expect(deadlocks.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  validateTaskDef Tests                                             */
/* ------------------------------------------------------------------ */

describe('validateTaskDef', () => {
  it('should return empty for valid task', () => {
    const task = {
      id: 'task_1',
      title: 'Task 1',
      deps: [],
    };

    const errors = validateTaskDef(task, [task]);
    expect(errors).toEqual([]);
  });

  it('should detect duplicate task ID', () => {
    const task1 = {
      id: 'task_1',
      title: 'Task 1',
      deps: [],
    };
    const task2 = {
      id: 'task_1',
      title: 'Task 1 Duplicate',
      deps: [],
    };

    const errors = validateTaskDef(task1, [task1, task2]);
    expect(errors.some(e => e.code === 'DUPLICATE_TASK_ID')).toBe(true);
  });

  it('should detect self dependency', () => {
    const task = {
      id: 'task_1',
      title: 'Task 1',
      deps: ['task_1'],
    };

    const errors = validateTaskDef(task, [task]);
    expect(errors.some(e => e.code === 'SELF_DEPENDENCY')).toBe(true);
  });
});
