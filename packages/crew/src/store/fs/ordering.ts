/**
 * Directory Ordering
 *
 * Numeric-prefix-based ordering for epic and task directories.
 * Directories are named like "01-bootstrap", "02-build", etc.
 */

import {
  readdirSync, renameSync, statSync, existsSync,
  readFileSync, writeFileSync,
} from 'node:fs';
import { join, basename, relative } from 'node:path';

export interface ParsedPrefix {
  /** Numeric part (e.g. 2 from "02a-hotfix") */
  num: number;
  /** Optional letter suffix (e.g. "a" from "02a-hotfix") */
  suffix: string;
  /** Slug portion after the prefix (e.g. "hotfix" from "02a-hotfix") */
  slug: string;
  /** Original full directory name */
  original: string;
}

/**
 * Parse a numeric prefix from a directory name.
 * "01-bootstrap" → { num: 1, suffix: "", slug: "bootstrap", original: "01-bootstrap" }
 * "02a-hotfix"   → { num: 2, suffix: "a", slug: "hotfix", original: "02a-hotfix" }
 * "no-number"    → { num: 0, suffix: "", slug: "no-number", original: "no-number" }
 */
export function parsePrefix(name: string): ParsedPrefix {
  const match = name.match(/^(\d+)([a-z]?)-(.+)$/);
  if (!match) {
    return { num: 0, suffix: '', slug: name, original: name };
  }
  return {
    num: parseInt(match[1], 10),
    suffix: match[2],
    slug: match[3],
    original: name,
  };
}

/**
 * List subdirectories of `dir` sorted by numeric prefix.
 * Filters out non-directory entries.
 * Returns empty array for empty or non-existent directories.
 */
export function listOrdered(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir);
  const dirs = entries.filter(name => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });

  return dirs.sort((a, b) => {
    const pa = parsePrefix(a);
    const pb = parsePrefix(b);
    if (pa.num !== pb.num) return pa.num - pb.num;
    return pa.suffix.localeCompare(pb.suffix);
  });
}

/**
 * Return the next sequential prefix string for a new entry in `dir`.
 * "01" for empty dir, otherwise max+1 padded to 2 digits.
 */
export function nextPrefix(dir: string): string {
  const ordered = listOrdered(dir);
  if (ordered.length === 0) return '01';

  const max = ordered.reduce((highest, name) => {
    const p = parsePrefix(name);
    return p.num > highest ? p.num : highest;
  }, 0);

  return String(max + 1).padStart(2, '0');
}

/**
 * Renumber directories to sequential 01, 02, 03, ...
 * Updates any deps files that reference renamed directories.
 * Preserves the slug portion of directory names.
 * Idempotent — renumbering already-sequential dirs is a no-op.
 */
export function renumber(dir: string): void {
  const ordered = listOrdered(dir);
  if (ordered.length === 0) return;

  // Build rename map: oldName → newName
  const renames = new Map<string, string>();
  for (let i = 0; i < ordered.length; i++) {
    const parsed = parsePrefix(ordered[i]);
    const newName = `${String(i + 1).padStart(2, '0')}-${parsed.slug}`;
    if (newName !== ordered[i]) {
      renames.set(ordered[i], newName);
    }
  }

  if (renames.size === 0) return;

  // Perform renames (use temp names to avoid collisions)
  const tempNames = new Map<string, string>();
  for (const [oldName, newName] of renames) {
    const tempName = `__temp_${oldName}`;
    renameSync(join(dir, oldName), join(dir, tempName));
    tempNames.set(tempName, newName);
  }
  for (const [tempName, newName] of tempNames) {
    renameSync(join(dir, tempName), join(dir, newName));
  }

  // Update deps files in all subdirectories
  const allDirs = listOrdered(dir);
  for (const subDir of allDirs) {
    updateDepsAfterRename(join(dir, subDir), dir, renames);
  }
}

/**
 * Walk a directory tree and update any deps files that reference renamed dirs.
 */
function updateDepsAfterRename(
  searchDir: string,
  parentDir: string,
  renames: Map<string, string>,
): void {
  const depsFile = join(searchDir, 'deps');
  if (existsSync(depsFile)) {
    rewriteDeps(depsFile, searchDir, parentDir, renames);
  }

  // Recurse into subdirectories (e.g., tasks/ within an epic)
  if (!existsSync(searchDir)) return;
  for (const entry of readdirSync(searchDir)) {
    const full = join(searchDir, entry);
    try {
      if (statSync(full).isDirectory()) {
        updateDepsAfterRename(full, parentDir, renames);
      }
    } catch {
      // skip
    }
  }
}

function rewriteDeps(
  depsFile: string,
  taskDir: string,
  parentDir: string,
  renames: Map<string, string>,
): void {
  const raw = readFileSync(depsFile, 'utf-8');
  const lines = raw.split('\n');
  let changed = false;

  const updated = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return line;

    // Extract the directory name portion from the relative path
    for (const [oldName, newName] of renames) {
      if (trimmed.includes(oldName)) {
        changed = true;
        return trimmed.replace(oldName, newName);
      }
    }
    return line;
  });

  if (changed) {
    writeFileSync(depsFile, updated.join('\n'), 'utf-8');
  }
}
