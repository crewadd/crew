/**
 * Unit tests for fs/path-resolver
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PathResolver } from '../../../../src/store/fs/path-resolver.ts';

const ROOT = '/projects/myapp';

describe('PathResolver', () => {
  const r = new PathResolver(ROOT);

  it('resolves .crew/epics/ from root', () => {
    expect(r.epicsDir()).toBe(join(ROOT, '.crew', 'epics'));
  });

  it('resolves epic directory: .crew/epics/01-bootstrap/', () => {
    expect(r.epicDir('01-bootstrap')).toBe(
      join(ROOT, '.crew', 'epics', '01-bootstrap'),
    );
  });

  it('resolves tasks directory: .crew/epics/01-bootstrap/tasks/', () => {
    expect(r.tasksDir('01-bootstrap')).toBe(
      join(ROOT, '.crew', 'epics', '01-bootstrap', 'tasks'),
    );
  });

  it('resolves task directory: .crew/epics/01-bootstrap/tasks/02-fix-build/', () => {
    expect(r.taskDir('01-bootstrap', '02-fix-build')).toBe(
      join(ROOT, '.crew', 'epics', '01-bootstrap', 'tasks', '02-fix-build'),
    );
  });

  it('resolves project.yaml path', () => {
    expect(r.projectYaml()).toBe(join(ROOT, '.crew', 'project.yaml'));
  });

  it('resolves status file within epic or task dir', () => {
    const epicDir = r.epicDir('01-bootstrap');
    expect(r.statusFile(epicDir)).toBe(join(epicDir, 'status'));

    const taskDir = r.taskDir('01-bootstrap', '02-fix-build');
    expect(r.statusFile(taskDir)).toBe(join(taskDir, 'status'));
  });

  it('resolves deps file within task dir', () => {
    const taskDir = r.taskDir('01-bootstrap', '02-fix-build');
    expect(r.depsFile(taskDir)).toBe(join(taskDir, 'deps'));
  });

  it('resolves events/ directory within task dir', () => {
    const taskDir = r.taskDir('01-bootstrap', '02-fix-build');
    expect(r.eventsDir(taskDir)).toBe(join(taskDir, 'events'));
  });

  it('resolves output/ directory within task dir', () => {
    const taskDir = r.taskDir('01-bootstrap', '02-fix-build');
    expect(r.outputDir(taskDir)).toBe(join(taskDir, 'output'));
  });

  it('supports custom root directory (planDirOverride)', () => {
    const custom = new PathResolver(ROOT, '/custom/plan');
    expect(custom.crewRoot()).toBe('/custom/plan');
    expect(custom.epicsDir()).toBe('/custom/plan/epics');
    expect(custom.epicDir('01-bootstrap')).toBe('/custom/plan/epics/01-bootstrap');
  });
});
