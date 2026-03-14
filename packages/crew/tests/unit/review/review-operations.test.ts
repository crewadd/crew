/**
 * Unit tests for Review Operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseTimeout,
  collectReviewGates,
  collectReportPrompt,
} from '../../../src/review/operations.ts';
import type { ReviewGate } from '../../../src/tasks/types.ts';
import type { Task } from '../../../src/store/types.ts';

/* ------------------------------------------------------------------ */
/*  parseTimeout                                                      */
/* ------------------------------------------------------------------ */

describe('parseTimeout', () => {
  it('parses minutes', () => {
    expect(parseTimeout('30m')).toBe(30 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseTimeout('24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parseTimeout('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('throws on invalid format', () => {
    expect(() => parseTimeout('abc')).toThrow('Invalid timeout format');
  });

  it('throws on missing unit', () => {
    expect(() => parseTimeout('30')).toThrow('Invalid timeout format');
  });
});

/* ------------------------------------------------------------------ */
/*  collectReviewGates                                                */
/* ------------------------------------------------------------------ */

describe('collectReviewGates', () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task_test' as any,
    version: 1,
    title: 'Test',
    status: 'pending',
    status_history: [],
    epic_id: 'epic_test' as any,
    dependencies: [],
    dependents: [],
    attempts: [],
    created: { at: new Date().toISOString(), by: 'agent_test' as any },
    updated: { at: new Date().toISOString(), by: 'agent_test' as any },
    ...overrides,
  });

  it('returns empty array when no review gates', () => {
    const task = makeTask();
    expect(collectReviewGates(task)).toEqual([]);
  });

  it('returns task-level review gate as array', () => {
    const gate: ReviewGate = { type: 'human', prompt: 'Review this' };
    const task = makeTask({ review: gate });
    expect(collectReviewGates(task)).toEqual([gate]);
  });

  it('returns multiple task-level review gates', () => {
    const gates: ReviewGate[] = [
      { type: 'human', prompt: 'Review API' },
      { type: 'agent', agent: 'security-reviewer' },
    ];
    const task = makeTask({ review: gates });
    expect(collectReviewGates(task)).toEqual(gates);
  });

  it('falls back to task type review when no task-level review', () => {
    const typeGate: ReviewGate = { type: 'human', prompt: 'Default review' };
    const task = makeTask();
    expect(collectReviewGates(task, typeGate)).toEqual([typeGate]);
  });

  it('task-level review overrides type-level', () => {
    const taskGate: ReviewGate = { type: 'agent', agent: 'test-reviewer' };
    const typeGate: ReviewGate = { type: 'human', prompt: 'Default review' };
    const task = makeTask({ review: taskGate });
    expect(collectReviewGates(task, typeGate)).toEqual([taskGate]);
  });
});

/* ------------------------------------------------------------------ */
/*  collectReportPrompt                                              */
/* ------------------------------------------------------------------ */

describe('collectReportPrompt', () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task_test' as any,
    version: 1,
    title: 'Test',
    status: 'pending',
    status_history: [],
    epic_id: 'epic_test' as any,
    dependencies: [],
    dependents: [],
    attempts: [],
    created: { at: new Date().toISOString(), by: 'agent_test' as any },
    updated: { at: new Date().toISOString(), by: 'agent_test' as any },
    ...overrides,
  });

  it('returns undefined when no report prompt', () => {
    const task = makeTask();
    expect(collectReportPrompt(task)).toBeUndefined();
  });

  it('returns task-level report prompt', () => {
    const task = makeTask({ reportPrompt: 'List changes' });
    expect(collectReportPrompt(task)).toBe('List changes');
  });

  it('falls back to type-level report prompt', () => {
    const task = makeTask();
    expect(collectReportPrompt(task, 'Default report')).toBe('Default report');
  });

  it('task-level overrides type-level', () => {
    const task = makeTask({ reportPrompt: 'Task report' });
    expect(collectReportPrompt(task, 'Type report')).toBe('Task report');
  });
});
