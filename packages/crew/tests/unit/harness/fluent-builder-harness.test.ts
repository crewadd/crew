/**
 * Unit tests for TaskBuilder .harness() method
 */

import { describe, it, expect } from 'vitest';
import { TaskBuilder, PlanningBuilder } from '../../../src/tasks/fluent-builder.ts';

describe('TaskBuilder.harness()', () => {
  it('adds default harness config with no args', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .harness()
      .build();

    expect(task.harness).toEqual({});
  });

  it('adds harness with custom prompt', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .harness({ prompt: 'Check all routes are rendered' })
      .build();

    expect(task.harness).toEqual({ prompt: 'Check all routes are rendered' });
  });

  it('adds harness with from=inputs', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .harness({ from: 'inputs' })
      .build();

    expect(task.harness?.from).toBe('inputs');
  });

  it('adds harness with refinable flag', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .harness({ refinable: true, maxRefinements: 5 })
      .build();

    expect(task.harness?.refinable).toBe(true);
    expect(task.harness?.maxRefinements).toBe(5);
  });

  it('chains with other builder methods', () => {
    const task = new TaskBuilder('hero', 'Build Hero')
      .prompt('Build the hero section')
      .inputs(['design.html'])
      .outputs(['src/Hero.tsx'])
      .check('tsc')
      .check('build')
      .harness()
      .qualityGate({ maxAttempts: 5 })
      .build();

    expect(task.harness).toEqual({});
    expect(task.prompt).toBe('Build the hero section');
    expect(task.inputs).toEqual(['design.html']);
    expect(task.outputs).toEqual(['src/Hero.tsx']);
    expect(task.checks).toHaveLength(2);
    expect(task.qualityGate?.maxAttempts).toBe(5);
  });

  it('overwrites previous harness config', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .harness({ from: 'inputs' })
      .harness({ prompt: 'Custom check' })
      .build();

    expect(task.harness).toEqual({ prompt: 'Custom check' });
  });
});

describe('PlanningBuilder.harness()', () => {
  it('proxies harness() to underlying TaskBuilder', () => {
    const task = new TaskBuilder('nav', 'Build Nav')
      .planning()
      .harness({ refinable: true })
      .build();

    expect(task.harness).toEqual({ refinable: true });
    expect(task.planning?.enabled).toBe(true);
  });
});
