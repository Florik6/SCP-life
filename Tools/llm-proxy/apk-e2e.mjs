// End-to-end check of the APK set-up without a real key: the bundled game page (exactly what goes into the APK) with
// the AI server injected at build time talks to this proxy, which talks to a local stand-in for the Messages API.
// Run: node Tools/llm-proxy/apk-e2e.mjs   (needs Playwright with the preinstalled Chromium and python3)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..'), require = createRequire(import.meta.url);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
// 1. stand-in for the Messages API
const upstream = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: '{"ok":true,"answer":"связь есть"}' }], stop_reason: 'end_turn', usage: { input_tokens: 40, output_tokens: 12 } })); }); });
const upPort = await listen(upstream);
// 2. the game bundle as the APK gets it, with the AI server injected
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-apk-')), three = [process.env.THREE_JS, path.join(root, 'android', 'build', 'three-0.128.0.min.js'), '/tmp/threejs/package/build/three.min.js'].find(f => f && fs.existsSync(f));
const web = http.createServer((q, s) => { const p = path.join(out, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(out) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
const webPort = await listen(web);
const PORT = 18877, proxy = spawn(process.execPath, [path.join(here, 'server.mjs')], { env: Object.assign({}, process.env, { ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + upPort, ANTHROPIC_API_KEY: 'sk-test-server-only', ANTHROPIC_AUTH_TOKEN: '', SCP_PROXY_TOKENS: 'apk-token-1', SCP_ORIGINS: 'http://localhost:' + webPort, PORT: String(PORT) }) });
await new Promise(r => { proxy.stdout.on('data', d => { if (/proxy on/.test(d)) r(); }); setTimeout(r, 4000); });
let browser;
try {
  execFileSync('python3', ['-I', path.join(root, 'Tools', 'bundle_web.py'), path.join(out, 'index.html')].concat(three ? [three] : []), { stdio: 'pipe' });
  const inj = execFileSync('python3', ['-I', path.join(root, 'Tools', 'inject_ai_config.py'), path.join(out, 'index.html')], { env: Object.assign({}, process.env, { SCP_AI_URL: 'http://localhost:' + PORT, SCP_AI_TOKEN: 'apk-token-1' }) }).toString();
  ok(/APK uses the AI server/.test(inj), 'адрес сервера и токен доступа вписаны в сборку APK');
  ok(!/sk-test-server-only/.test(fs.readFileSync(path.join(out, 'index.html'), 'utf8')), 'ключ API в сборку не попал (он только на сервере)');
  const { chromium } = require('playwright'); browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:' + webPort + '/index.html'); await page.waitForFunction(() => window.SCP && window.SCP.LLM, null, { timeout: 30000 });
  const st = await page.evaluate(() => { const L = window.SCP.LLM, s = L.status(); return { url: L.cfg.proxyUrl, builtIn: L.cfg.builtIn, provider: s.provider, background: s.background }; });
  ok(st.url === 'http://localhost:' + PORT && st.builtIn, 'игра в APK сразу знает сервер ИИ: ' + st.url);
  ok(st.provider === 'Сервер ИИ' && st.background, 'источник — «Сервер ИИ», фоновые решения разумов разрешены без ручной настройки');
  const t = await page.evaluate(async () => { const r = await window.SCP.LLM.test(); return { ok: r.ok, provider: r.provider, json: r.json, reason: r.reason }; });
  ok(t.ok && t.provider === 'proxy' && t.json && t.json.ok === true, 'страница APK получила ответ модели через сервер: ' + JSON.stringify(t.json || t.reason));
  ok(!errors.length, 'ошибок на странице нет' + (errors.length ? ': ' + errors.slice(0, 3).join('; ') : ''));
} catch (e) { ok(false, 'исключение: ' + e.message); }
finally { if (browser) await browser.close(); proxy.kill(); upstream.close(); web.close(); fs.rmSync(out, { recursive: true, force: true }); }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
