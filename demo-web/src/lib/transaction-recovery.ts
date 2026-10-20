import { AppError, ERROR_CODES } from './check-errors.js';

export type SendState = 'idle' | 'awaiting-wallet' | 'submitted' | 'confirmed' | 'failed' | 'unknown';
export type SendSnapshot = Readonly<{ state: SendState; txId: string | null }>;
export type FinalStatus = { status: string; identifiers?: readonly string[] };
type PublicIdStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const PENDING_TX_KEY = 'refacton-preprod-pending-tx';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,256}$/.test(value);

export class TransactionRecoveryError extends AppError {
  constructor(code: 'UNKNOWN' | 'NETWORK_FAILURE' = 'UNKNOWN') {
    super(code === 'UNKNOWN' ? ERROR_CODES.PENDING : ERROR_CODES.NETWORK_FAILURE);
    this.name = 'TransactionRecoveryError';
  }
}

export type SendAttempt = Readonly<{
  guard: () => void;
  beforeBalance: () => void;
  beforeSubmit: (txId: string) => void;
  submitRejected: () => void;
}>;

type Lock = <T>(operation: () => Promise<T>) => Promise<T>;
const memoryStorage = (): PublicIdStorage => {
  let id: string | null = null;
  return { getItem: () => id, setItem: (_key, value) => { id = value; }, removeItem: () => { id = null; } };
};
function browserStorage(): PublicIdStorage {
  if (typeof window === 'undefined') return memoryStorage();
  // Access errors must stop a send, rather than fall back to non-durable storage.
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
}
const browserLock: Lock = async (operation) => {
  if (typeof window === 'undefined') return operation();
  if (!globalThis.navigator?.locks) throw new TransactionRecoveryError('NETWORK_FAILURE');
  return navigator.locks.request('refacton-preprod-send', { ifAvailable: true }, (lock) => {
    if (!lock) throw new TransactionRecoveryError();
    return operation();
  });
};

export class TransactionRecovery {
  private snapshot: SendSnapshot = Object.freeze({ state: 'idle', txId: null });
  private listeners = new Set<() => void>();
  private serial = 0;
  private running = false;
  private active: { serial: number; cancelled: boolean; txId: string | null } | null = null;
  private readStatus: ((txId: string, signal?: AbortSignal) => Promise<FinalStatus>) | null = null;
  private checking = false;
  private readonly storage: PublicIdStorage;
  private readonly lock: Lock;
  readonly timeoutMs: number;
  constructor(options: { storage?: PublicIdStorage; lock?: Lock; timeoutMs?: number } = {}) {
    this.storage = options.storage ?? browserStorage();
    this.lock = options.lock ?? browserLock;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    try {
      const id = this.storage.getItem(PENDING_TX_KEY);
      if (id !== null) this.snapshot = Object.freeze({ state: 'unknown', txId: validId(id) ? id : null });
    } catch { this.snapshot = Object.freeze({ state: 'unknown', txId: null }); }
  }
  getSnapshot = (): SendSnapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: SendState, txId: string | null = this.snapshot.txId) {
    this.snapshot = Object.freeze({ state, txId });
    for (const listener of this.listeners) listener();
  }
  setStatusReader(reader: ((txId: string, signal?: AbortSignal) => Promise<FinalStatus>) | null) { this.readStatus = reader; }
  private pendingId(): string | null {
    try {
      const stored = this.storage.getItem(PENDING_TX_KEY);
      if (stored !== null && !validId(stored)) throw new Error();
      return stored;
    } catch { throw new TransactionRecoveryError(); }
  }
  private clearId() {
    try { this.storage.removeItem(PENDING_TX_KEY); }
    catch { throw new TransactionRecoveryError(); }
  }
  isBlocked() {
    try { return this.running || this.pendingId() !== null || this.snapshot.state === 'submitted' || (this.snapshot.state === 'unknown' && this.snapshot.txId !== null); }
    catch { return true; }
  }
  reset() {
    // Cancellation retires the attempt. Its late calculation/balance cannot submit.
    if (this.active) this.active.cancelled = true;
    const id = this.pendingId();
    if (id) { this.update('unknown', id); return false; }
    if (this.running) { this.update('unknown', null); return false; }
    this.serial++;
    this.active = null;
    this.update('idle', null);
    return true;
  }
  async execute<T>(operation: (attempt: SendAttempt) => Promise<T>): Promise<T> {
    return this.lock(async () => {
      if (this.isBlocked()) throw new TransactionRecoveryError();
      const context = { serial: ++this.serial, cancelled: false, txId: null as string | null };
      this.active = context;
      this.running = true;
      this.update('awaiting-wallet', null);
      const guard = () => {
        if (context.cancelled || this.active !== context || context.serial !== this.serial) throw new TransactionRecoveryError();
      };
      const attempt: SendAttempt = {
        guard,
        beforeBalance: () => { guard(); if (context.txId !== null || this.pendingId() !== null) throw new TransactionRecoveryError(); },
        beforeSubmit: (txId) => {
          guard();
          if (!validId(txId) || context.txId !== null || this.pendingId() !== null) throw new TransactionRecoveryError();
          try {
            // Persist the public ID BEFORE asking the wallet to submit. No material is persisted.
            this.storage.setItem(PENDING_TX_KEY, txId);
            if (this.storage.getItem(PENDING_TX_KEY) !== txId) throw new Error();
          } catch { context.cancelled = true; throw new TransactionRecoveryError('NETWORK_FAILURE'); }
          context.txId = txId;
          this.update('submitted', txId);
        },
        submitRejected: () => {
          guard();
          // Call only for the connector's typed Rejected/PermissionRejected response.
          this.clearId(); context.txId = null; this.update('failed', null);
        },
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const work = Promise.resolve().then(() => operation(attempt));
      try {
        const value = await Promise.race([
          work,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              context.cancelled = true;
              if (this.active === context) this.update('unknown', context.txId);
              reject(new TransactionRecoveryError());
            }, this.timeoutMs);
          }),
        ]);
        guard();
        if (context.txId !== null) {
          // The operation only resolves after SDK finalization. A timeout cannot reach here.
          this.clearId(); this.update('confirmed', context.txId);
        } else this.update('idle', null);
        return value;
      } catch (error) {
        if (this.active === context) {
          if (context.txId !== null) this.update('unknown', context.txId);
          else if (this.snapshot.state !== 'unknown') this.update('failed', null);
        }
        context.cancelled = true;
        if (context.txId !== null) throw new TransactionRecoveryError();
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        this.running = false;
      }
    });
  }
  async checkStatusAgain(timeoutMs = 15_000): Promise<SendSnapshot> {
    const txId = this.pendingId();
    if (!txId || !this.readStatus || this.checking) throw new TransactionRecoveryError();
    this.checking = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.readStatus(txId, controller.signal),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new TransactionRecoveryError()), timeoutMs); }),
      ]);
      // A response for a different transaction, missing status or not-found is not finality.
      if (!result || !Array.isArray(result.identifiers) || !result.identifiers.every((id: unknown) => typeof id === 'string') || !result.identifiers.some((id: string) => id === txId)) throw new TransactionRecoveryError();
      if (result.status === 'SucceedEntirely' || result.status === 'FailEntirely') {
        await this.lock(async () => {
          if (this.pendingId() !== txId) throw new TransactionRecoveryError();
          if (this.active) this.active.cancelled = true;
          this.active = null; this.serial++;
          this.clearId(); this.update(result.status === 'SucceedEntirely' ? 'confirmed' : 'failed', txId);
        });
      }
      else this.update('unknown', txId); // Partial/fallible outcomes need operator reconciliation.
    } catch { this.update('unknown', txId); }
    finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); this.checking = false; }
    return this.snapshot;
  }
}

export const transactionRecovery = new TransactionRecovery();

export async function connectWithTimeout<T>(request: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Invoke the wallet connect synchronously in the explicit user gesture.
    const connecting = request();
    return await Promise.race([
      connecting,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new TransactionRecoveryError('NETWORK_FAILURE')), timeoutMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
