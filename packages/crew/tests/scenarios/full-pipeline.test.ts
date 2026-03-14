/**
 * Scenario: Full Pipeline
 * Tests the complete flow: init → plan → execute all tasks → verify completion
 * Uses the IntegrationHarness with mock agent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { IntegrationHarness } from '../integration/helpers/integration-harness.ts';
import { assertCrewStructure } from '../integration/helpers/assertions.ts';

const { mockAgentFnInstance, mockAgentFn } = vi.hoisted(() => {
  const mockAgentFnInstance = vi.fn();
  const mockAgentFn = vi.fn((opts: any) => {
    return async function* () {
      const taskId = opts?.vars?.taskId || 'unknown';
      if (opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] Working...\n`);
      }
      const result = await mockAgentFnInstance();
      return result || { data: `Done ${taskId}`, raw: `Done ${taskId}`, durationMs: 10 };
    };
  });
  return { mockAgentFnInstance, mockAgentFn };
});

vi.mock('agentfn', () => ({
  agentfn: mockAgentFn,
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

describe('Full Pipeline Scenario', () => {
  let harness: IntegrationHarness;
  const fixtureDir = join(__dirname, '..', 'integration', 'fixtures', 'test-project');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentFnInstance.mockResolvedValue({ data: 'Success', raw: 'Success', durationMs: 10 });
    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup({ fixtureDir });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('completes all tasks from init to finish', async () => {
    // Init
    await harness.init({ name: 'pipeline-test', goal: 'Full pipeline test' });
    assertCrewStructure(harness.projectRoot);

    // Plan
    await harness.plan();

    const initialStats = harness.store.getStats();
    expect(initialStats.tasks).toBeGreaterThan(0);

    // Execute all
    const results = await harness.runAll(50);

    expect(results.length).toBe(initialStats.tasks);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(initialStats.tasks);
    expect(finalStats.pending).toBe(0);
    expect(finalStats.active).toBe(0);
  });
});
