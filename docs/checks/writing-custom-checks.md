# Writing Custom Checks

**Create project-level checks and register them in the check registry.**

[[docs](../README.md) > [checks](./README.md) > writing-custom-checks]

---

## Overview

Custom checks let you define reusable validation logic for your project:

```typescript
// .crew/setup/index.ts
export const checks = {
  'my-custom-check': async (ctx) => {
    // Your validation logic
    return { passed: true };
  }
};
```

Then use by name:

```typescript
.check('my-custom-check')
```

---

## Basic Check Template

```typescript
// .crew/setup/index.ts
export const checks = {
  'check-name': async (ctx: TaskContext) => {
    // Validation logic here
    const passed = /* determine if passed */;

    return {
      passed,
      output?: 'Raw output for logs',
      issues?: ['Issue 1', 'Issue 2'],
      feedback?: 'Feedback for agent on failure'
    };
  }
};
```

---

## Check Anatomy

```typescript
export const checks = {
  // 1. Check name (how it's referenced)
  'my-check': async (ctx: TaskContext, opts?: {autoFix?: boolean}) => {
    // 2. Receive task context
    ctx.log.info('Running check');

    // 3. Validation logic
    const result = await ctx.tools.shell.run('some-command');

    // 4. Return result
    return {
      passed: result.exitCode === 0,        // Required
      output: result.stderr,                 // Optional: raw output
      issues: [],                            // Optional: list of issues
      feedback: 'What to fix'                // Optional: for agent
    };
  }
};
```

---

## Examples

### File-Based Validation

```typescript
export const checks = {
  'has-readme': async (ctx) => {
    const exists = await ctx.tools.file.exists('README.md');
    return {
      passed: exists,
      feedback: exists ? '' : 'README.md must exist'
    };
  },

  'no-console-logs': async (ctx) => {
    const files = await ctx.tools.file.glob('src/**/*.ts');
    const issues: string[] = [];

    for (const file of files) {
      const content = await ctx.tools.file.read(file);
      if (content.includes('console.log')) {
        issues.push(`${file}: contains console.log`);
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      feedback: issues.length > 0
        ? `Remove console.log statements:\n${issues.join('\n')}`
        : ''
    };
  }
};
```

### Command-Based Validation

```typescript
export const checks = {
  'npm-test': async (ctx) => {
    const result = await ctx.tools.shell.run('npm test');

    return {
      passed: result.exitCode === 0,
      output: result.stderr,
      feedback: result.exitCode === 0 ? '' : 'Tests failed'
    };
  },

  'npm-build': async (ctx) => {
    const result = await ctx.tools.shell.run('npm run build');

    if (result.exitCode !== 0) {
      return {
        passed: false,
        output: result.stderr,
        feedback: `Build failed:\n${result.stderr}`
      };
    }

    // Verify output
    const hasOutput = await ctx.tools.file.exists('dist/index.js');

    return {
      passed: hasOutput,
      feedback: hasOutput ? '' : 'dist/index.js not created'
    };
  }
};
```

### Semantic Validation

```typescript
export const checks = {
  'components-typed': async (ctx) => {
    const files = await ctx.tools.file.glob('src/components/**/*.tsx');
    const untyped: string[] = [];

    for (const file of files) {
      const content = await ctx.tools.file.read(file);

      // Check for prop types
      const hasTypes = content.includes('interface Props') ||
                      content.includes(': React.FC');

      if (!hasTypes) {
        untyped.push(file);
      }
    }

    return {
      passed: untyped.length === 0,
      issues: untyped,
      feedback: untyped.length > 0
        ? `Add prop types to components:\n${untyped.join('\n')}`
        : ''
    };
  }
};
```

---

## With Options

Accept options from task configuration:

```typescript
export const checks = {
  'lint-with-fix': async (ctx, opts?: {autoFix?: boolean}) => {
    if (opts?.autoFix) {
      await ctx.tools.shell.run('npm run lint -- --fix');
    }

    const result = await ctx.tools.shell.run('npm run lint');

    return {
      passed: result.exitCode === 0,
      output: result.stderr,
      feedback: result.exitCode === 0 ? '' : 'Linting failed'
    };
  }
};
```

Usage:

```typescript
.check('lint-with-fix', { autoFix: true })
```

---

## Checks with State

Use `ctx.state` to share data across checks:

```typescript
export const checks = {
  'first-check': async (ctx) => {
    const result = await ctx.tools.shell.run('npm run test');
    const passed = result.exitCode === 0;

    // Store for next check
    ctx.state.set('testsPassed', passed);

    return { passed };
  },

  'second-check': async (ctx) => {
    // Access state from first check
    const testsPassed = ctx.state.get<boolean>('testsPassed');

    if (!testsPassed) {
      return {
        passed: false,
        feedback: 'Tests must pass before building'
      };
    }

    const result = await ctx.tools.shell.run('npm run build');
    return { passed: result.exitCode === 0 };
  }
};
```

---

## Context-Aware Checks

Access task metadata:

```typescript
export const checks = {
  'validate-outputs': async (ctx) => {
    const { outputs } = ctx.task;

    if (!outputs || outputs.length === 0) {
      return { passed: true };  // No outputs declared
    }

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
        ? `Expected outputs not created:\n${missing.join('\n')}`
        : ''
    };
  },

  'environment-specific': async (ctx) => {
    const env = ctx.vars.environment;

    if (env === 'production') {
      // Stricter checks for production
      const result = await ctx.tools.shell.run('npm run test -- --coverage');
      const coverage = parseInt(result.stdout.match(/(\d+)%/) ?.[1] || '0');

      return {
        passed: coverage >= 90,
        feedback: `Production requires 90% coverage, got ${coverage}%`
      };
    }

    return { passed: true };
  }
};
```

---

## Error Handling

### Try-Catch

```typescript
export const checks = {
  'safe-check': async (ctx) => {
    try {
      const result = await ctx.tools.shell.run('npm run validate');

      return {
        passed: result.exitCode === 0,
        output: result.stderr
      };
    } catch (error) {
      ctx.log.warn('Check error', { error: error.message });

      return {
        passed: false,
        feedback: `Check encountered error: ${error.message}`
      };
    }
  }
};
```

### Timeout Handling

```typescript
export const checks = {
  'with-timeout': async (ctx) => {
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
  }
};
```

---

## Logging and Debugging

### Use ctx.log

```typescript
export const checks = {
  'verbose-check': async (ctx) => {
    ctx.log.info('Starting check');

    const files = await ctx.tools.file.glob('src/**/*.ts');
    ctx.log.debug(`Found ${files.length} files`);

    // ... validation logic ...

    ctx.log.info('Check complete', { passed: true });

    return { passed: true };
  }
};
```

### Conditional Debug Output

```typescript
export const checks = {
  'debug-check': async (ctx) => {
    const debug = ctx.vars.debug === true;

    if (debug) {
      ctx.log.info('DEBUG: Starting validation');
      const status = await ctx.tools.git.status();
      ctx.log.info('DEBUG: Git status', { status });
    }

    // ... rest of check ...

    return { passed: true };
  }
};
```

---

## Testing Checks

### Unit Test Pattern

```typescript
// checks.test.ts
import { describe, it, expect } from 'vitest';
import { checks } from './setup/index.ts';

describe('custom checks', () => {
  it('no-console-logs should pass for clean code', async () => {
    const mockCtx = {
      tools: {
        file: {
          glob: async () => ['test.ts'],
          read: async () => 'console.log("hello")'
        }
      }
    };

    const result = await checks['no-console-logs'](mockCtx as any);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('test.ts: contains console.log');
  });
});
```

### Manual Testing

```bash
# Run a specific check
crew verify --check my-custom-check

# Run all checks
crew verify

# See output
crew verify --verbose
```

---

## Organizing Checks

### Single File

For small projects:

```typescript
// .crew/setup/index.ts
export const checks = {
  'check-1': async (ctx) => { /* ... */ },
  'check-2': async (ctx) => { /* ... */ },
  'check-3': async (ctx) => { /* ... */ }
};
```

### Multiple Files

For larger projects:

```typescript
// .crew/setup/checks/index.ts
import { fileChecks } from './file-checks.ts';
import { testChecks } from './test-checks.ts';
import { gitChecks } from './git-checks.ts';

export const checks = {
  ...fileChecks,
  ...testChecks,
  ...gitChecks
};
```

```typescript
// .crew/setup/checks/file-checks.ts
export const fileChecks = {
  'has-readme': async (ctx) => { /* ... */ },
  'no-console-logs': async (ctx) => { /* ... */ }
};
```

---

## Common Patterns

### Check Multiple Conditions

```typescript
export const checks = {
  'multi-condition': async (ctx) => {
    const conditions = {
      readme: await ctx.tools.file.exists('README.md'),
      license: await ctx.tools.file.exists('LICENSE'),
      gitignore: await ctx.tools.file.exists('.gitignore')
    };

    const failed = Object.entries(conditions)
      .filter(([_, passed]) => !passed)
      .map(([name]) => name);

    return {
      passed: failed.length === 0,
      issues: failed,
      feedback: failed.length > 0
        ? `Missing files: ${failed.join(', ')}`
        : ''
    };
  }
};
```

### Parse and Validate

```typescript
export const checks = {
  'parse-json': async (ctx) => {
    try {
      const content = await ctx.tools.file.read('config.json');
      const config = JSON.parse(content);

      // Validate structure
      const required = ['name', 'version'];
      const missing = required.filter(key => !config[key]);

      return {
        passed: missing.length === 0,
        feedback: missing.length > 0
          ? `config.json missing: ${missing.join(', ')}`
          : ''
      };
    } catch (error) {
      return {
        passed: false,
        feedback: `Invalid JSON: ${error.message}`
      };
    }
  }
};
```

### Compare Files

```typescript
export const checks = {
  'files-match': async (ctx) => {
    const current = await ctx.tools.file.read('current.txt');
    const expected = await ctx.tools.file.read('expected.txt');

    return {
      passed: current === expected,
      feedback: current === expected
        ? ''
        : 'Files do not match'
    };
  }
};
```

---

## Best Practices

### ✅ Do

- **Keep checks focused** — one concern per check
- **Provide clear feedback** — actionable for agent
- **Handle errors gracefully** — don't crash
- **Use logging** — helps debugging
- **Test locally** — verify before deploying
- **Document assumptions** — what it checks

### ❌ Don't

- **Combine unrelated checks** — split into focused checks
- **Vague feedback** — be specific
- **Ignore errors** — log and report
- **Long-running checks** — add timeouts
- **Assume file structure** — check existence first

---

## TypeScript Types

```typescript
import type { TaskContext, CheckResult } from 'crew';

export const checks: Record<string, (ctx: TaskContext, opts?: Record<string, unknown>) => Promise<CheckResult>> = {
  'my-check': async (ctx) => {
    return { passed: true };
  }
};
```

---

## See Also

- [Named Checks](./named-checks.md) — Using checks
- [Inline Checks](./inline-checks.md) — Inline check functions
- [Command Checks](./command-checks.md) — Shell commands
- [Prompt Checks](./prompt-checks.md) — AI validation
- [Task Context](../task-api/task-context.md) — Available in checks
- [Fluent Builder](../task-api/fluent-builder.md) — `.check()` API

---

[← Back to Checks](./README.md) | [← Back to Documentation](../README.md)
