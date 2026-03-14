# CLI Reference

**Command-line interface for running, monitoring, and debugging Crew projects.**

The Crew CLI provides commands for executing projects, reviewing task status, resuming after crashes, and inspecting execution state.

## In This Section

### [Commands](./commands.md)
Complete reference for all CLI commands: `run`, `review`, `init`, `clean`, etc.

### [Flags & Options](./flags-and-options.md)
All command-line flags and their behaviors.

### [Workflows](./workflows.md)
Common CLI workflows and usage patterns.

---

## Quick Reference

### Common Commands

```bash
# Run project from crew.ts
npx crew run

# Run specific epic
npx crew run --epic setup

# Resume after crash
npx crew run --resume

# Review pending tasks
npx crew review

# Review specific epic
npx crew review --epic deploy

# Initialize new project
npx crew init

# Clean .crew/ directory
npx crew clean
```

### Common Flags

```bash
# Dry run (plan only, don't execute)
npx crew run --dry-run

# Verbose logging
npx crew run --verbose

# Custom config file
npx crew run --config custom-crew.json

# Specific session
npx crew run --session abc123

# Continue on failure
npx crew run --continue-on-error
```

---

## Core Commands

### `crew run`
Execute a Crew project.

```bash
npx crew run [options]
```

**Options:**
- `--epic <name>` - Run specific epic
- `--task <id>` - Run specific task
- `--resume` - Resume from last checkpoint
- `--dry-run` - Plan only, don't execute
- `--verbose` - Detailed logging
- `--continue-on-error` - Don't stop on failures

### `crew review`
Review task status and approve review gates.

```bash
npx crew review [options]
```

**Options:**
- `--epic <name>` - Review specific epic
- `--task <id>` - Review specific task
- `--approve-all` - Auto-approve all pending

### `crew init`
Initialize a new Crew project.

```bash
npx crew init [project-name]
```

Creates:
- `crew.ts` - Project definition
- `crew.json` - Configuration file
- `.crew/` - State directory

### `crew clean`
Remove `.crew/` state directory.

```bash
npx crew clean [options]
```

**Options:**
- `--keep-logs` - Preserve log files
- `--force` - Skip confirmation

---

## Typical Workflows

### First Run
```bash
# 1. Create project
npx crew init my-project

# 2. Define tasks in crew.ts
# (edit crew.ts)

# 3. Run project
npx crew run
```

### Development Iteration
```bash
# Run and watch
npx crew run --verbose

# Fix issues, then resume
npx crew run --resume

# Review pending tasks
npx crew review
```

### CI/CD Pipeline
```bash
# Run with strict checks
npx crew run --no-interactive --fail-fast

# Generate report
npx crew run --json-output > report.json
```

---

## Environment Variables

```bash
# AI provider configuration
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Crew configuration
export CREW_CONFIG=/path/to/crew.json
export CREW_STATE_DIR=/path/to/.crew
export CREW_LOG_LEVEL=debug
```

---

## Exit Codes

- `0` - Success (all tasks completed)
- `1` - Failure (task failed after max attempts)
- `2` - Configuration error
- `3` - Runtime error (crash)
- `130` - Interrupted (Ctrl+C)

---

## Next Steps

- **Command reference**: [Commands](./commands.md)
- **All flags**: [Flags & Options](./flags-and-options.md)
- **Usage patterns**: [Workflows](./workflows.md)
- **CI/CD integration**: [CI/CD Guide](../guides/ci-cd-integration.md)

---

[← Back to Documentation Home](../README.md)
