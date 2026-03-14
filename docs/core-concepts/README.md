# Core Concepts

**Understand the fundamental building blocks and mental models of the Crew framework.**

This section covers the essential concepts you need to master to work effectively with Crew.

## In This Section

### [Architecture Overview](./architecture.md)
High-level system design, reactive event loop, and component interaction.

### [Projects, Epics & Tasks](./projects-epics-tasks.md)
The three-level hierarchy at the heart of Crew's organizational model.

### [Filesystem Store](./filesystem-store.md)
How Crew persists all state to disk in the `.crew/` directory for transparency and debugging.

### [Checks & Quality Gates](./checks-and-quality-gates.md)
The verification system that ensures task outputs meet requirements before proceeding.

### [Sessions & Resumability](./sessions-and-resumability.md)
Crash-safe execution: how Crew allows you to pick up exactly where you left off.

### [Constraint Engine](./constraint-engine.md)
Automatic dependency resolution, scheduling, and parallelization of tasks.

### [Execution Flow](./execution-flow.md)
Step-by-step breakdown of how the orchestrator executes your project.

---

## Prerequisites

Before reading this section, you should:

- Complete [Getting Started](../getting-started/README.md)
- Understand basic TypeScript
- Have built at least one simple Crew project

---

## Key Mental Models

### The Hierarchy

```
Project
├── Epic 1 (sequential or parallel)
│   ├── Task 1.1
│   ├── Task 1.2
│   └── Task 1.3
├── Epic 2
│   ├── Task 2.1
│   └── Task 2.2
└── Epic 3
    └── Task 3.1
```

### The Reactive Loop

```
1. Plan Phase → Agent plans task execution
2. Execute Phase → Agent performs work
3. Check Phase → Quality gates verify output
4. Pass → Move to next task
5. Fail → Retry with feedback (up to max attempts)
```

### The Filesystem Contract

```
.crew/
├── state.json           # Current execution state
├── sessions/            # Resumable session data
├── tasks/               # Task-level state
├── epics/               # Epic-level state
└── logs/                # Execution logs
```

---

## Core Principles

### 1. **Filesystem-Native**
All state lives on disk. You can inspect, version control, and debug `.crew/` at any time.

### 2. **Quality-First**
Tasks don't complete until checks pass. The framework enforces correctness.

### 3. **Resumable by Default**
Crashes are expected. Crew always saves enough state to resume safely.

### 4. **Declarative over Imperative**
Define *what* you want, not *how* to do it. Agents figure out the how.

### 5. **Transparent Execution**
Everything is observable. Logs, state, and agent interactions are all visible.

---

## Learning Path

**Recommended reading order:**

1. **[Projects, Epics & Tasks](./projects-epics-tasks.md)** - Start here to understand the hierarchy
2. **[Execution Flow](./execution-flow.md)** - See how orchestration works
3. **[Checks & Quality Gates](./checks-and-quality-gates.md)** - Learn the verification system
4. **[Filesystem Store](./filesystem-store.md)** - Understand state persistence
5. **[Sessions & Resumability](./sessions-and-resumability.md)** - Master crash recovery
6. **[Constraint Engine](./constraint-engine.md)** - Advanced scheduling
7. **[Architecture Overview](./architecture.md)** - Complete system picture

---

## Quick Reference

### Creating the Hierarchy

```typescript
const project = crew.project('my-project')
  .addEpic('setup', (epic) => epic
    .parallel() // Tasks run in parallel
    .addTask('install-deps', ...)
    .addTask('create-config', ...)
  )
  .addEpic('build', (epic) => epic
    .dependsOn('setup') // Waits for setup to complete
    .addTask('compile', ...)
  );
```

### Adding Quality Gates

```typescript
.addTask('create-api', (task) => task
  .does('Create REST API with user endpoints')
  .check('command', { cmd: 'npm test' })
  .check('file-exists', 'src/api/users.ts')
  .check('file-contains', { path: 'src/api/users.ts', content: 'export class UserAPI' })
)
```

### Resuming After Crash

```bash
# Crew automatically resumes from last checkpoint
npx crew run --resume
```

---

## Next Steps

After understanding core concepts:

- **Master task definition**: [Task API](../task-api/README.md)
- **Deep dive on checks**: [Checks System](../checks/README.md)
- **Learn advanced patterns**: [Guides](../guides/README.md)
- **Explore API details**: [API Reference](../api-reference/README.md)

---

[← Back to Documentation Home](../README.md)
