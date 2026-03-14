# Writing Plugins

**Create custom plugins to extend Crew with project-specific functionality.**

[[docs](../README.md) > [plugins](./README.md) > writing-plugins]

---

## Overview

Plugins are reusable configuration units that contribute checks, task types, hooks, and tools.

```typescript
// .crew/setup/plugins/my-plugin.ts
import type { CrewPlugin } from 'crew';

const myPlugin: CrewPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Custom checks and task types',

  setup(api) {
    // Register checks
    api.addCheck('my-check', async (ctx) => { /* ... */ });

    // Register task types
    api.addTaskType({ /* ... */ });

    // Register hooks
    api.addHook('beforeTask', async (ctx) => { /* ... */ });

    // Register tools
    api.addTool('myTool', async (ctx) => ({ /* ... */ }));

    // Set variables
    api.addVars({ myVar: 'value' });
  }
};

export default myPlugin;
```

---

## Plugin Structure

```typescript
interface CrewPlugin {
  name: string;           // Unique identifier
  version: string;        // Semantic version
  description?: string;   // What it does
  requires?: string[];    // Required plugins
  setup(api: PluginAPI): void | Promise<void>;  // Configuration
}
```

---

## Basic Plugin Template

```typescript
// .crew/setup/plugins/my-plugin.ts
import type { CrewPlugin } from 'crew';

const myPlugin: CrewPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My custom plugin',

  setup(api) {
    // Your setup code here
  }
};

export default myPlugin;
```

Enable in crew.json:

```json
{
  "plugins": [".crew/setup/plugins/my-plugin.ts"]
}
```

---

## Adding Checks

### Single Check

```typescript
setup(api) {
  api.addCheck('my-check', async (ctx) => {
    const result = await ctx.tools.shell.run('some-command');

    return {
      passed: result.exitCode === 0,
      output: result.stderr,
      feedback: result.exitCode === 0 ? '' : 'Command failed'
    };
  });
}
```

### Multiple Checks

```typescript
setup(api) {
  api.addChecks({
    'check-1': async (ctx) => { /* ... */ },
    'check-2': async (ctx) => { /* ... */ },
    'check-3': async (ctx) => { /* ... */ }
  });
}
```

### Check with Options

```typescript
setup(api) {
  api.addCheck('format', async (ctx, opts) => {
    if (opts?.autoFix) {
      await ctx.tools.shell.run('prettier --write .');
    }

    const result = await ctx.tools.shell.run('prettier --check .');
    return {
      passed: result.exitCode === 0,
      output: result.stderr
    };
  });
}
```

---

## Adding Task Types

### Basic Task Type

```typescript
setup(api) {
  api.addTaskType({
    name: 'custom-task',
    description: 'Custom task type',
    defaults: {
      skill: 'custom-agent'
    }
  });
}
```

### Task Type with Checks

```typescript
setup(api) {
  api.addTaskType({
    name: 'api-task',
    description: 'API implementation',
    defaults: {
      skill: 'api-agent'
    },
    checks: ['tsc', 'lint', 'test']
  });
}
```

### Task Type with Hooks

```typescript
setup(api) {
  api.addTaskType({
    name: 'deployment',
    defaults: {
      skill: 'ops-agent'
    },
    checks: ['docker-build'],
    reportPrompt: 'Generate deployment report'
  });
}
```

---

## Adding Hooks

### Available Hooks

```typescript
type HookEvent =
  | 'beforeTask'      // Before task execution
  | 'afterTask'       // After task execution
  | 'beforeEpic'      // Before epic starts
  | 'afterEpic'       // After epic completes
  | 'beforePlan'      // Before planning phase
  | 'afterPlan'       // After planning phase
  | 'onTaskFail';     // When task fails
```

### Single Hook

```typescript
setup(api) {
  api.addHook('beforeTask', async (ctx) => {
    ctx.log.info(`Starting: ${ctx.task.title}`);
  });
}
```

### Multiple Hooks

```typescript
setup(api) {
  api.addHook('beforeTask', async (ctx) => {
    ctx.log.info(`Starting: ${ctx.task.title}`);
  });

  api.addHook('afterTask', async (ctx, result) => {
    ctx.log.info('Task complete', { success: result.success });
  });

  api.addHook('onTaskFail', async (ctx, error) => {
    ctx.log.error('Task failed', { error: error.message });
  });
}
```

---

## Adding Tools

### Basic Tool

```typescript
setup(api) {
  api.addTool('database', async (ctx) => ({
    query: async (sql: string) => {
      // Execute query
    },
    seed: async (data: unknown) => {
      // Seed data
    }
  }));
}
```

### Tool Accessing Context

```typescript
setup(api) {
  api.addTool('analytics', async (ctx) => ({
    track: async (event: string, data: unknown) => {
      ctx.log.debug('Tracking event', { event, data });
      // Send to analytics service
    }
  }));
}
```

### Multiple Tools

```typescript
setup(api) {
  api.addTool('db', async (ctx) => ({
    query: async (sql) => { /* ... */ }
  }));

  api.addTool('cache', async (ctx) => ({
    get: async (key) => { /* ... */ },
    set: async (key, value) => { /* ... */ }
  }));
}
```

---

## Adding Variables

### Set Project Variables

```typescript
setup(api) {
  api.addVars({
    apiVersion: '1.0.0',
    environment: 'production',
    region: 'us-east-1'
  });
}
```

### Conditional Variables

```typescript
setup(api) {
  const isProduction = process.env.ENVIRONMENT === 'production';

  api.addVars({
    environment: isProduction ? 'production' : 'development',
    logLevel: isProduction ? 'warn' : 'debug'
  });
}
```

---

## Plugin Dependencies

### Require Another Plugin

```typescript
const myPlugin: CrewPlugin = {
  name: 'my-plugin',
  requires: ['typescript', 'eslint'],

  setup(api) {
    // This plugin requires typescript and eslint
  }
};
```

The framework ensures required plugins load first.

### Conditional Behavior

```typescript
setup(api) {
  if (api.hasPlugin('typescript')) {
    // TypeScript is available
    api.addCheck('typescript-strict', async (ctx) => {
      const result = await ctx.tools.shell.run('tsc --strict');
      return { passed: result.exitCode === 0 };
    });
  }
}
```

### Access Plugin Variables

```typescript
setup(api) {
  const language = api.getVar('language');

  api.addVars({
    languageVersion: language === 'typescript' ? '5.0' : 'latest'
  });
}
```

---

## Complete Example Plugin

```typescript
// .crew/setup/plugins/audit-plugin.ts
import type { CrewPlugin } from 'crew';

const auditPlugin: CrewPlugin = {
  name: 'audit',
  version: '1.0.0',
  description: 'Security and compliance auditing',

  setup(api) {
    // 1. Add checks
    api.addChecks({
      'security-audit': async (ctx) => {
        const result = await ctx.tools.shell.run('npm audit');
        const hasCritical = result.stdout.includes('critical');

        return {
          passed: !hasCritical,
          output: result.stdout,
          feedback: hasCritical
            ? 'Critical security vulnerabilities found'
            : ''
        };
      },

      'no-secrets': async (ctx) => {
        const result = await ctx.tools.shell.run(
          'grep -r "password\\|api_key\\|secret" src/'
        );

        const found = result.stdout.split('\n').filter(l => l);

        return {
          passed: found.length === 0,
          issues: found,
          feedback: found.length > 0
            ? `Secrets found in code:\n${found.join('\n')}`
            : ''
        };
      },

      'license-check': async (ctx) => {
        const licenseOk = await ctx.tools.file.exists('LICENSE');
        const readmeOk = await ctx.tools.file.exists('README.md');

        return {
          passed: licenseOk && readmeOk,
          feedback: !licenseOk || !readmeOk
            ? 'Project must have LICENSE and README.md'
            : ''
        };
      }
    });

    // 2. Add task type
    api.addTaskType({
      name: 'security',
      description: 'Security-focused tasks',
      defaults: {
        skill: 'security-agent'
      },
      checks: ['security-audit', 'no-secrets']
    });

    // 3. Add hooks
    api.addHook('onTaskFail', async (ctx, error) => {
      ctx.log.error('Task failed', { taskId: ctx.taskId, error });
      // Could notify security team
    });

    // 4. Add tool
    api.addTool('audit', async (ctx) => ({
      reportSecurityIssues: async (issues: string[]) => {
        ctx.log.warn(`Found ${issues.length} security issues`);
        return { reported: true };
      }
    }));

    // 5. Set variables
    api.addVars({
      auditEnabled: true,
      securityLevel: 'high'
    });
  }
};

export default auditPlugin;
```

Enable in crew.json:

```json
{
  "plugins": [".crew/setup/plugins/audit-plugin.ts"]
}
```

Use in tasks:

```typescript
ctx.createTask('security', 'Run security audit')
  .ofType('security')
  .prompt('Perform comprehensive security audit')
  .check('security-audit')
  .check('no-secrets')
  .check('license-check')
```

---

## Best Practices

### ✅ Do

- **Single responsibility** — Each plugin does one thing well
- **Clear naming** — Plugin name should indicate purpose
- **Document options** — Show how to configure
- **Handle errors gracefully** — Wrap risky operations
- **Use proper types** — TypeScript for better DX
- **Test with other plugins** — Ensure compatibility

### ❌ Don't

- **Too many concerns** — Keep focused
- **Hardcoded paths** — Use context and tools
- **Duplicate existing checks** — Extend instead
- **Ignore plugin deps** — Document requirements
- **Silent failures** — Always provide feedback

---

## Testing Plugins

### Manual Testing

```bash
# Verify plugin loads
crew status --json | jq '.plugins'

# Test a check from plugin
crew verify --check my-check

# Test task type
crew run  # Uses tasks with your plugin's type
```

### Unit Test Pattern

```typescript
// plugin.test.ts
import { describe, it, expect } from 'vitest';
import plugin from './my-plugin';

describe('my-plugin', () => {
  it('should provide expected checks', async () => {
    const checks = {};
    const mockApi = {
      addCheck: (name, fn) => { checks[name] = fn; }
    };

    plugin.setup(mockApi as any);

    expect(checks['my-check']).toBeDefined();
  });
});
```

---

## Publishing Plugins

To share plugins with others:

1. Create npm package: `@yourorg/crew-plugin-name`
2. Export plugin class
3. Document in README
4. Publish to npm

```typescript
// index.ts
export { default as myPlugin } from './my-plugin';
```

Then others can install:

```bash
npm install @yourorg/crew-plugin-name
```

And use:

```json
{
  "plugins": ["@yourorg/crew-plugin-name"]
}
```

---

## API Reference

### PluginAPI

Available in `setup()` function:

```typescript
interface PluginAPI {
  readonly options: Record<string, unknown>;
  readonly projectDir: string;

  addCheck(name: string, plugin: CheckPlugin): void;
  addChecks(checks: Record<string, CheckPlugin>): void;
  addTaskType(type: TaskType): void;
  extendTaskType(name: string, extension: TaskTypeExtension): void;
  addHook(event: HookEvent, fn: HookFn): void;
  addVars(vars: Record<string, unknown>): void;
  addTool(name: string, factory: ToolFactory): void;

  getVar(key: string): unknown;
  hasPlugin(name: string): boolean;
}
```

---

## See Also

- [Using Plugins](./using-plugins.md) — Install and configure plugins
- [Built-in Plugins](./builtin-plugins.md) — Official plugin reference
- [Writing Custom Checks](../checks/writing-custom-checks.md) — Check development
- [Task Types](../task-types/defining-types.md) — Task type development

---

[← Back to Plugins](./README.md) | [← Back to Documentation](../README.md)
