import { useState, useSyncExternalStore } from 'react';
import { transactionRecovery } from '../lib/transaction-recovery.ts';

const labels = {
  idle: 'Idle — no pending transaction.',
  'awaiting-wallet': 'Awaiting wallet — preparation or approval is still in progress.',
  submitted: 'Pending — the transaction ID is retained while finalization is checked.',
  confirmed: 'Confirmed — the transaction reached full finalization.',
  failed: 'Failed — no successful completion was established.',
  unknown: 'Pending / unknown — do not send again until the outcome is resolved.',
};
export default function TransactionRecoveryPanel() {
  const snapshot = useSyncExternalStore(transactionRecovery.subscribe, transactionRecovery.getSnapshot, transactionRecovery.getSnapshot);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  async function recheck() {
    setChecking(true); setMessage('');
    try {
      const result = await transactionRecovery.checkStatusAgain();
      setMessage(result.state === 'unknown' ? 'Still pending or unavailable. No new transaction was sent.' : 'Public transaction status refreshed. This is not a quest match result.');
    } catch { setMessage('Reconnect and select the contract to query status. No new transaction was sent.'); }
    finally { setChecking(false); }
  }
  function reset() {
    try {
      const reset = transactionRecovery.reset();
      setMessage(reset ? 'Local send controls reset. No transaction was sent.' : transactionRecovery.getSnapshot().txId
        ? 'Safe reset kept the pending transaction ID and send lock. Check status again; reset does not authorize a retry.'
        : 'Preparation was retired. Wait for its application deadline before starting a new attempt; a late result cannot submit.');
    } catch { setMessage('Pending information could not be read safely. Sending remains disabled.'); }
  }
  return <section className="transaction-recovery" aria-label="Transaction recovery">
    <p role="status">Send state: {snapshot.state}<br />{labels[snapshot.state]}</p>
    {snapshot.txId && <p className="active-contract">Public transaction ID: {snapshot.txId}</p>}
    <button type="button" disabled={!snapshot.txId || checking} onClick={recheck}>{checking ? 'Checking public status…' : 'Check status again'}</button>
    <button type="button" disabled={checking} onClick={reset}>Safe reset (never resend)</button>
    <p>Only a public transaction ID is retained for reload recovery. No wallet or record material is stored here. An unresolved submission blocks new sends, even after reset.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
