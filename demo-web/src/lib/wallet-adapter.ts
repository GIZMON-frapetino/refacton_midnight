import type { ConnectedAPI, Configuration, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  deployContract,
  findDeployedContract,
  type ContractProviders,
  type DeployContractOptionsWithPrivateState,
  type FindDeployedContractOptionsStorePrivateState,
} from '@midnight-ntwrk/midnight-js-contracts';
import { dappConnectorProvingProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as protocolLedger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { sendOnPreprod, PreprodSafetyError } from './send-boundary.js';
import { requireApprovedPrivateState } from './deployment-policy.js';
import {
  createProofProvider,
  type ExportPrivateStatesOptions,
  type ExportSigningKeysOptions,
  type ImportPrivateStatesOptions,
  type ImportPrivateStatesResult,
  type MidnightProvider,
  type MidnightProviders,
  type PrivateStateExport,
  type PrivateStateId,
  type PrivateStateProvider,
  type ProofProvider,
  type SigningKeyExport,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';

export const PREPROD_NETWORK = 'preprod';
const LACE_RDNS = 'io.lace.wallet';

export type LaceChoice = Readonly<{ instanceId: string; api: InitialAPI }>;
export type GeneratedContract<C extends Contract.Any> = Parameters<
  typeof CompiledContract.make<C>
>[1];
export type WalletAdapter = Readonly<{
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
  invalidate: (notify?: boolean) => void;
}>;
export type PreparedProviders<K extends string, PS> = Readonly<{
  providers: MidnightProviders<K, PrivateStateId, PS>;
  configuration: Configuration;
  invalidate: (notify?: boolean) => void;
}>;

export function enumerateLace(): readonly LaceChoice[] {
  if (typeof window === 'undefined') return [];
  const midnight = (window as Window & { midnight?: Record<string, InitialAPI> }).midnight;
  return Object.entries(midnight ?? {})
    .filter(([, api]) => api.rdns === LACE_RDNS && isSupportedV4(api.apiVersion))
    .map(([instanceId, api]) => ({ instanceId, api }));
}

export function connectLace(selected: InitialAPI): Promise<ConnectedAPI> {
  if (selected.rdns !== LACE_RDNS || !isSupportedV4(selected.apiVersion)) {
    return Promise.reject(new Error('Select a compatible Lace wallet.'));
  }
  const connecting: Promise<ConnectedAPI> = selected.connect(PREPROD_NETWORK);
  return connecting.then(async (connected: ConnectedAPI) => {
    const status = await connected.getConnectionStatus();
    if (status.status !== 'connected' || status.networkId !== PREPROD_NETWORK) {
      throw new Error('The connected wallet is not on preprod.');
    }
    return connected;
  });
}

export function compileContract<C extends Contract.Any>(
  generatedContract: GeneratedContract<C>,
  witnesses: Contract.Witnesses<C>,
  assetBaseURL: string,
  tag: string,
) {
  const binding = CompiledContract.make<C>(tag, generatedContract);
  const withWitnesses = CompiledContract.withWitnesses(binding, witnesses);
  return CompiledContract.withCompiledFileAssets(withWitnesses, assetBaseURL);
}

export const buildCompiledContract = compileContract;

export class InMemoryPrivateStateProvider<PS>
  implements PrivateStateProvider<PrivateStateId, PS>
{
  private readonly states = new Map<string, PS>();
  private readonly signingKeys = new Map<string, SigningKey>();
  private contractAddress: ContractAddress | undefined;

  setContractAddress(address: ContractAddress): void {
    this.contractAddress = address;
  }

  async set(privateStateId: PrivateStateId, state: PS): Promise<void> {
    this.states.set(this.stateKey(privateStateId), state);
  }

  async get(privateStateId: PrivateStateId): Promise<PS | null> {
    return this.states.get(this.stateKey(privateStateId)) ?? null;
  }

  async remove(privateStateId: PrivateStateId): Promise<void> {
    this.states.delete(this.stateKey(privateStateId));
  }

  async clear(): Promise<void> {
    const prefix = `${this.requiredAddress()}:`;
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) this.states.delete(key);
    }
  }

  async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
    this.signingKeys.set(address, signingKey);
  }

  async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
    return this.signingKeys.get(address) ?? null;
  }

  async removeSigningKey(address: ContractAddress): Promise<void> {
    this.signingKeys.delete(address);
  }

  async clearSigningKeys(): Promise<void> {
    this.signingKeys.clear();
  }

  async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
    throw new Error('Export is not available for memory-only private state.');
  }

  async importPrivateStates(
    _exportData: PrivateStateExport,
    _options?: ImportPrivateStatesOptions,
  ): Promise<ImportPrivateStatesResult> {
    throw new Error('Import is not available for memory-only private state.');
  }

  async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
    throw new Error('Export is not available for memory-only signing keys.');
  }

  async importSigningKeys(
    _exportData: SigningKeyExport,
    _options?: ImportPrivateStatesOptions,
  ): Promise<ImportPrivateStatesResult> {
    throw new Error('Import is not available for memory-only signing keys.');
  }

  private stateKey(privateStateId: PrivateStateId): string {
    return `${this.requiredAddress()}:${privateStateId}`;
  }

  private requiredAddress(): ContractAddress {
    if (this.contractAddress === undefined) {
      throw new Error('A contract address must be set before private-state access.');
    }
    return this.contractAddress;
  }
}

export function createWalletAdapter(
  connected: Pick<ConnectedAPI, 'balanceUnsealedTransaction' | 'submitTransaction' | 'getConnectionStatus' | 'getShieldedAddresses'>,
  shielded: Awaited<ReturnType<ConnectedAPI['getShieldedAddresses']>>,
  onInvalidated: () => void = () => {},
): WalletAdapter {
  let active = true;
  function invalidate(notify = true) {
    if (!active) return;
    active = false;
    if (notify) onInvalidated();
  }
  async function requireCurrentWallet() {
    try {
      if (!active) throw new Error();
      const status = await connected.getConnectionStatus();
      if (status.status !== 'connected' || status.networkId !== PREPROD_NETWORK) throw new Error();
      const current = await connected.getShieldedAddresses();
      if (current.shieldedCoinPublicKey !== shielded.shieldedCoinPublicKey || current.shieldedEncryptionPublicKey !== shielded.shieldedEncryptionPublicKey) throw new Error();
      if (!active) throw new Error();
    } catch {
      invalidate();
      throw new PreprodSafetyError('RECONNECT');
    }
  }
  const walletProvider: WalletProvider = {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
    balanceTx: (tx) => sendOnPreprod(async () => {
      await requireCurrentWallet();
      try {
        const balanced = await connected.balanceUnsealedTransaction(bytesToHex(tx.serialize()));
        return protocolLedger.Transaction.deserialize('signature', 'proof', 'binding', hexToBytes(balanced.tx));
      } catch { throw new Error('Wallet balance request failed or was declined. No automatic retry was made.'); }
    }),
  };
  const midnightProvider: MidnightProvider = {
    submitTx: (tx) => sendOnPreprod(async () => {
      await requireCurrentWallet();
      const [txId] = tx.identifiers();
      if (txId === undefined) throw new Error('The transaction has no identifier.');
      try { await connected.submitTransaction(bytesToHex(tx.serialize())); }
      catch { throw new Error('Wallet submission failed or was declined. Submission status may be uncertain; no automatic retry was made.'); }
      return txId;
    }),
  };
  return { walletProvider, midnightProvider, invalidate };
}

export async function prepareProviders<K extends string, PS>(input: Readonly<{
  connected: ConnectedAPI;
  assetBaseURL: string;
  onInvalidated?: () => void;
}>): Promise<PreparedProviders<K, PS>> {
  setNetworkId(PREPROD_NETWORK);
  const configuration = await input.connected.getConfiguration();
  if (configuration.networkId !== PREPROD_NETWORK) {
    throw new Error('The wallet configuration is not for preprod.');
  }
  const shielded = await input.connected.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<K>(input.assetBaseURL);
  const proofProvider = await selectProofProvider(input.connected, configuration, zkConfigProvider);
  const adapter = createWalletAdapter(input.connected, shielded, input.onInvalidated);
  return {
    configuration,
    invalidate: adapter.invalidate,
    providers: {
      privateStateProvider: new InMemoryPrivateStateProvider<PS>(),
      publicDataProvider: indexerPublicDataProvider(
        configuration.indexerUri,
        configuration.indexerWsUri,
      ),
      zkConfigProvider,
      proofProvider,
      ...adapter,
    },
  };
}

export function createProviders<K extends string, PS>(
  connected: ConnectedAPI,
  assetBaseURL: string,
  onInvalidated?: () => void,
): Promise<PreparedProviders<K, PS>> {
  return prepareProviders({ connected, assetBaseURL, onInvalidated });
}

export function requireDurablePrivateState<PS>(provider: PrivateStateProvider<PrivateStateId, PS>) {
  return requireApprovedPrivateState(provider);
}

export function deployTarget<C extends Contract.Any>(
  providers: ContractProviders<C>,
  options: DeployContractOptionsWithPrivateState<C>,
) {
  return sendOnPreprod(async () => {
    requireApprovedPrivateState(providers.privateStateProvider);
    return deployContract(providers, options);
  });
}

export function joinTarget<C extends Contract.Any>(
  providers: ContractProviders<C>,
  options: FindDeployedContractOptionsStorePrivateState<C>,
) {
  if (options.contractAddress.trim().length === 0) {
    throw new Error('A contract address is required.');
  }
  return findDeployedContract(providers, options);
}

function isSupportedV4(version: string): boolean {
  return /^4\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

async function selectProofProvider<K extends string>(
  connected: ConnectedAPI,
  configuration: Configuration,
  zkConfigProvider: FetchZkConfigProvider<K>,
): Promise<ProofProvider> {
  const optional = connected as Omit<ConnectedAPI, 'getProvingProvider'> & Partial<
    Pick<ConnectedAPI, 'getProvingProvider'>
  >;
  if (typeof optional.getProvingProvider === 'function') {
    try {
      const provingProvider = await dappConnectorProvingProvider(
        { getProvingProvider: optional.getProvingProvider.bind(connected) },
        zkConfigProvider,
      );
      return createProofProvider(provingProvider);
    } catch {
      // Some extensions expose the method but do not implement it yet.
    }
  }
  if (configuration.proverServerUri === undefined || configuration.proverServerUri.length === 0) {
    throw new Error('No local calculation URL is configured in Lace.');
  }
  const local = new URL(configuration.proverServerUri);
  if (!['http:', 'https:'].includes(local.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) {
    throw new Error('Calculation fallback must use a loopback service on your own computer.');
  }
  return httpClientProofProvider(configuration.proverServerUri, zkConfigProvider);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const value = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error('The wallet returned an invalid transaction encoding.');
  }
  return new Uint8Array(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}
