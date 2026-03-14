# Your First Project

**Build a complete TypeScript project with Crew from scratch.**

[[docs](../README.md) > [getting-started](./README.md) > your-first-project]

---

## Overview

In this tutorial, you'll build a TypeScript utility library with:
- Project initialization
- TypeScript configuration
- Module implementation
- Test suite
- Build verification

**Time**: ~15 minutes
**Prerequisites**: [Installation complete](./installation.md)

---

## Project Goal

Create a TypeScript library with utility functions for string manipulation:
- `capitalize(string)` - Capitalize first letter
- `reverse(string)` - Reverse string
- `isPalindrome(string)` - Check if palindrome

Plus tests and build configuration.

---

## Step 1: Create Project

```bash
mkdir string-utils
cd string-utils
npm init -y
npm install crew
```

---

## Step 2: Initialize Crew

```bash
npx crew init
```

This creates `.crew/setup/planning/index.ts` and `crew.json`.

---

## Step 3: Write the Plan

Edit `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('String Utils Library');

  // Epic 1: Project Setup
  plan.addEpic(
    ctx.createEpic('setup', 'Project Setup')
      .addTask(
        ctx.createTask('init', 'Initialize TypeScript project')
          .prompt(`
            Create a TypeScript project with:
            - package.json with name "string-utils", version "1.0.0"
            - tsconfig.json with strict mode, ESM output to dist/
            - src/ directory for source code
            - Basic .gitignore
          `)
          .outputs(['package.json', 'tsconfig.json', 'src/'])
          .check({ cmd: 'test -f package.json' })
          .check({ cmd: 'test -f tsconfig.json' })
          .check({ cmd: 'test -d src' })
      )
      .addTask(
        ctx.createTask('deps', 'Install dependencies')
          .prompt('Install typescript as a dev dependency')
          .deps(['init'])
          .check({ cmd: 'test -d node_modules/typescript' })
      )
  );

  // Epic 2: Implementation
  plan.addEpic(
    ctx.createEpic('implement', 'Implementation')
      .addTask(
        ctx.createTask('utils', 'Implement string utilities')
          .prompt(`
            Create src/index.ts with these exported functions:
            - capitalize(str: string): string - Capitalize first letter
            - reverse(str: string): string - Reverse the string
            - isPalindrome(str: string): boolean - Check if palindrome

            Include JSDoc comments for each function.
            Use TypeScript strict mode.
          `)
          .outputs(['src/index.ts'])
          .check({ cmd: 'test -f src/index.ts' })
          .check({ cmd: 'grep -q "export function capitalize" src/index.ts' })
          .check({ cmd: 'grep -q "export function reverse" src/index.ts' })
          .check({ cmd: 'grep -q "export function isPalindrome" src/index.ts' })
          .check({ cmd: 'npx tsc --noEmit' })
      )
  );

  // Epic 3: Testing
  plan.addEpic(
    ctx.createEpic('testing', 'Testing')
      .addTask(
        ctx.createTask('test-setup', 'Setup test framework')
          .prompt(`
            Install vitest as a dev dependency.
            Create vitest.config.ts with basic TypeScript support.
            Add "test": "vitest run" script to package.json.
          `)
          .check({ cmd: 'test -f vitest.config.ts' })
          .check({ cmd: 'grep -q "\\"test\\"" package.json' })
      )
      .addTask(
        ctx.createTask('tests', 'Write tests')
          .prompt(`
            Create src/index.test.ts with vitest tests for:
            - capitalize() - test uppercase, lowercase, empty string
            - reverse() - test normal strings, single char, empty
            - isPalindrome() - test true/false cases

            Each function should have at least 3 test cases.
          `)
          .deps(['test-setup'])
          .outputs(['src/index.test.ts'])
          .check({ cmd: 'test -f src/index.test.ts' })
          .check({ cmd: 'npm test' })
      )
  );

  // Epic 4: Build & Verify
  plan.addEpic(
    ctx.createEpic('build', 'Build & Verify')
      .addTask(
        ctx.createTask('build-config', 'Configure build')
          .prompt('Add "build": "tsc" script to package.json')
          .check({ cmd: 'grep -q "\\"build\\"" package.json' })
      )
      .addTask(
        ctx.createTask('compile', 'Compile TypeScript')
          .prompt('Run npm run build to compile the project')
          .deps(['build-config'])
          .check({ cmd: 'npm run build' })
          .check({ cmd: 'test -d dist' })
          .check({ cmd: 'test -f dist/index.js' })
      )
  );

  return plan.build();
}
```

---

## Step 4: Understand the Plan Structure

This plan has **4 epics**, **8 tasks**, and **multiple checks** per task:

```
Project: String Utils Library
├── Epic 1: Project Setup
│   ├── Task 1.1: init - Initialize project
│   └── Task 1.2: deps - Install dependencies (waits for 1.1)
├── Epic 2: Implementation
│   └── Task 2.1: utils - Implement functions
├── Epic 3: Testing
│   ├── Task 3.1: test-setup - Setup vitest
│   └── Task 3.2: tests - Write tests (waits for 3.1)
└── Epic 4: Build & Verify
    ├── Task 4.1: build-config - Add build script
    └── Task 4.2: compile - Compile TS (waits for 4.1)
```

**Key concepts used:**
- `.prompt()` - Instructions for agent
- `.deps()` - Task dependencies
- `.outputs()` - Expected outputs
- `.check()` - Quality gates

---

## Step 5: Materialize the Plan

Convert TypeScript plan to executable tasks:

```bash
npx crew plan init
```

This creates:
```
.crew/epics/
├── 01-setup/
│   ├── epic.yaml
│   └── tasks/
│       ├── 01-init/
│       └── 02-deps/
├── 02-implement/
│   └── tasks/
│       └── 01-utils/
├── 03-testing/
│   └── tasks/
│       ├── 01-test-setup/
│       └── 02-tests/
└── 04-build/
    └── tasks/
        ├── 01-build-config/
        └── 02-compile/
```

---

## Step 6: Preview the Plan

View the plan structure:

```bash
npx crew tree
```

Output:
```
String Utils Library
├─ 01: Project Setup
│  ├─ m1.1: Initialize TypeScript project
│  └─ m1.2: Install dependencies
├─ 02: Implementation
│  └─ m2.1: Implement string utilities
├─ 03: Testing
│  ├─ m3.1: Setup test framework
│  └─ m3.2: Write tests
└─ 04: Build & Verify
   ├─ m4.1: Configure build
   └─ m4.2: Compile TypeScript
```

---

## Step 7: Run the Project

Execute all tasks:

```bash
npx crew run
```

You'll see output like:

```
🚀 Starting execution...

📦 Epic 1/4: Project Setup
  ✓ Task m1.1: Initialize TypeScript project
    ✓ Check: test -f package.json (passed)
    ✓ Check: test -f tsconfig.json (passed)
    ✓ Check: test -d src (passed)

  ✓ Task m1.2: Install dependencies
    ✓ Check: test -d node_modules/typescript (passed)

📦 Epic 2/4: Implementation
  ✓ Task m2.1: Implement string utilities
    ✓ Check: test -f src/index.ts (passed)
    ✓ Check: grep -q "export function capitalize" src/index.ts (passed)
    ✓ Check: grep -q "export function reverse" src/index.ts (passed)
    ✓ Check: grep -q "export function isPalindrome" src/index.ts (passed)
    ✓ Check: npx tsc --noEmit (passed)

📦 Epic 3/4: Testing
  ✓ Task m3.1: Setup test framework
    ✓ Check: test -f vitest.config.ts (passed)
    ✓ Check: grep -q "\"test\"" package.json (passed)

  ✓ Task m3.2: Write tests
    ✓ Check: test -f src/index.test.ts (passed)
    ✓ Check: npm test (passed)

📦 Epic 4/4: Build & Verify
  ✓ Task m4.1: Configure build
    ✓ Check: grep -q "\"build\"" package.json (passed)

  ✓ Task m4.2: Compile TypeScript
    ✓ Check: npm run build (passed)
    ✓ Check: test -d dist (passed)
    ✓ Check: test -f dist/index.js (passed)

✅ Project complete! All 8 tasks succeeded.
```

---

## Step 8: Verify the Result

Check the generated code:

```bash
# View the implementation
cat src/index.ts

# Run tests
npm test

# Build the project
npm run build

# Check dist output
ls dist/
```

You should see:
- `src/index.ts` - Implementation
- `src/index.test.ts` - Tests
- `dist/index.js` - Compiled output
- All tests passing ✓

---

## Step 9: Inspect Execution Details

Look at the agent's work:

```bash
# View task prompt for utils implementation
cat .crew/epics/02-implement/tasks/01-utils/task.md

# View agent's context
cat .crew/epics/02-implement/tasks/01-utils/context.txt

# View execution log
cat .crew/logs/latest.log
```

---

## What Happened Under the Hood?

### For Each Task:

1. **Agent reads task.md** - Gets the prompt and context
2. **Agent executes** - Creates/modifies files
3. **Checks run** - Framework verifies output
4. **Pass**: Move to next task
5. **Fail**: Agent retries with feedback (up to `maxAttempts`)

### The Reactive Loop:

```
┌─────────────────────────────────┐
│  1. Read task prompt            │
│  2. Agent generates code        │
│  3. Run checks                  │
│  4. All pass?                   │
│     ├─ Yes → Done               │
│     └─ No → Provide feedback    │
│           └─ Agent fixes        │
│              └─ Run checks      │
│                 └─ Repeat...    │
└─────────────────────────────────┘
```

---

## Handling Failures

If a check fails, the agent sees the error and retries.

**Example**: If TypeScript check fails:

```bash
# Agent attempt 1
Agent creates src/index.ts with syntax error

# Check runs
npx tsc --noEmit
# Output: error TS2304: Cannot find name 'string'

# Agent attempt 2 (with feedback)
Agent sees error message and fixes the type
Checks pass ✓
Task complete
```

---

## Monitoring Progress

While execution is running, check status:

```bash
# In another terminal
npx crew status
```

Output:
```
Project: String Utils Library

Epic 1: Project Setup (complete)
  ✓ m1.1 Initialize TypeScript project
  ✓ m1.2 Install dependencies

Epic 2: Implementation (active)
  ⏳ m2.1 Implement string utilities (attempt 1/3)

Epic 3: Testing (pending)
  ⏸ m3.1 Setup test framework
  ⏸ m3.2 Write tests

Epic 4: Build & Verify (pending)
  ⏸ m4.1 Configure build
  ⏸ m4.2 Compile TypeScript

Progress: 2/8 tasks complete (25%)
```

---

## Customizing the Plan

### Add More Checks

Make verification stricter:

```typescript
.addTask(
  ctx.createTask('utils', 'Implement string utilities')
    .prompt('...')
    .check({ cmd: 'npx tsc --noEmit' })
    .check({ cmd: 'npx eslint src/' })
    .check({ cmd: 'npm test' })
    .check({
      prompt: 'Verify functions handle edge cases like empty strings, null, undefined'
    })
)
```

### Add Dependencies

Control execution order:

```typescript
.addTask(
  ctx.createTask('readme', 'Create README')
    .deps(['utils', 'tests'])  // Run after both complete
)
```

### Use AutoHarness

AI-synthesized validation:

```typescript
.addTask(
  ctx.createTask('utils', 'Implement string utilities')
    .prompt('...')
    .harness()  // Auto-generates validation code
    .check({ cmd: 'npx tsc --noEmit' })
)
```

---

## Resuming After Interruption

If execution is interrupted (crash, Ctrl+C), resume:

```bash
npx crew run
```

Crew reads `progress.jsonl` and continues from the last successful task.

---

## Cleaning Up

Remove generated artifacts and restart:

```bash
# View current state
npx crew status

# Reset all task state (keeps plan)
npx crew reset

# Re-run from scratch
npx crew plan init
npx crew run
```

---

## Next Steps

Now that you've built a complete project:

### Learn More Concepts

- [Projects, Epics & Tasks](../core-concepts/projects-epics-tasks.md) - Understand the hierarchy
- [Checks & Quality Gates](../core-concepts/checks-and-quality-gates.md) - Verification system
- [Filesystem Store](../core-concepts/filesystem-store.md) - State persistence

### Explore Examples

- [Next.js App](../examples/nextjs-app.md) - Full-stack application
- [API Backend](../examples/api-backend.md) - REST API
- [Monorepo](../examples/monorepo.md) - Multi-package project

### Advanced Features

- [AutoHarness](../HARNESS.md) - AI-synthesized validation
- [Plugins](../plugins/README.md) - Extend functionality
- [CLI Commands](../cli/commands.md) - All available commands

---

## Key Takeaways

1. **Plans are TypeScript** - Define what to build programmatically
2. **Tasks are atomic** - Each task has a clear, verifiable goal
3. **Checks ensure quality** - Automated verification catches errors
4. **Dependencies control order** - Explicit task relationships
5. **State is transparent** - Everything in `.crew/` is inspectable
6. **Resumable by default** - Never lose progress

---

## See Also

- [Quick Start](./quick-start.md) - 5-minute intro
- [Configuration](./configuration.md) - Configure Crew
- [Core Concepts](../core-concepts/README.md) - Deep dive

---

[← Back to Getting Started](./README.md) | [Documentation Home](../README.md)
