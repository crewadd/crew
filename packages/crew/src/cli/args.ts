#!/usr/bin/env node
/**
 * CLI argument parsing.
 * 
 * Works like webpack:
 * - From outside project: crew --project ./my-app plan
 * - From inside project: crew plan (auto-detects via .crew folder)
 */

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Command, ParsedArgs, TaskSubcommand, EpicSubcommand } from './types.ts';

const COMMAND_LIST = ['plan', 'run', 'verify', 'status', 'init', 'sync', 'tree', 'task', 'epic', 'search', 'review', 'chat'] as const;
const TASK_SUBCOMMANDS = ['add', 'edit', 'remove', 'next', 'review', 'reset'] as const;
const EPIC_SUBCOMMANDS = ['add', 'edit', 'remove'] as const;
const PLAN_SUBCOMMANDS = ['init', 'reset'] as const;

/**
 * Find project root by looking for .crew directory marker.
 * Walks up the directory tree from current working directory.
 */
function findProjectRoot(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, '.crew'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      if (rest.length > 0) {
        // --key=value format
        flags[key] = rest.join('=');
      } else {
        // --key value format or --key (boolean)
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          flags[key] = nextArg;
          i++; // Skip the value
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short flag: -f or -f value (not just -)
      const key = arg.slice(1);
      // Check if next arg is a value (not another flag)
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        flags[key] = nextArg;
        i++; // Skip the value
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  let command: Command = 'status';
  let projectDir = '';
  let taskIdOrNext: string | undefined;
  let subcommand: TaskSubcommand | EpicSubcommand | undefined;
  let subcommandArgs: string[] | undefined;

  // Check for --project flag first
  const projectFlag = flags.project;
  if (typeof projectFlag === 'string') {
    projectDir = projectFlag;
  }

  // Parse command and remaining positionals
  let cmdIndex = 0;
  if (positionals[0] && (COMMAND_LIST as readonly string[]).includes(positionals[0])) {
    command = positionals[0] as Command;
    cmdIndex = 1;
  }

  // For task/epic/plan: check for subcommands
  if (command === 'task' || command === 'epic' || command === 'plan') {
    const possibleSubcommand = positionals[cmdIndex];
    let validSubcommands: readonly string[];

    if (command === 'task') {
      validSubcommands = TASK_SUBCOMMANDS;
    } else if (command === 'epic') {
      validSubcommands = EPIC_SUBCOMMANDS;
    } else {
      validSubcommands = PLAN_SUBCOMMANDS;
    }

    if (possibleSubcommand && validSubcommands.includes(possibleSubcommand)) {
      subcommand = possibleSubcommand as TaskSubcommand | EpicSubcommand;
      cmdIndex++;
      // Remaining args are subcommand args
      if (cmdIndex < positionals.length) {
        subcommandArgs = positionals.slice(cmdIndex);
      }
    } else if (command !== 'plan') {
      // No subcommand, treat first positional as ID for view operation
      // (only for task/epic, plan defaults to view if no subcommand)
      taskIdOrNext = positionals[cmdIndex];
      cmdIndex++;

      // Check for inline subcommand after task ID: crew task m2.3 review approve
      if (command === 'task' && positionals[cmdIndex] && validSubcommands.includes(positionals[cmdIndex])) {
        subcommand = positionals[cmdIndex] as TaskSubcommand;
        cmdIndex++;
        if (cmdIndex < positionals.length) {
          subcommandArgs = positionals.slice(cmdIndex);
        }
      }
    }
  } else if (command === 'run') {
    // For run: crew run [taskId]
    taskIdOrNext = positionals[cmdIndex];
  } else if (command === 'search') {
    // For search: crew search [pattern]
    taskIdOrNext = positionals[cmdIndex];
  }

  // If no --project flag, try to auto-detect from .crew folder
  if (!projectDir) {
    const autoDetected = findProjectRoot();
    if (autoDetected) {
      projectDir = autoDetected;
    }
  }

  return { command, projectDir, taskIdOrNext, subcommand, subcommandArgs, flags };
}

export function showHelp(): void {
  console.error(`
crew — Reactive agentic project orchestrator

USAGE:
  crew [options] <command>
  crew --project <path> <command>

COMMANDS:
  init [-f] [--name <n>]            Initialize project (use -f to sync from .claude/)
  chat                              Chat with the crewman agent interactively
  plan [init|reset]                 View plan (or init/reset with subcommands)
  run [next|<id>|full]              Run all tasks autonomously (default: full)
  verify                            Run verification checks standalone
  status [--json]                   Show project status (human-readable or JSON)
  sync                              Sync agents/skills to .claude/
  tree                              Show project structure as navigable tree
  task <id>                         View details for specific task
  epic <id>                    View details for specific epic
  search [pattern]                  Show search patterns for finding tasks

OPTIONS:
  --project=<path>                  Project directory (auto-detected if in .crew project)
  --help                            Show this help

EXAMPLES:
  # Inside a project (with .crew folder)
  crew plan
  crew run next
  crew status

  # From outside project
  crew --project ./my-app plan
  crew --project ./my-app run m2.1
  crew --project ./my-app status

INIT COMMAND:
  crew init                      Create config in current directory
  crew init -f                   Force re-initialization (overwrite existing)
  crew --project ./my-app init   Create config in specified directory

PLAN COMMAND:
  crew plan                      View existing plan summary
  crew plan init                 Create plan using crew.json
  crew plan init --dry-run       Validate config without creating plan (dry run)
  crew plan init --dry           Same as --dry-run
  crew plan reset                Reset plan (delete and reinitialize)
  crew plan --yields <path>      Import tasks from yields.json file
  crew --project ./my-app plan   View plan for specified project

RUN COMMAND:
  crew run                       Run all tasks autonomously until completion (default)
  crew run full                  Same as above (full auto mode)
  crew run next                  Run a single task and stop
  crew run auto                  Same as next (single task)
  crew run m2.2                  Run specific task m2.2
  crew run m2.2 --checks         Run only checks for m2.2 (skip execution)
  crew run m2.2 --resume         Resume m2.2 from previous session checkpoint
  crew run next --ai             Ask AI to diagnose and report how to unblock
  crew run --until m2.2          Run tasks until m2.2 completes, then stop
  crew run next --loop           Keep running next tasks in a loop
  crew run --from m3.2           Reset m3.2 + dependents to pending, then run all
  crew run --from m3.2 --until m3.5  Resume from m3.2, stop after m3.5

STATUS COMMAND:
  crew status                    Show AI-optimized project status (default)
  crew status --json             Machine-readable JSON
  crew status --minimal          Minimal multi-line format
  crew status --inline           One-line inline format
  crew status --agents           Include agent workload dashboard
  crew status --activity         Show extended activity history
  crew status --blockers         Show all blockers grouped by epic

TASK COMMAND:
  crew task <id>                 View details for specific task
  crew task m4.1                 Show task m4.1 details
  crew task m4.1 --json          JSON output
  crew task next                 Show next upcoming ready task
  crew task next --json          JSON output for next task
  crew task add "<title>" --epic <n>  Create new task
  crew task add "<title>" --epic <n> --assignee <a>  Set assignee
  crew task add "<title>" --epic <n> --input "<i>"  Set input description
  crew task add "<title>" --epic <n> --output "<o>"  Set output description
  crew task add "<title>" --epic <n> --prompt "<p>"  Set task prompt
  crew task edit <id> --status <s>  Update task status
  crew task edit <id> --assignee <a>  Update assignee
  crew task edit <id> --input "<i>"  Update input
  crew task edit <id> --output "<o>"  Update output
  crew task edit <id> --prompt "<p>"  Update prompt
  crew task edit <id> --add-dep <id>  Add dependency
  crew task remove <id>          Delete task
  crew task <id> reset           Reset task to pending, clear events
  crew task <id> reset --deps    Reset task and all dependents
  crew task <id> reset --yes     Skip confirmation prompt

EPIC COMMAND:
  crew epic <id>            View details for specific epic
  crew epic m4              Show epic 4 details
  crew epic m4 --json       JSON output
  crew epic add "<title>"   Create new epic
  crew epic edit <n> --title "<t>"  Update epic title
  crew epic remove <n>      Delete epic

CHAT COMMAND:
  crew chat                      Launch interactive Claude session with crewman agent
  crew chat --resume <id>        Resume a previous chat session
  crew chat -p "question"        One-shot prompt with crewman context

SYNC COMMAND:
  crew sync                      Sync agents/skills to .claude/

TREE COMMAND:
  crew tree                      Show hierarchical project structure
  crew tree --project ./app      Show tree for specific project

SEARCH COMMAND:
  crew search                    Show all search patterns
  crew search quick              Show quick reference
  crew search <pattern>          Show specific pattern (e.g., "status", "assignee")

SEARCH EXAMPLES:
  crew search                    # List all search patterns
  crew search quick              # Show quick reference
  crew search status             # Show how to search by status
  crew search title              # Show how to search by title
  crew search assignee           # Show how to search by assignee
  crew search epic          # Show how to list tasks in epic

CONFIGURATION:
  crew looks for crew.json (or crew.config.{ts,js,mjs}) in the project root.
  When inside a project (directory containing .crew folder), the project
  path is auto-detected. Otherwise, use --project to specify the path.

  @example
  // crew.json - JSON configuration (recommended)
  {
    "name": "My Project",
    "setup": ".crew/setup"
  }
    name: 'My Project',
    
    async onInitPlan(ctx) {
      const plan = ctx.createPlan('My Project Enhancement');
      plan
        .addEpic(ctx.createEpic('bootstrap', 'Bootstrap')
          .addTask(ctx.createTask('install', 'Install').skill('repo/install')));
      return plan.build();
    }
  };
`);
}
