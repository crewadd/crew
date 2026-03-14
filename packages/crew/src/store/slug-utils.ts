/**
 * Slug Utilities
 * Convert titles to URL-friendly slugs with numbering
 */

/**
 * Convert a title to URL-friendly slug
 * "Foundation Setup" -> "foundation-setup"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Create numbered slug for ordering
 * (0, "Foundation") -> "00-foundation"
 * (12, "Capture") -> "12-capture"
 */
export function numberedSlug(number: number, title: string): string {
  const slug = slugify(title) || 'untitled';
  return `${number.toString().padStart(2, '0')}-${slug}`;
}

/**
 * Parse numbered slug back to number
 * "00-foundation" -> 0
 */
export function parseNumberedSlug(slug: string): number {
  const match = slug.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : 0;
}
