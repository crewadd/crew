# Using Plugins

**Install and configure plugins for your Crew project.**

[[docs](../README.md) > [plugins](./README.md) > using-plugins]

---

## Overview

Plugins extend Crew with additional checks, task types, hooks, and tools.

```json
{
  "plugins": [
    "typescript",
    "eslint",
    ["nextjs", { "appDir": true }],
    ["docker", { "registry": "gcr.io/my-project" }]
  ]
}
```

Each plugin contributes:
- **Checks** — Quality gates (e.g., `tsc`, `eslint`)
- **Task Types** — Predefined task configurations
- **Hooks** — Lifecycle callbacks
- **Tools** — Custom task context tools
- **Variables** — Project-level configuration

---

## Installation

### In crew.json

Add to the `plugins` array:

```json
{
  "name": "my-project",
  "plugins": [
    "typescript",
    "eslint",
    "vitest"
  ]
}
```

### Without Options

```json
{
  "plugins": [
    "typescript",
    "eslint",
    "git",
    "docker"
  ]
}
```

### With Options

Use tuple syntax:

```json
{
  "plugins": [
    ["nextjs", { "appDir": true }],
    ["docker", { "registry": "gcr.io/my-app" }]
  ]
}
```

### Explicit Format

Or object syntax:

```json
{
  "plugins": [
    {
      "name": "typescript",
      "options": {}
    },
    {
      "name": "nextjs",
      "options": { "appDir": true }
    }
  ]
}
```

---

## Built-In Plugins

### TypeScript

Adds TypeScript checks and coding task type.

**Installation:**
```json
{ "plugins": ["typescript"] }
```

**Provides:**
- Check: `tsc` — Type checking
- Task Type: `coding` — TypeScript implementation tasks
- Variable: `language: 'typescript'`

**Usage:**
```typescript
ctx.createTask('impl', 'Implement feature')
  .ofType('coding')
  .check('tsc')
```

### ESLint

Adds ESLint linting checks.

**Installation:**
```json
{ "plugins": ["eslint"] }
```

**Provides:**
- Check: `eslint` — Run ESLint
- Check: `eslint-fix` — ESLint with auto-fix
- Task Type: `linting`

**Usage:**
```typescript
.check('eslint')
.check('eslint-fix', { autoFix: true })
```

**Config file:** `.eslintrc.json` or `eslint.config.js`

### Vitest

Adds Vitest test running.

**Installation:**
```json
{ "plugins": ["vitest"] }
```

**Provides:**
- Check: `test` — Run tests
- Check: `coverage` — Coverage check
- Task Type: `testing`

**Usage:**
```typescript
.check('test')
.check('coverage')
```

### Next.js

Extends TypeScript for Next.js projects.

**Installation:**
```json
{
  "plugins": [
    "typescript",
    ["nextjs", { "appDir": true }]
  ]
}
```

**Options:**
- `appDir: true` — Use app router (default: pages router)

**Provides:**
- Check: `next-build` — Next.js build
- Check: `next-lint` — Next.js linting
- Task Type: `nextjs-page` — Page creation
- Task Type: `nextjs-component` — Component creation

**Usage:**
```typescript
.check('next-build')
.check('next-lint')
```

### Git

Adds Git operations and checks.

**Installation:**
```json
{ "plugins": ["git"] }
```

**Provides:**
- Check: `git-clean` — No uncommitted changes
- Check: `git-staged` — Changes are staged
- Tool: `ctx.tools.git` — Git operations (already built-in)

**Usage:**
```typescript
.check('git-clean')
.check('git-staged')
```

### Docker

Adds Docker build and deploy checks.

**Installation:**
```json
{
  "plugins": [
    ["docker", { "registry": "gcr.io/my-project" }]
  ]
}
```

**Options:**
- `registry` — Docker registry URL

**Provides:**
- Check: `docker-build` — Build image
- Check: `docker-push` — Push to registry
- Task Type: `docker-build`

**Usage:**
```typescript
.check('docker-build')
```

### Crewman

Adds Crew-specific utilities and auto-fixes.

**Installation:**
```json
{ "plugins": ["crewman"] }
```

**Provides:**
- Auto-fix capabilities for common issues
- Task recovery suggestions
- Project optimization recommendations

---

## Plugin Configuration

### Default Behavior

Most plugins work with no options:

```json
{ "plugins": ["typescript", "eslint", "vitest"] }
```

### Custom Configuration

Pass options for non-default behavior:

```json
{
  "plugins": [
    "typescript",
    ["nextjs", { "appDir": true }],
    ["docker", { "registry": "gcr.io/my-app", "tag": "latest" }]
  ]
}
```

### Environment-Specific Plugins

Conditionally enable plugins:

```typescript
// .crew/setup/index.ts
export const plugins = process.env.SKIP_DOCKER
  ? ["typescript", "eslint"]
  : ["typescript", "eslint", "docker"];
```

---

## Using Plugin Checks

### Named Checks

Reference checks by name:

```typescript
.check('tsc')           // From typescript plugin
.check('eslint')        // From eslint plugin
.check('test')          // From vitest plugin
.check('next-build')    // From nextjs plugin
.check('docker-build')  // From docker plugin
```

### With Options

Some checks support options:

```typescript
.check('eslint-fix', { autoFix: true })
.check('coverage', { threshold: 80 })
```

### In Task Types

Plugins define task types with default checks:

```typescript
ctx.createTask('page', 'Create page')
  .ofType('nextjs-page')  // Inherits next checks
```

---

## Using Plugin Task Types

Plugins provide pre-configured task types:

```typescript
// TypeScript plugin provides 'coding' type
ctx.createTask('api', 'Build API')
  .ofType('coding')
  .prompt('Create REST API')
  // Automatically gets tsc check

// Next.js plugin provides 'nextjs-page' type
ctx.createTask('page', 'Create page')
  .ofType('nextjs-page')
  // Automatically configured for Next.js
```

---

## Plugin Dependencies

Some plugins require others to be loaded first.

**Requirement example:**
- `nextjs` requires `typescript`
- `docker` requires no dependencies

The framework automatically resolves and loads in order:

```json
{
  "plugins": [
    "nextjs",      // Requires typescript
    "typescript"   // Listed second, but loaded first
  ]
}
```

or explicitly:

```json
{
  "plugins": [
    "typescript",  // Load first
    "nextjs"       // Then nextjs
  ]
}
```

---

## Creating Custom Plugins

For project-specific functionality:

```typescript
// .crew/setup/plugins/my-plugin.ts
import type { CrewPlugin } from 'crew';

const myPlugin: CrewPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Custom project checks',

  setup(api) {
    // Add checks
    api.addCheck('my-check', async (ctx) => {
      // Custom check logic
      return { passed: true };
    });

    // Add task types
    api.addTaskType({
      name: 'custom-task',
      description: 'My custom task type',
      defaults: { skill: 'custom-agent' }
    });

    // Add variables
    api.addVars({ myVar: 'value' });
  }
};

export default myPlugin;
```

Enable in crew.json:

```json
{
  "plugins": [
    ".crew/setup/plugins/my-plugin.ts"
  ]
}
```

---

## Plugin Hooks

Plugins can register lifecycle hooks:

```typescript
const myPlugin: CrewPlugin = {
  setup(api) {
    // Before each task
    api.addHook('beforeTask', async (ctx) => {
      ctx.log.info('Task starting:', ctx.task.title);
    });

    // After each task
    api.addHook('afterTask', async (ctx, result) => {
      ctx.log.info('Task complete', { success: result.success });
    });

    // On task failure
    api.addHook('onTaskFail', async (ctx, error) => {
      ctx.log.error('Task failed', { error });
    });
  }
};
```

---

## Plugin Tools

Plugins can inject custom tools:

```typescript
const myPlugin: CrewPlugin = {
  setup(api) {
    api.addTool('database', async (ctx) => ({
      query: async (sql: string) => {
        // Execute database query
      },
      seed: async (data: unknown) => {
        // Seed test data
      }
    }));
  }
};
```

Use in tasks:

```typescript
ctx.createTask('seed', 'Seed database')
  .executeFrom('.crew/executors/seed.js')
```

In executor:

```javascript
// @ts-ignore
export default async function execute(ctx) {
  await ctx.tools.database.seed(testData);
  return { success: true };
}
```

---

## Plugin Variables

Plugins provide project-level variables:

```typescript
const myPlugin: CrewPlugin = {
  setup(api) {
    api.addVars({
      apiVersion: '1.0.0',
      environment: 'production',
      maxConcurrency: 5
    });
  }
};
```

Access in tasks:

```typescript
ctx.createTask('setup', 'Setup')
  .prompt(`Initialize with API v${ctx.vars.apiVersion}`)
```

---

## Troubleshooting

### Plugin Not Loading

```bash
# Check plugin list
crew status --json | jq '.plugins'

# Verify crew.json
cat crew.json | jq '.plugins'
```

### Missing Checks

Ensure plugin is in crew.json:

```json
{
  "plugins": ["typescript"]
}
```

Then use:

```typescript
.check('tsc')  // Should work now
```

### Plugin Dependencies

If plugin A requires plugin B, load B first:

```json
{
  "plugins": [
    "typescript",  // Base dependency
    "nextjs"       // Requires typescript
  ]
}
```

### Plugin Conflicts

Some plugins may conflict. Test combinations:

```json
{
  "plugins": ["typescript", "vitest"]  // Good combo
}
```

vs.

```json
{
  "plugins": ["typescript", "othertool"]  // May conflict
}
```

---

## Best Practices

### ✅ Do

- **Load plugins in dependency order** — base plugins first
- **Use built-in plugins** — reduce custom code
- **Document plugin options** — especially custom plugins
- **Test plugin combinations** — ensure compatibility
- **Keep plugins focused** — one concern per plugin

### ❌ Don't

- **Load unnecessary plugins** — keep project lean
- **Ignore dependencies** — follow plugin requirements
- **Mix conflicting plugins** — test combinations
- **Hard-code plugin behavior** — use options instead

---

## Available Plugins

| Plugin | Purpose | Requires |
|--------|---------|----------|
| `typescript` | Type checking | — |
| `eslint` | Code linting | — |
| `vitest` | Test running | — |
| `nextjs` | Next.js support | typescript |
| `git` | Git operations | — |
| `docker` | Docker support | — |
| `crewman` | Crew utilities | — |

---

## See Also

- [Built-in Plugins](./builtin-plugins.md) — Detailed plugin reference
- [Writing Plugins](./writing-plugins.md) — Create custom plugins
- [Named Checks](../checks/named-checks.md) — Using plugin checks
- [Task Types](../task-types/defining-types.md) — Plugin-provided types

---

[← Back to Plugins](./README.md) | [← Back to Documentation](../README.md)
