const $ = (id) => document.getElementById(id);
let token = null;
let state = null;
let busy = false;
const statuses = {
  recorded: '記録を登録しました',
  duplicate: 'nullifierが同じため二重登録を拒否',
  match: '条件に合う',
  no_match: '合わない',
};

async function api(path, body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Demo-Session'] = token;
  const response = await fetch(path, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作を完了できませんでした。');
  return data;
}

function buttons() {
  const ready = Boolean(state) && !busy;
  const dirty = Boolean(state?.condition) && (
    $('quest-choice').value !== state.condition.questChoice ||
    $('challenge').value.toLowerCase() !== state.condition.challenge
  );
  $('record').disabled = !ready;
  $('condition-submit').disabled = !ready;
  $('new-challenge').disabled = !ready || !state.condition;
  $('reset').disabled = busy;
  $('respond').disabled = !ready || !state.condition || dirty;
  $('wrong-secret').disabled = !ready || !state.condition || dirty;
  $('duplicate').disabled = !ready || state.counter === '0';
  $('condition-state').textContent = dirty ? '入力が変わりました。条件を出し直してください' : (
    state?.condition ? '提示済みの条件に応答します' : '先に条件を出してください'
  );
}

function hashes(id, values) {
  const element = $(id);
  element.classList.toggle('empty', !values.length);
  element.replaceChildren();
  if (!values.length) {
    element.textContent = 'まだ記録がありません';
    return;
  }
  for (const value of values) {
    const line = document.createElement('div');
    line.textContent = value;
    element.append(line);
  }
}

function render(next, refreshChallenge = false) {
  state = next;
  $('counter').textContent = state.counter;
  hashes('commitments', state.commitments);
  hashes('nullifiers', state.nullifiers);
  $('ledger-status').textContent = state.counter === '0' ? '未登録' : '回路から登録済み';
  $('record-result').textContent = state.recordOutcome ? statuses[state.recordOutcome] : 'まだ登録していません';
  $('record-result').className = state.recordOutcome || '';
  $('outcome').textContent = state.outcome ? statuses[state.outcome] : '応答を待っています';
  $('requester-result').className = `requester-result ${state.outcome || ''}`;
  $('outcome-note').textContent = state.outcome === 'no_match'
    ? 'Attestation not foundで回路が停止しました。台帳への記録はありません。'
    : '回路が正常に終了したかを受けて表示します。';
  const latestCheck = state.events.find((event) => event.circuit === 'checkAttestation');
  const disclosed = state.outcome === 'match' && latestCheck?.status === 'match'
    ? latestCheck.commitment : null;
  hashes('disclosed-commitment', disclosed ? [disclosed] : []);
  if (disclosed) {
    $('disclosure-note').textContent = state.commitments.includes(disclosed)
      ? '上の「記録の指紋」と同じ値です。確認時の公開参照で、台帳への追加項目ではありません。'
      : '確認時に公開参照した指紋です。';
  } else {
    $('disclosed-commitment').textContent = state.outcome === 'no_match'
      ? 'この確認はエラーで停止しました。開示は成立していません。'
      : 'まだ確認していません';
    $('disclosure-note').textContent = '確認時の公開参照であり、台帳に追加される項目ではありません。';
  }
  $('condition-state').textContent = state.condition ? '提示済みの条件に応答します' : '先に条件を出してください';
  $('condition-details').hidden = !state.condition;
  if (state.condition) {
    $('public-quest').textContent = state.condition.questId;
    $('public-challenge').textContent = state.condition.challenge;
  }
  if (refreshChallenge || !$('challenge').value) $('challenge').value = state.nextChallenge;
  $('step-record').classList.toggle('active', state.counter === '0');
  $('step-condition').classList.toggle('active', state.counter !== '0' && !state.condition);
  $('step-respond').classList.toggle('active', Boolean(state.condition));
  $('events').replaceChildren();
  if (!state.events.length) {
    const empty = document.createElement('li');
    empty.className = 'no-events';
    empty.textContent = '回路を呼ぶと、サーバーが回路名と時刻をここに記録します。';
    $('events').append(empty);
  }
  for (const event of state.events) {
    const item = document.createElement('li');
    const main = document.createElement('div');
    main.className = 'event-main';
    const circuit = document.createElement('code');
    circuit.textContent = event.circuit;
    const status = document.createElement('span');
    status.textContent = statuses[event.status];
    if (['duplicate', 'no_match'].includes(event.status)) status.className = 'failure';
    const time = document.createElement('time');
    time.dateTime = event.time;
    time.textContent = new Date(event.time).toLocaleTimeString('ja-JP', { hour12: false });
    main.append(circuit, status, time);
    item.append(main);
    $('events').append(item);
  }
  buttons();
}

async function run(action) {
  if (busy) return;
  busy = true;
  document.body.classList.add('busy');
  $('error').hidden = true;
  buttons();
  try {
    await action();
  } catch (error) {
    $('error').textContent = error.message || '操作を完了できませんでした。';
    $('error').hidden = false;
  } finally {
    busy = false;
    document.body.classList.remove('busy');
    buttons();
  }
}

$('record').addEventListener('click', () => run(async () => render(await api('/api/record'))));
$('duplicate').addEventListener('click', () => run(async () => render(await api('/api/record'))));
$('condition-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const next = await api('/api/condition', {
      questChoice: $('quest-choice').value,
      challenge: $('challenge').value,
    });
    render(next);
  });
});
$('new-challenge').addEventListener('click', () => {
  $('challenge').value = state.nextChallenge;
  buttons();
});
$('challenge').addEventListener('input', buttons);
$('quest-choice').addEventListener('change', buttons);
$('respond').addEventListener('click', () => run(async () => render(await api('/api/respond', { wrongSecret: false }))));
$('wrong-secret').addEventListener('click', () => run(async () => render(await api('/api/respond', { wrongSecret: true }))));
$('reset').addEventListener('click', () => run(async () => {
  if (!token) await initialize();
  else render(await api('/api/reset'), true);
  $('quest-choice').value = 'recorded';
  $('condition-details').open = false;
}));

async function initialize() {
  const session = await api('/api/session');
  token = session.sessionId;
  render(session.state, true);
}
run(initialize);
