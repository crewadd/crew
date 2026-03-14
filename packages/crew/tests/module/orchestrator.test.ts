/**
 * Module Integration: Orchestrators (Project + Milestone)
 * Tests the orchestrator event flow with mocked executor/verifier/store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompoundStatus, BuildContext } from '../../src/types.ts';
import type { OrchestratorEvent } from '../../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../../src/orchestrator/types.ts';

/* ---- Mocks ---- */

const mockStatusJson = vi.fn<() => Promise<CompoundStatus>>();
const mockCreateMilestone = vi.fn().mockResolvedValue(undefined);
const mockAddTask = vi.fn().mockResolvedValue('m1.1');

vi.mock('../../src/manager/index.ts', () => ({
  statusJson: (...args: any[]) => mockStatusJson(...args),
  createMilestone: (...args: any[]) => mockCreateMilestone(...args),
  addTask: (...args: any[]) => mockAddTask(...args),
  editTask: vi.fn().mockResolvedValue(undefined),
  doneTask: vi.fn().mockResolvedValue(undefined),
  taskContext: vi.fn().mockResolvedValue('prompt'),
}));

vi.mock('../../src/executor/executor.ts', () => ({
  executeBatchStreaming: vi.fn(function* () {}),
}));

const mockVerify = vi.fn();
vi.mock('../../src/verifier/verifier.ts', () => ({
  verify: (...args: any[]) => mockVerify(...args),
}));

vi.mock('../../src/config-loader.ts', () => ({
  loadConfig: vi.fn().mockResolvedValue({ config: { hooks: {} } }),
}));

const mockListMilestones = vi.fn().mockReturnValue([]);
const mockListTasksForMilestone = vi.fn().mockReturnValue([]);
vi.mock('../../src/store/hierarchical-store.ts', () => ({
  HierarchicalStore: class MockHierarchicalStore {
    listMilestones() { return mockListMilestones(); }
    listTasksForMilestone() { return mockListTasksForMilestone(); }
    getMilestoneByNumber() { return null; }
    getTask() { return null; }
    getProject() { return { name: 'Test', goal: '' }; }
    listAllTasks() { return []; }
    getMilestone() { return null; }
    createMilestoneDir() {}
    createTaskDir() {}
    saveMilestone() {}
    saveTask() {}
  },
}));

vi.mock('../../src/executor/task-adapter.ts', () => ({
  createMilestoneTransitionContext: vi.fn(),
  createTools: vi.fn(),
}));

import { ProjectOrchestrator } from '../../src/orchestrator/project-orchestrator.ts';
import { MilestoneOrchestrator } from '../../src/orchestrator/milestone-orchestrator.ts';
import { Planner } from '../../src/planner/planner.ts';
import type { PlannerStrategy, PlanInput } from '../../src/planner/types.ts';

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

/* ------------------------------------------------------------------ */
/*  ProjectOrchestrator                                                */
/* ------------------------------------------------------------------ */

describe('ProjectOrchestrator', () => {
  let tempDir: string;
  let ctx: BuildContext;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-orch-'));
    ctx = { appDir: tempDir };
  });

  it('yields start → planned → done for empty plan', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test', createPlan: () => [], createFixTasks: () => [],
    };
    const orch = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(orch.run());

    expect(events[0].type).toBe('project:start');
    expect(events[1].type).toBe('project:planned');
    expect(events[2].type).toBe('project:done');
    expect((events[2] as any).result.success).toBe(true);
  });

  it('runs milestones and verification', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [{ title: 'Setup', tasks: [{ title: 'Init', prompt: 'Init', group: 'setup' }] }],
      createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        { id: 1, title: 'Setup', tasks: [{ id: 'm1.1', title: 'Init', status: 'pending' }], complete: false },
      ],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orch = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(orch.run());

    expect(events.some(e => e.type === 'project:planned')).toBe(true);
    expect(events.some(e => e.type === 'project:verified')).toBe(true);
    expect(events.some(e => e.type === 'project:done')).toBe(true);
  });

  it('triggers fix plan on verification failure', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [{ title: 'Build', tasks: [{ title: 'Build', prompt: 'Build', group: 'build' }] }],
      createFixTasks: () => [{ title: 'Fix', tasks: [{ title: 'Fix err', prompt: 'Fix', group: 'fix' }] }],
    };

    const statusPending = {
      name: 'Test',
      milestones: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        { id: 1, title: 'Build', tasks: [{ id: 'm1.1', title: 'Build', status: 'pending' }], complete: false },
      ],
    };
    const statusDone = {
      name: 'Test',
      milestones: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        { id: 1, title: 'Build', tasks: [{ id: 'm1.1', title: 'Build', status: 'done' }], complete: true },
      ],
    };

    mockStatusJson
      .mockRejectedValueOnce(new Error('no plan'))
      .mockResolvedValueOnce(statusPending)
      .mockResolvedValueOnce(statusPending)
      .mockResolvedValueOnce(statusDone)
      .mockResolvedValueOnce(statusDone)
      .mockResolvedValue(statusDone);

    mockVerify
      .mockResolvedValueOnce({ passed: true, checks: [], issues: [] })
      .mockResolvedValueOnce({ passed: false, checks: [], issues: [{ check: 'tsc', message: 'err', severity: 'error' }] })
      .mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orch = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir }, { maxProjectIterations: 2 });
    const events = await collectEvents(orch.run());

    expect(events.some(e => e.type === 'project:fix')).toBe(true);
  });

  it('skips planning when skipPlanning=true', async () => {
    const createPlan = vi.fn(() => []);
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test', createPlan, createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [{ id: 1, title: 'Existing', tasks: [{ id: 'm1.1', title: 'T', status: 'pending' }], complete: false }],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orch = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir }, { skipPlanning: true });
    const events = await collectEvents(orch.run());

    expect(createPlan).not.toHaveBeenCalled();
    expect(events.some(e => e.type === 'project:planned')).toBe(false);
    expect(events.some(e => e.type === 'project:done')).toBe(true);
  });

  it('resumes from a specific milestone', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test', createPlan: () => [], createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      milestones: [
        { id: 1, title: 'M1', tasks: [], complete: true },
        { id: 2, title: 'M2', tasks: [{ id: 'm2.1', title: 'T', status: 'pending' }], complete: false },
        { id: 3, title: 'M3', tasks: [{ id: 'm3.1', title: 'T', status: 'pending' }], complete: false },
      ],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orch = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(orch.run({ from: 'milestone', milestoneId: 3 }));

    const starts = events.filter(e => e.type === 'milestone:start') as any[];
    expect(starts.every((s: any) => s.milestoneId >= 3)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  MilestoneOrchestrator                                              */
/* ------------------------------------------------------------------ */

describe('MilestoneOrchestrator', () => {
  let tempDir: string;
  let ctx: BuildContext;

  const mockStrategy: PlannerStrategy<PlanInput> = {
    name: 'test', createPlan: () => [], createFixTasks: () => [],
    checksForMilestone: () => ['tsc'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-ms-orch-'));
    ctx = { appDir: tempDir };
  });

  it('yields milestone:start and milestone:done', async () => {
    const ms = { id: 1, title: 'Setup', tasks: [{ id: 'm1.1', title: 'A', status: 'pending' }], complete: false };

    mockStatusJson.mockResolvedValue({ name: 'Test', milestones: [{ ...ms, complete: true }] });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const planner = new Planner(ctx, mockStrategy);
    const orch = new MilestoneOrchestrator(ctx, ms, planner, { projectDir: '/app' }, DEFAULT_ORCHESTRATOR_CONFIG);
    const events = await collectEvents(orch.run());

    expect(events.some(e => e.type === 'milestone:start')).toBe(true);
    expect(events.some(e => e.type === 'milestone:done')).toBe(true);
  });

  it('skips execution when milestone already complete', async () => {
    const ms = { id: 1, title: 'Done', tasks: [], complete: true };

    mockStatusJson.mockResolvedValue({ name: 'Test', milestones: [ms] });

    const { executeBatchStreaming } = await import('../../src/executor/executor.ts');
    const planner = new Planner(ctx, mockStrategy);
    const orch = new MilestoneOrchestrator(ctx, ms, planner, { projectDir: '/app' }, DEFAULT_ORCHESTRATOR_CONFIG);
    const events = await collectEvents(orch.run());

    expect(executeBatchStreaming).not.toHaveBeenCalled();
    const done = events.find(e => e.type === 'milestone:done') as any;
    expect(done.result.success).toBe(true);
  });
});
