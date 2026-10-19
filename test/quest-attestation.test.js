import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { Contract, ledger, pureCircuits } from '../compiled/contract/index.js';
import { authorizationFor, commitmentFor, nullifierFor, recordWitnesses } from '../contract/witnesses.js';
import { createConstructorContext, createCircuitContext, dummyContractAddress, DUMMY_ADDRESS, valueToBigInt } from '@midnight-ntwrk/compact-runtime';

const bytes32 = () => new Uint8Array(randomBytes(32));
const material = () => ({ questId: bytes32(), version: 1n, userSecret: bytes32(), localSecretKey: bytes32(), salt: bytes32() });
const hex = (bytes) => Buffer.from(bytes).toString('hex');

function publicBytes(value, out = []) {
  if (value instanceof Uint8Array) out.push(hex(value));
  else if (Array.isArray(value)) value.forEach((item) => publicBytes(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => publicBytes(item, out));
  return out;
}

class Simulator {
  constructor(data) {
    this.authority = { adminSecret: bytes32(), issuerSecret: bytes32() };
    this.scope = bytes32();
    this.data = data;
    this.contract = new Contract(recordWitnesses(data, this.authority));
    const initial = this.contract.initialState(createConstructorContext({}), pureCircuits.deriveAdminKey(this.authority.adminSecret), this.scope);
    this.context = createCircuitContext(dummyContractAddress(), DUMMY_ADDRESS, initial.currentContractState, {});
  }
  call(name, ...args) {
    // Test fixture setup, not a bypass of the contract's issuer condition.
    if (name === 'recordQuest' && !this.state().nullifiers.member(nullifierFor(this.data))) {
      const key = pureCircuits.deriveIssuerKey(this.authority.issuerSecret);
      if (!this.state().issuerKeys.member(key)) this.call('registerIssuer', key);
      if (!this.state().recordAuthorizations.member(authorizationFor(this.data, this.scope))) this.call('authorizeRecord');
    }
    const result = this.contract.circuits[name](this.context, ...args);
    this.context = result.context;
    return result;
  }
  state() { return ledger(this.context.currentQueryContext.state); }
  use(data, extra = {}) { this.data = data; this.contract.witnesses = { ...recordWitnesses(data, this.authority), ...extra }; }
}

describe('QuestAttestation: current-root private membership', () => {
  let sim, alice, bob;
  beforeEach(() => { alice = material(); bob = material(); sim = new Simulator(alice); });

  test('initial tree, nullifiers and counter are empty', () => {
    expect(sim.state().counter).toBe(0n);
    expect(sim.state().commitments.firstFree()).toBe(0n);
    expect(sim.state().nullifiers.size()).toBe(0n);
  });
  test('registration inserts a leaf, nullifier and counter', () => {
    const result = sim.call('recordQuest');
    expect(result).toHaveProperty('proofData');
    expect(sim.state().counter).toBe(1n);
    expect(sim.state().commitments.firstFree()).toBe(1n);
    expect(sim.state().commitments.findPathForLeaf(commitmentFor(alice)).leaf).toEqual(commitmentFor(alice));
    expect(sim.state().nullifiers.member(nullifierFor(alice))).toBe(true);
  });
  test('multiple users can record the same quest', () => {
    bob.questId = alice.questId;
    sim.call('recordQuest'); sim.use(bob); sim.call('recordQuest');
    expect(sim.state().counter).toBe(2n);
    expect(sim.state().nullifiers.size()).toBe(2n);
  });
  test('one user can record different quests', () => {
    sim.call('recordQuest'); sim.use({ ...alice, questId: bob.questId }); sim.call('recordQuest');
    expect(sim.state().counter).toBe(2n);
  });
  test('duplicate registration is rejected', () => {
    sim.call('recordQuest');
    expect(() => sim.call('recordQuest')).toThrow('Quest already recorded by this user');
    expect(sim.state().counter).toBe(1n);
  });
  test('different salt and secret cannot bypass the same nullifier', () => {
    sim.call('recordQuest'); sim.use({ ...alice, salt: bob.salt, userSecret: bob.userSecret });
    expect(() => sim.call('recordQuest')).toThrow('Quest already recorded by this user');
  });
  test('valid membership path returns 32 bytes', () => {
    sim.call('recordQuest');
    expect(sim.call('checkAttestation', bytes32()).result).toHaveLength(32);
  });
  test('wrong secret fails membership lookup', () => {
    sim.call('recordQuest'); sim.use({ ...alice, userSecret: bob.userSecret });
    expect(() => sim.call('checkAttestation', bytes32())).toThrow('Attestation not found');
  });
  test('wrong quest ID, salt and version fail membership', () => {
    sim.call('recordQuest');
    for (const changes of [{ questId: bob.questId }, { salt: bob.salt }, { version: 2n }]) {
      sim.use({ ...alice, ...changes });
      expect(() => sim.call('checkAttestation', bytes32())).toThrow('Attestation not found');
    }
  });
  test('borrowing another record path fails leaf binding', () => {
    sim.call('recordQuest');
    const alicePath = sim.state().commitments.findPathForLeaf(commitmentFor(alice));
    sim.use(bob, { commitmentPath: ({ privateState }) => [privateState, alicePath] });
    expect(() => sim.call('checkAttestation', bytes32())).toThrow('Path is not for this record');
  });
  test('corrupt sibling fails root equality', () => {
    sim.call('recordQuest');
    const path = sim.state().commitments.findPathForLeaf(commitmentFor(alice));
    path.path[0].sibling = { field: path.path[0].sibling.field + 1n };
    sim.use(alice, { commitmentPath: ({ privateState }) => [privateState, path] });
    expect(() => sim.call('checkAttestation', bytes32())).toThrow('Attestation not found');
  });
  test('stale current-tree paths fail after insertion; fresh paths pass', () => {
    sim.call('recordQuest');
    const oldPath = sim.state().commitments.findPathForLeaf(commitmentFor(alice));
    sim.use(bob); sim.call('recordQuest');
    sim.use(alice, { commitmentPath: ({ privateState }) => [privateState, oldPath] });
    expect(() => sim.call('checkAttestation', bytes32())).toThrow('Attestation not found');
    sim.use(alice);
    expect(sim.call('checkAttestation', bytes32()).result).toHaveLength(32);
  });
  test('two challenges expose no shared record-specific identifier', () => {
    sim.call('recordQuest'); sim.use(bob); sim.call('recordQuest'); sim.use(alice);
    const one = sim.call('checkAttestation', bytes32());
    const two = sim.call('checkAttestation', bytes32());
    expect(one.result).not.toEqual(two.result);
    for (const result of [one, two]) {
      expect(result.proofData.input.value).toHaveLength(1);
      const transcript = result.proofData.publicTranscript;
      const pushes = transcript.filter((op) => op?.push);
      expect(pushes).toHaveLength(1);
      expect(pushes[0].push.value.content.alignment).toEqual([{ tag: 'atom', value: { tag: 'field' } }]);
      expect(valueToBigInt(pushes[0].push.value.content.value)).toBe(sim.state().commitments.root().field);
      const publicData = publicBytes({ input: result.proofData.input, output: result.proofData.output, transcript });
      for (const hidden of [commitmentFor(alice), nullifierFor(alice), alice.questId, alice.userSecret, alice.salt]) {
        expect(publicData).not.toContain(hex(hidden));
      }
    }
    // The root and structural query constants can repeat across any records.
    expect(one.proofData.publicTranscript).toEqual(two.proofData.publicTranscript);
  });
  test('reusing a challenge repeats its response and is documented as a risk', () => {
    sim.call('recordQuest'); const challenge = bytes32();
    expect(sim.call('checkAttestation', challenge).result).toEqual(sim.call('checkAttestation', challenge).result);
  });
  test('checks do not change root, nullifiers or counter', () => {
    sim.call('recordQuest');
    const before = [sim.state().commitments.root(), [...sim.state().nullifiers], sim.state().counter];
    sim.call('checkAttestation', bytes32());
    expect([sim.state().commitments.root(), [...sim.state().nullifiers], sim.state().counter]).toEqual(before);
  });
  test('hasNullifier returns true for the actual derived nullifier', () => {
    sim.call('recordQuest'); expect(sim.call('hasNullifier', nullifierFor(alice)).result).toBe(true);
  });
  test('hasNullifier returns false for an unused value', () => {
    expect(sim.call('hasNullifier', nullifierFor(alice)).result).toBe(false);
  });
  test('counter query reflects multiple registrations', () => {
    expect(sim.call('getCounterValue').result).toBe(0n);
    sim.call('recordQuest'); sim.use(bob); sim.call('recordQuest');
    expect(sim.call('getCounterValue').result).toBe(2n);
  });
  test('known leaf index can build a valid membership path', () => {
    sim.call('recordQuest');
    sim.use(alice, { commitmentPath: ({ ledger, privateState }, comm) => [privateState, ledger.commitments.pathForLeaf(0n, comm)] });
    expect(sim.call('checkAttestation', bytes32()).result).toHaveLength(32);
  });
  test('no public commitment-membership query remains', () => {
    expect(sim.contract.circuits.hasCommitment).toBeUndefined();
  });
});
