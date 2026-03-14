import type {
  EpicDef,
  EpicResult,
  ProjectResult,
  TaskDef,
  TaskResult,
  VerificationReport,
} from '../types.ts';
import type { ReviewResult, ReviewGate, SpawnedTask } from '../tasks/types.ts';

/* ------------------------------------------------------------------ */
/*  OrchestratorEvent — discriminated union yielded by orchestrators   */
/* ------------------------------------------------------------------ */

export type OrchestratorEvent =
  // ── Project level ──────────────────────────────
  | { type: 'project:start'; iteration: number }
  | { type: 'project:planned'; epics: EpicDef[] }
  | { type: 'project:verified'; report: VerificationReport; iteration: number }
  | { type: 'project:fix'; fixEpics: EpicDef[]; iteration: number }
  | { type: 'project:done'; result: ProjectResult }

  // ── Epic level ────────────────────────────
  | { type: 'epic:start'; epicId: number; title: string; iteration: number }
  | { type: 'epic:verified'; epicId: number; report: VerificationReport; iteration: number }
  | { type: 'epic:fix'; epicId: number; fixTasks: TaskDef[]; iteration: number }
  | { type: 'epic:done'; epicId: number; result: EpicResult }
  | { type: 'epic:blocked'; epicId: number; error: string }  // NEW

  // ── Task level ─────────────────────────────────
  | { type: 'task:start'; taskId: string; epicId: number; attempt: number; logFile?: string }
  | { type: 'task:stream'; taskId: string; chunk: string }
  | { type: 'task:retry'; taskId: string; attempt: number; error: string }
  | { type: 'task:done'; taskId: string; result: TaskResult }
  | { type: 'task:failed'; taskId: string; result: TaskResult }
  | { type: 'task:cancelled'; taskId: string; reason: string }

  // ── Review level ─────────────────────────────────
  | { type: 'task:awaiting_review'; taskId: string; review: ReviewGate }
  | { type: 'task:review_submitted'; taskId: string; result: ReviewResult }
  | { type: 'task:review_changes_requested'; taskId: string; result: ReviewResult }

  // ── Yields (incremental planning) ──────────────────
  | { type: 'task:yielded'; taskId: string; spawnedTasks: SpawnedTask[]; epicId: number };

/* ------------------------------------------------------------------ */
/*  ResumePoint — start from any level                                 */
/* ------------------------------------------------------------------ */

export type ResumePoint =
  | { from: 'project'; iteration?: number }
  | { from: 'epic'; epicId: number }
  | { from: 'task'; taskId: string };

/* ------------------------------------------------------------------ */
/*  OrchestratorConfig                                                 */
/* ------------------------------------------------------------------ */

export interface OrchestratorConfig {
  maxProjectIterations: number;    // default 3
  maxEpicIterations: number;  // default 3
  maxTaskRetries: number;          // default 3
  maxConcurrent: number;           // default 5
  taskTimeoutMs: number;           // default 600_000
  skipPlanning: boolean;           // default false — skip createInitialPlan on resume
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxProjectIterations: 3,
  maxEpicIterations: 3,
  maxTaskRetries: 3,
  maxConcurrent: 5,
  taskTimeoutMs: 600_000,
  skipPlanning: false,
};
