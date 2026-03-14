# Performance Tuning and Optimization

**Optimize Crew projects for speed, resource efficiency, and scalability.**

[[docs](../README.md) > [advanced](./README.md) > performance-tuning]

---

## Overview

Optimize Crew projects for better performance.

---

## Parallelization

### Maximize Parallelism

```typescript
// Run independent tasks in parallel
.addTask(ctx.createTask('lint', 'Lint').prompt('...'))
.addTask(ctx.createTask('type', 'Type Check').prompt('...'))
.addTask(ctx.createTask('format', 'Format').prompt('...'))
```

### Resource Limits

```typescript
.maxParallel(4)  // Limit concurrent tasks
```

---

## Caching

### Cache Task Results

```typescript
.addTask(
  ctx.createTask('build', 'Build')
    .cache(true)
    .check({ cmd: 'npm run build' })
)
```

---

## Monitoring Performance

```bash
npx crew status --metrics
```

Shows execution times and throughput.

---

## See Also

- [Parallel Execution](../guides/parallel-execution.md) - Parallelism patterns
- [Constraint Solver](./constraint-solver.md) - Scheduling optimization

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
