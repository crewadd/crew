# Event Streaming and Observability

**Stream execution events for dashboards, monitoring, and real-time tracking.**

[[docs](../README.md) > [advanced](./README.md) > event-streaming]

---

## Overview

Crew emits typed events throughout execution:

1. **Execution events** - Task start, check, done, fail
2. **Real-time streaming** - Subscribe to events as they happen
3. **Dashboard integration** - Feed events to monitoring systems
4. **Custom handlers** - React to events programmatically
5. **Event history** - Query past events

---

## Event Types

```typescript
type ProgressEvent =
  | ProjectStarted
  | EpicStarted
  | TaskStarted
  | TaskCheckRun
  | TaskCheckPass
  | TaskCheckFail
  | TaskFeedback
  | TaskDone
  | TaskFailed
  | EpicDone
  | ProjectDone
  | ProjectFailed;

interface TaskStarted {
  event: 'task:start';
  timestamp: string;
  taskId: string;
  taskTitle: string;
  epicNum: number;
  attempt: number;
}

interface TaskCheckRun {
  event: 'task:check:run';
  timestamp: string;
  taskId: string;
  checkType: 'cmd' | 'prompt' | 'inline';
  checkDescription: string;
}

interface TaskCheckFail {
  event: 'task:check:fail';
  timestamp: string;
  taskId: string;
  checkDescription: string;
  error: string;
  attempt: number;
}
```

---

## Event Streaming API

### Subscribe to Events

```typescript
import { ProjectOrchestrator } from 'crew';

const orchestrator = new ProjectOrchestrator(options);

// Subscribe to all events
orchestrator.on('event', (event) => {
  console.log('Event:', event);
});

// Subscribe to specific event type
orchestrator.on('task:done', (event) => {
  console.log('Task done:', event.taskId);
});

// Run project
await orchestrator.run();
```

### Event Handler

```typescript
const handlers = {
  'task:start': (event) => {
    console.log(`Task started: ${event.taskId}`);
  },

  'task:check:run': (event) => {
    console.log(`Running check: ${event.checkDescription}`);
  },

  'task:check:fail': (event) => {
    console.log(`Check failed: ${event.error}`);
  },

  'task:done': (event) => {
    console.log(`Task done: ${event.taskId}`);
  },

  'task:failed': (event) => {
    console.log(`Task failed: ${event.taskId}`);
  },

  'project:done': (event) => {
    console.log('Project completed!');
  }
};

for (const [eventType, handler] of Object.entries(handlers)) {
  orchestrator.on(eventType, handler);
}
```

---

## Real-Time Dashboard

### WebSocket Server

```typescript
import { WebSocketServer } from 'ws';
import { ProjectOrchestrator } from 'crew';

const wss = new WebSocketServer({ port: 8080 });

const orchestrator = new ProjectOrchestrator(options);

// Broadcast events to all connected clients
orchestrator.on('event', (event) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });
});

wss.on('connection', (ws) => {
  console.log('Dashboard connected');

  ws.on('close', () => {
    console.log('Dashboard disconnected');
  });
});

await orchestrator.run();
```

### Frontend Dashboard

```html
<!DOCTYPE html>
<html>
<head>
  <title>Crew Dashboard</title>
  <style>
    .task { padding: 10px; margin: 5px; border: 1px solid #ddd; }
    .task.done { background: #d4edda; }
    .task.failed { background: #f8d7da; }
    .task.active { background: #d1ecf1; }
  </style>
</head>
<body>
  <h1>Crew Project Status</h1>
  <div id="tasks"></div>

  <script>
    const ws = new WebSocket('ws://localhost:8080');
    const taskStates = {};

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);

      if (evt.event === 'task:start') {
        taskStates[evt.taskId] = 'active';
      } else if (evt.event === 'task:done') {
        taskStates[evt.taskId] = 'done';
      } else if (evt.event === 'task:failed') {
        taskStates[evt.taskId] = 'failed';
      }

      updateUI();
    };

    function updateUI() {
      const tasksDiv = document.getElementById('tasks');
      tasksDiv.innerHTML = Object.entries(taskStates)
        .map(([id, status]) =>
          `<div class="task ${status}">${id}: ${status}</div>`
        )
        .join('');
    }
  </script>
</body>
</html>
```

---

## Integration with Monitoring

### Send to DataDog

```typescript
import { StatsD } from 'node-statsd';

const statsd = new StatsD();
const orchestrator = new ProjectOrchestrator(options);

orchestrator.on('task:start', (event) => {
  statsd.increment('crew.task.start');
});

orchestrator.on('task:done', (event) => {
  statsd.increment('crew.task.done');
});

orchestrator.on('task:failed', (event) => {
  statsd.increment('crew.task.failed');
  statsd.gauge('crew.task.failure_count', 1);
});
```

### Send to Prometheus

```typescript
import client from 'prom-client';

const taskCounter = new client.Counter({
  name: 'crew_tasks_total',
  help: 'Total tasks executed',
  labelNames: ['status']
});

const taskDuration = new client.Histogram({
  name: 'crew_task_duration_seconds',
  help: 'Task execution duration',
  labelNames: ['task_id']
});

let taskStartTime: Record<string, number> = {};

orchestrator.on('task:start', (event) => {
  taskStartTime[event.taskId] = Date.now();
});

orchestrator.on('task:done', (event) => {
  const duration = (Date.now() - taskStartTime[event.taskId]) / 1000;
  taskCounter.inc({ status: 'success' });
  taskDuration.observe({ task_id: event.taskId }, duration);
});

orchestrator.on('task:failed', (event) => {
  taskCounter.inc({ status: 'failure' });
});
```

---

## Query Event History

### Filter Events

```typescript
import { readFileSync } from 'fs';

const progressLog = readFileSync('.crew/progress.jsonl', 'utf-8');
const events = progressLog
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Filter by task
const taskEvents = events.filter(e => e.taskId === 'm1.1');

// Filter by event type
const failures = events.filter(e => e.event === 'task:failed');

// Timeline analysis
const timeline = events
  .filter(e => e.event.includes('task'))
  .map(e => ({
    time: e.timestamp,
    event: e.event,
    taskId: e.taskId
  }));

console.table(timeline);
```

---

## Custom Event Handlers

### Log to File

```typescript
import { appendFileSync } from 'fs';

orchestrator.on('event', (event) => {
  appendFileSync('crew.log', JSON.stringify(event) + '\n');
});
```

### Alert on Failures

```typescript
import nodemailer from 'nodemailer';

const mailer = nodemailer.createTransport({...});

orchestrator.on('task:failed', async (event) => {
  await mailer.sendMail({
    from: 'alerts@crew.local',
    to: 'dev@crew.local',
    subject: `Task Failed: ${event.taskId}`,
    text: `Task ${event.taskId} failed after multiple attempts`
  });
});
```

---

## Best Practices

### 1. Non-Blocking Handlers

```typescript
// Good: Async and non-blocking
orchestrator.on('event', async (event) => {
  // Send to external service without blocking
  fetch('https://monitoring.com', { body: JSON.stringify(event) })
    .catch(err => console.error('Failed to send event', err));
});

// Bad: Blocking the event loop
orchestrator.on('event', (event) => {
  // Synchronous I/O blocks execution
  fs.writeFileSync('log.txt', JSON.stringify(event));
});
```

### 2. Handle Errors

```typescript
orchestrator.on('event', (event) => {
  try {
    // Process event
  } catch (error) {
    console.error('Event handler failed:', error);
  }
});
```

### 3. Aggregate Events

```typescript
const eventBuffer: any[] = [];
const FLUSH_INTERVAL = 5000;

orchestrator.on('event', (event) => {
  eventBuffer.push(event);
});

setInterval(async () => {
  if (eventBuffer.length > 0) {
    await sendBatch(eventBuffer.splice(0));
  }
}, FLUSH_INTERVAL);
```

---

## See Also

- [Execution Flow](../core-concepts/execution-flow.md) - How execution works
- [Debugging Tasks](../guides/debugging-tasks.md) - Debugging with events
- [CI/CD Integration](../guides/ci-cd-integration.md) - Event reporting in CI

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
