# Constraint Engine

**Automatic dependency resolution, scheduling, and parallelization.**

[[docs](../README.md) > [core-concepts](./README.md) > constraint-engine]

---

## Overview

The Constraint Engine is Crew's scheduling system. It analyzes task dependencies, conditionals, and parallelism constraints to determine the optimal execution order.

**Key capabilities:**
- Dependency resolution (`.deps()`)
- Circular dependency detection
- Parallel batch scheduling
- Conditional execution (`.when()`, `.unless()`)
- Priority-based scheduling
- Deadlock detection

---

## How It Works

### 1. Build Dependency Graph

The engine builds a directed acyclic graph (DAG) from task dependencies:

```typescript
// Plan definition
ctx.createTask('build', 'Build').deps(['install'])
ctx.createTask('test', 'Test').deps(['build'])
ctx.createTask('deploy', 'Deploy').deps(['test'])
```

**Dependency Graph:**
```
install → build → test → deploy
```

### 2. Topological Sort

Tasks are sorted to respect dependencies:

```
Execution order: install, build, test, deploy
```

### 3. Batch Resolution

Find all tasks that can run in parallel:

```
Batch 1: [install]           # No dependencies
Batch 2: [build]             # Waits for install
Batch 3: [test]              # Waits for build
Batch 4: [deploy]            # Waits for test
```

### 4. Parallel Execution

Execute each batch concurrently:

```
Execute batch 1 → Wait → Execute batch 2 → Wait → ...
```

---

## Task Dependencies

### Basic Dependencies

Use `.deps()` to specify dependencies:

```typescript
plan.addEpic(
  ctx.createEpic('build', 'Build Pipeline')
    .addTask(
      ctx.createTask('install', 'Install dependencies')
        .prompt('Run npm install')
    )
    .addTask(
      ctx.createTask('compile', 'Compile TypeScript')
        .prompt('Run tsc')
        .deps(['install'])  // Waits for 'install'
    )
    .addTask(
      ctx.createTask('test', 'Run tests')
        .prompt('Run npm test')
        .deps(['compile'])  // Waits for 'compile'
    )
);
```

**Execution order:**
```
install → compile → test
```

### Multiple Dependencies

Tasks can depend on multiple other tasks:

```typescript
.addTask(
  ctx.createTask('install-frontend', 'Install frontend')
)
.addTask(
  ctx.createTask('install-backend', 'Install backend')
)
.addTask(
  ctx.createTask('integration-test', 'Integration tests')
    .deps(['install-frontend', 'install-backend'])
)
```

**Execution:**
```
install-frontend ─┐
                  ├─→ integration-test
install-backend ──┘
```

Both `install-frontend` and `install-backend` run in parallel, then `integration-test` runs.

---

## Parallel Execution

### Fan-Out Pattern

Multiple tasks with the same dependency:

```typescript
.addTask(ctx.createTask('setup', 'Setup'))
.addTask(ctx.createTask('feature-a', 'Feature A').deps(['setup']))
.addTask(ctx.createTask('feature-b', 'Feature B').deps(['setup']))
.addTask(ctx.createTask('feature-c', 'Feature C').deps(['setup']))
```

**Execution:**
```
        setup
       /  |  \
      /   |   \
 feat-a feat-b feat-c  (parallel)
```

### Fan-In Pattern

Multiple tasks converging to one:

```typescript
.addTask(ctx.createTask('build-frontend', 'Build frontend'))
.addTask(ctx.createTask('build-backend', 'Build backend'))
.addTask(ctx.createTask('build-docs', 'Build docs'))
.addTask(
  ctx.createTask('deploy', 'Deploy all')
    .deps(['build-frontend', 'build-backend', 'build-docs'])
)
```

**Execution:**
```
build-frontend ─┐
build-backend ──┼─→ deploy
build-docs ─────┘
```

### Diamond Pattern

Combination of fan-out and fan-in:

```typescript
.addTask(ctx.createTask('init', 'Initialize'))
.addTask(ctx.createTask('build-a', 'Build A').deps(['init']))
.addTask(ctx.createTask('build-b', 'Build B').deps(['init']))
.addTask(
  ctx.createTask('test', 'Test')
    .deps(['build-a', 'build-b'])
)
```

**Execution:**
```
       init
      /    \
  build-a  build-b  (parallel)
      \    /
       test
```

---

## Conditional Execution

### Using .when()

Execute task only if condition is true:

```typescript
.addTask(
  ctx.createTask('deploy-prod', 'Deploy to production')
    .prompt('Deploy to production server')
    .when(() => process.env.NODE_ENV === 'production')
)
```

Task is skipped if `NODE_ENV !== 'production'`.

### Using .unless()

Execute task unless condition is true:

```typescript
.addTask(
  ctx.createTask('skip-tests', 'Skip tests')
    .prompt('Run without tests')
    .unless(() => process.env.CI === 'true')
)
```

Task is skipped if `CI === 'true'`.

### Conditional with Dependencies

```typescript
.addTask(ctx.createTask('build', 'Build'))
.addTask(
  ctx.createTask('deploy-staging', 'Deploy to staging')
    .deps(['build'])
    .when(() => process.env.DEPLOY_STAGING === 'true')
)
.addTask(
  ctx.createTask('deploy-prod', 'Deploy to production')
    .deps(['build'])
    .when(() => process.env.DEPLOY_PROD === 'true')
)
```

**Execution (DEPLOY_STAGING=true, DEPLOY_PROD=false):**
```
build → deploy-staging
(deploy-prod skipped)
```

---

## Constraint Validation

### Circular Dependency Detection

The engine detects circular dependencies:

```typescript
// ❌ Invalid: Circular dependency
.addTask(ctx.createTask('a', 'A').deps(['b']))
.addTask(ctx.createTask('b', 'B').deps(['c']))
.addTask(ctx.createTask('c', 'C').deps(['a']))
```

**Error:**
```
Error: Circular dependency detected: a → b → c → a
```

### Missing Dependency Detection

```typescript
// ❌ Invalid: 'unknown-task' doesn't exist
.addTask(
  ctx.createTask('deploy', 'Deploy')
    .deps(['unknown-task'])
)
```

**Error:**
```
Error: Task 'deploy' depends on 'unknown-task' which does not exist
```

---

## Scheduling Algorithm

### Step 1: Build Graph

```typescript
interface Node {
  id: string;
  deps: string[];
  status: 'pending' | 'active' | 'done';
}

const graph = tasks.map(t => ({
  id: t.id,
  deps: t.deps || [],
  status: 'pending'
}));
```

### Step 2: Find Ready Tasks

```typescript
function findReadyTasks(graph: Node[]): Node[] {
  return graph.filter(node =>
    node.status === 'pending' &&
    node.deps.every(dep =>
      graph.find(n => n.id === dep)?.status === 'done'
    )
  );
}
```

### Step 3: Execute Batch

```typescript
while (hasPendingTasks(graph)) {
  const batch = findReadyTasks(graph);

  // Execute all tasks in batch concurrently
  await Promise.all(batch.map(task => executeTask(task)));

  // Mark as done
  batch.forEach(task => task.status = 'done');
}
```

### Example Execution

**Plan:**
```typescript
A.deps([])
B.deps(['A'])
C.deps(['A'])
D.deps(['B', 'C'])
```

**Execution batches:**
```
Batch 1: [A]        # No dependencies
Batch 2: [B, C]     # Both depend on A (parallel)
Batch 3: [D]        # Depends on B and C (fan-in)
```

---

## Advanced Patterns

### Sequential Groups

Force sequential execution within a group:

```typescript
const epic = ctx.createEpic('features', 'Features');

// Tasks execute sequentially (via dependencies)
epic.addTask(ctx.createTask('step1', 'Step 1'));
epic.addTask(ctx.createTask('step2', 'Step 2').deps(['step1']));
epic.addTask(ctx.createTask('step3', 'Step 3').deps(['step2']));
```

### Parallel Groups

Tasks with no dependencies execute in parallel:

```typescript
const epic = ctx.createEpic('features', 'Features');

// All run in parallel (no dependencies)
epic.addTask(ctx.createTask('feature-a', 'Feature A'));
epic.addTask(ctx.createTask('feature-b', 'Feature B'));
epic.addTask(ctx.createTask('feature-c', 'Feature C'));
```

### Mixed Sequential + Parallel

```typescript
// Sequential setup
epic.addTask(ctx.createTask('setup', 'Setup'));

// Parallel features (all depend on setup)
epic.addTask(ctx.createTask('feat-a', 'Feature A').deps(['setup']));
epic.addTask(ctx.createTask('feat-b', 'Feature B').deps(['setup']));

// Sequential verification (depends on all features)
epic.addTask(
  ctx.createTask('verify', 'Verify')
    .deps(['feat-a', 'feat-b'])
);
```

**Execution:**
```
setup → (feat-a, feat-b) → verify
```

---

## Performance Optimization

### Maximize Parallelism

**Bad (sequential):**
```typescript
.addTask(ctx.createTask('a', 'A'))
.addTask(ctx.createTask('b', 'B').deps(['a']))
.addTask(ctx.createTask('c', 'C').deps(['b']))
```

**Good (parallel):**
```typescript
.addTask(ctx.createTask('a', 'A'))
.addTask(ctx.createTask('b', 'B'))  // No dependency!
.addTask(ctx.createTask('c', 'C'))  // No dependency!
```

### Minimize Critical Path

**Critical path**: Longest sequential chain

**Bad (long critical path):**
```
A → B → C → D → E  (5 sequential steps)
```

**Good (shorter critical path):**
```
    A → D → E
   /
  B
   \
    C

Critical path: A → D → E (3 steps)
B and C run in parallel with A
```

---

## Debugging Dependencies

### Visualize Dependency Graph

```bash
# View plan structure
npx crew tree
```

Output shows dependencies:
```
Project: My App
├─ 01: Setup
│  ├─ m1.1: init
│  └─ m1.2: install (deps: m1.1)
├─ 02: Build
│  ├─ m2.1: compile (deps: m1.2)
│  └─ m2.2: test (deps: m2.1)
```

### Check Execution Order

View actual execution in logs:

```bash
cat .crew/logs/latest.log | grep "task:start"
```

---

## Common Patterns

### Pipeline Pattern

Linear sequence of transformations:

```typescript
.addTask(ctx.createTask('fetch', 'Fetch data'))
.addTask(ctx.createTask('transform', 'Transform').deps(['fetch']))
.addTask(ctx.createTask('load', 'Load').deps(['transform']))
```

### Monorepo Pattern

Independent packages in parallel:

```typescript
.addTask(ctx.createTask('build-pkg-a', 'Build Package A'))
.addTask(ctx.createTask('build-pkg-b', 'Build Package B'))
.addTask(ctx.createTask('build-pkg-c', 'Build Package C'))
.addTask(
  ctx.createTask('publish', 'Publish all')
    .deps(['build-pkg-a', 'build-pkg-b', 'build-pkg-c'])
)
```

### Multi-Stage Pipeline

Build → Test → Deploy with gates:

```typescript
// Stage 1: Build
.addTask(ctx.createTask('build', 'Build'))

// Stage 2: Test (parallel)
.addTask(ctx.createTask('unit-tests', 'Unit tests').deps(['build']))
.addTask(ctx.createTask('integration-tests', 'Integration').deps(['build']))

// Stage 3: Deploy (waits for all tests)
.addTask(
  ctx.createTask('deploy', 'Deploy')
    .deps(['unit-tests', 'integration-tests'])
)
```

---

## Best Practices

### ✅ Do

- Make dependencies explicit
- Maximize parallelism where safe
- Use descriptive task IDs
- Validate graph before execution
- Consider critical path length

### ❌ Don't

- Create circular dependencies
- Add unnecessary dependencies (reduces parallelism)
- Depend on tasks in different epics (not supported)
- Use external state for conditionals (not resumable)

---

## Next Steps

- **Understand execution**: [Execution Flow](./execution-flow.md)
- **Learn task API**: [Projects, Epics & Tasks](./projects-epics-tasks.md)
- **See parallel patterns**: [Parallel Execution Guide](../guides/parallel-execution.md)

---

## See Also

- [Execution Flow](./execution-flow.md) - How tasks execute
- [Projects, Epics & Tasks](./projects-epics-tasks.md) - Task definition
- [Parallel Execution](../guides/parallel-execution.md) - Parallelism patterns

---

[← Back to Core Concepts](./README.md) | [Documentation Home](../README.md)
