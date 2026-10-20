import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ConnectedAPI, Configuration } from '@midnight-ntwrk/dapp-connector-api';
import * as protocolLedger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { createConstructorContext } from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../../compiled/contract/index.js';
import { recordWitnesses } from '../../contract/witnesses.js';
import { createNetworkRunner } from '../src/lib/network.js';
import { createWalletAdapter, createProviders, compileContract, joinTarget, deployTarget, InMemoryPrivateStateProvider } from '../src/lib/wallet-adapter.js';
import { deployWithWallet } from './deploy-with-wallet.js';
import { sendOnPreprod } from '../src/lib/send-boundary.js';
import { selectPreprodContract } from '../src/lib/contract-selection.js';
import { currentExecutionMode, selectExecutionMode, recordInMode, checkInMode } from '../src/lib/execution.js';
import { exportMaterial } from '../src/lib/simulator.js';

const ADDRESS = 'a'.repeat(64);
const MARKER = 'SENSITIVE_TEST_MARKER';
const material = { questId: new Uint8Array(32).fill(1), version: 1n, userSecret: new Uint8Array(32).fill(2), localSecretKey: new Uint8Array(32).fill(3), salt: new Uint8Array(32).fill(4) };
const initialState = () => new Contract(recordWitnesses(material)).initialState(createConstructorContext({}, '0'.repeat(64)), new Uint8Array(32).fill(5), new Uint8Array(32).fill(6)).currentContractState.data;
const sampleSession = () => ({ ...exportMaterial(material), recorded: true, network: 'preprod', contractAddress: ADDRESS });
const fakeTx = { serialize: () => new Uint8Array([1]), identifiers: () => ['offline-id'] } as unknown as protocolLedger.FinalizedTransaction;
const keys = { shieldedAddress: 'offline-address', shieldedCoinPublicKey: '1'.repeat(64), shieldedEncryptionPublicKey: '2'.repeat(64) };

function fixture() {
  let status: { status: 'connected'; networkId: string } | { status: 'disconnected' } = { status: 'connected', networkId: 'preprod' };
  let currentKeys = { ...keys };
  let locked = false;
  const balance = vi.fn(async () => ({ tx: '01' }));
  const submit = vi.fn(async () => {});
  const connected = {
    getConnectionStatus: vi.fn(async () => status),
    getShieldedAddresses: vi.fn(async () => { if (locked) throw new Error(MARKER); return currentKeys; }),
    balanceUnsealedTransaction: balance, submitTransaction: submit,
  } as unknown as ConnectedAPI;
  const onInvalidated = vi.fn();
  let notifyInvalidated: () => void = onInvalidated;
  const adapter = createWalletAdapter(connected, keys, () => notifyInvalidated());
  vi.spyOn(protocolLedger.Transaction, 'deserialize').mockReturnValue(fakeTx);
  const sdkRecord = vi.fn(async () => {
    const balanced = await adapter.walletProvider.balanceTx(fakeTx as unknown as Parameters<typeof adapter.walletProvider.balanceTx>[0]);
    await adapter.midnightProvider.submitTx(balanced);
    return { public: { txId: 'offline-id', nextContractState: initialState() }, private: { result: new Uint8Array(32) } };
  });
  const providers = { ...adapter, privateStateProvider: new InMemoryPrivateStateProvider<Record<string, never>>() };
  const create = vi.fn(async (_connected: ConnectedAPI, _assets: string, notify?: () => void) => {
    notifyInvalidated = notify ?? onInvalidated;
    return { providers, configuration: { networkId: 'preprod' } as Configuration, invalidate: adapter.invalidate };
  });
  const compile = vi.fn(() => ({}));
  const join = vi.fn(async () => ({ callTx: { recordQuest: sdkRecord, checkAttestation: sdkRecord } }));
  const deps = {
    createProviders: create as unknown as typeof createProviders,
    compileContract: compile as unknown as typeof compileContract,
    joinTarget: join as unknown as typeof joinTarget,
    assetBaseURL: () => 'https://example.invalid/contract-assets/',
  };
  return {
    connected, adapter, onInvalidated, balance, submit, sdkRecord, create, compile, join, deps,
    setStatus: (value: typeof status) => { status = value; },
    setKeys: (value: typeof keys) => { currentKeys = value; },
    setLocked: (value: boolean) => { locked = value; },
  };
}

beforeEach(() => { selectExecutionMode('simulator'); vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', 'true'); });
afterEach(() => { selectExecutionMode('simulator'); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('shared send boundary and real entry points, offline only', () => {
  test.each([undefined, 'false', '', 'TRUE', '1'])('disabled flag %s starts no SDK or wallet send', async (flag) => {
    vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', flag);
    const f = fixture();
    const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    await expect(runner.record(sampleSession())).rejects.toThrow('disabled');
    await expect(runner.check(sampleSession(), '1'.repeat(64), '2'.repeat(64))).rejects.toThrow('disabled');
    await expect(f.adapter.walletProvider.balanceTx(fakeTx as unknown as Parameters<typeof f.adapter.walletProvider.balanceTx>[0])).rejects.toThrow('disabled');
    await expect(f.adapter.midnightProvider.submitTx(fakeTx)).rejects.toThrow('disabled');
    const sdkDeploy = vi.fn();
    await expect(deployWithWallet({ connected: f.connected, assetBaseURL: 'https://example.invalid/', adminKeyHex: '1'.repeat(64), scopeHex: '2'.repeat(64), durablePrivateState: {} as never }, { deployTarget: sdkDeploy as unknown as typeof deployTarget })).rejects.toThrow('disabled');
    await expect(deployTarget({ privateStateProvider: {} } as never, {} as never)).rejects.toThrow('disabled');
    expect(sdkDeploy).not.toHaveBeenCalled(); expect(f.compile).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled(); expect(f.sdkRecord).not.toHaveBeenCalled(); expect(f.balance).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  test('default dispatch is Simulator and selection alone cannot submit', async () => {
    expect(currentExecutionMode()).toBe('simulator');
    const f = fixture(); await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    expect(f.balance).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  test('user declines balance: actual runner releases dispatcher lock and retry is explicit', async () => {
    const f = fixture(); f.balance.mockRejectedValueOnce(new Error(MARKER));
    const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    selectExecutionMode('preprod', runner);
    await expect(recordInMode(sampleSession())).rejects.toThrow('failed or was declined');
    expect(f.submit).not.toHaveBeenCalled(); expect(f.onInvalidated).not.toHaveBeenCalled();
    const result = await recordInMode(sampleSession()); expect(result.recorded).toBe(true);
    expect(f.balance).toHaveBeenCalledTimes(2); expect(f.submit).toHaveBeenCalledTimes(1);
  });
  test('user declines submit: error is redacted and no automatic retry occurs', async () => {
    const f = fixture(); f.submit.mockRejectedValueOnce(new Error(MARKER));
    const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    const log = vi.spyOn(console, 'log'); const errorLog = vi.spyOn(console, 'error');
    const error = await runner.record(sampleSession()).catch((e: Error) => e);
    expect(String(error)).not.toContain(MARKER); expect(f.submit).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled(); expect(errorLog).not.toHaveBeenCalled();
    await expect(runner.record(sampleSession())).resolves.toMatchObject({ recorded: true });
  });
  test.each(['locked', 'disconnected', 'network', 'coin-key', 'encryption-key'])('change after connect (%s) invalidates runner before balance', async (change) => {
    const f = fixture(); const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    if (change === 'locked') f.setLocked(true);
    if (change === 'disconnected') f.setStatus({ status: 'disconnected' });
    if (change === 'network') f.setStatus({ status: 'connected', networkId: 'preview' });
    if (change === 'coin-key') f.setKeys({ ...keys, shieldedCoinPublicKey: '3'.repeat(64) });
    if (change === 'encryption-key') f.setKeys({ ...keys, shieldedEncryptionPublicKey: '4'.repeat(64) });
    await expect(runner.record(sampleSession())).rejects.toThrow('Reconnect');
    expect(f.balance).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled(); expect(f.onInvalidated).toHaveBeenCalledTimes(1);
    await expect(runner.check(sampleSession(), '1'.repeat(64), '2'.repeat(64))).rejects.toThrow('Reconnect');
  });
  test('network changes during balance: submit is blocked by its own fresh check', async () => {
    const f = fixture(); f.balance.mockImplementationOnce(async () => { f.setStatus({ status: 'connected', networkId: 'preview' }); return { tx: '01' }; });
    const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    await expect(runner.record(sampleSession())).rejects.toThrow('Reconnect');
    expect(f.balance).toHaveBeenCalledTimes(1); expect(f.submit).not.toHaveBeenCalled();
  });
  test('unapproved alternative memory or plaintext provider cannot reach SDK deploy even with flag on', async () => {
    const f = fixture(); const sdkDeploy = vi.fn(); const init = vi.fn();
    for (const store of [new InMemoryPrivateStateProvider(), {}]) {
      await expect(deployWithWallet({ connected: f.connected, assetBaseURL: 'https://example.invalid/', adminKeyHex: '1'.repeat(64), scopeHex: '2'.repeat(64), durablePrivateState: store as never }, { createProviders: init as unknown as typeof createProviders, deployTarget: sdkDeploy as unknown as typeof deployTarget })).rejects.toThrow('no approved');
      await expect(deployTarget({ privateStateProvider: store } as never, {} as never)).rejects.toThrow('no approved');
    }
    expect(init).not.toHaveBeenCalled(); expect(sdkDeploy).not.toHaveBeenCalled(); expect(f.balance).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  test('provider initialization errors do not echo service data', async () => {
    const f = fixture(); f.create.mockRejectedValueOnce(new Error(MARKER));
    await expect(createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps)).rejects.not.toThrow(MARKER);
  });
  test('failed contract re-selection clears active address and old sender before asynchronous work', async () => {
    const f = fixture(); const oldRunner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    selectExecutionMode('preprod', oldRunner);
    let active: string | null = ADDRESS;
    let release: (value: unknown) => void = () => {};
    const failedFactory = vi.fn(() => new Promise((_, reject) => { release = reject; }));
    const selection = selectPreprodContract(f.connected, 'b'.repeat(64), failedFactory, (value: string | null) => { active = value; }, () => {});
    expect(active).toBe(null);
    expect(() => recordInMode(sampleSession())).toThrow('not ready');
    await new Promise((resolve) => setTimeout(resolve, 0)); release(new Error(MARKER));
    await expect(selection).rejects.not.toThrow(MARKER);
    expect(active).toBe(null); expect(() => checkInMode(sampleSession(), '', '')).toThrow('not ready');
    expect(f.balance).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  test('successful re-selection updates the active address without a spurious reconnect request', async () => {
    const f = fixture(); const runner = await createNetworkRunner(f.connected, ADDRESS, f.onInvalidated, f.deps);
    selectExecutionMode('preprod', runner);
    const active = vi.fn(); const reconnect = vi.fn();
    await selectPreprodContract(f.connected, 'b'.repeat(64), async () => ({ record: vi.fn(), check: vi.fn(), invalidate: vi.fn() }), active, reconnect);
    expect(active.mock.calls.map(([value]) => value)).toEqual([null, 'b'.repeat(64)]);
    expect(reconnect).not.toHaveBeenCalled(); expect(f.onInvalidated).not.toHaveBeenCalled();
    await expect(runner.record(sampleSession())).rejects.toThrow('Reconnect');
  });
  test.each(['resolve', 'reject'])('late old selection %s cannot overwrite or clear the newer contract', async (completion) => {
    const f = fixture(); let active: string | null = null;
    const onActive = (value: string | null) => { active = value; };
    let resolveOld: (value: unknown) => void = () => {}; let rejectOld: (value: unknown) => void = () => {};
    const oldSender = { record: vi.fn(), check: vi.fn(), invalidate: vi.fn() };
    const oldSelection = selectPreprodContract(f.connected, ADDRESS, () => new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }), onActive, vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const newSender = { record: vi.fn(async () => ({ recorded: true })), check: vi.fn(), invalidate: vi.fn() };
    await selectPreprodContract(f.connected, 'b'.repeat(64), async () => newSender, onActive, vi.fn());
    if (completion === 'resolve') resolveOld(oldSender); else rejectOld(new Error(MARKER));
    await expect(oldSelection).rejects.toThrow('superseded');
    expect(active).toBe('b'.repeat(64)); expect(newSender.invalidate).not.toHaveBeenCalled();
    if (completion === 'resolve') expect(oldSender.invalidate).toHaveBeenCalledTimes(1);
    await recordInMode(sampleSession()); expect(newSender.record).toHaveBeenCalledTimes(1); expect(oldSender.record).not.toHaveBeenCalled();
  });
  test('a retired contract callback cannot invalidate the current runner or active address', async () => {
    const f = fixture(); let active: string | null = null; let oldNotify = () => {};
    const reconnect = vi.fn(); const onActive = (value: string | null) => { active = value; };
    await selectPreprodContract(f.connected, ADDRESS, async (_api: unknown, _address: string, notify: () => void) => {
      oldNotify = notify; return { record: vi.fn(), check: vi.fn(), invalidate: vi.fn() };
    }, onActive, reconnect);
    const current = { record: vi.fn(async () => ({ recorded: true })), check: vi.fn(), invalidate: vi.fn() };
    await selectPreprodContract(f.connected, 'b'.repeat(64), async () => current, onActive, reconnect);
    oldNotify(); expect(active).toBe('b'.repeat(64)); expect(reconnect).not.toHaveBeenCalled(); expect(current.invalidate).not.toHaveBeenCalled();
    await recordInMode(sampleSession()); expect(current.record).toHaveBeenCalledTimes(1);
  });
  test('wrong network or missing wallet fails selection without creating a runner', async () => {
    const f = fixture(); f.setStatus({ status: 'connected', networkId: 'preview' });
    const factory = vi.fn(); const active = vi.fn();
    await expect(selectPreprodContract(f.connected, ADDRESS, factory, active, vi.fn())).rejects.toThrow('Sending remains disabled');
    await expect(selectPreprodContract(null, ADDRESS, factory, active, vi.fn())).rejects.toThrow('Sending remains disabled');
    expect(factory).not.toHaveBeenCalled();
  });
  test('the shared boundary never evaluates an operation when disabled', async () => {
    vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', 'false'); const operation = vi.fn();
    await expect(sendOnPreprod(operation)).rejects.toThrow('disabled'); expect(operation).not.toHaveBeenCalled();
  });
});
