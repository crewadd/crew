/**
 * Task Tools Implementation
 *
 * Provides file, shell, and git tools for task execution.
 * Projects can extend with additional tools via setup.
 */

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
// @ts-ignore - glob package may not be installed
import { glob as globCallback } from 'glob';
import type {
  FileTools,
  ShellTools,
  GitTools,
  ShellResult,
} from './types.ts';
import type { BuildContext } from '../types.ts';

const execAsync = promisify(exec);
const globAsync = promisify(globCallback);

export interface CreateToolsOptions {
  buildCtx: BuildContext;
}

export function createTools(opts: CreateToolsOptions): {
  file: FileTools;
  shell: ShellTools;
  git: GitTools;
} {
  const projectDir = opts.buildCtx.appDir;

  /* ------------------------------------------------------------------ */
  /*  File Tools                                                        */
  /* ------------------------------------------------------------------ */

  const file: FileTools = {
    async read(path: string): Promise<string> {
      const fullPath = join(projectDir, path);
      return readFile(fullPath, 'utf-8');
    },

    async write(path: string, content: string): Promise<void> {
      const fullPath = join(projectDir, path);
      // Ensure directory exists
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
    },

    async exists(path: string): Promise<boolean> {
      const fullPath = join(projectDir, path);
      return existsSync(fullPath);
    },

    async glob(pattern: string): Promise<string[]> {
      const results = await globAsync(pattern, { cwd: projectDir });
      return (results as string[]).map(String);
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Shell Tools                                                       */
  /* ------------------------------------------------------------------ */

  const shell: ShellTools = {
    async run(command: string, opts?: { cwd?: string; env?: Record<string, string> }): Promise<ShellResult> {
      const cwd = opts?.cwd ? join(projectDir, opts.cwd) : projectDir;

      // On Windows, cmd checks use bash syntax (pipes, /dev/null, grep, etc.)
      // Force bash as the shell so these commands work on Windows (Git Bash / WSL).
      const shellOpt = platform() === 'win32'
        ? { shell: process.env.SHELL || 'bash' }
        : {};

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          env: { ...process.env, ...opts?.env },
          timeout: 300000, // 5 minutes
          ...shellOpt,
        });

        return {
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: 0,
        };
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; code?: number };
        return {
          stdout: err.stdout || '',
          stderr: err.stderr || '',
          exitCode: err.code || 1,
        };
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Git Tools                                                         */
  /* ------------------------------------------------------------------ */

  const git: GitTools = {
    async status(): Promise<string> {
      const result = await shell.run('git status --short');
      return result.stdout;
    },

    async diff(): Promise<string> {
      const result = await shell.run('git diff');
      return result.stdout;
    },

    async add(paths: string[]): Promise<void> {
      const args = paths.map(p => JSON.stringify(p)).join(' ');
      await shell.run(`git add ${args}`);
    },

    async commit(message: string): Promise<void> {
      const escapedMessage = JSON.stringify(message);
      await shell.run(`git commit -m ${escapedMessage}`);
    },
  };

  return { file, shell, git };
}
