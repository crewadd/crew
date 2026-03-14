# Documentation Playbook

This playbook covers creating, organizing, and maintaining project documentation within the crew framework. Docs live in `.crew/docs/` and are managed through the crewman plugin's `docs` tool.

## Table of Contents

- [Documentation Workflow](#documentation-workflow)
- [Document Types](#document-types)
- [Creating Documents](#creating-documents)
- [Organizing Documents](#organizing-documents)
- [Writing Style Guide](#writing-style-guide)
- [Lifecycle: When to Update](#lifecycle-when-to-update)
- [Document Templates](#document-templates)
- [Docs Tool API](#docs-tool-api)
- [Integration with Goals and Plans](#integration-with-goals-and-plans)

---

## Documentation Workflow

```
Assess what exists → Identify gaps → Create/update docs → Link to goals/plan
```

1. **Check existing docs**: List what's already in `.crew/docs/`
2. **Identify gaps**: Compare against the standard doc set (see below)
3. **Create or update**: Write the doc using the appropriate template
4. **Link**: Reference relevant epics, tasks, and goals

## Document Types

### Standard Project Docs

Every project benefits from these core documents. Create them as the project progresses — don't front-load everything at initialization.

| Document | Purpose | Create when... |
|----------|---------|----------------|
| `architecture.md` | System design, component relationships, data flow | After the foundation epic completes |
| `decisions.md` | Key technical decisions with rationale | When a non-obvious choice is made |
| `setup.md` | How to set up the development environment | After initial setup tasks are done |
| `api.md` | API reference, endpoints, schemas, examples | After API implementation |
| `changelog.md` | Notable changes organized by milestone/epic | After each epic completes |
| `runbook.md` | How to deploy, monitor, and operate | When infrastructure tasks complete |

### Specialized Docs

Create these when the project warrants them:

| Document | Purpose |
|----------|---------|
| `security.md` | Security model, auth flow, threat considerations |
| `data-model.md` | Database schema, entity relationships |
| `integrations.md` | External service connections and API contracts |
| `testing.md` | Test strategy, coverage goals, how to run tests |
| `troubleshooting.md` | Known issues and their solutions |

## Creating Documents

### Using the Docs Tool

The crewman plugin provides a `docs` tool with these operations:

```typescript
// List all docs
const docs = await tools.docs.list();

// Read a doc
const content = await tools.docs.read('architecture');

// Write a doc
await tools.docs.write('architecture', markdownContent);

// Check if a doc exists
const exists = await tools.docs.exists('architecture');

// Generate a doc using the agent
const generated = await tools.docs.generate('architecture',
  'Document the system architecture including component relationships and data flow'
);
```

### Manual Creation

Docs are plain markdown files in `.crew/docs/`:

```bash
# Create manually
echo "# Architecture\n\n..." > .crew/docs/architecture.md
```

### Naming Conventions

- Use **kebab-case** filenames: `api-design.md`, `setup-guide.md`
- No prefixes or numbering — alphabetical order works fine
- Keep names short and descriptive
- Always use `.md` extension

## Organizing Documents

### Directory Structure

For simple projects, a flat structure works:

```
.crew/docs/
├── architecture.md
├── changelog.md
├── decisions.md
└── setup.md
```

For larger projects, use subdirectories:

```
.crew/docs/
├── architecture.md
├── changelog.md
├── guides/
│   ├── setup.md
│   ├── deployment.md
│   └── testing.md
├── reference/
│   ├── api.md
│   ├── data-model.md
│   └── config.md
└── decisions/
    ├── 001-framework-choice.md
    ├── 002-auth-strategy.md
    └── 003-deployment-target.md
```

### Decision Log Format

Decisions are special — they capture the **why** behind choices. Use numbered files for chronological ordering:

```markdown
# 001: Framework Choice

**Date**: 2026-03-07
**Status**: Accepted
**Context**: We need a React framework for the web application.

## Options Considered

1. **Next.js** — Full-featured, SSR/SSG, large ecosystem
2. **Remix** — Nested routes, progressive enhancement
3. **Vite + React Router** — Lightweight, flexible

## Decision

Next.js — best balance of features, community support, and deployment options.

## Consequences

- Locked into Next.js routing conventions
- Can use Vercel for zero-config deployment
- Need to learn App Router patterns
```

## Writing Style Guide

Good documentation is concise, actionable, and honest. Here's what that means in practice:

### Structure

- Start with a `# Title` heading
- Follow with a **one-paragraph summary** — what is this doc about and who is it for?
- Use `##` sections for major topics
- Use `###` for subtopics only when needed
- Include a table of contents for docs longer than 100 lines

### Tone

- **Imperative for instructions**: "Run `npm install`" not "You should run `npm install`"
- **Present tense for descriptions**: "The API returns JSON" not "The API will return JSON"
- **Be direct**: Skip filler phrases like "In order to" or "It should be noted that"
- **Be honest about limitations**: If something is hacky, say so. Future you will thank present you.

### Code Examples

- Always include a working example, not just a description
- Show the **most common use case** first
- Keep examples minimal — show what's needed, nothing more
- Use actual values, not `foo`/`bar` placeholder names

### What Not to Document

- **Don't document the obvious**: If the code is clear, don't restate it in prose
- **Don't write aspirational docs**: Only document what exists, not what might exist
- **Don't over-explain**: If something needs a paragraph of explanation, the code might need refactoring instead

## Lifecycle: When to Update

Documentation should evolve with the project. Here's when to update:

### After Epic Completion

When an epic finishes, update:
- `changelog.md` — What was delivered in this epic
- `architecture.md` — If new components were added
- Relevant specialized docs (API, data model, etc.)

### After a Decision

When a significant technical decision is made:
- Add an entry to `decisions.md` or create a numbered decision file
- Update any docs that are affected by the decision

### After Troubleshooting

When a non-obvious issue is diagnosed and fixed:
- Add it to `troubleshooting.md` with symptoms, cause, and fix
- This prevents the same issue from wasting time twice

### When Architecture Changes

If components are added, removed, or restructured:
- Update `architecture.md`
- Update any docs that reference affected components
- Check that setup instructions still work

### Staleness Check

Periodically review docs for accuracy. Signs of staleness:
- References to files or APIs that no longer exist
- Setup instructions that fail
- Architecture diagrams that don't match the code

## Document Templates

### Architecture Doc

```markdown
# Architecture

Brief description of the system and its purpose.

## Components

### [Component Name]
- **Purpose**: What it does
- **Location**: `src/path/`
- **Dependencies**: What it depends on
- **API**: How other components interact with it

## Data Flow

Describe how data moves through the system.

## Infrastructure

Deployment targets, services, and configuration.
```

### Setup Guide

```markdown
# Development Setup

## Prerequisites

- Node.js 20+
- pnpm 8+

## Quick Start

\`\`\`bash
git clone <repo>
cd <project>
pnpm install
pnpm dev
\`\`\`

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | — |

## Common Issues

### [Issue description]
**Fix**: [Solution]
```

### API Reference

```markdown
# API Reference

## Authentication

All requests require a Bearer token in the Authorization header.

## Endpoints

### GET /api/items

List all items.

**Response**: `200 OK`
\`\`\`json
{
  "items": [{ "id": "1", "name": "Example" }],
  "total": 1
}
\`\`\`

### POST /api/items

Create a new item.

**Body**:
\`\`\`json
{ "name": "New Item" }
\`\`\`

**Response**: `201 Created`
```

### Changelog

```markdown
# Changelog

## Epic 2: Core Features (2026-03-07)

- Added user authentication with JWT
- Built REST API for items CRUD
- Created dashboard page with data tables

## Epic 1: Foundation (2026-03-05)

- Initialized Next.js project with TypeScript
- Set up CI/CD pipeline
- Created base layout and navigation
```

## Docs Tool API

The `docs` tool is registered by the crewman plugin and available in task contexts:

### list()

Returns an array of file paths for all markdown files in the docs directory.

### read(name: string)

Reads a doc by name (without the `.md` extension). Returns the full markdown content.

### write(name: string, content: string)

Creates or overwrites a doc. The name should not include the `.md` extension.

### exists(name: string)

Returns `true` if the doc exists.

### generate(name: string, prompt: string)

Uses the crewman agent to generate a doc from a prompt. The agent receives the project persona and context, produces markdown, and writes it to the docs directory. Returns the generated content.

The generated doc is a starting point — review and edit it. Agent-generated docs benefit from a human pass to add project-specific context and correct any assumptions.

## Integration with Goals and Plans

### Linking Docs to Goals

When a goal is completed, document what was achieved:

```typescript
// In the afterTask hook or manually
await tools.docs.write('changelog', `
## Goal: ${goal.title} (${new Date().toISOString().split('T')[0]})

${goal.description}

### Delivered
- ${deliverables.join('\n- ')}
`);
```

### Plan-Driven Documentation

Include documentation tasks in your plan:

```typescript
epic.addTask(
  ctx.createTask('write-docs', 'Write Documentation')
    .type('planning')
    .deps(['implement-feature'])
    .outputs(['.crew/docs/api.md'])
    .prompt('Document the API endpoints created in this epic')
);
```

This ensures docs are treated as deliverables, not afterthoughts.
