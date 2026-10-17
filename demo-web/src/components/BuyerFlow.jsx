import { useState } from 'react';
import {
  ContractSimulator,
  createCheckWitnesses,
  createSellerWitnesses,
  ledgerSnapshot,
  materialFromExport,
} from '../lib/simulator.js';
import { bytesToHex, hexToBytes, randomBytes32 } from '../lib/bytes.js';
import LedgerPanel from './LedgerPanel.jsx';
import DemoLog from './DemoLog.jsx';

export default function BuyerFlow({ session, onSessionChange, appendLog, ledgerView, demoLog }) {
  const [questIdInput, setQuestIdInput] = useState(session?.questIdHex ?? '');
  const [challengeInput, setChallengeInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function randomChallenge() {
    const c = randomBytes32();
    setChallengeInput(bytesToHex(c));
  }

  async function importSessionFile(file) {
    setError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.questIdHex) throw new Error('Invalid session file');
      onSessionChange({ ...data, recorded: Boolean(data.recorded) });
      setQuestIdInput(data.questIdHex);
      appendLog('Buyer imported seller session file (secrets stored locally, not shown here).');
      if (!data.recorded) {
        appendLog('Session file has no record yet — seller must complete recordQuest first.');
      }
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function rebuildSimulator() {
    if (!session?.recorded) {
      throw new Error('No seller record in this browser session. Complete seller flow or import a session file.');
    }
    const material = materialFromExport(session);
    const sim = new ContractSimulator(createSellerWitnesses(material));
    sim.callCircuit('recordQuest');
    return { sim, material };
  }

  async function runCheck() {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const questId = hexToBytes(questIdInput.trim());
      const challenge = hexToBytes(challengeInput.trim());
      const { sim, material } = rebuildSimulator();
      sim.contract.witnesses = createCheckWitnesses(material);
      const checkResult = sim.callCircuit('checkAttestation', challenge, questId);
      const responseHex = bytesToHex(checkResult.result);
      setResult({ status: 'match', responseHex });
      appendLog('Buyer checkAttestation succeeded (match).');
      appendLog(`Response (challenge-bound): ${responseHex.slice(0, 16)}…`);
      onSessionChange({
        ...session,
        ledger: ledgerSnapshot(sim),
        lastResponseHex: responseHex,
      });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/Attestation not found/i.test(msg)) {
        setResult({ status: 'no-match', detail: msg });
        appendLog('Buyer checkAttestation: no match (attestation not found).');
      } else {
        setError(msg);
        appendLog(`Buyer check failed: ${msg}`);
      }
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
          Enter the quest id and a challenge. The check uses seller material from this browser session
          or an imported session file; secrets are never shown on this screen.
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
          onChange={(e) => setQuestIdInput(e.target.value)}
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
          onChange={(e) => setChallengeInput(e.target.value)}
          placeholder="64 hex characters"
          spellCheck={false}
        />
        <button type="button" className="secondary" onClick={randomChallenge}>
          Generate random challenge
        </button>

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
            <strong>Match</strong> — attestation found for this quest id.
            <div className="note">Challenge-bound response: {result.responseHex}</div>
          </div>
        )}
        {result?.status === 'no-match' && (
          <div className="result no-match" role="status">
            <strong>No match</strong> — {result.detail || 'Attestation not found'}
          </div>
        )}
        {error && <p className="note" style={{ color: 'var(--danger)' }}>{error}</p>}

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
