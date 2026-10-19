import CodeValue from './CodeValue.jsx';
import Disclosure from './Disclosure.jsx';

export default function LedgerPanel({ ledgerView }) {
  const counter = ledgerView?.counter ?? '0';
  const commitmentCount = ledgerView?.commitmentCount ?? '0';
  const nullifiers = ledgerView?.nullifiers ?? [];

  return (
    <Disclosure title="Public ledger" badge="contract">
      <p className="simulator-note">Runs the QuestAttestation contract in a local simulator in your browser. Not deployed to a network yet.</p>
      <p className="support-copy">Codes only. No personal details.</p>
      <p className="simulator-note">Issuer authorization is a local sample, not an external review.</p>
      <div className="ledger-stats" aria-label="Ledger counts">
        <div><strong>{counter}</strong><span>Records</span></div>
        <div><strong>{commitmentCount}</strong><span>Tree leaves</span></div>
        <div><strong>{nullifiers.length}</strong><span>Nullifiers</span></div>
      </div>
      {!ledgerView ? (
        <p className="support-copy">Your first record will appear after you finish a quest.</p>
      ) : (
        <details className="ledger-code-details">
          <summary>View ledger codes<span className="disclosure-arrow" aria-hidden="true" /></summary>
          <div className="ledger-codes">
            <h3>Current tree root</h3>
            <CodeValue value={ledgerView.treeRoot} label="tree root" />
            <h3>Nullifiers ({nullifiers.length})</h3>
            {nullifiers.map((value, i) => <CodeValue key={value} value={value} label={`nullifier ${i + 1}`} />)}
            <h3>Registered issuer identifiers ({ledgerView.issuerKeys?.length ?? 0})</h3>
            {ledgerView.issuerKeys?.map((value, i) => <CodeValue key={value} value={value} label={`issuer ${i + 1}`} />)}
            <p className="support-copy">Authorization markers: {ledgerView.authorizationCount ?? '0'}</p>
            <p className="support-copy">Read from <code>ledger()</code> after the contract call.</p>
          </div>
        </details>
      )}
    </Disclosure>
  );
}
