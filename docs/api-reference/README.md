# API Reference

**Complete TypeScript API documentation for all Crew interfaces.**

This section provides detailed API documentation extracted from source code, including types, interfaces, classes, and methods.

## In This Section

### [Types](./types.md)
Core TypeScript type definitions and interfaces.

### [TaskBuilder](./task-builder.md)
Complete TaskBuilder fluent API reference.

### [EpicBuilder](./epic-builder.md)
Complete EpicBuilder fluent API reference.

### [PlanBuilder](./plan-builder.md)
Complete PlanBuilder (ProjectBuilder) fluent API reference.

### [Orchestrator](./orchestrator.md)
ProjectOrchestrator and EpicOrchestrator API.

### [Store API](./store-api.md)
HierarchicalStore, FsStore, and storage interfaces.

### [Verifier API](./verifier-api.md)
Verifier, Check interfaces, and check plugin API.

### [Session API](./session-api.md)
Session management and resumability interfaces.

### [Config Loader](./config-loader.md)
Configuration file loading and validation.

---

## Quick Navigation

### Core Builders

- **[TaskBuilder](./task-builder.md)** - Define tasks
- **[EpicBuilder](./epic-builder.md)** - Group tasks
- **[PlanBuilder](./plan-builder.md)** - Compose projects

### Execution

- **[Orchestrator](./orchestrator.md)** - Run projects
- **[Session API](./session-api.md)** - Manage execution state

### Storage

- **[Store API](./store-api.md)** - Persist state

### Verification

- **[Verifier API](./verifier-api.md)** - Quality gates

### Configuration

- **[Config Loader](./config-loader.md)** - Load settings
- **[Types](./types.md)** - All type definitions

---

## Usage Patterns

### Type-Safe Task Definition

```typescript
import { TaskBuilder, TaskConfig } from '@milomit/crew';

const config: TaskConfig = {
  id: 'my-task',
  description: 'Do something',
  checks: [
    { name: 'file-exists', config: 'output.txt' }
  ]
};
```

### Custom Executor

```typescript
import { Executor, Task, TaskContext } from '@milomit/crew';

class MyExecutor implements Executor {
  async execute(task: Task, ctx: TaskContext): Promise<void> {
    // Implementation
  }
}
```

### Custom Check

```typescript
import { Check, CheckResult, TaskContext } from '@milomit/crew';

const myCheck: Check = async (config: any, ctx: TaskContext): Promise<CheckResult> => {
  return { pass: true, message: 'Check passed' };
};
```

### Custom Store

```typescript
import { Store } from '@milomit/crew';

class MyStore implements Store {
  async read<T>(key: string): Promise<T | null> { /* ... */ }
  async write<T>(key: string, value: T): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  async list(prefix?: string): Promise<string[]> { /* ... */ }
}
```

---

## Type Hierarchy

### Core Types

```
Project
├── Epic[]
│   ├── Task[]
│   │   ├── Check[]
│   │   ├── Hook[]
│   │   └── Context
│   └── Constraints
└── Config
```

### Execution Flow

```
Orchestrator
├── SessionManager
│   └── Session
├── Store
│   └── HierarchicalStore
│       └── FsStore
└── Verifier
    └── CheckRegistry
```

---

## Import Paths

### Main Entry Point

```typescript
import { crew } from '@milomit/crew';
```

### Type Imports

```typescript
import type {
  Project,
  Epic,
  Task,
  TaskBuilder,
  Check,
  CheckResult,
  TaskContext,
  Store,
  Executor
} from '@milomit/crew';
```

### Plugin Imports

```typescript
import {
  typescriptPlugin,
  nextjsPlugin
} from '@milomit/crew/plugins';
```

---

## Next Steps

- **Explore types**: [Types](./types.md)
- **Builder APIs**: [TaskBuilder](./task-builder.md), [EpicBuilder](./epic-builder.md)
- **Execution**: [Orchestrator](./orchestrator.md)
- **Storage**: [Store API](./store-api.md)

---

[← Back to Documentation Home](../README.md)
