import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { BuildContext, VerificationCheck, VerificationIssue } from '../../types.ts';
import type { CheckPlugin } from '../types.ts';

/**
 * Scan source files for image/asset references and check they exist on disk.
 */
function findBrokenRefs(appDir: string): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const srcDir = resolve(appDir, 'src');
  const publicDir = resolve(appDir, 'public');

  if (!existsSync(srcDir)) return issues;

  // Recursively find .tsx/.ts/.jsx files
  const files = walkDir(srcDir, ['.tsx', '.ts', '.jsx', '.css']);

  // Image ref patterns: src="/images/...", url('/images/...')
  const imgRegex = /(?:src=["']|url\(["']?)(\/(images|fonts|assets|media|videos)\/[^"'\s)]+)/g;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(content)) !== null) {
      const ref = match[1];
      const absPath = resolve(publicDir, ref.replace(/^\//, ''));
      if (!existsSync(absPath)) {
        issues.push({
          check: 'images',
          file,
          message: `Broken asset reference: ${ref}`,
          severity: 'warning',
        });
      }
    }
  }

  return issues;
}

function walkDir(dir: string, extensions: string[]): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry !== 'node_modules' && entry !== '.next') {
        result.push(...walkDir(fullPath, extensions));
      }
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

export const imagesCheck: CheckPlugin = {
  name: 'images',
  async run(ctx: BuildContext): Promise<VerificationCheck> {
    const issues = findBrokenRefs(ctx.appDir);

    return {
      name: 'images',
      passed: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
    };
  },
};
