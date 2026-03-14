import { initProject } from './src/cli/init-cmd.ts';
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = mkdtempSync(join(tmpdir(), 'test-crew-init-'));
console.log('Test dir:', testDir);

const result = await initProject({ dir: testDir, name: 'test', goal: 'test goal' });
console.log('\nInit result:', JSON.stringify(result, null, 2));

console.log('\n.crew exists:', existsSync(join(testDir, '.crew')));
if (existsSync(join(testDir, '.crew'))) {
  console.log('.crew contents:', readdirSync(join(testDir, '.crew')));

  const planDir = join(testDir, '.crew', 'epics');
  if (existsSync(planDir)) {
    console.log('.crew/epics contents:', readdirSync(planDir));
  }
}

const projectJsonPath = join(testDir, '.crew', 'project.json');
console.log('\nproject.json exists:', existsSync(projectJsonPath));
if (existsSync(projectJsonPath)) {
  const content = readFileSync(projectJsonPath, 'utf-8');
  console.log('project.json content:\n', content);
}
