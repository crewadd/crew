# TaskBuilder Fluent API

**Complete reference for the declarative task builder API.**

[[docs](../README.md) > [task-api](./README.md) > fluent-builder]

---

## Overview

The `TaskBuilder` is your primary interface for defining tasks. Every task starts with `ctx.createTask(id, title)` and uses a fluent, chainable API to configure execution, checks, constraints, and lifecycle hooks.

**Key principles:**
- Fluent syntax: every method returns `this` for chaining
- Fully composable: combine any methods in any order
- Type-safe: TypeScript support for all configurations
- Declarative: the builder generates a serializable task definition that persists to disk

```typescript
ctx.createTask('auth-impl', 'Implement JWT authentication')
  .skill('backend-agent')
  .prompt('Build JWT auth with refresh tokens')
  .inputs(['src/auth/', 'package.json'])
  .outputs(['src/auth/jwt.ts', 'src/auth/token.ts'])
  .check('tsc')
  .check('build')
  .check({ prompt: 'Verify token refresh handles expiry' })
  .attempts(5)
  .build()
```

---

## Task Identity

### `.type(typeName)` / `.ofType(typeName)`

Assign a project-defined task type. The type provides default skills, checks, and hooks.

```typescript
ctx.createTask('form', 'Create login form')
  .ofType('frontend')  // Inherits frontend type's defaults
  .check('tsc')
```

**Type vs individual configuration:**
- Type provides *defaults* (skill, checks, hooks)
- Individual methods override type defaults
- When both exist, individual wins

### `.tag(name)` / `.tags(names[])`

Add metadata tags (no behavioral impact, useful for filtering and organization).

```typescript
ctx.createTask('refactor', 'Clean up payment service')
  .tags(['refactor', 'payment', 'high-priority'])
  .prompt('...')
```

---

## Core Task Configuration

### `.skill(name)`

Specify which agent persona to use for this task. Loads from `.crew/agents/{name}.md`.

```typescript
ctx.createTask('api', 'Build REST API')
  .skill('backend-agent')  // Loads .crew/agents/backend-agent.md
```

Without `.skill()`, the framework uses:
1. Task type's default skill
2. Global default agent if no type default

### `.prompt(text)` / `.promptRef(ref)` / `.promptFrom(filepath, vars?)`

Define the instruction for the AI agent.

**Inline prompt:**
```typescript
.prompt('Build a REST API with /users and /posts endpoints')
```

**Reference (for long prompts):**
```typescript
.promptRef('api-endpoint-design')
```

**From external file with variable interpolation:**
```typescript
.promptFrom('.crew/prompts/api-template.md', {
  endpoints: ['users', 'posts'],
  authType: 'jwt'
})
```

The template file uses `{{variable}}` syntax:

```markdown
# API Implementation

Build a REST API with the following endpoints:
{{#endpoints}}
- /{{this}}
{{/endpoints}}

Use {{authType}} for authentication.
```

### `.inputs(paths[])` / `.outputs(paths[])`

Declare file dependencies and expected outputs. Used for scoping context and validation.

```typescript
ctx.createTask('styles', 'Style components')
  .inputs(['src/components/**/*.tsx'])
  .outputs(['src/styles/*.css', 'src/components/**/*.module.css'])
```

Paths support glob patterns. When set:
- **inputs**: Included in agent context (files the agent reads)
- **outputs**: Used by harness and checks to validate completion

### `.deps(taskIds[])` / `.dependsOn(...taskIds)`

Declare task dependencies. This task waits for these to complete.

```typescript
ctx.createTask('api', 'Build API')
  .deps(['auth'])  // Wait for auth task to complete

ctx.createTask('ui', 'Build UI')
  .dependsOn('api', 'styles')  // Wait for both
```

The framework automatically resolves the constraint dependency graph.

### `.vars(vars: Record<string, unknown>)`

Set task-local variables accessible during execution via `ctx.vars`.

```typescript
ctx.createTask('generate', 'Generate code')
  .vars({
    language: 'typescript',
    framework: 'react',
    version: '18.0.0'
  })
  .prompt('Generate {{framework}} v{{version}} components in {{language}}')
```

Variables are merged with project-level and epic-level variables.

### `.when(condition)`

Conditional task execution. The task runs only if the condition is true.

```typescript
ctx.createTask('migrate', 'Run database migration')
  .when(vars => vars.environment === 'production')
  .prompt('Execute the migration script')

// Or with a function:
ctx.createTask('build-native', 'Build native module')
  .when(ctx => ctx.vars.platform === 'darwin')
```

---

## Checks & Validation

### `.check(check)`

Add a quality gate. Multiple checks are run sequentially after task completion.

**Five forms of checks:**

#### Named check (from registry):
```typescript
.check('tsc')
.check('build')
```

#### Named check with options:
```typescript
.check('format', { autoFix: true, maxRetries: 3 })
```

#### Inline function:
```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test');
  return {
    passed: result.exitCode === 0,
    output: result.stderr,
    feedback: 'Tests failed. Fix the broken test and re-run.'
  };
})
```

#### AI prompt check:
```typescript
.check({
  prompt: 'Verify all components have proper TypeScript types and no `any`',
  name: 'typescript-strict'
})

.check({
  prompt: 'Check that all API endpoints validate input and return proper error codes',
  files: ['src/routes/**/*.ts'],  // Specific files to check
  name: 'api-validation'
})
```

#### Shell command check:
```typescript
.check({ cmd: 'test -f src/app/page.tsx' })
.check({ cmd: 'npm run lint', name: 'linting' })
.check({ cmd: 'grep -r "console.log" src/', cwd: '.' })
```

**Check execution model:**

When a task completes:
1. All checks run in parallel
2. If all pass → task done
3. If any fail → feedback sent to agent
4. Agent re-attempts (up to `maxAttempts`)
5. Repeat until all pass or max attempts reached

### `.attempts(n)`

Set maximum check→retry attempts (default: 3).

```typescript
ctx.createTask('flaky-test', 'Run integration tests')
  .check('integration-suite')
  .attempts(5)  // Allow 5 attempts for flaky tests
```

---

## Lifecycle Hooks

### `.shouldStart(fn)`

Hook to decide if task should run. Runs before `onStart`.

```typescript
ctx.createTask('deploy', 'Deploy to production')
  .shouldStart(async (ctx) => {
    // Only run if all previous tasks succeeded
    return ctx.epic.tasks.every(t => t.status === 'done');
  })
```

### `.onStart(fn)`

Hook called after constraints pass but before execution.

```typescript
ctx.createTask('build', 'Build application')
  .onStart(async (ctx) => {
    ctx.log.info('Starting build process');
    await ctx.tools.shell.run('npm run prebuild');
  })
```

### `.onComplete(fn)`

Hook called after all checks pass.

```typescript
ctx.createTask('deploy', 'Deploy to production')
  .onComplete(async (ctx, result) => {
    ctx.log.info('Deployment successful', { url: 'https://app.example.com' });
    await ctx.tools.git.commit('chore: deployed to production');
  })
```

### `.onFail(fn)`

Hook called after all retry attempts exhausted and task still fails.

```typescript
ctx.createTask('critical-check', 'Verify critical systems')
  .onFail(async (ctx, error) => {
    ctx.log.error('Critical check failed', { error: error.message });
    // Maybe notify ops team, rollback, etc.
  })
```

---

## Advanced: Programmable Execution

### `.execute(code)` / `.executeFrom(filepath)`

Override task execution with custom code (bypasses AI agent).

**Inline code (string only, not functions):**
```typescript
ctx.createTask('ensure-dir', 'Ensure output directory exists')
  .execute(`
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return { success: true };
  `)
```

**From external file:**
```typescript
ctx.createTask('compile-rust', 'Compile Rust module')
  .executeFrom('.crew/executors/rust-compile.js')
```

The executor file exports an async function:

```javascript
// .crew/executors/rust-compile.js
export default async function execute(ctx) {
  const result = await ctx.tools.shell.run('cargo build --release');

  if (result.exitCode !== 0) {
    throw new Error(`Cargo build failed: ${result.stderr}`);
  }

  return {
    success: true,
    output: 'Rust module compiled successfully'
  };
}
```

### `.expand(fn)`

Generate subtasks from this task's result.

```typescript
ctx.createTask('analyze', 'Analyze codebase')
  .prompt('Analyze the codebase and identify refactoring opportunities')
  .expand((task) => {
    // Parse task output and generate subtasks
    return [
      ctx.createTask('refactor-1', 'Refactor payment module').build(),
      ctx.createTask('refactor-2', 'Refactor auth module').build(),
    ];
  })
```

---

## Constraints & Scheduling

### `.planning()` / `.planning(config)`

Enable plan-then-execute pattern. Agent plans before executing.

```typescript
ctx.createTask('complex-migration', 'Plan and execute database migration')
  .planning()  // Auto-approve plan, execute immediately
  .prompt('Create a safe migration for adding user roles table')

// With review gate:
.planning()
.review('human')  // Plan saved, human reviews offline

// With AI review:
.planning()
.review('agent', {
  agent: 'security-reviewer',
  prompt: 'Review the migration for security issues'
})
```

See [Planning Phase](./planning-phase.md) for details.

### `.review(type, opts?)` / `.review('human', opts)` / `.review('agent', opts)`

Add approval gate. Task pauses for review before or after execution.

```typescript
// Human review before execution
ctx.createTask('delete-data', 'Delete old user records')
  .review('human', {
    prompt: 'Confirm which records to delete',
    assignee: '@dba-lead',
    timeout: '24h',
    onTimeout: 'reject'
  })

// Agent review
.review('agent', {
  agent: 'compliance-reviewer',
  prompt: 'Check data deletion complies with GDPR'
})
```

See [Review Gates](./review-gates.md) for complete guide.

### `.yields()` / `.yields(config)`

Enable incremental planning. Task can spawn follow-up tasks based on output.

```typescript
// AI-driven yields
ctx.createTask('plan-features', 'Plan feature implementation')
  .yields({
    plan: 'For each feature in the design doc, create a task to implement it',
    target: 'next-epic'  // Put yielded tasks in a new epic
  })

// Programmatic yields
.yields(async (ctx, result) => {
  const doc = await ctx.tools.file.read('features.md');
  const features = parseFeatures(doc);
  return features.map(f =>
    ctx.createTask(`impl-${f.id}`, `Implement ${f.name}`)
      .skill('feature-impl')
      .build()
  );
})
```

See [Yields & Incremental Planning](./yields-incremental-planning.md) for details.

---

## AutoHarness: AI-Synthesized Validation

### `.harness()` / `.harness(config)`

Enable AutoHarness — LLM generates and maintains a validation policy.

```typescript
// Basic: derive harness from task prompt
ctx.createTask('nav', 'Build accessible navigation')
  .prompt('Create navbar with ARIA labels and keyboard navigation')
  .harness()

// Custom validation criteria
.harness({
  prompt: 'Verify all interactive elements have aria-label or aria-labelledby'
})

// Derive from input/output files
.inputs(['src/components/**/*.tsx'])
.outputs(['src/components/**/*.tsx'])
.harness({ from: 'outputs' })

// Refinable harness (learns from feedback)
.harness({
  refinable: true,
  maxRefinements: 5,
  cache: true
})
```

The harness runs alongside manual checks (tsc, build) to catch semantic errors.

See README for [AutoHarness](../HARNESS.md) comprehensive guide.

---

## Building the Task

### `.build()`

Finalize and return the task definition.

```typescript
const task = ctx.createTask('auth', 'Build authentication')
  .skill('backend')
  .prompt('Implement JWT auth')
  .check('tsc')
  .build();

// Now add to epic
epic.addTask(task);
```

---

## Complete Example

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('E-commerce Platform');

  plan.addEpic(
    ctx.createEpic('foundation', 'Project Foundation')
      .addTask(
        ctx.createTask('init', 'Initialize project')
          .ofType('setup')
          .prompt('Create TypeScript/Next.js project with ESM support')
          .outputs(['package.json', 'tsconfig.json', '.gitignore'])
          .check('tsc')
          .attempts(1)
      )
      .addTask(
        ctx.createTask('deps', 'Install dependencies')
          .deps(['init'])
          .prompt('Install all dependencies: React, Next.js, TypeORM')
          .check({ cmd: 'test -d node_modules' })
      )
  );

  plan.addEpic(
    ctx.createEpic('backend', 'Backend Implementation')
      .addTask(
        ctx.createTask('db-schema', 'Design database schema')
          .planning()  // Plan before execution
          .prompt('Design schema for users, products, orders')
          .outputs(['db/migrations/01_initial.sql'])
          .review('human', { assignee: '@dba' })
      )
      .addTask(
        ctx.createTask('auth', 'Implement authentication')
          .deps(['db-schema'])
          .skill('backend-agent')
          .prompt('Build JWT auth with refresh tokens and middleware')
          .inputs(['db/migrations/**/*.sql'])
          .outputs(['src/auth/**/*.ts'])
          .check('tsc')
          .check('build')
          .check({ prompt: 'Verify token expiry and refresh flow' })
          .attempts(4)
      )
      .addTask(
        ctx.createTask('api', 'Build REST API')
          .deps(['auth'])
          .prompt('Create API routes: GET/POST /products, GET/POST /orders')
          .check('tsc')
          .check('build')
          .check({ cmd: 'npm test api' })
          .yields({
            plan: 'For each API endpoint, create an integration test',
            taskType: 'test'
          })
      )
  );

  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Implementation')
      .addTask(
        ctx.createTask('ui', 'Build React components')
          .deps(['api'])
          .prompt('Create Product List, Product Detail, and Cart components')
          .inputs(['src/api/client.ts'])
          .outputs(['src/components/**/*.tsx'])
          .check('tsc')
          .harness({
            prompt: 'Verify components handle loading, error, and empty states'
          })
      )
  );

  return plan.build();
}
```

---

## API Reference: All Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `.type(name)` | `(typeName: string)` | Assign task type |
| `.ofType(name)` | `(typeName: string)` | Alias for `.type()` |
| `.tag(name)` | `(tagName: string)` | Add single tag |
| `.tags(names)` | `(tagNames: string[])` | Add multiple tags |
| `.skill(name)` | `(skillName: string)` | Set agent skill |
| `.prompt(text)` | `(text: string)` | Inline prompt |
| `.promptRef(ref)` | `(ref: string)` | Reference prompt |
| `.promptFrom(path, vars)` | `(path: string, vars?: Record<string, any>)` | Template prompt |
| `.inputs(paths)` | `(paths: string[])` | Input file patterns |
| `.outputs(paths)` | `(paths: string[])` | Output file patterns |
| `.deps(ids)` | `(taskIds: string[])` | Task dependencies |
| `.dependsOn(...ids)` | `(...taskIds: string[])` | Task dependencies (variadic) |
| `.vars(vars)` | `(vars: Record<string, any>)` | Task variables |
| `.when(condition)` | `(condition: (vars) => boolean \| string)` | Conditional execution |
| `.check(ref, opts?)` | Multiple forms | Add quality gate |
| `.attempts(n)` | `(n: number)` | Max retry attempts |
| `.shouldStart(fn)` | `(fn: (ctx) => boolean \| Promise<boolean>)` | Pre-execution check |
| `.onStart(fn)` | `(fn: (ctx) => void \| Promise<void>)` | Lifecycle hook |
| `.onComplete(fn)` | `(fn: (ctx, result) => void \| Promise<void>)` | Lifecycle hook |
| `.onFail(fn)` | `(fn: (ctx, error) => void \| Promise<void>)` | Lifecycle hook |
| `.execute(code)` | `(code: string)` | Inline executor |
| `.executeFrom(path, vars)` | `(path: string, vars?: Record<string, any>)` | External executor |
| `.expand(fn)` | `(fn: (task) => TaskDef[] \| undefined)` | Subtask generation |
| `.planning(config?)` | `(config?: PlanningConfig)` | Enable planning phase |
| `.review(type, opts?)` | `('human' \| 'agent', opts?: ReviewOpts)` | Add approval gate |
| `.yields(config?)` | `(config?: YieldsConfig \| YieldsFn)` | Enable incremental planning |
| `.harness(config?)` | `(config?: HarnessConfig)` | Enable AutoHarness |
| `.build()` | `(): TaskDef` | Finalize task |

---

## See Also

- [Task Context](./task-context.md) - Runtime environment and tools
- [Checks](./checks.md) - Quality gate deep dive
- [Lifecycle Hooks](./lifecycle-hooks.md) - Hook patterns and best practices
- [Planning Phase](./planning-phase.md) - Plan-then-execute pattern
- [Review Gates](./review-gates.md) - Human-in-the-loop approval
- [Yields](./yields-incremental-planning.md) - Dynamic task spawning
- [Examples](../examples/README.md) - Practical examples

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
