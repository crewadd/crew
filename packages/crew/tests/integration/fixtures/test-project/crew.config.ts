/**
 * Crew configuration for integration tests
 */

import type { CrewConfig } from '../../../../src/index.ts';

const config: CrewConfig = {
  name: 'test-project',
  version: '1.0.0',

  /**
   * onInitCrew hook - called when initializing the plan
   * Creates 2 epics with 5 tasks that have interesting dependency patterns
   */
  async onInitCrew(ctx: any) {
    const plan = ctx.createPlan('Test Project Plan');

    // Epic 1: Setup (2 tasks with linear dependency)
    plan.addEpic(
      ctx.createEpic('setup', 'Setup')
        .addTask(ctx.createTask('t1', 'Create directory structure')
          .prompt('Create the basic directory structure for the project'))
        .addTask(ctx.createTask('t2', 'Create package.json')
          .prompt('Create package.json file')
          .deps(['t1']))
    );

    // Epic 2: Implementation (3 tasks with parallel + convergence pattern)
    plan.addEpic(
      ctx.createEpic('implementation', 'Implementation')
        .addTask(ctx.createTask('t3', 'Create index.ts')
          .prompt('Create main index.ts file')
          .deps(['t2']))
        .addTask(ctx.createTask('t4', 'Create utils.ts')
          .prompt('Create utils.ts file')
          .deps(['t2']))
        .addTask(ctx.createTask('t5', 'Create tests')
          .prompt('Create test files')
          .deps(['t3', 't4']))
    );

    return plan.build();
  },
};

export default config;
