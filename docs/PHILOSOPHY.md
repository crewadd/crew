# Philosophy & Design Principles

> **Why Crew exists and the mental models that guide its design**

## The Problem

AI agents are powerful code generators, but without structure, they drift:

| Challenge | Without Structure | With Crew |
|-----------|------------------|-----------|
| **Multi-file projects** | Agent loses context after ~3 files | Epics scope context per task |
| **Verification** | "It looks right" | Checks run automatically after each task |
| **Failures** | Agent hallucinates a fix or gives up | Quality gates retry until checks pass |
| **Interruptions** | Start over from scratch | Resume from exact task with full state |

Crew provides the missing orchestration layer that turns AI agents from interactive assistants into autonomous build systems.

---

## Core Philosophy

### 1. Stateless Agents, Stateful Orchestrator

**Agents are pure functions**: `(task, context) → result`

- No chat threads
- No memory management
- No session state

**The framework holds all state**:

- Task definitions and dependencies
- Execution progress
- Check results and feedback
- Spawned follow-up tasks

This separation makes agents swappable, testable, and cacheable.

---

### 2. Verify, Don't Trust

Agents say "done" — **checks say "prove it"**.

Every task has quality gates that must pass before proceeding:

```typescript
ctx.createTask('api', 'Build REST API')
  .prompt('Create /users and /posts endpoints')
  .check({ cmd: 'npm test' })
  .check({ cmd: 'npm run lint' })
  .check({ prompt: 'Verify error handling for edge cases' })
  .build();
```

Failed checks trigger automatic retries with feedback. The agent sees the error and fixes it — no human intervention needed.

---

### 3. Filesystem as the Database

**Everything lives on disk**. No database. No external service.

```
.crew/
├── epics/
│   ├── 01-setup/
│   │   ├── epic.yaml
│   │   ├── plan.md
│   │   └── tasks/
│   │       ├── 01-init/
│   │       │   ├── task.yaml
│   │       │   ├── task.md
│   │       │   ├── context.txt
│   │       │   └── todo.md
│   │       └── 02-deps/
│   │           └── ...
│   └── 02-features/
│       └── ...
├── progress.jsonl        # Append-only execution log
└── state.json           # Current execution state
```

**Benefits:**

- **Transparency**: `ls` and `cat` are your debuggers
- **Version control**: Track evolution of generated code
- **Portability**: Copy `.crew/` to another machine
- **Inspection**: Review agent reasoning and decisions

---

### 4. Resumable by Default

**Crashes are expected. Work is never lost.**

Every state change is journaled to `progress.jsonl`:

```json
{"event":"task:start","taskId":"m1.1","timestamp":"2026-03-15T10:00:00Z"}
{"event":"task:exec","taskId":"m1.1","attempt":1,"output":"..."}
{"event":"check:fail","taskId":"m1.1","check":"tsc","errors":["..."],"feedback":"..."}
{"event":"task:exec","taskId":"m1.1","attempt":2,"output":"..."}
{"event":"check:pass","taskId":"m1.1","check":"tsc"}
{"event":"task:done","taskId":"m1.1","result":"success"}
```

Crash mid-task? `crew run` reads the journal and resumes from the last checkpoint.

---

### 5. Agent as a Function

No chat threads. No history. No "context window management."

Each task execution is **hermetic**:

```typescript
async function execute(task: TaskDef, ctx: BuildContext) {
  const prompt = buildPrompt(task);    // Task + skills + context
  const result = await agent(prompt);  // Pure function call
  const passed = await verify(result); // Run checks
  return { result, passed };
}
```

This makes execution:
- **Deterministic** (same inputs → same outputs)
- **Cacheable** (memoize successful results)
- **Parallelizable** (no shared state)
- **Testable** (mock the agent function)

---

### 6. Progressive Complexity

Start simple. Add power as you need it.

**Level 1: Basic Plan**
```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');
  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('init', 'Initialize')
          .prompt('Create package.json and tsconfig.json')
      )
  );
  return plan.build();
}
```

**Level 2: Add Checks**
```typescript
.addTask(
  ctx.createTask('init', 'Initialize')
    .prompt('Create package.json and tsconfig.json')
    .check({ cmd: 'npm run typecheck' })
    .check({ cmd: 'test -f package.json' })
)
```

**Level 3: Add Dependencies**
```typescript
.addTask(ctx.createTask('install', 'Install deps').deps(['init']))
.addTask(ctx.createTask('build', 'Build').deps(['install']))
```

**Level 4: Custom Executors**
```typescript
.addTask(
  ctx.createTask('deploy', 'Deploy')
    .execute(async (task, ctx) => {
      await deployToAWS(ctx.appDir);
    })
)
```

**Level 5: AutoHarness**
```typescript
.addTask(
  ctx.createTask('ui', 'Build navbar')
    .harness({ refinable: true })  // AI-synthesized validation
)
```

You only pay for complexity when you need it.

---

## Design Principles

### Prefer Declarative over Imperative

**Bad (imperative):**
```typescript
const tasks = [];
for (const feature of features) {
  tasks.push({ title: `Build ${feature}`, ... });
}
```

**Good (declarative):**
```typescript
features.forEach(feature =>
  epic.addTask(ctx.createTask(feature, `Build ${feature}`))
);
```

The declarative form is:
- More concise
- Easier to analyze
- Better for tooling (type checking, linting)
- Serializable to YAML/JSON

---

### Composable Building Blocks

Small primitives compose into powerful systems:

- **Tasks** → Atomic units of work
- **Epics** → Logical groupings
- **Dependencies** → Ordering constraints
- **Checks** → Quality gates
- **Yields** → Dynamic planning
- **Executors** → Custom logic

Mix and match to build what you need.

---

### Observable Execution

Everything is visible:

- **Logs**: `.crew/logs/` has full execution history
- **State**: `.crew/state.json` shows current progress
- **Progress**: `progress.jsonl` is append-only journal
- **Tasks**: Each task directory has `task.md`, `context.txt`, `todo.md`
- **Events**: Orchestrator emits typed events for monitoring

No black boxes. You can always see what's happening and why.

---

## When to Use Crew

### ✅ Great For

- **Code generation projects** - Generate full applications, features, or tests
- **Multi-step workflows** - Complex tasks requiring planning and verification
- **Quality-critical work** - When correctness matters more than speed
- **Resumable operations** - Long-running tasks that might crash or be interrupted
- **Team collaboration** - Share plans and review agent outputs
- **Batch workflows** - Generate documentation, tests, migrations in bulk

### ❌ Not Ideal For

- **Single-step tasks** - Use Claude or GPT directly for one-off questions
- **Interactive coding** - Use Cursor, GitHub Copilot for real-time assistance
- **Real-time applications** - Crew is designed for batch workflows, not live apps
- **Simple automation** - Shell scripts may be simpler for basic file operations

---

## Mental Models

### Think in Layers

```
┌─────────────────────────────────────┐
│  Plan Layer (TypeScript)            │ ← Define what to build
├─────────────────────────────────────┤
│  Task Layer (YAML)                  │ ← Materialized tasks
├─────────────────────────────────────┤
│  Execution Layer (Agents)           │ ← Do the work
├─────────────────────────────────────┤
│  Verification Layer (Checks)        │ ← Prove it works
├─────────────────────────────────────┤
│  Storage Layer (Filesystem)         │ ← Persist everything
└─────────────────────────────────────┘
```

### Think in Constraints

Instead of:
> "Run task A, then B, then C and D in parallel, then E"

Think:
```typescript
A.deps([])           // No dependencies
B.deps(['A'])        // Waits for A
C.deps(['B'])        // Waits for B
D.deps(['B'])        // Waits for B (parallel with C)
E.deps(['C', 'D'])   // Fan-in: waits for both
```

The scheduler figures out the optimal execution order.

### Think in Reactive Loops

```
┌──────────────────────────────────┐
│  1. Execute task                 │
│  2. Run checks                   │
│  3. Checks pass?                 │
│     ├─ Yes → Next task           │
│     └─ No → Retry with feedback  │
└──────────────────────────────────┘
         ↑                    │
         └────────────────────┘
           (until max attempts)
```

This is the core loop. Everything else is configuration.

---

## Key Insights

### 1. Context Scoping

Agents work best with bounded context. Epics scope context:

```typescript
plan.addEpic(
  ctx.createEpic('auth', 'Authentication')
    .addTask(ctx.createTask('jwt', 'JWT tokens'))
    .addTask(ctx.createTask('refresh', 'Refresh logic'))
);
plan.addEpic(
  ctx.createEpic('api', 'API Layer')
    .addTask(ctx.createTask('users', 'User endpoints'))
);
```

Each epic has a focused goal. Tasks within an epic share context. This prevents drift.

### 2. Feedback Loops

The fastest way to good output is tight feedback:

```
Slow: Generate → Review (human) → Revise → Review → ...
Fast: Generate → Check (automated) → Fix (agent) → Check → Done
```

Crew optimizes for automated feedback loops.

### 3. Incremental Planning

You don't need to know everything upfront:

```typescript
.addTask(
  ctx.createTask('scaffold', 'Scaffold features')
    .yields({ mode: 'on-complete' })  // Spawns follow-up tasks
)
```

Early tasks discover what later tasks should do. This is **incremental planning**.

---

## Philosophy in Practice

### Example: Building a Next.js App

**Without Crew:**
- Prompt ChatGPT: "Build a Next.js app with auth"
- Get back 10 files
- Copy-paste into project
- Half the code doesn't compile
- Manually fix issues
- Repeat for each feature
- Lose track of what changed

**With Crew:**
```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Next.js App');

  plan.addEpic(
    ctx.createEpic('setup', 'Foundation')
      .addTask(ctx.createTask('init', 'Initialize').prompt('...').check({ cmd: 'npm run typecheck' }))
      .addTask(ctx.createTask('deps', 'Dependencies').deps(['init']))
  );

  plan.addEpic(
    ctx.createEpic('features', 'Features')
      .addTask(ctx.createTask('auth', 'Auth').check({ cmd: 'npm test -- auth' }))
      .addTask(ctx.createTask('ui', 'UI').harness())
  );

  return plan.build();
}
```

Run `crew run`. Agents execute. Checks verify. Failures auto-retry. State is saved. You review the result.

---

## Next Steps

- **Get started**: [Installation](./getting-started/installation.md)
- **Understand structure**: [Projects, Epics & Tasks](./core-concepts/projects-epics-tasks.md)
- **See examples**: [Examples](./examples/README.md)

---

[← Back to Documentation Home](./README.md)
