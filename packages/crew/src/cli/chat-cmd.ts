/**
 * crew chat — Launch an interactive Claude session with the crewman agent preloaded.
 *
 * Syncs agents/skills from .crew/ into .claude/ then spawns `claude` in the
 * project directory so the crewman agent and skill are available.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { validateProjectDir } from './utils.ts';
import { syncAgentsToClaude, syncSkillsToClaude } from './init-cmd.ts';

export async function runChat(
  projectDir: string,
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const absDir = validateProjectDir(projectDir);
  const crewDir = join(absDir, '.crew');

  if (!existsSync(crewDir)) {
    console.error('[crew] No .crew folder found. Run `crew init` first.');
    process.exit(1);
  }

  // Sync agents and skills into .claude/ so claude CLI picks them up
  const agents = syncAgentsToClaude(absDir);
  const skills = syncSkillsToClaude(absDir);

  if (agents.length > 0) {
    console.error(`[crew] Synced agents: ${agents.join(', ')}`);
  }
  if (skills.length > 0) {
    console.error(`[crew] Synced skills: ${skills.join(', ')}`);
  }

  // Build claude CLI args
  const args: string[] = [];

  // If user passed --resume, forward it
  if (typeof flags.resume === 'string') {
    args.push('--resume', flags.resume);
  }

  // If user passed --print / -p, forward a one-shot prompt instead of interactive
  if (typeof flags.p === 'string') {
    args.push('-p', flags.p);
  } else if (typeof flags.print === 'string') {
    args.push('-p', flags.print);
  }

  console.error(`[crew] Launching claude with crewman agent...`);

  // Spawn claude as an interactive child process (inherit stdio for terminal)
  const child = spawn('claude', args, {
    cwd: absDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('[crew] Error: `claude` CLI not found. Install it first:');
      console.error('  npm install -g @anthropic-ai/claude-code');
    } else {
      console.error(`[crew] Error launching claude: ${err.message}`);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
