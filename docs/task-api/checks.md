# Checks & Quality Gates

**Five types of checks to verify task correctness.**

[[docs](../README.md) > [task-api](./README.md) > checks]

---

## Overview

Checks are quality gates that run after task execution to verify correctness. If checks fail, the framework automatically feeds back to the agent for refinement (up to `maxAttempts`).

**Five check types:**

1. **Named checks** — from project registry
2. **Inline checks** — custom functions
3. **Command checks** — shell commands
4. **Prompt checks** — AI-powered validation
5. **Harness checks** — synthesized validation (AutoHarness)

```typescript
ctx.createTask('api', 'Build API')
  .check('tsc')                                    // Named check
  .check({ cmd: 'npm test' })                      // Command check
  .check(async (ctx) => { ... })                   // Inline check
  .check({ prompt: 'Verify error handling' })     // Prompt check
  .harness()                                       // Harness check
```

---

## How Checks Work

### Execution Flow

```
Task completes
    ↓
All checks run (in parallel)
    ↓
All pass? → task done
    ↓
Any fail? → Extract feedback
    ↓
Send to agent: "Check X failed: details. Fix and re-run."
    ↓
Agent attempts fix
    ↓
Re-run checks
    ↓
Repeat until: all pass OR maxAttempts reached
```

### Check Result

Every check returns a `CheckResult`:

```typescript
interface CheckResult {
  passed: boolean;
  output?: string;        // Raw output for logging
  issues?: string[];      // List of issues found
  feedback?: string;      // Structured feedback for agent
}
```

The `feedback` field is key — it's what the agent reads:

```typescript
// Good feedback (agent can act on this)
{
  passed: false,
  feedback: 'TypeScript errors found:\n- src/api.ts:12: missing type annotation\n- src/auth.ts:5: unused variable'
}

// Less useful (agent can't fix)
{
  passed: false,
  output: 'error TS2322: Type \'string\' is not assignable to type \'number\''
}
```

---

## Named Checks

### Basic Usage

```typescript
.check('tsc')
.check('build')
.check('lint')
```

Named checks are registered in your project's setup:

```typescript
// .crew/setup/index.ts
export const checks = {
  tsc: async (ctx) => {
    const result = await ctx.tools.shell.run('npx tsc --noEmit');
    return { passed: result.exitCode === 0, output: result.stderr };
  },

  build: async (ctx) => {
    const result = await ctx.tools.shell.run('npm run build');
    return { passed: result.exitCode === 0, output: result.stderr };
  },

  lint: async (ctx) => {
    const result = await ctx.tools.shell.run('npm run lint');
    return { passed: result.exitCode === 0, output: result.stderr };
  }
};
```

### With Options

```typescript
.check('format', { autoFix: true, maxRetries: 3 })
```

Options are passed to the check function:

```typescript
export const checks = {
  format: async (ctx, opts) => {
    if (opts.autoFix) {
      await ctx.tools.shell.run('npm run format:fix');
    }

    const result = await ctx.tools.shell.run('npm run format:check');
    return { passed: result.exitCode === 0, output: result.stderr };
  }
};
```

---

## Inline Checks

### Function Form

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm test');
  return {
    passed: result.exitCode === 0,
    output: result.stderr,
    feedback: result.exitCode === 0 ? '' : 'Tests failed. Fix broken tests.'
  };
})
```

### Checking File Existence

```typescript
.check(async (ctx) => {
  const files = await ctx.tools.file.glob('src/components/**/*.tsx');

  if (files.length === 0) {
    return {
      passed: false,
      feedback: 'No components found in src/components/'
    };
  }

  return { passed: true };
})
```

### Parsing Output

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm run lint');

  if (result.exitCode === 0) {
    return { passed: true };
  }

  // Parse lint errors
  const lines = result.stderr.split('\n');
  const issues = lines.filter(l => l.includes('error'));

  return {
    passed: false,
    issues,
    feedback: `Linting failed with ${issues.length} errors. See details above.`
  };
})
```

### Validating Content

```typescript
.check(async (ctx) => {
  const content = await ctx.tools.file.read('src/app/page.tsx');

  const hasExportDefault = content.includes('export default');
  const hasTypeScript = content.includes(': React.FC');

  if (!hasExportDefault) {
    return {
      passed: false,
      feedback: 'Component must have default export'
    };
  }

  if (!hasTypeScript) {
    return {
      passed: false,
      feedback: 'Component should be typed with React.FC'
    };
  }

  return { passed: true };
})
```

### Checking Multiple Conditions

```typescript
.check(async (ctx) => {
  const files = await ctx.tools.file.glob('src/**/*.ts');

  const issues: string[] = [];

  for (const file of files) {
    const content = await ctx.tools.file.read(file);

    if (content.includes('console.log')) {
      issues.push(`${file}: contains console.log`);
    }

    if (content.includes('any')) {
      issues.push(`${file}: contains 'any' type`);
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      issues,
      feedback: `Found ${issues.length} quality issues:\n${issues.join('\n')}`
    };
  }

  return { passed: true };
})
```

---

## Command Checks

### Basic Form

```typescript
.check({ cmd: 'test -f src/app/page.tsx' })
.check({ cmd: 'npm test' })
.check({ cmd: 'grep -q "export default" src/api.ts' })
```

Command checks pass if exit code is 0.

### With Custom Name

```typescript
.check({
  cmd: 'test -d node_modules',
  name: 'dependencies-installed'
})
```

### With Working Directory

```typescript
.check({
  cmd: 'cargo test',
  cwd: 'native-module'
})
```

### Combining Multiple Commands

```typescript
.check({
  cmd: 'npm run lint && npm run test && npm run build',
  name: 'full-pipeline'
})
```

### Checking File Properties

```typescript
.check({ cmd: 'test -f dist/index.js', name: 'build-output-exists' })
.check({ cmd: 'test -s dist/index.js', name: 'build-output-not-empty' })
.check({ cmd: 'find src -name "*.test.ts" | wc -l | grep -q "^[1-9]"', name: 'tests-exist' })
```

---

## Prompt Checks

### AI-Powered Validation

```typescript
.check({
  prompt: 'Verify all React components have TypeScript types'
})

.check({
  prompt: 'Check that API endpoints validate input parameters',
  name: 'api-validation'
})
```

Prompt checks:
1. Take the task's output files
2. Pass them to an AI evaluator
3. Evaluator reads files and checks against the prompt
4. Returns pass/fail + structured feedback

### Specific Files

```typescript
.check({
  prompt: 'Verify components export named exports, not default',
  files: ['src/components/**/*.tsx']
})
```

Without `files`, uses task's declared `outputs`.

### Examples

**React Component Check:**
```typescript
.check({
  prompt: `Verify each component:
  - Has TypeScript types for all props
  - Uses React.FC or functional syntax
  - Includes proper error boundaries
  - Has display name set`,
  files: ['src/components/**/*.tsx'],
  name: 'component-quality'
})
```

**API Endpoint Check:**
```typescript
.check({
  prompt: `For each API endpoint:
  - Input validation is present
  - Error responses use proper HTTP status codes
  - Response types are documented with JSDoc`,
  files: ['src/api/routes/**/*.ts'],
  name: 'api-design'
})
```

**Database Migration Check:**
```typescript
.check({
  prompt: `Verify the migration:
  - Includes both up() and down() functions
  - Down() is a proper rollback
  - Column types are correct
  - Indexes are added for foreign keys`,
  files: ['db/migrations/**/*.sql'],
  name: 'migration-quality'
})
```

---

## AutoHarness Checks

### Basic Usage

```typescript
ctx.createTask('nav', 'Build accessible navigation')
  .prompt('Create navbar with ARIA labels and keyboard navigation')
  .harness()
```

The framework:
1. LLM reads task prompt and inputs
2. Generates validation code as `harness.js`
3. Runs harness deterministically after each execution
4. Issues found trigger agent refinement
5. Harness can be refined itself (learns from feedback)

See [AutoHarness Guide](../HARNESS.md) for complete documentation.

---

## Combining Checks

### Multiple Checks in Sequence

```typescript
ctx.createTask('api', 'Build REST API')
  .check('tsc')                           // 1. Type check
  .check('build')                         // 2. Build succeeds
  .check({ cmd: 'npm test' })            // 3. Tests pass
  .check({                                // 4. AI validation
    prompt: 'Verify all endpoints have auth middleware'
  })
  .harness({                              // 5. AutoHarness
    prompt: 'Check error responses are consistent'
  })
  .attempts(5)                            // Retry up to 5 times
```

All checks run in parallel, but if any fail, all retry together.

### Conditional Checks

```typescript
ctx.createTask('platform-specific', 'Build')
  .when(vars => vars.platform === 'web')
  .check('tsc')
  .check('build')

// Or with dynamic logic:
.check(async (ctx) => {
  if (ctx.vars.environment === 'production') {
    const result = await ctx.tools.shell.run('npm run test:e2e');
    return { passed: result.exitCode === 0 };
  }
  return { passed: true };  // Skip in non-prod
})
```

### Check Dependencies

Some checks depend on others:

```typescript
ctx.createTask('app', 'Build app')
  .check('lint')              // Must pass
  .check('tsc')               // Must pass
  .check('build')             // Can only run if tsc passes
  .check('test')              // Can only run if build passes
```

The framework doesn't automatically handle this — you handle it:

```typescript
.check(async (ctx) => {
  // Only run expensive tests if build succeeded
  const state = ctx.state.get<boolean>('buildPassed');
  if (!state) {
    return { passed: true };  // Skip
  }

  const result = await ctx.tools.shell.run('npm run test:e2e');
  return { passed: result.exitCode === 0 };
})
```

---

## Check Result Patterns

### Detailed Feedback

```typescript
.check(async (ctx) => {
  const issues: string[] = [];

  const files = await ctx.tools.file.glob('src/**/*.ts');
  for (const file of files) {
    const content = await ctx.tools.file.read(file);
    if (content.includes('console.log')) {
      issues.push(`${file}: contains console.log`);
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      issues,
      feedback: `Found ${issues.length} debug statements. Remove them:\n${issues.join('\n')}`
    };
  }

  return { passed: true };
})
```

### Partial Success

```typescript
.check(async (ctx) => {
  const result = await ctx.tools.shell.run('npm run lint');

  // Warnings are OK, errors are not
  const hasErrors = result.stderr.includes('error');
  const warnings = result.stderr.split('\n').filter(l => l.includes('warning')).length;

  return {
    passed: !hasErrors,
    output: result.stderr,
    issues: hasErrors ? ['Lint errors found'] : [],
    feedback: hasErrors
      ? `Fix lint errors:\n${result.stderr}`
      : `Lint warnings: ${warnings} (acceptable)`
  };
})
```

### Timeout Handling

```typescript
.check(async (ctx) => {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30000)
    );

    const result = Promise.race([
      ctx.tools.shell.run('npm run test'),
      timeout
    ]);

    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      feedback: 'Tests timed out. Check for infinite loops or blocked I/O.'
    };
  }
})
```

---

## Best Practices

### ✅ Do

- **Be specific in feedback** — agent can only fix what you tell it
- **Use multiple checks** — catch different categories of errors
- **Include context** — file paths, line numbers when possible
- **Set reasonable maxAttempts** — 3-5 for most cases
- **Test checks locally** — verify they actually work

### ❌ Don't

- **Vague feedback** — "something is wrong" doesn't help
- **One giant check** — split into focused checks
- **Set maxAttempts too high** — wastes time and money
- **Ignore check output** — logs are valuable for debugging
- **Check for perfection** — be pragmatic about pass criteria

---

## Debugging Checks

### View Check Output

```bash
crew status --verbose
```

Shows each check result and feedback.

### Test Check Locally

```typescript
const ctx = {
  tools: { shell: { run: (...) => ... } },
  log: { info: (...) => console.log(...) }
};

const result = await myCheckFunction(ctx);
console.log('Result:', result);
```

### Add Logging

```typescript
.check(async (ctx) => {
  ctx.log.debug('Running check', { timestamp: Date.now() });

  const result = await ctx.tools.shell.run('npm test');
  ctx.log.debug('Check result', { exitCode: result.exitCode });

  return {
    passed: result.exitCode === 0,
    output: result.stderr,
    feedback: result.exitCode === 0 ? '' : 'Tests failed'
  };
})
```

### Conditional Debugging

```typescript
.check(async (ctx) => {
  const debug = ctx.vars.debug === true;

  if (debug) {
    ctx.log.info('DEBUG: Starting check...');
    const status = await ctx.tools.git.status();
    ctx.log.info('DEBUG: Git status', { status });
  }

  const result = await ctx.tools.shell.run('npm test');
  return { passed: result.exitCode === 0 };
})
```

---

## See Also

- [Writing Custom Checks](../checks/writing-custom-checks.md) — Project-level check registry
- [Named Checks](../checks/named-checks.md) — Built-in and plugin checks
- [Fluent Builder](./fluent-builder.md) — `.check()` configuration
- [AutoHarness](../HARNESS.md) — Synthesized validation
- [Guides: Debugging](../guides/debugging-tasks.md) — Debugging failed checks

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
