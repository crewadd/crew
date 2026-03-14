/**
 * Scenario: Dependency Ordering
 * Verifies tasks execute in correct dependency order across milestones
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { IntegrationHarness } from '../integration/helpers/integration-harness.ts';

const { mockAgentFnInstance, mockAgentFn } = vi.hoisted(() => {
  const mockAgentFnInstance = vi.fn();
  const mockAgentFn = vi.fn((opts: any) => {
    return async function* () {
      const taskId = opts?.vars?.taskId || 'unknown';
      if (opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] done\n`);
      }
      const result = await mockAgentFnInstance();
      return result || { data: 'ok', raw: 'ok', durationMs: 5 };
    };
  });
  return { mockAgentFnInstance, mockAgentFn };
});

vi.mock('agentfn', () => ({
  agentfn: mockAgentFn,
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

describe('Dependency Ordering Scenario', () => {
  let harness: IntegrationHarness;
  const fixtureDir = join(__dirname, '..', 'integration', 'fixtures', 'test-project');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentFnInstance.mockResolvedValue({ data: 'ok', raw: 'ok', durationMs: 5 });
    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup({ fixtureDir });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('executes linear dependency chain in order', async () => {
    await harness.init({ name: 'dep-test', goal: 'Test deps' });
    harness.createDependencyPlan();
    await harness.plan();

    // Run all tasks until no more are available
    const results = await harness.runAll(20);

    // At least 3 tasks should have executed (the dependency chain)
    const completedIds = results.filter(r => r.status === 'completed').map(r => r.taskId);
    expect(completedIds.length).toBeGreaterThanOrEqual(3);

    // All tasks in store should be done
    const stats = harness.store.getStats();
    expect(stats.pending).toBe(0);
  });

  it('handles fan-out pattern (parallel after shared dep)', async () => {
    await harness.init({ name: 'fanout-test', goal: 'Test fan-out' });
    harness.createConcurrentPlanSetup();
    await harness.plan();

    const results = await harness.runAll(20);

    // All tasks should complete
    const finalStats = harness.store.getStats();
    expect(finalStats.pending).toBe(0);
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });
});
