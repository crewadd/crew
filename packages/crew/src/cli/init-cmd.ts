/**
 * crew init command - Initialize or sync project
 * 
 * Usage:
 *   crew init              # Initialize new project
 *   crew init -f, --force  # Force re-init, sync from .claude/ if exists
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { listBuiltinPlugins, getBuiltinPluginDir } from '../plugins/builtins/index.ts';
import { numberedSlug } from '../store/slug-utils.ts';

/**
 * Copy crewman plugin's bundled agents/ and skills/ into project .crew/
 * This is the default plugin so its assets are always installed on init.
 */
function syncCrewmanAssets(projectDir: string): { agents: string[]; skills: string[] } {
  const crewmanDir = getBuiltinPluginDir('crewman');
  if (!crewmanDir || !existsSync(crewmanDir)) return { agents: [], skills: [] };

  const agents: string[] = [];
  const skills: string[] = [];

  const agentsSrc = join(crewmanDir, 'agents');
  if (existsSync(agentsSrc)) {
    const agentsDest = join(projectDir, '.crew', 'agents');
    mkdirSync(agentsDest, { recursive: true });
    cpSync(agentsSrc, agentsDest, { recursive: true });

    for (const f of readdirSync(agentsSrc).filter(f => f.endsWith('.md'))) {
      agents.push(f.replace('.md', ''));
    }
  }

  const skillsSrc = join(crewmanDir, 'skills');
  if (existsSync(skillsSrc)) {
    const skillsDest = join(projectDir, '.crew', 'skills');
    mkdirSync(skillsDest, { recursive: true });
    cpSync(skillsSrc, skillsDest, { recursive: true });

    for (const d of readdirSync(skillsSrc, { withFileTypes: true }).filter(d => d.isDirectory())) {
      skills.push(d.name);
    }
  }

  return { agents, skills };
}

export interface InitOptions {
  force?: boolean;
  name?: string;
  goal?: string;
  dir?: string;
}

export interface InitResult {
  success: boolean;
  action: 'created' | 'synced' | 'skipped';
  projectPath: string;
  agentsImported: string[];
  skillsImported: string[];
  pluginsInstalled: string[];
  epicsCreated: number;
  message: string;
}

/**
 * Parse frontmatter from markdown
 */
function parseFrontmatter(text: string): { data: Record<string, unknown>; content: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: text };
  }
  
  const yaml = match[1];
  const content = match[2].trim();
  const data: Record<string, unknown> = {};
  
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    
    // Try to parse as array
    if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      try {
        value = JSON.parse((value as string).replace(/'/g, '"'));
      } catch {
        // Keep as string
      }
    } else if ((value as string) === 'true') {
      value = true;
    } else if ((value as string) === 'false') {
      value = false;
    } else if ((value as string).match(/^\d+(\.\d+)?$/)) {
      value = parseFloat(value as string);
    }
    
    data[key] = value;
  }
  
  return { data, content };
}

/**
 * Check if project already exists
 */
function detectExistingProject(projectDir: string): {
  hasCrew: boolean;
  hasClaude: boolean;
  crewPath: string;
  claudePath: string;
} {
  const crewPath = join(projectDir, '.crew');
  const claudePath = join(projectDir, '.claude');
  
  return {
    hasCrew: existsSync(crewPath),
    hasClaude: existsSync(claudePath),
    crewPath,
    claudePath,
  };
}

/**
 * Copy agents from .claude/agents/ to .crew/agents/
 */
function syncAgents(projectDir: string): string[] {
  const claudeAgentsDir = join(projectDir, '.claude', 'agents');
  const crewAgentsDir = join(projectDir, '.crew', 'agents');
  
  if (!existsSync(claudeAgentsDir)) {
    return [];
  }
  
  mkdirSync(crewAgentsDir, { recursive: true });
  const imported: string[] = [];
  
  const files = readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    const src = join(claudeAgentsDir, file);
    const dest = join(crewAgentsDir, file);
    
    try {
      copyFileSync(src, dest);
      imported.push(file.replace('.md', ''));
    } catch {
      // Skip on error
    }
  }
  
  return imported;
}

/**
 * Copy skills from .claude/skills/ to .crew/skills/
 */
function syncSkills(projectDir: string): string[] {
  const claudeSkillsDir = join(projectDir, '.claude', 'skills');
  const crewSkillsDir = join(projectDir, '.crew', 'skills');
  
  if (!existsSync(claudeSkillsDir)) {
    return [];
  }
  
  mkdirSync(crewSkillsDir, { recursive: true });
  const imported: string[] = [];
  
  const dirs = readdirSync(claudeSkillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const dir of dirs) {
    const src = join(claudeSkillsDir, dir);
    const dest = join(crewSkillsDir, dir);
    
    try {
      if (typeof cpSync === 'function') {
        cpSync(src, dest, { recursive: true });
      } else {
        // Fallback: manual copy
        copyDirRecursive(src, dest);
      }
      imported.push(dir);
    } catch {
      // Skip on error
    }
  }
  
  return imported;
}

/**
 * Copy builtin plugins into .crew/plugins/{name}/
 * Each plugin folder gets PLUGIN.md + index.ts copied from the bundled builtins.
 */
function syncPlugins(projectDir: string): string[] {
  const crewPluginsDir = join(projectDir, '.crew', 'plugins');
  mkdirSync(crewPluginsDir, { recursive: true });
  const installed: string[] = [];

  for (const name of listBuiltinPlugins()) {
    const srcDir = getBuiltinPluginDir(name);
    if (!srcDir || !existsSync(srcDir)) continue;

    const destDir = join(crewPluginsDir, name);

    try {
      cpSync(srcDir, destDir, { recursive: true });
      installed.push(name);
    } catch {
      // Skip on error
    }
  }

  return installed;
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Sync agents from .crew/agents/ to .claude/agents/
 */
export function syncAgentsToClaude(projectDir: string): string[] {
  const crewAgentsDir = join(projectDir, '.crew', 'agents');
  const claudeAgentsDir = join(projectDir, '.claude', 'agents');
  
  if (!existsSync(crewAgentsDir)) {
    return [];
  }
  
  mkdirSync(claudeAgentsDir, { recursive: true });
  const copied: string[] = [];
  
  for (const file of readdirSync(crewAgentsDir).filter(f => f.endsWith('.md'))) {
    const src = join(crewAgentsDir, file);
    const dest = join(claudeAgentsDir, file);
    try {
      copyFileSync(src, dest);
      copied.push(file.replace('.md', ''));
    } catch {
      // Skip on error
    }
  }
  
  return copied;
}

/**
 * Sync skills from .crew/skills/ to .claude/skills/
 */
export function syncSkillsToClaude(projectDir: string): string[] {
  const crewSkillsDir = join(projectDir, '.crew', 'skills');
  const claudeSkillsDir = join(projectDir, '.claude', 'skills');
  
  if (!existsSync(crewSkillsDir)) {
    return [];
  }
  
  mkdirSync(claudeSkillsDir, { recursive: true });
  const copied: string[] = [];
  
  for (const dir of readdirSync(crewSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const src = join(crewSkillsDir, dir.name);
    const dest = join(claudeSkillsDir, dir.name);
    try {
      cpSync(src, dest, { recursive: true });
      copied.push(dir.name);
    } catch {
      // Skip on error
    }
  }
  
  return copied;
}

/**
 * Extract agent IDs from imported agents
 */
function extractAgentIds(projectDir: string): string[] {
  const crewAgentsDir = join(projectDir, '.crew', 'agents');
  if (!existsSync(crewAgentsDir)) return [];
  
  return readdirSync(crewAgentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => `agent_${f.replace('.md', '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
}

/**
 * Extract skill IDs from imported skills
 */
function extractSkillIds(projectDir: string): string[] {
  const crewSkillsDir = join(projectDir, '.crew', 'skills');
  if (!existsSync(crewSkillsDir)) return [];
  
  return readdirSync(crewSkillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => `skill_${d.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
}

/**
 * Generate default epics - HIERARCHICAL STRUCTURE
 */
function generateEpics(projectDir: string, count = 4): { ids: string[]; count: number } {
  const epicsDir = join(projectDir, '.crew', 'epics');
  mkdirSync(epicsDir, { recursive: true });
  
  const ids: string[] = [];
  const titles = ['Foundation', 'Capture', 'Analysis', 'Generation', 'Verification'];
  
  for (let i = 0; i < count; i++) {
    const id = `epic_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    ids.push(id);
    
    const title = titles[i] || `Epic ${i}`;
    const dirName = numberedSlug(i, title);
    const msDir = join(epicsDir, dirName);
    
    // Create epic directory with tasks subdirectory
    mkdirSync(msDir, { recursive: true });
    mkdirSync(join(msDir, 'tasks'), { recursive: true });
    
    const ms = {
      id,
      version: 1,
      number: i,
      title,
      status: i === 0 ? 'active' : 'planned',
      task_ids: [],
      gates: [
        {
          type: 'plan',
          required: true,
          completed: i === 0,
          message: i === 0 ? 'Foundation planning complete' : `M${i} needs planning`,
        },
      ],
      created: { at: new Date().toISOString(), by: 'agent_system' },
      updated: { at: new Date().toISOString(), by: 'agent_system' },
    };
    
    writeFileSync(
      join(msDir, 'epic.json'),
      JSON.stringify(ms, null, 2) + '\n',
      'utf-8'
    );
    
    // Create README for human-readable description
    writeFileSync(
      join(msDir, 'README.md'),
      `# ${title}\n\nEpic ${i}: ${title}\n\nStatus: ${i === 0 ? 'Active' : 'Planned'}\n`,
      'utf-8'
    );
  }
  
  return { ids, count };
}

/**
 * Generate project.json
 */
function generateProject(
  projectDir: string,
  opts: { name: string; goal: string; agents: string[]; skills: string[]; epics: string[] }
): void {
  const project = {
    version: 1,
    name: opts.name,
    description: opts.goal,
    goal: opts.goal,
    workflow: [
      { name: 'plan', description: 'Plan epic tasks' },
      { name: 'execute', description: 'Execute tasks in priority order' },
      { name: 'verify', description: 'Verify epic completion' },
    ],
    epics: opts.epics,
    agents: opts.agents,
    skills: opts.skills,
    current: opts.epics.length > 0 ? { epic: opts.epics[0] } : undefined,
    config: {
      sync_to_claude: true,
      require_reviews: true,
      parallel_limit: 3,
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  
  writeFileSync(
    join(projectDir, '.crew', 'project.json'),
    JSON.stringify(project, null, 2) + '\n',
    'utf-8'
  );
}

/**
 * Main init function
 */
export async function initProject(opts: InitOptions = {}): Promise<InitResult> {
  const projectDir = resolve(opts.dir || '.');
  const existing = detectExistingProject(projectDir);
  
  // Check if already initialized and not forcing
  if (existing.hasCrew && !opts.force) {
    return {
      success: true,
      action: 'skipped',
      projectPath: join(projectDir, '.crew'),
      agentsImported: [],
      skillsImported: [],
      pluginsInstalled: [],
      epicsCreated: 0,
      message: 'Project already initialized. Use -f to force re-init.',
    };
  }
  
  // Create .crew directory structure (HIERARCHICAL - no flat tasks/ dir)
  mkdirSync(join(projectDir, '.crew'), { recursive: true });
  mkdirSync(join(projectDir, '.crew', 'epics'), { recursive: true });
  mkdirSync(join(projectDir, '.crew', 'events'), { recursive: true });
  mkdirSync(join(projectDir, '.crew', 'agents'), { recursive: true });
  mkdirSync(join(projectDir, '.crew', 'skills'), { recursive: true });
  mkdirSync(join(projectDir, '.crew', 'plugins'), { recursive: true });

  // Copy builtin plugins into .crew/plugins/
  const pluginsInstalled = syncPlugins(projectDir);

  // Copy crewman's bundled agents and skills into .crew/
  const crewmanAssets = syncCrewmanAssets(projectDir);

  // Sync from .claude/ if exists (merges on top of crewman defaults)
  const agentsImported = opts.force ? syncAgents(projectDir) : crewmanAssets.agents;
  const skillsImported = opts.force ? syncSkills(projectDir) : crewmanAssets.skills;
  
  // Extract IDs
  const agentIds = extractAgentIds(projectDir);
  const skillIds = extractSkillIds(projectDir);
  
  // Generate epics
  const { ids: epicIds, count: epicsCreated } = generateEpics(projectDir, 4);
  
  // Generate project.json
  const projectName = opts.name || basename(projectDir);
  const projectGoal = opts.goal || `Build ${projectName}`;
  
  generateProject(projectDir, {
    name: projectName,
    goal: projectGoal,
    agents: agentIds,
    skills: skillIds,
    epics: epicIds,
  });

  const action = existing.hasCrew ? 'synced' : 'created';
  const message = opts.force && existing.hasClaude
    ? `Synced from .claude/: ${agentsImported.length} agents, ${skillsImported.length} skills`
    : `Initialized new project: ${projectName}`;

  return {
    success: true,
    action,
    projectPath: join(projectDir, '.crew'),
    agentsImported,
    skillsImported,
    pluginsInstalled,
    epicsCreated,
    message,
  };
}

/**
 * CLI handler
 */
export async function handleInit(args: string[]): Promise<void> {
  const opts: InitOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-f' || arg === '--force') {
      opts.force = true;
    } else if (arg === '--name' && i + 1 < args.length) {
      opts.name = args[++i];
    } else if (arg === '--goal' && i + 1 < args.length) {
      opts.goal = args[++i];
    } else if (arg === '--dir' && i + 1 < args.length) {
      opts.dir = args[++i];
    } else if (!arg.startsWith('-') && !opts.dir) {
      opts.dir = arg;
    }
  }

  const result = await initProject(opts);

  if (result.success) {
    console.log(`✓ ${result.message}`);
    console.log(`  Project: ${result.projectPath}`);

    if (result.agentsImported.length > 0) {
      console.log(`  Agents imported: ${result.agentsImported.join(', ')}`);
    }

    if (result.skillsImported.length > 0) {
      console.log(`  Skills imported: ${result.skillsImported.join(', ')}`);
    }

    if (result.pluginsInstalled.length > 0) {
      console.log(`  Plugins installed: ${result.pluginsInstalled.join(', ')}`);
    }
  } else {
    console.error('✗ Initialization failed');
    process.exit(1);
  }
}

/**
 * Wrapper for commands.ts compatibility
 * Handles crew init with flags (legacy dispatch support)
 */
export async function runInit(projectDir: string, flags: Record<string, string | boolean> = {}): Promise<void> {
  const { resolve, join } = await import('node:path');
  const { existsSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { loadConfig, hasConfig } = await import('../config-loader.ts');

  const absDir = resolve(projectDir);

  // Ensure directory exists
  if (!existsSync(absDir)) {
    console.error(`[crew] Error: directory not found: ${absDir}`);
    process.exit(1);
  }

  // Check for .claude/ directory - if exists and -f flag, sync from it
  const claudeDir = join(absDir, '.claude');
  const hasClaude = existsSync(claudeDir);
  const hasCrew = existsSync(join(absDir, '.crew'));

  if (hasClaude && (flags.force || flags.f || !hasCrew)) {
    // Use full init logic with sync from .claude/
    const result = await initProject({
      dir: absDir,
      force: true,
      name: typeof flags.name === 'string' ? flags.name : undefined,
      goal: typeof flags.goal === 'string' ? flags.goal : undefined,
    });

    if (!result.success) {
      process.exit(1);
    }

    console.error(`[crew] ${result.message}`);
    console.error(`[crew] Project initialized at: ${result.projectPath}`);

    if (result.agentsImported.length > 0) {
      console.error(`[crew] Agents synced: ${result.agentsImported.join(', ')}`);
    }
    if (result.skillsImported.length > 0) {
      console.error(`[crew] Skills synced: ${result.skillsImported.join(', ')}`);
    }
    if (result.pluginsInstalled.length > 0) {
      console.error(`[crew] Plugins installed: ${result.pluginsInstalled.join(', ')}`);
    }
    if (result.epicsCreated > 0) {
      console.error(`[crew] Epics created: ${result.epicsCreated}`);
    }

    console.error(`[crew] Run \`crew plan\` to create the initial plan`);
    return;
  }

  // Check if config already exists
  if (hasConfig(absDir)) {
    const loaded = await loadConfig(absDir);
    console.error(`[crew] Config already exists: ${loaded?.path}`);
    console.error(`[crew] Use -f to force re-initialization`);
    return;
  }

  // Create a sample crew.json
  const configContent = `{
  "name": "My Project",
  "description": "Enhancement plan for my Next.js project",
  "setup": ".crew/setup"
}
`;

  const setupDirPath = join(absDir, '.crew/setup');
  const setupContent = `/**
 * Crew setup - initialize project plan
 *
 * This file is loaded by crew.json via the "setup" field.
 */

export async function onInitCrew(ctx) {
  console.log('[onInitCrew] Initializing crew for', ctx.projectDir);
}

export async function createPlan(ctx) {
  const plan = ctx.createPlan('My Project Enhancement');

  plan
    .vars({ nodeVersion: '20' })
    .addEpic(ctx.createEpic('bootstrap', 'Bootstrap')
      .addTask(ctx.createTask('install', 'Install dependencies').skill('repo/install'))
      .addTask(ctx.createTask('tsc', 'Type check').skill('page-verify').check('tsc')))
    .addEpic(ctx.createEpic('build', 'Build')
      .addTask(ctx.createTask('build-app', 'Build application').skill('page-verify').check('build')));

  return plan.build();
}

export async function onVerificationFailed(ctx, report) {
  console.log('Verification failed:', report.issues);
  return [];
}
`;

  const configPath = join(absDir, 'crew.json');
  const setupIndexPath = join(setupDirPath, 'index.js');

  mkdirSync(setupDirPath, { recursive: true });
  writeFileSync(configPath, configContent, 'utf-8');
  writeFileSync(setupIndexPath, setupContent, 'utf-8');

  console.error(`[crew] Created config: ${configPath}`);
  console.error(`[crew] Created setup: ${setupIndexPath}`);
  console.error(`[crew] Run \`crew plan init\` (or \`crew --project ${projectDir} plan init\` from outside) to initialize the plan`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  handleInit(process.argv.slice(2));
}
