import { useState } from 'react';
import { validateSession } from '../lib/session.js';
import { checkInMode, currentExecutionMode } from '../lib/execution.js';
import { bytesToHex, randomBytes32 } from '../lib/bytes.js';
import LedgerPanel from './LedgerPanel.jsx';
import DemoLog from './DemoLog.jsx';
import CodeValue from './CodeValue.jsx';

export default function BuyerFlow({ session, onSessionChange, appendLog, ledgerView, demoLog, onStartSeller, businessView = false, onFinish }) {
  const [questIdInput, setQuestIdInput] = useState(session?.questIdHex ?? '');
  const [challengeInput, setChallengeInput] = useState(() => bytesToHex(randomBytes32()));
  const [differentSecret, setDifferentSecret] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function clearResult() { setResult(null); setError(''); }
  function randomChallenge() { clearResult(); setChallengeInput(bytesToHex(randomBytes32())); }

  async function importSessionFile(file) {
    clearResult();
    try {
      if (currentExecutionMode() !== 'simulator') throw new Error('Simulator session imports are only available in Simulator mode.');
      const data = validateSession(JSON.parse(await file.text()));
      onSessionChange(data);
      setQuestIdInput(data.questIdHex);
      setDifferentSecret(false);
      appendLog('Buyer imported seller session file (secrets stored locally, not shown here).');
      if (!data.recorded) appendLog('Session file has no record yet — seller must complete recordQuest first.');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function runCheck() {
    clearResult();
    setBusy(true);
    try {
      const checked = await checkInMode(session, questIdInput, challengeInput, differentSecret);
      setResult({ status: 'match', responseHex: checked.responseHex });
      appendLog(`Buyer checkAttestation succeeded in ${currentExecutionMode()} mode (match).`);
      appendLog(`Response (challenge-bound): ${checked.responseHex.slice(0, 16)}…`);
      onSessionChange({ ...session, ledger: checked.ledger, lastResponseHex: checked.responseHex });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/Attestation not found/i.test(msg)) {
        setResult({ status: 'no-match', detail: msg });
        appendLog('Buyer checkAttestation: no match (attestation not found).');
      } else {
        setError(msg);
        appendLog(`Buyer check failed: ${msg}`);
      }
      if (session?.recorded) onSessionChange({ ...session, lastResponseHex: null });
    } finally {
      setBusy(false);
    }
  }

  const secretControl = <label className="checkbox-field" htmlFor="different-secret"><input id="different-secret" type="checkbox" checked={differentSecret} onChange={(e) => { clearResult(); setDifferentSecret(e.target.checked); }} /><span>Use a different secret<small>Try a no-match result. The secret stays hidden.</small></span></label>;

  return (
    <div className="flow-layout">
      <section className="flow-card buyer-card">
        <div className="section-kicker"><span className="eyebrow">THE BUYER VIEW</span><span className="contract-tag">contract</span></div>
        <h2 id="flow-heading" tabIndex={-1}>{businessView ? "Check this engineer's record" : 'Check a completed quest.'}</h2>
        {!result && <p className="flow-description">{businessView ? "Before you pay, check Engineer #A12's saved extraction-step record. You only see match or no match." : 'One tap to check. Your details stay off the ledger.'}</p>}
        {businessView && !result && <p className="business-help">Sample record: the extraction quest, not all six plan steps. No payment is made in this demo.</p>}

        {session?.recorded ? (
          <>
            {!result && !businessView && <div className="ready-record"><span className="field-label">Quest code ready</span><CodeValue value={questIdInput} label="quest id" /></div>}
            {businessView && secretControl}
            <button type="button" className={businessView && result ? 'secondary check-again' : 'primary'} onClick={runCheck} disabled={busy || !questIdInput || !challengeInput}>{busy ? 'Checking your quest…' : 'Check this quest'}<span aria-hidden="true">→</span></button>
          </>
        ) : (
          <div className="no-record">
            <p>{businessView ? 'No sample record saved yet.' : 'No quest saved yet. Finish the seller walkthrough first, or import a session in Advanced.'}</p>
            {businessView ? <a className="record-help-link" href="#engineer-record" onClick={(event) => { event.preventDefault(); onStartSeller(); }}>How the record was saved</a> : <button type="button" className="primary" onClick={onStartSeller}>Start with a quest<span aria-hidden="true">→</span></button>}
          </div>
        )}

        {result && (
          <>
            <div className={`result-card ${result.status === 'match' ? 'match' : 'no-match'}`} role="status" aria-live="polite">
              <p className="result-label">{result.status === 'match' ? 'MATCH' : 'NO MATCH'}</p>
              <h3>{result.status === 'match' ? 'Match: a saved record exists for this quest.' : 'No match: no record for this code.'}</h3>
              <p>{result.status === 'match' ? 'This code matches the saved quest record.' : differentSecret ? 'A different secret was used. The saved record has not changed.' : 'The quest code and local material do not match the saved record.'}</p>
              {result.status === 'match' && <small className="simulator-note">Answered for this check only.</small>}
              <details className="result-details"><summary>Details<span className="disclosure-arrow" aria-hidden="true" /></summary><div>{result.status === 'match' ? <><p>Challenge-bound response</p><CodeValue value={result.responseHex} label="response" /></> : <p className="technical-detail">{result.detail}</p>}</div></details>
            </div>
            {businessView ? <button type="button" className="primary" onClick={onFinish}>Continue</button> : <p className="simulator-note">Coming next (not built): follow this engineer's steps in your business, and hire them when you get stuck.</p>}
          </>
        )}
        {error && <div className="error-message" role="alert"><strong>Couldn't run this check.</strong><p>{error}</p></div>}

        <details className="advanced" id="buyer-advanced">
          <summary>Advanced<span className="advanced-hint">Inputs & test options</span><span className="disclosure-arrow" aria-hidden="true" /></summary>
          <div className="advanced-body">
            <p className="support-copy">The quest code and a fresh challenge are filled in for you. Change them only to try another check.</p>
            <label className="field" htmlFor="quest-id">Quest id (32 bytes hex)</label>
            <input id="quest-id" type="text" value={questIdInput} onChange={(e) => { clearResult(); setQuestIdInput(e.target.value); }} placeholder="64 hex characters" spellCheck={false} autoCapitalize="none" autoComplete="off" />
            <label className="field" htmlFor="challenge">Challenge (32 bytes hex)</label>
            <input id="challenge" type="text" value={challengeInput} onChange={(e) => { clearResult(); setChallengeInput(e.target.value); }} placeholder="64 hex characters" spellCheck={false} autoCapitalize="none" autoComplete="off" />
            <button type="button" className="secondary" onClick={randomChallenge}>Generate a new challenge</button>
            {!businessView && secretControl}
            <label className="field" htmlFor="session-file">Import seller session file</label>
            <input id="session-file" type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) importSessionFile(file); }} />
            <p className="support-copy">Session files contain local secrets. Use them only for this demo.</p>
          </div>
        </details>
      </section>
      {!businessView && <aside className="support-panels" aria-label="Demo details"><LedgerPanel ledgerView={ledgerView} /><DemoLog entries={demoLog} /></aside>}
    </div>
  );
}
