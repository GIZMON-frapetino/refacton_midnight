export function availableWallets(midnight = globalThis.window?.midnight) {
  return Object.values(midnight ?? {}).filter((api) => api?.rdns === 'io.lace.wallet' && typeof api.connect === 'function' && /^4\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(api.apiVersion ?? ''));
}

export function requestPreprodConnection(wallet) {
  if (!wallet || wallet.rdns !== 'io.lace.wallet' || typeof wallet.connect !== 'function' || !/^4\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(wallet.apiVersion ?? '')) {
    throw new Error('A compatible v4 Midnight wallet is not available. Install Lace and reload this page.');
  }
  // Call synchronously from the user gesture; only then await its result.
  return wallet.connect('preprod');
}

export async function assertPreprodConnection(api) {
  const status = await api.getConnectionStatus();
  if (status.status !== 'connected' || status.networkId !== 'preprod') throw new Error('Wallet is not connected to Preprod.');
  return api;
}

export function requireContractAddress(value) {
  const address = String(value ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(address)) throw new Error('Supply a deployed 64-character Preprod contract address. No address is configured in this draft.');
  return address;
}
