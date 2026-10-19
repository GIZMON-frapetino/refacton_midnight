import { useCallback, useState } from 'react';
import { validateSession } from '../lib/session.js';

const SESSION_KEY = 'quest-attestation-demo-session';
const LOG_KEY = 'quest-attestation-demo-log';

export default function useDemoSession() {
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? validateSession(JSON.parse(raw)) : null;
    } catch { return null; }
  });
  const [demoLog, setDemoLog] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  });

  const updateSession = useCallback((next) => {
    setSession(next);
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const appendLog = useCallback((message) => {
    const entry = { at: new Date().toISOString(), message };
    setDemoLog((prev) => {
      const next = [...prev, entry].slice(-80);
      sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { session, updateSession, demoLog, appendLog };
}
