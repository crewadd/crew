/**
 * Path Resolver
 *
 * Translates between directory structure and identity.
 * All paths are deterministic from (root, slug) — no lookups needed.
 */

import { join } from 'node:path';

export class PathResolver {
  private readonly root: string;

  constructor(root: string, planDirOverride?: string) {
    this.root = planDirOverride ?? join(root, '.crew');
  }

  /** Root .crew directory */
  crewRoot(): string {
    return this.root;
  }

  /** .crew/epics/ */
  epicsDir(): string {
    return join(this.root, 'epics');
  }

  /** .crew/epics/{slug}/ */
  epicDir(slug: string): string {
    return join(this.root, 'epics', slug);
  }

  /** .crew/epics/{epicSlug}/tasks/ */
  tasksDir(epicSlug: string): string {
    return join(this.root, 'epics', epicSlug, 'tasks');
  }

  /** .crew/epics/{epicSlug}/tasks/{taskSlug}/ */
  taskDir(epicSlug: string, taskSlug: string): string {
    return join(this.root, 'epics', epicSlug, 'tasks', taskSlug);
  }

  /** .crew/project.yaml */
  projectYaml(): string {
    return join(this.root, 'project.yaml');
  }

  /** status file within any directory */
  statusFile(dir: string): string {
    return join(dir, 'status');
  }

  /** deps file within a task directory */
  depsFile(taskDir: string): string {
    return join(taskDir, 'deps');
  }

  /** events/ directory within a task directory */
  eventsDir(taskDir: string): string {
    return join(taskDir, 'events');
  }

  /** output/ directory within a task directory */
  outputDir(taskDir: string): string {
    return join(taskDir, 'output');
  }
}
