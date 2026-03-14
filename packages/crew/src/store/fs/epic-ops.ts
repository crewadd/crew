/**
 * Epic CRUD Operations
 *
 * Directory-level operations for creating, reading, updating, and removing epics.
 * Each epic is a directory under .crew/epics/ with a numeric prefix.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readYaml, writeYaml } from './yaml-io.ts';
import { readStatus, writeStatus } from './status-io.ts';
import { listOrdered, nextPrefix } from './ordering.ts';
import { slugify } from '../slug-utils.ts';
import type { EpicYaml, EpicStatus } from './types.ts';

/* ------------------------------------------------------------------ */
/*  Return shape for epic queries                                      */
/* ------------------------------------------------------------------ */

export interface EpicInfo {
  /** Absolute path to the epic directory — this IS the identity */
  dir: string;
  /** Directory basename (e.g. "01-bootstrap") */
  slug: string;
  /** Title from epic.yaml */
  title: string;
  /** Current status from status file */
  status: EpicStatus;
  /** Full epic.yaml contents */
  config: EpicYaml;
}

/* ------------------------------------------------------------------ */
/*  Config for createEpic                                              */
/* ------------------------------------------------------------------ */

export interface CreateEpicConfig {
  title: string;
  gates?: EpicYaml['gates'];
  constraints?: EpicYaml['constraints'];
  prompt?: string;
}

/* ------------------------------------------------------------------ */
/*  Operations                                                         */
/* ------------------------------------------------------------------ */

/**
 * List all epics in directory-prefix order.
 * Returns EpicInfo[] with title, status, and directory path.
 */
export function listEpics(root: string): EpicInfo[] {
  const epicsDir = join(root, 'epics');
  const dirs = listOrdered(epicsDir);

  return dirs.map(slug => {
    const dir = join(epicsDir, slug);
    return readEpicInfo(dir, slug);
  });
}

/**
 * Get a single epic by its directory path.
 * Returns null for non-existent directory.
 */
export function getEpic(epicDir: string): EpicInfo | null {
  if (!existsSync(epicDir)) return null;
  const slug = basename(epicDir);
  return readEpicInfo(epicDir, slug);
}

/**
 * Create a new epic directory with the next numeric prefix.
 * Returns the EpicInfo for the created epic.
 */
export function createEpic(root: string, config: CreateEpicConfig): EpicInfo {
  const epicsDir = join(root, 'epics');
  mkdirSync(epicsDir, { recursive: true });

  const prefix = nextPrefix(epicsDir);
  const slug = `${prefix}-${slugify(config.title) || 'untitled'}`;
  const dir = join(epicsDir, slug);

  // Create directory structure
  mkdirSync(join(dir, 'tasks'), { recursive: true });

  // Write epic.yaml
  const yaml: EpicYaml = { title: config.title };
  if (config.gates) yaml.gates = config.gates;
  if (config.constraints) yaml.constraints = config.constraints;
  writeYaml(join(dir, 'epic.yaml'), yaml);

  // Set initial status
  writeStatus(dir, 'planned');

  // Optionally write PROMPT.md
  if (config.prompt) {
    writeFileSync(join(dir, 'PROMPT.md'), config.prompt, 'utf-8');
  }

  return readEpicInfo(dir, slug);
}

/**
 * Remove an entire epic directory recursively.
 * Returns false if the directory didn't exist.
 */
export function removeEpic(epicDir: string): boolean {
  if (!existsSync(epicDir)) return false;
  rmSync(epicDir, { recursive: true, force: true });
  return true;
}

/**
 * Read epic status from status file.
 * Defaults to "planned" when no status file exists.
 */
export function getEpicStatus(epicDir: string): EpicStatus {
  const raw = readStatus(epicDir);
  return raw as EpicStatus;
}

/**
 * Write epic status to status file.
 */
export function setEpicStatus(epicDir: string, status: EpicStatus): void {
  writeStatus(epicDir, status);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function readEpicInfo(dir: string, slug: string): EpicInfo {
  const config = readYaml<EpicYaml>(join(dir, 'epic.yaml')) ?? { title: slug };
  const status = readStatus(dir) as EpicStatus;

  return {
    dir,
    slug,
    title: config.title,
    status: status || 'planned',
    config,
  };
}
