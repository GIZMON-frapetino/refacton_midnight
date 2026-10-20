import { afterEach, describe, expect, test, vi } from 'vitest';
import { connectWithTimeout, PENDING_TX_KEY, TransactionRecovery, type SendAttempt } from '../src/lib/transaction-recovery.js';
import { readPublicTransactionStatus } from '../src/lib/transaction-status.js';

function store() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function fixture(timeoutMs = 50) {
  const storage = store();
  return { storage, recovery: new TransactionRecovery({ storage, lock: async (operation) => operation(), timeoutMs }) };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('send state and reload recovery, offline only', () => {
  test('idle -> awaiting-wallet -> submitted -> confirmed, with ID persisted before submit', async () => {
    const { storage, recovery } = fixture(); const states: string[] = [];
    recovery.subscribe(() => { states.push(recovery.getSnapshot().state); });
    expect(recovery.getSnapshot()).toEqual({ state: 'idle', txId: null });
    const submit = vi.fn();
    await recovery.execute(async (attempt) => {
      attempt.beforeBalance(); attempt.beforeSubmit('offline-tx-1');
      expect(storage.values.get(PENDING_TX_KEY)).toBe('offline-tx-1'); submit();
      return true;
    });
    expect(states).toEqual(['awaiting-wallet', 'submitted', 'confirmed']); expect(submit).toHaveBeenCalledTimes(1);
    expect(recovery.getSnapshot().txId).toBe('offline-tx-1'); expect(storage.values.size).toBe(0);
  });
  test('local error before a wallet call is failed, and an explicit new attempt may run', async () => {
    const { recovery } = fixture();
    await expect(recovery.execute(async () => { throw new Error('synthetic'); })).rejects.toThrow();
    expect(recovery.getSnapshot().state).toBe('failed');
    await recovery.execute(async () => true); expect(recovery.getSnapshot().state).toBe('idle');
  });
  test('typed user rejection at submit can be marked failed without an automatic resend', async () => {
    const { storage, recovery } = fixture(); const send = vi.fn();
    await expect(recovery.execute(async (attempt) => {
      attempt.beforeSubmit('offline-tx-2'); send(); attempt.submitRejected(); throw new Error('typed rejection already sanitized');
    })).rejects.toThrow();
    expect(recovery.getSnapshot().state).toBe('failed'); expect(storage.values.size).toBe(0); expect(send).toHaveBeenCalledTimes(1);
  });
  test('timeout after submit keeps pending ID; safe reset cannot authorize duplicate send', async () => {
    vi.useFakeTimers(); const { storage, recovery } = fixture(); const send = vi.fn();
    const work = recovery.execute(async (attempt) => { attempt.beforeSubmit('offline-tx-3'); send(); return new Promise(() => {}); });
    const error = expect(work).rejects.toMatchObject({ code: 'PENDING' });
    await vi.advanceTimersByTimeAsync(55); await error;
    expect(recovery.getSnapshot()).toEqual({ state: 'unknown', txId: 'offline-tx-3' });
    expect(recovery.reset()).toBe(false); expect(storage.values.get(PENDING_TX_KEY)).toBe('offline-tx-3');
    await expect(recovery.execute(async () => { send(); })).rejects.toMatchObject({ code: 'PENDING' }); expect(send).toHaveBeenCalledTimes(1);
  });
  test('reload restores only the public ID, and cannot send until final status is reconciled', async () => {
    const { storage } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-tx-reload');
    const reloaded = new TransactionRecovery({ storage, lock: async (operation) => operation() });
    expect(reloaded.getSnapshot()).toEqual({ state: 'unknown', txId: 'offline-tx-reload' }); expect([...storage.values]).toEqual([[PENDING_TX_KEY, 'offline-tx-reload']]);
    await expect(reloaded.execute(async () => true)).rejects.toMatchObject({ code: 'PENDING' });
    reloaded.setStatusReader(async (id) => ({ status: 'SucceedEntirely', identifiers: [id] }));
    await reloaded.checkStatusAgain(); expect(reloaded.getSnapshot().state).toBe('confirmed'); expect(reloaded.reset()).toBe(true);
  });
  test.each(['FailEntirely', 'FailFallible', 'not-found'])('public status %s is handled without sending', async (status) => {
    const { storage, recovery } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-status');
    const reader = vi.fn(async (id: string) => ({ status, identifiers: [id] })); recovery.setStatusReader(reader);
    const state = await recovery.checkStatusAgain(); expect(state.state).toBe(status === 'FailEntirely' ? 'failed' : 'unknown');
    expect(reader).toHaveBeenCalledWith('offline-status', expect.any(AbortSignal));
    expect(recovery.reset()).toBe(status === 'FailEntirely');
  });
  test('status for the wrong ID is not finality', async () => {
    const { storage, recovery } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-right');
    recovery.setStatusReader(async () => ({ status: 'SucceedEntirely', identifiers: ['offline-wrong'] }));
    expect((await recovery.checkStatusAgain()).state).toBe('unknown'); expect(storage.values.size).toBe(1);
  });
  test.each(['prefix-offline-shape-suffix', { includes: () => true }, [42, 'offline-shape']])('invalid status identifiers cannot clear pending state: %s', async (identifiers) => {
    const { storage, recovery } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-shape');
    recovery.setStatusReader(async () => ({ status: 'SucceedEntirely', identifiers } as never));
    expect((await recovery.checkStatusAgain()).state).toBe('unknown'); expect(storage.values.get(PENDING_TX_KEY)).toBe('offline-shape');
    expect(recovery.reset()).toBe(false);
  });
  test('status timeout remains unknown and keeps ID', async () => {
    vi.useFakeTimers(); const { storage, recovery } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-slow');
    recovery.setStatusReader(async () => new Promise(() => {}));
    const check = recovery.checkStatusAgain(25); await vi.advanceTimersByTimeAsync(30);
    expect((await check).state).toBe('unknown'); expect(storage.values.get(PENDING_TX_KEY)).toBe('offline-slow');
  });
  test('a timed-out read is aborted; the next check makes a fresh read and can confirm', async () => {
    vi.useFakeTimers(); const { storage, recovery } = fixture(); storage.setItem(PENDING_TX_KEY, 'offline-fresh');
    let firstSignal: AbortSignal | undefined;
    const read = vi.fn(async (id: string, signal?: AbortSignal) => {
      if (!firstSignal) { firstSignal = signal; return new Promise<never>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('offline abort')))); }
      return { status: 'SucceedEntirely', identifiers: [id] };
    });
    recovery.setStatusReader(read); const first = recovery.checkStatusAgain(20);
    await vi.advanceTimersByTimeAsync(25); expect((await first).state).toBe('unknown'); expect(firstSignal!.aborted).toBe(true);
    expect((await recovery.checkStatusAgain()).state).toBe('confirmed'); expect(read).toHaveBeenCalledTimes(2);
  });
  test('finite public query only accepts matching identifiers, block data and known statuses', async () => {
    const id = 'a'.repeat(64); const row = { identifiers: [id], block: { height: 1, hash: 'b'.repeat(64) }, transactionResult: { status: 'SUCCESS' } };
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { transactions: [row] } }) })); vi.stubGlobal('fetch', fetcher);
    expect(await readPublicTransactionStatus('https://example.invalid/graphql', id)).toMatchObject({ status: 'SucceedEntirely', identifiers: [id] });
    expect(fetcher.mock.calls.length).toBe(1);
    (row as unknown as { identifiers: unknown }).identifiers = 'prefix-'+id;
    expect((await readPublicTransactionStatus('https://example.invalid/graphql', id)).status).toBe('unknown');
    row.identifiers = [id]; row.block.hash = '';
    await expect(readPublicTransactionStatus('https://example.invalid/graphql', id)).rejects.toMatchObject({ code: 'PENDING' });
  });
  test('before-submit timeout retires attempt; late balance or preparation cannot submit', async () => {
    const { recovery } = fixture(10); let oldAttempt: SendAttempt | undefined; const send = vi.fn();
    await expect(recovery.execute(async (attempt) => { oldAttempt = attempt; return new Promise(() => {}); })).rejects.toMatchObject({ code: 'PENDING' });
    expect(recovery.reset()).toBe(true); await recovery.execute(async () => true);
    expect(() => { oldAttempt!.beforeSubmit('offline-too-late'); send(); }).toThrow(); expect(send).not.toHaveBeenCalled();
  });
  test('safe reset during preparation invalidates its later wallet calls', async () => {
    const { recovery } = fixture(); let done: () => void = () => {}; let attempt: SendAttempt | undefined;
    const work = recovery.execute(async (a) => { attempt = a; await new Promise<void>((resolve) => { done = resolve; }); a.guard(); });
    await tick(); expect(recovery.reset()).toBe(false); expect(() => attempt!.beforeBalance()).toThrow();
    done(); await expect(work).rejects.toThrow(); expect(recovery.reset()).toBe(true);
  });
  test('storage write failure stops before the wallet submit effect', async () => {
    const storage = store(); storage.setItem = () => { throw new Error('synthetic storage failure'); };
    const recovery = new TransactionRecovery({ storage, lock: async (operation) => operation() }); const submit = vi.fn();
    await expect(recovery.execute(async (a) => { a.beforeSubmit('offline-storage'); submit(); })).rejects.toMatchObject({ code: 'NETWORK_FAILURE' });
    expect(submit).not.toHaveBeenCalled();
  });
  test('connect timeout leaves send state idle and a late connection cannot replace it', async () => {
    vi.useFakeTimers(); const { recovery } = fixture(); const request = vi.fn(() => new Promise(() => {}));
    const work = connectWithTimeout(request, 20); const rejection = expect(work).rejects.toMatchObject({ code: 'NETWORK_FAILURE' });
    expect(request).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(25); await rejection;
    expect(recovery.getSnapshot().state).toBe('idle');
  });
});
