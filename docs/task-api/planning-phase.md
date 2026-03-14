# Planning Phase

**The plan-then-execute pattern for complex tasks.**

[[docs](../README.md) > [task-api](./README.md) > planning-phase]

---

## Overview

The planning phase enables a two-phase workflow:

1. **Planning phase**: Agent creates a detailed plan (no code changes)
2. **Execution phase**: Agent executes the approved plan

This is useful for complex tasks where you want:
- Explicit review of approach before implementation
- Clear audit trail of planning decisions
- Ability to refine the plan before execution begins
- Human or automated approval of the strategy

```typescript
ctx.createTask('api-refactor', 'Refactor payment API')
  .planning()  // Enable planning phase
  .prompt('Refactor the payment API for better error handling')
```

---

## Basic Usage

### Auto-Approve Planning

```typescript
ctx.createTask('migration', 'Database migration')
  .planning()
  .prompt('Create a migration for adding user roles table')
```

Execution flow:
1. Agent creates plan (no edits)
2. Plan auto-approved
3. Agent executes plan
4. Checks run
5. Task complete

The plan is saved to `.crew/epics/{epic}/tasks/{task}/plan.md` for inspection.

---

## Planning with Human Review

### Manual Review

```typescript
ctx.createTask('data-deletion', 'Delete old records')
  .planning()
  .review('human', {
    prompt: 'Confirm the deletion scope and impact',
    assignee: '@dba-lead',
    timeout: '24h',
    onTimeout: 'reject'
  })
```

Execution flow:
1. Agent creates plan
2. Session closes (human reviews offline)
3. Human approves/rejects via CLI: `crew review`
4. If approved, agent executes plan
5. Checks run

### Agent Review

```typescript
ctx.createTask('security-policy', 'Update security policy')
  .planning()
  .review('agent', {
    agent: 'security-reviewer',
    prompt: 'Review the plan for OWASP compliance'
  })
```

Execution flow:
1. Agent creates plan
2. Security reviewer reviews plan
3. If approved, main agent executes
4. Checks run

---

## Planning Configuration

### `.planning(config?)`

```typescript
interface PlanningConfig {
  enabled: boolean;                // Always true when using .planning()
  approval?: 'auto' | 'review' | 'agent';  // How to approve plan
  prompt?: string;                 // Custom planning instructions
  reviewAgent?: string;            // Agent for review (if approval: 'agent')
  maxIterations?: number;          // Max planning iterations (default: 1)
  closeSession?: boolean;          // Close after saving plan for review
}
```

### Examples

**Auto-approve with custom planning prompt:**
```typescript
.planning({
  approval: 'auto',
  prompt: `Create a 3-phase plan:
    1. Analyze current implementation
    2. Design new approach
    3. List specific changes needed`
})
```

**Human review with timeout:**
```typescript
.planning({
  approval: 'review',
  closeSession: true  // Close after saving plan for review
})
.review('human', {
  timeout: '48h',
  onTimeout: 'reject'
})
```

**Agent review then execution:**
```typescript
.planning({
  approval: 'agent',
  reviewAgent: 'architecture-reviewer'
})
```

---

## Practical Examples

### Database Schema Design

```typescript
ctx.createTask('design-schema', 'Design user database schema')
  .planning({
    approval: 'review',
    prompt: `Create a schema plan that includes:
      - Table definitions with types
      - Primary and foreign keys
      - Indexes strategy
      - Migration path for existing data`
  })
  .outputs(['db/schema.sql', 'db/migrations/01_initial.sql'])
  .review('human', {
    assignee: '@database-architect',
    prompt: 'Review schema for normalization and performance',
    timeout: '24h',
    onTimeout: 'reject'
  })
```

### API Design

```typescript
ctx.createTask('design-api', 'Design REST API endpoints')
  .planning({
    approval: 'auto'
  })
  .prompt(`Plan the API design including:
    - List of endpoints with methods (GET/POST/PUT/DELETE)
    - Request/response schemas
    - Error response codes
    - Authentication requirements`)
  .outputs(['docs/api-design.md'])
```

### Infrastructure Changes

```typescript
ctx.createTask('infra-update', 'Plan infrastructure updates')
  .planning({
    approval: 'review'
  })
  .prompt(`Create deployment plan:
    - Current state analysis
    - Proposed changes
    - Risk assessment
    - Rollback procedure`)
  .review('agent', {
    agent: 'ops-reviewer',
    prompt: 'Review for operational impact and disaster recovery'
  })
```

---

## Accessing the Plan

### In Execution Phase

The generated plan is available during execution:

```typescript
ctx.createTask('execute-plan', 'Execute implementation plan')
  .planning()
  .prompt('Create and then execute the plan')
  .executeFrom('.crew/executors/use-plan.js')
```

In the executor:

```javascript
// .crew/executors/use-plan.js
export default async function execute(ctx) {
  // Read the plan generated in planning phase
  const plan = await ctx.tools.file.read(`${ctx.taskDir}/plan.md`);

  // Parse and execute steps from plan
  const steps = parsePlan(plan);

  for (const step of steps) {
    ctx.log.info(`Executing: ${step.description}`);
    await executeStep(ctx, step);
  }

  return { success: true };
}
```

### In Checks

Checks can verify the plan quality:

```typescript
.check({
  prompt: 'Verify the plan includes concrete actionable steps',
  files: [`${ctx.taskDir}/plan.md`]
})
```

---

## Planning + Yields

Combine planning with yields for hierarchical planning:

```typescript
ctx.createTask('plan-features', 'Plan feature implementation')
  .planning({
    approval: 'review'
  })
  .prompt('Create a list of features to implement')
  .outputs(['FEATURE_PLAN.md'])
  .review('human')
  .yields({
    plan: `For each feature in the plan, create an implementation task`,
    target: 'next-epic'
  })
```

Execution flow:
1. Agent creates feature plan
2. Human reviews
3. Agent executes (writes FEATURE_PLAN.md)
4. Yields resolves: creates tasks for each feature
5. New tasks execute in next epic

---

## Planning + Review Gates

Combine planning with review gates:

```typescript
ctx.createTask('major-refactor', 'Refactor authentication')
  .planning()
  .prompt('Plan a complete refactoring of the auth system')
  .outputs(['AUTH_REFACTOR_PLAN.md'])
  .review('agent', {
    agent: 'security-reviewer',
    prompt: 'Review for security implications'
  })
  .check('tsc')
  .check('build')
  .review('human', {
    assignee: '@lead-engineer',
    prompt: 'Approve implementation and testing strategy'
  })
```

Flow:
1. Agent creates plan
2. Agent security reviewer checks plan
3. Agent executes plan
4. Checks run (tsc, build)
5. Human approves final result

---

## Session Management

### Closing the Session

When approval is 'review' or 'agent' with `closeSession: true`, the session closes after saving the plan:

```typescript
.planning({
  approval: 'review',
  closeSession: true
})
```

The human then:
1. Reviews the plan offline
2. Uses `crew review` to approve/reject
3. Framework resumes agent execution

### Resuming Execution

```bash
# List pending reviews
crew review

# Approve a specific plan
crew review approve <task-id>

# Reject with feedback
crew review reject <task-id> --message "Adjust error handling"
```

---

## Best Practices

### ✅ Do

- Use planning for **major decisions** — complex refactors, schema changes
- Include **approval gates** for risky operations
- Write **clear planning prompts** — specific about what the plan should cover
- **Inspect the generated plan** — verify it makes sense
- Use **agent review** for domain-specific expertise

### ❌ Don't

- Use planning for **simple tasks** — adds overhead
- Plan without **review** for risky operations
- Ignore the **generated plan** — it's your audit trail
- Set planning approval mode **too permissive** — defeats the purpose
- Plan more than **once per task** — plan-then-execute, not plan-plan-execute

---

## Troubleshooting

### Plan Generation Incomplete

If the agent's plan is incomplete or unclear:

```typescript
.planning({
  prompt: `Create a detailed step-by-step plan including:
    1. Analysis phase - what needs to be understood
    2. Design phase - the approach
    3. Implementation phase - concrete changes
    4. Testing phase - verification strategy
    5. Rollback plan - if something goes wrong`
})
```

### Agent Doesn't Follow Plan

During execution, explicitly use the plan:

```typescript
.executeFrom('.crew/executors/use-plan.js')
```

In executor:
```javascript
const plan = await ctx.tools.file.read(`${ctx.taskDir}/plan.md`);
// Explicitly follow each step in the plan
```

### Approval Timeout

Set appropriate timeouts:

```typescript
.review('human', {
  timeout: '24h',      // Shorter for urgent, longer for complex
  onTimeout: 'reject'  // What to do if human doesn't respond
})
```

---

## See Also

- [Review Gates](./review-gates.md) - Approval after execution
- [Yields](./yields-incremental-planning.md) - Dynamic planning
- [Fluent Builder](./fluent-builder.md) - `.planning()` configuration
- [Guides: Debugging](../guides/debugging-tasks.md) - Debugging planned tasks

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
