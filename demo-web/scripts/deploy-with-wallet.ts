import '../src/lib/browser-globals.js';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { Contract } from '../../compiled/contract/index.js';
import { recordWitnesses } from '../../contract/witnesses.js';
import { hexToBytes } from '../src/lib/bytes.js';
import { compileContract, createProviders, deployTarget } from '../src/lib/wallet-adapter.js';
import { sendOnPreprod, PreprodSafetyError } from '../src/lib/send-boundary.js';
import { requireApprovedPrivateState } from '../src/lib/deployment-policy.js';

type PS = Record<string, never>;
type Target = Contract<PS>;
type CircuitId = 'recordQuest' | 'checkAttestation' | 'hasNullifier' | 'getCounterValue' | 'registerIssuer' | 'authorizeRecord';
type Dependencies = { createProviders: typeof createProviders; compileContract: typeof compileContract; deployTarget: typeof deployTarget };

export function deployWithWallet(input: {
  connected: ConnectedAPI;
  assetBaseURL: string;
  adminKeyHex: string;
  scopeHex: string;
  durablePrivateState: PrivateStateProvider<PrivateStateId, PS>;
}, injected: Partial<Dependencies> = {}) {
  return sendOnPreprod(async () => {
    requireApprovedPrivateState(input.durablePrivateState);
    const deps: Dependencies = { createProviders, compileContract, deployTarget, ...injected };
    try {
      const admin = hexToBytes(input.adminKeyHex);
      const scope = hexToBytes(input.scopeHex);
      if (admin.every((byte: number) => byte === 0) || scope.every((byte: number) => byte === 0)) throw new Error();
      const status = await input.connected.getConnectionStatus();
      if (status.status !== 'connected' || status.networkId !== 'preprod') throw new PreprodSafetyError('RECONNECT');
      const { providers } = await deps.createProviders<CircuitId, PS>(input.connected, input.assetBaseURL);
      // Constructor takes only public identifiers; no record witnesses are invoked.
      const zero = new Uint8Array(32);
      const witnesses = recordWitnesses<PS>({ questId: zero, version: 1n, userSecret: zero, localSecretKey: zero, salt: zero });
      const compiledContract = deps.compileContract<Target>(Contract, witnesses, input.assetBaseURL, 'QuestAttestation');
      const deployed = await deps.deployTarget<Target>({ ...providers, privateStateProvider: input.durablePrivateState }, {
        compiledContract, privateStateId: 'quest-attestation-preprod', initialPrivateState: {}, args: [admin, scope],
      });
      return { contractAddress: deployed.deployTxData.public.contractAddress, transactionId: deployed.deployTxData.public.txId };
    } catch (error) {
      if (error instanceof PreprodSafetyError) throw error;
      throw new Error('Preprod deployment failed or was declined. No private deployment data or service configuration is displayed.');
    }
  });
}
