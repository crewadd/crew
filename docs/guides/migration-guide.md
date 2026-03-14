# Migration Guide

**Upgrade Crew projects to new versions. Breaking changes and migration steps.**

[[docs](../README.md) > [guides](./README.md) > migration-guide]

---

## Overview

This guide covers upgrading Crew projects to new versions:

1. **Version compatibility** - What changed between versions
2. **Breaking changes** - What might break in your project
3. **Migration steps** - How to upgrade safely
4. **Rollback procedures** - Revert if needed
5. **Testing migrations** - Verify the upgrade worked

---

## Pre-Migration Checklist

Before upgrading, prepare:

```bash
# 1. Backup your project
cp -r . ../my-project-backup

# 2. Commit current state
git add .
git commit -m "chore: pre-upgrade backup"

# 3. Check current version
npm list crew

# 4. Review changelog
npm view crew@latest
```

---

## Version Compatibility Matrix

| Your Crew | Upgrade To | Status | Breaking Changes |
|-----------|-----------|--------|-------------------|
| 0.9.x | 1.0.0 | Recommended | Yes - See v1.0 |
| 1.0.x | 1.1.x | Recommended | Minor |
| 1.1.x | 1.2.x | Recommended | Minor |
| 1.2.x | 2.0.0 | Major | Major redesign |

---

## Migrating to v1.0

### Breaking Changes

1. **Task builder API changed** - `.prompt()` now replaces `.description()`
2. **Check syntax** - Changed from array to chainable methods
3. **Epic builders** - Constructor signature updated
4. **State format** - New JSON schema for state.json

### Migration Steps

#### Step 1: Update package.json

```bash
npm install crew@^1.0.0
```

#### Step 2: Update Plan Definitions

Before (0.9.x):

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup').addTask({
      id: 'init',
      title: 'Initialize',
      description: 'Init the project',
      checks: [
        { type: 'cmd', cmd: 'test -f package.json' },
        { type: 'prompt', prompt: 'Initialized?' }
      ]
    })
  );

  return plan.build();
}
```

After (1.0.0):

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('init', 'Initialize')
          .prompt('Init the project')
          .check({ cmd: 'test -f package.json' })
          .check({ prompt: 'Initialized?' })
      )
  );

  return plan.build();
}
```

**Key changes:**
- `.description()` → `.prompt()`
- Task defined with `ctx.createTask()` builder
- Checks via chained `.check()` calls

#### Step 3: Update State Files

The state format changed. Crew handles this automatically, but you can verify:

```bash
# Old format (0.9.x)
cat .crew/state.json | jq '.tasks | length'

# Run crew once to migrate
npx crew run

# New format (1.0.x)
cat .crew/state.json | jq '.epics | length'
```

#### Step 4: Test the Upgrade

```bash
# Clear execution state (optional, keeps tasks)
rm .crew/state.json .crew/progress.jsonl

# Test with a simple task
npx crew run next

# Verify it works
npx crew status
```

---

## Migrating to v1.1

### New Features (No Breaking Changes)

- ✓ Added `.when()` for conditional execution
- ✓ Added `.yields()` for incremental planning
- ✓ Added `.harness()` for AI-synthesized validation

### Optional Upgrades

Add conditional tasks:

```typescript
.addTask(
  ctx.createTask('docker', 'Docker')
    .when('DOCKER_ENABLED')  // New in v1.1
    .prompt('Build Docker image')
)
```

---

## Migrating to v1.2

### Non-Breaking Additions

- ✓ Multi-agent support via `.skill()`
- ✓ Task state via `.state.get/set()`
- ✓ Lifecycle hooks enhanced

### Update Existing Tasks

Optionally add agent routing:

```typescript
// Optional - still works without it
.addTask(
  ctx.createTask('api', 'Build API')
    .skill('backend/rest-api')  // New in v1.2
    .prompt('Create REST API')
)
```

---

## Migrating to v2.0

### Major Breaking Changes

1. **Entire API rewritten** - New builder pattern
2. **State schema changed** - Full migration needed
3. **Store backend reworked** - Custom stores need updates

### Migration Steps

#### Step 1: Backup

```bash
git checkout -b v2-migration
cp -r .crew .crew-v1-backup
```

#### Step 2: Update package.json

```bash
npm install crew@^2.0.0
```

#### Step 3: Rewrite Plans

This is a complete rewrite. Use the v2 migration tool:

```bash
npx crew migrate v1->v2
```

Or manually update:

Before (v1.x):

```typescript
ctx.createTask('api', 'API')
  .ofType('coding')
  .prompt('Build API')
  .check({ cmd: 'npm test' })
```

After (v2.0):

```typescript
ctx.task('api', 'API')
  .type('coding')
  .instructions('Build API')
  .verify({ cmd: 'npm test' })
```

#### Step 4: Migrate State

```bash
# Clear old state (it won't be compatible)
rm -rf .crew/state.json .crew/progress.jsonl

# Run once to initialize new format
npx crew run
```

#### Step 5: Test Thoroughly

```bash
npx crew run --dry-run  # Preview
npx crew run            # Run for real
npx crew status         # Check results
```

---

## Safe Upgrade Procedure

### Strategy 1: Feature Branch

```bash
# Create upgrade branch
git checkout -b upgrade/crew-1.2

# Upgrade
npm install crew@latest

# Test
npx crew plan init
npx crew run

# If successful:
git add package.json package-lock.json
git commit -m "chore: upgrade to crew 1.2"
git push -u origin upgrade/crew-1.2

# Create PR and merge
```

### Strategy 2: Staged Rollout

If you have multiple projects:

```bash
# 1. Upgrade one project first
npm install crew@latest
npx crew run
npx crew verify

# 2. If successful, upgrade others
npm install crew@latest
```

### Strategy 3: Docker-Based Testing

```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install crew@latest
RUN npx crew run
```

```bash
docker build -t crew-test .
docker run crew-test npx crew verify
```

---

## Handling Migration Failures

### Plan Didn't Work After Upgrade

```bash
# Check what changed
npm diff crew@old crew@new

# Revert
npm install crew@0.9.x

# Update gradually:
npm install crew@1.0.0-rc1  # Try RC first
npm install crew@1.0.0       # Then stable
```

### Tasks Failed in New Version

```bash
# Check error
npx crew status

# Read full logs
cat .crew/progress.jsonl | jq 'select(.event == "task:check:fail")'

# Review migration guide for this version
# Update your plan accordingly
```

### Incompatible Custom Code

If you have custom executors or stores:

```typescript
// Old executor (v0.9)
export const execute = async (task) => {
  return await agent.run(task.description);
};

// New executor (v1.0+)
export const execute = async (ctx) => {
  return await ctx.agent(ctx.task.prompt);
};
```

Update accordingly and test.

---

## Rollback Procedure

### Quick Rollback

```bash
# Revert package.json
git checkout HEAD~ package.json

# Reinstall old version
npm install

# Restore state
git checkout HEAD~ .crew/

# Verify
npx crew status
```

### Full Rollback

```bash
# Restore everything
git reset --hard HEAD~1

# Reinstall
npm install

# Continue
npx crew run
```

### Gradual Rollback

If you partially migrated:

```bash
# Revert just package.json
npm install crew@1.0.x

# Keep new code structure (usually compatible)
# Test to verify
npx crew run
```

---

## Common Migration Issues

### Issue: "Unknown method .prompt()"

**Cause:** Still using old 0.9.x syntax

**Solution:** Update to new API:

```typescript
// Old
.description('...')

// New
.prompt('...')
```

### Issue: "State file incompatible"

**Cause:** State format changed between versions

**Solution:**
```bash
rm .crew/state.json
npx crew run  # Will recreate in new format
```

### Issue: Checks don't work

**Cause:** Check syntax changed

**Solution:**
```typescript
// Old (0.9)
checks: [{ type: 'cmd', cmd: '...' }]

// New (1.0+)
.check({ cmd: '...' })
```

### Issue: Agent configuration lost

**Cause:** v1.2 introduced new agent system

**Solution:**
```typescript
// Add agent configuration
.skill('backend/api')  // Specifies which agent
```

---

## Version-Specific Guidance

### v0.9.x → v1.0.0

**Effort:** Medium (API changes)

**Timeline:** 2-4 hours for typical project

**Risk:** Medium

**Recommendation:** Take time to test thoroughly

### v1.0.x → v1.1.x

**Effort:** Minimal (additive features)

**Timeline:** 15 minutes

**Risk:** Low

**Recommendation:** Upgrade freely

### v1.1.x → v1.2.x

**Effort:** Minimal (new optionally)

**Timeline:** 15 minutes

**Risk:** Low

**Recommendation:** Upgrade freely

### v1.x → v2.0.0

**Effort:** High (major rewrite)

**Timeline:** 4-8 hours for typical project

**Risk:** High

**Recommendation:** Plan carefully, extensive testing

---

## Best Practices

### 1. Always Backup First

```bash
git commit -m "backup: before version upgrade"
git branch backup-$(date +%Y%m%d)
```

### 2. Test in Isolation

```bash
# Use a separate environment
docker run -it node:18 bash
cd /tmp
git clone your-repo
npm install crew@latest
npx crew run
```

### 3. Read Release Notes

Always check:

```bash
npm view crew@latest description
npm view crew@latest CHANGELOG
```

### 4. Test on Branch

```bash
git checkout -b upgrade/version
npm install crew@latest
npx crew run --dry-run
```

### 5. Gradual Rollout

```bash
# Upgrade one project first
# Verify it works for a week
# Then upgrade others
```

---

## Deprecation Warnings

If you see warnings like:

```
DeprecationWarning: .description() is deprecated, use .prompt() instead
```

Update your code before the method is removed in a future version.

---

## Support

If you encounter migration issues:

1. **Check docs** - Review the new version's documentation
2. **Search issues** - GitHub issues might have solutions
3. **Ask community** - Discussions or Stack Overflow
4. **File issue** - If it's a bug, report it

---

## See Also

- [Release Notes](https://github.com/crew-framework/crew/releases)
- [Getting Started](../getting-started/README.md) - Current documentation
- [Core Concepts](../core-concepts/README.md) - Understanding current APIs

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
