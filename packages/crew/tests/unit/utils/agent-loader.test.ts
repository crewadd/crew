/**
 * Unit tests for agent-loader
 * Tests: loadAgentPersona, buildPromptWithPersona, applyAgentPersona
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadAgentPersona,
  buildPromptWithPersona,
  applyAgentPersona,
} from '../../../src/agent-loader.ts';
import type { BuildContext } from '../../../src/types.ts';

describe('agent-loader', () => {
  let tmpDir: string;
  let ctx: BuildContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-agent-'));
    ctx = { appDir: tmpDir };
    mkdirSync(join(tmpDir, '.claude', 'agents'), { recursive: true });
  });

  /* ---- loadAgentPersona ---- */

  describe('loadAgentPersona', () => {
    it('returns null if agent file does not exist', () => {
      expect(loadAgentPersona(ctx, 'non-existent')).toBeNull();
    });

    it('loads agent with @ prefix', () => {
      writeFileSync(join(tmpDir, '.claude', 'agents', 'page-builder.md'), `---
name: page-builder
description: Builds pages
---
# Page Builder
Build pages precisely.`);

      const agent = loadAgentPersona(ctx, '@page-builder');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('page-builder');
      expect(agent!.description).toBe('Builds pages');
      expect(agent!.content).toContain('# Page Builder');
    });

    it('loads agent without @ prefix', () => {
      writeFileSync(join(tmpDir, '.claude', 'agents', 'test-agent.md'), `---
name: test-agent
description: Test description
---
Content.`);

      const agent = loadAgentPersona(ctx, 'test-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('test-agent');
    });

    it('uses filename as name when frontmatter is missing', () => {
      writeFileSync(join(tmpDir, '.claude', 'agents', 'simple.md'), '# Just Content');
      const agent = loadAgentPersona(ctx, 'simple');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('simple');
    });
  });

  /* ---- buildPromptWithPersona ---- */

  describe('buildPromptWithPersona', () => {
    it('builds prompt with persona, capacities, and task sections', () => {
      const agent = {
        name: 'page-builder',
        description: 'Builds pages',
        skills: ['page-build'],
        content: '# Rules\n\n1. Be precise',
      };
      const result = buildPromptWithPersona(ctx, agent, 'Build the page');
      expect(result).toContain('# PERSONA');
      expect(result).toContain('**page-builder**');
      expect(result).toContain('> Builds pages');
      expect(result).toContain('# CAPACITIES');
      expect(result).toContain('# YOUR TASK');
      expect(result).toContain('Build the page');
    });
  });

  /* ---- applyAgentPersona ---- */

  describe('applyAgentPersona', () => {
    it('returns original prompt if no assignee', () => {
      expect(applyAgentPersona(ctx, 'Do task', undefined)).toBe('Do task');
    });

    it('returns original prompt if agent not found', () => {
      expect(applyAgentPersona(ctx, 'Do task', '@ghost')).toBe('Do task');
    });

    it('prepends agent persona to prompt', () => {
      writeFileSync(join(tmpDir, '.claude', 'agents', 'builder.md'), `---
name: builder
description: Expert builder
skills: [build, verify]
---
# Rules
Be precise.`);

      const result = applyAgentPersona(ctx, 'Build homepage', '@builder');
      expect(result).toContain('# PERSONA');
      expect(result).toContain('**builder**');
      expect(result).toContain('Build homepage');
    });
  });
});
