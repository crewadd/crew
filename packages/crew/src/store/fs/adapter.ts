/**
 * Adapter
 *
 * Translates FS-native shapes (EpicInfo, TaskInfo) to the existing
 * shared types (Epic, Task, CrewProject) when backward compatibility is needed.
 */

import type { Task, Epic, CrewProject, TaskId, EpicId, AgentId } from '../types.ts';
import type { EpicInfo } from './epic-ops.ts';
import type { TaskInfo } from './task-ops.ts';
import type { ProjectYaml } from './types.ts';
import { parsePrefix } from './ordering.ts';

/**
 * Convert an EpicInfo (fs-native) to an Epic (shared type).
 */
export function epicInfoToEpic(info: EpicInfo): Epic {
  const parsed = parsePrefix(info.slug);

  return {
    id: `epic_${info.slug}` as EpicId,
    version: 1,
    number: parsed.num,
    title: info.title,
    description: info.config.title,
    status: info.status as Epic['status'],
    task_ids: [],
    gates: (info.config.gates ?? []).map(g => ({
      type: g.type as 'plan' | 'review' | 'consolidate' | 'custom',
      required: g.required ?? false,
      completed: g.completed ?? false,
    })),
    constraints: info.config.constraints ? {
      sequential: info.config.constraints.sequential as boolean | undefined,
    } : undefined,
    created: { at: '', by: 'agent_system' as AgentId },
    updated: { at: '', by: 'agent_system' as AgentId },
  };
}

/**
 * Convert a TaskInfo (fs-native) to a Task (shared type).
 */
export function taskInfoToTask(info: TaskInfo, epicSlug: string): Task {
  return {
    id: `task_${info.slug}` as TaskId,
    version: 1,
    title: info.title,
    description: info.prompt,
    status: info.status as Task['status'],
    status_history: [],
    epic_id: `epic_${epicSlug}` as EpicId,
    type: info.config.type,
    skills: info.config.skills,
    input: info.config.input,
    output: info.config.output,
    vars: info.config.vars,
    checks: info.config.checks,
    maxAttempts: info.config.maxAttempts,
    prompt: info.prompt,
    dependencies: [],
    dependents: [],
    attempts: [],
    created: { at: '', by: 'agent_system' as AgentId },
    updated: { at: '', by: 'agent_system' as AgentId },
  };
}

/**
 * Convert a ProjectYaml to a CrewProject (shared type).
 */
export function projectYamlToCrewProject(yaml: ProjectYaml): CrewProject {
  return {
    version: 1,
    name: yaml.name,
    description: yaml.description,
    goal: yaml.goal ?? '',
    workflow: [],
    epics: [],
    agents: [],
    skills: [],
    config: yaml.settings ? {
      parallel_limit: yaml.settings.parallel_limit as number | undefined,
      require_reviews: yaml.settings.require_reviews as boolean | undefined,
    } : undefined,
    created: '',
    updated: '',
  };
}
