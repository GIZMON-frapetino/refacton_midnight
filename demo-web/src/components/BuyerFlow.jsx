import { useState } from 'react';
import { checkSession, validateSession } from '../lib/session.js';
import { bytesToHex, randomBytes32 } from '../lib/bytes.js';
import LedgerPanel from './LedgerPanel.jsx';
import DemoLog from './DemoLog.jsx';

export default function BuyerFlow({ session, onSessionChange, appendLog, ledgerView, demoLog }) {
  const [questIdInput, setQuestIdInput] = useState(session?.questIdHex ?? '');
  const [challengeInput, setChallengeInput] = useState('');
  const [differentSecret, setDifferentSecret] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function clearResult() {
    setResult(null);
    setError('');
  }

  function randomChallenge() {
    clearResult();
    setChallengeInput(bytesToHex(randomBytes32()));
  }

  async function importSessionFile(file) {
    clearResult();
    try {
      const data = validateSession(JSON.parse(await file.text()));
      onSessionChange(data);
      setQuestIdInput(data.questIdHex);
      setDifferentSecret(false);
      appendLog('Buyer imported seller session file (secrets stored locally, not shown here).');
      if (!data.recorded) {
        appendLog('Session file has no record yet — seller must complete recordQuest first.');
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function runCheck() {
    clearResult();
    setBusy(true);
    try {
      const checked = checkSession(session, questIdInput, challengeInput, differentSecret);
      setResult({ status: 'match', responseHex: checked.responseHex });
      appendLog('Buyer checkAttestation succeeded (match).');
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

  return (
    <div className="grid two">
      <div className="panel">
        <h2>
          Buyer check <span className="contract-tag">contract</span>
        </h2>
        <p className="note">
          Enter the quest id and a challenge. The check uses the saved seller ledger and material
          from this browser session or an imported file; secrets are never shown on this screen.
        </p>

        <label className="field" htmlFor="session-file">
          Import seller session file (optional)
        </label>
        <input
          id="session-file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importSessionFile(f);
          }}
        />

        <label className="field" htmlFor="quest-id">
          Quest id (32 bytes hex)
        </label>
        <input
          id="quest-id"
          type="text"
          value={questIdInput}
          onChange={(e) => { clearResult(); setQuestIdInput(e.target.value); }}
          placeholder="64 hex characters"
          spellCheck={false}
        />

        <label className="field" htmlFor="challenge">
          Challenge (32 bytes hex)
        </label>
        <input
          id="challenge"
          type="text"
          value={challengeInput}
          onChange={(e) => { clearResult(); setChallengeInput(e.target.value); }}
          placeholder="64 hex characters"
          spellCheck={false}
        />
        <button type="button" className="secondary" onClick={randomChallenge}>
          Generate random challenge
        </button>

        <label className="field" htmlFor="different-secret">
          <input
            id="different-secret"
            type="checkbox"
            checked={differentSecret}
            onChange={(e) => { clearResult(); setDifferentSecret(e.target.checked); }}
          />{' '}
          Use a different secret (negative check; secret stays hidden)
        </label>

        <button
          type="button"
          className="primary"
          onClick={runCheck}
          disabled={busy || !questIdInput || !challengeInput}
        >
          {busy ? 'Checking…' : 'Run checkAttestation'}
        </button>

        {result?.status === 'match' && (
          <div className="result match" role="status">
            <strong>Match — 合う</strong> — attestation found for this quest id.
            <div className="note">Challenge-bound response: {result.responseHex}</div>
          </div>
        )}
        {result?.status === 'no-match' && (
          <div className="result no-match" role="status">
            <strong>No match — 合わない</strong> — {result.detail || 'Attestation not found'}
          </div>
        )}
        {error && <p className="note" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}

        <p className="note">
          Linking note: checking the same on-ledger record again may disclose the same commitment,
          so repeated checks can be correlated.
        </p>
      </div>

      <div className="grid">
        <LedgerPanel ledgerView={ledgerView} />
        <DemoLog entries={demoLog} />
      </div>
    </div>
  );
}
