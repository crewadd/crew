import type { CompoundStatus, EpicDef, VerificationReport } from '../types.ts';

/** Base input type for planners. Strategies extend this with domain-specific fields. */
export interface PlanInput {
  projectDir: string;
}

/**
 * Strategy interface that domain-specific planners implement.
 * The Planner class delegates to a strategy for heuristic decisions.
 */
export interface PlannerStrategy<TInput extends PlanInput = PlanInput> {
  readonly name: string;

  /** Create the initial set of epics from the input. */
  createPlan(input: TInput): EpicDef[];

  /** Create fix epics/tasks from a failed verification report. */
  createFixTasks(
    report: VerificationReport,
    status: CompoundStatus,
    input: TInput,
  ): EpicDef[] | Promise<EpicDef[]>;

  /**
   * Return which check plugins to run for a given epic.
   * If undefined, all checks run.
   */
  checksForEpic?(epicId: number, title: string): string[] | undefined;
}
