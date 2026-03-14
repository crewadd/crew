/**
 * Status file I/O
 *
 * Reads/writes a single-word status from a plain-text `status` file.
 * Missing or empty file defaults to "pending".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const STATUS_FILE = 'status';

/**
 * Read the status word from `dir/status`.
 * Returns "pending" when the file is missing or empty.
 */
export function readStatus(dir: string): string {
  const filePath = join(dir, STATUS_FILE);
  if (!existsSync(filePath)) return 'pending';
  try {
    const raw = readFileSync(filePath, 'utf-8').trim();
    return raw || 'pending';
  } catch {
    return 'pending';
  }
}

/**
 * Write a single-word status to `dir/status`.
 * Creates parent directories if needed.
 */
export function writeStatus(dir: string, status: string): void {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, STATUS_FILE);
  writeFileSync(filePath, status, 'utf-8');
}
