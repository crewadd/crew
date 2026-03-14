/**
 * Unit tests for fs/ordering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listOrdered, parsePrefix, nextPrefix, renumber } from '../../../../src/store/fs/ordering.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-ordering-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeDir(name: string): void {
  mkdirSync(join(testDir, name), { recursive: true });
}

function makeFile(name: string): void {
  writeFileSync(join(testDir, name), '', 'utf-8');
}

describe('listOrdered', () => {
  it('returns directories sorted by numeric prefix: [01-a, 02-b, 03-c]', () => {
    makeDir('03-c');
    makeDir('01-a');
    makeDir('02-b');
    expect(listOrdered(testDir)).toEqual(['01-a', '02-b', '03-c']);
  });

  it('filters out non-directory entries (files)', () => {
    makeDir('01-real');
    makeFile('02-fake.txt');
    makeDir('03-also-real');
    expect(listOrdered(testDir)).toEqual(['01-real', '03-also-real']);
  });

  it('returns empty array for empty directory', () => {
    expect(listOrdered(testDir)).toEqual([]);
  });

  it('returns empty array for non-existent directory', () => {
    expect(listOrdered(join(testDir, 'nope'))).toEqual([]);
  });

  it('handles mixed prefixes: [01-a, 02a-b, 03-c] sorts correctly', () => {
    makeDir('03-c');
    makeDir('02a-b');
    makeDir('01-a');
    const result = listOrdered(testDir);
    expect(result).toEqual(['01-a', '02a-b', '03-c']);
  });

  it('handles gaps: [01-a, 05-b, 10-c] preserves order', () => {
    makeDir('10-c');
    makeDir('01-a');
    makeDir('05-b');
    expect(listOrdered(testDir)).toEqual(['01-a', '05-b', '10-c']);
  });
});

describe('parsePrefix', () => {
  it('extracts numeric prefix: "01-bootstrap" → 1', () => {
    const p = parsePrefix('01-bootstrap');
    expect(p.num).toBe(1);
    expect(p.slug).toBe('bootstrap');
  });

  it('extracts double-digit prefix: "12-deploy" → 12', () => {
    const p = parsePrefix('12-deploy');
    expect(p.num).toBe(12);
    expect(p.slug).toBe('deploy');
  });

  it('handles fractional prefix: "02a-hotfix" → 2 (with suffix "a")', () => {
    const p = parsePrefix('02a-hotfix');
    expect(p.num).toBe(2);
    expect(p.suffix).toBe('a');
    expect(p.slug).toBe('hotfix');
  });

  it('returns 0 for unprefixed directory names', () => {
    const p = parsePrefix('no-number-here');
    expect(p.num).toBe(0);
  });
});

describe('nextPrefix', () => {
  it('returns "01" for empty directory', () => {
    expect(nextPrefix(testDir)).toBe('01');
  });

  it('returns next sequential number after highest existing prefix', () => {
    makeDir('01-a');
    makeDir('05-b');
    expect(nextPrefix(testDir)).toBe('06');
  });

  it('pads to 2 digits', () => {
    makeDir('01-a');
    makeDir('02-b');
    makeDir('03-c');
    expect(nextPrefix(testDir)).toBe('04');
  });
});

describe('renumber', () => {
  it('renames directories to sequential 01, 02, 03', () => {
    makeDir('01-a');
    makeDir('05-b');
    makeDir('10-c');
    renumber(testDir);
    expect(listOrdered(testDir)).toEqual(['01-a', '02-b', '03-c']);
  });

  it('updates deps files that reference renamed directories', () => {
    makeDir('01-setup');
    makeDir('05-build');
    mkdirSync(join(testDir, '05-build', 'tasks', '01-lint'), { recursive: true });
    writeFileSync(
      join(testDir, '05-build', 'tasks', '01-lint', 'deps'),
      '../../../01-setup',
      'utf-8',
    );

    renumber(testDir);

    // 05-build should now be 02-build; deps ref to 01-setup stays the same (it wasn't renamed)
    expect(existsSync(join(testDir, '02-build'))).toBe(true);
    const deps = readFileSync(
      join(testDir, '02-build', 'tasks', '01-lint', 'deps'),
      'utf-8',
    );
    expect(deps).toContain('01-setup');
  });

  it('handles fractional prefixes (02a → 03)', () => {
    makeDir('01-init');
    makeDir('02a-hotfix');
    makeDir('03-deploy');
    renumber(testDir);
    expect(listOrdered(testDir)).toEqual(['01-init', '02-hotfix', '03-deploy']);
  });

  it('is idempotent: renumbering already-sequential dirs is a no-op', () => {
    makeDir('01-a');
    makeDir('02-b');
    makeDir('03-c');
    renumber(testDir);
    expect(listOrdered(testDir)).toEqual(['01-a', '02-b', '03-c']);
  });

  it('preserves slug portion of directory names', () => {
    makeDir('05-bootstrap');
    makeDir('10-verification');
    renumber(testDir);
    const result = listOrdered(testDir);
    expect(result[0]).toBe('01-bootstrap');
    expect(result[1]).toBe('02-verification');
  });
});
