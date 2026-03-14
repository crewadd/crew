/**
 * Unit tests for progress module
 * Tests: ProgressLogger — JSONL append-only logging, event mapping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProgressLogger } from '../../../src/progress.ts';
import type { OrchestratorEvent } from '../../../src/orchestrator/types.ts';

describe('ProgressLogger', () => {
  let tempDir: string;
  let logger: ProgressLogger;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'crew-progress-'));
    logger = new ProgressLogger(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /* ---- Basic JSONL ---- */

  it('creates .crew directory on construction', () => {
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);
  });

  it('appends JSONL lines with timestamps', () => {
    logger.log({ event: 'test', value: 42 });
    logger.log({ event: 'test2', value: 'hello' });

    const entries = logger.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe('test');
    expect(entries[0].ts).toBeDefined();
    expect(entries[1].value).toBe('hello');
  });

  it('returns empty array for non-existent log', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'crew-empty-'));
    const freshLogger = new ProgressLogger(freshDir);
    expect(freshLogger.readAll()).toEqual([]);
    rmSync(freshDir, { recursive: true, force: true });
  });

  it('correctly round-trips complex data', () => {
    logger.log({ event: 'complex', arr: [1, 2, 3], nested: { key: 'val' } });
    const entries = logger.readAll();
    expect(entries[0].arr).toEqual([1, 2, 3]);
    expect(entries[0].nested).toEqual({ key: 'val' });
  });

  /* ---- Event mapping ---- */

  describe('logEvent', () => {
    it('maps project:start', () => {
      const event: OrchestratorEvent = { type: 'project:start', iteration: 2 };
      logger.logEvent(event);
      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({ event: 'project:start', iteration: 2 });
    });

    it('maps project:planned with milestone count', () => {
      logger.logEvent({
        type: 'project:planned',
        milestones: [
          { title: 'M1', tasks: [{ title: 'T1', prompt: 'do' }] },
          { title: 'M2', tasks: [] },
        ],
      });
      expect(logger.readAll()[0]).toMatchObject({ event: 'project:planned', milestoneCount: 2 });
    });

    it('maps project:verified with pass/issue count', () => {
      logger.logEvent({
        type: 'project:verified',
        report: { passed: false, checks: [], issues: [{ check: 'tsc', message: 'err', severity: 'error' }] },
        iteration: 1,
      });
      expect(logger.readAll()[0]).toMatchObject({ event: 'project:verified', passed: false, issueCount: 1 });
    });

    it('maps project:done with result summary', () => {
      logger.logEvent({
        type: 'project:done',
        result: { success: true, milestones: [], totalDurationMs: 5000, iterations: 1 },
      });
      expect(logger.readAll()[0]).toMatchObject({ event: 'project:done', success: true, totalDurationMs: 5000 });
    });

    it('maps task:start', () => {
      logger.logEvent({ type: 'task:start', taskId: 'm1.2', milestoneId: 1, attempt: 1 });
      expect(logger.readAll()[0]).toMatchObject({ event: 'task:start', taskId: 'm1.2' });
    });

    it('maps task:done without raw output', () => {
      logger.logEvent({
        type: 'task:done',
        taskId: 'm1.1',
        result: { taskId: 'm1.1', raw: 'big output', durationMs: 1234, success: true },
      });
      const entry = logger.readAll()[0];
      expect(entry.durationMs).toBe(1234);
      expect(entry.raw).toBeUndefined();
    });

    it('maps task:failed with error', () => {
      logger.logEvent({
        type: 'task:failed',
        taskId: 'm2.1',
        result: { taskId: 'm2.1', raw: 'x', durationMs: 500, success: false, error: 'timeout' },
      });
      expect(logger.readAll()[0]).toMatchObject({ event: 'task:failed', error: 'timeout' });
    });

    it('maps task:retry with attempt and error', () => {
      logger.logEvent({ type: 'task:retry', taskId: 'm1.1', attempt: 2, error: 'connection reset' });
      expect(logger.readAll()[0]).toMatchObject({ event: 'task:retry', attempt: 2, error: 'connection reset' });
    });

    it('skips task:stream events', () => {
      logger.logEvent({ type: 'task:stream', taskId: 'm1.1', chunk: 'output' });
      expect(logger.readAll()).toHaveLength(0);
    });

    it('maps milestone:start', () => {
      logger.logEvent({ type: 'milestone:start', milestoneId: 1, title: 'Setup', iteration: 1 });
      expect(logger.readAll()[0]).toMatchObject({ event: 'milestone:start', milestoneId: 1, title: 'Setup' });
    });

    it('maps milestone:done', () => {
      logger.logEvent({
        type: 'milestone:done',
        milestoneId: 1,
        result: { milestoneId: 1, title: 'Setup', tasks: [], success: true, iterations: 1 },
      });
      expect(logger.readAll()[0]).toMatchObject({ event: 'milestone:done', success: true });
    });
  });
});
