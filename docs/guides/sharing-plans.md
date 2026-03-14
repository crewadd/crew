# Sharing and Reusing Plans

**Create reusable plan templates and share them across projects.**

[[docs](../README.md) > [guides](./README.md) > sharing-plans]

---

## Overview

Crew supports sharing plans across projects through:

1. **Plan templates** - Reusable TypeScript modules
2. **NPM packages** - Share via npm registry
3. **GitHub templates** - Start from examples
4. **Organization standards** - Enforce consistent patterns
5. **Plan composition** - Combine multiple sub-plans

---

## Creating Plan Templates

### Basic Template Structure

```bash
# Create a plan template package
mkdir crew-plan-templates
cd crew-plan-templates
npm init -y
npm install crew
```

### Exportable Plan Function

```typescript
// plans/nextjs-app.ts
import type { PlanContext } from 'crew';

export async function createNextJsAppPlan(ctx: PlanContext) {
  const plan = ctx.createPlan('Next.js Application');

  plan.addEpic(
    ctx.createEpic('setup', 'Project Setup')
      .addTask(
        ctx.createTask('init', 'Initialize Next.js')
          .prompt('Create Next.js project with TypeScript')
          .check({ cmd: 'test -f pages/index.tsx' })
      )
      .addTask(
        ctx.createTask('config', 'Configure')
          .deps(['init'])
          .prompt('Setup ESLint, Prettier, TypeScript config')
          .check({ cmd: 'npm run lint' })
      )
  );

  plan.addEpic(
    ctx.createEpic('pages', 'Core Pages')
      .addTask(
        ctx.createTask('home', 'Home Page')
          .prompt('Create home page')
          .check({ cmd: 'test -f pages/index.tsx' })
      )
      .addTask(
        ctx.createTask('about', 'About Page')
          .deps(['home'])
          .prompt('Create about page')
          .check({ cmd: 'test -f pages/about.tsx' })
      )
  );

  return plan.build();
}

export async function createNextJsAPITemplate(ctx: PlanContext) {
  const plan = ctx.createPlan('Next.js API');

  plan.addEpic(
    ctx.createEpic('api', 'API Routes')
      .addTask(
        ctx.createTask('users', 'Create Users API')
          .prompt('Create /api/users endpoints')
          .check({ cmd: 'test -f pages/api/users.ts' })
      )
  );

  return plan.build();
}
```

### Parameterized Templates

```typescript
// plans/rest-api.ts
export interface RestApiOptions {
  name: string;
  database?: 'postgres' | 'mysql' | 'mongodb';
  authentication?: 'jwt' | 'oauth2' | 'basic';
  port?: number;
}

export async function createRestApiPlan(
  ctx: PlanContext,
  options: RestApiOptions
) {
  const plan = ctx.createPlan(options.name);

  // Database setup (conditional)
  if (options.database) {
    plan.addEpic(
      ctx.createEpic('db', 'Database Setup')
        .addTask(
          ctx.createTask('schema', `Setup ${options.database}`)
            .prompt(`Create ${options.database} database schema`)
            .check({ cmd: `test -f schema.${options.database}.sql` })
        )
    );
  }

  // Authentication (conditional)
  if (options.authentication) {
    const authEpic = ctx.createEpic('auth', `${options.authentication} Auth`);

    authEpic.addTask(
      ctx.createTask('auth', 'Implement Authentication')
        .prompt(`Implement ${options.authentication} authentication`)
        .check({ cmd: 'npm test -- auth' })
    );

    plan.addEpic(authEpic);
  }

  // Core API
  plan.addEpic(
    ctx.createEpic('api', 'REST API')
      .addTask(
        ctx.createTask('endpoints', 'Create API Endpoints')
          .prompt(`Create REST API listening on port ${options.port || 3000}`)
          .check({ cmd: 'npm test -- api' })
      )
  );

  return plan.build();
}
```

---

## Using Templates in Projects

### Import and Use

```typescript
// .crew/setup/planning/index.ts
import { createRestApiPlan } from 'crew-plan-templates/plans/rest-api';

export async function createPlan(ctx) {
  return createRestApiPlan(ctx, {
    name: 'My API',
    database: 'postgres',
    authentication: 'jwt',
    port: 3001
  });
}
```

### Composing Multiple Templates

```typescript
// Combine multiple templates
import { createRestApiPlan } from 'crew-plan-templates/plans/rest-api';
import { createReactAppPlan } from 'crew-plan-templates/plans/react';

export async function createPlan(ctx) {
  // Create separate plans
  const apiPlan = await createRestApiPlan(ctx, {
    name: 'API',
    database: 'postgres',
    authentication: 'jwt'
  });

  const uiPlan = await createReactAppPlan(ctx, {
    name: 'UI',
    typescript: true
  });

  // Manually merge epics
  const merged = ctx.createPlan('Full Stack App');

  for (const epic of apiPlan.epics) {
    merged.addEpic(epic);
  }

  for (const epic of uiPlan.epics) {
    merged.addEpic(epic);
  }

  return merged.build();
}
```

---

## Publishing to NPM

### Package Structure

```
crew-plan-templates/
├── package.json
├── plans/
│   ├── nextjs.ts
│   ├── rest-api.ts
│   ├── react-app.ts
│   └── index.ts
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "crew-plan-templates",
  "version": "1.0.0",
  "description": "Reusable Crew plan templates",
  "main": "dist/index.js",
  "exports": {
    "./plans/rest-api": "./dist/plans/rest-api.js",
    "./plans/nextjs": "./dist/plans/nextjs.js",
    "./plans/react": "./dist/plans/react.js"
  },
  "files": ["dist/"],
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "crew": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Publishing

```bash
npm publish
```

### Using Published Template

```bash
npm install crew-plan-templates
```

```typescript
import { createRestApiPlan } from 'crew-plan-templates/plans/rest-api';

export async function createPlan(ctx) {
  return createRestApiPlan(ctx, { /* options */ });
}
```

---

## GitHub Templates

### Template Repository

Create a template repository on GitHub:

```bash
mkdir crew-nextjs-template
cd crew-nextjs-template
git init
npm init -y
npm install crew

# Setup Crew
npx crew init --preset nextjs

# Create the template
git add .
git commit -m "Initial template"
git push
```

### Use as GitHub Template

```bash
# Users click "Use this template" on GitHub or:
gh repo create my-app --template crew-framework/crew-nextjs-template
cd my-app
npm install
npx crew run
```

---

## Organization Standards

### Shared Plan Library

```typescript
// organizations/my-company/common-plans.ts
export const COMPANY_EPICS = {
  SETUP: {
    title: 'Company Setup',
    tasks: [
      {
        id: 'init',
        title: 'Initialize Project',
        prompt: 'Follow our standard scaffolding process',
        checks: ['npm run lint', 'npm test']
      }
    ]
  },
  SECURITY: {
    title: 'Security Review',
    tasks: [
      {
        id: 'audit',
        title: 'Security Audit',
        prompt: 'Run security audit and fix any issues'
      }
    ]
  },
  COMPLIANCE: {
    title: 'Compliance Check',
    tasks: [
      {
        id: 'licenses',
        title: 'Check Licenses',
        prompt: 'Verify all dependencies have approved licenses'
      }
    ]
  }
};

export function addCompanyStandards(plan, ctx) {
  // Automatically add company standards to every plan
  plan.addEpic(
    ctx.createEpic('security', COMPANY_EPICS.SECURITY.title)
      .addTask(
        ctx.createTask(
          COMPANY_EPICS.SECURITY.tasks[0].id,
          COMPANY_EPICS.SECURITY.tasks[0].title
        )
          .prompt(COMPANY_EPICS.SECURITY.tasks[0].prompt)
      )
  );

  return plan;
}
```

### Use Organization Standards

```typescript
// .crew/setup/planning/index.ts
import {
  COMPANY_EPICS,
  addCompanyStandards
} from '@company/crew-standards';

export async function createPlan(ctx) {
  let plan = ctx.createPlan('My Project');

  // Add custom epics
  plan.addEpic(
    ctx.createEpic('features', 'Core Features')
      .addTask(ctx.createTask('api', 'Build API').prompt('...'))
  );

  // Automatically add company standards
  plan = addCompanyStandards(plan, ctx);

  return plan.build();
}
```

---

## Plan Variants

### Configuration-Based Variants

```typescript
// plans/web-app.ts
export async function createWebAppPlan(
  ctx,
  config: {
    name: string;
    frontend?: 'react' | 'vue' | 'svelte';
    backend?: 'node' | 'python' | 'ruby';
    database?: string;
  }
) {
  const plan = ctx.createPlan(config.name);

  // Frontend epic
  if (config.frontend === 'react') {
    plan.addEpic(createReactEpic(ctx));
  } else if (config.frontend === 'vue') {
    plan.addEpic(createVueEpic(ctx));
  }

  // Backend epic
  if (config.backend === 'node') {
    plan.addEpic(createNodeEpic(ctx));
  } else if (config.backend === 'python') {
    plan.addEpic(createPythonEpic(ctx));
  }

  return plan.build();
}
```

### Use Variant

```typescript
// Use React + Node variant
export async function createPlan(ctx) {
  return createWebAppPlan(ctx, {
    name: 'My Web App',
    frontend: 'react',
    backend: 'node',
    database: 'postgres'
  });
}

// Use Vue + Python variant
export async function createPlan(ctx) {
  return createWebAppPlan(ctx, {
    name: 'Analytics App',
    frontend: 'vue',
    backend: 'python',
    database: 'postgresql'
  });
}
```

---

## Real-World Example: Startup Template

```typescript
// crew-startup-templates package
export async function createStartupMVPPlan(
  ctx,
  options: {
    productName: string;
    mvpFeatures: string[];
    targetMarket: string;
  }
) {
  const plan = ctx.createPlan(`${options.productName} MVP`);

  // Planning phase
  plan.addEpic(
    ctx.createEpic('planning', 'Planning')
      .addTask(
        ctx.createTask('spec', 'Write Spec')
          .prompt(`Write spec for ${options.productName}`)
      )
      .addTask(
        ctx.createTask('roadmap', 'Create Roadmap')
          .prompt(`Create roadmap for ${options.productName}`)
      )
  );

  // Backend phase
  plan.addEpic(
    ctx.createEpic('backend', 'Backend Development')
      .addTask(
        ctx.createTask('db', 'Database Schema')
          .prompt('Design database for MVP')
      )
      .addTask(
        ctx.createTask('api', 'Build API')
          .deps(['db'])
          .prompt('Build API for MVP')
      )
  );

  // Frontend phase
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Development')
      .addTask(
        ctx.createTask('ui', 'Build UI')
          .prompt('Build UI for MVP')
      )
      .addTask(
        ctx.createTask('integrate', 'Integration')
          .deps(['ui'])
          .prompt('Integrate with API')
      )
  );

  // Optional feature epics
  for (const feature of options.mvpFeatures) {
    plan.addEpic(
      ctx.createEpic(feature.toLowerCase(), `${feature} Feature`)
        .addTask(
          ctx.createTask(
            `${feature.toLowerCase()}-impl`,
            `Implement ${feature}`
          )
            .prompt(`Implement ${feature} for ${options.productName}`)
        )
    );
  }

  return plan.build();
}
```

### Use Startup Template

```typescript
import { createStartupMVPPlan } from 'crew-startup-templates';

export async function createPlan(ctx) {
  return createStartupMVPPlan(ctx, {
    productName: 'BookShare',
    mvpFeatures: ['User Authentication', 'Book Listing', 'Search'],
    targetMarket: 'Book lovers'
  });
}
```

---

## Best Practices

### 1. Document Templates Well

```typescript
/**
 * Creates a REST API plan with optional authentication and database
 *
 * @param ctx - Plan context from Crew
 * @param options - Configuration options
 * @param options.name - Project name
 * @param options.database - Database type (optional)
 * @param options.authentication - Auth type (optional)
 * @example
 * createRestApiPlan(ctx, {
 *   name: 'My API',
 *   database: 'postgres',
 *   authentication: 'jwt'
 * })
 */
export async function createRestApiPlan(ctx, options) {
  // ...
}
```

### 2. Make Templates Flexible

```typescript
// Good: Supports customization
createRestApiPlan(ctx, { name, database, auth })

// Bad: Too rigid
createRestApiPlan(ctx)  // Only postgres + JWT
```

### 3. Version Templates

```json
{
  "name": "crew-plan-templates",
  "version": "1.2.0"
}
```

```typescript
// Declare minimum version
"crew": "^1.0.0"
```

### 4. Test Templates

```bash
# In template package
npm test  # Test all variants
```

---

## Troubleshooting

### Template Doesn't Work in My Project

```bash
# Check versions
npm list crew crew-plan-templates

# Ensure compatibility
npm install crew@latest crew-plan-templates@latest
```

### Custom Modifications to Template

```typescript
// Don't modify the template directly
// Instead, extend it:

import { createRestApiPlan } from 'crew-plan-templates/plans/rest-api';

export async function createPlan(ctx) {
  let plan = await createRestApiPlan(ctx, { /* options */ });

  // Add custom epic
  plan.addEpic(
    ctx.createEpic('custom', 'Custom Features')
      .addTask(ctx.createTask('custom', 'Custom Task').prompt('...'))
  );

  return plan.build();
}
```

---

## See Also

- [Multi-Agent Workflows](./multi-agent-workflows.md) - Coordination patterns
- [Version Control](./version-control.md) - Managing templates in Git

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
