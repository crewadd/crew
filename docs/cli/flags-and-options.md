# Flags & Options

**Complete reference for all CLI flags and command-line options.**

[[docs](../README.md) > [cli](./README.md) > flags-and-options]

---

## Global Flags

These flags work with all commands:

### --help, -h

Show help for a command.

```bash
npx crew --help
npx crew run --help
npx crew plan --help
```

### --version, -v

Show Crew version.

```bash
npx crew --version
# Output: crew 0.1.0
```

### --json

Output in JSON format (machine-readable).

```bash
npx crew status --json
npx crew tree --json
```

### --verbose

Enable verbose logging (debug mode).

```bash
npx crew run --verbose
```

Shows detailed execution logs including:
- Agent prompts
- Check execution
- File operations
- State changes

---

## Command-Specific Flags

### crew run

#### --dry-run

Plan only, don't execute.

```bash
npx crew run --dry-run
```

Shows what would execute without actually running agents.

#### --resume

Resume from last checkpoint after crash/interruption.

```bash
npx crew run --resume
```

Reads `progress.jsonl` and continues from last successful state.

#### --from <id>

Start execution from specific task.

```bash
npx crew run --from m2.3
```

Skips all tasks before `m2.3`.

#### --until <id>

Stop execution at specific task.

```bash
npx crew run --until m3.1
```

Executes tasks up to (and including) `m3.1`, then stops.

#### --loop

Enable continuous execution loop (re-run on changes).

```bash
npx crew run --loop
```

Watches `.crew/setup/planning/index.ts` and re-runs on changes.

#### --ai

Use AI to unblock failed tasks.

```bash
npx crew run --ai
```

When a task fails, use AI agent to suggest fixes.

#### next

Run only the next ready task.

```bash
npx crew run next
```

Executes one task and stops.

---

### crew plan

#### init

Materialize plan from TypeScript definition.

```bash
npx crew plan init
```

Reads `.crew/setup/planning/index.ts` and creates `.crew/epics/` structure.

#### --force

Force re-initialization (overwrites existing epics).

```bash
npx crew plan init --force
```

**Warning**: This deletes existing task state.

---

### crew status

#### --epic <id>

Show status for specific epic.

```bash
npx crew status --epic 1
```

#### --json

Output status in JSON format.

```bash
npx crew status --json
```

Example output:
```json
{
  "name": "My Project",
  "epics": [
    {
      "id": 1,
      "title": "Setup",
      "complete": false,
      "tasks": [
        {"id": "m1.1", "title": "Initialize", "status": "done"},
        {"id": "m1.2", "title": "Install deps", "status": "active"}
      ]
    }
  ]
}
```

---

### crew tree

#### --json

Output tree structure in JSON.

```bash
npx crew tree --json
```

---

### crew search

#### <query>

Search for tasks/epics matching query.

```bash
npx crew search "authentication"
npx crew search "test"
```

Returns matching tasks and epics.

---

### crew verify

#### --epic <id>

Verify specific epic.

```bash
npx crew verify --epic 2
```

#### --task <id>

Verify specific task.

```bash
npx crew verify --task m3.2
```

Runs all checks for the task without re-executing.

---

### crew review

Interactive review of tasks requiring human approval.

```bash
npx crew review
```

Shows tasks with `.review()` gates and prompts for approval.

---

### crew reset

#### --keep-logs

Reset task state but preserve logs.

```bash
npx crew reset --keep-logs
```

#### --force

Skip confirmation prompt.

```bash
npx crew reset --force
```

---

### crew sync

Sync agents/skills to `.claude/` directory (for Claude Code integration).

```bash
npx crew sync
```

---

## Environment Variables

### CREW_CONFIG

Override config file location.

```bash
CREW_CONFIG=/path/to/custom.json npx crew run
```

### CREW_DIR

Override `.crew/` directory location.

```bash
CREW_DIR=/tmp/crew-state npx crew run
```

### CREW_LOG_LEVEL

Set log level (`debug`, `info`, `warn`, `error`).

```bash
CREW_LOG_LEVEL=debug npx crew run
```

### AI Provider Keys

```bash
ANTHROPIC_API_KEY=sk-ant-...
MOONSHOT_API_KEY=sk-...
DASHSCOPE_API_KEY=sk-...
GEMINI_API_KEY=...
```

---

## Configuration Flags

Set via `crew.json`:

### defaultAgent.provider

AI provider to use.

```json
{
  "defaultAgent": {
    "provider": "claude"
  }
}
```

Options: `claude`, `kimi`, `qwen`, `gemini`

### defaultAgent.backend

Backend mode.

```json
{
  "defaultAgent": {
    "backend": "cli"
  }
}
```

Options: `cli`, `sdk`

### defaultAgent.model

Model name.

```json
{
  "defaultAgent": {
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

---

## Common Flag Combinations

### Debug Failed Task

```bash
npx crew run --verbose --from m2.3
```

Re-run specific task with verbose logging.

### Dry Run Specific Range

```bash
npx crew run --dry-run --from m1.1 --until m2.5
```

Preview execution of tasks m1.1 through m2.5.

### Resume with Verbose Output

```bash
npx crew run --resume --verbose
```

Resume execution and show detailed logs.

### JSON Status for CI/CD

```bash
npx crew status --json > status.json
```

Export status for parsing in CI pipelines.

### Force Plan Re-init

```bash
npx crew plan init --force
```

Completely restart from fresh plan.

---

## Exit Codes

- `0` - Success
- `1` - Task failure
- `2` - Configuration error
- `3` - Runtime error
- `130` - User interruption (Ctrl+C)

---

## See Also

- [Commands](./commands.md) - All CLI commands
- [Workflows](./workflows.md) - Common usage patterns
- [Configuration](../getting-started/configuration.md) - Config options

---

[← Back to CLI Reference](./README.md) | [Documentation Home](../README.md)
