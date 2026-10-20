import { useEffect, useRef, useState } from 'react';
import { createEncryptedPrivateStateProvider } from '../lib/encrypted-private-state.ts';

const MAX_FILE_BYTES = 1_400_000;

export default function EncryptedStoragePanel({ provider, onProviderChange, onReadinessChange }) {
  const storeRef = useRef(provider ?? createEncryptedPrivateStateProvider());
  const [passphrase, setPassphrase] = useState('');
  const [readiness, setReadiness] = useState(() => storeRef.current.getReadiness());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose initialize for a new local vault or unlock for an existing one.');

  useEffect(() => {
    onReadinessChange?.(readiness, storeRef.current);
  }, [onReadinessChange, readiness]);

  useEffect(() => {
    onProviderChange?.(storeRef.current);
  }, [onProviderChange]);

  useEffect(() => () => {
    storeRef.current.lock();
  }, []);

  function refresh(messageText) {
    const next = storeRef.current.getReadiness();
    setReadiness(next);
    if (messageText) setMessage(messageText);
  }

  function usablePassphrase() {
    if (passphrase.length < 12) {
      setMessage('Enter a passphrase with at least 12 characters.');
      return null;
    }
    return passphrase;
  }

  async function run(action, success) {
    setBusy(true);
    setMessage('Working with encrypted local storage.');
    try {
      await action();
      refresh(success);
    } catch {
      refresh('Storage operation could not be completed. Check the passphrase and encrypted file, then try again.');
    } finally {
      setPassphrase('');
      setBusy(false);
    }
  }

  function initialize() {
    const value = usablePassphrase();
    if (value === null) return;
    void run(() => storeRef.current.initialize(value), 'New encrypted local storage is ready.');
  }

  function unlock() {
    const value = usablePassphrase();
    if (value === null) return;
    void run(() => storeRef.current.unlock(value), 'Encrypted local storage is unlocked.');
  }

  function lock() {
    if (busy) return;
    storeRef.current.lock();
    setPassphrase('');
    refresh('Encrypted local storage is locked.');
  }

  async function downloadBackup() {
    await run(async () => {
      const text = await storeRef.current.exportEncryptedBackup();
      const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = 'encrypted-private-state.backup.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    }, 'Encrypted backup downloaded. Upload that same file for the restore check.');
  }

  async function readFile(event, handler) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setMessage('Select an encrypted backup file within the allowed size limit.');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      setMessage('The selected file could not be read.');
      return;
    }
    await handler(text);
  }

  async function importBackup(event) {
    await readFile(event, async (text) => {
      const value = usablePassphrase();
      if (value === null) return;
      await run(() => storeRef.current.importEncryptedBackup(text, value), 'Encrypted backup imported. Download it again, then run the restore check.');
    });
  }

  async function restoreCheck(event) {
    await readFile(event, async (text) => {
      const value = usablePassphrase();
      if (value === null) return;
      await run(() => storeRef.current.confirmRestore(text, value), 'Restore check completed for the current encrypted vault.');
    });
  }

  const flags = [
    ['Initialized', readiness.initialized],
    ['Unlocked', readiness.unlocked],
    ['Backup downloaded', readiness.backupExported],
    ['Restore checked', readiness.restoreChecked],
    ['Backup readiness (not deployment approval)', readiness.deployReady],
  ];

  return (
    <details className="encrypted-storage-panel" open>
      <summary>Encrypted local storage</summary>
      <div className="encrypted-storage-panel-body">
        <p>Only SDK private state written through this provider is stored inside the encrypted local vault.</p>
        <p>This vault encrypts SDK private state written through its provider. Recipient record material is not backed up automatically. Network witness recipient-secret material remains only in memory.</p>
        <p>Deployment remains disabled: the approval allowlist is empty.</p>
        <label htmlFor="encrypted-storage-passphrase">Passphrase</label>
        <input
          id="encrypted-storage-passphrase"
          type="password"
          minLength="12"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          placeholder="At least 12 characters"
        />
        <div className="encrypted-storage-actions">
          <button type="button" disabled={busy || readiness.unlocked} onClick={initialize}>Initialize new storage</button>
          <button type="button" disabled={busy || readiness.unlocked} onClick={unlock}>Unlock existing storage</button>
          <button type="button" disabled={busy || !readiness.unlocked} onClick={lock}>Lock storage</button>
          <button type="button" disabled={busy || !readiness.unlocked} onClick={() => void downloadBackup()}>Download encrypted backup</button>
        </div>
        <label htmlFor="encrypted-storage-import">Import encrypted backup</label>
        <input
          id="encrypted-storage-import"
          type="file"
          accept="application/json,text/plain,.json"
          disabled={busy}
          onChange={(event) => void importBackup(event)}
        />
        <label htmlFor="encrypted-storage-restore">Restore-check encrypted backup</label>
        <input
          id="encrypted-storage-restore"
          type="file"
          accept="application/json,text/plain,.json"
          disabled={busy || !readiness.unlocked || !readiness.backupExported}
          onChange={(event) => void restoreCheck(event)}
        />
        <ul aria-label="Encrypted storage readiness">
          {flags.map(([label, ready]) => <li key={label}>{label}: {ready ? 'yes' : 'no'}</li>)}
        </ul>
        <p role="status">{message}</p>
      </div>
    </details>
  );
}
