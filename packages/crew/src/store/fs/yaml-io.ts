/**
 * YAML file I/O
 *
 * Generic read/write for YAML config files (task.yaml, epic.yaml, project.yaml).
 * Wraps the `yaml` package (v2).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';

/**
 * Recursively strip null values from an object.
 */
function stripNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value != null) {
        result[key] = stripNulls(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Read and parse a YAML file.
 * Returns null if the file does not exist.
 * Returns an empty object for an empty YAML file.
 */
export function readYaml<T = Record<string, unknown>>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parse(raw);
  // YAML `parse` returns undefined/null for empty docs
  if (parsed == null) return {} as T;
  return parsed as T;
}

/**
 * Write an object as YAML to a file.
 * Creates parent directories if needed.
 * Strips undefined and null fields before writing.
 */
export function writeYaml<T>(filePath: string, data: T): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const cleaned = stripNulls(JSON.parse(JSON.stringify(data)));
  const yamlStr = stringify(cleaned);
  writeFileSync(filePath, yamlStr, 'utf-8');
}
