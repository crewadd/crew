/**
 * CLI types and interfaces.
 */

export type Command = 'plan' | 'run' | 'verify' | 'status' | 'init' | 'sync' | 'tree' | 'task' | 'epic' | 'search' | 'review' | 'chat';
export type TaskSubcommand = 'add' | 'edit' | 'remove' | 'next' | 'review' | 'reset';
export type EpicSubcommand = 'add' | 'edit' | 'remove';

export interface ParsedArgs {
  command: Command;
  projectDir: string;
  taskIdOrNext?: string;
  subcommand?: TaskSubcommand | EpicSubcommand;
  subcommandArgs?: string[];
  flags: Record<string, string | boolean>;
}
