# Store Implementation Plan: Filesystem-Native Data Model

> Implementation plan for migrating `packages/crew/src/store` from the current JSON-monolith model to the filesystem-native data model described in `proposal-filesystem-native-data-model.md`.

---

## Guiding Principles

1. **TDD throughout** — every phase starts with failing tests, then implementation
2. **Clean-slate** — no migration from old store; build the new filesystem-native store directly
3. **Same in-memory types** — both stores produce `Epic`, `Task`, `CrewProject` so consumers don't change
4. **Incremental delivery** — each phase is independently mergeable and testable

---

## Architecture Overview

```
src/store/
├── types.ts                    # Existing types (shared by both stores)
├── hierarchical-store.ts       # Existing JSON-based store (untouched until Phase 5)
│
├── fs/                         # NEW: filesystem-native store
│   ├── index.ts                # Public API — FsStore class
│   ├── types.ts                # FS-specific types (StatusValue, LogEntry, etc.)
│   ├── path-resolver.ts        # Directory → identity resolution
│   ├── status-io.ts            # Read/write plain-text status files
│   ├── deps-io.ts              # Read/write deps files (relative paths)
│   ├── yaml-io.ts              # Read/write YAML config files (task.yaml, epic.yaml)
│   ├── log-io.ts               # Append-only JSONL log files
│   ├── output-io.ts            # Agent output directory operations
│   ├── project-ops.ts          # project.yaml operations
│   ├── epic-ops.ts             # Epic CRUD via directory operations
│   ├── task-ops.ts             # Task CRUD via directory operations
│   ├── graph.ts                # Dependency graph from deps files
│   ├── ordering.ts             # Directory prefix ordering + renumber
│   └── views.ts                # README generation from filesystem
```

---

## Phase 1: Primitives — Status, Deps, YAML I/O

Low-level read/write functions that operate on individual files. No store facade, no directory scanning.

### Files

| File | Responsibility |
|---|---|
| `fs/types.ts` | `TaskStatus`, `EpicStatus`, `LogEntry`, `DepsFile` type definitions |
| `fs/status-io.ts` | `readStatus(dir)`, `writeStatus(dir, status)` |
| `fs/deps-io.ts` | `readDeps(taskDir)`, `writeDeps(taskDir, paths[])`, `appendDep(taskDir, path)`, `removeDep(taskDir, path)` |
| `fs/yaml-io.ts` | `readYaml<T>(filePath)`, `writeYaml<T>(filePath, data)` — wraps a YAML parser |
| `fs/log-io.ts` | `appendLog(taskDir, entry)`, `listAttempts(taskDir)`, `readAttempt(taskDir, num)` |

### TDD Scenarios

#### `tests/unit/store/fs/status-io.test.ts`

```
describe('readStatus')
  ✓ returns "pending" when no status file exists
  ✓ reads single-word status from file ("done")
  ✓ trims whitespace and newlines ("  active\n" → "active")
  ✓ returns "pending" for empty file

describe('writeStatus')
  ✓ creates status file with single word
  ✓ overwrites existing status file
  ✓ file contains no trailing newline beyond the word itself
  ✓ creates parent directory if missing
```

#### `tests/unit/store/fs/deps-io.test.ts`

```
describe('readDeps')
  ✓ returns empty array when no deps file exists
  ✓ reads one relative path per line
  ✓ ignores blank lines and comments (# prefixed)
  ✓ trims whitespace from each line
  ✓ resolves paths relative to taskDir

describe('writeDeps')
  ✓ writes array of paths as newline-separated file
  ✓ overwrites existing deps file
  ✓ writes empty file for empty array

describe('appendDep')
  ✓ appends a new path to existing deps file
  ✓ creates deps file if missing
  ✓ does not duplicate existing entry

describe('removeDep')
  ✓ removes matching line from deps file
  ✓ no-op if path not present
  ✓ no-op if deps file missing
```

#### `tests/unit/store/fs/yaml-io.test.ts`

```
describe('readYaml')
  ✓ reads and parses a YAML file into object
  ✓ returns null for missing file
  ✓ handles empty YAML file (returns empty object)
  ✓ preserves types: strings, numbers, booleans, arrays, nested objects

describe('writeYaml')
  ✓ writes object as YAML to file
  ✓ creates parent directories if needed
  ✓ round-trips: write then read returns identical object
  ✓ does not write undefined/null fields
```

#### `tests/unit/store/fs/log-io.test.ts`

```
describe('appendLog')
  ✓ creates log/ directory and 001.jsonl for first entry
  ✓ appends to current attempt file
  ✓ each line is valid JSON with "t" timestamp field
  ✓ creates next attempt file (002.jsonl) when startNewAttempt is called

describe('listAttempts')
  ✓ returns empty array when no log/ directory
  ✓ returns sorted attempt numbers [1, 2, 3]
  ✓ ignores non-jsonl files in log/

describe('readAttempt')
  ✓ parses all JSONL lines from a specific attempt file
  ✓ returns empty array for missing attempt number
  ✓ handles malformed lines gracefully (skips them)
```

---

## Phase 2: Path Resolution & Directory Ordering

Translating between directory structure and identity. The "filesystem IS the database" layer.

### Files

| File | Responsibility |
|---|---|
| `fs/path-resolver.ts` | `crewRoot(dir)`, `epicsDir()`, `epicDir(slug)`, `tasksDir(epicSlug)`, `taskDir(epicSlug, taskSlug)` |
| `fs/ordering.ts` | `listOrdered(dir)`, `parsePrefix(name)`, `nextPrefix(dir)`, `renumber(dir)` |

### TDD Scenarios

#### `tests/unit/store/fs/path-resolver.test.ts`

```
describe('PathResolver')
  ✓ resolves .crew/epics/ from root
  ✓ resolves epic directory: .crew/epics/01-bootstrap/
  ✓ resolves tasks directory: .crew/epics/01-bootstrap/tasks/
  ✓ resolves task directory: .crew/epics/01-bootstrap/tasks/02-fix-build/
  ✓ resolves project.yaml path
  ✓ resolves status file within epic or task dir
  ✓ resolves deps file within task dir
  ✓ resolves log/ directory within task dir
  ✓ resolves output/ directory within task dir
  ✓ supports custom root directory (planDirOverride)
```

#### `tests/unit/store/fs/ordering.test.ts`

```
describe('listOrdered')
  ✓ returns directories sorted by numeric prefix: [01-a, 02-b, 03-c]
  ✓ filters out non-directory entries (files)
  ✓ returns empty array for empty directory
  ✓ returns empty array for non-existent directory
  ✓ handles mixed prefixes: [01-a, 02a-b, 03-c] sorts correctly
  ✓ handles gaps: [01-a, 05-b, 10-c] preserves order

describe('parsePrefix')
  ✓ extracts numeric prefix: "01-bootstrap" → 1
  ✓ extracts double-digit prefix: "12-deploy" → 12
  ✓ handles fractional prefix: "02a-hotfix" → 2 (with suffix "a")
  ✓ returns 0 for unprefixed directory names

describe('nextPrefix')
  ✓ returns "01" for empty directory
  ✓ returns next sequential number after highest existing prefix
  ✓ pads to 2 digits

describe('renumber')
  ✓ renames directories to sequential 01, 02, 03
  ✓ updates deps files that reference renamed directories
  ✓ handles fractional prefixes (02a → 03)
  ✓ is idempotent: renumbering already-sequential dirs is a no-op
  ✓ preserves slug portion of directory names
```

---

## Phase 3: Epic & Task CRUD Operations

Directory-level operations for creating, reading, updating, and removing epics and tasks.

### Files

| File | Responsibility |
|---|---|
| `fs/project-ops.ts` | `readProject(root)`, `writeProject(root, data)` |
| `fs/epic-ops.ts` | `listEpics(root)`, `getEpic(epicDir)`, `createEpic(root, config)`, `removeEpic(epicDir)`, `getEpicStatus(epicDir)`, `setEpicStatus(epicDir, status)` |
| `fs/task-ops.ts` | `listTasks(epicDir)`, `getTask(taskDir)`, `createTask(epicDir, config, prompt?)`, `removeTask(taskDir)`, `getTaskStatus(taskDir)`, `setTaskStatus(taskDir, status, agent)`, `startTask(taskDir, agent)` |

### TDD Scenarios

#### `tests/unit/store/fs/project-ops.test.ts`

```
describe('readProject')
  ✓ reads project.yaml and returns CrewProject-compatible object
  ✓ returns null when project.yaml missing
  ✓ no epic_ids array — epics discovered from filesystem

describe('writeProject')
  ✓ writes project metadata to project.yaml
  ✓ does not write epic_ids or task_ids
  ✓ round-trips name, description, goal, settings
```

#### `tests/unit/store/fs/epic-ops.test.ts`

```
describe('listEpics')
  ✓ returns epics in directory-prefix order
  ✓ returns empty array for no epics
  ✓ each epic has title from epic.yaml
  ✓ each epic has status from status file
  ✓ epic identity is its directory path (no opaque ID)

describe('getEpic')
  ✓ reads epic.yaml for metadata (title, gates, constraints)
  ✓ reads status file for current status
  ✓ does not contain task_ids — tasks are discovered from tasks/ subdirectory
  ✓ returns null for non-existent epic directory

describe('createEpic')
  ✓ creates directory with next numeric prefix: 03-new-epic/
  ✓ writes epic.yaml with title, gates, constraints
  ✓ sets initial status to "planned"
  ✓ creates tasks/ subdirectory
  ✓ optionally writes PROMPT.md

describe('removeEpic')
  ✓ removes entire epic directory recursively
  ✓ returns false for non-existent epic
  ✓ does not modify any other files (deps in other epics become dangling)

describe('getEpicStatus / setEpicStatus')
  ✓ reads single-word status from status file
  ✓ defaults to "planned" when no status file
  ✓ writes single word to status file
  ✓ valid values: planned, active, completed, archived
```

#### `tests/unit/store/fs/task-ops.test.ts`

```
describe('listTasks')
  ✓ returns tasks in directory-prefix order within an epic
  ✓ each task has title from task.yaml, status from status file
  ✓ returns empty array for epic with no tasks

describe('getTask')
  ✓ reads task.yaml for definition (title, type, skills, input, output, vars)
  ✓ reads PROMPT.md if present
  ✓ reads status from status file (default: "pending")
  ✓ reads deps from deps file as resolved paths
  ✓ counts attempts from log/ directory
  ✓ does NOT contain epic_id, dependencies[], dependents[], status_history[]
  ✓ returns null for non-existent task directory

describe('createTask')
  ✓ creates directory with next numeric prefix: 04-lint-check/
  ✓ writes task.yaml with title, type, skills, vars
  ✓ writes PROMPT.md when prompt provided
  ✓ writes deps file when dependencies provided (as relative paths)
  ✓ initial status file absent (implicit "pending")

describe('removeTask')
  ✓ removes entire task directory recursively
  ✓ returns false for non-existent task
  ✓ does not modify deps files in sibling tasks (dangling refs warned on load)

describe('setTaskStatus')
  ✓ writes single word to status file
  ✓ appends status transition to current log file
  ✓ valid values: pending, active, done, failed, blocked

describe('startTask')
  ✓ sets status to "active"
  ✓ creates new log attempt file (NNN.jsonl)
  ✓ logs start event with timestamp and agent
```

---

## Phase 4: Dependency Graph & Statistics

Computed graph resolution from `deps` files. No bidirectional storage.

### Files

| File | Responsibility |
|---|---|
| `fs/graph.ts` | `buildGraph(root)`, `getDependencies(taskDir)`, `getDependents(taskDir, root)`, `getReady(root)`, `validateDeps(root)` |

### TDD Scenarios

#### `tests/unit/store/fs/graph.test.ts`

```
describe('buildGraph')
  ✓ builds adjacency list from all deps files across all epics
  ✓ returns empty graph for project with no deps
  ✓ resolves relative paths to absolute task directory paths

describe('getDependencies')
  ✓ returns resolved dependency task directories from deps file
  ✓ returns empty array when no deps file
  ✓ filters out broken references (logs warning)

describe('getDependents — computed, not stored')
  ✓ scans all tasks to find which reference this task in their deps
  ✓ returns empty array if nothing depends on this task
  ✓ works across epic boundaries (cross-epic deps)

describe('getReady')
  ✓ returns tasks where all deps have status "done" and task status is "pending"
  ✓ returns tasks with no deps and status "pending"
  ✓ skips tasks in epics with incomplete required gates
  ✓ respects epic ordering — earlier epics must complete first (when sequential)
  ✓ returns empty array when all tasks are done or blocked
  ✓ limits results to requested count

describe('validateDeps')
  ✓ returns empty array when all deps resolve
  ✓ returns warnings for broken references (missing directories)
  ✓ returns warnings for circular dependencies
  ✓ each warning includes: source task dir, deps file line, referenced path
```

---

## Phase 5: FsStore Facade & Adapter

The unified `FsStore` class that mirrors `HierarchicalStore` API surface so consumers can swap.

### Files

| File | Responsibility |
|---|---|
| `fs/index.ts` | `FsStore` class — facade composing all operations |
| `fs/adapter.ts` | Translates FS-native shapes to existing `Task`, `Epic`, `CrewProject` types when needed for backward compat |

### TDD Scenarios

#### `tests/unit/store/fs/fs-store.test.ts`

```
describe('FsStore — mirrors HierarchicalStore API')

  describe('initialization')
    ✓ creates .crew/epics/ directory on construction
    ✓ accepts planDirOverride

  describe('project operations')
    ✓ reads project.yaml
    ✓ saves and reloads project
    ✓ returns null when project.yaml missing

  describe('epic operations')
    ✓ creates and lists epics
    ✓ retrieves epic by directory name
    ✓ retrieves epic by number (from prefix)
    ✓ saves updated epic (writes to epic.yaml + status)
    ✓ removes epic

  describe('task operations')
    ✓ creates task with prompt
    ✓ retrieves task by directory path
    ✓ lists tasks for epic
    ✓ lists all tasks across epics
    ✓ updates task status (writes status file + log)
    ✓ starts task (active status + new log attempt)
    ✓ removes task

  describe('dependency resolution')
    ✓ getReady returns tasks with all deps done
    ✓ getReady returns empty when gate incomplete
    ✓ getReady skips tasks with unmet deps

  describe('display IDs')
    ✓ maps task to m{epic}.{task} format
    ✓ resolves display ID back to task

  describe('statistics')
    ✓ counts tasks by status
    ✓ returns zero counts for empty store
```

---

## Phase 6: Views — README Generation

Decoupled view generation that reads directly from filesystem.

### Files

| File | Responsibility |
|---|---|
| `fs/views.ts` | `generateTaskReadme(taskDir)`, `generateEpicReadme(epicDir)`, `generatePlanReadme(root)`, `generateStateJson(root)` |

### TDD Scenarios

#### `tests/unit/store/fs/views.test.ts`

```
describe('generateTaskReadme')
  ✓ includes task title from task.yaml
  ✓ includes current status from status file
  ✓ includes dependency list with titles (reads neighbor task.yaml)
  ✓ includes attempt count from log/ directory
  ✓ includes prompt excerpt from PROMPT.md
  ✓ works without optional files (no deps, no log, no PROMPT.md)

describe('generateEpicReadme')
  ✓ includes epic title from epic.yaml
  ✓ includes epic status from status file
  ✓ includes task table with status for each task
  ✓ includes progress bar (done/total)
  ✓ includes dependency tree visualization

describe('generatePlanReadme')
  ✓ includes all epics with status summary
  ✓ includes overall progress across all tasks
  ✓ includes epic ordering by directory prefix

describe('generateStateJson')
  ✓ produces CrewState-compatible JSON
  ✓ scans filesystem — no stored IDs needed
  ✓ includes summary counts, epic list, next_tasks
```

---

## Integration Test Scenarios

End-to-end scenarios operating on real temp directories.

#### `tests/integration/store/fs-lifecycle.test.ts`

```
describe('full project lifecycle')
  ✓ create project → create epic → create tasks → set deps → run tasks → complete
    step-by-step:
    1. writeProject({name, goal})
    2. createEpic({title: "Bootstrap"})
    3. createTask(epic, {title: "Install deps"}, prompt)
    4. createTask(epic, {title: "Fix build"}, prompt)
    5. writeDeps(task2, ["../01-install-deps"])
    6. getReady() → returns task1 only
    7. startTask(task1, "agent_builder")
    8. setTaskStatus(task1, "done", "agent_builder")
    9. getReady() → returns task2
    10. startTask(task2, "agent_builder")
    11. setTaskStatus(task2, "done", "agent_builder")
    12. getReady() → returns empty

describe('concurrent safety')
  ✓ two tasks created in same epic simultaneously — no conflict
  ✓ status write on task A while config edit on task B — no conflict
  ✓ two log appends to different tasks — no conflict

describe('graceful degradation')
  ✓ missing status file → defaults to "pending"
  ✓ missing deps file → no dependencies
  ✓ missing log/ dir → zero attempts
  ✓ missing PROMPT.md → prompt is undefined
  ✓ broken dep reference → warning logged, dep ignored

describe('delete operations')
  ✓ removing a task leaves sibling deps dangling (warned on next load)
  ✓ removing an epic removes all contained tasks
  ✓ removing last task in epic → epic still valid

describe('reorder operations')
  ✓ renumber tasks: [01-a, 03-b, 05-c] → [01-a, 02-b, 03-c]
  ✓ renumber updates deps files referencing renamed dirs
  ✓ move task to different epic updates its deps paths
```

---

## File Format Reference

Quick reference for each file in the new model:

| File | Format | Owner | Mutable? | Example |
|---|---|---|---|---|
| `project.yaml` | YAML | Authored | Yes | `name: steep_app` |
| `epic.yaml` | YAML | Authored | Yes | `title: "Bootstrap"` |
| `task.yaml` | YAML | Authored | Yes | `title: "Fix build"` |
| `PROMPT.md` | Markdown | Authored | Yes | Task instructions |
| `status` | Plain text | Framework | Yes (overwrite) | `done` |
| `deps` | Plain text | Authored | Yes | `../01-install-deps` |
| `log/NNN.jsonl` | JSONL | Framework | Append-only | `{"event":"start",...}` |
| `output/*` | Any | Agent | Yes | Reports, yields |
| `README.md` | Markdown | Generated | Regenerated | View |

---

## Dependency Graph (Build Order)

```
Phase 1: Primitives
  status-io  deps-io  yaml-io  log-io     (no internal deps)
       │        │        │        │
       └────────┴────────┴────────┘
                     │
Phase 2: Path Resolution
  path-resolver  ordering                  (depends on Phase 1)
       │            │
       └────────────┘
              │
Phase 3: CRUD Operations
  project-ops  epic-ops  task-ops          (depends on Phase 1 + 2)
       │          │          │
       └──────────┴──────────┘
                     │
Phase 4: Graph & Statistics
  graph                                    (depends on Phase 1 + 2 + 3)
              │
Phase 5: Facade
  FsStore + adapter                        (depends on all above)

Phase 6: Views
  views                                    (depends on Phase 1 + 2 + 3)
```

---

## Dependencies to Add

| Package | Purpose | Notes |
|---|---|---|
| `yaml` | YAML parse/serialize | NPM `yaml` package (v2) — ESM, zero deps |

No other new dependencies. `node:fs`, `node:path` used throughout.

---

## Exit Criteria

Each phase is complete when:

1. All TDD scenarios pass (`vitest run tests/unit/store/fs/`)
2. No regressions in existing store tests (`vitest run tests/unit/store/`)
3. TypeScript compiles cleanly (`tsc --noEmit`)
4. Integration tests pass for completed phases

Final exit criteria:
- `FsStore` passes all TDD scenarios
- Integration lifecycle test passes end-to-end
- Views generate correct READMEs from filesystem
