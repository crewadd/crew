# Deep Dive: Constraint Solver

**Understanding Crew's execution scheduler and dependency resolution engine.**

[[docs](../README.md) > [advanced](./README.md) > constraint-solver]

---

## Overview

Crew's constraint solver schedules task execution based on:

1. **Explicit dependencies** - `.deps()` creates task dependencies
2. **Implicit ordering** - Epic sequence defines execution phases
3. **Parallelism limits** - `.maxParallel()` constrains concurrency
4. **Conditions** - `.when()` filters task inclusion
5. **Priorities** - `.priority()` affects scheduling order

---

## Dependency Graph

### Building the Graph

```
Task graph (DAG - Directed Acyclic Graph):

  ┌─→ B ─┐
  │      ├─→ D ─→ F
  A ─────┤      │
  │      │      ├─→ G
  └─→ C ─┤
         └─→ E ─┘
```

### Resolution Algorithm

1. **Topological sort** - Find execution order
2. **Identify independent tasks** - Can run in parallel
3. **Apply constraints** - maxParallel, priorities
4. **Generate batches** - Executable in each phase

---

## Execution Phases

```typescript
// Phase 1: Sequential tasks
// A (no deps)
// B (no deps)
// C (no deps)

// Phase 2: Conditional on Phase 1
// D (deps: [A])
// E (deps: [B])
// F (deps: [C])

// Phase 3: Convergence
// G (deps: [D, E, F])
```

---

## Constraint Types

### Hard Constraints (Must Satisfy)

```typescript
// Task cannot execute until dependency completes
.deps(['other-task'])

// Task only executes if condition is true
.when(condition)

// Tasks limited to N concurrent
.maxParallel(2)
```

### Soft Constraints (Prefer)

```typescript
// Higher priority tasks scheduled first
.priority(100)

// Try to schedule earlier if possible
// (but won't violate hard constraints)
```

---

## Scheduling Algorithm

```
while tasks remain:
  1. Find all executable tasks
     (all dependencies complete, condition true)

  2. Apply priority ordering
     (higher priority first)

  3. Take up to maxParallel tasks
     (respect concurrency limit)

  4. Execute batch in parallel

  5. Mark complete, update state

  6. Remove from pending list
```

---

## Performance Characteristics

### Time Complexity

- **Graph analysis**: O(V + E) where V=tasks, E=dependencies
- **Scheduling**: O(V log V) for priority queue operations
- **Overall**: O(V log V) per scheduling phase

### Space Complexity

- **DAG storage**: O(V + E)
- **Queue/stack**: O(V) worst case
- **Overall**: O(V + E)

---

## Optimization Strategies

### 1. Minimize Critical Path

```
Critical path = longest dependency chain

Bad:  A → B → C → D → E → F
      (6 sequential phases, 6x slower than parallel)

Good: A → [B,C,D] → [E,F] → G
      (3 phases, 2x faster)
```

### 2. Balance Workload

```
Bad:
  Phase 1: [Heavy (5s), Light1, Light2, Light3]
  Phase 2: [Ready after Light finishes]

Good:
  Phase 1: [Heavy1 (5s), Heavy2 (5s)]
  Phase 2: [Light1, Light2, Light3]
  Phase 3: [Integration]
```

### 3. Limit Parallelism Strategically

```
# Too many concurrent tasks → Resource contention
.maxParallel(10)  // May overload system

# Balanced parallelism → Good throughput
.maxParallel(4)   // CPU cores

# Sequential execution → Debugging
.maxParallel(1)   // One at a time
```

---

## Real-World Example: Build Pipeline Optimization

### Before (Sequential)

```typescript
.addTask(...setup...)           // 1s
.addTask(...lint...).deps(['setup'])    // 1s
.addTask(...compile...).deps(['lint'])  // 2s
.addTask(...test...).deps(['compile'])  // 3s
.addTask(...build...).deps(['test'])    // 2s
.addTask(...deploy...).deps(['build'])  // 1s

Total: 10 seconds
```

### After (Optimized)

```typescript
.addTask(...setup...)                          // Phase 1: 1s

// Phase 2 (after setup)
.addTask(...lint...).deps(['setup'])
.addTask(...format-check...).deps(['setup'])   // Parallel

// Phase 3 (after lint + format)
.addTask(...compile...).deps(['lint', 'format-check'])

// Phase 4 (after compile)
.addTask(...unit-test...).deps(['compile'])
.addTask(...integration-test...).deps(['compile'])  // Parallel

// Phase 5 (after tests)
.addTask(...build...).deps(['unit-test', 'integration-test'])

// Phase 6 (after build)
.addTask(...deploy...).deps(['build'])

Total: 4 seconds (2.5x faster!)
```

---

## Visualizing the Schedule

```bash
npx crew tree --with-scheduling
```

Output:

```
Epic 1: Setup
├─ 01-init (⏳ active)
│  └─ ready in phase 1

├─ 02-config (⏹️  pending)
│  └─ blocks: 03-build

├─ 03-build (⏹️  pending)
│  └─ depends: 02-config
│  └─ parallel with: 04-lint, 05-type-check

├─ 04-lint (⏹️  pending)
│  └─ depends: 01-init

└─ 05-type-check (⏹️  pending)
   └─ depends: 01-init
```

---

## Debugging the Solver

### Check Dependency Graph

```bash
cat .crew/progress.jsonl | jq 'select(.event == "scheduler:graph")'
```

Output shows computed DAG.

### Monitor Scheduling Decisions

```bash
export CREW_DEBUG_SCHEDULING=true
npx crew run
```

Logs all scheduling decisions.

### Analyze Critical Path

```bash
npx crew analyze --critical-path
```

Shows longest dependency chain.

---

## Advanced Constraints

### Resource Constraints

```typescript
// Tasks that contend for same resource
.constrains(['docker-build-resource'])  // Mutual exclusion

// Only one task using resource at a time
.resource('docker', 1)  // Max 1 concurrent docker build
```

### Soft Ordering

```typescript
// Prefer this ordering but don't block
.preferBefore(['deploy'])  // Try to run before deploy

.preferAfter(['setup'])    // Try to run after setup
```

### Deadline Constraints

```typescript
// Must complete within timeframe
.within(Duration.seconds(300))  // 5 minute SLA

// Critical tasks get priority
.priority(100)  // High priority if approaching deadline
```

---

## Solver Configuration

### crew.json

```json
{
  "solver": {
    "maxParallel": 4,
    "priorityWeights": {
      "critical": 100,
      "high": 75,
      "normal": 50,
      "low": 25
    },
    "timeoutMs": 5000,
    "enableLogging": false
  }
}
```

---

## See Also

- [Parallel Execution](../guides/parallel-execution.md) - Using parallelism
- [Execution Flow](../core-concepts/execution-flow.md) - How execution works
- [Performance Tuning](./performance-tuning.md) - Optimize execution speed

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
