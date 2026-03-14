#!/usr/bin/env node
/**
 * crew CLI — reactive agentic project orchestrator.
 *
 * @deprecated Import from `./cli/index.ts` instead. This file is kept for backward compatibility.
 */

// Re-export all named exports
export * from './cli/index.ts';

// Re-run main if this file is executed directly
import { setDefaultProvider } from '@crew/agentfn';
import { parseArgs } from './cli/args.ts';
import { dispatch } from './cli/commands.ts';

setDefaultProvider('kimi');

async function main(): Promise<void> {
  const args = parseArgs();
  await dispatch(args);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
