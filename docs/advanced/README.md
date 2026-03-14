# Advanced Topics

**Deep dives into Crew internals and advanced customization.**

This section covers advanced features for power users, framework integrators, and contributors.

## In This Section

### [Custom Executors](./custom-executors.md)
Write programmable executors for specialized task execution.

### [Custom Stores](./custom-stores.md)
Implement alternative storage backends (database, S3, etc.).

### [Event Streaming](./event-streaming.md)
Subscribe to orchestrator events for dashboards and monitoring.

### [Constraint Solver](./constraint-solver.md)
Deep dive into the dependency resolution and scheduling algorithm.

### [Agent Configuration](./agent-configuration.md)
Configure AI providers, backends, models, and parameters.

### [Prompt Engineering](./prompt-engineering.md)
Write effective prompts for better agent performance.

### [Performance Tuning](./performance-tuning.md)
Optimize execution speed, cost, and resource usage.

### [Extending Tools](./extending-tools.md)
Add custom tools to TaskContext for agents to use.

---

## Prerequisites

Before exploring advanced topics:

- Complete [Getting Started](../getting-started/README.md)
- Understand [Core Concepts](../core-concepts/README.md)
- Build several projects with Crew
- Read relevant [API Reference](../api-reference/README.md)

---

## Quick Reference

### Custom Executor

```typescript
import { Executor } from '@milomit/crew';

class MyExecutor implements Executor {
  async execute(task: Task, context: TaskContext): Promise<void> {
    // Custom execution logic
  }
}

.addTask('special', (task) => task
  .executor(new MyExecutor())
)
```

### Event Streaming

```typescript
const orchestrator = project.createOrchestrator();

orchestrator.on('task:start', (event) => {
  console.log('Task starting:', event.taskId);
});

orchestrator.on('task:complete', (event) => {
  console.log('Task completed:', event.taskId);
});

await orchestrator.run();
```

### Custom Store

```typescript
import { Store } from '@milomit/crew';

class DatabaseStore implements Store {
  async read(key: string): Promise<any> { /* ... */ }
  async write(key: string, value: any): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

const project = crew.project('my-app')
  .store(new DatabaseStore());
```

### Custom Tools

```typescript
.addTask('deploy', (task) => task
  .tools({
    deployToAWS: async (region: string) => {
      // Custom deployment logic
      return { status: 'deployed', url: '...' };
    }
  })
)
```

---

## When to Use Advanced Features

### Custom Executors
- Non-AI task execution (webhooks, manual steps)
- Integration with external systems
- Specialized execution logic

### Custom Stores
- Centralized state across machines
- Database-backed persistence
- Cloud storage integration

### Event Streaming
- Real-time dashboards
- Progress notifications
- Metrics collection

### Custom Tools
- Domain-specific operations
- API integrations
- Specialized utilities

---

## Performance Considerations

### Optimization Strategies

1. **Parallelization** - Use `.parallel()` epics
2. **Caching** - Cache expensive operations
3. **Model Selection** - Use faster models for simple tasks
4. **Batch Operations** - Group related work
5. **Lazy Loading** - Load data only when needed

### Cost Optimization

1. **Model Tiers** - Use cheaper models when possible
2. **Prompt Length** - Keep prompts concise
3. **Check Efficiency** - Fast checks first
4. **Retry Limits** - Set appropriate `maxAttempts`
5. **Planning** - Use `.plan()` selectively

See [Performance Tuning](./performance-tuning.md) for details.

---

## Security Considerations

### Best Practices

- **Validate agent outputs** - Don't trust AI blindly
- **Limit tool access** - Principle of least privilege
- **Sanitize inputs** - Prevent prompt injection
- **Audit logs** - Track all actions
- **Secrets management** - Never put secrets in prompts

### Prompt Injection

```typescript
// ❌ Vulnerable
.does(`Create user with name: ${userInput}`)

// ✅ Safe
.context({ userName: userInput })
.does('Create user with the provided name')
```

---

## Next Steps

Choose topics based on your needs:

- **Executors**: [Custom Executors](./custom-executors.md)
- **Storage**: [Custom Stores](./custom-stores.md)
- **Monitoring**: [Event Streaming](./event-streaming.md)
- **Scheduling**: [Constraint Solver](./constraint-solver.md)
- **AI config**: [Agent Configuration](./agent-configuration.md)
- **Prompts**: [Prompt Engineering](./prompt-engineering.md)
- **Performance**: [Performance Tuning](./performance-tuning.md)
- **Tools**: [Extending Tools](./extending-tools.md)

---

[← Back to Documentation Home](../README.md)
