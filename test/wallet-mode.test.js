import { describe, test, expect, afterEach } from '@jest/globals';
import { availableWallets, assertPreprodConnection, requestPreprodConnection, requireContractAddress } from '../demo-web/src/lib/wallet-discovery.js';
import { selectExecutionMode, currentExecutionMode, recordInMode, checkInMode } from '../demo-web/src/lib/execution.js';

afterEach(() => selectExecutionMode('simulator'));
describe('Draft wallet/mode guards (offline)', () => {
  test('discovers v4 wallets by values, including dynamic UUID keys', () => {
    const lace = { apiVersion: '4.0.1', rdns: 'io.lace.wallet', connect() {} };
    expect(availableWallets({ 'different-uuid-each-load': lace, other: { apiVersion: '4.0.1', rdns: 'other.wallet', connect() {} }, older: { apiVersion: '3.0.0', connect() {} }, unrelated: {} })).toEqual([lace]);
  });
  test('no wallet and unsupported API are handled explicitly', () => {
    expect(availableWallets({})).toEqual([]);
    expect(() => requestPreprodConnection(null)).toThrow('compatible v4');
    expect(() => requestPreprodConnection({ apiVersion: '3.0.0', connect() {} })).toThrow('compatible v4');
  });
  test('connection is invoked synchronously from the click handler', async () => {
    let called = false;
    const pending = requestPreprodConnection({ apiVersion: '4.0.1', rdns: 'io.lace.wallet', connect(network) { called = true; expect(network).toBe('preprod'); return Promise.resolve({}); } });
    expect(called).toBe(true); await pending;
  });
  test('connected Preprod status is accepted', async () => {
    const api = { getConnectionStatus: async () => ({ status: 'connected', networkId: 'preprod' }) };
    expect(await assertPreprodConnection(api)).toBe(api);
  });
  test('disconnected and other networks are rejected', async () => {
    for (const status of [{ status: 'disconnected' }, { status: 'connected', networkId: 'preview' }]) {
      await expect(assertPreprodConnection({ getConnectionStatus: async () => status })).rejects.toThrow('not connected to Preprod');
    }
  });
  test('missing or malformed deployment addresses cannot be substituted', () => {
    expect(() => requireContractAddress('')).toThrow('No address is configured');
    expect(() => requireContractAddress('not-an-address')).toThrow('No address is configured');
    expect(requireContractAddress('a'.repeat(64))).toBe('a'.repeat(64));
  });
  test('preprod without a runner fails rather than calling the simulator', () => {
    selectExecutionMode('preprod');
    expect(() => recordInMode(null)).toThrow('No simulator action');
    expect(() => checkInMode(null, '', '')).toThrow('No simulator check');
  });
  test('unknown mode is rejected and leaves the default unchanged', () => {
    expect(() => selectExecutionMode('pretend-network')).toThrow('Unknown execution mode');
    expect(currentExecutionMode()).toBe('simulator');
  });
  test('network checks reject local simulator sessions', () => {
    selectExecutionMode('preprod', { check: () => { throw new Error('should not execute'); } });
    expect(() => checkInMode({ recorded: true }, '', '')).toThrow('simulator session');
  });
  test('dispatch forwards network operations only to the selected runner', async () => {
    let records = 0, checks = 0;
    selectExecutionMode('preprod', {
      record: async (session) => { records++; return session; },
      check: async (...args) => { checks++; return args; },
    });
    const session = { network: 'preprod' };
    expect(await recordInMode(session)).toBe(session);
    expect(await checkInMode(session, 'quest', 'challenge', true)).toEqual([session, 'quest', 'challenge', true]);
    expect([records, checks]).toEqual([1, 1]);
  });
  test('pending network operations block mode changes until settlement', async () => {
    let settle;
    selectExecutionMode('preprod', { record: () => new Promise((resolve) => { settle = resolve; }) });
    const pending = recordInMode({ network: 'preprod' });
    expect(() => selectExecutionMode('simulator')).toThrow('current network operation');
    settle({}); await pending;
    selectExecutionMode('simulator');
    expect(currentExecutionMode()).toBe('simulator');
  });
  test('failed network operations release the mode lock without a fallback result', async () => {
    selectExecutionMode('preprod', { record: async () => { throw new Error('declined'); } });
    await expect(recordInMode({})).rejects.toThrow('declined');
    selectExecutionMode('simulator');
    expect(currentExecutionMode()).toBe('simulator');
  });
  test('a non-Lace v4 provider is rejected before connection', () => {
    expect(() => requestPreprodConnection({ apiVersion: '4.0.1', rdns: 'other.wallet', connect() { throw new Error('should not run'); } })).toThrow('compatible v4');
  });
});
