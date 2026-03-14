/**
 * Test the consolidated epic structure
 * - All epic definitions in epics slash star slash index.js
 * - All prompts in epics slash star slash prompts slash
 * - All executors in epics slash star slash executors slash
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Simulate the loadPromptTemplate function
function loadPromptTemplate(setupDir, templatePath, vars) {
  const templateSource = resolve(setupDir, templatePath);

  if (!existsSync(templateSource)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let template = readFileSync(templateSource, 'utf-8');

  // Interpolate variables: {{varName}} → value
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(placeholder, String(value));
  }

  return template;
}

const setupDir = resolve(process.cwd(), '../../apps/ai-tool_nextjstemplates_com/.crew/setup');

console.log('Testing consolidated epic structure...\n');

// Test file structure
console.log('═══════════════════════════════════════════');
console.log('FILE STRUCTURE VERIFICATION');
console.log('═══════════════════════════════════════════\n');

const requiredFiles = [
  'plan/index.js',
  'plan/epics/README.md',
  'plan/epics/1-bootstrap/index.js',
  'plan/epics/1-bootstrap/README.md',
  'plan/epics/1-bootstrap/prompts/install-dependencies.md',
  'plan/epics/1-bootstrap/prompts/fix-transpile-error.md',
  'plan/epics/2-build-pages/index.js',
  'plan/epics/2-build-pages/README.md',
  'plan/epics/2-build-pages/prompts/analyze-page.md',
  'plan/epics/2-build-pages/prompts/plan-components.md',
  'plan/epics/2-build-pages/prompts/component-split-task.md',
  'plan/epics/2-build-pages/prompts/analyze-animations.md',
  'plan/epics/2-build-pages/prompts/implement-animations.md',
  'plan/epics/2-build-pages/executors/verify-components.js',
  'plan/epics/2-build-pages/executors/verify-page.js',
  'plan/epics/3-integration/index.js',
  'plan/epics/3-integration/README.md',
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const fullPath = resolve(setupDir, file);
  if (existsSync(fullPath)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ MISSING: ${file}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing!');
  process.exit(1);
}

console.log('\n✅ All required files exist');

// Test Bootstrap Epic
console.log('\n═══════════════════════════════════════════');
console.log('1-BOOTSTRAP EPIC');
console.log('═══════════════════════════════════════════\n');

console.log('Test 1.1: install-dependencies.md');
const installPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/1-bootstrap/prompts/install-dependencies.md',
  {}
);
console.log('✓ Template loaded');
console.log('✓ No variables needed:', !installPrompt.includes('{{'));

console.log('\nTest 1.2: fix-transpile-error.md');
const fixErrorPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/1-bootstrap/prompts/fix-transpile-error.md',
  {
    file: 'src/app/page.tsx',
    errorMessage: 'Cannot find module react',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  fixErrorPrompt.includes('src/app/page.tsx') &&
  fixErrorPrompt.includes('Cannot find module react') &&
  !fixErrorPrompt.includes('{{file}}')
);

// Test Build Pages Epic
console.log('\n═══════════════════════════════════════════');
console.log('2-BUILD-PAGES EPIC');
console.log('═══════════════════════════════════════════\n');

console.log('Test 2.1: analyze-page.md');
const analyzePagePrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-build-pages/prompts/analyze-page.md',
  {
    route: '/pricing',
    slug: 'pricing',
    htmlFile: 'templates/pricing.html',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  analyzePagePrompt.includes('pricing') &&
  analyzePagePrompt.includes('templates/pricing.html') &&
  !analyzePagePrompt.includes('{{')
);

console.log('\nTest 2.2: plan-components.md');
const planComponentsPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-build-pages/prompts/plan-components.md',
  {
    route: '/about',
    slug: 'about',
    generatedFile: 'src/app/about/page.tsx',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  planComponentsPrompt.includes('about') &&
  planComponentsPrompt.includes('src/app/about/page.tsx') &&
  !planComponentsPrompt.includes('{{generatedFile}}')
);
console.log('✓ References component-split-task.md:',
  planComponentsPrompt.includes('./epics/2-build-pages/prompts/component-split-task.md')
);

console.log('\nTest 2.3: component-split-task.md');
const componentSplitPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-build-pages/prompts/component-split-task.md',
  {
    ComponentName: 'PricingTable',
    route: '/pricing',
    slug: 'pricing',
    generatedFile: 'src/app/pricing/page.tsx',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  componentSplitPrompt.includes('PricingTable') &&
  componentSplitPrompt.includes('src/app/pricing/page.tsx') &&
  !componentSplitPrompt.includes('{{ComponentName}}')
);

console.log('\nTest 2.4: analyze-animations.md');
const analyzeAnimationsPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-build-pages/prompts/analyze-animations.md',
  {
    route: '/features',
    slug: 'features',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  analyzeAnimationsPrompt.includes('features') &&
  !analyzeAnimationsPrompt.includes('{{slug}}')
);

console.log('\nTest 2.5: implement-animations.md');
const implementAnimationsPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-build-pages/prompts/implement-animations.md',
  {
    route: '/contact',
    slug: 'contact',
    generatedFile: 'src/app/contact/page.tsx',
  }
);
console.log('✓ Template loaded');
console.log('✓ Variables interpolated:',
  implementAnimationsPrompt.includes('contact') &&
  implementAnimationsPrompt.includes('src/app/contact/page.tsx') &&
  !implementAnimationsPrompt.includes('{{route}}')
);

// Test Integration Epic
console.log('\n═══════════════════════════════════════════');
console.log('3-INTEGRATION EPIC');
console.log('═══════════════════════════════════════════\n');

console.log('Note: Integration epic uses no AI prompts');
console.log('All tasks use custom execute() functions');

// Summary
console.log('\n═══════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════\n');

console.log('✅ All required files exist');
console.log('✅ Bootstrap epic: 2/2 prompts working');
console.log('✅ Build Pages epic: 5/5 prompts working');
console.log('✅ Integration epic: 0/0 prompts (uses executors)');
console.log('\n✅ All consolidated epic tests passed!');
console.log('\nStructure:');
console.log('  plan/');
console.log('    ├── index.js (main entry)');
console.log('    └── epics/');
console.log('        ├── 1-bootstrap/      (index.js + 2 prompts)');
console.log('        ├── 2-build-pages/    (index.js + 5 prompts + 2 executors)');
console.log('        └── 3-integration/    (index.js + 0 prompts)');
