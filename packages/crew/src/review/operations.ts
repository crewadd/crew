/**
 * Review Operations — read/write review results and manage review lifecycle
 *
 * Reviews are stored alongside tasks:
 *   .crew/epics/{epic}/tasks/{task}/reviews/001.json
 *   .crew/epics/{epic}/tasks/{task}/summary.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewResult, ReviewGate } from '../tasks/types.ts';
import type { Task, Epic } from '../store/types.ts';
import type { HierarchicalStore } from '../store/hierarchical-store.ts';

/* ------------------------------------------------------------------ */
/*  Review Storage                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get the reviews directory for a task
 */
export function getReviewsDir(store: HierarchicalStore, task: Task, epic: Epic): string {
  // Use the store's internal path helpers to find the task directory
  const taskDir = store.getTaskDirPath(task, epic);
  return join(taskDir, 'reviews');
}

/**
 * List all review results for a task
 */
export function listReviews(store: HierarchicalStore, task: Task, epic: Epic): ReviewResult[] {
  const dir = getReviewsDir(store, task, epic);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ReviewResult;
      } catch {
        return null;
      }
    })
    .filter((r): r is ReviewResult => r !== null);
}

/**
 * Save a review result for a task
 */
export function saveReview(
  store: HierarchicalStore,
  task: Task,
  epic: Epic,
  result: ReviewResult,
): string {
  const dir = getReviewsDir(store, task, epic);
  mkdirSync(dir, { recursive: true });

  // Determine next review number
  const existing = existsSync(dir)
    ? readdirSync(dir).filter(f => f.endsWith('.json')).length
    : 0;
  const num = String(existing + 1).padStart(3, '0');
  const filename = `${num}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
  return filepath;
}

/**
 * Read the summary.md for a task
 */
export function readSummary(store: HierarchicalStore, task: Task, epic: Epic): string | null {
  const taskDir = store.getTaskDirPath(task, epic);
  const summaryPath = join(taskDir, 'summary.md');
  if (!existsSync(summaryPath)) return null;
  return readFileSync(summaryPath, 'utf-8');
}

/**
 * Write summary.md for a task
 */
export function writeSummary(
  store: HierarchicalStore,
  task: Task,
  epic: Epic,
  content: string,
): void {
  const taskDir = store.getTaskDirPath(task, epic);
  writeFileSync(join(taskDir, 'summary.md'), content, 'utf-8');
}

/* ------------------------------------------------------------------ */
/*  Review Lifecycle                                                  */
/* ------------------------------------------------------------------ */

/**
 * Transition a task to awaiting_review status
 */
export function transitionToReview(store: HierarchicalStore, task: Task): void {
  store.updateTaskStatus(task, 'awaiting_review' as Task['status'], 'crew');
}

/**
 * Submit a review decision for a task
 */
export function submitReview(
  store: HierarchicalStore,
  task: Task,
  epic: Epic,
  decision: ReviewResult['decision'],
  opts: {
    reviewer?: string;
    feedback?: string;
    type?: 'human' | 'agent';
  } = {},
): ReviewResult {
  const result: ReviewResult = {
    decision,
    reviewer: opts.reviewer || 'human:cli',
    feedback: opts.feedback,
    at: new Date().toISOString(),
    type: opts.type || 'human',
  };

  // Save to disk
  saveReview(store, task, epic, result);

  // Transition task status based on decision
  switch (decision) {
    case 'approve':
      store.updateTaskStatus(task, 'done', opts.reviewer || 'crew');
      break;
    case 'request-changes':
      store.updateTaskStatus(task, 'active', opts.reviewer || 'crew');
      break;
    case 'reject':
      store.updateTaskStatus(task, 'failed', opts.reviewer || 'crew');
      break;
  }

  return result;
}

/**
 * Get the review gates for a task (resolving from task type if needed)
 */
export function getReviewGates(task: Task): ReviewGate[] {
  if (!task.review) return [];
  return Array.isArray(task.review) ? task.review : [task.review];
}

/**
 * Parse timeout string to milliseconds
 * Supports: "1h", "24h", "7d", "30m"
 */
export function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid timeout format: ${timeout}. Use "1h", "24h", "7d", etc.`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Collect review gates for a task, including task type defaults.
 * Task-level .review() overrides type-level defaults.
 */
export function collectReviewGates(
  task: Task,
  taskTypeReview?: ReviewGate,
): ReviewGate[] {
  // Task-level review gates take priority
  if (task.review) {
    return Array.isArray(task.review) ? task.review : [task.review];
  }

  // Fall back to task type default
  if (taskTypeReview) {
    return [taskTypeReview];
  }

  return [];
}

/**
 * Collect report prompt for a task, falling back to task type default.
 */
export function collectReportPrompt(
  task: Task,
  taskTypeReportPrompt?: string,
): string | undefined {
  return task.reportPrompt || taskTypeReportPrompt;
}
