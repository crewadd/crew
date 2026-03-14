# Task Execution Playbook

This playbook helps the user run, monitor, and troubleshoot tasks. Use it when the user wants to execute work, watch what's happening, diagnose why something stalled or failed, or recover from interruptions.

## Table of Contents

- [Execution Workflow](#execution-workflow)
- [Running Tasks](#running-tasks)
- [Execution Modes](#execution-modes)
- [Session Management](#session-management)
- [Monitoring a Running Task](#monitoring-a-running-task)
- [Status Check Phase](#status-check-phase)
- [Diagnosing Problems](#diagnosing-problems)
- [Cancellation and Resume](#cancellation-and-resume)
- [Crash Recovery](#crash-recovery)
- [Background Execution](#background-execution)
- [Common Patterns](#common-patterns)

---

## Execution Workflow

When the user wants to run tasks, follow this rhythm:

```
Assess state → Pick mode → Run → Monitor → Troubleshoot (if needed) → Verify → Advance
```

1. **Assess state** — Run `crew status` and `crew tree` to see what's ready, active, failed, or blocked
2. **Pick mode** — Choose single-task, full-auto, or targeted execution (see [Execution Modes](#execution-modes))
3. **Run** — Execute `crew run` with the chosen mode
4. **Monitor** — Watch progress via logs and session state
5. **Troubleshoot** — If something fails or stalls, diagnose using logs, session state, and status checks (see [Diagnosing Problems](#diagnosing-problems))
6. **Verify** — Run `crew verify` after completion to confirm output
7. **Advance** — Check `crew status` to see what unlocked next

## Running Tasks

### Single Task (Next Ready)

Run just the next task whose dependencies are all satisfied:

```bash
crew run next
```

Aliases: `crew run auto` does the same thing.

### Specific Task

Run a known task by its display ID:

```bash
crew run m1.3
```

The task must exist. If it's already done, it re-runs. If dependencies aren't met, it still attempts execution (useful for manual overrides).

### Full Auto

Run all tasks sequentially until the plan completes or hits a blocker:

```bash
crew run full
# or simply:
crew run
```

This loops automatically — each iteration runs one task, then picks the next. Stops on:
- All tasks complete
- A task failure (exits with code 1)
- A hard block (deadlock, no path forward)
- Tasks awaiting review (exits with code 0)

### Run Until Target

Execute tasks in sequence until a specific task completes:

```bash
crew run --until m2.2
```

Useful when you only need a portion of the plan finished. Stops as soon as the target task is done.

## Execution Modes

| Command | Mode | Behavior |
|---------|------|----------|
| `crew run next` | Single | Run one task, then exit |
| `crew run auto` | Single | Same as `next` |
| `crew run m1.3` | Specific | Run one specific task |
| `crew run full` | Loop | Run all tasks until done or blocked |
| `crew run` | Loop | Same as `full` |
| `crew run --until m2.2` | Loop | Run tasks until target completes |

### How the Loop Works

In loop mode (`full` / `--until`), each iteration:

1. Runs the **status check phase** (crash detection, stale reset, blocker scan)
2. Resolves the next task via intent resolution
3. Executes the task (with logging and progress tracking)
4. Checks the result — exits on failure, continues on success
5. Pauses briefly (500ms) between iterations

## Session Management

Every `crew run` invocation creates a **session** — a lightweight tracking file at `.crew/session.json` that records what's running and enables crash recovery.

### Session File Format

```json
{
  "pid": 12345,
  "taskId": "m1.3",
  "taskTitle": "Build login page",
  "startedAt": "2026-03-07T10:00:00Z",
  "attempt": 1,
  "status": "running",
  "updatedAt": "2026-03-07T10:05:00Z",
  "checkpoint": {
    "lastEvent": "task:stream",
    "at": "2026-03-07T10:05:00Z"
  }
}
```

### Session Lifecycle

```
start → [checkpoints...] → complete | fail | cancel
```

| Phase | What happens | File state |
|-------|-------------|------------|
| **Start** | Session file created with PID, task ID, `status: "running"` | Created |
| **Checkpoint** | `updatedAt` and `checkpoint.lastEvent` updated on each event | Updated |
| **Complete** | Status set to `"completed"`, file **removed** | Deleted |
| **Fail** | Status set to `"failed"`, file **persists** for diagnostics | Persists |
| **Cancel** | Status set to `"cancelled"`, file **persists** for resume | Persists |

### Why Sessions Matter

- **Crash detection** — If `status` is `"running"` but the PID is dead, the process crashed. The next `crew run` auto-recovers.
- **Duplicate prevention** — If a session is active and the PID is alive, a second `crew run` blocks with a message instead of causing conflicts.
- **Resume context** — After cancellation, the session file tells the next run exactly which task was interrupted.

### Reading Session State

```bash
# Check if a session exists
cat .crew/session.json 2>/dev/null || echo "No active session"

# Check project status (includes session-aware crash detection)
crew status
```

## Monitoring a Running Task

### Progress Log

Every state transition is appended to `.crew/progress.jsonl`:

```bash
# Watch progress in real-time
tail -f .crew/progress.jsonl
```

Each line is a JSON object with an `event` field:

```json
{"event":"session:start","pid":12345,"singleTask":"m1.3"}
{"event":"task:start","taskId":"m1.3","attempt":1}
{"event":"task:done","taskId":"m1.3","durationMs":45000}
{"event":"session:end","reason":"completed"}
```

### Task Logs

Individual task execution output is co-located with each task:

```bash
# Logs are stored at:
# .crew/epics/<epic-slug>/tasks/<task-slug>/logs/<timestamp>-attempt-<N>.log

# View task details including log paths
crew task m1.3
```

### Status During Execution

```bash
crew status          # Shows active task, progress overview
crew status --json   # Machine-readable with full task details
```

## Status Check Phase

Before selecting a task, `crew run next` and loop modes run an intelligent **status check** that analyzes the full project state. This catches problems early instead of blindly picking the next pending task.

### What It Detects

| Condition | Action | What happens |
|-----------|--------|--------------|
| All tasks done | `complete` | Exit successfully |
| Cancelled tasks from Ctrl+C | `reset_and_run` | Reset to pending, pick next task |
| Crashed session (PID dead) | `reset_and_run` | Reset stale task, pick next |
| Failed task with retries left | `retry` | Reset to pending, re-run |
| Failed task blocking dependents (no retries) | `block` | Exit with error, surface details |
| Tasks awaiting review | `awaiting_review` | Exit, show review instructions |
| Ready tasks available | `run` | Normal execution |
| No tasks can proceed | `block` (deadlock) | Exit with dependency chain |

### Configuring Status Check

In `crew.json`:

```json
{
  "statusCheck": {
    "staleThresholdMs": 300000,
    "maxRetries": 3,
    "autoResetStale": true
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `staleThresholdMs` | `300000` (5 min) | Time before an active task is considered stale (fallback when no session) |
| `maxRetries` | `3` | Max failed attempts before a task becomes a hard blocker |
| `autoResetStale` | `true` | Auto-reset stale tasks instead of requiring manual intervention |

## Diagnosing Problems

When a task fails, stalls, or blocks downstream work, use this sequence to find the root cause and fix it.

### Quick Triage

```bash
# 1. What's the current state?
crew status

# 2. Which task failed?
crew task m1.3

# 3. Read the execution log (co-located with the task)
ls .crew/epics/*/tasks/*/logs/

# 4. Check the session for stale/crashed state
cat .crew/session.json 2>/dev/null
```

### Common Problems and Fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Task stuck as `active` | Process crashed without cleanup | `crew run next` (auto-detects and resets) or manually: `crew task m1.3 edit --status pending` |
| Task failed, downstream blocked | Code/config error in the task | Read the log, fix the issue, then `crew run m1.3` to retry |
| "No pending tasks found" | All tasks done, blocked, or failed | Run `crew status --json` to inspect; fix failed tasks or break dependency cycles |
| "Deadlock detected" | Circular or unresolvable dependencies | `crew status --json` to find the cycle, then `crew task <id> edit --deps "..."` to break it |
| Task keeps failing on retry | Same error recurring | Read the log carefully, compare attempts; the fix from prior attempts didn't address the root cause |
| "N task(s) currently active" | Another `crew run` process is alive | Wait for it, or check `.crew/session.json` for the PID and stop it |

### Reading Execution Logs

Task logs are co-located with each task at `.crew/epics/<epic-slug>/tasks/<task-slug>/logs/`. Each attempt gets its own timestamped log file:

```bash
crew task m1.3    # Shows task location and log paths
```

The progress log tracks every state transition across all tasks:

```bash
# See recent activity
tail -20 .crew/progress.jsonl

# Watch in real-time
tail -f .crew/progress.jsonl
```

### When Auto-Recovery Fails

If `crew run next` can't auto-recover, do it manually:

```bash
# 1. Clear the stale session
rm .crew/session.json

# 2. Reset the stuck task
crew task m1.3 edit --status pending

# 3. Verify state is consistent
crew status

# 4. Resume
crew run next
```

### Escalation Path

If you can't diagnose or fix the issue:

1. Gather context: `crew status --json`, task logs, `progress.jsonl`
2. Check if the troubleshooting playbook has a matching pattern: `references/playbooks/troubleshooting.md`
3. Flag for the user with full context — what failed, what you tried, what the logs say

## Cancellation and Resume

### Cancelling a Running Task

Press `Ctrl+C` during `crew run`. The framework handles it gracefully:

1. Aborts the current task execution
2. Marks the task as `cancelled` in the store
3. Updates the session file to `status: "cancelled"`
4. Logs a cancellation checkpoint to `progress.jsonl`
5. Prints a resume command: `crew run m1.3`

### Resuming After Cancellation

The next `crew run next` or `crew run full` automatically detects the cancelled task and resumes:

```bash
# Option 1: Resume the specific task
crew run m1.3

# Option 2: Let auto-detection handle it
crew run next
# → Detects cancelled m1.3, resets to pending, runs next ready task

# Option 3: Continue the full loop
crew run full
# → Same detection, continues where it left off
```

### What Happens to Cancelled Tasks

- Task status in the store: `cancelled`
- Session file: persists with `status: "cancelled"`
- On next `crew run next`: auto-reset to `pending` via status check phase
- The task's attempt counter is preserved — it knows how many times it ran before

## Crash Recovery

If the `crew run` process dies unexpectedly (kill -9, power loss, OOM), recovery is automatic.

### How Crash Detection Works

1. The session file at `.crew/session.json` still has `status: "running"`
2. The next `crew run` reads the session and checks if the PID is alive using `kill -0`
3. PID dead + status running = crashed session
4. The status check resets the stale task to `pending` and picks the next ready task

### Recovery Flow

```
Next crew run → Read session → Check PID alive? → No → Crash detected
                                                     → Reset task to pending
                                                     → Clear session file
                                                     → Pick next ready task
```

### Manual Recovery

If automatic recovery isn't working:

```bash
# Check session state
cat .crew/session.json

# Manually reset a stuck task
crew task m1.3 edit --status pending

# Clear the session file
rm .crew/session.json

# Resume execution
crew run next
```

## Background Execution

### Running Tasks in the Background

Run `crew run` as a background process and monitor it:

```bash
# Start full execution in background
crew run full > .crew/run.log 2>&1 &
echo "PID: $!"

# Monitor progress
tail -f .crew/progress.jsonl

# Check if still running
cat .crew/session.json | grep status

# View task output
tail -f .crew/run.log
```

### Watching a Background Run

```bash
# Quick status check
crew status

# Detailed view — shows active task and progress
crew status --json | jq '.epics[] | {title, progress: .progress}'

# Watch the progress log for events
tail -f .crew/progress.jsonl | while read line; do
  echo "$line" | jq -r '"[\(.event)] \(.taskId // .singleTask // "")"'
done
```

### Stopping a Background Run

```bash
# Graceful stop (sends SIGINT, triggers cleanup)
kill -INT $(cat .crew/session.json | jq '.pid')

# Verify it stopped
crew status

# If needed, force kill (session file persists, crash recovery handles it)
kill -9 $(cat .crew/session.json | jq '.pid')
```

## Common Patterns

### Pattern: Run Next and Verify

The simplest execution loop — run one task and verify the result:

```bash
crew run next
crew verify
crew status
```

### Pattern: Full Auto with Monitoring

Let the loop run while watching progress:

```bash
# Terminal 1: Run
crew run full

# Terminal 2: Watch
tail -f .crew/progress.jsonl
```

### Pattern: Run Until Milestone

Execute up to a specific milestone boundary:

```bash
# Run everything in Epic 1
crew run --until m1.$(crew status --json | jq '.epics[0].tasks | length')

# Or target a specific task
crew run --until m2.1
```

### Pattern: Background Batch with Periodic Check

```bash
# Start in background
crew run full > .crew/run.log 2>&1 &

# Check periodically
crew status --minimal

# When done, verify everything
crew verify
```

### Pattern: Retry After Failure

When a task fails, diagnose and retry:

```bash
# See what failed
crew status

# Inspect the failure
crew task m1.3
ls .crew/epics/*/tasks/*/logs/  # Find task logs co-located with tasks

# Fix the issue, then retry
crew run m1.3

# Or let the status check handle it
crew run next
```

### Pattern: Skip and Continue

When a task is blocking but not critical:

```bash
# Mark it as done manually
crew task m1.3 edit --status done

# Continue execution
crew run next
```

### Pattern: Safe Cancellation and Context Switch

When you need to interrupt work and switch to something else:

```bash
# Press Ctrl+C during crew run
# → Task saved as cancelled, session persists

# Do other work...

# Come back and resume
crew run next
# → Auto-detects cancelled task, resets and continues
```
