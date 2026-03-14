# Guides

**Practical how-to documentation for common patterns and workflows.**

This section provides step-by-step guides for accomplishing specific tasks and implementing common patterns with Crew.

## In This Section

### [Debugging Tasks](./debugging-tasks.md)
Troubleshoot failed or stuck tasks, inspect state, and understand agent behavior.

### [Parallel Execution](./parallel-execution.md)
Implement fan-out/fan-in patterns for concurrent task execution.

### [Conditional Tasks](./conditional-tasks.md)
Use `when` and `unless` clauses for dynamic execution flow.

### [Multi-Agent Workflows](./multi-agent-workflows.md)
Coordinate multiple AI agents with different roles or capabilities.

### [Integration Testing](./integration-testing.md)
Test AI-generated code with traditional testing frameworks.

### [CI/CD Integration](./ci-cd-integration.md)
Run Crew projects in continuous integration pipelines.

### [Version Control](./version-control.md)
What to commit to Git and what belongs in `.gitignore`.

### [Sharing Plans](./sharing-plans.md)
Create reusable plan templates for common project types.

### [Migration Guide](./migration-guide.md)
Upgrade between Crew versions and handle breaking changes.

---

## By Use Case

### Development Workflows

- **Debugging failures**: [Debugging Tasks](./debugging-tasks.md)
- **Speed up execution**: [Parallel Execution](./parallel-execution.md)
- **Dynamic workflows**: [Conditional Tasks](./conditional-tasks.md)
- **Quality assurance**: [Integration Testing](./integration-testing.md)

### Team Collaboration

- **Share work**: [Version Control](./version-control.md)
- **Reusable templates**: [Sharing Plans](./sharing-plans.md)
- **Multiple agents**: [Multi-Agent Workflows](./multi-agent-workflows.md)

### Production & CI/CD

- **Automated builds**: [CI/CD Integration](./ci-cd-integration.md)
- **Testing**: [Integration Testing](./integration-testing.md)

### Maintenance

- **Upgrades**: [Migration Guide](./migration-guide.md)
- **Troubleshooting**: [Debugging Tasks](./debugging-tasks.md)

---

## Quick Examples

### Parallel Task Execution

```typescript
.addEpic('setup', (epic) => epic
  .parallel() // All tasks run concurrently
  .addTask('install-frontend-deps', ...)
  .addTask('install-backend-deps', ...)
  .addTask('setup-database', ...)
)
```

### Conditional Execution

```typescript
.addTask('deploy', (task) => task
  .does('Deploy to production')
  .when(() => process.env.NODE_ENV === 'production')
  .check('command', { cmd: 'npm run smoke-test' })
)
```

### Multi-Agent Workflow

```typescript
.addTask('implement', (task) => task
  .does('Implement user authentication')
  .agent({ role: 'backend-engineer', model: 'gpt-4' })
)
.addTask('review', (task) => task
  .does('Review implementation for security')
  .agent({ role: 'security-expert', model: 'claude-opus' })
  .dependsOn('implement')
)
```

### CI/CD Integration

```bash
# .github/workflows/crew.yml
- name: Run Crew project
  run: |
    npx crew run --no-interactive --fail-fast
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Learning Paths

### For New Users

1. [Debugging Tasks](./debugging-tasks.md) - Essential skill
2. [Version Control](./version-control.md) - Team basics
3. [Parallel Execution](./parallel-execution.md) - Performance
4. [Conditional Tasks](./conditional-tasks.md) - Advanced flow

### For Teams

1. [Version Control](./version-control.md)
2. [Sharing Plans](./sharing-plans.md)
3. [CI/CD Integration](./ci-cd-integration.md)
4. [Multi-Agent Workflows](./multi-agent-workflows.md)

### For Production

1. [CI/CD Integration](./ci-cd-integration.md)
2. [Integration Testing](./integration-testing.md)
3. [Debugging Tasks](./debugging-tasks.md)
4. [Migration Guide](./migration-guide.md)

---

## Best Practices

### Development

- Enable verbose logging during development
- Use `.plan()` for complex tasks
- Add multiple checks for critical operations
- Review `.crew/` state when debugging

### Team Workflows

- Commit `crew.ts` and `crew.json`
- Add `.crew/` to `.gitignore`
- Document custom checks and plugins
- Share plan templates in organization

### Production

- Run in `--no-interactive` mode
- Set appropriate timeouts
- Monitor execution logs
- Have rollback plans for failures

---

## Next Steps

Choose a guide based on your current need, or explore:

- **Core concepts**: [Core Concepts](../core-concepts/README.md)
- **Advanced topics**: [Advanced](../advanced/README.md)
- **Examples**: [Examples](../examples/README.md)

---

[← Back to Documentation Home](../README.md)
