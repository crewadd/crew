/**
 * Frontmatter Parser for PROMPT.md files
 *
 * Parses YAML frontmatter from markdown files:
 * ---
 * title: Task Title
 * skill: page-analyze
 * inputs:
 *   - file1.ts
 *   - file2.ts
 * outputs:
 *   - output.md
 * ---
 *
 * Rest of the markdown content...
 */

export interface PromptFrontmatter {
  title?: string;
  skill?: string;
  inputs?: string[];
  outputs?: string[];
  [key: string]: unknown;
}

export interface ParsedPrompt {
  frontmatter: PromptFrontmatter;
  content: string;
}

/**
 * Parse frontmatter from a markdown file
 */
export function parseFrontmatter(markdown: string): ParsedPrompt {
  const lines = markdown.split('\n');

  // Check if starts with frontmatter delimiter
  if (lines[0]?.trim() !== '---') {
    return {
      frontmatter: {},
      content: markdown,
    };
  }

  // Find closing delimiter
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  // No closing delimiter found
  if (endIndex === -1) {
    return {
      frontmatter: {},
      content: markdown,
    };
  }

  // Extract frontmatter lines
  const frontmatterLines = lines.slice(1, endIndex);
  const contentLines = lines.slice(endIndex + 1);

  // Parse frontmatter (simple YAML parser)
  const frontmatter = parseSimpleYaml(frontmatterLines.join('\n'));

  // Content is everything after the closing delimiter
  const content = contentLines.join('\n').trim();

  return {
    frontmatter,
    content,
  };
}

/**
 * Simple YAML parser for frontmatter
 * Supports:
 * - key: value
 * - key:
 *     - item1
 *     - item2
 */
function parseSimpleYaml(yaml: string): PromptFrontmatter {
  const result: PromptFrontmatter = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (currentKey) {
        currentArray.push(trimmed.substring(2).trim());
      }
      continue;
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      // Save previous array if exists
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = currentArray;
        currentArray = [];
      }

      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      currentKey = key;

      // If value exists on same line, it's a scalar
      if (value) {
        result[key] = parseValue(value);
        currentKey = null;
      }
      // Otherwise, it's an array or nested object (we'll collect array items)
    }
  }

  // Save final array if exists
  if (currentKey && currentArray.length > 0) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Parse a YAML value (handle strings, numbers, booleans)
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // String (remove quotes if present)
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
