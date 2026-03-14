# Named Checks

**Registry-based quality gates: built-in and project-defined checks.**

[[docs](../README.md) > [checks](./README.md) > named-checks]

---

## Overview

Named checks are registered in your project and used by name:

```typescript
.check('tsc')
.check('build')
.check('lint')
```

Registration happens in `.crew/setup/index.ts`:

```typescript
export const checks = {
  tsc: async (ctx) => { /* check logic */ },
  build: async (ctx) => { /* check logic */ },
  lint: async (ctx) => { /* check logic */ }
};
```

---

## Built-In Checks (via Plugins)

Plugins provide common checks. These come from:

- **typescript** plugin: `tsc`
- **nextjs** plugin: `next-lint`, `next-build`
- **eslint** plugin: `eslint`
- **vitest** plugin: `test`, `coverage`
- **git** plugin: `git-clean`, `git-staged`
- **docker** plugin: `docker-build`

### TypeScript Plugin

```typescript
// Provided by TypeScript plugin
.check('tsc')  // npx tsc --noEmit
```

In setup:
```typescript
const typescriptPlugin: CrewPlugin = {
  setup(api) {
    api.addCheck('tsc', async (ctx) => {
      const result = await ctx.tools.shell.run('npx tsc --noEmit');
      return {
        passed: result.exitCode === 0,
        output: result.stderr
      };
    });
  }
};
```

### Build Plugin (Framework-Specific)

```typescript
.check('build')  // Runs npm run build
```

In setup:
```typescript
api.addCheck('build', async (ctx) => {
  const result = await ctx.tools.shell.run('npm run build');
  return {
    passed: result.exitCode === 0,
    output: result.stderr,
    feedback: result.exitCode === 0
      ? ''
      : `Build failed:\n${result.stderr}`
  };
});
```

### ESLint Plugin

```typescript
.check('eslint')
.check('eslint-fix')  // With auto-fix
```

In setup:
```typescript
api.addCheck('eslint', async (ctx) => {
  const result = await ctx.tools.shell.run('npm run lint');
  return {
    passed: result.exitCode === 0,
    output: result.stderr
  };
});

api.addCheck('eslint-fix', async (ctx, opts) => {
  if (opts?.autoFix) {
    await ctx.tools.shell.run('npm run lint -- --fix');
  }
  const result = await ctx.tools.shell.run('npm run lint');
  return { passed: result.exitCode === 0 };
});
```

### Vitest Plugin

```typescript
.check('test')           // npm run test
.check('test-coverage')  // With coverage threshold
.check('test-ui')        // Specific test file
```

---

## Using Named Checks

### Basic Usage

```typescript
ctx.createTask('api', 'Build API')
  .check('tsc')
  .check('build')
  .check('lint')
```

### With Options

```typescript
.check('format', { autoFix: true, maxRetries: 3 })
.check('eslint-fix', { autoFix: true })
```

Options are passed to the check function:

```typescript
api.addCheck('format', async (ctx, opts) => {
  if (opts.autoFix) {
    await ctx.tools.shell.run('npm run format -- --write');
  }

  const result = await ctx.tools.shell.run('npm run format:check');
  return {
    passed: result.exitCode === 0,
    output: result.stderr
  };
});
```

### Combining Named Checks

```typescript
.check('tsc')     // Type checking
.check('lint')    // Code style
.check('build')   // Compilation
.check('test')    // Unit tests
```

All run in parallel. If any fail, agent gets feedback to fix.

---

## Custom Project Checks

Define checks specific to your project:

```typescript
// .crew/setup/index.ts
export const checks = {
  // Component validation
  'components-typed': async (ctx) => {
    const files = await ctx.tools.file.glob('src/components/**/*.tsx');
    const issues: string[] = [];

    for (const file of files) {
      const content = await ctx.tools.file.read(file);
      if (!content.includes(': React.FC') && !content.match(/\(.*:\s*/)) {
        issues.push(`${file}: missing prop types`);
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      feedback: issues.length > 0
        ? `Add TypeScript prop types to components:\n${issues.join('\n')}`
        : ''
    };
  },

  // Database check
  'migrations-valid': async (ctx) => {
    const result = await ctx.tools.shell.run('npm run migrate:validate');
    return {
      passed: result.exitCode === 0,
      output: result.stderr,
      feedback: result.exitCode === 0
        ? ''
        : `Migration validation failed:\n${result.stderr}`
    };
  },

  // Security check
  'no-secrets': async (ctx) => {
    const result = await ctx.tools.shell.run(
      'grep -r "password\\|api_key\\|secret" src/ --include="*.ts" --include="*.tsx"'
    );

    const found = result.stdout.split('\n').filter(l => l);
    return {
      passed: result.exitCode !== 0,
      issues: found,
      feedback: found.length > 0
        ? `Found potential secrets in code. Remove:\n${found.join('\n')}`
        : ''
    };
  },

  // File structure check
  'has-exports': async (ctx) => {
    const files = await ctx.tools.file.glob('src/**/*.ts');
    const missing: string[] = [];

    for (const file of files) {
      const content = await ctx.tools.file.read(file);
      if (!content.includes('export ') && !file.includes('.test.')) {
        missing.push(file);
      }
    }

    return {
      passed: missing.length === 0,
      issues: missing,
      feedback: missing.length > 0
        ? `These files don't export anything:\n${missing.join('\n')}`
        : ''
    };
  }
};
```

Then use in tasks:

```typescript
ctx.createTask('components', 'Create components')
  .check('tsc')
  .check('components-typed')
  .check('build')

ctx.createTask('migrations', 'Create database migrations')
  .check('migrations-valid')
  .check('build')

ctx.createTask('api', 'Build API')
  .check('no-secrets')
  .check('tsc')
  .check('build')

ctx.createTask('structure', 'Structure codebase')
  .check('has-exports')
  .check('tsc')
```

---

## Check with Context

Checks receive the full `TaskContext`:

```typescript
api.addCheck('context-aware', async (ctx) => {
  // Access task info
  ctx.log.info(`Checking task: ${ctx.task.title}`);

  // Access files
  const inputs = ctx.task.inputs || [];
  ctx.log.debug(`Input files: ${inputs.join(', ')}`);

  // Access variables
  const environment = ctx.vars.environment;

  // Use state
  const previousPassed = ctx.state.get<boolean>('previousCheck');

  // Run commands
  const result = await ctx.tools.shell.run('echo "Checking..."');

  return {
    passed: result.exitCode === 0,
    output: result.stdout
  };
});
```

---

## Auto-Fix Checks

Checks can automatically fix issues:

```typescript
api.addCheck('autofix-imports', async (ctx, opts) => {
  if (opts?.autoFix) {
    // Automatically fix import order
    await ctx.tools.shell.run('npm run lint -- --fix-imports');
  }

  const result = await ctx.tools.shell.run('npm run lint:imports');
  return {
    passed: result.exitCode === 0,
    output: result.stderr
  };
});
```

Usage:

```typescript
.check('autofix-imports', { autoFix: true })
```

---

## Checks from Plugins

### Enabling Plugins

In `crew.json`:

```json
{
  "plugins": [
    "typescript",
    "eslint",
    "vitest",
    ["nextjs", { "appDir": true }],
    ["docker", { "registry": "gcr.io/my-project" }]
  ]
}
```

### Available Checks by Plugin

**TypeScript**
- `tsc` — Type checking

**ESLint**
- `eslint` — Linting
- `eslint-fix` — Linting with auto-fix

**Vitest**
- `test` — Run all tests
- `test-ui` — Test specific component
- `coverage` — Check coverage threshold

**Next.js**
- `next-build` — Next.js build
- `next-lint` — Next.js linting

**Git**
- `git-clean` — No uncommitted changes
- `git-staged` — Changes are staged

**Docker**
- `docker-build` — Build image

---

## Combining Strategies

### Plugin Checks + Custom Checks

```typescript
export const checks = {
  // Plugin-provided (from typescript plugin)
  // 'tsc' comes from plugin

  // Custom addition
  'strict-mode': async (ctx) => {
    const result = await ctx.tools.shell.run('npx tsc --strict');
    return {
      passed: result.exitCode === 0,
      feedback: result.exitCode === 0
        ? ''
        : 'Enable TypeScript strict mode'
    };
  }
};
```

Usage:

```typescript
.check('tsc')           // From plugin
.check('strict-mode')   // Custom
.check('build')         // From plugin
```

---

## Error Handling in Checks

### Graceful Failure

```typescript
api.addCheck('risky-check', async (ctx) => {
  try {
    const result = await ctx.tools.shell.run('npm run expensive-check');
    return {
      passed: result.exitCode === 0,
      output: result.stderr
    };
  } catch (error) {
    ctx.log.warn('Check failed to run', { error: error.message });
    return {
      passed: false,
      feedback: 'Check encountered an error'
    };
  }
});
```

### Timeout Handling

```typescript
api.addCheck('timeout-check', async (ctx) => {
  const result = await Promise.race([
    ctx.tools.shell.run('npm run slow-check'),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30000)
    )
  ]).catch(error => {
    return {
      passed: false,
      feedback: `Check timed out: ${error.message}`
    };
  });

  return result;
});
```

---

## Practical Examples

### Multi-Check Task

```typescript
ctx.createTask('complete-build', 'Full build pipeline')
  .prompt('Build application with all checks')
  .check('tsc')           // TypeScript
  .check('eslint')        // Linting
  .check('test')          // Tests
  .check('build')         // Build
  .check('no-secrets')    // Custom
  .check('components-typed')  // Custom
  .attempts(5)
```

### Framework-Specific Checks

```typescript
ctx.createTask('nextjs-app', 'Build Next.js app')
  .check('tsc')
  .check('next-lint')
  .check('next-build')
  .check('test')
```

### Database Task

```typescript
ctx.createTask('db-migration', 'Create migration')
  .check('migrations-valid')
  .check('git-clean')      // No uncommitted changes
  .attempts(3)
```

---

## Best Practices

### ✅ Do

- **Compose multiple checks** — each check one concern
- **Provide clear feedback** — agent needs actionable info
- **Use auto-fix for fixable issues** — saves retry loops
- **Test checks locally** — verify they work
- **Document check behavior** — what passes/fails

### ❌ Don't

- **Combine unrelated checks** — keep focused
- **Vague feedback** — be specific
- **Silent failures** — always return clear results
- **Long-running checks** — consider timeouts
- **Check the same thing twice** — avoid redundancy

---

## Debugging

### List Available Checks

```bash
crew status --checks
```

Shows all registered checks and their sources.

### Test a Check

```bash
crew verify --check tsc
crew verify --check my-custom-check
```

---

## See Also

- [Writing Custom Checks](./writing-custom-checks.md) — Custom check development
- [Command Checks](./command-checks.md) — Inline shell commands
- [Prompt Checks](./prompt-checks.md) — AI-powered validation
- [Inline Checks](./inline-checks.md) — Inline functions
- [Fluent Builder](../task-api/fluent-builder.md) — `.check()` API
- [Plugins: Using](../plugins/using-plugins.md) — Plugin configuration

---

[← Back to Checks](./README.md) | [← Back to Documentation](../README.md)
