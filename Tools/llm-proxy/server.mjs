// SCP LIFE — protected LLM proxy.
// The game (APK or browser) never holds the Anthropic API key: it sends a structured request with an access token issued by
// the owner of this server; the server checks the token, rate limits and the daily budget, calls Claude and returns the text.
//
//   ANTHROPIC_API_KEY=...            the API key (only here, never in the app)
//   SCP_PROXY_TOKENS=tok1,tok2       access tokens the server owner gives to players (required)
//   SCP_MODEL=claude-opus-5-5        model for regular requests (default claude-opus-5-5)
//   SCP_MODEL_QUICK=...              model for quick requests (default: same as SCP_MODEL; e.g. claude-haiku-5-5 to save cost)
//   SCP_PER_MINUTE=12  SCP_PER_DAY=600  SCP_DAILY_TOKENS=400000   limits per token
//   SCP_ORIGINS=https://appassets.androidplatform.net,http://localhost:8000   allowed browser origins (CORS)
//   PORT=8787
import http from 'node:http';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

const env = process.env;
const TOKENS = (env.SCP_PROXY_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
const MODEL = env.SCP_MODEL || 'claude-opus-5-5', MODEL_QUICK = env.SCP_MODEL_QUICK || MODEL;
const PER_MIN = +env.SCP_PER_MINUTE || 12, PER_DAY = +env.SCP_PER_DAY || 600, DAILY_TOKENS = +env.SCP_DAILY_TOKENS || 400000;
const ORIGINS = (env.SCP_ORIGINS || 'https://appassets.androidplatform.net,http://localhost:8000').split(',').map(s => s.trim());
const PORT = +env.PORT || 8787;
if (!TOKENS.length) { console.error('SCP_PROXY_TOKENS is empty: refusing to start an open proxy'); process.exit(1); }

const client = new Anthropic(); // credentials from the environment (ANTHROPIC_API_KEY)
const usage = new Map(); // token -> { day, minute: [timestamps], requests, tokens }

const tokenOk = t => TOKENS.some(x => x.length === t.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(t)));
function limit(tok) {
  const day = new Date().toISOString().slice(0, 10), now = Date.now();
  let u = usage.get(tok); if (!u || u.day !== day) { u = { day, minute: [], requests: 0, tokens: 0 }; usage.set(tok, u); }
  u.minute = u.minute.filter(t => now - t < 60000);
  if (u.minute.length >= PER_MIN || u.requests >= PER_DAY || u.tokens >= DAILY_TOKENS) return null;
  u.minute.push(now); u.requests++; return u;
}
function send(res, status, obj, origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' });
  res.writeHead(status, h); res.end(JSON.stringify(obj));
}
function readBody(req, max) {
  return new Promise((resolve, reject) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > max) { reject(new Error('too large')); req.destroy(); } else parts.push(c); }); req.on('end', () => resolve(Buffer.concat(parts).toString('utf8'))); req.on('error', reject); });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    const h = { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' };
    if (origin && ORIGINS.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' });
    res.writeHead(204, h); return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: MODEL, quick: MODEL_QUICK }, origin);
  if (req.method !== 'POST' || req.url !== '/v1/complete') return send(res, 404, { error: 'not_found' }, origin);
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tok || !tokenOk(tok)) return send(res, 401, { error: 'unauthorized' }, origin);
  const u = limit(tok); if (!u) return send(res, 429, { error: 'rate_limited' }, origin);
  let body; try { body = JSON.parse(await readBody(req, 96 * 1024)); } catch (e) { return send(res, 400, { error: 'bad_request' }, origin); }
  const system = typeof body.system === 'string' ? body.system.slice(0, 8000) : '', user = typeof body.user === 'string' ? body.user.slice(0, 32000) : '';
  if (!user) return send(res, 400, { error: 'empty' }, origin);
  const quick = body.tier === 'quick';
  try {
    const params = {
      model: quick ? MODEL_QUICK : MODEL,
      max_tokens: 8000, // room for adaptive thinking plus a short JSON answer
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: quick ? 'low' : 'medium' }
    };
    // server-side fallback on a policy decline (supported on Claude Opus 5.5 / Sonnet 5.5 / Fable)
    if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(params.model)) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    const r = params.betas ? await client.beta.messages.create(params) : await client.messages.create(params);
    const inTok = (r.usage && r.usage.input_tokens) || 0, outTok = (r.usage && r.usage.output_tokens) || 0; u.tokens += inTok + outTok;
    if (r.stop_reason === 'refusal') return send(res, 200, { text: null, refusal: true, category: r.stop_details ? r.stop_details.category : null, usage: { input_tokens: inTok, output_tokens: outTok } }, origin);
    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log(new Date().toISOString(), body.kind || '-', r.model, r.stop_reason, inTok + '/' + outTok);
    return send(res, 200, { text, model: r.model, stop_reason: r.stop_reason, usage: { input_tokens: inTok, output_tokens: outTok } }, origin);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'upstream_rate_limited' }, origin);
    if (e instanceof Anthropic.AuthenticationError) { console.error('upstream authentication failed: check ANTHROPIC_API_KEY'); return send(res, 502, { error: 'upstream_auth' }, origin); }
    if (e instanceof Anthropic.BadRequestError) { console.error('upstream rejected the request:', e.message); return send(res, 502, { error: 'upstream_bad_request' }, origin); }
    if (e instanceof Anthropic.APIError) { console.error('upstream error', e.status); return send(res, 502, { error: 'upstream_error' }, origin); }
    console.error('proxy error', e && e.message); return send(res, 500, { error: 'proxy_error' }, origin);
  }
});
server.listen(PORT, () => console.log('SCP LIFE LLM proxy on :' + PORT + ', model ' + MODEL + (MODEL_QUICK !== MODEL ? ' / quick ' + MODEL_QUICK : '')));
export default server;
