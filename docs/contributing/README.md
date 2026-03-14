# Contributing to Crew

**Help make Crew better - contribute code, documentation, or ideas.**

We welcome contributions from the community! This section explains how to contribute to the Crew framework.

## In This Section

### [Architecture](./architecture.md)
Codebase architecture and design decisions.

### [Testing](./testing.md)
How to run and write tests for Crew.

### [Release Process](./release-process.md)
How releases are created and published.

---

## Quick Start

### 1. Fork & Clone

```bash
git clone https://github.com/milomit/crew.git
cd crew
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Make Changes

```bash
# Create a branch
git checkout -b feature/my-feature

# Make changes
# ...

# Run tests
pnpm test

# Build
pnpm build
```

### 4. Submit PR

```bash
git push origin feature/my-feature
```

Then open a Pull Request on GitHub.

---

## Ways to Contribute

### 🐛 Bug Reports

- Search existing issues first
- Provide minimal reproduction
- Include environment details
- See [GitHub Issues](https://github.com/milomit/crew/issues)

### 💡 Feature Requests

- Describe the problem you're solving
- Explain your proposed solution
- Consider backwards compatibility
- See [GitHub Discussions](https://github.com/milomit/crew/discussions)

### 📝 Documentation

- Fix typos and errors
- Add examples
- Clarify confusing sections
- Translate to other languages

### 🔧 Code

- Fix bugs
- Implement features
- Improve performance
- Add tests

### 🎨 Plugins

- Create new plugins
- Share with community
- Publish to npm

---

## Development Workflow

### Project Structure

```
crew/
├── packages/
│   ├── crew/              # Main package
│   │   ├── src/
│   │   │   ├── tasks/     # Task builder
│   │   │   ├── orchestrator/  # Execution engine
│   │   │   ├── store/     # State persistence
│   │   │   ├── verifier/  # Check system
│   │   │   └── cli/       # CLI commands
│   │   └── tests/
│   └── plugins/           # Built-in plugins
├── docs/                  # Documentation
└── examples/              # Example projects
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test path/to/test.ts

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @milomit/crew build

# Watch mode
pnpm build:watch
```

### Linting

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix
```

---

## Code Guidelines

### TypeScript

- Use strict mode
- Provide type annotations
- Avoid `any` (use `unknown` if needed)
- Export types for public APIs

### Naming

- Use descriptive names
- Follow existing conventions
- camelCase for variables/functions
- PascalCase for classes/types

### Testing

- Write tests for new features
- Maintain test coverage
- Use descriptive test names
- Test edge cases

### Documentation

- Document public APIs with JSDoc
- Update relevant docs
- Add examples for new features
- Keep docs in sync with code

---

## Pull Request Process

### Before Submitting

- [ ] Run tests (`pnpm test`)
- [ ] Run linter (`pnpm lint`)
- [ ] Update documentation
- [ ] Add tests for changes
- [ ] Update CHANGELOG.md

### PR Description

Include:

- **What**: What does this PR do?
- **Why**: Why is this change needed?
- **How**: How does it work?
- **Testing**: How did you test it?
- **Breaking**: Any breaking changes?

### Review Process

1. Maintainer reviews code
2. CI tests run
3. Feedback addressed
4. Approved and merged

---

## Code of Conduct

We follow the [Contributor Covenant Code of Conduct](../../.github/CODE_OF_CONDUCT.md).

**In summary:**

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](../../LICENSE)).

---

## Questions?

- **Documentation**: You're here!
- **Discussions**: [GitHub Discussions](https://github.com/milomit/crew/discussions)
- **Issues**: [GitHub Issues](https://github.com/milomit/crew/issues)

---

## Next Steps

- **Understand codebase**: [Architecture](./architecture.md)
- **Write tests**: [Testing](./testing.md)
- **Learn release flow**: [Release Process](./release-process.md)

---

[← Back to Documentation Home](../README.md)
