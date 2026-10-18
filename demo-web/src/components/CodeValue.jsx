import { useState } from 'react';

export default function CodeValue({ value, label = 'code' }) {
  const [status, setStatus] = useState('');
  const short = value.length > 15 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied');
    } catch {
      setStatus('Copy unavailable. Open the full code below.');
    }
  }

  return (
    <div className="code-value">
      <div className="code-line">
        <code aria-label={`${label}, shortened`}>{short}</code>
        <button type="button" className="copy-button" onClick={copyValue} aria-label={`Copy ${label}`}>
          {status === 'Copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      {status && status !== 'Copied' && (
        <div className="copy-fallback" role="status">
          <p>{status}</p>
          <textarea readOnly value={value} aria-label={`Full ${label}`} onFocus={(e) => e.target.select()} />
        </div>
      )}
    </div>
  );
}
