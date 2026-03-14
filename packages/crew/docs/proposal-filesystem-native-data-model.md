# Proposal: Filesystem-Native Data Model for Crew

## Problem Statement

The current data model has several tight-coupling issues that make it fragile and hard to modify:

### Current Drawbacks

1. **epic.json owns the task list** — `task_ids: [...]` means adding/removing/reordering a task requires editing epic.json. Two agents editing tasks in the same epic will conflict on this array.

2. **task.json is a monolith** — A single file holds identity, config, dependencies, execution history (`attempts[]`), and audit trail (`status_history[]`). Editing the prompt or fixing a dependency means touching the same file that the executor writes to mid-run.

3. **Cross-file ID references everywhere** — `task.dependencies`, `task.dependents`, `epic.task_ids`, `project.epic_ids` all use opaque IDs (`task_0mmhcxi0dmfq...`). Renaming or moving anything means updating every file that references it.

4. **Redundant bidirectional links** — Dependencies are stored in *both* `dependencies` and `dependents` arrays. They must stay in sync manually — a classic source of corruption.

5. **History grows unboundedly inside config** — `attempts[]` and `status_history[]` grow with every execution. After 14 retries of a planning task, `task.json` is mostly history, burying the actual task definition.

6. **Computed state mixed with source-of-truth** — Fields like `status`, `version`, `updated` are computed from history but stored alongside authored fields like `title`, `prompt`, `vars`. This makes it unclear what a human/agent should edit vs. what the framework owns.

7. **No partial reads** — To check if a task is `done`, you must parse the entire task.json including all attempts and history.

---

## Design Principles

1. **The filesystem IS the database** — Directory presence = existence. File position = ordering. No ID arrays needed.
2. **Separate authored content from runtime state** — What humans/agents write vs. what the framework writes live in different files.
3. **One concern per file** — A file has one owner and one reason to change.
4. **Implicit relationships over explicit IDs** — Use directory structure and naming conventions instead of ID cross-references.
5. **Append-only logs over mutable arrays** — History is appended, never rewritten.
6. **Convention over configuration** — Ordering from filenames (`01-`, `02-`), relationships from co-location.

---

## Proposed Directory Structure

```
.crew/
├── project.yaml                          # Project metadata (authored)
│
├── epics/
│   ├── 01-bootstrap/
│   │   ├── epic.yaml                     # Epic metadata (authored)
│   │   ├── status                        # Single word: planned|active|completed|archived
│   │   │
│   │   └── tasks/
│   │       ├── 01-install-deps/
│   │       │   ├── task.yaml             # Task definition (authored)
│   │       │   ├── PROMPT.md             # Task instruction (authored)
│   │       │   ├── status                # Single word: pending|active|done|failed|blocked
│   │       │   ├── deps                  # One relative path per line (authored)
│   │       │   ├── log/                  # Append-only execution log (framework-owned)
│   │       │   │   ├── 001.jsonl         # Attempt 1 events
│   │       │   │   └── 002.jsonl         # Attempt 2 events
│   │       │   └── output/               # Task outputs (agent-owned)
│   │       │       ├── report.md
│   │       │       └── yields.yaml
│   │       │
│   │       ├── 02-fix-build/
│   │       │   ├── task.yaml
│   │       │   ├── PROMPT.md
│   │       │   ├── status
│   │       │   ├── deps                  # contains: "../01-install-deps"
│   │       │   └── log/
│   │       │       └── 001.jsonl
│   │       │
│   │       └── 03-verify-build/
│   │           ├── task.yaml
│   │           ├── status
│   │           └── deps                  # contains: "../02-fix-build"
│   │
│   └── 02-homepage/
│       ├── epic.yaml
│       ├── status
│       └── tasks/
│           └── ...
│
├── agents/                               # Agent persona files (unchanged)
│   └── builder.md
│
├── skills/                               # Skill definitions (unchanged)
│   └── react-prune/
│       └── SKILL.md
│
└── events/                               # Global event stream (append-only)
    └── 2026-03-08.jsonl
```

---

## File Formats

### project.yaml (authored)

```yaml
name: steep_app
description: "Landing page rebuild"
goal: "Pixel-perfect Next.js implementation"

settings:
  parallel_limit: 2
  require_reviews: false
```

No `epic_ids` array — epics are discovered by scanning `epics/` directory.

---

### epic.yaml (authored)

```yaml
title: "Bootstrap & Fix Errors"

gates:
  - type: plan
    required: true

constraints:
  sequential: true       # tasks run in directory order
  auto_resolve: true     # skip if empty
```

No `id`, no `task_ids`, no `version`, no `created`/`updated` timestamps. The epic's identity is its directory name. Task membership is implicit from the `tasks/` subdirectory.

---

### status (framework-owned, single value)

```
done
```

A plain text file containing one word. This is the **only** mutable state the framework writes at the epic/task level. Easy to read (`cat`), easy to write (`echo done > status`), easy to watch (`inotifywait`).

---

### task.yaml (authored)

```yaml
title: "Fix build errors"
type: coding

skills:
  - page-build

input:
  description: "src/app/page.tsx"
  files:
    - src/app/page.tsx

output:
  description: "Fixed source files"

vars:
  route: "/"
  slug: "homepage"
```

No `id`, no `epic_id`, no `dependencies`/`dependents`, no `status`, no `attempts`, no `status_history`, no `version`. Just the task definition — what a human or AI would author.

---

### deps (authored, one path per line)

```
../01-install-deps
```

Dependencies are **relative directory paths**, not opaque IDs. This means:
- Renaming `02-fix-build/` to `02-fix-typescript-errors/` requires zero changes elsewhere (unless something depends on it — and those deps files use the old name, which the framework can detect as broken).
- You can see dependencies with `cat deps` — no JSON parsing needed.
- Adding a dependency is `echo "../03-new-task" >> deps`.

The framework resolves these paths at runtime to determine the dependency graph.

---

### log/NNN.jsonl (framework-owned, append-only)

```jsonl
{"t":"2026-03-08T06:15:00.561Z","event":"start","agent":"agent_system"}
{"t":"2026-03-08T06:15:05.000Z","event":"progress","message":"Running pnpm install..."}
{"t":"2026-03-08T06:15:19.883Z","event":"done","success":true,"duration_ms":19322}
```

Each attempt is a separate file. The framework only appends — never rewrites. You can delete old attempt logs without affecting anything. The log directory is optional; absence means "never executed."

---

### output/ (agent-owned)

Agents can write any files here — reports, yields, artifacts. The framework does not interpret these files directly; task types and hooks define which output files to read.

For yields (incremental planning), the agent writes:

```yaml
# output/yields.yaml
tasks:
  - title: "Implement GSAP hero animation"
    type: coding
    prompt_file: gsap-hero-prompt.md    # relative to output/
    checks: [build]

  - title: "Implement CSS keyframes"
    type: coding
    prompt_file: css-keyframes-prompt.md
    checks: [build]
```

The framework reads `output/yields.yaml` when the task completes and materializes the yielded tasks as new directories.

---

## How the Framework Resolves State

### Task ordering

Determined by directory name prefix: `01-`, `02-`, `03-`. No array needed.

```typescript
function listTasks(epicDir: string): string[] {
  return fs.readdirSync(path.join(epicDir, 'tasks'))
    .filter(d => fs.statSync(path.join(epicDir, 'tasks', d)).isDirectory())
    .sort();  // lexicographic sort on "01-name", "02-name" etc.
}
```

### Task identity

The directory path *is* the identity: `epics/01-bootstrap/tasks/02-fix-build`. Display IDs are computed: `m1.2`.

### Dependency graph

```typescript
function getDeps(taskDir: string): string[] {
  const depsFile = path.join(taskDir, 'deps');
  if (!fs.existsSync(depsFile)) return [];
  return fs.readFileSync(depsFile, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(rel => path.resolve(taskDir, rel));  // resolve relative paths
}
```

No bidirectional links. `dependents` are computed by inverting the graph at runtime.

### Status

```typescript
function getStatus(dir: string): string {
  const statusFile = path.join(dir, 'status');
  if (!fs.existsSync(statusFile)) return 'pending';  // no file = pending
  return fs.readFileSync(statusFile, 'utf-8').trim();
}
```

### History

Reconstructed from `log/` directory:

```typescript
function getAttempts(taskDir: string): Attempt[] {
  const logDir = path.join(taskDir, 'log');
  if (!fs.existsSync(logDir)) return [];
  return fs.readdirSync(logDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .map(f => parseAttemptLog(path.join(logDir, f)));
}
```

---

## Migration Path

The migration is mechanical and reversible:

### Phase 1: Read from both formats

The store layer grows a `detect()` method:
- If `epic.json` exists → use current reader
- If `epic.yaml` exists → use new reader
- Internally, both produce the same in-memory types (`Epic`, `Task`)

### Phase 2: Write in new format

New writes go to the new format. A `migrate` CLI command converts existing `.crew/` directories:

```bash
crew migrate --dry-run    # show what would change
crew migrate              # convert in place
crew migrate --rollback   # convert back to JSON
```

### Phase 3: Drop old format

Remove JSON reader code. The old format is no longer supported.

---

## Comparison

| Concern | Current Model | Proposed Model |
|---|---|---|
| Task list in epic | `epic.json → task_ids[]` | `ls epics/01-x/tasks/` |
| Task ordering | Array index in `task_ids` | Directory prefix `01-`, `02-` |
| Task identity | Opaque ULID `task_0mmhcxi...` | Directory path |
| Dependencies | `task.json → dependencies[]` (IDs) | `deps` file (relative paths) |
| Reverse deps | `task.json → dependents[]` (redundant) | Computed at runtime |
| Task status | `task.json → status` | `status` file (one word) |
| Execution history | `task.json → attempts[]` + `status_history[]` | `log/001.jsonl`, `log/002.jsonl` |
| Task config | Mixed into `task.json` with state | `task.yaml` (pure config) |
| Epic status | `epic.json → status` | `status` file (one word) |
| Epic metadata | Mixed into `epic.json` with IDs | `epic.yaml` (pure config) |
| Add a task | Edit `epic.json` + create `task.json` | `mkdir` + write `task.yaml` |
| Remove a task | Edit `epic.json` + delete `task.json` | `rm -rf` the directory |
| Reorder tasks | Edit `epic.json` array | `mv 02-x 03-x` (rename prefix) |
| Concurrent edits | Conflict on `epic.json` | No shared mutable file |
| Manual inspection | `jq` or JSON viewer | `cat`, `ls`, `tree` |
| Watch for changes | Parse JSON, diff | `inotifywait` on `status` files |

---

## Operations Cookbook

Every real-world mutation, shown side-by-side. The current model requires coordinated multi-file JSON edits; the proposed model maps each operation to familiar filesystem commands.

### Create a Task

**Current:**
1. Generate a ULID (`task_0mmhcxi0xyz...`)
2. Create `tasks/NN-slug/task.json` with full schema (id, epic_id, version, dependencies, dependents, attempts, status_history, created, updated)
3. Edit `epic.json` → push the new ID into `task_ids[]` at the right position
4. Edit every task that should depend on *or* be depended on by this task → update their `dependencies[]` and `dependents[]`

**Proposed:**
```bash
mkdir -p .crew/epics/01-bootstrap/tasks/04-lint-check
cat > .crew/epics/01-bootstrap/tasks/04-lint-check/task.yaml << 'EOF'
title: "Run lint check"
type: verify
EOF
echo "../03-verify-build" > .crew/epics/01-bootstrap/tasks/04-lint-check/deps
```

Done. No epic.json to edit, no IDs to generate, no bidirectional links to maintain.

---

### Update a Task (change title, type, skills, vars, prompt)

**Current:**
1. Read `task.json` (includes attempts, status_history, etc.)
2. Modify the field
3. Update `version`, `updated.at`, `updated.by`
4. Write the entire file back atomically

Risk: if the executor is mid-run, it's also writing to `task.json` (appending to `attempts[]`, updating `status`). Race condition.

**Proposed:**
```bash
# Edit only the authored config — executor never touches this file
vim .crew/epics/01-bootstrap/tasks/02-fix-build/task.yaml

# Or programmatically
yq '.skills += ["eslint"]' -i task.yaml
```

The executor writes to `status` and `log/` — completely separate files. No race.

---

### Remove a Task

**Current:**
1. Read `epic.json` → remove the task ID from `task_ids[]` → write back
2. For every task that lists this task in `dependencies[]` → remove it → write back
3. For every task that lists this task in `dependents[]` → remove it → write back
4. Delete the task directory

4 files minimum, potentially many more if the task had dependents.

**Proposed:**
```bash
rm -rf .crew/epics/01-bootstrap/tasks/02-fix-build
```

One operation. The framework detects broken `deps` references on next load and warns:

```
⚠ epics/01-bootstrap/tasks/03-verify-build/deps:1
  references "../02-fix-build" which no longer exists — dependency ignored
```

No other files need updating. The `deps` file in the dependent task can be cleaned up lazily or left as a harmless dangling reference.

---

### Remove an Epic

**Current:**
1. Read `project.json` → remove epic ID from `epic_ids[]` → write back
2. For each task in the epic: clean up cross-epic dependencies in other epics' tasks
3. Delete the epic directory

**Proposed:**
```bash
rm -rf .crew/epics/02-homepage
```

Same pattern — one operation. Cross-epic deps (if any exist in other tasks' `deps` files) become dangling and are warned about on next load.

---

### Reorder Tasks Within an Epic

**Current:**
1. Read `epic.json`
2. Rearrange elements in `task_ids[]` array
3. Write back

Fragile: the array is the *only* thing that defines order, and it's in a shared file.

**Proposed:**
```bash
# Move task 02 to position 04
mv .crew/epics/01-bootstrap/tasks/02-fix-build \
   .crew/epics/01-bootstrap/tasks/04-fix-build
```

Or to insert between existing tasks, use fractional numbering:

```bash
# Insert between 02 and 03
mkdir .crew/epics/01-bootstrap/tasks/02a-new-step
```

For a clean renumber:
```bash
crew renumber epics/01-bootstrap  # renames 01, 02a, 03 → 01, 02, 03
```

**Deps impact:** If other tasks reference `../02-fix-build` in their `deps` file and you rename it, those references break. Two options:

1. **Framework auto-fix:** `crew renumber` updates `deps` files that reference renamed directories.
2. **Symlink bridge:** Leave a symlink `02-fix-build → 04-fix-build` temporarily.
3. **Validate on load:** Framework warns about broken deps, user fixes manually.

---

### Move a Task to a Different Epic

**Current:**
1. Read source `epic.json` → remove task ID from `task_ids[]` → write back
2. Read target `epic.json` → add task ID to `task_ids[]` → write back
3. Read `task.json` → update `epic_id` → write back
4. If task has dependencies in the old epic, those are now cross-epic — update dependency IDs in all affected tasks

**Proposed:**
```bash
mv .crew/epics/01-bootstrap/tasks/03-verify-build \
   .crew/epics/02-homepage/tasks/01-verify-build
```

Then update `deps` files if they used relative paths that changed:
```bash
# Old deps content: "../02-fix-build"
# New deps content: "../../01-bootstrap/tasks/02-fix-build"
```

The framework can offer a helper:
```bash
crew move epics/01-bootstrap/tasks/03-verify-build epics/02-homepage/
# Automatically moves dir + rewrites deps paths
```

---

### Move / Reorder an Epic

**Current:**
1. Read `project.json` → rearrange `epic_ids[]` → write back
2. Optionally update `epic.json` → change `number` field

**Proposed:**
```bash
# Rename to change position
mv .crew/epics/02-homepage .crew/epics/03-homepage

# Or use the helper
crew renumber epics/
```

Cross-epic `deps` references use the epic directory name, so they'd need updating — same as task reordering. The `crew renumber` command handles this.

---

### Update Task Status

**Current:**
1. Read `task.json`
2. Update `status` field
3. Push to `status_history[]` array: `{from, to, at, by}`
4. Update `version`, `updated.at`, `updated.by`
5. Write entire file back

**Proposed:**
```bash
echo "done" > .crew/epics/01-bootstrap/tasks/01-install-deps/status
```

The status transition is logged in the attempt log file (`log/001.jsonl`), not in the status file itself. The `status` file always reflects current state — one word, no history.

If you need the transition history, it lives in the log:
```jsonl
{"t":"2026-03-08T06:15:00Z","event":"status","from":"pending","to":"active","by":"agent_system"}
{"t":"2026-03-08T06:15:19Z","event":"status","from":"active","to":"done","by":"agent_system"}
```

---

### Add / Remove Dependencies

**Current:**
1. Read source `task.json` → add/remove ID in `dependencies[]` → write back
2. Read target `task.json` → add/remove ID in `dependents[]` → write back (bidirectional sync)

**Proposed:**
```bash
# Add a dependency
echo "../01-install-deps" >> .crew/epics/01-bootstrap/tasks/02-fix-build/deps

# Remove a dependency (remove the line)
sed -i '/01-install-deps/d' .crew/epics/01-bootstrap/tasks/02-fix-build/deps
```

One file, one direction. Reverse deps are computed at runtime by the framework scanning all `deps` files.

---

### Inspect Project State

**Current:**
```bash
# Need jq for everything
cat .crew/epics/02-homepage/epic.json | jq '.task_ids'
cat .crew/epics/02-homepage/tasks/01-spec/task.json | jq '.status'
cat .crew/epics/02-homepage/tasks/01-spec/task.json | jq '.attempts | length'
```

**Proposed:**
```bash
# Plain filesystem commands
ls .crew/epics/                                          # list epics
ls .crew/epics/02-homepage/tasks/                        # list tasks
cat .crew/epics/02-homepage/tasks/01-spec/status         # check status
ls .crew/epics/02-homepage/tasks/01-spec/log/ | wc -l    # count attempts
cat .crew/epics/02-homepage/tasks/01-spec/deps            # see dependencies
tree .crew/epics/ -L 3                                   # full overview
```

---

### Summary: Operation Complexity

| Operation | Current (files touched) | Proposed (files touched) |
|---|---|---|
| Create task | 2+ (epic.json + task.json + dependents) | 1-2 (mkdir + task.yaml, optionally deps) |
| Update task config | 1 (task.json — but races with executor) | 1 (task.yaml — no race) |
| Remove task | 2+ (epic.json + dependent tasks) | 1 (rm -rf dir) |
| Remove epic | 2+ (project.json + cross-deps) | 1 (rm -rf dir) |
| Reorder tasks | 1 (epic.json) | 1 (mv dir) + maybe fix deps |
| Move task across epics | 3+ (2 epics + task + deps) | 1 (mv dir) + fix deps |
| Reorder epics | 1 (project.json) | 1 (mv dir) |
| Update status | 1 (task.json — full rewrite) | 1 (status — 4 bytes) |
| Add dependency | 2 (source + target bidirectional) | 1 (deps file, append) |
| Remove dependency | 2 (source + target bidirectional) | 1 (deps file, remove line) |
| Check status | Parse full task.json | `cat status` |

The one trade-off: **rename/move operations can break relative paths in `deps` files.** This is handled by framework validation on load (warn about broken refs) and the `crew renumber` / `crew move` helpers that auto-fix paths.

---

## Benefits

1. **Agents can create tasks with `mkdir` + `echo`** — No JSON serialization, no ID generation, no array surgery on epic.json.

2. **Safe concurrent modifications** — Two agents can add tasks to the same epic simultaneously (different directories, no shared file to conflict on).

3. **Human-editable with basic tools** — `vim task.yaml`, `echo "done" > status`, `echo "../01-setup" >> deps`.

4. **Partial reads** — Check status without loading history. Load config without loading logs. Read deps without parsing task definition.

5. **Git-friendly** — Each file has a single concern, so diffs are clean and meaningful. No more "changed 1 field but the JSON diff shows 50 lines because of array rewriting."

6. **Self-describing** — `tree .crew/epics/` shows you the entire project structure. `cat */tasks/*/status` shows all task states.

7. **Append-only history** — Log files are never rewritten. Safe for concurrent writers. Easy to truncate for cleanup.

8. **Graceful degradation** — Missing files have sensible defaults (no `status` file = `pending`, no `deps` file = no dependencies). You can start with just `mkdir` + `task.yaml` and everything else is optional.

---

## Views (Auto-Generated Documentation)

The current framework auto-generates README.md files at three levels — plan, epic, and task — plus a `state.json` snapshot. These views are regenerated on every `save()` call and via `crew sync`. They render progress bars, dependency trees, execution history, and CLI quick-actions.

### Current View System Problems

1. **Views are coupled to save()** — Every `epic.save()` and `task.save()` triggers a README regeneration. Since save() handles both config changes AND status updates, a task completing triggers a full README rewrite. This creates unnecessary I/O and potential conflicts.

2. **Views read from the same monolith files** — The task README renderer reads `task.json` to extract title, status, attempts, status_history, dependencies. It must parse the entire monolith to render any view.

3. **Views duplicate state** — The plan README contains a tasks table with statuses, the epic README contains the same table, and state.json contains the same data again. Three copies of the same information, regenerated in lockstep.

4. **Views are not composable** — You can't generate a task README without also loading the parent epic and resolving all dependencies by ID. The view layer is tightly coupled to the store layer's ID-based resolution.

### Proposed View Approach

In the new model, views become **optional, lazily-generated overlays** rather than eagerly-regenerated coupled artifacts.

#### Directory Structure with Views

```
.crew/epics/
├── README.md                             # Plan overview (generated)
├── 01-bootstrap/
│   ├── epic.yaml                         # Authored
│   ├── status                            # Framework-owned
│   ├── README.md                         # Epic view (generated)
│   └── tasks/
│       ├── 01-install-deps/
│       │   ├── task.yaml                 # Authored
│       │   ├── PROMPT.md                 # Authored
│       │   ├── status                    # Framework-owned
│       │   ├── deps                      # Authored
│       │   ├── README.md                 # Task view (generated)
│       │   ├── log/                      # Framework-owned
│       │   │   └── 001.jsonl
│       │   └── output/                   # Agent-owned
│       └── 02-fix-build/
│           └── ...
└── 02-homepage/
    └── ...
```

#### Key Changes

**1. Views are derived entirely from the filesystem — no JSON resolution needed**

The view generator walks the directory tree. It doesn't need to "resolve" task IDs or load epic objects:

```typescript
function generateTaskReadme(taskDir: string): string {
  const config = readYaml(path.join(taskDir, 'task.yaml'));
  const status = readStatus(taskDir);
  const deps = readDeps(taskDir);           // relative paths
  const attempts = listAttempts(taskDir);    // count log/ files
  const prompt = readOptional(path.join(taskDir, 'PROMPT.md'));

  // Deps are paths — resolve to titles by reading neighbor task.yaml
  const depDetails = deps.map(depPath => ({
    path: depPath,
    title: readYaml(path.resolve(taskDir, depPath, 'task.yaml'))?.title,
    status: readStatus(path.resolve(taskDir, depPath)),
  }));

  return renderTaskMarkdown({ config, status, deps: depDetails, attempts });
}
```

No store instance needed. No ID lookups. Just filesystem reads.

**2. Regeneration is decoupled from writes**

Instead of regenerating on every `save()`, views are regenerated:

- **On demand:** `crew sync` regenerates all views
- **On status change:** Only the affected task's README + its parent epic's README
- **Not on config edits:** Editing `task.yaml` doesn't trigger a view rebuild. The view is stale until next `crew sync` or next status change. This is fine — views are for consumption, not for correctness.

```typescript
// Status write automatically triggers minimal view update
function setStatus(taskDir: string, status: string, agent: string): void {
  fs.writeFileSync(path.join(taskDir, 'status'), status);

  // Log the transition
  appendToLog(taskDir, { event: 'status', to: status, by: agent });

  // Regenerate only this task's README and parent epic's README
  regenerateTaskReadme(taskDir);
  regenerateEpicReadme(path.dirname(path.dirname(taskDir)));
}
```

**3. state.json becomes a computed snapshot**

`state.json` is generated on demand by scanning the filesystem:

```typescript
function generateStateJson(crewDir: string): CrewState {
  const epics = listEpicDirs(crewDir).map(epicDir => {
    const epic = readYaml(path.join(epicDir, 'epic.yaml'));
    const status = readStatus(epicDir);
    const tasks = listTaskDirs(epicDir).map(taskDir => ({
      path: path.relative(crewDir, taskDir),
      title: readYaml(path.join(taskDir, 'task.yaml'))?.title,
      status: readStatus(taskDir),
    }));
    return { ...epic, status, tasks };
  });
  return { epics, generated_at: new Date().toISOString() };
}
```

No stored task IDs, no epic IDs. The filesystem IS the state.

**4. Views survive destructive operations**

When a task is removed (`rm -rf`), the parent epic README is stale but still valid — it just shows a task that no longer exists. On next `crew sync`, the README is regenerated without the deleted task. No crash, no corruption.

When a task is reordered (`mv`), the view uses the new directory name. Stale README shows old order until regenerated.

#### View Content in New Model

**Task README** renders from:
| Data | Source file | Current source |
|---|---|---|
| Title, type, skills | `task.yaml` | `task.json` |
| Status | `status` | `task.json → status` |
| Prompt | `PROMPT.md` | `PROMPT.md` (same) |
| Dependencies | `deps` → read neighbor `task.yaml` | `task.json → dependencies[]` → store lookup |
| Dependents | Scan sibling `deps` files for back-references | `task.json → dependents[]` |
| Attempt count | `ls log/` | `task.json → attempts.length` |
| Attempt details | Parse `log/001.jsonl` | `task.json → attempts[]` |
| Status history | Parse `log/*.jsonl` for status events | `task.json → status_history[]` |
| Input/Output | `task.yaml → input/output` | `task.json → input/output` |

**Epic README** renders from:
| Data | Source file | Current source |
|---|---|---|
| Title, gates, constraints | `epic.yaml` | `epic.json` |
| Status | `status` | `epic.json → status` |
| Task list | `ls tasks/` | `epic.json → task_ids[]` |
| Task statuses | `tasks/*/status` | Load each task.json |
| Dependency tree | `tasks/*/deps` | `task.json → dependencies[]` |
| Progress stats | Count `tasks/*/status` values | Computed from loaded tasks |

**Plan README** renders from:
| Data | Source file | Current source |
|---|---|---|
| Epic list | `ls epics/` | `project.json → epic_ids[]` |
| Epic details | `epics/*/epic.yaml` + `epics/*/status` | Load each epic.json |
| Task summaries | `epics/*/tasks/*/status` | Load all task.json files |
| Overall progress | Count all status files | Computed from all tasks |

---

## Git as the Versioning Layer

The `.crew/` directory is committed to git. This means **git is the database's version control, recovery mechanism, and debugging tool**. Every format decision must be evaluated through this lens: how does it look in `git diff`? Can I `git bisect` to find when a task broke? Can I `git checkout` to restore a previous state?

### Current Model: Git-Hostile

With monolith JSON files, git operations are painful:

**`git diff` on task.json after a status change:**
```diff
 {
   "id": "task_0mmhcxi0qcvufrr7lzxp",
-  "status": "active",
+  "status": "done",
   "title": "Build component spec for Homepage",
   "attempts": [
     { "started": "2026-03-08T12:17:08.364Z", "duration": 53100, "success": true },
-    { "started": "2026-03-08T12:18:53.383Z", "duration": 35800, "success": true }
+    { "started": "2026-03-08T12:18:53.383Z", "duration": 35800, "success": true },
+    { "started": "2026-03-08T13:05:57.799Z", "duration": 42300, "success": true }
   ],
   "status_history": [
     { "from": "pending", "to": "active", "at": "...", "by": "agent_system" },
-    { "from": "active", "to": "active", "at": "...", "by": "agent_system" }
+    { "from": "active", "to": "active", "at": "...", "by": "agent_system" },
+    { "from": "active", "to": "done", "at": "...", "by": "agent_system" }
   ]
 }
```

One status change touches the status field, appends to attempts[], appends to status_history[]. The diff is 15+ lines for a 1-field change. And `git blame` on this file shows the last-modified commit for every line — useless since every save rewrites the whole file.

**`git log --oneline` for epic.json after adding a task:**
```
a1b2c3d  agent: complete task m2.4
f4e5d6c  agent: start task m2.4           # ← rewrote entire epic.json to add task_id
b7c8d9e  agent: complete task m2.3
```

Every operation rewrites the same file. You can't tell from `git log -p epic.json` which change was a task addition vs a status update.

### Proposed Model: Git-Native

With one-file-per-concern, every git operation works cleanly:

**`git diff` after a status change — touches exactly 2 files:**
```diff
diff --git a/.crew/epics/02-homepage/tasks/04-plan-anim/status b/.crew/epics/02-homepage/tasks/04-plan-anim/status
--- a/.crew/epics/02-homepage/tasks/04-plan-anim/status
+++ b/.crew/epics/02-homepage/tasks/04-plan-anim/status
-active
+done

diff --git a/.crew/epics/02-homepage/tasks/04-plan-anim/log/003.jsonl b/.crew/epics/02-homepage/tasks/04-plan-anim/log/003.jsonl
new file mode 100644
+{"event":"status","to":"done","by":"agent_system","at":"2026-03-08T13:05:57Z"}
+{"event":"attempt","started":"...","duration":42300,"success":true}
```

That's it. One word changed in `status`, one new log file. The config (`task.yaml`) is untouched.

#### Git Operations That Now Work Properly

**`git log -- .crew/epics/02-homepage/tasks/04-plan-anim/status`**
Shows every status change for this specific task. Clean, single-line diffs.

**`git log -- .crew/epics/02-homepage/tasks/04-plan-anim/task.yaml`**
Shows only config changes (title, type, skills). Never polluted by status updates or log entries.

**`git blame .crew/epics/02-homepage/tasks/04-plan-anim/deps`**
Shows who added each dependency and when. Each line is one dep path.

**`git bisect` to find when a task broke:**
```bash
git bisect start
git bisect bad HEAD
git bisect good v1.0
# Git checks out each commit; test script checks:
cat .crew/epics/02-homepage/tasks/04-plan-anim/status
# Finds exact commit where status went from "done" to "failed"
```

**`git checkout HEAD~3 -- .crew/epics/02-homepage/tasks/04-plan-anim/status`**
Restore a single task's status without touching anything else. With JSON monolith, restoring one field means reverting the entire file.

**`git diff main..feature -- .crew/epics/`**
Shows exactly what changed on a feature branch:
```
M  .crew/epics/02-homepage/tasks/05-implement-hero/status     # status changed
A  .crew/epics/02-homepage/tasks/09-add-footer/task.yaml      # new task added
A  .crew/epics/02-homepage/tasks/09-add-footer/PROMPT.md
A  .crew/epics/02-homepage/tasks/09-add-footer/status
D  .crew/epics/01-bootstrap/tasks/03-unused/task.yaml         # task removed
```

Each file tells you exactly what kind of change happened. No parsing needed.

**`git stash` / `git stash pop` for task state:**
An agent can stash in-progress work, switch to another task, then pop back. With monolith JSON, stashing causes merge conflicts because the same `task.json` was modified by both tasks.

#### .gitignore Strategy

Not everything belongs in git. Generated views and runtime state should be excluded:

```gitignore
# .crew/.gitignore

# Generated views — regenerate with `crew sync`
.crew/epics/README.md
.crew/epics/*/README.md
.crew/epics/*/tasks/*/README.md
.crew/state.json

# Runtime locks
.crew/*.lock
```

This keeps git history clean — only authored config, statuses, deps, and logs are versioned. Views are derived artifacts that can always be regenerated.

Alternatively, views CAN be committed if the team wants them browsable on GitHub without running `crew sync`. The trade-off is noisier diffs. This should be a per-project choice via `.crew/config.yaml`:

```yaml
views:
  commit: false    # default: don't commit generated READMEs
  # commit: true   # opt-in: commit READMEs for GitHub browsability
```

#### Merge Conflict Resolution

With the monolith model, any concurrent modification to the same epic/task causes a JSON merge conflict that requires manual resolution (or custom merge drivers).

With one-file-per-concern:

| Scenario | Monolith (task.json) | Filesystem-native |
|---|---|---|
| Two agents update different tasks in same epic | Conflict on epic.json (task_ids array) | No conflict — different directories |
| Agent updates status while another edits config | Conflict on task.json | No conflict — `status` vs `task.yaml` are separate files |
| Two agents append to history | Conflict on attempts[] array | No conflict — different `log/NNN.jsonl` files |
| Agent adds dep while another removes one | Conflict on deps array in task.json | Conflict on `deps` file — but it's a simple text file where each line is a path, so git auto-merge usually succeeds |

The only realistic conflict scenario is two writers editing `task.yaml` or `deps` simultaneously, which is rare and produces clean, human-readable conflicts.

---

## Open Questions

1. **YAML vs TOML vs keep JSON?** — YAML is proposed for authored files because it's more human-friendly. JSON could be kept if tooling compatibility matters more.

2. **Atomic status transitions** — The `status` file approach is simple but doesn't prevent two writers from racing. Should we use file locking, or is last-write-wins acceptable given that the executor is the only writer in practice?

3. **Backward reference integrity** — When a task directory is renamed, `deps` files pointing to the old name break. Should the framework validate deps on load and warn, or auto-fix?

4. **Global event log** — The `events/` directory currently uses per-agent JSONL files. Should it stay as-is or move to per-epic logs for better locality?
