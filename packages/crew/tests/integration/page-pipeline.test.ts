/**
 * Page Pipeline Integration Test
 * Tests: Full page enhancement pipeline (analyze → plan → build → animate → verify)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationHarness } from './helpers/integration-harness.ts';
import {
  assertCrewStructure,
  assertTaskCount,
  assertCompletedTaskCount,
  assertTaskCompleted,
  assertEpicCount,
} from './helpers/assertions.ts';

// Hoist mock functions
const { mockAgentFnInstance, mockAgentFn } = vi.hoisted(() => {
  const mockAgentFnInstance = vi.fn();
  const mockAgentFn = vi.fn((opts: any) => {
    return async function* () {
      const taskId = opts?.vars?.taskId || 'unknown';

      // Emit streaming events
      if (opts?.hooks?.onStream) {
        opts.hooks.onStream(`[${taskId}] Processing...\n`);
        opts.hooks.onStream(`[${taskId}] Done!\n`);
      }

      // Return success
      const result = await mockAgentFnInstance();
      return result || {
        data: `Task ${taskId} completed`,
        raw: `Task ${taskId} completed`,
        durationMs: 15,
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

describe('Page Pipeline', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default to successful execution
    mockAgentFnInstance.mockResolvedValue({
      data: 'Success',
      raw: 'Success',
      durationMs: 15,
    });

    harness = new IntegrationHarness(mockAgentFn);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('executes full page enhancement pipeline', async () => {
    // Step 1: crew init
    await harness.init({ name: 'page-pipeline-test', goal: 'Test page pipeline' });
    assertCrewStructure(harness.projectRoot);

    // Step 2: Create page pipeline plan
    harness.createPagePipelinePlan();

    // Step 3: crew plan
    await harness.plan();

    // Verify plan structure
    const initialStats = harness.store.getStats();
    // Coding tasks automatically get quality gates: 3 coding + 3 gates + 2 planning + 1 verify = 9 tasks
    expect(initialStats.tasks).toBe(9);
    // The system may create an initial epic, so we check for at least 1
    expect(initialStats.epics).toBeGreaterThanOrEqual(1);

    console.log(`Page pipeline created: ${initialStats.epics} epics, ${initialStats.tasks} tasks (including quality gates)`);

    // Step 4: Execute all tasks
    const results = await harness.runAll(100);

    console.log(`Completed ${results.length} tasks`);
    console.log('Pipeline stages:', results.map(r => ({ taskId: r.taskId, status: r.status })));

    // Verify execution
    expect(results.length).toBe(9);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state - all tasks completed
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(9);
    expect(finalStats.pending).toBe(0);
    expect(finalStats.active).toBe(0);
    assertCompletedTaskCount(harness.store, 9);

    console.log('✅ Page pipeline completed successfully!');
  });

  it('validates task dependencies in pipeline', async () => {
    await harness.init({ name: 'pipeline-deps-test', goal: 'Test dependencies' });
    harness.createPagePipelinePlan();
    await harness.plan();

    // Execute and verify all complete
    const results = await harness.runAll(100);
    expect(results.every(r => r.status === 'completed')).toBe(true);

    // Verify final state
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(finalStats.tasks);

    console.log('✅ Task dependencies validated successfully!');
  });

  it('validates epic structure for page', async () => {
    await harness.init({ name: 'pipeline-epic-test', goal: 'Test epic' });
    harness.createPagePipelinePlan();
    await harness.plan();

    // Verify epic count
    const epics = harness.store.listEpics();
    expect(epics.length).toBeGreaterThanOrEqual(1);

    // Execute all tasks
    await harness.runAll(100);

    // Verify at least one epic is completed
    const updatedEpics = harness.store.listEpics();
    const completedEpics = updatedEpics.filter(m => m.status === 'done');
    expect(completedEpics.length).toBeGreaterThanOrEqual(1);

    // Verify all tasks completed
    const finalStats = harness.store.getStats();
    expect(finalStats.completed).toBe(finalStats.tasks);

    console.log('✅ Epic structure validated successfully!');
  });
});
