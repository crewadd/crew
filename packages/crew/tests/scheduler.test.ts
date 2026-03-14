import { describe, it, expect } from 'vitest';
import { computeBatches } from '../src/executor/scheduler.ts';
import type { CompoundEpic, CompoundTask } from '../src/types.ts';

function makeTask(id: string, deps?: string[], status: CompoundTask['status'] = 'pending'): CompoundTask {
  return { id, title: `Task ${id}`, status, deps };
}

function makeEpic(id: number, tasks: CompoundTask[]): CompoundEpic {
  return { id, title: `M${id}`, tasks, complete: false };
}

describe('computeBatches', () => {
  it('returns empty for empty epic', () => {
    const ms = makeEpic(1, []);
    expect(computeBatches(ms)).toEqual([]);
  });

  it('returns empty when all tasks are done', () => {
    const ms = makeEpic(1, [
      makeTask('m1.1', undefined, 'done'),
      makeTask('m1.2', undefined, 'done'),
    ]);
    expect(computeBatches(ms)).toEqual([]);
  });

  it('puts independent tasks in a single batch', () => {
    const ms = makeEpic(1, [
      makeTask('m1.1'),
      makeTask('m1.2'),
      makeTask('m1.3'),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks).toHaveLength(3);
  });

  it('creates sequential batches based on deps', () => {
    const ms = makeEpic(1, [
      makeTask('m1.1'),
      makeTask('m1.2', ['m1.1']),
      makeTask('m1.3', ['m1.2']),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(3);
    expect(batches[0].tasks.map((t) => t.id)).toEqual(['m1.1']);
    expect(batches[1].tasks.map((t) => t.id)).toEqual(['m1.2']);
    expect(batches[2].tasks.map((t) => t.id)).toEqual(['m1.3']);
  });

  it('parallelizes independent tasks with shared dep', () => {
    // m1.1 → m1.2
    // m1.1 → m1.3
    // Both m1.2 and m1.3 depend on m1.1 but not each other
    const ms = makeEpic(1, [
      makeTask('m1.1'),
      makeTask('m1.2', ['m1.1']),
      makeTask('m1.3', ['m1.1']),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);
    expect(batches[0].tasks.map((t) => t.id)).toEqual(['m1.1']);
    expect(batches[1].tasks.map((t) => t.id).sort()).toEqual(['m1.2', 'm1.3']);
  });

  it('skips done tasks', () => {
    const ms = makeEpic(1, [
      makeTask('m1.1', undefined, 'done'),
      makeTask('m1.2', ['m1.1']),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks.map((t) => t.id)).toEqual(['m1.2']);
  });

  it('ignores deps on tasks not in the epic (already done)', () => {
    // m1.2 depends on m1.1 which is done and filtered out
    const ms = makeEpic(1, [
      makeTask('m1.1', undefined, 'done'),
      makeTask('m1.2', ['m1.1']),
      makeTask('m1.3', ['m1.2']),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(2);
    expect(batches[0].tasks.map((t) => t.id)).toEqual(['m1.2']);
    expect(batches[1].tasks.map((t) => t.id)).toEqual(['m1.3']);
  });

  it('handles cycles by placing stuck tasks in final batch', () => {
    // Circular: m1.1 → m1.2 → m1.1
    const ms = makeEpic(1, [
      makeTask('m1.1', ['m1.2']),
      makeTask('m1.2', ['m1.1']),
    ]);

    const batches = computeBatches(ms);
    // Should still produce at least one batch with both tasks
    expect(batches).toHaveLength(1);
    expect(batches[0].tasks).toHaveLength(2);
  });

  it('handles diamond dependency graph', () => {
    // m1.1 → m1.2, m1.3 → m1.4
    const ms = makeEpic(1, [
      makeTask('m1.1'),
      makeTask('m1.2', ['m1.1']),
      makeTask('m1.3', ['m1.1']),
      makeTask('m1.4', ['m1.2', 'm1.3']),
    ]);

    const batches = computeBatches(ms);
    expect(batches).toHaveLength(3);
    expect(batches[0].tasks.map((t) => t.id)).toEqual(['m1.1']);
    expect(batches[1].tasks.map((t) => t.id).sort()).toEqual(['m1.2', 'm1.3']);
    expect(batches[2].tasks.map((t) => t.id)).toEqual(['m1.4']);
  });
});
