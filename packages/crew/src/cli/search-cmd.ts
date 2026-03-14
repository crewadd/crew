/**
 * crew search - Search pattern guide
 */

import { validateProjectDir } from './utils.ts';

/**
 * Run search command - show search pattern guide
 */
export async function runSearch(
  projectDir: string,
  query: string,
  flags: Record<string, string | boolean> = {}
): Promise<void> {
  const absDir = validateProjectDir(projectDir);

  // Load search guide
  const { listSearchPatterns, getSearchPattern, getQuickReference } = await import('./search-guide.ts');

  // If no query or --help flag, show full guide
  if (!query || flags.help) {
    console.log(listSearchPatterns());
    return;
  }

  // If query is 'quick' or 'ref', show quick reference
  if (query === 'quick' || query === 'ref' || query === 'reference') {
    console.log(getQuickReference());
    return;
  }

  // Try to find matching pattern
  const pattern = getSearchPattern(query);

  if (pattern) {
    // Show specific pattern
    console.log(`PATTERN: ${pattern.name}\n`);
    console.log(`Description: ${pattern.description}\n`);
    console.log(`Tools: ${pattern.tools.join(', ')}\n`);
    console.log(`Example:`);
    console.log(`  ${pattern.example.split('\n').join('\n  ')}\n`);
    console.log(`\nRun this command in your terminal or use the Grep/Glob/Read tools.`);
    return;
  }

  // If no pattern match, show helpful message
  console.log(`No search pattern found for: "${query}"\n`);
  console.log(`Available patterns:`);
  const { SEARCH_PATTERNS } = await import('./search-guide.ts');
  for (const p of SEARCH_PATTERNS) {
    console.log(`  - ${p.name.toLowerCase()}`);
  }
  console.log(`\nRun \`crew search\` to see all patterns.`);
  console.log(`Run \`crew search quick\` for a quick reference.`);
}
