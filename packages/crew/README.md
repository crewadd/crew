<p align="center">
  <h1 align="center">crew</h1>
  <p align="center">
    <strong>The reactive orchestration framework for AI agents that plan, code, verify, and fix — in a resumable loop.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#why-crew">Why crew</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#programmable-tasks">Programmable Tasks</a> •
    <a href="#design-principles">Principles</a>
  </p>
</p>

---

**crew** is an Agent Driven Development (ADD) framework. You describe the goal — AI agents plan the approach, write the code, run the tests, fix the errors, and verify the results. The framework provides the structure, scheduling, quality gates, and crash-safe persistence. Agents provide the labor.

```
You run: crew plan && crew run
Agents do: everything else.
```

## Quick Start

```bash
# Install
npm install crew

# cd into your project and initialize
cd my-app
crew init

# Agents analyze your project and create a plan
crew plan

# Agents execute every task — code, test, fix, repeat
crew run

# Check progress anytime
crew status
```

That's it. Two commands. Agents handle the rest.

## Why crew

AI coding agents are powerful — but without structure, they drift. They lose context across files. They skip verification. They can't resume after a crash. They don't know what to do next.

**crew solves the orchestration problem.** It gives agents a project plan, execution order, quality gates, and memory — turning a raw LLM into a disciplined software team.

### The Problem

| Challenge | Without crew | With crew |
|-----------|-------------|-----------|
| **Multi-file projects** | Agent loses context after ~3 files | Hierarchical epics scope context per task |
| **Verification** | "It looks right" (no actual check) | TypeScript, build, and test gates run automatically |
| **Failures** | Agent hallucinates a fix or gives up | Fix agent called, retries until gates pass |
| **Large projects** | One massive prompt → hallucination | Decomposed into sequential epics with dependencies |
| **Interruptions** | Start over from scratch | Resume from exact task with full state |
| **Ordering** | Random file edits, broken imports | Constraint engine respects deps, parallelism, conditions |

### How crew Compares

| | crew | CrewAI | LangGraph | AutoGen | Mastra |
|---|:---:|:---:|:---:|:---:|:---:|
| **Built for code generation** | Yes | No | No | No | No |
| **Reactive verify-fix loop** | Yes | — | — | — | — |
| **Hierarchical plans** (project → epic → task) | Yes | — | — | — | — |
| **Quality gates** (tsc, build, test) | Built-in | — | — | — | — |
| **Constraint engine** (deps, parallel, conditional) | Yes | Sequential | Graph edges | — | Workflow |
| **Crash-safe resume** | Yes | — | Checkpoints | — | — |
| **Task expansion** (subtasks at plan time) | Yes | — | — | — | — |
| **Multi-level hooks** (project/epic/task) | Yes | — | — | — | — |
| **Filesystem as state** (human-readable) | Yes | — | — | — | — |
| **TypeScript-native** | Yes | Python | Python | Python | Yes |
| **Zero infrastructure** | Yes | Yes | Optional | Optional | Yes |

crew is not a general-purpose agent chat framework. It is a **build system for AI agents** — purpose-built for the workflow where agents need to plan, execute, verify, and fix real code in real projects.

## How It Works

### The Core Loop

Every crew execution follows the same reactive pattern:

```
Plan → Execute → Verify → Fix → Repeat
```

```
┌──────────────────────────────────────────────────────────┐
│                    crew orchestrator                      │
│                                                          │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│   │  Planner │───▶│ Executor │───▶│ Verifier │          │
│   │          │    │          │    │          │          │
│   │ Breaks   │    │ Runs     │    │ Checks   │          │
│   │ project  │    │ tasks in │    │ tsc,     │──┐       │
│   │ into     │    │ order    │    │ build,   │  │       │
│   │ epics &  │    │          │    │ tests    │  │       │
│   │ tasks    │    │          │    │          │  │       │
│   └──────────┘    └──────────┘    └──────────┘  │       │
│                                        │        │       │
│                                     Pass?       │       │
│                                    ╱    ╲       │       │
│                                  Yes     No     │       │
│                                   │      │      │       │
│                                 Done   Fix ─────┘       │
│                                        Agent            │
└──────────────────────────────────────────────────────────┘
```

### Hierarchical Project Structure

Work is organized into three levels, each with its own lifecycle hooks:

```
PROJECT
├── Epic M1 — Foundation
│   ├── Task m1.1 — Initialize repo
│   ├── Task m1.2 — Install dependencies
│   └── Task m1.3 — TypeScript check
│
├── Epic M2 — Core Features
│   ├── Task m2.1 — Build auth module
│   ├── Task m2.2 — Build API layer
│   ├── Task m2.3 — TypeScript check
│   └── Task m2.4 — Integration tests
│
└── Epic M3 — Verify & Ship
    └── Task m3.1 — Final verification
```

On disk, this maps to a human-readable directory tree:

```
.crew/plan/
├── 01-foundation/
│   ├── epic.json
│   ├── README.md
│   └── tasks/
│       ├── 01-init-repo/
│       │   ├── task.json
│       │   └── README.md
│       ├── 02-install-deps/
│       └── 03-tsc-check/
├── 02-core-features/
│   ├── epic.json
│   └── tasks/
│       ├── 01-build-auth/
│       ├── 02-build-api/
│       ├── 03-tsc-check/
│       └── 04-integration-tests/
└── 03-verify-and-ship/
```

No database. No external service. `ls` and `cat` are your debuggers.

## Programmable Tasks

Tasks are not templates — they are fully programmable with lifecycle hooks, quality gates, and custom execution logic.

### The Fluent Builder API

```typescript
import { createPlan, createEpic, createTask, codingTask } from 'crew';

const plan = createPlan('My App')
  .vars({ nodeVersion: '20' })
  .addEpic(
    createEpic('setup', 'Project Setup')
      .addTask(
        createTask('init', 'Initialize project')
          .type('coding')
          .skill('repo/scaffold')
          .inputs(['package.json'])
          .outputs(['src/', 'tsconfig.json'])
          .prompt('Create a TypeScript project with ESM support')
          .gate({ name: 'tsc', type: 'tsc' })
      )
      .addTask(
        createTask('deps', 'Install dependencies')
          .type('coding')
          .deps(['init'])
          .prompt('Install required dependencies')
          .gate({ name: 'build', type: 'build' })
      )
  )
  .addEpic(
    createEpic('features', 'Core Features')
      .addTask(
        codingTask('auth', 'Authentication module')
          .inputs(['src/lib/'])
          .outputs(['src/lib/auth.ts', 'src/lib/auth.test.ts'])
          .prompt('Implement JWT authentication with refresh tokens')
          .gate({ name: 'tsc', type: 'tsc' })
          .gate({ name: 'test', type: 'build' })
      )
  );

return plan.build();
```

### Task Types

Built-in specializations with default quality gates:

```typescript
import { codingTask, planningTask, testingTask, verifyTask } from 'crew';

// Coding — auto-runs TypeScript check after execution
codingTask('api', 'Build REST API')
  .prompt('Create Express routes for /users and /posts')
  .gate({ name: 'tsc', type: 'tsc' });

// Planning — research and analysis, no code verification
planningTask('analyze', 'Analyze existing codebase')
  .inputs(['src/'])
  .outputs(['_analysis/structure.md']);

// Testing — generates and runs tests
testingTask('unit-tests', 'Unit test suite')
  .inputs(['src/lib/auth.ts'])
  .outputs(['src/lib/auth.test.ts']);

// Verify — final quality check
verifyTask('final-check', 'Full verification')
  .prompt('Run tsc --noEmit and verify build succeeds');
```

### Lifecycle Hooks

Control agent behavior at every stage:

```typescript
createTask('deploy', 'Deploy to staging')
  .type('deploy')

  // Should this task run at all?
  .shouldStart(ctx => ctx.vars.environment === 'staging')

  // Prepare before execution
  .onStart(async ctx => {
    ctx.log.info('Preparing deployment...');
    await ctx.tools.shell.exec('npm run prebuild');
  })

  // Custom execution (override AI agent)
  .execute(async ctx => {
    const result = await ctx.tools.shell.exec('npm run deploy:staging');
    return {
      success: result.exitCode === 0,
      durationMs: result.durationMs,
      output: result.stdout,
    };
  })

  // Handle success
  .onComplete(async (ctx, result) => {
    ctx.log.info('Deployed successfully', { output: result.output });
    await ctx.tools.git.commit('chore: deploy to staging');
  })

  // Handle failure
  .onFail(async (ctx, error) => {
    ctx.log.error('Deployment failed', { error });
    await ctx.tools.shell.exec('npm run rollback');
  });
```

### Hook Resolution Chain

When a task runs, hooks resolve through a fallback chain:

```
Task-specific hook
    ↓ (not defined? fall back to)
Task Type default
    ↓ (not defined? fall back to)
Epic hook
    ↓ (not defined? fall back to)
Project default
    ↓ (not defined?)
No-op
```

This means you only define hooks where you need custom behavior. Everything else uses sensible defaults.

## Constraint Engine

Control execution order with dependencies, parallelism, and conditions:

```typescript
// Sequential — task B waits for task A
createTask('build', 'Build project').deps(['install']);

// Parallel — tasks run concurrently
createEpic('components', 'Build Components')
  .addTask(createTask('hero', 'Hero section').deps(['setup']))
  .addTask(createTask('nav', 'Navigation').deps(['setup']))    // parallel with hero
  .addTask(createTask('footer', 'Footer').deps(['setup']));    // parallel with both

// Fan-in — wait for all parallel tasks
createTask('integrate', 'Integration').deps(['hero', 'nav', 'footer']);

// Conditional — only run if condition is met
createTask('a11y', 'Accessibility audit')
  .when(ctx => ctx.vars.includeA11y === true);
```

The constraint engine computes execution batches automatically:

```
Batch 1: [install]           — sequential
Batch 2: [hero, nav, footer] — parallel
Batch 3: [integrate]         — fan-in
Batch 4: [a11y]              — conditional
```

## Quality Gates

Every coding task can have quality gates that run automatically after execution:

```typescript
createTask('api', 'Build API')
  .type('coding')
  .gate({ name: 'tsc', type: 'tsc' })           // TypeScript check
  .gate({ name: 'build', type: 'build' })        // Build verification
  .gate({ name: 'images', type: 'images' });     // Asset verification
```

When a gate fails:

1. The framework identifies the errors
2. A **fix agent** is automatically invoked with the error context
3. The fix agent patches the code
4. Gates run again
5. Loop continues until all gates pass (or max retries hit)

### Custom Check Plugins

Extend verification with your own checks:

```typescript
import type { CheckPlugin } from 'crew';

const eslintCheck: CheckPlugin = {
  name: 'eslint',
  async run(projectDir) {
    const result = await exec('npx eslint src/ --format json', { cwd: projectDir });
    return {
      passed: result.exitCode === 0,
      issues: parseEslintOutput(result.stdout),
    };
  },
};
```

## Crash-Safe Resume

crew tracks every state change to an append-only progress log:

```
.crew/progress.jsonl
```

If execution is interrupted — crash, network failure, `Ctrl+C` — resume from exactly where you stopped:

```bash
# Resume from last checkpoint
crew run

# Resume from a specific task
crew run m2.3
```

The framework:
- Detects incomplete tasks from the previous run
- Resets stale "active" states from crashed processes
- Skips already-completed tasks
- Continues from the exact interruption point

## Streaming Events

The orchestrator emits a stream of typed events for real-time observability:

```typescript
import { ProjectOrchestrator } from 'crew';

const orchestrator = new ProjectOrchestrator(config);

for await (const event of orchestrator.run()) {
  switch (event.type) {
    case 'project:start':
      console.log('Project started');
      break;
    case 'epic:start':
      console.log(`Epic: ${event.epic.title}`);
      break;
    case 'task:start':
      console.log(`  Task: ${event.task.title}`);
      break;
    case 'task:done':
      console.log(`  Done: ${event.result.success ? 'PASS' : 'FAIL'}`);
      break;
    case 'project:verified':
      console.log(`Verification: ${event.report.passed ? 'PASS' : 'FAIL'}`);
      break;
    case 'project:done':
      console.log('All done.');
      break;
  }
}
```

Build dashboards, CI integrations, or custom reporters on top of the event stream.

## Configuration

### crew.json

```json
{
  "name": "my-project",
  "setup": ".crew/setup"
}
```

### Setup Script

```typescript
// .crew/setup/index.ts
export const config = {
  name: 'my-project',

  async onInitCrew(ctx) {
    // Return a plan using the fluent builder API
    const plan = ctx.createPlan('My Project');

    plan.addEpic(
      ctx.createEpic('bootstrap', 'Bootstrap')
        .addTask({
          id: 'install',
          title: 'Install dependencies',
          prompt: 'Run npm install and verify all dependencies resolve',
          deps: [],
        })
        .addTask({
          id: 'scaffold',
          title: 'Scaffold project structure',
          prompt: 'Create the initial directory layout',
          deps: ['install'],
        })
    );

    plan.addEpic(
      ctx.createEpic('features', 'Core Features')
        .addTask({
          id: 'auth',
          title: 'Authentication',
          prompt: 'Implement user authentication with JWT',
          deps: ['scaffold'],
        })
        .addTask({
          id: 'api',
          title: 'REST API',
          prompt: 'Create API routes for CRUD operations',
          deps: ['scaffold'],  // parallel with auth
        })
        .addTask({
          id: 'tests',
          title: 'Test suite',
          prompt: 'Write integration tests for auth and API',
          deps: ['auth', 'api'],  // fan-in: waits for both
        })
    );

    return plan.build();
  },
};
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `crew init` | Initialize the current directory with `crew.json` and `.crew/` directory |
| `crew plan` | Run the planning agent to generate epics and tasks |
| `crew plan show` | Display the current plan |
| `crew run` | Execute all pending tasks in order |
| `crew run <taskId>` | Execute a specific task |
| `crew run next` | Execute only the next ready task |
| `crew verify` | Run all quality gates and report issues |
| `crew status` | Show current project progress |
| `crew tree` | Display the plan as a directory tree |
| `crew task <id> show` | Show details for a specific task |
| `crew epic <id> show` | Show details for a specific epic |
| `crew sync` | Synchronize store state with filesystem |
| `crew search <query>` | Search across tasks and epics |

## Architecture

```
┌─ ProjectOrchestrator ───────────────────────────────────────┐
│                                                             │
│  Plan Phase         Execute Phase        Verify Phase       │
│  ┌─────────┐       ┌──────────────┐     ┌──────────────┐   │
│  │ Planner │──────▶│   Executor   │────▶│   Verifier   │   │
│  │         │       │              │     │              │   │
│  │ Strategy│       │ Batch        │     │ tsc, build,  │   │
│  │ pattern │       │ scheduling   │     │ test plugins │   │
│  └─────────┘       │ + streaming  │     └──────┬───────┘   │
│                    └──────────────┘            │           │
│                                          Pass/Fail         │
│                                               │            │
│  ┌─────────────────────────────────────────────┘           │
│  │                                                         │
│  │  ┌───────────────────────────────────────────────────┐  │
│  │  │            Constraint Engine                      │  │
│  │  │  • Dependency resolution                          │  │
│  │  │  • Parallel batch computation                     │  │
│  │  │  • Conditional evaluation                         │  │
│  │  └───────────────────────────────────────────────────┘  │
│  │                                                         │
│  │  ┌───────────────────────────────────────────────────┐  │
│  │  │          HierarchicalStore                        │  │
│  │  │  • Filesystem-backed state (source of truth)      │  │
│  │  │  • Epic/task CRUD operations                      │  │
│  │  │  • Status tracking + progress log                 │  │
│  │  └───────────────────────────────────────────────────┘  │
│  │                                                         │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  │  Task      │  │   Agent    │  │     Tools        │  │
│  │  │  Types     │  │   System   │  │  File, Shell,    │  │
│  │  │  Registry  │  │  (agentfn) │  │  Git, Verify     │  │
│  │  └────────────┘  └────────────┘  └──────────────────┘  │
│  │                                                         │
└──┴─────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Stateless agents, stateful orchestrator.** Agents are pure functions — give them a task, get back a result. The orchestrator holds all the state: progress, dependencies, retry counts, resume points. Agents stay simple. The framework handles complexity.

2. **Agent as a function.** Every coding agent is a function call: `(task, context) → result`. No persistent agent processes, no chat threads, no memory management. Call it, get the output, verify, move on.

3. **Resumable by default.** Every state transition is logged to an append-only journal. Crash mid-task? `crew run` picks up exactly where it stopped. No work is ever lost — the orchestrator replays from the last checkpoint.

4. **Verify, don't trust.** Agents say "done" — the framework says "prove it." Quality gates (tsc, build, tests) run after every task. Failures trigger fix agents automatically. Trust is earned through passing checks, not assumed from completion.

5. **Filesystem is the database.** `.crew/plan/` is a directory tree you can `ls`, `cat`, and `git diff`. No opaque state files, no external services, no databases. Your plan is a folder structure. Your progress is a JSONL file. Debug with Unix tools.

6. **Progressive complexity.** Start with `crew plan && crew run`. Add lifecycle hooks when you need control. Add custom task types when you need specialization. Add constraint patterns when you need parallelism. The simple path works out of the box.

## License

MIT
