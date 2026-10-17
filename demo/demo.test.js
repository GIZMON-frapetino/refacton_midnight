import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestSimulator } from './simulator.js';
import { createDemoServer } from './server.js';

const setCondition = (sim, questChoice = 'recorded') => sim.setCondition({
  questChoice,
  challenge: sim.snapshot().nextChallenge,
});

test('recordQuest changes actual ledger commitments, nullifiers and counter', () => {
  const sim = new QuestSimulator();
  assert.equal(sim.snapshot().counter, '0');
  const state = sim.record();
  assert.equal(state.counter, '1');
  assert.equal(state.commitments.length, 1);
  assert.equal(state.nullifiers.length, 1);
  assert.match(state.commitments[0], /^[a-f0-9]{64}$/);
  assert.match(state.nullifiers[0], /^[a-f0-9]{64}$/);
  assert.equal(state.events[0].circuit, 'recordQuest');
});

test('duplicate record is refused by the existing circuit with ledger unchanged', () => {
  const sim = new QuestSimulator();
  const before = sim.record();
  const after = sim.record();
  assert.equal(after.recordOutcome, 'duplicate');
  assert.equal(after.counter, '1');
  assert.deepEqual(after.commitments, before.commitments);
  assert.deepEqual(after.nullifiers, before.nullifiers);
  assert.equal(after.events[0].circuit, 'recordQuest');
});

test('checkAttestation succeeds and wrong secret fails without ledger changes', () => {
  const sim = new QuestSimulator();
  const before = sim.record();
  setCondition(sim);
  assert.equal(sim.respond().outcome, 'match');
  const wrong = sim.respond({ wrongSecret: true });
  assert.equal(wrong.outcome, 'no_match');
  assert.equal(wrong.counter, before.counter);
  assert.deepEqual(wrong.commitments, before.commitments);
  assert.deepEqual(wrong.nullifiers, before.nullifiers);
  assert.equal(sim.respond().outcome, 'match');
});

test('wrong quest and an unrecorded quest fail in the actual circuit', () => {
  const sim = new QuestSimulator();
  setCondition(sim);
  assert.equal(sim.respond().outcome, 'no_match');
  sim.record();
  setCondition(sim, 'other');
  assert.equal(sim.respond().outcome, 'no_match');
});

test('repeated checks disclose the same existing commitment in the demo log', () => {
  const sim = new QuestSimulator();
  const registered = sim.record();
  const first = setCondition(sim).condition.challenge;
  sim.respond();
  const second = setCondition(sim).condition.challenge;
  const next = sim.respond();
  assert.notEqual(first, second);
  const checks = next.events.filter((event) => event.circuit === 'checkAttestation');
  assert.equal(checks.length, 2);
  assert.equal(checks[0].commitment, registered.commitments[0]);
  assert.equal(checks[1].commitment, registered.commitments[0]);
});

test('invalid conditions and missing condition never become a match', () => {
  const sim = new QuestSimulator();
  assert.throws(() => sim.respond(), /CONDITION_REQUIRED/);
  assert.throws(() => sim.setCondition({ challenge: 'bad' }), /INVALID_CHALLENGE/);
  assert.equal(sim.snapshot().condition, null);
  assert.equal(sim.snapshot().outcome, null);
});

test('HTTP API runs circuits, isolates sessions, keeps private values out and resets', async () => {
  const server = createDemoServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const request = async (path, token, body, method = 'POST') => {
      const response = await fetch(origin + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Demo-Session': token } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      });
      return { status: response.status, data: await response.json() };
    };
    const session = await request('/api/session');
    const other = await request('/api/session');
    const token = session.data.sessionId;
    assert.equal(session.status, 201);
    assert.notEqual(token, other.data.sessionId);
    assert.equal((await request('/api/record')).status, 401);
    assert.equal((await request('/api/respond', token)).status, 400);
    const record = await request('/api/record', token);
    assert.equal(record.data.counter, '1');
    const condition = await request('/api/condition', token, {
      questChoice: 'recorded',
      challenge: record.data.nextChallenge,
    });
    assert.equal(condition.status, 200);
    assert.equal((await request('/api/respond', token)).data.outcome, 'match');
    const wrong = await request('/api/respond', token, { wrongSecret: true });
    assert.equal(wrong.data.outcome, 'no_match');
    assert.equal((await request('/api/record', token)).data.recordOutcome, 'duplicate');
    const state = (await request('/api/state', other.data.sessionId, {}, 'GET')).data;
    assert.equal(state.counter, '0');
    const encoded = JSON.stringify(wrong.data);
    for (const key of ['userSecret', 'localSecretKey', 'saltValue', 'privateState', 'privateTranscriptOutputs', 'response']) {
      assert.equal(encoded.includes(`"${key}"`), false, `HTTP contains ${key}`);
    }
    const reset = await request('/api/reset', token);
    assert.equal(reset.data.counter, '0');
    assert.deepEqual(reset.data.events, []);
    const routes = await fetch(origin + '/manus-routes.json');
    assert.equal(routes.status, 200);
    assert.deepEqual((await routes.json()).routes.map((r) => r.path), ['/']);
    const page = await fetch(origin + '/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /ローカルシミュレーター上で実行中（Preprod未配備）/);
    for (const text of ['記録時のみ非公開', '台帳の中身', 'デモの記録', 'サーバーの記録', '二重登録の防止印', 'この確認で開示された指紋', 'モック']) {
      assert.ok(html.includes(text), `Missing UI label: ${text}`);
    }
    assert.ok(html.includes('同じ記録への確認どうしは結び付く（この実装の限界、Wave 3で対応）'));
    const missing = await fetch(origin + '/not-an-asset');
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
