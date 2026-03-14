# AutoHarness Guide

The `.harness()` feature enables AI to generate executable validation code that runs deterministically after each task attempt.

## Table of Contents

- [What is AutoHarness?](#what-is-autoharness)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)

## What is AutoHarness?

AutoHarness implements a **propose-validate-refine** loop where:

1. **Agent proposes** — Generates code/output for the task
2. **Harness validates** — Runs synthesized JavaScript checks
3. **Framework refines** — Feeds errors back to the agent
4. **Loop repeats** — Until validation passes or max attempts reached

**Key Innovation:** The LLM generates **executable functions**, not rules. The harness runs deterministically without LLM in the validation loop.

## Quick Start

### Basic Usage

```typescript
ctx.createTask('nav', 'Build navigation')
  .prompt('Create a responsive navbar with ARIA labels')
  .harness()  // Derive validation from task prompt
  .build();
```

When this task runs:
1. Agent implements the navbar
2. LLM synthesizes validation code checking for ARIA labels and responsiveness
3. Code saves to `.crew/epics/01/tasks/01/harness.js`
4. Validation runs automatically after each attempt
5. Issues found trigger agent refinement

### Custom Validation Criteria

```typescript
ctx.createTask('api', 'Build REST API')
  .prompt('Create /users and /posts endpoints')
  .harness({
    prompt: 'Verify all endpoints return valid JSON and include error handling'
  })
  .build();
```

## How It Works

### The Synthesis Process

1. **Context Building**
   - Task prompt (what to build)
   - Input/output file lists
   - Validation criteria

2. **Code Generation**
   - LLM writes JavaScript function body
   - Function has access to file, shell, and issues APIs
   - No imports needed, pure validation logic

3. **Persistence**
   ```
   .crew/epics/01/tasks/02/
   ├── task.yaml
   ├── harness.js          ← Synthesized validation code
   └── harness-verdict.yaml ← Validation results
   ```

4. **Execution**
   - Runs after each task attempt
   - Reports issues with severity levels
   - No LLM calls during validation (fast!)

5. **Refinement** (optional)
   - Previous issues feed into next synthesis
   - Harness improves on false positives/negatives
   - Converges to accurate validation policy

### Execution Flow

```
Task Attempt
     ↓
Agent Output
     ↓
Base Checks (tsc, build, etc.)
     ↓
AutoHarness Validation
     ↓
Combined Verdict
     ↓
  Pass? ────→ YES → Task Done
     ↓
    NO
     ↓
Feedback to Agent
     ↓
Retry (up to max attempts)
```

## API Reference

### HarnessConfig

```typescript
interface HarnessConfig {
  /**
   * Source for deriving validation criteria.
   * - 'task-prompt': Use task's prompt field (default)
   * - 'inputs': Derive from input files
   * - 'outputs': Derive from expected output files
   */
  from?: 'task-prompt' | 'inputs' | 'outputs';

  /**
   * Custom validation prompt.
   * Overrides 'from' if provided.
   */
  prompt?: string;

  /**
   * Allow the harness to refine itself on false positives/negatives.
   * Default: false
   */
  refinable?: boolean;

  /**
   * Cache synthesized harness for reuse across similar tasks.
   * Default: false
   */
  cache?: boolean;

  /**
   * Maximum refinement iterations when refinable is true.
   * Default: 5
   */
  maxRefinements?: number;
}
```

### Harness Function API

The synthesized JavaScript code has access to:

```typescript
// File operations
await file.read(path: string): Promise<string>
await file.exists(path: string): Promise<boolean>
await file.glob(pattern: string): Promise<string[]>

// Shell commands
await shell.run(cmd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>

// Issue reporting
issues.push({
  message: string;    // Description of the issue
  severity: 'error' | 'warning' | 'info';
  file?: string;      // Optional file path
  line?: number;      // Optional line number
})
```

### HarnessVerdict

```typescript
interface HarnessVerdict {
  accepted: boolean;           // Overall pass/fail
  score: number;               // 0-100 quality score
  issues: HarnessIssue[];      // List of validation issues
  attempt: number;             // Attempt number for this task
  harnessVersion?: number;     // Harness refinement iteration
}
```

## Examples

### Example 1: Accessibility Validation

```typescript
ctx.createTask('components', 'Build UI components')
  .inputs(['design/mockups.pdf'])
  .outputs(['src/components/*.tsx'])
  .prompt('Create accessible React components from designs')
  .harness({
    prompt: 'Check all components have proper ARIA attributes and keyboard navigation'
  })
  .build();
```

**Generated harness.js:**
```javascript
// Auto-generated validation code
const components = await file.glob('src/components/*.tsx');

for (const comp of components) {
  const content = await file.read(comp);

  // Check for ARIA labels
  if (!content.match(/aria-label|aria-labelledby/)) {
    issues.push({
      message: `${comp} missing ARIA labels`,
      severity: 'error',
      file: comp
    });
  }

  // Check for keyboard handlers
  if (content.includes('onClick') && !content.includes('onKeyDown')) {
    issues.push({
      message: `${comp} has onClick without keyboard support`,
      severity: 'warning',
      file: comp
    });
  }
}
```

### Example 2: API Contract Validation

```typescript
ctx.createTask('api', 'REST API endpoints')
  .outputs(['src/routes/*.ts', 'openapi.yaml'])
  .prompt('Implement REST API with OpenAPI spec')
  .harness({
    from: 'outputs',
    refinable: true
  })
  .build();
```

**Generated harness.js:**
```javascript
// Verify OpenAPI spec exists and matches implementation
const specExists = await file.exists('openapi.yaml');
if (!specExists) {
  issues.push({
    message: 'Missing openapi.yaml specification',
    severity: 'error'
  });
  return;
}

const spec = await file.read('openapi.yaml');
const routes = await file.glob('src/routes/*.ts');

// Check each route is documented in spec
for (const route of routes) {
  const content = await file.read(route);
  const endpoints = content.match(/router\.(get|post|put|delete)\(['"]([^'"]+)['"]/g) || [];

  for (const endpoint of endpoints) {
    const path = endpoint.match(/['"]([^'"]+)['"]/)[1];
    if (!spec.includes(path)) {
      issues.push({
        message: `Endpoint ${path} not documented in OpenAPI spec`,
        severity: 'error',
        file: route
      });
    }
  }
}
```

### Example 3: Test Coverage Validation

```typescript
ctx.createTask('tests', 'Write test suite')
  .inputs(['src/lib/*.ts'])
  .outputs(['src/lib/*.test.ts'])
  .prompt('Write comprehensive unit tests')
  .harness({
    prompt: 'Verify test coverage for all exported functions',
    refinable: true,
    maxRefinements: 3
  })
  .build();
```

**Generated harness.js:**
```javascript
const sourceFiles = await file.glob('src/lib/*.ts');

for (const source of sourceFiles) {
  const testFile = source.replace('.ts', '.test.ts');

  if (!await file.exists(testFile)) {
    issues.push({
      message: `Missing test file for ${source}`,
      severity: 'error'
    });
    continue;
  }

  const sourceContent = await file.read(source);
  const testContent = await file.read(testFile);

  // Extract exported functions
  const exports = sourceContent.match(/export (?:async )?function (\w+)/g) || [];

  for (const exp of exports) {
    const funcName = exp.match(/function (\w+)/)[1];
    if (!testContent.includes(funcName)) {
      issues.push({
        message: `Function ${funcName} not tested in ${testFile}`,
        severity: 'warning',
        file: testFile
      });
    }
  }
}
```

### Example 4: Security Validation

```typescript
ctx.createTask('auth', 'Authentication module')
  .prompt('Implement JWT authentication with refresh tokens')
  .harness({
    prompt: 'Check for security best practices: no hardcoded secrets, proper token validation, secure password hashing'
  })
  .build();
```

**Generated harness.js:**
```javascript
const authFiles = await file.glob('src/auth/**/*.ts');

for (const f of authFiles) {
  const content = await file.read(f);

  // Check for hardcoded secrets
  if (content.match(/(?:secret|password|key)\s*=\s*['"][^'"]+['"]/i)) {
    issues.push({
      message: `Possible hardcoded secret in ${f}`,
      severity: 'error',
      file: f
    });
  }

  // Check for bcrypt/argon2 for password hashing
  if (content.includes('password') && !content.match(/bcrypt|argon2/)) {
    issues.push({
      message: `${f} may not use secure password hashing`,
      severity: 'error',
      file: f
    });
  }

  // Check for JWT verification
  if (content.includes('jwt.sign') && !content.includes('jwt.verify')) {
    issues.push({
      message: `${f} creates JWT but doesn't verify`,
      severity: 'warning',
      file: f
    });
  }
}
```

## Advanced Usage

### Refinable Harness

When `refinable: true`, the harness improves itself:

```typescript
ctx.createTask('linter', 'Custom linting rules')
  .harness({
    prompt: 'Check code follows our style guide',
    refinable: true,
    maxRefinements: 5
  })
  .build();
```

**Iteration 1:** Initial harness is too strict, flags valid code
**Iteration 2:** Refined with context about false positives
**Iteration 3:** Converges to accurate validation
**Iteration 4+:** Fine-tuning edge cases

### Caching Harnesses

Reuse synthesized harnesses across similar tasks:

```typescript
const componentHarness = {
  prompt: 'Check React component best practices',
  cache: true
};

plan.addTask(ctx.createTask('header', 'Header').harness(componentHarness));
plan.addTask(ctx.createTask('footer', 'Footer').harness(componentHarness));
plan.addTask(ctx.createTask('sidebar', 'Sidebar').harness(componentHarness));
```

All three tasks share the same validation logic.

### Combining with Checks

Use harness alongside traditional checks:

```typescript
ctx.createTask('api', 'Build API')
  .check('tsc')         // TypeScript compilation
  .check('build')       // Build succeeds
  .harness()            // Custom validation
  .check({              // Prompt-based review
    prompt: 'Verify API follows RESTful conventions'
  })
  .build();
```

Execution order:
1. tsc check
2. build check
3. harness validation
4. prompt-based review

All must pass for task completion.

## Best Practices

### 1. Be Specific in Prompts

❌ **Too vague:**
```typescript
.harness({ prompt: 'Check if code is good' })
```

✅ **Specific criteria:**
```typescript
.harness({
  prompt: 'Verify: 1) All functions have JSDoc, 2) No TODO comments, 3) Error handling present'
})
```

### 2. Use `from` for File-Based Validation

❌ **Generic:**
```typescript
.harness({ prompt: 'Check output files' })
```

✅ **Derive from outputs:**
```typescript
.outputs(['dist/*.js'])
.harness({ from: 'outputs' })  // Validates generated files
```

### 3. Refine Only When Needed

Refinement adds iterations. Use when:
- Validation criteria are complex
- False positives/negatives expected
- High-value tasks requiring precision

❌ **Always refining:**
```typescript
.harness({ refinable: true })  // On every task
```

✅ **Strategic refinement:**
```typescript
.harness({ refinable: true })  // Only on critical tasks
```

### 4. Start Simple, Add Complexity

**Phase 1:** Basic checks
```typescript
.check('tsc')
.check('build')
```

**Phase 2:** Add harness
```typescript
.harness()
```

**Phase 3:** Custom criteria
```typescript
.harness({ prompt: 'Specific validation' })
```

**Phase 4:** Refinement
```typescript
.harness({ prompt: '...', refinable: true })
```

### 5. Inspect Generated Code

Harness code is saved to disk for a reason:

```bash
# Review synthesized validation
cat .crew/epics/01/tasks/02/harness.js

# Edit if needed (becomes static policy)
vim .crew/epics/01/tasks/02/harness.js

# Check validation results
cat .crew/epics/01/tasks/02/harness-verdict.yaml
```

### 6. Version Control Harnesses

Add to `.gitignore`:
```
.crew/**/harness-verdict.yaml  # Temporary results
.crew/**/progress.jsonl        # Execution logs
```

Commit to git:
```
.crew/**/harness.js            # Validation logic (reviewable)
.crew/**/task.yaml             # Task definitions
```

## Troubleshooting

### Harness Not Running

**Check:**
1. Is `.harness()` called in task definition?
2. Does `task.yaml` include `harness: {}`?
3. Are there errors in previous checks blocking execution?

### False Positives

**Solution:**
```typescript
.harness({ refinable: true })  // Let harness learn
```

Or manually edit `harness.js` to fix logic.

### Harness Synthesis Fails

**Causes:**
- Prompt too vague
- Missing context (inputs/outputs not specified)
- Network/API issues

**Fix:**
```typescript
.harness({
  prompt: 'Very specific validation criteria here',
  from: 'outputs'  // Give explicit context
})
```

### Performance Issues

**Harness runs on every attempt.**

Optimize:
1. Use `cache: true` for reusable harnesses
2. Limit file operations (avoid reading all files)
3. Use shell commands for heavy checks

## Architecture

### Two-Harness System

**DefaultHarness:**
- Wraps existing checks (tsc, build, tests)
- No LLM synthesis
- Just structure around validation

**AutoHarness:**
- Wraps DefaultHarness
- Adds synthesized validation layer
- Only active when `.harness()` is used

### Files and Persistence

```
.crew/epics/01/tasks/02/
├── task.yaml              # Task definition (includes harness config)
├── harness.js             # Synthesized validation code
├── harness-verdict.yaml   # Latest verdict (accepted, score, issues)
├── attempts/
│   ├── 001.jsonl         # First attempt logs
│   └── 002.jsonl         # Second attempt logs
└── README.md             # Task description
```

## Related

- [Task Types](TASK_TYPES.md)
- [Checks vs Harness](CHECKS.md)
- [Quality Gates](QUALITY_GATES.md)

---

**Questions?** Open an issue or discussion on GitHub.
