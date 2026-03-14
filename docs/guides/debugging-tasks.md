# Debugging Failed and Stuck Tasks

**Learn techniques to inspect, diagnose, and fix task failures in Crew projects.**

[[docs](../README.md) > [guides](./README.md) > debugging-tasks]

---

## Overview

When tasks fail or get stuck, Crew provides multiple debugging strategies:

1. **Inspect state files** - Crew's filesystem-first design means everything is visible
2. **Check execution logs** - `progress.jsonl` contains full execution history
3. **Use CLI diagnostics** - Commands to view task status and logs
4. **Enable verbose logging** - Debug output from agents and tools
5. **Review checks** - Identify which quality gates failed

**Key principle**: The `.crew/` directory is your debugger. Use `ls`, `cat`, and `grep` freely.

---

## Filesystem Structure for Debugging

Every task creates files you can inspect:

```
.crew/
├── state.json                    # Current execution state
├── progress.jsonl                # Append-only execution journal
├── epics/
│   └── 01-setup/
│       ├── epic.yaml             # Epic metadata
│       ├── plan.md               # Epic description
│       └── tasks/
│           └── 01-install/
│               ├── task.yaml      # Task definition
│               ├── task.md        # Task prompt (what agent sees)
│               ├── context.txt    # Execution context
│               ├── attempts/
│               │   ├── 01/
│               │   │   ├── stdout  # Agent output (attempt 1)
│               │   │   └── stderr  # Errors (attempt 1)
│               │   ├── 02/
│               │   │   ├── stdout
│               │   │   └── stderr
│               │   └── 03/
│               │       └── checks.log  # Check failures
│               └── harness.js     # AI-synthesized validation (if used)
```

---

## Reading State Files

### Current State (`state.json`)

View the current execution state:

```bash
cat .crew/state.json | jq .
```

Output shows:

```json
{
  "project": "My App",
  "status": "active",
  "currentEpic": 1,
  "currentTask": "m1.3",
  "tasksCompleted": 2,
  "tasksFailed": 0,
  "lastUpdated": "2025-03-15T12:30:45Z"
}
```

**Key fields:**
- `status` - "pending" | "active" | "done" | "failed"
- `currentTask` - Task executing or stuck
- `tasksFailed` - Number of failed tasks

### Progress Journal (`progress.jsonl`)

The most useful debugging file. Each line is a JSON event:

```bash
cat .crew/progress.jsonl | jq .
```

Each event includes:

```json
{
  "timestamp": "2025-03-15T12:30:45Z",
  "event": "task:start",
  "taskId": "m1.3",
  "epicNum": 1,
  "taskTitle": "Install dependencies",
  "attempt": 1
}
```

**Common events:**
- `task:start` - Task execution began
- `task:check:run` - Running a quality gate
- `task:check:pass` - Check succeeded
- `task:check:fail` - Check failed with error
- `task:feedback` - Agent retry with error context
- `task:done` - Task completed
- `task:failed` - Task failed after max attempts

**Filter by task:**

```bash
cat .crew/progress.jsonl | jq 'select(.taskId == "m1.3")'
```

**Filter by event type:**

```bash
cat .crew/progress.jsonl | jq 'select(.event == "task:check:fail")'
```

---

## Inspecting Task Execution

### View Task Definition

```bash
cat .crew/epics/01-setup/tasks/01-install/task.yaml
```

Output:

```yaml
title: Install dependencies
type: setup
prompt: |
  Run npm install and verify all dependencies resolve.
  Check for peer dependency warnings.
deps: []
checks:
  - type: cmd
    cmd: test -d node_modules
  - type: cmd
    cmd: npm list
maxAttempts: 3
```

### View Task Prompt (What Agent Sees)

```bash
cat .crew/epics/01-setup/tasks/01-install/task.md
```

This is exactly what the agent received as instructions.

### View Execution Attempts

Each attempt is logged separately:

```bash
ls -la .crew/epics/01-setup/tasks/01-install/attempts/
```

Output:

```
01/
  stdout     # Agent output from attempt 1
  stderr     # Errors from attempt 1
02/
  stdout     # Agent output from attempt 2 (with check feedback)
  stderr
03/
  checks.log # Check results from attempt 3
```

**Read attempt output:**

```bash
cat .crew/epics/01-setup/tasks/01-install/attempts/01/stdout
```

**Read check failures:**

```bash
cat .crew/epics/01-setup/tasks/01-install/attempts/03/checks.log
```

---

## CLI Debugging Commands

### View Task Status

```bash
npx crew status
```

Output:

```
Project: My App
Status: active

Epic 1: Project Setup (2/3 complete)
  ✓ m1.1 Initialize project
  ✓ m1.2 Install dependencies
  ⏳ m1.3 TypeScript check (attempt 2 of 3)

Epic 2: Core Features (0/2 complete)
  ⏹️  m2.1 Build API (blocked by m1.3)
  ⏹️  m2.2 Build UI
```

### View Full Task Logs

```bash
npx crew status --verbose
```

Includes:
- Full task prompts
- Check definitions
- Last error messages
- Attempt history

### Search Tasks

```bash
npx crew search "install"
```

Finds all tasks matching the keyword with their status.

### Show Execution Tree

```bash
npx crew tree
```

Displays the full project structure:

```
My App
├── 01-setup
│   ├── 01-install (✓ done)
│   ├── 02-config (✓ done)
│   └── 03-build (⏳ active)
├── 02-features
│   └── 01-auth (⏹️  blocked)
└── 03-testing
    └── 01-unit-tests (⏹️  pending)
```

---

## Common Failure Patterns

### Pattern 1: Check Failure → Retry

When a check fails, the agent gets feedback and retries:

```
task:start                  # First attempt begins
task:check:run "npm test"   # Running check
task:check:fail             # Check failed
task:feedback               # Agent receives error context
task:start (attempt 2)      # Agent retries with feedback
task:check:pass             # Success on retry
task:done
```

**Debug:**
1. Read first attempt stdout: `cat attempts/01/stdout`
2. Read check failure: `cat attempts/01/checks.log`
3. Read second attempt stdout: `cat attempts/02/stdout`

### Pattern 2: Max Retries Exceeded

Task fails after N attempts:

```
task:start (attempt 1)
task:check:fail
task:start (attempt 2)
task:check:fail
task:start (attempt 3)
task:check:fail
task:failed  # Gave up
```

**Debug:** Read final check log to see what never passed.

### Pattern 3: Blocked Task

Task waits for dependency:

```
task:start (m1.1)
task:done

task:start (m1.2)  # Waits for m1.1
task:done

task:pending (m1.3: blocked)  # Waits for m1.2 and m1.3
```

**Debug:** Check `deps` in task.yaml.

---

## Example Debugging Session

Task `m1.2` is stuck on attempt 3. Let's diagnose:

```bash
# 1. Check current status
npx crew status

# 2. View what the task is supposed to do
cat .crew/epics/01-setup/tasks/02-config/task.yaml

# 3. Read the task prompt agent received
cat .crew/epics/01-setup/tasks/02-config/task.md

# 4. Review all attempts
ls -la .crew/epics/01-setup/tasks/02-config/attempts/

# 5. Compare attempts
diff -u \
  .crew/epics/01-setup/tasks/02-config/attempts/01/stdout \
  .crew/epics/01-setup/tasks/02-config/attempts/02/stdout

# 6. Read why it keeps failing
cat .crew/epics/01-setup/tasks/02-config/attempts/03/checks.log

# 7. Check the check definitions
grep -A5 "checks:" .crew/epics/01-setup/tasks/02-config/task.yaml

# 8. Run the check manually in your shell
test -f .config/app.json && echo "exists" || echo "missing"

# 9. View progress events for this task
cat .crew/progress.jsonl | jq 'select(.taskId == "m1.2")'
```

---

## Enabling Verbose Logging

### Environment Variables

```bash
# Enable debug output
export CREW_DEBUG=true
npx crew run

# Log all network requests
export CREW_TRACE=true
npx crew run

# Log filesystem operations
export CREW_FS_DEBUG=true
npx crew run
```

### Verbose CLI Flags

```bash
# Run with verbose output
npx crew run --verbose

# Show all system calls
npx crew run --trace

# Show execution plan without running
npx crew run --dry-run
```

---

## Fixing Stuck Tasks

### Approach 1: Update Task Prompt

If the agent isn't understanding the task, update the prompt:

```bash
# Edit the task prompt
nano .crew/epics/01-setup/tasks/02-config/task.md

# Reinitialize to apply changes
npx crew plan init

# Retry
npx crew run
```

### Approach 2: Modify Checks

If checks are too strict, loosen them:

```bash
# Edit task.yaml
nano .crew/epics/01-setup/tasks/02-config/task.yaml

# Modify the checks:
checks:
  - cmd: test -f .config/app.json
  # More specific failure message
  - cmd: grep -q "version" .config/app.json || true
```

### Approach 3: Skip and Continue

If a task is unrecoverable, skip it:

```bash
# Mark task as done
npx crew task mark m1.2 --done

# Continue execution
npx crew run
```

### Approach 4: Reset and Retry

Start the task fresh:

```bash
# Reset task state
rm -rf .crew/epics/01-setup/tasks/02-config/attempts

# Clear from progress log
# (backup first!)
cp .crew/progress.jsonl .crew/progress.jsonl.backup

# Retry
npx crew run
```

---

## Debugging Quality Gates

### Understand Check Failures

When a check fails, Crew captures:

1. **Check type** - `cmd`, `prompt`, `inline`
2. **Expected output** - What success looks like
3. **Actual output** - What the check produced
4. **Error message** - Human-readable explanation

```bash
# View check failure details
cat .crew/epics/01-setup/tasks/02-config/attempts/03/checks.log
```

Example output:

```
Check 1/2: FAIL
  Type: cmd
  Command: npm run build
  Error: exit code 1
  Output:
    error: Cannot find module '@config/types'
    at buildStep in src/index.ts:5:1

Check 2/2: PENDING
  (Skipped because check 1 failed)

Summary: 1 failed, 1 pending
Feedback: Missing module import. Check node_modules and tsconfig.
```

### Test Checks Manually

Before a task runs, validate the checks:

```bash
# Run a check command manually
npm run build

# Run a prompt check manually
npx crew check --prompt "Verify the build succeeded"

# Run an inline check
node -e "console.log(require('./dist/index.js').version)"
```

---

## Common Debugging Patterns

### Pattern: "Module Not Found"

```
Error: Cannot find module 'package-name'
```

**Solutions:**
1. Check `node_modules` exists: `ls -la node_modules`
2. Install missing: `npm install`
3. Update task to run `npm install` first
4. Check `package.json` has the dependency

### Pattern: "File Not Found"

```
Error: ENOENT: no such file or directory
```

**Solutions:**
1. Check file exists: `ls -la path/to/file`
2. Check path is absolute, not relative
3. Check working directory: `pwd`
4. Create the file in earlier task

### Pattern: "Permission Denied"

```
Error: EACCES: permission denied
```

**Solutions:**
1. Check file permissions: `ls -la path/to/file`
2. Fix permissions: `chmod +x script.sh`
3. Run with `sudo` if needed

### Pattern: "Timeout"

Task runs too long and times out.

**Solutions:**
1. Increase timeout: `.attempts(10)` and longer individual timeout
2. Break into smaller tasks
3. Add progress logging to see what agent is doing
4. Check for infinite loops in check commands

---

## Instrumentation Points

### Add Logging to Tasks

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('install', 'Install')
          .prompt('Install dependencies')
          .onStart(async (taskCtx) => {
            taskCtx.log.info('Starting installation...');
          })
          .onComplete(async (taskCtx, result) => {
            taskCtx.log.info(`Installation took ${result.durationMs}ms`);
          })
          .onFail(async (taskCtx, error) => {
            taskCtx.log.error(`Installation failed: ${error.message}`);
          })
          .check({ cmd: 'test -d node_modules' })
      )
  );

  return plan.build();
}
```

### Use Task Context Tools

```typescript
.onStart(async (taskCtx) => {
  // Log messages
  taskCtx.log.info('Starting task');
  taskCtx.log.debug('Debug info');
  taskCtx.log.warn('Warning');
  taskCtx.log.error('Error');

  // Access task state
  const previousValue = taskCtx.state.get('key');
  taskCtx.state.set('key', newValue);

  // Access build context
  const appDir = taskCtx.buildCtx.appDir;

  // Use tools
  const files = await taskCtx.tools.file.glob('src/**/*.ts');
})
```

---

## Health Checks

### Verify Project Integrity

```bash
# Check project structure
ls -la .crew/

# Verify state file is valid JSON
jq empty .crew/state.json && echo "OK" || echo "INVALID"

# Check progress log has valid events
jq . .crew/progress.jsonl | wc -l

# Count completed tasks
cat .crew/progress.jsonl | jq 'select(.event == "task:done")' | wc -l
```

### Smoke Test

Run a simple validation task:

```bash
npx crew run --only m1.1
```

If even simple tasks fail, the framework might have issues.

---

## Next Steps

Once you've debugged and fixed issues:

1. **Update your plan** - Fix root causes in `.crew/setup/planning/index.ts`
2. **Document findings** - Add comments to task prompts explaining gotchas
3. **Add more checks** - Prevent the same issue recurring
4. **Test locally** - Run `crew run` multiple times to verify stability

---

## See Also

- [Execution Flow](../core-concepts/execution-flow.md) - How tasks execute
- [Checks & Quality Gates](../core-concepts/checks-and-quality-gates.md) - Understanding checks
- [CLI Commands](../cli/commands.md) - All CLI debugging commands
- [Troubleshooting](../troubleshooting/common-errors.md) - Common errors and solutions

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
