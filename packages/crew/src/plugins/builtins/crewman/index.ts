import type { CrewPlugin } from '../../types.ts';

/**
 * crewman — default project assistant plugin.
 *
 * Agents and skills are copied into .crew/ by `crew init` (see init-cmd.ts).
 * This plugin itself is a no-op; it exists so the plugin registry knows about it.
 */
const crewmanPlugin: CrewPlugin = {
  name: 'crewman',
  version: '1.0.0',
  description: 'Default project assistant — agents and skills copied by crew init',

  setup() {
    // no-op: crew init handles copying agents/ and skills/ into .crew/
  },
};

export default crewmanPlugin;
