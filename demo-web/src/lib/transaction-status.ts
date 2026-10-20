import { TransactionRecoveryError, type FinalStatus } from './transaction-recovery.js';

// Field names follow the pinned indexer SDK's TX_ID_QUERY and TransactionResult schema.
const STATUS_QUERY = `query RefactonPendingStatus($offset: TransactionOffset!) {
  transactions(offset: $offset) {
    block { height hash }
    ... on RegularTransaction { identifiers transactionResult { status } }
  }
}`;

export async function readPublicTransactionStatus(queryURL: string, txId: string, signal?: AbortSignal): Promise<FinalStatus> {
  try {
    const url = new URL(queryURL);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || !/^[a-fA-F0-9]{64}$/.test(txId)) throw new Error();
    const response = await fetch(url, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: STATUS_QUERY, variables: { offset: { identifier: txId } } }),
    });
    if (!response.ok) throw new Error();
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || 'errors' in body) throw new Error();
    const data = (body as { data?: { transactions?: unknown } }).data;
    if (!Array.isArray(data?.transactions) || data.transactions.length > 100) throw new Error();
    for (const row of data.transactions as unknown[]) {
      if (!row || typeof row !== 'object') continue;
      const tx = row as { identifiers?: unknown; transactionResult?: { status?: unknown }; block?: { height?: unknown; hash?: unknown } };
      if (!Array.isArray(tx.identifiers) || !tx.identifiers.every((id: unknown) => typeof id === 'string') || !tx.identifiers.some((id: string) => id === txId)) continue;
      if (!Number.isSafeInteger(tx.block?.height) || (tx.block!.height as number) < 0 || typeof tx.block?.hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(tx.block.hash)) throw new Error();
      const status = tx.transactionResult?.status;
      return { identifiers: tx.identifiers, status: status === 'SUCCESS' ? 'SucceedEntirely' : status === 'FAILURE' ? 'FailEntirely' : status === 'PARTIAL_SUCCESS' ? 'FailFallible' : 'unknown' };
    }
    return { status: 'unknown', identifiers: [txId] };
  } catch { throw new TransactionRecoveryError(); }
}
