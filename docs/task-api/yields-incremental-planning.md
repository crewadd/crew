# Yields & Incremental Planning

**Dynamic task spawning based on runtime discoveries.**

[[docs](../README.md) > [task-api](./README.md) > yields-incremental-planning]

---

## Overview

The `.yields()` method enables **incremental planning** — tasks can dynamically spawn follow-up tasks at runtime based on their output.

Instead of predicting all work upfront, you discover work as you execute:

```typescript
// Task 1: Analyze requirements
ctx.createTask('analyze', 'Analyze requirements')
  .prompt('Read requirements and identify features')
  .outputs(['FEATURES.md'])

// Task 2: Analyze discovers features, yields tasks for each
.yields({
  plan: 'For each feature in FEATURES.md, create an implementation task',
  target: 'next-epic'
})
```

Execution flow:
```
1. Analyze task completes
   ↓
2. Framework reads FEATURES.md
   ↓
3. Yields resolves: generates task definitions
   ↓
4. Tasks injected into plan
   ↓
5. New tasks execute automatically
```

---

## Two Modes

### 1. AI-Driven Yields

Agent analyzes output and generates tasks:

```typescript
.yields({
  plan: 'For each animation in the spec, create a task to implement it',
  target: 'next-epic'
})
```

The agent:
1. Reads the task's output files
2. Parses them according to the `plan` prompt
3. Returns structured task definitions
4. Framework injects them into the plan

### 2. Programmatic Yields

Custom function that generates tasks:

```typescript
.yields(async (ctx, result) => {
  const doc = await ctx.tools.file.read('FEATURES.md');
  const features = parseFeatures(doc);

  return features.map(f =>
    ctx.createTask(`impl-${f.id}`, `Implement ${f.name}`)
      .skill('feature-impl')
      .prompt(f.description)
      .build()
  );
})
```

---

## AI-Driven Yields

### Basic Usage

```typescript
ctx.createTask('scaffold-features', 'Scaffold features')
  .prompt('Analyze requirements and create a feature checklist')
  .outputs(['FEATURE_CHECKLIST.md'])
  .yields({
    plan: 'For each feature listed, create an implementation task'
  })
```

The agent reads `FEATURE_CHECKLIST.md` and generates tasks.

### With Custom Agent

```typescript
.yields({
  plan: 'Generate one implementation task per animation component',
  skill: 'task-planner'  // Use specific agent for planning
})
```

### Specific Files

```typescript
.yields({
  plan: 'For each file in src/routes/, create a test file',
  skill: 'test-planner'
})
```

By default, uses task's declared `outputs`. Override with `files` if needed.

### Targeting Epics

```typescript
// Append to current epic
.yields({
  plan: 'Create subtasks for each chapter',
  target: 'current-epic'  // Default
})

// Create new epic after current
.yields({
  plan: 'Create subtasks for each phase',
  target: 'next-epic'
})

// Append to specific epic
.yields({
  plan: 'Create subtasks for migrations',
  target: { epic: 'database' }
})
```

---

## Programmatic Yields

### Basic Usage

```typescript
.yields(async (ctx, result) => {
  const doc = await ctx.tools.file.read('docs/requirements.md');
  const sections = parseMarkdown(doc);

  return sections.map(section =>
    ctx.createTask(`implement-${section.id}`, `Implement ${section.title}`)
      .prompt(section.description)
      .build()
  );
})
```

### Access Full Context

```typescript
.yields(async (ctx, result) => {
  // ctx = TaskContext (file access, shell, git, etc.)
  // result = TaskResult from the parent task

  const doc = await ctx.tools.file.read('output.txt');
  const features = parseOutput(doc);

  return features.map(f => {
    const task = ctx.createTask(`impl-${f.id}`, f.name);

    // Inherit from parent
    task.inputs([...ctx.task.inputs || []]);

    // Use result in configuration
    if (result.success) {
      task.prompt(`Based on the completed analysis:\n${doc}`);
    }

    return task.build();
  });
})
```

### Complex Parsing

```typescript
.yields(async (ctx, result) => {
  const files = await ctx.tools.file.glob('src/pages/**/*.tsx');
  const tasks: TaskDef[] = [];

  for (const file of files) {
    const content = await ctx.tools.file.read(file);
    const hasTests = content.includes('import { test }');

    if (!hasTests) {
      tasks.push(
        ctx.createTask(`test-${file}`, `Add tests for ${file}`)
          .prompt(`Add tests for: ${file}`)
          .build()
      );
    }
  }

  return tasks;
})
```

---

## Yields Configuration

### Basic Config

```typescript
interface YieldsConfig {
  plan?: string;           // AI planning prompt
  skill?: string;          // Agent for AI planning
  tasks?: TaskDef[];       // Static task templates
  target?: 'current-epic' | 'next-epic' | { epic: string };
  when?: (result) => boolean;
  approval?: 'auto' | 'review';
  maxTasks?: number;       // Safety limit (default: 20)
  checks?: CheckRef[];     // Applied to all yielded tasks
  taskType?: string;       // Type for all yielded tasks
}
```

### Common Options

**Conditional yields:**
```typescript
.yields({
  plan: '...',
  when: (result) => result.success && result.files?.length > 0
})
```

**Apply default checks:**
```typescript
.yields({
  plan: '...',
  checks: ['tsc', 'build']  // All yielded tasks get these
})
```

**Inherit task type:**
```typescript
.yields({
  plan: '...',
  taskType: 'implementation'  // All yielded tasks are 'implementation' type
})
```

**Safety limit:**
```typescript
.yields({
  plan: '...',
  maxTasks: 10  // Never generate more than 10 tasks
})
```

**Human review:**
```typescript
.yields({
  plan: '...',
  approval: 'review'  // Generated tasks need human approval
})
```

---

## Practical Examples

### Feature Generation from Design Doc

```typescript
ctx.createTask('parse-design', 'Parse design document')
  .prompt('Read design.md and extract all feature requirements')
  .outputs(['DESIGN_ANALYZED.md'])
  .yields({
    plan: `For each feature in the design:
      1. Create implementation task
      2. Include success criteria
      3. Set appropriate checks`,
    taskType: 'feature-implementation',
    checks: ['tsc', 'build', 'test'],
    target: 'next-epic'
  })

// Result: automatically generated tasks like:
// - impl-auth
// - impl-payments
// - impl-notifications
// all inheriting type and checks
```

### Page Route Scaffolding

```typescript
ctx.createTask('scaffold-routes', 'Scaffold Next.js routes')
  .prompt('Create page routes for: /products, /orders, /admin')
  .outputs(['src/app/products/page.tsx', 'src/app/orders/page.tsx', 'src/app/admin/page.tsx'])
  .yields(async (ctx, result) => {
    const files = await ctx.tools.file.glob('src/app/**/page.tsx');

    return files.map(file => {
      const name = file.split('/')[2];  // Extract route name
      return ctx.createTask(`style-${name}`, `Style ${name} page`)
        .inputs([file])
        .prompt(`Add styling to ${file}`)
        .build();
    });
  })
```

### Test File Generation

```typescript
ctx.createTask('identify-untested', 'Identify files needing tests')
  .prompt('Scan src/ and list all files without corresponding test files')
  .outputs(['UNTESTED_FILES.txt'])
  .yields({
    plan: 'For each untested file, create a task to write tests',
    skill: 'test-writer',
    target: 'next-epic'
  })
```

### Database Migrations from Schema Changes

```typescript
ctx.createTask('detect-schema-changes', 'Detect schema changes needed')
  .prompt('Compare old schema with new requirements and generate migration plan')
  .outputs(['MIGRATIONS_NEEDED.md'])
  .yields({
    plan: 'For each migration needed, create a task to implement it',
    target: 'next-epic',
    checks: ['migration-syntax', 'rollback-check']
  })
```

### Component Creation with Tests

```typescript
ctx.createTask('design-components', 'Design component structure')
  .prompt('Analyze requirements and design component hierarchy')
  .outputs(['COMPONENTS.md'])
  .yields({
    plan: 'For each component, create implementation and test tasks',
    skill: 'component-planner'
  })
```

---

## Conditional Yields

### Only Yield on Success

```typescript
.yields({
  plan: '...',
  when: (result) => result.success
})
```

### Yield Based on Output Content

```typescript
.yields(async (ctx, result) => {
  if (!result.success) {
    return [];  // Don't yield on failure
  }

  const output = await ctx.tools.file.read('analysis.txt');

  if (output.includes('CRITICAL')) {
    // Generate urgent tasks
    return [/* ... */];
  }

  return [];  // No tasks if no critical items
})
```

### Yield Based on Previous Tasks

```typescript
.yields(async (ctx, result) => {
  // Check if all dependencies completed
  const depsComplete = ctx.epic.tasks
    .filter(t => ctx.task.deps?.includes(t.id))
    .every(t => t.status === 'done');

  if (!depsComplete) {
    return [];
  }

  // Generate follow-up tasks
  return [/* ... */];
})
```

---

## Accessing Yielded Tasks

### In Subsequent Tasks

Yielded tasks appear in the epic after they're generated:

```typescript
ctx.createTask('summarize', 'Summarize completed work')
  .deps(['impl-1', 'impl-2', 'impl-3'])  // Depends on generated tasks
  .prompt('Summarize all implemented features')
```

### In Task State

```typescript
ctx.createTask('verify', 'Verify all features')
  .shouldStart(async (ctx) => {
    // Check if all yielded tasks completed
    const siblings = ctx.epic.tasks;
    return siblings.every(t => t.status === 'done');
  })
```

---

## Best Practices

### ✅ Do

- **Keep yields simple** — generate simple, focused tasks
- **Include explicit checks** — yielded tasks should be verifiable
- **Use meaningful task IDs** — helps with debugging
- **Include clear prompts** — agent will inherit these as instructions
- **Set maxTasks safety limit** — prevents runaway generation

### ❌ Don't

- **Yield complex tasks** — keep individual yielded tasks simple
- **Yield without checks** — quality gates still apply
- **Forget the safety limit** — maxTasks prevents bugs
- **Nest yields too deep** — keep hierarchy reasonable
- **Yield secrets or sensitive data** — only generate from safe sources

---

## Yields + Planning

Combine yields with planning for hierarchical planning:

```typescript
// Phase 1: Planning
ctx.createTask('plan', 'Plan implementation')
  .planning()
  .prompt('Create a detailed plan for each module')
  .outputs(['PLAN.md'])
  .review('human')

// Phase 2: Execution
.yields({
  plan: 'For each module in the plan, create a task',
  target: 'next-epic'
})
```

Flow:
1. Agent creates plan
2. Human approves
3. Agent generates tasks from plan
4. Generated tasks execute

---

## Yields + Review

Require approval for generated tasks:

```typescript
.yields({
  plan: 'Generate implementation tasks',
  approval: 'review'  // Human approves the list
})
```

Or use a custom check:

```typescript
.yields({
  plan: '...',
  checks: [
    {
      prompt: 'Verify all generated tasks have clear requirements'
    }
  ]
})
```

---

## Troubleshooting

### Yields Not Generating

Check that:
1. Parent task completed successfully
2. Output files exist and are readable
3. `when()` condition passes
4. `maxTasks` limit not exceeded

Add logging:
```typescript
.yields(async (ctx, result) => {
  ctx.log.info('Yields starting', { success: result.success });

  const doc = await ctx.tools.file.read('output.txt');
  ctx.log.debug('Read file', { size: doc.length });

  const tasks = parseAndGenerate(doc);
  ctx.log.info('Generating tasks', { count: tasks.length });

  return tasks;
})
```

### Yielded Tasks Have Wrong Configuration

Verify task builder setup:

```typescript
.yields(async (ctx, result) => {
  return [
    ctx.createTask('impl', 'Implement feature')
      .skill('implementation')  // Set skill
      .checks(['tsc'])         // Set checks
      .prompt('...')           // Set prompt
      .build()                 // Don't forget .build()!
  ];
})
```

### Too Many Tasks Generated

Implement safety limits:

```typescript
.yields({
  plan: '...',
  maxTasks: 10,  // Safety limit
  when: (result) => {
    // Only yield if reasonable size
    return result.output?.length < 10000;
  }
})
```

---

## See Also

- [Planning Phase](./planning-phase.md) - Pair with planning for phased execution
- [Review Gates](./review-gates.md) - Approve generated tasks
- [Fluent Builder](./fluent-builder.md) - `.yields()` configuration
- [Task Context](./task-context.md) - Context available in yield functions
- [Guides: Multi-Agent](../guides/multi-agent-workflows.md) - Coordinating multiple agents

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
