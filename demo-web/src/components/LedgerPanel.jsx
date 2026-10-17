export default function LedgerPanel({ ledgerView }) {
  if (!ledgerView) {
    return (
      <div className="panel">
        <h2>
          Public ledger (simulator) <span className="contract-tag">contract</span>
        </h2>
        <p className="note">No record yet. Complete the seller quest flow to populate the ledger.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>
        Public ledger (simulator) <span className="contract-tag">contract</span>
      </h2>
      <p className="note">Values below come from <code>ledger()</code> after circuit calls.</p>
      <h3>Counter</h3>
      <div className="hex-row">{ledgerView.counter}</div>
      <h3>Commitments ({ledgerView.commitments.length})</h3>
      {ledgerView.commitments.length === 0 ? (
        <p className="note">(empty)</p>
      ) : (
        ledgerView.commitments.map((c) => (
          <div key={c} className="hex-row">{c}</div>
        ))
      )}
      <h3>Nullifiers ({ledgerView.nullifiers.length})</h3>
      {ledgerView.nullifiers.length === 0 ? (
        <p className="note">(empty)</p>
      ) : (
        ledgerView.nullifiers.map((n) => (
          <div key={n} className="hex-row">{n}</div>
        ))
      )}
    </div>
  );
}
