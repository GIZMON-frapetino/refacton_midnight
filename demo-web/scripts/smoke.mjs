import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { bytesToHex, hexToBytes } from '../src/lib/bytes.js';
import { ContractSimulator, createSellerWitnesses, exportMaterial, ledgerSnapshot } from '../src/lib/simulator.js';
import { checkSession, recordSession, simulatorFromSession, validateSession } from '../src/lib/session.js';

const bytes32 = () => new Uint8Array(randomBytes(32));
const changeHex = (hex) => (hex.startsWith('00') ? '01' : '00') + hex.slice(2);
const clone = (value) => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, run) {
  run();
  count++;
  console.log(`  ok ${count}: ${name}`);
}

const material = {
  questId: bytes32(), version: 1n, userSecret: bytes32(), localSecretKey: bytes32(), salt: bytes32(),
};
const pending = { ...exportMaterial(material), recorded: false };
const recorded = recordSession(pending);
const challenge = bytesToHex(bytes32());
const match = () => checkSession(recorded, recorded.questIdHex, challenge);

console.log('demo-web regression checks');
test('initial ledger is empty', () => {
  const snapshot = ledgerSnapshot(new ContractSimulator(createSellerWitnesses(material)));
  assert.equal(snapshot.counter, '0');
  assert.equal(snapshot.commitmentCount, '0');
  assert.equal(snapshot.treeRoot.length, 64);
  assert.deepEqual(snapshot.nullifiers, []);
});
test('seller preserves quest id and material through completion', () => {
  for (const key of ['questIdHex', 'userSecretHex', 'localSecretKeyHex', 'saltHex', 'versionNum']) {
    assert.equal(recorded[key], pending[key]);
  }
  assert.equal(recorded.circuitOk, true);
});
test('recordQuest adds counter, commitment and nullifier', () => {
  assert.equal(recorded.ledger.counter, '1');
  assert.equal(recorded.ledger.commitmentCount, '1');
  assert.equal(recorded.ledger.nullifiers.length, 1);
  assert.equal(recorded.ledger.treeRoot.length, 64);
  assert.equal(recorded.ledger.nullifiers[0].length, 64);
});
test('JSON round trip restores the saved ledger', () => {
  const restored = validateSession(clone(recorded));
  assert.deepEqual(restored.ledger, recorded.ledger);
  assert.equal(restored.publicStateHex, recorded.publicStateHex);
});
test('duplicate recording is rejected against the saved ledger', () => {
  assert.throws(() => recordSession(recorded), /Quest already recorded by this user/);
});
test('correct secret matches without rewriting the ledger', () => {
  const before = clone(recorded);
  assert.equal(match().responseHex.length, 64);
  assert.deepEqual(match().ledger, recorded.ledger);
  assert.deepEqual(recorded, before);
});
test('different challenges yield different responses', () => {
  assert.notEqual(match().responseHex, checkSession(recorded, recorded.questIdHex, changeHex(challenge)).responseHex);
});
test('wrong quest id does not match', () => {
  assert.throws(() => checkSession(recorded, changeHex(recorded.questIdHex), challenge), /Attestation not found/);
});
test('negative-check control uses a different secret and does not match', () => {
  assert.throws(() => checkSession(recorded, recorded.questIdHex, challenge, true), /Attestation not found/);
  assert.equal(match().responseHex.length, 64);
});
test('imported changed secret cannot create a replacement ledger', () => {
  const changed = validateSession({ ...clone(recorded), userSecretHex: changeHex(recorded.userSecretHex) });
  assert.deepEqual(changed.ledger, recorded.ledger);
  assert.throws(() => checkSession(changed, changed.questIdHex, challenge), /Attestation not found/);
});
test('wrong salt and version do not match', () => {
  for (const changed of [
    { ...recorded, saltHex: changeHex(recorded.saltHex) },
    { ...recorded, versionNum: '2' },
  ]) {
    assert.throws(() => checkSession(changed, changed.questIdHex, challenge), /Attestation not found/);
  }
});
test('display-only imported ledger values are replaced with saved state values', () => {
  assert.deepEqual(validateSession({ ...recorded, ledger: { counter: '999' } }).ledger, recorded.ledger);
});
test('partial hex pairs and short inputs are rejected', () => {
  assert.throws(() => hexToBytes('0g'.repeat(32)), /Invalid hex/);
  assert.throws(() => hexToBytes('aa'), /Expected 32 bytes/);
  assert.throws(() => checkSession(recorded, recorded.questIdHex, '1g'.repeat(32)), /Invalid hex/);
});
test('missing or malformed session material is rejected', () => {
  for (const key of ['questIdHex', 'userSecretHex', 'localSecretKeyHex', 'saltHex', 'versionNum']) {
    const changed = clone(recorded);
    delete changed[key];
    assert.throws(() => validateSession(changed));
  }
  assert.throws(() => validateSession({ ...recorded, versionNum: '-1' }), /Invalid session version/);
  assert.throws(() => validateSession({ ...recorded, versionNum: '18446744073709551616' }), /Invalid session version/);
  assert.throws(() => validateSession({ ...recorded, recorded: 'true' }), /Invalid session record flag/);
});
test('legacy and malformed saved state are rejected rather than re-recorded', () => {
  const legacy = clone(recorded);
  delete legacy.publicStateHex;
  assert.throws(() => validateSession(legacy), /no saved public ledger/);
  assert.throws(() => validateSession({ ...recorded, publicStateHex: 'gg' }), /Invalid saved public ledger/);
  assert.throws(() => validateSession({ ...recorded, publicStateHex: '00' }));
});
test('old Set ledger format is rejected', () => {
  assert.throws(() => validateSession({ ...recorded, format: 'quest-attestation-demo-session-v2' }), /Unsupported saved ledger format/);
});
test('pre-issuer Merkle ledger format is rejected', () => {
  assert.throws(() => validateSession({ ...recorded, format: 'quest-attestation-merkle-session-v3' }), /Unsupported saved ledger format/);
});
test('simulator record has one explicit sample issuer and authorization', () => {
  assert.equal(recorded.ledger.issuerKeys.length, 1);
  assert.equal(recorded.ledger.authorizationCount, '1');
});
test('unrecorded sessions cannot be checked', () => {
  assert.equal(validateSession(pending).recorded, false);
  assert.throws(() => simulatorFromSession(pending), /No seller record/);
});
test('read-only checks preserve ledger after reload', () => {
  const restored = validateSession(clone(recorded));
  const checked = checkSession(restored, restored.questIdHex, challenge);
  assert.equal(checked.responseHex, match().responseHex);
  assert.deepEqual(checked.ledger, recorded.ledger);
});
console.log(`smoke: ok (${count} regression checks)`);
