# Task Management App - Crew Example

Full-stack task management app built with Crew's orchestration.

## Quick Start

```bash
cd examples/task-management-app
npm install
npx crew plan init
npx crew run
```

## What It Builds

- **Backend:** Express + PostgreSQL + JWT auth
- **Frontend:** React + Vite + Tailwind
- **Testing:** Playwright E2E tests
- **Deployment:** Docker configuration

## Features Demonstrated

1. **Parallel Execution** - Backend and frontend built simultaneously
2. **Skills System** - Modular domain expertise (auth-jwt, rest-api-design, etc.)
3. **Quality Gates** - Automatic validation and retry
4. **Multi-Agent Routing** - Specialized agents per domain
5. **Incremental Planning** - Dynamic task spawning with yields
6. **AutoHarness** - AI-synthesized test validators
7. **Crash-Safe Resumability** - Interrupt and resume from checkpoint

## Project Structure

```
.crew/
├── setup/
│   └── planning/index.ts      # Main plan definition
├── agents/                    # Short personas (~10 lines)
│   ├── backend-security.md
│   ├── backend-api.md
│   ├── database-engineer.md
│   ├── frontend-react.md
│   └── qa-engineer.md
└── skills/                    # Domain expertise
    ├── auth-jwt/
    ├── rest-api-design/
    ├── database-schema-design/
    ├── react-components/
    ├── tailwind-styling/
    ├── playwright-testing/
    └── docker-deployment/
```

## Execution Flow

### Epic 1: Foundation (Sequential)
- Initialize monorepo structure
- Setup TypeScript configuration
- Define database schema

### Epic 2: Backend (Parallel with Epic 3)
- Express server setup
- Authentication module (JWT + bcrypt)
- Task CRUD API
- Database integration (fan-in pattern)

### Epic 3: Frontend (Parallel with Epic 2)
- Vite + React setup
- UI components (auth, task list, task detail)
- API integration
- Tailwind styling

### Epic 4: Integration (Waits for Epic 2 + 3)
- E2E tests with Playwright
- API documentation (OpenAPI)
- Error handling and logging

### Epic 5: Deployment (Optional)
- Docker configuration
- Environment setup
- Deployment scripts

## Customization

- Modify task prompts in `.crew/setup/planning/index.ts`
- Edit skills in `.crew/skills/*/SKILL.md`
- Adjust agent personas in `.crew/agents/*.md`

## Documentation

- [Walkthrough](./docs/WALKTHROUGH.md) - Execution guide
- [Expected Output](./expected-output/) - Reference implementation

## Key Patterns

**Skills vs Agents:**
- **Skills** define domain expertise (WHAT to know)
- **Agents** define roles and priorities (WHO to be)

**Example:**
```typescript
.skill('auth-jwt')           // Load JWT authentication patterns
.agent('backend-security')   // Use security-focused persona
```

**Fan-in Pattern:**
```typescript
.addTask('db-integration')
  .deps(['auth-module', 'crud-api'])  // Waits for both
```

**Parallel Execution:**
```typescript
// No deps = runs in parallel with other unconstrained tasks
.addTask('auth-ui').deps(['vite-setup'])
.addTask('task-list-ui').deps(['vite-setup'])  // Parallel with auth-ui
```

## Generated Output

After running, you'll have:
- `packages/backend/` - Express API with auth and database
- `packages/frontend/` - React app with components and styling
- `tests/` - Playwright E2E tests
- Docker configuration files
- Database migrations
- API documentation

## Learning Path

1. **Observer:** Just run and watch the orchestration
2. **Modifier:** Change task prompts and agent personas
3. **Extender:** Add new epics and custom quality gates

## Why This Example?

This demonstrates Crew's unique value:
- Manages complex multi-epic dependencies
- Coordinates specialized agents
- Ensures quality through automatic validation
- Provides crash-safe execution
- Maintains transparent, human-readable state
