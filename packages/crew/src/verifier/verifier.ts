import type { BuildContext, VerificationReport } from '../types.ts';
import type { CheckPlugin } from './types.ts';
import { tscCheck } from './checks/tsc.ts';
import { buildCheck } from './checks/build.ts';
import { imagesCheck } from './checks/images.ts';

/** All built-in check plugins */
const builtinChecks: CheckPlugin[] = [tscCheck, buildCheck, imagesCheck];

export interface VerifyOptions {
  /** Run only these named checks. If undefined, run all. */
  only?: string[];
  /** Epic ID for context (informational only) */
  epicId?: number;
}

/**
 * Run verification checks on a project.
 * Returns a consolidated report with all issues.
 */
export async function verify(
  ctx: BuildContext,
  options?: VerifyOptions,
): Promise<VerificationReport> {
  const { only } = options ?? {};

  const checksToRun = only
    ? builtinChecks.filter((c) => only.includes(c.name))
    : builtinChecks;

  const checks = await Promise.all(
    checksToRun.map((check) => check.run(ctx)),
  );

  const issues = checks.flatMap((c) => c.issues);
  const passed = checks.every((c) => c.passed);

  return { passed, checks, issues };
}
