import './browser-globals.js';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Contract, ledger, type Witnesses } from '../../../compiled/contract/index.js';
import { recordWitnesses } from '../../../contract/witnesses.js';
import { bytesToHex, hexToBytes } from './bytes.js';
import { exportMaterial, materialFromExport } from './simulator.js';
import { compileContract, createProviders, joinTarget } from './wallet-adapter.js';
import { requireContractAddress } from './wallet-discovery.js';

type PS = Record<string, never>;
type Target = Contract<PS>;
type CircuitId = 'recordQuest' | 'checkAttestation' | 'hasNullifier' | 'getCounterValue' | 'registerIssuer' | 'authorizeRecord';
type Session = ReturnType<typeof exportMaterial> & {
  recorded: boolean;
  network?: string;
  contractAddress?: string;
  transactionId?: string;
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
  const message = error instanceof Error ? error.message : '';
  for (const known of ['Attestation not found', 'Path is not for this record', 'Record lacks issuer authorization', 'Quest already recorded by this user']) {
    if (message.includes(known)) return new Error(known);
  }
  return new Error('Preprod request failed or was declined. Check wallet, issuer approval, contract assets, service and network. No simulator result was substituted.');
}

export async function createNetworkRunner(connected: ConnectedAPI, requestedAddress: string) {
  const address = requireContractAddress(requestedAddress);
  const assets = networkAssetBaseURL();
  const { providers } = await createProviders<CircuitId, PS>(connected, assets);
  const transactionsEnabled = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_ENABLE_PREPROD_TRANSACTIONS === 'true';
  function requireTransactionsEnabled() {
    if (!transactionsEnabled) throw new Error('Live Preprod transactions are disabled in this draft. Operator review, durable storage and live acceptance are required before enabling them.');
  }

  async function targetFor(material: ReturnType<typeof materialFromExport>) {
    // The JS witness adapter is exercised by the compiled-contract simulator tests.
    const witnesses: Witnesses<PS> = recordWitnesses<PS>(material);
    const compiledContract = compileContract<Target>(Contract, witnesses, assets, 'QuestAttestation');
    return joinTarget<Target>(providers, {
      compiledContract, contractAddress: address,
      privateStateId: 'quest-attestation-preprod', initialPrivateState: {},
    });
  }

  return {
    async record(session: Session) {
      requireTransactionsEnabled();
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
    },
    async check(session: Session, questIdHex: string, challengeHex: string, differentSecret = false) {
      requireTransactionsEnabled();
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
    },
  };
}
