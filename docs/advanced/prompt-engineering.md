# Effective Prompt Engineering

**Write powerful task prompts that guide AI agents to produce high-quality results.**

[[docs](../README.md) > [advanced](./README.md) > prompt-engineering]

---

## Overview

Effective prompts produce better agent results.

---

## Prompt Structure

### Clear Task Definition

```typescript
.prompt('Create a REST API with authentication')
```

### Context and Constraints

```typescript
.prompt(`Create a REST API for user management.

Requirements:
- Use Express.js
- Add JWT authentication
- Validate all inputs
- Return proper HTTP status codes
- Include error handling

Follow REST conventions and our coding standards.`)
```

### Examples and Format

```typescript
.prompt(`Create a TypeScript file that exports a function named generateToken.

Example output:
export function generateToken(userId: string): string {
  // Implementation
  return token;
}

Include:
- Type safety
- Error handling
- Comments`)
```

---

## Best Practices

### 1. Be Specific

```typescript
// Good
.prompt('Create REST API endpoints for /users with GET, POST, PUT, DELETE')

// Bad
.prompt('Build API')
```

### 2. Include Examples

```typescript
.prompt(`Create TypeScript interfaces for User and Post.

Example:
interface User {
  id: string;
  email: string;
  name: string;
}`)
```

### 3. State Constraints

```typescript
.prompt(`Implement authentication. Must:
- Use JWT tokens
- Handle refresh tokens
- Be compatible with our middleware`)
```

---

## See Also

- [Multi-Agent Workflows](../guides/multi-agent-workflows.md) - Agent communication

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
