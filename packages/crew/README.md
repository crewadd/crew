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
  <a href="https://www.npmjs.com/package/crew"><img src="https://img.shields.io/npm/v/crew?style=flat&colorA=000000&colorB=000000" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/crew"><img src="https://img.shields.io/npm/dm/crew?style=flat&colorA=000000&colorB=000000" alt="npm downloads"></a>
  <a href="https://github.com/crew-framework/crew/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000.svg?style=flat&colorA=000000&colorB=000000" alt="License"></a>
  <a href="https://github.com/crew-framework/crew/actions"><img src="https://img.shields.io/github/actions/workflow/status/crew-framework/crew/ci.yml?branch=main&style=flat&colorA=000000&colorB=000000" alt="CI status"></a>
</p>

<p>
<a href="#quick-start">Quick Start</a> •
<a href="#why-crew">Why crew</a> •
<a href="#how-it-works">How It Works</a> •
<a href="#programmable-task">Tasks</a> •
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

---

## 🌟 Comprehensive Example

Want to see Crew's full power in action? Check out the **[Task Management App](./examples/task-management-app/)** example.

It builds a complete full-stack application (React + Express + PostgreSQL + Docker) and demonstrates:

- **Parallel execution** — Backend and frontend built simultaneously
- **Multi-agent routing** — 7 specialized agents for different domains
- **Quality gates** — Automatic validation and retry on failures
- **Incremental planning** — Dynamic task spawning with `.yields()`
- **AutoHarness** — AI-synthesized test validators
- **Crash-safe resumability** — Interrupt and resume from exact checkpoint

[View the full example →](./examples/task-management-app/)

---

## 📚 Documentation

- [📖 Full Documentation](./docs/) - Complete guides and API reference
- [🚀 Examples](./docs/examples/) - More examples and use cases

---

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
          .prompt('Implement JWT authentication with refresh tokens')
          .check('tsc')
          .check({ prompt: 'Verify auth handles edge cases' })
          .attempts(5)
      )
      .addTask(
        ctx.createTask('api', 'Build API')
          .deps(['auth'])
          .prompt('Create REST API routes for /users and /posts')
          .check('tsc')
          .check('build')
      )
      .addTask(
        ctx.createTask('ui', 'Build UI components')
          .prompt('Create responsive navbar with accessibility support')
          .harness()  // AI synthesizes validation for ARIA labels, responsive behavior
          .check('tsc')
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
| `.harness(config?)` | AI-synthesized validation function (see below) |
| `.attempts(n)` | Override max retry attempts (default: 3) |
| `.when(fn)` | Conditional execution |
| `.execute(fn)` | Override AI with custom code |
| `.yields(fn)` | Spawn follow-up tasks dynamically |
| `.onStart() / .onComplete() / .onFail()` | Lifecycle hooks |
| `.review('human')` | Approval gate before proceeding |
| `.planning()` | Plan-then-execute pattern |
| `.fanOut() / .fanIn()` | Parallel branch + sync |

### AutoHarness — AI-Synthesized Validation

The `.harness()` method enables AI to generate executable validation code that runs deterministically after each task attempt.

**How it works:**
1. LLM synthesizes a JavaScript validation function based on task requirements
2. Function is persisted to disk as `harness.js` for inspection and caching
3. On each task completion, the harness runs (no LLM in evaluation loop)
4. Issues found trigger agent refinement with concrete feedback
5. Harness itself can be refined on false positives/negatives

**Examples:**

```typescript
// Basic: derive validation from task prompt
ctx.createTask('nav', 'Build navigation with accessibility')
  .prompt('Create a responsive navbar with ARIA labels')
  .harness()  // LLM generates code to check ARIA labels, responsive behavior
  .build();

// Custom validation criteria
ctx.createTask('api', 'Build REST API')
  .prompt('Create /users and /posts endpoints')
  .harness({
    prompt: 'Verify all endpoints return valid JSON and handle errors'
  })
  .build();

// Derive from input/output files
ctx.createTask('styles', 'Style components')
  .inputs(['src/components/*.tsx'])
  .outputs(['src/styles/*.css'])
  .harness({ from: 'outputs' })  // Check CSS files for completeness
  .build();

// Refinable harness (learns from false positives/negatives)
ctx.createTask('tests', 'Write test suite')
  .harness({
    refinable: true,      // Allow harness to improve itself
    maxRefinements: 5     // Max refinement iterations
  })
  .build();
```

**Harness API:**

The synthesized `harness.js` has access to:
- `file.read(path)` - Read file contents
- `file.exists(path)` - Check file existence
- `file.glob(pattern)` - List matching files
- `shell.run(cmd)` - Execute shell commands
- `issues.push({ message, severity })` - Report validation issues

**Example synthesized harness:**

```javascript
// Auto-generated in .crew/epics/01/tasks/02/harness.js
const files = await file.glob('src/components/*.tsx');
for (const f of files) {
  const content = await file.read(f);
  if (!content.includes('aria-label')) {
    issues.push({
      message: `${f} missing ARIA labels`,
      severity: 'error'
    });
  }
}
```

**Config options:**

```typescript
interface HarnessConfig {
  from?: 'task-prompt' | 'inputs' | 'outputs';  // Source for deriving harness
  prompt?: string;                                // Custom validation criteria
  refinable?: boolean;                           // Allow self-refinement (default: false)
  cache?: boolean;                               // Cache for reuse (default: false)
  maxRefinements?: number;                       // Max refinement iterations (default: 5)
}
```

📖 **[Full AutoHarness Guide](docs/HARNESS.md)** — Detailed examples, API reference, and best practices

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

The `.harness()` feature implements the **propose-validate-refine** pattern inspired by the [AutoHarness paper](https://arxiv.org/abs/2603.03329). Key principles:

- **LLM generates functions, not rules** — Executable JavaScript code, not declarative validation lists
- **Deterministic evaluation** — No LLM in the validation loop (fast, cacheable, inspectable)
- **Persisted as policy** — `harness.js` files can be reviewed, edited, cached, and evolved
- **Refinement loop** — False positives/negatives feed back to improve the harness itself
- **Progression path** — From synthesized → cached → hand-coded static policy

## Principles

1. **Stateless agents, stateful orchestrator.** Agents are pure functions. The framework holds all state.
2. **Verify, don't trust.** Agents say "done" — checks say "prove it."
3. **Filesystem is the database.** `ls` and `cat` are your debuggers.
4. **Resumable by default.** Every state change is journaled. No work is ever lost.
5. **Agent as a function.** `(task, context) → result`. No chat threads, no memory management.
6. **Progressive complexity.** Start with a simple plan. Add hooks, types, and constraints as you grow.

## Community

<p align="center">
  <a href="https://star-history.com/#crew-framework/crew&Date">
    <img src="https://api.star-history.com/svg?repos=crew-framework/crew&type=Date" alt="Star History Chart" width="600">
  </a>
</p>

### Contributing

We welcome contributions! Please see our [Contributing Guide](.github/CONTRIBUTING.md) for details.

- 🐛 [Report a bug](https://github.com/crew-framework/crew/issues/new?template=bug_report.yml)
- ✨ [Request a feature](https://github.com/crew-framework/crew/issues/new?template=feature_request.yml)
- 💬 [Join discussions](https://github.com/crew-framework/crew/discussions)

### Contributors

Thanks to all our contributors!

<a href="https://github.com/crew-framework/crew/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=crew-framework/crew" alt="Contributors" />
</a>

## License

MIT - see [LICENSE](LICENSE) for details.
