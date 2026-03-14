# Configuration

**Understanding crew.json and .crew/ directory structure.**

[[docs](../README.md) > [getting-started](./README.md) > configuration]

---

## Overview

Crew configuration lives in two places:

1. **crew.json** - Project-level settings
2. **.crew/** - Execution state and runtime data

---

## crew.json

The `crew.json` file configures your Crew project.

### Minimal Configuration

```json
{
  "name": "my-project",
  "version": "0.1.0"
}
```

### Full Configuration

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "planningFile": ".crew/setup/planning/index.ts",
  "plugins": [
    "@crew/plugin-typescript",
    "@crew/plugin-nextjs"
  ],
  "defaultAgent": {
    "provider": "claude",
    "backend": "cli",
    "model": "claude-3-5-sonnet-20241022"
  },
  "checks": {
    "tsc": {
      "enabled": true,
      "tsconfig": "tsconfig.json"
    },
    "build": {
      "enabled": true,
      "command": "npm run build"
    }
  }
}
```

---

## Configuration Fields

### Project Metadata

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `name` | string | Project name | (required) |
| `version` | string | Project version | `"0.1.0"` |

### Planning

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `planningFile` | string | Path to plan definition | `".crew/setup/planning/index.ts"` |

### Plugins

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `plugins` | string[] | Plugins to load | `[]` |

Plugins can be:
- npm packages: `"@crew/plugin-typescript"`
- Local files: `"./plugins/my-plugin.ts"`

### Agent Configuration

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `defaultAgent.provider` | string | AI provider (`claude`, `kimi`, `qwen`, `gemini`) | `"claude"` |
| `defaultAgent.backend` | string | Backend mode (`cli`, `sdk`) | `"cli"` |
| `defaultAgent.model` | string | Model name | Provider-specific |

#### Provider Models

**Claude (Anthropic)**:
- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-opus-20240229`
- `claude-3-haiku-20240307`

**Kimi (Moonshot)**:
- `moonshot-v1-8k`
- `moonshot-v1-32k`
- `moonshot-v1-128k`

**Qwen (Alibaba)**:
- `qwen-max`
- `qwen-plus`
- `qwen-turbo`

**Gemini (Google)**:
- `gemini-pro`
- `gemini-ultra`

### Checks Configuration

Configure built-in checks:

```json
{
  "checks": {
    "tsc": {
      "enabled": true,
      "tsconfig": "tsconfig.json"
    },
    "build": {
      "enabled": true,
      "command": "npm run build"
    },
    "images": {
      "enabled": false
    }
  }
}
```

---

## .crew/ Directory Structure

The `.crew/` directory contains all execution state:

```
.crew/
├── setup/
│   ├── planning/
│   │   └── index.ts       # Plan definition (you edit this)
│   ├── agents/             # Custom agent personas
│   └── skills/             # Reusable skills library
├── epics/
│   ├── 01-setup/
│   │   ├── epic.yaml      # Epic metadata
│   │   ├── plan.md        # Epic description
│   │   └── tasks/
│   │       ├── 01-init/
│   │       │   ├── task.yaml     # Task metadata
│   │       │   ├── task.md       # Task prompt
│   │       │   ├── context.txt   # Execution context
│   │       │   ├── todo.md       # Agent todo list
│   │       │   └── harness.js    # Auto-generated validation (if using .harness())
│   │       └── 02-deps/
│   │           └── ...
│   └── 02-features/
│       └── ...
├── logs/
│   ├── 2026-03-15-10-00-00.log
│   └── latest.log -> 2026-03-15-10-00-00.log
├── progress.jsonl          # Append-only execution log
└── state.json              # Current execution state
```

### Directory Purposes

| Directory | Purpose | Commit? |
|-----------|---------|---------|
| `setup/planning/` | Plan definition | ✅ Yes |
| `setup/agents/` | Custom personas | ✅ Yes |
| `setup/skills/` | Skills library | ✅ Yes |
| `epics/` | Materialized tasks | ❌ No |
| `logs/` | Execution logs | ❌ No |
| `progress.jsonl` | Execution journal | ❌ No |
| `state.json` | Current state | ❌ No |

---

## Environment Variables

Crew reads these environment variables:

### AI Provider Keys

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export MOONSHOT_API_KEY=sk-...
export DASHSCOPE_API_KEY=sk-...
export GEMINI_API_KEY=...
```

### Crew Configuration

```bash
# Override config file location
export CREW_CONFIG=/path/to/crew.json

# Override state directory
export CREW_DIR=/path/to/.crew

# Log level
export CREW_LOG_LEVEL=debug  # debug | info | warn | error
```

---

## state.json Format

The `state.json` file tracks current execution state:

```json
{
  "name": "my-project",
  "epics": [
    {
      "id": 1,
      "title": "Setup",
      "complete": false,
      "tasks": [
        {
          "id": "m1.1",
          "title": "Initialize",
          "status": "done"
        },
        {
          "id": "m1.2",
          "title": "Install deps",
          "status": "active"
        }
      ]
    }
  ]
}
```

**Task statuses:**
- `pending` - Not started
- `active` - Currently executing
- `done` - Completed successfully
- `blocked` - Waiting on dependencies
- `failed` - Failed after max retries
- `cancelled` - Manually cancelled

---

## progress.jsonl Format

The `progress.jsonl` file is an append-only journal:

```jsonl
{"event":"task:start","taskId":"m1.1","timestamp":"2026-03-15T10:00:00Z"}
{"event":"task:exec","taskId":"m1.1","attempt":1,"output":"Created package.json"}
{"event":"check:run","taskId":"m1.1","check":"file-exists","config":"package.json"}
{"event":"check:pass","taskId":"m1.1","check":"file-exists"}
{"event":"task:done","taskId":"m1.1","result":"success","durationMs":1500}
```

**Event types:**
- `task:start` - Task execution begins
- `task:exec` - Agent execution attempt
- `check:run` - Check starts
- `check:pass` - Check passes
- `check:fail` - Check fails
- `task:done` - Task completes
- `task:fail` - Task fails permanently
- `epic:start` - Epic begins
- `epic:done` - Epic completes

---

## Version Control

Add to `.gitignore`:

```gitignore
# Crew execution state (don't commit)
.crew/epics/
.crew/logs/
.crew/progress.jsonl
.crew/state.json

# Keep plan definition (do commit)
!.crew/setup/
```

---

## Configuration Best Practices

### ✅ Do

- Commit `crew.json` and `.crew/setup/`
- Use environment variables for API keys
- Version your plan definitions
- Document custom agent personas
- Keep `.crew/epics/` git-ignored

### ❌ Don't

- Commit API keys in `crew.json`
- Commit `.crew/epics/` (too noisy)
- Commit `.crew/logs/` (machine-specific)
- Hard-code paths in plan
- Change `state.json` manually

---

## Advanced Configuration

### Custom Planning File

```json
{
  "planningFile": "./my-custom-plan.ts"
}
```

The file must export a `createPlan` function:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');
  // ...
  return plan.build();
}
```

### Plugin Configuration

Plugins can have their own config sections:

```json
{
  "plugins": ["@crew/plugin-nextjs"],
  "nextjs": {
    "appDir": "app",
    "srcDir": "src",
    "typescript": true
  }
}
```

### Check Overrides

Override check behavior:

```json
{
  "checks": {
    "tsc": {
      "enabled": true,
      "strict": true,
      "incremental": false
    }
  }
}
```

---

## Loading Configuration

Crew loads configuration in this order:

1. `crew.json` in current directory
2. `CREW_CONFIG` environment variable
3. Default configuration

```bash
# Use specific config
CREW_CONFIG=./configs/dev.json npx crew run

# Use default
npx crew run
```

---

## Example Configurations

### Minimal (Single-File Projects)

```json
{
  "name": "quick-script",
  "version": "0.1.0"
}
```

### Full-Stack App

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "plugins": [
    "@crew/plugin-typescript",
    "@crew/plugin-nextjs",
    "@crew/plugin-git"
  ],
  "defaultAgent": {
    "provider": "claude",
    "model": "claude-3-5-sonnet-20241022"
  },
  "checks": {
    "tsc": { "enabled": true },
    "build": { "enabled": true },
    "images": { "enabled": false }
  }
}
```

### Monorepo

```json
{
  "name": "monorepo",
  "version": "1.0.0",
  "planningFile": ".crew/setup/planning/index.ts",
  "plugins": [
    "@crew/plugin-typescript",
    "./plugins/monorepo-plugin.ts"
  ],
  "defaultAgent": {
    "provider": "claude",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

---

## Next Steps

- **Build first project**: [Your First Project](./your-first-project.md)
- **Understand structure**: [Projects, Epics & Tasks](../core-concepts/projects-epics-tasks.md)
- **Learn CLI**: [CLI Commands](../cli/commands.md)

---

## See Also

- [Installation](./installation.md) - Setup guide
- [CLI Commands](../cli/commands.md) - All commands
- [Plugins](../plugins/README.md) - Plugin system

---

[← Back to Getting Started](./README.md) | [Documentation Home](../README.md)
