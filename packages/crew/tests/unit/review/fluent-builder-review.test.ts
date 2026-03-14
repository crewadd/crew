/**
 * Unit tests for TaskBuilder .review() and .report() methods
 */

import { describe, it, expect } from 'vitest';
import { TaskBuilder } from '../../../src/tasks/fluent-builder.ts';
import { TASK_COMPLETION_PROMPT } from '../../../src/tasks/feedback.ts';

describe('TaskBuilder.review()', () => {
  it('adds a single human review gate', () => {
    const task = new TaskBuilder('deploy', 'Deploy')
      .review('human')
      .build();

    expect(task.review).toEqual({ type: 'human' });
  });

  it('adds a human review gate with options', () => {
    const task = new TaskBuilder('deploy', 'Deploy')
      .review('human', {
        prompt: 'Review deployment plan',
        assignee: '@lead',
        timeout: '24h',
        onTimeout: 'reject',
      })
      .build();

    expect(task.review).toEqual({
      type: 'human',
      prompt: 'Review deployment plan',
      assignee: '@lead',
      timeout: '24h',
      onTimeout: 'reject',
    });
  });

  it('adds an agent review gate', () => {
    const task = new TaskBuilder('auth', 'Auth')
      .review('agent', {
        agent: 'security-reviewer',
        prompt: 'Review for OWASP Top 10',
        autoApprove: false,
      })
      .build();

    expect(task.review).toEqual({
      type: 'agent',
      agent: 'security-reviewer',
      prompt: 'Review for OWASP Top 10',
      autoApprove: false,
    });
  });

  it('stacks multiple review gates into an array', () => {
    const task = new TaskBuilder('payments', 'Payments')
      .review('human', { prompt: 'Review payment flow' })
      .review('agent', { agent: 'security-reviewer' })
      .build();

    expect(Array.isArray(task.review)).toBe(true);
    expect(task.review).toHaveLength(2);
    expect((task.review as any[])[0]).toEqual({
      type: 'human',
      prompt: 'Review payment flow',
    });
    expect((task.review as any[])[1]).toEqual({
      type: 'agent',
      agent: 'security-reviewer',
    });
  });

  it('chains with other builder methods', () => {
    const task = new TaskBuilder('deploy', 'Deploy')
      .prompt('Deploy to production')
      .check('build')
      .check('test')
      .review('human')
      .build();

    expect(task.prompt).toBe('Deploy to production');
    expect(task.checks).toHaveLength(2);
    expect(task.review).toEqual({ type: 'human' });
  });
});

describe('TaskBuilder.report()', () => {
  it('sets report prompt with custom text', () => {
    const task = new TaskBuilder('auth', 'Auth')
      .report('List: new files, modified files, new deps')
      .build();

    expect(task.reportPrompt).toBe('List: new files, modified files, new deps');
  });

  it('defaults to TASK_COMPLETION_PROMPT when called with no arguments', () => {
    const task = new TaskBuilder('auth', 'Auth')
      .report()
      .build();

    expect(task.reportPrompt).toBe(TASK_COMPLETION_PROMPT);
  });

  it('chains with review gate', () => {
    const task = new TaskBuilder('auth', 'Auth')
      .check('tsc')
      .report('Summarize auth implementation')
      .review('human', { assignee: '@lead' })
      .build();

    expect(task.reportPrompt).toBe('Summarize auth implementation');
    expect(task.review).toEqual({ type: 'human', assignee: '@lead' });
    expect(task.checks).toHaveLength(1);
  });
});
