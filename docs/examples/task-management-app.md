# Task Management App - Comprehensive Crew Example

**A complete, production-ready example demonstrating the full power of the Crew framework.**

## Overview

This example orchestrates the creation of a **full-stack task management application** from scratch, showcasing every major Crew feature through a realistic, multi-epic project.

**What makes this example special:**
- It's not a toy demo—it's a real application you can deploy
- Demonstrates ALL 8 core Crew capabilities
- Shows advanced patterns you won't find in basic tutorials
- Production-ready code with testing, Docker, and CI/CD

## What Gets Built

A complete task management application with:

- **Backend:** Express REST API with JWT authentication and PostgreSQL database
- **Frontend:** React + Vite application with TypeScript
- **Database:** PostgreSQL with Drizzle ORM and migrations
- **Testing:** Playwright E2E tests with AutoHarness validation
- **Deployment:** Docker Compose configuration with multi-stage builds
- **Documentation:** OpenAPI/Swagger specification

## Features Demonstrated

### 1. Three-Level Hierarchy
```
Project: Task Management App
├── Epic 1: Project Foundation
│   ├── Task: Initialize Monorepo
│   ├── Task: Setup TypeScript
│   └── Task: Setup Database Schema
├── Epic 2: Backend Development
│   ├── Task: Express Setup
│   ├── Task: Authentication (parallel)
│   ├── Task: CRUD API (parallel)
│   └── Task: Database Integration (fan-in)
├── Epic 3: Frontend Development (parallel with Epic 2!)
│   ├── Task: Vite Setup
│   ├── Task: Auth UI (parallel)
│   ├── Task: Task List UI (parallel)
│   ├── Task: Task Detail UI (parallel)
│   ├── Task: API Integration (fan-in)
│   └── Task: Styling (parallel)
├── Epic 4: Integration & Testing
│   ├── Task: E2E Tests (AutoHarness)
│   ├── Task: API Documentation (parallel)
│   └── Task: Error Handling (parallel)
└── Epic 5: Deployment
    ├── Task: Docker Config (yields!)
    ├── Task: Environment Config
    └── Task: Deployment Scripts
```

### 2. Quality Gates with Automatic Retry

Every task has validation that must pass:

```typescript
.addTask('auth', 'Authentication')
  .check('tsc')  // TypeScript compilation
  .check({ cmd: 'npm test' })  // Tests pass
  .check({ prompt: 'Verify JWT tokens have expiration' })  // AI check
  .attempts(5)  // Retry up to 5 times on failure
```

**When checks fail:**
1. Agent receives detailed error feedback
2. Agent attempts to fix the issue
3. Checks run again
4. Process repeats until success or max attempts reached

### 3. Constraint-Based Parallel Execution

**Backend and Frontend epics run simultaneously!**

```
Epic 1: Foundation
│
├─→ Epic 2: Backend ──────────┐
│   (Express, Auth, API, DB)  │
│                              ├─→ Epic 4: Integration
├─→ Epic 3: Frontend ─────────┘     (E2E Tests, Docs)
    (React, Components, API)         │
                                     └─→ Epic 5: Deployment
```

Within epics, tasks also run in parallel when dependencies allow:

```typescript
// Epic 2: These run simultaneously
Task 2.2: Auth Module (parallel)
Task 2.3: CRUD API (parallel)
├─→ Both complete
    └─→ Task 2.4: DB Integration (fan-in)
```

### 4. Multi-Agent Workflows

Seven specialized agents handle different domains:

| Agent | Expertise | Tasks |
|-------|-----------|-------|
| `backend/auth-specialist` | JWT, bcrypt, security | Authentication module |
| `backend/api-specialist` | REST API design | Express setup, CRUD endpoints |
| `backend/database-specialist` | PostgreSQL, Drizzle ORM | Schema, migrations, repositories |
| `frontend/react-specialist` | React, hooks, components | UI components |
| `frontend/ui-specialist` | Tailwind, design systems | Styling |
| `qa/testing-specialist` | Playwright, E2E testing | Test suites |
| `devops/documentation-specialist` | OpenAPI, deployment | API docs, Docker |

Each agent has a specialized persona defined in `.crew/setup/agents/`:

```markdown
# backend-auth-specialist.md
You are a security-focused backend developer specializing in
authentication and authorization systems.

## Expertise
- JWT token generation and validation
- Password hashing with bcrypt
- Session management
- OWASP security guidelines
...
```

### 5. Incremental Planning with Yields

Epic 5 demonstrates dynamic task spawning:

```typescript
.addTask('docker-config', 'Docker Configuration')
  .yields(async (ctx, result) => {
    // After creating docker-compose.yml, analyze services
    const services = ['backend', 'frontend', 'database'];

    // Spawn container build tasks dynamically
    return services.map(svc =>
      ctx.createTask(`build-${svc}`, `Build ${svc} container`)
        .check({ cmd: `docker build -t ${svc} ...` })
    );
  })
```

**What happens:**
1. Task creates docker-compose.yml
2. Crew pauses and spawns 3 new tasks
3. Container build tasks run in parallel
4. Original task completes after all spawned tasks finish

### 6. AutoHarness Validation

E2E testing task uses AI-synthesized validators:

```typescript
.addTask('e2e-tests', 'End-to-End Tests')
  .harness()  // Crew generates JavaScript validation code
```

**AutoHarness:**
- AI analyzes test files
- Synthesizes JavaScript code to check coverage
- Validates tests cover: registration, login, CRUD operations
- Runs automatically as a quality gate

### 7. Crash-Safe Resumability

All execution state persists to `.crew/`:

```bash
# Start execution
npx crew run

# Press Ctrl+C to interrupt
^C

# State is saved continuously
cat .crew/state.json
cat .crew/progress.jsonl

# Resume from exact checkpoint
npx crew run
# Picks up where it left off!
```

### 8. Filesystem Transparency

Every piece of state is human-readable:

```
.crew/
├── state.json              # Current execution state
├── progress.jsonl          # Append-only execution log
└── epics/
    ├── 01-foundation/
    │   ├── epic.yaml       # Epic metadata
    │   └── tasks/
    │       ├── init-monorepo/
    │       │   ├── task.yaml    # Task definition
    │       │   ├── task.md      # Agent prompt
    │       │   └── todo.yaml    # Check results
    │       └── ...
    ├── 02-backend/
    ├── 03-frontend/
    └── ...
```

Use `ls` and `cat` to explore everything. No databases, no black boxes.

## Running the Example

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (for deployment)
- PostgreSQL (optional, can use Docker)

### Quick Start

```bash
# Navigate to example
cd examples/task-management-app

# Install dependencies
npm install

# Initialize the plan
npx crew plan init

# Run the orchestration
npx crew run

# Watch as Crew builds your full-stack app!
```

### Execution Timeline

**Epic 1: Foundation** (~3-5 minutes)
- Monorepo structure
- TypeScript configuration
- Database schema

**Epic 2 + 3: Backend & Frontend** (~15-20 minutes, parallel!)
- Backend: Express, auth, API, database
- Frontend: React, components, styling
- **Both run simultaneously**

**Epic 4: Integration** (~5-8 minutes)
- E2E tests
- API documentation
- Error handling

**Epic 5: Deployment** (~4-6 minutes)
- Docker configuration
- Environment setup
- CI/CD scripts

**Total:** ~25-40 minutes

## Exploring Results

### Generated Application

```
packages/
├── backend/
│   ├── src/
│   │   ├── index.ts           # Express server
│   │   ├── auth/              # JWT authentication
│   │   ├── api/               # REST endpoints
│   │   └── db/                # Database layer
│   ├── tests/                 # Unit tests
│   ├── Dockerfile
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── auth/          # Login/Register
    │   │   └── tasks/         # Task UI
    │   ├── api/               # API client
    │   └── hooks/             # React hooks
    ├── tests/                 # E2E tests
    ├── Dockerfile
    └── package.json
```

### Running the App

```bash
# Option 1: Docker Compose
docker-compose up -d

# Option 2: Manual
# Terminal 1: Backend
cd packages/backend
npm install
npm run dev

# Terminal 2: Frontend
cd packages/frontend
npm install
npm run dev

# Terminal 3: Run tests
npx playwright test
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Documentation: http://localhost:3000/api-docs

## Code Highlights

### The Main Plan Definition

The entire orchestration is defined in `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx: PlanContext) {
  const plan = ctx.createPlan('task-management-app', 'Task Management App');

  // Epic 1: Sequential foundation
  plan.addEpic(
    ctx.createEpic('foundation', 'Project Foundation')
      .addTask('init-monorepo', 'Initialize Monorepo')
        .prompt('Create monorepo with backend and frontend packages')
        .check({ cmd: 'test -f packages/backend/package.json' })
      .addTask('setup-typescript', 'Setup TypeScript')
        .deps(['init-monorepo'])
        .check('tsc')
      // ...
  );

  // Epic 2: Backend (parallel tasks, fan-in pattern)
  plan.addEpic(
    ctx.createEpic('backend', 'Backend Development', { deps: ['foundation'] })
      .addTask('express-setup', 'Express Server')
        .skill('backend/api-specialist')
        .check('tsc')
      .addTask('auth-module', 'Authentication')
        .deps(['express-setup'])
        .skill('backend/auth-specialist')
        .check('tsc')
        .check({ prompt: 'Verify JWT tokens have expiration' })
        .attempts(5)
      .addTask('crud-api', 'CRUD API')
        .deps(['express-setup'])
        .skill('backend/api-specialist')
      .addTask('db-integration', 'Database Integration')
        .deps(['auth-module', 'crud-api'])  // Fan-in!
        .skill('backend/database-specialist')
  );

  // Epic 3: Frontend (parallel with Epic 2!)
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Development', { deps: ['foundation'] })
      .addTask('vite-setup', 'Vite + React')
      .addTask('auth-ui', 'Auth Components')
        .deps(['vite-setup'])
        .skill('frontend/react-specialist')
      // ... more parallel UI tasks
  );

  // Epic 4: Integration (waits for 2 + 3)
  plan.addEpic(
    ctx.createEpic('integration', 'Integration', { deps: ['backend', 'frontend'] })
      .addTask('e2e-tests', 'E2E Tests')
        .harness()  // AutoHarness validation!
  );

  // Epic 5: Deployment (yields!)
  plan.addEpic(
    ctx.createEpic('deployment', 'Deployment', { deps: ['integration'] })
      .addTask('docker-config', 'Docker')
        .yields(async (ctx, result) => {
          // Spawn container build tasks dynamically
        })
  );

  return plan.build();
}
```

This single file demonstrates every Crew feature!

## Learning Objectives

After running this example, you'll understand:

✅ How to structure large multi-epic projects
✅ When and how to use parallel execution
✅ How to implement quality gates with automatic retry
✅ How to route tasks to specialized agents
✅ How to use incremental planning with yields
✅ How to validate with AutoHarness
✅ How Crew's resumability works in practice
✅ How to explore execution state in `.crew/`

## Customization Ideas

Adapt this example for your own projects:

### Backend Variations
- Replace Express with Fastify or Koa
- Use MySQL or MongoDB instead of PostgreSQL
- Add GraphQL API instead of REST
- Implement WebSocket real-time updates

### Frontend Variations
- Use Next.js instead of Vite
- Replace React with Vue or Svelte
- Add state management (Redux, Zustand)
- Implement mobile app with React Native

### DevOps Variations
- Add Kubernetes manifests
- Implement CI/CD with GitHub Actions
- Add monitoring with Prometheus
- Implement feature flags

### New Epics
- Epic 6: Monitoring & Observability
- Epic 7: Performance Optimization
- Epic 8: Security Hardening
- Epic 9: Mobile App

## Related Documentation

### Core Concepts
- [Projects, Epics, Tasks](../core-concepts/projects-epics-tasks.md)
- [Quality Gates](../core-concepts/checks-and-quality-gates.md)
- [Sessions and Resumability](../core-concepts/sessions-and-resumability.md)

### Advanced Features
- [Multi-Agent Workflows](../guides/multi-agent-workflows.md)
- [Parallel Execution](../guides/parallel-execution.md)
- [Incremental Planning (Yields)](../task-api/yields-incremental-planning.md)
- [AutoHarness Validation](../HARNESS.md)

### API Reference
- [Plan Builder](../api-reference/plan-builder.md)
- [Epic Builder](../api-reference/epic-builder.md)
- [Task Builder](../api-reference/task-builder.md)

## Files to Study

| File | Purpose | Key Concepts |
|------|---------|--------------|
| `README.md` | User guide | How to run, features demonstrated |
| `.crew/setup/planning/index.ts` | Plan definition | All Crew features in one file |
| `.crew/setup/agents/*.md` | Agent personas | Multi-agent routing |
| `docs/WALKTHROUGH.md` | Execution guide | Step-by-step epic breakdown |
| `docs/ARCHITECTURE.md` | System design | Generated app architecture |

## Troubleshooting

### "Task failed after max attempts"
Check `.crew/epics/{epic}/tasks/{task}/todo.yaml` for check failures.

### "Cannot resume execution"
Ensure `.crew/state.json` and `.crew/progress.jsonl` are intact.

### "Parallel execution not working"
Verify tasks have no circular dependencies.

### Generated app not running
Check that all dependencies are installed:
```bash
npm install
cd packages/backend && npm install
cd ../frontend && npm install
```

## Success Metrics

You'll know this example succeeded if:

✅ Generated app runs and works
✅ Backend API responds at http://localhost:3000
✅ Frontend loads at http://localhost:5173
✅ E2E tests pass
✅ You can interrupt and resume execution
✅ You can see parallel execution in logs
✅ All quality gates passed
✅ You understand the 8 key Crew features

## Next Steps

1. **Run it:** Follow the Quick Start above
2. **Explore it:** Read generated code, examine `.crew/` state
3. **Modify it:** Change prompts, add tasks, customize agents
4. **Adapt it:** Use patterns for your own projects

---

This is the **flagship Crew example**. It's designed to be your reference for production-grade orchestration.

[View Full Example Source →](../../examples/task-management-app/)

[← Back to Examples](./README.md)
