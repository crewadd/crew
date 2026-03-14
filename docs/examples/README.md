# Examples

**Complete working examples demonstrating Crew for different project types.**

This section provides end-to-end examples showing how to use Crew for common software engineering tasks.

## In This Section

### ⭐ [Task Management App](./task-management-app.md) **FEATURED**
**A comprehensive, production-ready example demonstrating ALL Crew capabilities.**

Builds a full-stack task management application with:
- Multi-epic parallel execution (backend + frontend simultaneously)
- Multi-agent routing (7 specialized agents)
- Quality gates with automatic retry
- Incremental planning with yields
- AutoHarness validation
- Crash-safe resumability

**Best for:** Understanding Crew's full power, learning advanced patterns, production workflows

[View Example →](../../examples/task-management-app/)

---

### [Basic Project](./basic-project.md)
Minimal working example demonstrating core concepts.

### [Next.js App](./nextjs-app.md)
Generate a complete Next.js application with pages, components, and API routes.

### [API Backend](./api-backend.md)
Build a REST API with Express, TypeScript, and database integration.

### [Documentation Site](./documentation-site.md)
Generate documentation from code and markdown files.

### [Testing Suite](./testing-suite.md)
Create comprehensive test suites for existing code.

### [Monorepo](./monorepo.md)
Manage multi-package monorepo projects with shared configuration.

---

## By Project Type

### Web Applications

- **[Next.js App](./nextjs-app.md)** - Full-stack React app
- **[API Backend](./api-backend.md)** - REST API service

### Documentation & Testing

- **[Documentation Site](./documentation-site.md)** - Auto-generated docs
- **[Testing Suite](./testing-suite.md)** - Comprehensive tests

### Project Types

- **[Basic Project](./basic-project.md)** - Simple starter
- **[Monorepo](./monorepo.md)** - Multi-package workspace

---

## Quick Reference

### Basic Project Structure

```typescript
import { crew } from '@milomit/crew';

const project = crew.project('my-project')
  .addEpic('setup', (epic) => epic
    .addTask('init', (task) => task
      .does('Initialize project structure')
      .check('file-exists', 'package.json')
    )
  )
  .addEpic('implement', (epic) => epic
    .dependsOn('setup')
    .addTask('code', (task) => task
      .does('Implement main functionality')
      .check('command', { cmd: 'npm test' })
    )
  );

await project.execute();
```

### Running Examples

Each example includes:

1. **Project definition** (`crew.ts`)
2. **Configuration** (`crew.json`)
3. **Expected outputs**
4. **How to run**
5. **Common variations**

---

## Learning Path

### For Beginners

1. **[Basic Project](./basic-project.md)** - Understand fundamentals
2. **[Testing Suite](./testing-suite.md)** - See quality gates in action
3. **[Next.js App](./nextjs-app.md)** - Build something real

### For Web Developers

1. **[Next.js App](./nextjs-app.md)** - Frontend + backend
2. **[API Backend](./api-backend.md)** - Backend-focused
3. **[Monorepo](./monorepo.md)** - Multi-package projects

### For DevOps/Platform Engineers

1. **[Monorepo](./monorepo.md)** - Complex project structure
2. **[Documentation Site](./documentation-site.md)** - Automation
3. **[Testing Suite](./testing-suite.md)** - Quality assurance

---

## Example Features

### Basic Project
- Simple task hierarchy
- File-based checks
- Command checks

### Next.js App
- Multi-epic workflow
- Component generation
- Page routing
- API endpoints
- Styling setup

### API Backend
- Database migrations
- REST endpoints
- Authentication
- Testing setup
- OpenAPI spec

### Documentation Site
- Markdown generation
- Code extraction
- Cross-linking
- Static site build

### Testing Suite
- Unit tests
- Integration tests
- E2E tests
- Coverage checks

### Monorepo
- Shared configuration
- Cross-package dependencies
- Parallel builds
- Versioning

---

## Common Patterns

### Progressive Enhancement

```typescript
.addEpic('mvp', ...)
.addEpic('polish', (epic) => epic.dependsOn('mvp'))
.addEpic('optimize', (epic) => epic.dependsOn('polish'))
```

### Parallel + Sequential

```typescript
.addEpic('setup', (epic) => epic
  .parallel()
  .addTask('deps', ...)
  .addTask('config', ...)
)
.addEpic('build', (epic) => epic
  .dependsOn('setup')
  .sequential()
  .addTask('compile', ...)
  .addTask('test', ...)
)
```

### Quality Gates

```typescript
.addTask('implement', (task) => task
  .does('...')
  .check('file-exists', 'src/index.ts')
  .check('typescript-valid')
  .check('command', { cmd: 'npm test' })
  .check('command', { cmd: 'npm run lint' })
)
```

---

## Customizing Examples

Each example can be customized by:

1. **Changing task descriptions** - Modify what agent builds
2. **Adding checks** - Enforce different quality standards
3. **Adjusting structure** - Change epic/task organization
4. **Using plugins** - Add framework-specific features
5. **Custom context** - Provide project-specific data

---

## Next Steps

Choose an example that matches your use case, or:

- **Learn patterns**: [Guides](../guides/README.md)
- **Understand concepts**: [Core Concepts](../core-concepts/README.md)
- **Master task API**: [Task API](../task-api/README.md)

---

[← Back to Documentation Home](../README.md)
