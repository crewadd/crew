/**
 * Unit tests for verifier
 * Tests: verify(), tscCheck, buildCheck, imagesCheck
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuildContext } from '../../../src/types.ts';
import { execFile } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

function mockExecSuccess(stdout = '', stderr = '') {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
    cb(null, stdout, stderr);
    return undefined as any;
  });
}

function mockExecFail(stdout = '', stderr = '', code = 1) {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
    const err = new Error('process failed') as any;
    err.code = code;
    cb(err, stdout, stderr);
    return undefined as any;
  });
}

const ctx: BuildContext = { appDir: '/app' };

/* ------------------------------------------------------------------ */
/*  tscCheck                                                           */
/* ------------------------------------------------------------------ */

describe('tscCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes when tsc exits 0', async () => {
    mockExecSuccess();
    const { tscCheck } = await import('../../../src/verifier/checks/tsc.ts');
    const result = await tscCheck.run(ctx);
    expect(result.name).toBe('tsc');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('extracts issues from tsc error output', async () => {
    const output = 'src/app/page.tsx(15,3): error TS2345: Argument not assignable\nsrc/layout.tsx(8,1): error TS1005: Expected semicolon';
    mockExecFail(output);
    const { tscCheck } = await import('../../../src/verifier/checks/tsc.ts');
    const result = await tscCheck.run(ctx);

    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].check).toBe('tsc');
    expect(result.issues[0].file).toBe('src/app/page.tsx');
    expect(result.issues[0].line).toBe(15);
  });
});

/* ------------------------------------------------------------------ */
/*  buildCheck                                                         */
/* ------------------------------------------------------------------ */

describe('buildCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes when build exits 0', async () => {
    mockExecSuccess('Build completed');
    const { buildCheck } = await import('../../../src/verifier/checks/build.ts');
    const result = await buildCheck.run(ctx);
    expect(result.name).toBe('build');
    expect(result.passed).toBe(true);
  });

  it('fails when build exits non-zero', async () => {
    mockExecFail('', 'Build failed with error');
    const { buildCheck } = await import('../../../src/verifier/checks/build.ts');
    const result = await buildCheck.run(ctx);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  verify (consolidated)                                              */
/* ------------------------------------------------------------------ */

describe('verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs all checks and consolidates report', async () => {
    mockExecSuccess();
    const { verify } = await import('../../../src/verifier/verifier.ts');
    const report = await verify(ctx);

    expect(report.passed).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(2);
  });

  it('respects "only" filter', async () => {
    mockExecSuccess();
    const { verify } = await import('../../../src/verifier/verifier.ts');
    const report = await verify(ctx, { only: ['tsc'] });

    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].name).toBe('tsc');
  });

  it('reports failure when any check fails', async () => {
    mockExecFail('src/main.ts(1,1): error TS1234: bad');
    const { verify } = await import('../../../src/verifier/verifier.ts');
    const report = await verify(ctx, { only: ['tsc'] });

    expect(report.passed).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
