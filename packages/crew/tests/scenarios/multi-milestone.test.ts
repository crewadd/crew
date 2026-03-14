/**
 * Scenario: Multi-Milestone Execution
 * Tests execution across multiple milestones with sequential gate requirements
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

describe('Multi-Milestone Scenario', () => {
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

  it('completes multi-page plan across milestones', async () => {
    await harness.init({ name: 'multi-page', goal: 'Multi-page site' });
    harness.createMultiPagePlan();
    await harness.plan();

    const initialStats = harness.store.getStats();
    expect(initialStats.milestones).toBeGreaterThanOrEqual(3); // 3 page milestones

    const results = await harness.runAll(30);

    // All tasks completed
    expect(results.every(r => r.status === 'completed')).toBe(true);
    const finalStats = harness.store.getStats();
    expect(finalStats.pending).toBe(0);
  });

  it('completes page pipeline (sequential within milestone)', async () => {
    await harness.init({ name: 'pipeline', goal: 'Page pipeline' });
    harness.createPagePipelinePlan();
    await harness.plan();

    const results = await harness.runAll(30);

    // All tasks should complete in sequential order
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });

  it('completes bootstrap workflow', async () => {
    await harness.init({ name: 'bootstrap', goal: 'Bootstrap project' });
    harness.createBootstrapPlan();
    await harness.plan();

    const results = await harness.runAll(20);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });
});
