# Crew CLI Reference

Complete reference for all crew CLI commands, flags, and usage patterns.

## Table of Contents

- [Overview](#overview)
- [crew init](#crew-init)
- [crew plan](#crew-plan)
- [crew run](#crew-run)
- [crew status](#crew-status)
- [crew task](#crew-task)
- [crew epic](#crew-epic)
- [crew verify](#crew-verify)
- [crew search](#crew-search)
- [crew sync](#crew-sync)
- [crew tree](#crew-tree)
- [crew review](#crew-review)
- [Auto-Detection](#auto-detection)
- [Exit Codes](#exit-codes)

---

## Overview

The crew CLI manages project plans, tasks, epics, and execution. It auto-detects the project root by walking up from `process.cwd()` looking for a `.crew/` directory.

```bash
crew <command> [subcommand] [options]
```

All output goes to stderr except for machine-readable data (`--json` flags), which goes to stdout.

---

## crew init

Initialize a new crew project.

```bash
crew init [--name <name>]
```

**Options**:
| Flag | Description | Default |
|------|-------------|---------|
| `--name <name>` | Project name | Directory name |

**Creates**:
- `crew.json` — Project configuration
- `.crew/` — Project state directory
- `.crew/project.json` — Project metadata
- `.crew/setup/index.js` — Setup template

**Example**:
```bash
crew init --name "E-Commerce Platform"
```

---

## crew plan

View, create, or reset the project plan.

```bash
crew plan [init|reset]
```

**Subcommands**:

### crew plan (no args)
Display the current plan overview. Shows epics, task counts, and completion status.

### crew plan init
Generate the plan from `.crew/setup/plan/index.js` (or fallback to `.crew/setup/index.js`).

- Calls `createPlan(ctx)` exported by the setup file
- Creates the `.crew/epics/` directory hierarchy
- Generates `README.md` files for the plan and each epic
- Transactional: if creation fails, partial state is rolled back

### crew plan reset
Delete the current plan. Destructive — removes all `.crew/epics/` contents.

---

## crew run

Execute tasks.

```bash
crew run [next|full|<task-id>]
```

**Subcommands**:

### crew run (no args) / crew run full
Run all executable tasks until the plan is complete or blocked.

### crew run next
Run only the next ready task (a task whose dependencies are all done).

### crew run \<task-id\>
Run a specific task by display ID (e.g., `m1.2`).

**Execution flow**:
1. **Status check** — Detect crashes, stale active tasks, deadlocks
2. **Task selection** — Find the next ready task based on deps and priority
3. **beforeTask hook** — Run plugin hooks
4. **Execute** — Run the task's executor or prompt
5. **afterTask hook** — Run plugin hooks
6. **Checks** — Run attached checks
7. **Fix loop** — If checks fail and `autoFix` is enabled, create and run fix tasks
8. **Status update** — Mark task as done or failed

---

## crew status

Display project status.

```bash
crew status [--json|--minimal]
```

**Options**:
| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output to stdout |
| `--minimal` | Compact one-line summary |
| (default) | AI-optimized human-readable output |

**Default output includes**:
- Project name and description
- Epic progress (completion percentages)
- Task summary by status
- Failed/blocked task details
- Next executable tasks

**JSON output includes**:
- Full task list with status, deps, attempts
- Epic metadata and progress
- Project metadata

---

## crew task

View and manage individual tasks.

```bash
crew task <display-id> [show|add|edit|remove]
```

### crew task \<id\>
Show task summary: title, status, type, deps, prompt excerpt.

### crew task \<id\> show
Full task details including prompt, executor, attempts, and review gates.

### crew task add
Add a new task.

```bash
crew task add --epic <epic-id> --title "Task Title" [--after <task-id>] [--type <type>]
```

| Flag | Description |
|------|-------------|
| `--epic <id>` | Epic to add the task to (display ID like `M1`) |
| `--title <title>` | Task title |
| `--after <id>` | Insert after this task |
| `--type <type>` | Task type (coding, verify, planning, custom) |

### crew task \<id\> edit
Modify a task.

```bash
crew task m1.2 edit --status pending --deps "m1.1,m1.3"
```

| Flag | Description |
|------|-------------|
| `--status <status>` | New status (pending, active, done, failed, blocked, cancelled) |
| `--deps <ids>` | Comma-separated dependency display IDs |
| `--title <title>` | New title |

### crew task \<id\> remove
Remove a task. Also removes it from other tasks' dependency lists.

---

## crew epic

View and manage epics.

```bash
crew epic <display-id> [show|add|edit|remove]
```

### crew epic \<id\>
Show epic summary: title, status, task count, completion percentage.

### crew epic \<id\> show
Full epic details including all tasks and their statuses.

### crew epic add
Add a new epic.

```bash
crew epic add --title "Epic Title" [--after <epic-id>]
```

### crew epic \<id\> edit
Modify an epic.

```bash
crew epic M2 edit --title "New Title" --status active
```

### crew epic \<id\> remove
Remove an epic and all its tasks.

---

## crew verify

Run verification checks.

```bash
crew verify [--only <checks>]
```

**Options**:
| Flag | Description |
|------|-------------|
| `--only <checks>` | Comma-separated list of checks to run |

**Built-in checks**:
- `tsc` — TypeScript compilation
- `build` — Build command
- `images` — Image optimization

**Plugin checks** (crewman):
- `plan-coherence` — Task dependency and prompt completeness
- `outputs-exist` — Expected output files present
- `goals-on-track` — Goal health status

**Output**: Pass/fail for each check, with issue details for failures.

---

## crew search

Search tasks and epics.

```bash
crew search <pattern>
```

Searches task titles, epic titles, and prompts for the given pattern. Returns matching items with their display IDs and status.

---

## crew sync

Regenerate all derived views from the source of truth.

```bash
crew sync
```

Regenerates:
- `state.json` — Aggregated state view
- Plan `README.md` — Plan overview
- Epic `README.md` files — Per-epic overviews

Use after manual edits to `.crew/epics/` files, or when views are out of sync.

---

## crew tree

Display the plan structure as a tree.

```bash
crew tree
```

Shows a visual tree of epics and tasks with status indicators:

```
My Project
├── M1: Foundation [100%]
│   ├── m1.1: Init Repo ✓
│   ├── m1.2: Install Deps ✓
│   └── m1.3: Base Layout ✓
├── M2: Features [33%]
│   ├── m2.1: Authentication ✓
│   ├── m2.2: API Routes ◆ (active)
│   └── m2.3: Dashboard ○ (pending)
└── M3: Polish [0%]
    ├── m3.1: Animations ○
    └── m3.2: Performance ○
```

---

## crew review

Manage task reviews.

```bash
crew review <task-id> [approve|reject]
```

For tasks with review gates (`awaiting_review` status):

- **approve** — Mark the review as passed, allow task to complete
- **reject** — Mark the review as failed, task needs revision

---

## Auto-Detection

The CLI finds the project root by walking up the directory tree from `process.cwd()` looking for a `.crew/` directory. This means you can run crew commands from any subdirectory of the project.

If no `.crew/` directory is found, commands that require a project (everything except `init`) will exit with an error suggesting `crew init`.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (command failed, invalid arguments) |
| 2 | Project not found (no `.crew/` directory) |
