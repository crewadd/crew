# Crew Hook System

## Overview

Crew provides a comprehensive hook system for customizing task and epic execution flow. Hooks allow you to inject custom logic at key transition points in the execution pipeline.

**Important:** Transition hooks work in **both manual and automatic execution modes**:
- **Manual mode**: `crew run m1.2` - User explicitly runs specific tasks
- **Auto mode**: `crew epic m1` - System automatically runs tasks in sequence

See [Task Transition Scenarios](./hooks-transition-scenarios.md) for detailed information about how hooks work in each mode.

## Hook Types

### Task Lifecycle Hooks

These hooks run for every individual task execution:

- **beforeTask** - Runs before individual task execution
- **afterTask** - Runs after successful task completion
- **onTaskFail** - Runs when task fails

### Task Transition Hooks (NEW)

These hooks run when transitioning between tasks, providing context about both the previous and next task:

- **beforeSwitchTask** - Runs when transitioning between tasks (after prevTask completes, before nextTask starts)
- **afterSwitchTask** - Runs after task transition completes (nextTask is now active)

### Epic Transition Hooks (NEW)

These hooks run when transitioning between epics:

- **beforeSwitchEpic** - Runs when transitioning between epics (after M1 completes, before M2 starts)
- **afterSwitchEpic** - Runs after epic transition completes (M2 is now active)

## Hook Context

### TaskContext

Available to `beforeTask`, `afterTask`, and `onTaskFail`:

```typescript
interface TaskContext {
  taskId: string;
  task: TaskDef;
  compoundTask: CompoundTask;
  epic: EpicContext;
  project: ProjectContext;
  buildCtx: BuildContext;
  taskDir: string;
  agent: AgentFn;
  tools: TaskTools;
  vars: Record<string, unknown>;
  state: TaskState;
  log: TaskLogger;
}
```

### TaskTransitionContext

Available to `beforeSwitchTask` and `afterSwitchTask`:

```typescript
interface TaskTransitionContext {
  // Previous task (just completed)
  prevTask: {
    id: string;
    displayId: string;  // e.g. "m1.1"
    title: string;
    status: 'done' | 'failed';
    result?: TaskResult;
    epic: {
      id: string;
      number: number;
      title: string;
    };
  } | null;  // null if this is the first task

  // Next task (about to start)
  nextTask: {
    id: string;
    displayId: string;  // e.g. "m1.2"
    title: string;
    status: 'pending';
    epic: {
      id: string;
      number: number;
      title: string;
    };
  };

  // Project and build context
  project: ProjectContext;
  buildCtx: BuildContext;
  tools: TaskTools;
  log: Logger;
  vars: Record<string, unknown>;
}
```

### EpicTransitionContext

Available to `beforeSwitchEpic` and `afterSwitchEpic`:

```typescript
interface EpicTransitionContext {
  // Previous epic (just completed)
  prevEpic: {
    id: string;
    number: number;
    title: string;
    status: 'done';
    taskCount: number;
    completedTaskCount: number;
  } | null;  // null if this is the first epic

  // Next epic (about to start)
  nextEpic: {
    id: string;
    number: number;
    title: string;
    status: 'planned';
    taskCount: number;
    gates: Array<{ type: string; required: boolean; completed: boolean }>;
  };

  // Project and build context
  project: ProjectContext;
  buildCtx: BuildContext;
  tools: TaskTools;
  log: Logger;
  vars: Record<string, unknown>;
}
```

## Available Tools

All hook contexts provide access to these tools:

### File Tools

```javascript
tools.file.read(path)           // Read file content
tools.file.write(path, content) // Write file
tools.file.exists(path)         // Check if file exists
tools.file.glob(pattern)        // Find files matching pattern
```

### Shell Tools

```javascript
tools.shell.run(command, opts)  // Run shell command
// Returns: { stdout, stderr, exitCode }
```

### Git Tools

```javascript
tools.git.status()              // Get git status
tools.git.diff()                // Get git diff
tools.git.add(paths)            // Stage files
tools.git.commit(message)       // Commit changes
```

### Verify Tools

```javascript
tools.verify.tsc()              // Type check with TypeScript
tools.verify.build()            // Run build
tools.verify.lint()             // Run linter
tools.verify.test()             // Run tests
// All return: { passed, issues, raw }
```

## Blocking Transitions

Hooks can throw errors to block transitions:

```javascript
async beforeSwitchTask(ctx) {
  const artifactExists = await ctx.tools.file.exists('output.json');
  if (!artifactExists) {
    throw new Error('Required artifact missing from previous task');
  }
}
```

When a `before*` hook throws:
- Task/epic transition is **blocked**
- Current task/epic remains active
- Error is logged and returned to user
- User must fix the issue and retry

When an `after*` hook throws:
- Transition has already occurred (cannot be blocked)
- Error is logged but execution continues

## Execution Order

### Task Execution Order

1. `beforeSwitchTask` (if previous task exists)
2. `beforeTask`
3. **Task executes**
4. `afterTask` (on success)
5. `afterSwitchTask` (on success)
6. `onTaskFail` (on failure)

### Epic Execution Order

1. `beforeSwitchEpic` (if previous epic exists)
2. **Epic executes** (all tasks)
3. **Verification runs**
4. `afterSwitchEpic` (if verification passes and next epic exists)

## Example Use Cases

### 1. Artifact Validation

Verify previous task created expected files:

```javascript
async beforeSwitchTask(ctx) {
  if (ctx.prevTask?.displayId === 'm1.1') {
    const required = ['package.json', 'tsconfig.json'];
    for (const file of required) {
      if (!await ctx.tools.file.exists(file)) {
        throw new Error(`Task m1.1 didn't create ${file}`);
      }
    }
  }
}
```

### 2. Dependency Checks

Ensure build artifacts exist before continuing:

```javascript
async beforeSwitchTask(ctx) {
  if (ctx.nextTask.epic.number === 2) {
    // Entering epic 2, verify bootstrap complete
    const hasDeps = await ctx.tools.file.exists('node_modules');
    if (!hasDeps) {
      throw new Error('Dependencies not installed. Run pnpm install first.');
    }
  }
}
```

### 3. State Persistence

Save progress between tasks:

```javascript
async beforeSwitchTask(ctx) {
  if (ctx.prevTask) {
    await ctx.tools.file.write(
      '.crew/progress.json',
      JSON.stringify({
        lastCompleted: ctx.prevTask.displayId,
        next: ctx.nextTask.displayId,
        timestamp: new Date().toISOString(),
      }, null, 2)
    );
  }
}
```

### 4. Git Operations

Auto-commit at epic boundaries:

```javascript
async beforeSwitchEpic(ctx) {
  if (ctx.prevEpic) {
    await ctx.tools.git.add(['.']);
    await ctx.tools.git.commit(
      `Epic M${ctx.prevEpic.number} complete: ${ctx.prevEpic.title}`
    );
    ctx.log.info(`Committed epic M${ctx.prevEpic.number}`);
  }
}
```

### 5. External Integrations

Update tracking systems, send notifications:

```javascript
async afterSwitchEpic(ctx) {
  // Send Slack notification
  await fetch('https://hooks.slack.com/...', {
    method: 'POST',
    body: JSON.stringify({
      text: `Epic M${ctx.nextEpic.number} started: ${ctx.nextEpic.title}`
    })
  });
}
```

### 6. Environment Setup

Prepare workspace for next epic:

```javascript
async beforeSwitchEpic(ctx) {
  if (ctx.nextEpic.number === 2) {
    ctx.log.info('Setting up page building environment...');

    // Create directories
    await ctx.tools.shell.run('mkdir -p src/app src/components');

    // Copy templates
    await ctx.tools.shell.run('cp -r templates/* src/templates/');
  }
}
```

### 7. Verification Gates

Enforce quality gates between epics:

```javascript
async beforeSwitchEpic(ctx) {
  ctx.log.info('Running quality checks...');

  // Type check
  const tscResult = await ctx.tools.verify.tsc();
  if (!tscResult.passed) {
    throw new Error('Type errors must be fixed before advancing');
  }

  // Build check
  const buildResult = await ctx.tools.verify.build();
  if (!buildResult.passed) {
    throw new Error('Build must pass before advancing');
  }

  // Test check
  const testResult = await ctx.tools.verify.test();
  if (!testResult.passed) {
    throw new Error('All tests must pass before advancing');
  }

  ctx.log.info('All quality checks passed ✓');
}
```

### 8. Cleanup

Remove temporary files between epics:

```javascript
async afterSwitchEpic(ctx) {
  // Clean up temp files from previous epic
  await ctx.tools.shell.run('rm -rf .crew/tmp/*');
  await ctx.tools.shell.run('rm -rf dist/*');

  ctx.log.info('Cleaned up temporary files');
}
```

## Configuration

Define hooks in `.crew/setup/index.js`:

```javascript
export const hooks = {
  // Task lifecycle hooks
  async beforeTask(ctx) {
    // Runs before every task
  },

  async afterTask(ctx, result) {
    // Runs after successful task
  },

  async onTaskFail(ctx, error) {
    // Runs when task fails
  },

  // Task transition hooks (NEW)
  async beforeSwitchTask(ctx) {
    // Runs when switching between tasks
  },

  async afterSwitchTask(ctx) {
    // Runs after task switch completes
  },

  // Epic transition hooks (NEW)
  async beforeSwitchEpic(ctx) {
    // Runs when switching between epics
  },

  async afterSwitchEpic(ctx) {
    // Runs after epic switch completes
  },
};
```

## Best Practices

### 1. Keep Hooks Fast

Hooks run in the critical path. Keep them fast:

```javascript
// ✅ Good: Quick validation
async beforeSwitchTask(ctx) {
  const exists = await ctx.tools.file.exists('output.json');
  if (!exists) throw new Error('Missing output');
}

// ❌ Bad: Slow operation
async beforeSwitchTask(ctx) {
  await ctx.tools.shell.run('npm install'); // Too slow!
}
```

### 2. Use `before*` for Validation

Use `before*` hooks for validation and blocking:

```javascript
async beforeSwitchEpic(ctx) {
  // GOOD: Validation that blocks progression
  const result = await ctx.tools.verify.build();
  if (!result.passed) {
    throw new Error('Build must pass');
  }
}
```

### 3. Use `after*` for Logging

Use `after*` hooks for non-blocking operations:

```javascript
async afterSwitchTask(ctx) {
  // GOOD: Logging, metrics, notifications
  ctx.log.info('Task switched', {
    from: ctx.prevTask?.displayId,
    to: ctx.nextTask.displayId
  });
}
```

### 4. Handle Errors Gracefully

Provide clear error messages:

```javascript
async beforeSwitchTask(ctx) {
  try {
    // Validation logic
  } catch (error) {
    throw new Error(
      `Task transition blocked: ${error.message}\n` +
      `Fix the issue and run: crew run ${ctx.nextTask.displayId}`
    );
  }
}
```

### 5. Use Context Data

Leverage the rich context provided:

```javascript
async beforeSwitchTask(ctx) {
  // Check if transitioning between epics
  if (ctx.prevTask?.epic.number !== ctx.nextTask.epic.number) {
    ctx.log.info('Epic boundary detected');
    // Special handling for epic transitions
  }
}
```

## Troubleshooting

### Hook Not Running

1. Check `.crew/setup/index.js` exports the `hooks` object
2. Verify hook is defined in crew.json `setup` field
3. Check console for hook loading errors

### Hook Blocking Transition

If a `before*` hook throws:
1. Read the error message
2. Fix the issue
3. Re-run the task: `crew run <taskId>`

### Hook Taking Too Long

If hooks slow down execution:
1. Move heavy operations to `after*` hooks
2. Use async operations efficiently
3. Cache expensive checks

## Migration Guide

### From Task Hooks to Transition Hooks

If you were using `afterTask` to detect transitions:

```javascript
// OLD: Detecting transitions in afterTask
async afterTask(ctx, result) {
  // Try to figure out if we're transitioning...
  const nextTasks = await getNextTasks();
  if (nextTasks[0]?.epic !== ctx.epic.num) {
    // Epic transition logic
  }
}

// NEW: Use dedicated transition hook
async beforeSwitchEpic(ctx) {
  // Clean context with prev/next epic info
  ctx.log.info(`M${ctx.prevEpic.number} → M${ctx.nextEpic.number}`);
}
```

## API Reference

See [TaskTransitionContext](#tasktransitioncontext) and [EpicTransitionContext](#epictransitioncontext) for complete API details.

## Related Documentation

- [Task Types](./task-types.md) - Define custom task types with hooks
- [Quality Gates](./quality-gates.md) - Automated verification between tasks
- [Configuration](./configuration.md) - Full crew configuration reference
