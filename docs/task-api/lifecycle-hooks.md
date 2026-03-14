# Lifecycle Hooks

**React to task events with onStart, onComplete, onFail, and shouldStart hooks.**

[[docs](../README.md) > [task-api](./README.md) > lifecycle-hooks]

---

## Overview

Lifecycle hooks let you run code before, during, and after task execution. They're called at specific points in the task lifecycle and receive the `TaskContext` to access files, shell, git, logging, and state.

**Hook execution order:**

```
1. shouldStart() → checks if task should run
2. onStart() → runs before execution
3. execute() → the main task
4. checks → quality gates run
5. Pass: onComplete() → after all checks pass
   Fail: retry or onFail() → after all retries exhausted
```

---

## shouldStart Hook

### `shouldStart(fn: (ctx) => boolean | Promise<boolean>)`

Runs *before* task execution to determine if the task should run.

If it returns `false`, the task is skipped (status: `done`).

```typescript
ctx.createTask('deploy', 'Deploy to production')
  .shouldStart(async (ctx) => {
    // Only deploy if all tests pass
    const testResult = await ctx.tools.shell.run('npm test');
    return testResult.exitCode === 0;
  })
```

**Common patterns:**

```typescript
// 1. Check environment
.shouldStart(ctx => {
  return ctx.vars.environment === 'production';
})

// 2. Verify prerequisites
.shouldStart(async (ctx) => {
  const exists = await ctx.tools.file.exists('build/index.js');
  return exists;
})

// 3. Check git status
.shouldStart(async (ctx) => {
  const status = await ctx.tools.git.status();
  return !status.includes('nothing to commit');
})

// 4. Conditional based on task output
.shouldStart(async (ctx) => {
  // Only run if a previous task produced expected output
  const prevTask = ctx.epic.tasks.find(t => t.id === 'setup');
  return prevTask?.status === 'done';
})
```

**Note:** `shouldStart` is different from `.when()` in the task definition. Use:
- `.when()` for conditional inclusion in the plan (at plan time)
- `.shouldStart()` for runtime decisions (at execution time)

---

## onStart Hook

### `onStart(fn: (ctx) => void | Promise<void>)`

Runs after `shouldStart` returns true but *before* task execution.

Use for setup, logging, or pre-execution checks.

```typescript
ctx.createTask('build', 'Build application')
  .onStart(async (ctx) => {
    ctx.log.info('Build started', {
      version: ctx.vars.version,
      target: ctx.vars.target
    });

    // Clean build directory
    await ctx.tools.shell.run('rm -rf dist');

    // Verify prerequisites
    const nodeVersion = await ctx.tools.shell.run('node --version');
    ctx.log.debug(`Node version: ${nodeVersion.stdout}`);
  })
```

**Common patterns:**

```typescript
// 1. Clean up previous artifacts
.onStart(async (ctx) => {
  await ctx.tools.shell.run('rm -rf dist build');
})

// 2. Log task details
.onStart(async (ctx) => {
  ctx.log.info(`Starting ${ctx.task.title}`, {
    id: ctx.taskId,
    epic: ctx.epic.title,
    inputs: ctx.task.inputs,
    outputs: ctx.task.outputs
  });
})

// 3. Pre-flight checks
.onStart(async (ctx) => {
  const envResult = await ctx.tools.shell.run('which node && which npm');
  if (envResult.exitCode !== 0) {
    throw new Error('Node.js not found in PATH');
  }
})

// 4. Print state from previous runs
.onStart(async (ctx) => {
  if (ctx.state.has('previousAttempts')) {
    const attempts = ctx.state.get<number>('previousAttempts');
    ctx.log.warn(`Retrying (attempt ${attempts + 1})`);
    ctx.state.set('previousAttempts', attempts + 1);
  } else {
    ctx.state.set('previousAttempts', 1);
  }
})

// 5. Prepare environment variables
.onStart(async (ctx) => {
  const env = {
    NODE_ENV: ctx.vars.environment,
    BUILD_VERSION: ctx.vars.version,
    LOG_LEVEL: 'debug'
  };
  ctx.state.set('buildEnv', env);
})
```

---

## onComplete Hook

### `onComplete(fn: (ctx, result) => void | Promise<void>)`

Runs *after* all checks pass.

Use for cleanup, logging completion, or post-execution actions.

```typescript
ctx.createTask('deploy', 'Deploy to production')
  .onComplete(async (ctx, result) => {
    ctx.log.info('Deployment successful', {
      duration: result.durationMs,
      output: result.output
    });

    // Commit deployment record
    await ctx.tools.git.add(['deploy.log']);
    await ctx.tools.git.commit('chore: deployed to production');
  })
```

**Common patterns:**

```typescript
// 1. Commit changes
.onComplete(async (ctx, result) => {
  const files = result.files || ['src/**/*.ts'];
  await ctx.tools.git.add(files);
  await ctx.tools.git.commit(`feat: ${ctx.task.title}`);
})

// 2. Generate report
.onComplete(async (ctx, result) => {
  const report = `
# Task Report: ${ctx.task.title}

- Duration: ${(result.durationMs / 1000).toFixed(2)}s
- Success: ${result.success}
- Output files: ${result.files?.join(', ') || 'none'}

${result.output || ''}
`;
  await ctx.tools.file.write(`${ctx.taskDir}/report.md`, report);
})

// 3. Cleanup temporary files
.onComplete(async (ctx, result) => {
  if (ctx.state.has('tempFiles')) {
    const files = ctx.state.get<string[]>('tempFiles') || [];
    for (const file of files) {
      await ctx.tools.shell.run(`rm -f ${file}`);
    }
    ctx.state.delete('tempFiles');
  }
})

// 4. Send notifications
.onComplete(async (ctx, result) => {
  ctx.log.info('Sending notifications...', { task: ctx.taskId });
  // Could integrate with Slack, email, webhooks, etc.
})

// 5. Update status tracking
.onComplete(async (ctx, result) => {
  const completed = ctx.state.get<number>('completedSteps') || 0;
  ctx.state.set('completedSteps', completed + 1);
  ctx.log.info(`Progress: ${completed + 1}/${ctx.epic.tasks.length} steps complete`);
})
```

---

## onFail Hook

### `onFail(fn: (ctx, error) => void | Promise<void>)`

Runs *after* all retry attempts exhausted and task still fails.

Use for error handling, cleanup, rollback, or alerting.

```typescript
ctx.createTask('deploy-database', 'Deploy database changes')
  .onFail(async (ctx, error) => {
    ctx.log.error('Deployment failed, rolling back...', {
      error: error.message,
      task: ctx.taskId
    });

    // Rollback migration
    await ctx.tools.shell.run('npm run migrate:rollback');
  })
```

**Common patterns:**

```typescript
// 1. Rollback on failure
.onFail(async (ctx, error) => {
  ctx.log.warn('Rolling back changes...');
  await ctx.tools.git.run('checkout -- .');
  await ctx.tools.shell.run('npm run cleanup');
})

// 2. Generate error report
.onFail(async (ctx, error) => {
  const report = `
# Error Report: ${ctx.task.title}

**Error:** ${error.message}
**Task:** ${ctx.taskId}
**Epic:** ${ctx.epic.title}

## Debug Info
${error.stack}
`;
  await ctx.tools.file.write(`${ctx.taskDir}/error.md`, report);
})

// 3. Disable dependent tasks
.onFail(async (ctx, error) => {
  ctx.log.warn('Task failed; dependent tasks will be skipped');
  // The framework automatically handles this
})

// 4. Alert on critical failure
.onFail(async (ctx, error) => {
  if (ctx.vars.environment === 'production') {
    ctx.log.error('CRITICAL: Production task failed', {
      task: ctx.task.title,
      error: error.message
    });
    // Send alert
  }
})

// 5. Preserve logs
.onFail(async (ctx, error) => {
  const logs = ctx.state.get<string>('executionLogs') || '';
  await ctx.tools.file.write(`${ctx.taskDir}/failure.log`, logs);
})
```

---

## Complete Example

Here's a task with all hooks working together:

```typescript
ctx.createTask('build-and-deploy', 'Build and deploy application')
  .prompt('Build the application and deploy to staging')
  .shouldStart(async (ctx) => {
    // Only proceed if code is committed
    const status = await ctx.tools.git.status();
    const hasUncommitted = !status.includes('nothing to commit');

    if (hasUncommitted) {
      ctx.log.warn('Uncommitted changes detected');
      return false;
    }

    return true;
  })
  .onStart(async (ctx) => {
    ctx.log.info('Build starting', {
      version: ctx.vars.version,
      target: 'staging'
    });

    // Clean build artifacts
    await ctx.tools.shell.run('rm -rf dist');

    // Mark attempt
    const attempts = (ctx.state.get<number>('buildAttempts') || 0) + 1;
    ctx.state.set('buildAttempts', attempts);
    ctx.log.debug(`Build attempt ${attempts}`);
  })
  .check('tsc')
  .check('build')
  .check({ cmd: 'npm test' })
  .attempts(3)
  .onComplete(async (ctx, result) => {
    ctx.log.info('Build completed successfully', {
      duration: `${(result.durationMs / 1000).toFixed(2)}s`,
      files: result.files?.length || 0
    });

    // Commit build record
    await ctx.tools.file.write('dist/BUILD_INFO.txt', `
Built at: ${new Date().toISOString()}
Version: ${ctx.vars.version}
Task: ${ctx.taskId}
    `.trim());

    await ctx.tools.git.add(['dist/BUILD_INFO.txt']);
    await ctx.tools.git.commit(`build: ${ctx.vars.version}`);
  })
  .onFail(async (ctx, error) => {
    ctx.log.error('Build failed after retries', {
      error: error.message,
      attempts: ctx.state.get<number>('buildAttempts')
    });

    // Save failure diagnostics
    const diagnostics = `
Build failed: ${error.message}
Task: ${ctx.taskId}
Attempts: ${ctx.state.get<number>('buildAttempts')}
`;
    await ctx.tools.file.write(`${ctx.taskDir}/BUILD_FAILED.txt`, diagnostics);
  })
```

---

## Hook Error Handling

Hooks should not throw exceptions. If they do:

1. **shouldStart** throwing → task marked as failed
2. **onStart** throwing → task marked as failed
3. **onComplete** throwing → logged but doesn't fail task
4. **onFail** throwing → logged but doesn't re-fail task

Best practice: wrap in try-catch:

```typescript
.onComplete(async (ctx, result) => {
  try {
    await ctx.tools.git.commit('chore: build complete');
  } catch (error) {
    ctx.log.warn('Failed to commit', { error: error.message });
    // Don't throw — task already succeeded
  }
})

.onFail(async (ctx, error) => {
  try {
    await sendAlert('Task failed: ' + ctx.task.title);
  } catch (alertError) {
    ctx.log.error('Failed to send alert', { error: alertError.message });
    // Don't throw
  }
})
```

---

## Hook Ordering Across Types

When task types and task-specific hooks both exist:

```typescript
// Define a task type with onStart hook
api.addTaskType({
  name: 'backend',
  defaults: {
    async onStart(ctx) {
      ctx.log.info('Backend task starting');
    }
  }
});

// Task-specific hook runs *after* type hook
ctx.createTask('auth', 'Implement auth')
  .ofType('backend')  // Type's onStart runs first
  .onStart(async (ctx) => {
    ctx.log.info('Auth-specific startup');  // This runs second
  })
```

Order:
1. Type's `onStart`
2. Task's `onStart`
3. Task execution
4. Task's `onComplete` (if success) or `onFail` (if fail)
5. Type's `onComplete`/`onFail`

---

## State Across Hooks

Use `ctx.state` to share data between hooks:

```typescript
.onStart(async (ctx) => {
  // Calculate once in onStart
  const nodeVersion = await ctx.tools.shell.run('node --version');
  ctx.state.set('nodeVersion', nodeVersion.stdout.trim());
})
.onComplete(async (ctx, result) => {
  // Reuse in onComplete
  const nodeVersion = ctx.state.get<string>('nodeVersion');
  ctx.log.info('Build completed', { nodeVersion });
})
```

---

## Async Patterns

All hooks support async/await. The framework waits for completion:

```typescript
// Sequential operations
.onStart(async (ctx) => {
  await operation1();
  await operation2();
  await operation3();
})

// Parallel operations
.onStart(async (ctx) => {
  await Promise.all([
    operation1(),
    operation2(),
    operation3()
  ]);
})

// Error handling
.onStart(async (ctx) => {
  try {
    await riskyOperation();
  } catch (error) {
    ctx.log.error('Operation failed', { error: error.message });
    // Continue or throw
  }
})
```

---

## Practical Examples

### Multi-Step Build Pipeline

```typescript
const steps = [];

ctx.createTask('build-pipeline', 'Full build pipeline')
  .onStart(async (ctx) => {
    steps.length = 0;
    ctx.log.info('Starting build pipeline');
  })
  .onStart(async (ctx) => {
    steps.push('lint');
    ctx.log.info('Step 1: Linting');
    const result = await ctx.tools.shell.run('npm run lint');
    if (result.exitCode !== 0) throw new Error('Lint failed');
  })
  .onStart(async (ctx) => {
    steps.push('test');
    ctx.log.info('Step 2: Testing');
    const result = await ctx.tools.shell.run('npm test');
    if (result.exitCode !== 0) throw new Error('Tests failed');
  })
  .onComplete(async (ctx, result) => {
    ctx.log.info(`Pipeline complete: ${steps.join(' → ')}`);
  })
```

### Deployment with Rollback

```typescript
ctx.createTask('deploy', 'Deploy to production')
  .onStart(async (ctx) => {
    // Save current state for rollback
    const current = await ctx.tools.git.status();
    ctx.state.set('preDeployState', current);
  })
  .onComplete(async (ctx, result) => {
    ctx.log.info('Deployment successful');
    await ctx.tools.git.add(['DEPLOYMENT_LOG.txt']);
    await ctx.tools.git.commit('chore: deployed to production');
  })
  .onFail(async (ctx, error) => {
    ctx.log.error('Deployment failed, rolling back...');
    const preState = ctx.state.get<string>('preDeployState');
    // Attempt rollback
    await ctx.tools.git.run('checkout -- .');
  })
```

### Database Migration with Verification

```typescript
ctx.createTask('db-migration', 'Run database migration')
  .onStart(async (ctx) => {
    ctx.log.info('Backing up database...');
    await ctx.tools.shell.run('pg_dump mydb > backup.sql');
  })
  .onComplete(async (ctx, result) => {
    ctx.log.info('Verifying migration...');
    const check = await ctx.tools.shell.run('npm run verify:migration');
    if (check.exitCode !== 0) {
      throw new Error('Migration verification failed');
    }
  })
  .onFail(async (ctx, error) => {
    ctx.log.error('Migration failed, restoring backup...');
    await ctx.tools.shell.run('psql mydb < backup.sql');
  })
```

---

## See Also

- [Fluent Builder](./fluent-builder.md) - Hook configuration
- [Task Context](./task-context.md) - Available in hooks
- [Checks](./checks.md) - Quality gates running between onStart and onComplete
- [Planning Phase](./planning-phase.md) - Planning hooks
- [Guides: Debugging](../guides/debugging-tasks.md) - Using hooks for debugging

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
