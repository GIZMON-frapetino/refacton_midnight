import './browser-globals.js';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { Contract, ledger, type Witnesses } from '../../../compiled/contract/index.js';
import { recordWitnesses } from '../../../contract/witnesses.js';
import { MembershipError } from '../../../contract/membership-error.js';
import { bytesToHex, hexToBytes } from './bytes.js';
import { AppError, ERROR_CODES, createAppError, isAppError } from './check-errors.js';
import { exportMaterial, materialFromExport } from './simulator.js';
import { compileContract, createProviders, joinTarget, type PreparedProviders } from './wallet-adapter.js';
import { requireContractAddress } from './wallet-discovery.js';
import { sendOnPreprod, PreprodSafetyError } from './send-boundary.js';
import { transactionRecovery, type TransactionRecovery, type SendAttempt } from './transaction-recovery.js';
import { readPublicTransactionStatus } from './transaction-status.js';
import { isEncryptedProvider } from './encrypted-private-state.js';

type PS = Record<string, never>;
type Target = Contract<PS>;
type CircuitId = 'recordQuest' | 'checkAttestation' | 'hasNullifier' | 'getCounterValue' | 'registerIssuer' | 'authorizeRecord';
type LocalMembership = { state: 'PENDING' | 'MATCH' | 'MISSING' };
type CheckErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
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
  recovery: TransactionRecovery;
  privateStateProvider: PrivateStateProvider<PrivateStateId, PS> | undefined;
  readStatus: typeof readPublicTransactionStatus;
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

function safeFailure(error: unknown, fallback: CheckErrorCode = ERROR_CODES.UNKNOWN): AppError {
  if (isAppError(error)) return error;
  if (error instanceof PreprodSafetyError) {
    return createAppError(error.code === 'RECONNECT' ? ERROR_CODES.NETWORK_FAILURE : ERROR_CODES.UNKNOWN);
  }
  return createAppError(fallback);
}

export async function createNetworkRunner(
  connected: ConnectedAPI,
  requestedAddress: string,
  onInvalidated: () => void = () => {},
  injected: Partial<Dependencies> = {},
) {
  const deps: Dependencies = { createProviders, compileContract, joinTarget, assetBaseURL: networkAssetBaseURL, recovery: transactionRecovery, privateStateProvider: undefined, readStatus: readPublicTransactionStatus, ...injected };
  let active = true;
  function markInvalid() {
    if (!active) return;
    active = false;
    onInvalidated();
  }
  let setup: PreparedProviders<CircuitId, PS> & { address: string; assets: string };
  try {
    const address = requireContractAddress(requestedAddress);
    const assets = deps.assetBaseURL();
    const prepared = await deps.createProviders<CircuitId, PS>(connected, assets, markInvalid);
    setup = { address, assets, ...prepared };
    if (deps.privateStateProvider) {
      if (!isEncryptedProvider(deps.privateStateProvider) || !deps.privateStateProvider.getReadiness().unlocked) throw new Error();
      setup = { ...setup, providers: { ...setup.providers, privateStateProvider: deps.privateStateProvider } };
    }
  } catch (error) { throw safeFailure(error, ERROR_CODES.NETWORK_FAILURE); }
  const { address, assets, providers } = setup;
  deps.recovery.setStatusReader((txId, signal) => deps.readStatus(setup.configuration.indexerUri, txId, signal));

  function requireActive() {
    if (!active) throw new PreprodSafetyError('RECONNECT');
  }
  async function targetFor(material: ReturnType<typeof materialFromExport>, attempt: SendAttempt, localMembership?: LocalMembership) {
    requireActive();
    attempt.guard();
    let witnesses: Witnesses<PS> = recordWitnesses<PS>(material);
    if (localMembership) {
      const commitmentPath = witnesses.commitmentPath;
      witnesses = {
        ...witnesses,
        commitmentPath(context, commitment) {
          try {
            const result = commitmentPath(context, commitment);
            localMembership.state = 'MATCH';
            return result;
          } catch (error) {
            if (error instanceof MembershipError) localMembership.state = 'MISSING';
            throw error;
          }
        },
      };
    }
    const compiledContract = deps.compileContract<Target>(Contract, witnesses, assets, 'QuestAttestation');
    return deps.joinTarget<Target>({ ...providers, ...setup.forAttempt(attempt) }, {
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
          return await deps.recovery.execute(async (attempt) => {
          if (!session || (session.network && session.network !== 'preprod')) throw new Error('A new network record session is required.');
          const material = materialFromExport(session);
          const target = await targetFor(material, attempt);
          attempt.guard();
          // No sample issuer registration/approval is ever sent in network mode.
          const result = await target.callTx.recordQuest();
          return {
            ...exportMaterial(material), format: 'quest-attestation-preprod-session-v1',
            recorded: true, network: 'preprod', contractAddress: address,
            transactionId: result.public.txId,
            ledger: snapshot(result.public.nextContractState, address, result.public.txId),
            circuitOk: true, lastResponseHex: null,
          };
          });
        } catch (error) { throw safeFailure(error); }
      });
    },
    check(session: Session, questIdHex: string, challengeHex: string, differentSecret = false) {
      return sendOnPreprod(async () => {
        requireActive();
        const localMembership: LocalMembership = { state: 'PENDING' };
        try {
          return await deps.recovery.execute(async (attempt) => {
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
          const target = await targetFor(material, attempt, localMembership);
          attempt.guard();
          const result = await target.callTx.checkAttestation(challenge);
          if (localMembership.state !== 'MATCH') throw createAppError(ERROR_CODES.UNKNOWN);
          return {
            membership: 'match' as const,
            responseHex: bytesToHex(result.private.result),
            ledger: snapshot(result.public.nextContractState, address, result.public.txId),
            transactionId: result.public.txId,
          };
          });
        } catch (error) {
          if (localMembership.state === 'MISSING') throw createAppError(ERROR_CODES.LOCAL_MEMBERSHIP_MISSING);
          throw safeFailure(error);
        }
      });
    },
  };
}
