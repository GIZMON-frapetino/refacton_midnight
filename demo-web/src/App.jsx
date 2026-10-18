import { useCallback, useMemo, useState } from 'react';
import SellerFlow from './components/SellerFlow.jsx';
import BuyerFlow from './components/BuyerFlow.jsx';
import { validateSession } from './lib/session.js';

const SESSION_KEY = 'quest-attestation-demo-session';

export default function App() {
  const [mode, setMode] = useState('seller');
  const [session, setSession] = useState(() => loadSession());
  const [demoLog, setDemoLog] = useState(() => loadLog());
  const [sellerStep, setSellerStep] = useState(session?.recorded ? 3 : 0);

  const appendLog = useCallback((message) => {
    const entry = { at: new Date().toISOString(), message };
    setDemoLog((prev) => {
      const next = [...prev, entry].slice(-80);
      sessionStorage.setItem('quest-attestation-demo-log', JSON.stringify(next));
      return next;
    });
  }, []);

  const updateSession = useCallback((next) => {
    setSession(next);
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const ledgerView = useMemo(() => session?.ledger ?? null, [session]);

  function openBuyer() {
    setMode('buyer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => document.getElementById('flow-heading')?.focus());
  }

  function handleTabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'seller' : event.key === 'End' ? 'buyer' : mode === 'seller' ? 'buyer' : 'seller';
    setMode(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  return (
    <div className="app">
      <a className="skip-link" href="#demo-panel">Skip to the demo</a>
      <header className="app-header">
        <div className="brand-line">
          <span className="wordmark">refacton<span className="brand-dot">.</span></span>
          <span className="demo-label">MIDNIGHT DEMO</span>
        </div>
        <h1>Small steps. Real progress.</h1>
        <p>Show that you finished a skill quest without handing over your personal data.</p>
      </header>

      <nav className="tabs" role="tablist" aria-label="Demo mode">
        {['seller', 'buyer'].map((tab) => (
          <button
            key={tab}
            id={`${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            aria-controls="demo-panel"
            tabIndex={mode === tab ? 0 : -1}
            className={mode === tab ? 'active' : ''}
            onClick={() => setMode(tab)}
            onKeyDown={handleTabKey}
          >
            {tab === 'seller' ? 'Seller' : 'Buyer'}
            <span>{tab === 'seller' ? 'Finish a quest' : 'Check a quest'}</span>
          </button>
        ))}
      </nav>

      <main id="demo-panel" role="tabpanel" aria-labelledby={`${mode}-tab`} tabIndex={-1}>
        {mode === 'seller' ? (
          <SellerFlow
            session={session}
            onSessionChange={updateSession}
            appendLog={appendLog}
            ledgerView={ledgerView}
            demoLog={demoLog}
            step={session?.recorded ? 3 : sellerStep}
            onStepChange={setSellerStep}
            onCheckAsBuyer={openBuyer}
          />
        ) : (
          <BuyerFlow
            session={session}
            onSessionChange={updateSession}
            appendLog={appendLog}
            ledgerView={ledgerView}
            demoLog={demoLog}
            onStartSeller={() => { setSellerStep(0); setMode('seller'); }}
          />
        )}
      </main>

      <footer>
        <details className="about-demo">
          <summary>About this demo<span className="disclosure-arrow" aria-hidden="true" /></summary>
          <div className="about-body">
            <p><span className="contract-tag">contract</span> Quest recording, checks and the public ledger use the QuestAttestation Compact contract in a local browser simulator (compiler 0.31.1 / runtime 0.16.0).</p>
            <p><span className="mock-tag">mock</span> The plan, quest content and walkthrough are demo examples.</p>
            <p><strong>No Midnight network connection in this build.</strong> No wallet or network transaction is involved.</p>
            <p>Privacy note: repeated checks of the same record can be linked because the contract discloses the same commitment during each check. Buyer-side data protection is outside this demo's scope.</p>
            <p>Local session files include secrets. Share them only when trying this demo with someone you trust.</p>
            <a href="https://github.com/GIZMON-frapetino/refacton_midnight">View the repository</a>
          </div>
        </details>
        <p className="footer-note">A local demo. Your next small step is yours.</p>
      </footer>
    </div>
  );
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? validateSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function loadLog() {
  try {
    const raw = sessionStorage.getItem('quest-attestation-demo-log');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
