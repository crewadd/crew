# Built-In Plugins

**Reference for all officially provided plugins.**

[[docs](../README.md) > [plugins](./README.md) > builtin-plugins]

---

## TypeScript Plugin

**Package:** `@crew/typescript`

Adds TypeScript support: type checking and coding task type.

```json
{ "plugins": ["typescript"] }
```

### Checks

- **tsc** — `npx tsc --noEmit`

### Task Types

- **coding** — Default skill: `coding-agent`, includes `tsc` check

### Variables

- `language: 'typescript'`

### Usage

```typescript
.ofType('coding')
.check('tsc')
```

---

## ESLint Plugin

**Package:** `@crew/eslint`

Adds ESLint linting checks.

```json
{ "plugins": ["eslint"] }
```

### Checks

- **eslint** — `npm run lint`
- **eslint-fix** — Auto-fix with `--fix` flag

### Task Types

- **linting** — ESLint-focused linting tasks

### Options

```json
{
  "plugins": [
    ["eslint", { "configFile": ".eslintrc.custom.json" }]
  ]
}
```

### Usage

```typescript
.check('eslint')
.check('eslint-fix', { autoFix: true })
```

---

## Vitest Plugin

**Package:** `@crew/vitest`

Adds Vitest test framework support.

```json
{ "plugins": ["vitest"] }
```

### Checks

- **test** — `npm run test`
- **coverage** — Check coverage threshold

### Task Types

- **testing** — Test-focused tasks

### Options

```json
{
  "plugins": [
    ["vitest", { "coverage": { "branches": 80, "lines": 80 } }]
  ]
}
```

### Usage

```typescript
.check('test')
.check('coverage')
.ofType('testing')
```

---

## Next.js Plugin

**Package:** `@crew/nextjs`

Extended TypeScript support for Next.js projects.

**Requires:** `typescript` plugin

```json
{
  "plugins": [
    "typescript",
    ["nextjs", { "appDir": true }]
  ]
}
```

### Options

- **appDir** — Use app router (default: false for pages router)
- **eslint** — Include Next.js linting (default: true)
- **typescript** — Include TypeScript (default: true)

### Checks

- **next-build** — `npm run build` (Next.js build)
- **next-lint** — `npm run lint` (Next.js linting)

### Task Types

- **nextjs-page** — Page component creation
- **nextjs-component** — Reusable component creation
- **nextjs-api** — API route creation

### Variables

- `framework: 'nextjs'`
- `appDir: true/false`

### Usage

```typescript
.ofType('nextjs-page')
.ofType('nextjs-component')
.check('next-build')
.check('next-lint')
```

---

## Git Plugin

**Package:** `@crew/git`

Git version control checks and operations.

```json
{ "plugins": ["git"] }
```

### Checks

- **git-clean** — No uncommitted changes
- **git-staged** — All changes are staged
- **git-branch-main** — On main branch

### Tools

Git tools are already built-in, this plugin adds useful checks.

### Usage

```typescript
.check('git-clean')
.check('git-staged')
```

---

## Docker Plugin

**Package:** `@crew/docker`

Docker image building and registry operations.

```json
{
  "plugins": [
    ["docker", { "registry": "gcr.io/my-project" }]
  ]
}
```

### Options

- **registry** — Docker registry URL
- **username** — Registry username
- **tag** — Default image tag (default: "latest")

### Checks

- **docker-build** — `docker build -t {image} .`
- **docker-push** — Push to registry

### Task Types

- **docker-build** — Docker image building

### Variables

- `dockerRegistry: 'gcr.io/...'`
- `dockerTag: 'latest'`

### Usage

```typescript
.check('docker-build')
.ofType('docker-build')
```

---

## Crewman Plugin

**Package:** `@crew/crewman`

Crew utilities and optimizations.

```json
{ "plugins": ["crewman"] }
```

### Features

- Auto-fix suggestions for common issues
- Task recovery recommendations
- Project optimization advice

### Hooks

Provides hooks for:
- Task failure analysis
- Performance monitoring
- Auto-remediation suggestions

---

## Combining Plugins

### Full JavaScript Stack

```json
{
  "plugins": [
    "typescript",
    "eslint",
    "vitest",
    ["nextjs", { "appDir": true }],
    "git",
    "crewman"
  ]
}
```

Provides:
- TypeScript type checking
- ESLint linting
- Vitest testing
- Next.js specific checks
- Git operations
- Crew utilities

### Minimal Setup

```json
{
  "plugins": ["typescript"]
}
```

Just type checking.

---

## Plugin Interaction

### Check Inheritance

Plugin checks are inherited by task types:

```typescript
// nextjs plugin provides 'nextjs-page' type
// Which includes next-build check automatically
.ofType('nextjs-page')  // Inherits next-build check
```

### Variable Merging

Variables from all plugins merge:

```json
{ "plugins": ["typescript", "nextjs"] }
```

Provides variables:
- From typescript: `language: 'typescript'`
- From nextjs: `framework: 'nextjs'`, `appDir: true`

Accessible as:

```typescript
ctx.vars.language        // 'typescript'
ctx.vars.framework       // 'nextjs'
ctx.vars.appDir          // true
```

---

## Troubleshooting

### Check Not Found

Ensure plugin is loaded:

```bash
crew status --json | jq '.plugins'
```

### Missing Task Type

Plugin must be loaded before using its task types:

```json
{
  "plugins": ["nextjs"]
}
```

Then:

```typescript
.ofType('nextjs-page')  // Works now
```

### Version Conflicts

Check plugin versions:

```bash
npm list @crew/typescript @crew/nextjs
```

### Plugin Dependency Issues

Ensure base plugin loads first:

```json
{
  "plugins": [
    "typescript",  // Load first
    "nextjs"       // Then nextjs
  ]
}
```

---

## Performance Notes

### Plugin Load Order

Plugins load in declaration order. Load faster plugins first:

```json
{
  "plugins": [
    "typescript",     // Fast
    "eslint",         // Moderate
    "vitest",         // Slower (test framework)
    ["docker", {}]    // Moderate
  ]
}
```

### Check Performance

Some checks are expensive:

- `test` — Full test suite
- `docker-build` — Image building
- `coverage` — Coverage analysis

Consider:
- Running expensive checks selectively
- Using `--check` flag to run specific checks
- Parallelizing checks where possible

---

## Extending Built-In Plugins

Override plugin behavior with custom setup:

```typescript
// .crew/setup/index.ts
export const checks = {
  // Override default tsc with custom options
  'tsc': async (ctx) => {
    const result = await ctx.tools.shell.run(
      'npx tsc --noEmit --strict --exactOptionalPropertyTypes'
    );
    return {
      passed: result.exitCode === 0,
      output: result.stderr
    };
  }
};
```

---

## Available Versions

Plugins follow semantic versioning. Latest versions:

- TypeScript Plugin: 1.0.0+
- ESLint Plugin: 1.0.0+
- Vitest Plugin: 1.0.0+
- Next.js Plugin: 1.0.0+
- Git Plugin: 1.0.0+
- Docker Plugin: 1.0.0+
- Crewman Plugin: 1.0.0+

---

## See Also

- [Using Plugins](./using-plugins.md) — Installation and configuration
- [Writing Plugins](./writing-plugins.md) — Create custom plugins
- [Task Types](../task-types/defining-types.md) — Using plugin task types
- [Named Checks](../checks/named-checks.md) — Using plugin checks

---

[← Back to Plugins](./README.md) | [← Back to Documentation](../README.md)
