# Projects, Epics & Tasks

**Understanding Crew's three-level hierarchy for organizing work.**

[[docs](../README.md) > [core-concepts](./README.md) > projects-epics-tasks]

---

## Overview

Crew organizes all work into a three-level hierarchy:

```
Project (the entire goal)
├── Epic 1 (major phase)
│   ├── Task 1.1 (concrete work unit)
│   ├── Task 1.2
│   └── Task 1.3
├── Epic 2
│   ├── Task 2.1
│   └── Task 2.2
└── Epic 3
    └── Task 3.1
```

This structure solves a critical problem in AI-assisted development: **context management**. Rather than asking an agent to maintain context across a 50-file project, Crew scopes each task to a specific epic, keeping the agent focused.

---

## The Three Levels

### Projects

A **project** is the top-level container — the entire goal you're trying to achieve.

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Build TypeScript Library');

  // Add epics to the plan...

  return plan.build();
}
```

**Project responsibilities:**
- Hold all epics
- Provide global context (project name, description, settings)
- Track overall completion
- Define project-level constraints and dependencies

### Epics

An **epic** is a major phase of work — a collection of related tasks that accomplish a specific goal.

```typescript
plan.addEpic(
  ctx.createEpic('setup', 'Project Setup')
    .addTask(/* task 1 */)
    .addTask(/* task 2 */)
    .addTask(/* task 3 */)
);

plan.addEpic(
  ctx.createEpic('features', 'Core Features')
    .addTask(/* task 4 */)
    .addTask(/* task 5 */)
);
```

**Epic responsibilities:**
- Group related tasks
- Provide scope for agent context (agent executes one epic at a time)
- Control execution order (sequential or parallel)
- Define epic-level dependencies

**Good epic names:**
- "Project Setup" — initialization, scaffolding
- "Core Features" — main implementation
- "Testing & Verification" — test suite, validation
- "Documentation" — README, API docs
- "Performance" — optimization, profiling

### Tasks

A **task** is a concrete unit of work — something an agent can execute in one session.

```typescript
ctx.createTask('install', 'Install dependencies')
  .prompt('Run pnpm install and verify all dependencies resolve')
  .check({ cmd: 'test -d node_modules' })
```

**Task responsibilities:**
- Execute a single, focused piece of work
- Produce measurable outputs
- Submit to quality checks
- Report success or failure

**Good task names:**
- "Initialize project" — scaffolding
- "Install dependencies" — package management
- "Implement auth module" — feature development
- "Write unit tests" — validation
- "Build and optimize" — deployment

---

## Naming Conventions

### Epic IDs & Titles

Epic IDs are auto-generated numbers (01, 02, 03...). Provide human-readable titles:

```typescript
ctx.createEpic('setup', 'Project Setup')           // ID=01, slug=setup
ctx.createEpic('features', 'Core Features')        // ID=02, slug=features
ctx.createEpic('testing', 'Testing & Verification') // ID=03, slug=testing
```

Epic slugs (`'setup'`) are used in file paths:
```
.crew/epics/
├── 01-setup/
├── 02-features/
└── 03-testing/
```

### Task IDs & Titles

Task IDs must be unique within an epic. They appear in the task's unique identifier (e.g., `m1.3` = "Epic 1, Task 3"):

```typescript
ctx.createEpic('setup', 'Project Setup')
  .addTask(ctx.createTask('init', 'Initialize project'))      // m1.1
  .addTask(ctx.createTask('deps', 'Install dependencies'))    // m1.2
  .addTask(ctx.createTask('config', 'Setup configuration'))   // m1.3
```

Task slugs are used in file paths:
```
.crew/epics/01-setup/tasks/
├── 01-init/
├── 02-deps/
└── 03-config/
```

---

## Creating the Hierarchy

### Basic Structure

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Foundation')
      .addTask(
        ctx.createTask('init', 'Initialize repo')
          .prompt('Scaffold TypeScript project')
          .check({ cmd: 'test -f package.json' })
      )
      .addTask(
        ctx.createTask('deps', 'Install dependencies')
          .deps(['init'])  // Waits for init task
          .prompt('Install all deps')
          .check({ cmd: 'test -d node_modules' })
      )
  );

  return plan.build();
}
```

### With Multiple Epics

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Full TypeScript Library');

  // Epic 1: Setup
  plan.addEpic(
    ctx.createEpic('setup', 'Project Setup')
      .addTask(ctx.createTask('init', 'Initialize').prompt('...'))
      .addTask(ctx.createTask('deps', 'Install deps').deps(['init']).prompt('...'))
  );

  // Epic 2: Implementation
  plan.addEpic(
    ctx.createEpic('features', 'Core Features')
      .addTask(ctx.createTask('api', 'Build API').prompt('...'))
      .addTask(ctx.createTask('ui', 'Build UI').prompt('...'))
  );

  // Epic 3: Testing
  plan.addEpic(
    ctx.createEpic('testing', 'Testing & Verification')
      .addTask(ctx.createTask('unit', 'Unit tests').deps(['features']).prompt('...'))
      .addTask(ctx.createTask('e2e', 'E2E tests').deps(['unit']).prompt('...'))
  );

  return plan.build();
}
```

---

## Task Definition API

Every task uses the same declarative builder API:

```typescript
ctx.createTask(id, title)
  // Identity
  .ofType('coding')                              // Task type

  // Instructions
  .prompt('Do this specific thing')              // Agent instructions
  .skill('python/ml')                            // Named skill/agent

  // Scope
  .inputs(['src/'])                              // Files agent reads
  .outputs(['dist/'])                            // Files agent produces

  // Constraints
  .deps(['other-task'])                          // Dependencies
  .when(/* condition */)                         // Conditional execution

  // Verification
  .check({ cmd: 'npm test' })                    // Quality gates
  .check({ prompt: 'Verify auth handles...' })
  .attempts(5)                                   // Max retry attempts
```

### Common Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `.prompt(text)` | Instructions for agent | `.prompt('Create REST API')` |
| `.skill(name)` | Named skill/agent to use | `.skill('backend/rest-api')` |
| `.inputs(paths)` | Files agent reads | `.inputs(['config.json', 'schema/'])` |
| `.outputs(paths)` | Expected outputs | `.outputs(['dist/', 'build/'])` |
| `.deps(ids)` | Task dependencies | `.deps(['init', 'setup'])` |
| `.check(...)` | Quality gate | `.check({ cmd: 'npm test' })` |
| `.attempts(n)` | Max retry attempts | `.attempts(5)` |
| `.when(fn)` | Conditional execution | `.when(() => IS_PRODUCTION)` |
| `.ofType(name)` | Task type tag | `.ofType('coding')` |

---

## Execution Model

### Sequential vs Parallel

By default, **tasks within an epic execute sequentially** unless they have no dependencies between them:

```typescript
// Sequential: Task 2 waits for Task 1
ctx.createEpic('build', 'Build Process')
  .addTask(ctx.createTask('compile', 'Compile').prompt('...'))
  .addTask(ctx.createTask('test', 'Test').deps(['compile']).prompt('...'))
```

**Parallel execution** happens automatically when there are no dependencies:

```typescript
// Parallel: Both run simultaneously (no deps between them)
ctx.createEpic('parallel', 'Parallel Work')
  .addTask(ctx.createTask('api', 'Build API').prompt('...'))
  .addTask(ctx.createTask('ui', 'Build UI').prompt('...'))
  .addTask(ctx.createTask('docs', 'Write docs').prompt('...'))
```

### Epic Ordering

By default, **epics execute sequentially** (Epic 1 → Epic 2 → Epic 3). Later epics can depend on earlier ones:

```typescript
// Epic 3 waits for Epic 1 to complete
ctx.createEpic('test', 'Testing')
  .addTask(ctx.createTask('unit', 'Unit tests').prompt('...'))
```

---

## Context Scoping

The **epic** boundary is where agent context is scoped. This is critical for multi-file projects:

```
Without Crew:
  Agent tries to maintain context across entire project
  → Context window fills up after ~3 files
  → Agent makes mistakes on later files
  → Quality gates fail

With Crew:
  Epic 1: Agent only sees files needed for Feature A
  Epic 2: Agent only sees files needed for Feature B
  → Each agent stays focused
  → Higher quality work per task
```

---

## Data Model

On disk, the hierarchy maps directly to the filesystem:

```
.crew/
├── project.yaml          # Project metadata
└── epics/
    ├── 01-setup/
    │   ├── epic.yaml     # Epic metadata
    │   └── tasks/
    │       ├── 01-init/
    │       │   └── task.yaml
    │       └── 02-deps/
    │           └── task.yaml
    ├── 02-features/
    │   ├── epic.yaml
    │   └── tasks/
    │       ├── 01-api/
    │       │   └── task.yaml
    │       └── 02-ui/
    │           └── task.yaml
    └── 03-testing/
        ├── epic.yaml
        └── tasks/
            └── 01-unit/
                └── task.yaml
```

Each task.yaml contains the complete task definition:

```yaml
title: Install dependencies
type: setup
prompt: |
  Run npm install and verify all dependencies.
  Check for any peer dependency warnings.
checks:
  - cmd: test -d node_modules
  - cmd: npm list
maxAttempts: 3
```

---

## Best Practices

### Epic Design

1. **Keep epics focused** — One major goal per epic
   - Good: "Project Setup" (single, cohesive goal)
   - Bad: "Everything" (too broad)

2. **Size for agent context** — 3-5 tasks per epic
   - Allows agent to maintain context
   - Makes execution tractable
   - Enables effective quality gates

3. **Order epics logically** — Dependencies flow downward
   - Foundation epics first (setup, scaffolding)
   - Feature epics in middle (implementation)
   - Verification epics last (testing, build)

### Task Design

1. **One responsibility per task** — Single, clear goal
   - Good: "Install dependencies"
   - Bad: "Setup and install dependencies"

2. **Include quality gates** — Every task should have checks
   - Without checks: "Did it work?"
   - With checks: Automatically verified

3. **Use descriptive prompts** — Agent needs clear instructions
   - Good: "Create REST API with /users and /posts endpoints"
   - Vague: "Build API"

### Naming

1. **Use kebab-case for IDs** — Converts to URL-safe paths
   - Good: `'user-auth'`, `'api-routes'`
   - Bad: `'UserAuth'`, `'user auth'`

2. **Use Title Case for titles** — Human-readable
   - Good: `'User Authentication'`, `'API Routes'`
   - Bad: `'user-auth'`, `'user authentication'`

3. **Keep titles short** — ≤5 words
   - Good: `'Create REST API'`
   - Bad: `'Create REST API with all user management endpoints'`

---

## Common Patterns

### Linear Workflow

```typescript
// Tasks execute in order: A → B → C → D
ctx.createEpic('workflow', 'Linear Flow')
  .addTask(ctx.createTask('a', 'Step A').prompt('...'))
  .addTask(ctx.createTask('b', 'Step B').deps(['a']).prompt('...'))
  .addTask(ctx.createTask('c', 'Step C').deps(['b']).prompt('...'))
  .addTask(ctx.createTask('d', 'Step D').deps(['c']).prompt('...'))
```

### Fan-Out / Fan-In

```typescript
// A → [B, C, D] → E
ctx.createEpic('parallel', 'Parallel with Sync')
  .addTask(ctx.createTask('setup', 'Setup').prompt('...'))
  .addTask(ctx.createTask('api', 'Build API').deps(['setup']).prompt('...'))
  .addTask(ctx.createTask('ui', 'Build UI').deps(['setup']).prompt('...'))
  .addTask(ctx.createTask('docs', 'Write docs').deps(['setup']).prompt('...'))
  .addTask(ctx.createTask('merge', 'Merge & verify').deps(['api', 'ui', 'docs']).prompt('...'))
```

### Multi-Stage Pipeline

```typescript
// Define multiple epics in sequence
plan.addEpic(ctx.createEpic('stage1', 'Stage 1')...);
plan.addEpic(ctx.createEpic('stage2', 'Stage 2')...);
plan.addEpic(ctx.createEpic('stage3', 'Stage 3')...);
// Crew executes them in order
```

---

## See Also

- [Execution Flow](./execution-flow.md) — How the orchestrator executes this hierarchy
- [Filesystem Store](./filesystem-store.md) — How projects/epics/tasks are persisted
- [Checks & Quality Gates](./checks-and-quality-gates.md) — Adding quality gates to tasks
- [Task API](../task-api/README.md) — Complete API reference for task definition
