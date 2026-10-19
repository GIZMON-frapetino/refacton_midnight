import { describe, test, expect, beforeEach } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { Contract, ledger, pureCircuits } from '../compiled/contract/index.js';
import { authorizationFor, commitmentFor, nullifierFor, recordWitnesses } from '../contract/witnesses.js';
import { createConstructorContext, createCircuitContext, dummyContractAddress, DUMMY_ADDRESS } from '@midnight-ntwrk/compact-runtime';

const bytes32 = () => new Uint8Array(randomBytes(32));
const material = () => ({ questId: bytes32(), version: 1n, userSecret: bytes32(), localSecretKey: bytes32(), salt: bytes32() });

describe('Registered issuer authorization', () => {
  let c, ctx, data, auth, scope, issuerKey;
  const state = () => ledger(ctx.currentQueryContext.state);
  function call(name, ...args) { const result = c.circuits[name](ctx, ...args); ctx = result.context; return result; }
  function register() { return call('registerIssuer', issuerKey); }
  function authorize() { register(); return call('authorizeRecord'); }
  function recordState() { return [state().commitments.root(), state().counter, [...state().nullifiers]]; }
  beforeEach(() => {
    data = material(); auth = { adminSecret: bytes32(), issuerSecret: bytes32() }; scope = bytes32();
    issuerKey = pureCircuits.deriveIssuerKey(auth.issuerSecret);
    c = new Contract(recordWitnesses(data, auth));
    const initial = c.initialState(createConstructorContext({}), pureCircuits.deriveAdminKey(auth.adminSecret), scope);
    ctx = createCircuitContext(dummyContractAddress(), DUMMY_ADDRESS, initial.currentContractState, {});
  });
  test('a registered issuer can authorize and the exact record is accepted', () => {
    authorize(); call('recordQuest');
    expect(state().counter).toBe(1n);
    expect(state().recordAuthorizations.member(authorizationFor(data, scope))).toBe(true);
  });
  test('unknown issuer cannot authorize a record', () => {
    register(); c.witnesses = recordWitnesses(data, { ...auth, issuerSecret: bytes32() });
    expect(() => call('authorizeRecord')).toThrow('Issuer is not registered');
    expect(state().recordAuthorizations.size()).toBe(0n);
    expect(state().counter).toBe(0n);
  });
  test('knowledge of a public registered key alone cannot authorize', () => {
    register(); c.witnesses = recordWitnesses(data, { ...auth, issuerSecret: issuerKey });
    expect(() => call('authorizeRecord')).toThrow('Issuer is not registered');
  });
  test('unapproved users cannot self-register', () => {
    c.witnesses = recordWitnesses(data, { ...auth, adminSecret: bytes32() });
    expect(() => register()).toThrow('Administrator authorization failed');
    expect(state().issuerKeys.size()).toBe(0n);
  });
  test('public administrator identifier is not its secret', () => {
    c.witnesses = recordWitnesses(data, { ...auth, adminSecret: state().issuerAdmin });
    expect(() => register()).toThrow('Administrator authorization failed');
  });
  test('registration rejects zero and duplicate issuer keys', () => {
    expect(() => call('registerIssuer', new Uint8Array(32))).toThrow('Invalid issuer key');
    register(); expect(() => register()).toThrow('Issuer already registered');
  });
  test('registered issuer alone is insufficient: record needs exact approval', () => {
    register(); const before = recordState();
    expect(() => call('recordQuest')).toThrow('Record lacks issuer authorization');
    expect(recordState()).toEqual(before);
  });
  test('changing quest, secret, salt, version or local key invalidates approval', () => {
    authorize(); const before = recordState();
    for (const changes of [{ questId: bytes32() }, { userSecret: bytes32() }, { salt: bytes32() }, { version: 2n }, { localSecretKey: bytes32() }]) {
      c.witnesses = recordWitnesses({ ...data, ...changes }, auth);
      expect(() => call('recordQuest')).toThrow('Record lacks issuer authorization');
      expect(recordState()).toEqual(before);
    }
  });
  test('authorized record still cannot be registered twice', () => {
    authorize(); call('recordQuest');
    expect(() => call('recordQuest')).toThrow('Quest already recorded by this user');
    expect(state().counter).toBe(1n);
  });
  test('approval is scoped to the deployment setup', () => {
    authorize();
    expect(state().recordAuthorizations.member(authorizationFor(data, bytes32()))).toBe(false);
  });
  test('issuer approves hashes without needing the recipient secret material', () => {
    register();
    c.witnesses = {
      ...recordWitnesses(material(), auth),
      authorizationQuestId: ({ privateState }) => [privateState, data.questId],
      authorizationCommitment: ({ privateState }) => [privateState, commitmentFor(data)],
      authorizationNullifier: ({ privateState }) => [privateState, nullifierFor(data)],
    };
    call('authorizeRecord'); c.witnesses = recordWitnesses(data);
    call('recordQuest');
    expect(state().counter).toBe(1n);
  });
  test('authorization actions expose identifiers/markers but not authority secrets', () => {
    const registered = register(); const authorized = call('authorizeRecord');
    const publicData = JSON.stringify([registered.proofData.publicTranscript, authorized.proofData.publicTranscript], (_, value) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value);
    for (const hidden of [auth.adminSecret, auth.issuerSecret, data.questId, data.userSecret, data.salt]) {
      expect(publicData).not.toContain(Buffer.from(hidden).toString('hex'));
    }
    expect(publicData).toContain(Buffer.from(issuerKey).toString('hex'));
    expect(publicData).toContain(Buffer.from(authorizationFor(data, scope)).toString('hex'));
  });
});
