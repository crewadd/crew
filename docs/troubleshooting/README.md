# Troubleshooting

**Diagnose and fix common issues with Crew projects.**

This section helps you debug problems, understand error messages, and find solutions to common issues.

## In This Section

### [Common Errors](./common-errors.md)
Most frequent errors and their solutions.

### [Debugging Guide](./debugging.md)
Step-by-step debugging strategies and tools.

### [FAQ](./faq.md)
Frequently asked questions and answers.

---

## Quick Diagnosis

### Task Stuck or Failing

1. Check `.crew/logs/` for detailed execution logs
2. Review task description - is it clear and specific?
3. Verify checks are achievable
4. Check `maxAttempts` isn't too low
5. See [Debugging Guide](./debugging.md)

### Installation Issues

1. Verify Node.js version (18+)
2. Clear npm cache: `npm cache clean --force`
3. Remove `node_modules` and reinstall
4. Check for conflicting dependencies

### Configuration Errors

1. Validate `crew.json` syntax (use JSON linter)
2. Check file paths are absolute or relative to project root
3. Verify API keys are set in environment
4. See [Configuration](../getting-started/configuration.md)

### Execution Crashes

1. Resume with `npx crew run --resume`
2. Check `.crew/state.json` for last known state
3. Review crash logs in `.crew/logs/`
4. See [Sessions & Resumability](../core-concepts/sessions-and-resumability.md)

---

## Common Error Messages

### "Task failed after max attempts"

**Cause**: Task checks kept failing after all retries.

**Solutions**:
- Review check requirements - are they achievable?
- Increase `maxAttempts` if task is flaky
- Make task description more specific
- Check if agent has necessary context
- See [Common Errors](./common-errors.md#task-failed-after-max-attempts)

### "Check 'xxx' not found"

**Cause**: Referenced a check that isn't registered.

**Solutions**:
- Verify check name spelling
- Ensure plugin providing check is loaded
- Check plugin is in `crew.json` or `.use()` called
- See [Checks System](../checks/README.md)

### "Circular dependency detected"

**Cause**: Tasks depend on each other in a cycle.

**Solutions**:
- Review `.dependsOn()` calls
- Draw dependency graph to find cycle
- Restructure task relationships
- See [Constraint Engine](../core-concepts/constraint-engine.md)

### "API key not found"

**Cause**: AI provider API key not set.

**Solutions**:
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```
- See [Configuration](../getting-started/configuration.md)

---

## Debugging Workflow

### 1. Enable Verbose Logging

```bash
npx crew run --verbose
```

### 2. Inspect State Files

```bash
# Current state
cat .crew/state.json

# Task state
cat .crew/tasks/<task-id>.json

# Logs
tail -f .crew/logs/latest.log
```

### 3. Run Single Task

```bash
npx crew run --task <task-id>
```

### 4. Review Agent Interactions

Check `.crew/logs/` for full agent conversations.

### 5. Dry Run

```bash
npx crew run --dry-run
```

See [Debugging Guide](./debugging.md) for detailed strategies.

---

## Getting Help

### Self-Service

1. **Search this documentation** - Use Ctrl+F or search
2. **Check FAQ** - [FAQ](./faq.md)
3. **Review examples** - [Examples](../examples/README.md)
4. **Read error messages carefully** - They often include hints

### Community Help

1. **GitHub Discussions** - Ask questions
2. **GitHub Issues** - Report bugs
3. **Documentation** - Suggest improvements

### Bug Reports

When filing a bug report, include:

- Crew version (`npx crew --version`)
- Node.js version (`node --version`)
- Operating system
- Minimal reproduction steps
- Relevant logs from `.crew/logs/`
- Configuration files (redact secrets!)

---

## Prevention

### Best Practices

- **Start simple** - Build complexity gradually
- **Test checks** - Verify checks work independently
- **Clear descriptions** - Be specific in task prompts
- **Version control** - Commit working states
- **Monitor logs** - Watch execution in real-time

### Quality Checks

- Use multiple checks for critical tasks
- Test checks independently before using
- Provide good failure messages
- Set reasonable `maxAttempts`

---

## Next Steps

- **Common issues**: [Common Errors](./common-errors.md)
- **Debug strategies**: [Debugging Guide](./debugging.md)
- **Questions**: [FAQ](./faq.md)
- **Learn more**: [Core Concepts](../core-concepts/README.md)

---

[← Back to Documentation Home](../README.md)
