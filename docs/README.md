# Crew Framework Documentation

> **AI-native task orchestration for autonomous software engineering**

Welcome to the Crew framework documentation! Crew is a TypeScript framework for defining, executing, and verifying complex multi-step software engineering tasks using AI agents with automatic quality gates, crash-safe resumability, and filesystem-native state management.

## Quick Navigation

### 🚀 Getting Started
- [Philosophy & Motivation](./PHILOSOPHY.md) - Why Crew exists and when to use it
- [Installation](./getting-started/installation.md) - Get up and running
- [Quick Start](./getting-started/quick-start.md) - 5-minute hello world
- [Your First Project](./getting-started/your-first-project.md) - Complete walkthrough
- [Configuration](./getting-started/configuration.md) - crew.json and .crew/ structure

### 📚 Core Concepts
- [Architecture Overview](./core-concepts/architecture.md) - System design and reactive loop
- [Projects, Epics & Tasks](./core-concepts/projects-epics-tasks.md) - Three-level hierarchy
- [Filesystem Store](./core-concepts/filesystem-store.md) - State persistence on disk
- [Checks & Quality Gates](./core-concepts/checks-and-quality-gates.md) - Verification system
- [Sessions & Resumability](./core-concepts/sessions-and-resumability.md) - Crash-safe execution
- [Constraint Engine](./core-concepts/constraint-engine.md) - Dependencies and scheduling
- [Execution Flow](./core-concepts/execution-flow.md) - How orchestration works

### 🛠️ Task API
- [Fluent Builder](./task-api/fluent-builder.md) - Complete TaskBuilder API
- [Task Context](./task-api/task-context.md) - Runtime context and tools
- [Lifecycle Hooks](./task-api/lifecycle-hooks.md) - onStart, onComplete, onFail
- [Checks](./task-api/checks.md) - Five types of quality gates
- [Planning Phase](./task-api/planning-phase.md) - Plan-then-execute pattern
- [Review Gates](./task-api/review-gates.md) - Human approval gates
- [Yields & Incremental Planning](./task-api/yields-incremental-planning.md) - Dynamic task spawning

### ✅ Checks System
- [Checks Overview](./checks/README.md) - Understanding quality gates
- [Named Checks](./checks/named-checks.md) - Registry-based checks
- [Inline Checks](./checks/inline-checks.md) - Custom check functions
- [Command Checks](./checks/command-checks.md) - Shell command validation
- [Prompt Checks](./checks/prompt-checks.md) - AI-powered validation
- [Writing Custom Checks](./checks/writing-custom-checks.md) - Project-level checks

### 🤖 AutoHarness
- [AutoHarness Guide](./HARNESS.md) - AI-synthesized test generation and validation

### 🔌 Plugins
- [Using Plugins](./plugins/using-plugins.md) - Installing and configuring
- [Built-in Plugins](./plugins/builtin-plugins.md) - TypeScript, Next.js, Git, Docker
- [Writing Plugins](./plugins/writing-plugins.md) - Plugin API and development

### 💻 CLI Reference
- [Commands](./cli/commands.md) - Complete command reference
- [Flags & Options](./cli/flags-and-options.md) - All CLI flags
- [Workflows](./cli/workflows.md) - Common CLI workflows

### 📖 Guides
- [Debugging Tasks](./guides/debugging-tasks.md) - Debug failed/stuck tasks
- [Parallel Execution](./guides/parallel-execution.md) - Fan-out/fan-in patterns
- [Conditional Tasks](./guides/conditional-tasks.md) - When clauses and dynamic plans
- [Multi-Agent Workflows](./guides/multi-agent-workflows.md) - Multiple agents/personas
- [Integration Testing](./guides/integration-testing.md) - Testing generated code
- [CI/CD Integration](./guides/ci-cd-integration.md) - Running in CI pipelines
- [Version Control](./guides/version-control.md) - What to commit vs .gitignore
- [Sharing Plans](./guides/sharing-plans.md) - Reusable plan templates
- [Migration Guide](./guides/migration-guide.md) - Version upgrade guide

### 🎯 Task Types
- [Defining Task Types](./task-types/defining-types.md) - Creating custom task types
- [Type Hierarchy](./task-types/type-hierarchy.md) - Type inheritance and organization

### 🚀 Advanced Topics
- [Custom Executors](./advanced/custom-executors.md) - Writing programmable executors
- [Custom Stores](./advanced/custom-stores.md) - Alternative store implementations
- [Event Streaming](./advanced/event-streaming.md) - Orchestrator events for dashboards
- [Constraint Solver](./advanced/constraint-solver.md) - Deep dive into scheduling
- [Agent Configuration](./advanced/agent-configuration.md) - Provider, backend, model selection
- [Prompt Engineering](./advanced/prompt-engineering.md) - Effective prompts for agents
- [Performance Tuning](./advanced/performance-tuning.md) - Optimization strategies
- [Extending Tools](./advanced/extending-tools.md) - Custom TaskContext tools

### 📘 API Reference
- [Types](./api-reference/types.md) - TypeScript type reference
- [TaskBuilder](./api-reference/task-builder.md) - TaskBuilder API
- [EpicBuilder](./api-reference/epic-builder.md) - EpicBuilder API
- [PlanBuilder](./api-reference/plan-builder.md) - PlanBuilder API
- [Orchestrator](./api-reference/orchestrator.md) - ProjectOrchestrator, EpicOrchestrator
- [Store API](./api-reference/store-api.md) - HierarchicalStore, FsStore
- [Verifier API](./api-reference/verifier-api.md) - Verifier and check plugins
- [Session API](./api-reference/session-api.md) - Session management
- [Config Loader](./api-reference/config-loader.md) - Configuration loading

### 💡 Examples
- [Basic Project](./examples/basic-project.md) - Minimal working example
- [Next.js App](./examples/nextjs-app.md) - Next.js project generation
- [API Backend](./examples/api-backend.md) - REST API generation
- [Documentation Site](./examples/documentation-site.md) - Doc generation
- [Testing Suite](./examples/testing-suite.md) - Test generation
- [Monorepo](./examples/monorepo.md) - Multi-package project

### 🔧 Troubleshooting
- [Common Errors](./troubleshooting/common-errors.md) - Common errors and solutions
- [Debugging Guide](./troubleshooting/debugging.md) - Debugging strategies
- [FAQ](./troubleshooting/faq.md) - Frequently asked questions

### 🤝 Contributing
- [Contributing Guide](./contributing/README.md) - How to contribute
- [Architecture](./contributing/architecture.md) - Codebase architecture
- [Testing](./contributing/testing.md) - Running and writing tests
- [Release Process](./contributing/release-process.md) - Release workflow

---

## Learning Paths

### 🎓 For First-Time Users

1. Read [Philosophy & Motivation](./PHILOSOPHY.md) to understand the mental model
2. Follow [Installation](./getting-started/installation.md) to set up
3. Complete [Quick Start](./getting-started/quick-start.md) for a 5-minute intro
4. Build [Your First Project](./getting-started/your-first-project.md) for hands-on experience
5. Explore [Core Concepts](./core-concepts/README.md) to deepen understanding

### 👨‍💻 For Application Developers

1. Start with [Quick Start](./getting-started/quick-start.md)
2. Learn [Projects, Epics & Tasks](./core-concepts/projects-epics-tasks.md)
3. Master [Fluent Builder](./task-api/fluent-builder.md) API
4. Understand [Checks & Quality Gates](./core-concepts/checks-and-quality-gates.md)
5. Review [Examples](./examples/README.md) for your use case
6. Explore [Guides](./guides/README.md) for advanced patterns

### 🏗️ For Framework Integrators

1. Understand [Architecture Overview](./core-concepts/architecture.md)
2. Learn [Plugin System](./plugins/README.md)
3. Study [API Reference](./api-reference/README.md)
4. Explore [Advanced Topics](./advanced/README.md)
5. Review [Contributing Guide](./contributing/README.md)

### 🔬 For AI/ML Engineers

1. Read [Philosophy](./PHILOSOPHY.md) on AI-native design
2. Learn [AutoHarness](./HARNESS.md) for AI-synthesized validation
3. Study [Prompt Engineering](./advanced/prompt-engineering.md)
4. Explore [Agent Configuration](./advanced/agent-configuration.md)
5. Review [Multi-Agent Workflows](./guides/multi-agent-workflows.md)

---

## Quick Reference

### Creating a Project

```typescript
import { crew } from '@milomit/crew';

const project = crew.project('my-project')
  .addEpic('setup', (epic) => epic
    .addTask('scaffold', (task) => task
      .does('Create project structure')
      .check('files-exist', ['src/', 'package.json'])
    )
  );

await project.execute();
```

### Key Concepts

- **Project**: Top-level container for related work
- **Epic**: Logical grouping of tasks (sequential by default)
- **Task**: Atomic unit of work executed by AI agent
- **Check**: Quality gate that must pass before task completes
- **Session**: Resumable execution context stored in `.crew/`

### Common Commands

```bash
# Run a project
npx crew run

# Review pending tasks
npx crew review

# Resume after crash
npx crew run --resume

# Run specific epic
npx crew run --epic setup
```

---

## What is Crew?

Crew is a **task orchestration framework** for autonomous AI agents. It provides:

- 🏗️ **Three-level hierarchy** - Projects, Epics, and Tasks for organizing work
- ✅ **Automatic quality gates** - Five types of checks ensure correctness
- 💾 **Filesystem-native store** - All state in `.crew/` for transparency
- 🔄 **Crash-safe resumability** - Pick up exactly where you left off
- 🎯 **Constraint engine** - Automatic dependency resolution and parallelization
- 🤖 **AutoHarness** - AI-synthesized tests validate agent outputs
- 🔌 **Plugin system** - Extensible with custom tools and checks
- 👥 **Review gates** - Human-in-the-loop for critical decisions
- 📊 **Event streaming** - Build dashboards and integrations

### When to Use Crew

Crew excels at:

- **Code generation projects** - Generate full applications, features, or tests
- **Multi-step workflows** - Complex tasks requiring planning and verification
- **Quality-critical work** - When correctness matters more than speed
- **Resumable operations** - Long-running tasks that might crash
- **Team collaboration** - Share plans and review agent outputs

### When NOT to Use Crew

Consider alternatives for:

- **Single-step tasks** - Use Claude or GPT directly
- **Interactive coding** - Use Cursor, GitHub Copilot, or similar
- **Real-time applications** - Crew is designed for batch workflows
- **Simple automation** - Shell scripts may be simpler

---

## Need Help?

- 📖 **Documentation**: You're here!
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/milomit/crew/issues)
- 💬 **Questions**: [GitHub Discussions](https://github.com/milomit/crew/discussions)
- 📧 **Security**: See [SECURITY.md](../SECURITY.md)

---

**Ready to get started?** → [Installation Guide](./getting-started/installation.md)
