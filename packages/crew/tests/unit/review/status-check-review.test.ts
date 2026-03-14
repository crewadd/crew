/**
 * Unit tests for resolveNextIntent with awaiting_review status
 */

import { describe, it, expect } from 'vitest';
import { resolveNextIntent, formatIntent, type StatusCheckStore } from '../../../src/status-check.ts';
import type { Task, Epic } from '../../../src/store/types.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const now = new Date().toISOString();
const agent = 'agent_test' as `agent_${string}`;

function makeEpic(id: string, num: number, taskIds: string[]): Epic {
  return {
    id: id as `epic_${string}`,
    version: 1,
    number: num,
    title: `Epic ${num}`,
    status: 'active',
    task_ids: taskIds as `task_${string}`[],
    gates: [],
    created: { at: now, by: agent },
    updated: { at: now, by: agent },
  };
}

function makeTask(
  id: string,
  epicId: string,
  status: Task['status'],
  deps: string[] = [],
): Task {
  return {
    id: id as `task_${string}`,
    version: 1,
    title: `Task ${id}`,
    status,
    status_history: [{ from: 'pending' as any, to: status, at: now, by: agent }],
    epic_id: epicId as `epic_${string}`,
    dependencies: deps as `task_${string}`[],
    dependents: [],
    attempts: [],
    created: { at: now, by: agent },
    updated: { at: now, by: agent },
  };
}

function createStore(epics: Epic[], tasks: Task[]): StatusCheckStore {
  const epicMap = new Map(epics.map(e => [e.id, e]));
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  return {
    listEpics: () => epics,
    listAllTasks: () => tasks,
    getTask: (id: string) => taskMap.get(id as any) ?? null,
    getNextReady: (limit: number) => {
      const ready = tasks.filter(t => {
        if (t.status !== 'pending') return false;
        return t.dependencies.every(d => {
          const dep = taskMap.get(d);
          return dep && dep.status === 'done';
        });
      });
      return ready.slice(0, limit);
    },
    getEpic: (id: string) => epicMap.get(id as any) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('resolveNextIntent with awaiting_review', () => {
  it('reports awaiting_review when only remaining tasks are in review', () => {
    const epic = makeEpic('epic_1', 1, ['task_1', 'task_2']);
    const tasks = [
      makeTask('task_1', 'epic_1', 'done'),
      makeTask('task_2', 'epic_1', 'awaiting_review' as Task['status']),
    ];

    const store = createStore([epic], tasks);
    const intent = resolveNextIntent(store);

    expect(intent.action).toBe('awaiting_review');
    if (intent.action === 'awaiting_review') {
      expect(intent.tasks).toHaveLength(1);
      expect(intent.tasks[0].id).toBe('task_2');
    }
  });

  it('continues with other tasks when some are awaiting review', () => {
    const epic = makeEpic('epic_1', 1, ['task_1', 'task_2', 'task_3']);
    const tasks = [
      makeTask('task_1', 'epic_1', 'done'),
      makeTask('task_2', 'epic_1', 'awaiting_review' as Task['status']),
      makeTask('task_3', 'epic_1', 'pending'), // This is ready (no deps)
    ];

    const store = createStore([epic], tasks);
    const intent = resolveNextIntent(store);

    expect(intent.action).toBe('run');
    if (intent.action === 'run') {
      expect(intent.task.id).toBe('task_3');
      expect(intent.reason).toContain('await review');
    }
  });

  it('reports multiple tasks awaiting review', () => {
    const epic = makeEpic('epic_1', 1, ['task_1', 'task_2', 'task_3']);
    const tasks = [
      makeTask('task_1', 'epic_1', 'done'),
      makeTask('task_2', 'epic_1', 'awaiting_review' as Task['status']),
      makeTask('task_3', 'epic_1', 'awaiting_review' as Task['status']),
    ];

    const store = createStore([epic], tasks);
    const intent = resolveNextIntent(store);

    expect(intent.action).toBe('awaiting_review');
    if (intent.action === 'awaiting_review') {
      expect(intent.tasks).toHaveLength(2);
    }
  });

  it('formatIntent shows review instructions', () => {
    const epic = makeEpic('epic_1', 1, ['task_1']);
    const tasks = [
      makeTask('task_1', 'epic_1', 'awaiting_review' as Task['status']),
    ];

    const store = createStore([epic], tasks);
    const intent = resolveNextIntent(store);
    const output = formatIntent(intent);

    expect(output).toContain('AWAITING REVIEW');
    expect(output).toContain('review approve');
    expect(output).toContain('review reject');
  });
});
