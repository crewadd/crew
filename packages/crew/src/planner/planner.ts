import {
  createEpic,
  addTask,
  statusJson,
} from '../manager/index.ts';
import type {
  BuildContext,
  CompoundStatus,
  EpicDef,
  VerificationReport,
} from '../types.ts';
import type { PlanInput, PlannerStrategy } from './types.ts';
import { resolve, join } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';

/**
 * Planner — delegates to a PlannerStrategy for heuristic decisions,
 * handles the mechanics of writing epics/tasks to the crew store.
 */
export class Planner<TInput extends PlanInput> {
  constructor(
    private ctx: BuildContext,
    private strategy: PlannerStrategy<TInput>,
  ) {}

  /**
   * Create the initial plan: generate epic definitions via the strategy,
   * then write them to the crew store.
   */
  async createInitialPlan(input: TInput): Promise<EpicDef[]> {
    const epics = this.strategy.createPlan(input);

    if (epics.length === 0) return [];

    // Guard: if project already has epics with tasks, don't append duplicates.
    try {
      const existing = await statusJson(this.ctx);
      const hasTasks = existing.epics.some((ms) => ms.tasks.length > 0);
      if (hasTasks) return epics;
    } catch {
      // No existing plan yet — proceed with creation
    }

    // M0 Foundation placeholder removed - start epics from 1
    // await createEpic(this.ctx, 0, 'Foundation');

    // Write epics + tasks
    // First pass: Create all tasks and build ID mapping
    const idMap = new Map<string, string>(); // plan ID -> actual task ID (display ID like m1.1)

    for (let mi = 0; mi < epics.length; mi++) {
      const m = epics[mi];
      const num = mi + 1;
      await createEpic(this.ctx, num, m.title);

      for (let ti = 0; ti < m.tasks.length; ti++) {
        const task = m.tasks[ti];

        // Apply default constraints (sequential by default)
        task.constraints = {
          sequential: true,  // Default: tasks run in order
          ...task.constraints,  // Override if specified
        };

        // Auto-wire sequential dependencies
        if (task.constraints.sequential !== false && ti > 0) {
          const prevTask = m.tasks[ti - 1];
          if (prevTask.id) {
            task.deps = [...(task.deps || []), prevTask.id];
          }
        }

        // Handle promptTemplateFile (resolve at plan time)
        if (task.promptTemplateFile) {
          const setupDir = join(this.ctx.appDir, '.crew/setup');
          const resolvedPrompt = await this.loadPromptTemplate(
            setupDir,
            task.promptTemplateFile,
            task.vars || {}
          );
          task.prompt = resolvedPrompt;
          // Clear template reference after resolution
          delete task.promptTemplateFile;
        }

        // Handle executors: code string or external file
        let executorFile: string | undefined;

        if (task.executorCode) {
          // Generate executor file from code string
          const msDir = `${num.toString().padStart(2, '0')}-${this.slugify(m.title)}`;
          const taskIndex = m.tasks.indexOf(task);
          const taskDirName = `${(taskIndex + 1).toString().padStart(2, '0')}-${this.slugify(task.title)}`;
          const taskDir = join(this.ctx.appDir, '.crew', 'epics', msDir, 'tasks', taskDirName);

          // Ensure directory exists
          const { mkdirSync, writeFileSync } = await import('node:fs');
          mkdirSync(taskDir, { recursive: true });

          const executorContent = `/**
 * Auto-generated executor from code string
 * Task: ${task.title}
 */

${task.executorCode}
`;

          const executorDest = join(taskDir, 'executor.js');
          writeFileSync(executorDest, executorContent, 'utf-8');
          executorFile = 'executor.js';

        } else if (task.executorFilePath) {
          // Copy external executor file
          const setupDir = join(this.ctx.appDir, '.crew/setup');
          const executorSource = resolve(setupDir, task.executorFilePath);

          if (existsSync(executorSource)) {
            // Find task directory - need to compute the same slug as addTask will use
            const msDir = `${num.toString().padStart(2, '0')}-${this.slugify(m.title)}`;
            const taskIndex = m.tasks.indexOf(task);
            const taskDirName = `${(taskIndex + 1).toString().padStart(2, '0')}-${this.slugify(task.title)}`;
            const taskDir = join(this.ctx.appDir, '.crew', 'epics', msDir, 'tasks', taskDirName);

            // Ensure directory exists (will be created by addTask, but we need it now)
            const { mkdirSync } = await import('node:fs');
            mkdirSync(taskDir, { recursive: true });

            const executorDest = join(taskDir, 'executor.js');
            copyFileSync(executorSource, executorDest);
            executorFile = 'executor.js';
          }
        }

        // Create task WITHOUT dependencies initially
        const displayId = await addTask(this.ctx, task.title, {
          epic: num,
          type: task.type,  // Preserve task type
          input: task.input,
          output: task.output,
          deps: [], // Will resolve in second pass
          prompt: task.prompt,
          executorFile,
          vars: task.vars, // Pass vars for executor templating
          planId: task.id,
          skills: task.skills, // Pass skills for task execution
          yields: task.yields, // Pass yields for incremental planning
        });

        // Map plan ID to display ID
        if (task.id) {
          idMap.set(task.id, displayId);
        }
      }
    }

    // Second pass: Resolve and update dependencies
    const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
    const store = new HierarchicalStore(this.ctx.appDir, {}, this.ctx.planDir);

    for (let mi = 0; mi < epics.length; mi++) {
      const m = epics[mi];
      const num = mi + 1;
      const epic = store.getEpicByNumber(num);
      if (!epic) continue;

      for (const task of m.tasks) {
        const displayId = task.id ? idMap.get(task.id) : undefined;
        if (!displayId) continue;

        const storeTask = store.getTaskByDisplayId(displayId);
        if (!storeTask) continue;

        // Resolve dependencies from plan IDs to actual task IDs
        const resolvedDeps: string[] = [];
        for (const depPlanId of task.deps || []) {
          const depDisplayId = idMap.get(depPlanId);
          if (depDisplayId) {
            const depTask = store.getTaskByDisplayId(depDisplayId);
            if (depTask) {
              resolvedDeps.push(depTask.id);
            }
          }
        }

        if (resolvedDeps.length > 0) {
          storeTask.dependencies = resolvedDeps as import('../store/types.ts').TaskId[];

          // Update dependents for all dependencies
          for (const depId of resolvedDeps) {
            const dep = store.getTask(depId as import('../store/types.ts').TaskId);
            if (dep) {
              if (!dep.dependents) dep.dependents = [];
              if (!dep.dependents.includes(storeTask.id)) {
                dep.dependents.push(storeTask.id);
                const depLocation = store.getTaskLocation(depId as import('../store/types.ts').TaskId);
                if (depLocation) {
                  store.saveTask(dep, depLocation.epic);
                }
              }
            }
          }

          store.saveTask(storeTask, epic);
        }
      }
    }

    return epics;
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  /**
   * Load and interpolate prompt template at plan time
   */
  private async loadPromptTemplate(
    setupDir: string,
    templatePath: string,
    vars: Record<string, unknown>
  ): Promise<string> {
    const { readFileSync } = await import('node:fs');

    // 1. Resolve template path (relative to .crew/setup)
    const templateSource = resolve(setupDir, templatePath);

    if (!existsSync(templateSource)) {
      throw new Error(`Prompt template not found: ${templatePath}`);
    }

    // 2. Read template content
    let template = readFileSync(templateSource, 'utf-8');

    // 3. Interpolate variables: {{varName}} → value
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      template = template.replace(placeholder, String(value));
    }

    return template;
  }

  /**
   * Create fix epics from a failed verification report.
   * Delegates to the strategy for domain-specific fix logic.
   */
  async createFixPlan(
    report: VerificationReport,
    currentStatus: CompoundStatus,
    input: TInput,
  ): Promise<EpicDef[]> {
    const fixes = await this.strategy.createFixTasks(report, currentStatus, input);

    if (fixes.length === 0) return [];

    // Determine next epic number from current status
    const nextNum = currentStatus.epics.length;

    for (let fi = 0; fi < fixes.length; fi++) {
      const m = fixes[fi];
      const num = nextNum + fi;
      await createEpic(this.ctx, num, m.title);

      for (const task of m.tasks) {
        // Handle promptTemplateFile (resolve at plan time)
        if (task.promptTemplateFile) {
          const setupDir = join(this.ctx.appDir, '.crew/setup');
          const resolvedPrompt = await this.loadPromptTemplate(
            setupDir,
            task.promptTemplateFile,
            task.vars || {}
          );
          task.prompt = resolvedPrompt;
          // Clear template reference after resolution
          delete task.promptTemplateFile;
        }

        // Handle executor: inline function or external file
        let executorFile: string | undefined;

        if (task.executorFilePath) {
          // Copy external executor file
          const setupDir = join(this.ctx.appDir, '.crew/setup');
          const executorSource = resolve(setupDir, task.executorFilePath);

          if (existsSync(executorSource)) {
            const msDir = `${num.toString().padStart(2, '0')}-${this.slugify(m.title)}`;
            const taskIndex = m.tasks.indexOf(task);
            const taskDirName = `${(taskIndex + 1).toString().padStart(2, '0')}-${this.slugify(task.title)}`;
            const taskDir = join(this.ctx.appDir, '.crew', 'epics', msDir, 'tasks', taskDirName);

            const { mkdirSync } = await import('node:fs');
            mkdirSync(taskDir, { recursive: true });

            const executorDest = join(taskDir, 'executor.js');
            copyFileSync(executorSource, executorDest);
            executorFile = 'executor.js';
          }
        }

        await addTask(this.ctx, task.title, {
          epic: num,
          type: task.type,  // Preserve task type
          input: task.input,
          output: task.output,
          deps: task.deps,
          prompt: task.prompt,
          executorFile,
          vars: task.vars, // Pass vars for executor templating
        });
      }
    }

    return fixes;
  }

  /**
   * Get which checks should run for a given epic.
   */
  checksForEpic(id: number, title: string): string[] | undefined {
    return this.strategy.checksForEpic?.(id, title);
  }
}
