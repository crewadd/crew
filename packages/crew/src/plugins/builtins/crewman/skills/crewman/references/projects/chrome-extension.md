# Chrome Extension

Reference template for building browser extensions with content scripts, background workers, popup UIs, options pages, and cross-context messaging.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Manifest | Manifest V3 |
| Framework | React, Vue, Svelte, Vanilla |
| Build | Vite + CRXJS, Plasmo, WXT, webpack |
| UI | Tailwind CSS, shadcn/ui |
| Storage | chrome.storage.local/sync, IndexedDB |
| Messaging | chrome.runtime, chrome.tabs |
| Testing | vitest, jest, Puppeteer |
| State | Zustand, Jotai, vanilla stores |

## Standard Epic Progression

```
1. Setup & Manifest       — Project scaffold, manifest.json, build config
2. Background Worker      — Service worker, event listeners, alarms
3. Content Scripts         — DOM injection, page interaction, observers
4. Popup UI               — Popup interface, state display, quick actions
5. Options Page           — Settings UI, preference management
6. Messaging & Storage    — Cross-context communication, data persistence
7. Permissions & Security — Permission requests, CSP, input sanitization
8. Polish & Distribution  — Icons, screenshots, Chrome Web Store listing
```

## Epic Patterns

### Setup & Manifest

```typescript
const setup = ctx.createEpic('setup', 'Setup & Manifest');

setup.addTask(ctx.createTask('setup:scaffold', 'Project Scaffold')
  .type('coding')
  .outputs(['package.json', 'tsconfig.json', 'vite.config.ts'])
  .promptFrom('./prompts/ext-scaffold.md')
  .check('tsc'));

setup.addTask(ctx.createTask('setup:manifest', 'Manifest V3')
  .type('coding')
  .deps(['setup:scaffold'])
  .outputs(['manifest.json'])
  .promptFrom('./prompts/ext-manifest.md')
  .check('build'));
```

### Background Worker

```typescript
const background = ctx.createEpic('background', 'Background Worker');

background.addTask(ctx.createTask('bg:worker', 'Service Worker')
  .type('coding')
  .deps(['setup:manifest'])
  .outputs(['src/background/index.ts'])
  .promptFrom('./prompts/ext-background.md')
  .check('tsc'));

background.addTask(ctx.createTask('bg:events', 'Event Handlers')
  .type('coding')
  .deps(['bg:worker'])
  .outputs(['src/background/events.ts'])
  .promptFrom('./prompts/ext-events.md')
  .check('tsc'));

background.addTask(ctx.createTask('bg:alarms', 'Alarms & Scheduling')
  .type('coding')
  .deps(['bg:worker'])
  .outputs(['src/background/alarms.ts'])
  .promptFrom('./prompts/ext-alarms.md')
  .check('tsc'));
```

### Content Scripts

```typescript
const content = ctx.createEpic('content', 'Content Scripts');

content.addTask(ctx.createTask('cs:inject', 'Content Script Entry')
  .type('coding')
  .deps(['setup:manifest'])
  .outputs(['src/content/index.ts'])
  .promptFrom('./prompts/ext-content.md')
  .check('tsc'));

content.addTask(ctx.createTask('cs:dom', 'DOM Manipulation')
  .type('coding')
  .deps(['cs:inject'])
  .outputs(['src/content/dom.ts'])
  .promptFrom('./prompts/ext-dom.md')
  .check('tsc'));

content.addTask(ctx.createTask('cs:overlay', 'UI Overlay')
  .type('coding')
  .deps(['cs:inject'])
  .outputs(['src/content/overlay.tsx', 'src/content/styles.css'])
  .promptFrom('./prompts/ext-overlay.md')
  .check('build'));
```

### Popup UI

```typescript
const popup = ctx.createEpic('popup', 'Popup UI');

popup.addTask(ctx.createTask('popup:layout', 'Popup Layout')
  .type('coding')
  .deps(['setup:manifest'])
  .outputs(['src/popup/index.html', 'src/popup/App.tsx'])
  .promptFrom('./prompts/ext-popup-layout.md')
  .check('build'));

popup.addTask(ctx.createTask('popup:actions', 'Popup Actions')
  .type('coding')
  .deps(['popup:layout', 'bg:worker'])
  .outputs(['src/popup/actions.ts'])
  .promptFrom('./prompts/ext-popup-actions.md')
  .check('tsc'));
```

### Messaging & Storage

```typescript
const messaging = ctx.createEpic('messaging', 'Messaging & Storage');

messaging.addTask(ctx.createTask('msg:protocol', 'Message Protocol')
  .type('coding')
  .outputs(['src/lib/messages.ts', 'src/lib/types.ts'])
  .promptFrom('./prompts/ext-messages.md')
  .check('tsc'));

messaging.addTask(ctx.createTask('msg:bridge', 'Context Bridge')
  .type('coding')
  .deps(['msg:protocol', 'bg:worker', 'cs:inject'])
  .outputs(['src/lib/bridge.ts'])
  .promptFrom('./prompts/ext-bridge.md')
  .check('tsc'));

messaging.addTask(ctx.createTask('msg:storage', 'Storage Layer')
  .type('coding')
  .deps(['msg:protocol'])
  .outputs(['src/lib/storage.ts'])
  .promptFrom('./prompts/ext-storage.md')
  .check('tsc'));
```

## Dependency Graph

```
setup:scaffold ──→ setup:manifest ──→ bg:worker ──→ bg:events
                        │                │          bg:alarms
                        │                │
                        ├→ cs:inject ──→ cs:dom
                        │       │        cs:overlay
                        │       │
                        └→ popup:layout ──→ popup:actions
                                                │
msg:protocol ──→ msg:bridge ←── bg:worker + cs:inject
       │
       └→ msg:storage
```

## Plan Variables

```typescript
plan.vars({
  manifestVersion: 3,
  buildTool: 'vite-crxjs',       // 'vite-crxjs' | 'plasmo' | 'wxt'
  uiFramework: 'react',          // 'react' | 'vue' | 'svelte' | 'vanilla'
  contexts: ['background', 'content', 'popup'],
  permissions: ['activeTab', 'storage', 'alarms'],
  hostPermissions: [],
  hasOptionsPage: true,
  hasSidePanel: false,
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Background processing / automation | `background` epic |
| Page interaction / DOM modification | `content` epic |
| Toolbar popup / quick actions | `popup` epic |
| Settings / preferences | `options` epic |
| Data sync / persistence | `messaging` epic (storage) |
| Cross-tab communication | `messaging` epic (bridge) |
| Permissions / privacy | `permissions` epic |
| Web Store listing | `distribution` epic |

## Checks Strategy

- `tsc` on all TypeScript modules
- `build` produces valid extension bundle (loadable in chrome://extensions)
- Validate manifest.json schema
- Review content script for CSP compliance
- Test message passing between all contexts
