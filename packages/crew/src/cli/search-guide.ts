/**
 * Search guide: Shows agents how to search using existing tools
 */

export interface SearchPattern {
  name: string;
  description: string;
  example: string;
  tools: string[];
}

export const SEARCH_PATTERNS: SearchPattern[] = [
  {
    name: 'Find by Status',
    description: 'Find all tasks with a specific status',
    example: `grep -r '"status": "pending"' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find by Title',
    description: 'Search for keywords in task titles',
    example: `grep -r '"title".*authentication' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find by Description',
    description: 'Search for keywords in task descriptions',
    example: `grep -r '"description".*database' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find by Assignee',
    description: 'Find tasks assigned to specific agent',
    example: `grep -r '"assignee": "agent_engineer"' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find by Tag',
    description: 'Find tasks with specific tag',
    example: `grep -r '"tags".*urgent' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'List Tasks in Epic',
    description: 'List all tasks in a epic',
    example: `ls .crew/epics/02-*/tasks/`,
    tools: ['Glob', 'Bash'],
  },
  {
    name: 'Find by Display ID',
    description: 'Find task by display ID (e.g., m2.3)',
    example: `# m2.3 → epic 2, task 3\ncat .crew/epics/02-*/tasks/03-*/task.json`,
    tools: ['Glob', 'Read'],
  },
  {
    name: 'List All Tasks',
    description: 'List all task.json files in project',
    example: `find .crew/epics/*/tasks/*/task.json`,
    tools: ['Bash'],
  },
  {
    name: 'Find Dependencies',
    description: 'Find tasks that depend on a specific task',
    example: `grep -r '"dependencies".*task_abc123' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find Recent Tasks',
    description: 'Find recently updated tasks',
    example: `find .crew/epics/*/tasks/*/task.json -mtime -7`,
    tools: ['Bash'],
  },
  {
    name: 'Find Active Tasks',
    description: 'Find tasks currently in progress',
    example: `grep -r '"status": "active"' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
  {
    name: 'Find Blocked Tasks',
    description: 'Find tasks that are blocked',
    example: `grep -r '"status": "blocked"' .crew/epics/*/tasks/*/task.json`,
    tools: ['Grep'],
  },
];

/**
 * Get search pattern by name
 */
export function getSearchPattern(name: string): SearchPattern | undefined {
  return SEARCH_PATTERNS.find(p =>
    p.name.toLowerCase().includes(name.toLowerCase())
  );
}

/**
 * List all search patterns
 */
export function listSearchPatterns(): string {
  let output = 'CREW SEARCH PATTERNS:\n\n';
  output += 'Use these patterns with Grep, Glob, and Read tools to search the .crew/ directory.\n\n';

  for (const pattern of SEARCH_PATTERNS) {
    output += `${pattern.name}:\n`;
    output += `  ${pattern.description}\n`;
    output += `  Tools: ${pattern.tools.join(', ')}\n`;
    output += `  Example:\n`;
    output += `    ${pattern.example.split('\n').join('\n    ')}\n\n`;
  }

  return output;
}

/**
 * Get quick reference for common searches
 */
export function getQuickReference(): string {
  return `QUICK REFERENCE: Crew Search Patterns

Directory Structure:
  .crew/
  ├── project.json              # Project metadata
  ├── plan/
  │   └── {n}-{slug}/           # Epic directories (01-capture, 02-analysis, etc.)
  │       ├── epic.json    # Epic data
  │       └── tasks/
  │           └── {n}-{slug}/   # Task directories (01-init-compound, etc.)
  │               └── task.json # Task data

Common Searches:
  # Find by status
  grep -r '"status": "pending"' .crew/epics/*/tasks/*/task.json

  # Find by text
  grep -r '"title".*authentication' .crew/epics/*/tasks/*/task.json

  # Find by assignee
  grep -r '"assignee": "agent_engineer"' .crew/epics/*/tasks/*/task.json

  # List tasks in epic
  ls .crew/epics/02-*/tasks/

  # Read specific task (m2.3 = epic 2, task 3)
  cat .crew/epics/02-*/tasks/03-*/task.json

Display ID Mapping:
  m1.1 → .crew/epics/01-{slug}/tasks/01-{slug}/task.json
  m2.3 → .crew/epics/02-{slug}/tasks/03-{slug}/task.json
  m4.5 → .crew/epics/04-{slug}/tasks/05-{slug}/task.json

Tips:
  - Use Grep for content search (status, assignee, tags, etc.)
  - Use Glob for file pattern matching (ls, find)
  - Use Read to load full task details
  - File names encode epic/task numbers for easy navigation
`;
}
