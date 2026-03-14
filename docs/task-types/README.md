# Task Types

**Organize and standardize tasks with custom type definitions.**

Task types allow you to categorize tasks, apply default checks, and create reusable templates for common operations.

## In This Section

### [Defining Task Types](./defining-types.md)
Create custom task types with default checks and templates.

### [Type Hierarchy](./type-hierarchy.md)
Organize types in a hierarchy with inheritance.

---

## Quick Reference

### Using Task Types

```typescript
.addTask('create-component', (task) => task
  .type('react-component')
  .does('Create a Button component')
  // Inherits default checks from react-component type
)
```

### Defining Task Types

```typescript
const project = crew.project('my-app')
  .defineType('react-component', {
    description: 'React component with TypeScript',
    defaultChecks: [
      { name: 'file-exists', config: (task) => `src/components/${task.id}.tsx` },
      { name: 'typescript-valid' },
      { name: 'has-tests' }
    ],
    template: `
      import React from 'react';
      export const {{name}}: React.FC = () => {
        return <div>{{name}}</div>;
      };
    `
  });
```

### Type Hierarchy

```typescript
.defineType('frontend-task', {
  defaultChecks: ['typescript-valid', 'lint']
})
.defineType('react-component', {
  extends: 'frontend-task',
  defaultChecks: ['has-tests'] // Adds to parent checks
})
.defineType('ui-component', {
  extends: 'react-component',
  defaultChecks: ['accessibility-check']
})
```

---

## Why Use Task Types?

### 1. Consistency
Ensure all tasks of a type follow the same quality standards.

### 2. DRY Principle
Define checks once, apply to many tasks.

### 3. Organization
Group related tasks for better project structure.

### 4. Templates
Provide starting points for common task patterns.

### 5. Team Standards
Enforce organizational best practices.

---

## Common Type Patterns

### Component Types

```typescript
.defineType('react-component', {
  defaultChecks: ['typescript-valid', 'has-tests', 'has-storybook']
})
.defineType('vue-component', {
  defaultChecks: ['typescript-valid', 'has-tests']
})
```

### API Types

```typescript
.defineType('api-endpoint', {
  defaultChecks: [
    'typescript-valid',
    'has-tests',
    'openapi-valid',
    'security-check'
  ]
})
```

### Database Types

```typescript
.defineType('migration', {
  defaultChecks: [
    'migration-reversible',
    'no-data-loss',
    'tested-locally'
  ]
})
```

---

## Next Steps

- **Define types**: [Defining Task Types](./defining-types.md)
- **Use hierarchy**: [Type Hierarchy](./type-hierarchy.md)
- **See examples**: [Examples](../examples/README.md)

---

[← Back to Documentation Home](../README.md)
