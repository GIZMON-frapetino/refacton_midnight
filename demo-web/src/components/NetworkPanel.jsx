import { useState } from 'react';
import { availableWallets, assertPreprodConnection, requestPreprodConnection, requireContractAddress } from '../lib/wallet-discovery.js';
import { selectExecutionMode } from '../lib/execution.js';
import './NetworkPanel.css';

export default function NetworkPanel({ mode, onModeChange }) {
  const [wallets, setWallets] = useState(() => availableWallets());
  const [choice, setChoice] = useState(0);
  const [api, setApi] = useState(null);
  const [address, setAddress] = useState(import.meta.env.VITE_PREPROD_CONTRACT_ADDRESS ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function changeMode(next) {
    if (busy || next === mode) return;
    try {
      selectExecutionMode(next);
      onModeChange(next);
    } catch { setMessage('Wait for the current network operation before changing modes.'); }
  }

  function refreshWallets(nextChoice = 0) {
    try {
      selectExecutionMode('preprod');
      setApi(null);
      setWallets(availableWallets());
      setChoice(nextChoice);
      setMessage('Wallet selection changed. Connect again before selecting a contract.');
    } catch { setMessage('Wait for the current network operation before changing wallets.'); }
  }

  async function connect() {
    setMessage('');
    setBusy(true);
    try {
      selectExecutionMode('preprod');
      setApi(null);
      const connection = requestPreprodConnection(wallets[choice]);
      const connected = await assertPreprodConnection(await connection);
      setApi(connected);
      setMessage('Wallet connected to Preprod. No transaction has been submitted.');
    } catch {
      setMessage('Wallet connection failed or was declined. Select a v4 wallet on Preprod, then try again.');
    } finally { setBusy(false); }
  }

  async function useContract() {
    setMessage('');
    setBusy(true);
    try {
      const target = requireContractAddress(address);
      if (!api) throw new Error('Connect Lace first.');
      await assertPreprodConnection(api);
      const { createNetworkRunner } = await import('../lib/network.ts');
      const runner = await createNetworkRunner(api, target);
      selectExecutionMode('preprod', runner);
      setMessage('Address and SDK providers selected. Live transactions are disabled by default in this draft. Operator approval, prior issuer authorization and live validation are still required.');
    } catch (error) {
      // Do not echo wallet configuration or service URLs, which may contain tokens.
      setMessage(error?.message?.startsWith('Supply a deployed') ? error.message : 'Could not select this contract. Check wallet, address, local service and published circuit assets. No simulator fallback was used.');
    } finally { setBusy(false); }
  }

  return (
    <details className="network-panel" open={mode === 'preprod' ? true : undefined}>
      <summary>Execution mode: {mode === 'preprod' ? 'Preprod (draft)' : 'Simulator'}</summary>
      <div className="network-panel-body">
        <div className="network-mode" role="group" aria-label="Execution mode">
          <button type="button" aria-pressed={mode === 'simulator'} disabled={busy} onClick={() => changeMode('simulator')}>Simulator</button>
          <button type="button" aria-pressed={mode === 'preprod'} disabled={busy} onClick={() => changeMode('preprod')}>Preprod (draft)</button>
        </div>
        {mode === 'simulator' ? <p>Local sample issuer and contract execution. No wallet or network transaction.</p> : <>
          <p><strong>Deployment unfinished.</strong> No contract address is supplied by this draft. Requires your funded Preprod Lace wallet, issuer authorization and local calculation service. Network errors are never replaced by simulator results.</p>
          <p>Network session material is held in memory only; closing or switching mode discards it. Keep a secure copy of any record material before using a real deployment.</p>
          <label htmlFor="midnight-wallet">Lace v4 wallet</label>
          <select id="midnight-wallet" disabled={busy} value={choice} onChange={(event) => refreshWallets(Number(event.target.value))}>
            {wallets.length ? wallets.map((wallet, index) => <option key={index} value={index}>{wallet.name ?? wallet.rdns ?? 'Midnight wallet'}</option>) : <option>No compatible wallet detected</option>}
          </select>
          <button type="button" disabled={busy} onClick={() => refreshWallets()}>Refresh wallets</button>
          <button type="button" disabled={busy || !wallets.length} onClick={connect}>{busy ? 'Waiting…' : 'Connect wallet to Preprod'}</button>
          <label htmlFor="preprod-contract-address">Deployed contract address</label>
          <input id="preprod-contract-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Not deployed in this draft" autoComplete="off" spellCheck={false} />
          <button type="button" disabled={busy || !api} onClick={useContract}>Use this Preprod contract</button>
          <p>Connection alone does not submit a transaction. Record/check actions request wallet approval and wait for finalization.</p>
        </>}
        {message && <p className="network-message" role="status">{message}</p>}
      </div>
    </details>
  );
}
