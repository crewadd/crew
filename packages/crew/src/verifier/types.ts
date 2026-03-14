import type { BuildContext, VerificationCheck } from '../types.ts';

/**
 * A pluggable check that verifies one aspect of the generated project.
 */
export interface CheckPlugin {
  readonly name: string;
  run(ctx: BuildContext): Promise<VerificationCheck>;
}
