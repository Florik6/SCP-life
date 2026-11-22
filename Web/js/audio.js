/* SCP LIFE — sample-based spatial audio (WebAudio).
   Real recordings from Web/assets/audio (registry: Docs/ASSETS.md): Oculus Audio Pack 01 (CC BY 4.0), Kenney Impact/RPG/Sci-fi
   (CC0), Owlish Sound Effects Pack (CC0), Freesound CC0 recordings.
   - footsteps by surface, shoe and gait with no immediate repeats, pitch/volume jitter, triggered at foot contact by the caller;
   - buses: world (positional, reverb send), ambience beds, UI, music; master limiter (no clipping); ducking for loud events;
   - voice limit with priorities (a scream steals a cloth rustle, never the other way round);
   - occlusion (closed door / wall: low-pass and attenuation; another level: heavier), air absorption, distance-dependent reverb;
   - room ambience beds by room type, positional loop emitters (generators, servers, sparks, leaks, creatures), lazy loading and
     unloading of long loops to keep memory low on phones.
   Synthesized buffers remain only for PA chime, radio squelch, UI beeps, heartbeat and menu pad (no recordings for these), and as
   a fallback when the sample files are not available. */
(function (root) {
  'use strict';
  const S = root.SCP;
  const MAX_VOICES = 26, LOOP_IDLE_UNLOAD = 90;
  const PRIO = { scream: 9, alarm: 9, sting: 8, door: 6, creature: 6, impact: 5, step: 3, machine: 3, ui: 7, foley: 2, cloth: 1 };
  // legacy one-shot names used across the game -> sample ids
  const ALIAS = {
    heavy: 'door_heavy_open', servo: 'door_slide_open', metalKnock: 'knock_metal', knock: 'knock_metal', breaker: 'lever',
    scream: 'scream_m', whisper: 'whisper_far', scratch: 'scratch', ok: 'card_ok', no: 'card_deny', click: 'ui_open',
    stepMetal: 'step_metal_walk', step: 'step_concrete_walk', breath: 'breath_m'
  };
  const SURF = {
    concrete: { walk: 'step_concrete_walk', run: 'step_concrete_run', land: 'step_concrete_land', hard: true },
    metal: { walk: 'step_metal_walk', run: 'step_metal_run', land: 'step_metal_land', hard: true },
    tile: { walk: 'step_tile_walk', run: 'step_tile_walk', land: 'step_concrete_land', hard: true, runRate: 1.08 },
    grit: { walk: 'step_grit_walk', run: 'step_grit_run', land: 'step_concrete_land', hard: true },
    panel: { walk: 'step_panel_walk', run: 'step_panel_walk', land: 'step_concrete_land', hard: true, runRate: 1.1 },
    carpet: { walk: 'step_carpet_walk', run: 'step_carpet_walk', land: null, hard: false, runRate: 1.1 },
    wet: { walk: 'step_concrete_walk', run: 'step_concrete_run', land: 'step_concrete_land', hard: true, layer: 'step_grit_walk' }
  };
  const prioOf = id => /^scream|^hurt/.test(id) ? PRIO.scream : id === 'sting' ? PRIO.sting : /^door|^hydraulic|^card/.test(id) ? PRIO.door :
    /^crea|^scratch|^groan|^bone|^flesh|^glass|^whisper|^creak|^slime|^skitter/.test(id) ? PRIO.creature : /^step/.test(id) ? PRIO.step :
      /^ui_|^card/.test(id) ? PRIO.ui : /^cloth|^gear/.test(id) ? PRIO.cloth : PRIO.foley;

  const A = {
    ctx: null, master: null, music: null, sfx: null, buf: {}, loops: {}, rev: {}, settings: { volume: 0.8, music: 0.6 }, listener: null, roomType: null,
    base: (root.SCP_ASSET_BASE || 'assets/') + 'audio/', man: null, sbuf: {}, pending: {}, lastPick: {}, lastUse: {}, voices: [],
    emitters: {}, emitWant: {}, beds: {}, bedWant: {}, duckUntil: 0, duckAmt: 1, stats: { played: 0, dropped: 0, stolen: 0, loaded: 0, failed: 0 },
    start() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      let c; try { c = new AC({ sampleRate: 32000, latencyHint: 'interactive' }); } catch (e) { c = new AC(); }
      this.ctx = c;
      // master chain: limiter keeps the sum below 0 dBFS
      this.limiter = c.createDynamicsCompressor(); const L = this.limiter;
      L.threshold.value = -10; L.knee.value = 6; L.ratio.value = 12; L.attack.value = 0.003; L.release.value = 0.25;
      this.master = c.createGain(); this.master.connect(L); L.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.connect(this.master);
      this.ui = c.createGain(); this.ui.gain.value = 0.8; this.ui.connect(this.master);
      this.dry = c.createGain(); this.dry.connect(this.sfx);
      this.wet = c.createGain(); this.wet.gain.value = 0.25; this.conv = c.createConvolver(); this.conv.connect(this.wet); this.wet.connect(this.sfx);
      this.bus = c.createGain(); this.bus.connect(this.dry); this.revSend = c.createGain(); this.revSend.connect(this.conv);
      this.bus.connect(this.revSend);
      this.makeBuffers(); this.setRoom('Corridor', 50);
      this.loops.heart = this.loop('heart', 0, this.sfx); this.loops.musicA = this.loop('musicA', 1, this.music); this.loops.musicB = this.loop('musicB', 0.6, this.music);
      this.apply(); this.load();
    },
    apply() { if (!this.ctx) return; this.master.gain.value = this.settings.volume; },
    // ------------------------------------------------------------------ loading
    load() {
      if (this.man || this.loadingMan) return; this.loadingMan = true;
      fetch(this.base + 'sounds.json').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(m => {
        this.man = m.sounds; this.loadingMan = false;
        // one-shots first (small), long loops on demand
        const ids = Object.keys(this.man).filter(id => !this.man[id].loop);
        const first = ids.filter(id => /^step|^door|^card|^ui_|^cloth|^gear/.test(id)), rest = ids.filter(id => first.indexOf(id) < 0);
        const queue = first.concat(rest), worker = () => queue.length ? this.ensure(queue.shift()).then(worker) : null;
        for (let i = 0; i < 4; i++) worker();
      }).catch(() => { this.loadingMan = false; this.man = {}; this.stats.failed++; });
    },
    ensure(id) {
      if (!this.ctx || !this.man || !this.man[id]) return Promise.resolve(null);
      if (this.sbuf[id]) { this.lastUse[id] = this.ctx.currentTime; return Promise.resolve(this.sbuf[id]); }
      if (this.pending[id]) return this.pending[id];
      const c = this.ctx, files = this.man[id].files;
      const dec = ab => new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      this.pending[id] = Promise.all(files.map(f => fetch(this.base + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(dec).catch(() => null)))
        .then(bufs => { bufs = bufs.filter(Boolean); delete this.pending[id]; if (!bufs.length) { this.stats.failed++; return null; } this.sbuf[id] = bufs; this.lastUse[id] = c.currentTime; this.stats.loaded++; return bufs; });
      return this.pending[id];
    },
    has(id) { return !!this.sbuf[id]; },
    // random variant without immediate repeats (the last two are excluded when there are enough variants)
    pick(id) {
      const b = this.sbuf[id]; if (!b) return null; const n = b.length; if (n === 1) return b[0];
      const hist = this.lastPick[id] || (this.lastPick[id] = []); let i, guard = 0;
      do { i = Math.floor(Math.random() * n); } while ((hist[0] === i || (n > 3 && hist[1] === i)) && ++guard < 12);
      hist.unshift(i); hist.length = 2; this.lastUse[id] = this.ctx.currentTime; return b[i];
    },
    // ------------------------------------------------------------- synth fallback
    makeBuffers() {
      const c = this.ctx, R = c.sampleRate, mk = (sec, fn, ch) => { const n = Math.floor(sec * R), b = c.createBuffer(ch || 1, n, R); for (let k = 0; k < (ch || 1); k++) { const d = b.getChannelData(k); for (let i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, fn(i / R, sec, k))); } return b; };
      const env = (t, len, a, r) => t < a ? t / a : t > len - r ? Math.max(0, (len - t) / r) : 1, noise = () => Math.random() * 2 - 1;
      const beep = (t, s, d, f, sq) => { if (t < s || t > s + d) return 0; const l = t - s; let v = Math.sin(2 * Math.PI * f * l); if (sq) v = Math.sign(v) * 0.6; return v * 0.35 * env(l, d, 0.005, 0.03); };
      const loopFade = (t, L) => Math.min(1, Math.min(t, L - t) / 0.03);
      let lp = 0;
      const B = this.buf;
      B.ok = mk(0.25, t => beep(t, 0, 0.1, 1320) + beep(t, 0.12, 0.1, 1760));
      B.no = mk(0.4, t => beep(t, 0, 0.35, 330, true));
      B.wait = mk(0.35, t => beep(t, 0, 0.08, 990) + beep(t, 0.2, 0.08, 990));
      B.click = mk(0.06, t => noise() * Math.exp(-t * 120) * 0.6);
      B.chime = mk(1.4, t => (beep(t, 0, 0.6, 784) + beep(t, 0.45, 0.9, 523)) * 0.7);
      B.radio = mk(1.2, t => { const sq = t < 0.08 || t > 1.1 ? noise() * 0.5 : 0; const f = 210 + 60 * Math.sin(t * 11); return sq + (t > 0.1 && t < 1.05 ? (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.08 + noise() * 0.12) * (0.5 + 0.5 * Math.sin(t * 19)) : 0); });
      B.ring = mk(1.6, t => (t % 0.4 < 0.32 && t < 1.2 ? (Math.sin(2 * Math.PI * 1100 * t) * 0.3 + Math.sin(2 * Math.PI * 1400 * t) * 0.2) * (t % 0.05 < 0.025 ? 1 : 0.2) : 0));
      B.heart = mk(1, t => (Math.sin(2 * Math.PI * 55 * t) * Math.exp(-Math.pow((t - 0.05) * 30, 2)) + Math.sin(2 * Math.PI * 50 * t) * 0.7 * Math.exp(-Math.pow((t - 0.3) * 30, 2))) * 0.9);
      // fallbacks used only if a sample id failed to load
      B.step = mk(0.16, t => (noise() * 0.6 + Math.sin(2 * Math.PI * 80 * t) * 0.5) * Math.exp(-t * 32));
      B.stepMetal = mk(0.2, t => (noise() * 0.5 + Math.sin(2 * Math.PI * 320 * t) * 0.3) * Math.exp(-t * 26));
      B.metalKnock = mk(0.6, t => (Math.sin(2 * Math.PI * 410 * t) * 0.5 + Math.sin(2 * Math.PI * 830 * t) * 0.3 + noise() * 0.2) * Math.exp(-t * 9));
      B.heavy = mk(3, t => (Math.sin(2 * Math.PI * 70 * t) * 0.25 + noise() * 0.2) * env(t, 3, 0.08, 0.25));
      B.servo = mk(1, t => (Math.sin(2 * Math.PI * 180 * (1 + 0.25 * Math.sin(t * 3)) * t) * 0.25 + noise() * 0.18) * env(t, 1, 0.08, 0.25));
      B.musicA = mk(16, (t, L, ch) => { const ch1 = [110, 130.8, 164.8], ch2 = [98, 116.5, 146.8], f = t < 8 ? ch1 : ch2; let v = 0; for (const x of f) v += Math.sin(2 * Math.PI * x * t * (1 + ch * 0.002)) * 0.12; v *= 0.6 + 0.4 * Math.sin(Math.PI * (t % 8) / 8); return v * loopFade(t, L); }, 2);
      B.musicB = mk(11, (t, L) => { const k = t % 5.5; return (k < 1.5 ? (Math.sin(2 * Math.PI * 330 * t) * 0.2 + Math.sin(2 * Math.PI * 495 * t) * 0.1) * Math.exp(-k * 2.5) : 0) * loopFade(t, L); });
      // impulse responses (decaying filtered noise): small rooms, offices, halls, long tunnels, concrete cells
      const ir = (len, decay, bright) => mk(len, (t, L, ch) => { lp = lp * (1 - bright) + noise() * bright; return lp * Math.pow(1 - t / L, decay) * (ch ? 0.9 : 1); }, 2);
      this.rev.small = ir(0.5, 3, 0.6); this.rev.room = ir(1.0, 3, 0.5); this.rev.hall = ir(2.2, 2.5, 0.4); this.rev.tunnel = ir(2.8, 1.6, 0.25); this.rev.cell = ir(1.6, 2, 0.7); this.rev.soft = ir(0.35, 4, 0.7);
    },
    loop(name, vol, dest) { const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = this.buf[name]; s.loop = true; g.gain.value = vol; s.connect(g).connect(dest); s.start(); return g; },
    setRoom(type, area, soft) {
      const k = soft ? 'soft' : type === 'Tunnel' || type === 'Corridor' || type === 'Pumps' ? 'tunnel' : type === 'Containment' || type === 'Generator' || type === 'TestChamber' ? 'cell' : area > 120 ? 'hall' : area < 25 ? 'small' : 'room';
      if (this.roomType === k) return; this.roomType = k; this.conv.buffer = this.rev[k];
      this.wet.gain.setTargetAtTime({ small: 0.12, room: 0.2, hall: 0.3, tunnel: 0.42, cell: 0.36, soft: 0.06 }[k], this.ctx.currentTime, 0.3);
    },
    // ----------------------------------------------------------------- spatial
    spatial(pos, opt) {
      const L = this.listener; if (!pos || !L) return { gain: 1, pan: 0, lp: 0, wet: 1 };
      const dx = pos.x - L.x, dz = pos.z - L.z, dy = (pos.y || 0) - L.y, d = Math.sqrt(dx * dx + dz * dz + dy * dy * 4), range = opt.range || 22;
      if (d > range) return null;
      let gain = Math.pow(Math.max(0, 1 - d / range), 1.4) / (1 + d * 0.06);
      let lp = d > 6 ? Math.max(2500, 16000 - d * 450) : 0; // air absorption
      const occ = opt.occ || 0;
      if (occ === 1) { lp = lp ? Math.min(lp, 900) : 900; gain *= 0.5; } else if (occ >= 2) { lp = 280; gain *= 0.45; }
      const yaw = L.yaw * Math.PI / 180, rx = -Math.cos(yaw), rz = Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
      const pan = d > 0.2 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * Math.min(1, d / 1.5) : 0;
      if (d > 0.6 && (dx * fx + dz * fz) / d < -0.3) lp = lp ? Math.min(lp, 3200) : 3200; // behind the head: duller
      return { gain, pan, lp, wet: 0.6 + Math.min(1.4, d / 10) + (occ ? 0.6 : 0), d };
    },
    voiceFor(prio, group) {
      const now = this.ctx.currentTime; this.voices = this.voices.filter(v => v.end > now);
      if (group) { const same = this.voices.filter(v => v.group === group); if (same.length >= (group === 'step' ? 10 : 5)) { const old = same[0]; try { old.src.stop(); } catch (e) { /* stopped */ } this.voices.splice(this.voices.indexOf(old), 1); this.stats.stolen++; } }
      if (this.voices.length < MAX_VOICES) return true;
      let low = null; for (const v of this.voices) if (!low || v.prio < low.prio || (v.prio === low.prio && v.t0 < low.t0)) low = v;
      if (low && low.prio <= prio) { try { low.g.gain.setTargetAtTime(0, now, 0.01); low.src.stop(now + 0.05); } catch (e) { /* stopped */ } this.voices.splice(this.voices.indexOf(low), 1); this.stats.stolen++; return true; }
      this.stats.dropped++; return false;
    },
    // Positional one-shot. opt: occ (0 same room, 1 through a wall/door, 2 another level), range, rate, dry (UI/no reverb), prio,
    // jitter (pitch/volume variation, default on for samples), offset/dur (play a slice of a long recording), delay, wet multiplier.
    play(name, pos, vol, opt) {
      if (!this.ctx) return null; opt = opt || {}; vol = vol == null ? 0.8 : vol;
      const id = this.man && this.man[name] ? name : ALIAS[name] && this.man && this.man[ALIAS[name]] ? ALIAS[name] : null;
      let buf = null;
      if (id) { buf = this.pick(id); if (!buf) { this.ensure(id); if (this.buf[name]) buf = this.buf[name]; else return null; } else vol *= this.man[id].gain || 1; }
      else buf = this.buf[name];
      if (!buf) return null;
      const sp = this.spatial(pos, opt); if (!sp) return null;
      const c = this.ctx, now = c.currentTime + (opt.delay || 0), key = id || name, prio = opt.prio != null ? opt.prio : prioOf(key);
      let g0 = vol * sp.gain; if (g0 < 0.004) return null;
      const group = /^step/.test(key) ? 'step' : null;
      if (!this.voiceFor(prio, group)) return null;
      const s = c.createBufferSource(); s.buffer = buf; let node = s;
      const jit = opt.jitter !== false && !!id;
      s.playbackRate.value = (opt.rate || 1) * (jit ? 0.94 + Math.random() * 0.12 : 1);
      if (jit) g0 *= 0.85 + Math.random() * 0.3;
      if (sp.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.lp; node = node.connect(f); }
      if (pos && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = sp.pan; node = node.connect(p); }
      const g = c.createGain(); g.gain.value = g0; node.connect(g);
      if (opt.dry) g.connect(opt.ui ? this.ui : this.sfx);
      else { g.connect(this.dry); const ws = c.createGain(); ws.gain.value = sp.wet * (opt.wet == null ? 1 : opt.wet); g.connect(ws).connect(this.conv); }
      const off = opt.offset != null ? opt.offset : 0, dur = opt.dur ? Math.min(opt.dur, buf.duration - off) : buf.duration - off;
      if (opt.dur) { g.gain.setValueAtTime(g0, now + Math.max(0, dur - 0.25)); g.gain.linearRampToValueAtTime(0, now + dur); }
      s.start(now, off, opt.dur ? dur : undefined);
      const v = { src: s, g, prio, group, t0: now, end: now + dur / s.playbackRate.value + 0.05 };
      this.voices.push(v); this.stats.played++;
      if (prio >= PRIO.scream || key === 'sting' || key === 'alarm') this.duck(0.55, 1.6);
      return v;
    },
    // Footstep at the moment of foot contact.  o: surface (concrete|metal|tile|grit|panel|carpet|wet), gait (walk|run|sneak),
    // shoe (shoes|boots|heels|soft), gear (true for guards/MTF), occ, range, player, foot (0/1 for slight L/R pan offset), vol.
    footstep(pos, o) {
      o = o || {}; const sf = SURF[o.surface] || SURF.concrete, run = o.gait === 'run', sneak = o.gait === 'sneak';
      let id = run ? sf.run : sf.walk, rate = run && sf.runRate ? sf.runRate : 1, vol = (o.vol || 0.5) * (run ? 1.25 : sneak ? 0.35 : 1);
      if (o.shoe === 'heels' && sf.hard && !run) id = 'step_heels';
      if (o.shoe === 'soft') { vol *= 0.6; rate *= 1.04; }
      if (o.shoe === 'boots') rate *= 0.9;
      const base = { occ: o.occ, range: o.range || (run ? 26 : 18), rate, dry: !!o.player && !o.occ, wet: o.player ? 0.5 : 1 };
      const v = this.play(id, pos, vol, base);
      if (!v && !this.has(id)) this.play(o.surface === 'metal' ? 'stepMetal' : 'step', pos, vol * 0.8, base);
      if (o.shoe === 'boots' && sf.land) this.play(sf.land, pos, vol * (run ? 0.5 : 0.32), Object.assign({}, base, { rate: 0.88 }));
      if (sf.layer) this.play(sf.layer, pos, vol * 0.45, base);
      if (o.gear && Math.random() < (run ? 0.7 : 0.35)) this.play('gear', pos, vol * (run ? 0.55 : 0.3), Object.assign({}, base, { delay: 0.03 }));
      else if (!sneak && Math.random() < (run ? 0.35 : 0.12)) this.play('cloth', pos, vol * 0.22, base);
      return v;
    },
    duck(amount, sec) { if (!this.ctx) return; this.duckAmt = Math.min(this.duckAmt, amount); this.duckUntil = Math.max(this.duckUntil, this.ctx.currentTime + sec); },
    // ------------------------------------------------------------ loops: beds & emitters
    // Ambience bed (non-positional, per-room), set every frame: bed('amb_hum1', 0.3)
    bed(id, vol) { if (vol > 0.001) this.bedWant[id] = Math.max(this.bedWant[id] || 0, vol); },
    // Positional loop, set every frame while it should sound: emitter('gen1', 'amb_machine3', pos, 0.6, {occ, range})
    emitter(key, id, pos, vol, opt) { this.emitWant[key] = { id, pos, vol, opt: opt || {} }; },
    startLoop(id, dest, gain) {
      const b = this.pick(id); if (!b) { this.ensure(id); return null; }
      const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0;
      let node = s; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000; node = node.connect(f);
      let pan = null; if (c.createStereoPanner) { pan = c.createStereoPanner(); node = node.connect(pan); }
      node.connect(g).connect(dest); s.start(c.currentTime, Math.random() * Math.max(0, b.duration - 0.5));
      g.gain.setTargetAtTime(gain, c.currentTime, 0.4);
      return { id, s, g, f, pan };
    },
    stopLoop(L, tau) { const c = this.ctx; try { L.g.gain.setTargetAtTime(0, c.currentTime, tau || 0.4); L.s.stop(c.currentTime + (tau || 0.4) * 5); } catch (e) { /* stopped */ } },
    updateLoops(dt) {
      const c = this.ctx, now = c.currentTime;
      // beds
      for (const id in this.bedWant) if (!this.beds[id] && this.man && this.man[id]) { const L = this.startLoop(id, this.amb, 0); if (L) this.beds[id] = L; }
      for (const id in this.beds) {
        const L = this.beds[id], want = (this.bedWant[id] || 0) * ((this.man[id] && this.man[id].gain) || 1);
        L.g.gain.setTargetAtTime(want, now, want > L.g.gain.value ? 0.9 : 0.6); this.lastUse[id] = now;
        if (want <= 0.001) { L.idle = (L.idle || 0) + dt; if (L.idle > 4) { this.stopLoop(L, 0.2); delete this.beds[id]; } } else L.idle = 0;
      }
      this.bedWant = {};
      // emitters (positional loops), at most 8 audible
      const want = Object.entries(this.emitWant).map(([k, e]) => { const sp = this.spatial(e.pos, e.opt); return { k, e, sp, g: sp ? sp.gain * e.vol * ((this.man && this.man[e.id] && this.man[e.id].gain) || 1) : 0 }; })
        .filter(x => x.g > 0.003).sort((a, b) => b.g - a.g).slice(0, 8);
      const keep = new Set();
      for (const x of want) {
        keep.add(x.k); let L = this.emitters[x.k];
        if (L && L.id !== x.e.id) { this.stopLoop(L, 0.2); L = null; delete this.emitters[x.k]; }
        if (!L) { L = this.startLoop(x.e.id, this.bus, 0); if (!L) continue; this.emitters[x.k] = L; }
        L.g.gain.setTargetAtTime(x.g, now, 0.25); if (L.pan) L.pan.pan.setTargetAtTime(x.sp.pan, now, 0.1);
        L.f.frequency.setTargetAtTime(x.sp.lp || 18000, now, 0.15); this.lastUse[x.e.id] = now;
      }
      for (const k in this.emitters) if (!keep.has(k)) { this.stopLoop(this.emitters[k], 0.3); delete this.emitters[k]; }
      this.emitWant = {};
      // free long loops not used for a while (memory on phones)
      if (this.man) for (const id in this.sbuf) if (this.man[id] && this.man[id].loop && now - (this.lastUse[id] || 0) > LOOP_IDLE_UNLOAD && !this.beds[id] && !Object.values(this.emitters).some(L => L.id === id)) delete this.sbuf[id];
    },
    // Per-frame mix driven by the world state (real vents, generators, alert, people present) and the horror director.
    tick(w, dt, ctx) {
      if (!this.ctx) return; const c = this.ctx, k = Math.min(1, dt * 1.5), Lg = (g, v, kk) => { g.gain.value += (v - g.gain.value) * (kk || k); };
      const duck = c.currentTime < this.duckUntil ? this.duckAmt : 1; if (c.currentTime >= this.duckUntil) this.duckAmt = 1;
      Lg(this.amb, duck, dt * 3);
      if (!w) { Lg(this.loops.heart, 0); Lg(this.music, this.settings.music * 0.7, dt * 0.5); this.updateLoops(dt); this.master.gain.value = this.settings.volume; return; }
      Lg(this.music, 0, dt * 0.7);
      const p = w.player, room = w.fac.room(p.roomId);
      this.listener = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
      if (room) { this.setRoom(room.type, room.area, A.surfaceOf(room, w) === 'carpet'); this.roomBeds(w, room, ctx || {}); }
      this.worldEmitters(w, ctx || {});
      Lg(this.loops.heart, ctx && ctx.heartbeat ? ctx.heartbeat * 0.3 : 0, dt * 0.8);
      this.updateLoops(dt);
      this.master.gain.value = this.settings.volume;
    },
    roomBeds(w, room, ctx) {
      const t = room.type, vent = w.infra.vents[room.id] ? w.infra.vents[room.id].on : true, powered = room.powered !== false;
      const occupants = (w.byRoom && w.byRoom[room.id] ? w.byRoom[room.id].length : 0);
      if (vent) this.bed('amb_hvac', t === 'Tunnel' || t === 'Pumps' ? 0.24 : t === 'Corridor' ? 0.14 : 0.09);
      if (t === 'Corridor') this.bed(room.style === 'admin' ? 'amb_room1' : 'amb_room2', 0.22);
      if (/Laboratory|MedicalBay|Quarantine|TestChamber/.test(t) && powered) this.bed('amb_hum1', 0.32);
      if (t === 'Observation') { this.bed('amb_room2', 0.3); if (powered) this.bed('amb_hum2', 0.12); }
      if (t === 'Containment' || t === 'TempHold') { this.bed('amb_room2', 0.26); if (powered && room.style === 'heavy') this.bed('amb_hum2', 0.14); }
      if (t === 'Servers' && powered) { this.bed('amb_fan', 0.42); this.bed('amb_machine2', 0.16); }
      if (t === 'Command' && powered) { this.bed('amb_fan', 0.12); this.bed('amb_room1', 0.18); }
      if (t === 'Generator') this.bed('amb_machine', 0.12 + 0.5 * Math.min(1, w.infra.genLoad(room.id) || 0));
      if (t === 'Tunnel' || t === 'Pumps' || t === 'Dock' || (t === 'Stairs' && room.level === 4)) this.bed('amb_shaft', 0.3);
      if (t === 'Pumps' && powered) this.bed('amb_machine2', 0.35);
      if (t === 'Workshop' || t === 'Engineering') this.bed('amb_machine2', powered ? 0.22 : 0.05);
      if (t === 'Canteen') this.bed('amb_canteen', Math.min(0.55, occupants * 0.035));
      if (t === 'Kitchen' && occupants > 0) this.bed('amb_water', 0.18);
      if (t === 'Shower' && occupants > 0) this.bed('amb_water', 0.3);
      if (/Office|Meeting|Archive|Dormitory|Security|DClassCommon/.test(t)) this.bed('amb_room1', 0.26);
      if (/Office|Meeting|Archive/.test(t)) this.bed('clock', 0.12);
      if (t === 'NullFloor') this.bed('amb_dread2', 0.5);
      if (ctx.dread) this.bed('amb_dread1', 0.35 * ctx.dread);
      if (w.alert && w.alert.level >= 3) this.bed('alarm', 0.32);
      if (ctx.fear > 0.55) this.bed('breath_scared', (ctx.fear - 0.55) * 0.5);
      else if (ctx.exertion > 0.6) this.bed(ctx.female ? 'breath_f' : 'breath_m', (ctx.exertion - 0.6) * 0.45);
    },
    worldEmitters(w, ctx) {
      const p = w.player, occOf = ctx.occOf || (() => 0);
      for (const id of ['genMain', 'genC']) { const r = w.fac.room(id); if (!r) continue; const load = w.infra.genLoad(id); if (load > 0) this.emitter('gen.' + id, 'amb_machine3', { x: r.center.x, y: r.floorY + 1, z: r.center.z }, 0.7 * load, { occ: occOf(id), range: 34 }); }
      const srv = w.fac.room('servers'); if (srv && srv.powered !== false && p.roomId !== 'servers') this.emitter('srv', 'amb_fan', { x: srv.center.x, y: srv.floorY + 1, z: srv.center.z }, 0.4, { occ: occOf('servers'), range: 16 });
      for (const f of w.infra.faults) {
        if (f.fixed) continue; const r = w.fac.room(f.kind === 'humidity' ? f.site : (f.room || f.site)); if (!r) continue;
        if (f.kind === 'panel' || f.kind === 'light') this.emitter('fault.' + f.id, 'spark', { x: r.center.x, y: r.floorY + 2.2, z: r.center.z }, f.kind === 'panel' ? 0.35 : 0.12, { occ: occOf(r.id), range: 12 });
        if (f.kind === 'humidity') this.emitter('leak.' + f.id, 'amb_drip', { x: r.center.x, y: r.floorY + 0.2, z: r.center.z }, 0.35, { occ: occOf(r.id), range: 14 });
      }
    },
    // floor surface of a room (used for the player and NPC footsteps)
    surfaceOf(room, w) {
      if (!room) return 'concrete'; const t = room.type, st = room.style;
      if (t === 'Shower') return 'wet';
      if (w && w.infra && w.infra.humidity(room.id) > 62) return 'wet';
      if (t === 'Tunnel' || t === 'Pumps' || t === 'Lift' || (t === 'Stairs' && st === 'tech')) return 'metal';
      if (/Generator|Workshop|Dock|Storage|Engineering|Shelter/.test(t)) return 'grit';
      if (t === 'Servers' || t === 'Command') return 'panel';
      if (/Laboratory|MedicalBay|Quarantine|Kitchen|Canteen|TestChamber|Observation|Airlock/.test(t)) return 'tile';
      if (/Office|Meeting|Archive|Dormitory/.test(t)) return 'carpet';
      if (t === 'Corridor') return st === 'admin' || st === 'research' ? 'tile' : 'concrete';
      if (t === 'NullFloor') return 'concrete';
      return 'concrete';
    }
  };
  A.SURF = SURF; A.ALIAS = ALIAS;
  S.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
