/* SCP LIFE — LLM gateway shared by all minds (SCP agents, NPC interviews, AI OVERSEER).
   - Providers: Claude through the artifact runtime (`claude.use("sample")`, only inside the claude.ai viewer, no keys anywhere),
     a protected proxy server the player runs (Tools/llm_proxy.mjs keeps the API key on the server; the app only knows its URL
     and an access token the server owner issued), and "none" (local AI only). No API key is ever part of the client.
   - One shared queue with priorities and limited parallelism; requests never block the game loop (promises, results are applied
     by the caller on the next tick); per-minute / per-hour limits, a daily token budget, caching of repeatable decisions,
     timeouts, exponential back-off and an offline state; when the model is unavailable the callers fall back to local AI and say so.
   - Prompt hygiene: everything that comes from the world (names, NPC lines, documents, the player's typed words) is passed as
     JSON data inside a delimited block and is never concatenated into the instructions; the reply must be a JSON object which the
     caller validates against the game rules (ACTION VALIDATOR) — model output is data, never code. */
(function (root) {
  'use strict';
  const S = root.SCP || (root.SCP = {});
  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  const store = { get(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }, set(k, v) { try { if (root.localStorage) root.localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const CFG_KEY = 'scplife.llm.cfg', USE_KEY = 'scplife.llm.usage';

  // strip control characters and delimiter look-alikes from world text, cap its length
  function clean(s, max) { s = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/<\/?\s*(data|system|instructions?)\s*>/gi, ' ').replace(/`{3,}/g, "'"); return s.length > (max || 600) ? s.slice(0, max || 600) + '…' : s; }
  function cleanDeep(o, depth) {
    depth = depth || 0; if (depth > 6) return null;
    if (o == null || typeof o === 'number' || typeof o === 'boolean') return o;
    if (typeof o === 'string') return clean(o);
    if (Array.isArray(o)) return o.slice(0, 40).map(x => cleanDeep(x, depth + 1));
    const r = {}; for (const k of Object.keys(o).slice(0, 60)) r[clean(k, 60)] = cleanDeep(o[k], depth + 1); return r;
  }
  // first balanced JSON object in a text (models sometimes wrap it in prose or a code fence)
  function extractJSON(text) {
    if (!text) return null; const s = String(text); let start = s.indexOf('{');
    while (start >= 0) {
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { break; } } }
      }
      start = s.indexOf('{', start + 1);
    }
    return null;
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const estTokens = s => Math.ceil(String(s || '').length / 3.2);

  // ------------------------------------------------------------------ providers
  const Providers = {
    // Claude inside the claude.ai artifact viewer (the viewer consents once; no keys)
    artifact: {
      name: 'Claude (claude.ai)', ns: null, probing: null,
      available() { return !!this.ns; },
      probe() {
        if (this.ns || this.probing) return this.probing || Promise.resolve(!!this.ns);
        const c = root.claude; if (!c || typeof c.use !== 'function') return Promise.resolve(false);
        this.probing = Promise.resolve().then(() => c.use('sample')).then(ns => { this.ns = ns || null; return !!ns; }).catch(() => false).finally(() => { this.probing = null; });
        return this.probing;
      },
      async complete(req) {
        if (!this.ns) throw Object.assign(new Error('artifact sample unavailable'), { code: 'unavailable' });
        const r = await this.ns([{ role: 'user', content: req.system + '\n\n' + req.user }], { modelTier: req.tier || 'default', cache: req.cacheable ? undefined : false });
        return { text: r && r.text, provider: 'artifact' };
      }
    },
    // the player's own proxy server (Tools/llm_proxy.mjs): the API key stays on the server
    proxy: {
      name: 'Сервер ИИ',
      available() { return !!(LLM.cfg.proxyUrl && /^https?:\/\//.test(LLM.cfg.proxyUrl)); },
      async complete(req) {
        const ctrl = root.AbortController ? new root.AbortController() : null, t = setTimeout(() => ctrl && ctrl.abort(), LLM.cfg.timeoutMs);
        try {
          const res = await root.fetch(LLM.cfg.proxyUrl.replace(/\/+$/, '') + '/v1/complete', {
            method: 'POST', signal: ctrl ? ctrl.signal : undefined,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (LLM.cfg.proxyToken || '') },
            body: JSON.stringify({ kind: req.kind, system: req.system, user: req.user, max_tokens: req.maxTokens || 500, tier: req.tier || 'default' })
          });
          if (res.status === 429) throw Object.assign(new Error('rate limited'), { code: 'rate_limited' });
          if (!res.ok) throw Object.assign(new Error('proxy ' + res.status), { code: res.status === 401 || res.status === 403 ? 'auth' : 'http' });
          const j = await res.json(); return { text: j.text, provider: 'proxy', usage: j.usage };
        } finally { clearTimeout(t); }
      }
    },
    // test double (headless tests): a function (req) => text
    mock: { name: 'Тестовая модель', fn: null, available() { return !!this.fn; }, async complete(req) { return { text: await this.fn(req), provider: 'mock' }; } }
  };

  // ------------------------------------------------------------------ gateway
  const LLM = {
    // build-time defaults (APK built with SCP_AI_URL / SCP_AI_TOKEN): the server address and the access token it issued — never an API key
    cfg: (() => {
      const d = root.SCP_AI_DEFAULT || {}, base = Object.assign({ enabled: true, provider: 'auto', proxyUrl: '', proxyToken: '', perMinute: 6, perHour: 60, dailyTokens: 250000, concurrency: 1, timeoutMs: 25000, queueMax: 14 }, d.proxyUrl ? { proxyUrl: d.proxyUrl, proxyToken: d.proxyToken || '', provider: d.provider || 'auto' } : {});
      let saved = {}; try { saved = JSON.parse(store.get(CFG_KEY) || '{}'); } catch (e) { saved = {}; }
      if (!saved.proxyUrl) { delete saved.proxyUrl; delete saved.proxyToken; }
      return Object.assign(base, saved, { builtIn: !!d.proxyUrl });
    })(),
    usage: (() => { try { return Object.assign({ day: '', tokens: 0, requests: 0, failed: 0, cached: 0, dropped: 0 }, JSON.parse(store.get(USE_KEY) || '{}')); } catch (e) { return { day: '', tokens: 0, requests: 0, failed: 0, cached: 0, dropped: 0 }; } })(),
    queue: [], running: 0, recent: [], cache: new Map(), backoffUntil: 0, fails: 0, lastError: null, lastOk: 0, log: [], Providers,
    saveCfg() { store.set(CFG_KEY, JSON.stringify(Object.assign({}, this.cfg, { proxyToken: this.cfg.proxyToken }))); },
    saveUsage() { store.set(USE_KEY, JSON.stringify(this.usage)); },
    today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
    provider(background) {
      if (!this.cfg.enabled) return null;
      if (Providers.mock.available()) return Providers.mock;
      const p = this.cfg.provider, a = Providers.artifact;
      if (!a.ns && !a.probing && root.claude && now() - (this.lastProbe || -1e9) > 15000) { this.lastProbe = now(); a.probe(); }
      // in the claude.ai viewer the first call asks the viewer's consent: background thinking starts only after the player used the model
      if ((p === 'auto' || p === 'artifact') && a.available() && !(background && !this.cfg.consented)) return a;
      if ((p === 'auto' || p === 'proxy') && Providers.proxy.available()) return Providers.proxy;
      return null;
    },
    init() { Providers.artifact.probe(); return this; },
    status() {
      const p = this.provider(), off = now() < this.backoffUntil;
      return { provider: p ? p.name : null, online: !!p && !off, background: !!this.provider(true), offline: !p || off, reason: !this.cfg.enabled ? 'выключен в настройках' : !p ? 'нет подключения к модели (локальный ИИ)' : off ? 'временно недоступен: ' + (this.lastError || 'ошибка') : 'на связи', queue: this.queue.length, usage: this.usage };
    },
    online() { return this.status().online; },
    budgetLeft() { if (this.usage.day !== this.today()) { this.usage.day = this.today(); this.usage.tokens = 0; this.usage.requests = 0; this.usage.failed = 0; this.usage.cached = 0; this.usage.dropped = 0; } return this.cfg.dailyTokens - this.usage.tokens; },
    allowedNow() {
      const t = now(); this.recent = this.recent.filter(x => t - x < 3600e3);
      return this.recent.filter(x => t - x < 60e3).length < this.cfg.perMinute && this.recent.length < this.cfg.perHour;
    },
    // req: { kind, system, data (object, sent as JSON data), task (short instruction placed after the data), priority, cacheKey, cacheMs, maxTokens, tier }
    // resolves { ok, json, text, provider, cached } or { ok:false, reason } — never throws
    request(req) {
      return new Promise(resolve => {
        const fg = req.kind === 'dialogue' || req.kind === 'ping';
        if (fg && !this.cfg.consented) { this.cfg.consented = true; this.saveCfg(); }
        const p = this.provider(!fg);
        if (!p) return resolve({ ok: false, reason: 'offline' });
        if (this.budgetLeft() <= 0) return resolve({ ok: false, reason: 'budget' });
        const user = '<DATA>\n' + JSON.stringify(cleanDeep(req.data || {})) + '\n</DATA>\n\n' + (req.task || 'Ответь одним JSON-объектом.');
        const key = req.cacheKey ? req.kind + ':' + hash(req.cacheKey) : null;
        if (key && this.cache.has(key)) { const c = this.cache.get(key); if (now() - c.t < (req.cacheMs || 600e3)) { this.usage.cached++; return resolve(Object.assign({ cached: true }, c.r)); } this.cache.delete(key); }
        const item = { req: Object.assign({}, req, { user }), key, resolve, pri: req.priority || 1, t: now() };
        this.queue.push(item); this.queue.sort((a, b) => b.pri - a.pri || a.t - b.t);
        while (this.queue.length > this.cfg.queueMax) { const d = this.queue.pop(); this.usage.dropped++; d.resolve({ ok: false, reason: 'dropped' }); }
        this.pump();
      });
    },
    pump() {
      while (this.running < this.cfg.concurrency && this.queue.length) {
        if (now() < this.backoffUntil || !this.allowedNow()) { setTimeout(() => this.pump(), 1500); return; }
        const item = this.queue.shift(), p = this.provider();
        if (!p) { item.resolve({ ok: false, reason: 'offline' }); continue; }
        this.running++; this.recent.push(now()); this.usage.requests++;
        const inTok = estTokens(item.req.system) + estTokens(item.req.user), t0 = now();
        p.complete(item.req).then(res => {
          const json = extractJSON(res.text), outTok = (res.usage && res.usage.output_tokens) || estTokens(res.text);
          this.usage.tokens += (res.usage && res.usage.input_tokens) || inTok; this.usage.tokens += outTok; this.saveUsage();
          if (!json) { this.lastError = 'ответ без JSON'; this.usage.failed++; this.note(item, 'bad', t0); item.resolve({ ok: false, reason: 'bad_json', text: res.text, provider: res.provider }); return; }
          this.fails = 0; this.lastOk = Date.now(); this.lastError = null;
          const r = { ok: true, json, text: res.text, provider: res.provider };
          if (item.key) { this.cache.set(item.key, { t: now(), r }); if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value); }
          this.note(item, 'ok', t0); item.resolve(r);
        }).catch(e => {
          this.usage.failed++; this.fails++; this.lastError = (e && (e.code || e.message)) || 'ошибка';
          this.backoffUntil = now() + Math.min(300e3, 4000 * Math.pow(2, Math.min(6, this.fails - 1))) * (e && e.code === 'rate_limited' ? 2 : 1);
          if (e && e.code === 'unavailable') Providers.artifact.ns = null;
          this.note(item, 'fail', t0); item.resolve({ ok: false, reason: 'error', error: this.lastError });
        }).finally(() => { this.running--; this.pump(); });
      }
    },
    note(item, res, t0) { this.log.push({ at: Date.now(), kind: item.req.kind, res, ms: Math.round(now() - t0) }); if (this.log.length > 60) this.log.shift(); },
    // used by the "check connection" button: a real round trip
    test() { return this.request({ kind: 'ping', priority: 9, system: 'Ты — модуль проверки связи игры. Отвечай только JSON.', data: { check: 'ping' }, task: 'Верни {"ok":true,"answer":"<одно слово по-русски>"}', maxTokens: 40, tier: 'quick' }); },
    clean, cleanDeep, extractJSON, hash
  };
  S.LLM = LLM;
})(typeof window !== 'undefined' ? window : globalThis);
