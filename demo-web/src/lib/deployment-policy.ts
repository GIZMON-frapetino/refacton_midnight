import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { PreprodSafetyError } from './send-boundary.js';

// No implementation has completed encryption, persistence and recovery review.
// Admission must be added here with its audited factory, never supplied by a caller.
const approvedProviders: ReadonlySet<PrivateStateProvider<PrivateStateId, unknown>> = new Set();

export function requireApprovedPrivateState<PS>(provider: PrivateStateProvider<PrivateStateId, PS>) {
  if (!approvedProviders.has(provider as PrivateStateProvider<PrivateStateId, unknown>)) {
    throw new PreprodSafetyError('DEPLOYMENT_DISABLED');
  }
  return provider;
}
