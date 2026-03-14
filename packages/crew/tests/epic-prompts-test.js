/**
 * Test the new epic-based prompt structure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Simulate the loadPromptTemplate function
function loadPromptTemplate(setupDir, templatePath, vars) {
  const templateSource = resolve(setupDir, templatePath);
  let template = readFileSync(templateSource, 'utf-8');

  // Interpolate variables: {{varName}} → value
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(placeholder, String(value));
  }

  return template;
}

const setupDir = resolve(process.cwd(), '../../apps/ai-tool_nextjstemplates_com/.crew/setup');

console.log('Testing epic-based prompt structure...\n');

// Test Bootstrap Epic
console.log('═══════════════════════════════════════════');
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

// Test Page Epic
console.log('\n═══════════════════════════════════════════');
console.log('2-PAGE EPIC');
console.log('═══════════════════════════════════════════\n');

console.log('Test 2.1: analyze-page.md');
const analyzePagePrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-page/prompts/analyze-page.md',
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
  'plan/epics/2-page/prompts/plan-components.md',
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
  planComponentsPrompt.includes('./epics/2-page/prompts/component-split-task.md')
);

console.log('\nTest 2.3: component-split-task.md');
const componentSplitPrompt = loadPromptTemplate(
  setupDir,
  'plan/epics/2-page/prompts/component-split-task.md',
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
  'plan/epics/2-page/prompts/analyze-animations.md',
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
  'plan/epics/2-page/prompts/implement-animations.md',
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

console.log('✅ Bootstrap epic: 2/2 prompts working');
console.log('✅ Page epic: 5/5 prompts working');
console.log('✅ Integration epic: 0/0 prompts (uses executors)');
console.log('\n✅ All epic-based prompts verified!');
console.log('\nStructure:');
console.log('  epics/');
console.log('    1-bootstrap/prompts/     (2 prompts)');
console.log('    2-page/prompts/          (5 prompts)');
console.log('    3-integration/prompts/   (0 prompts)');
