import { useCallback, useState } from 'react';
import { validateSession } from '../lib/session.js';

const SESSION_KEY = 'quest-attestation-demo-session';
const LOG_KEY = 'quest-attestation-demo-log';

export default function useDemoSession(mode = 'simulator') {
  const [session, setSession] = useState(() => {
    if (mode !== 'simulator') return null;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? validateSession(JSON.parse(raw)) : null;
    } catch { return null; }
  });
  const [demoLog, setDemoLog] = useState(() => {
    if (mode !== 'simulator') return [];
    try {
      const value = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  });

  const updateSession = useCallback((next) => {
    setSession(next);
    if (mode !== 'simulator') return;
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [mode]);

  const appendLog = useCallback((message) => {
    const entry = { at: new Date().toISOString(), message };
    setDemoLog((prev) => {
      const next = [...prev, entry].slice(-80);
      if (mode === 'simulator') sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
      return next;
    });
  }, [mode]);

  return { session, updateSession, demoLog, appendLog };
}
