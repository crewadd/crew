# CLI Workflows

**Common command-line workflows and usage patterns.**

[[docs](../README.md) > [cli](./README.md) > workflows]

---

## Development Workflows

### 1. Initial Project Setup

```bash
# Create project
mkdir my-project
cd my-project
npm init -y

# Install Crew
npm install crew

# Initialize Crew
npx crew init
```

### 2. Write Plan

Edit `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');
  // Add epics and tasks...
  return plan.build();
}
```

### 3. Materialize & Run

```bash
# Materialize plan
npx crew plan init

# Run project
npx crew run
```

---

## Iterative Development

### Pattern: Edit → Materialize → Run

```bash
# 1. Edit plan
vim .crew/setup/planning/index.ts

# 2. Re-materialize (overwrites .crew/epics/)
npx crew plan init --force

# 3. Run
npx crew run
```

### Pattern: Resume After Changes

```bash
# Make changes to plan
# ...

# Materialize new tasks
npx crew plan init

# Resume (skips completed tasks)
npx crew run --resume
```

---

## Debugging Workflows

### Debug Failed Task

```bash
# 1. Task fails during run
npx crew run
# Output: Task m2.3 failed after 3 attempts

# 2. Check status
npx crew status

# 3. Inspect task details
cat .crew/epics/02-feature/tasks/03-api/task.md
cat .crew/epics/02-feature/tasks/03-api/context.txt

# 4. Check logs
cat .crew/logs/latest.log

# 5. Re-run with verbose output
npx crew run --verbose --from m2.3
```

### Inspect State

```bash
# View current state
npx crew status

# View plan tree
npx crew tree

# View execution journal
cat .crew/progress.jsonl | tail -20

# View task events
cat .crew/epics/01-setup/tasks/01-init/events/1.jsonl
```

### Search for Issues

```bash
# Find tasks related to "auth"
npx crew search "auth"

# Find failed checks in logs
grep "check:fail" .crew/logs/latest.log
```

---

## Testing Workflows

### Test Plan Without Execution

```bash
# Dry run to preview execution
npx crew run --dry-run

# View what would execute
npx crew tree
```

### Test Specific Epic

```bash
# Run only epic 2
npx crew run --from m2.1 --until m2.999
```

### Test Specific Task

```bash
# Run only task m3.2
npx crew run --from m3.2 --until m3.2
```

### Verify Without Re-execution

```bash
# Run checks without re-executing task
npx crew verify --task m2.3
```

---

## CI/CD Workflows

### GitHub Actions

```yaml
# .github/workflows/crew.yml
name: Crew
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx crew plan init
      - run: npx crew run --json > results.json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v3
        with:
          name: results
          path: results.json
```

### Extract Status

```bash
# Get JSON status
npx crew status --json

# Parse with jq
npx crew status --json | jq '.epics[].tasks[] | select(.status=="failed")'

# Count completed tasks
npx crew status --json | jq '[.epics[].tasks[] | select(.status=="done")] | length'
```

---

## Reset & Cleanup Workflows

### Reset All State

```bash
# Reset task state (keeps plan)
npx crew reset

# Confirm
# y

# Re-run from scratch
npx crew plan init
npx crew run
```

### Reset Keeping Logs

```bash
npx crew reset --keep-logs
```

### Complete Cleanup

```bash
# Remove all .crew/ state
rm -rf .crew/epics .crew/logs .crew/progress.jsonl .crew/state.json

# Re-initialize
npx crew plan init
```

---

## Multi-Environment Workflows

### Development Environment

```bash
# Use development config
CREW_CONFIG=crew.dev.json npx crew run
```

### Production Environment

```bash
# Use production config
CREW_CONFIG=crew.prod.json \
NODE_ENV=production \
npx crew run
```

### Environment-Specific Plans

```typescript
// .crew/setup/planning/index.ts
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My App');

  if (process.env.NODE_ENV === 'production') {
    // Add production tasks
  } else {
    // Add development tasks
  }

  return plan.build();
}
```

---

## Monitoring Workflows

### Real-Time Progress

```bash
# Terminal 1: Run project
npx crew run

# Terminal 2: Watch status
watch -n 1 'npx crew status'

# Terminal 3: Tail logs
tail -f .crew/logs/latest.log
```

### Export Metrics

```bash
# Export status for monitoring
npx crew status --json > /var/metrics/crew-status.json

# Query with jq
cat /var/metrics/crew-status.json | jq '.epics | length'
```

---

## Review Workflows

### Manual Review Gates

```bash
# Run until review gate
npx crew run
# Output: Task m2.3 requires human review

# Review task
npx crew review

# Continue execution
npx crew run --resume
```

### Batch Review

```bash
# Review all pending approvals
npx crew review

# Auto-approve all (careful!)
# npx crew review --approve-all
```

---

## Search Workflows

### Find Tasks by Keyword

```bash
# Find authentication-related tasks
npx crew search "auth"

# Find testing tasks
npx crew search "test"

# Find database tasks
npx crew search "database"
```

### Filter Results

```bash
# Search and filter with grep
npx crew search "api" | grep "pending"
```

---

## Advanced Workflows

### Incremental Execution

```bash
# Run next ready task only
npx crew run next

# Check result
npx crew status

# Run next task
npx crew run next

# Repeat...
```

### Loop Mode (Watch)

```bash
# Re-run on plan changes
npx crew run --loop
```

Watches `.crew/setup/planning/index.ts` and re-runs when modified.

### AI-Assisted Debugging

```bash
# Use AI to unblock failed tasks
npx crew run --ai
```

When a task fails, AI analyzes the error and suggests fixes.

---

## Team Collaboration Workflows

### Share Plan Only

```bash
# Commit plan
git add .crew/setup/planning/
git add crew.json
git commit -m "Add project plan"
git push

# Teammate pulls and runs
git pull
npx crew plan init
npx crew run
```

### Share Partial Results

```bash
# Run some tasks
npx crew run --until m2.5

# Commit generated code (not .crew/ state)
git add src/
git commit -m "Generated code from crew tasks m1.1-m2.5"
git push
```

---

## Performance Optimization Workflows

### Profile Execution

```bash
# Run with timestamps
time npx crew run

# Measure per-task time
npx crew run --json | jq '.epics[].tasks[] | {id, durationMs}'
```

### Parallel Execution Analysis

```bash
# View dependency tree
npx crew tree

# Identify parallelizable tasks (no deps)
```

---

## Documentation Workflows

### Generate Docs from Plan

```bash
# Export plan as markdown
npx crew tree > PLAN.md

# Export status as report
npx crew status --json | jq '.' > status-report.json
```

---

## Common Patterns

### Full Development Cycle

```bash
# 1. Write plan
vim .crew/setup/planning/index.ts

# 2. Validate
npx crew plan init

# 3. Preview
npx crew run --dry-run

# 4. Execute
npx crew run

# 5. Review results
npx crew status
ls -la src/
```

### Quick Iteration

```bash
# Edit plan
vim .crew/setup/planning/index.ts

# Run (auto-materializes if needed)
npx crew run --resume
```

### Emergency Reset

```bash
# Something went wrong, start fresh
npx crew reset --force
npx crew plan init
npx crew run
```

---

## Tips & Tricks

### Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias cr='npx crew run'
alias cs='npx crew status'
alias ct='npx crew tree'
alias cpi='npx crew plan init'
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Crew: Run",
      "type": "shell",
      "command": "npx crew run",
      "group": "build"
    },
    {
      "label": "Crew: Status",
      "type": "shell",
      "command": "npx crew status"
    }
  ]
}
```

---

## See Also

- [Commands](./commands.md) - All CLI commands
- [Flags & Options](./flags-and-options.md) - All flags
- [Debugging Guide](../guides/debugging-tasks.md) - Debug strategies

---

[← Back to CLI Reference](./README.md) | [Documentation Home](../README.md)
