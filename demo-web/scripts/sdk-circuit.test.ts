import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  sampleSigningKey,
} from '@midnight-ntwrk/compact-runtime';
import {
  LedgerParameters,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
  ZswapChainState,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createUnprovenCallTxFromInitialStates,
  createUnprovenDeployTxFromVerifierKeys,
} from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  createProverKey,
  createVerifierKey,
  createZKIR,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';

import { Contract, pureCircuits } from '../../compiled/contract/index.js';
import { recordWitnesses } from '../../contract/witnesses.js';
import { compileContract } from '../src/lib/wallet-adapter.js';

const circuitIds = [
  'registerIssuer',
  'authorizeRecord',
  'recordQuest',
  'checkAttestation',
  'hasNullifier',
  'getCounterValue',
] as const;

type CircuitId = (typeof circuitIds)[number];

const keysDirectory = fileURLToPath(new URL('../../compiled/keys/', import.meta.url));
const zkirDirectory = fileURLToPath(new URL('../../compiled/zkir/', import.meta.url));
const compiledDirectory = fileURLToPath(new URL('../../compiled/', import.meta.url));

function ephemeralBytes32(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Reads only this repository's compiled artifacts.  It is deliberately not a
 * network provider and does not serialize or log any artifact material.
 */
class LocalCompiledArtifacts extends ZKConfigProvider<string> {
  async getProverKey(circuitId: string): Promise<ProverKey> {
    return createProverKey(await this.read(circuitId, keysDirectory, '.prover'));
  }

  async getVerifierKey(circuitId: string): Promise<VerifierKey> {
    return createVerifierKey(await this.read(circuitId, keysDirectory, '.verifier'));
  }

  async getZKIR(circuitId: string): Promise<ZKIR> {
    return createZKIR(await this.read(circuitId, zkirDirectory, '.bzkir'));
  }

  private async read(circuitId: string, directory: string, extension: string): Promise<Uint8Array> {
    assert.ok(
      (circuitIds as readonly string[]).includes(circuitId),
      `unexpected circuit artifact request: ${circuitId}`,
    );
    return new Uint8Array(await readFile(`${directory}${circuitId}${extension}`));
  }
}

test('SDK 4.1.1 executes the generated circuit, partitions it, and builds an unsubmitted call transaction offline', async () => {
  // These values are generated afresh for this process.  They are test-only
  // synthetic material, never wallet keys, and are intentionally never logged.
  const authority = { adminSecret: ephemeralBytes32(), issuerSecret: ephemeralBytes32() };
  const witnesses = recordWitnesses<Record<string, never>>({
    questId: ephemeralBytes32(),
    version: 1n,
    userSecret: ephemeralBytes32(),
    localSecretKey: ephemeralBytes32(),
    salt: ephemeralBytes32(),
  }, authority);
  const adminKey = pureCircuits.deriveAdminKey(authority.adminSecret);
  const scope = ephemeralBytes32();
  const coinPublicKey = sampleCoinPublicKey();
  const encryptionPublicKey = sampleEncryptionPublicKey();
  const artifacts = new LocalCompiledArtifacts();
  setNetworkId('preprod');

  const compiledContract = compileContract<Contract<Record<string, never>>>(Contract, witnesses, compiledDirectory, 'QuestAttestationSdkCircuit');

  // Local construction reads verifier keys and the matching binary ZKIR.
  // No remote calculation, wallet operation or network submission is performed.
  const zkir = await artifacts.getZKIR('getCounterValue');
  assert.ok(zkir.byteLength > 0);

  // This is a local constructor execution and unsubmitted-deployment build.
  // It loads every generated verifier key into the generated contract state;
  // it does not submit a transaction.
  const deployment = await createUnprovenDeployTxFromVerifierKeys(
    artifacts,
    coinPublicKey,
    {
      compiledContract,
      signingKey: sampleSigningKey(),
      initialPrivateState: {},
      args: [adminKey, scope],
    },
    encryptionPublicKey,
  );

  // This is deliberately constructed through the protocol/indexer ledger
  // export, just as indexerPublicDataProvider does after deserialization.  If
  // SDK code and the indexer protocol resolve different ledger-v8 instances,
  // the real partitionTranscripts call rejects it with "expected instance of
  // LedgerParameters".  A single deduped ledger-v8@8.1.0 instance is required.
  const indexerLedgerParameters = LedgerParameters.deserialize(
    LedgerParameters.initialParameters().serialize(),
  );

  const call = await createUnprovenCallTxFromInitialStates(
    artifacts,
    {
      compiledContract,
      circuitId: 'getCounterValue' as CircuitId,
      contractAddress: deployment.public.contractAddress,
      coinPublicKey,
      initialContractState: deployment.public.initialContractState,
      initialZswapChainState: new ZswapChainState(),
      ledgerParameters: indexerLedgerParameters,
      initialPrivateState: {},
      args: [],
    },
    encryptionPublicKey,
  );

  assert.equal(call.private.result, 0n);
  assert.equal(call.public.partitionedTranscript.length, 2);
  assert.ok(
    call.public.partitionedTranscript[0] !== undefined ||
      call.public.partitionedTranscript[1] !== undefined,
    'the SDK must invoke ledger-v8 partitionTranscripts for the circuit transcript',
  );
  assert.ok(call.private.unprovenTx, 'an unproven transaction must be assembled locally');
});
