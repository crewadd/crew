/**
 * CLI utilities
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Validate and resolve project directory
 */
export function validateProjectDir(projectDir: string): string {
  const absDir = resolve(projectDir);
  if (!existsSync(absDir)) {
    console.error(`Error: project directory not found: ${absDir}`);
    process.exit(1);
  }
  return absDir;
}
