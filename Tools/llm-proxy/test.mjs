// Proxy test without a real API key: a local stand-in for the Messages API records what the proxy sends.
// Checks: access tokens, the key stays on the server, model/effort/fallbacks, refusal handling, rate limit, CORS,
// and the game's own proxy provider (Web/js/ai/llm.js) talking to this server end to end.
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const seen = []; let mode = 'text';
const upstream = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  seen.push({ url: req.url, headers: req.headers, body: JSON.parse(b || '{}') });
  const content = mode === 'refusal' ? [] : [{ type: 'text', text: '{"ok":true,"answer":"связь"}' }];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn', stop_details: mode === 'refusal' ? { type: 'refusal', category: null, explanation: 'test' } : null, usage: { input_tokens: 120, output_tokens: 30 } }));
}); }).listen(0);
await new Promise(r => upstream.on('listening', r));
const up = 'http://127.0.0.1:' + upstream.address().port, PORT = 18787;
const proxy = spawn(process.execPath, [path.join(here, 'server.mjs')], { env: Object.assign({}, process.env, { ANTHROPIC_BASE_URL: up, ANTHROPIC_API_KEY: 'sk-test-server-only', ANTHROPIC_AUTH_TOKEN: '', SCP_PROXY_TOKENS: 'player-token-1', SCP_PER_MINUTE: '4', PORT: String(PORT), SCP_ORIGINS: 'https://appassets.androidplatform.net' }), stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => { proxy.stdout.on('data', d => { if (/proxy on/.test(d)) r(); }); setTimeout(r, 3000); });
const call = (tok, body, origin) => fetch('http://127.0.0.1:' + PORT + '/v1/complete', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}, origin ? { Origin: origin } : {}), body: JSON.stringify(body) });
try {
  let r = await call(null, { user: 'x' }); ok(r.status === 401, 'без токена доступа — 401');
  r = await call('wrong-token', { user: 'x' }); ok(r.status === 401, 'чужой токен — 401');
  r = await call('player-token-1', { kind: 'dialogue', system: 'sys', user: '<DATA>{}</DATA>', tier: 'default' }, 'https://appassets.androidplatform.net');
  const j = await r.json(); ok(r.status === 200 && j.text.includes('"ok":true') && j.usage.output_tokens === 30, 'ответ модели проходит через сервер: ' + j.text);
  ok(r.headers.get('access-control-allow-origin') === 'https://appassets.androidplatform.net', 'CORS для приложения');
  const s = seen[seen.length - 1];
  ok(s.headers['x-api-key'] === 'sk-test-server-only' || s.headers.authorization === 'Bearer sk-test-server-only', 'ключ API подставляет только сервер из своего окружения (в приложении его нет)');
  ok(s.body.model === 'claude-opus-5-5' && s.body.output_config.effort === 'medium' && s.body.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(s.headers['anthropic-beta'] || ''), 'модель, effort и серверный резерв при отказе: ' + s.body.model + ', ' + s.body.output_config.effort);
  r = await call('player-token-1', { user: 'q', tier: 'quick' }); await r.json(); ok(seen[seen.length - 1].body.output_config.effort === 'low', 'быстрые запросы — низкий effort');
  mode = 'refusal'; r = await call('player-token-1', { user: 'q' }); const jr = await r.json(); ok(jr.refusal === true && jr.text === null, 'отказ модели передаётся как отказ, без выдуманного текста'); mode = 'text';
  r = await call('player-token-1', { user: 'q' }); ok(r.status === 200, '4-й запрос в минуту ещё разрешён'); await r.json();
  r = await call('player-token-1', { user: 'q' }); ok(r.status === 429, '5-й запрос в минуту — 429 (лимит 4)');
  // the game's proxy provider (Web/js/ai/llm.js) against this server
  globalThis.window = globalThis; vm.runInThisContext(fs.readFileSync(path.join(here, '../../Web/js/ai/llm.js'), 'utf8'));
  const LLM = globalThis.SCP.LLM; LLM.cfg.proxyUrl = 'http://127.0.0.1:' + PORT; LLM.cfg.proxyToken = 'player-token-1'; LLM.cfg.provider = 'proxy';
  await new Promise(r => setTimeout(r, 61000)); // let the per-minute window pass
  const t = await LLM.test(); ok(t.ok && t.provider === 'proxy' && t.json.ok === true, 'игровой провайдер «Сервер ИИ» получил ответ через прокси');
} finally { proxy.kill(); upstream.close(); }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
