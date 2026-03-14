import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BuildContext, VerificationCheck, VerificationIssue } from '../../types.ts';
import type { CheckPlugin } from '../types.ts';

function runBuild(cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Detect build command: prefer pnpm, fallback to npm
  const hasPnpmLock = existsSync(resolve(cwd, 'pnpm-lock.yaml'));
  const cmd = hasPnpmLock ? 'pnpm' : 'npm';

  return new Promise((resolve) => {
    execFile(
      cmd,
      ['run', 'build'],
      { cwd, timeout: 300_000 },
      (err, stdout, stderr) => {
        const exitCode = err && 'code' in err ? (err as any).code ?? 1 : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
      },
    );
  });
}

function parseBuildOutput(raw: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  // Next.js build errors: "Error:" or "Build error" patterns
  const errorLines = raw.split('\n').filter(
    (line) => /\berror\b/i.test(line) && !line.includes('Linting and checking'),
  );

  for (const line of errorLines) {
    // Try to extract file path from common patterns
    const fileMatch = line.match(/(?:in|at)\s+([^\s:]+\.[jt]sx?)(?::(\d+))?/);
    issues.push({
      check: 'build',
      file: fileMatch?.[1],
      line: fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined,
      message: line.trim(),
      severity: 'error',
    });
  }

  return issues;
}

export const buildCheck: CheckPlugin = {
  name: 'build',
  async run(ctx: BuildContext): Promise<VerificationCheck> {
    const { stdout, stderr, exitCode } = await runBuild(ctx.appDir);
    const raw = stdout + stderr;
    const issues = exitCode !== 0 ? parseBuildOutput(raw) : [];

    // If build failed but we couldn't parse specific errors, add a generic one
    if (exitCode !== 0 && issues.length === 0) {
      issues.push({
        check: 'build',
        message: 'Build failed — see raw output for details',
        severity: 'error',
      });
    }

    return {
      name: 'build',
      passed: exitCode === 0,
      issues,
      raw,
    };
  },
};
