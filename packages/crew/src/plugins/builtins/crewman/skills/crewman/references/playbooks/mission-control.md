# Mission Control Playbook

This playbook covers high-level project oversight: progress tracking, status reporting, blocker detection, and strategic decision-making. Mission control is the bird's-eye view of the project.

## Table of Contents

- [Mission Control Workflow](#mission-control-workflow)
- [Status Assessment](#status-assessment)
- [Progress Reports](#progress-reports)
- [Blocker Detection](#blocker-detection)
- [Risk Assessment](#risk-assessment)
- [Health Metrics](#health-metrics)
- [Strategic Decisions](#strategic-decisions)
- [Mission Tool API](#mission-tool-api)
- [Report Templates](#report-templates)
- [Escalation Procedures](#escalation-procedures)

---

## Mission Control Workflow

```
Gather data → Assess health → Identify issues → Recommend actions → Report
```

1. **Gather** — Pull status from crew CLI, goal state, and progress history
2. **Assess** — Calculate completion rates, identify trends, spot anomalies
3. **Identify** — Find blockers, at-risk goals, stale tasks, dependency issues
4. **Recommend** — Suggest prioritized next actions based on the assessment
5. **Report** — Present findings in a format appropriate for the audience

## Status Assessment

### Quick Status

For a fast snapshot:

```bash
crew status              # AI-optimized overview
```

This shows:
- Epic completion percentages
- Task counts by status (pending, active, done, failed, blocked)
- Next executable tasks
- Any warnings or issues

### Detailed Status

For deeper analysis:

```bash
crew status --json       # Full machine-readable status
crew tree                # Visual plan structure
```

The JSON output includes:
- Every task with its current status, dependencies, and attempt history
- Epic progress calculations
- Blocked/failed task details

### Minimal Status

For quick updates without detail:

```bash
crew status --minimal    # Compact one-line summary
```

## Progress Reports

### Overview Report

A comprehensive project overview follows this structure:

1. **Executive Summary** — One paragraph: where are we, are we on track?
2. **Progress by Epic** — Completion percentage and key deliverables for each epic
3. **Goal Status** — Which goals are active, at-risk, blocked, or done
4. **Blockers** — Current blockers with impact assessment
5. **Next Actions** — Top 3-5 recommended next steps

### Generating an Overview

Use the mission tool:

```typescript
const overview = await tools.mission.overview();
```

This runs `crew status` and `crew tree`, reads `.crew/goals/`, and produces a structured report.

### Progress Calculation

Progress is tracked at multiple levels:

**Task level**: Binary — done or not done. Attempts are tracked but don't affect the percentage.

**Epic level**: Percentage of tasks completed in the epic.

```
Epic progress = (done tasks / total tasks) × 100
```

**Project level**: Weighted average of epic progress, or simple task ratio.

```
Project progress = (total done tasks / total tasks) × 100
```

### Velocity Tracking

The progress log (`.crew/progress.jsonl`) records timestamps for every state transition. Use this to calculate:

- **Tasks per session** — How many tasks complete in a work session
- **Average task duration** — Time from `active` to `done`
- **Trend** — Is velocity increasing or decreasing?

```bash
# Recent state transitions
tail -50 .crew/progress.jsonl
```

## Blocker Detection

### Automated Blocker Scan

Use the mission tool:

```typescript
const blockers = await tools.mission.blockers();
```

This checks:
- **Failed tasks** — Tasks with `status: "failed"`
- **Blocked tasks** — Tasks whose dependencies haven't completed
- **Blocked goals** — Goals with `status: "blocked"`
- **At-risk goals** — Goals with `status: "at-risk"`
- **Stale tasks** — Tasks in `active` status with no recent progress

### Manual Blocker Search

```bash
crew search "blocked"    # Find blocked items
crew search "failed"     # Find failed items
crew status --json       # Full status for manual inspection
```

### Blocker Categories

| Category | Impact | Resolution |
|----------|--------|------------|
| **Hard blocker** | Stops all downstream work | Must be resolved immediately |
| **Soft blocker** | Slows progress but workarounds exist | Schedule fix, use workaround |
| **External blocker** | Depends on third party | Document, follow up, plan alternatives |
| **Technical debt** | Accumulating friction | Schedule cleanup epic |

### Impact Assessment

When a blocker is found, assess its blast radius:

1. **How many tasks are blocked?** — Count downstream dependencies
2. **Which goals are affected?** — Check epicIds on affected tasks
3. **Is there a workaround?** — Can blocked tasks be redesigned to avoid the dependency?
4. **What's the resolution time?** — How long until the blocker is resolved?

## Risk Assessment

### Risk Indicators

Watch for these signs:

| Indicator | Risk Level | What It Means |
|-----------|-----------|---------------|
| Multiple failed attempts on one task | Medium | The task may be poorly scoped or have a fundamental issue |
| Growing number of blocked tasks | High | A upstream failure is cascading |
| Goals moving from active to at-risk | High | Timeline or scope pressure |
| No tasks completed recently | Medium | Possible stall — investigate |
| Many tasks in active state simultaneously | Low-Medium | Might indicate parallelism, or might indicate tasks aren't finishing |

### Risk Mitigation

For each risk level:

**Low**: Monitor. Note it in the status report but don't change the plan.

**Medium**: Investigate. Check logs, talk to the user, understand root cause. May need a fix task.

**High**: Act. Create blockers in goals, add fix tasks, consider re-prioritizing the plan.

**Critical**: Escalate. Flag to the user immediately. May need plan restructuring or scope reduction.

## Health Metrics

### Completion Rate

```
completion_rate = done_tasks / total_tasks
```

Healthy: > 0% and growing per session. A zero completion rate after multiple sessions is a red flag.

### Failure Rate

```
failure_rate = failed_tasks / (done_tasks + failed_tasks)
```

Healthy: < 20%. Above 30% suggests systemic issues — check-configuration, task scoping, or dependency problems.

### Block Rate

```
block_rate = blocked_tasks / total_tasks
```

Healthy: < 15%. High block rates indicate dependency bottlenecks or upstream failures cascading.

### Goal Health

```
goal_health = active_goals / (active_goals + blocked_goals + at_risk_goals)
```

Healthy: > 70%. Low goal health means the project's objectives are in trouble, even if individual tasks are completing.

## Strategic Decisions

Mission control informs strategic decisions about the project:

### Scope Decisions

When the project is at risk:
- Which goals are most critical? Focus on those.
- Which tasks can be deferred without affecting critical goals?
- Can acceptance criteria be relaxed for non-critical goals?

### Priority Decisions

When multiple paths are possible:
- Which tasks unblock the most downstream work?
- Which goals are closest to completion?
- Are there quick wins that improve morale and progress metrics?

### Architecture Decisions

When technical issues emerge:
- Is a fundamental approach not working? Document the decision to change.
- Are workarounds accumulating? Consider a refactoring epic.
- Is a dependency proving problematic? Evaluate alternatives.

## Mission Tool API

The `mission` tool is registered by the crewman plugin:

### overview(): string

Generates a full project overview by:
1. Running `crew status` and `crew tree`
2. Reading `.crew/goals/` for goal state
3. Producing a structured report with progress, goals, blockers, and recommendations

### blockers(): string

Scans for blockers across the project:
1. Checks `crew status` for failed/blocked tasks
2. Reads `.crew/goals/` for blocked/at-risk goals
3. Returns a structured blocker report

### progress(): string

Returns the `crew status` output focused on progress metrics. If no plan exists, returns a message suggesting `crew plan init`.

## Report Templates

### Quick Status Update

```markdown
## Status Update — [Date]

**Progress**: [X]% complete ([done]/[total] tasks)
**Active Epic**: [Epic Name] ([X]% done)
**Blockers**: [None / Brief description]
**Next**: [Top task to do next]
```

### Full Progress Report

```markdown
# Project Progress Report — [Date]

## Executive Summary

[One paragraph: overall status, on-track/at-risk, key accomplishments]

## Epic Progress

| Epic | Progress | Status | Key Deliverables |
|------|----------|--------|-----------------|
| Foundation | 100% | Done | Repo init, deps, base layout |
| Features | 60% | Active | Auth (done), API (in progress) |
| Polish | 0% | Pending | — |

## Goal Status

| Goal | Status | Progress | Notes |
|------|--------|----------|-------|
| User Auth | Active | 80% | Login done, registration pending |
| API Performance | At Risk | 30% | Response times above target |

## Blockers

1. **[Blocker title]** — [Impact]. [Resolution plan].

## Completed Since Last Report

- [Task/deliverable 1]
- [Task/deliverable 2]

## Next Steps

1. [Priority action 1]
2. [Priority action 2]
3. [Priority action 3]
```

### Blocker Report

```markdown
## Blocker Report — [Date]

### Critical Blockers

1. **[Title]**
   - Impact: [X tasks blocked, Y goals affected]
   - Root cause: [Description]
   - Resolution: [Plan]
   - ETA: [Estimate]

### At-Risk Goals

1. **[Goal title]** — [Risk reason]
   - Mitigation: [Plan]

### Resolved Since Last Check

- [Blocker that was resolved]
```

## Escalation Procedures

### When to Escalate

Escalate to the user when:
- A goal has been blocked for more than one session with no resolution path
- The failure rate exceeds 30% and auto-triage isn't resolving issues
- A fundamental assumption about the project has proven wrong
- Scope decisions need stakeholder input

### How to Escalate

1. **State the issue clearly** — What's wrong, in one sentence
2. **Provide context** — What you've tried, what the data shows
3. **Recommend options** — 2-3 possible paths forward with trade-offs
4. **Ask for direction** — Let the user decide

### Post-Escalation

After the user decides:
1. Update goal statuses to reflect the decision
2. Modify the plan if scope or priority changed
3. Document the decision in `.crew/docs/decisions.md`
4. Resume execution with the new direction
