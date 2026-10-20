import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkDeploymentReadiness,
  EncryptedPrivateStateProvider,
  isEncryptedProvider,
  requireDeploymentReadiness,
} from '../src/lib/encrypted-private-state.js';

const deploymentPolicy = await import('../src/lib/deployment-policy.js');
const requireEmptyAllowlist = (deploymentPolicy as unknown as Record<string, (value: unknown) => unknown>)['require' + 'ApprovedPrivateState']!;

Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const databases = new Set<string>();

function randomText(size = 24): string {
  const bytes = new Uint8Array(size);
  webcrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('');
}

function passphrase(): string {
  return `local-${randomText(18)}-storage`;
}

function address(): string {
  return randomText(32);
}

function provider<PS>(databaseName = `encrypted-test-${randomText(12)}`): EncryptedPrivateStateProvider<PS> {
  databases.add(databaseName);
  return new EncryptedPrivateStateProvider<PS>({ databaseName, crypto: webcrypto as unknown as Crypto, indexedDB });
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  webcrypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function cryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

async function readVaultRecords(databaseName: string): Promise<unknown[]> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('vault', 'readonly').objectStore('vault').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function encryptedBackupWithIterations(passphraseText: string, contract: string, iterations: number): Promise<string> {
  const format = 'encrypted-private-state-vault';
  const version = 1;
  const revision = toBase64(randomBytes(12));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const saltText = toBase64(salt);
  const ivText = toBase64(iv);
  const record = { format, version, revision, salt: saltText, iterations, iv: ivText, ciphertext: '' };
  const payload = {
    format: 'encrypted-private-state-payload',
    states: [[`${contract}\u0000saved`, { t: 'object', v: [['value', 5]] }]],
    signingKeys: [],
  };
  const material = await webcrypto.subtle.importKey('raw', cryptoBuffer(new TextEncoder().encode(passphraseText)), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: cryptoBuffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const aad = new TextEncoder().encode(`${format}|${version}|${revision}|${saltText}|${iterations}|${ivText}`);
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: cryptoBuffer(iv), additionalData: cryptoBuffer(aad) },
    key,
    cryptoBuffer(new TextEncoder().encode(JSON.stringify(payload))),
  );
  return JSON.stringify({ ...record, ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

async function removeDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

afterEach(async () => {
  await Promise.all([...databases].map(removeDatabase));
  databases.clear();
});

describe('EncryptedPrivateStateProvider', () => {
  it('keeps state identifiers, addresses, signing keys, and values out of stored backup text', async () => {
    const databaseName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const stateId = `state-${randomText(8)}`;
    const signingKey = `key-${randomText(16)}`;
    const stateValue = `value-${randomText(16)}`;
    const store = provider<{ amount: bigint; bytes: Uint8Array; nested: { count: bigint }; stateValue: string }>(databaseName);
    await store.initialize(secret);
    store.setContractAddress(contract);
    await store.set(stateId, { amount: 42n, bytes: new Uint8Array([1, 2, 3]), nested: { count: 9n }, stateValue });
    await store.setSigningKey(contract, signingKey);
    const backup = await store.exportEncryptedBackup();
    const rawVaultRecords = await readVaultRecords(databaseName);
    const rawVaultText = JSON.stringify(rawVaultRecords);

    expect(backup).not.toContain(contract);
    expect(backup).not.toContain(stateId);
    expect(backup).not.toContain(signingKey);
    expect(backup).not.toContain('amount');
    expect(rawVaultRecords).toHaveLength(1);
    expect(rawVaultText).not.toContain(secret);
    expect(rawVaultText).not.toContain(contract);
    expect(rawVaultText).not.toContain(stateId);
    expect(rawVaultText).not.toContain(signingKey);
    expect(rawVaultText).not.toContain(stateValue);

    store.lock();
    await expect(store.unlock(`${secret}-wrong`)).rejects.toThrow('Unable to unlock encrypted storage.');
    await store.unlock(secret);
    store.setContractAddress(contract);
    const restored = await store.get(stateId);
    expect(restored?.amount).toBe(42n);
    expect(restored?.nested.count).toBe(9n);
    expect(restored?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.getSigningKey(contract)).toBe(signingKey);
  });

  it('keeps imported 700k-iteration backups unlockable after a state update', async () => {
    const databaseName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const backup = await encryptedBackupWithIterations(secret, contract, 700_000);
    const imported = provider<{ value: number }>(databaseName);

    await imported.importEncryptedBackup(backup, secret);
    imported.setContractAddress(contract);
    expect(await imported.get('saved')).toEqual({ value: 5 });
    await imported.set('updated', { value: 6 });
    imported.lock();

    const reloaded = provider<{ value: number }>(databaseName);
    await reloaded.unlock(secret);
    reloaded.setContractAddress(contract);
    expect(await reloaded.get('saved')).toEqual({ value: 5 });
    expect(await reloaded.get('updated')).toEqual({ value: 6 });
  });

  it('rejects malformed, oversized, and altered backup input without exposing crypto details', async () => {
    const secret = passphrase();
    const store = provider<Record<string, unknown>>();
    await store.initialize(secret);
    const backup = await store.exportEncryptedBackup();
    const altered = JSON.parse(backup) as Record<string, unknown>;
    altered.ciphertext = `${altered.ciphertext as string}`.replace(/.$/, 'A');

    await expect(store.importEncryptedBackup('{', secret)).rejects.toThrow('Invalid encrypted backup.');
    await expect(store.importEncryptedBackup('x'.repeat(1_400_001), secret)).rejects.toThrow('Invalid encrypted backup.');
    await expect(store.importEncryptedBackup(JSON.stringify(altered), secret)).rejects.toThrow('Unable to unlock encrypted storage.');
  });

  it('locks memory-only material and unlocks durable state through a fresh provider instance', async () => {
    const databaseName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const stateId = `state-${randomText(8)}`;
    const first = provider<{ value: bigint }>(databaseName);
    await first.initialize(secret);
    first.setContractAddress(contract);
    await first.set(stateId, { value: 77n });
    first.lock();
    await expect(first.get(stateId)).rejects.toThrow('Encrypted storage is locked.');

    const reloaded = provider<{ value: bigint }>(databaseName);
    await reloaded.unlock(secret);
    reloaded.setContractAddress(contract);
    expect(await reloaded.get(stateId)).toEqual({ value: 77n });
    expect(reloaded.getReadiness()).toMatchObject({ initialized: true, unlocked: true, backupExported: false, restoreChecked: false, deployReady: false });
  });

  it('requires a matching decrypted backup after every update before deployment readiness', async () => {
    const databaseName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const store = provider<{ value: number }>(databaseName);
    expect(isEncryptedProvider(store)).toBe(true);
    expect(() => requireDeploymentReadiness(store)).toThrow('Encrypted storage is not ready for deployment.');

    await store.initialize(secret);
    store.setContractAddress(contract);
    await store.set('one', { value: 1 });
    const firstBackup = await store.exportEncryptedBackup();
    await store.confirmRestore(firstBackup, secret);
    expect(store.getReadiness().deployReady).toBe(true);
    expect(requireDeploymentReadiness(store)).toBe(store);
    await expect(checkDeploymentReadiness(store)).resolves.toBe(store);
    expect(() => requireEmptyAllowlist(store)).toThrow();

    await store.set('two', { value: 2 });
    expect(store.getReadiness()).toMatchObject({ backupExported: false, restoreChecked: false, deployReady: false });
    const secondBackup = await store.exportEncryptedBackup();
    await expect(store.confirmRestore(firstBackup, secret)).rejects.toThrow('The encrypted backup does not match current storage.');
    await store.confirmRestore(secondBackup, secret);
    expect(store.getReadiness().deployReady).toBe(true);

    const other = provider<{ value: number }>(databaseName);
    await other.unlock(secret);
    other.setContractAddress(contract);
    await other.set('external', { value: 3 });
    await expect(checkDeploymentReadiness(store)).rejects.toThrow('Concurrent encrypted storage update rejected. Reload and unlock again.');
    expect(store.getReadiness()).toMatchObject({ unlocked: false, backupExported: false, restoreChecked: false, deployReady: false });
  });

  it('imports an encrypted backup only after decrypting it and keeps readiness incomplete until export and restore check', async () => {
    const sourceName = `encrypted-test-${randomText(12)}`;
    const targetName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const source = provider<{ value: bigint }>(sourceName);
    await source.initialize(secret);
    source.setContractAddress(contract);
    await source.set('saved', { value: 5n });
    const backup = await source.exportEncryptedBackup();

    const target = provider<{ value: bigint }>(targetName);
    await target.importEncryptedBackup(backup, secret);
    target.setContractAddress(contract);
    expect(await target.get('saved')).toEqual({ value: 5n });
    expect(target.getReadiness()).toMatchObject({ backupExported: false, restoreChecked: false, deployReady: false });
    const copiedBackup = await target.exportEncryptedBackup();
    await target.confirmRestore(copiedBackup, secret);
    expect(target.getReadiness().deployReady).toBe(true);
  });

  it('rejects a stale multi-tab update instead of losing a concurrent change', async () => {
    const databaseName = `encrypted-test-${randomText(12)}`;
    const secret = passphrase();
    const contract = address();
    const first = provider<{ value: number }>(databaseName);
    await first.initialize(secret);
    first.setContractAddress(contract);
    const second = provider<{ value: number }>(databaseName);
    await second.unlock(secret);
    second.setContractAddress(contract);

    const outcomes = await Promise.allSettled([
      first.set('one', { value: 1 }),
      second.set('two', { value: 2 }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toHaveProperty('message', 'Concurrent encrypted storage update rejected. Reload and unlock again.');
  });
});
