import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { QuestSimulator } from './simulator.js';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const sessions = new Map();
const sessionLifetime = 60 * 60 * 1000;
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/manus-routes.json': ['manus-routes.json', 'application/json'],
};

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function input(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf8');
    if (body.length > 2048) throw new Error('INPUT_TOO_LARGE');
  }
  const value = JSON.parse(body || '{}');
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('INVALID_INPUT');
  return value;
}

function collectExpired() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.touched > sessionLifetime) sessions.delete(key);
  }
}

export function createDemoServer() {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (req.method === 'GET' && files[path]) {
        const [file, contentType] = files[path];
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(await readFile(join(root, file)));
        return;
      }
      if (req.method === 'GET' && path === '/health') {
        send(res, 200, { status: 'ok', mode: 'local-simulator' });
        return;
      }
      if (req.method === 'POST' && path === '/api/session') {
        collectExpired();
        if (sessions.size >= 64) {
          send(res, 503, { error: '使用中のデモが多いため、しばらく待ってください。' });
          return;
        }
        const sessionId = randomBytes(32).toString('hex');
        const simulator = new QuestSimulator();
        sessions.set(sessionId, { simulator, touched: Date.now() });
        send(res, 201, { sessionId, state: simulator.snapshot() });
        return;
      }
      if (!path.startsWith('/api/')) {
        send(res, 404, { error: 'ページがありません。' });
        return;
      }
      collectExpired();
      const token = req.headers['x-demo-session'];
      const session = typeof token === 'string' ? sessions.get(token) : null;
      if (!session) {
        send(res, 401, { error: 'デモを最初から開始してください。' });
        return;
      }
      session.touched = Date.now();
      if (req.method === 'GET' && path === '/api/state') {
        send(res, 200, session.simulator.snapshot());
        return;
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'この操作は利用できません。' });
        return;
      }
      const body = await input(req);
      if (path === '/api/record') send(res, 200, session.simulator.record());
      else if (path === '/api/condition') send(res, 200, session.simulator.setCondition(body));
      else if (path === '/api/respond') send(res, 200, session.simulator.respond(body));
      else if (path === '/api/reset') {
        session.simulator = new QuestSimulator();
        send(res, 200, session.simulator.snapshot());
      } else send(res, 404, { error: '操作がありません。' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const messages = {
        INVALID_CHALLENGE: 'challengeは64桁の16進数で入力してください。',
        INVALID_CONDITION: '条件のquestIdを選択してください。',
        CONDITION_REQUIRED: '先に依頼者が条件を出してください。',
        INVALID_INPUT: '入力の形式が合いません。',
        INPUT_TOO_LARGE: '入力が長すぎます。',
      };
      // Do not log raw runtime exceptions: they can contain witness values.
      const known = messages[code] || (error instanceof SyntaxError ? '入力の形式が合いません。' : null);
      send(res, known ? 400 : 500, { error: known || '回路実行に失敗しました。デモを再開始してください。' });
    }
  });
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createDemoServer();
  server.listen(port, host, () => {
    console.log(`Refacton local simulator listening on ${host}:${port}`);
  });
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
