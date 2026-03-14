import type { CrewPlugin } from '../../types.ts';

const gitPlugin: CrewPlugin = {
  name: 'git',
  version: '1.0.0',
  description: 'Git auto-commit after task completion',
  setup(api) {
    const opts = api.options as { autoCommit?: boolean; commitPrefix?: string };
    const autoCommit = opts?.autoCommit ?? true;
    const prefix = opts?.commitPrefix ?? 'crew';

    if (autoCommit) {
      api.addHook('afterTask', async (ctx) => {
        const status = await ctx.tools.git.status();
        if (status.trim()) {
          await ctx.tools.git.add(['.']);
          await ctx.tools.git.commit(
            `${prefix}: complete task ${ctx.taskId} — ${ctx.task.title}`
          );
        }
      });
    }

    api.addCheck('git-clean', async (ctx) => {
      const r = await ctx.tools.shell.run('git status --porcelain');
      return {
        passed: r.stdout.trim() === '',
        output: r.stdout || 'Working tree clean',
      };
    });
  },
};

export default gitPlugin;
