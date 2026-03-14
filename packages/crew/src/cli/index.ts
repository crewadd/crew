#!/usr/bin/env node
/**
 * crew CLI — reactive agentic project orchestrator.
 *
 * Entry point for the CLI submodule.
 */

import { setDefaultProvider } from '@crew/agentfn';
import { parseArgs } from './args.ts';
import { dispatch } from './commands.ts';
import { log } from './logger.ts';

// Set Claude as the default provider
setDefaultProvider('claude');

// ── Fatal error handlers ──────────────────────────────────────
// Ensure the footer + summary are written even on unhandled crashes.
let fatalHandled = false;

function handleFatal(error: unknown): void {
  if (fatalHandled) return; // prevent double-fire
  fatalHandled = true;
  try {
    log.fatal(error);
  } catch {
    // Last resort — don't let the handler itself crash
    console.error('Fatal (could not write summary):', error);
  }
  process.exit(1);
}

process.on('uncaughtException', handleFatal);
process.on('unhandledRejection', handleFatal);

async function main(): Promise<void> {
  const args = parseArgs();
  await dispatch(args);
}

main().catch(handleFatal);
