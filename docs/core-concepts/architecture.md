# Architecture Overview

**High-level system design and component interaction in Crew.**

[[docs](../README.md) > [core-concepts](./README.md) > architecture]

---

## Overview

Crew is a **reactive orchestrator** for AI agents. It coordinates task execution, manages state, and enforces quality gates through a reactive event loop.

This document provides a high-level architectural overview of how Crew works.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User Layer                         │
│  ┌────────────────┐         ┌──────────────────┐   │
│  │  Plan (.ts)    │────────>│   CLI (crew)     │   │
│  └────────────────┘         └──────────────────┘   │
└─────────────────────────────────────────────────────┘
                        │
                        v
┌─────────────────────────────────────────────────────┐
│                 Orchestration Layer                  │
│  ┌──────────────────────────────────────────────┐  │
│  │        ProjectOrchestrator                   │  │
│  │  ┌──────────────┐   ┌──────────────────┐    │  │
│  │  │ EpicOrchestrator │  Constraint Engine│    │  │
│  │  └──────────────┘   └──────────────────┘    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        v
┌─────────────────────────────────────────────────────┐
│                 Execution Layer                      │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────┐ │
│  │   Executor   │   │   Verifier   │  │ Session │ │
│  └──────────────┘   └──────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────┘
                        │
                        v
┌─────────────────────────────────────────────────────┐
│                  Storage Layer                       │
│  ┌──────────────────────────────────────────────┐  │
│  │    HierarchicalStore (FsStore)               │  │
│  │    .crew/epics/, progress.jsonl, state.json  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        v
┌─────────────────────────────────────────────────────┐
│                    AI Layer                          │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────┐ │
│  │  Claude API  │   │   Kimi API   │  │  Qwen   │ │
│  └──────────────┘   └──────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Plan Definition Layer

**Purpose**: Define what to build (TypeScript)

- **Location**: `.crew/setup/planning/index.ts`
- **API**: `ctx.createPlan()`, `ctx.createEpic()`, `ctx.createTask()`
- **Output**: Declarative plan structure

**Example**:
```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');
  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(ctx.createTask('init', 'Initialize').prompt('...'))
  );
  return plan.build();
}
```

### 2. ProjectOrchestrator

**Purpose**: Coordinate epic execution

- **Responsibilities**:
  - Load plan from `.crew/setup/planning/`
  - Materialize epics to `.crew/epics/`
  - Coordinate epic-level sequencing
  - Emit project-level events
  - Track overall progress

**Key Methods**:
- `run()` - Execute all epics
- `runEpic(id)` - Execute specific epic
- `resume()` - Resume from crash

### 3. EpicOrchestrator

**Purpose**: Coordinate task execution within an epic

- **Responsibilities**:
  - Resolve task dependencies (constraint solver)
  - Schedule task batches for parallel execution
  - Track epic-level state
  - Emit epic-level events

**Execution Model**:
```
while (has pending tasks) {
  batch = constraintEngine.resolveBatch();
  results = await Promise.all(batch.map(executeTask));
  updateState(results);
}
```

### 4. Constraint Engine

**Purpose**: Dependency resolution and scheduling

- **Responsibilities**:
  - Build dependency graph from `.deps()`
  - Detect circular dependencies
  - Schedule parallel batches
  - Handle conditional tasks (`.when()`, `.unless()`)

**Algorithm**:
```
1. Build directed acyclic graph (DAG) from dependencies
2. Find all tasks with satisfied dependencies
3. Group by parallelizable vs sequential constraints
4. Return batch of tasks ready to execute
5. Repeat until all tasks done
```

### 5. Executor

**Purpose**: Execute individual tasks

- **Responsibilities**:
  - Load task from `.crew/epics/{epic}/{task}/`
  - Build prompt from task.md + context
  - Invoke AI agent
  - Capture output
  - Run checks
  - Handle retries with feedback

**Execution Flow**:
```
1. Load task.yaml, task.md
2. Build TaskContext (file tools, shell, etc.)
3. Execute pre-checks (if any)
4. Invoke agent with prompt
5. Write agent output
6. Execute post-checks
7. If checks fail → retry with feedback (up to maxAttempts)
8. If all pass → mark done
```

### 6. Verifier

**Purpose**: Run quality gates (checks)

- **Responsibilities**:
  - Execute command checks (shell commands)
  - Execute named checks (tsc, build, images)
  - Execute prompt checks (AI validation)
  - Execute harness checks (auto-generated code)
  - Aggregate check results
  - Generate feedback for retry

**Check Types**:
- `{ cmd: 'npm test' }` - Command check
- `{ name: 'tsc' }` - Named check
- `{ prompt: '...' }` - Prompt check
- `.harness()` - AutoHarness

### 7. Session Manager

**Purpose**: Track resumable execution state

- **Responsibilities**:
  - Append events to `progress.jsonl`
  - Maintain `state.json`
  - Support resume from crash
  - Provide state queries

**Journal Events**:
```jsonl
{"event":"task:start","taskId":"m1.1","timestamp":"..."}
{"event":"task:exec","taskId":"m1.1","attempt":1}
{"event":"check:pass","taskId":"m1.1","check":"tsc"}
{"event":"task:done","taskId":"m1.1"}
```

### 8. HierarchicalStore (FsStore)

**Purpose**: Filesystem-native state persistence

- **Responsibilities**:
  - Read/write task state to `.crew/epics/`
  - Maintain YAML metadata files
  - Provide hierarchical queries (project → epic → task)
  - Ensure atomic writes

**Structure**:
```
.crew/epics/{epic-num}-{epic-slug}/
├── epic.yaml
├── tasks/
│   └── {task-num}-{task-slug}/
│       ├── task.yaml
│       ├── task.md
│       ├── context.txt
│       └── events/
```

---

## The Reactive Loop

Crew's execution follows a reactive event loop:

```
┌──────────────────────────────────────┐
│  1. Load Plan                        │
│     ↓                                 │
│  2. Materialize Epics                │
│     ↓                                 │
│  3. Resolve Dependencies (batch)     │
│     ↓                                 │
│  4. Execute Task                     │
│     ├─ Build Prompt                  │
│     ├─ Invoke Agent                  │
│     ├─ Run Checks                    │
│     └─ Pass? ──────────────┐         │
│        ├─ Yes → Done       │         │
│        └─ No → Retry ──────┘         │
│     ↓                                 │
│  5. Update State                     │
│     ↓                                 │
│  6. More Tasks? ──┐                  │
│     ├─ Yes ───────┘                  │
│     └─ No → Complete                 │
└──────────────────────────────────────┘
```

This loop continues until all tasks are done or max attempts exhausted.

---

## Data Flow

### Plan → Materialization → Execution

```
1. Plan Definition (.ts)
   ↓
   createPlan() builds EpicDef[] with TaskDef[]
   ↓
2. Materialization (crew plan init)
   ↓
   Write .crew/epics/{num}-{slug}/tasks/{num}-{slug}/task.yaml
   ↓
3. Execution (crew run)
   ↓
   Load task.yaml → Execute → Write results
   ↓
4. State Updates
   ↓
   progress.jsonl (append), state.json (overwrite)
```

### Check Feedback Loop

```
Task Execute
   ↓
Run Checks
   ↓
All Pass? ──────────┐
   ├─ Yes → Done    │
   └─ No ───────────┘
      ↓
   Build Feedback (error messages)
      ↓
   Retry (attempt N)
      ↓
   Run Checks
      ↓
   All Pass? ──────────┐
      ├─ Yes → Done    │
      └─ No → Retry... │
         (until maxAttempts)
```

---

## Event-Driven Architecture

Crew uses an event-driven model for observability:

### Event Types

- **Project Events**: `project:start`, `project:done`
- **Epic Events**: `epic:start`, `epic:done`
- **Task Events**: `task:start`, `task:exec`, `task:done`, `task:fail`
- **Check Events**: `check:run`, `check:pass`, `check:fail`

### Event Consumers

- **CLI**: Real-time progress display
- **Logs**: Written to `.crew/logs/`
- **Progress Journal**: Appended to `progress.jsonl`
- **Custom Handlers**: User dashboards, metrics

---

## Design Principles

### 1. Filesystem as Database

All state lives on disk in `.crew/`. No external database.

**Benefits**:
- Transparency (`ls`, `cat`)
- Version control friendly
- Easy debugging
- Portable

### 2. Append-Only Journals

`progress.jsonl` is append-only for crash safety.

**Benefits**:
- Never lose data
- Resumable execution
- Audit trail
- Debugging

### 3. Idempotent Operations

Tasks can be re-run safely.

**Benefits**:
- Retry on failure
- Resume after crash
- Parallel execution

### 4. Stateless Agents

Agents have no memory between calls.

**Benefits**:
- Swappable agents
- Cacheable results
- Parallel execution
- Testable

---

## Scalability Considerations

### Parallel Execution

Crew maximizes parallelism through:
- Constraint-based scheduling
- Parallel epic execution (future)
- Batch task execution within epics
- Concurrent check execution

### State Management

- **In-memory**: Current execution state
- **On-disk**: All persistent state
- **Lazy loading**: Only load needed tasks
- **Incremental writes**: Atomic state updates

### Resource Management

- **Agent pooling**: Reuse agent connections
- **File system limits**: Bounded by OS limits
- **Memory usage**: O(tasks in current batch)

---

## Security Model

### Sandboxing

- Agents execute in project directory (appDir)
- No access to parent directories by default
- Shell commands executed with project CWD

### Secrets Management

- API keys via environment variables
- No secrets in plan files
- No secrets in `.crew/` state

### Input Validation

- Task prompts sanitized
- File paths validated
- Shell commands escaped

---

## Next Steps

- **Understand hierarchy**: [Projects, Epics & Tasks](./projects-epics-tasks.md)
- **Learn execution**: [Execution Flow](./execution-flow.md)
- **See state management**: [Filesystem Store](./filesystem-store.md)
- **Explore resumability**: [Sessions & Resumability](./sessions-and-resumability.md)

---

## See Also

- [Execution Flow](./execution-flow.md) - Step-by-step execution
- [Constraint Engine](./constraint-engine.md) - Scheduling algorithm
- [Filesystem Store](./filesystem-store.md) - State persistence
- [Projects, Epics & Tasks](./projects-epics-tasks.md) - Core hierarchy

---

[← Back to Core Concepts](./README.md) | [Documentation Home](../README.md)
