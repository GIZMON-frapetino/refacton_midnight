import '../src/lib/browser-globals.js';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { Contract } from '../../compiled/contract/index.js';
import { recordWitnesses } from '../../contract/witnesses.js';
import { hexToBytes } from '../src/lib/bytes.js';
import { compileContract, createProviders, deployTarget, InMemoryPrivateStateProvider } from '../src/lib/wallet-adapter.js';

type PS = Record<string, never>;
type Target = Contract<PS>;
type CircuitId = 'recordQuest' | 'checkAttestation' | 'hasNullifier' | 'getCounterValue' | 'registerIssuer' | 'authorizeRecord';

export async function deployWithWallet(input: {
  connected: ConnectedAPI;
  assetBaseURL: string;
  adminKeyHex: string;
  scopeHex: string;
  durablePrivateState: PrivateStateProvider<PrivateStateId, PS>;
}) {
  if (!input.durablePrivateState || input.durablePrivateState instanceof InMemoryPrivateStateProvider) {
    throw new Error('Provide a durable encrypted private-state store with maintenance-key backup before deployment.');
  }
  const admin = hexToBytes(input.adminKeyHex);
  const scope = hexToBytes(input.scopeHex);
  if (admin.every((byte: number) => byte === 0) || scope.every((byte: number) => byte === 0)) throw new Error('Administrator identifier and scope must be nonzero.');
  const status = await input.connected.getConnectionStatus();
  if (status.status !== 'connected' || status.networkId !== 'preprod') throw new Error('Connect the wallet to Preprod first.');
  const { providers } = await createProviders<CircuitId, PS>(input.connected, input.assetBaseURL);
  // Constructor takes only public identifiers; no record witnesses are invoked.
  const zero = new Uint8Array(32);
  const witnesses = recordWitnesses<PS>({ questId: zero, version: 1n, userSecret: zero, localSecretKey: zero, salt: zero });
  const compiledContract = compileContract<Target>(Contract, witnesses, input.assetBaseURL, 'QuestAttestation');
  const deployed = await deployTarget<Target>({ ...providers, privateStateProvider: input.durablePrivateState }, {
    compiledContract, privateStateId: 'quest-attestation-preprod', initialPrivateState: {},
    args: [admin, scope],
  });
  // Do not return/log the whole deployment result: it contains private data.
  return {
    contractAddress: deployed.deployTxData.public.contractAddress,
    transactionId: deployed.deployTxData.public.txId,
  };
}
