# Component Library / Package

Reference template for building reusable component libraries, design systems, or npm packages with documentation, testing, and publishing pipelines.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | React, Vue, Svelte, Web Components |
| Build | tsup, unbuild, Vite library mode, Rollup |
| Styling | Tailwind CSS, CSS Modules, vanilla-extract, Stitches |
| Docs | Storybook, Ladle, Histoire |
| Testing | vitest, Testing Library, Playwright (visual) |
| Linting | ESLint, Prettier, Stylelint |
| Publishing | npm, JSR, changesets |
| Monorepo | turborepo, pnpm workspaces |

## Standard Epic Progression

```
1. Setup & Build Pipeline   — Package scaffold, TypeScript, build config, exports
2. Design Tokens            — Colors, spacing, typography, breakpoints
3. Primitive Components     — Button, Input, Badge, Icon, Spinner
4. Composite Components     — Dialog, Dropdown, Combobox, Tabs, Toast
5. Layout Components        — Stack, Grid, Container, Sidebar
6. Form Components          — Form, Field, Select, Checkbox, Radio, DatePicker
7. Documentation            — Storybook setup, component stories, usage guides
8. Testing                  — Unit tests, accessibility tests, visual regression
9. Publishing               — Changesets, CI, npm publish, versioning
```

## Epic Patterns

### Setup & Build Pipeline

```typescript
const setup = ctx.createEpic('setup', 'Setup & Build Pipeline');

setup.addTask(ctx.createTask('setup:scaffold', 'Package Scaffold')
  .type('coding')
  .outputs(['package.json', 'tsconfig.json', 'tsup.config.ts'])
  .promptFrom('./prompts/lib-scaffold.md')
  .check('tsc'));

setup.addTask(ctx.createTask('setup:exports', 'Package Exports')
  .type('coding')
  .deps(['setup:scaffold'])
  .outputs(['src/index.ts'])
  .promptFrom('./prompts/lib-exports.md')
  .check('build'));

setup.addTask(ctx.createTask('setup:styles', 'Style System Setup')
  .type('coding')
  .deps(['setup:scaffold'])
  .outputs(['src/styles/index.ts', 'tailwind.config.ts'])
  .promptFrom('./prompts/lib-styles.md')
  .check('tsc'));
```

### Design Tokens

```typescript
const tokens = ctx.createEpic('tokens', 'Design Tokens');

tokens.addTask(ctx.createTask('tokens:colors', 'Color Tokens')
  .type('coding')
  .deps(['setup:styles'])
  .outputs(['src/tokens/colors.ts'])
  .promptFrom('./prompts/lib-colors.md')
  .check('tsc'));

tokens.addTask(ctx.createTask('tokens:spacing', 'Spacing & Typography')
  .type('coding')
  .deps(['setup:styles'])
  .outputs(['src/tokens/spacing.ts', 'src/tokens/typography.ts'])
  .promptFrom('./prompts/lib-spacing.md')
  .check('tsc'));

tokens.addTask(ctx.createTask('tokens:theme', 'Theme Provider')
  .type('coding')
  .deps(['tokens:colors', 'tokens:spacing'])
  .outputs(['src/theme/provider.tsx', 'src/theme/context.ts'])
  .promptFrom('./prompts/lib-theme.md')
  .check('build'));
```

### Component Factory Pattern

```typescript
export function createComponentEpic(
  ctx: CrewContext,
  category: string,
  components: ComponentDef[]
) {
  const epic = ctx.createEpic(`components-${category}`, `${category} Components`);

  for (const comp of components) {
    epic.addTask(ctx.createTask(`${comp.name}:impl`, `${comp.label} Component`)
      .type('coding')
      .deps(['tokens:theme'])
      .outputs([
        `src/components/${comp.name}/${comp.name}.tsx`,
        `src/components/${comp.name}/index.ts`,
      ])
      .promptFrom('./prompts/implement-component.md', { component: comp })
      .check('tsc'));

    epic.addTask(ctx.createTask(`${comp.name}:test`, `${comp.label} Tests`)
      .type('coding')
      .deps([`${comp.name}:impl`])
      .outputs([`src/components/${comp.name}/${comp.name}.test.tsx`])
      .promptFrom('./prompts/test-component.md', { component: comp })
      .check('tsc'));

    epic.addTask(ctx.createTask(`${comp.name}:story`, `${comp.label} Story`)
      .type('coding')
      .deps([`${comp.name}:impl`])
      .outputs([`src/components/${comp.name}/${comp.name}.stories.tsx`])
      .promptFrom('./prompts/story-component.md', { component: comp })
      .check('build'));
  }

  return epic;
}

// Usage
const primitives = [
  { name: 'button', label: 'Button', variants: ['solid', 'outline', 'ghost'] },
  { name: 'input', label: 'Input', variants: ['default', 'error', 'disabled'] },
  { name: 'badge', label: 'Badge', variants: ['default', 'success', 'warning', 'error'] },
];

plan.addEpic(createComponentEpic(ctx, 'primitives', primitives));
```

### Documentation

```typescript
const docs = ctx.createEpic('docs', 'Documentation');

docs.addTask(ctx.createTask('docs:storybook', 'Storybook Setup')
  .type('coding')
  .deps(['setup:scaffold'])
  .outputs(['.storybook/main.ts', '.storybook/preview.tsx'])
  .promptFrom('./prompts/lib-storybook.md')
  .check('build'));

docs.addTask(ctx.createTask('docs:intro', 'Introduction & Getting Started')
  .type('coding')
  .deps(['docs:storybook'])
  .outputs(['src/docs/introduction.mdx', 'src/docs/getting-started.mdx'])
  .promptFrom('./prompts/lib-docs-intro.md'));

docs.addTask(ctx.createTask('docs:guidelines', 'Usage Guidelines')
  .type('coding')
  .deps(['docs:storybook'])
  .outputs(['src/docs/guidelines.mdx'])
  .promptFrom('./prompts/lib-docs-guidelines.md'));
```

### Publishing

```typescript
const publish = ctx.createEpic('publish', 'Publishing Pipeline');

publish.addTask(ctx.createTask('publish:changesets', 'Changesets Setup')
  .type('coding')
  .outputs(['.changeset/config.json'])
  .promptFrom('./prompts/lib-changesets.md')
  .check('tsc'));

publish.addTask(ctx.createTask('publish:ci', 'CI Pipeline')
  .type('coding')
  .deps(['publish:changesets'])
  .outputs(['.github/workflows/release.yml', '.github/workflows/ci.yml'])
  .promptFrom('./prompts/lib-ci.md'));
```

## Dependency Graph

```
setup:scaffold ──→ setup:exports
       │           setup:styles ──→ tokens:colors ──┐
       │                            tokens:spacing ──┼→ tokens:theme
       │                                             │
       │           [component:impl] ←────────────────┘
       │                │
       │                ├→ [component:test]
       │                └→ [component:story]
       │
       └→ docs:storybook ──→ docs:intro
                              docs:guidelines

publish:changesets ──→ publish:ci
```

## Plan Variables

```typescript
plan.vars({
  packageName: '@org/ui',
  framework: 'react',            // 'react' | 'vue' | 'svelte' | 'web-components'
  styling: 'tailwind',           // 'tailwind' | 'css-modules' | 'vanilla-extract'
  build: 'tsup',                 // 'tsup' | 'unbuild' | 'vite'
  docs: 'storybook',             // 'storybook' | 'ladle' | 'histoire'
  testing: 'vitest',
  components: ['button', 'input', 'badge', 'dialog', 'dropdown'],
  hasThemeSupport: true,
  publishTo: 'npm',              // 'npm' | 'jsr' | 'private'
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Design system / tokens | `tokens` epic |
| Core components | `primitives` component epic |
| Complex components | `composite` component epic |
| Layout system | `layout` component epic |
| Form elements | `forms` component epic |
| Documentation / storybook | `docs` epic |
| Accessibility requirements | Test tasks per component |
| Versioning / publishing | `publish` epic |
| Theming / dark mode | `tokens:theme` task |

## Checks Strategy

- `tsc` on all component implementations
- `build` verifies clean library output (ESM + CJS + types)
- Testing Library tests for behavior and accessibility
- Storybook build as a check (ensures all stories render)
- `axe-core` accessibility audit per component
- Bundle size check (size-limit)
