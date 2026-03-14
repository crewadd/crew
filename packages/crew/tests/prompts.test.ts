import { describe, it, expect, vi } from 'vitest';
import { formatTaskPrompt, getAdapter } from '../src/prompts/index.ts';

// Mock agentfn
vi.mock('agentfn', () => ({
  getDefaultProvider: vi.fn().mockReturnValue('kimi'),
}));

describe('Kimi prompt adapter', () => {
  it('formats prompts with markdown structure', () => {
    const prompt = formatTaskPrompt('Build the page', {
      taskId: 'm1.1',
      title: 'Build homepage',
      attempt: 1,
    });

    expect(prompt).toContain('# Task: Build homepage');
    expect(prompt).toContain('**Task ID:** m1.1');
    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('Build the page');
    expect(prompt).toContain('## Requirements');
  });

  it('includes attempt number on retries', () => {
    const prompt = formatTaskPrompt('Fix the error', {
      taskId: 'm1.2',
      title: 'Fix build',
      attempt: 2,
    });

    expect(prompt).toContain('**Attempt:** 2');
  });

  it('includes previous error on retries', () => {
    const prompt = formatTaskPrompt('Fix the error', {
      taskId: 'm1.2',
      title: 'Fix build',
      attempt: 2,
      previousError: 'TypeError: cannot read property x',
    });

    expect(prompt).toContain('**Attempt:** 2');
    expect(prompt).toContain('TypeError: cannot read property x');
    expect(prompt).toContain('different approach');
  });

  it('does not include retry context on first attempt', () => {
    const prompt = formatTaskPrompt('Do work', {
      taskId: 'm1.1',
      title: 'Task',
      attempt: 1,
    });

    expect(prompt).not.toContain('Attempt');
    expect(prompt).not.toContain('previous');
  });

  it('has generic requirements (not app-specific)', () => {
    const prompt = formatTaskPrompt('Do work', {
      taskId: 'm1.1',
      title: 'Task',
      attempt: 1,
    });

    expect(prompt).toContain('Make minimal, focused changes');
    expect(prompt).not.toContain('TypeScript');
  });
});

describe('Claude prompt adapter', () => {
  it('wraps prompt in XML task tags', () => {
    const adapter = getAdapter('claude');
    const prompt = adapter.formatTask('Do work', {
      taskId: 't1',
      title: 'Test task',
      attempt: 1,
    });

    expect(prompt).toContain('<task id="t1" title="Test task">');
    expect(prompt).toContain('Do work');
    expect(prompt).toContain('</task>');
  });

  it('includes retry context with XML tags on attempt > 1', () => {
    const adapter = getAdapter('claude');
    const prompt = adapter.formatTask('Fix it', {
      taskId: 't1',
      title: 'Fix task',
      attempt: 2,
      previousError: 'Build failed: missing module',
    });

    expect(prompt).toContain('<previous_failure attempt="1">');
    expect(prompt).toContain('Build failed: missing module');
    expect(prompt).toContain('</previous_failure>');
    expect(prompt).toContain('<retry_instruction>');
    expect(prompt).toContain('different approach');
    expect(prompt).toContain('</retry_instruction>');
  });

  it('includes check failures in retry context', () => {
    const adapter = getAdapter('claude');
    const prompt = adapter.formatTask('Fix it', {
      taskId: 't1',
      title: 'Fix task',
      attempt: 3,
      previousError: 'Checks failed',
      previousCheckFailures: '[tsc]\nType error in line 42',
    });

    expect(prompt).toContain('<previous_failure attempt="2">');
    expect(prompt).toContain('Check failures:');
    expect(prompt).toContain('Type error in line 42');
  });

  it('does not include retry context on first attempt', () => {
    const adapter = getAdapter('claude');
    const prompt = adapter.formatTask('Do work', {
      taskId: 't1',
      title: 'Test task',
      attempt: 1,
    });

    expect(prompt).not.toContain('previous_failure');
    expect(prompt).not.toContain('retry_instruction');
  });
});

describe('getAdapter', () => {
  it('returns kimi adapter based on mocked provider', () => {
    const adapter = getAdapter();
    const prompt = adapter.formatTask('Do work', {
      taskId: 't1',
      title: 'Test task',
      attempt: 1,
    });
    expect(prompt).toContain('# Task:');
  });

  it('returns claude adapter when specified', () => {
    const adapter = getAdapter('claude');
    const prompt = adapter.formatTask('Do work', {
      taskId: 't1',
      title: 'Test task',
      attempt: 1,
    });
    expect(prompt).toContain('<task id="t1"');
  });
});
