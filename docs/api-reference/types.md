# TypeScript Type Reference

**Complete TypeScript type definitions for Crew.**

[[docs](../README.md) > [api-reference](./README.md) > types]

---

## Core Types

```typescript
// Task definition
interface TaskDef {
  id?: string;
  title: string;
  type?: string;
  prompt?: string;
  deps?: string[];
  skills?: string[];
  inputs?: string[];
  outputs?: string[];
  checks?: CheckRef[];
  maxAttempts?: number;
  when?: string | ((vars: Record<string, unknown>) => boolean);
}

// Epic definition
interface EpicDef {
  title: string;
  tasks: TaskDef[];
}

// Task result
interface TaskResult {
  taskId: string;
  success: boolean;
  durationMs: number;
  output?: string;
  error?: string;
}

// Project status
interface ProjectStatus {
  name: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  epics: CompoundEpic[];
  tasksCompleted: number;
  tasksFailed: number;
}
```

---

## See Also

- [Task Builder API](./task-builder.md) - Task construction
- [Core Concepts](../core-concepts/projects-epics-tasks.md) - Type concepts

---

[← Back to API Reference](./README.md) | [Documentation Home](../README.md)
