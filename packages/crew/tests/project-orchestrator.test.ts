import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompoundStatus, BuildContext } from '../src/types.ts';
import type { OrchestratorEvent } from '../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../src/orchestrator/types.ts';

// Mock compound.ts
const mockStatusJson = vi.fn<() => Promise<CompoundStatus>>();
const mockCreateEpic = vi.fn().mockResolvedValue(undefined);
const mockAddTask = vi.fn().mockResolvedValue('m1.1');

vi.mock('../src/manager/index.ts', () => ({
  statusJson: (...args: any[]) => mockStatusJson(...args),
  createEpic: (...args: any[]) => mockCreateEpic(...args),
  addTask: (...args: any[]) => mockAddTask(...args),
  editTask: vi.fn().mockResolvedValue(undefined),
  doneTask: vi.fn().mockResolvedValue(undefined),
  taskContext: vi.fn().mockResolvedValue('prompt'),
}));

// Mock executor
vi.mock('../src/executor/executor.ts', () => ({
  executeBatchStreaming: vi.fn().mockReturnValue((async function* () {})()),
}));

// Mock verifier
const mockVerify = vi.fn();

vi.mock('../src/verifier/verifier.ts', () => ({
  verify: (...args: any[]) => mockVerify(...args),
}));

// Mock config-loader
vi.mock('../src/config-loader.ts', () => ({
  loadConfig: vi.fn().mockResolvedValue({ config: { hooks: {} } }),
}));

// Mock hierarchical store
const mockListEpics = vi.fn().mockReturnValue([]);
const MockHierarchicalStore = vi.fn().mockImplementation(() => ({
  listEpics: mockListEpics,
  listTasksForEpic: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/store/hierarchical-store.ts', () => ({
  HierarchicalStore: MockHierarchicalStore,
}));

// Mock task-adapter
vi.mock('../src/executor/task-adapter.ts', () => ({
  createEpicTransitionContext: vi.fn(),
  createTools: vi.fn(),
}));

import { ProjectOrchestrator } from '../src/orchestrator/project-orchestrator.ts';
import type { PlannerStrategy, PlanInput } from '../src/planner/types.ts';

let tempDir: string;
let ctx: BuildContext;

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('ProjectOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-test-'));
    ctx = { appDir: tempDir, compoundScript: join(tempDir, 'compound.ts') };
  });

  it('yields project:start, project:planned, project:done for empty plan', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [],
      createFixTasks: () => [],
    };

    const orchestrator = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(orchestrator.run());

    expect(events[0].type).toBe('project:start');
    expect(events[1].type).toBe('project:planned');
    expect(events[2].type).toBe('project:done');
    const done = events[2] as any;
    expect(done.result.success).toBe(true);
  });

  it('runs epics and verifies project', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [
        { title: 'Setup', tasks: [{ title: 'Init', prompt: 'Init project', group: 'setup' }] },
      ],
      createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        {
          id: 1,
          title: 'Setup',
          tasks: [{ id: 'm1.1', title: 'Init', status: 'pending' }],
          complete: false,
        },
      ],
    });

    // Epic verify passes, project verify passes
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orchestrator = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(orchestrator.run());

    expect(events.some((e) => e.type === 'project:planned')).toBe(true);
    expect(events.some((e) => e.type === 'project:verified')).toBe(true);
    expect(events.some((e) => e.type === 'project:done')).toBe(true);

    const done = events.find((e) => e.type === 'project:done') as any;
    expect(done.result.success).toBe(true);
  });

  it('creates fix plan when project verification fails', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [
        { title: 'Setup', tasks: [{ title: 'Init', prompt: 'Init project', group: 'setup' }] },
      ],
      createFixTasks: () => [
        { title: 'Fix', tasks: [{ title: 'Fix errors', prompt: 'Fix it', group: 'fix' }] },
      ],
    };

    const statusWithPending = {
      name: 'Test',
      epics: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        { id: 1, title: 'Setup', tasks: [{ id: 'm1.1', title: 'Init', status: 'pending' }], complete: false },
      ],
    };
    const statusAllDone = {
      name: 'Test',
      epics: [
        { id: 0, title: 'Foundation', tasks: [], complete: true },
        { id: 1, title: 'Setup', tasks: [{ id: 'm1.1', title: 'Init', status: 'done' }], complete: true },
      ],
    };

    // Calls flow:
    // 0. Planner.createInitialPlan: statusJson (idempotency check — no tasks yet)
    // 1. ProjectOrchestrator: statusJson (get epics)
    // 2. EpicOrchestrator: statusJson (refresh)
    // 3. EpicOrchestrator: statusJson (for fix plan after epic verify fail — or just complete)
    // 4. ProjectOrchestrator: statusJson (for fix plan after project verify fail)
    // 5. Second iteration: statusJson (get epics)
    mockStatusJson
      .mockRejectedValueOnce(new Error('no existing plan'))  // 0: Planner idempotency check (fresh)
      .mockResolvedValueOnce(statusWithPending)  // 1: ProjectOrchestrator gets epics
      .mockResolvedValueOnce(statusWithPending)  // 2: EpicOrchestrator refreshes
      .mockResolvedValueOnce(statusAllDone)      // 3: EpicOrchestrator statusJson for epic fix (if needed)
      .mockResolvedValueOnce(statusAllDone)      // 4: ProjectOrchestrator statusJson for fix plan
      .mockResolvedValue(statusAllDone);         // 5+: second iteration and beyond

    // Epic verify: pass. Project verify: fail first, pass second.
    mockVerify
      .mockResolvedValueOnce({ passed: true, checks: [], issues: [] }) // epic verify
      .mockResolvedValueOnce({ passed: false, checks: [], issues: [{ check: 'tsc', message: 'err', severity: 'error' }] }) // project verify 1
      .mockResolvedValue({ passed: true, checks: [], issues: [] }); // all subsequent

    const orchestrator = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir }, { maxProjectIterations: 2 });
    const events = await collectEvents(orchestrator.run());

    expect(events.some((e) => e.type === 'project:fix')).toBe(true);
  });

  it('skips planning when skipPlanning is true', async () => {
    const createPlan = vi.fn(() => []);
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan,
      createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [
        { id: 1, title: 'Existing', tasks: [{ id: 'm1.1', title: 'Task', status: 'pending' }], complete: false },
      ],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orchestrator = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir }, { skipPlanning: true });
    const events = await collectEvents(orchestrator.run());

    // Should NOT call createPlan
    expect(createPlan).not.toHaveBeenCalled();
    // Should NOT yield project:planned
    expect(events.some((e) => e.type === 'project:planned')).toBe(false);
    // Should still execute epics and yield project:done
    expect(events.some((e) => e.type === 'project:start')).toBe(true);
    expect(events.some((e) => e.type === 'project:done')).toBe(true);
  });

  it('respects resume from epic', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [],
      createFixTasks: () => [],
    };

    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [
        { id: 1, title: 'M1', tasks: [], complete: true },
        { id: 2, title: 'M2', tasks: [{ id: 'm2.1', title: 'Task', status: 'pending' }], complete: false },
        { id: 3, title: 'M3', tasks: [{ id: 'm3.1', title: 'Task', status: 'pending' }], complete: false },
      ],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orchestrator = new ProjectOrchestrator(ctx, strategy, { projectDir: ctx.appDir });
    const events = await collectEvents(
      orchestrator.run({ from: 'epic', epicId: 3 }),
    );

    // Should skip M1 and M2 — only M3 should have epic:start
    const starts = events.filter((e) => e.type === 'epic:start') as any[];
    expect(starts.every((s: any) => s.epicId >= 3)).toBe(true);
  });
});
