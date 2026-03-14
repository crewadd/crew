# Views Module

This directory contains all view generation functionality for the crew project management system.

## Structure

```
views/
├── types.ts           # Shared types and interfaces for views
├── plan-view.ts       # Plan README view generator
├── state-view.ts      # state.json view generator
├── writers.ts         # File writing utilities for views
└── index.ts           # Central exports
```

## View Types

### Plan View (`plan-view.ts`)
Generates comprehensive `README.md` for the plan with:
- Project overview and workflow
- Progress summary with visual progress bar
- Table of contents with epic links
- Detailed epic sections with task tables
- Quick reference (commands, file structure, search patterns)

**Output:** `.crew/epics/README.md`

### State View (`state-view.ts`)
Generates `state.json` - a JSON summary of:
- Project metadata
- Epic summaries
- Task summaries

**Output:** `.crew/state.json`

## Usage

```typescript
import {
  generatePlanReadme,
  writePlanReadme,
  generateStateJson,
  writeStateJson,
  type ViewableStore,
} from './views/index.ts';

// Generate view content
const content = generatePlanReadme(store);

// Write view to disk
writePlanReadme(store);
```

## ViewableStore Interface

All view generators work with the minimal `ViewableStore` interface:

```typescript
interface ViewableStore {
  rootDir: string;
  getProject(): CrewProject | null;
  listEpics(): Epic[];
  listTasks?(): Task[];
  listAllTasks?(): Task[];
  getTask(id: string): Task | null;
}
```

This allows views to work with any store implementation (e.g., `HierarchicalStore`).

## Migration Note

Previously, views were in `store/views.ts`. The code has been refactored to:
- **Separate concerns**: View logic is now independent from store logic
- **Better organization**: Each view type has its own file
- **Easier testing**: Views can be tested independently

The old `store/views.ts` now re-exports from `views/` for backward compatibility.

## Built with

- **MdBuilder** (from `codegen/md-builder.ts`) - Structured markdown generation
- **Type-safe** - Full TypeScript support with strict types
- **Minimal dependencies** - Only requires Node.js fs/path modules
