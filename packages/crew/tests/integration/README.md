# Crew Integration Tests

Integration tests that verify the complete crew workflow from initialization through task execution.

## Test Structure

The integration tests follow the same workflow as production usage:

1. **crew init** - Initialize project with `.crew/` structure
2. **crew plan** - Generate execution plan from setup configuration
3. **crew next** - Execute next available task (repeat until complete)

## Test Files

- `simple-end-to-end.test.ts` - ✅ Complete workflow with simple plan (PASSING)

## Fixtures

### `test-project/`
Simple project fixture for basic testing with:
- `package.json` - Basic Node.js project
- `crew.config.ts` - Crew configuration with onInitCrew hook
- Plan: 2 epics, 5 tasks with dependencies + quality gates (10 tasks total)

### `web2next-project/` (unused)
Realistic web2next project fixture with:
- `.web2next/manifest.json` - Web2next generation manifest
- `templates/` - HTML templates
- Plan: Bootstrap → Pages → Integration (like real usage)

## Helpers

- `integration-harness.ts` - Test harness for managing temp directories and CLI calls
- `mock-agentfn.ts` - Mock agent function for testing without API calls
- `assertions.ts` - Common assertions for verifying crew state

## Usage

```bash
# Run all integration tests
pnpm test tests/integration

# Run specific test file
pnpm test tests/integration/simple-end-to-end.test.ts

# Watch mode
pnpm test --watch tests/integration/
```

## Key Patterns

### Setup and Teardown
```typescript
let harness: IntegrationHarness;

beforeEach(async () => {
  harness = new IntegrationHarness(mockAgentFn);
  await harness.setup({ fixtureDir: join(__dirname, 'fixtures', 'test-project') });
});

afterEach(async () => {
  await harness.teardown();
});
```

### Full Workflow
```typescript
// 1. Initialize
await harness.init({ name: 'test-project', goal: 'Build test project' });

// 2. Generate plan
await harness.plan();

// 3. Execute all tasks
const results = await harness.runAll(100);

// Verify completion
expect(results.length).toBe(totalTasks);
expect(results.every(r => r.status === 'completed')).toBe(true);
```

### Assertions
```typescript
assertCrewStructure(harness.projectRoot);
assertTaskCount(harness.store, 10);
assertTaskCompleted(harness.store, taskId);
```

## Recent Fixes

The following bugs were fixed to make the tests pass:

1. **Wrong argument order in `updateTaskStatus()`** - Epic object was being passed as status
2. **Tasks marked as 'blocked' instead of 'pending'** - Prevented dependency resolution
3. **Dependency resolution broken** - Plan IDs weren't mapped to actual task IDs

See the test file for details on the fixes.
