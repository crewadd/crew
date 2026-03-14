# Filesystem Store

**How Crew persists all state to disk in the `.crew/` directory.**

[[docs](../README.md) > [core-concepts](./README.md) > filesystem-store]

---

## Overview

Crew's entire state lives on disk in the `.crew/` directory. There is no database, no external service, no in-memory-only state. This principle — **"the filesystem is the database"** — enables:

- **Transparency** — `ls` and `cat` are your debuggers
- **Portability** — Commit `.crew/` to version control
- **Resumability** — Crash mid-execution? State is already persisted
- **Inspection** — Audit execution without special tools

```
my-project/
├── .crew/
│   ├── project.yaml           # Project metadata
│   ├── progress.jsonl         # Execution journal (append-only)
│   ├── epics/                 # Epic-level state
│   └── setup/                 # Planning code & templates
├── package.json
├── src/
└── dist/
```

---

## Directory Structure

### Root: `.crew/`

The `.crew/` directory is created by `crew init` and contains all framework state.

```
.crew/
├── project.yaml              # Project metadata
├── progress.jsonl            # Append-only execution log
├── epics/                    # Materialized plan
│   ├── 01-setup/             # Epic 1
│   ├── 02-features/          # Epic 2
│   └── 03-testing/           # Epic 3
└── setup/                    # Planning infrastructure
    ├── planning/
    │   └── index.ts          # Plan definition (createPlan)
    └── agents/               # (Optional) Agent personas
        └── backend.md        # Agent definition
```

### Project Metadata: `project.yaml`

The project root contains metadata about the entire project:

```yaml
# .crew/project.yaml
name: My TypeScript Library
description: A utility library with type-safe helpers
goal: Build and publish to npm
settings:
  language: typescript
  packageManager: npm
```

**Used by:**
- Status reports and CLI output
- Agent context (project overview)
- Constraint engine (project-level settings)

### Epic State: `epics/`

Each epic has a directory with tasks:

```
.crew/epics/
├── 01-setup/
│   ├── epic.yaml             # Epic metadata
│   ├── status                # Epic status (planned/active/completed)
│   └── tasks/
│       ├── 01-init/          # Task 1 state
│       ├── 02-deps/          # Task 2 state
│       └── 03-config/        # Task 3 state
├── 02-features/
│   ├── epic.yaml
│   ├── status
│   └── tasks/
│       ├── 01-api/
│       └── 02-ui/
└── 03-testing/
    ├── epic.yaml
    ├── status
    └── tasks/
        └── 01-unit/
```

### Task State: `epics/{epic}/tasks/{task}/`

Each task has a directory containing all state for that task:

```
.crew/epics/01-setup/tasks/01-init/
├── task.yaml                 # Task definition (prompt, checks, etc)
├── todo.yaml                 # Execution checklist
├── status                    # Task status (pending/active/done/failed)
├── output/                   # Task outputs
│   └── result.json           # Agent output
├── events/                   # Execution logs
│   ├── 001.jsonl             # Attempt 1 events
│   ├── 002.jsonl             # Attempt 2 events
│   └── 003.jsonl             # Attempt 3 events
└── deps                      # Resolved task dependencies (paths)
```

Let's explore each file:

---

## File Types

### Task YAML: `task.yaml`

The complete task definition, persisted from the plan:

```yaml
# .crew/epics/01-setup/tasks/01-init/task.yaml
title: Initialize project
type: coding
prompt: |
  Create a TypeScript project with:
  - package.json with ESM support
  - tsconfig.json in strict mode
  - src/ directory
  - .gitignore for Node.js
inputs:
  files: []
  description: null
outputs:
  files:
    - package.json
    - tsconfig.json
    - src/
  description: null
skills:
  - typescript
checks:
  - name: file-exists-package
    cmd: test -f package.json
  - name: file-exists-tsconfig
    cmd: test -f tsconfig.json
  - name: file-exists-src
    cmd: test -d src
maxAttempts: 3
```

**Contains:**
- Task identity (title, type)
- Agent instructions (prompt)
- Scope definition (inputs, outputs)
- Skills and context
- Quality gates (checks)
- Execution constraints (maxAttempts)

### Todo YAML: `todo.yaml`

Tracks execution progress at a fine-grained level. The todo is broken into **phases**:

1. **pre** — Pre-checks (verify preconditions)
2. **main** — Agent execution
3. **post** — Post-checks (verify quality)

```yaml
# .crew/epics/01-setup/tasks/01-init/todo.yaml
- id: pre:init
  title: "Verify package.json doesn't exist"
  phase: pre
  status: done
  completedAt: 2025-03-15T10:00:00.000Z

- id: main
  title: "Execute task"
  phase: main
  status: done
  completedAt: 2025-03-15T10:00:05.000Z

- id: post:file-exists-package
  title: "check: test -f package.json"
  phase: post
  status: done
  completedAt: 2025-03-15T10:00:06.000Z

- id: post:file-exists-tsconfig
  title: "check: test -f tsconfig.json"
  phase: post
  status: pending
  error: "Check failed: exit code 1"
```

**Why fine-grained todos?**
- If a task fails on a post-check, only that check is retried
- If new checks are added to a completed task, only new ones run
- Enables incremental verification without re-executing the agent

### Status File: `status`

A single-line file containing the current task status:

```
# .crew/epics/01-setup/tasks/01-init/status
done
```

**Possible values:**
- `pending` — Waiting to execute
- `active` — Currently executing
- `done` — Successfully completed (all checks passed)
- `failed` — Execution failed, exceeded max attempts
- `blocked` — Waiting for dependencies
- `cancelled` — Execution cancelled

### Output JSON: `output/result.json`

The agent's output from the last successful task execution:

```json
{
  "taskId": "m1.1",
  "raw": "Created package.json with the following...\n\n...",
  "durationMs": 4250,
  "success": true,
  "output": {
    "files_created": ["package.json", "tsconfig.json"],
    "summary": "TypeScript project initialized successfully"
  }
}
```

### Event Logs: `events/{attempt}.jsonl`

Append-only JSONL files, one per attempt. Each line is a JSON event:

```jsonl
{"t":"2025-03-15T10:00:00.000Z","event":"task:start","taskId":"m1.1","attempt":1}
{"t":"2025-03-15T10:00:01.500Z","event":"task:stream","chunk":"Creating package.json..."}
{"t":"2025-03-15T10:00:02.000Z","event":"task:stream","chunk":"Adding dependencies..."}
{"t":"2025-03-15T10:00:04.000Z","event":"task:stream","chunk":"Done!"}
{"t":"2025-03-15T10:00:05.000Z","event":"task:done","taskId":"m1.1","durationMs":5000}
```

**Events in the log:**
- `task:start` — Task execution began
- `task:stream` — Incremental output (agent thinking, commands running)
- `task:done` — Task completed successfully
- `task:failed` — Task failed with error
- `check:run` — A check was executed
- `check:pass` — Check passed
- `check:fail` — Check failed

Event files are automatically numbered:
- Attempt 1: `001.jsonl`
- Attempt 2: `002.jsonl`
- Attempt 3: `003.jsonl`

### Dependencies File: `deps`

Plain text file, one dependency path per line. These are resolved **absolute paths** to other tasks:

```
# .crew/epics/01-setup/tasks/02-deps/deps
.crew/epics/01-setup/tasks/01-init
```

Specifies that task 02-deps depends on task 01-init completing first.

---

## Project-Level Execution Journal

### Progress Journal: `progress.jsonl`

An append-only JSONL log of high-level execution events at the project and epic level:

```jsonl
{"ts":"2025-03-15T10:00:00.000Z","event":"project:start","iteration":1}
{"ts":"2025-03-15T10:00:00.500Z","event":"project:planned","epicCount":3}
{"ts":"2025-03-15T10:00:05.000Z","event":"epic:start","epicId":1,"title":"Project Setup","iteration":1}
{"ts":"2025-03-15T10:00:10.000Z","event":"epic:done","epicId":1,"success":true,"iterations":1}
{"ts":"2025-03-15T10:00:10.500Z","event":"epic:start","epicId":2,"title":"Features","iteration":1}
{"ts":"2025-03-15T10:02:30.000Z","event":"project:verified","passed":true,"issueCount":0,"iteration":1}
{"ts":"2025-03-15T10:02:31.000Z","event":"project:done","success":true,"iterations":1,"totalDurationMs":151000}
```

**Used for:**
- Crash recovery (resume from last checkpoint)
- Progress reporting (`crew status`)
- Audit trails (when did what happen?)

---

## Directory Naming

### Epic Slug Format

Epics are numbered with zero-padded IDs, hyphenated with their slug:

```
01-setup      # Epic 1, slug: setup
02-features   # Epic 2, slug: features
03-testing    # Epic 3, slug: testing
```

Allows both:
- Numeric ordering (01 < 02 < 03)
- Human-readable names (setup, features)

### Task Slug Format

Tasks are numbered within each epic:

```
.crew/epics/01-setup/tasks/
├── 01-init       # Task 1 in epic 1, slug: init
├── 02-deps       # Task 2 in epic 1, slug: deps
└── 03-config     # Task 3 in epic 1, slug: config

.crew/epics/02-features/tasks/
├── 01-api        # Task 1 in epic 2, slug: api
└── 02-ui         # Task 2 in epic 2, slug: ui
```

---

## Reading the Filesystem

### Check Status

```bash
# Is a task done?
cat .crew/epics/01-setup/tasks/01-init/status
# Output: done

# Is an epic done?
cat .crew/epics/01-setup/status
# Output: completed
```

### Inspect Task Definition

```bash
# See what a task is supposed to do
cat .crew/epics/01-setup/tasks/01-init/task.yaml
```

### View Agent Output

```bash
# What did the agent produce?
cat .crew/epics/01-setup/tasks/01-init/output/result.json | jq

# What events occurred during execution?
tail -20 .crew/epics/01-setup/tasks/01-init/events/001.jsonl
```

### Track Progress

```bash
# High-level project timeline
cat .crew/progress.jsonl | jq '.event'

# See when each task started/failed/succeeded
grep '"event":"task:' .crew/epics/*/tasks/*/events/*.jsonl
```

---

## Planning Infrastructure: `.crew/setup/`

The planning directory contains code and templates for plan definition:

```
.crew/setup/
├── planning/
│   └── index.ts              # Your createPlan() function
├── agents/                   # (Optional) Agent personas
│   ├── backend.md            # Backend AI agent
│   └── frontend.md           # Frontend AI agent
└── skills/                   # (Optional) Skill definitions
    └── typescript.yaml       # TypeScript skill
```

### Planning Script

The `planning/index.ts` contains your plan definition:

```typescript
// .crew/setup/planning/index.ts
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Project Setup')
      .addTask(ctx.createTask('init', 'Initialize').prompt('...'))
  );

  return plan.build();
}
```

This is executed by `crew plan init` to materialize the `.crew/epics/` directory structure.

---

## State Lifecycle

### On `crew init`

1. Create `.crew/` directory
2. Create `.crew/project.yaml` (metadata)
3. Create `.crew/setup/planning/index.ts` (template)
4. Create `crew.json` (CLI config)

### On `crew plan init`

1. Load `.crew/setup/planning/index.ts`
2. Execute `createPlan()` function
3. Create `.crew/epics/{N}-{slug}/` directories
4. Write `task.yaml` and `epic.yaml` files for each task/epic
5. Initialize `status` files to `pending`
6. Initialize empty `todo.yaml` for each task

### On `crew run`

1. Read `.crew/project.yaml` and task definitions
2. For each task:
   - Read `task.yaml` definition
   - Create `events/001.jsonl` (attempt 1)
   - Execute agent with prompt from `task.yaml`
   - Append events to `.crew/epics/{epic}/tasks/{task}/events/001.jsonl`
   - Run post-checks from `task.yaml`
   - If checks fail, create `events/002.jsonl` and retry (up to maxAttempts)
   - Write `output/result.json` on success
   - Update `status` file
   - Append event to `.crew/progress.jsonl`

### On `crew status`

1. Read `.crew/project.yaml` (project name)
2. For each epic in `.crew/epics/`:
   - Read `epic.yaml` and `status`
   - For each task:
     - Read `task.yaml` and `status`
     - Count completed todos from `todo.yaml`
3. Display hierarchical status report

---

## Durability Guarantees

### Append-Only Logs

Event logs are **append-only**. Every entry is written exactly once:

```bash
# Safe: never loses entries
appendFileSync('.crew/progress.jsonl', JSON.stringify(entry) + '\n');

# Unsafe: overwrites previous state
writeFileSync('.crew/progress.jsonl', JSON.stringify(state));
```

**Implication:** If Crew crashes mid-write, the partial entry is lost, but all previous entries survive. On resume, Crew reads the log and skips any already-completed work.

### Atomic File Creation

Task directories are created atomically:

```typescript
mkdirSync('.crew/epics/01-setup/tasks/01-init', { recursive: true });
writeYaml(taskYamlPath, taskDef);  // All-or-nothing
```

If the process crashes during directory creation, either the entire directory exists (with all files) or it doesn't exist at all.

### Status Files

Status is written last in a sequence, ensuring it's only updated after all work is done:

```typescript
// 1. Execute task
const result = await executeTask();

// 2. Write output
writeFileSync(outputPath, JSON.stringify(result));

// 3. Update status (last, most critical)
writeFileSync(statusPath, 'done');
```

---

## Best Practices

### Version Control

Commit `.crew/` to version control:

```bash
# Good: Track all execution history
git add .crew/
git commit -m "Task execution history"

# Bad: Lose all state on machine crash
echo ".crew/" >> .gitignore
```

### Inspection

Use standard Unix tools to inspect state:

```bash
# View overall progress
tail -5 .crew/progress.jsonl

# See why a task failed
cat .crew/epics/01-setup/tasks/01-init/events/001.jsonl | jq '.[] | select(.event == "task:failed")'

# Find all failed checks
grep '"status":"failed"' .crew/epics/*/tasks/*/todo.yaml

# Check task definitions
find .crew/epics -name task.yaml -exec grep -l "prompt:" {} \;
```

### Debugging

When something goes wrong, the filesystem tells the story:

1. Check task status: `cat .crew/epics/{epic}/tasks/{task}/status`
2. Read todo checklist: `cat .crew/epics/{epic}/tasks/{task}/todo.yaml`
3. View agent output: `cat .crew/epics/{epic}/tasks/{task}/output/result.json | jq`
4. Review events: `tail .crew/epics/{epic}/tasks/{task}/events/001.jsonl`
5. Read logs: `tail -100 .crew/progress.jsonl`

---

## See Also

- [Sessions & Resumability](./sessions-and-resumability.md) — How the filesystem enables crash recovery
- [Execution Flow](./execution-flow.md) — How state flows through execution
- [Projects, Epics & Tasks](./projects-epics-tasks.md) — The hierarchy that maps to this structure
