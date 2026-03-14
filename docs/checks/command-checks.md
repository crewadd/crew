# Command Checks

**Shell command validation: passes if exit code is 0.**

[[docs](../README.md) > [checks](./README.md) > command-checks]

---

## Overview

Command checks run a shell command and pass if the exit code is 0:

```typescript
.check({ cmd: 'test -f src/app/page.tsx' })
.check({ cmd: 'npm test' })
.check({ cmd: 'git status --porcelain' })
```

---

## Basic Usage

### Simple File Check

```typescript
.check({ cmd: 'test -f build/index.js' })
```

Passes if file exists.

### Directory Check

```typescript
.check({ cmd: 'test -d node_modules' })
```

Passes if directory exists.

### Command Success

```typescript
.check({ cmd: 'npm run lint' })
```

Passes if linting succeeds (exit code 0).

---

## Common Patterns

### File Operations

```typescript
// File exists
.check({ cmd: 'test -f path/to/file' })

// File exists and is not empty
.check({ cmd: 'test -s path/to/file' })

// Directory exists
.check({ cmd: 'test -d path/to/dir' })

// File is readable
.check({ cmd: 'test -r path/to/file' })

// File is executable
.check({ cmd: 'test -x path/to/script.sh' })
```

### Content Checks

```typescript
// Contains string
.check({ cmd: 'grep -q "export default" src/app/page.tsx' })

// Does not contain string
.check({ cmd: '! grep -q "console.log" src/**/*.ts' })

// Match pattern
.check({ cmd: 'grep -E "^export (class|function|const)" src/index.ts' })

// Count matches
.check({ cmd: 'test $(grep -c "import" package.json) -gt 0' })
```

### Build/Test Commands

```typescript
// Run tests
.check({ cmd: 'npm test' })

// Build succeeds
.check({ cmd: 'npm run build' })

// Type check
.check({ cmd: 'npx tsc --noEmit' })

// Linting
.check({ cmd: 'npm run lint' })

// Format check
.check({ cmd: 'npm run format:check' })
```

### Git Checks

```typescript
// No uncommitted changes
.check({ cmd: 'git status --porcelain | wc -l | xargs test 0 -eq' })

// Is in git repo
.check({ cmd: 'git rev-parse --git-dir' })

// On specific branch
.check({ cmd: 'git branch --show-current | grep main' })

// Has commits
.check({ cmd: 'test $(git rev-list --count HEAD) -gt 0' })
```

---

## With Custom Names

```typescript
.check({
  cmd: 'test -f src/app/page.tsx',
  name: 'page-exists'
})

.check({
  cmd: 'npm test',
  name: 'unit-tests'
})
```

---

## With Working Directory

```typescript
.check({
  cmd: 'cargo test',
  cwd: 'native-module'
})

.check({
  cmd: 'npm run build',
  cwd: 'packages/ui'
})
```

---

## Complex Commands

### Piping Commands

```typescript
.check({
  cmd: 'find src -name "*.test.ts" | wc -l | xargs test 0 -lt',
  name: 'has-tests'
})
```

Passes if at least one test file exists.

### Multi-Step Logic

```typescript
.check({
  cmd: 'npm run lint && npm run test && npm run build',
  name: 'full-pipeline'
})
```

Passes if all three commands succeed.

### Conditional Logic

```typescript
.check({
  cmd: 'if [ -f config.prod.ts ]; then npm run build:prod; else npm run build; fi',
  name: 'conditional-build'
})
```

### Error Suppression

```typescript
.check({
  cmd: 'npm run optional-check 2>/dev/null || true',
  name: 'optional-check'
})
```

Always passes (errors suppressed).

---

## Combining Multiple Checks

### Sequential Validation

```typescript
ctx.createTask('build', 'Build application')
  .check({ cmd: 'test -d src', name: 'src-exists' })
  .check({ cmd: 'test -f package.json', name: 'package-exists' })
  .check({ cmd: 'npm run lint', name: 'linting' })
  .check({ cmd: 'npm run test', name: 'tests' })
  .check({ cmd: 'npm run build', name: 'build' })
```

All run in parallel. If any fail, agent gets feedback.

---

## Practical Examples

### React Project

```typescript
ctx.createTask('react-setup', 'Setup React project')
  .check({ cmd: 'test -f src/index.tsx', name: 'entry-point' })
  .check({ cmd: 'test -d src/components', name: 'components-dir' })
  .check({ cmd: 'test -f public/index.html', name: 'public-html' })
  .check({ cmd: 'npx tsc --noEmit', name: 'types' })
  .check({ cmd: 'npm run build', name: 'build' })
```

### Next.js Project

```typescript
ctx.createTask('nextjs-app', 'Create Next.js app')
  .check({ cmd: 'test -f next.config.js', name: 'next-config' })
  .check({ cmd: 'test -d app || test -d pages', name: 'app-dir' })
  .check({ cmd: 'npm run build', name: 'next-build' })
  .check({ cmd: 'npm run lint', name: 'next-lint' })
```

### Database Migrations

```typescript
ctx.createTask('migrations', 'Create migrations')
  .check({ cmd: 'test -d db/migrations', name: 'migrations-dir' })
  .check({ cmd: 'find db/migrations -name "*.sql" | wc -l | xargs test 0 -lt', name: 'has-migrations' })
  .check({ cmd: 'npm run migrate:validate', name: 'valid-migrations' })
```

### Monorepo Structure

```typescript
ctx.createTask('monorepo-setup', 'Setup monorepo')
  .check({ cmd: 'test -f pnpm-workspace.yaml || test -f lerna.json', name: 'workspace-config' })
  .check({ cmd: 'test -d packages', name: 'packages-dir' })
  .check({ cmd: 'find packages -maxdepth 1 -type d | wc -l | xargs test 1 -lt', name: 'has-packages' })
```

### Docker Setup

```typescript
ctx.createTask('docker-build', 'Build Docker image')
  .check({ cmd: 'test -f Dockerfile', name: 'dockerfile-exists' })
  .check({ cmd: 'docker build -t test-image .', name: 'docker-build' })
  .check({ cmd: 'docker image inspect test-image', name: 'image-exists' })
```

---

## Advanced Patterns

### File Count Validation

```typescript
// At least 5 components
.check({
  cmd: 'test $(find src/components -name "*.tsx" | wc -l) -ge 5',
  name: 'min-components'
})

// No more than 100 components (sanity check)
.check({
  cmd: 'test $(find src/components -name "*.tsx" | wc -l) -le 100',
  name: 'max-components'
})
```

### Size Validation

```typescript
// Build is under 500KB
.check({
  cmd: 'test $(du -k dist/index.js | cut -f1) -lt 500',
  name: 'build-size'
})
```

### Dependency Check

```typescript
// Specific package installed
.check({
  cmd: 'grep -q "@types/react" package.json',
  name: 'has-react-types'
})

// Specific version
.check({
  cmd: 'grep "\"typescript\": \"4\\." package.json',
  name: 'typescript-v4'
})
```

### Environment Setup

```typescript
// Node version check
.check({
  cmd: 'node --version | grep -E "v(18|19|20)"',
  name: 'node-version'
})

// npm installed
.check({
  cmd: 'which npm',
  name: 'npm-installed'
})
```

---

## Exit Code Reference

| Code | Meaning | When | Usage |
|------|---------|------|-------|
| 0 | Success | Command succeeded | Default pass condition |
| 1 | General error | Command failed | Catches most errors |
| 2 | Misuse | Wrong arguments | `grep` with no match |
| 127 | Not found | Command not found | Missing executable |
| 128 | Exit signal | Killed by signal | Process terminated |
| 130 | Ctrl-C | User interrupt | Timeout |

---

## Shell Script Tips

### Test Command Operators

```bash
# File tests
-f file     # File exists
-d dir      # Directory exists
-e path     # Either exists
-s file     # File exists and not empty
-r file     # Readable
-w file     # Writable
-x file     # Executable

# String tests
-z string   # String is empty
-n string   # String not empty
s1 = s2     # Strings equal
s1 != s2    # Strings not equal

# Numeric tests
n1 -eq n2   # Equal
n1 -ne n2   # Not equal
n1 -lt n2   # Less than
n1 -le n2   # Less than or equal
n1 -gt n2   # Greater than
n1 -ge n2   # Greater than or equal
```

### Logical Operators

```bash
cmd1 && cmd2        # Both succeed
cmd1 || cmd2        # Either succeeds
! cmd               # Negation
( cmd1 && cmd2 )    # Grouping
```

### Useful Commands

```bash
test                # Evaluate condition
grep                # Search text
find                # Find files
wc                  # Count lines/words
du                  # Disk usage
[ ]                 # Shorthand for test
[[ ]]               # Bash extended test
```

---

## Best Practices

### ✅ Do

- **Keep commands simple** — hard to debug complex shell
- **Use descriptive names** — helps with logging
- **Quote variables** — prevent word splitting
- **Check for errors** — use `set -e` or explicit checks
- **Test manually first** — verify commands work locally

### ❌ Don't

- **Complex shell scripts** — use inline checks instead
- **Assume tools exist** — check with `which`
- **Ignore exit codes** — always verify
- **Use absolute paths** — relative when possible
- **Suppress errors silently** — log issues

---

## Debugging

### Run Command Manually

```bash
# Test locally first
test -f src/index.ts && echo "Pass" || echo "Fail"

# Check exit code
npm run build
echo $?
```

### Add Logging

The framework logs stdout/stderr automatically.

### Dry Run

```bash
# See what the command would do
set -n    # Read but don't execute
# ... or just run it in a safe directory
```

---

## See Also

- [Inline Checks](./inline-checks.md) — Function-based checks
- [Prompt Checks](./prompt-checks.md) — AI-powered validation
- [Named Checks](./named-checks.md) — Reusable registry checks
- [Fluent Builder](../task-api/fluent-builder.md) — `.check()` API

---

[← Back to Checks](./README.md) | [← Back to Documentation](../README.md)
