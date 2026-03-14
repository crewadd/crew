# CLI Tool

Reference template for building command-line tools and developer utilities with argument parsing, subcommands, configuration, and output formatting.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Runtime | Node.js, Bun, Deno |
| Arg Parser | commander, yargs, citty, clipanion |
| Config | cosmiconfig, c12, rc |
| Output | chalk/picocolors, ora (spinners), cli-table3, boxen |
| Prompts | inquirer, prompts, clack |
| File System | fs-extra, globby, fast-glob |
| Testing | vitest, jest, execa (for integration) |
| Build | tsup, unbuild, esbuild |
| Package | npm, JSR |

## Standard Epic Progression

```
1. Setup & Scaffolding    — Project init, TypeScript config, build pipeline
2. CLI Framework          — Entry point, arg parsing, help text, version flag
3. Core Commands          — Primary subcommands (the main functionality)
4. Configuration          — Config file loading, defaults, environment variables
5. Output & UX            — Formatting, colors, progress indicators, error messages
6. Secondary Commands     — Supporting commands (init, config, doctor, etc.)
7. Testing                — Unit tests, integration tests, snapshot tests
8. Distribution           — bin linking, npm packaging, man pages
```

## Epic Patterns

### CLI Framework

```typescript
const framework = ctx.createEpic('cli-framework', 'CLI Framework');

framework.addTask(ctx.createTask('cli:entry', 'CLI Entry Point')
  .type('coding')
  .outputs(['src/cli.ts', 'src/index.ts', 'bin/cli.js'])
  .promptFrom('./prompts/cli-entry.md')
  .check('tsc'));

framework.addTask(ctx.createTask('cli:commands', 'Command Registry')
  .type('coding')
  .deps(['cli:entry'])
  .outputs(['src/commands/index.ts'])
  .promptFrom('./prompts/cli-commands.md')
  .check('tsc'));

framework.addTask(ctx.createTask('cli:global-opts', 'Global Options')
  .type('coding')
  .deps(['cli:entry'])
  .outputs(['src/options.ts'])
  .promptFrom('./prompts/cli-global-opts.md')
  .check('tsc'));
```

### Core Commands (Factory Pattern)

```typescript
export function createCommandEpics(ctx: CrewContext, commands: CommandDef[]) {
  return commands.map(cmd => {
    const epic = ctx.createEpic(`cmd-${cmd.name}`, `Command: ${cmd.name}`);

    epic.addTask(ctx.createTask(`${cmd.name}:implement`, `Implement ${cmd.name}`)
      .type('coding')
      .deps(['cli:commands'])
      .outputs([`src/commands/${cmd.name}.ts`])
      .promptFrom('./prompts/implement-command.md', { command: cmd })
      .check('tsc'));

    epic.addTask(ctx.createTask(`${cmd.name}:test`, `Test ${cmd.name}`)
      .type('coding')
      .deps([`${cmd.name}:implement`])
      .outputs([`tests/commands/${cmd.name}.test.ts`])
      .promptFrom('./prompts/test-command.md', { command: cmd })
      .check('tsc')
      .check('build'));

    return epic;
  });
}
```

### Configuration

```typescript
const config = ctx.createEpic('config', 'Configuration System');

config.addTask(ctx.createTask('config:loader', 'Config File Loader')
  .type('coding')
  .outputs(['src/config/loader.ts', 'src/config/schema.ts'])
  .promptFrom('./prompts/config-loader.md')
  .check('tsc'));

config.addTask(ctx.createTask('config:defaults', 'Default Values & Env Vars')
  .type('coding')
  .deps(['config:loader'])
  .outputs(['src/config/defaults.ts', 'src/config/env.ts'])
  .promptFrom('./prompts/config-defaults.md')
  .check('tsc'));

config.addTask(ctx.createTask('config:init-cmd', 'Init Config Command')
  .type('coding')
  .deps(['config:loader', 'cli:commands'])
  .outputs(['src/commands/init.ts'])
  .promptFrom('./prompts/config-init.md')
  .check('build'));
```

### Output & UX

```typescript
const output = ctx.createEpic('output', 'Output & UX');

output.addTask(ctx.createTask('output:logger', 'Logger & Formatting')
  .type('coding')
  .outputs(['src/lib/logger.ts', 'src/lib/format.ts'])
  .promptFrom('./prompts/output-logger.md')
  .check('tsc'));

output.addTask(ctx.createTask('output:errors', 'Error Handling & Messages')
  .type('coding')
  .deps(['output:logger'])
  .outputs(['src/lib/errors.ts'])
  .promptFrom('./prompts/output-errors.md')
  .check('tsc'));

output.addTask(ctx.createTask('output:progress', 'Progress Indicators')
  .type('coding')
  .deps(['output:logger'])
  .outputs(['src/lib/progress.ts'])
  .promptFrom('./prompts/output-progress.md')
  .check('tsc'));
```

## Dependency Graph

```
cli:entry ──→ cli:commands ──→ [command implementations]
    │              │
    └→ cli:global-opts    config:loader ──→ config:defaults
                                │
                                └→ config:init-cmd

output:logger ──→ output:errors
       │
       └→ output:progress
```

## Plan Variables

```typescript
plan.vars({
  name: 'my-cli',
  binName: 'mycli',
  parser: 'commander',           // 'commander' | 'yargs' | 'citty'
  configFormat: 'cosmiconfig',   // 'cosmiconfig' | 'c12' | 'none'
  commands: ['run', 'build', 'dev', 'init'],
  globalFlags: ['--verbose', '--quiet', '--config'],
  outputFormat: 'text',          // 'text' | 'json' | 'table'
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Commands / subcommands | Individual command epics |
| CLI flags / options | `cli:global-opts` + per-command options |
| Configuration / dotfiles | `config` epic |
| Output format / display | `output` epic |
| Installation / distribution | `distribution` epic |
| Interactive prompts / wizards | Dedicated `interactive` epic |

## Checks Strategy

- `tsc` on all library and command modules
- `build` on entry point and distribution tasks
- Integration tests via execa (run the CLI and assert stdout/stderr)
- Snapshot tests for help text and formatted output
