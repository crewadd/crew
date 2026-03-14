/**
 * Integration Test Harness
 * Provides a clean interface for testing the full crew CLI flow
 */

import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HierarchicalStore } from '../../../src/store/hierarchical-store.ts';
import { initProject } from '../../../src/cli/init-cmd.ts';
import { runPlanInit } from '../../../src/cli/plan-cmd.ts';
import { runTask } from '../../../src/cli/run-cmd.ts';
import { createBuildContext, nextTasks, statusJson } from '../../../src/manager/index.ts';
import type { CompoundTask, CompoundStatus } from '../../../src/types.ts';

export interface HarnessOptions {
  /** Mock agentfn function */
  mockAgent?: any;
  /** Copy fixture directory */
  fixtureDir?: string;
  /** Project name */
  projectName?: string;
  /** Project goal */
  projectGoal?: string;
}

export interface RunNextResult {
  taskId: string;
  status: 'completed' | 'failed' | 'no-tasks';
  error?: string;
}

/**
 * Integration Test Harness
 * Manages temp directory, CLI calls, and state inspection
 */
export class IntegrationHarness {
  public projectRoot!: string;
  public store!: HierarchicalStore;
  private mockAgent: any;
  private cleanupNeeded = false;

  constructor(mockAgent?: any) {
    this.mockAgent = mockAgent;
  }

  /**
   * Setup test environment
   * Creates temp directory and optionally copies fixture
   */
  async setup(opts: HarnessOptions = {}): Promise<void> {
    // Create temp directory
    this.projectRoot = mkdtempSync(join(tmpdir(), 'crew-integration-test-'));
    this.cleanupNeeded = true;

    // Copy fixture if provided (but skip crew.config.ts - we'll handle that separately)
    if (opts.fixtureDir && existsSync(opts.fixtureDir)) {
      const files = readdirSync(opts.fixtureDir);
      for (const file of files) {
        // Skip crew.config.ts - we'll create it programmatically
        if (file === 'crew.config.ts') continue;

        const srcPath = join(opts.fixtureDir, file);
        const destPath = join(this.projectRoot, file);

        if (existsSync(srcPath)) {
          cpSync(srcPath, destPath, { recursive: true });
        }
      }
    }

    // DON'T create store instance here - it creates .crew directory
    // which causes init() to skip. Store will be created after init().

    // Update mock agent if provided
    if (opts.mockAgent) {
      this.mockAgent = opts.mockAgent;
    }
  }

  /**
   * Cleanup test environment
   */
  async teardown(): Promise<void> {
    if (this.cleanupNeeded && existsSync(this.projectRoot)) {
      try {
        rmSync(this.projectRoot, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Failed to cleanup ${this.projectRoot}:`, err);
      }
    }
  }

  /**
   * Run crew init
   */
  async init(opts: { name?: string; goal?: string; force?: boolean } = {}): Promise<void> {
    const result = await initProject({
      dir: this.projectRoot,
      name: opts.name || 'test-project',
      goal: opts.goal || 'Test project goal',
      force: opts.force,
    });

    if (!result.success) {
      throw new Error(`Init failed: ${result.message}`);
    }

    // Refresh store
    this.store = new HierarchicalStore(this.projectRoot);
  }

  /**
   * Run crew plan init
   * Note: This requires .crew/setup/index.js with createPlan function
   */
  async plan(force = true): Promise<void> {
    // Ensure crew.json and .crew/setup/index.js exist - if not, create defaults
    const crewJson = join(this.projectRoot, 'crew.json');
    if (!existsSync(crewJson)) {
      this.createCrewJson();
    }

    const setupIndex = join(this.projectRoot, '.crew', 'setup', 'index.js');
    if (!existsSync(setupIndex)) {
      this.createSimplePlanSetup();
    }

    // Delete existing plan directory to ensure clean slate
    const planDir = join(this.projectRoot, '.crew', 'epics');
    if (existsSync(planDir)) {
      rmSync(planDir, { recursive: true, force: true });
    }

    // Force by default to reset any default epics created by init
    // This will call the createPlan function from .crew/setup/index.js
    await runPlanInit(this.projectRoot, force, false);

    // Refresh store
    this.store = new HierarchicalStore(this.projectRoot);

    // WORKAROUND: Mark all epic gates as completed
    // This ensures tasks can be executed in tests
    const epics = this.store.listEpics();
    for (const ms of epics) {
      if (ms.gates) {
        for (const gate of ms.gates) {
          if (gate.required && !gate.completed) {
            gate.completed = true;
          }
        }
        this.store.saveEpic(ms);
      }
    }

    // Refresh store again to pick up changes
    this.store = new HierarchicalStore(this.projectRoot);
  }

  /**
   * Run crew run next
   * Returns the task that was executed
   */
  async runNext(): Promise<RunNextResult> {
    // Always refresh store before getting next task
    this.store = new HierarchicalStore(this.projectRoot);

    const ctx = createBuildContext(this.projectRoot);

    // Get next task
    const result = await nextTasks(ctx);
    const nextVal = result.next;

    let task: CompoundTask | undefined;
    if (Array.isArray(nextVal)) {
      task = nextVal[0];
    } else if (nextVal && typeof nextVal === 'object' && 'id' in nextVal) {
      task = nextVal as CompoundTask;
    }

    if (!task) {
      return {
        taskId: '',
        status: 'no-tasks',
      };
    }

    const displayId = task.id;

    // Execute the task
    try {
      // Use real runTask command
      await runTask(this.projectRoot, displayId);

      // Force complete store reload by creating new instance
      this.store = new HierarchicalStore(this.projectRoot);

      return {
        taskId: displayId,
        status: 'completed',
      };
    } catch (err) {
      return {
        taskId: displayId,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Run all remaining tasks until complete
   * Returns array of all executed tasks
   */
  async runAll(maxIterations = 100): Promise<RunNextResult[]> {
    const results: RunNextResult[] = [];
    let iterations = 0;

    while (iterations < maxIterations) {
      const result = await this.runNext();

      if (result.status === 'no-tasks') {
        break;
      }

      results.push(result);
      iterations++;

      // Safety check
      if (iterations >= maxIterations) {
        throw new Error(`Exceeded max iterations (${maxIterations})`);
      }
    }

    return results;
  }

  /**
   * Get current project state
   */
  async getState(): Promise<{
    epics: number;
    tasks: number;
    completed: number;
    status: CompoundStatus;
  }> {
    const ctx = createBuildContext(this.projectRoot);
    const status = await statusJson(ctx);
    const stats = this.store.getStats();

    return {
      epics: stats.epics,
      tasks: stats.tasks,
      completed: stats.completed,
      status,
    };
  }

  /**
   * Create crew.json at project root
   */
  createCrewJson(): void {
    const crewJsonPath = join(this.projectRoot, 'crew.json');
    const crewJson = {
      name: 'Test Project',
      description: 'Integration test project',
      setup: '.crew/setup',
    };
    writeFileSync(crewJsonPath, JSON.stringify(crewJson, null, 2), 'utf-8');
  }

  /**
   * Create .crew/setup/index.js with simple test plan
   */
  createSimplePlanSetup(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Crew Setup - Integration Test
 * Simple plan with 2 epics and 5 tasks
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Test Project Plan');

  // Epic 1: Setup (2 tasks with linear dependency)
  const m1 = ctx.createEpic('setup', 'Setup');
  m1.addTask(
    ctx.createTask('t1', 'Create directory structure')
      .prompt('Create the basic directory structure for the project')
  );
  m1.addTask(
    ctx.createTask('t2', 'Create package.json')
      .deps(['t1'])
      .prompt('Create package.json file')
  );
  plan.addEpic(m1);

  // Epic 2: Implementation (3 tasks with parallel + convergence pattern)
  const m2 = ctx.createEpic('implementation', 'Implementation');
  m2.addTask(
    ctx.createTask('t3', 'Create index.ts')
      .deps(['t2'])
      .prompt('Create main index.ts file')
  );
  m2.addTask(
    ctx.createTask('t4', 'Create utils.ts')
      .deps(['t2'])
      .prompt('Create utils.ts file')
  );
  m2.addTask(
    ctx.createTask('t5', 'Create tests')
      .deps(['t3', 't4'])
      .prompt('Create test files')
  );
  plan.addEpic(m2);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create .crew/setup/index.js with concurrent plan
   */
  createConcurrentPlanSetup(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Crew Setup - Concurrent Test (no quality gates for testing)
 * Plan with parallel tasks for concurrency testing
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Concurrent Test Plan');

  // Epic 1: Foundation (1 task)
  const m1 = ctx.createEpic('foundation', 'Foundation');
  m1.addTask(
    ctx.createTask('init', 'Initialize project')
      .type('coding')
      .prompt('Initialize the project structure')
  );
  plan.addEpic(m1);

  // Epic 2: Parallel Work (4 tasks that can run in parallel)
  const m2 = ctx.createEpic('parallel', 'Parallel Work');
  m2.addTask(
    ctx.createTask('task_a', 'Task A')
      .type('coding')
      .deps(['init'])
      .prompt('Execute task A')
  );
  m2.addTask(
    ctx.createTask('task_b', 'Task B')
      .type('coding')
      .deps(['init'])
      .prompt('Execute task B')
  );
  m2.addTask(
    ctx.createTask('task_c', 'Task C')
      .type('coding')
      .deps(['init'])
      .prompt('Execute task C')
  );
  m2.addTask(
    ctx.createTask('task_d', 'Task D')
      .type('coding')
      .deps(['init'])
      .prompt('Execute task D')
  );
  plan.addEpic(m2);

  // Epic 3: Convergence (1 task that depends on all parallel tasks)
  const m3 = ctx.createEpic('convergence', 'Convergence');
  m3.addTask(
    ctx.createTask('finalize', 'Finalize project')
      .type('coding')
      .deps(['task_a', 'task_b', 'task_c', 'task_d'])
      .prompt('Finalize the project')
  );
  plan.addEpic(m3);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create bootstrap plan (install → fix → verify)
   */
  createBootstrapPlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Bootstrap Plan - Install and fix errors (no quality gates for testing)
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Bootstrap Plan');

  const m1 = ctx.createEpic('bootstrap', 'Bootstrap');

  m1.addTask(
    ctx.createTask('install', 'Install dependencies')
      .type('coding')
      .prompt('Install project dependencies')
  );

  m1.addTask(
    ctx.createTask('fix-errors', 'Fix transpile errors')
      .type('coding')
      .deps(['install'])
      .prompt('Fix any transpile errors')
  );

  m1.addTask(
    ctx.createTask('verify-bootstrap', 'Type check after fixes')
      .type('verify')
      .deps(['fix-errors'])
      .prompt('Verify the bootstrap process')
      .execute(async (taskCtx) => ({
        success: true,
        durationMs: 0,
        output: 'Verification passed'
      }))
  );

  plan.addEpic(m1);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create page pipeline plan (analyze → plan → build → verify)
   */
  createPagePipelinePlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Page Pipeline Plan - Single page with deterministic pipeline (no quality gates for testing)
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Page Pipeline Plan');

  const m1 = ctx.createEpic('page-homepage', 'Page: Homepage');

  m1.addTask(
    ctx.createTask('homepage:analyze', 'Analyze Homepage')
      .type('planning')
      .prompt('Analyze the homepage structure')
  );

  m1.addTask(
    ctx.createTask('homepage:plan-components', 'Plan components')
      .type('coding')
      .deps(['homepage:analyze'])
      .prompt('Plan component split strategy')
  );

  m1.addTask(
    ctx.createTask('homepage:build-components', 'Build components')
      .type('coding')
      .deps(['homepage:plan-components'])
      .prompt('Build the components')
  );

  m1.addTask(
    ctx.createTask('homepage:analyze-animations', 'Analyze animations')
      .type('planning')
      .deps(['homepage:build-components'])
      .prompt('Analyze page animations')
  );

  m1.addTask(
    ctx.createTask('homepage:implement-animations', 'Implement animations')
      .type('coding')
      .deps(['homepage:analyze-animations'])
      .prompt('Implement the animations')
  );

  m1.addTask(
    ctx.createTask('homepage:verify', 'Verify Homepage')
      .type('verify')
      .deps(['homepage:implement-animations'])
      .prompt('Verify the homepage implementation')
      .execute(async (taskCtx) => ({
        success: true,
        durationMs: 0,
        output: 'Page verified'
      }))
  );

  plan.addEpic(m1);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create multi-page plan
   */
  createMultiPagePlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Multi-page Plan - Multiple pages in parallel (no quality gates for testing)
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Multi-page Plan');

  const pages = ['homepage', 'about', 'contact'];

  for (const page of pages) {
    const m = ctx.createEpic(\`page-\${page}\`, \`Page: \${page}\`);

    m.addTask(
      ctx.createTask(\`\${page}:build\`, \`Build \${page}\`)
        .type('coding')
        .prompt(\`Build the \${page} page\`)
    );

    plan.addEpic(m);
  }

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create lazy component plan
   */
  createLazyComponentPlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Lazy Component Plan - Planning task creates component tasks
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Lazy Component Plan');

  const m1 = ctx.createEpic('page', 'Page');

  m1.addTask(
    ctx.createTask('plan-components', 'Plan components')
      .prompt('Plan component split strategy')
  );

  // In real implementation, component tasks would be created
  // dynamically after plan-components completes

  plan.addEpic(m1);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create check plan (tasks with checks)
   */
  createCheckPlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Check Plan - Tasks with checks
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Check Plan');

  const m1 = ctx.createEpic('build', 'Build');

  m1.addTask(
    ctx.createTask('build-page', 'Build page')
      .ofType('coding')
      .prompt('Build the page with TypeScript')
      .check('tsc', { autoFix: true, maxRetries: 3 })
  );

  plan.addEpic(m1);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create full pipeline plan (bootstrap → pages → integration)
   */
  createFullPipelinePlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Full Pipeline Plan - Complete workflow
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Full Pipeline Plan');

  // Bootstrap
  const m1 = ctx.createEpic('bootstrap', 'Bootstrap');
  m1.addTask(
    ctx.createTask('install', 'Install')
      .prompt('Install dependencies')
  );
  plan.addEpic(m1);

  // Pages
  const m2 = ctx.createEpic('page-homepage', 'Homepage');
  m2.addTask(
    ctx.createTask('page:build', 'Build page')
      .deps(['install'])
      .prompt('Build homepage')
  );
  plan.addEpic(m2);

  // Integration
  const m3 = ctx.createEpic('integration', 'Integration');
  m3.addTask(
    ctx.createTask('integration:verify', 'Final verification')
      .check('tsc')
      .check('build')
      .deps(['page:build'])
  );
  plan.addEpic(m3);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Create simple plan (alias for createSimplePlanSetup)
   */
  createSimplePlan(): void {
    this.createSimplePlanSetup();
  }

  /**
   * Create dependency plan
   */
  createDependencyPlan(): void {
    const setupDir = join(this.projectRoot, '.crew', 'setup');
    mkdirSync(setupDir, { recursive: true });

    const setupIndexPath = join(setupDir, 'index.js');
    const setupContent = `/**
 * Dependency Plan - Linear dependencies (no quality gates for testing)
 */

export async function createPlan(ctx) {
  const plan = ctx.createPlan('Dependency Plan');

  const m1 = ctx.createEpic('tasks', 'Tasks');

  m1.addTask(
    ctx.createTask('task-a', 'Task A')
      .type('coding')
      .prompt('Execute task A')
  );

  m1.addTask(
    ctx.createTask('task-b', 'Task B')
      .type('coding')
      .deps(['task-a'])
      .prompt('Execute task B')
  );

  m1.addTask(
    ctx.createTask('task-c', 'Task C')
      .type('coding')
      .deps(['task-b'])
      .prompt('Execute task C')
  );

  plan.addEpic(m1);

  return plan.build();
}
`;
    writeFileSync(setupIndexPath, setupContent, 'utf-8');
  }

  /**
   * Get the .crew directory path
   */
  get crewDir(): string {
    return join(this.projectRoot, '.crew');
  }
}
