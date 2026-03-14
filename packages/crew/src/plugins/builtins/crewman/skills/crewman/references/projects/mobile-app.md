# Mobile App (React Native / Expo)

Reference template for building cross-platform mobile applications with React Native or Expo, covering navigation, native modules, offline storage, and app store distribution.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | Expo (managed/bare), React Native CLI |
| Navigation | Expo Router, React Navigation |
| State | Zustand, Jotai, TanStack Query |
| Styling | NativeWind (Tailwind), StyleSheet, Tamagui |
| Storage | AsyncStorage, MMKV, SQLite (expo-sqlite) |
| Auth | Supabase, Firebase Auth, Clerk |
| API | tRPC, REST, GraphQL (urql/Apollo) |
| Push | Expo Notifications, Firebase Cloud Messaging |
| Testing | Jest, Detox (E2E), Maestro |
| Build | EAS Build, Fastlane |

## Standard Epic Progression

```
1. Setup & Config         — Expo init, TypeScript, linting, navigation shell
2. Navigation & Layout    — Tab bar, stack navigators, deep links
3. Auth & Onboarding      — Sign in, sign up, onboarding screens, biometrics
4. Core Screens           — Primary app screens (app-specific)
5. Data Layer             — API client, caching, offline storage
6. Notifications & Comms  — Push notifications, in-app messages, badges
7. Native Features        — Camera, location, haptics, share sheet
8. Settings & Profile     — User preferences, account management
9. Polish                 — Animations, error boundaries, loading skeletons
10. Distribution          — App Store / Play Store submission, OTA updates
```

## Epic Patterns

### Navigation & Layout

```typescript
const nav = ctx.createEpic('navigation', 'Navigation & Layout');

nav.addTask(ctx.createTask('nav:shell', 'App Shell & Tab Layout')
  .type('coding')
  .outputs(['app/_layout.tsx', 'app/(tabs)/_layout.tsx'])
  .promptFrom('./prompts/mobile-shell.md')
  .check('tsc'));

nav.addTask(ctx.createTask('nav:stacks', 'Stack Navigators')
  .type('coding')
  .deps(['nav:shell'])
  .outputs(['app/(tabs)/home/_layout.tsx', 'app/(tabs)/profile/_layout.tsx'])
  .promptFrom('./prompts/mobile-stacks.md')
  .check('tsc'));

nav.addTask(ctx.createTask('nav:deeplinks', 'Deep Linking')
  .type('coding')
  .deps(['nav:shell'])
  .outputs(['app.config.ts'])
  .promptFrom('./prompts/mobile-deeplinks.md')
  .check('tsc'));
```

### Auth & Onboarding

```typescript
const auth = ctx.createEpic('auth', 'Auth & Onboarding');

auth.addTask(ctx.createTask('auth:provider', 'Auth Provider & Context')
  .type('coding')
  .outputs(['src/lib/auth.ts', 'src/providers/auth-provider.tsx'])
  .promptFrom('./prompts/mobile-auth-provider.md')
  .check('tsc'));

auth.addTask(ctx.createTask('auth:screens', 'Auth Screens')
  .type('coding')
  .deps(['auth:provider', 'nav:shell'])
  .outputs(['app/(auth)/login.tsx', 'app/(auth)/register.tsx'])
  .promptFrom('./prompts/mobile-auth-screens.md')
  .check('build'));

auth.addTask(ctx.createTask('auth:onboarding', 'Onboarding Flow')
  .type('coding')
  .deps(['auth:provider', 'nav:shell'])
  .outputs(['app/(onboarding)/_layout.tsx', 'app/(onboarding)/welcome.tsx'])
  .promptFrom('./prompts/mobile-onboarding.md')
  .check('build'));

auth.addTask(ctx.createTask('auth:guard', 'Auth Guard & Redirect')
  .type('coding')
  .deps(['auth:provider', 'nav:shell'])
  .outputs(['src/providers/auth-guard.tsx'])
  .promptFrom('./prompts/mobile-auth-guard.md')
  .check('tsc'));
```

### Data Layer

```typescript
const data = ctx.createEpic('data', 'Data Layer');

data.addTask(ctx.createTask('data:client', 'API Client')
  .type('coding')
  .outputs(['src/lib/api.ts', 'src/lib/types.ts'])
  .promptFrom('./prompts/mobile-api-client.md')
  .check('tsc'));

data.addTask(ctx.createTask('data:queries', 'Query Hooks')
  .type('coding')
  .deps(['data:client'])
  .outputs(['src/hooks/queries/', 'src/providers/query-provider.tsx'])
  .promptFrom('./prompts/mobile-queries.md')
  .check('tsc'));

data.addTask(ctx.createTask('data:offline', 'Offline Storage')
  .type('coding')
  .deps(['data:client'])
  .outputs(['src/lib/storage.ts', 'src/lib/cache.ts'])
  .promptFrom('./prompts/mobile-offline.md')
  .check('tsc'));
```

### Core Screens (Factory)

```typescript
export function createScreenEpic(ctx: CrewContext, screens: ScreenDef[]) {
  const epic = ctx.createEpic('screens', 'Core Screens');

  for (const screen of screens) {
    epic.addTask(ctx.createTask(`screen:${screen.name}`, `${screen.label} Screen`)
      .type('coding')
      .deps(['nav:stacks', 'data:queries'])
      .outputs([`app/(tabs)/${screen.path}.tsx`])
      .promptFrom('./prompts/mobile-screen.md', { screen })
      .check('build'));
  }

  return epic;
}
```

### Notifications

```typescript
const notifications = ctx.createEpic('notifications', 'Notifications');

notifications.addTask(ctx.createTask('notif:setup', 'Push Notification Setup')
  .type('coding')
  .outputs(['src/lib/notifications.ts', 'app.config.ts'])
  .promptFrom('./prompts/mobile-notif-setup.md')
  .check('tsc'));

notifications.addTask(ctx.createTask('notif:handlers', 'Notification Handlers')
  .type('coding')
  .deps(['notif:setup', 'nav:deeplinks'])
  .outputs(['src/lib/notif-handlers.ts'])
  .promptFrom('./prompts/mobile-notif-handlers.md')
  .check('tsc'));
```

## Dependency Graph

```
nav:shell ──→ nav:stacks ──→ [screen implementations]
    │          nav:deeplinks
    │
    ├→ auth:screens
    ├→ auth:onboarding
    └→ auth:guard ←── auth:provider

data:client ──→ data:queries ──→ [screen implementations]
       │
       └→ data:offline

notif:setup ──→ notif:handlers ←── nav:deeplinks
```

## Plan Variables

```typescript
plan.vars({
  framework: 'expo',              // 'expo' | 'react-native-cli'
  expoRouter: true,
  navigation: 'expo-router',      // 'expo-router' | 'react-navigation'
  styling: 'nativewind',          // 'nativewind' | 'stylesheet' | 'tamagui'
  auth: 'supabase',               // 'supabase' | 'firebase' | 'clerk'
  stateManager: 'zustand',
  platforms: ['ios', 'android'],
  features: ['auth', 'push', 'offline', 'camera'],
  minIOSVersion: '15.0',
  minAndroidSDK: 24,
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| App screens / pages | `screens` epic |
| Navigation / tabs / flows | `navigation` epic |
| Login / registration | `auth` epic |
| Onboarding / tutorial | `auth:onboarding` task |
| API integration | `data` epic |
| Offline mode | `data:offline` task |
| Push notifications | `notifications` epic |
| Camera / media | `native` epic |
| Location / maps | `native` epic |
| Settings / preferences | `settings` epic |
| App Store submission | `distribution` epic |

## Checks Strategy

- `tsc` on all library and hook modules
- `build` (Expo export) on screen and layout tasks
- EAS Build for platform-specific validation
- Detox or Maestro for E2E tests
- Accessibility audit with react-native-a11y
