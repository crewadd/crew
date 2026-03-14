# Planning Playbook

This playbook covers creating, modifying, and reviewing project plans using crew's programmable planning API.

## Table of Contents

- [Planning Workflow](#planning-workflow)
- [Creating a New Plan](#creating-a-new-plan)
- [Choosing an Approach](#choosing-an-approach)
- [Fluent Builder API](#fluent-builder-api)
- [Declarative Format](#declarative-format)
- [Task Relationships](#task-relationships)
- [Checks and Review Gates](#checks-and-review-gates)
- [Plan Lifecycle](#plan-lifecycle)
- [Modifying an Existing Plan](#modifying-an-existing-plan)
- [Reviewing a Plan](#reviewing-a-plan)
- [Common Patterns](#common-patterns)

---

## Planning Workflow

```
Understand goal → Choose approach → Define epics → Wire tasks → Add checks → Verify coherence
```

1. **Understand the goal** — What's being built? What are the deliverables? Are there existing goals in `.crew/goals/` that this plan should align with?

2. **Survey existing state** — Run `crew status` and `crew tree`. Is there already a plan? Are we extending it or starting fresh?

3. **Choose approach** — Fluent builder for conditional/dynamic plans, declarative for simple static ones.

4. **Define epic structure** — Group related work into epics. Epics are sequential milestones. A plan typically has 3-7 epics.

5. **Wire task dependencies** — Within each epic, define task order and relationships. Use `deps` for hard dependencies, `sequential`/`parallel` for execution order.

6. **Add verification** — Attach checks to tasks that produce artifacts. Use review gates for tasks that need human or agent approval.

7. **Verify coherence** — The `plan-coherence` check catches orphaned dependencies, tasks without prompts, and circular references.

## Creating a New Plan

### Setup Location

Plans are defined in one of two locations:

```
.crew/setup/plan/index.js    # Primary (recommended)
.crew/setup/index.js          # Legacy (onInitPlan callback)
```

The plan file exports a `createPlan(ctx)` function that receives a `CrewConfigContext`:

```javascript
// .crew/setup/plan/index.js
export async function createPlan(ctx) {
  return ctx.createPlan('My Project')
    .addEpic(/* ... */)
    .build();
}
```

### Initialize

```bash
crew init --name "My Project"   # Creates crew.json + .crew/ directory
crew plan init                   # Runs createPlan() and writes to .crew/epics/
```

## Choosing an Approach

### Fluent Builder — Use When:

- Plan needs conditional logic (`if` / `when` guards)
- Tasks are generated dynamically (e.g., one per page, per component)
- You need lifecycle hooks (`onStart`, `onComplete`, `onFail`)
- Complex dependency graphs with fan-out/fan-in
- Template interpolation with variables

### Declarative — Use When:

- Plan is static and known upfront
- Simple linear or lightly branched workflow
- Quick prototyping — faster to write and read
- No conditional logic needed

## Fluent Builder API

The builder has three levels: **PlanBuilder** → **EpicBuilder** → **TaskBuilder**.

### Full Example

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('E-Commerce Site');

  plan.vars({
    framework: 'nextjs',
    hasAuth: true,
    pageCount: 5,
  });

  // Epic 1: Foundation
  const foundation = ctx.createEpic('foundation', 'Foundation')
    .basePath('./epics/0-foundation');

  foundation.addTask(
    ctx.createTask('init-repo', 'Initialize Repository')
      .type('coding')
      .skill('repo/init')
      .outputs(['package.json', 'tsconfig.json'])
      .prompt('Initialize a Next.js project with TypeScript')
      .check('build')
  );

  foundation.addTask(
    ctx.createTask('install-deps', 'Install Dependencies')
      .type('coding')
      .skill('repo/install')
      .deps(['init-repo'])
      .inputs(['package.json'])
      .outputs(['node_modules/'])
      .prompt('Install all project dependencies')
      .check('tsc')
  );

  plan.addEpic(foundation);

  // Epic 2: Features (conditional)
  const features = ctx.createEpic('features', 'Core Features');

  if (plan.vars().hasAuth) {
    features.addTask(
      ctx.createTask('auth', 'Authentication')
        .type('coding')
        .deps(['install-deps'])
        .inputs(['package.json'])
        .outputs(['src/lib/auth.ts', 'src/app/login/page.tsx'])
        .prompt('Implement JWT authentication with login/register pages')
        .check('tsc')
        .check('build')
        .review('human', { prompt: 'Review auth implementation for security' })
    );
  }

  plan.addEpic(features);

  return plan.build();
}
```

### TaskBuilder Methods

```typescript
ctx.createTask('id', 'title')
  // Classification
  .type('coding')                          // Task type (coding, verify, planning, custom)
  .tag('critical')                         // Metadata tag
  .skill('repo/install')                   // Agent skill to use
  .priority(5)                             // Execution priority (higher = first)

  // I/O
  .inputs(['src/config.ts'])               // Files this task reads
  .outputs(['dist/'])                      // Files this task creates/modifies
  .vars({ key: 'value' })                 // Task-scoped variables

  // Instructions
  .prompt('Do the thing')                  // Inline prompt
  .promptFrom('./prompts/task.md', vars)   // Template file with variable interpolation
  .execute(`console.log('inline code')`)   // Inline executor code
  .executeFrom('./executors/task.js', vars) // External executor file

  // Dependencies
  .deps(['other-task'])                    // Wait for these tasks to finish
  .blocks(['downstream-task'])             // This task blocks others
  .blockedBy(['upstream-task'])            // Blocked by these tasks
  .sequential()                            // Run tasks in this epic sequentially
  .parallel()                              // Run tasks in this epic in parallel

  // Verification
  .check('tsc')                            // Attach a named check
  .check('build', { autoFix: true, maxRetries: 3 })

  // Review gates
  .review('human', { prompt: 'Review this' })
  .review('agent', { agent: 'reviewer' })
  .summary('Generate a summary for review')

  // Lifecycle hooks
  .shouldStart(ctx => boolean)             // Guard: should this task start?
  .onStart(ctx => void)                    // Called when task starts
  .onComplete((ctx, result) => void)       // Called on success
  .onFail((ctx, error) => void)            // Called on failure

  // Advanced flow
  .fanOut(['branch-a', 'branch-b'])        // Fork into parallel branches
  .fanIn(['branch-a', 'branch-b'])         // Join parallel branches
  .dagFlow([{ from: 'a', to: 'b' }])      // Arbitrary DAG edges
  .expand(parent => TaskDef[])             // Generate subtasks dynamically
```

### EpicBuilder Methods

```typescript
ctx.createEpic('id', 'title')
  .basePath('./epics/1-features')          // Base path for relative file references
  .addTask(taskBuilder)                    // Add a task
```

### PlanBuilder Methods

```typescript
ctx.createPlan('title')
  .vars({ key: 'value' })                 // Plan-wide variables
  .addEpic(epicBuilder)                   // Add an epic
  .build()                                 // Finalize and return
```

## Declarative Format

Simpler syntax for static plans:

```typescript
export async function createPlan(ctx) {
  return ctx.plan({
    title: 'Blog Platform',
    vars: { nodeVersion: '20' },
    epics: [
      {
        id: 'setup',
        title: 'Project Setup',
        tasks: [
          {
            id: 'init',
            title: 'Initialize Project',
            skill: 'repo/init',
            outputs: ['package.json'],
          },
          {
            id: 'deps',
            title: 'Install Dependencies',
            skill: 'repo/install',
            deps: ['init'],
            inputs: ['package.json'],
            outputs: ['node_modules/'],
          },
        ],
      },
      {
        id: 'content',
        title: 'Content System',
        tasks: [
          {
            id: 'models',
            title: 'Data Models',
            deps: ['deps'],
            outputs: ['src/models/'],
            prompt: 'Create data models for posts, authors, and categories',
            checks: ['tsc'],
          },
          {
            id: 'api',
            title: 'API Routes',
            deps: ['models'],
            outputs: ['src/app/api/'],
            prompt: 'Build REST API routes for CRUD operations',
            checks: ['tsc', 'build'],
          },
        ],
      },
    ],
  });
}
```

### Conditional Tasks in Declarative Format

Use the `when` guard to conditionally include tasks:

```typescript
{
  id: 'analytics',
  title: 'Analytics Setup',
  when: (vars) => vars.hasAnalytics,
  outputs: ['src/lib/analytics.ts'],
  prompt: 'Set up analytics tracking',
}
```

## Task Relationships

Understanding how tasks connect is essential for well-structured plans.

### Dependency Chain

```
init → deps → models → api → tests
```

Each task waits for its `deps` to complete. Failed dependencies block downstream tasks.

### Parallel Execution

Tasks without dependencies on each other run in parallel:

```
         ┌→ auth ──┐
init → deps         ├→ integration-tests
         └→ api ───┘
```

### Fan-Out / Fan-In

For explicit fork/join patterns:

```typescript
ctx.createTask('split', 'Split Work')
  .fanOut(['page-home', 'page-about', 'page-contact']);

ctx.createTask('merge', 'Merge Results')
  .fanIn(['page-home', 'page-about', 'page-contact']);
```

### DAG Flow

For arbitrary graph edges when fan-out/fan-in isn't enough:

```typescript
ctx.createTask('complex', 'Complex Flow')
  .dagFlow([
    { from: 'parse', to: 'validate' },
    { from: 'parse', to: 'transform' },
    { from: 'validate', to: 'output' },
    { from: 'transform', to: 'output' },
  ]);
```

## Checks and Review Gates

### Built-in Checks

| Check | What it does |
|-------|-------------|
| `tsc` | TypeScript compilation |
| `build` | Build command (`npm run build` or similar) |
| `images` | Image optimization verification |

### Custom Checks via Plugins

Plugins can register additional checks. The crewman plugin provides:

- `plan-coherence` — validates task dependencies and prompt completeness
- `outputs-exist` — verifies expected output files were created
- `goals-on-track` — checks goal health

### Auto-Fix

Checks with `autoFix: true` automatically create fix tasks when they fail:

```typescript
.check('build', { autoFix: true, maxRetries: 3 })
```

The fix agent gets the error output and attempts a targeted repair, up to `maxRetries` attempts.

### Review Gates

Review gates pause task completion until approved:

```typescript
// Human review — pauses for manual approval
.review('human', { prompt: 'Check the API design for security issues' })

// Agent review — another AI reviews the work
.review('agent', { agent: 'reviewer', prompt: 'Review code quality' })
```

Tasks with review gates enter `awaiting_review` status after execution.

## Plan Lifecycle

```bash
crew plan init     # Generate plan from .crew/setup/plan/index.js
crew plan          # View current plan
crew plan reset    # Delete plan (destructive — asks for confirmation)
```

### Transactional Creation

`crew plan init` creates plans transactionally — if anything fails during creation, the partial plan is rolled back. This prevents half-created plans with broken dependencies.

### Two-Pass Task Creation

The planner uses two passes:
1. **Pass 1**: Create all tasks (without resolving deps)
2. **Pass 2**: Resolve dependencies between tasks

This allows tasks to reference each other regardless of declaration order.

## Modifying an Existing Plan

### Add Tasks to an Existing Epic

```bash
crew task add --epic M1 --title "New Task" --after m1.3
```

### Reorder Tasks

```bash
crew task m1.2 edit --deps "m1.1,m1.3"
```

### Remove Tasks

```bash
crew task m1.4 remove
```

### Add a New Epic

```bash
crew epic add --title "Performance" --after M2
```

## Reviewing a Plan

When asked to review a plan, check for:

1. **Completeness** — Does every deliverable have tasks covering it?
2. **Dependencies** — Are all task dependencies correctly wired? Are there cycles?
3. **Parallelism** — Can any sequential tasks actually run in parallel?
4. **Granularity** — Are tasks small enough to verify but large enough to be meaningful?
5. **Checks** — Do artifact-producing tasks have verification checks?
6. **Goal alignment** — Does the plan deliver on the goals in `.crew/goals/`?

Run `crew verify` to catch structural issues automatically.

## Common Patterns

### Page-Per-Task Pattern

When building multiple similar pages/components:

```typescript
const pages = ['home', 'about', 'contact', 'pricing'];

for (const page of pages) {
  features.addTask(
    ctx.createTask(`page-${page}`, `Build ${page} page`)
      .type('coding')
      .deps(['layout'])
      .outputs([`src/app/${page}/page.tsx`])
      .promptFrom('./prompts/build-page.md', { pageName: page })
      .check('build')
  );
}
```

### Scaffold → Implement → Verify Pattern

```typescript
epic.addTask(ctx.createTask('scaffold', 'Scaffold Structure')
  .outputs(['src/'])
  .prompt('Create the directory structure and empty files'));

epic.addTask(ctx.createTask('implement', 'Implement Logic')
  .deps(['scaffold'])
  .inputs(['src/'])
  .outputs(['src/'])
  .prompt('Implement the business logic'));

epic.addTask(ctx.createTask('verify', 'Verify Implementation')
  .type('verify')
  .deps(['implement'])
  .check('tsc')
  .check('build'));
```

### Progressive Enhancement Pattern

Build a working base, then layer features:

```typescript
const base = ctx.createEpic('base', 'Working Base');
// ... minimal viable tasks

const enhance = ctx.createEpic('enhance', 'Enhancements');
enhance.addTask(
  ctx.createTask('animations', 'Add Animations')
    .deps(['base-complete'])  // cross-epic dependency
    .prompt('Add CSS transitions and scroll animations')
    .check('build')
);
```
