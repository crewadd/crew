# Conditional Task Execution

**Use `when()` clauses and dynamic planning to conditionally include tasks.**

[[docs](../README.md) > [guides](./README.md) > conditional-tasks]

---

## Overview

Crew allows you to conditionally execute tasks based on:

1. **Environment variables** - Different behavior for dev/staging/prod
2. **File existence** - Only run if certain files exist
3. **Previous results** - Conditional based on earlier task output
4. **Variables** - Project-level variables control execution
5. **Custom functions** - Programmatic decision logic

---

## Basic Conditional Execution

### Using `when()` with Strings

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Conditional Setup');

  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(
        ctx.createTask('docker', 'Build Docker Image')
          .when('DOCKER_ENABLED')  // String condition (env var)
          .prompt('Build Docker image')
          .check({ cmd: 'docker images | grep myapp' })
      )
      .addTask(
        ctx.createTask('prod', 'Production Deploy')
          .when('ENVIRONMENT=production')  // Environment check
          .prompt('Deploy to production')
          .check({ cmd: 'curl -f https://app.com' })
      )
  );

  return plan.build();
}
```

**Conditions:**
- `'ENV_VAR'` - Checks if env var is truthy
- `'ENV_VAR=value'` - Checks if env var equals value
- `'FILE_EXISTS:path/to/file'` - Checks if file exists
- `'DIR_EXISTS:path/to/dir'` - Checks if directory exists

### Using `when()` with Functions

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Smart Setup');

  const isProduction = () => process.env.NODE_ENV === 'production';
  const hasDocker = () => {
    try {
      require('child_process').execSync('docker --version');
      return true;
    } catch {
      return false;
    }
  };

  plan.addEpic(
    ctx.createEpic('deploy', 'Deploy')
      .addTask(
        ctx.createTask('migrate', 'Run Migrations')
          .when(isProduction)
          .prompt('Run database migrations')
          .check({ cmd: 'npm run migrate' })
      )
      .addTask(
        ctx.createTask('docker-build', 'Build Docker')
          .when(hasDocker)
          .prompt('Build Docker image')
          .check({ cmd: 'docker images' })
      )
  );

  return plan.build();
}
```

---

## Conditional Based on Task Output

### Using Task State

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Build Pipeline');

  plan.addEpic(
    ctx.createEpic('pipeline', 'Build')
      .addTask(
        ctx.createTask('check', 'Check Tests')
          .prompt('Run tests and save results')
          .onComplete(async (taskCtx, result) => {
            // Store result in shared state
            taskCtx.state.set('tests-passed', result.success);
          })
          .check({ cmd: 'npm test' })
      )
      .addTask(
        ctx.createTask('deploy', 'Deploy')
          .when((vars) => {
            // Access stored result
            return vars['tests-passed'] === true;
          })
          .prompt('Deploy to production')
          .check({ cmd: 'curl -f https://app.com' })
      )
  );

  return plan.build();
}
```

### Check File Outputs

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Build');

  plan.addEpic(
    ctx.createEpic('build', 'Build')
      .addTask(
        ctx.createTask('compile', 'Compile')
          .prompt('Compile TypeScript')
          .outputs(['dist/'])
          .check({ cmd: 'tsc --noEmit' })
      )
      .addTask(
        ctx.createTask('bundle', 'Bundle')
          .when('FILE_EXISTS:dist/index.js')  // Only if compile succeeded
          .prompt('Bundle for production')
          .check({ cmd: 'test -f dist/bundle.js' })
      )
  );

  return plan.build();
}
```

---

## Environment-Based Workflows

### Development vs Production

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Multi-Environment App');

  const isDev = process.env.NODE_ENV !== 'production';
  const isProd = process.env.NODE_ENV === 'production';

  plan.addEpic(
    ctx.createEpic('dev-only', 'Development Setup')
      .addTask(
        ctx.createTask('install', 'Install Dependencies')
          .prompt('Install with dev dependencies')
          .when(isDev)
          .check({ cmd: 'test -d node_modules' })
      )
      .addTask(
        ctx.createTask('setup-db', 'Setup Local Database')
          .when(isDev)
          .prompt('Setup local SQLite database')
          .check({ cmd: 'test -f data.db' })
      )
  );

  plan.addEpic(
    ctx.createEpic('prod-only', 'Production Setup')
      .addTask(
        ctx.createTask('install-prod', 'Install Production Dependencies')
          .when(isProd)
          .prompt('Install only production dependencies')
          .check({ cmd: 'npm list --depth=0' })
      )
      .addTask(
        ctx.createTask('setup-prod-db', 'Configure Production Database')
          .when(isProd)
          .prompt('Configure managed database connection')
          .check({ cmd: 'curl -f $DATABASE_URL' })
      )
      .addTask(
        ctx.createTask('setup-cdn', 'Setup CDN')
          .when(isProd)
          .prompt('Configure static asset CDN')
          .check({ cmd: 'curl -f https://cdn.myapp.com' })
      )
  );

  return plan.build();
}
```

---

## Feature Flags

### Conditional Features

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Feature Toggles');

  const features = {
    AUTH: process.env.FEATURE_AUTH === 'true',
    PAYMENTS: process.env.FEATURE_PAYMENTS === 'true',
    ANALYTICS: process.env.FEATURE_ANALYTICS === 'true',
  };

  plan.addEpic(
    ctx.createEpic('features', 'Optional Features')
      .addTask(
        ctx.createTask('auth', 'Implement Authentication')
          .when(features.AUTH)
          .prompt('Build JWT authentication')
          .check({ cmd: 'test -f src/auth/index.ts' })
      )
      .addTask(
        ctx.createTask('payments', 'Implement Payments')
          .when(features.PAYMENTS)
          .deps(features.AUTH ? ['auth'] : [])  // Depends on auth if enabled
          .prompt('Integrate Stripe')
          .check({ cmd: 'test -f src/payments/stripe.ts' })
      )
      .addTask(
        ctx.createTask('analytics', 'Add Analytics')
          .when(features.ANALYTICS)
          .prompt('Setup analytics tracking')
          .check({ cmd: 'test -f src/analytics/index.ts' })
      )
  );

  return plan.build();
}
```

---

## Platform-Specific Tasks

### Different Tasks for Different Platforms

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Cross-Platform Build');

  const platform = process.platform;  // 'darwin' | 'linux' | 'win32'
  const isMac = platform === 'darwin';
  const isLinux = platform === 'linux';
  const isWindows = platform === 'win32';

  plan.addEpic(
    ctx.createEpic('platform', 'Platform-Specific Setup')
      .addTask(
        ctx.createTask('mac-setup', 'macOS Setup')
          .when(isMac)
          .prompt('Install macOS-specific tools via Homebrew')
          .check({ cmd: 'brew --version' })
      )
      .addTask(
        ctx.createTask('linux-setup', 'Linux Setup')
          .when(isLinux)
          .prompt('Install Linux-specific tools via apt')
          .check({ cmd: 'apt --version' })
      )
      .addTask(
        ctx.createTask('windows-setup', 'Windows Setup')
          .when(isWindows)
          .prompt('Install Windows-specific tools via chocolatey')
          .check({ cmd: 'choco --version' })
      )
      // Common setup
      .addTask(
        ctx.createTask('common', 'Common Setup')
          .prompt('Install common tools')
          .check({ cmd: 'node --version' })
      )
  );

  return plan.build();
}
```

---

## Complex Conditional Logic

### Nested Conditions

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Complex Pipeline');

  const hasDockerfile = () => {
    const fs = require('fs');
    return fs.existsSync('./Dockerfile');
  };

  const isDeploy = () => process.env.DEPLOY === 'true';

  const shouldDockerDeploy = () => hasDockerfile() && isDeploy();

  plan.addEpic(
    ctx.createEpic('deploy', 'Deploy')
      .addTask(
        ctx.createTask('docker-build', 'Build Docker')
          .when(hasDockerfile)
          .prompt('Build Docker image')
          .check({ cmd: 'docker images | grep myapp' })
      )
      .addTask(
        ctx.createTask('docker-push', 'Push to Registry')
          .when(shouldDockerDeploy)
          .deps(hasDockerfile ? ['docker-build'] : [])
          .prompt('Push Docker image to registry')
          .check({ cmd: 'docker push' })
      )
      .addTask(
        ctx.createTask('traditional-deploy', 'Deploy Executable')
          .when(() => !shouldDockerDeploy())
          .prompt('Deploy binary executable')
          .check({ cmd: 'curl -f https://app.com' })
      )
  );

  return plan.build();
}
```

---

## Conditional with Hooks

### Using `shouldStart()` Hook

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Smart Execution');

  plan.addEpic(
    ctx.createEpic('workflow', 'Workflow')
      .addTask(
        ctx.createTask('check', 'Check Prerequisites')
          .prompt('Check all prerequisites are met')
          .onComplete(async (taskCtx) => {
            // Store result
            const passed = true;  // from check logic
            taskCtx.state.set('prerequisites-met', passed);
          })
          .check({ cmd: 'test -f .env' })
      )
      .addTask(
        ctx.createTask('proceed', 'Proceed')
          .shouldStart(async (taskCtx) => {
            // Run task only if previous check passed
            const prerequisitesMet = taskCtx.state.get('prerequisites-met');
            return prerequisitesMet === true;
          })
          .prompt('Proceed with setup')
          .check({ cmd: 'echo "OK"' })
      )
  );

  return plan.build();
}
```

---

## Real-World Examples

### Monorepo with Optional Packages

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Monorepo with Optional Packages');

  const fs = require('fs');
  const packages = ['api', 'ui', 'lib', 'cli'];

  // Dynamically create tasks for each package that exists
  plan.addEpic(
    ctx.createEpic('packages', 'Build Packages')
  );

  for (const pkg of packages) {
    const pkgDir = `packages/${pkg}`;
    const epicBuilder = plan.epics[0] || plan.addEpic(
      ctx.createEpic('packages', 'Build Packages')
    );

    epicBuilder.addTask(
      ctx.createTask(
        `build-${pkg}`,
        `Build ${pkg}`
      )
        .when(`DIR_EXISTS:${pkgDir}`)  // Only if package directory exists
        .prompt(`Build ${pkg} package`)
        .check({ cmd: `npm run build --workspace=packages/${pkg}` })
    );
  }

  return plan.build();
}
```

### Migration Pipeline

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Migration');

  const fromVersion = process.env.FROM_VERSION || '1.0.0';
  const toVersion = '2.0.0';

  plan.addEpic(
    ctx.createEpic('migrate', 'Migration')
      // Backup for all versions
      .addTask(
        ctx.createTask('backup', 'Backup Database')
          .prompt('Create database backup')
          .check({ cmd: 'test -f backup.sql' })
      )
      // v1 → v1.5 migration
      .addTask(
        ctx.createTask('migrate-1-1-5', 'Migrate 1.0 → 1.5')
          .when(fromVersion === '1.0.0')
          .deps(['backup'])
          .prompt('Run 1.0 to 1.5 migration')
          .check({ cmd: 'npm run migrate:1-1-5' })
      )
      // v1.5 → v2.0 migration
      .addTask(
        ctx.createTask('migrate-1-5-2', 'Migrate 1.5 → 2.0')
          .when((vars) => {
            // Depends on whether 1.0→1.5 ran
            return fromVersion === '1.0.0' || fromVersion === '1.5.0';
          })
          .deps(fromVersion === '1.0.0' ? ['migrate-1-1-5'] : ['backup'])
          .prompt('Run 1.5 to 2.0 migration')
          .check({ cmd: 'npm run migrate:1-5-2' })
      )
      // Verify final state
      .addTask(
        ctx.createTask('verify', 'Verify Migration')
          .deps(['migrate-1-5-2', 'migrate-1-1-5'])
          .prompt('Verify database integrity')
          .check({ cmd: 'npm run db:verify' })
      )
  );

  return plan.build();
}
```

---

## Best Practices

### 1. Make Conditions Readable

```typescript
// Good: Clear intent
const needsDocker = process.env.USE_DOCKER === 'true';
const isProductionBuild = process.env.NODE_ENV === 'production';

.when(needsDocker)
.when(isProductionBuild)

// Bad: Cryptic
.when(() => process.env.USE_DOCKER === 'true' &&
         process.env.NODE_ENV === 'production' &&
         require('fs').existsSync('Dockerfile'))
```

### 2. Document Conditional Logic

```typescript
// Good: Comments explain the condition
const shouldDeploy = () => {
  // Only deploy in production on main branch
  return process.env.NODE_ENV === 'production' &&
         process.env.BRANCH === 'main';
};

.addTask(
  ctx.createTask('deploy', 'Deploy')
    .when(shouldDeploy)
    .prompt('Deploy to production')
)

// Document in comments
.addTask(
  ctx.createTask('test', 'Run Tests')
    // Tests are skipped in CI to save time, run locally before committing
    .when(() => !process.env.CI)
    .prompt('Run full test suite')
)
```

### 3. Handle Missing Dependencies Gracefully

```typescript
// Good: Handle when dependency wasn't run
.addTask(
  ctx.createTask('deploy', 'Deploy')
    .deps(shouldDeploy ? ['build'] : [])  // No dependency if skipped
    .when(shouldDeploy)
    .prompt('Deploy')
)

// Bad: Depends on task that may not have run
.addTask(
  ctx.createTask('deploy', 'Deploy')
    .deps(['build'])  // 'build' might have been skipped!
    .when(() => false)
    .prompt('Deploy')
)
```

### 4. Test All Branches

```bash
# Test with feature enabled
FEATURE_PAYMENTS=true npx crew run

# Test with feature disabled
FEATURE_PAYMENTS=false npx crew run

# Test production config
NODE_ENV=production npx crew run

# Test development config
NODE_ENV=development npx crew run
```

---

## Troubleshooting

### Task Condition Always Evaluates to True

Check if the condition function is returning correctly:

```typescript
const condition = () => {
  console.log('Condition evaluated');
  return process.env.DEPLOY === 'true';
};

.when(condition)
```

### File Exists Check Not Working

Use absolute paths:

```typescript
// Good: Absolute path
.when('FILE_EXISTS:/absolute/path/to/file')

// Bad: Relative path (might not work)
.when('FILE_EXISTS:./file')
```

### Conditional Dependencies Not Working

Remember to also make dependencies conditional:

```typescript
// Good: No dependency if task doesn't run
.addTask(
  ctx.createTask('b', 'B')
    .deps(runA ? ['a'] : [])
    .when(runB)
)

// Bad: Dependency but task skipped
.addTask(
  ctx.createTask('b', 'B')
    .deps(['a'])
    .when(false)  // Never runs but waits for a!
)
```

---

## See Also

- [Projects, Epics & Tasks](../core-concepts/projects-epics-tasks.md) - Task definition
- [Parallel Execution](./parallel-execution.md) - Conditional parallelism
- [Multi-Agent Workflows](./multi-agent-workflows.md) - Conditional agent selection

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
