import { useState } from 'react';
import { exportMaterial, materialFromExport } from '../lib/simulator.js';
import { recordSession } from '../lib/session.js';
import { randomBytes32 } from '../lib/bytes.js';
import LedgerPanel from './LedgerPanel.jsx';
import DemoLog from './DemoLog.jsx';
import CodeValue from './CodeValue.jsx';

const GOAL = 'Automate invoice intake with AI';
const QUEST_TITLE = 'Build the extraction step';
const QUEST_TASKS = [
  'Collect 10 sample invoices.',
  'Extract date, amount, vendor.',
  'Check results against the originals.',
];

export default function SellerFlow({ session, onSessionChange, appendLog, ledgerView, demoLog, step, onStepChange, onCheckAsBuyer }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setStep = onStepChange;

  function ensureMaterial() {
    if (session?.questIdHex) return materialFromExport(session);
    const material = {
      questId: randomBytes32(), version: 1n, userSecret: randomBytes32(),
      localSecretKey: randomBytes32(), salt: randomBytes32(),
    };
    onSessionChange({ ...exportMaterial(material), recorded: false, ledger: null, lastResponseHex: null });
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
      const recorded = recordSession(session ?? { ...exportMaterial(material), recorded: false });
      onSessionChange(recorded);
      setStep(3);
      appendLog('Seller called recordQuest on the local contract simulator.');
      appendLog(`Ledger counter is now ${recorded.ledger.counter}.`);
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

  const activeStep = Math.max(1, step);

  return (
    <div className="flow-layout">
      <section className="flow-card seller-card">
        <ol className="progress-steps" aria-label="Quest progress">
          {['Plan', "Today's quest", 'Done'].map((label, index) => (
            <li key={label} className={index + 1 < activeStep ? 'completed' : index + 1 === activeStep ? 'current' : ''} aria-current={index + 1 === activeStep ? 'step' : undefined}>
              <span className="step-number">{index + 1}</span><span>{label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="step-content">
            <p className="eyebrow">ONE QUEST AT A TIME</p>
            <h2 id="flow-heading" tabIndex={-1}>Make your next step a small one.</h2>
            <p className="flow-description">Pick a plan, finish one skill quest, and share your progress with a simple code.</p>
            <div className="intro-note"><span className="mock-tag">mock</span><p>A short walkthrough. No wallet needed.</p></div>
            <button type="button" className="primary" onClick={advanceToPlan}>Create my plan<span aria-hidden="true">→</span></button>
          </div>
        )}

        {step === 1 && (
          <div className="step-content">
            <div className="section-kicker"><span className="eyebrow">YOUR PLAN</span><span className="mock-tag">mock</span></div>
            <h2 id="flow-heading" tabIndex={-1}>{GOAL}</h2>
            <p className="flow-description">One small step at a time.</p>
            <ol className="plan-list">
              <li><span>01</span><div><strong>Map the invoice flow</strong></div></li>
              <li><span>02</span><div><strong>Build the extraction step</strong></div></li>
              <li><span>03</span><div><strong>Hand off to accounting</strong></div></li>
            </ol>
            <button type="button" className="primary" onClick={advanceToQuest}>Use this plan<span aria-hidden="true">→</span></button>
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <div className="section-kicker"><span className="eyebrow">TODAY'S QUEST</span><span className="mock-tag">mock</span></div>
            <h2 id="flow-heading" tabIndex={-1}>{QUEST_TITLE}</h2>
            <p className="flow-description">Three small tasks. One step forward.</p>
            <ul className="quest-list">
              {QUEST_TASKS.map((task, i) => <li key={task}><span className="task-number">{i + 1}</span><span>{task}</span></li>)}
            </ul>
            <div className="quest-code"><span className="field-label">Your quest code</span><CodeValue value={session?.questIdHex ?? ''} label="quest id" /></div>
            <button type="button" className="primary" onClick={completeQuest} disabled={busy}>{busy ? 'Saving your quest…' : 'Mark quest complete'}<span aria-hidden="true">→</span></button>
          </div>
        )}

        {step === 3 && session?.recorded && (
          <div className="step-content done-content">
            <div className="success-symbol" aria-hidden="true"><span /></div>
            <p className="eyebrow">ONE SMALL STEP, COMPLETED</p>
            <h2 id="flow-heading" tabIndex={-1}>Your quest is saved.</h2>
            <p className="flow-description">Saved locally. Only a code, not your personal details, is on the ledger.</p>
            <div className="quest-code"><span className="field-label">Share your quest code</span><CodeValue value={session.questIdHex} label="quest id" /></div>
            <button type="button" className="primary" onClick={onCheckAsBuyer}>Check it as a buyer<span aria-hidden="true">→</span></button>
            <details className="advanced session-options"><summary>Session options<span className="disclosure-arrow" aria-hidden="true" /></summary><div className="advanced-body"><p className="support-copy">The session file contains local secrets. Only share it for this demo.</p><button type="button" className="secondary" onClick={downloadSession}>Download session file</button><button type="button" className="text-button" onClick={resetFlow}>Start a new demo</button></div></details>
          </div>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
      <aside className="support-panels" aria-label="Demo details"><LedgerPanel ledgerView={ledgerView} /><DemoLog entries={demoLog} /></aside>
    </div>
  );
}
