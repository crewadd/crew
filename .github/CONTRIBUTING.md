# Contributing to crew

Thank you for your interest in contributing to crew! We welcome contributions from the community.

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- crew version, Node.js version, and OS
- Relevant logs or screenshots

### Suggesting Features

Feature requests are welcome! Please:

- Use a clear, descriptive title
- Explain the problem you're trying to solve
- Describe the solution you'd like
- Provide examples or mockups if applicable

### Pull Requests

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/crew.git
   cd crew
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make Your Changes**
   - Write clear, commented code
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation as needed

5. **Test Your Changes**
   ```bash
   pnpm typecheck
   pnpm build
   pnpm test
   ```

6. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `refactor:` - Code refactoring
   - `test:` - Adding tests
   - `chore:` - Maintenance tasks

7. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a pull request on GitHub.

## Development Setup

### Project Structure

```
crew/
├── packages/
│   ├── crew/          # Main orchestrator package
│   ├── codets/        # TypeScript executor
│   ├── agentfn/       # Agent function utilities
│   └── */             # Other packages
├── .github/           # GitHub templates and workflows
└── README.md
```

### Building Packages

```bash
# Build all packages
pnpm build

# Build specific package
cd packages/crew
pnpm build
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/crew
pnpm test

# Watch mode
pnpm test:watch
```

### Debugging

Add `console.log` or use Node.js debugger:

```bash
node --inspect-brk packages/crew/dist/cli.js run
```

## Style Guide

### TypeScript

- Use TypeScript for all new code
- Provide proper type annotations
- Avoid `any` types when possible
- Use meaningful variable names

### Code Organization

- Keep functions small and focused
- Extract reusable logic into utilities
- Add JSDoc comments for public APIs
- Group related code together

### Testing

- Write tests for new features
- Maintain or improve code coverage
- Use descriptive test names
- Test edge cases

## Release Process

Releases are managed by maintainers:

1. Version bumps follow [semver](https://semver.org/)
2. Changelog is auto-generated from commits
3. Packages are published to npm automatically

## Questions?

- 💬 [Start a discussion](https://github.com/crew-framework/crew/discussions)
- 🐛 [Report a bug](https://github.com/crew-framework/crew/issues/new?template=bug_report.yml)
- ✨ [Request a feature](https://github.com/crew-framework/crew/issues/new?template=feature_request.yml)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
