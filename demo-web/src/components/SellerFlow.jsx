import { useMemo, useState } from 'react';
import {
  ContractSimulator,
  createSellerWitnesses,
  exportMaterial,
  ledgerSnapshot,
  materialFromExport,
} from '../lib/simulator.js';
import { bytesToHex, randomBytes32, truncateHex } from '../lib/bytes.js';
import LedgerPanel from './LedgerPanel.jsx';
import DemoLog from './DemoLog.jsx';

const GOAL = 'Ship a Midnight dApp';
const QUEST_TITLE = 'Bootstrap a local Compact workspace';
const QUEST_TASKS = [
  'Install Node.js 18+ and clone the QuestAttestation repo',
  'Run npm install and npm test (16 simulator tests)',
  'Skim contract/quest-attestation.compact circuits',
];

export default function SellerFlow({ session, onSessionChange, appendLog, ledgerView, demoLog }) {
  const [step, setStep] = useState(session?.recorded ? 3 : 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const questIdDisplay = session?.questIdHex ? truncateHex(session.questIdHex) : null;

  const planMock = useMemo(
    () => ({
      goal: GOAL,
      milestones: [
        'Week 1: contract + local simulator tests',
        'Week 2: demo web + Buildathon submission',
        'Week 3: preprod deployment (future)',
      ],
    }),
    []
  );

  function ensureMaterial() {
    if (session?.material) {
      return materialFromExport({
        questIdHex: session.questIdHex,
        versionNum: session.versionNum,
        userSecretHex: session.userSecretHex,
        localSecretKeyHex: session.localSecretKeyHex,
        saltHex: session.saltHex,
      });
    }
    const material = {
      questId: randomBytes32(),
      version: 1n,
      userSecret: randomBytes32(),
      localSecretKey: randomBytes32(),
      salt: randomBytes32(),
    };
    const exported = exportMaterial(material);
    onSessionChange({
      ...exported,
      recorded: false,
      ledger: null,
      lastResponseHex: null,
    });
    return material;
  }

  function advanceToPlan() {
    setError('');
    ensureMaterial();
    setStep(1);
    appendLog('Seller opened the plan step (mock coaching UI).');
  }

  function advanceToQuest() {
    setStep(2);
    appendLog(`Seller accepted quest: "${QUEST_TITLE}" (mock content).`);
  }

  async function completeQuest() {
    setError('');
    setBusy(true);
    try {
      const material = ensureMaterial();
      const sim = new ContractSimulator(createSellerWitnesses(material));
      const result = sim.callCircuit('recordQuest');
      const snap = ledgerSnapshot(sim);
      const exported = exportMaterial(material);
      onSessionChange({
        ...exported,
        recorded: true,
        ledger: snap,
        circuitOk: Boolean(result?.context),
      });
      setStep(3);
      appendLog('Seller called recordQuest on the local contract simulator.');
      appendLog(`Ledger counter is now ${snap.counter}.`);
    } catch (e) {
      setError(e?.message || String(e));
      appendLog(`recordQuest failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  function downloadSession() {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'midnight-quest-session.json';
    a.click();
    URL.revokeObjectURL(url);
    appendLog('Seller exported session file for buyer import (secrets inside file, not shown on buyer UI).');
  }

  function resetFlow() {
    onSessionChange(null);
    setStep(0);
    setError('');
    appendLog('Seller reset the demo session.');
  }

  return (
    <div className="grid two">
      <div className="panel">
        <h2>
          Seller journey <span className="mock-tag">mock</span> +{' '}
          <span className="contract-tag">contract</span>
        </h2>
        <div className="steps" aria-label="Progress">
          <span className={`step-pill ${step >= 1 ? 'done' : step === 0 ? 'current' : ''}`}>Plan</span>
          <span className={`step-pill ${step >= 2 ? 'done' : step === 1 ? 'current' : ''}`}>
            Today&apos;s quest
          </span>
          <span className={`step-pill ${step >= 3 ? 'done' : step === 2 ? 'current' : ''}`}>
            Quest done
          </span>
        </div>

        {step === 0 && (
          <>
            <p>Start the Midnight Buildathon seller walkthrough.</p>
            <button type="button" className="primary" onClick={advanceToPlan}>
              Begin
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h3>
              Plan <span className="mock-tag">mock</span>
            </h3>
            <p>
              <strong>Goal:</strong> {planMock.goal}
            </p>
            <ul className="quest-list">
              {planMock.milestones.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <button type="button" className="primary" onClick={advanceToQuest}>
              Use this plan
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h3>
              Today&apos;s quest <span className="mock-tag">mock</span>
            </h3>
            <p><strong>{QUEST_TITLE}</strong></p>
            <ul className="quest-list">
              {QUEST_TASKS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="note">
              Quest id for this session (public identifier for buyer check):{' '}
              <code>{questIdDisplay ?? '…'}</code>
            </p>
            <button type="button" className="primary" onClick={completeQuest} disabled={busy}>
              {busy ? 'Recording…' : 'Mark quest complete (recordQuest)'}
            </button>
          </>
        )}

        {step === 3 && session?.recorded && (
          <>
            <div className="badge">Quest recorded on simulated ledger</div>
            <p className="note">
              Share the quest id with a buyer: <code>{session.questIdHex}</code>
            </p>
            <button type="button" className="secondary" onClick={downloadSession}>
              Download session file
            </button>
            <button type="button" className="secondary" onClick={resetFlow}>
              Reset seller demo
            </button>
          </>
        )}

        {error && <p className="note" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      <div className="grid">
        <LedgerPanel ledgerView={ledgerView} />
        <DemoLog entries={demoLog} />
      </div>
    </div>
  );
}
