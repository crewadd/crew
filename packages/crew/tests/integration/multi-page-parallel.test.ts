/**
 * Multi-Page Parallel Integration Test
 * Tests: Building multiple pages in parallel with independent epics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationHarness } from './helpers/integration-harness.ts';
import {
  assertCrewStructure,
  assertTaskCount,
  assertCompletedTaskCount,
  assertEpicCount,
  assertTaskCompleted,
  assertEpicCompleted,
} from './helpers/assertions.ts';

// Hoist mock functions
const { mockAgentFnInstance, mockAgentFn } = vi.hoisted(() => {
  const mockAgentFnInstance = vi.fn();
  const mockAgentFn = vi.fn((opts: any) => {
    return async function* () {
      const taskId = opts?.vars?.taskId || 'unknown';

      // Emit streaming events
      if (opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] Building page...\n`);
        opts.hooks.onStream(`[${taskId}] Page complete!\n`);
      }

      // Return success
      const result = await mockAgentFnInstance();
      return result || {
        data: `Task ${taskId} completed`,
        raw: `Task ${taskId} completed`,
        durationMs: 20,
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

describe('Multi-Page Parallel Execution', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to successful execution
    mockAgentFnInstance.mockResolvedValue({
      data: 'Success',
      raw: 'Success',
      durationMs: 20,
    });

    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('builds multiple pages in parallel', async () => {
    // Step 1: crew init
    await harness.init({ name: 'multi-page-test', goal: 'Build multiple pages' });
    assertCrewStructure(harness.projectRoot);

    // Step 2: Create multi-page plan (3 pages: homepage, about, contact)
    harness.createMultiPagePlan();

    // Step 3: crew plan
    await harness.plan();

    // Verify plan structure
    const initialStats = harness.store.getStats();
    // Coding tasks automatically get quality gates: 3 coding + 3 gates = 6 tasks
    // Plus Foundation epic (M0) with no tasks
    expect(initialStats.tasks).toBe(6);
    expect(initialStats.epics).toBe(4); // 4 epics (Foundation + 3 pages)
    assertEpicCount(harness.store, 4);

    console.log(`Multi-page plan created: ${initialStats.epics} epics, ${initialStats.tasks} tasks (including quality gates)`);

    // Step 4: Execute all tasks
    const results = await harness.runAll(100);

    console.log(`Completed ${results.length} page tasks`);
    console.log('Pages built:', results.map(r => ({ taskId: r.taskId, status: r.status })));

    // Verify execution
    expect(results.length).toBe(6);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(6);
    expect(finalStats.pending).toBe(0);
    expect(finalStats.active).toBe(0);
    assertCompletedTaskCount(harness.store, 6);

    console.log('✅ Multiple pages built successfully!');
  });

  it('validates independent epic execution', async () => {
    await harness.init({ name: 'independent-epics-test', goal: 'Test independent epics' });
    harness.createMultiPagePlan();
    await harness.plan();

    // Get all epics
    const epics = harness.store.listEpics();
    expect(epics.length).toBe(4); // Foundation + 3 pages

    // Execute all tasks (including quality gates)
    const results = await harness.runAll(100);
    expect(results.length).toBe(6); // 3 page tasks + 3 quality gates
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify all epics are now complete (Foundation + 3 pages = 4)
    const updatedEpics = harness.store.listEpics();
    const completedEpics = updatedEpics.filter(m => m.status === 'done');
    expect(completedEpics.length).toBe(4);

    console.log('✅ Independent epics validated!');
  });

  it('tracks progress across multiple epics', async () => {
    await harness.init({ name: 'progress-tracking-test', goal: 'Track multi-epic progress' });
    harness.createMultiPagePlan();
    await harness.plan();

    const initialStats = harness.store.getStats();
    console.log('Initial stats:', initialStats);

    // Execute all tasks
    const results = await harness.runAll(100);
    expect(results.length).toBe(6); // 3 page tasks + 3 quality gates
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(6);
    expect(finalStats.pending).toBe(0);

    console.log('✅ Progress tracking validated!');
  });

  it('verifies scheduler can handle parallel-ready tasks', async () => {
    await harness.init({ name: 'scheduler-test', goal: 'Test scheduler with parallel tasks' });
    harness.createMultiPagePlan();
    await harness.plan();

    // Get initial stats
    const stats = harness.store.getStats();
    expect(stats.pending).toBe(6); // 3 page tasks + 3 quality gates

    // Execute all tasks
    const results = await harness.runAll(100);
    expect(results.length).toBe(6);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify all tasks completed
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(6);

    console.log('✅ Scheduler parallel handling validated!');
  });
});
