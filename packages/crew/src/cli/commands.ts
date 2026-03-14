#!/usr/bin/env node
/**
 * CLI command dispatcher
 *
 * This file is now minimal - it only routes commands to their dedicated handlers.
 * All command logic has been moved to dedicated *-cmd.ts files.
 */

import type { ParsedArgs } from './types.ts';

// Import all command handlers
import { handlePlanCommand } from './plan-cmd.ts';
import { handleTaskCommand } from './task-cmd.ts';
import { handleEpicCommand } from './epic-cmd.ts';
import { runInit } from './init-cmd.ts';
import { runStatus } from './status-cmd.ts';
import { runTask } from './run-cmd.ts';
import { runSync } from './sync-cmd.ts';
import { runTree } from './tree-cmd.ts';
import { runVerify } from './verify-cmd.ts';
import { runSearch } from './search-cmd.ts';
import { runReviewList } from './review-cmd.ts';
import { runChat } from './chat-cmd.ts';

/**
 * Main command dispatcher
 */
export async function dispatch(args: ParsedArgs): Promise<void> {
  const { command, projectDir, taskIdOrNext, subcommand, subcommandArgs, flags } = args;

  if (flags.help) {
    const { showHelp } = await import('./args.ts');
    showHelp();
    process.exit(0);
  }

  // Validate projectDir is provided (either via --project or auto-detected)
  // init command can work without existing .crew folder - default to cwd
  if (!projectDir) {
    if (command === 'init') {
      args.projectDir = process.cwd();
    } else {
      console.error(`[crew] Error: No project directory specified.`);
      console.error(`[crew] Use --project=<path> or run from within a project (with .crew folder).`);
      console.error(`[crew] Run \`crew --help\` for usage information.`);
      process.exit(1);
    }
  }

  switch (command) {
    case 'plan':
      await handlePlanCommand(projectDir, subcommand, subcommandArgs, flags);
      break;
    case 'run':
      await runTask(projectDir, taskIdOrNext ?? '', flags);
      break;
    case 'verify':
      await runVerify(projectDir);
      break;
    case 'status':
      await runStatus(projectDir, flags);
      break;
    case 'init':
      await runInit(projectDir, flags);
      break;
    case 'sync':
      await runSync(projectDir);
      break;
    case 'tree':
      await runTree(projectDir);
      break;
    case 'task':
      await handleTaskCommand(projectDir, taskIdOrNext, subcommand, subcommandArgs, flags);
      break;
    case 'epic':
      await handleEpicCommand(projectDir, taskIdOrNext, subcommand, subcommandArgs, flags);
      break;
    case 'search':
      await runSearch(projectDir, taskIdOrNext || '', flags);
      break;
    case 'review':
      await runReviewList(projectDir, flags);
      break;
    case 'chat':
      await runChat(projectDir, flags);
      break;
    default:
      console.error(`[crew] Unknown command: ${command}`);
      console.error(`[crew] Run \`crew --help\` for usage`);
      process.exit(1);
  }
}

// Re-export for backward compatibility
export { handlePlanCommand as runPlan };
