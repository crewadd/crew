import { execFile } from 'node:child_process';
import type { BuildContext, VerificationCheck, VerificationIssue } from '../../types.ts';
import type { CheckPlugin } from '../types.ts';

function runTsc(cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['tsc', '--noEmit', '--pretty', 'false'],
      { cwd, timeout: 120_000 },
      (err, stdout, stderr) => {
        const exitCode = err && 'code' in err ? (err as any).code ?? 1 : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode });
      },
    );
  });
}

function parseTscOutput(raw: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  // TypeScript error format: file(line,col): error TSxxxx: message
  const regex = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    issues.push({
      check: 'tsc',
      file: match[1],
      line: parseInt(match[2], 10),
      message: `${match[3]}: ${match[4]}`,
      severity: 'error',
    });
  }

  return issues;
}

export const tscCheck: CheckPlugin = {
  name: 'tsc',
  async run(ctx: BuildContext): Promise<VerificationCheck> {
    const { stdout, stderr, exitCode } = await runTsc(ctx.appDir);
    const raw = stdout + stderr;
    const issues = parseTscOutput(raw);

    return {
      name: 'tsc',
      passed: exitCode === 0 && issues.length === 0,
      issues,
      raw,
    };
  },
};
