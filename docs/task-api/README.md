# Task API

**Master the fluent builder API for defining intelligent, self-verifying tasks.**

The Task API is your primary interface for defining work in Crew. Tasks are atomic units of work executed by AI agents with automatic quality verification and retry logic.

## In This Section

### [Fluent Builder](./fluent-builder.md)
Complete reference for the TaskBuilder API with all methods and options.

### [Task Context](./task-context.md)
Runtime context available to tasks: filesystem access, shell execution, and custom tools.

### [Lifecycle Hooks](./lifecycle-hooks.md)
React to task events with `onStart`, `onComplete`, `onFail`, and other hooks.

### [Checks](./checks.md)
Five types of quality gates: named, inline, command, prompt, and harness checks.

### [Planning Phase](./planning-phase.md)
The plan-then-execute pattern: how agents plan before taking action.

### [Review Gates](./review-gates.md)
Human-in-the-loop: require manual approval before task execution or completion.

### [Yields & Incremental Planning](./yields-incremental-planning.md)
Dynamic task spawning: create new tasks during execution based on runtime discoveries.

---

## Prerequisites

Before diving into the Task API:

- Understand [Projects, Epics & Tasks](../core-concepts/projects-epics-tasks.md)
- Complete [Your First Project](../getting-started/your-first-project.md)
- Review [Execution Flow](../core-concepts/execution-flow.md)

---

## Quick Reference

### Basic Task

```typescript
.addTask('create-component', (task) => task
  .does('Create a React Button component with TypeScript')
  .check('file-exists', 'src/components/Button.tsx')
  .check('command', { cmd: 'npm run typecheck' })
)
```

### Task with Planning

```typescript
.addTask('refactor-api', (task) => task
  .does('Refactor API to use async/await instead of callbacks')
  .plan() // Agent plans approach before executing
  .check('command', { cmd: 'npm test' })
  .maxAttempts(5)
)
```

### Task with Context

```typescript
.addTask('analyze-deps', (task) => task
  .does('Analyze dependencies and suggest optimizations')
  .context({ packageManager: 'pnpm', nodeVersion: '20' })
  .check('file-exists', 'dependency-report.md')
)
```

### Task with Lifecycle Hooks

```typescript
.addTask('deploy', (task) => task
  .does('Deploy application to production')
  .onStart(async (ctx) => {
    console.log('Starting deployment...');
  })
  .onComplete(async (ctx) => {
    console.log('Deployment successful!');
    await ctx.shell('npm run post-deploy');
  })
  .onFail(async (ctx, error) => {
    console.error('Deployment failed:', error);
    await ctx.shell('npm run rollback');
  })
)
```

### Task with Review Gate

```typescript
.addTask('modify-database', (task) => task
  .does('Add new migration for user roles table')
  .reviewBeforeExecute() // Human approval before agent starts
  .check('command', { cmd: 'npm run migrate:test' })
)
```

### Task with Yields

```typescript
.addTask('scaffold-features', (task) => task
  .does('Analyze requirements and scaffold necessary features')
  .yields() // Can spawn new tasks dynamically
  .check('file-exists', 'features-plan.md')
)
```

---

## Task Anatomy

Every task has:

1. **ID**: Unique identifier (auto-generated or explicit)
2. **Description**: What the agent should accomplish
3. **Checks**: Quality gates that must pass
4. **Constraints**: Dependencies, conditions, retries
5. **Context**: Additional data available to the agent
6. **Hooks**: Callbacks for lifecycle events

### The Task Lifecycle

```
1. Constraints Checked (when, unless)
2. Pre-execution Review (if reviewBeforeExecute)
3. Planning Phase (if .plan() enabled)
4. onStart Hook
5. Execution Phase (agent does work)
6. Check Phase (quality gates run)
7. Pass → onComplete Hook → Done
8. Fail → Retry or onFail Hook
```

---

## Task Builder Methods

### Core Methods

- `.does(description)` - What the agent should accomplish
- `.type(taskType)` - Assign task type for organization
- `.context(data)` - Provide additional context
- `.plan()` - Enable planning phase

### Quality Gates

- `.check(name, config)` - Add named check
- `.check(fn)` - Add inline check function
- `.checkCommand(cmd)` - Add shell command check
- `.checkPrompt(prompt)` - Add AI validation check
- `.harness(config)` - Add AutoHarness test generation

### Constraints

- `.dependsOn(...taskIds)` - Task dependencies
- `.when(condition)` - Conditional execution
- `.unless(condition)` - Negative conditional
- `.maxAttempts(n)` - Retry limit (default: 3)

### Lifecycle

- `.onStart(fn)` - Before execution
- `.onComplete(fn)` - After successful completion
- `.onFail(fn)` - After all retries exhausted

### Review Gates

- `.reviewBeforeExecute()` - Approve before starting
- `.reviewBeforeComplete()` - Approve after execution

### Advanced

- `.yields()` - Allow dynamic task spawning
- `.executor(executor)` - Custom executor
- `.tools(tools)` - Custom TaskContext tools

---

## Learning Path

**Recommended reading order:**

1. **[Fluent Builder](./fluent-builder.md)** - Master the API
2. **[Checks](./checks.md)** - Add quality gates
3. **[Task Context](./task-context.md)** - Use runtime tools
4. **[Planning Phase](./planning-phase.md)** - Enable planning
5. **[Lifecycle Hooks](./lifecycle-hooks.md)** - React to events
6. **[Review Gates](./review-gates.md)** - Add human oversight
7. **[Yields](./yields-incremental-planning.md)** - Dynamic planning

---

## Best Practices

### ✅ Do

- Write clear, specific task descriptions
- Add multiple checks for important tasks
- Use `.plan()` for complex tasks
- Set appropriate `maxAttempts` for flaky operations
- Use `context` to provide necessary background info

### ❌ Don't

- Create tasks that do multiple unrelated things
- Skip checks for important operations
- Set `maxAttempts` too high (wastes time/money)
- Put secrets in task descriptions or context

---

## Next Steps

- **Learn check types**: [Checks System](../checks/README.md)
- **See examples**: [Examples](../examples/README.md)
- **Advanced patterns**: [Guides](../guides/README.md)
- **API details**: [API Reference](../api-reference/README.md)

---

[← Back to Documentation Home](../README.md)
