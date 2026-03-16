import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
    planner: 'src/planner/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'node18',
  // Bundle workspace dependencies, only keep external for standard npm packages
  noExternal: ['@crew/agentfn', '@crew/claudefn', '@crew/kimifn', '@crew/qwenfn', '@crew/geminifn', 'codets'],
  external: ['glob', 'yaml'],
});
