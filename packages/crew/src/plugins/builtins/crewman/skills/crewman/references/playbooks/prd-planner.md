# PRD Planner Playbook

This playbook covers converting a Product Requirements Document (PRD) into an executable crew plan using the programmable planning API.

## Table of Contents

- [PRD Planning Workflow](#prd-planning-workflow)
- [Reading the PRD](#reading-the-prd)
- [Deriving Epics from Requirements](#deriving-epics-from-requirements)
- [Generating the Plan File](#generating-the-plan-file)
- [Task Decomposition Strategies](#task-decomposition-strategies)
- [Wiring Dependencies](#wiring-dependencies)
- [Adding Checks and Acceptance Criteria](#adding-checks-and-acceptance-criteria)
- [Linking Goals](#linking-goals)
- [Review and Validation](#review-and-validation)
- [Common PRD Patterns](#common-prd-patterns)

---

## PRD Planning Workflow

```
Read PRD → Extract requirements → Group into epics → Decompose tasks → Wire dependencies → Add checks → Link goals → Verify coherence
```

1. **Read the PRD** — Locate and fully read the PRD document. Identify functional requirements, non-functional requirements, user stories, and acceptance criteria.

2. **Survey existing state** — Run `crew status` and `crew tree`. Check for existing plans, goals, or docs that overlap with the PRD scope.

3. **Extract requirements** — Pull discrete requirements from the PRD. Each requirement should map to one or more tasks. Tag requirements as functional (features), technical (infrastructure), or quality (testing/performance).

4. **Group into epics** — Cluster related requirements into sequential milestones. A typical PRD translates into 3-7 epics following a natural build order: setup → core features → secondary features → integration → verification.

5. **Decompose into tasks** — Break each epic's requirements into atomic tasks. One concern per task. Every task must have a clear deliverable and verification method.

6. **Wire dependencies** — Connect tasks with `deps`, `blocks`, and cross-epic references. Maximize parallelism — only add dependencies where there's a true data or ordering constraint.

7. **Add checks** — Attach `tsc`, `build`, or custom checks to tasks that produce artifacts. Map PRD acceptance criteria to review gates.

8. **Link goals** — Create goals from PRD milestones and link them to the corresponding epics.

9. **Verify coherence** — Run `crew verify` and review the plan against the PRD for completeness.

## Reading the PRD

Before generating any plan, thoroughly read the PRD and extract structured information:

### What to Extract

| PRD Element | Maps To |
|-------------|---------|
| Product overview / vision | Plan title + description |
| Features / user stories | Epics and tasks |
| Acceptance criteria | Checks and review gates |
| Technical requirements | Infrastructure tasks + plan vars |
| Milestones / phases | Epic ordering |
| Dependencies / constraints | Task deps + `shouldStart` guards |
| Success metrics | Goals with acceptance criteria |
| Out of scope | Explicit exclusions (do not create tasks) |

### PRD Quality Check

Before planning, verify the PRD has enough detail:

- **Sufficient**: Clear features, acceptance criteria, technical stack, and scope boundaries → proceed to planning
- **Ambiguous**: Vague requirements, missing acceptance criteria, unclear scope → ask the user to clarify before planning
- **Too broad**: PRD covers multiple independent products → suggest splitting into separate plans

## Deriving Epics from Requirements

### Standard Epic Structure for PRD-Driven Plans

Most PRDs map to this epic progression:

```
1. Setup & Infrastructure   — Project init, deps, config
2. Data & Models            — Schema, types, data layer
3. Core Features            — Primary user-facing functionality
4. Secondary Features       — Supporting features, integrations
5. Quality & Polish         — Error handling, edge cases, UX refinement
6. Verification             — Cross-cutting tests, build validation
```

Adapt this structure based on the PRD. Not every PRD needs all six — collapse or expand as needed.

### Mapping Rules

- **One PRD section → one epic** when the section is cohesive and scoped
- **One PRD section → multiple epics** when it contains independent feature groups
- **Multiple PRD sections → one epic** when they describe different aspects of the same feature
- **User stories → tasks** within the appropriate epic
- **Non-functional requirements → checks** attached to relevant tasks or a dedicated verification epic

## Generating the Plan File

Create the plan at `.crew/setup/plan/index.js` (or `.crew/setup/planning/index.ts` for TypeScript projects).

### Plan File Structure

```typescript
import type { CrewContext } from '../types.js';

// Import epic factories
import { createSetupEpic } from './epics/1-setup/index.js';
import { createCoreEpic } from './epics/2-core/index.js';
import { createVerificationEpic } from './epics/3-verification/index.js';

export async function createPlan(ctx: CrewContext): Promise<unknown> {
  const plan = ctx.createPlan('Project Name — from PRD');

  // Plan-wide variables derived from PRD
  plan.vars({
    framework: 'nextjs',
    features: ['auth', 'dashboard', 'api'],
    // ... extracted from PRD technical requirements
  });

  // Build epics in milestone order
  plan
    .addEpic(createSetupEpic(ctx))
    .addEpic(createCoreEpic(ctx))
    .addEpic(createVerificationEpic(ctx));

  return plan.build();
}
```

### Epic Module Structure

Each epic should be a self-contained module:

```
epics/
├── 1-setup/
│   ├── index.ts          # Epic factory function
│   ├── prompts/          # Task prompt templates
│   │   ├── init-project.md
│   │   └── configure-tooling.md
│   └── README.md         # Epic documentation
├── 2-core/
│   ├── index.ts
│   ├── prompts/
│   │   ├── build-feature.md
│   │   └── implement-api.md
│   ├── executors/        # Custom verification logic
│   │   └── verify-feature.ts
│   └── README.md
└── 3-verification/
    ├── index.ts
    └── README.md
```

### Epic Factory Pattern

```typescript
export function createSetupEpic(ctx: CrewContext) {
  const epic = ctx.createEpic('setup', 'Setup & Infrastructure')
    .basePath('./planning/epics/1-setup');

  epic.addTask(
    ctx.createTask('init', 'Initialize Project')
      .type('coding')
      .skill('repo/init')
      .outputs(['package.json', 'tsconfig.json'])
      .promptFrom('./prompts/init-project.md')
      .check('build')
  );

  epic.addTask(
    ctx.createTask('configure', 'Configure Tooling')
      .type('coding')
      .deps(['init'])
      .promptFrom('./prompts/configure-tooling.md')
      .check('tsc')
  );

  return epic;
}
```

## Task Decomposition Strategies

### From User Stories

Each user story in the PRD becomes one or more tasks:

```
PRD: "As a user, I can register with email and password"
  → task: 'auth-model'     — Create user model and schema
  → task: 'auth-api'       — Build registration API endpoint
  → task: 'auth-ui'        — Build registration form
  → task: 'auth-validate'  — Add input validation and error handling
```

### From Feature Descriptions

Larger feature descriptions decompose using the scaffold → implement → verify pattern:

```typescript
// PRD says: "Dashboard with real-time analytics"
epic.addTask(ctx.createTask('dashboard-layout', 'Dashboard Layout')
  .outputs(['src/app/dashboard/page.tsx'])
  .promptFrom('./prompts/dashboard-layout.md')
  .check('build'));

epic.addTask(ctx.createTask('dashboard-charts', 'Dashboard Charts')
  .deps(['dashboard-layout'])
  .outputs(['src/components/charts/'])
  .promptFrom('./prompts/dashboard-charts.md')
  .check('build'));

epic.addTask(ctx.createTask('dashboard-realtime', 'Real-time Updates')
  .deps(['dashboard-charts'])
  .outputs(['src/lib/realtime.ts'])
  .promptFrom('./prompts/dashboard-realtime.md')
  .check('tsc')
  .check('build'));
```

### Dynamic Task Generation

When the PRD lists repeated elements (pages, API endpoints, models), use factory functions:

```typescript
export function createFeatureEpics(ctx: CrewContext, features: string[]) {
  return features.map(feature => {
    const epic = ctx.createEpic(`feature-${feature}`, `Feature: ${feature}`);

    epic.addTask(
      ctx.createTask(`${feature}:implement`, `Implement ${feature}`)
        .type('coding')
        .promptFrom('./prompts/implement-feature.md', { feature })
        .check('tsc')
    );

    epic.addTask(
      ctx.createTask(`${feature}:verify`, `Verify ${feature}`)
        .type('verify')
        .deps([`${feature}:implement`])
        .check('build')
    );

    return epic;
  });
}
```

## Wiring Dependencies

### Within an Epic

Use `deps` for sequential steps within a feature:

```typescript
// Data layer → API → UI (natural build order)
ctx.createTask('model', 'Data Model').outputs(['src/models/user.ts']);
ctx.createTask('api', 'API Route').deps(['model']).outputs(['src/app/api/users/']);
ctx.createTask('ui', 'User Interface').deps(['api']).outputs(['src/app/users/']);
```

### Across Epics

Reference task IDs from other epics for cross-cutting dependencies:

```typescript
// Feature epic depends on setup completing
ctx.createTask('feature-start', 'Start Feature Work')
  .deps(['install-deps'])  // task from setup epic
```

### Maximizing Parallelism

Only add `deps` where there's a true constraint. Independent features run concurrently:

```
         ┌→ auth ──────┐
setup →  ├→ dashboard ──├→ integration
         └→ api ───────┘
```

## Adding Checks and Acceptance Criteria

### Mapping PRD Acceptance Criteria to Checks

| PRD Acceptance Criteria | Crew Check |
|------------------------|------------|
| "Must compile without errors" | `.check('tsc')` |
| "Must build successfully" | `.check('build')` |
| "Must pass code review" | `.review('human', { prompt })` |
| "Must meet design spec" | `.review('agent', { prompt })` |
| "Must handle error cases" | Custom check or executor |

### Verification Tasks

For complex acceptance criteria, create dedicated verification tasks:

```typescript
epic.addTask(
  ctx.createTask('verify-feature', 'Verify Feature Requirements')
    .type('verify')
    .deps(['implement-feature'])
    .executeFrom('./executors/verify-feature.ts')
    .check('tsc')
    .check('build', { autoFix: true, maxRetries: 3 })
);
```

### Review Gates for Critical Requirements

PRD requirements marked as critical or security-sensitive should have review gates:

```typescript
ctx.createTask('auth-impl', 'Implement Authentication')
  .check('tsc')
  .check('build')
  .review('human', { prompt: 'Review auth implementation against PRD security requirements' })
```

## Linking Goals

### Creating Goals from PRD Milestones

Each PRD milestone or success metric becomes a crew goal:

```bash
crew goal create \
  --id "mvp-launch" \
  --title "MVP Launch" \
  --description "All core features from PRD sections 2-4 are implemented and verified" \
  --criteria "All core feature tasks pass checks" \
  --criteria "Integration tests pass" \
  --criteria "Build succeeds with zero warnings"
```

### Linking Goals to Epics

```bash
crew goal mvp-launch link --epics setup,core-features,verification
```

### Goal-First Planning

For large PRDs, define goals first and then build the plan to satisfy them:

1. Extract milestones from PRD → create goals
2. For each goal, identify required features → create epics
3. For each feature, decompose into tasks
4. Wire everything together and verify goal coverage

## Review and Validation

### Plan Completeness Check

After generating the plan, verify against the PRD:

1. **Requirement coverage** — Every PRD requirement has at least one task. No orphaned requirements.
2. **Acceptance criteria coverage** — Every PRD acceptance criterion maps to a check or review gate.
3. **Scope alignment** — No tasks that go beyond the PRD scope. Out-of-scope items are excluded.
4. **Dependency correctness** — No circular dependencies, no missing upstream tasks.
5. **Epic ordering** — Epics follow a logical build progression matching the PRD phases.

### Automated Verification

```bash
crew plan init     # Generate the plan
crew verify        # Run structural checks
crew tree          # Visual inspection of task graph
```

### Manual Review Checklist

- [ ] Every PRD feature has corresponding tasks
- [ ] Every acceptance criterion maps to a check
- [ ] Tasks are atomic — one concern per task
- [ ] Dependencies reflect true ordering constraints
- [ ] Parallel tasks are not unnecessarily sequenced
- [ ] Goals are linked to the right epics
- [ ] Plan vars capture all PRD configuration values
- [ ] Prompt templates reference the correct variables

## Project Type References

When the PRD describes a specific project type, consult the matching reference for pre-built epic structures, dependency graphs, and task decomposition patterns:

| Project Type | When to Use | Reference |
|-------------|-------------|-----------|
| **SaaS Application** | Multi-tenant apps with auth, billing, teams | `references/projects/saas-application.md` |
| **CLI Tool** | Command-line tools with subcommands, config | `references/projects/cli-tool.md` |
| **E-Commerce Platform** | Online stores with cart, checkout, payments | `references/projects/ecommerce-platform.md` |
| **Chrome Extension** | Browser extensions with content scripts, popups | `references/projects/chrome-extension.md` |
| **Real-Time App** | WebSocket, collaboration, live data | `references/projects/realtime-app.md` |
| **Component Library** | Design systems, npm packages, Storybook | `references/projects/component-library.md` |
| **Mobile App** | React Native / Expo cross-platform apps | `references/projects/mobile-app.md` |
| **Landing Page** | Marketing sites, product pages, SEO | `references/projects/landing-page.md` |

Each reference includes:
- Standard epic progression tailored to the project type
- Pre-wired dependency graphs
- Factory patterns for repeated structures
- Plan variables specific to the domain
- PRD-to-epic mapping hints
- Recommended check strategies

Use these as starting points — adapt, merge, or extend based on the specific PRD. Many real projects combine patterns (e.g., a SaaS app with a landing page, or an e-commerce site with real-time features).

## Common PRD Patterns

### CRUD Application

PRD describes a data-driven app with standard operations:

```typescript
const entities = ['users', 'products', 'orders']; // from PRD

for (const entity of entities) {
  const epic = ctx.createEpic(`crud-${entity}`, `${entity} CRUD`);

  epic.addTask(ctx.createTask(`${entity}:model`, `${entity} Data Model`)
    .outputs([`src/models/${entity}.ts`])
    .promptFrom('./prompts/create-model.md', { entity })
    .check('tsc'));

  epic.addTask(ctx.createTask(`${entity}:api`, `${entity} API`)
    .deps([`${entity}:model`])
    .outputs([`src/app/api/${entity}/`])
    .promptFrom('./prompts/create-api.md', { entity })
    .check('build'));

  epic.addTask(ctx.createTask(`${entity}:ui`, `${entity} Pages`)
    .deps([`${entity}:api`])
    .outputs([`src/app/${entity}/`])
    .promptFrom('./prompts/create-pages.md', { entity })
    .check('build'));

  plan.addEpic(epic);
}
```

### Multi-Page Application

PRD lists specific pages with requirements per page:

```typescript
// Extract page definitions from PRD
const pages = [
  { slug: 'home', title: 'Home Page', sections: ['hero', 'features', 'cta'] },
  { slug: 'pricing', title: 'Pricing Page', sections: ['tiers', 'faq'] },
  // ...
];

plan.addEpics(pages.map(page => {
  const epic = ctx.createEpic(`page-${page.slug}`, page.title);

  epic.addTask(ctx.createTask(`${page.slug}:build`, `Build ${page.title}`)
    .type('coding')
    .outputs([`src/app/${page.slug}/page.tsx`])
    .promptFrom('./prompts/build-page.md', { page })
    .check('build'));

  epic.addTask(ctx.createTask(`${page.slug}:verify`, `Verify ${page.title}`)
    .type('verify')
    .deps([`${page.slug}:build`])
    .check('tsc')
    .check('build'));

  return epic;
}));
```

### API-First Application

PRD specifies API contracts before UI:

```typescript
// Epic 1: API layer
const api = ctx.createEpic('api', 'API Layer');
// ... endpoint tasks from PRD API spec

// Epic 2: Client SDK
const sdk = ctx.createEpic('sdk', 'Client SDK');
sdk.addTask(ctx.createTask('generate-types', 'Generate API Types')
  .deps(['api-complete'])  // cross-epic dep
  .outputs(['src/lib/api-types.ts']));

// Epic 3: UI consuming the SDK
const ui = ctx.createEpic('ui', 'User Interface');
// ... UI tasks depending on SDK
```

### Feature Flag–Gated Features

PRD marks some features as optional or phase-2:

```typescript
plan.vars({ enableBeta: false, enableAnalytics: true });

epic.addTask(
  ctx.createTask('analytics', 'Analytics Integration')
    .shouldStart(ctx => ctx.vars.enableAnalytics)
    .promptFrom('./prompts/analytics.md')
    .check('build')
);

epic.addTask(
  ctx.createTask('beta-features', 'Beta Features')
    .shouldStart(ctx => ctx.vars.enableBeta)
    .promptFrom('./prompts/beta.md')
    .check('build')
);
```
