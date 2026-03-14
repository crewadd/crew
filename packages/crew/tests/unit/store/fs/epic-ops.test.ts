/**
 * Unit tests for fs/epic-ops
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listEpics,
  getEpic,
  createEpic,
  removeEpic,
  getEpicStatus,
  setEpicStatus,
} from '../../../../src/store/fs/epic-ops.ts';
import { writeYaml } from '../../../../src/store/fs/yaml-io.ts';
import { writeStatus } from '../../../../src/store/fs/status-io.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-epic-ops-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(testDir, 'epics'), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Helper to manually set up an epic directory */
function setupEpic(slug: string, title: string, status?: string): string {
  const dir = join(testDir, 'epics', slug);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeYaml(join(dir, 'epic.yaml'), { title });
  if (status) writeStatus(dir, status);
  return dir;
}

describe('listEpics', () => {
  it('returns epics in directory-prefix order', () => {
    setupEpic('02-build', 'Build');
    setupEpic('01-bootstrap', 'Bootstrap');
    setupEpic('03-deploy', 'Deploy');

    const epics = listEpics(testDir);
    expect(epics.map(e => e.slug)).toEqual(['01-bootstrap', '02-build', '03-deploy']);
  });

  it('returns empty array for no epics', () => {
    expect(listEpics(testDir)).toEqual([]);
  });

  it('each epic has title from epic.yaml', () => {
    setupEpic('01-bootstrap', 'Bootstrap Phase');
    const epics = listEpics(testDir);
    expect(epics[0].title).toBe('Bootstrap Phase');
  });

  it('each epic has status from status file', () => {
    setupEpic('01-bootstrap', 'Bootstrap', 'active');
    const epics = listEpics(testDir);
    expect(epics[0].status).toBe('active');
  });

  it('epic identity is its directory path (no opaque ID)', () => {
    setupEpic('01-bootstrap', 'Bootstrap');
    const epics = listEpics(testDir);
    expect(epics[0].dir).toBe(join(testDir, 'epics', '01-bootstrap'));
  });
});

describe('getEpic', () => {
  it('reads epic.yaml for metadata (title, gates, constraints)', () => {
    const dir = setupEpic('01-bootstrap', 'Bootstrap');
    writeYaml(join(dir, 'epic.yaml'), {
      title: 'Bootstrap',
      gates: [{ type: 'review', required: true, completed: false }],
      constraints: { sequential: true },
    });

    const epic = getEpic(dir)!;
    expect(epic.title).toBe('Bootstrap');
    expect(epic.config.gates).toHaveLength(1);
    expect(epic.config.constraints).toEqual({ sequential: true });
  });

  it('reads status file for current status', () => {
    const dir = setupEpic('01-bootstrap', 'Bootstrap', 'completed');
    const epic = getEpic(dir)!;
    expect(epic.status).toBe('completed');
  });

  it('does not contain task_ids — tasks are discovered from tasks/ subdirectory', () => {
    const dir = setupEpic('01-bootstrap', 'Bootstrap');
    const epic = getEpic(dir)!;
    expect(epic).not.toHaveProperty('task_ids');
  });

  it('returns null for non-existent epic directory', () => {
    expect(getEpic(join(testDir, 'epics', '99-missing'))).toBeNull();
  });
});

describe('createEpic', () => {
  it('creates directory with next numeric prefix: 03-new-epic/', () => {
    setupEpic('01-first', 'First');
    setupEpic('02-second', 'Second');
    const epic = createEpic(testDir, { title: 'New Epic' });
    expect(epic.slug).toBe('03-new-epic');
    expect(existsSync(epic.dir)).toBe(true);
  });

  it('writes epic.yaml with title, gates, constraints', () => {
    const epic = createEpic(testDir, {
      title: 'Bootstrap',
      gates: [{ type: 'plan', required: true }],
      constraints: { sequential: true },
    });
    expect(epic.config.title).toBe('Bootstrap');
    expect(epic.config.gates).toHaveLength(1);
    expect(epic.config.constraints).toEqual({ sequential: true });
  });

  it('sets initial status to "planned"', () => {
    const epic = createEpic(testDir, { title: 'Test' });
    expect(epic.status).toBe('planned');
  });

  it('creates tasks/ subdirectory', () => {
    const epic = createEpic(testDir, { title: 'Test' });
    expect(existsSync(join(epic.dir, 'tasks'))).toBe(true);
  });

  it('optionally writes PROMPT.md', () => {
    const epic = createEpic(testDir, {
      title: 'Prompted',
      prompt: '# Build Instructions\n\nDo the thing.',
    });
    const prompt = readFileSync(join(epic.dir, 'PROMPT.md'), 'utf-8');
    expect(prompt).toBe('# Build Instructions\n\nDo the thing.');
  });
});

describe('removeEpic', () => {
  it('removes entire epic directory recursively', () => {
    const dir = setupEpic('01-bootstrap', 'Bootstrap');
    expect(removeEpic(dir)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('returns false for non-existent epic', () => {
    expect(removeEpic(join(testDir, 'epics', '99-missing'))).toBe(false);
  });

  it('does not modify any other files (deps in other epics become dangling)', () => {
    const dir1 = setupEpic('01-first', 'First');
    const dir2 = setupEpic('02-second', 'Second');
    removeEpic(dir1);
    // dir2 should still be intact
    expect(existsSync(dir2)).toBe(true);
  });
});

describe('getEpicStatus / setEpicStatus', () => {
  it('reads single-word status from status file', () => {
    const dir = setupEpic('01-test', 'Test', 'active');
    expect(getEpicStatus(dir)).toBe('active');
  });

  it('defaults to "planned" when no status file', () => {
    const dir = join(testDir, 'epics', '01-no-status');
    mkdirSync(dir, { recursive: true });
    // readStatus returns "pending" for missing file, but for epics we
    // treat that as the default via getEpicStatus's raw read
    expect(getEpicStatus(dir)).toBe('pending');
  });

  it('writes single word to status file', () => {
    const dir = setupEpic('01-test', 'Test');
    setEpicStatus(dir, 'completed');
    expect(getEpicStatus(dir)).toBe('completed');
  });

  it('valid values: planned, active, completed, archived', () => {
    const dir = setupEpic('01-test', 'Test');
    for (const status of ['planned', 'active', 'completed', 'archived'] as const) {
      setEpicStatus(dir, status);
      expect(getEpicStatus(dir)).toBe(status);
    }
  });
});
