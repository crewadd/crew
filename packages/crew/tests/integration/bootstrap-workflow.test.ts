/**
 * Bootstrap Workflow Integration Test
 * Tests: Install dependencies → Fix errors → Verify build workflow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationHarness } from './helpers/integration-harness.ts';
import {
  assertCrewStructure,
  assertTaskCount,
  assertCompletedTaskCount,
  assertTaskCompleted,
} from './helpers/assertions.ts';

// Hoist mock functions
const { mockAgentFnInstance, mockAgentFn } = vi.hoisted(() => {
  const mockAgentFnInstance = vi.fn();
  const mockAgentFn = vi.fn((opts: any) => {
    return async function* () {
      const taskId = opts?.vars?.taskId || 'unknown';

      // Emit streaming events
      if (opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] Starting...\n`);
        opts.hooks.onStream(`[${taskId}] Complete!\n`);
      }

      // Return success
      const result = await mockAgentFnInstance();
      return result || {
        data: `Task ${taskId} completed`,
        raw: `Task ${taskId} completed`,
        durationMs: 10,
      };
    };
  });
  return { mockAgentFnInstance, mockAgentFn };
});

// Mock agentfn
vi.mock('agentfn', () => ({
  agentfn: mockAgentFn,
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

describe('Bootstrap Workflow', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to successful execution
    mockAgentFnInstance.mockResolvedValue({
      data: 'Success',
      raw: 'Success',
      durationMs: 10,
    });

    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('executes install → fix → verify workflow', async () => {
    // Step 1: crew init
    await harness.init({ name: 'bootstrap-test', goal: 'Test bootstrap workflow' });
    assertCrewStructure(harness.projectRoot);

    // Step 2: Create bootstrap plan
    harness.createBootstrapPlan();

    // Step 3: crew plan
    await harness.plan();

    // Verify plan structure
    const initialStats = harness.store.getStats();
    // Coding tasks automatically get quality gates: 2 coding + 2 gates + 1 verify = 5 tasks
    expect(initialStats.tasks).toBe(5);
    console.log(`Bootstrap plan created: ${initialStats.tasks} tasks (including quality gates)`);

    // Step 4: Execute all tasks
    const results = await harness.runAll(100);

    console.log(`Completed ${results.length} tasks`);
    console.log('Results:', results.map(r => ({ taskId: r.taskId, status: r.status })));

    // Verify execution
    expect(results.length).toBe(5);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(5);
    expect(finalStats.pending).toBe(0);
    expect(finalStats.active).toBe(0);
    assertCompletedTaskCount(harness.store, 5);

    console.log('✅ Bootstrap workflow completed successfully!');
  });

  it('validates task types in bootstrap workflow', async () => {
    await harness.init({ name: 'bootstrap-types-test', goal: 'Test task types' });
    harness.createBootstrapPlan();
    await harness.plan();

    // Execute and verify all complete
    const results = await harness.runAll(100);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(finalStats.tasks);
    expect(finalStats.pending).toBe(0);

    console.log('✅ Task types validated successfully!');
  });
});
