# Checks System

**Automatic quality gates that ensure task outputs meet requirements.**

Checks are the verification layer in Crew. They run after each task execution and determine whether the agent's work is acceptable. Failed checks trigger automatic retries with feedback.

## In This Section

### [Named Checks](./named-checks.md)
Registry-based checks provided by Crew and plugins (file-exists, file-contains, command, etc.).

### [Inline Checks](./inline-checks.md)
Custom check functions for project-specific validation logic.

### [Command Checks](./command-checks.md)
Shell command validation (npm test, linters, custom scripts).

### [Prompt Checks](./prompt-checks.md)
AI-powered validation using natural language criteria.

### [Writing Custom Checks](./writing-custom-checks.md)
Create reusable checks for your project or publish as plugins.

---

## Five Types of Checks

### 1. Named Checks
```typescript
.check('file-exists', 'src/api.ts')
.check('file-contains', { path: 'README.md', content: 'Installation' })
```

### 2. Inline Check Functions
```typescript
.check(async (ctx) => {
  const exists = await ctx.fileExists('config.json');
  return { pass: exists, message: 'Config file required' };
})
```

### 3. Command Checks
```typescript
.check('command', { cmd: 'npm test' })
.check('command', { cmd: 'npm run lint', cwd: 'packages/app' })
```

### 4. Prompt Checks
```typescript
.check('prompt', {
  prompt: 'Verify the API follows RESTful conventions'
})
```

### 5. AutoHarness (Advanced)
```typescript
.harness({
  testFile: 'button.test.tsx',
  targetFile: 'Button.tsx'
})
```

---

## How Checks Work

### The Check Loop

```
1. Task executes (agent does work)
2. All checks run in sequence
3. If all pass → Task complete
4. If any fail → Provide feedback to agent
5. Agent retries (up to maxAttempts)
6. Repeat until pass or exhausted
```

### Check Results

Each check returns:
```typescript
{
  pass: boolean;           // Did check pass?
  message?: string;        // Feedback for agent
  details?: any;          // Additional context
}
```

---

## Quick Reference

### Multiple Checks

```typescript
.addTask('create-api', (task) => task
  .does('Create REST API for users')
  .check('file-exists', 'src/api/users.ts')
  .check('file-contains', { path: 'src/api/users.ts', content: 'export class UserAPI' })
  .check('command', { cmd: 'npm run typecheck' })
  .check('command', { cmd: 'npm test -- users.test' })
  .check(async (ctx) => {
    const content = await ctx.readFile('src/api/users.ts');
    const hasAuth = content.includes('authenticate');
    return { pass: hasAuth, message: 'API must include authentication' };
  })
)
```

### Conditional Checks

```typescript
.check(async (ctx) => {
  if (process.env.NODE_ENV === 'production') {
    const hasTests = await ctx.fileExists('tests/');
    return { pass: hasTests, message: 'Production deploys require tests' };
  }
  return { pass: true };
})
```

### Checks with Retries

```typescript
.addTask('deploy', (task) => task
  .does('Deploy to production')
  .check('command', {
    cmd: 'curl -f https://api.example.com/health',
    retries: 5,
    retryDelay: 2000
  })
  .maxAttempts(3)
)
```

---

## Built-in Named Checks

### File Checks
- `file-exists` - File or directory exists
- `file-contains` - File contains specific text
- `file-not-contains` - File doesn't contain text
- `json-valid` - File is valid JSON
- `json-schema` - JSON matches schema

### Command Checks
- `command` - Shell command exits with 0
- `npm-test` - npm test passes
- `npm-lint` - npm run lint passes

### Content Checks
- `no-todos` - No TODO comments in code
- `no-console-log` - No console.log in production code
- `no-hardcoded-secrets` - No API keys or passwords

See [Named Checks](./named-checks.md) for complete list.

---

## Best Practices

### ✅ Do

- Use multiple checks for important tasks
- Start with simple checks (file-exists)
- Add command checks for tests/lints
- Provide clear failure messages
- Use prompt checks for subjective criteria

### ❌ Don't

- Create checks that are too strict
- Skip checks to "move faster"
- Use checks for side effects
- Make checks dependent on external services (unreliable)

---

## Check Execution Order

Checks run in the order they're defined:

```typescript
.check('file-exists', 'src/api.ts')     // 1. Run first
.check('command', { cmd: 'npm test' })  // 2. Run if #1 passes
.check(async (ctx) => { ... })          // 3. Run if #2 passes
```

**Early termination**: If a check fails, subsequent checks don't run. The agent retries immediately.

---

## Writing Effective Checks

### Good Check
```typescript
.check(async (ctx) => {
  const content = await ctx.readFile('src/config.ts');
  const hasRequired = content.includes('DATABASE_URL') &&
                      content.includes('API_KEY');
  return {
    pass: hasRequired,
    message: 'Config must export DATABASE_URL and API_KEY'
  };
})
```

### Bad Check
```typescript
.check(async (ctx) => {
  // ❌ Too vague
  return { pass: Math.random() > 0.5, message: 'Something wrong' };
})
```

---

## Next Steps

- **Learn each check type**: Read section docs above
- **See AutoHarness**: [HARNESS.md](../HARNESS.md)
- **Advanced patterns**: [Guides](../guides/README.md)
- **API reference**: [Verifier API](../api-reference/verifier-api.md)

---

[← Back to Documentation Home](../README.md)
