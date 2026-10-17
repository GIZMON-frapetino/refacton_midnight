export default function DemoLog({ entries }) {
  return (
    <div className="panel">
      <h2>
        Demo log <span className="mock-tag">mock ui</span>
      </h2>
      <p className="note">Narrative steps for the video flow; not read from the contract.</p>
      <div className="log" aria-live="polite">
        {entries.length === 0 ? (
          <div className="log-entry">Waiting for actions…</div>
        ) : (
          entries.map((e, i) => (
            <div key={`${e.at}-${i}`} className="log-entry">
              <strong>{formatTime(e.at)}</strong> — {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
