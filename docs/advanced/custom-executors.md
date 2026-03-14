# Writing Custom Executors

**Create programmable task executors for specialized workloads.**

[[docs](../README.md) > [advanced](./README.md) > custom-executors]

---

## Overview

By default, Crew delegates tasks to AI agents. Custom executors let you:

1. **Override agent execution** - Run deterministic code instead
2. **Hybrid workflows** - Mix AI and code
3. **Specialized logic** - Custom business rules
4. **Performance optimization** - Skip AI for simple tasks
5. **Determinism** - Same output every time

---

## Basic Executor

### Executor Structure

```typescript
// .crew/setup/planning/executors/create-config.ts
import type { TaskContext } from 'crew';

export const execute = async (ctx: TaskContext): Promise<string> => {
  const { tools } = ctx;

  // Generate config
  const config = {
    name: ctx.task.title,
    timestamp: new Date().toISOString(),
    buildContext: ctx.buildCtx.appDir
  };

  // Write to file
  await tools.file.write(
    `${ctx.buildCtx.appDir}/crew.config.json`,
    JSON.stringify(config, null, 2)
  );

  return `Created config: crew.config.json`;
};
```

### Link Executor in Plan

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('config', 'Create Config')
          .execute('./executors/create-config.ts')  // Reference executor
          .check({ cmd: 'test -f crew.config.json' })
      )
  );

  return plan.build();
}
```

---

## Executor API

### TaskContext

```typescript
interface TaskContext {
  // Task info
  readonly taskId: string;
  readonly task: TaskDef;
  readonly compoundTask: CompoundTask;

  // Context
  readonly epic: EpicContext;
  readonly project: ProjectContext;
  readonly buildCtx: BuildContext;

  // Tools
  readonly tools: TaskTools;

  // State
  readonly state: TaskState;
  readonly vars: Record<string, unknown>;

  // Logging
  readonly log: TaskLogger;

  // Agent (if needed for hybrid)
  readonly agent: AgentFn;
}
```

### Available Tools

```typescript
ctx.tools.file.read(path)                 // Read file
ctx.tools.file.write(path, content)       // Write file
ctx.tools.file.exists(path)               // Check existence
ctx.tools.file.delete(path)               // Delete file
ctx.tools.file.glob(pattern)              // Find files

ctx.tools.shell.run(command)              // Execute shell
ctx.tools.shell.runAsync(command)         // Async shell

ctx.tools.git.commit(message)             // Git commit
ctx.tools.git.push()                      // Git push
ctx.tools.git.getCurrentBranch()          // Get branch

// Logging
ctx.log.info(message)
ctx.log.debug(message)
ctx.log.warn(message)
ctx.log.error(message)
```

---

## Common Patterns

### File Generation

```typescript
// Generate TypeScript interface from schema
export const execute = async (ctx: TaskContext) => {
  const { tools } = ctx;

  // Read schema
  const schema = await tools.file.read(`${ctx.buildCtx.appDir}/schema.json`);
  const data = JSON.parse(schema);

  // Generate interface
  let code = 'export interface User {\n';
  for (const [key, type] of Object.entries(data.properties)) {
    code += `  ${key}: ${type};\n`;
  }
  code += '}\n';

  // Write to file
  await tools.file.write(
    `${ctx.buildCtx.appDir}/src/types/user.ts`,
    code
  );

  return 'Generated User interface';
};
```

### Shell Command Execution

```typescript
// Run a build command and capture output
export const execute = async (ctx: TaskContext) => {
  const { tools } = ctx;

  try {
    const output = await tools.shell.run('npm run build');
    return `Build succeeded:\n${output}`;
  } catch (error) {
    return `Build failed: ${error.message}`;
  }
};
```

### Deterministic Code Generation

```typescript
// Generate consistent code (same every time)
export const execute = async (ctx: TaskContext) => {
  const { tools } = ctx;

  const code = `
// Auto-generated file
export const version = "${new Date().toISOString()}";
export const buildId = "${ctx.compoundTask.id}";

export async function initialize() {
  console.log('Initializing...');
}
  `.trim();

  await tools.file.write(
    `${ctx.buildCtx.appDir}/src/generated.ts`,
    code
  );

  return 'Generated initialization module';
};
```

---

## Hybrid Executor (Code + Agent)

Mix custom code with AI:

```typescript
export const execute = async (ctx: TaskContext) => {
  const { tools, agent } = ctx;

  // Step 1: Custom code generates boilerplate
  const boilerplate = generateBoilerplate();
  await tools.file.write(
    `${ctx.buildCtx.appDir}/src/api.ts`,
    boilerplate
  );

  // Step 2: Agent adds business logic
  const prompt = `
    A boilerplate API exists in src/api.ts.
    Add authentication middleware and rate limiting.
    Don't modify the boilerplate, add to it.
  `;

  const result = await agent({
    prompt,
    taskId: ctx.taskId
  });

  return result.text;
};

function generateBoilerplate(): string {
  return `
import express from 'express';

const app = express();

// TODO: Add middleware here

export default app;
  `.trim();
}
```

---

## State Management

### Using Task State

```typescript
export const execute = async (ctx: TaskContext) => {
  const { tools, state } = ctx;

  // Retrieve previous execution state
  const previousRun = state.get<{ count: number }>('run-data');
  const count = (previousRun?.count || 0) + 1;

  ctx.log.info(`Run number: ${count}`);

  // Store for next run
  state.set('run-data', { count });

  return `Executed ${count} times`;
};
```

### Using Project Variables

```typescript
export const execute = async (ctx: TaskContext) => {
  const { vars } = ctx;

  // Access global variables from plan
  const appName = vars.appName as string;
  const version = vars.version as string;

  ctx.log.info(`Building ${appName} v${version}`);

  return `Version info: ${appName}@${version}`;
};
```

---

## Error Handling

### Graceful Errors

```typescript
export const execute = async (ctx: TaskContext) => {
  const { tools, log } = ctx;

  try {
    const content = await tools.file.read('/missing/file.txt');
    return content;
  } catch (error) {
    log.warn(`File not found: ${error.message}`);
    return 'File not found, skipping';
  }
};
```

### Validation

```typescript
export const execute = async (ctx: TaskContext) => {
  const { task, log } = ctx;

  // Validate inputs
  if (!task.inputs || task.inputs.length === 0) {
    throw new Error('Task requires inputs');
  }

  // Validate outputs
  if (!task.outputs || task.outputs.length === 0) {
    throw new Error('Task requires outputs');
  }

  return 'Validation passed';
};
```

---

## Real-World Examples

### Generate Documentation

```typescript
// Generate markdown from TypeScript files
export const execute = async (ctx: TaskContext) => {
  const { tools, buildCtx } = ctx;

  // Find all TS files
  const files = await tools.file.glob(`${buildCtx.appDir}/src/**/*.ts`);

  let markdown = '# API Documentation\n\n';

  for (const file of files) {
    const content = await tools.file.read(file);

    // Extract exports
    const exports = content.match(/export (class|interface|function|const) (\w+)/g) || [];

    markdown += `## ${file}\n`;
    for (const exp of exports) {
      markdown += `- ${exp}\n`;
    }
    markdown += '\n';
  }

  await tools.file.write(
    `${buildCtx.appDir}/API.md`,
    markdown
  );

  return 'Generated API documentation';
};
```

### Scaffold Project Structure

```typescript
export const execute = async (ctx: TaskContext) => {
  const { tools, buildCtx } = ctx;
  const appDir = buildCtx.appDir;

  const dirs = [
    'src/',
    'src/components/',
    'src/api/',
    'src/utils/',
    'src/types/',
    'tests/',
    'docs/'
  ];

  for (const dir of dirs) {
    await tools.shell.run(`mkdir -p ${appDir}/${dir}`);
  }

  // Create index files
  for (const dir of ['src', 'src/components', 'src/api', 'src/utils']) {
    await tools.file.write(
      `${appDir}/${dir}/index.ts`,
      '// Barrel export\n'
    );
  }

  return `Created project structure`;
};
```

### Modify Existing Files

```typescript
// Add environment variables to .env
export const execute = async (ctx: TaskContext) => {
  const { tools, buildCtx } = ctx;

  const envPath = `${buildCtx.appDir}/.env.example`;
  let envContent = '';

  // Check if file exists
  if (await tools.file.exists(envPath)) {
    envContent = await tools.file.read(envPath);
  }

  // Append new variables
  const newVars = `
DATABASE_URL=postgresql://localhost/myapp
API_PORT=3000
DEBUG=false
  `.trim();

  envContent += '\n' + newVars;

  await tools.file.write(envPath, envContent);

  return 'Updated .env.example';
};
```

---

## Testing Executors

### Unit Test Executor

```typescript
// tests/executors/create-config.test.ts
import { execute } from '../../.crew/setup/planning/executors/create-config';

describe('create-config executor', () => {
  it('should create config file', async () => {
    const mockCtx = {
      task: { title: 'Create Config' },
      buildCtx: { appDir: '/tmp/test' },
      tools: {
        file: {
          write: jest.fn()
        }
      }
    };

    const result = await execute(mockCtx as any);

    expect(result).toContain('Created config');
    expect(mockCtx.tools.file.write).toHaveBeenCalled();
  });
});
```

### Integration Test

```typescript
// Test executor in actual plan context
export async function testExecutor() {
  const ctx = {
    task: { title: 'Test', prompt: 'test' },
    buildCtx: { appDir: process.cwd() },
    tools: { /* real tools */ },
    log: console
  };

  const result = await execute(ctx);
  console.log('Result:', result);
}
```

---

## Best Practices

### 1. Keep Executors Simple

```typescript
// Good: Single responsibility
export const execute = async (ctx) => {
  return generateAndWriteFile(ctx);
};

// Bad: Too much logic
export const execute = async (ctx) => {
  // 100 lines of complex logic
  // File generation, validation, CI/CD, deployment...
};
```

### 2. Use Logging

```typescript
export const execute = async (ctx) => {
  ctx.log.info('Starting...');
  ctx.log.debug(`Task: ${ctx.taskId}`);
  // ...
  ctx.log.info('Done');
};
```

### 3. Handle Errors

```typescript
export const execute = async (ctx) => {
  try {
    // work
  } catch (error) {
    ctx.log.error(`Failed: ${error.message}`);
    throw error;  // Let Crew handle retry
  }
};
```

### 4. Document Executor

```typescript
/**
 * Generates TypeScript interfaces from schema.json
 *
 * Requires:
 * - schema.json in project root
 *
 * Generates:
 * - src/types/generated.ts
 */
export const execute = async (ctx: TaskContext) => {
  // ...
};
```

---

## Advanced Patterns

### Conditional Execution

```typescript
export const execute = async (ctx: TaskContext) => {
  if (process.env.NODE_ENV === 'production') {
    return handleProduction(ctx);
  } else {
    return handleDevelopment(ctx);
  }
};
```

### Chaining Tasks

```typescript
export const execute = async (ctx: TaskContext) => {
  // Store data for next task
  ctx.state.set('generated-file', {
    path: 'src/generated.ts',
    hash: calculateHash(content)
  });

  return 'Ready for next task';
};
```

---

## See Also

- [Task Builder API](../api-reference/task-builder.md) - Task configuration
- [Integration Testing](../guides/integration-testing.md) - Testing generated code
- [Performance Tuning](./performance-tuning.md) - Optimize executor performance

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
