# Goal Tracking Playbook

This playbook covers defining, tracking, and closing project goals using the crew framework. Goals connect high-level objectives to the epics and tasks that deliver them.

## Table of Contents

- [Goal Tracking Workflow](#goal-tracking-workflow)
- [What Goals Are For](#what-goals-are-for)
- [Creating Goals](#creating-goals)
- [Goal Lifecycle](#goal-lifecycle)
- [Linking Goals to Epics](#linking-goals-to-epics)
- [Acceptance Criteria](#acceptance-criteria)
- [Monitoring Goal Health](#monitoring-goal-health)
- [Goals Tool API](#goals-tool-api)
- [Goal Patterns](#goal-patterns)
- [Integration with Planning](#integration-with-planning)

---

## Goal Tracking Workflow

```
Define goal → Set acceptance criteria → Link to epics → Monitor → Close when met
```

1. **Define** — What's the objective? What business outcome does it deliver?
2. **Criteria** — What specific, verifiable conditions mean this goal is done?
3. **Link** — Which epics in the plan deliver on this goal?
4. **Monitor** — Are the linked tasks progressing? Any blockers?
5. **Close** — When all acceptance criteria are met, mark as done

## What Goals Are For

Goals bridge the gap between "what we're building" (tasks/epics) and "why we're building it" (business outcomes). A plan can be 100% complete and still fail if it didn't achieve the right outcomes.

Goals help you:
- **Prioritize** — When two tasks compete for attention, the one linked to a higher-priority goal wins
- **Detect drift** — If tasks aren't connected to goals, you might be building the wrong thing
- **Communicate** — Goals are the language stakeholders understand; tasks are implementation details
- **Know when you're done** — Clear acceptance criteria prevent scope creep

## Creating Goals

### Goal Structure

Goals live in `.crew/goals/` as JSON files, one per goal:

```json
{
  "id": "user-auth",
  "title": "User Authentication",
  "description": "Users can create accounts, log in, and manage their sessions securely",
  "status": "active",
  "epicIds": ["epic_features"],
  "acceptance": [
    "Users can register with email and password",
    "Users can log in and receive a JWT token",
    "Protected routes redirect unauthenticated users to login",
    "Sessions expire after 24 hours of inactivity"
  ],
  "created": "2026-03-07T10:00:00Z",
  "updated": "2026-03-07T10:00:00Z"
}
```

### Using the Goals Tool

```typescript
// Create a goal
await tools.goals.create({
  id: 'user-auth',
  title: 'User Authentication',
  description: 'Users can create accounts and manage sessions',
  acceptance: [
    'Users can register with email and password',
    'Login returns a JWT token',
    'Protected routes require authentication',
  ],
  epicIds: ['epic_features'],
});
```

### Goal ID Naming

Use kebab-case IDs that describe the outcome:

- `user-auth` — User authentication
- `api-performance` — API performance targets
- `mobile-responsive` — Mobile responsiveness
- `data-migration` — Data migration from old system

Avoid generic IDs like `goal-1` or `phase-2` — they don't tell you what the goal is about.

## Goal Lifecycle

Goals move through these states:

```
active → done
active → blocked → active → done
active → at-risk → active → done
active → at-risk → blocked → active → done
```

### Status: active

The goal is being worked on. Linked epics/tasks are in progress.

```typescript
// Default status when created
await tools.goals.create({ id: 'goal', title: 'My Goal', ... });
```

### Status: done

All acceptance criteria are met. The goal delivered its intended outcome.

```typescript
await tools.goals.close('user-auth');
```

Close a goal when you can verify each acceptance criterion. Don't close prematurely — if "users can register" is a criterion, verify that the registration flow actually works end to end.

### Status: blocked

Cannot proceed. Something outside the project's control is preventing progress.

```typescript
await tools.goals.block('user-auth', 'Waiting for OAuth provider API keys');
```

Always include a reason — it helps whoever unblocks it understand what's needed. Common blockers:

- External dependency not available (API keys, third-party service)
- Upstream task has a bug that prevents downstream work
- Design decision needs stakeholder input
- Infrastructure not provisioned

### Status: at-risk

The goal might not be achievable as planned. Not blocked yet, but trending badly.

```typescript
await tools.goals.risk('user-auth', 'OAuth integration more complex than estimated');
```

At-risk is an early warning. Use it when:
- Tasks are taking longer than expected
- New requirements emerged that weren't in the original plan
- Dependencies are proving more complex than anticipated
- Team capacity changed

## Linking Goals to Epics

### Why Link?

Linking creates traceability: goal → epic → tasks. This lets you:
- See which tasks contribute to which goals
- Detect orphaned work (tasks not connected to any goal)
- Measure progress at the goal level, not just task level

### How to Link

When creating a goal, include `epicIds`:

```json
{
  "id": "performance",
  "title": "API Response Time < 200ms",
  "epicIds": ["epic_optimization", "epic_caching"]
}
```

Or update an existing goal:

```typescript
await tools.goals.update('performance', {
  epicIds: ['epic_optimization', 'epic_caching'],
});
```

### Multi-Goal Epics

An epic can contribute to multiple goals. For example, an "Infrastructure" epic might contribute to both a "Performance" goal and a "Reliability" goal.

### Cross-Epic Goals

A goal can span multiple epics. "User Authentication" might involve tasks in both a "Backend" epic and a "Frontend" epic. Link both:

```json
{
  "epicIds": ["epic_backend", "epic_frontend"]
}
```

## Acceptance Criteria

Good acceptance criteria are the backbone of effective goal tracking. They should be:

### Specific and Verifiable

Each criterion should be a binary yes/no — either it's met or it isn't.

**Good**:
- "Users can register with email and password"
- "API responds in under 200ms for 95th percentile"
- "All pages score 90+ on Lighthouse performance"

**Bad**:
- "Good user experience" — too subjective
- "Fast API" — not measurable
- "Complete authentication" — what does "complete" mean?

### Independent

Each criterion should be verifiable on its own, without requiring other criteria to be checked first.

### Ordered by Priority

List the most important criteria first. If you had to ship with only half of them, which half would you keep?

### Testable

Ideally, criteria can be automated as checks:

```typescript
ctx.createTask('verify-auth', 'Verify Auth Goal')
  .type('verify')
  .check('auth-registration')
  .check('auth-login')
  .check('auth-protected-routes')
```

## Monitoring Goal Health

### The goals-on-track Check

The crewman plugin registers a `goals-on-track` check that scans all goals and flags any that are `blocked` or `at-risk`:

```bash
crew verify    # Runs all checks including goals-on-track
```

### Manual Health Check

Periodically review goal health:

```typescript
const goals = await tools.goals.list();

for (const goal of goals) {
  if (goal.status === 'blocked') {
    console.log(`BLOCKED: ${goal.title} — ${goal.blockedReason}`);
  }
  if (goal.status === 'at-risk') {
    console.log(`AT RISK: ${goal.title} — ${goal.riskReason}`);
  }
}
```

### Progress Indicators

Since goals link to epics, you can estimate goal progress by checking epic completion:

```bash
crew status --json    # Shows epic completion percentages
```

If a goal's linked epics are 80% done but the remaining 20% includes the hardest tasks, the goal might be at risk even though progress looks good on paper.

### Blocker Escalation

When a goal is blocked:

1. Check the `blockedReason` field
2. Determine if the blocker is resolvable internally or needs external action
3. If internal: create a fix task or unblock the dependency
4. If external: document the dependency and estimated resolution
5. Check if other goals are affected by the same blocker

## Goals Tool API

The `goals` tool is registered by the crewman plugin and available in task contexts:

### list(): Goal[]

Returns all goals as parsed JSON objects.

### get(id: string): Goal | null

Returns a specific goal by ID, or null if not found.

### create(goal): Goal

Creates a new goal. Required fields: `id`, `title`. Optional: `description`, `acceptance`, `epicIds`. Status defaults to `active`.

### update(id: string, updates): Goal | null

Updates a goal's status, reasons, or linked epics. Returns the updated goal or null if not found.

### close(id: string): Goal | null

Shorthand for `update(id, { status: 'done' })`.

### block(id: string, reason: string): Goal | null

Shorthand for `update(id, { status: 'blocked', blockedReason: reason })`.

### risk(id: string, reason: string): Goal | null

Shorthand for `update(id, { status: 'at-risk', riskReason: reason })`.

## Goal Patterns

### Milestone Goals

Tie goals to project milestones:

```json
{
  "id": "mvp-launch",
  "title": "MVP Launch Ready",
  "acceptance": [
    "Core features functional (auth, dashboard, API)",
    "No critical bugs",
    "Basic documentation complete",
    "Deployed to staging environment"
  ],
  "epicIds": ["epic_foundation", "epic_features", "epic_deployment"]
}
```

### Quality Gates

Use goals as quality gates between phases:

```json
{
  "id": "production-ready",
  "title": "Production Readiness",
  "acceptance": [
    "All tests passing with >80% coverage",
    "Security audit completed",
    "Performance benchmarks met",
    "Monitoring and alerting configured",
    "Runbook documented"
  ]
}
```

### Feature Goals

One goal per major feature, with criteria that describe user-facing behavior:

```json
{
  "id": "search",
  "title": "Full-Text Search",
  "acceptance": [
    "Users can search by keyword across all content",
    "Results appear within 500ms",
    "Search results include highlighting",
    "Empty queries show recent items"
  ]
}
```

## Integration with Planning

### Goal-First Planning

Start with goals, then derive the plan:

1. Define 3-5 goals for the project
2. For each goal, identify what needs to be built
3. Group related work into epics
4. Break epics into tasks
5. Link goals to their epics

This ensures every task exists for a reason.

### Plan Review Against Goals

When reviewing a plan, check alignment:

- Does every goal have at least one linked epic?
- Does every epic contribute to at least one goal?
- Are the acceptance criteria covered by the plan's tasks?

Orphaned work (tasks not connected to any goal) might be unnecessary — or it might reveal a missing goal.

### Goal-Driven Prioritization

When deciding task order:

1. Which goals are most critical?
2. Which tasks unblock the most goal progress?
3. Are any goals at risk that need immediate attention?

Use this to inform `priority` values on tasks.
