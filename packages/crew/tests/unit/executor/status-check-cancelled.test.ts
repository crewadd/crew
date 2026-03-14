/**
 * Unit tests for status-check handling of cancelled tasks
 * Verifies that cancelled tasks are auto-reset on next `crew run next`
 */

import { describe, it, expect } from 'vitest';
import { resolveNextIntent, type StatusCheckStore } from '../../../src/status-check.ts';
import type { Task, Epic } from '../../../src/store/types.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEpic(num: number, taskIds: string[]): Epic {
  return {
    id: `epic-${num}`,
    number: num,
    title: `Epic ${num}`,
    task_ids: taskIds,
    status: 'planned',
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  } as Epic;
}

function makeTask(id: string, epicId: string, status: Task['status'], deps: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    status,
    epic_id: epicId,
    dependencies: deps,
    dependents: [],
    attempts: [],
    status_history: status === 'cancelled' ? [
      { from: 'pending', to: 'active', at: new Date().toISOString(), by: 'agent_crew' as `agent_${string}` },
      { from: 'active', to: 'cancelled', at: new Date().toISOString(), by: 'agent_crew' as `agent_${string}` },
    ] : [],
    created: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
    updated: { at: new Date().toISOString(), by: 'agent_test' as `agent_${string}` },
  } as Task;
}

function createStore(epics: Epic[], tasks: Task[]): StatusCheckStore {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  return {
    listEpics: () => epics,
    listAllTasks: () => tasks,
    getTask: (id: string) => taskMap.get(id) ?? null,
    getNextReady: (limit: number) => {
      const ready = tasks.filter(t =>
        t.status === 'pending' &&
        t.dependencies.every(d => {
          const dep = taskMap.get(d);
          return dep && dep.status === 'done';
        }),
      );
      return ready.slice(0, limit);
    },
    getEpic: (id: string) => epics.find(e => e.id === id) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('status-check cancelled task handling', () => {
  it('returns retry intent for a cancelled task with no other ready tasks', () => {
    const epic = makeEpic(1, ['t1']);
    const task = makeTask('t1', 'epic-1', 'cancelled');
    const store = createStore([epic], [task]);

    const intent = resolveNextIntent(store);

    expect(intent.action).toBe('retry');
    if (intent.action === 'retry') {
      expect(intent.task.id).toBe('t1');
      expect(intent.reason).toContain('cancelled');
    }
  });

  it('returns reset_and_run when cancelled task exists and another task is ready', () => {
    const epic = makeEpic(1, ['t1', 't2']);
    const cancelledTask = makeTask('t1', 'epic-1', 'cancelled');
    const pendingTask = makeTask('t2', 'epic-1', 'pending');
    const store = createStore([epic], [cancelledTask, pendingTask]);

    const intent = resolveNextIntent(store);

    expect(intent.action).toBe('reset_and_run');
    if (intent.action === 'reset_and_run') {
      expect(intent.stale.id).toBe('t1');
      expect(intent.next.id).toBe('t2');
      expect(intent.reason).toContain('cancelled');
    }
  });

  it('does not treat cancelled tasks as blocking', () => {
    const epic = makeEpic(1, ['t1', 't2']);
    const cancelledTask = makeTask('t1', 'epic-1', 'cancelled');
    const pendingTask = makeTask('t2', 'epic-1', 'pending');
    const store = createStore([epic], [cancelledTask, pendingTask]);

    const intent = resolveNextIntent(store);

    // Should not be 'block' — cancelled tasks are recoverable
    expect(intent.action).not.toBe('block');
  });
});
