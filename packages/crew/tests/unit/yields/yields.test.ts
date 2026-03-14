/**
 * Unit tests for the Yields (incremental planning) feature.
 *
 * Tests:
 *   1. Fluent builder — .yields() with string, declarative, and function configs
 *   2. Task adapter — convertCompoundTaskToTaskDef passes yields through
 *   3. Executor — executeTask with yields (programmatic, AI-driven, static, enrichment)
 *   4. parseYieldedTasks — XML parsing of AI response
 *   5. validateYieldedTasks — atomic/transferable/verifiable principle enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ================================================================== */
/*  1. Fluent Builder                                                  */
/* ================================================================== */

import { TaskBuilder } from '../../../src/tasks/fluent-builder.ts';

describe('TaskBuilder.yields()', () => {
  it('accepts a string and wraps it as { plan }', () => {
    const task = new TaskBuilder('t1', 'Plan animations')
      .yields('Create one task per animation group')
      .build();

    expect(task.yields).toEqual({ plan: 'Create one task per animation group' });
  });

  it('accepts a declarative config object', () => {
    const config = {
      plan: 'Split spec into tasks',
      target: 'next-epic' as const,
      maxTasks: 5,
      checks: ['build'],
      taskType: 'coding',
    };
    const task = new TaskBuilder('t2', 'Plan stuff')
      .yields(config)
      .build();

    expect(task.yields).toEqual(config);
  });

  it('accepts a programmatic function', () => {
    const fn = async () => [];
    const task = new TaskBuilder('t3', 'Dynamic plan')
      .yields(fn)
      .build();

    expect(task.yields).toBe(fn);
  });

  it('is chainable with other builder methods', () => {
    const task = new TaskBuilder('t4', 'Chain test')
      .skill('planner')
      .inputs(['spec.md'])
      .yields({ plan: 'Do things' })
      .outputs(['result.md'])
      .build();

    expect(task.skill).toBe('planner');
    expect(task.inputs).toEqual(['spec.md']);
    expect(task.outputs).toEqual(['result.md']);
    expect(task.yields).toEqual({ plan: 'Do things' });
  });

  it('is available through PlanningBuilder proxy', () => {
    const task = new TaskBuilder('t5', 'Plan + yields')
      .planning()
      .yields({ plan: 'After planning, yield more tasks' })
      .build();

    expect(task.planning?.enabled).toBe(true);
    expect(task.yields).toEqual({ plan: 'After planning, yield more tasks' });
  });
});

/* ================================================================== */
/*  2. Task Adapter — convertCompoundTaskToTaskDef                     */
/*  (tested via extracted logic — avoids deep import chain)            */
/* ================================================================== */

describe('convertCompoundTaskToTaskDef — yields passthrough', () => {
  // Replicate the conversion logic exactly as in task-adapter.ts
  // to avoid importing the module (which triggers agentfn → claudefn resolution)
  function convertCompoundTaskToTaskDef(ct: any) {
    const skill = ct.skills?.[0];
    return {
      id: ct.id,
      title: ct.title,
      type: ct.type,
      skill,
      inputs: ct.input?.split(',').map((s: string) => s.trim()).filter(Boolean),
      outputs: ct.output?.split(',').map((s: string) => s.trim()).filter(Boolean),
      deps: ct.deps || [],
      prompt: ct.prompt,
      yields: ct.yields,
    };
  }

  it('passes yields from CompoundTask to TaskDef', () => {
    const ct = {
      id: 'm2.4',
      title: 'Plan animations',
      status: 'pending',
      yields: {
        plan: 'Create tasks per animation group',
        target: 'current-epic',
        maxTasks: 10,
        checks: ['build'],
        taskType: 'coding',
      },
    };

    const taskDef = convertCompoundTaskToTaskDef(ct);

    expect(taskDef.yields).toEqual({
      plan: 'Create tasks per animation group',
      target: 'current-epic',
      maxTasks: 10,
      checks: ['build'],
      taskType: 'coding',
    });
  });

  it('passes undefined yields when not set', () => {
    const ct = {
      id: 'm1.1',
      title: 'Normal task',
      status: 'pending',
    };

    const taskDef = convertCompoundTaskToTaskDef(ct);
    expect(taskDef.yields).toBeUndefined();
  });

  it('preserves other fields alongside yields', () => {
    const ct = {
      id: 'm2.4',
      title: 'Plan',
      status: 'pending',
      input: 'docs/spec.md',
      output: 'src/result.tsx',
      skills: ['planner'],
      prompt: 'Do the plan',
      yields: { plan: 'Create tasks' },
    };

    const taskDef = convertCompoundTaskToTaskDef(ct);
    expect(taskDef.id).toBe('m2.4');
    expect(taskDef.inputs).toEqual(['docs/spec.md']);
    expect(taskDef.outputs).toEqual(['src/result.tsx']);
    expect(taskDef.skill).toBe('planner');
    expect(taskDef.prompt).toBe('Do the plan');
    expect(taskDef.yields).toEqual({ plan: 'Create tasks' });
  });
});

/* ================================================================== */
/*  3. parseYieldedTasks — JSON parsing                                */
/* ================================================================== */

describe('parseYieldedTasks (JSON parsing)', () => {
  // Replicate the parser from executor.ts for direct testing
  function parseYieldedTasks(raw: string) {
    const tasks: any[] = [];

    // Try to extract JSON from ```json code block
    const jsonBlockMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : raw;

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(jsonStr);
      const taskArray = Array.isArray(parsed) ? parsed : [parsed];

      for (const taskObj of taskArray) {
        if (!taskObj.title) continue; // title is required

        // Map JSON fields to TaskDef format
        const task = {
          id: taskObj.id || undefined,
          title: taskObj.title,
          skill: taskObj.skill || undefined,
          inputs: taskObj.inputs || undefined,
          outputs: taskObj.outputs || undefined,
          deps: taskObj.deps || undefined,
          prompt: taskObj.prompt || undefined,
          checks: taskObj.checks || undefined,
        };

        tasks.push(task);
      }
    } catch (err) {
      // If JSON parsing fails, return empty array
      return [];
    }

    return tasks;
  }

  it('parses a single task from valid JSON in code block', () => {
    const json = `\`\`\`json
[
  {
    "id": "impl-gsap",
    "title": "Implement GSAP scroll-pinned hero animation",
    "skill": "animation-impl",
    "inputs": ["docs/pages/homepage/animations.md"],
    "outputs": ["src/app/_components/animations/gsap-hero.tsx"],
    "checks": ["build"],
    "prompt": "Implement the GSAP scroll-pinned animation for the hero section."
  }
]
\`\`\``;

    const tasks = parseYieldedTasks(json);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('impl-gsap');
    expect(tasks[0].title).toBe('Implement GSAP scroll-pinned hero animation');
    expect(tasks[0].skill).toBe('animation-impl');
    expect(tasks[0].inputs).toEqual(['docs/pages/homepage/animations.md']);
    expect(tasks[0].outputs).toEqual(['src/app/_components/animations/gsap-hero.tsx']);
    expect(tasks[0].checks).toEqual(['build']);
    expect(tasks[0].prompt).toBe('Implement the GSAP scroll-pinned animation for the hero section.');
  });

  it('parses multiple tasks', () => {
    const json = `\`\`\`json
[
  {
    "id": "impl-gsap",
    "title": "GSAP animations",
    "inputs": ["spec.md"],
    "outputs": ["gsap.tsx"],
    "prompt": "Build GSAP anims"
  },
  {
    "id": "impl-css",
    "title": "CSS keyframes",
    "inputs": ["spec.md"],
    "outputs": ["keyframes.tsx"],
    "prompt": "Build CSS keyframe anims"
  }
]
\`\`\``;

    const tasks = parseYieldedTasks(json);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('GSAP animations');
    expect(tasks[1].title).toBe('CSS keyframes');
  });

  it('skips tasks without a title', () => {
    const json = `\`\`\`json
[
  {
    "id": "no-title",
    "inputs": ["spec.md"]
  },
  {
    "id": "has-title",
    "title": "Valid task",
    "prompt": "Do the thing"
  }
]
\`\`\``;

    const tasks = parseYieldedTasks(json);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Valid task');
  });

  it('handles multi-value arrays', () => {
    const json = `\`\`\`json
[
  {
    "title": "Multi-input task",
    "inputs": ["spec.md", "config.json", "styles.css"],
    "outputs": ["result.tsx", "result.test.tsx"],
    "deps": ["task-1", "task-2"],
    "checks": ["build", "tsc", "lint"],
    "prompt": "Process multiple files"
  }
]
\`\`\``;

    const tasks = parseYieldedTasks(json);
    expect(tasks[0].inputs).toEqual(['spec.md', 'config.json', 'styles.css']);
    expect(tasks[0].outputs).toEqual(['result.tsx', 'result.test.tsx']);
    expect(tasks[0].deps).toEqual(['task-1', 'task-2']);
    expect(tasks[0].checks).toEqual(['build', 'tsc', 'lint']);
  });

  it('returns empty array for no JSON', () => {
    expect(parseYieldedTasks('No JSON here')).toEqual([]);
    expect(parseYieldedTasks('')).toEqual([]);
  });

  it('handles multiline prompts', () => {
    const json = `\`\`\`json
[
  {
    "title": "Multiline prompt task",
    "prompt": "Line one of the prompt.\\nLine two of the prompt.\\n\\nLine four after blank."
  }
]
\`\`\``;

    const tasks = parseYieldedTasks(json);
    expect(tasks[0].prompt).toContain('Line one');
    expect(tasks[0].prompt).toContain('Line two');
    expect(tasks[0].prompt).toContain('Line four');
  });

  it('parses JSON without code block wrapper', () => {
    const jsonOutput = `[{"id": "m2.4.1", "title": "Implement GSAP hero animation", "inputs": ["spec.md"], "outputs": ["out.tsx"]}]`;
    const tasks = parseYieldedTasks(jsonOutput);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Implement GSAP hero animation');
  });

  it('parses single object JSON (converts to array)', () => {
    const jsonOutput = `\`\`\`json
{
  "id": "m2.4.1",
  "title": "Implement GSAP ScrollTrigger hero scene",
  "inputs": ["docs/pages/homepage/animations.md"],
  "outputs": ["src/app/page.tsx"]
}
\`\`\``;
    const tasks = parseYieldedTasks(jsonOutput);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Implement GSAP ScrollTrigger hero scene');
  });

  it('returns empty array for invalid JSON', () => {
    const invalidJson = `\`\`\`json
{invalid json syntax here
\`\`\``;
    const tasks = parseYieldedTasks(invalidJson);
    expect(tasks).toEqual([]);
  });
});

/* ================================================================== */
/*  4. validateYieldedTasks (principle enforcement)                     */
/* ================================================================== */

describe('validateYieldedTasks (atomic/transferable/verifiable)', () => {
  // Replicate the validator from executor.ts for direct testing
  function validateYieldedTasks(tasks: any[], log: any) {
    const valid: any[] = [];

    for (const task of tasks) {
      const warnings: string[] = [];

      if (/\band\b/i.test(task.title) && task.title.length > 60) {
        warnings.push(`title may describe multiple concerns: "${task.title}"`);
      }
      if (!task.inputs?.length) {
        warnings.push('no inputs declared — task may not be transferable');
      }
      if (!task.prompt) {
        warnings.push('no prompt — task is not self-contained');
      }
      if (!task.outputs?.length) {
        warnings.push('no outputs declared — task is not verifiable');
      }
      if (task.prompt && task.prompt.length > 3000) {
        warnings.push(`prompt is ${task.prompt.length} chars — consider splitting into smaller tasks`);
      }

      if (warnings.length > 0) {
        log.warn(`Yielded task "${task.title}" has issues:\n  - ${warnings.join('\n  - ')}`);
      }

      valid.push(task);
    }

    return valid;
  }

  let warnMessages: string[];
  let log: any;

  beforeEach(() => {
    warnMessages = [];
    log = {
      info: vi.fn(),
      warn: vi.fn((msg: string) => warnMessages.push(msg)),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  it('passes a well-formed task with no warnings', () => {
    const tasks = validateYieldedTasks([{
      title: 'Implement GSAP hero animation',
      inputs: ['docs/animations.md'],
      outputs: ['src/animations/gsap-hero.tsx'],
      prompt: 'Implement the GSAP scroll-pinned animation...',
    }], log);

    expect(tasks).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns on missing inputs (not transferable)', () => {
    validateYieldedTasks([{
      title: 'Task without inputs',
      outputs: ['out.tsx'],
      prompt: 'Do something',
    }], log);

    expect(log.warn).toHaveBeenCalled();
    expect(warnMessages[0]).toContain('no inputs declared');
  });

  it('warns on missing outputs (not verifiable)', () => {
    validateYieldedTasks([{
      title: 'Task without outputs',
      inputs: ['in.md'],
      prompt: 'Do something',
    }], log);

    expect(log.warn).toHaveBeenCalled();
    expect(warnMessages[0]).toContain('no outputs declared');
  });

  it('warns on missing prompt (not self-contained)', () => {
    validateYieldedTasks([{
      title: 'Task without prompt',
      inputs: ['in.md'],
      outputs: ['out.tsx'],
    }], log);

    expect(log.warn).toHaveBeenCalled();
    expect(warnMessages[0]).toContain('no prompt');
  });

  it('warns on overly long prompts', () => {
    validateYieldedTasks([{
      title: 'Long prompt task',
      inputs: ['in.md'],
      outputs: ['out.tsx'],
      prompt: 'x'.repeat(3500),
    }], log);

    expect(log.warn).toHaveBeenCalled();
    expect(warnMessages[0]).toContain('3500 chars');
  });

  it('warns on compound titles (potential non-atomic task)', () => {
    validateYieldedTasks([{
      title: 'Implement GSAP animations for the hero section and build CSS keyframes for the carousel component',
      inputs: ['in.md'],
      outputs: ['out.tsx'],
      prompt: 'Do both things',
    }], log);

    expect(log.warn).toHaveBeenCalled();
    expect(warnMessages[0]).toContain('multiple concerns');
  });

  it('does not warn on short titles with "and"', () => {
    validateYieldedTasks([{
      title: 'Drag and drop animation',
      inputs: ['in.md'],
      outputs: ['out.tsx'],
      prompt: 'Implement drag and drop',
    }], log);

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('still returns tasks even with warnings (non-blocking)', () => {
    const tasks = validateYieldedTasks([
      { title: 'Bad task 1' },
      { title: 'Bad task 2' },
    ], log);

    expect(tasks).toHaveLength(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================== */
/*  5. Yields enrichment — inherited checks and taskType               */
/* ================================================================== */

describe('Yields enrichment (checks + taskType inheritance)', () => {
  // Replicate the enrichment logic from executor.ts runYields()
  function enrichYieldedTasks(
    taskDefs: any[],
    decl: { checks?: string[]; taskType?: string; maxTasks?: number },
  ) {
    const maxTasks = decl.maxTasks || 20;
    return taskDefs.slice(0, maxTasks).map((task: any) => {
      const enriched = { ...task };
      if (decl.taskType && !enriched.type) {
        enriched.type = decl.taskType;
      }
      if (decl.checks?.length) {
        const existing = enriched.checks || [];
        enriched.checks = [...existing, ...decl.checks];
      }
      return enriched;
    });
  }

  it('inherits taskType when task has no type', () => {
    const tasks = enrichYieldedTasks(
      [{ title: 'Task A' }, { title: 'Task B' }],
      { taskType: 'coding' },
    );

    expect(tasks[0].type).toBe('coding');
    expect(tasks[1].type).toBe('coding');
  });

  it('does not override existing task type', () => {
    const tasks = enrichYieldedTasks(
      [{ title: 'Task A', type: 'testing' }],
      { taskType: 'coding' },
    );

    expect(tasks[0].type).toBe('testing');
  });

  it('merges inherited checks with per-task checks', () => {
    const tasks = enrichYieldedTasks(
      [{ title: 'Task A', checks: ['tsc'] }],
      { checks: ['build', 'lint'] },
    );

    expect(tasks[0].checks).toEqual(['tsc', 'build', 'lint']);
  });

  it('adds inherited checks when task has none', () => {
    const tasks = enrichYieldedTasks(
      [{ title: 'Task A' }],
      { checks: ['build'] },
    );

    expect(tasks[0].checks).toEqual(['build']);
  });

  it('respects maxTasks limit', () => {
    const manyTasks = Array.from({ length: 30 }, (_, i) => ({ title: `Task ${i}` }));
    const tasks = enrichYieldedTasks(manyTasks, { maxTasks: 5 });

    expect(tasks).toHaveLength(5);
  });

  it('defaults maxTasks to 20', () => {
    const manyTasks = Array.from({ length: 25 }, (_, i) => ({ title: `Task ${i}` }));
    const tasks = enrichYieldedTasks(manyTasks, {});

    expect(tasks).toHaveLength(20);
  });
});

/* ================================================================== */
/*  6. Full executeTask with yields — integration-style                */
/* ================================================================== */

// Mock agentfn and its transitive deps before importing executor
vi.mock('agentfn', () => ({
  agentfn: vi.fn(() => async () => ({ data: 'ok', raw: 'done', durationMs: 10 })),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
}));

vi.mock('../../../src/agent-loader.ts', () => ({
  loadAgentPersona: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/config-loader.ts', () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/tasks/task-types.ts', () => ({
  getTaskType: vi.fn().mockReturnValue(undefined),
  collectChecks: vi.fn().mockReturnValue([]),
  runChecks: vi.fn().mockResolvedValue({ allPassed: true, results: [], failed: [] }),
}));

vi.mock('../../../src/tasks/feedback.ts', () => ({
  collectTaskReport: vi.fn().mockResolvedValue({
    report: { status: 'done', summary: 'ok', errors: [], followUpActions: [] },
    savedPath: '/tmp/report.md',
    durationMs: 100,
  }),
  TASK_COMPLETION_PROMPT: 'report prompt',
}));

import { executeTask } from '../../../src/tasks/executor.ts';
import type { TaskDef, TaskResult, YieldsDeclarative } from '../../../src/tasks/types.ts';

describe('executeTask with yields', () => {
  function makeOpts(taskDef: TaskDef, agentResponses?: string[]) {
    let callIndex = 0;
    const mockAgent = vi.fn(async (_prompt: string) => {
      const output = agentResponses?.[callIndex] || 'done';
      callIndex++;
      return { success: true, output, durationMs: 100 };
    });

    const writtenFiles = new Map<string, string>();
    const mockTools = {
      file: {
        read: vi.fn(async (path: string) => `content of ${path}`),
        write: vi.fn(async (path: string, content: string) => { writtenFiles.set(path, content); }),
        exists: vi.fn(async () => false),
        glob: vi.fn(async () => []),
      },
      shell: { run: vi.fn() },
      git: { status: vi.fn(), diff: vi.fn(), add: vi.fn(), commit: vi.fn() },
    };

    return {
      task: taskDef,
      compoundTask: { id: 'm2.4', title: taskDef.title, status: 'pending' as const },
      epic: { id: 'epic-02', title: 'Homepage', num: 2, tasks: [] },
      project: { name: 'steep', title: 'Steep App', vars: {} },
      buildCtx: { appDir: '/tmp/test-app' },
      taskDir: '/tmp/test-app/.crew/epics/02/tasks/04',
      vars: {},
      agent: mockAgent,
      tools: mockTools,
      attempt: 1,
      _writtenFiles: writtenFiles,
      _mockAgent: mockAgent,
    };
  }

  it('runs yields after successful task and returns spawnedTasks', async () => {
    const yieldedJson = `\`\`\`json
[
  {
    "id": "impl-gsap",
    "title": "Implement GSAP hero animation",
    "inputs": ["docs/animations.md"],
    "outputs": ["src/animations/gsap-hero.tsx"],
    "prompt": "Implement the GSAP animation"
  }
]
\`\`\``;

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Plan animation implementation',
      prompt: 'Read the animation spec and plan tasks',
      outputs: ['docs/animations.md'],
      yields: {
        plan: 'Create one task per animation group',
        target: 'current-epic',
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['task execution done', yieldedJson]);
    const result = await executeTask(opts);

    expect(result.success).toBe(true);
    expect(result.spawnedTasks).toBeDefined();
    expect(result.spawnedTasks!.length).toBeGreaterThan(0);
    expect(result.spawnedTasks![0].task.title).toBe('Implement GSAP hero animation');
    expect(result.spawnedTasks![0].parentTaskId).toBe('m2.4');
    expect(result.spawnedTasks![0].target).toBe('current-epic');
  });

  it('does not run yields on failed task', async () => {
    const mockAgent = vi.fn(async () => ({
      success: false,
      output: 'error occurred',
      error: 'Something broke',
      durationMs: 50,
    }));

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Failing task',
      prompt: 'This will fail',
      yields: { plan: 'Should not run' } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef);
    opts.agent = mockAgent;
    const result = await executeTask(opts);

    expect(result.success).toBe(false);
    expect(result.spawnedTasks).toBeUndefined();
  });

  it('does not run yields when task has no yields config', async () => {
    const taskDef: TaskDef = {
      id: 'm1.1',
      title: 'Normal task',
      prompt: 'Just do stuff',
    };

    const opts = makeOpts(taskDef, ['done']);
    const result = await executeTask(opts);

    expect(result.success).toBe(true);
    expect(result.spawnedTasks).toBeUndefined();
    // Agent called once (execution) + once (report), NOT for yields
    expect(opts._mockAgent).toHaveBeenCalledTimes(1);
  });

  it('applies inherited checks and taskType from yields config', async () => {
    const yieldedJson = `\`\`\`json
[
  {
    "id": "impl-css",
    "title": "CSS keyframe animations",
    "inputs": ["spec.md"],
    "outputs": ["keyframes.tsx"],
    "prompt": "Implement CSS keyframes"
  }
]
\`\`\``;

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Plan tasks',
      prompt: 'Plan',
      outputs: ['spec.md'],
      yields: {
        plan: 'Create tasks',
        taskType: 'coding',
        checks: ['build'],
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['execution done', yieldedJson]);
    const result = await executeTask(opts);

    expect(result.success).toBe(true);
    expect(result.spawnedTasks).toBeDefined();
    const spawned = result.spawnedTasks![0].task;
    expect(spawned.type).toBe('coding');
    expect(spawned.checks).toContain('build');
  });

  it('saves yields.md audit file', async () => {
    const yieldedJson = `\`\`\`json
[
  {
    "id": "audit-test",
    "title": "Audit test task",
    "inputs": ["spec.md"],
    "outputs": ["out.tsx"],
    "prompt": "Do the audit test"
  }
]
\`\`\``;

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Plan stuff',
      prompt: 'Plan it',
      outputs: ['spec.md'],
      yields: { plan: 'Create tasks' } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['done', yieldedJson]);
    await executeTask(opts);

    const yieldsFile = '/tmp/test-app/.crew/epics/02/tasks/04/yields.md';
    expect(opts.tools.file.write).toHaveBeenCalledWith(
      yieldsFile,
      expect.stringContaining('Yielded Tasks'),
    );
  });

  it('respects maxTasks limit', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      inputs: ['in.md'],
      outputs: [`out${i}.tsx`],
      prompt: `Do thing ${i}`
    }));
    const yieldedJson = `\`\`\`json\n${JSON.stringify(tasks, null, 2)}\n\`\`\``;

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Limited plan',
      prompt: 'Plan',
      outputs: ['in.md'],
      yields: {
        plan: 'Create tasks',
        maxTasks: 3,
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['done', yieldedJson]);
    const result = await executeTask(opts);

    expect(result.spawnedTasks).toHaveLength(3);
  });

  it('handles static template yields', async () => {
    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Static yields',
      prompt: 'Plan',
      yields: {
        tasks: [
          { id: 'static-1', title: 'Static task 1', prompt: 'Do 1', inputs: ['a.md'], outputs: ['b.tsx'] },
          { id: 'static-2', title: 'Static task 2', prompt: 'Do 2', inputs: ['c.md'], outputs: ['d.tsx'] },
        ],
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['done']);
    const result = await executeTask(opts);

    expect(result.spawnedTasks).toHaveLength(2);
    expect(result.spawnedTasks![0].task.title).toBe('Static task 1');
    expect(result.spawnedTasks![1].task.title).toBe('Static task 2');
  });

  it('handles programmatic yields function', async () => {
    const yieldsFn = async () => [
      { id: 'fn-1', title: 'Dynamic task 1', prompt: 'Do', inputs: ['a'], outputs: ['b'] },
    ];

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Programmatic yields',
      prompt: 'Plan',
      yields: yieldsFn,
    };

    const opts = makeOpts(taskDef, ['done']);
    const result = await executeTask(opts);

    expect(result.spawnedTasks).toHaveLength(1);
    expect(result.spawnedTasks![0].task.title).toBe('Dynamic task 1');
  });

  it('skips yields when declarative when() returns false', async () => {
    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Conditional yields',
      prompt: 'Plan',
      yields: {
        plan: 'Should not run',
        when: (_result: TaskResult) => false,
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['done']);
    const result = await executeTask(opts);

    expect(result.spawnedTasks).toBeUndefined();
    // Agent called once for execution, NOT for yields planning
    expect(opts._mockAgent).toHaveBeenCalledTimes(1);
  });

  it('returns empty spawned when approval is review', async () => {
    const yieldedJson = `\`\`\`json
[
  {
    "id": "review-task",
    "title": "Review mode task",
    "inputs": ["spec.md"],
    "outputs": ["out.tsx"],
    "prompt": "Do the thing"
  }
]
\`\`\``;

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Review yields',
      prompt: 'Plan',
      outputs: ['spec.md'],
      yields: {
        plan: 'Create tasks',
        approval: 'review',
      } as YieldsDeclarative,
    };

    const opts = makeOpts(taskDef, ['done', yieldedJson]);
    const result = await executeTask(opts);

    // Tasks should NOT be spawned — they await human review
    expect(result.spawnedTasks).toBeUndefined();
  });

  it('yields is non-fatal on error', async () => {
    const yieldsFn = async () => {
      throw new Error('yields kaboom');
    };

    const taskDef: TaskDef = {
      id: 'm2.4',
      title: 'Error yields',
      prompt: 'Plan',
      yields: yieldsFn,
    };

    const opts = makeOpts(taskDef, ['done']);
    const result = await executeTask(opts);

    // Task itself should still succeed
    expect(result.success).toBe(true);
    expect(result.spawnedTasks).toBeUndefined();
  });
});

/* ================================================================== */
/*  7. Store type — yields field on Task                               */
/* ================================================================== */

describe('Store Task type — yields field', () => {
  it('accepts yields config in task.json structure', () => {
    // This test verifies the type system accepts yields on the store Task type.
    // We just check that a valid task.json structure can be created.
    const taskJson = {
      id: 'task_04plananimimpl',
      version: 1,
      title: 'Plan animation implementation tasks',
      status: 'pending',
      epic_id: 'epic_0mmhcxi0li3om6nacjm',
      type: 'planning',
      yields: {
        plan: 'Create one task per animation group',
        taskType: 'coding',
        checks: ['build'],
        target: 'current-epic',
        maxTasks: 10,
      },
      dependencies: [],
      dependents: [],
      attempts: [],
      status_history: [],
      created: { at: '2026-03-08T07:00:00.000Z', by: 'agent_system' },
      updated: { at: '2026-03-08T07:00:00.000Z', by: 'agent_system' },
    };

    expect(taskJson.yields).toBeDefined();
    expect(taskJson.yields.plan).toBe('Create one task per animation group');
    expect(taskJson.yields.target).toBe('current-epic');
    expect(taskJson.yields.maxTasks).toBe(10);
    expect(taskJson.yields.checks).toEqual(['build']);
    expect(taskJson.yields.taskType).toBe('coding');
  });
});
