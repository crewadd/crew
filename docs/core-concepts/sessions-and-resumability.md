# Sessions & Resumability

**Crash-safe execution: how Crew enables you to pick up exactly where you left off.**

[[docs](../README.md) > [core-concepts](./README.md) > sessions-and-resumability]

---

## Overview

Crew enables **crash-safe execution**. If your process crashes mid-task — power failure, network interruption, manual stop — you can resume from the exact point where you stopped. No lost work, no restarted tasks.

This is possible because **all state is persisted to disk**. Before any state changes, Crew writes to an append-only journal. If a crash occurs, the journal survives. When you restart, Crew reads the journal and skips any already-completed work.

```
Session 1:          Session 2:              Session 3:
┌─────────────┐     ┌─────────────────┐    ┌──────────────────┐
│ Task 1 ✓    │     │ Task 1 ✓ (skip) │    │ Task 1 ✓ (skip)  │
│ Task 2 ✓    │────→│ Task 2 ✓ (skip) │───→│ Task 2 ✓ (skip)  │
│ Task 3 →    │     │ Task 3 →        │    │ Task 3 ✓ (done)  │
│ CRASH       │     │ Task 4 ✓        │    │ Task 4 ✓         │
└─────────────┘     │ Task 5 →        │    │ Task 5 ✓         │
                    │ CRASH           │    │ All complete ✓   │
                    └─────────────────┘    └──────────────────┘
```

---

## Progress Journal

### The Core Mechanism: `progress.jsonl`

All project-level state changes are logged to an **append-only JSONL file** at `.crew/progress.jsonl`:

```jsonl
{"ts":"2025-03-15T10:00:00.000Z","event":"project:start","iteration":1}
{"ts":"2025-03-15T10:00:00.500Z","event":"project:planned","epicCount":3}
{"ts":"2025-03-15T10:00:05.000Z","event":"epic:start","epicId":1,"title":"Setup","iteration":1}
{"ts":"2025-03-15T10:00:10.000Z","event":"epic:done","epicId":1,"success":true,"iterations":1}
{"ts":"2025-03-15T10:00:10.500Z","event":"epic:start","epicId":2,"title":"Features","iteration":1}
{"ts":"2025-03-15T10:02:30.000Z","event":"project:verified","passed":true,"issueCount":0,"iteration":1}
{"ts":"2025-03-15T10:02:31.000Z","event":"project:done","success":true,"iterations":1,"totalDurationMs":151000}
```

**Key property:** **Append-only**. New events are always appended; never modified or deleted. This guarantees that even if the process crashes mid-write, the file remains valid.

### Journaled Events

The journal logs these project-level events:

| Event | Meaning | Data |
|-------|---------|------|
| `project:start` | Execution began | iteration number |
| `project:planned` | Plan loaded | epic count |
| `epic:start` | Epic execution began | epic ID, title, iteration |
| `epic:done` | Epic completed | epic ID, success flag, iterations |
| `epic:fix` | Quality gate retry | epic ID, iteration |
| `project:verified` | Quality checks ran | passed flag, issue count |
| `project:fix` | Project-level retry | fix epic count |
| `project:done` | Entire project complete | success flag, total duration |

---

## Task-Level Event Logs

In addition to the project journal, each task has its own event log:

```
.crew/epics/01-setup/tasks/01-init/events/
├── 001.jsonl    # Attempt 1 events
├── 002.jsonl    # Attempt 2 events
└── 003.jsonl    # Attempt 3 events
```

Each attempt file logs events during that attempt:

```jsonl
{"t":"2025-03-15T10:00:00.000Z","event":"task:start","taskId":"m1.1","attempt":1,"logFile":"001.jsonl"}
{"t":"2025-03-15T10:00:01.500Z","event":"task:stream","chunk":"Creating package.json..."}
{"t":"2025-03-15T10:00:02.000Z","event":"task:stream","chunk":"Adding dependencies..."}
{"t":"2025-03-15T10:00:04.000Z","event":"check:run","checkName":"package-exists"}
{"t":"2025-03-15T10:00:04.500Z","event":"check:pass","checkName":"package-exists"}
{"t":"2025-03-15T10:00:05.000Z","event":"task:done","taskId":"m1.1","durationMs":5000}
```

---

## Resume Mechanism

### On Startup

When `crew run` starts, it performs a **resume scan**:

```typescript
// 1. Read progress.jsonl
const events = readProgressLog('.crew/progress.jsonl');

// 2. Find the last project:start event
const lastStart = findLast(events, e => e.event === 'project:start');

// 3. Determine which tasks completed after that start
const completedTasks = events
  .filter(e => e.ts > lastStart.ts)
  .filter(e => e.event === 'task:done');

// 4. Skip those tasks in execution
for (const task of allTasks) {
  if (completedTasks.some(t => t.taskId === task.id)) {
    console.log(`Skipping ${task.id} (already done)`);
    continue;
  }
  executeTask(task);
}
```

### Resume Scenarios

#### Scenario 1: Crash During Task Execution

```
Attempt 1: Task executing... CRASH

On resume:
1. Read progress.jsonl → last event is "task:start"
2. Check task status file → status is "active"
3. Restart the task (attempt 2)
4. Task completes successfully
5. Continue to next task
```

**Result:** Task is re-executed (safe, since previous attempt was incomplete)

#### Scenario 2: Crash After Task Completion

```
Attempt 1: Task completes, checks pass
          Status file written: "done"
          CRASH (before next task starts)

On resume:
1. Read progress.jsonl → find "task:done" event for this task
2. Check task status file → status is "done"
3. Skip this task (already verified complete)
4. Continue to next task
```

**Result:** Task is skipped (safe, since it already succeeded and checks passed)

#### Scenario 3: Crash During Check Execution

```
Task completes, checks running... CRASH

On resume:
1. Read task status file → status is "active" (not yet "done")
2. Read todo.yaml → see which checks passed/failed
3. Restart checks from the next pending check
4. Continue with remaining checks
```

**Result:** Checks are resumed (safe, already-passed checks are skipped)

---

## Durability Guarantees

### Atomic Writes

State transitions are designed to be **safe under crash**:

```typescript
// BAD: Loses state if crash between writes
async executeTask(task) {
  const result = await runAgent(task);
  updateStatus(task, 'in-progress');
  // CRASH HERE: status updated but result not saved
  saveResult(task, result);
  updateStatus(task, 'done');
}

// GOOD: Safe under crash
async executeTask(task) {
  const result = await runAgent(task);
  // If crashed here: task status is still "active", no result saved → retry is safe
  saveResult(task, result);
  // If crashed here: result is saved but status not updated → retry completes the update
  updateStatus(task, 'done');
  appendProgressLog({ event: 'task:done', taskId: task.id });
  // If crashed here: status and journal are consistent → resume picks up next task
}
```

### Append-Only Journal

The progress journal uses **append-only semantics**:

```typescript
// Safe: append-only
appendFileSync('.crew/progress.jsonl', JSON.stringify(event) + '\n');

// Unsafe: overwrites
writeFileSync('.crew/progress.jsonl', JSON.stringify(state));
```

**Property:** Even if a write is interrupted (e.g., power loss), the file remains valid. The interrupted line is lost, but all previous lines survive.

### Idempotent Checks

Checks are designed to be **idempotent** — running them multiple times yields the same result:

```typescript
// Idempotent check: safe to re-run
.check({ cmd: 'test -f package.json' })  // Returns same result each time

// Non-idempotent check: unsafe to re-run
.check({ cmd: 'npm install' })  // Might fail if already installed
```

---

## Resume With Cleanup

If you want to restart from scratch (losing all history), use the reset command:

```bash
# Reset a single task
crew task reset 01-setup 01-init

# Reset a whole epic
crew epic reset 01-setup

# Reset everything (DESTRUCTIVE)
crew reset --all
```

**Reset does:**
1. Delete task output files
2. Delete event logs
3. Delete todo.yaml
4. Reset status to "pending"
5. Does NOT delete the task.yaml definition

---

## Resuming from Specific Points

### Resume from a Specific Epic

```bash
# Resume from epic 2 onwards (skip 1)
crew run --from 02

# Resume from specific task
crew run --from m2.3

# Resume up to a specific task (don't run beyond)
crew run --until m2.3
```

### Resume with Backfill

If you want to redo a specific task but keep later tasks, use:

```bash
# Redo task m1.2, but keep m1.3 and beyond
crew task reset 01-setup 02
crew run --from m1.2
```

---

## Progress Tracking

### View Execution Timeline

```bash
# Show all events
cat .crew/progress.jsonl | jq

# Show just project-level events
cat .crew/progress.jsonl | jq '.[] | select(.event | startswith("project:"))'

# Show just epic-level events
cat .crew/progress.jsonl | jq '.[] | select(.event | startswith("epic:"))'

# See which tasks completed in last run
cat .crew/progress.jsonl | jq '.[] | select(.event == "task:done")'
```

### Check Session Status

```bash
# What's the current project state?
crew status

# JSON output for scripting
crew status --json
```

### Find Where Execution Failed

```bash
# Find the last failed event
tail -20 .crew/progress.jsonl | jq '.[] | select(.event | contains("fail")) | .error'

# Find all failed tasks
grep '"event":"task:failed"' .crew/progress.jsonl

# When did the last crash occur?
tail -1 .crew/progress.jsonl  # If no "project:done" event, last run crashed
```

---

## Practical Resume Scenarios

### Scenario 1: Simple Resume

**What happened:**
```
crew run
... Task 1-5 complete ...
... Task 6 executing... CONNECTION TIMEOUT
... Process exits
```

**What to do:**
```bash
# Just resume
crew run

# Crew will:
# 1. Read progress.jsonl, see tasks 1-5 completed
# 2. Restart task 6 (which didn't complete)
# 3. Continue with task 7+
```

### Scenario 2: Debugged Error and Resumed

**What happened:**
```
crew run
... Task 1-3 complete ...
... Task 4 fails quality gates after 3 attempts
... Execution stops
```

**What to do (fix and continue):**
```bash
# Check what went wrong
cat .crew/epics/01-setup/tasks/04-*/output/result.json | jq

# Fix the underlying issue (e.g., update task definition)
vim .crew/setup/planning/index.ts

# Reload plan to update task definitions
crew plan init

# Resume: will retry task 4 with new definition
crew run
```

### Scenario 3: Resume from Specific Point

**What happened:**
```
crew run
... Task 1-3 complete ...
... Task 4-10 complete ...
... Verification fails, human decides to redo task 5
```

**What to do (redo one task):**
```bash
# Reset task 5
crew task reset 01-setup 05

# Resume from task 5
crew run --from m1.5
```

**Result:** Task 5 re-executes, tasks 6+ re-execute (to reverify), tasks 1-4 skipped

---

## Session Metadata

Each session stores metadata in the progress journal:

```jsonl
{"ts":"2025-03-15T10:00:00.000Z","event":"project:start","iteration":1}
{"ts":"2025-03-15T11:30:00.000Z","event":"project:start","iteration":2}
```

**iteration number:** Incremented each time you run `crew run`. Helps identify which session did what.

### Querying Sessions

```bash
# How many sessions have there been?
cat .crew/progress.jsonl | jq '.[] | select(.event == "project:start")' | wc -l

# What iteration are we on?
tail -100 .crew/progress.jsonl | jq '.[] | select(.event == "project:start") | .iteration' | tail -1

# Timeline of all sessions
cat .crew/progress.jsonl | jq '.[] | select(.event == "project:start") | "\(.ts): iteration \(.iteration)"'
```

---

## Best Practices

### 1. Commit State to Version Control

```bash
# Track all execution history
git add .crew/
git commit -m "Task execution logs"

# On resume, history is preserved and searchable
git log --oneline
git show HEAD:.crew/progress.jsonl
```

### 2. Don't Delete Event Logs

The event logs are your audit trail. Keep them:

```bash
# Good: Safe to delete task outputs but keep logs
rm -rf .crew/epics/*/tasks/*/output/

# Bad: Deleting logs loses history
rm -rf .crew/epics/*/tasks/*/events/
```

### 3. Use `--dry-run` Before Large Changes

```bash
# See what would be executed without actually running
crew run --dry-run

# If it looks good, run for real
crew run
```

### 4. Monitor Long-Running Sessions

```bash
# For long-running projects, watch progress in another terminal
watch -n 5 'tail -5 .crew/progress.jsonl | jq'
```

### 5. Enable Crash Recovery in CI/CD

```bash
# In your CI pipeline, always use resume mode
crew run --resume  # Handles both first-run and resume-run
```

---

## Limitations

### Partial Writes

If a process crashes during a file write, that line is lost:

```
Before: {"event":"task:done",...}
Write:  {"event":"task:fa... [CRASH]
After:  {"event":"task:done",...}

The incomplete line is lost, but previous entries survive.
On resume, Crew sees the last complete "project:start" and re-executes from there.
```

### Clock Skew

Timestamps are generated locally. If system time changes, logged times might be inaccurate:

```bash
# Ensure NTP is running if precision matters
timedatectl status
```

### Manual File Edits

If you manually edit `.crew/` files (e.g., `task.yaml`), state might become inconsistent:

```bash
# Safe: Use crew to reload plan
crew plan init

# Unsafe: Manually editing task definitions
vim .crew/epics/01-setup/tasks/01-init/task.yaml
```

---

## Debugging Resume

### Check Latest Status

```bash
# See current execution state
crew status

# JSON format for automation
crew status --json | jq '.epics[] | {id, title, complete}'
```

### Trace Through Progress Log

```bash
# Find all events for a specific task
jq '.[] | select(.taskId == "m1.5")' .crew/progress.jsonl

# Find when a task failed and was retried
jq '.[] | select(.taskId == "m1.5" and .event | contains("fail"))' .crew/progress.jsonl
```

### Inspect Task State

```bash
# What's the current status?
cat .crew/epics/01-setup/tasks/01-init/status

# What checks failed?
cat .crew/epics/01-setup/tasks/01-init/todo.yaml | jq '.[] | select(.status == "failed")'

# How many attempts?
ls .crew/epics/01-setup/tasks/01-init/events/*.jsonl | wc -l
```

---

## See Also

- [Filesystem Store](./filesystem-store.md) — How state is persisted to disk
- [Execution Flow](./execution-flow.md) — How resumability fits into execution
- [Projects, Epics & Tasks](./projects-epics-tasks.md) — The data being resumed
