/**
 * Unit tests for fs/log-io
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendLog, listAttempts, readAttempt, startNewAttempt } from '../../../../src/store/fs/log-io.ts';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `crew-log-io-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('appendLog', () => {
  it('creates events/ directory and 001.jsonl for first entry', () => {
    appendLog(testDir, { event: 'start', agent: 'builder' });
    expect(existsSync(join(testDir, 'events', '001.jsonl'))).toBe(true);
  });

  it('appends to current attempt file', () => {
    appendLog(testDir, { event: 'start' });
    appendLog(testDir, { event: 'progress' });
    const lines = readFileSync(join(testDir, 'events', '001.jsonl'), 'utf-8')
      .split('\n')
      .filter(l => l.trim() !== '');
    expect(lines).toHaveLength(2);
  });

  it('each line is valid JSON with "t" timestamp field', () => {
    appendLog(testDir, { event: 'start' });
    const raw = readFileSync(join(testDir, 'events', '001.jsonl'), 'utf-8').trim();
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('t');
    expect(parsed).toHaveProperty('event', 'start');
    // Verify timestamp is ISO format
    expect(() => new Date(parsed.t)).not.toThrow();
    expect(new Date(parsed.t).toISOString()).toBe(parsed.t);
  });

  it('creates next attempt file (002.jsonl) when startNewAttempt is called', () => {
    appendLog(testDir, { event: 'start' });
    startNewAttempt(testDir);
    appendLog(testDir, { event: 'retry' });
    expect(existsSync(join(testDir, 'events', '001.jsonl'))).toBe(true);
    expect(existsSync(join(testDir, 'events', '002.jsonl'))).toBe(true);

    const attempt2 = readAttempt(testDir, 2);
    expect(attempt2).toHaveLength(1);
    expect(attempt2[0].event).toBe('retry');
  });
});

describe('listAttempts', () => {
  it('returns empty array when no events/ directory', () => {
    expect(listAttempts(testDir)).toEqual([]);
  });

  it('returns sorted attempt numbers [1, 2, 3]', () => {
    const logDir = join(testDir, 'events');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, '003.jsonl'), '', 'utf-8');
    writeFileSync(join(logDir, '001.jsonl'), '', 'utf-8');
    writeFileSync(join(logDir, '002.jsonl'), '', 'utf-8');
    expect(listAttempts(testDir)).toEqual([1, 2, 3]);
  });

  it('ignores non-jsonl files in events/', () => {
    const logDir = join(testDir, 'events');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, '001.jsonl'), '', 'utf-8');
    writeFileSync(join(logDir, 'notes.txt'), '', 'utf-8');
    writeFileSync(join(logDir, '.gitkeep'), '', 'utf-8');
    expect(listAttempts(testDir)).toEqual([1]);
  });
});

describe('readAttempt', () => {
  it('parses all JSONL lines from a specific attempt file', () => {
    appendLog(testDir, { event: 'start', agent: 'a1' });
    appendLog(testDir, { event: 'done', agent: 'a1' });
    const entries = readAttempt(testDir, 1);
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe('start');
    expect(entries[1].event).toBe('done');
  });

  it('returns empty array for missing attempt number', () => {
    expect(readAttempt(testDir, 99)).toEqual([]);
  });

  it('handles malformed lines gracefully (skips them)', () => {
    const logDir = join(testDir, 'events');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(logDir, '001.jsonl'),
      '{"t":"2026-01-01T00:00:00.000Z","event":"ok"}\nBAD LINE\n{"t":"2026-01-01T00:00:01.000Z","event":"also_ok"}\n',
      'utf-8',
    );
    const entries = readAttempt(testDir, 1);
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe('ok');
    expect(entries[1].event).toBe('also_ok');
  });
});
