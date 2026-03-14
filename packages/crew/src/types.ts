/* ------------------------------------------------------------------ */
/*  Core context                                                       */
/* ------------------------------------------------------------------ */

/** Build context — where agents execute */
export interface BuildContext {
  appDir: string;              // absolute path to the project root
  planDir?: string;            // optional custom plan directory (for transactional operations)
}

/* ------------------------------------------------------------------ */
/*  Compound state                                                     */
/* ------------------------------------------------------------------ */

export interface CompoundTask {
  id: string;           // e.g. "m1.3"
  title: string;
  status: 'pending' | 'active' | 'done' | 'blocked' | 'failed' | 'cancelled';
  type?: string;        // Task type: "coding" | "verify" | "planning" | "custom" etc.
  assignee?: string;    // e.g. "@page-builder" — loads .claude/agents/page-builder.md
  input?: string;
  output?: string;
  deps?: string[];
  prompt?: string;
  skills?: string[];    // Skill names to inject into the prompt (from .crew/skills/)
  executorFile?: string;  // External executor file reference
  epicNum?: number;  // Epic number for path resolution
  constraints?: TaskConstraints;  // Execution constraints
  yields?: import('./tasks/types.ts').YieldsDeclarative;  // Incremental planning config
  checks?: import('./store/fs/types.ts').TaskYamlCheck[];  // Serializable checks from task.yaml
  maxAttempts?: number;  // Max check→feedback→retry attempts (default: 3)
}

export interface TaskConstraints {
  sequential?: boolean;
  parallel?: boolean;
  blocking?: string[];
  blockedBy?: string[];
  condition?: string | ((vars: Record<string, unknown>) => boolean);
  maxParallel?: number;
  priority?: number;
}

export interface CompoundEpic {
  id: number;
  title: string;
  tasks: CompoundTask[];
  complete: boolean;
}

export interface CompoundStatus {
  name: string;
  epics: CompoundEpic[];
}

/* ------------------------------------------------------------------ */
/*  Plan definitions                                                   */
/* ------------------------------------------------------------------ */

/** Epic definition for planning */
export interface EpicDef {
  title: string;
  tasks: TaskDef[];
}

/** Task definition for planning */
export interface TaskDef {
  id?: string;                 // Unique task ID (optional)
  title: string;
  type?: string;               // Task type: "coding" | "verify" | "planning" | "custom" etc.
  input?: string;              // files/artifacts the agent reads
  output?: string;             // files/artifacts the agent produces
  prompt?: string;             // instruction for the agent (optional if using promptTemplateFile)
  promptTemplateFile?: string; // NEW: Prompt template file path (resolved at plan time)
  agentName?: string;          // which .claude/agents/ persona
  deps?: string[];             // task IDs this depends on
  skills?: string[];             // Skills linked to this task (stored in task.json)
  vars?: Record<string, unknown>; // NEW: Variables for template interpolation
  executorFilePath?: string;   // NEW: External executor file path (relative to setup dir)
  executorCode?: string;       // NEW: Executor code as string (alternative to executorFilePath)
  constraints?: TaskConstraints; // Execution constraints
  yields?: import('./tasks/types.ts').YieldsDeclarative; // Incremental planning config
  checks?: import('./store/fs/types.ts').TaskYamlCheck[];  // Serializable checks from task.yaml
  maxAttempts?: number;  // Max check→feedback→retry attempts (default: 3)
}

/* ------------------------------------------------------------------ */
/*  Execution results                                                  */
/* ------------------------------------------------------------------ */

/** Result from a single task execution */
export interface TaskResult {
  taskId: string;
  raw: string;
  durationMs: number;
  success: boolean;
  error?: string;
  /** Tasks spawned via incremental planning (yields) — propagated from task executor */
  spawnedTasks?: import('./tasks/types.ts').SpawnedTask[];
}

/** Result from a epic execution */
export interface EpicResult {
  epicId: number;
  title: string;
  tasks: TaskResult[];
  success: boolean;
  iterations: number;
}

/** Result from the full project execution */
export interface ProjectResult {
  success: boolean;
  epics: EpicResult[];
  totalDurationMs: number;
  iterations: number;
}

/* ------------------------------------------------------------------ */
/*  Verification                                                       */
/* ------------------------------------------------------------------ */

export interface VerificationIssue {
  check: string;          // which check produced it (e.g. "tsc", "build", "images")
  file?: string;          // file path if applicable
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  issues: VerificationIssue[];
  raw?: string;           // raw output from the check command
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheck[];
  issues: VerificationIssue[];
}

/* ------------------------------------------------------------------ */
/*  Agent configuration                                                */
/* ------------------------------------------------------------------ */

/** Provider and model configuration for an agent */
export interface AgentConfig {
  provider?: 'claude' | 'kimi' | 'qwen' | 'gemini';
  backend?: 'cli';
  model?: string;
}

/** Agent persona loaded from .crew/agents/{name}.md */
export interface AgentPersona {
  name: string;
  description: string;
  skills: string[];
  content: string;
  config?: AgentConfig;
}
