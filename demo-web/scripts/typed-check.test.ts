import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { ContractSimulator, exportMaterial } from '../src/lib/simulator.js';
import { recordSession } from '../src/lib/session.js';
import { bytesToHex } from '../src/lib/bytes.js';
import { createNetworkRunner } from '../src/lib/network.js';
import { ERROR_CODES, SAFE_ERROR_HEADINGS, createAppError, isAppError, normalizeCheckError } from '../src/lib/check-errors.js';
import { createProviders, compileContract, joinTarget } from '../src/lib/wallet-adapter.js';
import { TransactionRecovery } from '../src/lib/transaction-recovery.js';

const ADDRESS = 'a'.repeat(64);
const material = {
  questId: new Uint8Array(32).fill(1),
  version: 1n,
  userSecret: new Uint8Array(32).fill(2),
  localSecretKey: new Uint8Array(32).fill(3),
  salt: new Uint8Array(32).fill(4),
};
const challenge = new Uint8Array(32).fill(9);

function localRecordedSession() {
  const recorded = recordSession({ ...exportMaterial(material), recorded: false });
  return { ...recorded, network: 'preprod', contractAddress: ADDRESS };
}

function localCircuitDependencies(publicStateHex: string, invokeCircuit: boolean) {
  let witnesses: ConstructorParameters<typeof ContractSimulator>[0] | undefined;
  const compile = vi.fn((_source, input) => {
    witnesses = input;
    return {};
  });
  const join = vi.fn(async () => ({
    callTx: {
      checkAttestation: async (input: Uint8Array) => {
        if (!invokeCircuit) {
          return { private: { result: new Uint8Array(32) }, public: { txId: 'generic-result', nextContractState: {} } };
        }
        if (!witnesses) throw new Error('local witnesses were not prepared');
        const local = new ContractSimulator(witnesses, publicStateHex);
        const result = local.callCircuit('checkAttestation', input);
        return {
          private: { result: result.result },
          public: {
            txId: 'local-result',
            nextContractState: local.circuitContext.currentQueryContext.state,
          },
        };
      },
    },
  }));
  return {
    createProviders: vi.fn(async () => ({ providers: {}, invalidate: () => {}, forAttempt: () => ({}) })) as unknown as typeof createProviders,
    compileContract: compile as unknown as typeof compileContract,
    joinTarget: join as unknown as typeof joinTarget,
    assetBaseURL: () => 'https://example.invalid/contract-assets/',
    recovery: new TransactionRecovery({ lock: async (operation) => operation() }),
  };
}

async function runnerFor(publicStateHex: string, invokeCircuit: boolean) {
  return createNetworkRunner({} as ConnectedAPI, ADDRESS, () => {}, localCircuitDependencies(publicStateHex, invokeCircuit));
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('typed local check results', () => {
  test('returns match only after the captured witness runs in the local circuit', async () => {
    vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', 'true');
    const session = localRecordedSession();
    const runner = await runnerFor(session.publicStateHex, true);

    await expect(runner.check(session, bytesToHex(material.questId), bytesToHex(challenge))).resolves.toMatchObject({
      membership: 'match',
      responseHex: expect.any(String),
    });
  });

  test('maps an actual local missing-member circuit result to the sole negative outcome code', async () => {
    vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', 'true');
    const session = localRecordedSession();
    const runner = await runnerFor(session.publicStateHex, true);

    await expect(runner.check(session, 'f'.repeat(64), bytesToHex(challenge))).rejects.toMatchObject({
      code: ERROR_CODES.LOCAL_MEMBERSHIP_MISSING,
    });
  });

  test('a generic injected result that skips local circuit evaluation cannot report match', async () => {
    vi.stubEnv('VITE_ENABLE_PREPROD_TRANSACTIONS', 'true');
    const session = localRecordedSession();
    const runner = await runnerFor(session.publicStateHex, false);

    await expect(runner.check(session, bytesToHex(material.questId), bytesToHex(challenge))).rejects.toMatchObject({
      code: ERROR_CODES.UNKNOWN,
    });
  });

  test('external text is never a negative-result signal and all public categories are static', () => {
    const marker = 'PRIVATE_REMOTE_DETAIL';
    const external = normalizeCheckError(new Error(`Attestation not found ${marker}`));
    expect(external.code).toBe(ERROR_CODES.UNKNOWN);
    expect(external.message).not.toContain(marker);

    for (const code of [ERROR_CODES.WALLET_REJECTED, ERROR_CODES.NETWORK_FAILURE, ERROR_CODES.UNKNOWN] as const) {
      const typed = createAppError(code);
      expect(isAppError(typed)).toBe(true);
      expect(SAFE_ERROR_HEADINGS[typed.code]).toBeTruthy();
      expect(typed.message).not.toContain(marker);
    }
  });
});
