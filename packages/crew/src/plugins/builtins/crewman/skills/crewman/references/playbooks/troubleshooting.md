# Troubleshooting Playbook

This playbook covers diagnosing and fixing task failures, build errors, blocked tasks, and project-level issues within the crew framework.

## Table of Contents

- [Troubleshooting Workflow](#troubleshooting-workflow)
- [Gathering Context](#gathering-context)
- [Failure Classification](#failure-classification)
- [Diagnosis Techniques](#diagnosis-techniques)
- [Fix Strategies](#fix-strategies)
- [Auto-Triage](#auto-triage)
- [Crash Recovery](#crash-recovery)
- [Deadlock Detection](#deadlock-detection)
- [Common Failure Patterns](#common-failure-patterns)
- [Post-Fix Verification](#post-fix-verification)

---

## Troubleshooting Workflow

The golden rule: **diagnose before fixing**. Guessing at fixes wastes time and can make things worse.

```
Gather context → Classify failure → Diagnose root cause → Apply minimal fix → Verify → Update status
```

1. **Gather context** — Collect error messages, logs, git state, and project status
2. **Classify** — Determine the failure category (code, config, infra, dependency)
3. **Diagnose** — Trace the root cause using logs and file inspection
4. **Fix** — Apply the smallest change that resolves the issue
5. **Verify** — Run the failing check or `crew verify` to confirm
6. **Update** — Mark the task as done or reset for retry

## Gathering Context

Run these commands to build a picture of what went wrong:

### Project State

```bash
crew status              # Overview — which tasks failed/blocked
crew status --json       # Machine-readable for detailed inspection
crew tree                # Visual structure — spot orphaned branches
```

### Task Details

```bash
crew task m1.3           # View specific task: status, attempts, error
crew task m1.3 show      # Full detail including prompt and deps
```

### Execution Logs

Task execution logs are co-located with each task:

```
.crew/epics/<epic-slug>/tasks/<task-slug>/logs/<timestamp>-attempt-<N>.log
```

Read the log for the failed task — it usually contains the error message and stack trace.

```bash
crew task m1.3           # Shows task location and log paths
```

### Git State

```bash
git status               # Uncommitted changes that might conflict
git diff                 # What changed since last commit
git log --oneline -5     # Recent commits for context
```

### Progress Log

The append-only progress log tracks every state transition:

```
.crew/progress.jsonl     # One JSON entry per state change
```

Read the last few entries to see what happened before the failure:

```bash
tail -20 .crew/progress.jsonl
```

## Failure Classification

After gathering context, classify the failure. This determines the fix strategy.

### Code Bug

**Symptoms**: TypeScript errors, runtime exceptions, assertion failures, wrong output

**Examples**:
- Missing import: `Cannot find module './utils'`
- Type error: `Type 'string' is not assignable to type 'number'`
- Logic error: Output exists but content is wrong
- Null reference: `Cannot read property 'x' of undefined`

**Fix approach**: Read the error, find the source file, apply a targeted code fix.

### Config Issue

**Symptoms**: Path not found, environment variable missing, wrong option value

**Examples**:
- `ENOENT: no such file or directory 'src/config.ts'`
- `Error: Missing required environment variable DATABASE_URL`
- Build tool misconfiguration (wrong entry point, missing plugin)

**Fix approach**: Check paths, env vars, and config files. Often a typo or missing file.

### Infrastructure

**Symptoms**: Network timeouts, permission denied, service unavailable

**Examples**:
- `ECONNREFUSED` — service isn't running
- `EACCES: permission denied` — file permission issue
- `ETIMEDOUT` — network or DNS issue
- Docker container not running

**Fix approach**: Check services, permissions, network. Usually outside the code itself.

### Dependency Issue

**Symptoms**: Module not found, version conflicts, peer dependency warnings

**Examples**:
- `Module not found: Can't resolve 'react'` — not installed
- `Peer dependency conflict` — version mismatch
- Lockfile out of sync with package.json

**Fix approach**: `npm install`, check version constraints, update lockfile.

## Diagnosis Techniques

### Reading Stack Traces

Start from the bottom of the stack trace — that's usually your code. Work upward through framework code to understand the call path.

Look for:
- The **file and line number** where the error originated
- The **function name** for context on what was being attempted
- Any **"caused by"** chains that point to deeper issues

### Comparing Attempts

Tasks track their attempts in `task.json`:

```json
{
  "attempts": [
    {
      "number": 1,
      "started_at": "2026-03-07T10:00:00Z",
      "finished_at": "2026-03-07T10:01:30Z",
      "duration_ms": 90000,
      "success": false,
      "agent": "agent_xxx"
    }
  ]
}
```

If a task has multiple failed attempts, compare the logs between attempts — is it the same error or different ones? Same error = the fix from the previous attempt didn't work. Different error = progress was made but a new issue appeared.

### Dependency Chain Analysis

When a task is blocked, trace its dependency chain:

```bash
crew task m1.5           # Check deps field
crew task m1.3           # Check the dep's status
crew task m1.1           # Keep tracing back
```

The root cause is usually the first failed task in the chain, not the blocked one.

### Diff-Based Diagnosis

When a task was working before and now isn't:

```bash
git log --oneline -10    # What changed recently?
git diff HEAD~3          # Compare against known-good state
```

Look at which files changed and whether those changes could affect the failing task.

## Fix Strategies

### Minimal Fix

The default approach — change as little as possible to resolve the issue:

1. Identify the exact file and line causing the error
2. Make the smallest change that fixes it
3. Don't refactor, don't improve, don't clean up nearby code
4. Run the failing check to verify

This is the right approach 90% of the time. Larger changes introduce risk and make it harder to verify the fix.

### Retry

For transient failures (network timeouts, flaky tests, race conditions):

```bash
crew run m1.3            # Simply re-run the failed task
```

The task's attempt counter increments automatically. If it fails again with the same error, it's not transient — move to a different fix strategy.

### Rollback

When a fix attempt made things worse:

```bash
git diff                 # See what was changed
git checkout -- <file>   # Revert specific files
```

Then try a different fix approach.

### Fix Task Creation

For complex failures that need a dedicated fix effort:

```bash
crew task add --epic M1 --title "Fix: Build failure in auth module" --after m1.3
```

Or programmatically via the planner's `createFixTasks()` method, which generates targeted fix tasks from a verification report.

### Escalation

When you can't diagnose or fix the issue:

1. Document what you've tried and what the symptoms are
2. Check if there's a relevant goal in `.crew/goals/` that's affected
3. Update the goal status to `blocked` with the reason
4. Flag for human review with full context

## Auto-Triage

The crewman plugin includes automatic triage on task failure. When a task fails:

1. The `onTaskFail` hook fires
2. An agent classifies the failure (code, config, infra, dependency)
3. A fix approach is suggested
4. If the failure is retryable, the task may auto-retry (up to `maxRetries`)

### Configuring Auto-Triage

In `crew.json`:

```json
{
  "plugins": [
    ["crewman", {
      "autoTriage": true,
      "troubleshootOnFail": true,
      "maxRetries": 2
    }]
  ]
}
```

### Triage Output

The triage agent produces a classification:

```
Classification: Code Bug
Error: Missing import for 'validateInput' in src/api/handler.ts
Suggested fix: Add import statement at line 3
Commands:
  1. Edit src/api/handler.ts to add the missing import
  2. Run `crew verify` to confirm the fix
```

## Crash Recovery

The crew framework is designed for crash-safe resume via the append-only progress log.

### How It Works

Every state transition is appended to `.crew/progress.jsonl` before the corresponding file write. On restart, the system replays the log to reconstruct consistent state.

### Recovery Steps

If the system crashed mid-execution:

1. **Check progress log**: `tail -5 .crew/progress.jsonl`
2. **Check task state**: The last entry shows what was in progress
3. **Run status check**: `crew status` detects inconsistencies
4. **Resume**: `crew run` picks up where it left off

### Inconsistent State

If `task.json` and `progress.jsonl` disagree:

- The progress log is the source of truth
- `crew sync` regenerates derived views from the log
- Running `crew status` triggers automatic consistency checks

## Deadlock Detection

The `crew run` command includes deadlock detection. A deadlock occurs when:

- All remaining tasks are `blocked`
- No task has all its dependencies satisfied
- This creates a circular wait

### Symptoms

```
[crew] Deadlock detected: 3 tasks blocked, none can proceed
```

### Resolution

1. Identify the dependency cycle: `crew status --json` shows deps for each task
2. Break the cycle by removing or relaxing one dependency:
   ```bash
   crew task m1.4 edit --deps "m1.2"   # Remove the circular dep
   ```
3. Or cancel a blocking task:
   ```bash
   crew task m1.3 edit --status cancelled
   ```

## Common Failure Patterns

### Pattern: "Works Locally, Fails in Task"

**Cause**: The task runs in a different working directory or environment than expected.

**Fix**: Check that file paths in the task prompt are relative to the project root (`ctx.buildCtx.appDir`), not the current directory.

### Pattern: "Task Succeeds but Check Fails"

**Cause**: The task produced output, but the output doesn't meet the check criteria.

**Fix**: Read the check output carefully. Common issues:
- TypeScript strict mode catches more than expected
- Build optimizations remove "unused" code that's actually needed
- Output files exist but are empty or malformed

### Pattern: "First Task Succeeds, Dependencies Fail"

**Cause**: The first task's output doesn't match what downstream tasks expect.

**Fix**: Check the `inputs`/`outputs` declarations. The first task's `outputs` should match the dependent task's `inputs`. If the file paths don't align, update the declarations.

### Pattern: "Task Stuck in Active State"

**Cause**: The executor crashed without updating the task status.

**Fix**:
1. Check the task's `logs/` directory for execution logs
2. Check `progress.jsonl` for the last state transition
3. Manually reset: `crew task m1.3 edit --status pending`
4. Re-run: `crew run m1.3`

### Pattern: "Verification Passes but Output is Wrong"

**Cause**: Checks are too loose — they verify structure but not correctness.

**Fix**: Add more specific checks or review gates. Consider adding custom checks via the plugin API that validate content, not just existence.

## Post-Fix Verification

After applying a fix, always verify:

1. **Run the specific check that failed**:
   ```bash
   crew verify              # Run all checks
   ```

2. **Re-run the failed task** (if the fix was to the task itself):
   ```bash
   crew run m1.3
   ```

3. **Check downstream tasks** — make sure the fix didn't break anything that was previously working:
   ```bash
   crew status              # Look for newly failed/blocked tasks
   ```

4. **Update task status** if manually fixed:
   ```bash
   crew task m1.3 edit --status done
   ```

5. **Update goals** if the failure affected a goal:
   ```bash
   # Read the goal, update status from 'blocked' back to 'active'
   ```
