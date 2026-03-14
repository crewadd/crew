# Parallel Execution and Fan-Out/Fan-In Patterns

**Master concurrent task execution with fan-out, fan-in, and dependency-aware scheduling.**

[[docs](../README.md) > [guides](./README.md) > parallel-execution]

---

## Overview

Crew's constraint engine automatically schedules tasks in parallel when possible. This guide shows you how to:

1. **Understand automatic parallelism** - When tasks run concurrently
2. **Use fan-out/fan-in patterns** - Parallel branches that synchronize
3. **Control parallelism** - Limit concurrent tasks
4. **Monitor parallel execution** - Track multi-threaded progress
5. **Optimize for speed** - Structure epics for maximum parallelism

---

## Automatic Parallelism

Tasks without dependencies between them execute in parallel automatically.

### Sequential (Dependent)

```typescript
ctx.createEpic('build', 'Build Pipeline')
  .addTask(
    ctx.createTask('compile', 'Compile')
      .prompt('Compile TypeScript')
      .check({ cmd: 'tsc --noEmit' })
  )
  .addTask(
    ctx.createTask('test', 'Test')
      .deps(['compile'])  // Waits for compile
      .prompt('Run tests')
      .check({ cmd: 'npm test' })
  )
  .addTask(
    ctx.createTask('build', 'Build')
      .deps(['test'])  // Waits for test
      .prompt('Build for production')
      .check({ cmd: 'npm run build' })
  );
```

**Execution order:** compile → test → build (3 seconds if each takes 1 second)

### Parallel (No Dependencies)

```typescript
ctx.createEpic('parallel', 'Parallel Tasks')
  .addTask(
    ctx.createTask('lint', 'Lint')
      .prompt('Run ESLint')
      .check({ cmd: 'npm run lint' })
  )
  .addTask(
    ctx.createTask('type-check', 'Type Check')
      .prompt('Check types')
      .check({ cmd: 'tsc --noEmit' })
  )
  .addTask(
    ctx.createTask('format', 'Format')
      .prompt('Check formatting')
      .check({ cmd: 'prettier --check .' })
  );
```

**Execution:** All 3 run simultaneously (1 second if each takes 1 second)

---

## Fan-Out Pattern

Start with a setup task, then branch into independent parallel tasks.

```
     → Task B (parallel)
    /
Setup
    \
     → Task C (parallel)
     → Task D (parallel)
```

### Implementation

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Multi-Service Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Initialize')
      .addTask(
        ctx.createTask('init', 'Initialize repo')
          .prompt('Create project structure')
          .check({ cmd: 'test -d src' })
      )
      // Fan out: all depend on 'init', but not each other
      .addTask(
        ctx.createTask('api', 'Build API')
          .deps(['init'])
          .prompt('Create REST API service')
          .check({ cmd: 'test -f src/api/server.ts' })
      )
      .addTask(
        ctx.createTask('ui', 'Build UI')
          .deps(['init'])
          .prompt('Create React components')
          .check({ cmd: 'test -f src/ui/App.tsx' })
      )
      .addTask(
        ctx.createTask('db', 'Setup Database')
          .deps(['init'])
          .prompt('Create database schema')
          .check({ cmd: 'test -f src/db/schema.sql' })
      )
  );

  return plan.build();
}
```

**Execution timeline:**
```
t=0s:  init starts
t=1s:  init done
t=1s:  api, ui, db start simultaneously
t=2s:  all three complete
Total: 2 seconds vs 4 seconds if sequential
```

---

## Fan-In Pattern

Multiple parallel tasks converge to a single synchronization task.

```
Task B ─┐
        ├─→ Merge
Task C ─┤
        ├─→ Merge
Task D ─┘
```

### Implementation

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Parallel Work with Sync');

  plan.addEpic(
    ctx.createEpic('parallel', 'Parallel Development')
      // Independent work
      .addTask(
        ctx.createTask('auth', 'Auth Module')
          .prompt('Implement JWT authentication')
          .check({ cmd: 'test -f src/auth/jwt.ts' })
      )
      .addTask(
        ctx.createTask('payments', 'Payments Module')
          .prompt('Integrate payment processor')
          .check({ cmd: 'test -f src/payments/stripe.ts' })
      )
      .addTask(
        ctx.createTask('email', 'Email Service')
          .prompt('Setup email notifications')
          .check({ cmd: 'test -f src/email/sender.ts' })
      )
      // Synchronization point: depends on all three
      .addTask(
        ctx.createTask('integrate', 'Integration Tests')
          .deps(['auth', 'payments', 'email'])
          .prompt('Write integration tests')
          .check({ cmd: 'npm test' })
      )
      .addTask(
        ctx.createTask('deploy', 'Deploy')
          .deps(['integrate'])
          .prompt('Deploy to staging')
          .check({ cmd: 'curl -f https://staging.app' })
      )
  );

  return plan.build();
}
```

**Execution timeline:**
```
t=0s:  auth, payments, email start
t=1s:  all three complete
t=1s:  integrate starts (all deps met)
t=2s:  integrate done
t=2s:  deploy starts
t=3s:  deploy done
Total: 3 seconds vs 5 seconds if sequential
```

---

## Diamond Pattern

Combine fan-out and fan-in.

```
      ┌─→ B ─┐
      │      ├─→ D
  A ──┤      │
      │      ├─→ E
      └─→ C ─┘
```

### Implementation

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Diamond Pattern');

  plan.addEpic(
    ctx.createEpic('diamond', 'Diamond Workflow')
      // Initial phase
      .addTask(
        ctx.createTask('setup', 'Setup Project')
          .prompt('Initialize project structure')
          .check({ cmd: 'test -f package.json' })
      )
      // Fan out: parallel preparation
      .addTask(
        ctx.createTask('deps', 'Install Dependencies')
          .deps(['setup'])
          .prompt('Install npm dependencies')
          .check({ cmd: 'test -d node_modules' })
      )
      .addTask(
        ctx.createTask('config', 'Configure')
          .deps(['setup'])
          .prompt('Setup environment configuration')
          .check({ cmd: 'test -f .env.local' })
      )
      // Parallel work
      .addTask(
        ctx.createTask('build', 'Build')
          .deps(['deps', 'config'])
          .prompt('Build application')
          .check({ cmd: 'npm run build' })
      )
      .addTask(
        ctx.createTask('lint', 'Lint')
          .deps(['deps', 'config'])
          .prompt('Run linter')
          .check({ cmd: 'npm run lint' })
      )
      .addTask(
        ctx.createTask('type-check', 'Type Check')
          .deps(['deps', 'config'])
          .prompt('Check types')
          .check({ cmd: 'tsc --noEmit' })
      )
      // Fan in: synchronize
      .addTask(
        ctx.createTask('verify', 'Verify')
          .deps(['build', 'lint', 'type-check'])
          .prompt('Run verification suite')
          .check({ cmd: 'npm test' })
      )
  );

  return plan.build();
}
```

**Execution timeline:**
```
t=0s:  setup starts
t=1s:  setup done
t=1s:  deps, config start
t=2s:  deps, config done
t=2s:  build, lint, type-check start
t=3s:  build, lint, type-check done
t=3s:  verify starts
t=4s:  verify done
Total: 4 seconds
```

---

## Controlling Parallelism

### Limit Concurrent Tasks

```typescript
ctx.createEpic('limited-parallel', 'Limited Concurrency')
  .maxParallel(2)  // Only 2 tasks run simultaneously
  .addTask(
    ctx.createTask('task1', 'Task 1').prompt('...')
  )
  .addTask(
    ctx.createTask('task2', 'Task 2').prompt('...')
  )
  .addTask(
    ctx.createTask('task3', 'Task 3').prompt('...')
  )
  .addTask(
    ctx.createTask('task4', 'Task 4').prompt('...')
  )
  .addTask(
    ctx.createTask('task5', 'Task 5').prompt('...')
  );
```

**Execution:**
```
t=0s:  task1, task2 start (max 2)
t=1s:  task1, task2 done
t=1s:  task3, task4 start
t=2s:  task3, task4 done
t=2s:  task5 starts
t=3s:  task5 done
```

### Task Priority

```typescript
ctx.createTask('critical', 'Critical Task')
  .priority(100)  // Higher priority runs first
  .prompt('...')

ctx.createTask('normal', 'Normal Task')
  .priority(50)   // Default priority
  .prompt('...')

ctx.createTask('low', 'Low Priority')
  .priority(10)   // Lower priority runs later
  .prompt('...')
```

---

## Monitoring Parallel Execution

### View Progress

```bash
npx crew status
```

Output shows concurrent tasks:

```
Project: Multi-Service

Epic 1: Setup (active)
  ✓ m1.1 Initialize repo (done)
  ⏳ m1.2 Build API (active)
  ⏳ m1.3 Build UI (active)
  ⏳ m1.4 Setup Database (active)
```

### Follow Logs in Real-Time

```bash
tail -f .crew/progress.jsonl | jq '.'
```

Watch events as they happen:

```json
{"timestamp": "...", "event": "task:start", "taskId": "m1.2"}
{"timestamp": "...", "event": "task:start", "taskId": "m1.3"}
{"timestamp": "...", "event": "task:start", "taskId": "m1.4"}
{"timestamp": "...", "event": "task:done", "taskId": "m1.2"}
{"timestamp": "...", "event": "task:done", "taskId": "m1.3"}
{"timestamp": "...", "event": "task:done", "taskId": "m1.4"}
```

### Visualize Dependencies

```bash
npx crew tree --with-deps
```

Output:

```
My App
└── 01-setup
    ├── 01-init
    │   └── depends: none
    ├── 02-api
    │   └── depends: 01-init
    ├── 03-ui
    │   └── depends: 01-init
    ├── 04-db
    │   └── depends: 01-init
    └── 05-integrate
        └── depends: 02-api, 03-ui, 04-db
```

---

## Real-World Example: Monorepo Setup

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Monorepo Setup');

  plan.addEpic(
    ctx.createEpic('monorepo', 'Initialize Monorepo')
      // Initialize
      .addTask(
        ctx.createTask('root-setup', 'Setup Root')
          .prompt('Create root package.json and configuration')
          .check({ cmd: 'test -f package.json' })
      )
      // Fan out: parallel package setup
      .addTask(
        ctx.createTask('api-init', 'Setup API Package')
          .deps(['root-setup'])
          .prompt('Create API package with Express')
          .check({ cmd: 'test -f packages/api/package.json' })
      )
      .addTask(
        ctx.createTask('ui-init', 'Setup UI Package')
          .deps(['root-setup'])
          .prompt('Create UI package with React')
          .check({ cmd: 'test -f packages/ui/package.json' })
      )
      .addTask(
        ctx.createTask('lib-init', 'Setup Shared Library')
          .deps(['root-setup'])
          .prompt('Create shared library package')
          .check({ cmd: 'test -f packages/lib/package.json' })
      )
      // Parallel builds (all depend on their init)
      .addTask(
        ctx.createTask('api-build', 'Build API')
          .deps(['api-init'])
          .prompt('Build API package')
          .check({ cmd: 'npm run build --workspace=packages/api' })
      )
      .addTask(
        ctx.createTask('ui-build', 'Build UI')
          .deps(['ui-init'])
          .prompt('Build UI package')
          .check({ cmd: 'npm run build --workspace=packages/ui' })
      )
      .addTask(
        ctx.createTask('lib-build', 'Build Library')
          .deps(['lib-init'])
          .prompt('Build shared library')
          .check({ cmd: 'npm run build --workspace=packages/lib' })
      )
      // Fan in: verify all packages
      .addTask(
        ctx.createTask('verify', 'Verify All Packages')
          .deps(['api-build', 'ui-build', 'lib-build'])
          .prompt('Run tests and type checks')
          .check({ cmd: 'npm test' })
      )
  );

  return plan.build();
}
```

**Performance:**
- Sequential: ~12 seconds (root-setup + 3 inits + 3 builds + verify)
- Parallel: ~5 seconds (root-setup + parallel 3 inits + parallel 3 builds + verify)

---

## Best Practices

### 1. Identify Independent Work

```typescript
// Good: These don't depend on each other
.addTask(ctx.createTask('lint', 'Lint').prompt('...'))
.addTask(ctx.createTask('type-check', 'Type Check').prompt('...'))
.addTask(ctx.createTask('format', 'Format').prompt('...'))

// Bad: Artificially sequential
.addTask(ctx.createTask('a', 'A').prompt('...'))
.addTask(ctx.createTask('b', 'B').deps(['a']).prompt('...'))
.addTask(ctx.createTask('c', 'C').deps(['b']).prompt('...'))
```

### 2. Balance Work Load

```typescript
// Unbalanced: Task 1 takes 5s, tasks 2-4 take 1s each
.addTask(ctx.createTask('heavy', 'Heavy').prompt('... 5 seconds'))
.addTask(ctx.createTask('light1', 'Light 1').deps(['heavy']).prompt('...'))

// Better: All tasks take ~2-3s
.addTask(ctx.createTask('a', 'A').prompt('...'))
.addTask(ctx.createTask('b', 'B').prompt('...'))
.addTask(ctx.createTask('c', 'C').prompt('...'))
.addTask(ctx.createTask('sync', 'Sync').deps(['a', 'b', 'c']).prompt('...'))
```

### 3. Place Bottlenecks Strategically

```typescript
// Bottleneck early (parallel work waits for shared resource)
.addTask(
  ctx.createTask('provision', 'Provision Infrastructure')
    .prompt('Set up database')
)
.addTask(
  ctx.createTask('seed', 'Seed Database')
    .deps(['provision'])
    .prompt('...')
)
.addTask(
  ctx.createTask('api', 'Build API')
    .deps(['seed'])
    .prompt('...')
)

// Don't add unnecessary dependencies
.addTask(
  ctx.createTask('ui', 'Build UI')
    .prompt('...')
    // No dependency on api/seed if not needed
)
```

### 4. Use Descriptive Task Names

```typescript
// Clear task relationships
.addTask(ctx.createTask('test-unit', 'Unit Tests').prompt('...'))
.addTask(ctx.createTask('test-e2e', 'E2E Tests').prompt('...'))
.addTask(ctx.createTask('test-integration', 'Integration Tests')
  .deps(['test-unit', 'test-e2e'])
  .prompt('...')
)
```

---

## Troubleshooting Parallelism

### Tasks Running Sequentially When Expected Parallel

Check dependencies:

```bash
cat .crew/epics/01-*/tasks/*/task.yaml | grep "deps:"
```

If deps are present but shouldn't be, remove them:

```bash
# Edit the task definition
nano .crew/epics/01-setup/tasks/02-ui/task.yaml

# Remove the deps line
```

### Uneven Load Distribution

Check task durations:

```bash
cat .crew/progress.jsonl | jq 'select(.event == "task:start") | {taskId, timestamp}'
cat .crew/progress.jsonl | jq 'select(.event == "task:done") | {taskId, timestamp}'
```

Calculate durations and rebalance tasks.

### Resource Contention

If parallel tasks conflict (e.g., disk space, network), limit parallelism:

```typescript
.maxParallel(1)  // Sequential if resource conflicts
```

---

## See Also

- [Projects, Epics & Tasks](../core-concepts/projects-epics-tasks.md) - Hierarchy and execution model
- [Execution Flow](../core-concepts/execution-flow.md) - How orchestrator schedules tasks
- [Conditional Tasks](./conditional-tasks.md) - Dynamic task inclusion
- [Performance Tuning](../advanced/performance-tuning.md) - Optimization strategies

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
