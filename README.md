# Crew Framework

> Reactive agentic project orchestrator — plan, execute, verify, and fix in a resumable loop

Crew is a powerful framework for building agentic coding workflows that can plan, execute, verify, and self-correct. It provides a unified interface to multiple LLM providers and includes tools for code generation, task orchestration, and more.

## Architecture

This is a monorepo containing the following packages:

### Core Packages

- **[crew](./packages/crew)** - The main orchestrator package that provides the CLI and framework for managing agentic coding workflows
- **[agentfn](./packages/agentfn)** - Unified agent interface that provides a single API for working with multiple LLM providers

### LLM Provider Packages

- **[claudefn](./packages/claudefn)** - Claude provider integration
- **[kimifn](./packages/kimifn)** - Kimi provider integration
- **[qwenfn](./packages/qwenfn)** - Qwen provider integration
- **[geminifn](./packages/geminifn)** - Gemini provider integration

### Utility Packages

- **[codegen](./packages/codegen)** - Fluent, indentation-aware source code emitter for generating TypeScript/JSX files

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/crew-framework/crew.git
cd crew

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Usage

For detailed documentation on using the crew framework, see the [crew package README](./packages/crew/README.md).

Quick example:

```bash
# Run crew CLI
pnpm --filter crew crew --help

# Start an agentic workflow
pnpm --filter crew crew "Implement user authentication"
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10.29.3

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter crew build

# Build in watch mode
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm typecheck
```

### Workspace Structure

```
crew/
├── packages/
│   ├── crew/           # Main orchestrator
│   ├── agentfn/        # Unified agent interface
│   ├── claudefn/       # Claude provider
│   ├── kimifn/         # Kimi provider
│   ├── qwenfn/         # Qwen provider
│   ├── geminifn/       # Gemini provider
│   └── codegen/        # Code generation utilities
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

## Publishing

All packages in this monorepo are configured for publishing to npm:

- `crew` - Main package (unscoped)
- `@crew/agentfn` - Agent interface
- `@crew/claudefn`, `@crew/kimifn`, `@crew/qwenfn`, `@crew/geminifn` - LLM providers
- `@crew/codegen` - Code generation utilities

## Documentation

- **Framework Documentation**: See [packages/crew/README.md](./packages/crew/README.md) for comprehensive framework documentation
- **API Reference**: Each package contains its own README with API documentation

## License

MIT - see [LICENSE](./LICENSE) for details

## Contributing

Contributions are welcome! This project is in active development.

## Links

- **GitHub**: https://github.com/crew-framework/crew
- **Issues**: https://github.com/crew-framework/crew/issues
