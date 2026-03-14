# Getting Started with Crew

**Get up and running with the Crew framework in minutes.**

This section provides everything you need to install, configure, and build your first project with Crew.

## In This Section

### [Installation](./installation.md)
System requirements, installation steps, and environment setup.

### [Quick Start](./quick-start.md)
A 5-minute introduction to Crew with a minimal working example.

### [Your First Project](./your-first-project.md)
Complete walkthrough building a real project from scratch, covering:
- Project initialization
- Task definition with quality gates
- Execution and monitoring
- Handling failures and resuming

### [Configuration](./configuration.md)
Understanding `crew.json`, `.crew/` directory structure, and configuration options.

---

## Learning Path

**Recommended order for first-time users:**

1. **Read [Philosophy](../PHILOSOPHY.md)** first to understand the mental model
2. **Follow [Installation](./installation.md)** to set up your environment
3. **Complete [Quick Start](./quick-start.md)** for immediate hands-on experience
4. **Build [Your First Project](./your-first-project.md)** for comprehensive understanding
5. **Configure [Configuration](./configuration.md)** for your specific needs
6. **Explore [Core Concepts](../core-concepts/README.md)** to deepen your knowledge

---

## Prerequisites

Before starting, you should have:

- **Node.js** 18.0 or later
- **npm** or **pnpm**
- **TypeScript** knowledge (Crew is TypeScript-first)
- **Basic Git** understanding
- **API keys** for AI providers (OpenAI, Anthropic, or compatible)

---

## Quick Reference

### Minimal Example

```typescript
import { crew } from '@milomit/crew';

const project = crew.project('hello-crew')
  .addEpic('main', (epic) => epic
    .addTask('greet', (task) => task
      .does('Create a hello.txt file saying "Hello from Crew!"')
      .check('file-contains', { path: 'hello.txt', content: 'Hello from Crew!' })
    )
  );

await project.execute();
```

### Common First Commands

```bash
# Install Crew
npm install @milomit/crew

# Initialize a new project
npx crew init

# Run your project
npx crew run

# Review task status
npx crew review
```

---

## Next Steps

After completing this section:

- **Understand the system**: [Core Concepts](../core-concepts/README.md)
- **Master task definition**: [Task API](../task-api/README.md)
- **Add quality gates**: [Checks System](../checks/README.md)
- **Learn advanced patterns**: [Guides](../guides/README.md)

---

[← Back to Documentation Home](../README.md)
