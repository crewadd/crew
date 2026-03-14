/**
 * Custom assertion helpers for integration tests
 */

import { expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { HierarchicalStore } from '../../../src/store/hierarchical-store.ts';

/**
 * Assert that .crew/ directory structure exists
 */
export function assertCrewStructure(rootDir: string) {
  const crewDir = join(rootDir, '.crew');
  expect(existsSync(crewDir), `.crew directory should exist`).toBe(true);

  // Check for crew.json at project root (newer structure)
  const crewJson = join(rootDir, 'crew.json');
  const projectJson = join(crewDir, 'project.json');

  // Either crew.json or project.json should exist
  const hasConfig = existsSync(crewJson) || existsSync(projectJson);
  expect(hasConfig, 'crew.json or project.json should exist').toBe(true);

  // Note: setup directory is NOT created by crew init - it must be created manually
  // or by the test harness. Only check for it if we expect it to exist.
}

/**
 * Assert epic count
 */
export function assertEpicCount(store: HierarchicalStore, expectedCount: number) {
  const epics = store.listEpics();
  expect(epics.length, `Should have ${expectedCount} epics`).toBe(expectedCount);
}

/**
 * Assert task status
 */
export function assertTaskStatus(
  store: HierarchicalStore,
  taskId: string,
  expectedStatus: 'pending' | 'active' | 'done' | 'blocked' | 'failed'
) {
  const task = store.getTask(taskId);
  expect(task, `Task ${taskId} should exist`).not.toBeNull();
  expect(task!.status, `Task ${taskId} should have status ${expectedStatus}`).toBe(expectedStatus);
}

/**
 * Assert task completed successfully
 */
export function assertTaskCompleted(store: HierarchicalStore, taskId: string) {
  const task = store.getTask(taskId);
  expect(task, `Task ${taskId} should exist`).not.toBeNull();
  expect(task!.status, `Task ${taskId} should be done`).toBe('done');

  // Check that task has at least one successful attempt
  if (task!.attempts && task!.attempts.length > 0) {
    const lastAttempt = task!.attempts[task!.attempts.length - 1];
    expect(lastAttempt.success, `Task ${taskId} should have succeeded`).toBe(true);
  }
}

/**
 * Assert all tasks in a epic are completed
 */
export function assertEpicCompleted(store: HierarchicalStore, epicId: string) {
  const epic = store.getEpic(epicId);
  expect(epic, `Epic ${epicId} should exist`).not.toBeNull();
  expect(epic!.status, `Epic ${epicId} should be done`).toBe('done');

  // Check all tasks are done
  for (const taskId of epic!.task_ids) {
    assertTaskCompleted(store, taskId);
  }
}

/**
 * Assert all tasks and epics are completed
 */
export function assertAllTasksCompleted(store: HierarchicalStore) {
  const epics = store.listEpics();
  expect(epics.length, 'Should have at least one epic').toBeGreaterThan(0);

  for (const epic of epics) {
    expect(epic.status, `Epic ${epic.id} should be done`).toBe('done');

    for (const taskId of epic.task_ids) {
      assertTaskCompleted(store, taskId);
    }
  }
}

/**
 * Assert task exists
 */
export function assertTaskExists(store: HierarchicalStore, taskId: string) {
  const task = store.getTask(taskId);
  expect(task, `Task ${taskId} should exist`).not.toBeNull();
}

/**
 * Assert epic exists
 */
export function assertEpicExists(store: HierarchicalStore, epicId: string) {
  const epic = store.getEpic(epicId);
  expect(epic, `Epic ${epicId} should exist`).not.toBeNull();
}

/**
 * Assert task count
 */
export function assertTaskCount(store: HierarchicalStore, expectedCount: number) {
  const stats = store.getStats();
  expect(stats.tasks, `Should have ${expectedCount} tasks`).toBe(expectedCount);
}

/**
 * Assert completed task count
 */
export function assertCompletedTaskCount(store: HierarchicalStore, expectedCount: number) {
  const stats = store.getStats();
  expect(stats.completed, `Should have ${expectedCount} completed tasks`).toBe(expectedCount);
}

/**
 * Assert task has dependencies
 */
export function assertTaskDependencies(
  store: HierarchicalStore,
  taskId: string,
  expectedDeps: string[]
) {
  const task = store.getTask(taskId);
  expect(task, `Task ${taskId} should exist`).not.toBeNull();
  expect(task!.dependencies, `Task ${taskId} should have correct dependencies`).toEqual(expectedDeps);
}

/**
 * Assert file exists
 */
export function assertFileExists(filePath: string) {
  expect(existsSync(filePath), `File ${filePath} should exist`).toBe(true);
}

/**
 * Assert directory exists
 */
export function assertDirectoryExists(dirPath: string) {
  expect(existsSync(dirPath), `Directory ${dirPath} should exist`).toBe(true);
  expect(statSync(dirPath).isDirectory(), `${dirPath} should be a directory`).toBe(true);
}
