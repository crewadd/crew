/**
 * Unit tests for store/slug-utils
 * Pure functions: slugify, numberedSlug, parseNumberedSlug
 */

import { describe, it, expect } from 'vitest';
import { slugify, numberedSlug, parseNumberedSlug } from '../../../src/store/slug-utils.ts';

describe('slugify', () => {
  it('converts title to lowercase', () => {
    expect(slugify('Foundation Setup')).toBe('foundation-setup');
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(slugify('API Backend v2.0')).toBe('api-backend-v2-0');
  });

  it('trims surrounding whitespace', () => {
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
  });

  it('collapses consecutive non-alnum chars to single hyphen', () => {
    expect(slugify('Hello---World')).toBe('hello-world');
    expect(slugify('hello & world')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---leading')).toBe('leading');
    expect(slugify('trailing---')).toBe('trailing');
  });

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('handles special characters only', () => {
    expect(slugify('!@#$%^&*()')).toBe('');
  });

  it('handles unicode characters', () => {
    const result = slugify('Café résumé');
    expect(result).toBe('caf-r-sum');
  });

  it('handles single word', () => {
    expect(slugify('Foundation')).toBe('foundation');
  });
});

describe('numberedSlug', () => {
  it('creates zero-padded slug', () => {
    expect(numberedSlug(0, 'Foundation')).toBe('00-foundation');
  });

  it('creates double-digit slug', () => {
    expect(numberedSlug(12, 'Verification')).toBe('12-verification');
  });

  it('uses "untitled" for empty title', () => {
    expect(numberedSlug(0, '')).toBe('00-untitled');
  });

  it('uses "untitled" for special-chars-only title', () => {
    expect(numberedSlug(1, '!@#')).toBe('01-untitled');
  });

  it('handles single digit numbers', () => {
    expect(numberedSlug(5, 'Setup')).toBe('05-setup');
  });
});

describe('parseNumberedSlug', () => {
  it('extracts number from slug', () => {
    expect(parseNumberedSlug('00-foundation')).toBe(0);
    expect(parseNumberedSlug('12-verification')).toBe(12);
  });

  it('returns 0 for invalid slug', () => {
    expect(parseNumberedSlug('no-number-here')).toBe(0);
  });

  it('extracts only leading number', () => {
    expect(parseNumberedSlug('05-setup-phase-2')).toBe(5);
  });
});
