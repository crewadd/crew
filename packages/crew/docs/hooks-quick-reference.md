# Transition Hooks - Quick Reference

> **Note:** Transition hooks work in both **manual mode** (`crew run m1.2`) and **auto mode** (`crew epic m1`).
> See [hooks-transition-scenarios.md](./hooks-transition-scenarios.md) for details on both execution modes.

## Hook Signatures

```javascript
// Task Transition Hooks
async beforeSwitchTask(ctx: TaskTransitionContext): Promise<void>
async afterSwitchTask(ctx: TaskTransitionContext): Promise<void>

// Epic Transition Hooks
async beforeSwitchEpic(ctx: EpicTransitionContext): Promise<void>
async afterSwitchEpic(ctx: EpicTransitionContext): Promise<void>
```

## Context Properties

### TaskTransitionContext

```javascript
ctx.prevTask       // Previous task (null if first)
  .id              // "task_abc123"
  .displayId       // "m1.1"
  .title           // "Bootstrap project"
  .status          // "done" | "failed"
  .result          // TaskResult (optional)
  .epic       // { id, number, title }

ctx.nextTask       // Next task
  .id              // "task_def456"
  .displayId       // "m1.2"
  .title           // "Install dependencies"
  .status          // "pending"
  .epic       // { id, number, title }

ctx.project        // Project context
ctx.buildCtx       // Build context
ctx.tools          // File, shell, git, verify tools
ctx.log            // Logger (info, warn, error)
ctx.vars           // Shared variables
```

### EpicTransitionContext

```javascript
ctx.prevEpic  // Previous epic (null if first)
  .id              // "ms_abc123"
  .number          // 1
  .title           // "Bootstrap"
  .status          // "done"
  .taskCount       // 5
  .completedTaskCount // 5

ctx.nextEpic  // Next epic
  .id              // "ms_def456"
  .number          // 2
  .title           // "Build Pages"
  .status          // "planned"
  .taskCount       // 10
  .gates           // [{ type, required, completed }]

ctx.project        // Project context
ctx.buildCtx       // Build context
ctx.tools          // File, shell, git, verify tools
ctx.log            // Logger (info, warn, error)
ctx.vars           // Shared variables
```

## Available Tools

```javascript
// File Operations
await ctx.tools.file.read(path)
await ctx.tools.file.write(path, content)
await ctx.tools.file.exists(path)
await ctx.tools.file.glob(pattern)

// Shell Commands
const result = await ctx.tools.shell.run(command)
// Returns: { stdout, stderr, exitCode }

// Git Operations
await ctx.tools.git.status()
await ctx.tools.git.diff()
await ctx.tools.git.add([paths])
await ctx.tools.git.commit(message)

// Verification
const result = await ctx.tools.verify.tsc()
const result = await ctx.tools.verify.build()
const result = await ctx.tools.verify.lint()
const result = await ctx.tools.verify.test()
// Returns: { passed, issues, raw }

// Logging
ctx.log.info(message, meta)
ctx.log.warn(message)
ctx.log.error(message)
```

## Common Patterns

### Artifact Validation

```javascript
async beforeSwitchTask(ctx) {
  if (ctx.prevTask?.displayId === 'm1.1') {
    if (!await ctx.tools.file.exists('package.json')) {
      throw new Error('package.json not created by m1.1');
    }
  }
}
```

### Epic Boundary Detection

```javascript
async beforeSwitchTask(ctx) {
  if (ctx.prevTask?.epic.number !== ctx.nextTask.epic.number) {
    ctx.log.info(`Crossing epic boundary: M${ctx.prevTask.epic.number} → M${ctx.nextTask.epic.number}`);
  }
}
```

### Quality Gates

```javascript
async beforeSwitchEpic(ctx) {
  const build = await ctx.tools.verify.build();
  if (!build.passed) {
    throw new Error('Build must pass before advancing to next epic');
  }
}
```

### Progress Tracking

```javascript
async beforeSwitchTask(ctx) {
  await ctx.tools.file.write('.crew/progress.json', JSON.stringify({
    from: ctx.prevTask?.displayId,
    to: ctx.nextTask.displayId,
    timestamp: new Date().toISOString()
  }, null, 2));
}
```

### Auto-Commit

```javascript
async beforeSwitchEpic(ctx) {
  if (ctx.prevEpic) {
    await ctx.tools.git.add(['.']);
    await ctx.tools.git.commit(
      `Epic M${ctx.prevEpic.number} complete: ${ctx.prevEpic.title}`
    );
  }
}
```

### Environment Setup

```javascript
async beforeSwitchEpic(ctx) {
  if (ctx.nextEpic.number === 2) {
    await ctx.tools.shell.run('mkdir -p src/app src/components');
  }
}
```

## Blocking Behavior

| Hook | Can Block? | When Runs |
|------|-----------|-----------|
| `beforeSwitchTask` | ✅ Yes | Before task starts |
| `afterSwitchTask` | ❌ No | After task completes |
| `beforeSwitchEpic` | ✅ Yes | Before epic starts |
| `afterSwitchEpic` | ❌ No | After epic completes |

Throw an error in `before*` hooks to block:

```javascript
async beforeSwitchTask(ctx) {
  if (someCondition) {
    throw new Error('Transition blocked: reason');
  }
}
```

## Execution Order

### Task Flow
```
beforeSwitchTask    ← NEW (prev task context)
beforeTask          ← Existing
[Task Execution]
afterTask           ← Existing
afterSwitchTask     ← NEW (prev task context)
```

### Epic Flow
```
beforeSwitchEpic    ← NEW (prev epic context)
[All Tasks Execute]
[Verification]
afterSwitchEpic     ← NEW (next epic context)
```

## Error Handling

```javascript
async beforeSwitchTask(ctx) {
  try {
    // Your validation logic
  } catch (error) {
    throw new Error(
      `Task transition blocked: ${error.message}\n` +
      `Fix and retry: crew run ${ctx.nextTask.displayId}`
    );
  }
}
```

## Configuration

Add hooks to `.crew/setup/index.js`:

```javascript
export const hooks = {
  // Task lifecycle (existing)
  async beforeTask(ctx) { /* ... */ },
  async afterTask(ctx, result) { /* ... */ },
  async onTaskFail(ctx, error) { /* ... */ },

  // Task transitions (NEW)
  async beforeSwitchTask(ctx) { /* ... */ },
  async afterSwitchTask(ctx) { /* ... */ },

  // Epic transitions (NEW)
  async beforeSwitchEpic(ctx) { /* ... */ },
  async afterSwitchEpic(ctx) { /* ... */ },
};
```

## Tips

1. **Keep `before*` fast** - They block execution
2. **Use `after*` for logging** - Non-blocking
3. **Check `prevTask` for null** - First task has no previous
4. **Leverage epic detection** - Compare epic numbers
5. **Provide clear errors** - Help users fix issues
6. **Use tools extensively** - File, shell, git, verify
7. **Log important events** - Track transitions

## Examples

See:
- Full documentation: `packages/crew/docs/hooks.md`
- Working example: `apps/ai-tool_nextjstemplates_com/.crew/setup/index.js`
