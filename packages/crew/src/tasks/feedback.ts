/**
 * Task Feedback — send structured follow-up prompts after oneshot task execution.
 *
 * After an agent completes a task, this module sends a follow-up message
 * asking for a structured completion report (status, summary, errors,
 * follow-up actions) and saves it as markdown in the plan directory.
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { agentSendFeedback } from '@crew/agentfn';
import type { Provider } from '@crew/agentfn';
import type { TaskContext, AgentResult } from './types.ts';
import { numberedSlug } from '../store/slug-utils.ts';

/* ------------------------------------------------------------------ */
/*  Standard Feedback Prompt                                          */
/* ------------------------------------------------------------------ */

/**
 * Standard follow-up prompt for task completion reports.
 *
 * Asks the agent to produce a structured XML report with:
 * - Task status (completed | partial | failed)
 * - Summary of what was done
 * - Errors encountered
 * - Follow-up action suggestions
 */
export const TASK_COMPLETION_PROMPT = `Now that you have finished the task, provide a structured completion report.

Respond ONLY with the following XML — no other text before or after:

<task-report>
  <status>completed | partial | failed</status>
  <summary>
    A concise summary of what you did (2-4 sentences).
    Include key files created or modified.
  </summary>
  <errors>
    List any errors encountered, or "none" if everything succeeded.
    Include error messages and which step they occurred in.
  </errors>
  <follow-up-actions>
    Suggest 1-3 concrete next steps the user should take.
    Each action should be specific and actionable.
  </follow-up-actions>
</task-report>`;

/* ------------------------------------------------------------------ */
/*  Report Parsing                                                    */
/* ------------------------------------------------------------------ */

export interface TaskCompletionReport {
  status: "completed" | "partial" | "failed";
  summary: string;
  errors: string;
  followUpActions: string;
}

/**
 * Parse a task completion report from XML output.
 * Falls back to raw text if XML parsing fails.
 */
export function parseTaskReport(raw: string): TaskCompletionReport {
  const extract = (tag: string): string => {
    const match = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return match ? match[1].trim() : "";
  };

  const statusRaw = extract("status");
  const status = (["completed", "partial", "failed"].includes(statusRaw)
    ? statusRaw
    : "partial") as TaskCompletionReport["status"];

  return {
    status,
    summary: extract("summary") || raw.slice(0, 500),
    errors: extract("errors") || "none",
    followUpActions: extract("follow-up-actions") || "none",
  };
}

/* ------------------------------------------------------------------ */
/*  Report Formatting                                                 */
/* ------------------------------------------------------------------ */

/**
 * Format a TaskCompletionReport as a markdown document.
 */
export function formatReportAsMarkdown(
  report: TaskCompletionReport,
  meta?: {
    taskId?: string;
    taskTitle?: string;
    epicTitle?: string;
    durationMs?: number;
    timestamp?: string;
  },
): string {
  const lines: string[] = [];

  const title = meta?.taskTitle || "Task Completion Report";
  lines.push(`# ${title}`);
  lines.push("");

  if (meta) {
    lines.push("## Metadata");
    lines.push("");
    if (meta.taskId) lines.push(`- **Task ID:** ${meta.taskId}`);
    if (meta.epicTitle) lines.push(`- **Epic:** ${meta.epicTitle}`);
    if (meta.durationMs) lines.push(`- **Duration:** ${(meta.durationMs / 1000).toFixed(1)}s`);
    lines.push(`- **Timestamp:** ${meta.timestamp || new Date().toISOString()}`);
    lines.push("");
  }

  const statusLabel =
    report.status === "completed" ? "DONE" :
    report.status === "partial" ? "PARTIAL" :
    "FAILED";
  lines.push(`## Status: ${statusLabel}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  if (report.errors && report.errors !== "none") {
    lines.push("## Errors");
    lines.push("");
    lines.push(report.errors);
    lines.push("");
  }

  if (report.followUpActions && report.followUpActions !== "none") {
    lines.push("## Follow-up Actions");
    lines.push("");
    lines.push(report.followUpActions);
    lines.push("");
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Send Feedback & Save Report                                       */
/* ------------------------------------------------------------------ */

export interface ReportResult {
  report: TaskCompletionReport;
  markdown: string;
  savedPath?: string;
  raw: string;
  durationMs: number;
}

/**
 * Send a feedback follow-up to a completed agent session and save the
 * structured report as markdown in the plan directory.
 *
 * If the agent has no sessionId (non-Claude provider or placeholder),
 * the feedback step is skipped and a synthetic report is generated
 * from the original result.
 */
export async function collectTaskReport(
  ctx: TaskContext,
  agentResult: AgentResult,
): Promise<ReportResult> {
  const timestamp = new Date().toISOString();

  // If no sessionId, generate a synthetic report from the result
  if (!agentResult.sessionId) {
    ctx.log.debug("No sessionId available, generating synthetic report");
    const report: TaskCompletionReport = {
      status: agentResult.success ? "completed" : "failed",
      summary: agentResult.output || "Task executed (no session feedback available)",
      errors: agentResult.error || "none",
      followUpActions: "none",
    };
    const markdown = formatReportAsMarkdown(report, {
      taskId: ctx.taskId,
      taskTitle: ctx.task.title,
      epicTitle: ctx.epic.title,
      durationMs: agentResult.durationMs,
      timestamp,
    });
    const savedPath = saveReport(ctx, markdown);
    return { report, markdown, savedPath, raw: agentResult.output, durationMs: 0 };
  }

  // Send follow-up to the agent session
  ctx.log.info("Sending feedback follow-up to agent session", {
    sessionId: agentResult.sessionId,
  });

  try {
    const provider = (ctx.buildCtx as { provider?: string }).provider as Provider | undefined;
    const feedbackResult = await agentSendFeedback({
      sessionId: agentResult.sessionId,
      prompt: TASK_COMPLETION_PROMPT,
      provider,
      cwd: ctx.buildCtx.appDir,
      timeoutMs: 60_000,
    });

    const report = parseTaskReport(feedbackResult.raw);
    const markdown = formatReportAsMarkdown(report, {
      taskId: ctx.taskId,
      taskTitle: ctx.task.title,
      epicTitle: ctx.epic.title,
      durationMs: agentResult.durationMs,
      timestamp,
    });

    const savedPath = saveReport(ctx, markdown);

    ctx.log.info("Task feedback collected", {
      status: report.status,
      savedPath,
    });

    return {
      report,
      markdown,
      savedPath,
      raw: feedbackResult.raw,
      durationMs: feedbackResult.durationMs,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.warn(`Feedback collection failed: ${err.message}`);

    // Fall back to synthetic report
    const report: TaskCompletionReport = {
      status: agentResult.success ? "completed" : "failed",
      summary: agentResult.output || "Task executed (feedback collection failed)",
      errors: agentResult.error || "none",
      followUpActions: "none",
    };
    const markdown = formatReportAsMarkdown(report, {
      taskId: ctx.taskId,
      taskTitle: ctx.task.title,
      epicTitle: ctx.epic.title,
      durationMs: agentResult.durationMs,
      timestamp,
    });
    const savedPath = saveReport(ctx, markdown);
    return { report, markdown, savedPath, raw: agentResult.output, durationMs: 0 };
  }
}

/**
 * Save a report markdown file in the plan directory.
 *
 * Path: .crew/epics/{epic}/tasks/{taskId}/report.md
 */
function saveReport(ctx: TaskContext, markdown: string): string | undefined {
  try {
    const planDir = join(ctx.buildCtx.appDir, '.crew', 'epics');

    // Compute epic slug using number + title (e.g., "02-page-homepage")
    const epicSlug = numberedSlug(ctx.epic.num, ctx.epic.title || 'untitled-epic');

    // Parse task number from display ID (e.g., "m2.1" → task number 1)
    // ctx.taskId format: "m<epicNum>.<taskNum>"
    const taskNumMatch = ctx.taskId.match(/\.(\d+)$/);
    const taskNum = taskNumMatch ? parseInt(taskNumMatch[1], 10) : 1;

    // Compute task slug using number + title (e.g., "01-build-component-spec-for-homepage")
    const taskSlug = numberedSlug(taskNum, ctx.task.title || 'untitled-task');

    // Construct path: .crew/epics/02-page-homepage/tasks/01-build-component-spec-for-homepage
    const taskReportDir = join(planDir, epicSlug, 'tasks', taskSlug);

    mkdirSync(taskReportDir, { recursive: true });

    const reportPath = join(taskReportDir, 'report.md');
    writeFileSync(reportPath, markdown, 'utf-8');

    return reportPath;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.log.warn(`Failed to save report: ${err.message}`);
    return undefined;
  }
}
