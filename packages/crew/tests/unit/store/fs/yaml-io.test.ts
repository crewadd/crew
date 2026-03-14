/**
 * Unit tests for fs/yaml-io
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readYaml, writeYaml } from '../../../../src/store/fs/yaml-io.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-yaml-io-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readYaml', () => {
  it('reads and parses a YAML file into object', () => {
    const file = join(testDir, 'config.yaml');
    writeFileSync(file, 'title: Bootstrap\ncount: 3\n', 'utf-8');
    const result = readYaml<{ title: string; count: number }>(file);
    expect(result).toEqual({ title: 'Bootstrap', count: 3 });
  });

  it('returns null for missing file', () => {
    expect(readYaml(join(testDir, 'missing.yaml'))).toBeNull();
  });

  it('handles empty YAML file (returns empty object)', () => {
    const file = join(testDir, 'empty.yaml');
    writeFileSync(file, '', 'utf-8');
    expect(readYaml(file)).toEqual({});
  });

  it('preserves types: strings, numbers, booleans, arrays, nested objects', () => {
    const file = join(testDir, 'types.yaml');
    writeFileSync(
      file,
      [
        'name: test',
        'count: 42',
        'active: true',
        'tags:',
        '  - alpha',
        '  - beta',
        'nested:',
        '  key: value',
        '  num: 7',
      ].join('\n'),
      'utf-8',
    );
    const result = readYaml(file);
    expect(result).toEqual({
      name: 'test',
      count: 42,
      active: true,
      tags: ['alpha', 'beta'],
      nested: { key: 'value', num: 7 },
    });
  });
});

describe('writeYaml', () => {
  it('writes object as YAML to file', () => {
    const file = join(testDir, 'out.yaml');
    writeYaml(file, { title: 'Hello', count: 5 });
    const result = readYaml<{ title: string; count: number }>(file);
    expect(result).toEqual({ title: 'Hello', count: 5 });
  });

  it('creates parent directories if needed', () => {
    const file = join(testDir, 'deep', 'nested', 'config.yaml');
    writeYaml(file, { key: 'value' });
    expect(readYaml(file)).toEqual({ key: 'value' });
  });

  it('round-trips: write then read returns identical object', () => {
    const file = join(testDir, 'roundtrip.yaml');
    const original = {
      name: 'project',
      count: 99,
      active: false,
      tags: ['one', 'two'],
      nested: { a: 1, b: 'two' },
    };
    writeYaml(file, original);
    expect(readYaml(file)).toEqual(original);
  });

  it('does not write undefined/null fields', () => {
    const file = join(testDir, 'clean.yaml');
    writeYaml(file, { title: 'ok', removed: undefined, gone: null });
    const result = readYaml(file);
    expect(result).toEqual({ title: 'ok' });
    expect(result).not.toHaveProperty('removed');
    expect(result).not.toHaveProperty('gone');
  });
});
