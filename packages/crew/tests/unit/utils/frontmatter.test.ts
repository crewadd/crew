/**
 * Unit tests for utils/frontmatter
 * Tests: parseFrontmatter — YAML frontmatter extraction and value parsing
 */

import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../../src/utils/frontmatter.ts';

describe('parseFrontmatter', () => {
  it('parses simple key-value frontmatter', () => {
    const input = `---
title: My Task
skill: page-analyze
---

# Task Content

Do the thing.`;

    const result = parseFrontmatter(input);
    expect(result.frontmatter.title).toBe('My Task');
    expect(result.frontmatter.skill).toBe('page-analyze');
    expect(result.content).toContain('# Task Content');
  });

  it('parses array values', () => {
    const input = `---
inputs:
  - file1.ts
  - file2.ts
---

Content here.`;

    const result = parseFrontmatter(input);
    expect(result.frontmatter.inputs).toEqual(['file1.ts', 'file2.ts']);
  });

  it('returns raw content when no frontmatter', () => {
    const input = '# Just Content\n\nNo frontmatter here.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(input);
  });

  it('returns raw content for unclosed frontmatter', () => {
    const input = '---\ntitle: Open\nNever closed';
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(input);
  });

  it('parses boolean values', () => {
    const input = `---
enabled: true
disabled: false
---
Body`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter.enabled).toBe(true);
    expect(result.frontmatter.disabled).toBe(false);
  });

  it('parses numeric values', () => {
    const input = `---
count: 42
rate: 3.14
---
Body`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.rate).toBe(3.14);
  });

  it('parses null values', () => {
    const input = `---
empty: null
tilde: ~
---
Body`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter.empty).toBeNull();
    expect(result.frontmatter.tilde).toBeNull();
  });

  it('handles quoted strings', () => {
    const input = `---
name: "Hello World"
single: 'Test Value'
---
Body`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter.name).toBe('Hello World');
    expect(result.frontmatter.single).toBe('Test Value');
  });

  it('handles empty frontmatter block', () => {
    const input = `---
---
Content`;
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('Content');
  });
});
