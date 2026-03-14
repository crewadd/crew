/**
 * Deps file I/O
 *
 * Reads/writes a plain-text `deps` file containing one relative path per line.
 * Comments (lines starting with #) and blank lines are ignored on read.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const DEPS_FILE = 'deps';

/**
 * Read deps file, returning resolved absolute paths.
 * Returns empty array when file is missing.
 */
export function readDeps(taskDir: string): string[] {
  const filePath = join(taskDir, DEPS_FILE);
  if (!existsSync(filePath)) return [];

  const raw = readFileSync(filePath, 'utf-8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(relPath => resolve(taskDir, relPath));
}

/**
 * Write an array of relative paths as the deps file (one per line).
 */
export function writeDeps(taskDir: string, paths: string[]): void {
  mkdirSync(taskDir, { recursive: true });
  const filePath = join(taskDir, DEPS_FILE);
  writeFileSync(filePath, paths.join('\n'), 'utf-8');
}

/**
 * Append a relative path to the deps file if not already present.
 */
export function appendDep(taskDir: string, relPath: string): void {
  const filePath = join(taskDir, DEPS_FILE);

  let existing: string[] = [];
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '' && !l.startsWith('#'));
  }

  if (existing.includes(relPath)) return;

  mkdirSync(taskDir, { recursive: true });
  const newContent = [...existing, relPath].join('\n');
  writeFileSync(filePath, newContent, 'utf-8');
}

/**
 * Remove a relative path from the deps file.
 * No-op if the path is not present or the file is missing.
 */
export function removeDep(taskDir: string, relPath: string): void {
  const filePath = join(taskDir, DEPS_FILE);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'));

  const filtered = lines.filter(l => l !== relPath);
  writeFileSync(filePath, filtered.join('\n'), 'utf-8');
}
