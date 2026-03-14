# Visual Guide: Epic-Based Prompt Structure

## Directory Tree

```
apps/ai-tool_nextjstemplates_com/.crew/setup/plan/
│
├── epics/                    # ← NEW: Epic-based organization
│   │
│   ├── README.md                  # Overview and usage guide
│   │
│   ├── 1-bootstrap/               # ← First epic (setup)
│   │   ├── README.md              # Bootstrap documentation
│   │   └── prompts/
│   │       ├── install-dependencies.md
│   │       └── fix-transpile-error.md
│   │
│   ├── 2-page/                    # ← Second epic (per-page, ×N)
│   │   ├── README.md              # Page pipeline documentation
│   │   └── prompts/
│   │       ├── analyze-page.md
│   │       ├── plan-components.md
│   │       ├── component-split-task.md
│   │       ├── analyze-animations.md
│   │       └── implement-animations.md
│   │
│   └── 3-integration/             # ← Third epic (validation)
│       ├── README.md              # Integration documentation
│       └── prompts/               # (empty - uses executors)
│
├── executors/                     # Shared task executors
│   ├── verify-components.js
│   └── verify-page.js
│
├── index.js                       # Plan entry point
├── bootstrap.js                   # Bootstrap epic definition
├── pages.js                       # Page epic definition
├── integration.js                 # Integration epic definition
└── utils.js                       # Shared utilities
```

## Prompt Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    EPIC EXECUTION                       │
└─────────────────────────────────────────────────────────────┘

1️⃣  BOOTSTRAP
    ┌─────────────────────────────────┐
    │ install                         │
    │ ← install-dependencies.md       │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ fix:{file} (×N dynamic)         │
    │ ← fix-transpile-error.md        │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ verify-bootstrap                │
    │ (executor function)             │
    └─────────────────────────────────┘

2️⃣  PAGE (×N instances, one per page)
    ┌─────────────────────────────────┐
    │ {slug}:analyze                  │
    │ ← analyze-page.md               │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ {slug}:plan-components          │
    │ ← plan-components.md            │
    │   (creates N dynamic tasks)     │
    └────────────┬────────────────────┘
                 │
                 ├──→ Split Hero ← component-split-task.md
                 ├──→ Split Features ← component-split-task.md
                 └──→ Split Testimonials ← component-split-task.md
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ {slug}:build-components         │
    │ ← verify-components.js          │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ {slug}:analyze-animations       │
    │ ← analyze-animations.md         │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ {slug}:implement-animations     │
    │ ← implement-animations.md       │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ {slug}:verify                   │
    │ ← verify-page.js                │
    └─────────────────────────────────┘

3️⃣  INTEGRATION
    ┌─────────────────────────────────┐
    │ cross-page-consistency          │
    │ (executor function)             │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ navigation-test                 │
    │ (executor function)             │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ performance-check               │
    │ (executor function)             │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │ final-build                     │
    │ (executor function)             │
    └─────────────────────────────────┘
```

## Prompt Template References

### In bootstrap.js
```javascript
.promptFrom('./epics/1-bootstrap/prompts/install-dependencies.md')
.promptFrom('./epics/1-bootstrap/prompts/fix-transpile-error.md', {...})
```

### In pages.js
```javascript
.promptFrom('./epics/2-page/prompts/analyze-page.md', {...})
.promptFrom('./epics/2-page/prompts/plan-components.md', {...})
.promptFrom('./epics/2-page/prompts/analyze-animations.md', {...})
.promptFrom('./epics/2-page/prompts/implement-animations.md', {...})
```

### Dynamic (created by plan-components task)
```javascript
// Referenced in plan-components.md template
--prompt-from "./epics/2-page/prompts/component-split-task.md"
```

## Variable Interpolation

```
┌──────────────────────────┐
│ Template File            │
│ analyze-page.md          │
│                          │
│ {{route}}                │
│ {{slug}}                 │
│ {{htmlFile}}             │
└──────────────────────────┘
           ↓
    loadPromptTemplate()
    + vars object
           ↓
┌──────────────────────────┐
│ Resolved Prompt          │
│                          │
│ /pricing                 │
│ pricing                  │
│ templates/pricing.html   │
└──────────────────────────┘
           ↓
    Stored in .crew/epics/README.md
           ↓
┌──────────────────────────┐
│ AI Agent Execution       │
└──────────────────────────┘
```

## File Ownership Matrix

| File | Epic | Purpose | Type |
|------|-----------|---------|------|
| install-dependencies.md | 1-bootstrap | Install deps | Prompt |
| fix-transpile-error.md | 1-bootstrap | Fix errors | Prompt |
| analyze-page.md | 2-page | Analyze structure | Prompt |
| plan-components.md | 2-page | Create tasks | Prompt |
| component-split-task.md | 2-page | Extract component | Prompt |
| analyze-animations.md | 2-page | Document motion | Prompt |
| implement-animations.md | 2-page | Implement motion | Prompt |
| verify-components.js | 2-page | Verify extraction | Executor |
| verify-page.js | 2-page | Final verification | Executor |

## Navigation Guide

### Finding Prompts by Purpose

**Want to modify installation logic?**
```bash
→ epics/1-bootstrap/prompts/install-dependencies.md
```

**Want to change component analysis?**
```bash
→ epics/2-page/prompts/analyze-page.md
```

**Want to understand page pipeline?**
```bash
→ epics/2-page/README.md
```

**Want to see all prompts for a epic?**
```bash
→ ls epics/2-page/prompts/
```

### Adding a New Prompt

**Step 1:** Create template file
```bash
touch epics/2-page/prompts/my-new-task.md
```

**Step 2:** Write prompt with variables
```markdown
# My New Task

## Purpose
Do something with {{inputFile}}

## Input
- {{inputFile}}

## Output
- {{outputFile}}
```

**Step 3:** Reference in plan file
```javascript
.promptFrom('./epics/2-page/prompts/my-new-task.md', {
  inputFile: 'src/input.tsx',
  outputFile: 'docs/output.md',
})
```

**Step 4:** Update epic README
Add documentation for new prompt and its variables.

## Color-Coded Responsibility

```
📁 epics/
  │
  ├─ 1-bootstrap/            🔴 Setup Phase
  │  └─ prompts/
  │     ├─ install-dependencies.md     [repo setup]
  │     └─ fix-transpile-error.md      [error recovery]
  │
  ├─ 2-page/                 🔵 Build Phase (×N)
  │  └─ prompts/
  │     ├─ analyze-page.md             [structure]
  │     ├─ plan-components.md          [structure]
  │     ├─ component-split-task.md     [structure]
  │     ├─ analyze-animations.md       [motion]
  │     └─ implement-animations.md     [motion]
  │
  └─ 3-integration/          🟢 Validation Phase
     └─ prompts/                       [no AI prompts]
```

## Quick Reference

| Epic | # Prompts | # Executors | AI Tasks | Custom Tasks |
|-----------|-----------|-------------|----------|--------------|
| 1-bootstrap | 2 | 0 | 2 + N dynamic | 1 verify |
| 2-page | 5 | 2 | 5 + N dynamic | 1 verify |
| 3-integration | 0 | 0 | 0 | 4 verify |
| **TOTAL** | **7** | **2** | **7+** | **6** |

## Legend

- 📁 Directory
- 📄 Regular file
- ✏️ Prompt template (AI agent input)
- ⚙️ Executor (Custom JavaScript)
- 🔴 Setup/Bootstrap
- 🔵 Build/Reconstruction
- 🟢 Validation/Integration
- ×N Dynamic (created at runtime)
