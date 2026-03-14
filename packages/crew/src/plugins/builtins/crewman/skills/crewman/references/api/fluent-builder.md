# Fluent Builder API Reference

Complete reference for the programmable plan creation API. The fluent builder provides a three-level hierarchy: **PlanBuilder** → **EpicBuilder** → **TaskBuilder**.

## Table of Contents

- [Overview](#overview)
- [PlanBuilder](#planbuilder)
- [EpicBuilder](#epicbuilder)
- [TaskBuilder](#taskbuilder)
- [Declarative Alternative](#declarative-alternative)
- [Variable Interpolation](#variable-interpolation)
- [Entry Point](#entry-point)

---

## Overview

The fluent builder is accessed through `CrewConfigContext`, which is passed to your plan creation function:

```typescript
// .crew/setup/plan/index.js
export async function createPlan(ctx) {
  return ctx.createPlan('My Project')
    .addEpic(ctx.createEpic('setup', 'Setup')
      .addTask(ctx.createTask('init', 'Initialize')
        .prompt('Set up the project')))
    .build();
}
```

All builders are chainable — each method returns `this` for fluent composition.

---

## PlanBuilder

Created via `ctx.createPlan(title)`.

### .vars(vars: Record\<string, unknown\>)

Set plan-wide variables accessible to all tasks:

```typescript
plan.vars({
  framework: 'nextjs',
  nodeVersion: '20',
  hasAuth: true,
  pageCount: 5,
});
```

Variables are available in:
- Task prompt templates (`{{framework}}`)
- Conditional logic (`when` guards, `shouldStart` hooks)
- Executor scripts (`ctx.vars.framework`)

### .addEpic(epic: EpicBuilder)

Add an epic to the plan. Epics execute in the order they're added:

```typescript
plan.addEpic(foundation);
plan.addEpic(features);
plan.addEpic(polish);
```

### .build(): PlanDefinition

Finalize the plan and return the definition. This resolves all dependencies (two-pass) and validates the structure:

```typescript
return plan.build();
```

---

## EpicBuilder

Created via `ctx.createEpic(id, title)`.

### .basePath(path: string)

Set the base path for resolving relative file references in tasks (prompts, executors):

```typescript
const epic = ctx.createEpic('foundation', 'Foundation')
  .basePath('./epics/0-foundation');
```

With `basePath('./epics/0-foundation')`:
- `.promptFrom('./prompts/init.md')` resolves to `./epics/0-foundation/prompts/init.md`
- `.executeFrom('./executors/init.js')` resolves to `./epics/0-foundation/executors/init.js`

### .addTask(task: TaskBuilder)

Add a task to the epic:

```typescript
epic.addTask(ctx.createTask('init', 'Initialize').prompt('...'));
epic.addTask(ctx.createTask('deps', 'Dependencies').deps(['init']));
```

Tasks within an epic execute based on their dependency graph. Tasks without mutual dependencies can run in parallel.

---

## TaskBuilder

Created via `ctx.createTask(id, title)`. This is the most feature-rich builder.

### Classification

#### .type(type: string)

Task type. Determines default behavior and which checks apply:

```typescript
.type('coding')      // Default. Write/modify code
.type('verify')      // Verification-only task
.type('planning')    // Planning/analysis task
.type('custom')      // Custom type defined by plugins
```

#### .tag(...tags: string[])

Add metadata tags for filtering and reporting:

```typescript
.tag('critical')
.tag('frontend', 'ui')
```

#### .skill(name: string)

Assign an agent skill. The agent loads the skill's SKILL.md at execution time:

```typescript
.skill('repo/install')
.skill('page-build')
```

#### .priority(n: number)

Execution priority. Higher numbers execute first when multiple tasks are ready:

```typescript
.priority(10)   // Execute before lower-priority tasks
.priority(1)    // Execute after higher-priority tasks
```

### Input / Output

#### .inputs(files: string[])

Files this task reads. Used for documentation and dependency tracking:

```typescript
.inputs(['package.json', 'tsconfig.json'])
```

#### .outputs(files: string[])

Files this task creates or modifies. Used by the `outputs-exist` check:

```typescript
.outputs(['src/lib/auth.ts', 'src/app/login/page.tsx'])
```

#### .vars(vars: Record\<string, unknown\>)

Task-scoped variables that override plan-level vars:

```typescript
.vars({ pageName: 'home', layout: 'sidebar' })
```

### Instructions

#### .prompt(text: string)

Inline prompt — the instructions for the agent executing this task:

```typescript
.prompt('Create a login page with email/password fields and JWT authentication')
```

#### .promptFrom(path: string, vars?: Record\<string, unknown\>)

Load prompt from a template file. Variables are interpolated using `{{varName}}` syntax:

```typescript
.promptFrom('./prompts/build-page.md', { pageName: 'home' })
```

Template example:
```markdown
Build the {{pageName}} page with the following requirements:
- Responsive layout
- Use {{framework}} components
```

#### .execute(code: string)

Inline executor code (JavaScript/TypeScript):

```typescript
.execute(`
  const fs = require('fs');
  fs.writeFileSync('output.txt', 'hello');
`)
```

#### .executeFrom(path: string, vars?: Record\<string, unknown\>)

Load executor from an external file:

```typescript
.executeFrom('./executors/build-page.js', { pageName: 'home' })
```

### Dependencies

#### .deps(taskIds: string[])

Tasks that must complete before this task can start:

```typescript
.deps(['init-repo', 'install-deps'])
```

Uses task IDs (the first argument to `createTask`), not display IDs.

#### .blocks(taskIds: string[])

Tasks that this task prevents from starting:

```typescript
.blocks(['integration-tests', 'deploy'])
```

Inverse of `deps` — equivalent to adding this task to each blocked task's `deps`.

#### .blockedBy(taskIds: string[])

Alias for `deps` with more explicit naming:

```typescript
.blockedBy(['database-setup'])
```

#### .sequential()

All tasks in this epic run one at a time, in declaration order:

```typescript
.sequential()
```

#### .parallel()

All tasks in this epic run concurrently (default behavior when no deps):

```typescript
.parallel()
```

### Verification

#### .check(name: string, opts?: CheckOptions)

Attach a named check. Runs after task execution:

```typescript
.check('tsc')
.check('build', { autoFix: true, maxRetries: 3 })
```

**CheckOptions**:
| Field | Type | Description |
|-------|------|-------------|
| `autoFix` | boolean | Create fix tasks on failure |
| `maxRetries` | number | Max fix attempts |

#### .review(type: 'human' \| 'agent', opts?: ReviewOptions)

Add a review gate. Task enters `awaiting_review` after execution:

```typescript
.review('human', { prompt: 'Check security of auth implementation' })
.review('agent', { agent: 'reviewer', prompt: 'Review code quality' })
```

**ReviewOptions**:
| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Review instructions |
| `agent` | string | Agent name (for agent reviews) |
| `assignee` | string | Who should review |

#### .summary(prompt: string)

Generate a summary after task completion for use in reviews:

```typescript
.summary('Summarize the changes made to the authentication module')
```

### Lifecycle Hooks

#### .shouldStart(fn: (ctx) => boolean)

Guard function — task only starts if this returns `true`:

```typescript
.shouldStart(ctx => ctx.vars.hasAuth === true)
```

#### .onStart(fn: (ctx) => void)

Called when the task begins execution:

```typescript
.onStart(ctx => console.log(`Starting ${ctx.task.title}`))
```

#### .onComplete(fn: (ctx, result) => void)

Called after successful completion:

```typescript
.onComplete((ctx, result) => {
  console.log(`Done in ${result.durationMs}ms`);
})
```

#### .onFail(fn: (ctx, error) => void)

Called on task failure:

```typescript
.onFail((ctx, error) => {
  console.error(`Failed: ${error.message}`);
})
```

### Advanced Flow Control

#### .fanOut(branches: string[])

Fork execution into parallel branches:

```typescript
.fanOut(['page-home', 'page-about', 'page-contact'])
```

Each branch ID corresponds to a task that will run in parallel after this task completes.

#### .fanIn(branches: string[])

Join parallel branches. This task waits for all listed tasks to complete:

```typescript
.fanIn(['page-home', 'page-about', 'page-contact'])
```

#### .dagFlow(edges: Array<{ from: string; to: string }>)

Define arbitrary DAG edges for complex workflows:

```typescript
.dagFlow([
  { from: 'parse', to: 'validate' },
  { from: 'parse', to: 'transform' },
  { from: 'validate', to: 'output' },
  { from: 'transform', to: 'output' },
])
```

#### .expand(fn: (parent) => TaskDef[])

Dynamically generate subtasks at plan creation time:

```typescript
.expand(parent => {
  const pages = ['home', 'about', 'contact'];
  return pages.map(page => ({
    id: `build-${page}`,
    title: `Build ${page}`,
    prompt: `Build the ${page} page`,
    outputs: [`src/app/${page}/page.tsx`],
  }));
})
```

---

## Declarative Alternative

For simpler plans, use `ctx.plan()` with a plain object:

```typescript
export async function createPlan(ctx) {
  return ctx.plan({
    title: 'My Project',
    vars: { framework: 'nextjs' },
    epics: [
      {
        id: 'setup',
        title: 'Setup',
        tasks: [
          {
            id: 'init',
            title: 'Initialize',
            skill: 'repo/init',
            outputs: ['package.json'],
          },
        ],
      },
    ],
  });
}
```

### DeclarativeTask Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Task identifier |
| `title` | string | Human-readable title |
| `skill` | string | Agent skill name |
| `when` | (vars) => boolean | Conditional inclusion |
| `inputs` | string[] | Input file paths |
| `outputs` | string[] | Output file paths |
| `deps` | string[] | Dependency task IDs |
| `vars` | Record | Task-scoped variables |
| `prompt` | string | Task instructions |
| `promptRef` | string | Path to prompt template |
| `checks` | string[] | Check names to run |

### DeclarativeEpic Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Epic identifier |
| `title` | string | Human-readable title |
| `tasks` | DeclarativeTask[] | Tasks in this epic |

---

## Variable Interpolation

Template variables use `{{varName}}` syntax in prompt templates:

```markdown
# Build {{pageName}}

Use the {{framework}} framework to create the {{pageName}} page.
Node version: {{nodeVersion}}
```

Variables are resolved in this order (later overrides earlier):
1. Plan-level vars (from `plan.vars({})`)
2. Task-level vars (from `task.vars({})`)
3. Template call vars (from `.promptFrom(path, vars)`)

---

## Entry Point

The plan function is loaded from one of these locations (in order):

1. `.crew/setup/plan/index.js` — Primary (recommended)
2. `.crew/setup/index.js` — Legacy (`onInitPlan` callback)

The function receives a `CrewConfigContext` with:

```typescript
ctx.projectDir              // Absolute path to project root
ctx.createPlan(title)       // PlanBuilder factory
ctx.createEpic(id, title)   // EpicBuilder factory
ctx.createTask(id, title)   // TaskBuilder factory
ctx.plan(definition)        // Declarative plan shorthand
ctx.status()                // Get current CompoundStatus
ctx.next()                  // Get next executable tasks
```
