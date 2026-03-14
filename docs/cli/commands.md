# CLI Commands Reference

**Complete reference for all Crew CLI commands.**

[[docs](../README.md) > [cli](./README.md) > commands]

---

## Overview

The Crew CLI provides commands for managing projects, executing tasks, reviewing approvals, and managing state.

```bash
crew <command> [options]
```

---

## Commands

### init

Initialize a new Crew project.

```bash
crew init                    # Initialize in current directory
crew init --preset nextjs    # Use a preset template
crew init --preset react
crew init --preset fastapi
```

Creates:
- `crew.json` — Project configuration
- `.crew/setup/` — Setup scripts
- `.crew/agents/` — Agent personas
- `.crew/skills/` — Reusable skills
- `.crew/prompts/` — Prompt templates

**Options:**
- `--preset` — Template preset (nextjs, react, fastapi, etc.)
- `--project` — Project directory (default: current)

---

### plan

Manage project plans.

```bash
crew plan                    # View current plan
crew plan init               # Generate plan from setup script
crew plan view               # Show plan as tree
crew plan diff               # Show changes since last plan
```

**Subcommands:**
- `init` — Generate plan from `.crew/setup/planning/index.ts`
- `view` — Display plan as formatted tree
- `diff` — Show what changed since last generation
- `validate` — Validate plan structure

**Options:**
- `--json` — Output as JSON
- `--verbose` — Show details
- `--dry-run` — Don't make changes

---

### run

Execute tasks.

```bash
crew run                     # Run all pending tasks
crew run next                # Run only next ready task
crew run <task-id>           # Run specific task
crew run m1.3                # Run task with ID m1.3
crew run --until m2.1        # Run up to task m2.1
```

**What happens:**
1. Framework resolves task dependencies
2. Executes ready tasks (respecting constraints)
3. Runs checks
4. On failure, sends feedback to agent for retry (up to maxAttempts)
5. On success, continues to dependent tasks

**Options:**
- `--ai` — Use AI for unstuck decisions
- `--loop` — Keep running until all tasks done
- `--from <id>` — Start from specific task
- `--until <id>` — Stop at specific task
- `--verbose` — Show details

**Examples:**
```bash
crew run                     # All tasks
crew run next                # Next ready task
crew run m1.3                # Specific task
crew run --loop              # Keep running until complete
crew run --from m2           # Start from epic 2
crew run --until m2.5        # Stop after task 5 of epic 2
```

---

### status

Show project progress.

```bash
crew status                  # Show all tasks and status
crew status --verbose        # Detailed view with logs
crew status --json           # JSON output
crew status --epic 1         # Show specific epic
crew status --task m1.3      # Show specific task
```

**Output shows:**
- Epics and tasks with status
- Attempted vs max attempts
- Current checks passing/failing
- Time elapsed

**Options:**
- `--verbose` — Full details
- `--json` — JSON format
- `--epic <num>` — Filter to epic
- `--task <id>` — Filter to task
- `--checks` — Show check status

---

### verify

Run all quality gates (checks).

```bash
crew verify                  # Run all checks
crew verify --check tsc      # Run specific check
crew verify <task-id>        # Run checks for task
```

**What it does:**
1. Runs all checks for each task
2. Reports pass/fail status
3. Shows summary

**Options:**
- `--check <name>` — Run specific check only
- `--task <id>` — Verify specific task only
- `--verbose` — Show detailed output
- `--json` — JSON output

---

### tree

Display plan as tree.

```bash
crew tree                    # Show full tree
crew tree --epic 1           # Show epic 1
crew tree --compact          # Minimal output
crew tree --json             # JSON tree
```

**Example output:**
```
project: My App
├── epic: Setup (1)
│   ├── task: init [pending]
│   ├── task: deps [pending]
│   └── task: config [pending]
├── epic: Backend (2)
│   ├── task: db [pending]
│   ├── task: api [pending]
│   └── task: auth [pending]
└── epic: Frontend (3)
    ├── task: components [pending]
    └── task: integration [pending]
```

**Options:**
- `--epic <num>` — Show specific epic
- `--compact` — Minimal format
- `--json` — JSON output
- `--verbose` — Full details

---

### search

Search tasks and epics.

```bash
crew search "auth"           # Search by name
crew search "api" --type     # Search by type
crew search --status pending # Search by status
```

**What it searches:**
- Task IDs and titles
- Task descriptions
- Epic names and IDs
- Task tags

**Options:**
- `--type <type>` — Filter by type
- `--status <status>` — Filter by status
- `--epic <num>` — Limit to epic
- `--json` — JSON output

---

### review

Manage approval gates.

```bash
crew review                                    # List pending reviews
crew review approve <task-id>                  # Approve review
crew review reject <task-id> --message "msg"   # Reject review
```

**What it does:**
- Lists tasks waiting for human approval
- Shows approval context (prompt, assignee)
- Records decisions

**Subcommands:**
- `list` or no subcommand — Show pending reviews
- `approve <id>` — Approve a review
- `reject <id>` — Reject a review
- `view <id>` — View details

**Options:**
- `--status pending` — Show pending only
- `--message` — Feedback on rejection
- `--json` — JSON output

---

### sync

Sync agents and skills to `.claude/` directory.

```bash
crew sync                    # Sync all agents/skills
crew sync --agents          # Sync agents only
crew sync --skills          # Sync skills only
```

**What it does:**
1. Reads `.crew/agents/` and `.crew/skills/`
2. Generates `.claude/` directory structure
3. Ready for Claude Code access

**Options:**
- `--agents` — Sync agents only
- `--skills` — Sync skills only
- `--dry-run` — Show what would happen

---

### reset

Reset project state.

```bash
crew reset                   # Clear all task state
crew reset --task m1.3       # Reset specific task
crew reset --epic 1          # Reset epic
crew reset --force           # Don't ask for confirmation
```

**What it does:**
- Clears task status/outputs
- Removes check results
- Resets for fresh execution

**⚠️ WARNING:** Destructive operation. Cannot be undone.

**Options:**
- `--task <id>` — Reset specific task
- `--epic <num>` — Reset epic
- `--force` — Skip confirmation
- `--dry-run` — Show what would happen

---

### task

Manage individual tasks.

```bash
crew task <id> status        # Show task status
crew task <id> logs          # Show task logs
crew task <id> reset         # Reset task
crew task <id> output        # Show task output
```

**Subcommands:**
- `status` — Show task status
- `logs` — Show task logs
- `output` — Show task output
- `reset` — Reset task state
- `deps` — Show dependencies
- `details` — Full task details

**Options:**
- `--verbose` — Detailed output
- `--json` — JSON output

---

### epic

Manage epics.

```bash
crew epic <num> status       # Show epic status
crew epic <num> tasks        # List epic tasks
crew epic <num> reset        # Reset epic
```

**Subcommands:**
- `status` — Show epic status
- `tasks` — List all tasks in epic
- `reset` — Reset all tasks
- `details` — Full epic details

**Options:**
- `--verbose` — Detailed output
- `--json` — JSON output

---

### chat

Interact with the main agent.

```bash
crew chat                    # Start interactive session
crew chat "What should I do?" # One-off question
```

**Options:**
- `--agent` — Use specific agent
- `--context` — Include task context
- `--json` — JSON output

---

## Global Options

Available on all commands:

```bash
crew <command> --help                # Command help
crew <command> --project <path>      # Specify project
crew <command> --verbose             # Verbose output
crew <command> --json                # JSON output
crew <command> --dry-run             # Show without executing
```

### Common Flags

| Flag | Purpose |
|------|---------|
| `--help` | Show command help |
| `--project <path>` | Project directory |
| `--verbose` | Detailed output |
| `--json` | JSON format |
| `--dry-run` | Preview changes |
| `--force` | Skip confirmations |

---

## Task IDs

Tasks are identified by ID format: `m{epic}.{position}`

```
m1.1 = Epic 1, Task 1
m1.3 = Epic 1, Task 3
m2.1 = Epic 2, Task 1
```

---

## Status Values

### Task Status

- `pending` — Not started
- `active` — Currently executing
- `done` — Completed successfully
- `failed` — Failed all retries
- `blocked` — Waiting for dependency
- `cancelled` — Skipped
- `awaiting_review` — Waiting for approval

### Epic Status

- `planned` — Ready to run
- `active` — Tasks executing
- `completed` — All tasks done
- `archived` — No longer active

---

## Examples

### Complete Workflow

```bash
# 1. Initialize project
crew init --preset nextjs

# 2. Write plan in .crew/setup/planning/index.ts
# (edit plan...)

# 3. Generate plan
crew plan init

# 4. View plan
crew plan view

# 5. Execute
crew run

# 6. Check progress
crew status

# 7. Review pending approvals
crew review

# 8. Approve
crew review approve m2.1

# 9. Continue execution
crew run

# 10. Final status
crew status --verbose
```

### Debugging

```bash
# Check status
crew status --verbose

# See specific task
crew task m1.3 logs

# View task output
crew task m1.3 output

# Search for tasks
crew search "api"

# Reset and retry
crew reset --task m1.3
crew run m1.3
```

### Review Process

```bash
# List pending reviews
crew review

# Approve
crew review approve m2.1

# Or reject
crew review reject m2.1 --message "Need error handling"

# View decision
crew task m2.1 details
```

---

## See Also

- [Flags & Options](./flags-and-options.md) — All command options
- [Workflows](./workflows.md) — Common patterns
- [Status Reference](../core-concepts/projects-epics-tasks.md) — Task states
- [Debugging Guide](../guides/debugging-tasks.md) — Debugging with CLI

---

[← Back to CLI](./README.md) | [← Back to Documentation](../README.md)
