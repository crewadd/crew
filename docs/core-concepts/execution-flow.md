# Execution Flow

**Step-by-step breakdown of how the orchestrator executes your project.**

[[docs](../README.md) > [core-concepts](./README.md) > execution-flow]

---

## Overview

Crew follows a deterministic reactive loop. Understanding this flow is critical for building effective plans.

```
┌────────────────────────────────────────────────────────┐
│ 1. LOAD                                                │
│    Read plan definition, materialize tasks             │
├────────────────────────────────────────────────────────┤
│ 2. EXECUTE LOOP                                        │
│    For each epic:                                      │
│      For each ready task:                              │
│        Execute agent → Get output                      │
│        Run checks → Verify output                      │
│        If failed: retry (up to maxAttempts)            │
│        If passed: mark done, move to next task         │
├────────────────────────────────────────────────────────┤
│ 3. CLEANUP                                             │
│    Final verification, report results                  │
└────────────────────────────────────────────────────────┘
```

---

## Phase 1: Load

### Step 1.1: Initialization

Crew starts by reading configuration and initializing state:

```typescript
// 1. Read crew.json
const config = loadConfig('crew.json');

// 2. Determine app directory
const appDir = process.cwd();

// 3. Create BuildContext
const ctx = {
  appDir,           // e.g., /Users/me/my-project
  planDir,          // e.g., /Users/me/my-project/.crew
};

// 4. Check for existing state
const progressLog = readProgressLog(`${appDir}/.crew/progress.jsonl`);
const hasExistingState = progressLog.length > 0;
```

**Outputs:**
- BuildContext ready
- Progress log loaded
- Session metadata available

### Step 1.2: Load or Materialize Plan

Crew either resumes an existing plan or materializes a new one:

```typescript
// If first run: materialize plan
if (!hasExistingState) {
  // Load .crew/setup/planning/index.ts
  const createPlanFn = await loadPlanFunction(
    `${appDir}/.crew/setup/planning/index.ts`
  );

  // Execute createPlan(ctx)
  const plan = await createPlanFn(ctx);

  // Materialize to .crew/epics/
  materializePlan(plan, ctx);

  // Write .crew/project.yaml
  writeProjectMetadata(ctx, plan.name);

  logEvent({ event: 'project:planned', epicCount: plan.epics.length });
}

// If resume: load existing plan from .crew/epics/
else {
  const plan = loadPlanFromDisk(ctx);
  logEvent({ event: 'project:resumed', epicCount: plan.epics.length });
}
```

**Materialization creates:**
```
.crew/epics/
├── 01-setup/
│   ├── epic.yaml
│   └── tasks/
│       ├── 01-init/
│       │   └── task.yaml
│       └── 02-deps/
│           └── task.yaml
├── 02-features/
│   ├── epic.yaml
│   └── tasks/
│       ├── 01-api/
│       │   └── task.yaml
│       └── 02-ui/
│           └── task.yaml
└── 03-testing/
    ├── epic.yaml
    └── tasks/
        └── 01-unit/
            └── task.yaml
```

### Step 1.3: Resume State

If resuming (task partially completed), load completion state:

```typescript
// Find last executed session
const lastSessionStart = findLast(progressLog, e => e.event === 'project:start');

// Tasks completed since last session start
const completedTasks = progressLog
  .filter(e => e.ts > lastSessionStart.ts)
  .filter(e => e.event === 'task:done')
  .map(e => e.taskId);

// Mark those tasks as "done" in memory
for (const taskId of completedTasks) {
  const task = findTaskById(plan, taskId);
  if (task) task.status = 'done';
}

logEvent({ event: 'project:start', iteration: lastSessionStart.iteration + 1 });
```

**Result:** In-memory plan reflects state from disk. Tasks that already completed are marked as done.

---

## Phase 2: Execute Loop

### Step 2.1: Constraint Resolution

Before each epic, Crew determines execution order and dependencies:

```typescript
// For each epic in sequence
for (const epic of plan.epics) {
  logEvent({ event: 'epic:start', epicId: epic.id, iteration });

  // Within the epic, compute task graph
  const taskGraph = buildTaskGraph(epic.tasks);

  // Resolve constraints:
  // - Task dependencies (deps)
  // - Conditional execution (when)
  // - Parallelism constraints
  const readyTasks = computeReadyTasks(taskGraph);

  // readyTasks = tasks with no pending dependencies
  // These can execute in parallel OR sequentially per config

  for (const task of readyTasks) {
    await executeTask(task);  // See Step 2.2
  }

  logEvent({ event: 'epic:done', epicId: epic.id, success: epic.allTasksDone });
}
```

### Step 2.2: Execute Task

The core execution step for a single task:

```typescript
async function executeTask(task) {
  // Skip if already done
  if (task.status === 'done') {
    console.log(`Skipping ${task.id} (already done)`);
    return;
  }

  // Check dependencies
  if (!task.depsResolved) {
    console.log(`Blocking ${task.id} (waiting for dependencies)`);
    return;  // Will retry next iteration
  }

  // Attempt loop: up to maxAttempts (default 3)
  for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
    console.log(`Executing ${task.id} (attempt ${attempt}/${task.maxAttempts})`);

    try {
      const result = await executeTaskAttempt(task, attempt);

      if (result.success) {
        task.status = 'done';
        logEvent({ event: 'task:done', taskId: task.id });
        break;  // Success, move to next task
      } else if (attempt < task.maxAttempts) {
        // Checks failed, will retry
        console.log(`Task failed, will retry (attempt ${attempt + 1})`);
        logEvent({
          event: 'task:retry',
          taskId: task.id,
          attempt: attempt + 1,
          error: result.error
        });
      } else {
        // Max attempts exceeded
        task.status = 'failed';
        logEvent({ event: 'task:failed', taskId: task.id, error: result.error });
        throw new Error(`Task ${task.id} failed after ${task.maxAttempts} attempts`);
      }
    } catch (err) {
      console.error(`Task execution error: ${err.message}`);
      throw err;
    }
  }
}
```

### Step 2.3: Execute Task Attempt

Execute one attempt of a task (the actual agent work + checks):

```typescript
async function executeTaskAttempt(task, attempt) {
  const taskDir = resolveTaskDir(task);
  const startNewAttempt(taskDir);  // Create events/NNN.jsonl

  // Phase 1: Pre-checks
  // (Verify preconditions before agent runs)
  for (const check of task.preChecks) {
    logEvent({ event: 'check:run', checkName: check.name });
    const result = await runCheck(check);
    if (!result.passed) {
      return { success: false, error: `Pre-check failed: ${check.name}` };
    }
    logEvent({ event: 'check:pass', checkName: check.name });
  }

  // Phase 2: Main execution
  // (Agent executes the task)
  logEvent({ event: 'task:start', taskId: task.id, attempt });

  const agentOutput = await executeAgent({
    task,
    prompt: task.prompt,
    inputs: task.inputs,
    skills: task.skills,
  });

  logEvent({ event: 'task:stream', chunk: agentOutput.raw });

  // Save output
  writeOutput(taskDir, agentOutput);

  // Phase 3: Post-checks
  // (Verify outputs meet requirements)
  const checkResults = [];
  for (const check of task.checks) {
    logEvent({ event: 'check:run', checkName: check.name });

    const result = await runCheck(check, {
      taskOutput: agentOutput,
      taskContext: { inputs: task.inputs, outputs: task.outputs },
    });

    checkResults.push(result);

    if (result.passed) {
      logEvent({ event: 'check:pass', checkName: check.name });
    } else {
      logEvent({
        event: 'check:fail',
        checkName: check.name,
        error: result.error,
      });

      // Stop at first failed check (fail-fast)
      return {
        success: false,
        error: `Check failed: ${check.name}`,
        details: result.error,
      };
    }
  }

  // All checks passed
  logEvent({ event: 'task:done', taskId: task.id, durationMs });

  return { success: true };
}
```

**Three-Phase Execution:**
1. **Pre-checks** — Verify preconditions (e.g., input files exist)
2. **Main** — Agent executes (e.g., create files)
3. **Post-checks** — Verify outputs (e.g., files created, compile succeeds)

### Step 2.4: Run Check

Execute a single check (command, named, or prompt):

```typescript
async function runCheck(check, context) {
  if (check.type === 'cmd') {
    // Command check: shell command
    const result = await exec(check.cmd, { cwd: check.cwd });
    return {
      passed: result.exitCode === 0,
      error: result.exitCode === 0 ? null : result.stderr,
    };
  }

  if (check.type === 'named') {
    // Named check: registry lookup
    const plugin = findCheckPlugin(check.name);
    return await plugin.run(context);
  }

  if (check.type === 'prompt') {
    // Prompt check: AI verification
    const response = await callAI({
      prompt: check.prompt,
      context: {
        taskOutput: context.taskOutput,
        files: context.files,
      },
    });

    const passed = response.toLowerCase().includes('pass') ||
                   response.toLowerCase().includes('verified') ||
                   response.toLowerCase().includes('correct');

    return {
      passed,
      error: passed ? null : response,
    };
  }
}
```

### Retry With Feedback

When a check fails, the agent is retried with explicit feedback:

```typescript
// On retry, prepend feedback to the original prompt:

const retryPrompt = `
[PREVIOUS ATTEMPT FAILED]

Original Task: ${task.title}
Original Instructions: ${task.prompt}

[FEEDBACK FROM QUALITY GATE]

Check: ${failedCheck.name}
Error: ${failedCheck.error}

Please fix the issue and try again:
${failedCheck.suggestedFix || ''}

Your previous output:
${previousAttemptOutput}
`;

const newResult = await executeAgent({
  ...task,
  prompt: retryPrompt,
});
```

This enables the agent to understand what went wrong and correct it.

---

## Phase 3: Post-Execution

### Step 3.1: Finalization

After all tasks complete:

```typescript
// All epics done (or failed)
if (allEpicsSucceeded) {
  logEvent({ event: 'project:done', success: true, iterations });
} else {
  logEvent({ event: 'project:done', success: false, iterations });
  throw new Error('Project execution failed');
}
```

### Step 3.2: Verification

Optionally run quality gates across the entire project:

```bash
crew verify
```

This runs project-level checks (not just task-level):

```typescript
// Run verification checks
const report = await verify(ctx, { only: ['tsc', 'build'] });

if (report.passed) {
  logEvent({ event: 'project:verified', passed: true });
} else {
  logEvent({
    event: 'project:verified',
    passed: false,
    issues: report.issues,
  });
}
```

---

## Practical Example

### Input: Plan Definition

```typescript
// .crew/setup/planning/index.ts
export async function createPlan(ctx) {
  const plan = ctx.createPlan('String Utils');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('init', 'Initialize')
          .prompt('Create package.json and tsconfig.json')
          .check({ cmd: 'test -f package.json' })
          .check({ cmd: 'test -f tsconfig.json' })
      )
      .addTask(
        ctx.createTask('deps', 'Install deps')
          .deps(['init'])
          .prompt('Run npm install')
          .check({ cmd: 'test -d node_modules' })
      )
  );

  return plan.build();
}
```

### Execution Trace

**Session 1:**
```
$ crew run

1. LOAD
   ✓ Reading crew.json
   ✓ Materializing plan → .crew/epics/01-setup/
   ✓ Creating task.yaml files

2. EXECUTE
   ✓ Epic 1: Setup
     Task 1.1: init (attempt 1)
       - Agent: Creating package.json and tsconfig.json
       - Output: package.json, tsconfig.json created
       - Check: test -f package.json → PASS
       - Check: test -f tsconfig.json → PASS
       - Status: done ✓
     Task 1.2: deps
       - Waiting for 1.1 (done)
       - Agent: Running npm install
       - Output: node_modules/ created
       - Check: test -d node_modules → PASS
       - Status: done ✓

3. COMPLETE
   ✓ Project complete (success=true)
```

**Session 2 (if resumed after crash during Task 1.2):**
```
$ crew run

1. LOAD
   ✓ Reading .crew/epics/
   ✓ Resume: Task 1.1 already done, skip
   ✓ Resume: Task 1.2 active, restart

2. EXECUTE
   Task 1.1: init → SKIP (already done)
   Task 1.2: deps (attempt 2)
     - Agent: Running npm install
     - Output: node_modules/ created
     - Check: test -d node_modules → PASS
     - Status: done ✓

3. COMPLETE
   ✓ Project complete (success=true)
```

---

## Event Timeline

Here's what the progress journal looks like:

```jsonl
{"ts":"2025-03-15T10:00:00Z","event":"project:start","iteration":1}
{"ts":"2025-03-15T10:00:01Z","event":"project:planned","epicCount":1}
{"ts":"2025-03-15T10:00:02Z","event":"epic:start","epicId":1,"title":"Setup"}
{"ts":"2025-03-15T10:00:03Z","event":"task:start","taskId":"m1.1"}
{"ts":"2025-03-15T10:00:05Z","event":"check:run","checkName":"file-exists-package"}
{"ts":"2025-03-15T10:00:06Z","event":"check:pass","checkName":"file-exists-package"}
{"ts":"2025-03-15T10:00:06Z","event":"check:run","checkName":"file-exists-tsconfig"}
{"ts":"2025-03-15T10:00:07Z","event":"check:pass","checkName":"file-exists-tsconfig"}
{"ts":"2025-03-15T10:00:07Z","event":"task:done","taskId":"m1.1"}
{"ts":"2025-03-15T10:00:08Z","event":"task:start","taskId":"m1.2"}
{"ts":"2025-03-15T10:00:10Z","event":"check:run","checkName":"node-modules-exist"}
{"ts":"2025-03-15T10:00:11Z","event":"check:pass","checkName":"node-modules-exist"}
{"ts":"2025-03-15T10:00:11Z","event":"task:done","taskId":"m1.2"}
{"ts":"2025-03-15T10:00:12Z","event":"epic:done","epicId":1,"success":true}
{"ts":"2025-03-15T10:00:13Z","event":"project:done","success":true}
```

---

## Task State Transitions

A task transitions through states as execution progresses:

```
pending
  ↓
active (when execution starts)
  ↓
{ done (all checks passed)
{ blocked (waiting for deps)
{ failed (exceeded max attempts)
{ cancelled (manually stopped)
```

**State file tracking:**
```bash
# Check current state
cat .crew/epics/01-setup/tasks/01-init/status
# Output: done
```

---

## Constraint Resolution

### Dependency Resolution

Before executing a task, Crew checks if dependencies are satisfied:

```typescript
function areDepsSatisfied(task) {
  if (!task.deps) return true;

  return task.deps.every(depTaskId => {
    const depTask = findTask(depTaskId);
    return depTask.status === 'done';
  });
}
```

### Conditional Execution

If a task has a `.when()` condition, it's evaluated:

```typescript
if (task.when) {
  const shouldRun = typeof task.when === 'function'
    ? await task.when(context.vars)
    : evaluateCondition(task.when, context.vars);

  if (!shouldRun) {
    task.status = 'cancelled';
    logEvent({ event: 'task:cancelled', taskId: task.id });
    return;
  }
}
```

### Parallelism

By default, tasks within an epic that have no dependencies can run in parallel:

```typescript
// Parallel if no deps between them
const batch1 = [task1, task2, task3];  // All have no deps
await Promise.all(batch1.map(executeTask));

// Sequential if deps
const batch2 = [task4];  // Depends on batch1
await executeTask(task4);
```

---

## See Also

- [Projects, Epics & Tasks](./projects-epics-tasks.md) — The structure being executed
- [Checks & Quality Gates](./checks-and-quality-gates.md) — How checks work in detail
- [Sessions & Resumability](./sessions-and-resumability.md) — How state persists across sessions
- [Filesystem Store](./filesystem-store.md) — Where all execution state lives
