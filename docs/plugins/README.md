# Plugin System

**Extend Crew with custom checks, tools, task types, and integrations.**

Crew's plugin system allows you to extend the framework with project-specific or reusable functionality. Plugins can provide custom checks, tools, task types, and more.

## In This Section

### [Using Plugins](./using-plugins.md)
How to install, configure, and activate plugins in your project.

### [Built-in Plugins](./builtin-plugins.md)
Overview of plugins shipped with Crew: TypeScript, Next.js, Git, Docker, etc.

### [Writing Plugins](./writing-plugins.md)
Create custom plugins for your organization or publish to npm.

---

## Quick Reference

### Using a Plugin

```typescript
// crew.json
{
  "plugins": [
    "@milomit/crew-plugin-typescript",
    "@milomit/crew-plugin-nextjs",
    "./local-plugins/my-custom-plugin"
  ]
}
```

### Built-in Plugins

```typescript
import { crew } from '@milomit/crew';
import { typescriptPlugin, nextjsPlugin } from '@milomit/crew/plugins';

const project = crew.project('my-app')
  .use(typescriptPlugin)
  .use(nextjsPlugin)
  .addEpic(...);
```

### Custom Plugin

```typescript
// my-plugin.ts
import { Plugin } from '@milomit/crew';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.0.0',

  checks: {
    'my-check': async (config, ctx) => {
      // Custom check logic
      return { pass: true };
    }
  },

  tools: {
    myTool: (ctx) => async (arg: string) => {
      // Custom tool logic
      return `Processed: ${arg}`;
    }
  },

  taskTypes: {
    'my-task-type': {
      description: 'Custom task type',
      defaultChecks: ['my-check']
    }
  }
};
```

---

## What Plugins Can Do

### 1. Add Custom Checks
```typescript
checks: {
  'api-compliant': async (config, ctx) => {
    // Validate API design
    return { pass: true, message: 'API follows standards' };
  }
}
```

### 2. Add Custom Tools
```typescript
tools: {
  deploy: (ctx) => async (env: string) => {
    // Deploy application
    await ctx.shell(`deploy.sh ${env}`);
  }
}
```

### 3. Define Task Types
```typescript
taskTypes: {
  'react-component': {
    description: 'Create a React component',
    defaultChecks: ['file-exists', 'typescript-valid'],
    template: '...'
  }
}
```

### 4. Hook into Lifecycle
```typescript
hooks: {
  onProjectStart: async (project) => {
    console.log('Project starting:', project.id);
  },
  onTaskComplete: async (task) => {
    console.log('Task done:', task.id);
  }
}
```

### 5. Extend Configuration
```typescript
config: {
  schema: {
    myPluginConfig: { type: 'object' }
  },
  defaults: {
    myPluginConfig: { enabled: true }
  }
}
```

---

## Built-in Plugins Overview

### TypeScript Plugin
- Adds `typescript-valid` check
- Provides `tsc` tool
- Configures TypeScript task types

### Next.js Plugin
- Adds `nextjs-build` check
- Provides Next.js-specific tools
- Task types for pages, components, API routes

### Git Plugin
- Adds `git-clean` check
- Provides Git tools (commit, branch, etc.)
- Pre-commit validation

### Docker Plugin
- Adds `dockerfile-valid` check
- Provides Docker tools (build, run, push)
- Container task types

See [Built-in Plugins](./builtin-plugins.md) for complete list.

---

## Plugin Discovery

Crew loads plugins from:

1. **npm packages** - `@milomit/crew-plugin-*`
2. **Local files** - `./plugins/my-plugin.ts`
3. **Inline** - `.use(pluginObject)`

### Load Order

```
1. Built-in plugins (if enabled)
2. Plugins from crew.json
3. Plugins from .use() calls
```

Later plugins can override earlier ones.

---

## Best Practices

### ✅ Do

- Namespace check/tool names (e.g., `myorg:check-name`)
- Provide clear error messages
- Document plugin configuration
- Test plugins thoroughly
- Version plugins semantically

### ❌ Don't

- Override core checks without good reason
- Create side effects in plugin load
- Couple plugins to specific projects
- Skip error handling

---

## Publishing Plugins

### Package Structure

```
crew-plugin-myfeature/
├── package.json
├── src/
│   ├── index.ts       # Plugin export
│   ├── checks/        # Custom checks
│   ├── tools/         # Custom tools
│   └── types/         # Task types
├── README.md
└── tests/
```

### package.json

```json
{
  "name": "@myorg/crew-plugin-myfeature",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["crew", "crew-plugin"],
  "peerDependencies": {
    "@milomit/crew": "^1.0.0"
  }
}
```

### Publishing

```bash
npm publish --access public
```

---

## Next Steps

- **Use plugins**: [Using Plugins](./using-plugins.md)
- **Explore built-ins**: [Built-in Plugins](./builtin-plugins.md)
- **Create your own**: [Writing Plugins](./writing-plugins.md)
- **API reference**: [Plugin API](../api-reference/types.md#plugin)

---

[← Back to Documentation Home](../README.md)
