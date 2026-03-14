import { statusJson, createEpic, addTask } from '../manager/index.ts';
import { computeBatches } from '../executor/scheduler.ts';
import { executeBatchStreaming } from '../executor/executor.ts';
import { verify } from '../verifier/verifier.ts';
import type { Planner } from '../planner/planner.ts';
import type { PlanInput } from '../planner/types.ts';
import type {
  BuildContext,
  CompoundEpic,
  EpicResult,
  TaskResult,
} from '../types.ts';
import type { SpawnedTask } from '../tasks/types.ts';
import type { OrchestratorEvent, ResumePoint, OrchestratorConfig } from './types.ts';

/**
 * EpicOrchestrator — executes a single epic in an execute→verify→fix loop.
 * Yields epic + task level events as an async generator.
 */
export class EpicOrchestrator<TInput extends PlanInput> {
  constructor(
    private ctx: BuildContext,
    private ms: CompoundEpic,
    private planner: Planner<TInput>,
    private input: TInput,
    private config: OrchestratorConfig,
  ) {}

  async *run(resume?: ResumePoint): AsyncGenerator<OrchestratorEvent> {
    const { maxEpicIterations } = this.config;
    const taskResults: TaskResult[] = [];

    // Load project hooks
    const { loadConfig } = await import('../config-loader.ts');
    const loaded = await loadConfig(this.ctx.appDir);
    const projectHooks = loaded?.config?.hooks || {};

    // Get previous epic (if this is not the first iteration)
    const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
    const { createEpicTransitionContext, createTools } = await import('../executor/task-adapter.ts');

    const store = new HierarchicalStore(this.ctx.appDir);
    const allEpics = store.listEpics();
    const currentMsIndex = allEpics.findIndex(m => m.number === this.ms.id);
    const prevEpic = currentMsIndex > 0 ? allEpics[currentMsIndex - 1] : null;

    // Call beforeSwitchEpic hook (only if there's a previous epic)
    if (projectHooks.beforeSwitchEpic && prevEpic) {
      try {
        const prevTasks = store.listTasksForEpic(prevEpic);
        // For nextTasks, we need to find the current epic in the store
        const currentEpicInStore = allEpics[currentMsIndex];
        const nextTasks = currentEpicInStore ? store.listTasksForEpic(currentEpicInStore) : [];

        // Get project context
        const status = await statusJson(this.ctx);
        const project = {
          name: status.name || 'Unknown Project',
          title: status.name || 'Unknown Project',
          vars: {},
        };

        // Create tools
        const tools = createTools(this.ctx);

        const transitionCtx = createEpicTransitionContext(
          prevEpic,
          prevTasks,
          // Convert CompoundEpic to store Epic format
          {
            id: `epic_${this.ms.id}` as import('../store/types.ts').EpicId,
            number: currentMsIndex + 1,
            title: this.ms.title,
            task_ids: nextTasks.map((t: any) => t.id as import('../store/types.ts').TaskId),
            gates: [],
            version: 1,
            status: 'planned' as const,
            created: { at: new Date().toISOString(), by: 'agent_system' as import('../store/types.ts').AgentId },
            updated: { at: new Date().toISOString(), by: 'agent_system' as import('../store/types.ts').AgentId },
          },
          nextTasks,
          this.ctx,
          project,
          tools,
          {}
        );

        console.log(`[epic-orchestrator] Running beforeSwitchEpic hook (M${prevEpic.number} → M${currentMsIndex + 1})...`);
        await projectHooks.beforeSwitchEpic(transitionCtx);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[epic-orchestrator] beforeSwitchEpic hook failed: ${err.message}`);
        yield {
          type: 'epic:blocked',
          epicId: this.ms.id,
          error: err.message,
        };
        return;
      }
    }

    for (let iter = 1; iter <= maxEpicIterations; iter++) {
      yield {
        type: 'epic:start',
        epicId: this.ms.id,
        title: this.ms.title,
        iteration: iter,
      };

      // Refresh state
      const freshStatus = await statusJson(this.ctx);
      const fresh = freshStatus.epics.find((m) => m.id === this.ms.id);
      if (!fresh || fresh.complete) {
        yield {
          type: 'epic:done',
          epicId: this.ms.id,
          result: this.buildResult(taskResults, true, iter),
        };
        return;
      }

      // Execute tasks (parallel batches, task-level retry)
      yield* this.executeTasks(fresh, resume);
      resume = undefined; // clear after first use

      // Verify epic
      const checks = this.planner.checksForEpic(this.ms.id, this.ms.title);
      const report = await verify(this.ctx, { only: checks, epicId: this.ms.id });
      yield {
        type: 'epic:verified',
        epicId: this.ms.id,
        report,
        iteration: iter,
      };

      if (report.passed) {
        // Call afterSwitchEpic hook before yielding done
        if (projectHooks.afterSwitchEpic) {
          const nextEpic = currentMsIndex < allEpics.length - 1
            ? allEpics[currentMsIndex + 1]
            : null;

          if (nextEpic) {
            try {
              const currentEpicInStore = allEpics[currentMsIndex];
              const currentTasks = currentEpicInStore ? store.listTasksForEpic(currentEpicInStore) : [];
              const nextTasks = store.listTasksForEpic(nextEpic);

              // Get project context
              const status = await statusJson(this.ctx);
              const project = {
                name: status.name || 'Unknown Project',
                title: status.name || 'Unknown Project',
                vars: {},
              };

              // Create tools
              const tools = createTools(this.ctx);

              const transitionCtx = createEpicTransitionContext(
                // Convert CompoundEpic to store Epic format
                {
                  id: `epic_${this.ms.id}` as import('../store/types.ts').EpicId,
                  number: currentMsIndex + 1,
                  title: this.ms.title,
                  task_ids: currentTasks.map((t: any) => t.id as import('../store/types.ts').TaskId),
                  gates: [],
                  version: 1,
                  status: 'completed' as const,
                  created: { at: new Date().toISOString(), by: 'agent_system' as import('../store/types.ts').AgentId },
                  updated: { at: new Date().toISOString(), by: 'agent_system' as import('../store/types.ts').AgentId },
                },
                currentTasks,
                nextEpic,
                nextTasks,
                this.ctx,
                project,
                tools,
                {}
              );

              console.log(`[epic-orchestrator] Running afterSwitchEpic hook (M${currentMsIndex + 1} → M${nextEpic.number})...`);
              await projectHooks.afterSwitchEpic(transitionCtx);
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              console.error(`[epic-orchestrator] afterSwitchEpic hook failed: ${err.message}`);
              // Don't block on afterSwitchEpic failure
            }
          }
        }

        yield {
          type: 'epic:done',
          epicId: this.ms.id,
          result: this.buildResult(taskResults, true, iter),
        };
        return;
      }

      // Create fix tasks
      if (iter < maxEpicIterations) {
        const currentStatus = await statusJson(this.ctx);
        const fixes = await this.planner.createFixPlan(report, currentStatus, this.input);
        const fixTasks = fixes.flatMap((m) => m.tasks);
        yield {
          type: 'epic:fix',
          epicId: this.ms.id,
          fixTasks,
          iteration: iter,
        };
      }
    }

    // Exhausted iterations
    yield {
      type: 'epic:done',
      epicId: this.ms.id,
      result: this.buildResult(taskResults, false, maxEpicIterations),
    };
  }

  private async *executeTasks(
    epic: CompoundEpic,
    resume?: ResumePoint,
  ): AsyncGenerator<OrchestratorEvent> {
    const batches = computeBatches(epic);
    const pendingSpawns: SpawnedTask[] = [];

    for (const batch of batches) {
      // Filter tasks based on resume point
      let tasks = batch.tasks;
      if (resume?.from === 'task') {
        tasks = tasks.filter((t) => t.id >= resume.taskId);
      }

      if (tasks.length === 0) continue;

      // Execute batch and collect spawned tasks from yields
      for await (const event of executeBatchStreaming(this.ctx, tasks, this.config)) {
        yield event;

        // Detect spawned tasks from yields
        if (event.type === 'task:done' && event.result?.spawnedTasks?.length) {
          pendingSpawns.push(...event.result.spawnedTasks);
        }
      }
    }

    // After all batches complete, inject spawned tasks
    if (pendingSpawns.length > 0) {
      yield* this.injectSpawnedTasks(pendingSpawns, epic);
    }
  }

  /**
   * Inject spawned tasks from yields into the plan.
   * Handles three target modes:
   *   - 'current-epic': append to the current epic and execute immediately
   *   - 'next-epic': create a new epic after the current one
   *   - { epic: string }: append to a named epic
   */
  private async *injectSpawnedTasks(
    spawns: SpawnedTask[],
    currentEpic: CompoundEpic,
  ): AsyncGenerator<OrchestratorEvent> {
    // Group spawns by target
    const currentEpicTasks = spawns.filter(s => s.target === 'current-epic');
    const nextEpicTasks = spawns.filter(s => s.target === 'next-epic');
    const namedEpicTasks = spawns.filter(s => typeof s.target === 'object');

    // 1. Current-epic tasks: add to current epic and execute immediately
    if (currentEpicTasks.length > 0) {
      console.log(`[epic-orchestrator] Injecting ${currentEpicTasks.length} yielded tasks into current epic`);

      yield {
        type: 'task:yielded',
        taskId: currentEpicTasks[0].parentTaskId,
        spawnedTasks: currentEpicTasks,
        epicId: this.ms.id,
      };

      for (const spawn of currentEpicTasks) {
        await addTask(this.ctx, spawn.task.title, {
          epic: this.ms.id,
          type: spawn.task.type,
          input: spawn.task.inputs?.join(', '),
          output: spawn.task.outputs?.join(', '),
          deps: spawn.task.deps,
          prompt: spawn.task.prompt,
          vars: spawn.task.vars,
        });
      }

      // Re-execute: refresh status and run the newly added tasks
      const freshStatus = await statusJson(this.ctx);
      const fresh = freshStatus.epics.find((m) => m.id === this.ms.id);
      if (fresh) {
        // Only run pending tasks (the newly added ones)
        const pendingTasks = fresh.tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length > 0) {
          yield* executeBatchStreaming(this.ctx, pendingTasks, this.config);
        }
      }
    }

    // 2. Next-epic tasks: create a new epic
    if (nextEpicTasks.length > 0) {
      const nextEpicNum = this.ms.id + 1;
      const parentTitle = nextEpicTasks[0].parentTaskId;
      const epicTitle = `Follow-up: ${currentEpic.title}`;

      console.log(`[epic-orchestrator] Creating new epic "${epicTitle}" with ${nextEpicTasks.length} yielded tasks`);

      yield {
        type: 'task:yielded',
        taskId: nextEpicTasks[0].parentTaskId,
        spawnedTasks: nextEpicTasks,
        epicId: nextEpicNum,
      };

      await createEpic(this.ctx, nextEpicNum, epicTitle);

      for (const spawn of nextEpicTasks) {
        await addTask(this.ctx, spawn.task.title, {
          epic: nextEpicNum,
          type: spawn.task.type,
          input: spawn.task.inputs?.join(', '),
          output: spawn.task.outputs?.join(', '),
          deps: spawn.task.deps,
          prompt: spawn.task.prompt,
          vars: spawn.task.vars,
        });
      }
      // The project orchestrator will pick up the new epic in the next iteration
    }

    // 3. Named-epic tasks: add to specific epic by name
    if (namedEpicTasks.length > 0) {
      const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
      const store = new HierarchicalStore(this.ctx.appDir);
      const allEpics = store.listEpics();

      for (const spawn of namedEpicTasks) {
        const targetEpicName = (spawn.target as { epic: string }).epic;
        const targetEpic = allEpics.find(e => e.title.toLowerCase().includes(targetEpicName.toLowerCase()));

        if (targetEpic) {
          await addTask(this.ctx, spawn.task.title, {
            epic: targetEpic.number,
            type: spawn.task.type,
            input: spawn.task.inputs?.join(', '),
            output: spawn.task.outputs?.join(', '),
            deps: spawn.task.deps,
            prompt: spawn.task.prompt,
            vars: spawn.task.vars,
          });
        } else {
          console.error(`[epic-orchestrator] Target epic "${targetEpicName}" not found, adding to current epic`);
          await addTask(this.ctx, spawn.task.title, {
            epic: this.ms.id,
            type: spawn.task.type,
            input: spawn.task.inputs?.join(', '),
            output: spawn.task.outputs?.join(', '),
            deps: spawn.task.deps,
            prompt: spawn.task.prompt,
            vars: spawn.task.vars,
          });
        }
      }
    }
  }

  private buildResult(
    tasks: TaskResult[],
    success: boolean,
    iterations: number,
  ): EpicResult {
    return {
      epicId: this.ms.id,
      title: this.ms.title,
      tasks,
      success,
      iterations,
    };
  }
}
