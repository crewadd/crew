/**
 * Unit tests for constraints/validator
 * Tests: validatePlan, detectCircularDependencies, detectPotentialDeadlocks, validateTaskDef
 */

import { describe, it, expect } from 'vitest';
import type { Task, Milestone } from '../../../src/store/types.ts';
import {
  validatePlan,
  detectCircularDependencies,
  detectPotentialDeadlocks,
  validateTaskDef,
} from '../../../src/constraints/validator.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeTask(
  id: string,
  msId: string,
  deps: string[] = [],
  constraints: any = {},
): Task {
  return {
    id: id as `task_${string}`,
    version: 1,
    title: `Task ${id}`,
    status: 'pending',
    status_history: [],
    milestone_id: msId as `ms_${string}`,
    dependencies: deps as `task_${string}`[],
    dependents: [],
    attempts: [],
    constraints,
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  };
}

function makeMilestone(id: string, num: number, taskIds: string[] = [], constraints: any = {}): Milestone {
  return {
    id: id as `ms_${string}`,
    version: 1,
    number: num,
    title: `Milestone ${num}`,
    status: 'planned',
    task_ids: taskIds as `task_${string}`[],
    gates: [],
    constraints,
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  };
}

/* ------------------------------------------------------------------ */
/*  detectCircularDependencies                                         */
/* ------------------------------------------------------------------ */

describe('detectCircularDependencies', () => {
  it('returns empty for no cycles', () => {
    const t1 = makeTask('t1', 'ms_1');
    const t2 = makeTask('t2', 'ms_1', ['t1']);
    const t3 = makeTask('t3', 'ms_1', ['t2']);
    expect(detectCircularDependencies([t1, t2, t3])).toEqual([]);
  });

  it('detects simple two-node cycle', () => {
    const t1 = makeTask('t1', 'ms_1', ['t2']);
    const t2 = makeTask('t2', 'ms_1', ['t1']);
    const cycles = detectCircularDependencies([t1, t2]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects three-node cycle', () => {
    const t1 = makeTask('t1', 'ms_1', ['t3']);
    const t2 = makeTask('t2', 'ms_1', ['t1']);
    const t3 = makeTask('t3', 'ms_1', ['t2']);
    const cycles = detectCircularDependencies([t1, t2, t3]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('returns empty for independent tasks', () => {
    const t1 = makeTask('t1', 'ms_1');
    const t2 = makeTask('t2', 'ms_1');
    expect(detectCircularDependencies([t1, t2])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  detectPotentialDeadlocks                                           */
/* ------------------------------------------------------------------ */

describe('detectPotentialDeadlocks', () => {
  it('returns empty for no deadlocks', () => {
    const t1 = makeTask('t1', 'ms_1', [], { blockedBy: ['t2'] });
    const t2 = makeTask('t2', 'ms_1');
    const ms = makeMilestone('ms_1', 1, ['t1', 't2']);
    expect(detectPotentialDeadlocks([t1, t2], [ms])).toEqual([]);
  });

  it('detects mutual blocking between tasks', () => {
    const t1 = makeTask('t1', 'ms_1', [], { blockedBy: ['t2'] });
    const t2 = makeTask('t2', 'ms_1', [], { blockedBy: ['t1'] });
    const ms = makeMilestone('ms_1', 1, ['t1', 't2']);
    const deadlocks = detectPotentialDeadlocks([t1, t2], [ms]);
    expect(deadlocks.length).toBeGreaterThan(0);
  });

  it('detects mutual blocking between milestones', () => {
    const ms1 = makeMilestone('ms_1', 1, [], { blockedBy: ['ms_2'] });
    const ms2 = makeMilestone('ms_2', 2, [], { blockedBy: ['ms_1'] });
    const deadlocks = detectPotentialDeadlocks([], [ms1, ms2]);
    expect(deadlocks.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  validatePlan                                                       */
/* ------------------------------------------------------------------ */

describe('validatePlan', () => {
  it('validates clean plan as valid', () => {
    const t1 = makeTask('t1', 'ms_1');
    const t2 = makeTask('t2', 'ms_1', ['t1']);
    const ms = makeMilestone('ms_1', 1, ['t1', 't2']);
    const result = validatePlan({ tasks: [t1, t2], milestones: [ms] });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('detects orphaned blockedBy reference in task', () => {
    const t1 = makeTask('t1', 'ms_1', [], { blockedBy: ['nonexistent'] });
    const ms = makeMilestone('ms_1', 1, ['t1']);
    const result = validatePlan({ tasks: [t1], milestones: [ms] });
    expect(result.errors.some(e => e.code === 'ORPHANED_BLOCKED_BY')).toBe(true);
  });

  it('warns on conflicting sequential + parallel constraints', () => {
    const t1 = makeTask('t1', 'ms_1', [], { sequential: true, parallel: true });
    const ms = makeMilestone('ms_1', 1, ['t1']);
    const result = validatePlan({ tasks: [t1], milestones: [ms] });
    expect(result.warnings.some(w => w.code === 'CONFLICTING_CONSTRAINTS')).toBe(true);
  });

  it('detects circular dependencies as errors', () => {
    const t1 = makeTask('t1', 'ms_1', ['t2']);
    const t2 = makeTask('t2', 'ms_1', ['t1']);
    const ms = makeMilestone('ms_1', 1, ['t1', 't2']);
    const result = validatePlan({ tasks: [t1, t2], milestones: [ms] });
    expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
  });

  it('detects orphaned blockedBy reference in milestone', () => {
    const ms1 = makeMilestone('ms_1', 1, [], { blockedBy: ['ms_nonexistent'] });
    const result = validatePlan({ tasks: [], milestones: [ms1] });
    expect(result.errors.some(e => e.code === 'ORPHANED_BLOCKED_BY')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  validateTaskDef                                                    */
/* ------------------------------------------------------------------ */

describe('validateTaskDef', () => {
  it('validates clean task def', () => {
    const task = { id: 't1', title: 'Task 1' } as any;
    const errors = validateTaskDef(task, [task]);
    expect(errors.length).toBe(0);
  });

  it('detects self-dependency', () => {
    const task = { id: 't1', title: 'Task 1', deps: ['t1'] } as any;
    const errors = validateTaskDef(task, [task]);
    expect(errors.some(e => e.code === 'SELF_DEPENDENCY')).toBe(true);
  });

  it('detects duplicate task IDs', () => {
    const task1 = { id: 't1', title: 'Task 1' } as any;
    const task2 = { id: 't1', title: 'Task 1 dup' } as any;
    const errors = validateTaskDef(task1, [task1, task2]);
    expect(errors.some(e => e.code === 'DUPLICATE_TASK_ID')).toBe(true);
  });
});
