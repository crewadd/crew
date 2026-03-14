# Custom Storage Backends

**Implement alternative storage backends for Crew projects beyond the filesystem.**

[[docs](../README.md) > [advanced](./README.md) > custom-stores]

---

## Overview

Crew's default filesystem store can be extended to use alternative backends:

1. **Database stores** - PostgreSQL, MongoDB, etc.
2. **Cloud storage** - AWS S3, Google Cloud Storage
3. **Distributed systems** - Redis, Cassandra
4. **Hybrid stores** - Combine multiple backends
5. **Custom logic** - Project-specific persistence

---

## Store Interface

All stores implement this interface:

```typescript
interface HierarchicalStore {
  // Initialize
  init(): Promise<void>;

  // Project operations
  getProjectStatus(): Promise<ProjectStatus>;
  saveProjectStatus(status: ProjectStatus): Promise<void>;

  // Epic operations
  getEpic(epicNum: number): Promise<CompoundEpic>;
  saveEpic(epic: CompoundEpic): Promise<void>;

  // Task operations
  getTask(epicNum: number, taskIdx: number): Promise<CompoundTask>;
  saveTask(epicNum: number, taskIdx: number, task: CompoundTask): Promise<void>;

  // Progress tracking
  appendProgress(event: ProgressEvent): Promise<void>;
  getProgress(filter?: ProgressFilter): Promise<ProgressEvent[]>;

  // Storage management
  clear(): Promise<void>;
  export(): Promise<any>;
}
```

---

## PostgreSQL Store

### Implementation

```typescript
// stores/postgres-store.ts
import { Pool } from 'pg';
import type { HierarchicalStore, CompoundTask, CompoundEpic } from 'crew';

export class PostgresStore implements HierarchicalStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    const client = await this.pool.connect();
    try {
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS project_status (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          status VARCHAR(50),
          epics_count INT,
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS epics (
          id SERIAL PRIMARY KEY,
          epic_num INT,
          title VARCHAR(255),
          complete BOOLEAN,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          epic_num INT,
          task_id VARCHAR(50),
          title VARCHAR(255),
          status VARCHAR(50),
          data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(epic_num, task_id)
        );

        CREATE TABLE IF NOT EXISTS progress (
          id SERIAL PRIMARY KEY,
          event JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_num);
        CREATE INDEX IF NOT EXISTS idx_progress_event ON progress((event->>'event'));
      `);
    } finally {
      client.release();
    }
  }

  async getProjectStatus() {
    const result = await this.pool.query(
      'SELECT * FROM project_status ORDER BY id DESC LIMIT 1'
    );
    return result.rows[0] || { name: 'Unknown', status: 'pending', epics_count: 0 };
  }

  async saveProjectStatus(status) {
    await this.pool.query(
      'INSERT INTO project_status (name, status, epics_count) VALUES ($1, $2, $3)',
      [status.name, status.status, status.epics_count]
    );
  }

  async getTask(epicNum: number, taskIdx: number) {
    const result = await this.pool.query(
      'SELECT data FROM tasks WHERE epic_num = $1 AND id = $2',
      [epicNum, taskIdx]
    );
    return result.rows[0]?.data;
  }

  async saveTask(epicNum: number, taskIdx: number, task: CompoundTask) {
    await this.pool.query(
      `INSERT INTO tasks (epic_num, task_id, title, status, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (epic_num, task_id) DO UPDATE SET status=$4, data=$5`,
      [epicNum, task.id, task.title, task.status, JSON.stringify(task)]
    );
  }

  async appendProgress(event) {
    await this.pool.query(
      'INSERT INTO progress (event) VALUES ($1)',
      [JSON.stringify(event)]
    );
  }

  async getProgress(filter?) {
    let query = 'SELECT event FROM progress';
    const params: any[] = [];

    if (filter?.event) {
      query += ` WHERE event->>'event' = $${params.length + 1}`;
      params.push(filter.event);
    }

    query += ' ORDER BY created_at ASC';

    const result = await this.pool.query(query, params);
    return result.rows.map(r => r.event);
  }

  async clear() {
    await this.pool.query('DELETE FROM progress');
    await this.pool.query('DELETE FROM tasks');
    await this.pool.query('DELETE FROM epics');
    await this.pool.query('DELETE FROM project_status');
  }
}
```

### Usage

```typescript
// crew.json
{
  "store": {
    "type": "custom",
    "module": "./stores/postgres-store",
    "config": {
      "connectionString": "postgresql://user:pass@localhost/crew"
    }
  }
}
```

---

## MongoDB Store

### Implementation

```typescript
// stores/mongo-store.ts
import { MongoClient, Db } from 'mongodb';
import type { HierarchicalStore } from 'crew';

export class MongoStore implements HierarchicalStore {
  private db: Db | null = null;

  constructor(private connectionString: string) {}

  async init() {
    const client = new MongoClient(this.connectionString);
    await client.connect();
    this.db = client.db('crew');

    // Create collections
    await this.db.createCollection('project_status').catch(() => {});
    await this.db.createCollection('tasks').catch(() => {});
    await this.db.createCollection('progress').catch(() => {});

    // Create indexes
    await this.db.collection('tasks').createIndex({ epic_num: 1, task_id: 1 }, { unique: true });
    await this.db.collection('progress').createIndex({ created_at: -1 });
  }

  async getProjectStatus() {
    const status = await this.db!.collection('project_status')
      .findOne({}, { sort: { created_at: -1 } });
    return status || { name: 'Unknown', status: 'pending' };
  }

  async saveProjectStatus(status) {
    await this.db!.collection('project_status').insertOne({
      ...status,
      created_at: new Date()
    });
  }

  async getTask(epicNum: number, taskIdx: number) {
    return this.db!.collection('tasks').findOne({
      epic_num: epicNum,
      task_idx: taskIdx
    });
  }

  async saveTask(epicNum: number, taskIdx: number, task) {
    await this.db!.collection('tasks').updateOne(
      { epic_num: epicNum, task_idx: taskIdx },
      { $set: { ...task, updated_at: new Date() } },
      { upsert: true }
    );
  }

  async appendProgress(event) {
    await this.db!.collection('progress').insertOne({
      ...event,
      created_at: new Date()
    });
  }

  async getProgress(filter?) {
    const query = filter?.event ? { 'event.event': filter.event } : {};
    return this.db!.collection('progress')
      .find(query)
      .sort({ created_at: 1 })
      .toArray();
  }

  async clear() {
    await this.db!.collection('project_status').deleteMany({});
    await this.db!.collection('tasks').deleteMany({});
    await this.db!.collection('progress').deleteMany({});
  }
}
```

---

## S3 Store (Cloud)

### Implementation

```typescript
// stores/s3-store.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export class S3Store implements HierarchicalStore {
  private s3: S3Client;

  constructor(
    private bucket: string,
    private prefix: string = 'crew/'
  ) {
    this.s3 = new S3Client({ region: 'us-east-1' });
  }

  async init() {
    // S3 bucket already exists
    // Just verify access
    await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.prefix })
    ).catch(() => null);
  }

  async getProjectStatus() {
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: `${this.prefix}project-status.json`
        })
      );

      const content = await streamToString(response.Body as Readable);
      return JSON.parse(content);
    } catch {
      return { name: 'Unknown', status: 'pending' };
    }
  }

  async saveProjectStatus(status) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}project-status.json`,
        Body: JSON.stringify(status),
        ContentType: 'application/json'
      })
    );
  }

  async appendProgress(event) {
    // Append to progress log
    const key = `${this.prefix}progress.jsonl`;
    const existing = await this.getProgressLog();
    const newLog = existing + JSON.stringify(event) + '\n';

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: newLog
      })
    );
  }

  private async getProgressLog() {
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: `${this.prefix}progress.jsonl`
        })
      );
      return await streamToString(response.Body as Readable);
    } catch {
      return '';
    }
  }
}

async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream.on('data', chunk => chunks.push(chunk.toString()));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}
```

---

## Hybrid Store

Combine multiple backends:

```typescript
// stores/hybrid-store.ts
export class HybridStore implements HierarchicalStore {
  constructor(
    private fast: HierarchicalStore,      // In-memory or Redis
    private durable: HierarchicalStore    // PostgreSQL or S3
  ) {}

  async init() {
    await this.fast.init();
    await this.durable.init();
  }

  async getProjectStatus() {
    // Try fast store first
    try {
      return await this.fast.getProjectStatus();
    } catch {
      // Fall back to durable store
      return this.durable.getProjectStatus();
    }
  }

  async saveProjectStatus(status) {
    // Write to both
    await Promise.all([
      this.fast.saveProjectStatus(status),
      this.durable.saveProjectStatus(status)
    ]);
  }

  async appendProgress(event) {
    // Always write to durable first for safety
    await this.durable.appendProgress(event);
    // Then to fast store for performance
    await this.fast.appendProgress(event).catch(() => {});
  }

  async getProgress(filter?) {
    // Read from durable store (authoritative)
    return this.durable.getProgress(filter);
  }
}
```

---

## Redis Store

For distributed coordination:

```typescript
// stores/redis-store.ts
import { createClient } from 'redis';

export class RedisStore implements HierarchicalStore {
  private client = createClient({
    url: this.connectionString
  });

  constructor(private connectionString: string) {}

  async init() {
    await this.client.connect();
  }

  async getProjectStatus() {
    const status = await this.client.get('crew:project:status');
    return status ? JSON.parse(status) : { name: 'Unknown' };
  }

  async saveProjectStatus(status) {
    await this.client.set('crew:project:status', JSON.stringify(status));
  }

  async appendProgress(event) {
    // Add to list
    await this.client.lPush('crew:progress', JSON.stringify(event));
    // Keep last 10000 events
    await this.client.lTrim('crew:progress', 0, 9999);
  }

  async getProgress(filter?) {
    const events = await this.client.lRange('crew:progress', 0, -1);
    return events.map(e => JSON.parse(e));
  }
}
```

---

## Configuration

### In crew.json

```json
{
  "store": {
    "type": "custom",
    "module": "./stores/postgres-store",
    "config": {
      "connectionString": "postgresql://localhost/crew"
    }
  }
}
```

### Dynamic Selection

```typescript
// crew.json
{
  "store": {
    "type": "custom",
    "module": "./stores/store-factory",
    "config": {
      "backend": "${CREW_STORE_BACKEND}"
    }
  }
}
```

```typescript
// stores/store-factory.ts
import { PostgresStore } from './postgres-store';
import { MongoStore } from './mongo-store';
import { S3Store } from './s3-store';

export function createStore(config) {
  const backend = process.env.CREW_STORE_BACKEND || 'postgres';

  switch (backend) {
    case 'postgres':
      return new PostgresStore(process.env.DATABASE_URL!);
    case 'mongo':
      return new MongoStore(process.env.MONGO_URL!);
    case 's3':
      return new S3Store(process.env.S3_BUCKET!);
    default:
      throw new Error(`Unknown store: ${backend}`);
  }
}

export default createStore(process.env);
```

---

## Best Practices

### 1. Implement All Methods

```typescript
// Good: Complete implementation
class MyStore implements HierarchicalStore {
  async init() { /* ... */ }
  async getProjectStatus() { /* ... */ }
  async saveProjectStatus() { /* ... */ }
  // ... all methods
}

// Bad: Partial implementation
class MyStore {
  async save() { /* partial */ }
}
```

### 2. Handle Concurrency

```typescript
// Good: Use locks for concurrent access
async saveTask(epicNum, taskIdx, task) {
  const lock = await this.acquireLock(`task:${epicNum}:${taskIdx}`);
  try {
    await this.db.update(...);
  } finally {
    await lock.release();
  }
}
```

### 3. Test Thoroughly

```typescript
// Test store interface
const store = createMyStore();
await store.init();

// Test reads/writes
await store.saveProjectStatus({ name: 'Test' });
const status = await store.getProjectStatus();
assert(status.name === 'Test');

// Test progress
await store.appendProgress({ event: 'task:start' });
const events = await store.getProgress();
assert(events.length > 0);
```

---

## See Also

- [Store API](../api-reference/store-api.md) - Complete store interface
- [Custom Executors](./custom-executors.md) - Custom task execution
- [Performance Tuning](./performance-tuning.md) - Optimize storage

---

[← Back to Advanced Topics](./README.md) | [Documentation Home](../README.md)
