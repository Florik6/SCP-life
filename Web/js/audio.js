/* SCP LIFE 2.0 — synthesized spatial audio (WebAudio, no sound files): room acoustics, occlusion through walls and floors,
   ventilation that follows the real state of the vents (silence when they stop), generators, servers, doors, steps, voices,
   radio, PA, knocks, whispers (player-only perception) and screams (only for real injuries). Menu music is generative. */
(function (root) {
  'use strict';
  const S = root.SCP;
  const A = {
    ctx: null, master: null, music: null, sfx: null, buf: {}, loops: {}, rev: {}, settings: { volume: 0.8, music: 0.6 }, listener: null, roomType: null,
    start() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC(); this.master = c.createGain(); this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master); this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.dry = c.createGain(); this.dry.connect(this.sfx); this.wet = c.createGain(); this.wet.gain.value = 0.25; this.conv = c.createConvolver(); this.conv.connect(this.wet); this.wet.connect(this.sfx);
      this.bus = c.createGain(); this.bus.connect(this.dry); this.bus.connect(this.conv);
      this.makeBuffers(); this.setRoom('Corridor', 50);
      this.loops.hum = this.loop('hum', 0, this.dry); this.loops.gen = this.loop('gen', 0, this.dry); this.loops.fans = this.loop('fans', 0, this.dry); this.loops.siren = this.loop('siren', 0, this.sfx);
      this.loops.drone = this.loop('drone', 0, this.dry); this.loops.heart = this.loop('heart', 0, this.sfx); this.loops.musicA = this.loop('musicA', 1, this.music); this.loops.musicB = this.loop('musicB', 0.6, this.music);
      this.apply();
    },
    apply() { if (!this.ctx) return; this.master.gain.value = this.settings.volume; },
    makeBuffers() {
      const c = this.ctx, R = c.sampleRate, mk = (sec, fn, ch) => { const n = Math.floor(sec * R), b = c.createBuffer(ch || 1, n, R); for (let k = 0; k < (ch || 1); k++) { const d = b.getChannelData(k); for (let i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, fn(i / R, sec, k))); } return b; };
      const env = (t, len, a, r) => t < a ? t / a : t > len - r ? Math.max(0, (len - t) / r) : 1, noise = () => Math.random() * 2 - 1;
      const beep = (t, s, d, f, sq) => { if (t < s || t > s + d) return 0; const l = t - s; let v = Math.sin(2 * Math.PI * f * l); if (sq) v = Math.sign(v) * 0.6; return v * 0.35 * env(l, d, 0.005, 0.03); };
      const loopFade = (t, L) => Math.min(1, Math.min(t, L - t) / 0.03);
      let lp = 0, lp2 = 0, lp3 = 0;
      const B = this.buf;
      B.hum = mk(4, (t, L) => { lp = lp * 0.96 + noise() * 0.04; return (lp * 2.2 + Math.sin(2 * Math.PI * 50 * t) * 0.1 + Math.sin(2 * Math.PI * 100 * t) * 0.04) * loopFade(t, L); });
      B.gen = mk(3, (t, L) => (Math.sin(2 * Math.PI * 48 * t) * 0.35 + Math.sin(2 * Math.PI * 96 * t) * 0.18 + Math.sin(2 * Math.PI * 144 * t + Math.sin(t * 8)) * 0.08 + noise() * 0.05) * loopFade(t, L));
      B.fans = mk(3, (t, L) => { lp2 = lp2 * 0.7 + noise() * 0.3; return (lp2 * 0.5 + Math.sin(2 * Math.PI * 233 * t) * 0.02) * loopFade(t, L); });
      B.servo = mk(1, t => (Math.sin(2 * Math.PI * 180 * (1 + 0.25 * Math.sin(t * 3)) * t) * 0.25 + noise() * 0.18) * env(t, 1, 0.08, 0.25));
      B.heavy = mk(3, t => (Math.sin(2 * Math.PI * 70 * t) * 0.25 + noise() * 0.2) * env(t, 3, 0.08, 0.25) + (t > 2.85 ? Math.sin(2 * Math.PI * 55 * (t - 2.85)) * Math.exp(-(t - 2.85) * 20) * 0.8 : 0));
      B.ok = mk(0.25, t => beep(t, 0, 0.1, 1320) + beep(t, 0.12, 0.1, 1760));
      B.no = mk(0.4, t => beep(t, 0, 0.35, 330, true));
      B.wait = mk(0.35, t => beep(t, 0, 0.08, 990) + beep(t, 0.2, 0.08, 990));
      B.click = mk(0.06, t => noise() * Math.exp(-t * 120) * 0.6);
      B.breaker = mk(0.5, t => noise() * Math.exp(-t * 30) * 0.9 + Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 8) * 0.4);
      B.knock = mk(0.35, t => (Math.sin(2 * Math.PI * 140 * t) * 0.8 + noise() * 0.3) * Math.exp(-t * 28));
      B.metalKnock = mk(0.6, t => (Math.sin(2 * Math.PI * 410 * t) * 0.5 + Math.sin(2 * Math.PI * 830 * t) * 0.3 + noise() * 0.2) * Math.exp(-t * 9));
      B.scratch = mk(0.7, t => noise() * (0.35 + 0.25 * Math.sin(t * 60)) * env(t, 0.7, 0.05, 0.2));
      B.chime = mk(1.4, t => (beep(t, 0, 0.6, 784) + beep(t, 0.45, 0.9, 523)) * 0.7);
      B.step = mk(0.16, t => (noise() * 0.6 + Math.sin(2 * Math.PI * 80 * t) * 0.5) * Math.exp(-t * 32));
      B.stepMetal = mk(0.2, t => (noise() * 0.5 + Math.sin(2 * Math.PI * 320 * t) * 0.3) * Math.exp(-t * 26));
      B.breath = mk(1.6, t => { lp3 = lp3 * 0.9 + noise() * 0.1; return lp3 * 2.5 * Math.pow(Math.sin(Math.PI * t / 1.6), 2); });
      B.whisper = mk(1.4, t => { const v = noise() * (0.5 + 0.5 * Math.sin(t * 31) * Math.sin(t * 7)); return v * 0.35 * env(t, 1.4, 0.1, 0.4) * (0.6 + 0.4 * Math.sin(t * 13)); });
      B.voice = mk(0.9, t => { const f = 140 + 40 * Math.sin(t * 9) + 25 * Math.sin(t * 23); return (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.12 + Math.sin(2 * Math.PI * f * 2 * t) * 0.08) * (0.4 + 0.6 * Math.abs(Math.sin(t * 17))) * env(t, 0.9, 0.05, 0.2); });
      B.radio = mk(1.2, t => { const sq = t < 0.08 || t > 1.1 ? noise() * 0.5 : 0; const f = 210 + 60 * Math.sin(t * 11); return sq + (t > 0.1 && t < 1.05 ? (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.08 + noise() * 0.12) * (0.5 + 0.5 * Math.sin(t * 19)) : 0); });
      B.ring = mk(1.6, t => (t % 0.4 < 0.32 && t < 1.2 ? (Math.sin(2 * Math.PI * 1100 * t) * 0.3 + Math.sin(2 * Math.PI * 1400 * t) * 0.2) * (t % 0.05 < 0.025 ? 1 : 0.2) : 0));
      B.scream = mk(1.6, t => { const f = 520 + 300 * Math.sin(t * 4) - t * 120; return (Math.sin(2 * Math.PI * f * t) * 0.4 + noise() * 0.25) * env(t, 1.6, 0.05, 0.8); });
      B.siren = mk(2.4, (t, L) => { const f = 520 + 380 * Math.sin(2 * Math.PI * t / 2.4); return (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.18 + Math.sin(2 * Math.PI * f * t) * 0.2) * loopFade(t, L); });
      B.drone = mk(6, (t, L) => (Math.sin(2 * Math.PI * 41 * t) * 0.5 + Math.sin(2 * Math.PI * 61.7 * t + Math.sin(t * 0.7) * 2) * 0.35) * 0.6 * loopFade(t, L));
      B.heart = mk(1, t => (Math.sin(2 * Math.PI * 55 * t) * Math.exp(-Math.pow((t - 0.05) * 30, 2)) + Math.sin(2 * Math.PI * 50 * t) * 0.7 * Math.exp(-Math.pow((t - 0.3) * 30, 2))) * 0.9);
      // menu music: slow minor pad with distant metallic hits
      B.musicA = mk(16, (t, L, ch) => { const ch1 = [110, 130.8, 164.8], ch2 = [98, 116.5, 146.8], f = t < 8 ? ch1 : ch2; let v = 0; for (const x of f) v += Math.sin(2 * Math.PI * x * t * (1 + ch * 0.002)) * 0.12; v *= 0.6 + 0.4 * Math.sin(Math.PI * (t % 8) / 8); return v * loopFade(t, L); }, 2);
      B.musicB = mk(11, (t, L) => { const k = t % 5.5; return (k < 1.5 ? (Math.sin(2 * Math.PI * 330 * t) * 0.2 + Math.sin(2 * Math.PI * 495 * t) * 0.1) * Math.exp(-k * 2.5) : 0) * loopFade(t, L); });
      // impulse responses for small rooms, large halls and long tunnels
      const ir = (len, decay, bright) => mk(len, (t, L, ch) => { lp = lp * (1 - bright) + noise() * bright; return lp * Math.pow(1 - t / L, decay) * (ch ? 0.9 : 1); }, 2);
      this.rev.small = ir(0.5, 3, 0.6); this.rev.room = ir(1.0, 3, 0.5); this.rev.hall = ir(2.2, 2.5, 0.4); this.rev.tunnel = ir(2.8, 1.6, 0.25); this.rev.cell = ir(1.6, 2, 0.7);
    },
    loop(name, vol, dest) { const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = this.buf[name]; s.loop = true; g.gain.value = vol; s.connect(g).connect(dest); s.start(); return g; },
    setRoom(type, area) {
      const k = type === 'Tunnel' || type === 'Corridor' ? 'tunnel' : type === 'Containment' || type === 'Generator' ? 'cell' : area > 120 ? 'hall' : area < 25 ? 'small' : 'room';
      if (this.roomType === k) return; this.roomType = k; this.conv.buffer = this.rev[k]; this.wet.gain.value = { small: 0.12, room: 0.2, hall: 0.3, tunnel: 0.42, cell: 0.35 }[k];
    },
    // Positional one-shot. occlusion: 0 same room, 1 next room (through a wall/door), 2 another level.
    play(name, pos, vol, opt) {
      if (!this.ctx || !this.buf[name]) return; opt = opt || {}; vol = vol == null ? 0.8 : vol;
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.buf[name]; let node = s;
      if (pos && this.listener) {
        const L = this.listener, dx = pos.x - L.x, dz = pos.z - L.z, dy = (pos.y || 0) - L.y, d = Math.sqrt(dx * dx + dz * dz + dy * dy * 4), range = opt.range || 22;
        if (d > range) return; vol *= Math.max(0, 1 - d / range) ** 1.2;
        const occ = opt.occ || 0;
        if (occ) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = occ >= 2 ? 260 : 900; node = node.connect(f); vol *= occ >= 2 ? 0.55 : 0.6; }
        if (c.createStereoPanner) { const pan = c.createStereoPanner(), yaw = L.yaw * Math.PI / 180, rx = -Math.cos(yaw), rz = Math.sin(yaw); pan.pan.value = d > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0; node = node.connect(pan); }
        // behind the listener: duller
        const fx = Math.sin(L.yaw * Math.PI / 180), fz = Math.cos(L.yaw * Math.PI / 180); if (d > 0.5 && (dx * fx + dz * fz) / d < -0.3) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; node = node.connect(f); }
        s.playbackRate.value = (opt.rate || 1) * (0.92 + Math.random() * 0.16);
      } else if (opt.rate) s.playbackRate.value = opt.rate;
      const g = c.createGain(); g.gain.value = vol; node.connect(g).connect(opt.dry ? this.sfx : this.bus); s.start();
    },
    // Per-frame mix driven by the world state (the real vents, generators, alert) and the horror director.
    tick(w, dt, ctx) {
      if (!this.ctx) return; const k = Math.min(1, dt * 1.5), L = (g, v, kk) => { g.gain.value += (v - g.gain.value) * (kk || k); };
      if (!w) { L(this.loops.hum, 0); L(this.loops.gen, 0); L(this.loops.fans, 0); L(this.loops.siren, 0); L(this.loops.drone, 0); L(this.loops.heart, 0); L(this.music, this.settings.music * 0.7, dt * 0.5); return; }
      L(this.music, 0, dt * 0.7);
      const p = w.player, room = w.fac.room(p.roomId);
      this.listener = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
      if (room) this.setRoom(room.type, room.area);
      const vent = room && w.infra.vents[room.id] ? w.infra.vents[room.id].on : true;
      L(this.loops.hum, vent ? (room && room.type === 'Tunnel' ? 0.3 : 0.2) : 0.0, dt * (vent ? 0.6 : 2.5));
      const g1 = w.fac.room('genMain'), g2 = w.fac.room('genC'); let gv = 0;
      for (const [r, id] of [[g1, 'genMain'], [g2, 'genC']]) { if (!r || Math.abs(r.floorY - p.pos.y) > 3) continue; const load = w.infra.genLoad(id); if (!load) continue; const d = S.V.distXZ(r.center, p.pos); gv = Math.max(gv, load * Math.max(0, 1 - d / 30) * (p.roomId === id ? 0.9 : 0.4)); }
      L(this.loops.gen, gv);
      const srv = w.fac.room('servers'); L(this.loops.fans, srv && p.roomId === 'servers' ? 0.35 : srv && S.V.distXZ(srv.center, p.pos) < 14 && Math.abs(srv.floorY - p.pos.y) < 3 ? 0.08 : 0);
      L(this.loops.siren, w.alert.level >= 3 ? 0.3 : 0, dt * 0.8);
      let dr = 0; for (const a of w.anomalies) { if (!a.arrived || !a.agent.roomId || a.temper !== 'aggressive') continue; const d = S.V.distXZ(a.agent.pos, p.pos); dr = Math.max(dr, (!a.contained ? 0.5 : a.pose === 'Probing' ? 0.3 : 0.04) * Math.max(0, 1 - d / 25)); }
      L(this.loops.drone, dr * (ctx && ctx.intensity != null ? ctx.intensity : 1));
      L(this.loops.heart, ctx && ctx.heartbeat ? ctx.heartbeat * 0.35 : 0, dt * 0.8);
      this.master.gain.value = this.settings.volume;
    }
  };
  S.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
