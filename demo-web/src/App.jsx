import { useCallback, useMemo, useState } from 'react';
import SellerFlow from './components/SellerFlow.jsx';
import BuyerFlow from './components/BuyerFlow.jsx';
import { validateSession } from './lib/session.js';

const SESSION_KEY = 'quest-attestation-demo-session';

export default function App() {
  const [mode, setMode] = useState('seller');
  const [session, setSession] = useState(() => loadSession());
  const [demoLog, setDemoLog] = useState(() => loadLog());

  const appendLog = useCallback((message) => {
    const entry = { at: new Date().toISOString(), message };
    setDemoLog((prev) => {
      const next = [...prev, entry].slice(-80);
      sessionStorage.setItem('quest-attestation-demo-log', JSON.stringify(next));
      return next;
    });
  }, []);

  const updateSession = useCallback(
    (next) => {
      setSession(next);
      if (next) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    },
    [setSession]
  );

  const ledgerView = useMemo(() => session?.ledger ?? null, [session]);

  return (
    <div className="app">
      <header>
        <h1>Quest Attestation — Midnight Buildathon Demo</h1>
        <p>
          Local browser simulator for the QuestAttestation Compact contract (0.31.1 / runtime
          0.16.0). Seller records a quest on the simulated public ledger; a buyer checks an
          attestation with a quest id and challenge. No Midnight network connection in this build.
        </p>
      </header>

      <nav className="tabs" aria-label="Demo mode">
        <button
          type="button"
          className={mode === 'seller' ? 'active' : ''}
          onClick={() => setMode('seller')}
        >
          Seller
        </button>
        <button
          type="button"
          className={mode === 'buyer' ? 'active' : ''}
          onClick={() => setMode('buyer')}
        >
          Buyer
        </button>
      </nav>

      {mode === 'seller' ? (
        <SellerFlow
          session={session}
          onSessionChange={updateSession}
          appendLog={appendLog}
          ledgerView={ledgerView}
          demoLog={demoLog}
        />
      ) : (
        <BuyerFlow
          session={session}
          onSessionChange={updateSession}
          appendLog={appendLog}
          ledgerView={ledgerView}
          demoLog={demoLog}
        />
      )}

      <footer>
        <p>
          Privacy note (honest demo): repeated checks of the same record can be linked because the
          contract discloses the commitment during each check. Buyer-side data protection is out of
          scope for this wave.
        </p>
        <p>
          Repository:{' '}
          <a href="https://github.com/GIZMON-frapetino/refacton_midnight">refacton_midnight</a>
        </p>
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
