/**
 * Config Loader — loads crew.json and executes setup
 *
 * Crew looks for a single configuration file in the project root:
 *   - crew.json
 *
 * The config points to a setup directory via the "setup" field:
 *
 * @example
 * ```json
 * // crew.json
 * {
 *   "name": "My Project",
 *   "setup": ".crew/setup"
 * }
 * ```
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildContext, EpicDef, TaskDef, CompoundStatus, VerificationReport } from './types.ts';
import {
  createEpic,
  addTask,
  statusJson,
  nextTasks,
} from './manager/index.ts';
import {
  TaskBuilder,
  EpicBuilder as FluentEpicBuilder,
  PlanBuilder as FluentPlanBuilder,
} from './tasks/fluent-builder.ts';
import { registerChecks, registerTaskType } from './tasks/task-types.ts';
import type { CheckRegistry } from './tasks/types.ts';
import { expandPlan, expandTask } from './tasks/expanders.ts';
import type { TaskDef as ProgrammableTaskDef } from './tasks/types.ts';
import { loadPlugins, formatPluginList } from './plugins/index.ts';
import type { PluginEntry, PluginState } from './plugins/types.ts';

/* ------------------------------------------------------------------ */
/*  New Declarative Plan Types                                        */
/* ------------------------------------------------------------------ */

/** Task definition in the new declarative syntax */
export interface DeclarativeTask {
  /** Unique task ID (e.g., "bootstrap.install") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Skill/agent to use (e.g., "repo/install", "page-verify") */
  skill?: string;
  /** Optional condition function - task only included if returns true */
  when?: (vars: Record<string, unknown>) => boolean;
  /** Input files/artifacts */
  inputs?: string[];
  /** Output files/artifacts */
  outputs?: string[];
  /** Dependencies - can be task IDs or special selectors */
  deps?: string[];
  /** Arguments/variables for the task */
  args?: Record<string, unknown>;
  /** Variables for prompt templating */
  vars?: Record<string, unknown>;
  /** Reference to a prompt template key */
  promptRef?: string;
  /** Direct prompt string (alternative to promptRef) */
  prompt?: string;
  /** Checks to run (e.g., ["tsc", "build"]) */
  checks?: string[];
}

/** Epic definition in the new declarative syntax */
export interface DeclarativeEpic {
  /** Unique epic ID (e.g., "foundation", "page:/about") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Tasks in this epic */
  tasks: DeclarativeTask[];
}

/** Plan definition returned by ctx.plan() */
export interface PlanDefinition {
  /** Plan title */
  title: string;
  /** Shared variables accessible to all tasks */
  vars?: Record<string, unknown>;
  /** Epic definitions */
  epics: DeclarativeEpic[];
}

/* ------------------------------------------------------------------ */
/*  Config Types                                                      */
/* ------------------------------------------------------------------ */

export interface CrewConfigContext {
  /** Project directory */
  readonly projectDir: string;

  /** Initialize project with project name and epic count */
  init(name: string, epicCount?: number): Promise<void>;

  /** Add a epic */
  addEpic(num: number, title: string): Promise<void>;

  /** Add a task to a epic */
  addTask(
    title: string,
    opts: {
      epic: number;
      input?: string;
      output?: string;
      deps?: string[];
      prompt?: string;
    },
  ): Promise<string>;

  /** Get current project status */
  status(): Promise<CompoundStatus>;

  /** Get next actionable tasks */
  next(): Promise<{ gates: string[]; next: import('./types.ts').CompoundTask[]; queue: import('./types.ts').CompoundTask[] }>;

  /**
   * NEW DECLARATIVE API: Create a plan from a declarative definition.
   * This replaces the imperative init/addEpic/addTask calls.
   *
   * @example
   * return ctx.plan({
   *   title: "My Project Enhancement",
   *   vars: { hasAnimation: true },
   *   epics: [
   *     {
   *       id: "foundation",
   *       title: "Foundation",
   *       tasks: [
   *         { id: "init", title: "Init", skill: "plan/init", outputs: [".crew/project.json"] }
   *       ]
   *     }
   *   ]
   * });
   */
  plan(definition: PlanDefinition): Promise<PlanDefinition>;

  /* ------------------------------------------------------------------ */
  /*  Builder API - Fluent plan construction                             */
  /* ------------------------------------------------------------------ */

  /**
   * Create a new PlanBuilder for fluent plan construction.
   *
   * @example
   * const plan = ctx.createPlan('My Project');
   * plan
   *   .vars({ nodeVersion: '20' })
   *   .addEpic(ctx.createEpic('bootstrap', 'Bootstrap')
   *     .addTask(ctx.createTask('install', 'Install').skill('repo/install'))
   *     .addTask(ctx.createTask('tsc', 'Type check').skill('page-verify')))
   *   .addEpic(ctx.createEpic('build', 'Build')
   *     .addTask(ctx.createTask('build', 'Build app').skill('page-verify')));
   * return plan.build();
   */
  createPlan(title: string): import('./tasks/fluent-builder.ts').PlanBuilder;

  /**
   * Create a new EpicBuilder for fluent plan construction.
   *
   * @example
   * ctx.createEpic('bootstrap', 'Bootstrap')
   *   .addTask(ctx.createTask('install', 'Install').skill('repo/install'))
   *   .addTask(ctx.createTask('tsc', 'Type check').skill('page-verify'))
   */
  createEpic(id: string, title: string): import('./tasks/fluent-builder.ts').EpicBuilder;

  /* ------------------------------------------------------------------ */
  /*  Programmable Task Builder API                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Create a programmable TaskBuilder with full lifecycle hooks.
   *
   * @example
   * ctx.createTask('install', 'Install dependencies')
   *   .prompt('Install project dependencies')
   *   .check('tsc')
   */
  createTask(id: string, title: string): import('./tasks/fluent-builder.ts').TaskBuilder;

}

export interface TaskTransitionContext {
  // Previous task (just completed)
  prevTask: {
    id: string;
    displayId: string;  // e.g. "m1.1"
    title: string;
    status: 'done' | 'failed';
    result?: import('./tasks/types.ts').TaskResult;
    epic: {
      id: string;
      number: number;
      title: string;
    };
  } | null;  // null if this is the first task

  // Next task (about to start)
  nextTask: {
    id: string;
    displayId: string;  // e.g. "m1.2"
    title: string;
    status: 'pending';
    epic: {
      id: string;
      number: number;
      title: string;
    };
  };

  // Project and build context
  project: import('./tasks/types.ts').ProjectContext;
  buildCtx: BuildContext;

  // Available tools
  tools: import('./tasks/types.ts').TaskTools;

  // Logging
  log: {
    info(msg: string, meta?: unknown): void;
    warn(msg: string): void;
    error(msg: string): void;
  };

  // Shared variables
  vars: Record<string, unknown>;
}

export interface EpicTransitionContext {
  // Previous epic (just completed)
  prevEpic: {
    id: string;
    number: number;
    title: string;
    status: 'done';
    taskCount: number;
    completedTaskCount: number;
  } | null;  // null if this is the first epic

  // Next epic (about to start)
  nextEpic: {
    id: string;
    number: number;
    title: string;
    status: 'planned';
    taskCount: number;
    gates: Array<{ type: string; required: boolean; completed: boolean }>;
  };

  // Project and build context
  project: import('./tasks/types.ts').ProjectContext;
  buildCtx: BuildContext;

  // Available tools
  tools: import('./tasks/types.ts').TaskTools;

  // Logging
  log: {
    info(msg: string, meta?: unknown): void;
    warn(msg: string): void;
    error(msg: string): void;
  };

  // Shared variables
  vars: Record<string, unknown>;
}

export interface ProjectHooks {
  // Existing task lifecycle hooks
  beforeTask?: (ctx: import('./tasks/types.ts').TaskContext) => void | Promise<void>;
  afterTask?: (ctx: import('./tasks/types.ts').TaskContext, result: import('./tasks/types.ts').TaskResult) => void | Promise<void>;
  onTaskFail?: (ctx: import('./tasks/types.ts').TaskContext, error: Error) => void | Promise<void>;

  // NEW: Task transition hooks
  beforeSwitchTask?: (ctx: TaskTransitionContext) => void | Promise<void>;
  afterSwitchTask?: (ctx: TaskTransitionContext) => void | Promise<void>;

  // NEW: Epic transition hooks
  beforeSwitchEpic?: (ctx: EpicTransitionContext) => void | Promise<void>;
  afterSwitchEpic?: (ctx: EpicTransitionContext) => void | Promise<void>;
}

export interface TaskTypeExtension {
  onStart?: (ctx: import('./tasks/types.ts').TaskContext) => void | Promise<void>;
  onComplete?: (ctx: import('./tasks/types.ts').TaskContext, result: import('./tasks/types.ts').TaskResult) => void | Promise<void>;
  onFail?: (ctx: import('./tasks/types.ts').TaskContext, error: Error) => void | Promise<void>;
  checks?: import('./tasks/types.ts').CheckRef[];
}

export interface CrewConfig {
  /** Project name */
  name?: string;

  /** Description of the project/enhancement */
  description?: string;

  /**
   * Plugins to load before setup script.
   * Stack multiple tech-stack plugins for composable configuration.
   *
   * @example
   * { "plugins": ["typescript", "nextjs", "git", "docker"] }
   * { "plugins": ["typescript", ["nextjs", { "appDir": true }], "./plugins/custom.js"] }
   */
  plugins?: PluginEntry[];

  /** Accumulated plugin state (set after plugin loading) */
  pluginState?: PluginState;

  /** Internal: Plugin-provided variables (for merging with setup vars) */
  _pluginVars?: Record<string, unknown>;

  /** Project-level hooks */
  hooks?: ProjectHooks;

  /** Project-defined task types (e.g., 'coding', 'planning', 'verify') */
  taskTypes?: Record<string, import('./tasks/types.ts').TaskType | TaskTypeExtension>;

  /** Project-defined checks (e.g., 'tsc', 'build', 'pytest') */
  checks?: CheckRegistry;

  /**
   * Called during `crew plan` to initialize the crew/planning context.
   * This is the main entry point for setting up the project plan.
   *
   * Can use either:
   *   - Imperative API: ctx.init(), ctx.addEpic(), ctx.addTask()
   *   - Declarative API: return ctx.plan({ ... })
   *   - Or delegate to onInitPlan for cleaner separation
   */
  onInitCrew?(context: CrewConfigContext): Promise<void | PlanDefinition> | void | PlanDefinition;

  /**
   * Called during `crew plan` to create the plan definition.
   * Use this hook to define epics and tasks declaratively.
   * This is an alternative to onInitCrew for cleaner plan separation.
   */
  onInitPlan?(context: CrewConfigContext): Promise<PlanDefinition> | PlanDefinition;

  /**
   * Called when verification fails to create fix tasks.
   * Return epics with tasks to fix the issues.
   */
  onVerificationFailed?(
    context: CrewConfigContext,
    report: VerificationReport,
  ): Promise<EpicDef[]> | EpicDef[];
}

/* ------------------------------------------------------------------ */
/*  Context Implementation                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a PlanDefinition to EpicDef[] for internal use
 * Also expands tasks into subtasks (including quality gates)
 */
function planDefinitionToEpicDefs(def: PlanDefinition): EpicDef[] {
  const vars = def.vars ?? {};

  return def.epics.map((epic) => {
    // Filter tasks based on `when` condition
    const activeTasks = epic.tasks.filter((task) => {
      if (!task.when) return true;
      try {
        return task.when(vars) === true;
      } catch {
        return false;
      }
    });

    // Convert tasks AND expand into subtasks
    const allTasks: TaskDef[] = [];
    
    for (const task of activeTasks) {
      // Add main task
      const mainTask = convertDeclarativeTask(task);
      allTasks.push(mainTask);
      
      // Expand and add subtasks (quality gates)
      const subtasks = expandSingleTask(task);
      allTasks.push(...subtasks);
    }

    return {
      title: epic.title,
      tasks: allTasks,
    };
  });
}

/**
 * Convert DeclarativeTask to TaskDef format
 */
function convertDeclarativeTask(task: DeclarativeTask): TaskDef {
  // Build prompt from promptRef or direct prompt
  let prompt = task.prompt ?? '';
  if (task.promptRef) {
    prompt = `[${task.promptRef}]`;
  }

  // Convert deps array
  const deps = task.deps?.flatMap((dep) => {
    if (typeof dep === 'string') return [dep];
    return [];
  });

  return {
    title: task.title,
    input: task.inputs?.join(', '),
    output: task.outputs?.join(', '),
    deps,
    skills: task.skill ? [task.skill] : undefined,
    prompt,
  };
}

/**
 * Expand a single task into subtasks (quality gates)
 */
function expandSingleTask(task: DeclarativeTask): TaskDef[] {
  // Convert to ProgrammableTaskDef format for expansion
  const progTask: ProgrammableTaskDef = {
    id: task.id ?? '',
    title: task.title,
    type: task.skill, // Use skill as type for expansion matching
    skill: task.skill,
    inputs: task.inputs,
    outputs: task.outputs,
    deps: task.deps?.filter((d): d is string => typeof d === 'string'),
    prompt: task.prompt,
    promptRef: task.promptRef,
    vars: task.vars,
    checks: task.checks,
    when: task.when,
  };
  
  // Expand the task
  const expanded = expandTask(progTask);
  
  // Convert expanded subtasks back to TaskDef format
  return expanded.map(sub => convertProgrammableTask(sub));
}

/**
 * Convert ProgrammableTaskDef to TaskDef format
 */
function convertProgrammableTask(task: ProgrammableTaskDef): TaskDef {
  let prompt = task.prompt ?? '';
  if (task.promptRef) {
    prompt = `[${task.promptRef}]`;
  }

  return {
    title: task.title,
    input: task.inputs?.join(', '),
    output: task.outputs?.join(', '),
    deps: task.deps,
    skills: task.skill ? [task.skill] : undefined,
    prompt,
  };
}

/**
 * Convert expanded programmable PlanDef to EpicDef[]
 */
function programmablePlanToEpicDefs(plan: import('./tasks/types.ts').PlanDef): EpicDef[] {
  return plan.epics.map(epic => {
    const tasks: TaskDef[] = epic.tasks.map(task => {
      let prompt = task.prompt ?? '';
      if (task.promptRef) {
        prompt = `[${task.promptRef}]`;
      }

      return {
        id: task.id,  // PRESERVE id
        title: task.title,
        type: task.type,  // PRESERVE type
        input: task.inputs?.join(', '),
        output: task.outputs?.join(', '),
        deps: task.deps,
        skills: task.skill ? [task.skill] : undefined,
        prompt,
        promptTemplateFile: task.promptTemplateFile,  // PRESERVE promptTemplateFile
        executorFilePath: task.executorFilePath,       // PRESERVE executorFilePath
        executorCode: task.executorCode,                // PRESERVE executorCode
        vars: task.vars,                                // PRESERVE vars
        yields: task.yields,                            // PRESERVE yields
        checks: task.checks as import('./store/fs/types.ts').TaskYamlCheck[],  // PRESERVE checks
        maxAttempts: task.maxAttempts,                    // PRESERVE maxAttempts
      } as TaskDef;
    });

    return {
      title: epic.title,
      tasks,
    };
  });
}

function createCrewContext(buildCtx: BuildContext): CrewConfigContext {
  return {
    projectDir: buildCtx.appDir,

    // Deprecated - use hierarchical store directly
    async init(name: string, epicCount?: number): Promise<void> {
      // No-op - kept for backward compatibility
    },

    async addEpic(num: number, title: string): Promise<void> {
      await createEpic(buildCtx, num, title);
    },

    async addTask(title: string, opts): Promise<string> {
      return addTask(buildCtx, title, opts);
    },

    async status() {
      return statusJson(buildCtx);
    },

    async next() {
      return nextTasks(buildCtx);
    },

    async plan(definition: PlanDefinition | import('./tasks/types.ts').PlanDef): Promise<PlanDefinition> {
      // Guard: Don't overwrite existing plan
      try {
        const existing = await statusJson(buildCtx);
        const hasTasks = existing.epics.some((ms) => ms.tasks.length > 0);
        if (hasTasks) {
          return definition as PlanDefinition; // Plan already exists, return without modifying
        }
      } catch {
        // No existing plan yet - proceed with creation
      }

      // Check if this is the new format (has tasks with 'type' property)
      const isNewFormat = definition.epics.length > 0 &&
        definition.epics[0].tasks.length > 0 &&
        (typeof definition.epics[0].tasks[0] === 'object') &&
        ('type' in definition.epics[0].tasks[0] || 'checks' in definition.epics[0].tasks[0]);

      let epicDefs: EpicDef[];

      if (isNewFormat) {
        // New format - expand tasks into subtasks
        const newPlanDef = definition as import('./tasks/types.ts').PlanDef;
        const expandedPlan = expandPlan(newPlanDef);
        epicDefs = programmablePlanToEpicDefs(expandedPlan);
      } else {
        // Old format - convert directly
        epicDefs = planDefinitionToEpicDefs(definition as PlanDefinition);
      }

      if (epicDefs.length === 0) {
        throw new Error('Plan has no epics');
      }

      // M0 Foundation placeholder removed - start epics from 1
      // await createEpic(buildCtx, 0, 'Foundation');

      // Write epics and tasks
      // First pass: Create all tasks and build ID mapping
      const idMap = new Map<string, string>(); // plan ID -> display ID (m1.1)

      for (let mi = 0; mi < epicDefs.length; mi++) {
        const m = epicDefs[mi];
        const num = mi + 1;
        await createEpic(buildCtx, num, m.title);

        for (const task of m.tasks) {
          // Handle promptTemplateFile (resolve at plan time)
          if (task.promptTemplateFile) {
            const setupDir = join(buildCtx.appDir, '.crew/setup');
            const { readFileSync, existsSync } = await import('node:fs');

            // 1. Resolve template path (relative to .crew/setup)
            const templateSource = resolve(setupDir, task.promptTemplateFile);

            if (!existsSync(templateSource)) {
              throw new Error(`Prompt template not found: ${task.promptTemplateFile} (resolved to ${templateSource})`);
            }

            // 2. Read template content
            let template = readFileSync(templateSource, 'utf-8');

            // 3. Interpolate variables: {{varName}} → value
            const vars = task.vars || {};
            for (const [key, value] of Object.entries(vars)) {
              const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
              template = template.replace(placeholder, String(value));
            }

            task.prompt = template;
            // Clear template reference after resolution
            delete task.promptTemplateFile;
          }

          // Handle executors: code string or external file
          let executorFile: string | undefined;

          // Helper function for slugifying titles
          const slugify = (title: string): string => {
            return title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 40);
          };

          if (task.executorCode) {
            // Generate executor file from code string
            const msDir = `${num.toString().padStart(2, '0')}-${slugify(m.title)}`;
            const taskIndex = m.tasks.indexOf(task);
            const taskDirName = `${(taskIndex + 1).toString().padStart(2, '0')}-${slugify(task.title)}`;
            // IMPORTANT: planDir points to .crew root (may be temp during init)
            const epicsDir = buildCtx.planDir
              ? join(buildCtx.planDir, 'epics')
              : join(buildCtx.appDir, '.crew', 'epics');
            const taskDir = join(epicsDir, msDir, 'tasks', taskDirName);

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
            const setupDir = join(buildCtx.appDir, '.crew/setup');
            const { existsSync, mkdirSync, copyFileSync } = await import('node:fs');
            const executorSource = resolve(setupDir, task.executorFilePath);

            if (existsSync(executorSource)) {
              const msDir = `${num.toString().padStart(2, '0')}-${slugify(m.title)}`;
              const taskIndex = m.tasks.indexOf(task);
              const taskDirName = `${(taskIndex + 1).toString().padStart(2, '0')}-${slugify(task.title)}`;
              // IMPORTANT: planDir points to .crew root (may be temp during init)
              const epicsDir = buildCtx.planDir
                ? join(buildCtx.planDir, 'epics')
                : join(buildCtx.appDir, '.crew', 'epics');
              const taskDir = join(epicsDir, msDir, 'tasks', taskDirName);

              mkdirSync(taskDir, { recursive: true });

              const executorDest = join(taskDir, 'executor.js');
              copyFileSync(executorSource, executorDest);
              executorFile = 'executor.js';
            }
          }

          // Create task WITHOUT dependencies initially
          const displayId = await addTask(buildCtx, task.title, {
            epic: num,
            type: task.type,  // Preserve task type
            input: task.input,
            output: task.output,
            deps: [], // Will resolve in second pass
            prompt: task.prompt,
            executorFile,
            vars: task.vars,
            planId: task.id,
            skills: task.skills,
            yields: task.yields,  // Pass yields for incremental planning
            checks: task.checks,
            maxAttempts: task.maxAttempts,
          });

          // Map plan ID to display ID
          if (task.id) {
            idMap.set(task.id, displayId);
          }
        }
      }

      // Second pass: Resolve and update dependencies
      const { HierarchicalStore } = await import('./store/hierarchical-store.ts');
      const store = new HierarchicalStore(buildCtx.appDir, {}, buildCtx.planDir);

      for (let mi = 0; mi < epicDefs.length; mi++) {
        const m = epicDefs[mi];
        const num = mi + 1;
        const epic = store.getEpicByNumber(num);
        if (!epic) continue;

        for (const task of m.tasks) {
          const displayId = task.id ? idMap.get(task.id) : undefined;
          if (!displayId) continue;

          const storeTask = store.getTaskByDisplayId(displayId);
          if (!storeTask) continue;

          // Resolve dependencies from plan IDs to actual task IDs
          const resolvedDeps: import('./store/types.ts').TaskId[] = [];
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
            storeTask.dependencies = resolvedDeps;

            // Update dependents for all dependencies
            for (const depId of resolvedDeps) {
              const dep = store.getTask(depId as import('./store/types.ts').TaskId);
              if (dep) {
                if (!dep.dependents) dep.dependents = [];
                if (!dep.dependents.includes(storeTask.id)) {
                  dep.dependents.push(storeTask.id);
                  const depLocation = store.getTaskLocation(depId as import('./store/types.ts').TaskId);
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

      return definition as PlanDefinition;
    },

    // Fluent Builder API - mutable builders for chainable construction
    createPlan(title: string): FluentPlanBuilder {
      return new FluentPlanBuilder(title);
    },

    createEpic(id: string, title: string): FluentEpicBuilder {
      return new FluentEpicBuilder(id, title);
    },

    createTask(id: string, title: string): TaskBuilder {
      return new TaskBuilder(id, title);
    },

  };
}

/* ------------------------------------------------------------------ */
/*  Config Discovery & Loading                                        */
/* ------------------------------------------------------------------ */

const CONFIG_FILES = [
  'crew.json',  // Only crew.json is supported
];

const SETUP_INDEX_FILES = [
  'index.js',   // .crew/setup/index.js - primary
  'index.mjs',  // .crew/setup/index.mjs - alternative
  'index.ts',   // .crew/setup/index.ts - TypeScript (requires tsx)
];

export interface LoadedConfig {
  path: string;
  config: CrewConfig;
}

/**
 * Find the config file in the project directory.
 */
export function findConfigFile(projectDir: string): string | undefined {
  for (const file of CONFIG_FILES) {
    const fullPath = join(projectDir, file);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Load the config file from the project directory.
 * Supports both JSON and JS/TS formats.
 *
 * JSON format can reference .crew/ files for hooks and taskTypes:
 * {
 *   "name": "My Project",
 *   "setup": ".crew/setup"  // Load from .crew/setup/index.js (Storybook-style)
 * }
 *
 * Or legacy individual files:
 * {
 *   "hooks": ".crew/hooks.js",
 *   "taskTypes": ".crew/taskTypes.js"
 * }
 */
export async function loadConfig(projectDir: string): Promise<LoadedConfig | undefined> {
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    return undefined;
  }

  try {
    // Handle JSON config files
    if (configPath.endsWith('.json')) {
      const jsonContent = readFileSync(configPath, 'utf-8');
      const jsonConfig = JSON.parse(jsonContent);

      // Load referenced hook/taskType files
      const config: CrewConfig = { ...jsonConfig };

      // Load plugins before setup script (plugins provide base config, setup overrides)
      if (Array.isArray(jsonConfig.plugins) && jsonConfig.plugins.length > 0) {
        const pluginState = await loadPlugins(jsonConfig.plugins, projectDir);
        config.pluginState = pluginState;

        // Apply plugin vars as defaults (setup script can override)
        if (Object.keys(pluginState.vars).length > 0) {
          config._pluginVars = pluginState.vars;
        }
      }

      // Load from single setup entry point (.crew/setup/index.js)
      if (typeof jsonConfig.setup === 'string') {
        const setupPath = join(projectDir, jsonConfig.setup);

        // Check if it's a directory (load index.js) or a file
        const isDirectory = existsSync(setupPath) && !setupPath.match(/\.(js|ts|mjs)$/);

        let setupMod;
        if (isDirectory) {
          // Load from directory/index.{js,ts,mjs}
          const setupIndexPath = ['.ts', '.js', '.mjs']
            .map(ext => join(setupPath, `index${ext}`))
            .find(p => existsSync(p));

          if (setupIndexPath) {
            const fileUrl = pathToFileURL(resolve(setupIndexPath)).href;
            setupMod = await import(fileUrl);
          }
        } else {
          // Load from specific file
          const fileUrl = pathToFileURL(resolve(setupPath)).href;
          setupMod = await import(fileUrl);
        }

        if (setupMod) {
          // Extract exports from setup module
          config.hooks = setupMod.hooks ?? config.hooks;
          config.taskTypes = setupMod.taskTypes ?? config.taskTypes;
          config.onInitCrew = setupMod.onInitCrew ?? config.onInitCrew;
          config.onVerificationFailed = setupMod.onVerificationFailed ?? config.onVerificationFailed;
        }
      }

      // LEGACY: Load individual files (for backward compatibility)
      // Load hooks from referenced file
      if (typeof jsonConfig.hooks === 'string') {
        const hooksPath = join(projectDir, jsonConfig.hooks);
        const fileUrl = pathToFileURL(resolve(hooksPath)).href;
        const hooksMod = await import(fileUrl);
        config.hooks = hooksMod.default ?? hooksMod;
      }

      // Load taskTypes from referenced file
      if (typeof jsonConfig.taskTypes === 'string') {
        const taskTypesPath = join(projectDir, jsonConfig.taskTypes);
        const fileUrl = pathToFileURL(resolve(taskTypesPath)).href;
        const taskTypesMod = await import(fileUrl);
        config.taskTypes = taskTypesMod.default ?? taskTypesMod;
      }

      // Load onInitCrew from referenced file
      if (typeof jsonConfig.onInitCrew === 'string') {
        const onInitCrewPath = join(projectDir, jsonConfig.onInitCrew);
        const fileUrl = pathToFileURL(resolve(onInitCrewPath)).href;
        const onInitCrewMod = await import(fileUrl);
        config.onInitCrew = onInitCrewMod.default ?? onInitCrewMod.onInitCrew ?? onInitCrewMod;
      }

      // Load onVerificationFailed from referenced file
      if (typeof jsonConfig.onVerificationFailed === 'string') {
        const onVerificationFailedPath = join(projectDir, jsonConfig.onVerificationFailed);
        const fileUrl = pathToFileURL(resolve(onVerificationFailedPath)).href;
        const onVerificationFailedMod = await import(fileUrl);
        config.onVerificationFailed = onVerificationFailedMod.default ?? onVerificationFailedMod.onVerificationFailed ?? onVerificationFailedMod;
      }

      return {
        path: configPath,
        config,
      };
    }

    // Handle JS/TS config files
    const fileUrl = pathToFileURL(resolve(configPath)).href;
    const mod = await import(fileUrl);

    // Support both default export and named export
    const config: CrewConfig = mod.default ?? mod.config ?? mod;

    if (!config || typeof config !== 'object') {
      throw new Error(`Config file does not export a valid configuration object`);
    }

    return {
      path: configPath,
      config,
    };
  } catch (err) {
    throw new Error(
      `Failed to load config from ${configPath}: ${(err as Error).message}`
    );
  }
}

/**
 * Check if a project has a crew config file.
 */
export function hasConfig(projectDir: string): boolean {
  return findConfigFile(projectDir) !== undefined;
}

/**
 * Find the setup index file in .crew/setup/ directory.
 * Searches for .crew/setup/index.{ts,js,mjs}
 */
export function findSetupFile(projectDir: string): string | undefined {
  const setupDir = join(projectDir, '.crew', 'setup');
  if (!existsSync(setupDir)) {
    return undefined;
  }

  for (const file of SETUP_INDEX_FILES) {
    const fullPath = join(setupDir, file);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Load the setup from .crew/setup/index.{js,ts,mjs}
 * Returns the module exports (hooks, taskTypes, onInitCrew, onVerificationFailed).
 */
export async function loadSetupFile(projectDir: string): Promise<any | undefined> {
  const setupPath = findSetupFile(projectDir);
  if (!setupPath) {
    return undefined;
  }

  try {
    const fileUrl = pathToFileURL(resolve(setupPath)).href;
    const mod = await import(fileUrl);

    // Return the entire module exports
    return mod;
  } catch (err) {
    throw new Error(
      `Failed to load setup from ${setupPath}: ${(err as Error).message}`
    );
  }
}

/**
 * Find the plan index file in .crew/epics/ or .crew/setup/plan/ directory.
 * Searches for .crew/setup/plan/index.{ts,js,mjs} first, then .crew/epics/index.{ts,js,mjs}
 */
export function findPlanFile(projectDir: string): string | undefined {
  const PLAN_INDEX_FILES = ['index.ts', 'index.js', 'index.mjs'];
  const planDirs = [
    join(projectDir, '.crew', 'setup', 'plan'),  // New location (preferred)
    join(projectDir, '.crew', 'epics'),           // Legacy location
  ];

  for (const planDir of planDirs) {
    if (!existsSync(planDir)) {
      continue;
    }

    for (const file of PLAN_INDEX_FILES) {
      const fullPath = join(planDir, file);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return undefined;
}

/**
 * Load the plan from .crew/setup/index.js or .crew/setup/plan/index.{js,ts,mjs} or .crew/epics/index.{js,ts,mjs}
 * Returns the module exports (should have createPlan function).
 *
 * Priority:
 * 1. .crew/setup/index.js (if it exports createPlan) - Storybook-style single entry
 * 2. .crew/setup/plan/index.js - Modular plan in setup directory
 * 3. .crew/epics/index.js - Legacy location
 */
export async function loadPlanFile(projectDir: string): Promise<{ createPlan?: Function } | undefined> {
  // First, try loading from .crew/setup/index.js
  const setupFile = await loadSetupFile(projectDir);
  if (setupFile?.createPlan && typeof setupFile.createPlan === 'function') {
    return setupFile;
  }

  // Fallback to dedicated plan files
  const planPath = findPlanFile(projectDir);
  if (!planPath) {
    return undefined;
  }

  try {
    const fileUrl = pathToFileURL(resolve(planPath)).href;
    const mod = await import(fileUrl);

    // Support both default export and named export
    const exports = mod.default ?? mod;

    if (exports.createPlan && typeof exports.createPlan === 'function') {
      return exports;
    }

    throw new Error('Plan file must export a createPlan function');
  } catch (err) {
    throw new Error(
      `Failed to load plan from ${planPath}: ${(err as Error).message}`
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Config Execution                                                  */
/* ------------------------------------------------------------------ */

/**
 * Execute the onInitCrew/onInitPlan hooks from the config.
 * This is called during `crew plan`.
 *
 * Execution order:
 * 1. Guard check - skip if plan already exists
 * 2. onInitCrew (setup phase)
 * 3. Auto-load from .crew/epics/index.{ts,js,mjs} (NEW - primary method)
 * 4. Fallback to onInitPlan (deprecated, backward compatibility)
 * 5. Error if no plan created
 *
 * Guard: If project already has epics with tasks, skip plan creation.
 */
export async function executeConfigInit(
  buildCtx: BuildContext,
  config: CrewConfig,
): Promise<void> {
  const crewCtx = createCrewContext(buildCtx);

  // Guard: Skip if plan already exists (project has epics with tasks)
  try {
    const existing = await crewCtx.status();
    const hasTasks = existing.epics.some((ms) => ms.tasks.length > 0);
    if (hasTasks) {
      return; // Plan already exists, nothing to do
    }
  } catch {
    // No existing plan yet - proceed with plan creation
  }

  // Step 1: Call onInitCrew first (setup/placeholder phase)
  // This allows crew-level initialization before plan creation
  if (config.onInitCrew) {
    const result = await config.onInitCrew(crewCtx);

    // If onInitCrew returns a PlanDefinition, it takes precedence
    if (result && typeof result === 'object' && 'epics' in result) {
      await crewCtx.plan(result);
      return;
    }
    // Otherwise continue to auto-load or onInitPlan
  }

  // Step 2: Auto-load plan from .crew/epics/index.{ts,js,mjs}
  const planModule = await loadPlanFile(buildCtx.appDir);
  if (planModule?.createPlan) {
    const planDef = await planModule.createPlan(crewCtx);
    if (planDef && typeof planDef === 'object' && 'epics' in planDef) {
      await crewCtx.plan(planDef);
      return;
    }
  }

  // Step 3: Fallback to onInitPlan (deprecated, backward compatibility)
  if (config.onInitPlan) {
    console.warn('[crew] Warning: onInitPlan hook is deprecated. Move your plan to .crew/epics/index.js');
    const planDef = await config.onInitPlan(crewCtx);
    if (planDef && typeof planDef === 'object' && 'epics' in planDef) {
      await crewCtx.plan(planDef);
      return;
    }
  }

  // Error if no plan was created
  throw new Error(
    'No plan found. Create .crew/setup/index.js with a createPlan() function, ' +
    'or add "setup": ".crew/setup" to crew.json'
  );
}

/**
 * Execute the onVerificationFailed hook from the config.
 * This is called when verification fails to create fix tasks.
 */
export async function executeConfigFix(
  buildCtx: BuildContext,
  config: CrewConfig,
  report: VerificationReport,
): Promise<EpicDef[]> {
  if (!config.onVerificationFailed) {
    return [];
  }

  const crewCtx = createCrewContext(buildCtx);
  const result = await config.onVerificationFailed(crewCtx, report);
  return result ?? [];
}

/* ------------------------------------------------------------------ */
/*  Project Hooks & Task Type Extensions                             */
/* ------------------------------------------------------------------ */

/**
 * Register project-defined task types and checks from setup.
 * Called during executor initialization.
 *
 * Loads:
 *   - setup.taskTypes → registerTaskType / extendTaskType
 *   - setup.checks → registerChecks
 */
export async function registerConfigTaskTypes(appDir: string): Promise<void> {
  const loaded = await loadConfig(appDir);
  if (!loaded) return;

  const { extendTaskType } = await import('./tasks/task-types.ts');

  // Register project-defined task types
  if (loaded.config.taskTypes) {
    for (const [name, typeOrExtension] of Object.entries(loaded.config.taskTypes)) {
      if ('name' in typeOrExtension && 'defaults' in typeOrExtension) {
        // Full TaskType definition - register as new type
        registerTaskType(typeOrExtension as import('./tasks/types.ts').TaskType);
      } else {
        // Extension - merge with existing type
        extendTaskType(name, typeOrExtension as TaskTypeExtension);
      }
    }
  }

  // Register project-defined checks
  if ((loaded.config as any).checks) {
    registerChecks((loaded.config as any).checks as CheckRegistry);
  }
}
