# Task Context

**The runtime environment available to tasks during execution.**

[[docs](../README.md) > [task-api](./README.md) > task-context]

---

## Overview

`TaskContext` is the object passed to every task executor, hook, and check. It provides access to:

- **Task & Epic metadata** — identity, inputs, outputs, dependencies
- **File tools** — read, write, glob operations
- **Shell tools** — execute commands
- **Git tools** — version control operations
- **AI agent** — delegate to the configured agent persona
- **State management** — task-local and shared variables
- **Logging** — structured output

```typescript
async function execute(ctx: TaskContext) {
  ctx.log.info('Starting task');

  // Read files
  const config = await ctx.tools.file.read('config.json');

  // Run shell commands
  const result = await ctx.tools.shell.run('npm test');

  // Call AI agent for help
  const response = await ctx.agent('Refactor this code', {
    inputs: ['src/utils.ts'],
    skill: 'refactoring-agent'
  });

  // Access task info
  console.log(`Task ${ctx.taskId}: ${ctx.task.title}`);

  return { success: true };
}
```

---

## Core Properties

### `taskId: string`

Unique identifier for this task execution.

```typescript
ctx.log.info(`Executing task: ${ctx.taskId}`);
// Output: "Executing task: m1.3"
```

### `task: TaskDef`

The task definition (ID, title, prompt, checks, etc).

```typescript
const { id, title, prompt, inputs, outputs } = ctx.task;
ctx.log.info(`${title} — inputs: ${inputs?.join(', ')}`);
```

### `compoundTask: CompoundTask`

The task with runtime state (status, assignee, output, attempts).

```typescript
ctx.log.info(`Task status: ${ctx.compoundTask.status}`);
// Output: "Task status: active"
```

### `epic: EpicContext`

Metadata about the parent epic.

```typescript
const { id, title, num, tasks } = ctx.epic;
ctx.log.info(`Epic ${num}: ${title}`);
ctx.log.debug(`Sibling tasks: ${tasks.length}`);
```

### `project: ProjectContext`

Project-level metadata and shared variables.

```typescript
const { name, title, vars } = ctx.project;
ctx.log.info(`Project: ${title}`);

// Access project-level variables
const environment = ctx.project.vars.environment;
```

### `buildCtx: BuildContext`

File paths for the project.

```typescript
const appDir = ctx.buildCtx.appDir;  // Absolute path to project root
ctx.log.debug(`App directory: ${appDir}`);
```

### `taskDir: string`

Absolute path to the task directory (where task.yaml and outputs go).

```typescript
await ctx.tools.file.write(
  `${ctx.taskDir}/report.md`,
  'Execution report...'
);
```

### `vars: Record<string, unknown>`

Task, epic, and project-level variables merged together.

```typescript
const { version, environment, feature } = ctx.vars;

// Typically set in the plan:
ctx.createTask('deploy', 'Deploy app')
  .vars({ target: 'staging', retryLimit: 5 })
```

---

## File Tools

### `tools.file.read(path: string): Promise<string>`

Read a file. Path is relative to project root.

```typescript
const content = await ctx.tools.file.read('package.json');
const json = JSON.parse(content);
```

### `tools.file.write(path: string, content: string): Promise<void>`

Write a file. Creates parent directories as needed.

```typescript
await ctx.tools.file.write(
  'src/generated/api.ts',
  `export const API_VERSION = '1.0.0';`
);
```

### `tools.file.exists(path: string): Promise<boolean>`

Check if a file exists.

```typescript
if (await ctx.tools.file.exists('dist/index.js')) {
  ctx.log.info('Build output found');
}
```

### `tools.file.glob(pattern: string): Promise<string[]>`

List files matching a glob pattern.

```typescript
const components = await ctx.tools.file.glob('src/components/**/*.tsx');
ctx.log.info(`Found ${components.length} components`);

for (const comp of components) {
  const content = await ctx.tools.file.read(comp);
  // Process each component
}
```

---

## Shell Tools

### `tools.shell.run(command: string, opts?): Promise<ShellResult>`

Execute a shell command. Returns exit code, stdout, and stderr.

```typescript
const result = await ctx.tools.shell.run('npm test');

if (result.exitCode === 0) {
  ctx.log.info('All tests passed');
} else {
  ctx.log.error('Tests failed', { stderr: result.stderr });
}
```

**With options:**
```typescript
const result = await ctx.tools.shell.run('cargo build --release', {
  cwd: 'src/native',
  env: { RUST_LOG: 'debug' }
});
```

**Piping and complex commands:**
```typescript
// For complex commands, write to a script file first
const script = `#!/bin/bash
set -e
npm run lint
npm run test
npm run build
`;

await ctx.tools.file.write('build.sh', script);
const result = await ctx.tools.shell.run('bash build.sh');
```

---

## Git Tools

### `tools.git.status(): Promise<string>`

Get git status output.

```typescript
const status = await ctx.tools.git.status();
if (status.includes('working tree clean')) {
  ctx.log.info('Repository is clean');
}
```

### `tools.git.diff(): Promise<string>`

Get diff of unstaged changes.

```typescript
const changes = await ctx.tools.git.diff();
if (changes.includes('breaking change')) {
  ctx.log.warn('Detected breaking changes');
}
```

### `tools.git.add(paths: string[]): Promise<void>`

Stage files for commit.

```typescript
await ctx.tools.git.add(['src/**/*.ts', 'docs/**/*.md']);
```

### `tools.git.commit(message: string): Promise<void>`

Create a commit.

```typescript
await ctx.tools.git.commit('feat: implement user authentication');
```

---

## AI Agent

### `agent(prompt: string, opts?): Promise<AgentResult>`

Delegate to the AI agent persona.

```typescript
const result = await ctx.agent(
  'Refactor this payment module to use async/await',
  {
    skill: 'refactoring-agent',
    inputs: ['src/payment'],
    outputs: ['src/payment'],
    timeout: 60000
  }
);

if (result.success) {
  ctx.log.info('Refactoring complete', { files: result.files });
} else {
  throw new Error(`Agent failed: ${result.error}`);
}
```

**Agent options:**

| Option | Type | Purpose |
|--------|------|---------|
| `skill` | string | Agent skill to use |
| `skills` | string[] | Multiple skills to load |
| `agent` | string | Agent persona name |
| `inputs` | string[] | Input files for context |
| `outputs` | string[] | Expected output files |
| `context` | Record | Extra context data |
| `timeout` | number | Execution timeout (ms) |
| `stream` | boolean | Stream output as events |
| `permissionMode` | 'default'\|'acceptEdits' | Agent permission level |
| `resume` | string | Resume previous session |

**Resuming a session:**

```typescript
// First phase: planning
const planResult = await ctx.agent('Create a plan for migrating to TypeScript', {
  permissionMode: 'plan'  // Read-only, no edits
});

// ... human reviews the plan ...

// Second phase: execution (resume from planning)
const execResult = await ctx.agent('Execute the plan created earlier', {
  resume: planResult.sessionId
});
```

---

## State Management

### `state.get<T>(key: string): T | undefined`

Retrieve a state value.

```typescript
const previousResult = ctx.state.get<string>('lastBuildOutput');
if (previousResult) {
  ctx.log.debug('Using cached build', { cached: true });
}
```

### `state.set<T>(key: string, value: T): void`

Store a state value (persists within task execution).

```typescript
const buildResult = await ctx.tools.shell.run('npm run build');
ctx.state.set('lastBuildOutput', buildResult.stderr);
```

### `state.has(key: string): boolean`

Check if a state key exists.

```typescript
if (!ctx.state.has('initialized')) {
  ctx.state.set('initialized', true);
  await setup();
}
```

### `state.delete(key: string): boolean`

Delete a state key. Returns true if it existed.

```typescript
const existed = ctx.state.delete('temporaryData');
```

---

## Logging

### `log.info(message: string, meta?: Record<string, any>): void`

Log informational message.

```typescript
ctx.log.info('Build started', { target: 'production' });
```

### `log.warn(message: string, meta?: Record<string, any>): void`

Log warning message.

```typescript
ctx.log.warn('Deprecated API used', { file: 'src/old-api.ts' });
```

### `log.error(message: string, meta?: Record<string, any>): void`

Log error message.

```typescript
ctx.log.error('Build failed', { exitCode: 1, reason: 'syntax error' });
```

### `log.debug(message: string, meta?: Record<string, any>): void`

Log debug message (only shown with `--verbose` flag).

```typescript
ctx.log.debug('Detailed execution info', { checksum: 'abc123' });
```

---

## Practical Examples

### Reading and Processing Files

```typescript
// Count lines of code
async function countLines(ctx: TaskContext) {
  const files = await ctx.tools.file.glob('src/**/*.ts');
  let totalLines = 0;

  for (const file of files) {
    const content = await ctx.tools.file.read(file);
    const lines = content.split('\n').length;
    totalLines += lines;
    ctx.log.debug(`${file}: ${lines} lines`);
  }

  ctx.log.info(`Total lines: ${totalLines}`);
  return { success: true };
}
```

### Building and Testing

```typescript
async function buildAndTest(ctx: TaskContext) {
  // Build
  ctx.log.info('Building...');
  const buildResult = await ctx.tools.shell.run('npm run build');

  if (buildResult.exitCode !== 0) {
    throw new Error(`Build failed: ${buildResult.stderr}`);
  }

  // Test
  ctx.log.info('Running tests...');
  const testResult = await ctx.tools.shell.run('npm test -- --coverage');

  if (testResult.exitCode !== 0) {
    throw new Error(`Tests failed: ${testResult.stderr}`);
  }

  ctx.log.info('Build and tests successful');
  return { success: true };
}
```

### Multi-Step with State

```typescript
async function complexWorkflow(ctx: TaskContext) {
  // Step 1: Check if we've already started
  if (!ctx.state.has('workflow_started')) {
    ctx.log.info('Starting workflow');
    ctx.state.set('workflow_started', true);
    ctx.state.set('step', 1);
  }

  // Step 2: Run setup
  const step = ctx.state.get<number>('step') || 1;
  if (step === 1) {
    ctx.log.info('Step 1: Setup');
    await ctx.tools.shell.run('npm install');
    ctx.state.set('step', 2);
  }

  // Step 3: Build
  if (ctx.state.get<number>('step') === 2) {
    ctx.log.info('Step 2: Build');
    const result = await ctx.tools.shell.run('npm run build');
    if (result.exitCode !== 0) {
      throw new Error('Build failed');
    }
    ctx.state.set('step', 3);
  }

  // Step 4: Commit
  if (ctx.state.get<number>('step') === 3) {
    ctx.log.info('Step 3: Commit');
    await ctx.tools.git.add(['dist/**']);
    await ctx.tools.git.commit('chore: built artifacts');
    ctx.state.set('workflow_completed', true);
  }

  return { success: true };
}
```

### Using Agent for Assistance

```typescript
async function implementWithAssistance(ctx: TaskContext) {
  // Human provides requirements
  const requirements = ctx.vars.requirements as string;

  // Agent creates a plan
  const planResult = await ctx.agent(
    `Plan implementation for: ${requirements}`,
    { permissionMode: 'plan' }
  );

  ctx.log.info('Agent plan created', { sessionId: planResult.sessionId });
  ctx.state.set('planSessionId', planResult.sessionId);

  // Agent executes the plan
  const execResult = await ctx.agent(
    'Execute the plan you just created',
    { resume: planResult.sessionId }
  );

  return { success: execResult.success, files: execResult.files };
}
```

### Generating Reports

```typescript
async function generateReport(ctx: TaskContext) {
  const timestamp = new Date().toISOString();
  const status = ctx.compoundTask.status;
  const epicNum = ctx.epic.num;

  const report = `
# Task Execution Report

**Task:** ${ctx.task.title}
**ID:** ${ctx.taskId}
**Epic:** ${ctx.epic.title} (#${epicNum})
**Status:** ${status}
**Timestamp:** ${timestamp}

## Environment
- App Dir: ${ctx.buildCtx.appDir}
- Task Dir: ${ctx.taskDir}

## Variables
${Object.entries(ctx.vars)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join('\n')}

---

Report generated at ${timestamp}
`;

  await ctx.tools.file.write(`${ctx.taskDir}/report.md`, report);
  ctx.log.info('Report generated');

  return { success: true };
}
```

---

## Advanced: Custom Tools

Projects can inject custom tools into `TaskContext.tools`:

```typescript
// In .crew/setup/index.ts
export const tools = {
  database: async (ctx) => ({
    query: (sql) => executeQuery(sql),
    seed: (data) => seedDatabase(data)
  }),
  slack: async (ctx) => ({
    notify: (msg) => sendSlackMessage(msg)
  })
};
```

Then use in tasks:

```typescript
async function notifyTeam(ctx: TaskContext) {
  // @ts-ignore (custom tools)
  await ctx.tools.slack.notify('Build completed');
  await ctx.tools.database.query('SELECT COUNT(*) FROM deployments');
  return { success: true };
}
```

---

## TypeScript Support

`TaskContext` is fully typed. IDEs provide autocomplete and type checking:

```typescript
import type { TaskContext } from 'crew';

export default async function execute(ctx: TaskContext) {
  // IDE knows all methods on ctx.tools.file, ctx.agent, etc.
  const content = await ctx.tools.file.read('src/index.ts');

  // Type inference for state
  ctx.state.set('count', 42);
  const count = ctx.state.get<number>('count');  // Type: number | undefined

  return { success: true };
}
```

---

## See Also

- [Fluent Builder](./fluent-builder.md) - Task configuration
- [Checks](./checks.md) - Quality gates and their context
- [Lifecycle Hooks](./lifecycle-hooks.md) - Hook patterns
- [AutoHarness](../HARNESS.md) - Task validation
- [Guides: Custom Tools](../advanced/extending-tools.md) - Extending TaskContext

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
