import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { connectLace, InMemoryPrivateStateProvider, requireDurablePrivateState } from '../src/lib/wallet-adapter.js';

function offlineStatus(networkId: string): ConnectedAPI {
  return { getConnectionStatus: async () => ({ status: 'connected', networkId }) } as ConnectedAPI;
}
function offlineWallet(connected: ConnectedAPI): InitialAPI {
  return { name: 'Offline test Lace', icon: '', rdns: 'io.lace.wallet', apiVersion: '4.0.1', connect: async () => connected };
}

test('adapter calls Lace connection synchronously and checks its network (offline)', async () => {
  let called = false;
  const connected = offlineStatus('preprod');
  const initial: InitialAPI = {
    ...offlineWallet(connected),
    connect: async (network: string) => { called = true; assert.equal(network, 'preprod'); return connected; },
  };
  const pending = connectLace(initial);
  assert.equal(called, true);
  assert.equal(await pending, connected);
});

test('adapter rejects unsupported or mismatched wallet connections (offline)', async () => {
  await assert.rejects(connectLace({ ...offlineWallet(offlineStatus('preprod')), apiVersion: '3.0.0' }));
  await assert.rejects(connectLace(offlineWallet(offlineStatus('preview'))), /not on preprod/);
});

test('memory state is address-scoped and does not offer unsafe exports', async () => {
  const store = new InMemoryPrivateStateProvider<{ value: number }>();
  await assert.rejects(store.get('state'), /address must be set/);
  store.setContractAddress('a'.repeat(64)); await store.set('state', { value: 1 });
  store.setContractAddress('b'.repeat(64)); assert.equal(await store.get('state'), null);
  store.setContractAddress('a'.repeat(64)); assert.deepEqual(await store.get('state'), { value: 1 });
  await assert.rejects(store.exportPrivateStates(), /not available/);
  await assert.rejects(store.exportSigningKeys(), /not available/);
});

test('deployment storage guard rejects the default ephemeral store', () => {
  assert.throws(() => requireDurablePrivateState(new InMemoryPrivateStateProvider<Record<string, never>>()), /durable encrypted/);
});
