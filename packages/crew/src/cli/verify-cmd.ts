/**
 * crew verify - Verify project quality (tsc, build, lint, test)
 */

import { createBuildContext } from '../manager/index.ts';
import { verify } from '../verifier/verifier.ts';
import { validateProjectDir } from './utils.ts';

/**
 * Run verify command - check project quality
 */
export async function runVerify(projectDir: string): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  const ctx = createBuildContext(absDir);
  const report = await verify(ctx);

  console.error(`[crew] Verification: ${report.passed ? 'PASS' : 'FAIL'}`);
  for (const check of report.checks) {
    console.error(`  ${check.name}: ${check.passed ? 'PASS' : 'FAIL'} (${check.issues.length} issues)`);
  }

  if (report.issues.length > 0) {
    console.error('');
    for (const issue of report.issues.slice(0, 20)) {
      const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
      console.error(`  [${issue.check}] ${loc}: ${issue.message}`);
    }
    if (report.issues.length > 20) {
      console.error(`  ... and ${report.issues.length - 20} more`);
    }
  }

  if (!report.passed) process.exit(1);
}
