/**
 * Unit tests for fs/project-ops
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readProject, writeProject } from '../../../../src/store/fs/project-ops.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-project-ops-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readProject', () => {
  it('reads project.yaml and returns CrewProject-compatible object', () => {
    writeProject(testDir, { name: 'steep_app', goal: 'Rebuild UI', description: 'A project' });
    const result = readProject(testDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('steep_app');
    expect(result!.goal).toBe('Rebuild UI');
    expect(result!.description).toBe('A project');
  });

  it('returns null when project.yaml missing', () => {
    expect(readProject(testDir)).toBeNull();
  });

  it('no epic_ids array — epics discovered from filesystem', () => {
    writeProject(testDir, {
      name: 'test',
      epic_ids: ['epic_1', 'epic_2'],
    } as any);
    const result = readProject(testDir);
    expect(result).not.toHaveProperty('epic_ids');
  });
});

describe('writeProject', () => {
  it('writes project metadata to project.yaml', () => {
    writeProject(testDir, { name: 'myapp', goal: 'Ship it' });
    const result = readProject(testDir);
    expect(result!.name).toBe('myapp');
    expect(result!.goal).toBe('Ship it');
  });

  it('does not write epic_ids or task_ids', () => {
    writeProject(testDir, {
      name: 'test',
      epic_ids: ['e1'],
      task_ids: ['t1'],
    } as any);
    const result = readProject(testDir);
    expect(result).not.toHaveProperty('epic_ids');
    expect(result).not.toHaveProperty('task_ids');
  });

  it('round-trips name, description, goal, settings', () => {
    const original = {
      name: 'project',
      description: 'A cool project',
      goal: 'Make it work',
      settings: { parallel_limit: 3, require_reviews: true },
    };
    writeProject(testDir, original);
    const result = readProject(testDir);
    expect(result).toEqual(original);
  });
});
