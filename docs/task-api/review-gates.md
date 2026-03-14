# Review Gates

**Human-in-the-loop approval checkpoints for task execution.**

[[docs](../README.md) > [task-api](./README.md) > review-gates]

---

## Overview

Review gates pause task execution to require explicit approval before proceeding. Two types of reviewers:

- **Human review** — A person decides via `crew review`
- **Agent review** — Another AI agent evaluates the work

```typescript
ctx.createTask('security-audit', 'Perform security audit')
  .review('human', {
    prompt: 'Review for compliance and security',
    assignee: '@security-lead'
  })

ctx.createTask('code-quality', 'Check code quality')
  .review('agent', {
    agent: 'quality-reviewer',
    prompt: 'Verify code follows best practices'
  })
```

---

## Human Review

### Basic Usage

```typescript
.review('human')
```

Execution flow:
1. Task completes
2. Review gate triggered
3. Session closes
4. Human reviews and decides via CLI
5. On approval, execution continues

### With Instructions

```typescript
.review('human', {
  prompt: 'Verify the API design meets requirements',
  assignee: '@api-lead'
})
```

The prompt appears in `crew review` output to guide the reviewer.

### Timeout Behavior

```typescript
.review('human', {
  prompt: 'Review database migration plan',
  timeout: '24h',
  onTimeout: 'approve'  // Auto-approve if human doesn't respond
})
```

Timeout options:
- `'approve'` — auto-approve if timeout reached
- `'reject'` — auto-reject if timeout reached (default)

---

## Agent Review

### Basic Usage

```typescript
.review('agent', {
  agent: 'security-reviewer'
})
```

The named agent persona (from `.crew/agents/security-reviewer.md`) reviews the task output.

### With Evaluation Prompt

```typescript
.review('agent', {
  agent: 'quality-reviewer',
  prompt: `Check the code for:
    - Proper error handling
    - TypeScript types on all functions
    - No console.log statements
    - Sufficient test coverage`
})
```

### Auto-Approve

```typescript
.review('agent', {
  agent: 'reviewer',
  autoApprove: false  // Default: require human confirmation
})
```

With `autoApprove: true`, agent's approval automatically proceeds. With `false`, human still needs to confirm.

---

## Multiple Reviews

Stack multiple review gates for sequential approval:

```typescript
ctx.createTask('payment-processor', 'Implement payment processor')
  .prompt('Build Stripe integration')
  .check('tsc')
  .check('build')
  .review('agent', {
    agent: 'security-reviewer',
    prompt: 'Verify PCI compliance and secure key handling'
  })
  .review('human', {
    assignee: '@payments-lead',
    prompt: 'Final approval for production payment code'
  })
```

All reviews must approve for task to proceed.

---

## Review Timing

### Before Execution

```typescript
.review('human', {
  prompt: 'Should we proceed with this high-risk operation?'
})
.prompt('Delete records older than 2023-01-01')
```

Pauses before the agent even starts.

### After Execution

```typescript
.prompt('Implement the feature')
.check('tsc')
.check('build')
.review('human', {
  prompt: 'Approve the feature implementation'
})
```

Pauses after checks pass but before task completes.

---

## CLI: Managing Reviews

### List Pending Reviews

```bash
crew review
crew review --status pending
```

Output shows all tasks awaiting approval:
```
Pending Reviews:

Epic 1: Setup
  Task 1.3 — Delete old records [human]
    Prompt: Confirm deletion scope
    Assignee: @dba-lead
    Timeout: 24h

Epic 2: Features
  Task 2.1 — Implement auth [agent: security-reviewer]
    Prompt: Review for vulnerabilities
```

### Approve a Review

```bash
crew review approve <task-id>
crew review approve m1.3
```

### Reject a Review

```bash
crew review reject <task-id> --message "Reason for rejection"
crew review reject m2.1 --message "Missing error handling for rate limits"
```

The feedback is sent to the agent (if procedural) or logged (if complete).

### View Review Details

```bash
crew review <task-id>
crew review m1.3
```

Shows full context: task, prompt, assignee, timeout.

---

## Practical Examples

### Data Deletion

```typescript
ctx.createTask('delete-old-records', 'Archive old user records')
  .review('human', {
    prompt: `Confirm deletion parameters:
      - Start date: {{startDate}}
      - End date: {{endDate}}
      - Total records: {{count}}
      - Can be restored: Yes (archived to backup)`,
    assignee: '@dba-lead',
    timeout: '48h',
    onTimeout: 'reject'
  })
  .vars({
    startDate: '2020-01-01',
    endDate: '2022-12-31'
  })
```

### Security Policy

```typescript
ctx.createTask('update-cors', 'Update CORS policy')
  .prompt('Update CORS settings to allow origin: ' + ctx.vars.allowedOrigin)
  .review('agent', {
    agent: 'security-reviewer',
    prompt: 'Review CORS configuration for security risks'
  })
  .review('human', {
    assignee: '@security-lead',
    prompt: 'Final approval of CORS changes'
  })
```

### Major Refactor

```typescript
ctx.createTask('refactor-auth', 'Refactor authentication system')
  .planning()
  .prompt('Refactor auth from custom JWT to industry standard')
  .outputs(['AUTH_REFACTOR_PLAN.md'])
  .review('agent', {
    agent: 'security-reviewer',
    prompt: 'Review plan for security improvements'
  })
  .review('human', {
    assignee: '@lead-engineer',
    prompt: 'Approve refactoring approach and timeline'
  })
  .check('tsc')
  .check('test')
```

### Database Migration

```typescript
ctx.createTask('migrate-user-data', 'Migrate user data to new schema')
  .review('human', {
    prompt: `Migration impact assessment:
      - Users affected: {{count}}
      - Estimated duration: {{duration}}
      - Rollback available: Yes
      - Backup created: Yes`,
    assignee: '@database-ops',
    timeout: '24h',
    onTimeout: 'reject'
  })
  .prompt('Migrate user records to new schema with data transformation')
  .check('verify-migration')
  .onComplete(async (ctx) => {
    await ctx.tools.git.commit('data: migrated user data');
  })
```

---

## Review Results

### Accessing Review Decisions

In subsequent tasks, you can check if a previous task was approved:

```typescript
// Task 2 depends on Task 1's review
ctx.createTask('publish', 'Publish changes')
  .deps(['deploy'])
  .shouldStart(async (ctx) => {
    // Only publish if deployment was approved
    const deployTask = ctx.epic.tasks.find(t => t.id === 'deploy');
    return deployTask?.status === 'done';
  })
```

### Review Decision Recording

Review decisions are logged in the task directory:

```
.crew/epics/01/tasks/03/
  ├── task.yaml
  ├── todo.yaml
  ├── output.txt
  └── review.json  ← Contains decision, reviewer, timestamp, feedback
```

---

## Best Practices

### ✅ Do

- **Be specific in review prompts** — guide the reviewer with context
- **Set appropriate timeouts** — longer for complex, shorter for urgent
- **Use agent reviews for domain expertise** — domain-specific validation
- **Use human reviews for judgment calls** — business/policy decisions
- **Combine with planning** — review plan before execution

### ❌ Don't

- **Review everything** — adds overhead for low-risk tasks
- **Vague review prompts** — "looks good?" doesn't help
- **Set timeout too short** — humans need time to think
- **Set onTimeout: approve for critical tasks** — defeats the purpose
- **Use reviews instead of checks** — checks should verify correctness first

---

## Integration with Planning

Combine review gates with planning for maximum control:

```typescript
ctx.createTask('major-change', 'Make major architecture change')
  .planning({
    approval: 'review'
  })
  .prompt('Create plan for migrating to microservices')
  .review('human', {
    prompt: 'Review architecture plan',
    timeout: '48h',
    onTimeout: 'reject'
  })
  .check('tsc')
  .check('build')
  .review('human', {
    prompt: 'Approve final implementation'
  })
```

Flow:
1. Agent creates plan
2. Human reviews plan
3. Agent executes plan
4. Checks run
5. Human approves result

---

## Automation Patterns

### Review with Conditions

```typescript
.review(ctx => {
  // Only require review for production
  if (ctx.vars.environment === 'production') {
    return { type: 'human', assignee: '@release-manager' };
  }
  return null;  // Skip review
})
```

### Escalation

```typescript
.review('agent', {
  agent: 'auto-reviewer',
  autoApprove: false
})
.review('human', {
  prompt: 'Review agent decision',
  timeout: '24h'
})
```

Agent reviews first, human confirms (or overrides).

---

## Troubleshooting

### Reviews Not Appearing

Ensure task completed before review:
```typescript
.prompt('Do work')
.check('verify')     // Must pass
.review('human')     // Appears after checks pass
```

### No Response to Review

Implement `onTimeout`:
```typescript
.review('human', {
  timeout: '48h',
  onTimeout: 'approve'  // Auto-approve if no response
})
```

### Agent Review Too Strict

Adjust evaluation criteria:
```typescript
.review('agent', {
  agent: 'lenient-reviewer',  // Different persona
  prompt: 'Focus on critical issues only, ignore minor style'
})
```

---

## See Also

- [Planning Phase](./planning-phase.md) - Review plans before execution
- [Lifecycle Hooks](./lifecycle-hooks.md) - Hooks run before/after review
- [Fluent Builder](./fluent-builder.md) - `.review()` configuration
- [CLI Reference](../cli/commands.md) - `crew review` command
- [Guides: CI/CD Integration](../guides/ci-cd-integration.md) - Reviews in CI pipelines

---

[← Back to Task API](./README.md) | [← Back to Documentation](../README.md)
