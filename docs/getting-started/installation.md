# Installation

**Get Crew installed and configured on your system.**

[[docs](../README.md) > [getting-started](./README.md) > installation]

---

## Prerequisites

Before installing Crew, ensure you have:

### Required

- **Node.js** 18.0 or later
  ```bash
  node --version  # Should be >= 18.0.0
  ```

- **npm** or **pnpm**
  ```bash
  npm --version   # or
  pnpm --version
  ```

- **Git** (for version control)
  ```bash
  git --version
  ```

### Recommended

- **TypeScript** knowledge - Crew plans are written in TypeScript
- **Unix-like shell** - bash, zsh, or fish (Windows users: WSL recommended)
- **Text editor** with TypeScript support (VS Code, Cursor, etc.)

---

## Installation Methods

### Method 1: npm (Recommended)

```bash
npm install crew
```

This installs Crew locally in your project.

### Method 2: pnpm

```bash
pnpm add crew
```

### Method 3: Global Installation

```bash
npm install -g crew
```

**Note**: Local installation is recommended for project-specific usage.

---

## Verify Installation

Check that Crew is installed correctly:

```bash
npx crew --version
```

You should see output like:

```
crew 0.1.0
```

---

## AI Provider Setup

Crew uses AI agents to execute tasks. You need API keys from at least one provider.

### Supported Providers

- **Claude** (Anthropic) - Recommended
- **Kimi** (Moonshot AI)
- **Qwen** (Alibaba)
- **Gemini** (Google)

### Setting Up API Keys

#### Claude (Anthropic)

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Set environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### Kimi (Moonshot)

```bash
export MOONSHOT_API_KEY=sk-...
```

#### Qwen (Alibaba)

```bash
export DASHSCOPE_API_KEY=sk-...
```

#### Gemini (Google)

```bash
export GEMINI_API_KEY=...
```

### Making Keys Permanent

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Add to ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then reload:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

### Using .env Files (Alternative)

Create a `.env` file in your project root:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
MOONSHOT_API_KEY=sk-...
```

**Important**: Add `.env` to `.gitignore`:

```bash
echo ".env" >> .gitignore
```

---

## Initialize a Project

Navigate to your project directory and initialize Crew:

```bash
cd my-project
npx crew init
```

This creates:

```
my-project/
├── .crew/
│   ├── setup/
│   │   └── planning/
│   │       └── index.ts     # Your plan definition
│   ├── epics/                # Task materialization (git-ignored)
│   ├── logs/                 # Execution logs (git-ignored)
│   ├── progress.jsonl        # Execution journal (git-ignored)
│   └── state.json            # Current state (git-ignored)
└── crew.json                 # Project configuration
```

### Using Presets

Skip manual setup with a preset template:

```bash
npx crew init --preset nextjs
```

Available presets:
- `nextjs` - Next.js application
- `api` - REST API backend
- `lib` - TypeScript library
- `docs` - Documentation site

---

## Project Structure

After initialization, your project structure should look like:

```
my-project/
├── .crew/
│   ├── setup/
│   │   └── planning/
│   │       └── index.ts     # Plan definition (edit this!)
│   ├── epics/                # Generated tasks
│   ├── logs/                 # Execution logs
│   └── progress.jsonl        # Execution history
├── crew.json                 # Configuration
├── .gitignore                # (update to include .crew/epics, .crew/logs)
└── package.json
```

---

## Configuration (crew.json)

The `crew.json` file configures your Crew project:

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "planningFile": ".crew/setup/planning/index.ts",
  "plugins": [],
  "defaultAgent": {
    "provider": "claude",
    "backend": "cli",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

### Configuration Options

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Project name | (required) |
| `version` | Project version | `"0.1.0"` |
| `planningFile` | Path to plan definition | `".crew/setup/planning/index.ts"` |
| `plugins` | Plugins to load | `[]` |
| `defaultAgent.provider` | AI provider | `"claude"` |
| `defaultAgent.backend` | Backend mode | `"cli"` |
| `defaultAgent.model` | Model name | Provider-specific |

See [Configuration](./configuration.md) for full details.

---

## Version Control Setup

Add these patterns to `.gitignore`:

```bash
# .gitignore

# Crew execution state (don't commit)
.crew/epics/
.crew/logs/
.crew/progress.jsonl
.crew/state.json

# Keep plan definition (do commit)
!.crew/setup/
```

**What to commit:**
- `.crew/setup/planning/index.ts` - Your plan
- `crew.json` - Configuration
- `.crew/agents/` - Custom agent personas (if you create any)
- `.crew/skills/` - Skills library (if you create any)

**What NOT to commit:**
- `.crew/epics/` - Generated tasks (too noisy)
- `.crew/logs/` - Execution logs (machine-specific)
- `.crew/progress.jsonl` - Execution history (machine-specific)
- `.crew/state.json` - Current state (machine-specific)

---

## Verify Setup

Test that everything works:

```bash
# Create a minimal plan
cat > .crew/setup/planning/index.ts << 'EOF'
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Hello Crew');
  plan.addEpic(
    ctx.createEpic('test', 'Test Epic')
      .addTask(
        ctx.createTask('hello', 'Say Hello')
          .prompt('Create a file hello.txt with the text "Hello from Crew!"')
          .check({ cmd: 'test -f hello.txt' })
      )
  );
  return plan.build();
}
EOF

# Materialize the plan
npx crew plan init

# Run the plan
npx crew run
```

If successful, you should see:
- Task execution logs
- `hello.txt` created
- All checks passing

---

## Troubleshooting

### "crew: command not found"

**Solution**: Use `npx crew` instead of `crew`, or install globally:

```bash
npm install -g crew
```

### "API key not found"

**Solution**: Export your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
```

### "Cannot find module 'crew'"

**Solution**: Install dependencies:

```bash
npm install
```

### "Planning file not found"

**Solution**: Run `npx crew init` first, or verify `crew.json` points to correct file.

---

## Next Steps

Now that Crew is installed:

1. **Quick Start**: [Quick Start Guide](./quick-start.md) - 5-minute intro
2. **First Project**: [Your First Project](./your-first-project.md) - Complete walkthrough
3. **Configuration**: [Configuration Guide](./configuration.md) - Customize settings

---

## See Also

- [Configuration](./configuration.md) - Detailed configuration options
- [CLI Commands](../cli/commands.md) - All available commands
- [Troubleshooting](../troubleshooting/README.md) - Common issues

---

[← Back to Getting Started](./README.md) | [Documentation Home](../README.md)
