# Extending Task Tools

**Add custom tools to the TaskContext for specialized functionality.**

[[docs](../README.md) > [advanced](./README.md) > extending-tools]

---

## Overview

Extend TaskContext with custom tools.

---

## Creating Custom Tools

### File Tools Extension

```typescript
interface CustomFileTools {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;

  // Custom extensions
  toml: {
    read(path: string): Promise<Record<string, any>>;
    write(path: string, data: Record<string, any>): Promise<void>;
  };
}
```

### Shell Tools Extension

```typescript
interface CustomShellTools {
  run(cmd: string): Promise<string>;

  // Custom extensions
  docker: {
    build(tag: string): Promise<string>;
    push(tag: string): Promise<string>;
  };
}
```

---

## Implementation

```typescript
export function extendTools(ctx: TaskContext) {
  ctx.tools.custom = {
    db: {
      async migrate() {
        return ctx.tools.shell.run('npm run migrate');
      }
    },
    api: {
      async validate() {
        const result = await ctx.tools.shell.run('npm run validate:api');
        return JSON.parse(result);
      }
    }
  };
}
```

---

## See Also

- [Custom Executors](./custom-executors.md) - Task execution

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
