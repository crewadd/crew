# Version Control

**Manage Git workflows with Crew projects. What to commit vs. ignore.**

[[docs](../README.md) > [guides](./README.md) > version-control]

---

## Overview

Crew generates and manages substantial amounts of code and state. This guide covers:

1. **What to commit** - Version control for collaborative work
2. **What to ignore** - Ephemeral state that shouldn't be tracked
3. **Git workflows** - Branching strategies with Crew
4. **Collaborative development** - Multiple agents/developers
5. **Deployment workflows** - Production-safe versioning

---

## Recommended .gitignore

```bash
# Crew runtime state (ephemeral)
.crew/state.json           # Current execution state
.crew/progress.jsonl       # Execution log
.crew/epics/*/attempts/    # Task attempt logs

# Generated dependencies
node_modules/
dist/
build/
.env
.env.local
.env.*.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Test coverage
coverage/
.nyc_output/

# Build outputs
*.log
npm-debug.log*
```

### Complete .gitignore Example

```bash
# Crew State - Ephemeral Execution Data
.crew/state.json
.crew/progress.jsonl
.crew/epics/*/attempts/
.crew/epics/*/tasks/*/attempts/

# Node
node_modules/
pnpm-lock.yaml
yarn.lock
package-lock.json

# Build outputs
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local
.env.production.local

# IDE
.vscode/
.idea/
*.sublime-project
*.sublime-workspace

# OS
.DS_Store
Thumbs.db
*.swp

# Logs
*.log
npm-debug.log*
```

---

## What to Commit

### Plan Definitions

**Always commit** the plan definition — it's your project blueprint:

```bash
git add .crew/setup/planning/
git commit -m "chore: update plan definitions"
```

### Task Metadata

**Always commit** task structure and descriptions:

```bash
git add .crew/epics/
git commit -m "feat: add new epic for payments"
```

### Configuration

**Always commit** crew.json and related config:

```bash
git add crew.json
git commit -m "chore: crew configuration"
```

### Agent Personas

**Always commit** agent definitions:

```bash
git add .claude/agents/
git commit -m "chore: update agent personas"
```

### Skills and Templates

**Always commit** custom skills:

```bash
git add .crew/skills/
git commit -m "feat: add custom skill for data processing"
```

---

## What to Ignore

### Execution State

**Never commit** ephemeral state:

```bash
# Bad: These change with every run
.crew/state.json
.crew/progress.jsonl

# Bad: These are attempt logs
.crew/epics/01-setup/tasks/01-init/attempts/
```

### Generated Code

**Usually ignore** AI-generated code if tracked separately:

```bash
# If generated code goes to src/ and is reviewed:
# DO commit it

# If generated code is temporary for verification:
# DON'T commit it
```

### Build Outputs

```bash
dist/
build/
.next/
```

---

## Collaborative Workflows

### Team Development

```bash
# Developer A works on auth
git checkout -b feature/auth
# ... update plan, run crew, commit task metadata

# Developer B works on payments (parallel)
git checkout -b feature/payments
# ... update plan, run crew, commit task metadata

# Both merge to main
git checkout main
git merge feature/auth
git merge feature/payments
```

### Task-Based Branches

```bash
# Each epic/task gets its own branch
git checkout -b epic/api-v2

# Edit .crew/setup/planning/index.ts
# Add new epic for V2 API

npx crew plan init
npx crew run

# Commit plan changes
git add .crew/epics/03-api-v2/
git commit -m "feat: add API V2 epic and tasks"

git push origin epic/api-v2
# Create PR
```

### Review Process

```bash
# Review checklist in PR:
# 1. Plan makes sense (review .crew/setup/planning/index.ts)
# 2. Task dependencies are correct (review task.yaml files)
# 3. Checks are appropriate (review .crew/epics/*/tasks/*/task.yaml)
# 4. Generated code is correct (review src/ changes)
```

---

## Handling Task Execution State

### Reset Between Runs

```bash
# If you want to re-run everything from scratch:
rm .crew/state.json .crew/progress.jsonl
npx crew run --loop
```

### Selective Cleanup

```bash
# Remove only failed attempts to retry:
rm -rf .crew/epics/01-setup/tasks/01-init/attempts/

# Retry that specific task
npx crew run m1.1
```

### Preserve Successful State

```bash
# If task succeeded and you don't want to re-run:
git checkout .crew/state.json .crew/progress.jsonl

# Continue from where you left off
npx crew run
```

---

## Deployment Workflows

### Tag Releases

```bash
# When a plan successfully completes, tag it:
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Verify
git describe --tags
```

### Changelog Generation

```bash
# Track what changed in each release:
git log v0.9.0..v1.0.0 --oneline \
  -- .crew/setup/planning/index.ts

# Output:
# abc1234 feat: add payments epic
# def5678 feat: add email service
```

---

## Multi-Branch Strategies

### Trunk-Based Development

```bash
# All changes go to main frequently
git checkout main
# Edit plan
npx crew run
git add .crew/
git commit -m "update plan"
git push
```

### Feature Branches

```bash
# Feature branches for significant changes
git checkout -b feature/monorepo-support
# Major plan changes
npx crew run
git add .crew/
git commit -m "feat: add monorepo support"
git push -u origin feature/monorepo-support
# Create PR for review
```

### Release Branches

```bash
# Create release branch for stabilization
git checkout -b release/1.0.0 main
# Fix bugs only
npx crew run
git commit -m "fix: auth edge case"
git tag v1.0.0
git merge release/1.0.0 main
```

---

## Conflict Resolution

### Plan Conflicts

If two developers modify the plan:

```bash
# Crew's plan is TypeScript, merge like normal code
# Manually resolve the conflict:

# In .crew/setup/planning/index.ts
# <<<<<<< HEAD
# Dev A's changes
# =======
# Dev B's changes
# >>>>>>> branch-name

# Resolve by keeping both epics if they don't conflict:
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  // Dev A's epic
  plan.addEpic(ctx.createEpic('auth', 'Authentication')...);

  // Dev B's epic
  plan.addEpic(ctx.createEpic('payments', 'Payments')...);

  return plan.build();
}

# Re-test
npx crew plan init
npx crew run
git add .
git commit -m "merge: resolve epic conflicts"
```

### Task Conflicts

Usually rare since epics are separate:

```bash
# If two developers edit the same epic:
git checkout -b feature/epic-merge
# Manually resolve by combining tasks
npx crew plan init
npx crew run
git commit -m "merge: combine epic changes"
```

---

## CI/CD Integration

### Auto-Commit Generated Code

```yaml
# .github/workflows/crew-commit.yml
name: Crew Build & Commit

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install & Run
        run: |
          npm install
          npx crew run

      - name: Commit Results
        run: |
          git config user.name "Crew Bot"
          git config user.email "crew@example.com"
          git add src/ dist/
          git commit -m "chore: update generated code" || true
          git push
```

### Pull Request Comments

```bash
#!/bin/bash
npx crew run --json > crew-results.json

COMMENT="**Crew Build Results**
- Status: $(jq '.status' crew-results.json)
- Tasks: $(jq '.completed | length' crew-results.json)
- Duration: $(jq '.duration' crew-results.json)ms"

# Post comment to PR (requires GitHub token)
gh pr comment $PR_NUMBER --body "$COMMENT"
```

---

## Best Practices

### 1. Commit Plan Changes Together

```bash
# Good: Commit plan and initial task metadata
git add .crew/setup/planning/index.ts
git add .crew/epics/
git commit -m "feat: add payment processing epic"

# Bad: Commit only code, not the plan
git add src/
git commit -m "add payments"
# Team doesn't know this came from a new epic
```

### 2. Use Atomic Commits

```bash
# Good: Each commit is a logical unit
git commit -m "feat: add auth epic"
git commit -m "feat: add payment epic"

# Bad: Everything in one commit
git commit -m "add everything"
```

### 3. Document Plan Changes

```bash
# Good: Clear commit message
git commit -m "feat: add payments epic with 5 tasks

- Implement Stripe integration
- Create payment endpoints
- Add webhook handlers
- Setup database schema
- Write integration tests"

# Bad: Unclear
git commit -m "update plan"
```

### 4. Protect Main Branch

```bash
# Require PR reviews before merging to main
# Require CI to pass
# Require branch to be up to date
```

---

## Troubleshooting

### State File Out of Sync

```bash
# If state.json doesn't match progress.jsonl:
rm .crew/state.json
# State will be rebuilt from progress.jsonl on next run
npx crew run
```

### Accidentally Committed State

```bash
# Remove from history
git rm --cached .crew/state.json
git commit -m "remove: state file from git"

# Add to .gitignore
echo ".crew/state.json" >> .gitignore
git add .gitignore
git commit -m "chore: ignore crew state"
```

### Large Repository

If .crew/ becomes large:

```bash
# Check size
du -sh .crew/

# Archive old attempts
tar -czf .crew-backup-$(date +%Y%m%d).tar.gz .crew/epics/*/tasks/*/attempts/
rm -rf .crew/epics/*/tasks/*/attempts/

git add .crew/
git commit -m "chore: archive old attempts"
```

---

## See Also

- [CI/CD Integration](./ci-cd-integration.md) - Git workflows in CI
- [Multi-Agent Workflows](./multi-agent-workflows.md) - Team coordination
- [Sharing Plans](./sharing-plans.md) - Template distribution

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
