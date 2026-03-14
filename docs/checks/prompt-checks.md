# Prompt Checks

**AI-powered semantic validation: evaluate task outputs against criteria.**

[[docs](../README.md) > [checks](./README.md) > prompt-checks]

---

## Overview

Prompt checks use an AI agent to evaluate whether task output meets semantic criteria:

```typescript
.check({
  prompt: 'Verify all components export named exports, not default'
})

.check({
  prompt: 'Check that all API endpoints validate input and return proper errors',
  files: ['src/api/**/*.ts']
})
```

The agent:
1. Reads task output files
2. Evaluates against the prompt criteria
3. Returns pass/fail + structured feedback
4. Feedback is sent to agent for refinement on failure

---

## Basic Usage

### Simple Validation

```typescript
.check({
  prompt: 'Verify the code has no TypeScript `any` types'
})
```

By default, uses task's declared `outputs`.

### With Name

```typescript
.check({
  prompt: 'Check all functions have JSDoc comments',
  name: 'jsdoc-coverage'
})
```

### Custom Files

```typescript
.check({
  prompt: 'Verify React components use hooks correctly',
  files: ['src/components/**/*.tsx']
})
```

---

## Practical Examples

### Component Validation

```typescript
ctx.createTask('components', 'Create React components')
  .check({
    prompt: `Verify each component:
      - Is a named export (not default)
      - Has TypeScript prop types
      - Includes display name
      - Has proper error boundaries`,
    files: ['src/components/**/*.tsx'],
    name: 'component-quality'
  })
```

### API Endpoint Check

```typescript
ctx.createTask('api', 'Build REST API')
  .check({
    prompt: `For each endpoint:
      - Validates all input parameters
      - Returns proper HTTP status codes
      - Includes error response examples
      - Has TypeScript types for request/response`,
    files: ['src/api/routes/**/*.ts'],
    name: 'api-design'
  })
```

### Database Schema Check

```typescript
ctx.createTask('schema', 'Design database schema')
  .check({
    prompt: `Verify the schema:
      - All required fields are NOT NULL
      - Primary keys exist
      - Foreign keys reference existing tables
      - Indexes on foreign keys
      - No deprecated column names`,
    files: ['db/schema.sql', 'db/migrations/**/*.sql'],
    name: 'schema-quality'
  })
```

### Configuration File Check

```typescript
ctx.createTask('config', 'Setup configuration')
  .check({
    prompt: `Verify configuration:
      - All required environment variables defined
      - Default values are safe (no hardcoded secrets)
      - Documentation present for non-obvious settings`,
    files: ['.env.example', 'config.ts'],
    name: 'config-completeness'
  })
```

### Security Check

```typescript
ctx.createTask('auth', 'Implement authentication')
  .check({
    prompt: `Security review:
      - Passwords hashed with strong algorithm
      - Tokens have appropriate TTL
      - No secrets in version control
      - CSRF protection implemented
      - SQL injection mitigations in place`,
    files: ['src/auth/**/*.ts'],
    name: 'security-review'
  })
```

### Documentation Check

```typescript
ctx.createTask('docs', 'Write documentation')
  .check({
    prompt: `Verify documentation:
      - Clear installation instructions
      - Usage examples provided
      - API reference complete
      - Common errors documented
      - Links work correctly`,
    files: ['README.md', 'docs/**/*.md'],
    name: 'doc-quality'
  })
```

---

## Advanced Patterns

### Multi-Criterion Check

```typescript
.check({
  prompt: `Evaluate the implementation:
    1. Performance: No N+1 queries or inefficient loops
    2. Readability: Function names are clear and self-documenting
    3. Testability: Code is written to be testable
    4. Maintainability: Proper error handling and logging
    5. Compliance: Follows project style guide`,
  files: ['src/**/*.ts'],
  name: 'code-quality'
})
```

### Context-Aware Check

```typescript
.check({
  prompt: `Given the requirements in requirements.md, verify the implementation:
    - Addresses all specified features
    - Handles edge cases mentioned
    - Uses recommended patterns
    - Follows architectural guidelines`,
  files: ['src/**/*.ts', 'requirements.md'],
  name: 'requirements-compliance'
})
```

### Comparative Check

```typescript
.check({
  prompt: `Compare the new implementation to the old (in backup/):
    - Maintains backwards compatibility
    - Improves performance where expected
    - Doesn't introduce new issues
    - Follows existing code patterns`,
  files: ['src/**/*.ts', 'backup/**/*.ts'],
  name: 'compatibility-check'
})
```

---

## Combining Checks

### Multiple Validations

```typescript
ctx.createTask('feature', 'Implement feature')
  .check('tsc')  // Type checking
  .check('build')  // Compilation
  .check({
    prompt: 'Verify error handling is comprehensive',
    name: 'error-handling'
  })
  .check({
    prompt: 'Check code follows best practices',
    name: 'code-patterns'
  })
  .check({
    prompt: 'Verify performance optimizations',
    name: 'performance'
  })
```

---

## Prompt Guidelines

### Be Specific

```typescript
// ✅ Good
.check({
  prompt: 'Verify all HTTP endpoints use request/response types and include input validation'
})

// ❌ Too vague
.check({
  prompt: 'Check the API is good'
})
```

### Provide Context

```typescript
// ✅ Provides context
.check({
  prompt: `Verify the payment integration:
    - Stripe API correctly initialized
    - Webhook signatures verified
    - Test card numbers work in sandbox
    - Error responses are user-friendly`,
  files: ['src/payments/**/*.ts'],
  name: 'stripe-integration'
})

// ❌ No context
.check({
  prompt: 'Check payments'
})
```

### Actionable Criteria

```typescript
// ✅ Actionable
.check({
  prompt: `Verify TypeScript compliance:
    - No implicit any types
    - All function parameters typed
    - Return types specified
    - Generics properly constrained`,
  name: 'typescript-strict'
})

// ❌ Vague
.check({
  prompt: 'Make sure TypeScript is good'
})
```

### Include Examples

```typescript
// ✅ With examples
.check({
  prompt: `Verify component exports:
    - Correct: export const Button: React.FC = () => {}
    - Incorrect: export default Button
    - Must have: displayName = 'Button'`,
  files: ['src/components/**/*.tsx'],
  name: 'component-exports'
})

// ❌ Without examples
.check({
  prompt: 'Components should be exported properly'
})
```

---

## Common Validation Scenarios

### Framework Patterns

```typescript
// Next.js
.check({
  prompt: `Verify Next.js best practices:
    - Uses next/image for images
    - Uses next/link for navigation
    - Implements getServerSideProps or getStaticProps
    - Uses middleware for auth when needed`,
  name: 'nextjs-patterns'
})

// React
.check({
  prompt: `Verify React practices:
    - Uses hooks (not class components)
    - Proper dependency arrays in useEffect
    - No missing React.memo for optimization
    - Proper key props in lists`,
  name: 'react-patterns'
})
```

### Testing

```typescript
.check({
  prompt: `Verify test coverage:
    - Happy path tests present
    - Error cases tested
    - Edge cases covered
    - Mocking strategy appropriate`,
  files: ['src/**/*.test.ts'],
  name: 'test-quality'
})
```

### Performance

```typescript
.check({
  prompt: `Verify performance considerations:
    - No blocking operations in critical paths
    - Efficient database queries
    - Proper caching strategies
    - Asset optimization`,
  files: ['src/**/*.ts'],
  name: 'performance-review'
})
```

---

## Feedback for Agent

When a prompt check fails, the AI agent receives structured feedback:

```
Prompt check "component-quality" failed:

Criteria:
- All components should have TypeScript prop types
- Components should use named exports
- displayName should be set

Issues found:
- Button.tsx: Missing prop types interface
- Modal.tsx: Using default export instead of named
- Checkbox.tsx: Missing displayName

Fix these issues and re-run.
```

The agent then:
1. Reads the feedback
2. Fixes the issues
3. Re-runs checks
4. If checks pass, task completes

---

## Best Practices

### ✅ Do

- **Be specific** — AI evaluates against exact criteria
- **Provide context** — include relevant files for comparison
- **Use actionable language** — tell agent exactly what to fix
- **Include examples** — show good vs bad patterns
- **Focus on semantics** — let lint/type checks handle syntax

### ❌ Don't

- **Too vague** — "check if it's good"
- **Contradictory criteria** — conflicting requirements
- **Impossible standards** — expect perfect code
- **Mix concerns** — keep checks focused
- **Assume tool knowledge** — explain expected behavior

---

## Limitations

### When to Use Something Else

```typescript
// ❌ Use command check instead
.check({
  prompt: 'Verify npm test passes'
})

// ✅ Use command check
.check({ cmd: 'npm test' })

// ❌ Use inline check for file operations
.check({
  prompt: 'Verify output files exist'
})

// ✅ Use inline check
.check(async (ctx) => {
  const exists = await ctx.tools.file.exists('output.txt');
  return { passed: exists };
})
```

### Cost Considerations

Prompt checks call an AI agent, which costs money. Use sparingly for:
- Semantic validation (AI is good at this)
- High-value gates (where correctness matters)
- Complex criteria (not simple boolean checks)

Use other checks for:
- File existence (command checks)
- Type correctness (tsc)
- Performance (inline checks)
- Simple pass/fail (command checks)

---

## Troubleshooting

### Check Failures

If prompt checks always fail:

1. **Too strict criteria** — relax requirements
2. **Unclear prompt** — add examples and context
3. **Missing files** — verify input files are provided
4. **Wrong evaluation** — rephrase criteria more clearly

Example fix:

```typescript
// ❌ Too strict
.check({
  prompt: 'Perfect code with no issues'
})

// ✅ Realistic
.check({
  prompt: 'Code follows project style guide and has no critical issues'
})
```

### Inconsistent Results

If prompt checks pass/fail inconsistently:

1. **Vague criteria** — be more specific
2. **Context drift** — include all relevant files
3. **AI model variation** — add concrete examples

---

## See Also

- [Inline Checks](./inline-checks.md) — Function-based checks
- [Command Checks](./command-checks.md) — Shell validation
- [Named Checks](./named-checks.md) — Registry checks
- [AutoHarness](../HARNESS.md) — AI-synthesized validation
- [Fluent Builder](../task-api/fluent-builder.md) — `.check()` API

---

[← Back to Checks](./README.md) | [← Back to Documentation](../README.md)
