# Epic-Based Prompt Organization - Implementation Summary

## What Changed

Successfully reorganized prompt templates from a flat structure to a epic-based hierarchy with proper separation of concerns.

### Before: Flat Structure
```
.crew/setup/plan/
├── prompts/
│   ├── analyze-page.md
│   ├── plan-components.md
│   ├── component-split-task.md
│   ├── analyze-animations.md
│   └── implement-animations.md
├── bootstrap.js
├── pages.js
└── integration.js
```

**Issues:**
- ❌ All prompts mixed together
- ❌ No clear ownership/context
- ❌ Hard to understand which prompts belong to which epic
- ❌ No documentation of prompt purpose/usage

### After: Epic-Based Structure
```
.crew/setup/plan/
├── epics/
│   ├── README.md
│   ├── 1-bootstrap/
│   │   ├── README.md
│   │   └── prompts/
│   │       ├── install-dependencies.md
│   │       └── fix-transpile-error.md
│   ├── 2-page/
│   │   ├── README.md
│   │   └── prompts/
│   │       ├── analyze-page.md
│   │       ├── plan-components.md
│   │       ├── component-split-task.md
│   │       ├── analyze-animations.md
│   │       └── implement-animations.md
│   └── 3-integration/
│       ├── README.md
│       └── prompts/ (empty)
├── executors/ (shared)
├── bootstrap.js
├── pages.js
└── integration.js
```

**Benefits:**
- ✅ Clear epic ownership
- ✅ Numbered for execution order (1, 2, 3)
- ✅ Each epic self-documented with README
- ✅ Easy to find prompts by epic type
- ✅ Scalable for future epics

## Files Created

### Bootstrap Epic (2 prompts)
1. **epics/1-bootstrap/prompts/install-dependencies.md**
   - Simple install prompt
   - No variables

2. **epics/1-bootstrap/prompts/fix-transpile-error.md**
   - Dynamic error fixing
   - Variables: `file`, `errorMessage`

### Page Epic (5 prompts - moved from prompts/)
1. **epics/2-page/prompts/analyze-page.md**
   - Variables: `route`, `slug`, `htmlFile`

2. **epics/2-page/prompts/plan-components.md**
   - Variables: `route`, `slug`, `generatedFile`

3. **epics/2-page/prompts/component-split-task.md**
   - Variables: `ComponentName`, `route`, `slug`, `generatedFile`

4. **epics/2-page/prompts/analyze-animations.md**
   - Variables: `route`, `slug`

5. **epics/2-page/prompts/implement-animations.md**
   - Variables: `route`, `slug`, `generatedFile`

### Integration Epic (0 prompts)
- Uses custom execute() functions
- No AI prompts needed

### Documentation (4 READMEs)
1. **epics/README.md** - Overview of structure
2. **epics/1-bootstrap/README.md** - Bootstrap docs
3. **epics/2-page/README.md** - Page pipeline docs
4. **epics/3-integration/README.md** - Integration docs

## Files Modified

### bootstrap.js
```javascript
// Before
.prompt("Install all dependencies from package.json using pnpm")

// After
.promptFrom('./epics/1-bootstrap/prompts/install-dependencies.md')
```

```javascript
// Before
.prompt(`Fix transpile error in ${error.file}:

Error: ${error.message}

Refer to templates/ for the correct structure.`)

// After
.promptFrom('./epics/1-bootstrap/prompts/fix-transpile-error.md', {
  file: error.file,
  errorMessage: error.message,
})
```

### pages.js
All 4 promptFrom() calls updated:
```javascript
// Before
.promptFrom('./prompts/analyze-page.md', { ... })

// After
.promptFrom('./epics/2-page/prompts/analyze-page.md', { ... })
```

### plan-components.md template
Updated reference to component-split-task.md:
```bash
# Before
--prompt-from "./prompts/component-split-task.md"

# After
--prompt-from "./epics/2-page/prompts/component-split-task.md"
```

## Structure Benefits

### 1. Clear Execution Order
```
1-bootstrap  → Setup and fixes
2-page       → Per-page reconstruction (×N)
3-integration → Final validation
```

### 2. Self-Documenting
Each epic folder contains:
- **prompts/** - Templates for AI agents
- **README.md** - Documentation of:
  - Purpose
  - Task list
  - Prompt variables
  - Dependencies
  - Executors

### 3. Easy Navigation
```bash
# Want bootstrap prompts?
cd epics/1-bootstrap/prompts/

# Want page prompts?
cd epics/2-page/prompts/

# Want to understand what a epic does?
cat epics/2-page/README.md
```

### 4. Separation of Concerns

| Concern | Location |
|---------|----------|
| Epic prompts | `epics/{N}-{name}/prompts/` |
| Epic docs | `epics/{N}-{name}/README.md` |
| Shared executors | `executors/` |
| Plan definitions | Root plan files (bootstrap.js, pages.js, etc) |

## Verification

### Test Results
```bash
cd packages/crew
node tests/epic-prompts-test.js
```

**Output:**
```
✅ Bootstrap epic: 2/2 prompts working
✅ Page epic: 5/5 prompts working
✅ Integration epic: 0/0 prompts (uses executors)

✅ All epic-based prompts verified!
```

### File Count
- **Total prompts:** 7 (2 bootstrap + 5 page)
- **Total READMEs:** 4 (1 main + 3 epic)
- **Total test files:** 2 (original + epic tests)

## Migration Checklist

If you need to add a new epic in the future:

1. ✅ Create numbered folder: `epics/N-epic-name/`
2. ✅ Create prompts subfolder: `epics/N-epic-name/prompts/`
3. ✅ Add prompt templates with `{{variables}}`
4. ✅ Create README.md documenting:
   - Purpose
   - Tasks
   - Prompt variables
   - Dependencies
5. ✅ Create plan file: `epic-name.js`
6. ✅ Use `promptFrom('./epics/N-epic-name/prompts/template.md', vars)`
7. ✅ Add to main plan in `index.js`
8. ✅ Add test cases to `epic-prompts-test.js`

## Backward Compatibility

The old `prompts/` folder can be safely deleted once verified:
```bash
# Backup first
mv prompts prompts.backup

# Test everything works
pnpm crew init

# If successful, delete backup
rm -rf prompts.backup
```

All code now references `./epics/{N}-{name}/prompts/` paths.

## Key Design Decisions

### ✅ Numbered Prefixes (1-, 2-, 3-)
**Rationale:**
- Makes execution order explicit
- Folders sort naturally in file browsers
- Easy to insert new epics (e.g., 1.5-validate)

### ✅ README per Epic
**Rationale:**
- Self-documenting structure
- New contributors can understand purpose immediately
- Documents variables and dependencies

### ✅ Shared Executors Folder
**Rationale:**
- Executors may be reused across epics
- Don't duplicate code
- Central location for complex task logic

### ✅ Empty prompts/ for Integration
**Rationale:**
- Maintains consistent structure
- Shows intentional "no prompts" decision
- Leaves room for future prompts if needed

## Future Enhancements

Potential improvements (not implemented):

1. **Epic Templates** - Scaffold new epics with CLI
2. **Shared Prompt Fragments** - Reusable sections across prompts
3. **Validation Script** - Verify all promptFrom() paths exist
4. **Auto-generate README** - From plan file metadata
5. **Prompt Versioning** - Track prompt changes over time

## Success Metrics

✅ **Organization:** Clear epic-based hierarchy
✅ **Documentation:** 4 READMEs documenting structure
✅ **Testing:** All prompts verified with automated tests
✅ **Code Quality:** All references updated, no broken paths
✅ **Maintainability:** Easy to add new epics
✅ **Separation of Concerns:** Prompts organized by purpose

## Summary

Successfully reorganized prompts into a epic-based structure with:
- **3 epic folders** with numbered prefixes
- **7 prompt templates** organized by purpose
- **4 README files** documenting usage
- **2 plan files** updated (bootstrap.js, pages.js)
- **1 template file** updated (plan-components.md)

All tests passing ✅
