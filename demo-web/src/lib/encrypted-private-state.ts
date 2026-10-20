import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

const STORE_NAME = 'vault';
const STORE_KEY = 'current';
const FORMAT = 'encrypted-private-state-vault';
const PAYLOAD_FORMAT = 'encrypted-private-state-payload';
const VERSION = 1;
const ITERATIONS = 600_000;
const MAX_ITERATIONS = 900_000;
const MAX_BACKUP_CHARS = 1_400_000;
const MAX_VAULT_BYTES = 1_000_000;
const MAX_ENTRIES = 10_000;
const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_VALUE_DEPTH = 64;
const MAX_VALUE_NODES = 40_000;
const ACCESS_ERROR = 'Unable to unlock encrypted storage.';
const BACKUP_ERROR = 'Invalid encrypted backup.';
const CONCURRENT_ERROR = 'Concurrent encrypted storage update rejected. Reload and unlock again.';

class ConcurrentUpdateError extends Error {
  constructor() {
    super(CONCURRENT_ERROR);
  }
}

type TaggedValue =
  | null
  | boolean
  | string
  | number
  | Readonly<{ t: 'undefined' }>
  | Readonly<{ t: 'bigint'; v: string }>
  | Readonly<{ t: 'negative-zero' }>
  | Readonly<{ t: 'bytes'; v: string }>
  | Readonly<{ t: 'array'; v: readonly TaggedValue[] }>
  | Readonly<{ t: 'object'; v: readonly (readonly [string, TaggedValue])[] }>;

type VaultEntry = readonly [string, TaggedValue];

type VaultPayload = Readonly<{
  format: typeof PAYLOAD_FORMAT;
  states: readonly VaultEntry[];
  signingKeys: readonly VaultEntry[];
}>;

type CipherVault = Readonly<{
  format: typeof FORMAT;
  version: typeof VERSION;
  revision: string;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}>;

export type EncryptedPrivateStateReadiness = Readonly<{
  initialized: boolean;
  unlocked: boolean;
  backupExported: boolean;
  restoreChecked: boolean;
  deployReady: boolean;
}>;

export type EncryptedPrivateStateOptions = Readonly<{
  databaseName?: string;
  indexedDB?: IDBFactory;
  crypto?: Crypto;
}>;

const providerBrand = new WeakSet<object>();

export class EncryptedPrivateStateProvider<PS>
  implements PrivateStateProvider<PrivateStateId, PS>
{
  private readonly databaseName: string;
  private readonly indexedDBFactory: IDBFactory | undefined;
  private readonly cryptoApi: Crypto | undefined;
  private database: Promise<IDBDatabase> | undefined;
  private contractAddress: ContractAddress | undefined;
  private key: CryptoKey | undefined;
  private payload: VaultPayload | undefined;
  private record: CipherVault | undefined;
  private initialized = false;
  private backupExported = false;
  private restoreChecked = false;
  private operationQueue: Promise<void> = Promise.resolve();
  private epoch = 0;

  constructor(options: EncryptedPrivateStateOptions = {}) {
    this.databaseName = options.databaseName ?? 'encrypted-private-state-v1';
    this.indexedDBFactory = options.indexedDB ?? globalThis.indexedDB;
    this.cryptoApi = options.crypto ?? globalThis.crypto;
    providerBrand.add(this);
  }

  setContractAddress(address: ContractAddress): void {
    if (typeof address !== 'string' || address.length === 0 || address.length > MAX_IDENTIFIER_LENGTH || address.includes('\u0000')) {
      throw new Error('A valid contract address is required.');
    }
    this.contractAddress = address;
  }

  async initialize(passphrase: string): Promise<void> {
    this.assertPassphrase(passphrase);
    await this.serialized(async () => {
      const operationEpoch = this.epoch;
      const existing = await this.readRecord();
      if (existing !== null) throw new Error('Encrypted storage already exists. Unlock it instead.');
      const salt = this.randomBytes(16);
      const key = await this.deriveKey(passphrase, salt, ITERATIONS);
      this.assertCurrent(operationEpoch);
      const record = await this.encryptPayload(this.emptyPayload(), key, salt, ITERATIONS);
      this.assertCurrent(operationEpoch);
      await this.writeRecord(record, null);
      this.assertCurrent(operationEpoch);
      this.adopt(record, this.emptyPayload(), key);
    });
  }

  async unlock(passphrase: string): Promise<void> {
    this.assertPassphrase(passphrase);
    await this.serialized(async () => {
      const operationEpoch = this.epoch;
      const record = await this.readRequiredRecord();
      const { key, payload } = await this.openRecord(record, passphrase);
      this.assertCurrent(operationEpoch);
      this.adopt(record, payload, key);
    });
  }

  lock(): void {
    this.epoch += 1;
    this.key = undefined;
    this.payload = undefined;
    this.record = undefined;
    this.contractAddress = undefined;
    this.backupExported = false;
    this.restoreChecked = false;
  }

  async exportEncryptedBackup(): Promise<string> {
    return this.serialized(async () => {
      const active = this.requireUnlocked();
      const stored = await this.readRequiredRecord();
      if (!sameRecord(active.record, stored)) {
        this.lock();
        throw new Error(CONCURRENT_ERROR);
      }
      const text = JSON.stringify(stored);
      if (text.length > MAX_BACKUP_CHARS) throw new Error(BACKUP_ERROR);
      this.backupExported = true;
      this.restoreChecked = false;
      return text;
    });
  }

  async importEncryptedBackup(text: string, passphrase: string): Promise<void> {
    this.assertPassphrase(passphrase);
    await this.serialized(async () => {
      const operationEpoch = this.epoch;
      const candidate = this.parseBackup(text);
      const { key, payload } = await this.openRecord(candidate, passphrase);
      this.assertCurrent(operationEpoch);
      const existing = await this.readRecord();
      await this.writeRecord(candidate, existing?.revision ?? null);
      this.assertCurrent(operationEpoch);
      this.adopt(candidate, payload, key);
    });
  }

  async confirmRestore(text: string, passphrase: string): Promise<void> {
    this.assertPassphrase(passphrase);
    await this.serialized(async () => {
      const active = this.requireUnlocked();
      if (!this.backupExported) throw new Error('Export an encrypted backup before the restore check.');
      const candidate = this.parseBackup(text);
      await this.openRecord(candidate, passphrase);
      const stored = await this.readRequiredRecord();
      const [candidateDigest, storedDigest] = await Promise.all([
        this.digest(candidate),
        this.digest(stored),
      ]);
      if (!constantTimeEqual(candidateDigest, storedDigest)) {
        throw new Error('The encrypted backup does not match current storage.');
      }
      if (!sameRecord(stored, active.record)) {
        this.lock();
        throw new Error(CONCURRENT_ERROR);
      }
      this.restoreChecked = true;
    });
  }

  getReadiness(): EncryptedPrivateStateReadiness {
    const unlocked = this.key !== undefined && this.payload !== undefined && this.record !== undefined;
    const backupExported = unlocked && this.backupExported;
    const restoreChecked = backupExported && this.restoreChecked;
    return Object.freeze({
      initialized: this.initialized,
      unlocked,
      backupExported,
      restoreChecked,
      deployReady: this.initialized && unlocked && backupExported && restoreChecked,
    });
  }

  async checkDeploymentReadiness(): Promise<this> {
    return this.serialized(async () => {
      const operationEpoch = this.epoch;
      const active = this.requireUnlocked();
      if (!this.getReadiness().deployReady) throw new Error('Encrypted storage is not ready for deployment.');
      const stored = await this.readRequiredRecord();
      this.assertCurrent(operationEpoch);
      if (!sameRecord(active.record, stored)) {
        this.lock();
        throw new Error(CONCURRENT_ERROR);
      }
      if (!this.getReadiness().deployReady) throw new Error('Encrypted storage is not ready for deployment.');
      this.assertCurrent(operationEpoch);
      return this;
    });
  }

  async set(privateStateId: PrivateStateId, state: PS): Promise<void> {
    const key = this.stateKey(privateStateId);
    const encoded = encodeValue(state);
    await this.updatePayload((payload) => ({
      ...payload,
      states: replaceEntry(payload.states, key, encoded),
    }));
  }

  async get(privateStateId: PrivateStateId): Promise<PS | null> {
    const payload = this.requireUnlocked().payload;
    const entry = payload.states.find(([key]) => key === this.stateKey(privateStateId));
    return entry === undefined ? null : decodeValue(entry[1]) as PS;
  }

  async remove(privateStateId: PrivateStateId): Promise<void> {
    const key = this.stateKey(privateStateId);
    await this.updatePayload((payload) => ({
      ...payload,
      states: payload.states.filter(([entryKey]) => entryKey !== key),
    }));
  }

  async clear(): Promise<void> {
    const prefix = `${this.requiredAddress()}\u0000`;
    await this.updatePayload((payload) => ({
      ...payload,
      states: payload.states.filter(([key]) => !key.startsWith(prefix)),
    }));
  }

  async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
    const key = this.signingKeyKey(address);
    const encoded = encodeValue(signingKey);
    await this.updatePayload((payload) => ({
      ...payload,
      signingKeys: replaceEntry(payload.signingKeys, key, encoded),
    }));
  }

  async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
    const payload = this.requireUnlocked().payload;
    const entry = payload.signingKeys.find(([key]) => key === this.signingKeyKey(address));
    return entry === undefined ? null : decodeValue(entry[1]) as SigningKey;
  }

  async removeSigningKey(address: ContractAddress): Promise<void> {
    const key = this.signingKeyKey(address);
    await this.updatePayload((payload) => ({
      ...payload,
      signingKeys: payload.signingKeys.filter(([entryKey]) => entryKey !== key),
    }));
  }

  async clearSigningKeys(): Promise<void> {
    await this.updatePayload((payload) => ({ ...payload, signingKeys: [] }));
  }

  async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
    throw new Error('Plaintext SDK exports are disabled.');
  }

  async importPrivateStates(
    _exportData: PrivateStateExport,
    _options?: ImportPrivateStatesOptions,
  ): Promise<ImportPrivateStatesResult> {
    throw new Error('Plaintext SDK imports are disabled.');
  }

  async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
    throw new Error('Plaintext SDK exports are disabled.');
  }

  async importSigningKeys(
    _exportData: SigningKeyExport,
    _options?: ImportSigningKeysOptions,
  ): Promise<ImportPrivateStatesResult> {
    throw new Error('Plaintext SDK imports are disabled.');
  }

  private async updatePayload(change: (payload: VaultPayload) => VaultPayload): Promise<void> {
    await this.serialized(async () => {
      const operationEpoch = this.epoch;
      const active = this.requireUnlocked();
      const next = change(copyPayload(active.payload));
      assertPayload(next);
      const record = await this.encryptPayload(next, active.key, fromBase64(active.record.salt), active.record.iterations);
      this.assertCurrent(operationEpoch);
      try {
        await this.writeRecord(record, active.record.revision);
      } catch (error) {
        this.lock();
        if (error instanceof ConcurrentUpdateError) throw new Error(CONCURRENT_ERROR);
        throw new Error('Encrypted storage update failed.');
      }
      this.assertCurrent(operationEpoch);
      this.record = record;
      this.payload = next;
      this.initialized = true;
      this.backupExported = false;
      this.restoreChecked = false;
    });
  }

  private async openRecord(record: CipherVault, passphrase: string): Promise<Readonly<{ key: CryptoKey; payload: VaultPayload }>> {
    try {
      const key = await this.deriveKey(passphrase, fromBase64(record.salt), record.iterations);
      const encrypted = fromBase64(record.ciphertext);
      const plaintext = await this.subtle().decrypt(
        { name: 'AES-GCM', iv: cryptoBuffer(fromBase64(record.iv)), additionalData: cryptoBuffer(aad(record)) },
        key,
        cryptoBuffer(encrypted),
      );
      if (plaintext.byteLength > MAX_VAULT_BYTES) throw new Error();
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
      const payload = parsePayload(decoded);
      return { key, payload };
    } catch {
      throw new Error(ACCESS_ERROR);
    }
  }

  private async encryptPayload(
    payload: VaultPayload,
    key: CryptoKey,
    salt: Uint8Array,
    iterations = ITERATIONS,
  ): Promise<CipherVault> {
    const plaintext = encodePayload(payload);
    const iv = this.randomBytes(12);
    const record: CipherVault = Object.freeze({
      format: FORMAT,
      version: VERSION,
      revision: toBase64(this.randomBytes(12)),
      salt: toBase64(salt),
      iterations,
      iv: toBase64(iv),
      ciphertext: '',
    });
    const encrypted = await this.subtle().encrypt(
      { name: 'AES-GCM', iv: cryptoBuffer(iv), additionalData: cryptoBuffer(aad(record)) },
      key,
      cryptoBuffer(plaintext),
    );
    if (encrypted.byteLength > MAX_VAULT_BYTES + 32) throw new Error('Encrypted storage is too large.');
    return Object.freeze({ ...record, ciphertext: toBase64(new Uint8Array(encrypted)) });
  }

  private async digest(record: CipherVault): Promise<Uint8Array> {
    return new Uint8Array(await this.subtle().digest('SHA-256', new TextEncoder().encode(JSON.stringify(record))));
  }

  private async deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    if (iterations < ITERATIONS || iterations > MAX_ITERATIONS) throw new Error(ACCESS_ERROR);
    const bytes = new TextEncoder().encode(passphrase);
    try {
      const material = await this.subtle().importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
      return await this.subtle().deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: cryptoBuffer(salt), iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    } finally {
      bytes.fill(0);
    }
  }

  private randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    this.cryptoOrThrow().getRandomValues(bytes);
    return bytes;
  }

  private subtle(): SubtleCrypto {
    return this.cryptoOrThrow().subtle;
  }

  private cryptoOrThrow(): Crypto {
    if (this.cryptoApi === undefined || this.cryptoApi.subtle === undefined) {
      throw new Error('Browser cryptography is unavailable.');
    }
    return this.cryptoApi;
  }

  private requireUnlocked(): Readonly<{ key: CryptoKey; payload: VaultPayload; record: CipherVault }> {
    if (this.key === undefined || this.payload === undefined || this.record === undefined) {
      throw new Error('Encrypted storage is locked.');
    }
    return { key: this.key, payload: this.payload, record: this.record };
  }

  private requiredAddress(): ContractAddress {
    if (this.contractAddress === undefined) throw new Error('A contract address must be set before private-state access.');
    return this.contractAddress;
  }

  private stateKey(privateStateId: PrivateStateId): string {
    if (typeof privateStateId !== 'string' || privateStateId.length === 0 || privateStateId.length > MAX_IDENTIFIER_LENGTH || privateStateId.includes('\u0000')) {
      throw new Error('A valid private-state identifier is required.');
    }
    return `${this.requiredAddress()}\u0000${privateStateId}`;
  }

  private signingKeyKey(address: ContractAddress): string {
    if (typeof address !== 'string' || address.length === 0 || address.length > MAX_IDENTIFIER_LENGTH || address.includes('\u0000')) {
      throw new Error('A valid contract address is required.');
    }
    return address;
  }

  private emptyPayload(): VaultPayload {
    return Object.freeze({ format: PAYLOAD_FORMAT, states: [], signingKeys: [] });
  }

  private adopt(record: CipherVault, payload: VaultPayload, key: CryptoKey): void {
    this.record = record;
    this.payload = payload;
    this.key = key;
    this.initialized = true;
    this.backupExported = false;
    this.restoreChecked = false;
  }

  private assertPassphrase(passphrase: string): void {
    if (typeof passphrase !== 'string' || passphrase.length < 12) {
      throw new Error('Passphrase must contain at least 12 characters.');
    }
  }

  private assertCurrent(operationEpoch: number): void {
    if (operationEpoch !== this.epoch) throw new Error('Encrypted storage was locked during this operation.');
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async databaseConnection(): Promise<IDBDatabase> {
    if (this.indexedDBFactory === undefined) throw new Error('IndexedDB is unavailable.');
    this.database ??= openDatabase(this.indexedDBFactory, this.databaseName);
    return this.database;
  }

  private async readRecord(): Promise<CipherVault | null> {
    const database = await this.databaseConnection();
    return new Promise<CipherVault | null>((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Encrypted storage is unavailable.'));
        }
      };
      try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(STORE_KEY);
        request.onsuccess = () => {
          if (settled) return;
          try {
            const record = request.result === undefined ? null : normalizeRecord(request.result);
            settled = true;
            resolve(record);
          } catch {
            fail();
          }
        };
        request.onerror = fail;
        transaction.onerror = fail;
        transaction.onabort = fail;
      } catch {
        fail();
      }
    });
  }

  private async readRequiredRecord(): Promise<CipherVault> {
    const record = await this.readRecord();
    if (record === null) throw new Error('Encrypted storage has not been initialized.');
    return record;
  }

  private parseBackup(text: string): CipherVault {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BACKUP_CHARS) throw new Error(BACKUP_ERROR);
    try {
      return normalizeRecord(JSON.parse(text));
    } catch {
      throw new Error(BACKUP_ERROR);
    }
  }

  private async writeRecord(record: CipherVault, expectedRevision: string | null): Promise<void> {
    const database = await this.databaseConnection();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (!settled) {
          settled = true;
          callback();
        }
      };
      try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(STORE_KEY);
        request.onsuccess = () => {
          try {
            const existing = request.result === undefined ? null : normalizeRecord(request.result);
            if ((expectedRevision === null && existing !== null) || (expectedRevision !== null && existing?.revision !== expectedRevision)) {
              finish(() => reject(new ConcurrentUpdateError()));
              transaction.abort();
              return;
            }
            store.put(record, STORE_KEY);
          } catch {
            finish(() => reject(new Error('Encrypted storage update failed.')));
            transaction.abort();
          }
        };
        request.onerror = () => finish(() => reject(new Error('Encrypted storage update failed.')));
        transaction.oncomplete = () => finish(resolve);
        transaction.onerror = () => finish(() => reject(new Error('Encrypted storage update failed.')));
        transaction.onabort = () => finish(() => reject(new Error('Encrypted storage update failed.')));
      } catch {
        finish(() => reject(new Error('Encrypted storage update failed.')));
      }
    });
  }
}

export function createEncryptedPrivateStateProvider<PS>(
  options: EncryptedPrivateStateOptions = {},
): EncryptedPrivateStateProvider<PS> {
  return new EncryptedPrivateStateProvider<PS>(options);
}

export function isEncryptedProvider(value: unknown): value is EncryptedPrivateStateProvider<unknown> {
  return typeof value === 'object' && value !== null && providerBrand.has(value);
}

export function isEncryptedPrivateStateProvider(value: unknown): value is EncryptedPrivateStateProvider<unknown> {
  return isEncryptedProvider(value);
}

export function assertEncryptedProvider<PS>(
  provider: PrivateStateProvider<PrivateStateId, PS>,
): EncryptedPrivateStateProvider<PS> {
  if (!isEncryptedProvider(provider)) throw new Error('An encrypted private-state provider is required.');
  return provider as EncryptedPrivateStateProvider<PS>;
}

export function requireDeploymentReadiness<PS>(
  provider: PrivateStateProvider<PrivateStateId, PS>,
): EncryptedPrivateStateProvider<PS> {
  const encrypted = assertEncryptedProvider(provider);
  if (!encrypted.getReadiness().deployReady) throw new Error('Encrypted storage is not ready for deployment.');
  return encrypted;
}

export async function checkDeploymentReadiness<PS>(
  provider: PrivateStateProvider<PrivateStateId, PS>,
): Promise<EncryptedPrivateStateProvider<PS>> {
  const encrypted = assertEncryptedProvider(provider);
  return encrypted.checkDeploymentReadiness();
}

export function assertReady<PS>(
  provider: PrivateStateProvider<PrivateStateId, PS>,
): EncryptedPrivateStateProvider<PS> {
  return requireDeploymentReadiness(provider);
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = factory.open(name, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('IndexedDB is unavailable.'));
      request.onblocked = () => reject(new Error('IndexedDB is unavailable.'));
    } catch {
      reject(new Error('IndexedDB is unavailable.'));
    }
  });
}

function normalizeRecord(value: unknown): CipherVault {
  if (!isPlainObject(value)) throw new Error(BACKUP_ERROR);
  const format = value.format;
  const version = value.version;
  const revision = value.revision;
  const salt = value.salt;
  const iterations = value.iterations;
  const iv = value.iv;
  const ciphertext = value.ciphertext;
  if (
    format !== FORMAT ||
    version !== VERSION ||
    typeof revision !== 'string' ||
    typeof salt !== 'string' ||
    typeof iterations !== 'number' ||
    typeof iv !== 'string' ||
    typeof ciphertext !== 'string' ||
    !Number.isInteger(iterations) ||
    iterations < ITERATIONS ||
    iterations > MAX_ITERATIONS ||
    revision.length !== 16 ||
    salt.length !== 24 ||
    iv.length !== 16 ||
    ciphertext.length > MAX_BACKUP_CHARS
  ) throw new Error(BACKUP_ERROR);
  const normalized: CipherVault = Object.freeze({ format, version, revision, salt, iterations, iv, ciphertext });
  if (fromBase64(normalized.revision).byteLength !== 12 || fromBase64(normalized.salt).byteLength !== 16 || fromBase64(normalized.iv).byteLength !== 12) {
    throw new Error(BACKUP_ERROR);
  }
  const ciphertextBytes = fromBase64(normalized.ciphertext);
  if (ciphertextBytes.byteLength < 17 || ciphertextBytes.byteLength > MAX_VAULT_BYTES + 32) throw new Error(BACKUP_ERROR);
  return normalized;
}

function parsePayload(text: string): VaultPayload {
  if (text.length > MAX_VAULT_BYTES) throw new Error();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error();
  }
  if (!isPlainObject(value) || value.format !== PAYLOAD_FORMAT || !Array.isArray(value.states) || !Array.isArray(value.signingKeys)) throw new Error();
  if (value.states.length > MAX_ENTRIES || value.signingKeys.length > MAX_ENTRIES) throw new Error();
  return Object.freeze({
    format: PAYLOAD_FORMAT,
    states: normalizeEntries(value.states),
    signingKeys: normalizeEntries(value.signingKeys),
  });
}

function normalizeEntries(value: readonly unknown[]): readonly VaultEntry[] {
  const seen = new Set<string>();
  const budget = { nodes: 0 };
  return Object.freeze(value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || entry[0].length === 0 || entry[0].length > MAX_IDENTIFIER_LENGTH * 2 + 1) throw new Error();
    if (seen.has(entry[0])) throw new Error();
    seen.add(entry[0]);
    return Object.freeze([entry[0], normalizeTaggedValue(entry[1], 0, budget)] as const);
  }));
}

function normalizeTaggedValue(value: unknown, depth: number, budget: { nodes: number }): TaggedValue {
  if (depth > MAX_VALUE_DEPTH || ++budget.nodes > MAX_VALUE_NODES) throw new Error();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > MAX_VAULT_BYTES) throw new Error();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error();
    return value;
  }
  if (!isPlainObject(value) || typeof value.t !== 'string') throw new Error();
  if (value.t === 'undefined' && hasExactKeys(value, ['t'])) return Object.freeze({ t: 'undefined' });
  if (value.t === 'negative-zero' && hasExactKeys(value, ['t'])) return Object.freeze({ t: 'negative-zero' });
  if (value.t === 'bigint' && typeof value.v === 'string' && hasExactKeys(value, ['t', 'v']) && /^-?(?:0|[1-9][0-9]*)$/.test(value.v)) {
    return Object.freeze({ t: 'bigint', v: value.v });
  }
  if (value.t === 'bytes' && typeof value.v === 'string' && hasExactKeys(value, ['t', 'v'])) {
    const bytes = fromBase64(value.v);
    if (bytes.byteLength > MAX_VAULT_BYTES) throw new Error();
    return Object.freeze({ t: 'bytes', v: value.v });
  }
  if (value.t === 'array' && Array.isArray(value.v) && hasExactKeys(value, ['t', 'v']) && value.v.length <= MAX_VALUE_NODES) {
    return Object.freeze({ t: 'array', v: Object.freeze(value.v.map((item) => normalizeTaggedValue(item, depth + 1, budget))) });
  }
  if (value.t === 'object' && Array.isArray(value.v) && hasExactKeys(value, ['t', 'v']) && value.v.length <= MAX_VALUE_NODES) {
    const keys = new Set<string>();
    const entries = value.v.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || entry[0].length > MAX_IDENTIFIER_LENGTH) throw new Error();
      if (keys.has(entry[0])) throw new Error();
      keys.add(entry[0]);
      return Object.freeze([entry[0], normalizeTaggedValue(entry[1], depth + 1, budget)] as const);
    });
    return Object.freeze({ t: 'object', v: Object.freeze(entries) });
  }
  throw new Error();
}

function encodePayload(payload: VaultPayload): Uint8Array {
  assertPayload(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.byteLength > MAX_VAULT_BYTES) throw new Error('Encrypted storage is too large.');
  return bytes;
}

function assertPayload(payload: VaultPayload): void {
  parsePayload(JSON.stringify(payload));
}

function encodeValue(value: unknown, depth = 0, seen = new Set<object>()): TaggedValue {
  if (depth > MAX_VALUE_DEPTH) throw new Error('Private state is too deeply nested.');
  if (value === undefined) return Object.freeze({ t: 'undefined' });
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Private state contains an unsupported number.');
    return Object.is(value, -0) ? Object.freeze({ t: 'negative-zero' }) : value;
  }
  if (typeof value === 'bigint') return Object.freeze({ t: 'bigint', v: value.toString() });
  if (value instanceof Uint8Array) return Object.freeze({ t: 'bytes', v: toBase64(value) });
  if (typeof value !== 'object' || value === null) throw new Error('Private state contains an unsupported value.');
  if (seen.has(value)) throw new Error('Private state contains a cycle.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_VALUE_NODES) throw new Error('Private state is too large.');
      return Object.freeze({ t: 'array', v: Object.freeze(value.map((item) => encodeValue(item, depth + 1, seen))) });
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Private state contains an unsupported object.');
    const keys = Object.keys(value);
    if (keys.length > MAX_VALUE_NODES) throw new Error('Private state is too large.');
    return Object.freeze({
      t: 'object',
      v: Object.freeze(keys.map((key) => Object.freeze([key, encodeValue((value as Record<string, unknown>)[key], depth + 1, seen)] as const))),
    });
  } finally {
    seen.delete(value);
  }
}

function decodeValue(value: TaggedValue): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return value;
  if (value.t === 'undefined') return undefined;
  if (value.t === 'negative-zero') return -0;
  if (value.t === 'bigint') return BigInt(value.v);
  if (value.t === 'bytes') return fromBase64(value.v);
  if (value.t === 'array') return value.v.map((entry) => decodeValue(entry));
  const result: Record<string, unknown> = {};
  for (const [key, entry] of value.v) {
    Object.defineProperty(result, key, { value: decodeValue(entry), enumerable: true, configurable: true, writable: true });
  }
  return result;
}

function replaceEntry(entries: readonly VaultEntry[], key: string, value: TaggedValue): readonly VaultEntry[] {
  const next = entries.filter(([entryKey]) => entryKey !== key);
  next.push(Object.freeze([key, value] as const));
  if (next.length > MAX_ENTRIES) throw new Error('Encrypted storage entry limit reached.');
  return Object.freeze(next);
}

function copyPayload(payload: VaultPayload): VaultPayload {
  return parsePayload(JSON.stringify(payload));
}

function aad(record: CipherVault): Uint8Array {
  return new TextEncoder().encode(`${record.format}|${record.version}|${record.revision}|${record.salt}|${record.iterations}|${record.iv}`);
}

function sameRecord(left: CipherVault, right: CipherVault): boolean {
  return left.format === right.format &&
    left.version === right.version &&
    left.revision === right.revision &&
    left.salt === right.salt &&
    left.iterations === right.iterations &&
    left.iv === right.iv &&
    left.ciphertext === right.ciphertext;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]!);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(BACKUP_ERROR);
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  if (toBase64(bytes) !== value) throw new Error(BACKUP_ERROR);
  return bytes;
}

function cryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
