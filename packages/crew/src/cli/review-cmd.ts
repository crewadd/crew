/**
 * Review CLI commands
 *
 * crew review list                                    — list tasks awaiting review
 * crew task <id> review show                          — show review details
 * crew task <id> review approve [--comment "..."]     — approve
 * crew task <id> review request-changes --reason "…"  — request changes
 * crew task <id> review reject --reason "…"           — reject
 */

import { loadStore } from '../planner/index.ts';
import { getTaskDetails } from '../manager/task-operations.ts';
import {
  listReviews,
  readSummary,
  submitReview,
  getReviewGates,
} from '../review/index.ts';
import { validateProjectDir } from './utils.ts';

/**
 * List all tasks awaiting review
 */
export async function runReviewList(
  projectDir: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);

  const allTasks = store.listAllTasks();
  const awaitingReview = allTasks.filter(t => t.status === ('awaiting_review' as any));

  if (awaitingReview.length === 0) {
    console.error('');
    console.error('No tasks awaiting review.');
    console.error('');
    return;
  }

  if (flags.json) {
    const items = awaitingReview.map(t => {
      const details = getTaskDetails(store, t.id);
      const gates = getReviewGates(t);
      return {
        id: details?.displayId || t.id,
        title: t.title,
        reviewType: gates.map(g => g.type),
        assignee: gates.map(g => g.assignee).filter(Boolean),
      };
    });
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  console.error('');
  console.error('TASKS AWAITING REVIEW');
  console.error('═'.repeat(70));
  console.error('');

  for (const t of awaitingReview) {
    const details = getTaskDetails(store, t.id);
    const gates = getReviewGates(t);
    const displayId = details?.displayId || t.id;
    const reviewType = gates.map(g => g.type).join(', ') || 'human';

    console.error(`  ${displayId}: ${t.title}`);
    console.error(`    Review: ${reviewType}`);
    if (gates.some(g => g.assignee)) {
      console.error(`    Assignee: ${gates.map(g => g.assignee).filter(Boolean).join(', ')}`);
    }
    console.error(`    → crew task ${displayId} review show`);
    console.error('');
  }
}

/**
 * Show review details for a task
 */
export async function runReviewShow(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);
  const details = getTaskDetails(store, taskId);

  if (!details) {
    console.error(`[crew] Task not found: ${taskId}`);
    process.exit(1);
  }

  const { task, epic, displayId } = details;
  const gates = getReviewGates(task);
  const reviews = listReviews(store, task, epic);
  const summary = readSummary(store, task, epic);

  if (flags.json) {
    console.log(JSON.stringify({
      id: displayId,
      title: task.title,
      status: task.status,
      reviewGates: gates,
      reviews,
      summary: summary || undefined,
    }, null, 2));
    return;
  }

  console.error('');
  console.error(`Task: ${displayId} — ${task.title}`);
  console.error(`Status: ${task.status}`);

  if (gates.length > 0) {
    console.error('');
    console.error('Review Gates:');
    for (const gate of gates) {
      console.error(`  • Type: ${gate.type}`);
      if (gate.prompt) console.error(`    Prompt: ${gate.prompt}`);
      if (gate.assignee) console.error(`    Assignee: ${gate.assignee}`);
      if (gate.agent) console.error(`    Agent: ${gate.agent}`);
      if (gate.timeout) console.error(`    Timeout: ${gate.timeout}`);
    }
  }

  if (summary) {
    console.error('');
    console.error('── Summary ──────────────────────────────────────────────');
    console.error(summary);
    console.error('─────────────────────────────────────────────────────────');
  }

  if (reviews.length > 0) {
    console.error('');
    console.error('Review History:');
    for (const review of reviews) {
      console.error(`  [${review.at}] ${review.decision} by ${review.reviewer}`);
      if (review.feedback) {
        console.error(`    Feedback: ${review.feedback}`);
      }
    }
  }

  console.error('');
  console.error('Actions:');
  console.error(`  crew task ${displayId} review approve`);
  console.error(`  crew task ${displayId} review request-changes --reason "..."`);
  console.error(`  crew task ${displayId} review reject --reason "..."`);
  console.error('');
}

/**
 * Approve a task review
 */
export async function runReviewApprove(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);
  const details = getTaskDetails(store, taskId);

  if (!details) {
    console.error(`[crew] Task not found: ${taskId}`);
    process.exit(1);
  }

  const { task, epic, displayId } = details;

  if (task.status !== ('awaiting_review' as any)) {
    console.error(`[crew] Task ${displayId} is not awaiting review (status: ${task.status})`);
    process.exit(1);
  }

  const result = submitReview(store, task, epic, 'approve', {
    reviewer: 'human:cli',
    feedback: flags.comment as string || undefined,
  });

  console.error('');
  console.error(`✓ Task ${displayId} approved`);
  console.error(`  Status: done`);
  if (result.feedback) {
    console.error(`  Comment: ${result.feedback}`);
  }
  console.error('');
}

/**
 * Request changes on a task review
 */
export async function runReviewRequestChanges(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);
  const details = getTaskDetails(store, taskId);

  if (!details) {
    console.error(`[crew] Task not found: ${taskId}`);
    process.exit(1);
  }

  const { task, epic, displayId } = details;

  if (task.status !== ('awaiting_review' as any)) {
    console.error(`[crew] Task ${displayId} is not awaiting review (status: ${task.status})`);
    process.exit(1);
  }

  const reason = flags.reason as string;
  if (!reason) {
    console.error(`[crew] --reason is required for request-changes`);
    console.error(`[crew] Usage: crew task ${displayId} review request-changes --reason "..."`);
    process.exit(1);
  }

  submitReview(store, task, epic, 'request-changes', {
    reviewer: 'human:cli',
    feedback: reason,
  });

  console.error('');
  console.error(`↻ Task ${displayId} — changes requested`);
  console.error(`  Status: active (will be re-executed with feedback)`);
  console.error(`  Feedback: ${reason}`);
  console.error('');
}

/**
 * Reject a task review
 */
export async function runReviewReject(
  projectDir: string,
  taskId: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const store = await loadStore(absDir);
  const details = getTaskDetails(store, taskId);

  if (!details) {
    console.error(`[crew] Task not found: ${taskId}`);
    process.exit(1);
  }

  const { task, epic, displayId } = details;

  if (task.status !== ('awaiting_review' as any)) {
    console.error(`[crew] Task ${displayId} is not awaiting review (status: ${task.status})`);
    process.exit(1);
  }

  const reason = flags.reason as string;
  if (!reason) {
    console.error(`[crew] --reason is required for reject`);
    console.error(`[crew] Usage: crew task ${displayId} review reject --reason "..."`);
    process.exit(1);
  }

  submitReview(store, task, epic, 'reject', {
    reviewer: 'human:cli',
    feedback: reason,
  });

  console.error('');
  console.error(`✗ Task ${displayId} — rejected`);
  console.error(`  Status: failed (no retry)`);
  console.error(`  Reason: ${reason}`);
  console.error('');
}

/**
 * Route review subcommands for a specific task
 */
export async function handleTaskReviewCommand(
  projectDir: string,
  taskId: string,
  reviewAction: string | undefined,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  switch (reviewAction) {
    case 'show':
      await runReviewShow(projectDir, taskId, flags);
      break;
    case 'approve':
      await runReviewApprove(projectDir, taskId, flags);
      break;
    case 'request-changes':
      await runReviewRequestChanges(projectDir, taskId, flags);
      break;
    case 'reject':
      await runReviewReject(projectDir, taskId, flags);
      break;
    default:
      // Default to show when no action specified
      await runReviewShow(projectDir, taskId, flags);
      break;
  }
}
