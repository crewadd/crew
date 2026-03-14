/**
 * Unit tests for the Harness system (DefaultHarness, AutoHarness, utilities)
 *
 * Tests the core harness abstraction inspired by AutoHarness (arXiv:2603.03329).
 * The key difference from a naive rule-list approach: AutoHarness generates
 * executable code, not declarative rules. The synthesized function runs
 * deterministically with no LLM in the evaluation loop.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DefaultHarness,
  AutoHarness,
  createHarness,
  buildHarnessSynthesisPrompt,
  buildHarnessRefinementPrompt,
  consolidateIssues,
  extractHarnessCode,
  executeHarnessCode,
} from '../../../src/tasks/harness.ts';
import type {
  TaskContext,
  TaskResult,
  HarnessVerdict,
  HarnessConfig,
} from '../../../src/tasks/types.ts';

// Mock task-types module (collectChecks, runChecks)
vi.mock('../../../src/tasks/task-types.ts', () => ({
  collectChecks: vi.fn(() => []),
  runChecks: vi.fn(() => ({ allPassed: true, passed: [], failed: [], results: [] })),
}));

// Mock harness-io (persistence)
vi.mock('../../../src/store/fs/harness-io.ts', () => ({
  readHarnessCode: vi.fn(() => null),
  writeHarnessCode: vi.fn(),
  clearHarnessCode: vi.fn(),
  writeHarnessVerdict: vi.fn(),
}));

import { collectChecks, runChecks } from '../../../src/tasks/task-types.ts';
import { readHarnessCode, writeHarnessCode, clearHarnessCode, writeHarnessVerdict } from '../../../src/store/fs/harness-io.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 'test-task',
    task: {
      id: 'test-task',
      title: 'Test Task',
      prompt: 'Build a test component',
      inputs: ['input.json'],
      outputs: ['output.tsx'],
    },
    compoundTask: { id: 'test-task', title: 'Test Task', status: 'pending' },
    epic: { id: 'epic-1', title: 'Test Epic' },
    project: { dir: '/tmp/test' },
    buildCtx: { appDir: '/tmp/test' },
    taskDir: '/tmp/test/.crew/tasks/test-task',
    agent: vi.fn(),
    tools: {
      file: {
        read: vi.fn().mockResolvedValue('export default function Nav() {}'),
        exists: vi.fn().mockResolvedValue(true),
        glob: vi.fn().mockResolvedValue(['src/Nav.tsx']),
        write: vi.fn(),
      },
      shell: {
        run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
      },
      git: {},
    } as any,
    state: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
    },
    vars: {},
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  } as unknown as TaskContext;
}

function makeResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    success: true,
    durationMs: 100,
    output: 'Task completed',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  extractHarnessCode                                                 */
/* ------------------------------------------------------------------ */

describe('extractHarnessCode', () => {
  it('extracts from ```javascript code block', () => {
    const raw = '```javascript\nconst x = await file.read("foo");\nissues.push({ message: "bad", severity: "error" });\n```';
    const code = extractHarnessCode(raw);
    expect(code).toContain('await file.read("foo")');
    expect(code).toContain('issues.push');
  });

  it('extracts from ```js code block', () => {
    const raw = '```js\nconst x = 1;\n```';
    expect(extractHarnessCode(raw)).toBe('const x = 1;');
  });

  it('extracts from generic code block', () => {
    const raw = '```\nawait file.exists("x");\n```';
    expect(extractHarnessCode(raw)).toBe('await file.exists("x");');
  });

  it('handles raw code with await keyword', () => {
    const raw = 'const x = await file.read("f");';
    expect(extractHarnessCode(raw)).toBe(raw);
  });

  it('handles raw code with issues.push', () => {
    const raw = 'issues.push({ message: "fail", severity: "error" });';
    expect(extractHarnessCode(raw)).toBe(raw);
  });

  it('returns null for non-code text', () => {
    expect(extractHarnessCode('Here are some rules to follow')).toBeNull();
    expect(extractHarnessCode('')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  executeHarnessCode                                                 */
/* ------------------------------------------------------------------ */

describe('executeHarnessCode', () => {
  it('executes code that reads files and pushes issues', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.tools.file.read).mockResolvedValue('export function Nav() {}');

    const code = `
      const content = await file.read("src/Nav.tsx");
      if (!content.includes("export default")) {
        issues.push({ message: "Missing default export", severity: "error" });
      }
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Missing default export');
    expect(issues[0].severity).toBe('error');
    expect(ctx.tools.file.read).toHaveBeenCalledWith('src/Nav.tsx');
  });

  it('returns empty array when all checks pass', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.tools.file.read).mockResolvedValue('export default function Nav() {}');

    const code = `
      const content = await file.read("src/Nav.tsx");
      if (!content.includes("export default")) {
        issues.push({ message: "Missing default export", severity: "error" });
      }
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues).toHaveLength(0);
  });

  it('can use file.exists', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.tools.file.exists).mockResolvedValue(false);

    const code = `
      if (!(await file.exists("src/Nav.test.tsx"))) {
        issues.push({ message: "Missing test file", severity: "warning" });
      }
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('can use file.glob', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.tools.file.glob).mockResolvedValue([]);

    const code = `
      const tsxFiles = await file.glob("src/**/*.tsx");
      if (tsxFiles.length === 0) {
        issues.push({ message: "No TSX files found", severity: "error" });
      }
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues).toHaveLength(1);
  });

  it('can use shell.run', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.tools.shell.run).mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });

    const code = `
      const result = await shell.run("tsc --noEmit");
      if (result.exitCode !== 0) {
        issues.push({ message: "TypeScript errors: " + result.stderr, severity: "error" });
      }
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('TypeScript errors');
  });

  it('normalizes issue severity', async () => {
    const ctx = makeCtx();
    const code = `
      issues.push({ message: "bad severity", severity: "info" });
      issues.push({ message: "warning ok", severity: "warning" });
    `;

    const issues = await executeHarnessCode(code, ctx);
    expect(issues[0].severity).toBe('error'); // 'info' → 'error'
    expect(issues[1].severity).toBe('warning');
  });
});

/* ------------------------------------------------------------------ */
/*  buildHarnessSynthesisPrompt                                        */
/* ------------------------------------------------------------------ */

describe('buildHarnessSynthesisPrompt', () => {
  it('builds prompt asking for executable code, not rules', () => {
    const prompt = buildHarnessSynthesisPrompt(
      {},
      'Build a responsive nav component',
      ['routes.json'],
      ['src/Nav.tsx'],
    );
    // Should ask for code, not rules
    expect(prompt).toContain('validation function');
    expect(prompt).toContain('await file.read');
    expect(prompt).toContain('issues.push');
    expect(prompt).toContain('shell.run');
    // Should NOT ask for JSON array of rules
    expect(prompt).not.toContain('JSON array of validation rules');
  });

  it('includes custom prompt criteria', () => {
    const prompt = buildHarnessSynthesisPrompt(
      { prompt: 'Check that exports are named' },
    );
    expect(prompt).toContain('Validation Criteria');
    expect(prompt).toContain('Check that exports are named');
  });

  it('includes input and output files', () => {
    const prompt = buildHarnessSynthesisPrompt(
      {},
      'Build it',
      ['design.html', 'routes.json'],
      ['src/Nav.tsx'],
    );
    expect(prompt).toContain('design.html');
    expect(prompt).toContain('routes.json');
    expect(prompt).toContain('src/Nav.tsx');
  });

  it('instructs no require/import/process', () => {
    const prompt = buildHarnessSynthesisPrompt({});
    expect(prompt).toContain('Do NOT use `import`, `require`, or `process`');
  });
});

/* ------------------------------------------------------------------ */
/*  DefaultHarness                                                     */
/* ------------------------------------------------------------------ */

describe('DefaultHarness', () => {
  it('delegates propose to proposeFn', async () => {
    const proposeFn = vi.fn().mockResolvedValue(makeResult());
    const harness = new DefaultHarness({ proposeFn });
    const ctx = makeCtx();

    const result = await harness.propose(ctx);
    expect(proposeFn).toHaveBeenCalledWith(ctx);
    expect(result.success).toBe(true);
  });

  it('returns accepted=true with score=1 when no checks', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const harness = new DefaultHarness({ proposeFn: vi.fn() });
    const ctx = makeCtx();

    const verdict = await harness.validate(ctx, makeResult());
    expect(verdict.accepted).toBe(true);
    expect(verdict.score).toBe(1.0);
    expect(verdict.issues).toHaveLength(0);
  });

  it('returns accepted=false when result is not successful', async () => {
    const harness = new DefaultHarness({ proposeFn: vi.fn() });
    const ctx = makeCtx();

    const verdict = await harness.validate(ctx, makeResult({ success: false, error: 'Build failed' }));
    expect(verdict.accepted).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.issues[0].message).toBe('Build failed');
  });

  it('runs checks and computes score', async () => {
    vi.mocked(collectChecks).mockReturnValue([{ name: 'tsc' }, { name: 'build' }] as any);
    vi.mocked(runChecks).mockResolvedValue({
      allPassed: false,
      passed: ['tsc'],
      failed: ['build'],
      results: [
        { name: 'tsc', passed: true, issues: [] },
        { name: 'build', passed: false, issues: ['Build error: missing export'] },
      ],
    } as any);

    const harness = new DefaultHarness({ proposeFn: vi.fn() });
    const ctx = makeCtx();

    const verdict = await harness.validate(ctx, makeResult());
    expect(verdict.accepted).toBe(false);
    expect(verdict.score).toBe(0.5);
    expect(verdict.issues).toHaveLength(1);
    expect(verdict.issues[0].message).toBe('Build error: missing export');
  });

  it('calls refineFn on refine', async () => {
    const refineFn = vi.fn();
    const harness = new DefaultHarness({ proposeFn: vi.fn(), refineFn });
    const ctx = makeCtx();
    const verdict: HarnessVerdict = { accepted: false, issues: [], score: 0.5 };

    await harness.refine(ctx, verdict);
    expect(refineFn).toHaveBeenCalledWith(ctx, verdict);
  });
});

/* ------------------------------------------------------------------ */
/*  AutoHarness                                                        */
/* ------------------------------------------------------------------ */

describe('AutoHarness', () => {
  it('delegates propose to base harness', async () => {
    const proposeFn = vi.fn().mockResolvedValue(makeResult());
    const base = new DefaultHarness({ proposeFn });
    const auto = new AutoHarness(base, {});
    const ctx = makeCtx();

    await auto.propose(ctx);
    expect(proposeFn).toHaveBeenCalled();
  });

  it('returns base verdict when synthesis returns no code', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const agent = vi.fn().mockResolvedValue({ success: true, output: 'No code here' });
    const ctx = makeCtx({ agent });

    const verdict = await auto.validate(ctx, makeResult());
    expect(verdict.accepted).toBe(true);
    expect(verdict.score).toBe(1.0);
  });

  it('synthesizes code and executes it deterministically', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    // LLM returns executable code
    const code = [
      '```javascript',
      'const content = await file.read("output.tsx");',
      'if (!content.includes("export default")) {',
      '  issues.push({ message: "Missing default export", severity: "error" });',
      '}',
      '```',
    ].join('\n');

    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });
    // Make file.read return content WITHOUT "export default"
    vi.mocked(ctx.tools.file.read).mockResolvedValue('export function Nav() {}');

    const verdict = await auto.validate(ctx, makeResult());
    expect(verdict.accepted).toBe(false);
    expect(verdict.issues.some(i => i.message === 'Missing default export')).toBe(true);

    // The agent was called ONCE for synthesis — NOT again for evaluation
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it('skips AutoHarness when base fails with score 0', async () => {
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const agent = vi.fn();
    const ctx = makeCtx({ agent });

    const verdict = await auto.validate(ctx, makeResult({ success: false, error: 'Execution failed' }));
    expect(verdict.accepted).toBe(false);
    expect(verdict.score).toBe(0);
    expect(agent).not.toHaveBeenCalled();
  });

  it('caches synthesized code across validate calls', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const code = '```javascript\n// no issues\n```';
    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    await auto.validate(ctx, makeResult());

    // Synthesis only called once
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it('clears cached code on refine when refinable', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, { refinable: true });

    const code = '```javascript\n// no issues\n```';
    const agent = vi.fn().mockResolvedValue({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    expect(auto.code).not.toBeNull();

    await auto.refine(ctx, { accepted: false, issues: [], score: 0.5 });
    expect(auto.code).toBeNull();
    expect(clearHarnessCode).toHaveBeenCalled();
  });

  it('keeps cached code on refine when not refinable', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const code = '```javascript\n// no issues\n```';
    const agent = vi.fn().mockResolvedValue({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    await auto.refine(ctx, { accepted: false, issues: [], score: 0.5 });
    expect(auto.code).not.toBeNull();
  });

  it('handles synthesis failure gracefully', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const agent = vi.fn().mockResolvedValue({ success: false, error: 'Rate limited' });
    const ctx = makeCtx({ agent });

    const verdict = await auto.validate(ctx, makeResult());
    expect(verdict.accepted).toBe(true);
    expect(verdict.score).toBe(1.0);
  });

  it('handles code execution error gracefully', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    // Code that will throw
    const code = '```javascript\nthrow new Error("harness bug");\n```';
    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });

    const verdict = await auto.validate(ctx, makeResult());
    // Execution error is reported as an issue
    expect(verdict.issues.some(i => i.message.includes('harness bug'))).toBe(true);
  });

  it('persists verdict to disk after validation', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const code = '```javascript\n// no issues\n```';
    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    expect(writeHarnessVerdict).toHaveBeenCalledWith(
      ctx.taskDir,
      expect.objectContaining({ attempt: 1, accepted: true }),
    );
  });

  it('persists synthesized code to disk', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, {});

    const code = '```javascript\n// validation code\n```';
    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    expect(writeHarnessCode).toHaveBeenCalledWith(
      ctx.taskDir,
      '// validation code',
      expect.any(Object),
    );
  });

  it('loads cached code from disk when cache=true', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    vi.mocked(readHarnessCode).mockReturnValue('// cached code from disk');

    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, { cache: true });

    const agent = vi.fn(); // Should NOT be called
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());
    expect(agent).not.toHaveBeenCalled();
    expect(auto.code).toBe('// cached code from disk');
  });
});

/* ------------------------------------------------------------------ */
/*  consolidateIssues (critic)                                         */
/* ------------------------------------------------------------------ */

describe('consolidateIssues', () => {
  it('deduplicates identical messages', () => {
    const issues = consolidateIssues([
      { message: 'Missing export', severity: 'error' },
      { message: 'Missing export', severity: 'error' },
      { message: 'No tests', severity: 'warning' },
    ]);
    expect(issues).toHaveLength(2);
  });

  it('keeps highest severity on duplicate', () => {
    const issues = consolidateIssues([
      { message: 'Missing export', severity: 'warning' },
      { message: 'Missing export', severity: 'error' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('sorts errors before warnings', () => {
    const issues = consolidateIssues([
      { message: 'No tests', severity: 'warning' },
      { message: 'Missing export', severity: 'error' },
    ]);
    expect(issues[0].severity).toBe('error');
    expect(issues[1].severity).toBe('warning');
  });

  it('returns empty array for empty input', () => {
    expect(consolidateIssues([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  buildHarnessRefinementPrompt                                       */
/* ------------------------------------------------------------------ */

describe('buildHarnessRefinementPrompt', () => {
  it('includes previous issues in the refinement prompt', () => {
    const prompt = buildHarnessRefinementPrompt(
      {},
      [{ message: 'Missing default export', severity: 'error' }],
      'const x = await file.read("f");',
      'Build a nav component',
    );
    expect(prompt).toContain('Previous Harness');
    expect(prompt).toContain('Missing default export');
    expect(prompt).toContain('[error]');
  });

  it('includes previous harness code', () => {
    const previousCode = 'const nav = await file.read("Nav.tsx");';
    const prompt = buildHarnessRefinementPrompt(
      {},
      [{ message: 'Issue', severity: 'warning' }],
      previousCode,
    );
    expect(prompt).toContain(previousCode);
    expect(prompt).toContain('Previous harness code');
  });

  it('includes refinement instructions', () => {
    const prompt = buildHarnessRefinementPrompt(
      {},
      [{ message: 'Issue', severity: 'error' }],
      '// code',
    );
    expect(prompt).toContain('Keep checks that are still valid');
    expect(prompt).toContain('false positives');
  });

  it('includes file/line info when present', () => {
    const prompt = buildHarnessRefinementPrompt(
      {},
      [{ message: 'Bad import', severity: 'error', file: 'src/Nav.tsx', line: 42 }],
      '// code',
    );
    expect(prompt).toContain('(src/Nav.tsx:42)');
  });

  it('still includes base synthesis prompt content', () => {
    const prompt = buildHarnessRefinementPrompt(
      {},
      [{ message: 'Issue', severity: 'error' }],
      '// code',
      'Build a nav component',
      ['input.json'],
      ['output.tsx'],
    );
    expect(prompt).toContain('validation function');
    expect(prompt).toContain('input.json');
    expect(prompt).toContain('output.tsx');
  });
});

/* ------------------------------------------------------------------ */
/*  AutoHarness refinement loop                                        */
/* ------------------------------------------------------------------ */

describe('AutoHarness refinement loop', () => {
  it('feeds verdict issues into re-synthesis prompt', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, { refinable: true });

    // First synthesis: returns code that finds an issue
    const code1 = '```javascript\nissues.push({ message: "Missing export", severity: "error" });\n```';
    // Second synthesis: returns improved code (no issues)
    const code2 = '```javascript\n// all good now\n```';

    const agent = vi.fn()
      .mockResolvedValueOnce({ success: true, output: code1 })
      .mockResolvedValueOnce({ success: true, output: code2 });
    const ctx = makeCtx({ agent });

    // First validate — finds "Missing export"
    const verdict1 = await auto.validate(ctx, makeResult());
    expect(verdict1.accepted).toBe(false);
    expect(verdict1.issues.some(i => i.message === 'Missing export')).toBe(true);

    // Refine — stores issues for next synthesis
    await auto.refine(ctx, verdict1);
    expect(auto.code).toBeNull();

    // Second validate — agent is called again with refinement prompt
    const verdict2 = await auto.validate(ctx, makeResult());
    expect(agent).toHaveBeenCalledTimes(2);

    // The second synthesis prompt should include the previous issues
    const secondCallPrompt = agent.mock.calls[1][0];
    expect(secondCallPrompt).toContain('Previous Harness');
    expect(secondCallPrompt).toContain('Missing export');
    expect(secondCallPrompt).toContain('Refinement instructions');
  });

  it('does not use refinement prompt on first synthesis', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, { refinable: true });

    const code = '```javascript\n// no issues\n```';
    const agent = vi.fn().mockResolvedValueOnce({ success: true, output: code });
    const ctx = makeCtx({ agent });

    await auto.validate(ctx, makeResult());

    const firstCallPrompt = agent.mock.calls[0][0];
    expect(firstCallPrompt).not.toContain('Previous Harness');
  });

  it('consolidates duplicate issues before feeding to refinement', async () => {
    vi.mocked(collectChecks).mockReturnValue([]);
    const base = new DefaultHarness({ proposeFn: vi.fn() });
    const auto = new AutoHarness(base, { refinable: true });

    // Code that produces duplicate issues
    const code1 = [
      '```javascript',
      'issues.push({ message: "Missing export", severity: "error" });',
      'issues.push({ message: "Missing export", severity: "error" });',
      'issues.push({ message: "No tests", severity: "warning" });',
      '```',
    ].join('\n');
    const code2 = '```javascript\n// fixed\n```';

    const agent = vi.fn()
      .mockResolvedValueOnce({ success: true, output: code1 })
      .mockResolvedValueOnce({ success: true, output: code2 });
    const ctx = makeCtx({ agent });

    const verdict1 = await auto.validate(ctx, makeResult());
    await auto.refine(ctx, verdict1);
    await auto.validate(ctx, makeResult());

    // The refinement prompt should have consolidated issues (2 unique, not 3 duplicates)
    const secondPrompt = agent.mock.calls[1][0];
    // Check that the issues section has only one "Missing export" line
    const issuesSection = secondPrompt.split('### Issues found last run:')[1]?.split('###')[0] ?? '';
    const issueLines = issuesSection.split('\n').filter((l: string) => l.includes('Missing export'));
    expect(issueLines).toHaveLength(1); // deduplicated from 2 to 1
  });
});

/* ------------------------------------------------------------------ */
/*  createHarness factory                                              */
/* ------------------------------------------------------------------ */

describe('createHarness', () => {
  it('returns DefaultHarness when no config', () => {
    const harness = createHarness({ proposeFn: vi.fn() });
    expect(harness).toBeInstanceOf(DefaultHarness);
  });

  it('returns AutoHarness when config provided', () => {
    const harness = createHarness({ proposeFn: vi.fn() }, {});
    expect(harness).toBeInstanceOf(AutoHarness);
  });
});
