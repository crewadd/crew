/**
 * Unit tests for executor/scheduler
 * Tests: computeBatches — dependency resolution and batch parallelization
 */

import { describe, it, expect } from 'vitest';
import { computeBatches } from '../../../src/executor/scheduler.ts';
import type { CompoundMilestone, CompoundTask } from '../../../src/types.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function task(id: string, deps?: string[], status: CompoundTask['status'] = 'pending', constraints?: any): CompoundTask {
  return { id, title: `Task ${id}`, status, deps, constraints };
}

function milestone(id: number, tasks: CompoundTask[]): CompoundMilestone {
  return { id, title: `M${id}`, tasks, complete: false };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('computeBatches', () => {
  /* ---- Empty & trivial ---- */

  it('returns empty for empty milestone', () => {
    expect(computeBatches(milestone(1, []))).toEqual([]);
  });

  it('returns empty when all tasks are done', () => {
    const ms = milestone(1, [task('a', undefined, 'done'), task('b', undefined, 'done')]);
    expect(computeBatches(ms)).toEqual([]);
  });

  /* ---- Independent tasks ---- */

  it('puts independent tasks in a single parallel batch', () => {
    const ms = milestone(1, [task('a'), task('b'), task('c')]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks).toHaveLength(3);
    expect(batches[0].parallel).toBe(true);
  });

  /* ---- Linear chain ---- */

  it('creates sequential batches for linear deps', () => {
    const ms = milestone(1, [
      task('a'),
      task('b', ['a']),
      task('c', ['b']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(3);
    expect(batches[0].tasks.map(t => t.id)).toEqual(['a']);
    expect(batches[1].tasks.map(t => t.id)).toEqual(['b']);
    expect(batches[2].tasks.map(t => t.id)).toEqual(['c']);
  });

  /* ---- Fan-out ---- */

  it('parallelizes tasks with shared dependency', () => {
    const ms = milestone(1, [
      task('root'),
      task('left', ['root']),
      task('right', ['root']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);
    expect(batches[0].tasks.map(t => t.id)).toEqual(['root']);
    expect(batches[1].tasks.map(t => t.id).sort()).toEqual(['left', 'right']);
  });

  /* ---- Diamond ---- */

  it('handles diamond dependency graph', () => {
    const ms = milestone(1, [
      task('top'),
      task('left', ['top']),
      task('right', ['top']),
      task('bottom', ['left', 'right']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(3);
    expect(batches[2].tasks.map(t => t.id)).toEqual(['bottom']);
  });

  /* ---- Done tasks skipped ---- */

  it('skips done tasks and treats their deps as met', () => {
    const ms = milestone(1, [
      task('done1', undefined, 'done'),
      task('b', ['done1']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks.map(t => t.id)).toEqual(['b']);
  });

  /* ---- Cycle handling ---- */

  it('places cyclic tasks in a final fallback batch', () => {
    const ms = milestone(1, [
      task('a', ['b']),
      task('b', ['a']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks).toHaveLength(2);
  });

  /* ---- Mixed done and pending across deps ---- */

  it('handles partially complete dependency chains', () => {
    const ms = milestone(1, [
      task('a', undefined, 'done'),
      task('b', ['a']),
      task('c', ['b']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);
    expect(batches[0].tasks.map(t => t.id)).toEqual(['b']);
    expect(batches[1].tasks.map(t => t.id)).toEqual(['c']);
  });

  /* ---- Wide parallelism ---- */

  it('handles wide parallelism (many independent then one convergent)', () => {
    const ms = milestone(1, [
      task('a'), task('b'), task('c'), task('d'),
      task('final', ['a', 'b', 'c', 'd']),
    ]);
    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);
    expect(batches[0].tasks).toHaveLength(4);
    expect(batches[1].tasks.map(t => t.id)).toEqual(['final']);
  });
});
