import './browser-globals.js';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Contract, ledger, type Witnesses } from '../../../compiled/contract/index.js';
import { recordWitnesses } from '../../../contract/witnesses.js';
import { bytesToHex, hexToBytes } from './bytes.js';
import { exportMaterial, materialFromExport } from './simulator.js';
import { compileContract, createProviders, joinTarget } from './wallet-adapter.js';
import { requireContractAddress } from './wallet-discovery.js';
import { sendOnPreprod, PreprodSafetyError } from './send-boundary.js';

type PS = Record<string, never>;
type Target = Contract<PS>;
type CircuitId = 'recordQuest' | 'checkAttestation' | 'hasNullifier' | 'getCounterValue' | 'registerIssuer' | 'authorizeRecord';
type Session = ReturnType<typeof exportMaterial> & {
  recorded: boolean;
  network?: string;
  contractAddress?: string;
  transactionId?: string;
};
type Dependencies = {
  createProviders: typeof createProviders;
  compileContract: typeof compileContract;
  joinTarget: typeof joinTarget;
  assetBaseURL: () => string;
};

export function networkAssetBaseURL() {
  return new URL('./contract-assets/', document.baseURI).href;
}

function snapshot(state: Parameters<typeof ledger>[0], address: string, transactionId: string) {
  const current = ledger(state);
  return {
    network: 'preprod', contractAddress: address, transactionId,
    counter: current.counter.toString(),
    treeRoot: current.commitments.root().field.toString(16).padStart(64, '0'),
    commitmentCount: current.commitments.firstFree().toString(),
    nullifiers: [...current.nullifiers].map(bytesToHex),
    issuerKeys: [...current.issuerKeys].map(bytesToHex),
    authorizationCount: current.recordAuthorizations.size().toString(),
  };
}

function safeFailure(error: unknown): Error {
  if (error instanceof PreprodSafetyError) return error;
  const message = error instanceof Error ? error.message : '';
  for (const known of ['Attestation not found', 'Path is not for this record', 'Record lacks issuer authorization', 'Quest already recorded by this user']) {
    if (message.includes(known)) return new Error(known);
  }
  return new Error('Preprod request failed or was declined. Check wallet, issuer approval, contract assets, service and network. No simulator result was substituted.');
}

export async function createNetworkRunner(
  connected: ConnectedAPI,
  requestedAddress: string,
  onInvalidated: () => void = () => {},
  injected: Partial<Dependencies> = {},
) {
  const deps: Dependencies = { createProviders, compileContract, joinTarget, assetBaseURL: networkAssetBaseURL, ...injected };
  let active = true;
  function markInvalid() {
    if (!active) return;
    active = false;
    onInvalidated();
  }
  let setup;
  try {
    const address = requireContractAddress(requestedAddress);
    const assets = deps.assetBaseURL();
    const prepared = await deps.createProviders<CircuitId, PS>(connected, assets, markInvalid);
    setup = { address, assets, ...prepared };
  } catch (error) { throw safeFailure(error); }
  const { address, assets, providers } = setup;

  function requireActive() {
    if (!active) throw new PreprodSafetyError('RECONNECT');
  }
  async function targetFor(material: ReturnType<typeof materialFromExport>) {
    requireActive();
    const witnesses: Witnesses<PS> = recordWitnesses<PS>(material);
    const compiledContract = deps.compileContract<Target>(Contract, witnesses, assets, 'QuestAttestation');
    return deps.joinTarget<Target>(providers, {
      compiledContract, contractAddress: address,
      privateStateId: 'quest-attestation-preprod', initialPrivateState: {},
    });
  }

  return {
    invalidate() { active = false; setup.invalidate(false); },
    record(session: Session) {
      return sendOnPreprod(async () => {
        requireActive();
        try {
          if (!session || (session.network && session.network !== 'preprod')) throw new Error('A new network record session is required.');
          const material = materialFromExport(session);
          const target = await targetFor(material);
          // No sample issuer registration/approval is ever sent in network mode.
          const result = await target.callTx.recordQuest();
          return {
            ...exportMaterial(material), format: 'quest-attestation-preprod-session-v1',
            recorded: true, network: 'preprod', contractAddress: address,
            transactionId: result.public.txId,
            ledger: snapshot(result.public.nextContractState, address, result.public.txId),
            circuitOk: true, lastResponseHex: null,
          };
        } catch (error) { throw safeFailure(error); }
      });
    },
    check(session: Session, questIdHex: string, challengeHex: string, differentSecret = false) {
      return sendOnPreprod(async () => {
        requireActive();
        try {
          if (session?.network !== 'preprod' || session.contractAddress !== address || !session.recorded) {
            throw new Error('The network session is not for the selected contract.');
          }
          const material = materialFromExport(session);
          material.questId = hexToBytes(questIdHex.trim());
          const challenge = hexToBytes(challengeHex.trim());
          if (differentSecret) {
            material.userSecret = new Uint8Array(material.userSecret);
            material.userSecret[0] = material.userSecret[0]! ^ 1;
          }
          const target = await targetFor(material);
          const result = await target.callTx.checkAttestation(challenge);
          return {
            responseHex: bytesToHex(result.private.result),
            ledger: snapshot(result.public.nextContractState, address, result.public.txId),
            transactionId: result.public.txId,
          };
        } catch (error) { throw safeFailure(error); }
      });
    },
  };
}
