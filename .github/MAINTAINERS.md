# Maintainer Guide

Guide for crew framework maintainers.

## Quick Commands

### Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run typechecking
pnpm typecheck

# Run tests
pnpm test

# Format code
pnpm format

# Check formatting
pnpm format:check
```

### Working with Packages

```bash
# Build specific package
cd packages/crew
pnpm build

# Test specific package
cd packages/crew
pnpm test

# Watch mode
cd packages/crew
pnpm test:watch
```

## Release Process

### 1. Prepare Release

```bash
# Ensure clean working tree
git status

# Ensure main is up to date
git checkout main
git pull origin main

# Run full test suite
pnpm build
pnpm typecheck
pnpm test
```

### 2. Version Bump

Choose version based on [Semantic Versioning](https://semver.org/):
- **Patch** (0.1.0 → 0.1.1): Bug fixes
- **Minor** (0.1.0 → 0.2.0): New features (backward compatible)
- **Major** (0.1.0 → 1.0.0): Breaking changes

```bash
# Update version in package.json
cd packages/crew
# Edit version manually or use npm version
npm version patch|minor|major

# Commit version bump
git add .
git commit -m "chore: bump version to X.Y.Z"
git push origin main
```

### 3. Create Release

```bash
# Create and push tag
git tag v0.1.0
git push origin v0.1.0

# This automatically triggers:
# - GitHub Release creation
# - npm publish
# - Changelog generation
```

### 4. Verify Release

1. Check [GitHub Releases](https://github.com/crew-framework/crew/releases)
2. Check [npm package](https://www.npmjs.com/package/crew)
3. Test installation: `npm install crew@latest`

### 5. Announce

1. Post in [Discussions → Announcements](https://github.com/crew-framework/crew/discussions)
2. Tweet from [@crew_framework](https://twitter.com/crew_framework)
3. Update Discord announcement channel

## Managing Issues

### Triage Process

1. **Add Labels**
   - Type: bug, enhancement, documentation
   - Priority: critical, high, medium, low
   - Package: crew, codets, agentfn
   - Status: needs-triage

2. **Initial Response**
   - Thank reporter
   - Ask for clarification if needed
   - Add to project board

3. **Assignment**
   - Assign to self or team member
   - Add milestone if applicable
   - Update status labels

### Issue Templates

We have structured templates for:
- 🐛 Bug Reports
- ✨ Feature Requests

Encourage users to use templates for better context.

## Managing Pull Requests

### Review Checklist

- [ ] PR description is clear
- [ ] Tests added/updated
- [ ] TypeScript types are correct
- [ ] Build succeeds
- [ ] CI checks pass
- [ ] Follows code style
- [ ] Conventional commit format
- [ ] Documentation updated

### Merging Strategy

- **Squash merge** for feature PRs (cleaner history)
- **Merge commit** for multi-commit PRs with good history
- **Rebase merge** for simple fixes

### After Merge

- Delete branch (auto-enabled)
- Close related issues with keywords
- Thank contributor

## Security

### Handling Security Reports

1. **Private Disclosure**
   - Check [Security Advisories](https://github.com/crew-framework/crew/security/advisories)
   - Respond within 48 hours

2. **Assessment**
   - Verify vulnerability
   - Determine severity
   - Identify affected versions

3. **Fix**
   - Create private branch
   - Implement fix
   - Add tests
   - Review with team

4. **Release**
   - Publish patch release
   - Create security advisory
   - Credit reporter (if they agree)

### Dependabot

- Review Dependabot PRs weekly
- Merge security updates ASAP
- Test before merging major updates

## CI/CD

### GitHub Actions Workflows

- **CI** (`.github/workflows/ci.yml`)
  - Runs on every PR
  - Tests + Typecheck + Lint

- **Publish** (`.github/workflows/publish.yml`)
  - Manual or release trigger
  - Publishes to npm

- **Release** (`.github/workflows/release.yml`)
  - Tag trigger
  - Creates GitHub Release
  - Publishes to npm

- **CodeQL** (`.github/workflows/codeql.yml`)
  - Security scanning
  - Weekly schedule

### Secrets Management

Required secrets in GitHub Actions:
- `NPM_TOKEN` - npm automation token

To rotate:
1. Generate new token on npmjs.com
2. Update in Settings → Secrets
3. Test with manual workflow dispatch

## Documentation

### README Updates

Main README sections:
- Quick Start
- Why crew
- How It Works
- Programmable Tasks
- Features
- CLI Reference
- Community

Update when:
- New features added
- API changes
- Examples outdated

### API Documentation

For major changes:
1. Update JSDoc comments
2. Regenerate TypeScript definitions
3. Update code examples
4. Add migration guide if breaking

## Community Management

### Responding to Issues

**Response Templates**:

**Thank you**:
```markdown
Thanks for reporting this! We'll look into it.
```

**Need more info**:
```markdown
Could you provide:
- crew version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior
```

**Feature request**:
```markdown
Thanks for the suggestion! This aligns with our roadmap.
We'd welcome a PR if you're interested in contributing.
```

### Code of Conduct

Enforce our [Code of Conduct](CODE_OF_CONDUCT.md):
- Be welcoming and respectful
- Accept constructive feedback
- Focus on what's best for community

Report violations privately to maintainers.

## Tools & Automation

### Recommended Extensions

- ESLint
- Prettier
- GitHub Pull Requests
- GitLens

### Useful GitHub Apps

- **Dependabot** - Dependency updates (enabled)
- **CodeQL** - Security scanning (enabled)
- **Probot Settings** - Sync `.github/settings.yml`
- **Renovate** - Alternative to Dependabot

## Analytics

### Metrics to Track

- npm downloads (weekly/monthly)
- GitHub stars growth
- Issue resolution time
- PR merge time
- Community engagement

### Tools

- [npm-stat.com](https://npm-stat.com/charts.html?package=crew)
- [star-history.com](https://star-history.com/#crew-framework/crew)
- GitHub Insights

## Support

### Getting Help

- Team discussion: GitHub Discussions
- Security: security@crew.dev (or GitHub Security tab)
- Questions: Discord/GitHub Discussions

### Escalation

For major decisions:
1. Create RFC discussion
2. Get team consensus
3. Document decision
4. Update roadmap

---

**Maintainer Team**

- [Add maintainer names and contact]

**Last Updated**: 2026-03-15
