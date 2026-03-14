import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadAgentPersona,
  buildPromptWithPersona,
  applyAgentPersona,
  parseSkillInvocation,
  expandSkillInvocation,
} from '../src/agent-loader.ts';
import type { BuildContext } from '../src/types.ts';

describe('agent-loader', () => {
  let tmpDir: string;
  let ctx: BuildContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'crew-test-'));
    ctx = {
      appDir: tmpDir,
      compoundScript: join(tmpDir, 'compound.ts'),
    };
    
    // Create agents directory
    mkdirSync(join(tmpDir, '.claude', 'agents'), { recursive: true });
  });

  describe('loadAgentPersona', () => {
    it('returns null if agent file does not exist', () => {
      const agent = loadAgentPersona(ctx, 'non-existent');
      expect(agent).toBeNull();
    });

    it('loads agent with @ prefix', () => {
      const agentContent = `---
name: page-builder
description: Builds pages from templates
---

# Page Builder

Build pages precisely.`;
      
      writeFileSync(join(tmpDir, '.claude', 'agents', 'page-builder.md'), agentContent);
      
      const agent = loadAgentPersona(ctx, '@page-builder');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('page-builder');
      expect(agent!.description).toBe('Builds pages from templates');
      expect(agent!.content).toContain('# Page Builder');
    });

    it('loads agent without @ prefix', () => {
      const agentContent = `---
name: test-agent
description: Test agent description
---

Test content here.`;
      
      writeFileSync(join(tmpDir, '.claude', 'agents', 'test-agent.md'), agentContent);
      
      const agent = loadAgentPersona(ctx, 'test-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('test-agent');
    });

    it('uses filename as name if frontmatter missing', () => {
      const agentContent = `# Just Content

No frontmatter here.`;
      
      writeFileSync(join(tmpDir, '.claude', 'agents', 'simple-agent.md'), agentContent);
      
      const agent = loadAgentPersona(ctx, 'simple-agent');
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('simple-agent');
      expect(agent!.description).toBe('No description');
    });
  });

  describe('buildPromptWithPersona', () => {
    it('builds prompt with XML-tagged agent persona', () => {
      const agent = {
        name: 'page-builder',
        description: 'Builds pages',
        skills: ['page-build'],
        content: '# Rules\n\n1. Be precise',
      };

      const result = buildPromptWithPersona(ctx, agent, 'Do this');
      expect(result).toContain('<agent name="page-builder">');
      expect(result).toContain('> Builds pages');
      expect(result).toContain('# Rules');
      expect(result).toContain('</agent>');
      expect(result).toContain('Do this');
    });
  });

  describe('applyAgentPersona', () => {
    it('returns original prompt if no assignee', () => {
      const prompt = 'Do this task';
      const result = applyAgentPersona(ctx, prompt, undefined);
      expect(result).toBe(prompt);
    });

    it('returns original prompt if agent file not found', () => {
      const prompt = 'Do this task';
      const result = applyAgentPersona(ctx, prompt, '@non-existent');
      expect(result).toBe(prompt);
    });

    it('wraps prompt with XML-tagged agent persona', () => {
      const agentContent = `---
name: page-builder
description: Precise page builder
skills: [page-build, page-verify]
---

# Rules

Be precise.`;

      writeFileSync(join(tmpDir, '.claude', 'agents', 'page-builder.md'), agentContent);

      const prompt = 'Build the home page';
      const result = applyAgentPersona(ctx, prompt, '@page-builder');

      expect(result).toContain('<agent name="page-builder">');
      expect(result).toContain('> Precise page builder');
      expect(result).toContain('# Rules');
      expect(result).toContain('</agent>');
      expect(result).toContain('Build the home page');
    });
  });

  describe('parseSkillInvocation', () => {
    it('parses /skill-name with arguments', () => {
      const result = parseSkillInvocation('/page-build hero section with parallax');
      expect(result).toEqual({
        skillName: 'page-build',
        userInput: 'hero section with parallax',
      });
    });

    it('parses /skill-name without arguments', () => {
      const result = parseSkillInvocation('/animation-reconstruct');
      expect(result).toEqual({
        skillName: 'animation-reconstruct',
        userInput: '',
      });
    });

    it('handles leading whitespace', () => {
      const result = parseSkillInvocation('  /page-build build it');
      expect(result).toEqual({
        skillName: 'page-build',
        userInput: 'build it',
      });
    });

    it('parses multiline user input', () => {
      const result = parseSkillInvocation('/page-build hero section\nwith parallax\nand fade in');
      expect(result).toEqual({
        skillName: 'page-build',
        userInput: 'hero section\nwith parallax\nand fade in',
      });
    });

    it('returns null when /skill is not at start', () => {
      const result = parseSkillInvocation('Build the page using /page-build');
      expect(result).toBeNull();
    });

    it('returns null for plain text', () => {
      const result = parseSkillInvocation('Build the page');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = parseSkillInvocation('');
      expect(result).toBeNull();
    });
  });

  describe('expandSkillInvocation', () => {
    it('returns null if skill not found', () => {
      const result = expandSkillInvocation(ctx, {
        skillName: 'non-existent',
        userInput: 'do something',
      });
      expect(result).toBeNull();
    });

    it('loads skill normally and adds attention directive with user input', () => {
      mkdirSync(join(tmpDir, '.crew', 'skills', 'page-build'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.crew', 'skills', 'page-build', 'SKILL.md'),
        `---
description: Build a page from design
---

Build the page following the design spec.
Ensure pixel-perfect output.`,
      );

      const result = expandSkillInvocation(ctx, {
        skillName: 'page-build',
        userInput: 'hero section with parallax',
      });

      expect(result).not.toBeNull();
      // Attention directive tells the AI the user explicitly invoked this skill
      expect(result).toContain('<attention>');
      expect(result).toContain('explicitly invoked the /page-build skill');
      expect(result).toContain('</attention>');
      // Skill loaded in same format as lazy refs (no mode="command")
      expect(result).toContain('<skill name="page-build">');
      expect(result).toContain('Build a page from design');
      expect(result).toContain('Build the page following the design spec.');
      expect(result).toContain('</skill>');
      // User input kept as the main prompt, not wrapped in special tags
      expect(result).toContain('hero section with parallax');
    });

    it('works without user input (skill-only invocation)', () => {
      mkdirSync(join(tmpDir, '.crew', 'skills', 'lint'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.crew', 'skills', 'lint', 'SKILL.md'),
        `---
description: Run linter
---

Run the project linter and fix issues.`,
      );

      const result = expandSkillInvocation(ctx, {
        skillName: 'lint',
        userInput: '',
      });

      expect(result).toContain('<attention>');
      expect(result).toContain('explicitly invoked the /lint skill');
      expect(result).toContain('<skill name="lint">');
      expect(result).toContain('Run the project linter');
      expect(result).toContain('</skill>');
    });

    it('loads skill from .claude/skills/ fallback path', () => {
      mkdirSync(join(tmpDir, '.claude', 'skills', 'code-review'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.claude', 'skills', 'code-review', 'SKILL.md'),
        `---
description: Review code for quality
---

Review the code carefully.`,
      );

      const result = expandSkillInvocation(ctx, {
        skillName: 'code-review',
        userInput: 'src/utils.ts',
      });

      expect(result).not.toBeNull();
      expect(result).toContain('<skill name="code-review">');
      expect(result).toContain('Review the code carefully.');
      expect(result).toContain('src/utils.ts');
    });
  });
});
