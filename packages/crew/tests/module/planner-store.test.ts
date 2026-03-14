/**
 * Module Integration: Planner + Store
 * Tests that the Planner correctly writes milestone/task definitions into the store,
 * resolves dependencies, and handles fix plans.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HierarchicalStore } from '../../src/store/hierarchical-store.ts';
import { Planner } from '../../src/planner/planner.ts';
import type { PlannerStrategy, PlanInput } from '../../src/planner/types.ts';
import type { BuildContext, MilestoneDef } from '../../src/types.ts';

describe('Planner + Store Integration', () => {
  let testDir: string;
  let ctx: BuildContext;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'crew-planner-'));
    mkdirSync(join(testDir, '.crew'), { recursive: true });
    writeFileSync(join(testDir, '.crew', 'project.json'), JSON.stringify({
      version: 1, name: 'Planner Test', goal: 'Test planning',
      workflow: [], milestones: [], agents: [], skills: [],
      created: new Date().toISOString(), updated: new Date().toISOString(),
    }, null, 2));
    mkdirSync(join(testDir, '.crew', 'epics'), { recursive: true });
    ctx = { appDir: testDir };
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('creates milestones and tasks from strategy plan', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'test',
      createPlan: () => [
        {
          title: 'Setup',
          tasks: [
            { title: 'Init project', prompt: 'Initialize the project' },
            { title: 'Install deps', prompt: 'Install dependencies' },
          ],
        },
        {
          title: 'Build',
          tasks: [
            { title: 'Build app', prompt: 'Build the application' },
          ],
        },
      ],
      createFixTasks: () => [],
    };

    const planner = new Planner(ctx, strategy);
    const result = await planner.createInitialPlan({ projectDir: testDir });

    expect(result).toHaveLength(2);

    const store = new HierarchicalStore(testDir);
    const milestones = store.listMilestones();
    // Should have Foundation (M0) + 2 plan milestones
    expect(milestones.length).toBeGreaterThanOrEqual(3);

    // Check tasks created
    const setupMs = milestones.find(m => m.title === 'Setup');
    expect(setupMs).toBeDefined();
    const setupTasks = store.listTasksForMilestone(setupMs!);
    expect(setupTasks.length).toBe(2);
  });

  it('returns empty for empty plan strategy', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'empty',
      createPlan: () => [],
      createFixTasks: () => [],
    };

    const planner = new Planner(ctx, strategy);
    const result = await planner.createInitialPlan({ projectDir: testDir });
    expect(result).toEqual([]);
  });

  it('resolves plan-level task dependencies to store IDs', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'deps',
      createPlan: () => [
        {
          title: 'Pipeline',
          tasks: [
            { id: 'analyze', title: 'Analyze', prompt: 'Analyze code' },
            { id: 'build', title: 'Build', prompt: 'Build app', deps: ['analyze'] },
          ],
        },
      ],
      createFixTasks: () => [],
    };

    const planner = new Planner(ctx, strategy);
    await planner.createInitialPlan({ projectDir: testDir });

    const store = new HierarchicalStore(testDir);
    const milestones = store.listMilestones();
    const pipelineMs = milestones.find(m => m.title === 'Pipeline');
    const tasks = store.listTasksForMilestone(pipelineMs!);

    // Second task should have dependency on first task's store ID
    const buildTask = tasks.find(t => t.title === 'Build');
    expect(buildTask?.dependencies.length).toBeGreaterThan(0);
  });

  it('creates fix plan milestones from verification failures', async () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'fix',
      createPlan: () => [
        { title: 'Build', tasks: [{ title: 'Build app', prompt: 'Build' }] },
      ],
      createFixTasks: () => [
        { title: 'Fixes', tasks: [{ title: 'Fix TS errors', prompt: 'Fix them' }] },
      ],
    };

    const planner = new Planner(ctx, strategy);
    await planner.createInitialPlan({ projectDir: testDir });

    // Simulate fix plan creation
    const report = { passed: false, checks: [], issues: [{ check: 'tsc', message: 'err', severity: 'error' as const }] };
    const status = { name: 'Test', milestones: [{ id: 0, title: 'Foundation', tasks: [], complete: true }, { id: 1, title: 'Build', tasks: [], complete: true }] };

    const fixes = await planner.createFixPlan(report, status, { projectDir: testDir });
    expect(fixes).toHaveLength(1);

    const store = new HierarchicalStore(testDir);
    const milestones = store.listMilestones();
    expect(milestones.some(m => m.title === 'Fixes')).toBe(true);
  });

  it('delegates checksForMilestone to strategy', () => {
    const strategy: PlannerStrategy<PlanInput> = {
      name: 'checks',
      createPlan: () => [],
      createFixTasks: () => [],
      checksForMilestone: (id, title) => title.includes('Build') ? ['tsc', 'build'] : ['tsc'],
    };

    const planner = new Planner(ctx, strategy);
    expect(planner.checksForMilestone(1, 'Build Phase')).toEqual(['tsc', 'build']);
    expect(planner.checksForMilestone(2, 'Setup Phase')).toEqual(['tsc']);
  });
});
