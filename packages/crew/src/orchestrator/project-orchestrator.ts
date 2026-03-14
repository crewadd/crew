import { statusJson } from '../manager/index.ts';
import { Planner } from '../planner/planner.ts';
import type { PlanInput, PlannerStrategy } from '../planner/types.ts';
import { verify } from '../verifier/verifier.ts';
import type {
  BuildContext,
  EpicResult,
  ProjectResult,
} from '../types.ts';
import { EpicOrchestrator } from './epic-orchestrator.ts';
import {
  DEFAULT_ORCHESTRATOR_CONFIG,
  type OrchestratorEvent,
  type ResumePoint,
  type OrchestratorConfig,
} from './types.ts';

/**
 * ProjectOrchestrator — the outer orchestration loop.
 *
 * Drives a project to completion via:
 *   plan → execute epics → verify → fix → repeat
 *
 * Yields events for every phase transition. Callers consume via `for await...of`.
 */
export class ProjectOrchestrator<TInput extends PlanInput> {
  private planner: Planner<TInput>;
  private config: OrchestratorConfig;

  constructor(
    private ctx: BuildContext,
    strategy: PlannerStrategy<TInput>,
    private input: TInput,
    config?: Partial<OrchestratorConfig>,
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.planner = new Planner(ctx, strategy);
  }

  async *run(resume?: ResumePoint): AsyncGenerator<OrchestratorEvent> {
    const start = Date.now();
    const { maxProjectIterations } = this.config;
    const epicResults: EpicResult[] = [];

    for (let iter = 1; iter <= maxProjectIterations; iter++) {
      yield { type: 'project:start', iteration: iter };

      // Phase 1: Plan (first iteration only)
      if (iter === 1 && !resume && !this.config.skipPlanning) {
        const epics = await this.planner.createInitialPlan(this.input);
        yield { type: 'project:planned', epics };

        if (epics.length === 0) {
          yield {
            type: 'project:done',
            result: this.buildResult(epicResults, true, iter, start),
          };
          return;
        }
      }

      // Phase 2: Execute each epic
      const status = await statusJson(this.ctx);
      for (const ms of status.epics) {
        if (ms.complete) continue;
        if (resume?.from === 'epic' && ms.id < resume.epicId) continue;
        if (resume?.from === 'task') {
          const taskEpicId = parseInt(resume.taskId.match(/^m(\d+)/)?.[1] ?? '0', 10);
          if (ms.id < taskEpicId) continue;
        }

        const epicOrch = new EpicOrchestrator(
          this.ctx,
          ms,
          this.planner,
          this.input,
          this.config,
        );

        for await (const event of epicOrch.run(resume)) {
          yield event;

          // Collect epic results
          if (event.type === 'epic:done') {
            epicResults.push(event.result);
          }
        }

        resume = undefined; // clear after first epic
      }

      // Phase 3: Project-level verify
      const report = await verify(this.ctx);
      yield { type: 'project:verified', report, iteration: iter };

      if (report.passed) {
        yield {
          type: 'project:done',
          result: this.buildResult(epicResults, true, iter, start),
        };
        return;
      }

      // Phase 4: Create fix plan from report
      if (iter < maxProjectIterations) {
        const currentStatus = await statusJson(this.ctx);
        const fixes = await this.planner.createFixPlan(report, currentStatus, this.input);
        yield { type: 'project:fix', fixEpics: fixes, iteration: iter };
      }
    }

    // Exhausted iterations
    yield {
      type: 'project:done',
      result: this.buildResult(epicResults, false, maxProjectIterations, start),
    };
  }

  private buildResult(
    epics: EpicResult[],
    success: boolean,
    iterations: number,
    startTime: number,
  ): ProjectResult {
    return {
      success,
      epics,
      totalDurationMs: Date.now() - startTime,
      iterations,
    };
  }
}
