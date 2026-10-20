import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { PreprodSafetyError } from './send-boundary.js';
import { checkDeploymentReadiness } from './encrypted-private-state.js';

// Add to allowlist only after owner approval and a Preprod test.
// Admission must be added here with its audited factory, never supplied by a caller.
const approvedProviders: ReadonlySet<PrivateStateProvider<PrivateStateId, unknown>> = new Set();

export function requireApprovedPrivateState<PS>(provider: PrivateStateProvider<PrivateStateId, PS>) {
  if (!approvedProviders.has(provider as PrivateStateProvider<PrivateStateId, unknown>)) {
    throw new PreprodSafetyError('DEPLOYMENT_DISABLED');
  }
  return provider;
}

export async function requireDeploymentPermission<PS>(provider: PrivateStateProvider<PrivateStateId, PS>) {
  requireApprovedPrivateState(provider);
  return checkDeploymentReadiness(provider);
}
