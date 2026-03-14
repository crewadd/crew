# Incremental Planning (Yields)

Dynamic, elastic task planning where each task can spawn follow-up tasks based on its output.

## Core Principle: Atomic / Transferable / Verifiable

Every yielded task MUST be:

| Principle | Rule | Bad | Good |
|-----------|------|-----|------|
| **Atomic** | One deliverable per task | "Implement all animations" | "Implement GSAP scroll-pinned hero" |
| **Transferable** | Self-contained with all context in inputs + prompt | "Fix the issues from before" | "Fix GSAP import in src/app/page.tsx per docs/animations.md section 1" |
| **Verifiable** | Explicit output files + check criteria | "Update the page" | outputs: `src/animations/gsap.tsx`, check: `build` |

The framework validates every yielded task and logs warnings for violations.

## Problem

Static plans require all tasks to be defined upfront. But in practice, many tasks produce output that determines what needs to happen next:

```
analyze-animations → animations.md → ??? (depends on what's in the doc)
```

The `analyze-animations` task might discover 5 animation groups or 50. The follow-up tasks should match the actual output, not a guess made at plan time.

## Solution: `yields`

A task with `yields` dynamically generates follow-up tasks after it completes successfully. The orchestrator injects these tasks into the plan and executes them.

```
Task completes → yields resolves → orchestrator injects → execution continues
```

## Syntax

### 1. AI-Driven Planning (Shorthand)

The simplest form — pass a prompt string. An AI agent reads the task's output and generates follow-up tasks:

```ts
ctx.createTask('analyze-animations', 'Analyze animations for Homepage')
  .skill('animation-reconstruct')
  .inputs(['templates/_analysis/pages/homepage/animations/'])
  .outputs(['docs/pages/homepage/animations.md'])
  .yields('Create one implementation task per animation group found in the spec')
```

### 2. AI-Driven Planning (Full Config)

More control over the AI planning:

```ts
ctx.createTask('analyze-animations', 'Analyze animations for Homepage')
  .outputs(['docs/pages/homepage/animations.md'])
  .yields({
    plan: 'Based on the animation spec, create implementation tasks grouped by engine (GSAP, CSS keyframes, scroll-reveal, transitions)',
    skill: 'planner',           // which AI skill to use for planning
    target: 'next-epic',        // create a new epic for the follow-up tasks
    approval: 'review',         // require human review before executing
    maxTasks: 10,               // safety limit
  })
```

### 3. Programmatic Yields

Full control — a function that reads the output and returns task definitions:

```ts
ctx.createTask('analyze-animations', 'Analyze animations for Homepage')
  .outputs(['docs/pages/homepage/animations.md'])
  .yields(async (ctx, result) => {
    const doc = await ctx.tools.file.read('docs/pages/homepage/animations.md');
    const groups = parseAnimationGroups(doc);

    return groups.map(group =>
      ({
        id: `impl-${group.id}`,
        title: `Implement ${group.name} animations`,
        skill: 'animation-implement',
        inputs: ['docs/pages/homepage/animations.md'],
        outputs: [`src/app/_components/animations/${group.id}.tsx`],
        prompt: `Implement the ${group.name} animation group as described in the spec.`,
      })
    );
  })
```

### 4. Static Template Yields

Spawn predefined tasks with parent variables:

```ts
ctx.createTask('analyze-page', 'Analyze page structure')
  .outputs(['docs/pages/{{slug}}/structure.md'])
  .yields({
    tasks: [
      {
        id: 'implement-layout',
        title: 'Implement page layout',
        skill: 'page-build',
        inputs: ['docs/pages/{{slug}}/structure.md'],
      },
      {
        id: 'implement-interactions',
        title: 'Implement page interactions',
        skill: 'interaction-impl',
        inputs: ['docs/pages/{{slug}}/structure.md'],
        deps: ['implement-layout'],
      },
    ],
    target: 'current-epic',
  })
```

### 5. Conditional Yields

Only spawn tasks if a condition is met:

```ts
ctx.createTask('analyze-animations', 'Analyze animations')
  .outputs(['docs/pages/homepage/animations.md'])
  .yields({
    plan: 'Create implementation tasks for each animation group',
    when: (result) => {
      // Only yield if the analysis found animations
      return result.success && !result.output?.includes('No animations detected');
    },
  })
```

### 6. Yields with Planning Integration

Combine yields with the plan-then-execute pattern:

```ts
ctx.createTask('analyze-page', 'Analyze page')
  .planning()  // plan the analysis first
  .outputs(['docs/pages/homepage/analysis.md'])
  .yields({
    plan: 'Based on the analysis, create build tasks',
    target: 'next-epic',
  })
```

## Checks & Type Inheritance

Ensure all yielded tasks are verifiable by inheriting checks:

```ts
.yields({
  plan: 'Create implementation tasks for each animation group',
  taskType: 'coding',         // all yielded tasks inherit 'coding' type (with tsc check)
  checks: ['build'],          // all yielded tasks must pass build
})
```

| Field | Effect |
|-------|--------|
| `taskType` | Sets `.type` on all yielded tasks (inherits type's default checks, skill, hooks) |
| `checks` | Merged into every yielded task's checks (in addition to per-task checks from AI) |

The AI planner also generates a `<check>` tag per task (e.g., `build`, `tsc`, `file-exists`).

## Target Modes

Where yielded tasks are injected:

| Target | Behavior |
|--------|----------|
| `'current-epic'` (default) | Appended to the current epic, executed immediately |
| `'next-epic'` | Creates a new epic after the current one |
| `{ epic: 'name' }` | Appended to a named epic (matched by title) |

## Approval Modes

| Mode | Behavior |
|------|----------|
| `'auto'` (default) | Tasks are immediately added and executed |
| `'review'` | Tasks saved to `yields.md`, execution paused for human review |

## How It Works

### Execution Flow

```
1. Task executes normally (all hooks, checks, etc.)
2. If task succeeds AND has yields config:
   a. Programmatic: call the function with (ctx, result)
   b. AI-driven: send planning prompt to agent, parse XML response
   c. Static: expand templates with parent vars
3. Save yields plan to {taskDir}/yields.md for auditability
4. Return SpawnedTask[] in TaskResult.spawnedTasks
5. Orchestrator detects spawnedTasks in task:done event
6. Orchestrator injects tasks via addTask() to target epic
7. If target is current-epic: execute new tasks immediately
8. If target is next-epic: project orchestrator picks them up next iteration
```

### AI Response Format

When using AI-driven yields, the agent produces structured XML:

```xml
<yielded-tasks>
  <task>
    <id>impl-gsap</id>
    <title>Implement GSAP scroll animations</title>
    <skill>animation-implement</skill>
    <inputs>docs/pages/homepage/animations.md</inputs>
    <outputs>src/app/_components/animations/gsap.tsx</outputs>
    <prompt>
      Implement the GSAP ScrollTrigger animations as specified in the animation doc.
      Focus on the scroll-pinned hero scene with 8 animated elements.
    </prompt>
  </task>
  <task>
    <id>impl-css-keyframes</id>
    <title>Implement CSS keyframe animations</title>
    ...
  </task>
</yielded-tasks>
```

### Orchestrator Events

The orchestrator emits a new event when tasks are yielded:

```ts
{ type: 'task:yielded', taskId: string, spawnedTasks: SpawnedTask[], epicId: number }
```

## Real-World Example

The steep_app homepage pipeline becomes elastic:

```ts
// Before: Static 3-task pipeline
// analyze-animations finishes → nothing happens next

// After: Dynamic pipeline with yields
m.addTask(
  ctx
    .createTask(`${slug}:analyze-animations`, `Analyze animations for ${displayName}`)
    .skill('animation-reconstruct')
    .deps([`${slug}:react-prune`])
    .inputs([`templates/_analysis/pages/${slug}/animations/`])
    .outputs([`docs/pages/${slug}/animations.md`])
    .promptFrom('./prompts/analyze-animations.md', { route, slug })
    // NEW: after analysis, dynamically create implementation tasks
    .yields({
      plan: `Based on the animation spec at docs/pages/${slug}/animations.md,
             create one implementation task per animation engine/group.
             Each task implements ONE engine (not multiple).
             Each task must reference the spec file as input.
             Each task must declare its output .tsx file.`,
      taskType: 'coding',          // all yielded tasks inherit coding type + tsc check
      checks: ['build'],           // all yielded tasks must pass build
      target: 'current-epic',
    })
);
```

After `analyze-animations` completes and produces `animations.md`, the AI reads it and spawns atomic tasks:

```
Task: Implement GSAP scroll-pinned hero animation
  inputs: docs/pages/homepage/animations.md
  outputs: src/app/_components/animations/gsap-hero.tsx
  check: build, tsc

Task: Add CSS keyframe animation: carousel-scroll
  inputs: docs/pages/homepage/animations.md
  outputs: src/app/_components/animations/carousel.tsx
  check: build, tsc

Task: Create scroll-reveal component for heading reveals
  inputs: docs/pages/homepage/animations.md
  outputs: src/app/_components/animations/scroll-reveal.tsx
  check: build, tsc
```

Each task is atomic (one animation engine), transferable (self-contained prompt + inputs), and verifiable (output file + build check).

## Safety & Validation

- **Validation**: Every yielded task is checked for atomic/transferable/verifiable compliance
- **Max tasks**: Default limit of 20 per parent (configurable via `maxTasks`)
- **Auditability**: All yields saved to `{taskDir}/yields.md` with validation markers
- **Non-fatal**: If yields fail, the parent task still succeeds
- **Approval mode**: Use `approval: 'review'` for human-in-the-loop control
- **Conditions**: Use `when` to gate yields on result properties
- **Inherited checks**: Use `checks` and `taskType` to ensure all spawned tasks are verifiable
