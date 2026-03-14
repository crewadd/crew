/**
 * Unit tests for fs/status-io
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readStatus, writeStatus } from '../../../../src/store/fs/status-io.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-status-io-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readStatus', () => {
  it('returns "pending" when no status file exists', () => {
    expect(readStatus(testDir)).toBe('pending');
  });

  it('reads single-word status from file ("done")', () => {
    writeFileSync(join(testDir, 'status'), 'done', 'utf-8');
    expect(readStatus(testDir)).toBe('done');
  });

  it('trims whitespace and newlines ("  active\\n" → "active")', () => {
    writeFileSync(join(testDir, 'status'), '  active\n', 'utf-8');
    expect(readStatus(testDir)).toBe('active');
  });

  it('returns "pending" for empty file', () => {
    writeFileSync(join(testDir, 'status'), '', 'utf-8');
    expect(readStatus(testDir)).toBe('pending');
  });
});

describe('writeStatus', () => {
  it('creates status file with single word', () => {
    writeStatus(testDir, 'done');
    expect(readFileSync(join(testDir, 'status'), 'utf-8')).toBe('done');
  });

  it('overwrites existing status file', () => {
    writeStatus(testDir, 'active');
    writeStatus(testDir, 'done');
    expect(readFileSync(join(testDir, 'status'), 'utf-8')).toBe('done');
  });

  it('file contains no trailing newline beyond the word itself', () => {
    writeStatus(testDir, 'pending');
    const raw = readFileSync(join(testDir, 'status'), 'utf-8');
    expect(raw).toBe('pending');
  });

  it('creates parent directory if missing', () => {
    const nested = join(testDir, 'deep', 'nested', 'dir');
    writeStatus(nested, 'active');
    expect(readFileSync(join(nested, 'status'), 'utf-8')).toBe('active');
  });
});
