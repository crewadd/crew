/**
 * ULID (Universally Unique Lexicographically Sortable Identifier) utilities
 */

/**
 * Generate a simple ULID-like identifier
 * Format: timestamp(36) + random(12)
 */
export function generateUlid(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const rand = Math.random().toString(36).slice(2, 14);
  return `${time}${rand}`;
}
