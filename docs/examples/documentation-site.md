# documentation-site Example

**Complete example: documentation-site**

[[docs](../README.md) > [examples](./README.md) > documentation-site]

---

## Overview

This example demonstrates a complete documentation-site project using Crew.

---

## Project Setup

```bash
crew init
```

---

## Plan Definition

Create a plan in `.crew/setup/planning/index.ts`:

```typescript
export async function createPlan(ctx) {
  const plan = ctx.createPlan('documentation-site');
  
  plan.addEpic(
    ctx.createEpic('setup', 'Setup')
      .addTask(ctx.createTask('init', 'Initialize').prompt('...'))
  );

  return plan.build();
}
```

---

## Execution

```bash
npx crew plan init
npx crew run
```

---

## See Also

- [Quick Start](../getting-started/quick-start.md) - Getting started
- [Examples](./README.md) - All examples

---

[← Back to Examples](./README.md) | [Documentation Home](../README.md)
