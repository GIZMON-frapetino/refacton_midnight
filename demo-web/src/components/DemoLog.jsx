import Disclosure from './Disclosure.jsx';

export default function DemoLog({ entries }) {
  return (
    <Disclosure title="What happened" badge="mock">
      <p className="support-copy">Your actions, in order.</p>
      <div className="log">
        {entries.length === 0 ? (
          <p className="empty-log">Your steps will appear here.</p>
        ) : (
          <ol>
            {entries.map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                <time dateTime={entry.at}>{formatTime(entry.at)}</time>
                <p>{entry.message}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Disclosure>
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
