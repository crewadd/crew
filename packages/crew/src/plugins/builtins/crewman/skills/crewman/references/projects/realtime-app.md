# Real-Time Application

Reference template for building applications with live data, WebSocket connections, presence indicators, collaborative editing, or streaming dashboards.

## Typical Tech Stack

| Layer | Common Choices |
|-------|---------------|
| Framework | Next.js, Remix, SvelteKit |
| Real-time Transport | WebSocket, SSE, Socket.IO, Pusher, Ably |
| Sync Engine | Liveblocks, PartyKit, Y.js, Automerge |
| Database | PostgreSQL + listen/notify, Redis Pub/Sub, Supabase Realtime |
| State | Zustand, Jotai, XState |
| Queue / Workers | BullMQ, Inngest, Trigger.dev |
| UI | React, Tailwind CSS, Framer Motion |
| Testing | vitest, msw (mock WebSocket), Playwright |

## Standard Epic Progression

```
1. Setup & Infrastructure  — Project init, WebSocket server, connection management
2. Transport Layer         — Connection, reconnection, heartbeat, message protocol
3. State Synchronization   — Client-server sync, optimistic updates, conflict resolution
4. Core Real-time Features — App-specific live functionality
5. Presence & Awareness    — Online indicators, cursors, typing indicators
6. Offline & Recovery      — Queue, retry, reconciliation on reconnect
7. Scaling                 — Pub/Sub, horizontal scaling, connection limits
8. Quality & Testing       — Load testing, edge case handling, E2E
```

## Epic Patterns

### Transport Layer

```typescript
const transport = ctx.createEpic('transport', 'Transport Layer');

transport.addTask(ctx.createTask('ws:server', 'WebSocket Server')
  .type('coding')
  .outputs(['src/server/ws.ts', 'src/server/index.ts'])
  .promptFrom('./prompts/ws-server.md')
  .check('tsc'));

transport.addTask(ctx.createTask('ws:client', 'WebSocket Client')
  .type('coding')
  .deps(['ws:server'])
  .outputs(['src/lib/ws-client.ts', 'src/hooks/use-socket.ts'])
  .promptFrom('./prompts/ws-client.md')
  .check('tsc'));

transport.addTask(ctx.createTask('ws:protocol', 'Message Protocol')
  .type('coding')
  .outputs(['src/lib/protocol.ts', 'src/lib/types.ts'])
  .promptFrom('./prompts/ws-protocol.md')
  .check('tsc'));

transport.addTask(ctx.createTask('ws:reconnect', 'Reconnection Logic')
  .type('coding')
  .deps(['ws:client'])
  .outputs(['src/lib/reconnect.ts'])
  .promptFrom('./prompts/ws-reconnect.md')
  .check('tsc'));
```

### State Synchronization

```typescript
const sync = ctx.createEpic('sync', 'State Synchronization');

sync.addTask(ctx.createTask('sync:store', 'Synchronized Store')
  .type('coding')
  .deps(['ws:client', 'ws:protocol'])
  .outputs(['src/lib/sync-store.ts'])
  .promptFrom('./prompts/sync-store.md')
  .check('tsc'));

sync.addTask(ctx.createTask('sync:optimistic', 'Optimistic Updates')
  .type('coding')
  .deps(['sync:store'])
  .outputs(['src/lib/optimistic.ts'])
  .promptFrom('./prompts/sync-optimistic.md')
  .check('tsc'));

sync.addTask(ctx.createTask('sync:conflict', 'Conflict Resolution')
  .type('coding')
  .deps(['sync:store'])
  .outputs(['src/lib/conflict.ts'])
  .promptFrom('./prompts/sync-conflict.md')
  .check('tsc'));
```

### Presence & Awareness

```typescript
const presence = ctx.createEpic('presence', 'Presence & Awareness');

presence.addTask(ctx.createTask('presence:tracker', 'Presence Tracker')
  .type('coding')
  .deps(['ws:client', 'ws:protocol'])
  .outputs(['src/lib/presence.ts', 'src/hooks/use-presence.ts'])
  .promptFrom('./prompts/presence-tracker.md')
  .check('tsc'));

presence.addTask(ctx.createTask('presence:cursors', 'Live Cursors')
  .type('coding')
  .deps(['presence:tracker'])
  .outputs(['src/components/cursors.tsx'])
  .promptFrom('./prompts/presence-cursors.md')
  .check('build'));

presence.addTask(ctx.createTask('presence:indicators', 'Online Indicators')
  .type('coding')
  .deps(['presence:tracker'])
  .outputs(['src/components/online-badge.tsx', 'src/components/user-list.tsx'])
  .promptFrom('./prompts/presence-indicators.md')
  .check('build'));
```

### Offline & Recovery

```typescript
const offline = ctx.createEpic('offline', 'Offline & Recovery');

offline.addTask(ctx.createTask('offline:queue', 'Offline Message Queue')
  .type('coding')
  .deps(['ws:client', 'ws:protocol'])
  .outputs(['src/lib/offline-queue.ts'])
  .promptFrom('./prompts/offline-queue.md')
  .check('tsc'));

offline.addTask(ctx.createTask('offline:reconcile', 'State Reconciliation')
  .type('coding')
  .deps(['offline:queue', 'sync:store'])
  .outputs(['src/lib/reconcile.ts'])
  .promptFrom('./prompts/offline-reconcile.md')
  .check('tsc'));
```

## Dependency Graph

```
ws:protocol ──→ ws:server
       │           │
       └→ ws:client ──→ ws:reconnect
              │
              ├→ sync:store ──→ sync:optimistic
              │       │         sync:conflict
              │       │
              ├→ presence:tracker ──→ presence:cursors
              │                      presence:indicators
              │
              └→ offline:queue ──→ offline:reconcile ←── sync:store
```

## Plan Variables

```typescript
plan.vars({
  transport: 'websocket',          // 'websocket' | 'sse' | 'socket.io' | 'pusher'
  syncEngine: 'custom',            // 'custom' | 'liveblocks' | 'partykit' | 'yjs'
  features: ['sync', 'presence', 'offline'],
  maxConnections: 10000,
  heartbeatInterval: 30000,
  reconnectStrategy: 'exponential', // 'exponential' | 'linear' | 'fixed'
  conflictResolution: 'lww',       // 'lww' | 'crdt' | 'manual'
});
```

## PRD Mapping Hints

| PRD Section | Maps To |
|-------------|---------|
| Live updates / real-time data | `transport` + `sync` epics |
| Collaboration / multi-user | `sync` + `presence` epics |
| Chat / messaging | `core-features` epic with transport deps |
| Notifications (live) | `transport` + dedicated notification tasks |
| Offline support | `offline` epic |
| Dashboards / monitoring | `core-features` with SSE or polling |
| Cursors / awareness | `presence` epic |

## Checks Strategy

- `tsc` on all protocol and library modules
- `build` on all UI components
- Load test WebSocket server (concurrent connections)
- Test reconnection under network interruption
- Verify message ordering guarantees
- Test conflict resolution with concurrent edits
