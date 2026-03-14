# Checks & Quality Gates

**The verification system that ensures task outputs meet requirements.**

[[docs](../README.md) > [core-concepts](./README.md) > checks-and-quality-gates]

---

## Overview

Crew's **checks** are post-task validations that automatically verify an agent's work. When a check fails, a **quality gate** automatically retries the agent with the failure feedback. This loop continues until either checks pass or max attempts are exceeded.

```
Agent executes task
         ↓
Checks run (verify output)
         ↓
    Passed? → Done
         ↓
    Failed? → Provide feedback
         ↓
    Agent retries (attempt 2, 3, ...)
         ↓
    Checks run again
```

**Why checks matter:**
- **Verification, not trust** — Agents say "done", checks say "prove it"
- **Automatic feedback** — Failures feed back to agent for retry
- **No manual testing** — Quality gates run without human intervention

---

## Adding Checks to Tasks

### Basic Command Check

Run a shell command. Exit code 0 = pass, non-zero = fail:

```typescript
ctx.createTask('init', 'Initialize project')
  .prompt('Create a TypeScript project')
  .check({ cmd: 'test -f package.json' })          // Pass: file exists
  .check({ cmd: 'test -f tsconfig.json' })         // Pass: file exists
  .check({ cmd: 'npm list | grep typescript' })    // Pass: typescript installed
```

### Named Checks

Reference built-in or custom checks by name:

```typescript
ctx.createTask('build', 'Build project')
  .prompt('Compile the project')
  .check('tsc')                    // TypeScript compiler check
  .check('build')                  // npm run build
  .check('images')                 // Image optimization check
```

**Built-in checks:**
- `'tsc'` — TypeScript type checking
- `'build'` — npm run build
- `'images'` — Image file validation

### AI-Powered Prompt Checks

Ask an AI to verify outputs. Useful for subjective validation:

```typescript
ctx.createTask('ui', 'Build navigation')
  .prompt('Create a responsive navbar with ARIA labels')
  .check({ prompt: 'Verify the navbar has ARIA labels for accessibility' })
  .check({ prompt: 'Confirm the navbar is responsive on mobile' })
```

### Multiple Checks

Chain checks together. All must pass for task success:

```typescript
ctx.createTask('utils', 'Create utility functions')
  .prompt('Implement capitalize, reverse, and isPalindrome functions')
  .check({ cmd: 'test -f src/utils.ts' })                          // File exists
  .check({ cmd: 'grep -q "export function capitalize" src/utils.ts' })  // Function exists
  .check({ cmd: 'grep -q "export function reverse" src/utils.ts' })     // Function exists
  .check({ cmd: 'grep -q "export function isPalindrome" src/utils.ts' }) // Function exists
  .check({ cmd: 'npx tsc --noEmit' })                              // Type check passes
  .check({ prompt: 'Verify all functions have JSDoc comments' })   // AI verification
```

---

## Check Types

### 1. Command Checks

Execute a shell command. Pass if exit code is 0:

```typescript
.check({ cmd: 'test -f package.json' })           // File exists
.check({ cmd: 'test -d node_modules' })           // Directory exists
.check({ cmd: 'npm test' })                        // Run tests
.check({ cmd: 'npx tsc --noEmit' })               // TypeScript compile
.check({ cmd: 'npm run build' })                  // Run build script
.check({ cmd: 'ls dist/ | grep -q index.js' })   // Output exists
```

**Command check syntax:**

```typescript
{
  cmd: string;              // Shell command to run
  name?: string;            // Optional check name (for reporting)
  cwd?: string;             // Working directory
}
```

### 2. Named Checks

Reference built-in checks by name. Crew provides a registry of common checks:

```typescript
.check('tsc')              // TypeScript validation
.check('build')            // npm run build
.check('images')           // Image file validation
```

**Named check syntax:**

```typescript
{
  name: string;            // Check registry name
  autoFix?: boolean;       // Auto-repair on failure (if supported)
  maxRetries?: number;     // Max retries for this check
}
```

### 3. Prompt Checks

Ask an AI to evaluate the output. Useful for subjective requirements:

```typescript
.check({
  prompt: 'Verify the code has proper error handling'
})

.check({
  prompt: 'Check that all functions have JSDoc comments',
  name: 'jsdoc-coverage'
})
```

**Prompt check syntax:**

```typescript
{
  prompt: string;          // AI validation prompt
  name?: string;           // Optional check name
  files?: string[];        // Specific files to examine (optional)
}
```

The AI receives the prompt plus context about the task outputs, then returns a pass/fail verdict.

---

## Check Execution

### Execution Order

Checks run in the order they're defined:

```typescript
.check({ cmd: 'test -f package.json' })     // Runs 1st
.check({ cmd: 'test -f tsconfig.json' })    // Runs 2nd
.check({ cmd: 'npm run build' })            // Runs 3rd
```

If check 1 passes but check 2 fails, check 3 doesn't run (fail-fast).

### Failure and Retry

When a check fails, the task enters a **retry loop**:

```
Attempt 1:
  Execute agent → Checks run → Check fails
         ↓
  Generate failure report
         ↓
Attempt 2:
  Execute agent again (with failure feedback)
         ↓
  Checks run again → All checks pass
         ↓
Done
```

### Max Attempts

By default, a task retries up to **3 times**. Override with `.attempts()`:

```typescript
ctx.createTask('tricky', 'Complex task')
  .prompt('This might need a few tries...')
  .check({ cmd: 'complex-validation' })
  .attempts(5)              // Allow up to 5 attempts
```

**Attempt numbering:**
- Attempt 1: `events/001.jsonl`
- Attempt 2: `events/002.jsonl`
- Attempt 3: `events/003.jsonl`

If all 3 (or 5) attempts exhaust, the task fails and execution stops.

---

## Failure Feedback

When a check fails, Crew generates **structured feedback** for the agent:

```
Task: Create REST API
Original prompt: Create REST API with /users and /posts endpoints

Check that failed:
  Name: test-users-endpoint
  Command: curl -s http://localhost:3000/users

Error output:
  curl: (7) Failed to connect to localhost port 3000: Connection refused

Feedback for agent:
  The /users endpoint is not accessible. Verify that:
  1. The server is running
  2. The endpoint is properly defined
  3. The port is correct
  4. The application is listening
```

This feedback is passed to the agent in the retry prompt, enabling intelligent error correction.

---

## The Todo Checklist

Each task has a `todo.yaml` that tracks checks at a fine-grained level:

```yaml
# .crew/epics/01-setup/tasks/01-init/todo.yaml
- id: main
  title: "Execute task"
  phase: main
  status: done
  completedAt: 2025-03-15T10:00:05.000Z

- id: post:package-exists
  title: "check: test -f package.json"
  phase: post
  status: done
  completedAt: 2025-03-15T10:00:06.000Z

- id: post:tsconfig-exists
  title: "check: test -f tsconfig.json"
  phase: post
  status: failed
  error: "Exit code 1: file not found"
  attempt: 1
```

**Todo phases:**
1. **pre** — Pre-checks (verify preconditions before agent runs)
2. **main** — Agent execution
3. **post** — Post-checks (verify outputs after agent completes)

**Benefits:**
- Partial re-execution: only failed checks need rerun on retry
- Granular tracking: see exactly which checks pass/fail
- No full re-execution: agent doesn't re-run if only new checks fail

---

## Quality Gates in Practice

### Example 1: TypeScript Project

```typescript
ctx.createTask('init', 'Initialize project')
  .prompt('Create a TypeScript project with package.json and tsconfig.json')
  .check({ cmd: 'test -f package.json' })
  .check({ cmd: 'test -f tsconfig.json' })
  .check({ cmd: 'grep -q "typescript" package.json' })
```

**Execution flow:**
1. Agent receives prompt, creates files
2. Check 1: `test -f package.json` runs → Pass
3. Check 2: `test -f tsconfig.json` runs → Pass
4. Check 3: `grep -q "typescript" package.json` runs → Pass
5. Task complete

Or if Check 2 fails:
1. Agent creates files (attempt 1)
2. Check 1 passes, Check 2 fails
3. Feedback: "tsconfig.json not found"
4. Agent retries (attempt 2)
5. Agent creates tsconfig.json
6. Checks re-run → All pass
7. Task complete

### Example 2: API Endpoint

```typescript
ctx.createTask('api', 'Create API')
  .prompt('Create a /users endpoint that returns a JSON list')
  .check({ cmd: 'npx tsc --noEmit' })           // Type check
  .check({ cmd: 'npm test' })                    // Tests pass
  .check({ prompt: 'Verify the /users endpoint returns valid JSON' })
```

**Execution:**
1. Agent builds API
2. TypeScript check runs → Pass
3. Tests run → Pass
4. AI verification prompt runs → Pass
5. Task complete

### Example 3: UI Component

```typescript
ctx.createTask('nav', 'Build navigation')
  .prompt('Create a responsive navbar with accessibility support')
  .check({ cmd: 'npx tsc --noEmit' })           // Type check
  .check({
    prompt: 'Verify the navbar has ARIA labels for screen readers'
  })
  .check({
    prompt: 'Confirm the navbar is responsive on mobile devices'
  })
```

---

## Built-In Checks

Crew provides a registry of common checks. Access them by name:

### `tsc` — TypeScript Compilation

Runs `npx tsc --noEmit` to verify TypeScript compiles without errors.

```typescript
.check('tsc')

// Equivalent to:
.check({ cmd: 'npx tsc --noEmit' })
```

**Configuration:**
```typescript
.check('tsc', { autoFix: false })  // Don't auto-fix
```

### `build` — Build Script

Runs `npm run build` to verify the build succeeds.

```typescript
.check('build')

// Equivalent to:
.check({ cmd: 'npm run build' })
```

### `images` — Image Validation

Verifies images exist and meet quality standards.

```typescript
.check('images')
```

Checks:
- All images exist in expected locations
- Images are properly formatted
- Image metadata is present

---

## Custom Checks

Define custom checks in your project. Add them to the check registry:

```typescript
// Create a custom check plugin
const myCustomCheck = {
  name: 'my-lint',
  run: async (context) => {
    // Run custom validation
    const result = await exec('npm run lint');

    return {
      passed: result.exitCode === 0,
      issues: result.passed ? [] : [
        {
          check: 'my-lint',
          message: result.stderr,
          severity: 'error'
        }
      ]
    };
  }
};
```

Then use it in tasks:

```typescript
.check('my-lint')  // References custom check by name
```

---

## Verification Report

After all tasks complete, Crew generates a **verification report**:

```typescript
interface VerificationReport {
  passed: boolean;           // All checks passed?
  checks: VerificationCheck[];
  issues: VerificationIssue[];
}

interface VerificationCheck {
  name: string;              // Check name
  passed: boolean;
  issues: VerificationIssue[];
  raw?: string;              // Raw output from check command
}

interface VerificationIssue {
  check: string;             // Which check produced this
  file?: string;             // Affected file (if applicable)
  line?: number;             // Line number (if applicable)
  message: string;           // Issue description
  severity: 'error' | 'warning';
}
```

Access via CLI:

```bash
crew verify --json > report.json
```

---

## Best Practices

### 1. Check for Outputs, Not Inputs

Good checks verify what the agent **produced**, not what was given:

```typescript
// Good: Check agent created the file
.check({ cmd: 'test -f src/api.ts' })

// Bad: Check input exists (agent didn't create this)
.check({ cmd: 'test -f src/types.ts' })  // This was already in inputs
```

### 2. Use Multiple Specific Checks

Multiple specific checks are better than one complex check:

```typescript
// Good: Multiple specific checks
.check({ cmd: 'test -f package.json' })
.check({ cmd: 'grep -q "typescript" package.json' })
.check({ cmd: 'grep -q "build" package.json' })

// Less ideal: One complex check
.check({ cmd: 'test -f package.json && grep -q "typescript" package.json && grep -q "build" package.json' })
```

**Why?** If the complex check fails, it's unclear which part failed. Multiple checks give precise feedback.

### 3. Combine Command and Prompt Checks

Use command checks for objective verification, prompt checks for subjective:

```typescript
.check({ cmd: 'npx tsc --noEmit' })                    // Objective: types OK?
.check({ prompt: 'Verify error handling is robust' })  // Subjective: quality good?
```

### 4. Order Checks for Fast Feedback

Put fast checks first, slow checks last:

```typescript
// Good: Fast checks first
.check({ cmd: 'test -f src/api.ts' })                  // Fast (file exists)
.check({ cmd: 'npx tsc --noEmit' })                    // Medium (type check)
.check({ cmd: 'npm test' })                            // Slow (full test suite)

// Less ideal: Slow first
.check({ cmd: 'npm test' })  // Waits for full suite before file check
.check({ cmd: 'test -f src/api.ts' })
```

### 5. Be Specific in Prompt Checks

Provide clear criteria for AI verification:

```typescript
// Good: Specific criteria
.check({
  prompt: `Verify the navbar has:
    1. ARIA labels on all buttons
    2. Keyboard navigation support
    3. Mobile-responsive breakpoints
  `
})

// Vague: AI has to guess what "good" means
.check({ prompt: 'Is the navbar good?' })
```

### 6. Set Appropriate Max Attempts

Default is 3 attempts. Adjust based on task difficulty:

```typescript
// Simple task: fewer attempts
ctx.createTask('trivial', 'Trivial task')
  .attempts(2)

// Complex task: more attempts
ctx.createTask('complex', 'Complex task')
  .check({ cmd: 'complex-validation' })
  .attempts(5)

// Very straightforward: 1 attempt (fail immediately)
ctx.createTask('rigid', 'Rigid spec task')
  .attempts(1)
```

---

## Debugging Checks

### View Check Failures

```bash
# See detailed failure info
tail -20 .crew/epics/01-setup/tasks/01-init/events/001.jsonl | jq '.[] | select(.event == "check:fail")'

# See all failed checks across project
grep '"status":"failed"' .crew/epics/*/tasks/*/todo.yaml
```

### Test a Check Locally

```bash
# Run a command check yourself
test -f package.json && echo "PASS" || echo "FAIL"

# Test a prompt check with AI
# (Ask an AI with the same prompt)
```

### Adjust and Retry

If a check is incorrect, fix it and re-run:

```bash
# Edit the task definition
vim .crew/epics/01-setup/tasks/01-init/task.yaml

# Reset the task and retry
crew task reset 01-setup 01-init
crew run --from 01-setup:01-init
```

---

## See Also

- [Projects, Epics & Tasks](./projects-epics-tasks.md) — How checks fit into task definition
- [Execution Flow](./execution-flow.md) — How checks flow through execution loop
- [Filesystem Store](./filesystem-store.md) — Where check results are persisted
- [Checks Reference](../checks/README.md) — Detailed check API reference
