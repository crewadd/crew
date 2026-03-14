import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProgressLogger } from '../src/progress.ts';
import type { OrchestratorEvent } from '../src/orchestrator/types.ts';

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

  it('creates .crew directory on construction', () => {
    const { existsSync } = require('node:fs');
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);
  });

  it('log() appends JSONL lines with timestamps', () => {
    logger.log({ event: 'test', value: 42 });
    logger.log({ event: 'test2', value: 'hello' });

    const entries = logger.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe('test');
    expect(entries[0].value).toBe(42);
    expect(entries[0].ts).toBeDefined();
    expect(entries[1].event).toBe('test2');
    expect(entries[1].value).toBe('hello');
  });

  it('readAll() returns empty array when file does not exist', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'crew-empty-'));
    const freshLogger = new ProgressLogger(freshDir);
    // Don't write anything — readAll from non-existent file
    const entries = freshLogger.readAll();
    expect(entries).toEqual([]);
    rmSync(freshDir, { recursive: true, force: true });
  });

  it('readAll() parses back entries correctly', () => {
    logger.log({ event: 'a', num: 1 });
    logger.log({ event: 'b', str: 'test' });
    logger.log({ event: 'c', arr: [1, 2, 3] });

    const entries = logger.readAll();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ event: 'a', num: 1 });
    expect(entries[1]).toMatchObject({ event: 'b', str: 'test' });
    expect(entries[2]).toMatchObject({ event: 'c', arr: [1, 2, 3] });
  });

  describe('logEvent()', () => {
    it('maps project:start', () => {
      const event: OrchestratorEvent = { type: 'project:start', iteration: 2 };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ event: 'project:start', iteration: 2 });
    });

    it('maps project:planned', () => {
      const event: OrchestratorEvent = {
        type: 'project:planned',
        epics: [
          { title: 'M1', tasks: [{ title: 'T1', prompt: 'do it' }] },
          { title: 'M2', tasks: [] },
        ],
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({ event: 'project:planned', epicCount: 2 });
    });

    it('maps project:verified', () => {
      const event: OrchestratorEvent = {
        type: 'project:verified',
        report: { passed: false, checks: [], issues: [{ check: 'tsc', message: 'err', severity: 'error' }] },
        iteration: 1,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({ event: 'project:verified', passed: false, issueCount: 1, iteration: 1 });
    });

    it('maps project:fix', () => {
      const event: OrchestratorEvent = {
        type: 'project:fix',
        fixEpics: [{ title: 'Fix', tasks: [] }],
        iteration: 2,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({ event: 'project:fix', epicCount: 1, iteration: 2 });
    });

    it('maps project:done', () => {
      const event: OrchestratorEvent = {
        type: 'project:done',
        result: { success: true, epics: [], totalDurationMs: 5000, iterations: 1 },
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'project:done',
        success: true,
        iterations: 1,
        totalDurationMs: 5000,
      });
    });

    it('maps epic:start', () => {
      const event: OrchestratorEvent = {
        type: 'epic:start',
        epicId: 3,
        title: 'Setup',
        iteration: 1,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'epic:start',
        epicId: 3,
        title: 'Setup',
        iteration: 1,
      });
    });

    it('maps epic:verified', () => {
      const event: OrchestratorEvent = {
        type: 'epic:verified',
        epicId: 2,
        report: { passed: true, checks: [], issues: [] },
        iteration: 1,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'epic:verified',
        epicId: 2,
        passed: true,
        issueCount: 0,
        iteration: 1,
      });
    });

    it('maps epic:fix', () => {
      const event: OrchestratorEvent = {
        type: 'epic:fix',
        epicId: 1,
        fixTasks: [{ title: 'Fix', prompt: 'fix it' }],
        iteration: 2,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'epic:fix',
        epicId: 1,
        taskCount: 1,
        iteration: 2,
      });
    });

    it('maps epic:done', () => {
      const event: OrchestratorEvent = {
        type: 'epic:done',
        epicId: 1,
        result: { epicId: 1, title: 'Setup', tasks: [], success: true, iterations: 1 },
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'epic:done',
        epicId: 1,
        success: true,
        iterations: 1,
      });
    });

    it('maps task:start', () => {
      const event: OrchestratorEvent = {
        type: 'task:start',
        taskId: 'm1.2',
        epicId: 1,
        attempt: 1,
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'task:start',
        taskId: 'm1.2',
        epicId: 1,
        attempt: 1,
      });
    });

    it('maps task:done', () => {
      const event: OrchestratorEvent = {
        type: 'task:done',
        taskId: 'm1.1',
        result: { taskId: 'm1.1', raw: 'output', durationMs: 1234, success: true },
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'task:done',
        taskId: 'm1.1',
        durationMs: 1234,
      });
      // raw output should NOT be logged
      expect(entries[0].raw).toBeUndefined();
    });

    it('maps task:failed', () => {
      const event: OrchestratorEvent = {
        type: 'task:failed',
        taskId: 'm2.1',
        result: { taskId: 'm2.1', raw: 'output', durationMs: 500, success: false, error: 'timeout' },
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'task:failed',
        taskId: 'm2.1',
        durationMs: 500,
        error: 'timeout',
      });
    });

    it('maps task:retry', () => {
      const event: OrchestratorEvent = {
        type: 'task:retry',
        taskId: 'm1.1',
        attempt: 2,
        error: 'connection reset',
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries[0]).toMatchObject({
        event: 'task:retry',
        taskId: 'm1.1',
        attempt: 2,
        error: 'connection reset',
      });
    });

    it('skips task:stream events', () => {
      const event: OrchestratorEvent = {
        type: 'task:stream',
        taskId: 'm1.1',
        chunk: 'some output chunk',
      };
      logger.logEvent(event);

      const entries = logger.readAll();
      expect(entries).toHaveLength(0);
    });
  });
});
