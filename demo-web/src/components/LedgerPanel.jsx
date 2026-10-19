import CodeValue from './CodeValue.jsx';
import Disclosure from './Disclosure.jsx';

export default function LedgerPanel({ ledgerView }) {
  const counter = ledgerView?.counter ?? '0';
  const commitments = ledgerView?.commitments ?? [];
  const nullifiers = ledgerView?.nullifiers ?? [];

  return (
    <Disclosure title="Public ledger" badge="contract">
      <p className="simulator-note">Runs the QuestAttestation contract in a local simulator in your browser. Not deployed to a network yet.</p>
      <p className="support-copy">Codes only. No personal details.</p>
      <div className="ledger-stats" aria-label="Ledger counts">
        <div><strong>{counter}</strong><span>Records</span></div>
        <div><strong>{commitments.length}</strong><span>Commitments</span></div>
        <div><strong>{nullifiers.length}</strong><span>Nullifiers</span></div>
      </div>
      {!ledgerView ? (
        <p className="support-copy">Your first record will appear after you finish a quest.</p>
      ) : (
        <details className="ledger-code-details">
          <summary>View ledger codes<span className="disclosure-arrow" aria-hidden="true" /></summary>
          <div className="ledger-codes">
            <h3>Commitments ({commitments.length})</h3>
            {commitments.map((value, i) => <CodeValue key={value} value={value} label={`commitment ${i + 1}`} />)}
            <h3>Nullifiers ({nullifiers.length})</h3>
            {nullifiers.map((value, i) => <CodeValue key={value} value={value} label={`nullifier ${i + 1}`} />)}
            <p className="support-copy">Read from <code>ledger()</code> after the contract call.</p>
          </div>
        </details>
      )}
    </Disclosure>
  );
}
