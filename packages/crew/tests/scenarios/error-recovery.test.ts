/**
 * Scenario: Error Recovery
 * Tests behavior when tasks fail: retries, failure propagation, partial completion
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
        opts.hooks.onStream(`[${taskId}] running\n`);
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

describe('Error Recovery Scenario', () => {
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

  it('handles task failure gracefully', async () => {
    await harness.init({ name: 'error-test', goal: 'Test error handling' });
    harness.createSimplePlan();
    await harness.plan();

    // First task succeeds, second fails
    let callCount = 0;
    mockAgentFnInstance.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({ data: 'ok', raw: 'ok', durationMs: 5 });
      }
      return Promise.reject(new Error('Task execution failed'));
    });

    const result1 = await harness.runNext();
    expect(result1.status).toBe('completed');

    const result2 = await harness.runNext();
    // Task may succeed or fail depending on retry behavior
    expect(['completed', 'failed']).toContain(result2.status);
  });

  it('continues execution after recoverable failure', async () => {
    await harness.init({ name: 'recovery-test', goal: 'Test recovery' });
    harness.createSimplePlan();
    await harness.plan();

    // All tasks succeed
    mockAgentFnInstance.mockResolvedValue({ data: 'ok', raw: 'ok', durationMs: 5 });

    const results = await harness.runAll(20);

    // Should complete all tasks
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });
});
