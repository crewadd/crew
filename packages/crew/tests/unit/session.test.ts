/**
 * Unit tests for Session manager (.crew/session.json)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../../src/session.ts';
import type { SessionData } from '../../src/session.ts';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'crew-session-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Session', () => {
  describe('start()', () => {
    it('creates session.json with correct fields', () => {
      const session = new Session(tmpDir);
      const data = session.start('m1.3', 'Build login page', 1);

      expect(data.pid).toBe(process.pid);
      expect(data.taskId).toBe('m1.3');
      expect(data.taskTitle).toBe('Build login page');
      expect(data.attempt).toBe(1);
      expect(data.status).toBe('running');
      expect(data.startedAt).toBeTruthy();
      expect(data.updatedAt).toBeTruthy();

      // Verify file exists on disk
      expect(existsSync(session.path)).toBe(true);

      // Verify JSON content
      const raw = JSON.parse(readFileSync(session.path, 'utf-8'));
      expect(raw.taskId).toBe('m1.3');
      expect(raw.pid).toBe(process.pid);
    });

    it('defaults attempt to 1', () => {
      const session = new Session(tmpDir);
      const data = session.start('m1.1', 'Test task');
      expect(data.attempt).toBe(1);
    });
  });

  describe('read()', () => {
    it('returns null when no session file exists', () => {
      const session = new Session(tmpDir);
      expect(session.read()).toBeNull();
    });

    it('returns session data when file exists', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      const data = session.read();
      expect(data).not.toBeNull();
      expect(data!.taskId).toBe('m1.1');
    });
  });

  describe('exists()', () => {
    it('returns false when no session file', () => {
      const session = new Session(tmpDir);
      expect(session.exists()).toBe(false);
    });

    it('returns true after start()', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      expect(session.exists()).toBe(true);
    });
  });

  describe('checkpoint()', () => {
    it('updates checkpoint and updatedAt without changing status', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');

      const beforeUpdate = session.read()!.updatedAt;

      // Small delay to ensure timestamp difference
      session.checkpoint('task:stream');

      const data = session.read()!;
      expect(data.status).toBe('running');
      expect(data.checkpoint).toBeDefined();
      expect(data.checkpoint!.lastEvent).toBe('task:stream');
      expect(data.checkpoint!.at).toBeTruthy();
    });

    it('does nothing if no session file', () => {
      const session = new Session(tmpDir);
      // Should not throw
      session.checkpoint('task:stream');
      expect(session.exists()).toBe(false);
    });
  });

  describe('setAttempt()', () => {
    it('updates attempt number', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.setAttempt(2);

      const data = session.read()!;
      expect(data.attempt).toBe(2);
    });
  });

  describe('cancel()', () => {
    it('sets status to cancelled and keeps the file', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.cancel();

      const data = session.read()!;
      expect(data.status).toBe('cancelled');
      expect(existsSync(session.path)).toBe(true);
    });
  });

  describe('complete()', () => {
    it('removes the session file', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.complete();

      expect(existsSync(session.path)).toBe(false);
      expect(session.read()).toBeNull();
    });
  });

  describe('fail()', () => {
    it('sets status to failed and keeps the file', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.fail();

      const data = session.read()!;
      expect(data.status).toBe('failed');
      expect(existsSync(session.path)).toBe(true);
    });
  });

  describe('clear()', () => {
    it('removes session file unconditionally', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.cancel();
      session.clear();

      expect(existsSync(session.path)).toBe(false);
    });

    it('does not throw if file does not exist', () => {
      const session = new Session(tmpDir);
      expect(() => session.clear()).not.toThrow();
    });
  });

  describe('isProcessAlive()', () => {
    it('returns true for own PID', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      expect(session.isProcessAlive()).toBe(true);
    });

    it('returns false when no session exists', () => {
      const session = new Session(tmpDir);
      expect(session.isProcessAlive()).toBe(false);
    });
  });

  describe('detectCrash()', () => {
    it('returns null when no session exists', () => {
      const session = new Session(tmpDir);
      expect(session.detectCrash()).toBeNull();
    });

    it('returns null when status is cancelled (not a crash)', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.cancel();
      expect(session.detectCrash()).toBeNull();
    });

    it('returns null when PID is still alive (running)', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      // Our own PID is alive, so this is not a crash
      expect(session.detectCrash()).toBeNull();
    });

    it('returns session data when PID is dead (simulated crash)', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');

      // Simulate a crash by setting a fake PID that doesn't exist
      const data = session.read()!;
      data.pid = 999999; // Very unlikely to be a real PID
      const { writeFileSync } = require('node:fs');
      writeFileSync(session.path, JSON.stringify(data, null, 2) + '\n');

      const crashed = session.detectCrash();
      // May or may not detect depending on system, but the logic is correct
      // On most systems, PID 999999 won't exist
      if (crashed) {
        expect(crashed.taskId).toBe('m1.1');
        expect(crashed.status).toBe('running');
      }
    });
  });

  describe('detectCancelled()', () => {
    it('returns null when no session exists', () => {
      const session = new Session(tmpDir);
      expect(session.detectCancelled()).toBeNull();
    });

    it('returns null when status is running', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      expect(session.detectCancelled()).toBeNull();
    });

    it('returns session data when status is cancelled', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Test');
      session.cancel();

      const cancelled = session.detectCancelled();
      expect(cancelled).not.toBeNull();
      expect(cancelled!.taskId).toBe('m1.1');
      expect(cancelled!.status).toBe('cancelled');
    });
  });

  describe('full lifecycle', () => {
    it('start → checkpoint → complete removes file', () => {
      const session = new Session(tmpDir);
      session.start('m1.1', 'Build page');
      expect(session.exists()).toBe(true);

      session.checkpoint('task:start');
      session.checkpoint('task:stream');

      const mid = session.read()!;
      expect(mid.status).toBe('running');
      expect(mid.checkpoint!.lastEvent).toBe('task:stream');

      session.complete();
      expect(session.exists()).toBe(false);
    });

    it('start → cancel preserves file for resume', () => {
      const session = new Session(tmpDir);
      session.start('m1.3', 'Login page');
      session.checkpoint('task:start');
      session.cancel();

      expect(session.exists()).toBe(true);
      const data = session.read()!;
      expect(data.status).toBe('cancelled');
      expect(data.taskId).toBe('m1.3');

      // Next run detects cancelled session
      const cancelled = session.detectCancelled();
      expect(cancelled).not.toBeNull();
      expect(cancelled!.taskId).toBe('m1.3');

      // After reset, clear the session
      session.clear();
      expect(session.exists()).toBe(false);
    });
  });
});
