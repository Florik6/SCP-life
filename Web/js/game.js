/* SCP LIFE — browser runtime: input, player, interaction, HUD, terminal, menus, audio, saves, main loop. */
(function () {
  'use strict';
  const S = window.SCP, T = window.THREE, $ = id => document.getElementById(id);
  const D2R = Math.PI / 180, EYE = 1.62, WALK = 2.3, RUN = 4.2, RADIUS = 0.3, REACH = 2.7;
  const SAVE_KEY = 'scplife.save.v1', BAK_KEY = 'scplife.save.v1.bak', SET_KEY = 'scplife.settings.v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } } };

  // ------------------------------------------------------------------ settings
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const settings = Object.assign({ sens: 1.0, quality: isTouch ? 1 : 2, volume: 0.8, invert: false, touch: isTouch }, (() => { try { return JSON.parse(store.get(SET_KEY) || '{}'); } catch (e) { return {}; } })());
  const QUALITY = [{ name: 'Низкое', ratio: 0.6, lights: 4, far: 30 }, { name: 'Среднее', ratio: 0.85, lights: 6, far: 40 }, { name: 'Высокое', ratio: 1.0, lights: 8, far: 50 }];
  const saveSettings = () => store.set(SET_KEY, JSON.stringify(settings));

  // ------------------------------------------------------------------ audio (synthesised, no files)
  const Audio = {
    ctx: null, master: null, buf: {}, hum: null, siren: null, sirenGain: null,
    start() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = settings.volume; this.master.connect(this.ctx.destination);
      const R = this.ctx.sampleRate, mk = (sec, fn) => { const n = Math.floor(sec * R), b = this.ctx.createBuffer(1, n, R), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, fn(i / R, sec))); return b; };
      const env = (t, len, a, r) => t < a ? t / a : t > len - r ? Math.max(0, (len - t) / r) : 1, noise = () => Math.random() * 2 - 1;
      const beep = (t, s, d, f, sq) => { if (t < s || t > s + d) return 0; const l = t - s; let v = Math.sin(2 * Math.PI * f * l); if (sq) v = Math.sign(v) * 0.6; return v * 0.35 * env(l, d, 0.005, 0.03); };
      let lp = 0;
      this.buf.hum = mk(4, (t, L) => { lp = lp * 0.96 + noise() * 0.04; return (lp * 2.2 + Math.sin(2 * Math.PI * 50 * t) * 0.12 + Math.sin(2 * Math.PI * 100 * t) * 0.05) * Math.min(1, Math.min(t, L - t) / 0.03); });
      this.buf.servo = mk(1, t => (Math.sin(2 * Math.PI * 180 * (1 + 0.25 * Math.sin(t * 3)) * t) * 0.25 + noise() * 0.18) * env(t, 1, 0.08, 0.25));
      this.buf.heavy = mk(3, t => (Math.sin(2 * Math.PI * 70 * t) * 0.25 + noise() * 0.2) * env(t, 3, 0.08, 0.25) + (t > 2.85 ? Math.sin(2 * Math.PI * 55 * (t - 2.85)) * Math.exp(-(t - 2.85) * 20) * 0.8 : 0));
      this.buf.ok = mk(0.25, t => beep(t, 0, 0.1, 1320) + beep(t, 0.12, 0.1, 1760));
      this.buf.no = mk(0.4, t => beep(t, 0, 0.35, 330, true));
      this.buf.wait = mk(0.35, t => beep(t, 0, 0.08, 990) + beep(t, 0.2, 0.08, 990));
      this.buf.click = mk(0.06, t => noise() * Math.exp(-t * 120) * 0.6);
      this.buf.knock = mk(0.35, t => (Math.sin(2 * Math.PI * 140 * t) * 0.8 + noise() * 0.3) * Math.exp(-t * 28));
      this.buf.scratch = mk(0.7, t => noise() * (0.35 + 0.25 * Math.sin(t * 60)) * env(t, 0.7, 0.05, 0.2));
      this.buf.chime = mk(1.4, t => (beep(t, 0, 0.6, 784) + beep(t, 0.45, 0.9, 523)) * 0.7);
      this.buf.step = mk(0.16, t => (noise() * 0.6 + Math.sin(2 * Math.PI * 80 * t) * 0.5) * Math.exp(-t * 32));
      this.buf.siren = mk(2.4, (t, L) => { const f = 520 + 380 * Math.sin(2 * Math.PI * t / 2.4); return (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.18 + Math.sin(2 * Math.PI * f * t) * 0.2) * Math.min(1, Math.min(t, L - t) / 0.02); });
      this.buf.drone = mk(6, (t, L) => (Math.sin(2 * Math.PI * 41 * t) * 0.5 + Math.sin(2 * Math.PI * 61.7 * t + Math.sin(t * 0.7) * 2) * 0.35) * 0.6 * Math.min(1, Math.min(t, L - t) / 0.03));
      this.hum = this.loop('hum', 0.22); this.siren = this.loop('siren', 0); this.drone = this.loop('drone', 0);
    },
    loop(name, vol) { const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = this.buf[name]; s.loop = true; g.gain.value = vol; s.connect(g).connect(this.master); s.start(); return g; },
    play(name, pos, vol) {
      if (!this.ctx || !this.buf[name]) return; vol = vol == null ? 0.8 : vol;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = this.buf[name]; let node = s;
      if (pos && G.world) {
        const p = G.world.player.pos, dx = pos.x - p.x, dz = pos.z - p.z, d = Math.sqrt(dx * dx + dz * dz); if (d > 20) return;
        vol *= Math.max(0, 1 - d / 20);
        if (this.ctx.createStereoPanner) { const pan = this.ctx.createStereoPanner(), yaw = G.world.player.yaw * D2R; const rx = -Math.cos(yaw), rz = Math.sin(yaw); pan.pan.value = d > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0; node = s.connect(pan); }
        s.playbackRate.value = 0.92 + Math.random() * 0.16;
      }
      g.gain.value = vol; node.connect(g).connect(this.master); s.start();
    },
    tick(w, dt) {
      if (!this.ctx) return;
      this.siren.gain.value += ((w && w.alert.level >= 3 ? 0.3 : 0) - this.siren.gain.value) * Math.min(1, dt * 0.8);
      let dr = 0; if (w) { const a = w.anomalies[0]; const d = S.V.distXZ(a.agent.pos, w.player.pos); dr = (!a.contained ? 0.5 : a.pose === 'Probing' ? 0.3 : 0.06) * Math.max(0, 1 - d / 25); }
      this.drone.gain.value += (dr - this.drone.gain.value) * Math.min(1, dt);
      this.master.gain.value = settings.volume;
    }
  };

  // ------------------------------------------------------------------ renderer
  const G = { world: null, fv: null, npcViews: [], tally: null, cams: [], playing: false, acc: 0, timeScale: 1, cctv: false, camIndex: 0, camView: 0, extraRoom: null, visible: new Set() };
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050607); $('game').appendChild(renderer.domElement);
  const scene = new T.Scene(); scene.fog = new T.Fog(0x080a0c, 10, 40);
  const ambient = new T.AmbientLight(0x2a2d33, 1.0); scene.add(ambient);
  const hemi = new T.HemisphereLight(0x3a3f47, 0x15130f, 0.55); scene.add(hemi);
  const pool = []; for (let i = 0; i < 8; i++) { const l = new T.PointLight(0xffffff, 0, 10, 1.6); scene.add(l); pool.push(l); }
  const camera = new T.PerspectiveCamera(70, 1, 0.05, 45); camera.rotation.order = 'YXZ'; scene.add(camera);
  const flash = new T.SpotLight(0xfff2d9, 0, 15, 0.5, 0.45, 1.5); flash.position.set(0.15, -0.12, 0); camera.add(flash); flash.target.position.set(0, -0.1, -5); camera.add(flash.target);
  const cctvCam = new T.PerspectiveCamera(52, 16 / 9, 0.05, 30); cctvCam.rotation.order = 'YXZ';
  const raycaster = new T.Raycaster(); raycaster.far = REACH;
  function resize() { const q = QUALITY[settings.quality]; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q.ratio); renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.updateProjectionMatrix(); camera.far = q.far; scene.fog.far = q.far - 2; }
  window.addEventListener('resize', resize); resize();

  // ------------------------------------------------------------------ player
  const P = { yaw: 180, pitch: 0, stamina: 1, bob: 0, step: 0, last: null, shake: 0, current: null, rayT: 0 };
  function collide(x, z) {
    const blockers = G.fv.doorBlockers();
    for (let pass = 0; pass < 3; pass++) {
      const near = G.fv.nearColliders(x, z); for (const b of blockers) near.add(b);
      for (const c of near) {
        const cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1)), dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = RADIUS - d; x += dx / d * push; z += dz / d * push; }
        else { const l = x - c.x0, r = c.x1 - x, t = z - c.z0, b = c.z1 - z, m = Math.min(l, r, t, b); if (m === l) x = c.x0 - RADIUS; else if (m === r) x = c.x1 + RADIUS; else if (m === t) z = c.z0 - RADIUS; else z = c.z1 + RADIUS; }
      }
    }
    return [x, z];
  }
  function updatePlayer(dt, gameplay) {
    const w = G.world, p = w.player, stunned = w.realTime < p.stunnedUntil;
    if (stunned) P.shake = 0.25; P.shake = Math.max(0, P.shake - dt * 0.15);
    let moved = 0;
    if (gameplay && !p.dead) {
      if (!stunned) { P.yaw -= Input.look.x * settings.sens; P.pitch = S.clamp(P.pitch - Input.look.y * settings.sens * (settings.invert ? -1 : 1), -80, 80); }
      const mv = stunned ? { x: 0, y: 0 } : Input.move, running = Input.run && mv.y > 0.2 && P.stamina > 0.05 && !p.counting;
      const sp = (running ? RUN : WALK) * (p.health < 35 ? 0.75 : 1);
      P.stamina = S.clamp(P.stamina + (running ? -dt / 7 : dt / 10), 0, 1);
      const yr = P.yaw * D2R, fx = Math.sin(yr), fz = Math.cos(yr), rx = -Math.cos(yr), rz = Math.sin(yr);
      let vx = (fx * mv.y + rx * mv.x) * sp, vz = (fz * mv.y + rz * mv.x) * sp;
      const ox = p.pos.x, oz = p.pos.z, [nx, nz] = collide(ox + vx * dt, oz + vz * dt);
      p.pos = { x: nx, y: 0, z: nz }; moved = Math.hypot(nx - ox, nz - oz);
      if (p.counting && (mv.x * mv.x + mv.y * mv.y) > 0.3) w.stopCounting('вы сдвинулись с места');
      if (Input.flash) { p.flashlight = !p.flashlight; Audio.play('click'); }
      if (Input.card && p.cards.length) { p.sel = (p.sel + 1) % p.cards.length; const c = w.card(p.selectedCardId()); if (c) UI.msg('Выбрана карта: L' + c.level + ' · ' + c.ownerName, '#fff'); }
      if (Input.count) toggleCounting();
      P.rayT -= dt; if (P.rayT <= 0) { P.rayT = 0.1; P.current = pickInteractable(); }
      if (Input.use && P.current) interact(P.current);
    } else P.current = null;
    w.player.yaw = P.yaw; w.player.pitch = P.pitch;
    const speed = dt > 0 ? moved / dt : 0; P.bob += moved * 2.2;
    const amt = Math.min(1, speed / RUN) * 0.045;
    camera.position.set(p.pos.x + Math.cos(P.bob) * amt * 0.6 * 0, EYE + Math.sin(P.bob * 2) * amt, p.pos.z);
    if (P.shake > 0) { camera.position.x += (Math.random() - 0.5) * P.shake * 0.2; camera.position.y += (Math.random() - 0.5) * P.shake * 0.2; }
    camera.rotation.set(P.pitch * D2R, P.yaw * D2R + Math.PI, P.shake * Math.sin(performance.now() * 0.04) * 0.14);
    flash.intensity = p.flashlight ? 2.2 : 0;
    P.step += moved; if (P.step > (speed > 3.2 ? 0.85 : 0.7)) { P.step = 0; Audio.play('step', null, speed > 3.2 ? 0.55 : 0.35); }
  }
  function toggleCounting() {
    const w = G.world, p = w.player;
    if (p.counting) { w.stopCounting('вы прекратили счёт'); return; }
    const a = countable(); if (!a) { UI.msg('Протокол счёта: объект вне прямой видимости (до 10 м)', '#ffb36b'); return; }
    w.startCounting(a.id);
  }
  function countable() { const w = G.world, p = w.player; return w.anomalies.find(a => w.canCount(p.pos, p.roomId, a)) || null; }

  // ------------------------------------------------------------------ interaction
  function shown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
  function pickInteractable() {
    const list = G.fv.interact.filter(shown);
    for (const v of G.npcViews) if (v.root.visible) list.push(v.proxy);
    if (G.tally && G.tally.root.visible) list.push(G.tally.proxy);
    for (const k in G.cardMeshes) list.push(G.cardMeshes[k]);
    for (const id of G.visible) { const rv = G.fv.rooms[id]; if (rv) for (const c of rv.group.children) if (c.isMesh && c.geometry.groups && c.geometry.groups.length) list.push(c); }
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(list, false);
    for (const h of hits) { const d = h.object.userData.interact; if (d) return d; if (h.object.material && h.object.material.transparent) continue; return null; }
    return null;
  }
  function promptFor(d) {
    const w = G.world;
    switch (d.kind) {
      case 'reader': { const door = w.fac.door(d.door), c = w.card(w.player.selectedCardId()); return 'Приложить карту [' + (c ? 'L' + c.level + ' · ' + c.ownerName : 'нет карты') + ']\n' + door.name + ' · допуск ' + S.describeReq(door.reqFrom(d.side)); }
      case 'terminal': return 'Терминал дежурного\nкамеры · журнал доступа · события · персонал · рапорт';
      case 'checkpoint': { const t = w.tasks.firstActive('player', 'Patrol'); const inR = t && t.checkpoints.indexOf(d.id) >= 0 && t.done.indexOf(d.id) < 0; return 'Отметиться: «' + d.label + '»' + (inR ? '\n(входит в текущий обход)' : ''); }
      case 'window': return 'Наблюдать за SCP-L-001 через окно';
      case 'npc': { const n = w.npc(d.id); return n ? 'Говорить: ' + n.displayName + '\n' + S.ROLE_NAMES[n.role] + ' · ' + (n.label || S.ACT_NAMES[n.activity]) : ''; }
      case 'card': { const c = w.card(d.id); return c ? 'Подобрать ключ-карту: L' + c.level + ' · ' + c.ownerName + (c.revoked ? ' (аннулирована)' : '') : ''; }
      case 'anomaly': return 'Наблюдать: SCP-L-001';
    }
    return '';
  }
  function interact(d) {
    const w = G.world;
    switch (d.kind) {
      case 'reader': {
        const id = w.player.selectedCardId(); if (!id) { UI.msg('У вас нет ключ-карты', '#ff6a5c'); return; }
        const r = w.presentCard(d.door, id, 'player', d.side), door = w.fac.door(d.door);
        Audio.play(S.isSuccess(r) ? 'ok' : r === S.R.Await ? 'wait' : 'no', door.pos);
        UI.msg(door.name + ': ' + S.RESULT_TEXT[r], S.isSuccess(r) ? '#7dff9a' : r === S.R.Await ? '#ffd76b' : '#ff6a5c'); break;
      }
      case 'terminal': Terminal.open(); break;
      case 'checkpoint': { const r = w.checkpoint(d.id); if (r) UI.msg(r, '#e8d77a'); Audio.play('ok'); break; }
      case 'window': case 'anomaly': UI.dialogue('Наблюдение: SCP-L-001 «Счетовод»', [w.observe('SCP-L-001', false)]); break;
      case 'npc': { const n = w.npc(d.id); if (n) UI.dialogue(n.displayName, w.talk(d.id)); break; }
      case 'card': { if (w.pickUp(d.id)) { const c = w.card(d.id); UI.msg('Подобрана карта L' + c.level + ' · ' + c.ownerName + '. Использование чужой карты попадает в журнал.', '#ffd76b'); } break; }
    }
  }

  // ------------------------------------------------------------------ input
  const Input = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, run: false, use: false, flash: false, card: false, count: false, pause: false, keys: new Set(), lookAcc: { x: 0, y: 0 }, stick: { x: 0, y: 0 }, touchRun: false, taps: {} };
  window.addEventListener('keydown', e => {
    Input.keys.add(e.code);
    const map = { KeyE: 'use', KeyF: 'flash', KeyQ: 'card', KeyC: 'count', Escape: 'pause', Tab: 'pause' };
    if (map[e.code]) { Input.taps[map[e.code]] = true; if (e.code === 'Tab') e.preventDefault(); }
    Audio.start();
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  const canvasEl = renderer.domElement; let mouseDrag = false;
  canvasEl.addEventListener('mousedown', () => { Audio.start(); if (!G.playing || settings.touch) return; mouseDrag = true; try { const r = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* pointer lock unavailable: drag to look */ } });
  window.addEventListener('mouseup', () => { mouseDrag = false; });
  window.addEventListener('mousemove', e => { if (!G.playing || settings.touch) return; if (document.pointerLockElement === canvasEl || mouseDrag) { Input.lookAcc.x += e.movementX * 0.12; Input.lookAcc.y += e.movementY * 0.12; } });
  // touch: left half joystick, right half look, buttons
  const zoneL = $('zoneL'), zoneR = $('zoneR'), stick = $('stick'), knob = $('knob'); let stickId = null, stickO = null, lookId = null, lookLast = null;
  zoneL.addEventListener('pointerdown', e => { Audio.start(); if (stickId !== null) return; stickId = e.pointerId; zoneL.setPointerCapture(e.pointerId); stickO = { x: e.clientX, y: e.clientY }; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; });
  zoneL.addEventListener('pointermove', e => { if (e.pointerId !== stickId) return; let dx = e.clientX - stickO.x, dy = e.clientY - stickO.y; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; const v = Math.hypot(dx, dy) / m; Input.stick = v < 0.12 ? { x: 0, y: 0 } : { x: dx / m, y: -dy / m }; });
  const endStick = e => { if (e.pointerId !== stickId) return; stickId = null; Input.stick = { x: 0, y: 0 }; knob.style.transform = ''; stick.style.left = ''; stick.style.top = ''; };
  zoneL.addEventListener('pointerup', endStick); zoneL.addEventListener('pointercancel', endStick);
  zoneR.addEventListener('pointerdown', e => { Audio.start(); if (lookId !== null) return; lookId = e.pointerId; zoneR.setPointerCapture(e.pointerId); lookLast = { x: e.clientX, y: e.clientY }; });
  zoneR.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; const k = 170 / Math.max(1, window.innerHeight); Input.lookAcc.x += (e.clientX - lookLast.x) * k; Input.lookAcc.y += (e.clientY - lookLast.y) * k; lookLast = { x: e.clientX, y: e.clientY }; });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; };
  zoneR.addEventListener('pointerup', endLook); zoneR.addEventListener('pointercancel', endLook);
  const tap = (id, name) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); Audio.start(); Input.taps[name] = true; $(id).classList.add('on'); setTimeout(() => $(id).classList.remove('on'), 140); });
  tap('bUse', 'use'); tap('bLight', 'flash'); tap('bCard', 'card'); tap('bCount', 'count');
  $('bRun').addEventListener('pointerdown', e => { e.preventDefault(); Input.touchRun = !Input.touchRun; $('bRun').classList.toggle('on', Input.touchRun); });
  $('bMenu').addEventListener('click', () => { Input.taps.pause = true; });
  function readInput() {
    const k = Input.keys; let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1; if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1; if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    mx += Input.stick.x; my += Input.stick.y; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    Input.move = { x: mx, y: my }; Input.look = { x: Input.lookAcc.x, y: Input.lookAcc.y }; Input.lookAcc = { x: 0, y: 0 };
    Input.run = k.has('ShiftLeft') || k.has('ShiftRight') || Input.touchRun;
    for (const n of ['use', 'flash', 'card', 'count', 'pause']) { Input[n] = !!Input.taps[n]; Input.taps[n] = false; }
  }

  // ------------------------------------------------------------------ UI
  const UI = {
    msg(text, color) { const w = G.world, el = document.createElement('div'); el.innerHTML = '<span class="t">' + (w ? S.fmtTime(w.now) : '') + '</span>' + esc(text); el.style.color = color || '#e6e8e3'; el.dataset.until = performance.now() + 12000; const f = $('feed'); f.appendChild(el); while (f.children.length > 5) f.removeChild(f.firstChild); },
    dialogue(title, lines) { $('dTitle').textContent = title; $('dBody').textContent = lines.join('\n'); $('dialogue').hidden = false; },
    closeDialogue() { $('dialogue').hidden = true; },
    modal() { return !$('menu').hidden || !$('pause').hidden || !$('settings').hidden || !$('dialogue').hidden || !$('death').hidden || !$('terminal').hidden; },
    paused() { return !$('pause').hidden || !$('settings').hidden || !$('death').hidden || !$('menu').hidden; },
    refreshSettings() { $('sSens').textContent = settings.sens.toFixed(1); $('sQuality').textContent = QUALITY[settings.quality].name; $('sVolume').textContent = Math.round(settings.volume * 100) + '%'; $('sInvert').textContent = settings.invert ? 'ВКЛ' : 'ВЫКЛ'; $('sTouch').textContent = settings.touch ? 'ВКЛ' : 'ВЫКЛ'; },
    syncTouch() {
      const term = !$('terminal').hidden, on = G.playing && settings.touch && !term && $('pause').hidden && $('settings').hidden && $('death').hidden;
      $('touch').hidden = !on; $('bMenu').hidden = !G.playing || term; $('hud').hidden = !G.playing || term;
    }
  };
  const ALERT_COLORS = ['#3fd16a', '#f2d23f', '#ff8c26', '#ff3333'];
  let hudT = 0;
  function updateHud(dt, gameplay) {
    const w = G.world, p = w.player, room = w.fac.room(p.roomId);
    $('clock').textContent = S.fmtStamp(w.now) + ' · ' + (room ? room.name : '—');
    $('status').style.borderLeftColor = ALERT_COLORS[w.alert.level];
    $('alert').innerHTML = '<span style="color:' + ALERT_COLORS[w.alert.level] + '">ТРЕВОГА: ' + S.ALERT_NAMES[w.alert.level] + '</span> — ' + esc(w.alert.reason);
    $('hp').style.width = Math.max(0, p.health) + '%'; $('stam').style.width = (P.stamina * 100) + '%';
    const c = w.card(p.selectedCardId());
    $('card').textContent = c ? 'Карта: L' + c.level + ' · ' + c.ownerName + (p.cards.length > 1 ? '  (' + (p.sel % p.cards.length + 1) + '/' + p.cards.length + ')' : '') + (c.revoked ? ' · АННУЛИРОВАНА' : '') : 'Карты нет';
    $('bCard').innerHTML = 'КАРТА<br>' + (c ? 'L' + c.level : '—');
    $('prompt').textContent = gameplay && P.current ? promptFor(P.current) : '';
    $('counting').textContent = p.counting ? 'ПРОТОКОЛ СЧЁТА: ' + S.numWords(Math.floor(p.countSec / 1.2) % 100 + 1) + '… — не двигайтесь' : '';
    const can = !p.dead && countable(); $('bCount').hidden = !(can || p.counting); $('bCount').textContent = p.counting ? 'СТОП' : 'СЧЁТ';
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.5; let h = '<h3>ЗАДАЧИ СМЕНЫ</h3>', n = 0;
      for (const t of w.tasks.activeFor('player')) {
        if (n++ >= 3) break;
        h += '<div class="t">• ' + esc(t.title) + ' <span class="p">' + w.tasks.progress(t) + '</span> <span class="n">(' + S.durationText(t.deadline - w.now) + ')</span>';
        if (t.kind === 'Patrol') { const rest = t.checkpoints.filter(x => t.done.indexOf(x) < 0).map(x => w.fac.poi(x).label); if (rest.length) h += '<div class="n">далее: ' + esc(rest.join(' → ')) + '</div>'; }
        else if (n === 1) h += '<div class="n">' + esc(t.desc) + '</div>';
        h += '</div>';
      }
      if (!n) h += '<div class="n">Нет активных задач. Следите за сектором.</div>';
      h += '<div class="n">Выполнено ' + p.done + ' · провалено ' + p.failed + ' · репутация ' + p.rep + '</div>';
      $('tasks').innerHTML = h;
    }
    const now = performance.now();
    for (const el of Array.from($('feed').children)) { const left = +el.dataset.until - now; if (left <= 0) el.remove(); else if (left < 2000) el.style.opacity = left / 2000; }
    const dmg = $('damage'); const targetA = p.health < 30 ? 0.35 : 0; G.dmg = Math.max(targetA, (G.dmg || 0) - dt * 0.6); if (p.health < (G.lastHp || 100) - 0.5) G.dmg = 0.85; G.lastHp = p.health; dmg.style.opacity = G.dmg;
    updateSpeech();
  }
  const speechPool = [];
  function updateSpeech() {
    const w = G.world, box = $('speech'); let used = 0; const v3 = new T.Vector3();
    if (!G.cctv) for (const nv of G.npcViews) {
      const n = nv.npc; if (used >= 6 || !nv.root.visible || !n.bark || n.barkUntil < w.now) continue;
      const hw = nv.rig.headWorld(v3), dist = hw.distanceTo(camera.position); if (dist > 11) continue;
      hw.project(camera); if (hw.z > 1) continue;
      let el = speechPool[used]; if (!el) { el = document.createElement('div'); el.className = 'speech'; box.appendChild(el); speechPool.push(el); }
      el.hidden = false; el.innerHTML = '<b>' + esc(n.shortName) + ':</b> ' + esc(n.bark);
      el.style.left = ((hw.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - hw.y) / 2 * window.innerHeight) + 'px'; used++;
    }
    for (let i = used; i < speechPool.length; i++) speechPool[i].hidden = true;
  }
  function processNotifications() {
    const w = G.world;
    while (w.notify.length) {
      const e = w.notify.shift(); let color = '#e6e8e3', prefix = '';
      if (e.type === 'TaskIssued') { color = '#f2d873'; prefix = 'Новая задача: '; }
      else if (e.type === 'TaskCompleted') color = '#8dff9e';
      else if (e.type === 'TaskFailed') color = '#ff7a66';
      else if (e.type === 'PatrolCheckpoint' || e.type === 'Observation' || e.type === 'DoorAccess') continue;
      else { if (e.severity <= 0 && !e.pub && e.type !== 'CountingProtocol') continue; color = e.severity >= 3 ? '#ff4d4d' : e.severity === 2 ? '#ff9a59' : '#e6e3bf'; }
      if (e.pub) { prefix = '[ОПОВЕЩЕНИЕ] '; Audio.play('chime', null, 0.5); }
      UI.msg(prefix + e.text, color);
    }
  }

  // ------------------------------------------------------------------ terminal
  const TABS = [['cams', 'КАМЕРЫ'], ['access', 'ДОСТУП'], ['events', 'СОБЫТИЯ'], ['staff', 'ПЕРСОНАЛ'], ['tasks', 'ЗАДАЧИ'], ['report', 'РАПОРТ'], ['archive', 'АРХИВ SCP']];
  const Terminal = {
    tab: 'cams', refresh: 0, lastCam: null, viewT: 0, report: '',
    build() {
      const box = $('tTabs');
      for (const [id, name] of TABS) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = name; b.dataset.tab = id; b.addEventListener('click', () => this.select(id)); box.appendChild(b); }
      $('tClose').addEventListener('click', () => this.close());
      $('camPrev').addEventListener('click', () => { G.camIndex = (G.camIndex + G.world.cams.length - 1) % G.world.cams.length; this.viewT = 0; });
      $('camNext').addEventListener('click', () => { G.camIndex = (G.camIndex + 1) % G.world.cams.length; this.viewT = 0; });
      $('camObserve').addEventListener('click', () => { const w = G.world, cam = w.cams[G.camIndex]; const a = w.anomalies.find(x => x.agent.roomId === cam.roomId); UI.dialogue('Камера ' + cam.name, [a ? w.observe(a.id, true) : 'Объекта в поле зрения камеры нет.']); });
      $('tText').addEventListener('click', e => { if (e.target.id === 'sendReport') { this.report = G.world.report(); Audio.play('ok'); this.refresh = 0; } });
    },
    open() { $('terminal').hidden = false; this.select(this.tab); },
    close() { $('terminal').hidden = true; G.cctv = false; G.extraRoom = null; $('terminal').classList.remove('cctv'); },
    select(id) {
      this.tab = id; this.refresh = 0; this.report = id === 'report' ? this.report : '';
      for (const b of $('tTabs').children) b.classList.toggle('on', b.dataset.tab === id);
      const cams = id === 'cams'; $('tCam').hidden = !cams; $('tText').hidden = cams; G.cctv = cams; $('terminal').classList.toggle('cctv', cams); this.viewT = 0;
    },
    tick(dt) {
      if ($('terminal').hidden) return;
      const w = G.world; $('tHead').textContent = 'ТЕРМИНАЛ ДЕЖУРНОГО · СЕКТОР Б-3 · ' + S.fmtStamp(w.now) + ' · ТРЕВОГА ' + S.ALERT_NAMES[w.alert.level];
      if (this.tab === 'cams') return this.cams(dt);
      this.refresh -= dt; if (this.refresh > 0) return; this.refresh = 1;
      $('tText').innerHTML = this[this.tab](w);
    },
    cams(dt) {
      const w = G.world, cam = w.cams[G.camIndex]; G.extraRoom = cam.roomId;
      if (this.lastCam !== cam.id) { this.lastCam = cam.id; this.viewT = 0; }
      this.viewT += dt; const counted = w.player.camsViewed.indexOf(cam.id) >= 0; if (this.viewT > 1.5 && !counted) w.viewedCamera(cam.id);
      $('camOver').innerHTML = esc(cam.name) + '\n' + S.fmtStamp(w.now) + ' ' + ((performance.now() / 700 | 0) % 2 ? '<span style="color:#ff4040">● ЗАПИСЬ</span>' : '');
      let t = '<b>' + esc(cam.name) + '</b>\n' + esc(w.roomName(cam.roomId)) + '\n' + (counted ? '<span style="color:#8dff9e">Проверена в эту смену</span>' : '<span style="color:#ffd479">Проверка…</span>') + '\n\nВ кадре:\n';
      if (!cam.visible.length) t += '  никого\n';
      for (const id of cam.visible) { const n = w.npc(id), a = w.anomaly(id); t += '  • ' + esc(w.nameOf(id)) + (n ? ' — ' + esc((S.ACT_NAMES[n.activity] || '').toLowerCase()) : a ? ' — <span style="color:#ff8a7a">' + esc(a.beh.status) + '</span>' : '') + '\n'; }
      t += '\nКамера ' + (G.camIndex + 1) + ' из ' + w.cams.length;
      $('camText').innerHTML = t; $('camObserve').hidden = w.fac.room(cam.roomId).type !== 'Containment';
    },
    access(w) {
      let h = '<b>ЖУРНАЛ СЧИТЫВАТЕЛЕЙ</b> (новые сверху)\n\n';
      for (let i = w.accessLog.length - 1, n = 0; i >= 0 && n < 120; i--, n++) { const e = w.accessLog[i], d = w.fac.door(e.door), cls = S.isSuccess(e.r) ? 'g' : e.r === S.R.Await ? 'w' : 'r'; h += S.fmtStamp(e.t) + '  ' + esc(d ? d.name : e.door) + ' — ' + esc(e.owner) + ' — <span class="' + cls + '">' + S.RESULT_TEXT[e.r] + '</span>\n'; }
      return h;
    },
    events(w) {
      let h = '<b>СОБЫТИЯ, ЗАФИКСИРОВАННЫЕ СИСТЕМАМИ СЕКТОРА</b>\n\n', n = 0;
      for (let i = w.events.recent.length - 1; i >= 0 && n < 120; i--) {
        const e = w.events.recent[i], cov = e.roomId && w.roomCovered(e.roomId);
        const rel = e.pub || e.actor === 'player' || e.target === 'player' || ['DoorDenied', 'ReaderMalfunction', 'Report', 'SuspiciousActivity', 'ContainmentWarning'].indexOf(e.type) >= 0 || (cov && ['AnomalyBehaviour', 'Conflict', 'Injury', 'Treatment'].indexOf(e.type) >= 0);
        if (!rel || e.type === 'Conversation') continue; n++;
        const cls = e.severity >= 3 ? 'r' : e.severity === 2 ? 'r' : e.severity === 1 ? 'w' : 'g';
        h += S.fmtStamp(e.time) + ' <span class="' + cls + '">[' + (S.EV_NAMES[e.type] || e.type) + ']</span> ' + esc(e.text) + '\n';
      }
      return h;
    },
    staff(w) {
      let h = '<b>ПЕРСОНАЛ СЕКТОРА</b>\n<span class="d">Система знает только то, что видели камеры. График — это план, а не факт.</span>\n\n';
      for (const n of w.npcs) {
        const b = n.schedule.at(w.clock.mod), room = b ? (b.roomId === '@bed' ? (w.fac.poi(n.bedPoi) || {}).roomId : b.roomId) : null;
        let seen = 'не фиксировался'; for (const c of w.cams) if (c.visible.indexOf(n.id) >= 0) seen = '<span class="g">сейчас: ' + esc(c.name) + '</span>';
        if (seen === 'не фиксировался') for (let i = w.camLog.length - 1; i >= 0; i--) if (w.camLog[i].subj === n.id) { const c = w.cams.find(x => x.id === w.camLog[i].cam); seen = S.fmtTime(w.camLog[i].time) + ', ' + esc(c ? c.name : ''); break; }
        const card = w.card(n.cardId);
        h += '<b>' + esc(n.displayName) + '</b> · ' + S.ROLE_NAMES[n.role] + ' · карта L' + (card ? card.level : '?') + '\n   по графику: ' + esc(b ? b.label : '—') + ' (' + esc(w.roomName(room)) + ')\n   камеры: ' + seen + '\n';
      }
      return h;
    },
    tasks(w) {
      let h = '<b>ЗАДАЧИ И ЖУРНАЛ</b>\n\n';
      for (const t of w.tasks.activeFor('player')) h += '<span class="w">АКТИВНО</span> ' + esc(t.title) + ' ' + w.tasks.progress(t) + ' — срок ' + S.fmtTime(t.deadline) + '\n   ' + esc(t.desc) + '\n';
      h += '\n<b>Последние задачи комплекса</b>\n';
      let n = 0; for (let i = w.tasks.list.length - 1; i >= 0 && n < 14; i--) { const t = w.tasks.list[i]; if (t.status === 'Active') continue; n++; h += S.fmtStamp(t.issued) + ' ' + (t.status === 'Completed' ? '<span class="g">выполнено</span>' : '<span class="r">провалено</span>') + ' ' + esc(t.title) + ' (' + esc(t.who === 'player' ? 'вы' : w.nameOf(t.who)) + ')\n'; }
      h += '\n<b>Личный журнал</b>\n'; const j = w.player.journal; for (let i = j.length - 1; i >= 0 && i >= j.length - 10; i--) h += esc(j[i]) + '\n';
      return h;
    },
    report() {
      return 'Рапорт уходит диспетчеру смены. Диспетчер действует только по вашим личным наблюдениям: перед рапортом осмотрите объект через окно наблюдательного пункта или по камере К-06.\n\n<button class="tbtn" id="sendReport">ПОДАТЬ РАПОРТ</button>\n\n' + (this.report ? '<span class="w">Ответ диспетчера: ' + esc(this.report) + '</span>' : '');
    },
    archive() {
      let h = '<b>АРХИВ АНОМАЛИЙ</b>\n\n';
      for (const a of S.Content.ARCHIVE) h += '<b>' + a.id + ' «' + esc(a.name) + '»</b> · класс ' + a.cls + ' · ' + a.kind + ' · <span class="g">поведение смоделировано</span>\n' + esc(a.desc) + '\n<span class="d">Содержание:</span> ' + esc(a.contain) + '\n<span class="d">Триггеры:</span> ' + esc(a.triggers) + '\n\n';
      return h + '<span class="d">Остальные записи каталога (120 объектов) будут добавлены, когда в проект поступит файл каталога.</span>';
    }
  };
  Terminal.build();

  // ------------------------------------------------------------------ world construction
  function buildViews() {
    if (G.fv) scene.remove(G.fv.root);
    for (const v of G.npcViews) scene.remove(v.root);
    if (G.tally) scene.remove(G.tally.root);
    for (const c of G.cams) scene.remove(c.group);
    for (const k in (G.cardMeshes || {})) scene.remove(G.cardMeshes[k]);
    const w = G.world; G.fv = new S.Render.FacilityView(w, scene); G.npcViews = []; G.cams = []; G.cardMeshes = {};
    for (const n of w.npcs) { const rig = new S.Render.Humanoid(n, G.fv.m); scene.add(rig.root); G.npcViews.push({ npc: n, rig, root: rig.root, proxy: rig.proxy, prev: S.V.copy(n.agent.pos), cur: S.V.copy(n.agent.pos), py: n.agent.yaw, cy: n.agent.yaw, last: S.V.copy(n.agent.pos), sp: 0, step: 0 }); }
    const a = w.anomalies[0]; G.tally = new S.Render.TallymanView(a, G.fv.m, w, G.fv); scene.add(G.tally.root);
    Object.assign(G.tally, { prev: S.V.copy(a.agent.pos), cur: S.V.copy(a.agent.pos), py: a.agent.yaw, cy: a.agent.yaw, last: S.V.copy(a.agent.pos) });
    for (const c of w.cams) { const m = S.Render.cameraModel(c, G.fv.m); scene.add(m.group); G.cams.push(m); }
    const p = w.player; P.yaw = p.yaw; P.pitch = p.pitch || 0; P.stamina = 1;
  }
  function syncCards() {
    const w = G.world, fv = G.fv;
    for (const id in w.cards) {
      const c = w.cards[id], show = !c.holder && c.room, has = !!G.cardMeshes[id];
      if (show && !has) {
        // Invisible, generous touch target with the small visible card inside it.
        const proxy = new T.Mesh(new T.BoxGeometry(0.4, 0.2, 0.4), new T.MeshBasicMaterial({ visible: false }));
        proxy.position.set(c.pos.x, 0.1, c.pos.z); proxy.userData.interact = { kind: 'card', id };
        const card = new T.Mesh(new T.BoxGeometry(0.086, 0.006, 0.054), fv.m.colored([0xf2730f, 0xbfbfbf, 0x408cf2, 0x4dcc66, 0xe6bf33, 0xd93340][c.level]));
        card.position.y = -0.095; card.rotation.y = (id.length * 1.7) % 3; proxy.add(card); scene.add(proxy); G.cardMeshes[id] = proxy;
      }
      else if (!show && has) { scene.remove(G.cardMeshes[id]); delete G.cardMeshes[id]; }
    }
  }

  // ------------------------------------------------------------------ visibility & lights
  function computeVisible() {
    const w = G.world, vis = new Set(), camPos = camera.position;
    const expand = (start, preload) => {
      if (!start) return; vis.add(start); let frontier = [start];
      for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const next = [];
        for (const rid of frontier) {
          const r = w.fac.room(rid);
          for (const v of r.visibleRooms) if (!vis.has(v)) { vis.add(v); next.push(v); }
          for (const did of r.doorIds) {
            const d = w.fac.door(did), o = d.other(rid), see = d.kind === 'Archway' || d.openness > 0.02;
            if (see) { if (!vis.has(o)) { vis.add(o); next.push(o); } }
            else if (preload && depth === 0) { const dx = d.pos.x - camPos.x, dz = d.pos.z - camPos.z; if (dx * dx + dz * dz < 25) vis.add(o); }
          }
        }
        frontier = next;
      }
    };
    expand(w.player.roomId, true); if (G.cctv && G.extraRoom) expand(G.extraRoom, false);
    G.visible = vis;
    for (const id in G.fv.rooms) { const rv = G.fv.rooms[id], on = vis.has(id); if (rv.group.visible !== on) rv.group.visible = on; }
  }
  function assignLights(viewPos) {
    const w = G.world, q = QUALITY[settings.quality], cand = [], now = w.now, t = performance.now() / 1000;
    for (const id of G.visible) {
      const rv = G.fv.rooms[id]; if (!rv) continue; const r = rv.room;
      const flick = r.isFlickering(now), on = r.lightsOn && (!flick || Math.sin(t * 37 + id.length) * Math.sin(t * 13.3) > -0.1);
      rv.fixtures.material = on ? G.fv.m.light : G.fv.m.lightOff;
      if (!on) continue;
      for (const l of rv.lights) cand.push(l);
    }
    cand.sort((a, b) => ((a.x - viewPos.x) ** 2 + (a.z - viewPos.z) ** 2) - ((b.x - viewPos.x) ** 2 + (b.z - viewPos.z) ** 2));
    for (let i = 0; i < pool.length; i++) {
      const l = pool[i], c = i < q.lights ? cand[i] : null;
      if (c) { l.position.set(c.x, c.y, c.z); l.color.setHex(c.color); l.intensity = c.intensity; l.distance = c.range; } else l.intensity = 0;
    }
    const alarm = w.alert.level >= 2, pulse = Math.abs(Math.sin(t * (w.alert.level >= 3 ? 4 : 2)));
    ambient.color.setRGB(0.165 + (alarm ? pulse * 0.22 : 0), 0.176, 0.2);
    for (const b of G.fv.beacons) b.material = alarm && pulse > 0.5 ? G.fv.m.alarmOn : G.fv.m.alarm;
  }

  // ------------------------------------------------------------------ main loop
  let lastT = performance.now(), saveT = 120;
  function frame(nowT) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (nowT - lastT) / 1000); lastT = nowT;
    readInput();
    if (!G.playing || !G.world) { renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.clear(); return; }
    const w = G.world;
    if (Input.pause) {
      if (!$('terminal').hidden) Terminal.close(); else if (!$('dialogue').hidden) UI.closeDialogue();
      else if (!$('settings').hidden) { $('settings').hidden = true; } else if (!$('pause').hidden) $('pause').hidden = true; else if (!w.player.dead) openPause();
    }
    const paused = UI.paused(), gameplay = !UI.modal();
    updatePlayer(dt, gameplay);
    if (!paused) {
      G.acc += dt * G.timeScale; let steps = 0;
      while (G.acc >= S.World.FIXED && steps++ < 60) {
        w.tick(S.World.FIXED); G.acc -= S.World.FIXED;
        for (const v of G.npcViews) { v.prev = v.cur; v.py = v.cy; v.cur = S.V.copy(v.npc.agent.pos); v.cy = v.npc.agent.yaw; if (S.V.distXZ(v.prev, v.cur) > 3) v.prev = v.cur; }
        const tv = G.tally; tv.prev = tv.cur; tv.py = tv.cy; tv.cur = S.V.copy(w.anomalies[0].agent.pos); tv.cy = w.anomalies[0].agent.yaw; if (S.V.distXZ(tv.prev, tv.cur) > 3) tv.prev = tv.cur;
      }
      if (steps >= 60) G.acc = 0;
    }
    const alpha = Math.min(1, G.acc / S.World.FIXED), t = nowT / 1000;
    computeVisible();
    const camPos = camera.position;
    for (const v of G.npcViews) {
      const x = v.prev.x + (v.cur.x - v.prev.x) * alpha, z = v.prev.z + (v.cur.z - v.prev.z) * alpha;
      const yaw = v.py + S.deltaAngle(v.py, v.cy) * alpha;
      v.root.position.set(x, 0, z); v.root.rotation.y = yaw * D2R;
      const moved = Math.hypot(x - v.last.x, z - v.last.z); v.last = { x, y: 0, z }; v.sp += (Math.min(3, dt > 0 ? moved / dt : 0) - v.sp) * Math.min(1, dt * 10);
      const dist = Math.hypot(x - camPos.x, z - camPos.z), vis = G.visible.has(v.npc.agent.roomId) && dist < 42; v.root.visible = vis;
      if (!vis) continue;
      const n = v.npc, posture = n.agent.moving ? 'Standing' : n.posture; let look = 0, target = null;
      if (n.conv) { const o = w.npc(n.conv); if (o) target = o.agent.pos; } else if (dist < 3.5 && !G.cctv && ['Lying', 'Down', 'Counting'].indexOf(posture) < 0) target = w.player.pos;
      if (target) look = S.deltaAngle(yaw, Math.atan2(target.x - x, target.z - z) / D2R);
      v.rig.animate(dt, v.sp, posture, look, t);
      if (v.sp > 0.4 && dist < 12) { v.step += moved; if (v.step > 0.75) { v.step = 0; Audio.play('step', { x, z }, 0.35); } }
    }
    const tv = G.tally, a = w.anomalies[0];
    { const x = tv.prev.x + (tv.cur.x - tv.prev.x) * alpha, z = tv.prev.z + (tv.cur.z - tv.prev.z) * alpha, yaw = tv.py + S.deltaAngle(tv.py, tv.cy) * alpha;
      tv.root.position.set(x, 0, z); tv.root.rotation.y = yaw * D2R; const moved = Math.hypot(x - tv.last.x, z - tv.last.z); tv.last = { x, y: 0, z };
      tv.root.visible = G.visible.has(a.agent.roomId);
      if (tv.root.visible || true) tv.animate(dt, dt > 0 ? Math.min(3, moved / dt) : 0, w, yaw, t, (name, pos) => Audio.play(name, pos, name === 'knock' ? 0.9 : 0.5)); }
    for (const c of G.cams) { c.pivot.rotation.y = c.cam.yaw * D2R; c.pivot.rotation.x = c.cam.pitch * D2R; c.led.visible = (t % 1.6) < 0.8; }
    G.fv.updateDoors(w.realTime, w.now, (kind, pos) => Audio.play(kind, pos, 0.7));
    syncCards();
    processNotifications();
    updateHud(dt, gameplay);
    Terminal.tick(dt);
    Audio.tick(w, dt);
    UI.syncTouch();
    // render
    renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.clear();
    if (G.cctv) {
      const cam = G.cams[G.camIndex], lw = cam.lens.getWorldPosition(new T.Vector3()), fw = new T.Vector3(0, 0, 1).applyQuaternion(cam.pivot.getWorldQuaternion(new T.Quaternion()));
      cctvCam.position.copy(lw); cctvCam.lookAt(lw.clone().add(fw));
      const r = $('feedArea').getBoundingClientRect(), H = window.innerHeight;
      cctvCam.aspect = r.width / Math.max(1, r.height); cctvCam.updateProjectionMatrix();
      assignLights(lw);
      renderer.setScissorTest(true); renderer.setScissor(r.left, H - r.bottom, r.width, r.height); renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.render(scene, cctvCam); renderer.setScissorTest(false);
    } else { assignLights(camPos); renderer.render(scene, camera); }
    if (w.player.dead && $('death').hidden) { const ev = w.events.recent.slice().reverse().find(e => e.type === 'Injury' && e.target === 'player'); $('deathCause').textContent = ev ? ev.text : ''; $('death').hidden = false; }
    saveT -= dt; if (saveT <= 0) { saveT = 120; saveGame(false); }
  }
  renderer.autoClear = false;

  // ------------------------------------------------------------------ flow
  function hasSave() { return !!(store.get(SAVE_KEY) || store.get(BAK_KEY)); }
  function saveGame(notify) {
    const w = G.world; if (!w || w.player.dead) return;
    const json = w.save(), prev = store.get(SAVE_KEY);
    if (prev) store.set(BAK_KEY, prev);
    const ok = store.set(SAVE_KEY, json);
    if (notify) UI.msg(ok ? 'Игра сохранена (' + S.fmtStamp(w.now) + ')' : 'Сохранение недоступно в этом окне браузера', ok ? '#8dff9e' : '#ff6a5c');
  }
  function begin(world) {
    G.world = world; G.acc = 0; G.timeScale = 1; G.camIndex = 0; buildViews();
    for (const id of ['menu', 'pause', 'settings', 'dialogue', 'death', 'terminal']) $(id).hidden = true;
    G.cctv = false; G.playing = true; $('hud').hidden = false; UI.syncTouch(); $('pSpeed').textContent = 'СКОРОСТЬ ВРЕМЕНИ: ×1';
  }
  function newGame() {
    Audio.start();
    begin(S.Content.createWorld((Date.now() >>> 0) ^ 0x5bd1e995));
    UI.msg('Смена началась. Вы — сержант охраны сектора Б-3. Задачи — справа вверху. Терминал дежурного — на стене КПП справа.', '#f2d873');
    saveGame(false);
  }
  function loadGame() {
    Audio.start();
    for (const k of [SAVE_KEY, BAK_KEY]) { const s = store.get(k); if (!s) continue; try { begin(S.World.load(s)); UI.msg('Сохранение загружено: ' + S.fmtStamp(G.world.now), '#fff'); return true; } catch (e) { console.warn('save unreadable', e); } }
    UI.msg('Сохранение не найдено', '#ff6a5c'); return false;
  }
  function toMenu() { if (G.world && !G.world.player.dead) saveGame(false); G.playing = false; $('hud').hidden = true; for (const id of ['pause', 'settings', 'dialogue', 'death', 'terminal']) $(id).hidden = true; Terminal.close(); showMenu(); UI.syncTouch(); }
  function showMenu() { $('menu').hidden = false; $('mContinue').disabled = !hasSave(); }
  function openPause() { $('pause').hidden = false; try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ } }
  $('mNew').addEventListener('click', newGame);
  $('mContinue').addEventListener('click', loadGame);
  $('mSettings').addEventListener('click', () => { UI.refreshSettings(); $('settings').hidden = false; });
  $('mHelp').addEventListener('click', () => UI.dialogue('Как играть', [
    'Телефон: левая половина экрана — джойстик, правая — обзор. ИСПОЛЬЗ. — приложить карту к считывателю, открыть терминал, поговорить, отметиться на точке обхода. БЕГ включает и выключает бег. СЧЁТ появляется, когда объект в прямой видимости.',
    'Компьютер: WASD — движение, мышь — обзор (кликните по экрану), E — использовать, Shift — бег, F — фонарь, Q — карта, C — протокол счёта, Esc — меню.',
    'Ваша работа: обходы, проверка камер, наблюдение за SCP-L-001 и рапорты. Комплекс живёт сам: следите, чтобы учёные проводили сеансы счёта, а дверь камеры не открывали, когда объект возбуждён.',
    'Если «Счетовод» вышел: протокол счёта (стоять неподвижно до 10 м от него) замедляет и успокаивает его. Не подходите вплотную.'
  ]));
  $('pResume').addEventListener('click', () => { $('pause').hidden = true; });
  $('pSave').addEventListener('click', () => saveGame(true));
  $('pLoad').addEventListener('click', loadGame);
  $('pJournal').addEventListener('click', () => { const j = G.world.player.journal; UI.dialogue('Журнал охранника', j.slice(-14).reverse()); });
  $('pSettings').addEventListener('click', () => { UI.refreshSettings(); $('settings').hidden = false; });
  $('pSpeed').addEventListener('click', () => { G.timeScale = G.timeScale === 1 ? 2 : G.timeScale === 2 ? 4 : 1; $('pSpeed').textContent = 'СКОРОСТЬ ВРЕМЕНИ: ×' + G.timeScale; });
  $('pMenu').addEventListener('click', toMenu);
  $('sBack').addEventListener('click', () => { $('settings').hidden = true; saveSettings(); });
  for (const b of document.querySelectorAll('#settings button[data-s]')) b.addEventListener('click', () => {
    const k = b.dataset.s, d = +b.dataset.d;
    if (k === 'sens') settings.sens = Math.round(S.clamp(settings.sens + d * 0.1, 0.2, 3) * 10) / 10;
    if (k === 'quality') { settings.quality = S.clamp(settings.quality + d, 0, 2); resize(); }
    if (k === 'volume') settings.volume = Math.round(S.clamp(settings.volume + d * 0.1, 0, 1) * 10) / 10;
    if (k === 'invert') settings.invert = !settings.invert;
    if (k === 'touch') settings.touch = !settings.touch;
    UI.refreshSettings(); UI.syncTouch(); saveSettings();
  });
  $('dClose').addEventListener('click', () => UI.closeDialogue());
  $('xLoad').addEventListener('click', () => { if (!loadGame()) newGame(); });
  $('xNew').addEventListener('click', newGame);
  $('xMenu').addEventListener('click', () => { $('death').hidden = true; toMenu(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.playing) saveGame(false); });
  window.addEventListener('pagehide', () => { if (G.playing) saveGame(false); });

  // Keep the running shift across page updates in the viewer.
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: G.playing && G.world && !G.world.player.dead ? G.world.save() : null }));
  const boot = data => {
    showMenu();
    if (data && data.save) { try { begin(S.World.load(data.save)); } catch (e) { console.warn(e); } }
    requestAnimationFrame(frame);
  };
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
  window.__scp = G; G.P = P; // debugging hook
})();
