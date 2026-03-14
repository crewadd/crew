<div align="center">
<pre>
         ____   ____    _____  __          __    +
          / ___| |  _ \  | ____| \ \        / /  + + +
        | |     | |_) | |  _|    \ \  /\  / /     +
 | |___  |  _ &lt;  | |___    \ \/  \/ /
 \____| |_| \_\ |_____|    \__/\__/
</pre>

<strong>A build system for AI agents.</strong><br/>
Plan. Execute. Verify. Fix. Ship.

<p>
<a href="#quick-start">Quick Start</a> •
<a href="#why-crew">Why crew</a> •
<a href="#how-it-works">How It Works</a> •
<a href="#programmable-tasks">Tasks</a> •
<a href="#cli">CLI</a>
</p>
</div>

---

You define the plan in TypeScript — agents execute every task, run the checks, fix the errors, and ship the result.

```
crew init → write your plan → crew run
```

## Quick Start

```bash
npm install crew

cd my-app
crew init        # scaffold crew.json + .crew/ directory
```

Write your plan in `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');

  plan.addEpic(
    ctx.createEpic('setup', 'Bootstrap')
      .addTask(
        ctx.createTask('install', 'Install dependencies')
          .prompt('Run pnpm install and verify all dependencies resolve')
          .check({ cmd: 'test -d node_modules' })
      )
  );

  return plan.build();
}
```

Then run:

```bash
crew plan init   # materialize plan to .crew/epics/
crew run         # agents execute every task
crew status      # check progress anytime
```

Or use a **preset template** to skip the setup entirely:

```bash
crew init --preset nextjs   # scaffold + plan in one step
crew run
```

## Why crew

AI agents are powerful — but without structure, they drift.

| Challenge | Without crew | With crew |
|-----------|-------------|-----------|
| **Multi-file projects** | Agent loses context after ~3 files | Epics scope context per task |
| **Verification** | "It looks right" | Checks run automatically after each task |
| **Failures** | Agent hallucinates a fix or gives up | Quality gates retry until checks pass |
| **Interruptions** | Start over from scratch | Resume from exact task with full state |

## How It Works

Every execution follows the same reactive loop:

```
Plan → Execute → Verify → Fix → Repeat
         ↑                    │
         └────────────────────┘
```

Work is organized into three levels:

```
Project
├── Epic 1 — Foundation
│   ├── Task 1.1 — Initialize repo
│   ├── Task 1.2 — Install dependencies
│   └── Task 1.3 — TypeScript check
├── Epic 2 — Core Features
│   ├── Task 2.1 — Build auth module
│   ├── Task 2.2 — Build API layer    ← parallel with 2.1
│   └── Task 2.3 — Integration tests  ← fan-in: waits for both
└── Epic 3 — Verify & Ship
```

On disk, this is a human-readable directory tree under `.crew/epics/`. No database. No external service. `ls` and `cat` are your debuggers.

## Programmable Tasks

One entry point — `ctx.createTask()`. Everything chainable. No fixed types, no fixed checks — your project defines them.

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');

  plan.addEpic(
    ctx.createEpic('setup', 'Project Setup')
      .addTask(
        ctx.createTask('init', 'Initialize project')
          .skill('repo/scaffold')
          .inputs(['package.json'])
          .outputs(['src/', 'tsconfig.json'])
          .prompt('Create a TypeScript project with ESM support')
          .check('tsc')
      )
      .addTask(
        ctx.createTask('deps', 'Install dependencies')
          .deps(['init'])
          .prompt('Install required dependencies')
          .check('build')
      )
  );

  plan.addEpic(
    ctx.createEpic('features', 'Core Features')
      .addTask(
        ctx.createTask('auth', 'Build auth')
          .ofType('coding')
          .prompt('Implement JWT authentication')
          .check('tsc')
          .check({ prompt: 'Verify auth handles edge cases' })
          .attempts(5)
      )
      .addTask(
        ctx.createTask('api', 'Build API')
          .deps(['auth'])
          .prompt('Create REST API routes')
          .check('tsc')
          .check('build')
      )
  );

  return plan.build();
}
```

### What you can chain

| Method | Purpose |
|--------|---------|
| `.skill(name)` | AI agent to use |
| `.prompt(text)` | Instructions for the agent |
| `.inputs() / .outputs()` | File boundaries |
| `.deps(ids)` | Task dependencies |
| `.check(name)` | Post-task validation (auto-retries on failure) |
| `.attempts(n)` | Override max retry attempts (default: 3) |
| `.when(fn)` | Conditional execution |
| `.execute(fn)` | Override AI with custom code |
| `.yields(fn)` | Spawn follow-up tasks dynamically |
| `.onStart() / .onComplete() / .onFail()` | Lifecycle hooks |
| `.review('human')` | Approval gate before proceeding |
| `.planning()` | Plan-then-execute pattern |
| `.fanOut() / .fanIn()` | Parallel branch + sync |

## Features

**Checks** — Project-defined validations run after every task. Shell commands, TypeScript functions, or AI-powered reviews. Failures feed back to the agent automatically.

**Quality Gates** — When checks fail, a fix agent gets the error context, patches the code, and re-runs checks. Loop until green or max retries.

**Crash-Safe Resume** — All state lives in an append-only `progress.jsonl`. Crash mid-task? `crew run` picks up exactly where it stopped.

**Constraint Engine** — Dependencies, parallelism, fan-out/fan-in, conditional tasks. The scheduler computes execution batches automatically.

**Yields** — Tasks can spawn follow-up tasks at runtime based on their output. Incremental planning without upfront omniscience.

**Streaming Events** — `ProjectOrchestrator` emits typed events (`task:start`, `task:done`, `project:verified`) for dashboards and CI.

**Plugins** — Extend with built-in plugins (typescript, nextjs, git, docker, eslint, vitest) or write your own.

## CLI

| Command | Description |
|---------|-------------|
| `crew init` | Scaffold `crew.json` + `.crew/` directory |
| `crew plan` | View the current plan |
| `crew plan init` | Materialize plan from setup script |
| `crew run` | Execute all pending tasks |
| `crew run next` | Execute only the next ready task |
| `crew run <id>` | Execute a specific task |
| `crew verify` | Run all quality gates |
| `crew status` | Show project progress |
| `crew tree` | Display plan as a tree |
| `crew search <q>` | Search tasks and epics |
| `crew sync` | Sync agents/skills to `.claude/` |
| `crew review` | Manage approval gates |

**Flags:** `--json` `--dry-run` `--ai` `--loop` `--from <id>` `--until <id>`

## Acknowledgements

The `.harness()` feature is adapted from the [AutoHarness](https://arxiv.org/abs/2603.03329) paper — LLMs synthesize executable validation functions to constrain their own output. We apply this to code generation: the LLM writes a JavaScript validator that inspects agent output deterministically (no LLM at eval time), persisted as `harness.js` for caching and inspection.

## Principles

1. **Stateless agents, stateful orchestrator.** Agents are pure functions. The framework holds all state.
2. **Verify, don't trust.** Agents say "done" — checks say "prove it."
3. **Filesystem is the database.** `ls` and `cat` are your debuggers.
4. **Resumable by default.** Every state change is journaled. No work is ever lost.
5. **Agent as a function.** `(task, context) → result`. No chat threads, no memory management.
6. **Progressive complexity.** Start with a simple plan. Add hooks, types, and constraints as you grow.

## License

MIT
