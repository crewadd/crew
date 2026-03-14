# Integration Testing Generated Code

**Test the code and artifacts produced by AI agents in Crew tasks.**

[[docs](../README.md) > [guides](./README.md) > integration-testing]

---

## Overview

Integration testing in Crew means:

1. **Validating generated code** - Ensure agents produce correct implementations
2. **Testing cross-service boundaries** - Verify APIs, UIs, and services work together
3. **Quality gates as tests** - Checks automatically validate all code
4. **Continuous verification** - Every task runs tests before marking complete
5. **Test-first planning** - Define tests in your plan

---

## Basic Integration Tests

### Test Generated Artifacts

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('API with Tests');

  plan.addEpic(
    ctx.createEpic('api', 'API Development')
      .addTask(
        ctx.createTask('endpoints', 'Create API Endpoints')
          .prompt('Create /users and /posts endpoints')
          .outputs(['src/api.ts'])
          .check({ cmd: 'tsc --noEmit' })
          .check({
            cmd: 'node -e "const api = require(\'./dist/api.js\'); console.log(typeof api.getUsersEndpoint)"'
          })
      )
  );

  plan.addEpic(
    ctx.createEpic('tests', 'Integration Tests')
      .addTask(
        ctx.createTask('api-tests', 'Test API')
          .inputs(['src/api.ts'])
          .deps(['endpoints'])
          .prompt('Write tests for API endpoints')
          .outputs(['src/api.test.ts'])
          .check({ cmd: 'npm test -- api.test.ts' })
      )
  );

  return plan.build();
}
```

### Verify Generated Output Exists

```typescript
.addTask(
  ctx.createTask('build', 'Build')
    .prompt('Build the application')
    .outputs(['dist/', 'dist/index.js'])
    .check({ cmd: 'test -d dist && test -f dist/index.js' })
    .check({ cmd: 'ls -lh dist/index.js | grep -v "^-$"' })  // File has content
)
```

---

## Service Integration Tests

### REST API Integration

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('REST API Integration');

  plan.addEpic(
    ctx.createEpic('server', 'API Server')
      .addTask(
        ctx.createTask('auth', 'Build Auth Endpoints')
          .prompt('Create /login and /register endpoints')
          .check({ cmd: 'npm test -- auth' })
      )
      .addTask(
        ctx.createTask('users', 'Build User Endpoints')
          .prompt('Create CRUD endpoints for users')
          .deps(['auth'])
          .check({ cmd: 'npm test -- users' })
      )
  );

  plan.addEpic(
    ctx.createEpic('integration', 'Integration Tests')
      .addTask(
        ctx.createTask('api-integration', 'Test API Integration')
          .prompt('Test authentication flow and user operations end-to-end')
          .inputs(['src/api/'])
          .deps(['users'])
          .check({
            cmd: `npm test -- integration.test.ts --testNamePattern="should"`,
          })
          .check({
            prompt: 'Verify all HTTP status codes are correct'
          })
      )
  );

  return plan.build();
}
```

### Database Integration

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Database Integration');

  plan.addEpic(
    ctx.createEpic('db', 'Database Layer')
      .addTask(
        ctx.createTask('schema', 'Create Schema')
          .prompt('Create database schema for users and posts')
          .outputs(['db/schema.sql'])
          .check({ cmd: 'test -f db/schema.sql' })
      )
      .addTask(
        ctx.createTask('models', 'Create Models')
          .prompt('Create database models')
          .inputs(['db/schema.sql'])
          .deps(['schema'])
          .check({ cmd: 'npm test -- models' })
      )
  );

  plan.addEpic(
    ctx.createEpic('tests', 'Database Tests')
      .addTask(
        ctx.createTask('db-tests', 'Integration Tests')
          .prompt('Write tests that verify data persistence and queries')
          .deps(['models'])
          .check({
            cmd: 'npm test -- db --testPathPattern="integration"'
          })
          .check({
            prompt: 'Verify all CRUD operations work'
          })
      )
  );

  return plan.build();
}
```

---

## Client-Server Integration

### Frontend-Backend Testing

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Full Stack Integration');

  // Backend
  plan.addEpic(
    ctx.createEpic('backend', 'Backend')
      .addTask(
        ctx.createTask('api', 'Build API')
          .prompt('Create REST API')
          .outputs(['src/api.ts'])
          .check({ cmd: 'npm test -- api' })
      )
  );

  // Frontend
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend')
      .addTask(
        ctx.createTask('ui', 'Build UI')
          .prompt('Create React components')
          .outputs(['src/components/'])
          .check({ cmd: 'npm test -- components' })
      )
  );

  // Integration
  plan.addEpic(
    ctx.createEpic('integration', 'Integration')
      .addTask(
        ctx.createTask('e2e', 'End-to-End Tests')
          .inputs(['src/api.ts', 'src/components/'])
          .deps(['api', 'ui'])
          .prompt('Write E2E tests that verify UI and API work together')
          .check({
            cmd: 'npm run test:e2e',
          })
          .check({
            prompt: 'Verify user workflows from click to data display'
          })
      )
  );

  return plan.build();
}
```

---

## Test File Generation

### Generate Tests During Implementation

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Test Generation');

  plan.addEpic(
    ctx.createEpic('implementation', 'Implementation')
      .addTask(
        ctx.createTask('auth', 'Build Authentication')
          .prompt(`Create JWT authentication module.

          File should export:
          - generateToken(user)
          - verifyToken(token)
          - refreshToken(oldToken)`)
          .outputs(['src/auth.ts', 'src/auth.test.ts'])
          .check({ cmd: 'tsc --noEmit' })
      )
  );

  plan.addEpic(
    ctx.createEpic('validation', 'Validation')
      .addTask(
        ctx.createTask('run-tests', 'Run Generated Tests')
          .inputs(['src/auth.test.ts'])
          .deps(['auth'])
          .prompt('Verify all tests pass')
          .check({ cmd: 'npm test -- auth.test.ts' })
      )
  );

  return plan.build();
}
```

### Type Safety Testing

```typescript
.addTask(
  ctx.createTask('types', 'Build API with Types')
    .prompt('Create API client with TypeScript types')
    .outputs(['src/client.ts'])
    .check({ cmd: 'tsc --noEmit' })  // Verify types are correct
    .check({
      prompt: 'Verify TypeScript strict mode passes'
    })
)
```

---

## Real-World Example: SPA Integration

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Single Page App');

  // Phase 1: Backend
  plan.addEpic(
    ctx.createEpic('backend', 'Backend Development')
      .addTask(
        ctx.createTask('db', 'Database Setup')
          .prompt('Create PostgreSQL schema for articles and comments')
          .outputs(['db/migrations/'])
          .check({ cmd: 'test -d db/migrations' })
      )
      .addTask(
        ctx.createTask('models', 'Build Models')
          .inputs(['db/migrations/'])
          .deps(['db'])
          .prompt('Create ORM models')
          .check({ cmd: 'npm test -- models' })
      )
      .addTask(
        ctx.createTask('api', 'Build REST API')
          .inputs(['src/models/'])
          .deps(['models'])
          .prompt('Create REST API for articles and comments')
          .outputs(['src/api.ts', 'src/api.test.ts'])
          .check({ cmd: 'npm test -- api' })
      )
  );

  // Phase 2: Frontend
  plan.addEpic(
    ctx.createEpic('frontend', 'Frontend Development')
      .addTask(
        ctx.createTask('components', 'Build Components')
          .prompt('Create React components for article list, detail, comment form')
          .outputs(['src/components/'])
          .check({ cmd: 'npm test -- components' })
      )
      .addTask(
        ctx.createTask('pages', 'Build Pages')
          .inputs(['src/components/'])
          .deps(['components'])
          .prompt('Create page components')
          .outputs(['src/pages/'])
          .check({ cmd: 'npm test -- pages' })
      )
  );

  // Phase 3: Integration
  plan.addEpic(
    ctx.createEpic('integration', 'Integration Testing')
      .addTask(
        ctx.createTask('client', 'Create API Client')
          .inputs(['src/api.ts'])
          .deps(['api'])
          .prompt('Create TypeScript client for API')
          .outputs(['src/client.ts'])
          .check({ cmd: 'tsc --noEmit' })
      )
      .addTask(
        ctx.createTask('connect', 'Connect Frontend to Backend')
          .inputs(['src/client.ts', 'src/pages/'])
          .deps(['client', 'pages'])
          .prompt('Integrate frontend components with API client')
          .check({ cmd: 'npm run build' })
      )
      .addTask(
        ctx.createTask('e2e', 'E2E Tests')
          .inputs(['src/'])
          .deps(['connect'])
          .prompt('Write E2E tests: read articles, add comment, see it appear')
          .check({ cmd: 'npm run test:e2e' })
          .check({
            prompt: 'Verify comment submission and display works'
          })
      )
  );

  return plan.build();
}
```

---

## Test Coverage Verification

### Check Coverage Thresholds

```typescript
.addTask(
  ctx.createTask('coverage', 'Coverage Check')
    .prompt('Run tests and generate coverage report')
    .check({
      cmd: 'npm test -- --coverage --coverageThreshold=\'{"global":{"branches":80,"functions":80,"lines":80}}\''
    })
    .check({
      prompt: 'Verify at least 80% code coverage'
    })
)
```

---

## Mutation Testing

### Verify Test Quality

```typescript
.addTask(
  ctx.createTask('mutations', 'Mutation Testing')
    .prompt('Run mutation tests to verify test quality')
    .check({
      cmd: 'npm run test:mutation -- --threshold 75'
    })
    .check({
      prompt: 'Verify at least 75% of mutations are killed'
    })
)
```

---

## Contract Testing

### API Contract Verification

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Contract Testing');

  plan.addEpic(
    ctx.createEpic('contract', 'Contract Definition')
      .addTask(
        ctx.createTask('contract', 'Define API Contract')
          .prompt('Create OpenAPI/Swagger contract for API')
          .outputs(['openapi.yaml'])
          .check({ cmd: 'test -f openapi.yaml' })
      )
  );

  plan.addEpic(
    ctx.createEpic('verify', 'Contract Verification')
      .addTask(
        ctx.createTask('provider', 'Provider Tests')
          .inputs(['openapi.yaml'])
          .deps(['contract'])
          .prompt('Test API against contract')
          .check({ cmd: 'npm run test:provider' })
      )
      .addTask(
        ctx.createTask('consumer', 'Consumer Tests')
          .inputs(['openapi.yaml'])
          .deps(['contract'])
          .prompt('Test client against contract')
          .check({ cmd: 'npm run test:consumer' })
      )
  );

  return plan.build();
}
```

---

## Snapshot Testing

### Regression Prevention

```typescript
.addTask(
  ctx.createTask('snapshots', 'Snapshot Tests')
    .prompt('Generate snapshots of complex outputs')
    .check({
      cmd: 'npm test -- --snapshot --updateSnapshot'
    })
)
```

---

## Performance Testing

### Load Testing Integration

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('Performance Testing');

  plan.addEpic(
    ctx.createEpic('load', 'Load Testing')
      .addTask(
        ctx.createTask('load-test', 'Run Load Tests')
          .prompt('Create load tests for API')
          .check({
            cmd: 'npm run test:load -- --duration 30s'
          })
          .check({
            prompt: 'Verify API handles 100 requests/second'
          })
      )
  );

  return plan.build();
}
```

---

## Best Practices

### 1. Test Early and Often

```typescript
// Good: Test each component
.addTask(ctx.createTask('build', 'Build')
  .check({ cmd: 'npm test -- unit' })  // Unit tests
)
.addTask(ctx.createTask('integrate', 'Integrate')
  .check({ cmd: 'npm test -- integration' })  // Integration tests
)

// Bad: Only test at end
.addTask(ctx.createTask('build', 'Build').prompt('...'))
.addTask(ctx.createTask('deploy', 'Deploy')
  .check({ cmd: 'npm test' })  // Too late!
)
```

### 2. Multiple Verification Levels

```typescript
.addTask(
  ctx.createTask('api', 'Build API')
    .check({ cmd: 'tsc --noEmit' })                    // Type safety
    .check({ cmd: 'npm run lint' })                    // Code quality
    .check({ cmd: 'npm test -- api.test.ts' })         // Unit tests
    .check({ cmd: 'npm run test:integration' })        // Integration tests
    .check({ prompt: 'Verify error responses' })       // Manual verification
)
```

### 3. Clear Test Descriptions

```typescript
// Good: Specific test names
.check({ cmd: 'npm test -- --testNamePattern="POST /users creates new user"' })

// Bad: Generic test names
.check({ cmd: 'npm test' })
```

### 4. Test Dependencies Clearly

```typescript
// Good: Clear test stages
plan.addEpic(ctx.createEpic('unit', 'Unit Tests')...);
plan.addEpic(ctx.createEpic('integration', 'Integration Tests')...);
plan.addEpic(ctx.createEpic('e2e', 'E2E Tests')...);

// Bad: Unclear test ordering
.addTask(ctx.createTask('unit', 'Tests').prompt('...'))
.addTask(ctx.createTask('integration', 'Tests').prompt('...'))
```

---

## Troubleshooting

### Test Failures in CI

Check the full test output:

```bash
npx crew status --verbose
cat .crew/progress.jsonl | jq 'select(.event == "task:check:fail")'
```

### Tests Passing Locally but Failing in Integration

Ensure all dependencies are captured in task inputs:

```typescript
.addTask(
  ctx.createTask('test', 'Test')
    .inputs(['src/', 'package.json'])  // Include all needed files
    .check({ cmd: 'npm test' })
)
```

---

## See Also

- [Checks & Quality Gates](../core-concepts/checks-and-quality-gates.md) - Understanding checks
- [CI/CD Integration](./ci-cd-integration.md) - Running in CI pipelines
- [Debugging Tasks](./debugging-tasks.md) - Debug test failures

---

[← Back to Guides](./README.md) | [Documentation Home](../README.md)
