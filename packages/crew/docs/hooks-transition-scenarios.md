# Task Transition Scenarios

## Understanding Task Transitions

Task transitions occur in **two main execution contexts**, and the hook system handles both correctly:

## 1. Manual/CLI Transitions

When you explicitly run a specific task:

```bash
crew run m1.1    # Run first task
crew run m1.2    # Run second task (manual transition)
crew run next    # Run next pending task
```

**Flow:**
```
CLI Command
  → runTask()
    → executeBatchStreaming([single task])
      → executeOneTask(task)
        → executeTaskWithHooks(task)
          → beforeSwitchTask ✅ (prev: m1.1, next: m1.2)
          → beforeTask
          → [Task executes]
          → afterTask
          → afterSwitchTask ✅
```

**Characteristics:**
- User controls which task runs next
- One task at a time
- User can skip tasks or jump around
- Each execution loads previous task from store

## 2. Automatic/Batch Transitions (Auto-mode)

When the system automatically runs tasks in sequence until completion or error:

```bash
crew epic m1    # Run entire epic
crew continue        # Continue from where you left off
# Or orchestrator running multiple tasks
```

**Flow:**
```
Orchestrator
  → EpicOrchestrator.run()
    → executeTasks([task1, task2, task3])
      → executeBatchStreaming([task1, task2, task3])

        → executeOneTask(task1)
          → executeTaskWithHooks(task1)
            → beforeSwitchTask ✅ (prev: null, next: task1)
            → [Execute]
            → afterSwitchTask ✅

        → executeOneTask(task2)
          → executeTaskWithHooks(task2)
            → beforeSwitchTask ✅ (prev: task1, next: task2)
            → [Execute]
            → afterSwitchTask ✅

        → executeOneTask(task3)
          → executeTaskWithHooks(task3)
            → beforeSwitchTask ✅ (prev: task2, next: task3)
            → [Execute]
            → afterSwitchTask ✅
```

**Characteristics:**
- System controls execution order
- Multiple tasks run sequentially
- Stops on error or blocked condition
- Each task loads previous task from store

## Implementation Details

### How Previous Task is Determined

The transition hooks use the **store** to determine the previous task:

```javascript
// In executeTaskWithHooks()
const store = new HierarchicalStore(buildCtx.appDir);
const allTasks = store.listAllTasks();

// Find most recently completed task (highest finished_at timestamp)
const prevTask = allTasks
  .filter(t => (t.status === 'done' || t.status === 'failed'))
  .sort((a, b) => {
    const aTime = a.attempts?.[a.attempts.length - 1]?.finished_at || '0';
    const bTime = b.attempts?.[b.attempts.length - 1]?.finished_at || '0';
    return bTime.localeCompare(aTime);  // Most recent first
  })[0] || null;
```

**This means:**
- ✅ Works in both manual and auto modes
- ✅ Previous task determined by completion timestamp, not execution order
- ✅ Handles task skipping (manual mode)
- ✅ Handles retry scenarios
- ✅ First task gets `prevTask: null`

## Hook Behavior in Each Mode

### Manual Mode Example

```bash
# Terminal 1
$ crew run m1.1
# → beforeSwitchTask: prevTask=null, nextTask=m1.1

$ crew run m1.2
# → beforeSwitchTask: prevTask=m1.1, nextTask=m1.2

# User skips m1.3, jumps to m1.4
$ crew run m1.4
# → beforeSwitchTask: prevTask=m1.2, nextTask=m1.4
# ✅ m1.3 was skipped, but hook still works
```

### Auto Mode Example

```bash
$ crew epic m1
# System runs m1.1, m1.2, m1.3, m1.4 automatically

# Task 1
# → beforeSwitchTask: prevTask=null, nextTask=m1.1

# Task 2 (immediately after task 1 completes)
# → beforeSwitchTask: prevTask=m1.1, nextTask=m1.2

# Task 3
# → beforeSwitchTask: prevTask=m1.2, nextTask=m1.3

# Task 4
# → beforeSwitchTask: prevTask=m1.3, nextTask=m1.4
```

### Retry Scenario

```bash
# Task fails, user retries
$ crew run m1.2
# → beforeSwitchTask: prevTask=m1.1, nextTask=m1.2
# [Task fails]

$ crew run m1.2  # Retry
# → beforeSwitchTask: prevTask=m1.1, nextTask=m1.2
# ✅ Previous task still m1.1 (most recent successful completion)
```

## Common Use Cases by Mode

### Manual Mode Hooks

Best for:
- **Interactive development**: User is running tasks one by one
- **Manual validation**: Check prerequisites before allowing next task
- **Progress tracking**: Save user's position in the workflow

```javascript
async beforeSwitchTask(ctx) {
  // Validate before allowing user to proceed
  if (ctx.nextTask.displayId === 'm2.1' && ctx.prevTask?.epic.number !== 2) {
    throw new Error('Complete all M1 tasks before starting M2');
  }

  // Save progress for manual workflow
  await ctx.tools.file.write('.crew/last-task.txt', ctx.nextTask.displayId);
}
```

### Auto Mode Hooks

Best for:
- **Continuous validation**: Ensure each task builds on previous work
- **Pipeline automation**: Run quality checks between tasks
- **State management**: Persist intermediate results

```javascript
async beforeSwitchTask(ctx) {
  // Ensure pipeline continuity
  if (ctx.prevTask?.status === 'done') {
    const outputExists = await ctx.tools.file.exists(
      ctx.prevTask.result?.outputFile || 'output.json'
    );
    if (!outputExists) {
      throw new Error('Previous task output missing - pipeline broken');
    }
  }
}

async afterSwitchTask(ctx) {
  // Log pipeline progress
  ctx.log.info('Pipeline progress', {
    completed: ctx.prevTask?.displayId,
    current: ctx.nextTask.displayId,
    timestamp: new Date().toISOString()
  });
}
```

## Epic Boundaries

Epic transitions work the same in both modes:

```javascript
async beforeSwitchEpic(ctx) {
  // This runs when transitioning M1 → M2
  // Regardless of whether user ran "crew run m2.1" manually
  // or the orchestrator advanced automatically

  ctx.log.info(`Epic ${ctx.prevEpic?.number} → ${ctx.nextEpic.number}`);

  // Validate before allowing epic progression
  const build = await ctx.tools.verify.build();
  if (!build.passed) {
    throw new Error('Build must pass before advancing to next epic');
  }
}
```

## Blocking Behavior

### Manual Mode
```bash
$ crew run m1.2
# beforeSwitchTask throws error
Error: Required file missing from m1.1

# User sees error immediately
# Task m1.2 doesn't start
# User must fix issue and retry
```

### Auto Mode
```bash
$ crew epic m1
# Running m1.1... ✓
# Running m1.2...
#   beforeSwitchTask throws error
Error: Required file missing from m1.1

# Execution stops
# m1.2 blocked
# m1.3, m1.4 not started
# User must fix and continue
```

## Performance Considerations

### Store Queries

Each task execution queries the store to determine previous task:

```javascript
// This happens for EVERY task
const allTasks = store.listAllTasks();
const prevTask = allTasks.filter(/*...*/).sort(/*...*/)[0];
```

**Impact:**
- ✅ Minimal in manual mode (one task at a time)
- ✅ Acceptable in auto mode (tasks run sequentially, not parallel)
- ✅ Store uses file system, queries are fast
- ⚠️ For 100+ tasks, consider caching optimization (future)

### Hook Execution

Hooks run synchronously in the task execution path:

```
beforeSwitchTask → beforeTask → [Task] → afterTask → afterSwitchTask
        ↓              ↓                      ↓            ↓
     BLOCKS         BLOCKS                CONTINUES   CONTINUES
```

**Best Practices:**
- Keep `before*` hooks fast (they block execution)
- Use `after*` hooks for logging/notifications
- Cache expensive checks across tasks
- Consider async operations in `after*` hooks

## Testing Both Modes

### Test Manual Mode

```bash
# Start fresh
rm -rf .crew/epics

# Initialize project
crew init

# Run tasks one by one
crew run m1.1
# Check: beforeSwitchTask logs

crew run m1.2
# Check: prevTask = m1.1

# Skip a task
crew run m1.4
# Check: prevTask = m1.2 (not m1.3)
```

### Test Auto Mode

```bash
# Run entire epic
crew epic m1

# Check logs show:
# - beforeSwitchTask for each transition
# - prevTask updates correctly
# - Execution stops if beforeSwitchTask throws
```

### Test Blocking

```javascript
// Add to .crew/setup/index.js
async beforeSwitchTask(ctx) {
  if (ctx.nextTask.displayId === 'm1.3') {
    throw new Error('Blocking m1.3 for testing');
  }
}
```

**Manual mode:**
```bash
$ crew run m1.3
Error: Blocking m1.3 for testing
# ✅ Task blocked immediately
```

**Auto mode:**
```bash
$ crew epic m1
# m1.1 ✓
# m1.2 ✓
# m1.3 ✗ Blocked
# Execution stops
```

## Summary

| Aspect | Manual Mode | Auto Mode |
|--------|-------------|-----------|
| Trigger | User command | Orchestrator |
| Execution | One task at a time | Sequential batch |
| Previous Task | From store (last completed) | From store (last completed) |
| Transition Hooks | ✅ Full support | ✅ Full support |
| Blocking | Immediate error to user | Stops batch execution |
| Use Case | Interactive dev | Pipeline automation |

**Key Insight:** Both modes use the **exact same hook system** and **exact same transition logic**. The only difference is who triggers the task execution (user vs. system).
