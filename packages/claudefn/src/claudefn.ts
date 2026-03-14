import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ClaudeFnOptions,
  ClaudeFnResult,
  ClaudeFn,
  PromptInput,
} from "./types.js";
import { GlobalQueue, getDefaultQueue } from "./queue.js";
import type { GlobalQueueOptions } from "./queue.js";
import { extractJson, resolvePrompt } from "./utils.js";

/** Resolve the queue option to a GlobalQueue instance or null */
function resolveQueue(
  option: ClaudeFnOptions["queue"],
): GlobalQueue | null {
  if (!option) return null;
  if (option === true) return getDefaultQueue();
  if (option instanceof GlobalQueue) return option;
  return getDefaultQueue(option as GlobalQueueOptions);
}

/**
 * Create a callable function backed by the Claude Code CLI.
 *
 * Spawns `claude --dangerously-skip-permissions -p "..."` and returns the result.
 *
 * @example
 * ```typescript
 * const fn = claudefn({ prompt: "Translate {{input}} to French" });
 * const { data } = await fn("hello");
 * ```
 */
export function claudefn<T = string>(
  options?: ClaudeFnOptions<T>,
): ClaudeFn<T> {
  const opts = options ?? ({} as ClaudeFnOptions<T>);

  const {
    prompt: promptTemplate,
    schema,
    hooks,
    timeoutMs = 120_000,
    cliFlags = [],
    maxRetries = 0,
    cwd,
    queue: queueOption,
    allowedTools,
    mode = "call",
    systemPrompt,
    systemPromptFile,
    signal,
  } = opts;

  const queue = resolveQueue(queueOption);

  return async (input?: string): Promise<ClaudeFnResult<T>> => {
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const run = () =>
          executeViaCli(
            promptTemplate,
            input,
            schema,
            hooks,
            timeoutMs,
            cliFlags,
            cwd,
            allowedTools,
            mode,
            systemPrompt,
            signal,
            systemPromptFile,
          );
        return queue ? await queue.wrap(run) : await run();
      } catch (err: unknown) {
        lastError = err as Error;
        if (attempt > maxRetries) break;
      }
    }

    throw lastError!;
  };
}

// ─── CLI Execution ──────────────────────────────────────────

export async function executeViaCli<T>(
  promptTemplate: PromptInput | undefined,
  input: string | undefined,
  schema: ClaudeFnOptions<T>["schema"],
  hooks: ClaudeFnOptions<T>["hooks"],
  timeoutMs: number,
  cliFlags: string[],
  cwd: string | undefined,
  allowedTools: string[] | undefined,
  mode: ClaudeFnOptions<T>["mode"] = "call",
  systemPrompt?: string,
  signal?: AbortSignal,
  systemPromptFile?: string,
): Promise<ClaudeFnResult<T>> {
  let prompt: string;
  if (promptTemplate) {
    prompt = resolvePrompt(promptTemplate, input);
  } else if (input != null) {
    prompt = input;
  } else {
    throw new Error(
      'claudefn requires either a "prompt" option or an input argument',
    );
  }

  // before hook
  if (hooks?.before) {
    const modified = await hooks.before({ prompt });
    if (typeof modified === "string") {
      prompt = modified;
    }
  }

  const start = Date.now();

  const useStream = mode === "stream" || !!hooks?.onStream;

  // Generate a session ID so we can resume this conversation later
  // Note: --session-id expects a pure UUID, not prefixed with "session-"
  const sessionId = randomUUID();

  // When the system prompt is too large for CLI args,
  // write to a temp .md file and use --append-system-prompt-file.
  // (User prompt is piped via stdin so it has no size limit.)
  const SAFE_ARG_LIMIT = 30_000;
  let tempSystemPromptFile: string | undefined;

  // Resolve system prompt file: explicit file takes priority,
  // then fall back to writing a temp file for large inline prompts.
  let resolvedSystemPromptFile = systemPromptFile;
  if (!resolvedSystemPromptFile && systemPrompt && systemPrompt.length > SAFE_ARG_LIMIT) {
    tempSystemPromptFile = join(tmpdir(), `claudefn-sysprompt-${sessionId}.md`);
    writeFileSync(tempSystemPromptFile, systemPrompt, "utf-8");
    resolvedSystemPromptFile = tempSystemPromptFile;
  }

  const args = [
    "--dangerously-skip-permissions",
    // Prompt is piped via stdin to avoid CLI arg length limits
    "-p",
    "--session-id",
    sessionId,
    // System prompt: prefer file-based delivery to avoid CLI arg limits
    ...(resolvedSystemPromptFile
      ? ["--append-system-prompt-file", resolvedSystemPromptFile]
      : systemPrompt
        ? ["--append-system-prompt", systemPrompt]
        : []),
    ...(useStream ? ["--output-format", "stream-json", "--verbose"] : []),
    ...(allowedTools?.length
      ? ["--allowedTools", allowedTools.join(",")]
      : []),
    ...cliFlags,
  ];

  const raw = await new Promise<string>((resolve, reject) => {
    const onStream = hooks?.onStream;

    /** Emit a formatted chunk to the onStream callback */
    const emit = (text: string): void => { if (text) onStream?.(text); };

    /** Parse one stream-json event and emit human-readable text */
    const handleEvent = (event: any): void => {
      if (event.type === "assistant" && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            emit(block.text);
          } else if (block.type === "tool_use") {
            const inputPreview = JSON.stringify(block.input ?? {}).slice(0, 120);
            emit(`\n[tool:${block.name}] ${inputPreview}\n`);
          }
        }
      }
      // Tool results live in user messages
      if (event.type === "user" && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            const resultText = Array.isArray(block.content)
              ? block.content
                  .filter((b: any) => b.type === "text")
                  .map((b: any) => b.text ?? "")
                  .join("")
                  .slice(0, 200)
              : String(block.content ?? "").slice(0, 200);
            if (resultText) emit(`[result] ${resultText}\n`);
          }
        }
      }
      // Capture final result text from the result event
      if (event.type === "result" && typeof event.result === "string") {
        resultText = event.result;
      }
    };

    const proc = spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on large prompts
    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdoutRaw = "";
    let resultText = "";
    let stderr = "";
    let settled = false;
    let lineBuffer = "";

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error(`claudefn timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    if (useStream) {
      // Parse stdout as JSONL events and stream text to onStream
      proc.stdout.on("data", (chunk: Buffer) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handleEvent(JSON.parse(line)); } catch { /* skip malformed */ }
        }
      });
    } else {
      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutRaw += chunk.toString();
      });
    }

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        const msg = stderr.trim() || `claude exited with exit code ${code}`;
        reject(new Error(msg));
      } else {
        resolve(useStream ? resultText : stdoutRaw);
      }
    });

    // Abort signal — kill the child process on external cancellation
    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        proc.kill('SIGTERM');
        reject(new Error('claudefn aborted via signal'));
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });

  // Clean up temp system prompt file if we created one
  if (tempSystemPromptFile) {
    try { unlinkSync(tempSystemPromptFile); } catch { /* ignore */ }
  }

  const durationMs = Date.now() - start;

  // after hook
  if (hooks?.after) {
    await hooks.after({ result: raw, durationMs });
  }

  // Schema parsing
  let data: T;
  if (schema) {
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);
    data = schema.parse(parsed);
  } else {
    data = raw as unknown as T;
  }

  return { data, raw, durationMs, sessionId };
}

// ─── Feedback / Resume ──────────────────────────────────────

export interface SendFeedbackOptions {
  /** Session ID from the original call */
  sessionId: string;
  /** Follow-up prompt to send */
  prompt: string;
  /** Working directory */
  cwd?: string;
  /** Max time in ms (default: 120_000) */
  timeoutMs?: number;
  /** Extra CLI flags */
  cliFlags?: string[];
  /** Allowed tools for the follow-up */
  allowedTools?: string[];
}

/**
 * Send a follow-up message to an existing Claude session.
 *
 * Uses `claude --resume <sessionId> -p "..."` to continue the conversation,
 * allowing the agent to access its full prior context.
 */
export async function sendFeedback(
  opts: SendFeedbackOptions,
): Promise<ClaudeFnResult<string>> {
  const {
    sessionId,
    prompt,
    cwd,
    timeoutMs = 120_000,
    cliFlags = [],
    allowedTools,
  } = opts;

  const start = Date.now();

  const args = [
    "--dangerously-skip-permissions",
    "--resume",
    sessionId,
    // Prompt is piped via stdin to avoid CLI arg length limits
    "-p",
    ...(allowedTools?.length
      ? ["--allowedTools", allowedTools.join(",")]
      : []),
    ...cliFlags,
  ];

  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on large prompts
    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdoutRaw = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error(`sendFeedback timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutRaw += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        const msg = stderr.trim() || `claude exited with exit code ${code}`;
        reject(new Error(msg));
      } else {
        resolve(stdoutRaw);
      }
    });
  });

  const durationMs = Date.now() - start;

  return { data: raw, raw, durationMs, sessionId };
}
