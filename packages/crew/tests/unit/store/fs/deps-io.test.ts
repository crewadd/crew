/**
 * Unit tests for fs/deps-io
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readDeps, writeDeps, appendDep, removeDep } from '../../../../src/store/fs/deps-io.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-deps-io-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readDeps', () => {
  it('returns empty array when no deps file exists', () => {
    expect(readDeps(testDir)).toEqual([]);
  });

  it('reads one relative path per line', () => {
    writeFileSync(join(testDir, 'deps'), '../01-setup\n../02-build', 'utf-8');
    const result = readDeps(testDir);
    expect(result).toEqual([
      resolve(testDir, '../01-setup'),
      resolve(testDir, '../02-build'),
    ]);
  });

  it('ignores blank lines and comments (# prefixed)', () => {
    writeFileSync(
      join(testDir, 'deps'),
      '# dependencies\n../01-setup\n\n# another comment\n../02-build\n',
      'utf-8',
    );
    const result = readDeps(testDir);
    expect(result).toHaveLength(2);
  });

  it('trims whitespace from each line', () => {
    writeFileSync(join(testDir, 'deps'), '  ../01-setup  \n  ../02-build  ', 'utf-8');
    const result = readDeps(testDir);
    expect(result).toEqual([
      resolve(testDir, '../01-setup'),
      resolve(testDir, '../02-build'),
    ]);
  });

  it('resolves paths relative to taskDir', () => {
    writeFileSync(join(testDir, 'deps'), '../01-setup', 'utf-8');
    const result = readDeps(testDir);
    expect(result[0]).toBe(resolve(testDir, '../01-setup'));
  });
});

describe('writeDeps', () => {
  it('writes array of paths as newline-separated file', () => {
    writeDeps(testDir, ['../01-setup', '../02-build']);
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup\n../02-build');
  });

  it('overwrites existing deps file', () => {
    writeDeps(testDir, ['../01-setup']);
    writeDeps(testDir, ['../03-test']);
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../03-test');
  });

  it('writes empty file for empty array', () => {
    writeDeps(testDir, []);
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('');
  });
});

describe('appendDep', () => {
  it('appends a new path to existing deps file', () => {
    writeDeps(testDir, ['../01-setup']);
    appendDep(testDir, '../02-build');
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup\n../02-build');
  });

  it('creates deps file if missing', () => {
    appendDep(testDir, '../01-setup');
    expect(existsSync(join(testDir, 'deps'))).toBe(true);
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup');
  });

  it('does not duplicate existing entry', () => {
    writeDeps(testDir, ['../01-setup']);
    appendDep(testDir, '../01-setup');
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup');
  });
});

describe('removeDep', () => {
  it('removes matching line from deps file', () => {
    writeDeps(testDir, ['../01-setup', '../02-build', '../03-test']);
    removeDep(testDir, '../02-build');
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup\n../03-test');
  });

  it('no-op if path not present', () => {
    writeDeps(testDir, ['../01-setup']);
    removeDep(testDir, '../99-missing');
    const raw = readFileSync(join(testDir, 'deps'), 'utf-8');
    expect(raw).toBe('../01-setup');
  });

  it('no-op if deps file missing', () => {
    // Should not throw
    removeDep(testDir, '../01-setup');
    expect(existsSync(join(testDir, 'deps'))).toBe(false);
  });
});
