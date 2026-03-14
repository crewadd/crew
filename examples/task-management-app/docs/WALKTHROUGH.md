# Task Management App - Execution Walkthrough

This guide walks you through running the Task Management App example and observing Crew's orchestration in action.

## Quick Start

```bash
cd examples/task-management-app
npm install
npx crew plan init
npx crew run
```

## What to Watch For

### 1. Initialization

When you run `npx crew plan init`:
- Plan is loaded from `.crew/setup/planning/index.ts`
- Dependency graph is built (5 epics, 20+ tasks)
- State is saved to `.crew/state.json`

### 2. Epic 1: Foundation (Sequential)

**Tasks run one after another:**
1. Initialize monorepo structure
2. Setup TypeScript configuration
3. Define database schema

**Observe:**
- Files created in `packages/backend/` and `packages/frontend/`
- TypeScript compilation check runs
- Drizzle schema generated

### 3. Epic 2 & 3: Parallel Execution

**Epic 2 (Backend) and Epic 3 (Frontend) run simultaneously!**

#### Epic 2: Backend
- Express server setup
- Auth module (parallel) + CRUD API (parallel)
- Database integration (waits for both - fan-in pattern)

#### Epic 3: Frontend
- Vite + React setup
- UI components (auth, task list, detail - all parallel)
- API integration + Styling (both wait for UI components)

**Observe:**
- Console shows multiple tasks running at once
- Progress updates from different epics interleaved
- Dependency constraints enforced (database waits for auth + CRUD)

### 4. Epic 4: Integration (After 2+3 Complete)

**Tests and documentation run in parallel:**
- E2E tests with Playwright
- API documentation (OpenAPI)
- Error handling and logging

**Observe:**
- AutoHarness synthesis for test validation
- All three tasks start simultaneously
- Quality gates validate test coverage

### 5. Epic 5: Deployment (Optional)

**Advanced feature: incremental planning with yields**
- Docker config task discovers services
- Dynamically spawns container build tasks
- Each service gets its own build task

**Observe:**
- Initial task completes
- New tasks appear (build-backend, build-frontend, build-database)
- Each builds and validates its container

## Exploring Generated Files

After successful execution, explore:

```
packages/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   ├── auth/                 # JWT authentication
│   │   ├── api/                  # Task CRUD endpoints
│   │   └── db/                   # Database repositories
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.tsx               # Main app component
    │   ├── components/
    │   │   ├── auth/             # Login/register forms
    │   │   └── tasks/            # Task components
    │   ├── api/                  # API client
    │   └── hooks/                # React hooks
    └── package.json
```

## Observing Execution State

### Progress Log

```bash
tail -f .crew/progress.jsonl
```

Watch task state transitions in real-time.

### State File

```bash
cat .crew/state.json | jq
```

See current state, completed tasks, and pending work.

### Epic Directories

```bash
ls .crew/epics/
```

Each epic gets its own directory with task metadata.

## Testing Features

### Interrupt and Resume

```bash
# Start execution
npx crew run

# Press Ctrl+C to interrupt

# Resume from checkpoint
npx crew run
```

Crew resumes from the exact point of interruption.

### Retry on Failure

Introduce an error to watch automatic retry:
1. Let a task start
2. Observe check failure
3. Watch agent receive feedback
4. See retry with corrections
5. Verify eventual success (max 3-5 attempts)

### Skills in Action

Examine how skills work:

```bash
# View a skill
cat .crew/skills/auth-jwt/SKILL.md

# Compare to agent persona
cat .crew/setup/agents/backend-security.md
```

**Pattern:**
- Agent defines WHO (role, priorities)
- Skill defines WHAT (patterns, best practices)

## Key Observations

### Parallel Execution

Epic 2 and Epic 3 logs will interleave:
```
[Epic 2] Starting auth-module
[Epic 3] Starting auth-ui
[Epic 2] auth-module: Installing dependencies
[Epic 3] auth-ui: Creating LoginForm component
```

### Fan-in Pattern

Database integration waits for both auth and CRUD:
```
[Epic 2] auth-module: ✓ Complete
[Epic 2] crud-api: ✓ Complete
[Epic 2] db-integration: Starting (deps satisfied)
```

### Quality Gates

Watch automatic validation:
```
[Task] Running check: tsc
[Task] ✓ TypeScript compilation passed
[Task] Running check: Verify auth endpoints...
[Task] ✓ Auth endpoints validated
```

### AutoHarness

E2E tests use AI-synthesized validators:
```
[Task e2e-tests] Synthesizing test validator...
[Task e2e-tests] ✓ Harness generated
[Task e2e-tests] Running validation...
[Task e2e-tests] ✓ Test coverage verified
```

## Troubleshooting

### Tasks Not Running in Parallel

Check dependencies - tasks with `.deps()` must wait for those to complete.

### Check Failures

View task details:
```bash
cat .crew/epics/<epic-name>/<task-id>/todo.yaml
```

### State Corruption

Reinitialize:
```bash
rm -rf .crew/state.json
npx crew plan init
npx crew run
```

## Learning Path

1. **First run:** Just watch it execute
2. **Second run:** Interrupt and resume
3. **Modify:** Change a task prompt and re-run
4. **Extend:** Add a new task to an epic
5. **Create:** Build your own epic

## What Makes This Different

Traditional build tools:
- Define imperative steps
- Manual dependency management
- No automatic retry
- No specialized agents
- No crash recovery

Crew:
- Declarative task graph
- Automatic constraint solving
- Built-in quality gates
- Multi-agent orchestration
- Crash-safe by design
