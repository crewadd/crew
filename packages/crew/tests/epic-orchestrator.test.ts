import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CompoundEpic, CompoundStatus, BuildContext } from '../src/types.ts';
import type { OrchestratorEvent } from '../src/orchestrator/types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../src/orchestrator/types.ts';

// Mock compound.ts
const mockStatusJson = vi.fn<() => Promise<CompoundStatus>>();

vi.mock('../src/manager/index.ts', () => ({
  statusJson: (...args: any[]) => mockStatusJson(...args),
  editTask: vi.fn().mockResolvedValue(undefined),
  doneTask: vi.fn().mockResolvedValue(undefined),
  taskContext: vi.fn().mockResolvedValue('prompt'),
}));

// Mock executor
const mockExecuteBatchStreaming = vi.fn();

vi.mock('../src/executor/executor.ts', () => ({
  executeBatchStreaming: (...args: any[]) => mockExecuteBatchStreaming(...args),
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

import { EpicOrchestrator } from '../src/orchestrator/epic-orchestrator.ts';
import { Planner } from '../src/planner/planner.ts';
import type { PlannerStrategy, PlanInput } from '../src/planner/types.ts';

let tempDir: string;
let ctx: BuildContext;

const mockStrategy: PlannerStrategy<PlanInput> = {
  name: 'test',
  createPlan: () => [],
  createFixTasks: () => [],
  checksForEpic: () => ['tsc'],
};

const planner = new Planner(ctx, mockStrategy);
const input: PlanInput = { projectDir: '/app' };
const config = { ...DEFAULT_ORCHESTRATOR_CONFIG };

function makeEpic(complete = false): CompoundEpic {
  return {
    id: 1,
    title: 'Setup',
    tasks: complete ? [] : [
      { id: 'm1.1', title: 'Task A', status: 'pending' },
      { id: 'm1.2', title: 'Task B', status: 'pending', deps: ['m1.1'] },
    ],
    complete,
  };
}

async function collectEvents(gen: AsyncGenerator<OrchestratorEvent>): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('EpicOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'crew-test-'));
    ctx = { appDir: tempDir, compoundScript: join(tempDir, 'compound.ts') };
  });

  it('yields epic:start and epic:done', async () => {
    const ms = makeEpic();
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [{ ...ms, complete: true }],
    });
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orchestrator = new EpicOrchestrator(ctx, ms, planner, input, config);
    const events = await collectEvents(orchestrator.run());

    expect(events.some((e) => e.type === 'epic:start')).toBe(true);
    expect(events.some((e) => e.type === 'epic:done')).toBe(true);
  });

  it('skips execution when epic is already complete', async () => {
    const ms = makeEpic(true);
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [ms],
    });

    const orchestrator = new EpicOrchestrator(ctx, ms, planner, input, config);
    const events = await collectEvents(orchestrator.run());

    expect(mockExecuteBatchStreaming).not.toHaveBeenCalled();
    const done = events.find((e) => e.type === 'epic:done') as any;
    expect(done.result.success).toBe(true);
  });

  it('yields epic:verified after running checks', async () => {
    const ms = makeEpic();
    mockStatusJson.mockResolvedValue({
      name: 'Test',
      epics: [ms],
    });
    // Mock executor to yield nothing (tasks are "executed")
    mockExecuteBatchStreaming.mockReturnValue((async function* () {})());
    mockVerify.mockResolvedValue({ passed: true, checks: [], issues: [] });

    const orchestrator = new EpicOrchestrator(ctx, ms, planner, input, config);
    const events = await collectEvents(orchestrator.run());

    expect(events.some((e) => e.type === 'epic:verified')).toBe(true);
    const verified = events.find((e) => e.type === 'epic:verified') as any;
    expect(verified.report.passed).toBe(true);
  });

  it('yields epic:fix when verification fails', async () => {
    const ms = makeEpic();

    // First call: epic is not complete
    // Second call (after fix): epic is complete (to break loop)
    mockStatusJson
      .mockResolvedValueOnce({ name: 'Test', epics: [ms] })
      .mockResolvedValueOnce({ name: 'Test', epics: [ms] })
      .mockResolvedValueOnce({ name: 'Test', epics: [{ ...ms, complete: true }] });

    mockExecuteBatchStreaming.mockReturnValue((async function* () {})());
    mockVerify
      .mockResolvedValueOnce({
        passed: false,
        checks: [{ name: 'tsc', passed: false, issues: [{ check: 'tsc', message: 'error', severity: 'error' }] }],
        issues: [{ check: 'tsc', message: 'error', severity: 'error' }],
      })
      .mockResolvedValueOnce({ passed: true, checks: [], issues: [] });

    const orchestrator = new EpicOrchestrator(ctx, ms, planner, input, config);
    const events = await collectEvents(orchestrator.run());

    expect(events.some((e) => e.type === 'epic:fix')).toBe(true);
  });
});
