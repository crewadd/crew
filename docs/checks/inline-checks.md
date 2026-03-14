# Inline Checks

**Custom check functions defined directly in tasks.**

[[docs](../README.md) > [checks](./README.md) > inline-checks]

---

## Overview

Inline checks let you define check logic directly in the task without registering it:

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test');
  return { passed: result.exitCode === 0 };
})
```

Useful for one-off logic or quick validations that don't need to be reused.

---

## Basic Usage

### Simple Check

```typescript
ctx.createTask('build', 'Build app')
  .check(async (ctx) => {
    const result = await ctx.tools.shell.run('npm run build');
    return { passed: result.exitCode === 0, output: result.stderr };
  })
```

### With Feedback

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test');

  if (result.exitCode === 0) {
    return { passed: true };
  }

  return {
    passed: false,
    output: result.stderr,
    feedback: 'Tests failed. Review errors above and fix the code.'
  };
})
```

---

## File Validation

### Check File Existence

```typescript
.check(async (ctx) => {
  const exists = await ctx.tools.file.exists('src/app/page.tsx');
  return {
    passed: exists,
    feedback: exists ? '' : 'page.tsx must exist'
  };
})
```

### Check Multiple Files

```typescript
.check(async (ctx) => {
  const required = ['src/index.ts', 'src/app.ts', 'src/config.ts'];
  const missing: string[] = [];

  for (const file of required) {
    if (!(await ctx.tools.file.exists(file))) {
      missing.push(file);
    }
  }

  return {
    passed: missing.length === 0,
    issues: missing,
    feedback: missing.length > 0
      ? `Missing files:\n${missing.join('\n')}`
      : ''
  };
})
```

### Glob Pattern Validation

```typescript
.check(async (ctx) => {
  const files = await ctx.tools.file.glob('src/components/**/*.tsx');

  return {
    passed: files.length > 0,
    feedback: files.length > 0
      ? `Found ${files.length} components`
      : 'No components found'
  };
})
```

---

## Content Validation

### Check File Contains

```typescript
.check(async (ctx) => {
  const content = await ctx.tools.file.read('src/api/routes.ts');

  const hasAuth = content.includes('authenticate');
  const hasValidation = content.includes('validate');

  if (!hasAuth || !hasValidation) {
    return {
      passed: false,
      feedback: 'API must have authentication and validation'
    };
  }

  return { passed: true };
})
```

### Parse and Validate

```typescript
.check(async (ctx) => {
  const content = await ctx.tools.file.read('package.json');
  const pkg = JSON.parse(content);

  const required = ['name', 'version', 'description', 'author'];
  const missing = required.filter(field => !pkg[field]);

  return {
    passed: missing.length === 0,
    feedback: missing.length > 0
      ? `package.json missing fields: ${missing.join(', ')}`
      : ''
  };
})
```

### Check for Anti-Patterns

```typescript
.check(async (ctx) => {
  const files = await ctx.tools.file.glob('src/**/*.ts');
  const issues: string[] = [];

  for (const file of files) {
    const content = await ctx.tools.file.read(file);

    if (content.includes('console.log')) {
      issues.push(`${file}: has console.log`);
    }

    if (content.includes('any')) {
      issues.push(`${file}: has 'any' type`);
    }

    if (content.match(/TODO|FIXME|HACK/)) {
      issues.push(`${file}: has TODO/FIXME comments`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    feedback: issues.length > 0
      ? `Code quality issues:\n${issues.join('\n')}`
      : ''
  };
})
```

---

## Command-Based Checks

### Run Tests

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test -- --coverage');

  const coverage = result.stdout.match(/Lines\s+:\s+(\d+)/)?.[1];

  return {
    passed: result.exitCode === 0 && (parseInt(coverage) >= 80),
    output: result.stdout,
    feedback: result.exitCode === 0
      ? `Coverage: ${coverage}%`
      : 'Tests failed'
  };
})
```

### Build Validation

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm run build');

  if (result.exitCode !== 0) {
    return {
      passed: false,
      feedback: `Build failed:\n${result.stderr}`
    };
  }

  // Verify build output
  const hasOutput = await ctx.tools.file.exists('dist/index.js');

  return {
    passed: hasOutput,
    feedback: hasOutput ? '' : 'Build succeeded but dist/index.js not found'
  };
})
```

---

## Complex Validations

### Multi-Step Check

```typescript
.check(async (ctx) => {
  const steps: {name: string, passed: boolean, message: string}[] = [];

  // Step 1: Type check
  let result = await ctx.tools.shell.run('npx tsc --noEmit');
  steps.push({ name: 'TypeScript', passed: result.exitCode === 0, message: result.stderr });

  // Step 2: Lint
  result = await ctx.tools.shell.run('npm run lint');
  steps.push({ name: 'Linting', passed: result.exitCode === 0, message: result.stderr });

  // Step 3: Build
  result = await ctx.tools.shell.run('npm run build');
  steps.push({ name: 'Build', passed: result.exitCode === 0, message: result.stderr });

  const failed = steps.filter(s => !s.passed);

  return {
    passed: failed.length === 0,
    issues: failed.map(s => `${s.name}: ${s.message}`),
    feedback: failed.length > 0
      ? `Failed steps:\n${failed.map(s => `- ${s.name}`).join('\n')}`
      : 'All checks passed'
  };
})
```

### Git Status Check

```typescript
.check(async (ctx) => {
  const status = await ctx.tools.git.status();

  if (status.includes('working tree clean')) {
    return { passed: true };
  }

  const diff = await ctx.tools.git.diff();

  return {
    passed: false,
    output: diff,
    feedback: 'Uncommitted changes found. Commit or stage your changes.'
  };
})
```

---

## Using Task Context

### Task-Specific Validation

```typescript
.check(async (ctx) => {
  // Access task metadata
  const { inputs, outputs } = ctx.task;

  if (!outputs) {
    return { passed: true };  // No outputs declared
  }

  // Verify outputs exist
  const missing: string[] = [];
  for (const pattern of outputs) {
    const files = await ctx.tools.file.glob(pattern);
    if (files.length === 0) {
      missing.push(pattern);
    }
  }

  return {
    passed: missing.length === 0,
    feedback: missing.length > 0
      ? `Expected outputs not found: ${missing.join(', ')}`
      : ''
  };
})
```

### Variable-Based Validation

```typescript
.check(async (ctx) => {
  const environment = ctx.vars.environment;

  if (environment === 'production') {
    // Stricter checks for production
    const result = await ctx.tools.shell.run('npm run test -- --coverage');
    const coverage = parseInt(result.stdout.match(/Lines\s+:\s+(\d+)/)?.[1] || '0');

    return {
      passed: result.exitCode === 0 && coverage >= 90,
      feedback: coverage < 90 ? 'Production requires 90% coverage' : ''
    };
  } else {
    // Relaxed checks for dev
    const result = await ctx.tools.shell.run('npm test');
    return { passed: result.exitCode === 0 };
  }
})
```

### Epic Context

```typescript
.check(async (ctx) => {
  // Check if all sibling tasks passed
  const siblings = ctx.epic.tasks;
  const allPassed = siblings.every(t =>
    t.id === ctx.taskId || t.status === 'done'
  );

  return {
    passed: allPassed,
    feedback: allPassed ? '' : 'Wait for other tasks in epic to complete'
  };
})
```

---

## Error Handling

### Try-Catch

```typescript
.check(async (ctx) => {
  try {
    const result = await ctx.tools.shell.run('npm run validate');
    return {
      passed: result.exitCode === 0,
      output: result.stderr
    };
  } catch (error) {
    ctx.log.warn('Validation check failed', { error: error.message });
    return {
      passed: false,
      feedback: `Validation error: ${error.message}`
    };
  }
})
```

### Timeout Handling

```typescript
.check(async (ctx) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Check timeout')), 30000)
  );

  try {
    const result = await Promise.race([
      ctx.tools.shell.run('npm run slow-check'),
      timeout
    ]);

    return { passed: result.exitCode === 0 };
  } catch (error) {
    return {
      passed: false,
      feedback: `Check timed out: ${error.message}`
    };
  }
})
```

---

## State Management

### Remember Check State

```typescript
.check(async (ctx) => {
  const previousStatus = ctx.state.get<boolean>('lastCheckPassed');

  const result = await ctx.tools.shell.run('npm test');
  const passed = result.exitCode === 0;

  ctx.state.set('lastCheckPassed', passed);

  return {
    passed,
    feedback: !passed && previousStatus
      ? 'Tests were passing, now broken!'
      : ''
  };
})
```

---

## Practical Examples

### React Component Validation

```typescript
.check(async (ctx) => {
  const files = await ctx.tools.file.glob('src/components/**/*.tsx');
  const issues: string[] = [];

  for (const file of files) {
    const content = await ctx.tools.file.read(file);

    // Check for export
    if (!content.includes('export')) {
      issues.push(`${file}: missing export`);
    }

    // Check for types
    if (!content.includes(': React.FC') && !content.match(/interface Props/)) {
      issues.push(`${file}: missing prop types`);
    }

    // Check for display name
    if (!content.includes('displayName') && !content.includes('.displayName')) {
      issues.push(`${file}: missing display name`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    feedback: issues.length > 0
      ? `Component issues:\n${issues.join('\n')}`
      : ''
  };
})
```

### Database Migration Safety

```typescript
.check(async (ctx) => {
  const migrations = await ctx.tools.file.glob('db/migrations/**/*.sql');

  for (const migration of migrations) {
    const content = await ctx.tools.file.read(migration);

    // Check for rollback
    if (!content.includes('-- rollback') && !content.includes('DROP TABLE')) {
      return {
        passed: false,
        feedback: `${migration}: must include rollback procedure`
      };
    }
  }

  return { passed: true };
})
```

### Test Coverage Check

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test -- --coverage --json');

  const coverage = JSON.parse(result.stdout).total;
  const threshold = ctx.vars.coverageThreshold || 70;

  return {
    passed: coverage.lines.pct >= threshold,
    feedback: `Coverage: ${coverage.lines.pct.toFixed(1)}% (required: ${threshold}%)`
  };
})
```

---

## Best Practices

### ✅ Do

- **Keep checks focused** — one concern per check
- **Provide detailed feedback** — agent needs specifics
- **Handle errors gracefully** — don't crash on failures
- **Use logging** — `ctx.log` helps with debugging
- **Test edge cases** — what if files don't exist?

### ❌ Don't

- **Check unrelated things** — split into multiple checks
- **Ignore errors** — log and report them
- **Long-running checks** — consider timeouts
- **Assume files exist** — always check first
- **Print to console** — use `ctx.log` instead

---

## Debugging

### Add Logging

```typescript
.check(async (ctx) => {
  ctx.log.debug('Starting inline check');

  const files = await ctx.tools.file.glob('src/**/*.ts');
  ctx.log.debug(`Found ${files.length} files`);

  // ... rest of check ...

  ctx.log.info('Inline check complete', { passed: true });
  return { passed: true };
})
```

### Test Locally

```typescript
// Extract into testable function
async function validateFiles(ctx) {
  const files = await ctx.tools.file.glob('src/**/*.ts');
  // ... validation logic ...
  return { passed: true };
}

// Test independently
const result = await validateFiles(mockContext);
console.log('Result:', result);
```

---

## See Also

- [Named Checks](./named-checks.md) — Reusable registry checks
- [Command Checks](./command-checks.md) — Shell command checks
- [Writing Custom Checks](./writing-custom-checks.md) — Creating reusable checks
- [Task Context](../task-api/task-context.md) — Available in checks
- [Fluent Builder](../task-api/fluent-builder.md) — `.check()` API

---

[← Back to Checks](./README.md) | [← Back to Documentation](../README.md)
