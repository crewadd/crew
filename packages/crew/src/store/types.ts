/**
 * Claude-Integrated Data Model - Folder-Copy Structure
 *
 * .crew/ is the source of truth. To sync to Claude Code:
 *   cp -r .crew/agents/* .claude/agents/
 *   cp -r .crew/skills/* .claude/skills/
 *
 * Structure:
 * ```
 * .crew/
 * ├── project.json              # Project root
 * ├── tasks/
 * │   ├── task_xxx.json         # Task metadata
 * │   └── task_xxx.md           # Task prompt (optional)
 * ├── epics/
 * │   ├── ms_xxx.json
 * │   └── ms_xxx.md             # Epic description (optional)
 * ├── events/
 * │   └── agent_name.2026-03-04.jsonl
 * ├── agents/                   # NATIVE CLAUDE FORMAT - copy to .claude/agents/
 * │   ├── page-builder.md       # Claude agent file
 * │   └── verify-agent.md
 * └── skills/                   # NATIVE CLAUDE FORMAT - copy to .claude/skills/
 *     ├── web2next/
 *     │   └── SKILL.md          # Claude skill file
 *     └── page-verify/
 *         └── SKILL.md
 * ```
 */

/* ------------------------------------------------------------------ */
/*  ID Types                                                          */
/* ------------------------------------------------------------------ */

export type TaskId = `task_${string}`;
export type EpicId = `epic_${string}`;
export type AgentId = `agent_${string}`;
export type SkillId = `skill_${string}`;

/* ------------------------------------------------------------------ */
/*  Task - JSON + optional MD                                         */
/* ------------------------------------------------------------------ */

export interface Task {
  id: TaskId;
  version: number;

  title: string;
  description?: string;  // Or reference task_xxx.md

  status: 'pending' | 'active' | 'done' | 'blocked' | 'failed' | 'cancelled' | 'awaiting_review';
  status_history: StatusChange[];

  /** Review gate definition (from plan) */
  review?: import('../tasks/types.ts').ReviewGate | import('../tasks/types.ts').ReviewGate[];

  /** Report prompt for generating structured task completion reports */
  reportPrompt?: string;

  epic_id: EpicId;

  // NEW: Optional task type for programmable execution
  type?: string;  // 'coding', 'planning', 'testing', 'verify', 'deploy', or custom

  tags?: string[];

  assignee?: AgentId;

  dependencies: TaskId[];
  dependents: TaskId[];

  input?: {
    files?: string[];
    description?: string;
  };
  output?: {
    files?: string[];
    description?: string;
  };

  // Prompt for task execution
  prompt?: string;

  // External executor file (relative to task directory)
  executorFile?: string;

  // Skill names to inject into the prompt (from .crew/skills/)
  skills?: string[];

  // Variables for executor/prompt templating
  vars?: Record<string, unknown>;

  // Serializable checks (persisted in task.yaml)
  checks?: import('./fs/types.ts').TaskYamlCheck[];

  // Max check→feedback→retry attempts (default: 3)
  maxAttempts?: number;

  // Yields config for incremental planning (JSON-serializable subset)
  yields?: import('../tasks/types.ts').YieldsDeclarative;

  attempts: Attempt[];

  created: {
    at: string;
    by: AgentId;
  };
  updated: {
    at: string;
    by: AgentId;
  };

  // Reference to markdown file if separate
  markdown_file?: string;  // e.g., "task_xxx.md"

  // Execution constraints and flow control
  constraints?: TaskConstraints;
  flow?: ExecutionFlow;
}

/* ------------------------------------------------------------------ */
/*  Task Constraints & Flow                                           */
/* ------------------------------------------------------------------ */

export interface TaskConstraints {
  sequential?: boolean;
  parallel?: boolean;
  blocking?: string[];
  blockedBy?: string[];
  condition?: string | ((vars: Record<string, unknown>) => boolean);
  maxParallel?: number;
  priority?: number;
}

export interface ExecutionFlow {
  type: 'sequence' | 'parallel' | 'conditional' | 'fanOut' | 'fanIn' | 'dag';
  branches?: string[];
  syncBarrier?: string[];
  condition?: string | ((vars: Record<string, unknown>) => boolean);
  edges?: Array<{ from: string; to: string }>;
}

export interface StatusChange {
  from: Task['status'];
  to: Task['status'];
  at: string;
  by: AgentId;
  reason?: string;
}

export interface Attempt {
  number: number;
  started_at: string;
  finished_at?: string;
  completed_at?: string;  // Alias for finished_at (for backwards compatibility)
  duration_ms?: number;
  success?: boolean;
  error?: string;
  agent: AgentId;
  output_files?: string[];
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Task Markdown Format - tasks/task_xxx.md                         */
/* ------------------------------------------------------------------ */

export interface TaskMarkdown {
  frontmatter: {
    id: TaskId;
    title: string;
    assignee?: AgentId;
    status: Task['status'];
  };
  content: string;  // The prompt/instructions
}

/* ------------------------------------------------------------------ */
/*  Epic - JSON + optional MD                                    */
/* ------------------------------------------------------------------ */

export interface Epic {
  id: EpicId;
  version: number;

  number: number;
  title: string;
  description?: string;

  status: 'planned' | 'active' | 'completed' | 'archived';

  task_ids: TaskId[];

  gates: Gate[];

  /** Epic execution constraints */
  constraints?: EpicConstraints;

  created: {
    at: string;
    by: AgentId;
  };
  updated: {
    at: string;
    by: AgentId;
  };

  markdown_file?: string;  // e.g., "epic_xxx.md"
}

/**
 * Epic execution constraints
 * Default behavior (if not specified): sequential = true, autoResolve = true
 */
export interface EpicConstraints {
  /**
   * Sequential execution (default: true)
   * If true, epic waits for all tasks in previous epic to complete
   */
  sequential?: boolean;

  /**
   * Auto-resolve empty epics (default: true)
   * If true and epic has no tasks, automatically mark as completed
   */
  autoResolve?: boolean;

  /**
   * Explicit epic IDs that this epic blocks
   */
  blocking?: string[];

  /**
   * Explicit epic IDs that block this epic
   */
  blockedBy?: string[];

  /**
   * Condition for epic execution
   */
  condition?: string | ((vars: Record<string, unknown>) => boolean);
}

export interface Gate {
  type: 'plan' | 'review' | 'consolidate' | 'custom';
  title?: string;
  required: boolean;
  completed: boolean;
  completed_at?: string;
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Epic Markdown - epics/ms_xxx.md                        */
/* ------------------------------------------------------------------ */

export interface EpicMarkdown {
  frontmatter: {
    id: EpicId;
    number: number;
    title: string;
    status: Epic['status'];
  };
  content: string;  // Description, goals, acceptance criteria
}

/* ------------------------------------------------------------------ */
/*  Agent - NATIVE CLAUDE FORMAT - agents/{name}.md                  */
/* ------------------------------------------------------------------ */

/**
 * Agent file in .crew/agents/{name}.md
 * Native Claude Code agent format - can be copied directly to .claude/agents/
 * 
 * Example:
 * ```markdown
 * ---
 * name: page-builder
 * model: claude-3-5-sonnet-20241022
 * temperature: 0.7
 * ---
 * 
 * # Page Builder Agent
 * 
 * You are a specialist in building Next.js pages from design specifications.
 * 
 * ## Capabilities
 * 
 * - Create page components
 * - Implement layouts
 * - Add animations
 * 
 * ## Workflow
 * 
 * 1. Read the design spec
 * 2. Create the page component
 * 3. Verify with visual diff
 * ```
 */
export interface AgentFile {
  frontmatter: {
    name: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    skills?: string[];  // References to skills in .crew/skills/
    [key: string]: unknown;
  };
  content: string;
}

/**
 * Parsed agent metadata (extracted from .md file)
 */
export interface Agent {
  id: AgentId;
  name: string;
  role?: string;
  description?: string;
  
  // From frontmatter
  model?: string;
  temperature?: number;
  max_tokens?: number;
  skills?: SkillId[];
  
  // Parsed from content
  capabilities?: string[];
  groups?: string[];
  
  // Source file
  source_file: string;  // e.g., "agents/page-builder.md"
  
  // Stats
  stats: {
    tasks_assigned: number;
    tasks_completed: number;
    total_duration_ms: number;
    last_active?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Skill - NATIVE CLAUDE FORMAT - skills/{name}/SKILL.md            */
/* ------------------------------------------------------------------ */

/**
 * Skill folder in .crew/skills/{name}/
 * Native Claude Code skill format - can be copied directly to .claude/skills/
 * 
 * Structure:
 * ```
 * .crew/skills/web2next/
 * ├── SKILL.md           # Required - skill definition
 * └── examples.json      # Optional - examples
 * ```
 * 
 * SKILL.md Example:
 * ```markdown
 * # Web2Next Skill
 * 
 * Generate Next.js projects from web captures.
 * 
 * ## When to use
 * 
 * - Converting websites to Next.js
 * - Creating page components from designs
 * 
 * ## Instructions
 * 
 * 1. Read the capture bundle
 * 2. Analyze components
 * 3. Generate Next.js code
 * ```
 */
export interface SkillFile {
  frontmatter?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  content: string;
}

/**
 * Parsed skill metadata (extracted from SKILL.md)
 */
export interface Skill {
  id: SkillId;
  name: string;
  description?: string;
  
  // Parsed from content
  capabilities?: string[];
  when_to_use?: string[];
  instructions?: string;
  
  // Source
  source_dir: string;  // e.g., "skills/web2next/"
  
  // Optional examples
  examples?: SkillExample[];
}

export interface SkillExample {
  title: string;
  input: string;
  output: string;
}

/* ------------------------------------------------------------------ */
/*  Project Root - project.json                                      */
/* ------------------------------------------------------------------ */

export interface CrewProject {
  version: number;
  name: string;
  description?: string;
  
  goal: string;
  
  workflow: WorkflowStep[];
  
  epics: EpicId[];
  
  // References to agents (files in .crew/agents/)
  agents: AgentId[];
  
  // References to skills (folders in .crew/skills/)
  skills: SkillId[];
  
  current?: {
    epic?: EpicId;
    task?: TaskId;
  };
  
  config?: {
    sync_to_claude?: boolean;
    require_reviews?: boolean;
    parallel_limit?: number;
  };
  
  created: string;
  updated: string;
}

export interface WorkflowStep {
  name: string;
  description?: string;
  command?: string;
  auto?: boolean;
}

/* ------------------------------------------------------------------ */
/*  State Summary - state.json (computed, git-ignored optional)      */
/* ------------------------------------------------------------------ */

export interface CrewState {
  version: number;
  project: string;
  generated_at: string;
  
  summary: {
    total_tasks: number;
    completed_tasks: number;
    active_tasks: number;
    pending_tasks: number;
    blocked_tasks: number;
    progress_pct: number;
  };
  
  epics: Array<{
    id: EpicId;
    number: number;
    title: string;
    status: Epic['status'];
    task_count: number;
    completed_count: number;
    is_current: boolean;
    is_complete: boolean;
  }>;
  
  next_tasks: Array<{
    id: TaskId;
    title: string;
    epic_id: EpicId;
    priority: number;
    reason: string;
  }>;
  
  gates: Array<{
    type: Gate['type'];
    epic_id: EpicId;
    message: string;
  }>;
  
  agents: Array<{
    id: AgentId;
    name: string;
    tasks_assigned: number;
    tasks_completed: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Event Log - events/{agent}.{date}.jsonl                          */
/* ------------------------------------------------------------------ */

export type CrewEvent = 
  | ProjectEvent
  | EpicEvent  
  | TaskEvent
  | AgentEvent
  | SkillEvent;

export interface BaseEvent {
  id: string;
  type: string;
  timestamp: string;
  agent: AgentId;
}

export interface ProjectEvent extends BaseEvent {
  type: 'project.created' | 'project.updated';
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface EpicEvent extends BaseEvent {
  type: 'epic.created' | 'epic.updated' | 'epic.completed';
  epic_id: EpicId;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface TaskEvent extends BaseEvent {
  type: 'task.created' | 'task.updated' | 'task.started' | 'task.completed' | 'task.failed'
    | 'task.awaiting_review' | 'task.review_submitted' | 'task.review_changes_requested';
  task_id: TaskId;
  epic_id: EpicId;
  changes?: Record<string, { from: unknown; to: unknown }>;
  review?: import('../tasks/types.ts').ReviewResult;
}

export interface AgentEvent extends BaseEvent {
  type: 'agent.registered' | 'agent.updated';
  agent_id: AgentId;
}

export interface SkillEvent extends BaseEvent {
  type: 'skill.registered' | 'skill.updated';
  skill_id: SkillId;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

export interface StoreConfig {
  // .crew/ paths
  crewDir: string;
  projectFile: string;
  stateFile: string;
  tasksDir: string;
  epicsDir: string;
  eventsDir: string;
  agentsDir: string;   // .crew/agents/
  skillsDir: string;   // .crew/skills/
  
  // .claude/ paths (for sync)
  claudeDir: string;
  claudeAgentsDir: string;  // .claude/agents/
  claudeSkillsDir: string;  // .claude/skills/
  
  // Behavior
  syncToClaude: boolean;
}

export const DEFAULT_CONFIG: StoreConfig = {
  crewDir: '.crew',
  projectFile: '.crew/project.json',
  stateFile: '.crew/state.json',
  tasksDir: '.crew/epics',
  epicsDir: '.crew/epics',
  eventsDir: '.crew/events',
  agentsDir: '.crew/agents',
  skillsDir: '.crew/skills',
  
  claudeDir: '.claude',
  claudeAgentsDir: '.claude/agents',
  claudeSkillsDir: '.claude/skills',
  
  syncToClaude: true,
};

/* ------------------------------------------------------------------ */
/*  Query Types                                                       */
/* ------------------------------------------------------------------ */

export interface TaskQuery {
  epic?: EpicId;
  status?: Task['status'] | Task['status'][];
  assignee?: AgentId;
}

export interface TaskView extends Task {
  epic_number: number;
  dependencies_met: boolean;
  can_start: boolean;
  priority_score: number;
  display_id: string;  // e.g., "m1.2"
}

/* ------------------------------------------------------------------ */
/*  Legacy Compatibility                                              */
/* ------------------------------------------------------------------ */

export type LegacyTaskId = `m${number}.${number}`;

export interface LegacyMapping {
  legacy_to_new: Record<LegacyTaskId, TaskId>;
  new_to_legacy: Record<TaskId, LegacyTaskId>;
  epic_mapping: Record<number, EpicId>;
}

/* ------------------------------------------------------------------ */
/*  Sync Operations                                                   */
/* ------------------------------------------------------------------ */

export interface SyncResult {
  success: boolean;
  agents: {
    copied: string[];
    removed: string[];
    errors: string[];
  };
  skills: {
    copied: string[];
    removed: string[];
    errors: string[];
  };
}
