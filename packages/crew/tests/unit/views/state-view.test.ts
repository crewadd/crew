/**
 * Unit tests for views/state-view
 * Tests: generateStateJson — produces correct JSON summary
 */

import { describe, it, expect } from 'vitest';
import { generateStateJson } from '../../../src/views/state-view.ts';
import type { ViewableStore } from '../../../src/views/types.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeStore(overrides: Partial<ViewableStore> = {}): ViewableStore {
  return {
    getProject: () => ({
      version: 1,
      name: 'Test',
      goal: 'Test goal',
      workflow: [],
      milestones: [],
      agents: [],
      skills: [],
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    }),
    listMilestones: () => [],
    listAllTasks: () => [],
    ...overrides,
  } as ViewableStore;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('generateStateJson', () => {
  it('produces valid JSON', () => {
    const json = generateStateJson(makeStore());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes project name and goal', () => {
    const json = JSON.parse(generateStateJson(makeStore()));
    expect(json.project.name).toBe('Test');
    expect(json.project.goal).toBe('Test goal');
  });

  it('includes milestone data', () => {
    const store = makeStore({
      listMilestones: () => [{
        id: 'ms_1' as any,
        version: 1,
        number: 1,
        title: 'Foundation',
        status: 'active' as const,
        task_ids: [],
        gates: [],
        created: { at: '', by: 'agent_x' as any },
        updated: { at: '', by: 'agent_x' as any },
      }],
    });
    const json = JSON.parse(generateStateJson(store));
    expect(json.milestones).toHaveLength(1);
    expect(json.milestones[0].title).toBe('Foundation');
  });

  it('includes task data with status', () => {
    const store = makeStore({
      listAllTasks: () => [{
        id: 'task_a' as any,
        version: 1,
        title: 'Build page',
        status: 'done' as const,
        status_history: [],
        milestone_id: 'ms_1' as any,
        dependencies: [],
        dependents: [],
        attempts: [],
        created: { at: '', by: 'agent_x' as any },
        updated: { at: '', by: 'agent_x' as any },
      }],
    });
    const json = JSON.parse(generateStateJson(store));
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].status).toBe('done');
  });

  it('handles null project gracefully', () => {
    const store = makeStore({ getProject: () => null });
    const json = JSON.parse(generateStateJson(store));
    expect(json.project.name).toBe('Unknown');
  });
});
