/**
 * Task Adapter - Bridge between old executor and programmable task system
 *
 * Converts CompoundTask → TaskDef and provides execution wrapper with project hooks.
 * This allows the old executor to delegate to the new programmable system while
 * maintaining backward compatibility.
 */

import type { CompoundTask, BuildContext, TaskResult as OldTaskResult, AgentConfig } from '../types.ts';
import type { TaskDef, TaskContext, TaskResult, EpicContext, ProjectContext, TaskTools, AgentFn, AgentOptions, AgentResult } from '../tasks/types.ts';
import type { OrchestratorConfig } from '../orchestrator/types.ts';
import { executeTask, type ExecuteOptions } from '../tasks/executor.ts';
import { loadConfig } from '../config-loader.ts';
import { agentfn } from '@crew/agentfn';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

/* ------------------------------------------------------------------ */
/*  ANSI color helpers (inline — no dependency on cli/logger)          */
/* ------------------------------------------------------------------ */

const _useColor = !process.env.NO_COLOR && process.stderr.isTTY;
function _ansi(code: string, s: string): string {
  return _useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const _c = {
  dim:    (s: string) => _ansi('2', s),
  cyan:   (s: string) => _ansi('36', s),
  yellow: (s: string) => _ansi('33', s),
  red:    (s: string) => _ansi('31', s),
};

/* ------------------------------------------------------------------ */
/*  Shell Helper                                                      */
/* ------------------------------------------------------------------ */

async function runShellCommand(cwd: string, command: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(' ');
    const proc = spawn(cmd, args, { cwd, shell: true });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data; });
    proc.stderr?.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Task Context Factories                                            */
/* ------------------------------------------------------------------ */

/**
 * Create TaskTools implementation
 */
export function createTools(buildCtx: BuildContext): TaskTools {
  return {
    file: {
      async read(path: string): Promise<string> {
        const { readFileSync } = await import('node:fs');
        const { isAbsolute } = await import('node:path');
        const fullPath = isAbsolute(path) ? path : join(buildCtx.appDir, path);
        return readFileSync(fullPath, 'utf-8');
      },
      async write(path: string, content: string): Promise<void> {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { dirname, isAbsolute } = await import('node:path');
        const fullPath = isAbsolute(path) ? path : join(buildCtx.appDir, path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      },
      async exists(path: string): Promise<boolean> {
        const { isAbsolute } = await import('node:path');
        const fullPath = isAbsolute(path) ? path : join(buildCtx.appDir, path);
        return existsSync(fullPath);
      },
      async glob(pattern: string): Promise<string[]> {
        // Use a simple file listing for now since glob is not in dependencies
        // In production, this should use a proper glob library
        const { readdirSync, statSync } = await import('node:fs');
        const { join: joinPath } = await import('node:path');

        // Simple implementation: just return files in the pattern directory
        // This is a placeholder - a real implementation would use minimatch or similar
        try {
          const files: string[] = [];
          const dir = pattern.includes('*') ? '.' : pattern;
          const entries = readdirSync(joinPath(buildCtx.appDir, dir));
          for (const entry of entries) {
            const fullPath = joinPath(buildCtx.appDir, dir, entry);
            if (statSync(fullPath).isFile()) {
              files.push(joinPath(dir, entry));
            }
          }
          return files;
        } catch {
          return [];
        }
      },
    },

    shell: {
      async run(command: string, opts?: { cwd?: string; env?: Record<string, string> }): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
      }> {
        const cwd = opts?.cwd || buildCtx.appDir;
        return runShellCommand(cwd, command);
      },
    },

    git: {
      async status(): Promise<string> {
        const result = await runShellCommand(buildCtx.appDir, 'git status');
        return result.stdout;
      },
      async diff(): Promise<string> {
        const result = await runShellCommand(buildCtx.appDir, 'git diff');
        return result.stdout;
      },
      async add(paths: string[]): Promise<void> {
        await runShellCommand(buildCtx.appDir, `git add ${paths.join(' ')}`);
      },
      async commit(message: string): Promise<void> {
        await runShellCommand(buildCtx.appDir, `git commit -m "${message}"`);
      },
    },

  };
}

/**
 * Create AI agent function with all old executor logic
 * Handles: prompt building, persona, retries, streaming, logging
 */
function createAgent(
  buildCtx: BuildContext,
  config: OrchestratorConfig,
  agentConfig?: AgentConfig,
  compoundTask?: CompoundTask,
  attempt?: number,
  previousError?: string,
  previousCheckFailures?: string,
  onStream?: (chunk: string) => void,
  logFile?: string,
  epicTitle?: string,
  signal?: AbortSignal,
): AgentFn {
  return async (prompt: string, opts?: AgentOptions): Promise<AgentResult> => {
    const startTime = Date.now();

    try {
      // Import dependencies
      const { editTask } = await import('../manager/index.ts');
      const { formatTaskPrompt } = await import('../prompts/index.ts');
      const { loadAgentPersona, buildPromptWithPersona, buildSystemPromptFromPersona, buildContextSection } = await import('../agent-loader.ts');
      const { writeFileSync, appendFileSync } = await import('node:fs');

      // Mark task as active
      if (compoundTask) {
        await editTask(buildCtx, compoundTask.id, 'active');
      }

      // Get prompt (from task or context or fallback to opts)
      // If a prompt is explicitly provided (e.g., for yields planning), use it.
      // Otherwise, fallback to compoundTask.prompt or title.
      let finalPrompt = prompt;
      if (!prompt || prompt === compoundTask?.title) {
        // Only use compoundTask.prompt if no explicit prompt was provided
        if (compoundTask) {
          if (compoundTask.prompt) {
            finalPrompt = compoundTask.prompt;
          } else {
            // Use task title as fallback if no prompt provided
            finalPrompt = compoundTask.title;
          }
        }
      }

      // NOTE: Retry context is now handled by formatTaskPrompt() via TaskMeta.previousError.
      // No need to inject it separately here.

      // Collect skills linked to this task (from task.skills[] in task.json).
      const linkedSkills = new Set<string>();
      const { parseSkillInvocation, expandSkillInvocation, discoverSkills } = await import('../agent-loader.ts');

      if (compoundTask?.skills?.length) {
        for (const s of compoundTask.skills) linkedSkills.add(s);
      }

      // /skill-name at prompt start → expand (provider-aware: Claude uses symlinks)
      const provider = agentConfig?.provider ?? 'claude';
      const invocation = parseSkillInvocation(finalPrompt);
      if (invocation) {
        const expanded = expandSkillInvocation(buildCtx, invocation, provider);
        if (expanded) {
          finalPrompt = expanded;
          linkedSkills.add(invocation.skillName);
        }
      }

      // /skill-name mid-prompt → add to linked list
      // Match on both meta name and directory name
      const discovered = discoverSkills(buildCtx);
      if (discovered.length > 0) {
        const knownByName = new Set(discovered.map(s => s.name));
        const knownByDir = new Set(discovered.map(s => s.dirName));
        finalPrompt = finalPrompt.replace(/\/([\w-]+)/g, (match, name) => {
          if (knownByDir.has(name) || knownByName.has(name)) {
            linkedSkills.add(name);
            return name;
          }
          return match;
        });
      }

      // Inject structured context section (inputs/outputs/vars)
      const contextSection = buildContextSection({
        inputs: compoundTask?.input?.split(',').map(s => s.trim()).filter(Boolean),
        outputs: compoundTask?.output?.split(',').map(s => s.trim()).filter(Boolean),
        context: opts?.context,
        epic: epicTitle,
      });
      if (contextSection) {
        finalPrompt = `${contextSection}\n\n${finalPrompt}`;
      }

      // Format prompt with task metadata (XML tags + retry context)
      if (compoundTask && attempt) {
        finalPrompt = formatTaskPrompt(finalPrompt, {
          taskId: compoundTask.id,
          title: compoundTask.title,
          attempt,
          previousError: previousError,
          previousCheckFailures: previousCheckFailures,
          agent: compoundTask.assignee?.replace(/^@/, ''),
          epic: epicTitle,
        });
      }

      // Wrap with persona using XML-tagged structure: <agent> → <skill> → task
      // Also build system prompt for --append-system-prompt (highest priority)
      const systemParts: string[] = [];
      if (compoundTask?.assignee) {
        const agent = loadAgentPersona(buildCtx, compoundTask.assignee);
        if (agent) {
          finalPrompt = buildPromptWithPersona(buildCtx, agent, finalPrompt, provider);
          // Build system prompt for system-role injection (identity + constraints)
          systemParts.push(buildSystemPromptFromPersona(agent));
        }
      }

      // Add skill references to user prompt — Claude Code handles loading
      const { buildSkillPromptSection } = await import('../agent-loader.ts');
      const skillPromptSection = buildSkillPromptSection(buildCtx, linkedSkills);
      if (skillPromptSection) {
        finalPrompt = `${finalPrompt}\n\n${skillPromptSection}`;
      }

      const systemPromptText = systemParts.length > 0
        ? systemParts.join('\n\n')
        : undefined;

      // Write prompt and system prompt to log file (append to preserve earlier content)
      if (logFile) {
        const logParts: string[] = [];
        logParts.push(finalPrompt);
        if (systemPromptText) {
          logParts.push('\n' + '~'.repeat(60));
          logParts.push('[SYSTEM PROMPT]');
          logParts.push('~'.repeat(60));
          logParts.push(systemPromptText);
        }
        logParts.push('\n' + '='.repeat(60) + '\n');
        appendFileSync(logFile, logParts.join('\n'));
      }

      // Build agentfn options — pass skillsRoot + skills for symlink management
      const { getSkillsRoot } = await import('../agent-loader.ts');
      const agentFnOpts: Record<string, any> = {
        prompt: finalPrompt,
        cwd: buildCtx.appDir,
        timeoutMs: opts?.timeout || config.taskTimeoutMs,
        enableSkills: true,  // enable Claude Code's native skill loading from .claude/skills/
        skillsRoot: getSkillsRoot(buildCtx),
        skills: linkedSkills.size > 0 ? [...linkedSkills] : undefined,
        signal,
      };

      // Inject system prompt for persona constraints (highest priority via --append-system-prompt)
      if (systemPromptText) {
        agentFnOpts.systemPrompt = systemPromptText;
      }

      // Apply agent config if available
      if (agentConfig?.provider) agentFnOpts.provider = agentConfig.provider;
      if (agentConfig?.backend) agentFnOpts.backend = agentConfig.backend;
      if (agentConfig?.model) agentFnOpts.model = agentConfig.model;

      // Add streaming hook
      if (onStream) {
        agentFnOpts.hooks = {
          onStream: (chunk: string) => {
            if (logFile) {
              appendFileSync(logFile, chunk);
            }
            onStream(chunk);
          },
        };
      }

      const fn = agentfn(agentFnOpts);
      const result = await fn();

      // Append output to log file
      if (logFile && !onStream) {
        appendFileSync(logFile, result.raw);
      }

      // NOTE: Task status is updated centrally after executeTask returns,
      // not here in the agent wrapper. This ensures consistent status handling
      // for both agent-based tasks and external executor tasks.

      return {
        success: true,
        output: result.raw,
        durationMs: Date.now() - startTime,
        files: [], // agentfn doesn't track files yet
      };
    } catch (error) {
      // NOTE: Task status is updated centrally after executeTask returns

      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  };
}

/**
 * Create epic context from compound task
 */
async function getEpicContext(buildCtx: BuildContext, task: CompoundTask): Promise<EpicContext> {
  const epicNum = parseInt(task.id.match(/^m(\d+)/)?.[1] ?? '0', 10);
  const { statusJson } = await import('../manager/index.ts');
  const status = await statusJson(buildCtx);
  const epic = status.epics.find(m => m.id === epicNum);

  return {
    id: `m${epicNum}`,
    title: epic?.title || `Epic ${epicNum}`,
    num: epicNum,
    tasks: [], // Not needed for adapter
  };
}

/**
 * Create project context
 */
async function getProjectContext(buildCtx: BuildContext): Promise<ProjectContext> {
  const { statusJson } = await import('../manager/index.ts');
  const status = await statusJson(buildCtx);

  return {
    name: status.name || 'Unknown Project',
    title: status.name || 'Unknown Project',
    vars: {},
  };
}

/* ------------------------------------------------------------------ */
/*  Task Conversion                                                   */
/* ------------------------------------------------------------------ */

/**
 * Convert CompoundTask (old format) to TaskDef (new format)
 */
export function convertCompoundTaskToTaskDef(ct: CompoundTask): TaskDef {
  // Support both single skill and skills array
  const skill = ct.skills?.length === 1 ? ct.skills[0] : undefined;
  const skills = ct.skills?.length && ct.skills.length > 1 ? ct.skills : undefined;

  return {
    id: ct.id,
    title: ct.title,
    type: ct.type,
    skill,
    skills,
    inputs: ct.input?.split(',').map(s => s.trim()).filter(Boolean),
    outputs: ct.output?.split(',').map(s => s.trim()).filter(Boolean),
    deps: ct.deps || [],
    prompt: ct.prompt,
    yields: ct.yields,
    checks: ct.checks as import('../tasks/types.ts').CheckRef[],
    maxAttempts: ct.maxAttempts,
  };
}

/**
 * Convert TaskResult (new) back to TaskResult (old)
 */
function convertTaskResult(result: TaskResult, taskId: string): OldTaskResult {
  return {
    taskId,
    raw: result.output || '',
    durationMs: result.durationMs,
    success: result.success,
    error: result.error,
    spawnedTasks: result.spawnedTasks,
  };
}

/* ------------------------------------------------------------------ */
/*  Project Hooks Loader                                              */
/* ------------------------------------------------------------------ */

/**
 * Load project hooks from crew.json
 */
export async function loadProjectHooks(buildCtx: BuildContext): Promise<import('../config-loader.ts').ProjectHooks> {
  const loaded = await loadConfig(buildCtx.appDir);
  return (loaded?.config as any)?.hooks || {};
}

/* ------------------------------------------------------------------ */
/*  Main Adapter Function                                             */
/* ------------------------------------------------------------------ */

/**
 * Execute task with programmable hook system
 * Bridge between old executor (CompoundTask) and new programmable system (TaskDef)
 */
export async function executeTaskWithHooks(
  compoundTask: CompoundTask,
  buildCtx: BuildContext,
  config: OrchestratorConfig,
  attempt: number,
  agentConfig?: AgentConfig,
  previousError?: string,
  previousCheckFailures?: string,
  onStream?: (chunk: string) => void,
  logFile?: string,
  signal?: AbortSignal,
  checksOnly?: boolean,
  resumeSessionId?: string,
): Promise<OldTaskResult> {
  const startTime = Date.now();

  // 1. Convert CompoundTask to TaskDef
  const taskDef = convertCompoundTaskToTaskDef(compoundTask);

  // 2. Load project hooks from crew.json
  const projectHooks = await loadProjectHooks(buildCtx);

  // 3. Create epic and project context
  const epic = await getEpicContext(buildCtx, compoundTask);
  const project = await getProjectContext(buildCtx);

  // 4. Create tools and agent
  const tools = createTools(buildCtx);
  const agent = createAgent(buildCtx, config, agentConfig, compoundTask, attempt, previousError, previousCheckFailures, onStream, logFile, epic.title, signal);

  // 5. Compute task directory for executor loading
  const taskDir = await getTaskDir(buildCtx, compoundTask);

  // 5b. Load vars from store task (if available)
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');
  const store = new HierarchicalStore(buildCtx.appDir);

  let varsFromStore: Record<string, unknown> = {};
  try {
    if (compoundTask.id.match(/^m(\d+)\.(\d+)$/)) {
      const [, msNum, taskNum] = compoundTask.id.match(/^m(\d+)\.(\d+)$/) || [];
      const ms = store.getEpicByNumber(parseInt(msNum, 10));
      if (ms && ms.task_ids[parseInt(taskNum, 10) - 1]) {
        const task = store.getTask(ms.task_ids[parseInt(taskNum, 10) - 1]);
        if (task?.vars) {
          varsFromStore = task.vars;
        }
      }
    } else {
      const task = store.getTask(compoundTask.id as import('../store/types.ts').TaskId);
      if (task?.vars) {
        varsFromStore = task.vars;
      }
    }
  } catch {
    // Task not found in store, use empty vars
  }

  // 6. Build ExecuteOptions for new executor
  const executeOpts: ExecuteOptions = {
    task: taskDef,
    compoundTask,
    epic,
    project,
    buildCtx,
    taskDir,
    vars: varsFromStore,
    agent,
    tools,
    attempt,
    previousError,
    previousCheckFailures,
    checksOnly,
    resumeSessionId,
  };

  // 7. Create context for hooks
  const ctx = createTaskContextForHook(executeOpts);

  // 7b. Get previous task for transition context
  // (reuse store instance created above)

  let currentTask: import('../store/types.ts').Task | null = null;
  let currentMs: import('../store/types.ts').Epic | null = null;

  try {
    // Try to get current task from store
    if (compoundTask.id.match(/^m(\d+)\.(\d+)$/)) {
      const [, msNum, taskNum] = compoundTask.id.match(/^m(\d+)\.(\d+)$/) || [];
      currentMs = store.getEpicByNumber(parseInt(msNum, 10));
      if (currentMs && currentMs.task_ids[parseInt(taskNum, 10) - 1]) {
        currentTask = store.getTask(currentMs.task_ids[parseInt(taskNum, 10) - 1]);
      }
    } else {
      currentTask = store.getTask(compoundTask.id as import('../store/types.ts').TaskId);
      if (currentTask) {
        currentMs = store.getEpic(currentTask.epic_id);
      }
    }
  } catch {
    // Task not found in store, continue without transition hooks
  }

  // Find the previous task in the execution sequence
  // This should be the task that was completed immediately before the current task
  // We look at the epic's task list to find the sequentially previous task
  let prevTask: import('../store/types.ts').Task | null = null;
  let prevMs: import('../store/types.ts').Epic | null = null;

  if (currentTask && currentMs) {
    // First, try to find the previous task within the same epic
    const taskIndex = currentMs.task_ids.indexOf(currentTask.id);
    if (taskIndex > 0) {
      // There's a previous task in the same epic
      const prevTaskId = currentMs.task_ids[taskIndex - 1];
      prevTask = store.getTask(prevTaskId);
      prevMs = currentMs;
    } else if (taskIndex === 0) {
      // This is the first task in the current epic
      // Find the last task from the previous epic
      const allEpics = store.listEpics();
      const currentEpicIndex = allEpics.findIndex(e => e.id === currentMs.id);

      if (currentEpicIndex > 0) {
        // There's a previous epic
        const previousEpic = allEpics[currentEpicIndex - 1];
        if (previousEpic.task_ids.length > 0) {
          // Get the last task from the previous epic
          const lastTaskId = previousEpic.task_ids[previousEpic.task_ids.length - 1];
          prevTask = store.getTask(lastTaskId);
          prevMs = previousEpic;
        }
      }
    }
  }

  // 7c. NEW: Call beforeSwitchTask hook (before beforeTask)
  if (projectHooks.beforeSwitchTask && currentTask && currentMs) {
    try {
      const transitionCtx = createTaskTransitionContext(
        prevTask,
        prevMs,
        undefined,
        currentTask,
        currentMs,
        buildCtx,
        project,
        tools,
        executeOpts.vars
      );

      await projectHooks.beforeSwitchTask(transitionCtx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[task-adapter] beforeSwitchTask hook failed:`, err.message);

      if (projectHooks.onTaskFail) {
        await projectHooks.onTaskFail(ctx, err);
      }

      return {
        taskId: compoundTask.id,
        raw: '',
        durationMs: Date.now() - startTime,
        success: false,
        error: `beforeSwitchTask hook failed: ${err.message}`,
      };
    }
  }

  // 8. Execute project.hooks.beforeTask
  if (projectHooks.beforeTask) {
    try {
      await projectHooks.beforeTask(ctx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[task-adapter] beforeTask hook failed:`, err.message);

      // Call onTaskFail hook if it exists
      if (projectHooks.onTaskFail) {
        await projectHooks.onTaskFail(ctx, err);
      }

      return {
        taskId: compoundTask.id,
        raw: '',
        durationMs: Date.now() - startTime,
        success: false,
        error: `beforeTask hook failed: ${err.message}`,
      };
    }
  }

  // 9. Delegate to new executor (runs full hook chain)
  let result: TaskResult;
  try {
    result = await executeTask(executeOpts);

    // 9b. Write result to log file for non-agent tasks (verify, external executors)
    // Agent tasks write via onStream; these bypass the agent so log would stay blank.
    if (logFile) {
      const { appendFileSync } = await import('node:fs');
      const lines: string[] = [];
      if (result.output) lines.push(result.output);
      if (result.error) lines.push(`ERROR: ${result.error}`);
      if (result.metadata) {
        for (const [k, v] of Object.entries(result.metadata)) {
          if (v && typeof v === 'object' && 'raw' in v && (v as any).raw) {
            lines.push(`\n[${k}]\n${(v as any).raw}`);
          }
        }
      }
      if (lines.length > 0) appendFileSync(logFile, lines.join('\n'));
    }

    // 9c. Update task status based on execution result
    // This is critical for tasks that use external executors (executorFile)
    // since they bypass the agent wrapper that normally handles status updates
    const { editTask } = await import('../manager/index.ts');
    if (result.success) {
      await editTask(buildCtx, compoundTask.id, 'done');
    } else {
      await editTask(buildCtx, compoundTask.id, 'failed');
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Mark task as failed
    const { editTask } = await import('../manager/index.ts');
    try {
      await editTask(buildCtx, compoundTask.id, 'failed');
    } catch (statusError) {
      console.error(`[task-adapter] Failed to update task status:`, statusError);
    }

    // Execute project.hooks.onTaskFail
    if (projectHooks.onTaskFail) {
      await projectHooks.onTaskFail(ctx, err);
    }

    return {
      taskId: compoundTask.id,
      raw: '',
      durationMs: Date.now() - startTime,
      success: false,
      error: err.message,
    };
  }

  // 10. Execute project.hooks.afterTask (only on success)
  if (projectHooks.afterTask && result.success) {
    try {
      await projectHooks.afterTask(ctx, result);
    } catch (error) {
      console.error(`[task-adapter] afterTask hook failed:`, error);
      // Don't fail the task if afterTask hook fails
    }
  }

  // 10b. NEW: Call afterSwitchTask hook (after afterTask)
  if (projectHooks.afterSwitchTask && result.success && currentTask && currentMs) {
    try {
      const transitionCtx = createTaskTransitionContext(
        prevTask,
        prevMs,
        result,
        currentTask,
        currentMs,
        buildCtx,
        project,
        tools,
        executeOpts.vars
      );

      await projectHooks.afterSwitchTask(transitionCtx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[task-adapter] afterSwitchTask hook failed:`, err.message);
      // Don't block on afterSwitchTask failure
    }
  }

  // 11. Convert back to old TaskResult format
  return convertTaskResult(result, compoundTask.id);
}

/**
 * Get task directory path from compound task
 */
async function getTaskDir(buildCtx: BuildContext, compoundTask: CompoundTask): Promise<string> {
  const { HierarchicalStore } = await import('../store/hierarchical-store.ts');

  try {
    const store = new HierarchicalStore(buildCtx.appDir);

    // Parse display ID (e.g., "m1.1")
    let task = null;
    if (compoundTask.id.match(/^m(\d+)\.(\d+)$/)) {
      const [, msNum, taskNum] = compoundTask.id.match(/^m(\d+)\.(\d+)$/) || [];
      const epic = store.getEpicByNumber(parseInt(msNum, 10));
      if (epic && epic.task_ids[parseInt(taskNum, 10) - 1]) {
        task = store.getTask(epic.task_ids[parseInt(taskNum, 10) - 1]);
      }
    } else {
      task = store.getTask(compoundTask.id as import('../store/types.ts').TaskId);
    }

    if (!task) {
      // Fallback: if we can't find the task, return empty string
      return '';
    }

    const location = store.getTaskLocation(task.id);
    if (!location) {
      return '';
    }

    // Construct path from epic and task info
    const epicSlug = `${location.epic.number.toString().padStart(2, '0')}-${slugify(location.epic.title)}`;
    const taskIndex = location.epic.task_ids.indexOf(task.id) + 1;
    const taskSlug = `${taskIndex.toString().padStart(2, '0')}-${slugify(task.title)}`;

    return join(buildCtx.appDir, '.crew', 'epics', epicSlug, 'tasks', taskSlug);
  } catch (error) {
    // If we can't get the task directory, return empty string
    console.warn(`[task-adapter] Failed to get task directory: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

/**
 * Slugify a string for use in directory names
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Create a TaskContext for hook execution
 */
function createTaskContextForHook(opts: ExecuteOptions): TaskContext {
  const stateStore = new Map<string, unknown>();

  return {
    taskId: opts.compoundTask.id,
    task: opts.task,
    compoundTask: opts.compoundTask,
    epic: opts.epic,
    project: opts.project,
    buildCtx: opts.buildCtx,
    taskDir: opts.taskDir,
    agent: opts.agent,
    tools: opts.tools,
    vars: opts.vars,
    state: {
      get<T>(key: string): T | undefined {
        return stateStore.get(key) as T | undefined;
      },
      set<T>(key: string, value: T): void {
        stateStore.set(key, value);
      },
      has(key: string): boolean {
        return stateStore.has(key);
      },
      delete(key: string): boolean {
        return stateStore.delete(key);
      },
    },
    log: {
      info(message: string, meta?: Record<string, unknown>): void {
        const tag = _c.cyan(`task:${opts.compoundTask.id}`);
        console.error(`    [${tag}] ${message}${formatMeta(meta)}`);
      },
      warn(message: string, meta?: Record<string, unknown>): void {
        const tag = _c.cyan(`task:${opts.compoundTask.id}`);
        console.error(`    [${tag}] ${_c.yellow('WARN')}: ${message}${formatMeta(meta)}`);
      },
      error(message: string, meta?: Record<string, unknown>): void {
        const tag = _c.cyan(`task:${opts.compoundTask.id}`);
        console.error(`    [${tag}] ${_c.red('ERROR')}: ${message}${formatMeta(meta)}`);
      },
      debug(message: string, meta?: Record<string, unknown>): void {
        if (process.env.DEBUG) {
          const tag = _c.cyan(`task:${opts.compoundTask.id}`);
          console.error(`    [${tag}] ${_c.dim('DEBUG')}: ${message}${formatMeta(meta)}`);
        }
      },
    },
  };
}

/**
 * Helper to get display ID (m1.2) from task and epic
 */
function getDisplayId(task: import('../store/types.ts').Task, epic: import('../store/types.ts').Epic): string {
  const idx = epic.task_ids.indexOf(task.id);
  return idx >= 0 ? `m${epic.number}.${idx + 1}` : task.id;
}

/**
 * Format metadata object as a compact, readable string.
 * e.g. { skill: 'default', agent: 'none' } → "skill=default agent=none"
 * Booleans are shown as flag presence/absence, paths are shortened.
 */
function formatMeta(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return '';
  const entries = Object.entries(meta as Record<string, unknown>);
  if (entries.length === 0) return '';
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      if (value) parts.push(key);
    } else if (typeof value === 'string' && value.length > 60) {
      // Truncate long values (e.g. file paths)
      parts.push(`${key}=…${value.slice(-40)}`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * Helper to create logger with prefix
 */
function createLogger(prefix: string) {
  const tag = _c.dim(prefix);
  return {
    info: (msg: string, meta?: unknown) => {
      console.log(`    [${tag}] ${msg}${formatMeta(meta)}`);
    },
    warn: (msg: string) => {
      console.warn(`    [${tag}] ${_c.yellow(msg)}`);
    },
    error: (msg: string) => {
      console.error(`    [${tag}] ${_c.red(msg)}`);
    },
  };
}

/**
 * Create context for task transition hooks
 */
export function createTaskTransitionContext(
  prevTask: import('../store/types.ts').Task | null,
  prevEpic: import('../store/types.ts').Epic | null,
  prevResult: TaskResult | undefined,
  nextTask: import('../store/types.ts').Task,
  nextEpic: import('../store/types.ts').Epic,
  buildCtx: BuildContext,
  project: import('../tasks/types.ts').ProjectContext,
  tools: import('../tasks/types.ts').TaskTools,
  vars: Record<string, unknown>
): import('../config-loader.ts').TaskTransitionContext {
  return {
    prevTask: prevTask ? {
      id: prevTask.id,
      displayId: getDisplayId(prevTask, prevEpic!),
      title: prevTask.title,
      status: prevTask.status as 'done' | 'failed',
      result: prevResult,
      epic: {
        id: prevEpic!.id,
        number: prevEpic!.number,
        title: prevEpic!.title,
      },
    } : null,
    nextTask: {
      id: nextTask.id,
      displayId: getDisplayId(nextTask, nextEpic),
      title: nextTask.title,
      status: 'pending',
      epic: {
        id: nextEpic.id,
        number: nextEpic.number,
        title: nextEpic.title,
      },
    },
    project,
    buildCtx,
    tools,
    log: createLogger('task-transition'),
    vars,
  };
}

/**
 * Create context for epic transition hooks
 */
export function createEpicTransitionContext(
  prevEpic: import('../store/types.ts').Epic | null,
  prevEpicTasks: import('../store/types.ts').Task[],
  nextEpic: import('../store/types.ts').Epic,
  nextEpicTasks: import('../store/types.ts').Task[],
  buildCtx: BuildContext,
  project: import('../tasks/types.ts').ProjectContext,
  tools: import('../tasks/types.ts').TaskTools,
  vars: Record<string, unknown>
): import('../config-loader.ts').EpicTransitionContext {
  return {
    prevEpic: prevEpic ? {
      id: prevEpic.id,
      number: prevEpic.number,
      title: prevEpic.title,
      status: 'done',
      taskCount: prevEpicTasks.length,
      completedTaskCount: prevEpicTasks.filter(t => t.status === 'done').length,
    } : null,
    nextEpic: {
      id: nextEpic.id,
      number: nextEpic.number,
      title: nextEpic.title,
      status: 'planned',
      taskCount: nextEpicTasks.length,
      gates: nextEpic.gates || [],
    },
    project,
    buildCtx,
    tools,
    log: createLogger('epic-transition'),
    vars,
  };
}
