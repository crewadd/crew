/**
 * Project Operations
 *
 * Read/write project.yaml at the .crew root.
 */

import { join } from 'node:path';
import { readYaml, writeYaml } from './yaml-io.ts';
import type { ProjectYaml } from './types.ts';

/**
 * Read project.yaml from the crew root directory.
 * Returns null when project.yaml is missing.
 */
export function readProject(root: string): ProjectYaml | null {
  return readYaml<ProjectYaml>(join(root, 'project.yaml'));
}

/**
 * Write project metadata to project.yaml.
 * Only writes project-level fields — no epic_ids or task_ids.
 */
export function writeProject(root: string, data: ProjectYaml): void {
  // Strip any epic/task ID arrays that don't belong in the fs-native model
  const { name, description, goal, settings, ...rest } = data;
  const clean: ProjectYaml = { name };
  if (description !== undefined) clean.description = description;
  if (goal !== undefined) clean.goal = goal;
  if (settings !== undefined) clean.settings = settings;
  // Preserve any extra fields the user may have added
  for (const [key, value] of Object.entries(rest)) {
    if (key !== 'epic_ids' && key !== 'task_ids') {
      clean[key] = value;
    }
  }
  writeYaml(join(root, 'project.yaml'), clean);
}
