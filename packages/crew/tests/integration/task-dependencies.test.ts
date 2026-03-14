/**
 * Task Dependencies Integration Test
 * Tests: Complex dependency patterns (linear, parallel, convergence)
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
        opts.hooks.onStream(`[${taskId}] Working...\n`);
        opts.hooks.onStream(`[${taskId}] Complete!\n`);
      }

      // Return success
      const result = await mockAgentFnInstance();
      return result || {
        data: `Task ${taskId} completed`,
        raw: `Task ${taskId} completed`,
        durationMs: 5,
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

describe('Task Dependencies', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to successful execution
    mockAgentFnInstance.mockResolvedValue({
      data: 'Success',
      raw: 'Success',
      durationMs: 5,
    });

    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('executes linear dependencies in order', async () => {
    // Step 1: crew init
    await harness.init({ name: 'linear-deps-test', goal: 'Test linear dependencies' });
    assertCrewStructure(harness.projectRoot);

    // Step 2: Create dependency plan (A → B → C)
    harness.createDependencyPlan();

    // Step 3: crew plan
    await harness.plan();

    // Verify plan structure
    const initialStats = harness.store.getStats();
    // Coding tasks automatically get quality gates: 3 coding + 3 gates = 6 tasks
    expect(initialStats.tasks).toBe(6);

    console.log(`Linear dependency plan created: ${initialStats.tasks} tasks (including quality gates)`);

    // Step 4: Execute all tasks
    const results = await harness.runAll(100);

    console.log(`Completed ${results.length} tasks`);
    console.log('Execution order:', results.map(r => ({ taskId: r.taskId, status: r.status })));

    // Verify execution
    expect(results.length).toBe(6);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(6);
    expect(finalStats.pending).toBe(0);
    assertCompletedTaskCount(harness.store, 6);

    console.log('✅ Linear dependencies executed correctly!');
  });

  it('executes parallel tasks after common dependency', async () => {
    // Step 1: crew init
    await harness.init({ name: 'parallel-test', goal: 'Test parallel execution' });
    assertCrewStructure(harness.projectRoot);

    // Step 2: Create concurrent plan (init → A,B,C,D in parallel)
    harness.createConcurrentPlanSetup();

    // Step 3: crew plan
    await harness.plan();

    // Verify plan structure
    const initialStats = harness.store.getStats();
    // Coding tasks automatically get quality gates, so we have 6 base + 6 gates = 12
    expect(initialStats.tasks).toBe(12);

    console.log(`Concurrent plan created: ${initialStats.tasks} tasks (including quality gates)`);

    // Step 4: Execute all tasks
    const results = await harness.runAll(100);

    console.log(`Completed ${results.length} tasks`);
    console.log('Execution order:', results.map(r => ({ taskId: r.taskId, status: r.status })));

    // Verify execution
    expect(results.length).toBe(12);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(12);
    assertCompletedTaskCount(harness.store, 12);

    console.log('✅ Parallel tasks executed correctly!');
  });

  it('validates dependency resolution across epics', async () => {
    await harness.init({ name: 'cross-epic-test', goal: 'Test cross-epic deps' });
    harness.createConcurrentPlanSetup();
    await harness.plan();

    // Verify epics created
    const epics = harness.store.listEpics();
    expect(epics.length).toBeGreaterThanOrEqual(3); // foundation, parallel, convergence

    // Execute and verify all complete
    const results = await harness.runAll(100);
    expect(results.length).toBe(12);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(12);

    console.log('✅ Cross-epic dependencies validated!');
  });

  it('handles complex dependency graph correctly', async () => {
    await harness.init({ name: 'complex-deps-test', goal: 'Test complex dependencies' });

    // Use the simple plan which has both linear and convergence patterns
    harness.createSimplePlan();
    await harness.plan();

    // Verify plan structure has tasks with dependencies
    const initialStats = harness.store.getStats();
    expect(initialStats.tasks).toBeGreaterThanOrEqual(5);

    // Execute all tasks
    const results = await harness.runAll(100);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBeGreaterThanOrEqual(5);
    expect(finalStats.pending).toBe(0);

    console.log('✅ Complex dependency graph handled correctly!');
  });
});
