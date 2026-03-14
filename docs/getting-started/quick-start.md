# Quick Start

**Build your first Crew project in 5 minutes.**

[[docs](../README.md) > [getting-started](./README.md) > quick-start]

---

## Overview

This guide walks you through creating a minimal Crew project that:
1. Initializes a TypeScript project
2. Creates a simple file
3. Runs checks to verify success

**Time**: ~5 minutes
**Prerequisites**: [Installation complete](./installation.md)

---

## Step 1: Create Project Directory

```bash
mkdir hello-crew
cd hello-crew
npm init -y
```

---

## Step 2: Install Crew

```bash
npm install crew
```

---

## Step 3: Initialize Crew

```bash
npx crew init
```

This creates:
- `.crew/setup/planning/index.ts` - Plan definition
- `crew.json` - Configuration

---

## Step 4: Write Your Plan

Edit `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Hello Crew');

  plan.addEpic(
    ctx.createEpic('greeting', 'Create Greeting')
      .addTask(
        ctx.createTask('write-hello', 'Write hello file')
          .prompt('Create a file named hello.txt with the message "Hello from Crew!"')
          .check({ cmd: 'test -f hello.txt' })
          .check({ cmd: 'grep -q "Hello from Crew" hello.txt' })
      )
  );

  return plan.build();
}
```

**What this does:**
- Creates a **plan** named "Hello Crew"
- Adds an **epic** called "Create Greeting"
- Adds a **task** that creates `hello.txt`
- Adds two **checks** to verify the file exists and contains the right text

---

## Step 5: Materialize the Plan

Convert the TypeScript plan into executable tasks:

```bash
npx crew plan init
```

This creates `.crew/epics/01-greeting/` with task definitions.

---

## Step 6: Run the Project

Execute the plan:

```bash
npx crew run
```

You'll see output like:

```
🚀 Starting execution...
📦 Epic 1/1: Create Greeting
  ✓ Task m1.1: Write hello file
    ✓ Check: test -f hello.txt (passed)
    ✓ Check: grep -q "Hello from Crew" hello.txt (passed)
✅ Project complete!
```

---

## Step 7: Verify the Result

Check that the file was created:

```bash
cat hello.txt
```

Output:
```
Hello from Crew!
```

---

## What Just Happened?

Let's break down the execution flow:

```
1. Plan Definition (TypeScript)
   └─→ createPlan() defined what to build

2. Plan Materialization
   └─→ crew plan init created .crew/epics/ structure

3. Task Execution
   └─→ Agent read the task prompt
   └─→ Agent created hello.txt
   └─→ Framework ran checks
   └─→ All checks passed ✓

4. Result
   └─→ hello.txt exists with correct content
```

---

## Exploring the .crew/ Directory

Look at what was created:

```bash
tree .crew/
```

```
.crew/
├── setup/
│   └── planning/
│       └── index.ts          # Your plan (you wrote this)
├── epics/
│   └── 01-greeting/
│       ├── epic.yaml         # Epic metadata
│       ├── plan.md           # Epic description
│       └── tasks/
│           └── 01-write-hello/
│               ├── task.yaml  # Task metadata
│               ├── task.md    # Task description
│               └── context.txt # Execution context
├── progress.jsonl             # Execution log
└── state.json                 # Current state
```

**Key files:**
- `progress.jsonl` - Append-only execution journal
- `state.json` - Current execution state
- `epics/01-greeting/tasks/01-write-hello/task.md` - Task prompt sent to agent

---

## Adding More Complexity

Let's extend the example to create multiple files:

Edit `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Hello Crew');

  plan.addEpic(
    ctx.createEpic('greetings', 'Create Greetings')
      .addTask(
        ctx.createTask('hello', 'Write hello')
          .prompt('Create hello.txt with "Hello from Crew!"')
          .check({ cmd: 'test -f hello.txt' })
      )
      .addTask(
        ctx.createTask('goodbye', 'Write goodbye')
          .prompt('Create goodbye.txt with "Goodbye from Crew!"')
          .check({ cmd: 'test -f goodbye.txt' })
          .deps(['hello'])  // Run after hello task
      )
  );

  return plan.build();
}
```

Re-materialize and run:

```bash
npx crew plan init
npx crew run
```

Now you have two tasks running sequentially.

---

## Adding Checks

Checks verify that tasks completed successfully. Let's add more validation:

```typescript
.addTask(
  ctx.createTask('hello', 'Write hello')
    .prompt('Create hello.txt with "Hello from Crew!"')
    .check({ cmd: 'test -f hello.txt' })                      // File exists?
    .check({ cmd: 'grep -q "Hello from Crew" hello.txt' })    // Contains text?
    .check({ cmd: 'wc -l hello.txt | grep -q "^1"' })         // Single line?
)
```

If any check fails, the agent retries with feedback from the error.

---

## Using Task Dependencies

Tasks can depend on other tasks:

```typescript
plan.addEpic(
  ctx.createEpic('project', 'Project Setup')
    .addTask(
      ctx.createTask('init', 'Initialize')
        .prompt('Create package.json')
    )
    .addTask(
      ctx.createTask('deps', 'Install dependencies')
        .prompt('Run npm install')
        .deps(['init'])  // Waits for 'init' task
    )
    .addTask(
      ctx.createTask('build', 'Build')
        .prompt('Run npm run build')
        .deps(['deps'])  // Waits for 'deps' task
    )
);
```

Execution order: `init` → `deps` → `build`

---

## Checking Status

View project status anytime:

```bash
npx crew status
```

Output:
```
Project: Hello Crew

Epic 1: Create Greetings
  ✓ m1.1 hello (done)
  ⏳ m1.2 goodbye (active)

Progress: 1/2 tasks complete
```

---

## Resuming After Interruption

Crew automatically saves state. If execution is interrupted:

```bash
# Interrupt with Ctrl+C during run
^C

# Resume from where it left off
npx crew run
```

Crew reads `progress.jsonl` and continues from the last checkpoint.

---

## Common Commands

```bash
# View plan structure
npx crew tree

# Reinitialize tasks from plan
npx crew plan init

# Run all pending tasks
npx crew run

# Run only next ready task
npx crew run next

# View execution status
npx crew status

# Search tasks
npx crew search "hello"

# Run verification checks
npx crew verify
```

---

## Next Steps

Now that you've built your first project:

1. **[Your First Project](./your-first-project.md)** - Complete walkthrough with a real project
2. **[Configuration](./configuration.md)** - Customize Crew settings
3. **[Core Concepts](../core-concepts/README.md)** - Understand how Crew works
4. **[Examples](../examples/README.md)** - See more complex examples

---

## Quick Reference

### Minimal Plan Template

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Project Name');

  plan.addEpic(
    ctx.createEpic('epic-id', 'Epic Title')
      .addTask(
        ctx.createTask('task-id', 'Task Title')
          .prompt('What the agent should do')
          .check({ cmd: 'validation command' })
      )
  );

  return plan.build();
}
```

### Workflow

```bash
crew init          # Initialize project
# Edit .crew/setup/planning/index.ts
crew plan init     # Materialize tasks
crew run           # Execute tasks
crew status        # Check progress
```

---

## See Also

- [Installation](./installation.md) - Setup guide
- [Your First Project](./your-first-project.md) - Detailed walkthrough
- [CLI Commands](../cli/commands.md) - All commands
- [Examples](../examples/README.md) - More examples

---

[← Back to Getting Started](./README.md) | [Documentation Home](../README.md)
