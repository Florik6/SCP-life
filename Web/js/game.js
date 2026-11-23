/* SCP LIFE 2.0 — browser runtime: 3D menu, profession selection and character creation, input, player, interactions,
   compact HUD, PDA, role terminals, perception overlays, rendering loop with day/night, sleep, saves. */
(function () {
  'use strict';
  const S = window.SCP, T = window.THREE, A = S.Audio, $ = id => document.getElementById(id);
  const D2R = Math.PI / 180, EYE = 1.62, WALK = 2.3, RUN = 4.2, RADIUS = 0.3, REACH = 2.7;
  const DEATH_MODES = ['ЗАГРУЗКА', 'ДРУГОЙ ПЕРСОНАЖ', 'ХАРДКОР'];
  const SAVE_KEY = 'scplife.save.v2', BAK_KEY = 'scplife.save.v2.bak', SET_KEY = 'scplife.settings.v2';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  // ------------------------------------------------------------------ settings
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const settings = Object.assign({ sens: 1.0, fov: 72, quality: isTouch ? 1 : 2, volume: 0.8, music: 0.6, invert: false, touch: isTouch, hud: 1, btn: 1, lefty: false, fx: 1, noflash: false, shake: false, minhud: false, gore: 1, deathMode: 0 }, (() => { try { return JSON.parse(store.get(SET_KEY) || '{}'); } catch (e) { return {}; } })());
  const QUALITY = isTouch ? [{ name: 'Низкое', ratio: 0.55, lights: 3, far: 26, npcs: 10 }, { name: 'Среднее', ratio: 0.75, lights: 4, far: 34, npcs: 16 }, { name: 'Высокое', ratio: 1.0, lights: 6, far: 44, npcs: 28 }]
    : [{ name: 'Низкое', ratio: 0.6, lights: 4, far: 28, npcs: 18 }, { name: 'Среднее', ratio: 0.85, lights: 6, far: 38, npcs: 28 }, { name: 'Высокое', ratio: 1.0, lights: 8, far: 48, npcs: 40 }];
  const saveSettings = () => store.set(SET_KEY, JSON.stringify(settings));
  function applySettings() {
    document.documentElement.style.setProperty('--hud', settings.hud); document.documentElement.style.setProperty('--btn', settings.btn);
    $('touch').classList.toggle('lefty', !!settings.lefty); $('hud').classList.toggle('min', !!settings.minhud);
    A.settings.volume = settings.volume; A.settings.music = settings.music; A.apply();
    camera.fov = settings.fov; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ renderer
  const G = { world: null, fv: null, npcViews: {}, anomViews: [], cams: [], playing: false, acc: 0, timeScale: 1, cctv: false, camIndex: 0, extraRoom: null, visible: new Set(), hallu: [], hold: null, hudHidden: false, ride: null, mode: 'career' };
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050607); $('game').appendChild(renderer.domElement); renderer.autoClear = false;
  const scene = new T.Scene(); scene.fog = new T.Fog(0x080a0c, 10, 40);
  const ambient = new T.AmbientLight(0x2a2d33, 1.0); scene.add(ambient);
  const hemi = new T.HemisphereLight(0x3a3f47, 0x15130f, 0.55); scene.add(hemi);
  const pool = []; for (let i = 0; i < 8; i++) { const l = new T.PointLight(0xffffff, 0, 10, 1.6); scene.add(l); pool.push(l); }
  const camera = new T.PerspectiveCamera(72, 1, 0.05, 45); camera.rotation.order = 'YXZ'; camera.layers.enable(S.Render.HALLU); scene.add(camera);
  // airborne dust around the viewer: denser in technical and heavy zones, visible in the light, drifting with the ventilation
  const Dust = { n: 260, init() { const g = new T.BufferGeometry(), p = new Float32Array(this.n * 3); for (let i = 0; i < this.n; i++) { p[i * 3] = (Math.random() - 0.5) * 8; p[i * 3 + 1] = Math.random() * 3; p[i * 3 + 2] = (Math.random() - 0.5) * 8; } g.setAttribute('position', new T.BufferAttribute(p, 3));
      this.mat = new T.PointsMaterial({ color: 0xe8dfc8, size: 0.018, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }); this.pts = new T.Points(g, this.mat); this.pts.frustumCulled = false; scene.add(this.pts); this.t = 0; },
    tick(dt, w) {
      if (!this.pts) this.init(); const on = settings.quality >= 1 && settings.fx > 0; this.pts.visible = on; if (!on || !w) return;
      const r = w.fac.room(w.player.roomId), dense = r ? ({ tech: 1, heavy: 0.8, null: 1.2, dclass: 0.6 }[r.style] || 0.35) : 0.4, vent = r && w.infra.vents[r.id] && w.infra.vents[r.id].on;
      this.mat.opacity += (dense * 0.42 * (r && r.lightsOn !== false ? 1 : 0.2) - this.mat.opacity) * Math.min(1, dt);
      const P = this.pts.geometry.attributes.position, a = P.array, c = camera.position; this.t += dt;
      for (let i = 0; i < this.n; i++) { const k = i * 3; a[k] += (Math.sin(this.t * 0.3 + i) * 0.03 + (vent ? 0.04 : 0.005)) * dt; a[k + 1] += Math.sin(this.t * 0.21 + i * 1.7) * 0.02 * dt - 0.004 * dt; a[k + 2] += Math.cos(this.t * 0.27 + i) * 0.03 * dt;
        for (const [j, half] of [[0, 4], [2, 4]]) { const d = a[k + j] - (j ? c.z : c.x); if (d > half) a[k + j] -= 2 * half; else if (d < -half) a[k + j] += 2 * half; }
        const fy = (r ? r.floorY : 0); if (a[k + 1] < fy) a[k + 1] = fy + 3; else if (a[k + 1] > fy + 3.2) a[k + 1] = fy; }
      P.needsUpdate = true;
    } };
  const flash = new T.SpotLight(0xfff2d9, 0, 15, 0.5, 0.45, 1.5); flash.position.set(0.15, -0.12, 0); camera.add(flash); flash.target.position.set(0, -0.1, -5); camera.add(flash.target);
  const cctvCam = new T.PerspectiveCamera(52, 16 / 9, 0.05, 30); cctvCam.rotation.order = 'YXZ'; // layer 0 only: CCTV never sees hallucinations
  const raycaster = new T.Raycaster(); raycaster.far = REACH; if (raycaster.layers) raycaster.layers.mask = 0xffffffff;
  // Adaptive resolution: if frames get slow (a phone in a crowded room), the render scale drops before input starts to lag.
  const Perf = { scale: 1, acc: 0, n: 0, slow: 0, ft: 16,
    tick(dt) { this.ft += (dt * 1000 - this.ft) * 0.1; this.acc += dt; this.n++; if (this.acc < 1.5) return; const avg = this.acc / this.n * 1000; this.acc = 0; this.n = 0;
      const prev = this.scale; if (avg > 40) this.scale = Math.max(0.5, this.scale - 0.1); else if (avg < 24 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
      if (prev !== this.scale) resize(); } };
  function resize() { const q = QUALITY[settings.quality]; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q.ratio * Perf.scale); renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.far = q.far; camera.updateProjectionMatrix(); scene.fog.far = q.far - 2; Menu3D.resize(); }
  window.addEventListener('resize', () => resize());

  // ------------------------------------------------------------------ 3D main menu: a dark corridor, something standing at its end
  const Menu3D = {
    scene: null, cam: null, fv: null, t: 0, lights: [], fig: null, flick: 0,
    init() {
      this.scene = new T.Scene(); this.scene.fog = new T.Fog(0x050607, 6, 34); this.scene.add(new T.AmbientLight(0x1d2026, 1));
      this.cam = new T.PerspectiveCamera(62, 1, 0.05, 60); this.cam.rotation.order = 'YXZ';
      const fac = S.Map.build(); S.Render.setQuality && S.Render.setQuality(settings.quality); this.fv = new S.Render.FacilityView({ fac }, this.scene);
      for (const id of ['corrC', 'obs125', 'obs132', 'obs124', 'obs136', 'obs127', 'obs133', 'obs138', 'officesC', 'labC', 'postC', 'obs123', 'obs135', 'obs130', 'obs134', 'obs137', 'obs131', 'genC']) { const v = this.fv.ensure(id); if (v) v.group.visible = true; }
      for (const id in this.fv.doors) { const d = this.fv.doors[id]; if (d.door.roomA === 'corrC' || d.door.roomB === 'corrC') d.group.visible = true; }
      for (let i = 0; i < 5; i++) { const l = new T.PointLight(0xfff2db, 1, 11, 1.6); this.scene.add(l); this.lights.push(l); }
      if (S.Humans) S.Humans.load(); const rig = new S.Render.Humanoid({ id: 'menu-fig', role: 'Silhouette', female: false, colorVariant: 0 }, this.fv.m); rig.root.scale.setScalar(1.35); rig.root.position.set(107.5, 0, 0.3); rig.root.rotation.y = -Math.PI / 2; this.scene.add(rig.root); this.fig = rig;
      this.resize();
    },
    resize() { if (!this.cam) return; this.cam.aspect = window.innerWidth / Math.max(1, window.innerHeight); this.cam.updateProjectionMatrix(); },
    frame(dt) {
      if (!this.scene) this.init();
      this.t += dt; const k = (this.t * 0.55) % 60, x = 38 + k;
      this.cam.position.set(x, 1.62 + Math.sin(this.t * 0.9) * 0.02, -0.35 + Math.sin(this.t * 0.21) * 0.15); this.cam.rotation.set(-0.03 + Math.sin(this.t * 0.3) * 0.02, Math.PI / 2 + Math.sin(this.t * 0.17) * 0.12, 0);
      this.flick -= dt; if (this.flick < -6 + Math.random() * 3) this.flick = 0.6 + Math.random() * 0.7;
      const dark = this.flick > 0 && (Math.sin(this.t * 41) > 0 || settings.noflash);
      this.lights.forEach((l, i) => { const lx = x + 4 + i * 6.5; l.position.set(lx, 2.8, 0); l.intensity = (dark && i > 0 ? 0.08 : 1) * (lx > 100 ? 0.25 : 1); });
      if (S.Humans && S.Humans.ready && !this.fig.mixer) { const old = this.fig.root, rig = S.Humans.create({ id: 'menu-fig', role: 'Silhouette' }); rig.root.scale.multiplyScalar(1.3); rig.root.position.copy(old.position); rig.root.rotation.copy(old.rotation); this.scene.remove(old); this.scene.add(rig.root); this.fig = rig; }
      this.fig.root.visible = !dark || Math.random() < 0.3; this.fig.animate(dt, 0, 'Standing', 0, this.t);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.clear(); renderer.render(this.scene, this.cam);
    }
  };

  // ------------------------------------------------------------------ player movement and collision
  const P = { yaw: 180, pitch: 0, stamina: 1, bob: 0, step: 0, shake: 0, current: null, rayT: 0 };
  function collide(x, z, y) {
    const blockers = G.fv.doorBlockers(y), bodies = G.world ? G.world.bodiesNear(x, z, y, P.bodies || (P.bodies = [])) : [];
    for (let pass = 0; pass < 3; pass++) {
      // people are solid too: the player slides around them instead of walking through
      for (const b of bodies) { const dx = x - b.pos.x, dz = z - b.pos.z, R = RADIUS + b.radius - 0.04, d2 = dx * dx + dz * dz; if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2); x += dx / d * (R - d); z += dz / d * (R - d); } }
      const near = G.fv.nearColliders(x, z, y); for (const b of blockers) near.add(b);
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
    if (gameplay && !p.dead && !p.sleeping && !G.ride) {
      if (!stunned) { P.yaw -= Input.look.x * settings.sens; P.pitch = S.clamp(P.pitch - Input.look.y * settings.sens * (settings.invert ? -1 : 1), -80, 80); }
      const mv = stunned || G.hold ? { x: 0, y: 0 } : Input.move, running = Input.run && mv.y > 0.2 && P.stamina > 0.05 && !p.counting;
      const sp = (running ? RUN : WALK) * (p.health < 35 ? 0.75 : 1) * (p.slow || 1) * (0.85 + 0.15 * p.psy.focus);
      P.stamina = S.clamp(P.stamina + (running ? -dt / 7 * (1 + p.psy.fatigue / 100) : dt / 10), 0, 1);
      const yr = P.yaw * D2R, fx = Math.sin(yr), fz = Math.cos(yr), rx = -Math.cos(yr), rz = Math.sin(yr);
      const vx = (fx * mv.y + rx * mv.x) * sp, vz = (fz * mv.y + rz * mv.x) * sp;
      const ox = p.pos.x, oz = p.pos.z, [nx, nz] = collide(ox + vx * dt, oz + vz * dt, p.pos.y);
      p.pos = { x: nx, y: p.pos.y, z: nz }; moved = Math.hypot(nx - ox, nz - oz); p.moving = moved > 0.01;
      if (p.counting && (mv.x * mv.x + mv.y * mv.y) > 0.3) w.stopCounting('вы сдвинулись с места');
      if (Input.flash) { p.flashlight = !p.flashlight; A.play('click'); }
      if (Input.card && p.cards.length) { p.sel = (p.sel + 1) % p.cards.length; const c = w.card(p.selectedCardId()); if (c) UI.msg('Выбрана карта: L' + c.level + ' · ' + c.ownerName, '#fff'); }
      if (Input.count) toggleCounting();
      P.rayT -= dt; if (P.rayT <= 0) { P.rayT = 0.1; P.current = pickInteractable(); }
      if (Input.use && P.current && !G.hold) interact(P.current);
      if (G.hold) tickHold(dt);
    } else { P.current = null; if (G.hold) cancelHold(); }
    w.player.yaw = P.yaw; w.player.pitch = P.pitch;
    const speed = dt > 0 ? moved / dt : 0;
    // gait: one unit of P.gait = one step; the foot lands (sound + lowest camera point) at every integer value
    const gait = speed > RUN * 0.8 ? 'run' : speed < WALK * 0.55 ? 'sneak' : 'walk', stride = gait === 'run' ? 1.05 : gait === 'sneak' ? 0.5 : 0.72;
    if (moved > 0.002 && !P.wasMoving) P.gait = Math.floor(P.gait || 0) + 0.6;
    const g0 = P.gait || 0; P.gait = g0 + moved / stride;
    const amt = Math.min(1, speed / RUN) * (settings.shake ? 0.015 : 0.045);
    camera.position.set(p.pos.x, p.pos.y + EYE + (Math.abs(Math.sin(Math.PI * P.gait)) - 0.5) * amt * 1.6, p.pos.z);
    const sh = P.shake * (settings.shake ? 0.25 : 1) * settings.fx;
    if (sh > 0) { camera.position.x += (Math.random() - 0.5) * sh * 0.2; camera.position.y += (Math.random() - 0.5) * sh * 0.2; }
    camera.rotation.set(P.pitch * D2R, P.yaw * D2R + Math.PI, sh * Math.sin(performance.now() * 0.04) * 0.14);
    flash.intensity = p.flashlight ? 2.2 : 0;
    const room = w.fac.room(p.roomId), surface = A.surfaceOf(room, w), shoe = shoeOf(p);
    const stepPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    if (Math.floor(P.gait) > Math.floor(g0)) A.footstep(stepPos, { surface, gait, shoe, gear: gearOf(p), player: true, vol: 0.36 });
    else if (P.wasMoving && moved <= 0.002 && P.gait % 1 > 0.3) { A.footstep(stepPos, { surface, gait: 'sneak', shoe, player: true, vol: 0.5 }); P.gait = Math.ceil(P.gait); }
    P.wasMoving = moved > 0.002; P.speed = speed;
  }
  // shoes and gear by profession: boots for security, MTF, engineering; soft prison shoes for class D; heels for some admin staff
  function shoeOf(n) {
    const pr = n.prof || '', role = n.role || '';
    if (role === 'DClass' || pr === 'dclass') return 'soft';
    if (/guard|mtf|security|engineer|technician|electric|containment|janitor|cook/.test(pr) || role === 'Guard' || role === 'MTF') return 'boots';
    if (n.female && /director|secretary|ethic|admin|records|hr|personnel|archiv/.test(pr) && hashStr(String(n.id || 'p')) % 3 === 0) return 'heels';
    if (/doctor|medic|nurse|psychiatr/.test(pr)) return 'soft';
    return 'shoes';
  }
  function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gearOf(n) { const pr = n.prof || ''; return /guard|mtf|security/.test(pr) || n.role === 'Guard' || n.role === 'MTF'; }
  function toggleCounting() {
    const w = G.world, p = w.player;
    if (p.counting) { w.stopCounting('вы прекратили счёт'); return; }
    const a = countable(); if (!a) { UI.msg('Протокол счёта: объект вне прямой видимости (до 10 м)', '#ffb36b'); return; }
    w.startCounting(a.id);
  }
  function countable() { const w = G.world, p = w.player; return w.anomalies.find(a => a.tm && w.canCount(p.pos, p.roomId, a)) || null; }

  // ------------------------------------------------------------------ interaction (with a smooth hold for duties)
  function shown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
  function pickInteractable() {
    const list = [];
    for (const m of G.fv.interact) if (shown(m)) list.push(m);
    for (const id in G.npcViews) { const v = G.npcViews[id]; if (v.root.visible && v.rig.proxy) list.push(v.rig.proxy); }
    for (const v of G.anomViews) if (v.root.visible && v.proxy) list.push(v.proxy);
    for (const k in G.cardMeshes) list.push(G.cardMeshes[k]);
    if (G.fv._fake) for (const c of G.fv._fake.group.children) { c.userData.interact = { kind: 'fake_door' }; list.push(c); }
    for (const id of G.visible) { const rv = G.fv.rooms[id]; if (rv && rv.group) for (const c of rv.group.children) if (c.isMesh && c.geometry.groups && c.geometry.groups.length) list.push(c); }
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(list, false);
    for (const h of hits) { const d = h.object.userData.interact; if (d) return d; if (h.object.material && h.object.material.transparent) continue; return null; }
    return null;
  }
  function stepFor(d) { if (!d.id) return null; const poi = G.world.fac.poi(d.id); return poi ? G.world.stepAtPoi(poi) : null; }
  const anomalyIn = room => G.world.anomalies.find(a => a.arrived && a.containRoom === room) || null;
  const roomBehind = obs => { const b = Object.values(G.world.fac.blocks).find(x => x.obs === obs); return b ? b.cell : obs === 'heavyObs4' ? 'heavyCell4' : null; };
  function promptFor(d) {
    const w = G.world, st = stepFor(d), task = st ? '\n▶ ' + st.t.title + ': ' + st.s.label : '';
    switch (d.kind) {
      case 'reader': { const door = w.fac.door(d.door), c = w.card(w.player.selectedCardId()); return 'Приложить карту [' + (c ? 'L' + c.level + ' · ' + c.ownerName : 'нет карты') + ']\n' + door.name + ' · допуск ' + S.describeReq(door.reqFrom(d.side)); }
      case 'terminal': return 'Терминал' + task;
      case 'console': return (st ? '' : 'Рабочий терминал: ' + d.label) + task;
      case 'checkpoint': return 'Отметиться: «' + d.label + '»' + task;
      case 'desk': case 'poi': case 'spot': return (st ? '' : d.label) + task;
      case 'bed': { const poi = w.fac.poi(d.id); return 'Койка' + (poi && (poi.owners || []).indexOf('player') >= 0 ? ' (ваша) — лечь спать' : '') + task; }
      case 'hazmat': return 'Защитный костюм на стойке';
      case 'seat': return st ? task.slice(1) : '';
      case 'window': { const a = anomalyIn(d.room); return a ? 'Наблюдать через окно: ' + a.displayName : 'Окно наблюдения'; }
      case 'intercom': { const a = anomalyIn(roomBehind(d.room)); return 'Интерком' + (a ? ': ' + a.id : ''); }
      case 'transit': return d.label;
      case 'npc': { const n = w.npc(d.id); return n ? 'Говорить: ' + n.displayName + '\n' + S.Professions.get(n.prof).name + ' · ' + (n.label || S.ACT_NAMES[n.activity] || '') : ''; }
      case 'card': { const c = w.card(d.id); return c ? 'Подобрать ключ-карту: L' + c.level + ' · ' + c.ownerName + (c.revoked ? ' (аннулирована)' : '') : ''; }
      case 'anomaly': { const a = w.anomaly(d.id); return a ? 'Наблюдать: ' + a.displayName : ''; }
      case 'fake_door': return 'Дверь';
    }
    return '';
  }
  function beginHold(t, s, label) { const p = G.world.player, sec = S.clamp(s.dur * 0.25, 1.2, 5) / (0.6 + 0.4 * p.psy.focus); G.hold = { t, s, sec, el: 0, label }; $('hold').hidden = false; A.play('click'); }
  function tickHold(dt) {
    const h = G.hold; h.el += dt; $('hold').firstChild.style.width = Math.min(100, h.el / h.sec * 100) + '%'; $('prompt').textContent = h.label + ' …';
    if (h.el >= h.sec) { const r = G.world.playerStepDone(h.t); cancelHold(); if (r) { UI.msg(r, '#e8d77a'); A.play('ok'); } }
  }
  function cancelHold() { G.hold = null; $('hold').hidden = true; }
  function interact(d) {
    const w = G.world, p = w.player, st = stepFor(d);
    if (st && (!st.s.need || st.s.need === 'hold')) { beginHold(st.t, st.s, st.s.label); return; }
    const rs = d.kind !== 'npc' && d.kind !== 'reader' ? w.stepInRoom() : null; if (rs && (d.kind === 'spot' || d.kind === 'poi' || d.kind === 'seat')) { beginHold(rs.t, rs.s, rs.s.label); return; }
    switch (d.kind) {
      case 'reader': {
        const id = p.selectedCardId(); if (!id) { UI.msg('У вас нет ключ-карты', '#ff6a5c'); return; }
        const r = w.presentCard(d.door, id, 'player', d.side), door = w.fac.door(d.door);
        A.play(S.isSuccess(r) ? 'ok' : r === S.R.Await ? 'wait' : 'no', door.pos);
        UI.msg(door.name + ': ' + S.RESULT_TEXT[r], S.isSuccess(r) ? '#7dff9a' : r === S.R.Await ? '#ffd76b' : '#ff6a5c'); break;
      }
      case 'terminal': case 'console': Terminal.open(); break;
      case 'desk': { const ws = w.playerStepFor(s => s.need === 'terminal:report'); if (ws) Terminal.open('research'); else UI.msg(d.label + '. Бумаги, ручки, чужая кружка.', '#ccc'); break; }
      case 'checkpoint': { const r = w.checkpoint(d.id); if (r) UI.msg(r, '#e8d77a'); A.play('ok'); break; }
      case 'poi': case 'spot': UI.msg(d.label, '#ccc'); break;
      case 'bed': { const poi = w.fac.poi(d.id); if (poi && ((poi.owners || []).indexOf('player') >= 0 || !poi.owners)) Sleep.start(); else UI.msg('Это чужая койка.', '#ccc'); break; }
      case 'hazmat': UI.msg('Защитный костюм висит на стойке. Издалека в полумраке он похож на человека.', '#ccc'); w.horror.explain('suit', 'Силуэт — защитный костюм на стойке'); break;
      case 'window': { const a = anomalyIn(d.room); UI.dialogue(a ? 'Наблюдение: ' + a.displayName : 'Окно', [a ? w.observe(a.id, false) : 'За стеклом пустая камера.'], a ? mindActs(a) : undefined); break; }
      case 'intercom': intercom(d); break;
      case 'transit': Ride.start(d); break;
      case 'anomaly': { const a = w.anomaly(d.id); UI.dialogue('Наблюдение: ' + a.displayName, [w.observe(d.id, false)], mindActs(a)); break; }
      case 'npc': Talk.open(d.id); break;
      case 'card': { if (w.pickUp(d.id)) { const c = w.card(d.id); UI.msg('Подобрана карта L' + c.level + ' · ' + c.ownerName + '. Использование чужой карты попадает в журнал.', '#ffd76b'); } break; }
      case 'fake_door': UI.msg('Под ладонью — холодная стена. Никакой двери здесь нет.', '#c7c2b0'); p.psy.fear = S.clamp(p.psy.fear + 8, 0, 100); break;
    }
  }
  function intercom(d) {
    const w = G.world, a = anomalyIn(roomBehind(d.room)); if (!a) { UI.msg('Интерком: тишина.', '#ccc'); return; }
    const acts = [];
    if (a.def.interview) acts.push(['Беседа', () => UI.dialogue(a.displayName, [w.interview(a.id)])]);
    if (a.id === 'SCP-LF-123') acts.push(['Снять трубку', () => UI.dialogue(a.displayName, [a.def.answer(w, a, 'player')])]);
    if (a.id === 'SCP-LF-127') acts.push([a.st.covered ? 'Открыть штору' : 'Задёрнуть штору', () => UI.msg(a.def.setCover(w, a, !a.st.covered, 'player'), '#ccc')]);
    if (a.id === 'SCP-LF-130') acts.push(['Удар 220 Гц', () => { a.def.strike(w, a, 220); UI.msg('Камертон загудел низко.', '#ccc'); }]);
    acts.push(['Наблюдать', () => UI.dialogue(a.displayName, [w.observe(a.id, false)])]);
    UI.dialogue('Интерком · ' + a.displayName, [a.status], acts);
  }

  // ------------------------------------------------------------------ lifts and stairs (including SCP-LF-122)
  const Ride = {
    start(d) {
      const w = G.world, p = w.player, door = w.fac.door(d.door), card = w.card(p.selectedCardId());
      if (door.outOfService && !(door.id === 't.lf122' && d.from === 'nullfloor')) { A.play('no'); UI.msg(door.name + ': ' + (door.id === 't.liftOld' && w.life.liftLocked() ? 'заблокирован по регламенту (00:00–05:00)' : 'не работает'), '#ff6a5c'); return; }
      if (door.req.min > 0 && !(card && S.isSuccess(S.checkCard(card, door.req, w.now)))) { A.play('no'); UI.msg(door.name + ': нет допуска (' + S.describeReq(door.req) + ')', '#ff6a5c'); return; }
      let to = door.other(d.from);
      if (door.id === 't.liftOld' && d.from === 'liftOld') { const lf = w.anomaly('SCP-LF-122'), alone = w.countIn('liftOld') <= 1; if (lf && lf.def.redirect(w, lf, 'player', alone)) to = 'nullfloor'; }
      G.ride = { to, t: door.kind === 'Lift' ? 2.4 : 3.2, from: d.from, door: door.id }; $('fade').style.opacity = 1; A.play(door.kind === 'Lift' ? 'servo' : 'step');
    },
    tick(dt) {
      const r = G.ride; if (!r) return; r.t -= dt; if (r.t > 0) return;
      const w = G.world, p = w.player, room = w.fac.room(r.to), h = room.hubPoints[0] || room.center;
      p.pos = { x: h.x + 0.4, y: room.floorY, z: h.z }; p.roomId = room.id; G.ride = null; $('fade').style.opacity = 0; G.acc = 0;
      if (r.to === 'nullfloor') { p.nullSince = w.now; UI.msg('Двери открываются. На табло — «—».', '#c7c2b0'); p.addJournal('[' + S.fmtStamp(w.now) + '] Служебный лифт привёз меня на этаж, которого нет на табло.'); }
      else if (r.from === 'nullfloor') { UI.msg('Лифт вернул вас на уровень 3. Часы показывают ' + S.fmtTime(w.now) + '.', '#c7c2b0'); w.life.openCase('missing', 'Поездка ' + p.name + ' на этаж «—»', 'liftOld', { cause: 'anomalous', scp: 'SCP-LF-122' }); p.nullSince = null; }
      else UI.msg(room.name, '#ccc');
    }
  };

  // ------------------------------------------------------------------ sleep (fast forward; ends sleep-sensitive perception effects)
  const Sleep = {
    start() { const w = G.world, p = w.player; if (w.alert.level >= 2) { UI.msg('Тревога — не время спать.', '#ff9a59'); return; } p.sleeping = true; G.timeScale = 40; $('sleep').hidden = false; },
    tick() { const w = G.world, p = w.player; if (!p.sleeping) return; $('sleepInfo').textContent = S.fmtStamp(w.now) + ' · усталость ' + Math.round(p.psy.fatigue); if (p.psy.fatigue <= 4 || w.alert.level >= 2 || w.tasks.activeFor('player').some(t => (t.prio || 0) >= 4)) this.wake(); },
    wake() { const w = G.world; w.player.sleeping = false; G.timeScale = 1; $('sleep').hidden = true; UI.msg('Вы проснулись: ' + S.fmtStamp(w.now), '#ccc'); }
  };

  // ------------------------------------------------------------------ input
  const Input = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, run: false, use: false, flash: false, card: false, count: false, pause: false, pda: false, hud: false, keys: new Set(), lookAcc: { x: 0, y: 0 }, stick: { x: 0, y: 0 }, touchRun: false, taps: {} };
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    Input.keys.add(e.code);
    const map = { KeyE: 'use', KeyF: 'flash', KeyQ: 'card', KeyC: 'count', Escape: 'pause', Tab: 'pda', KeyH: 'hud' };
    if (map[e.code] && !e.repeat) { Input.taps[map[e.code]] = true; if (e.code === 'Tab') e.preventDefault(); }
    A.start();
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  const canvasEl = renderer.domElement; let mouseDrag = false;
  canvasEl.addEventListener('mousedown', () => { A.start(); if (!G.playing || settings.touch) return; mouseDrag = true; try { const r = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* drag to look */ } });
  window.addEventListener('mouseup', () => { mouseDrag = false; });
  window.addEventListener('mousemove', e => { if (!G.playing || settings.touch) return; if (document.pointerLockElement === canvasEl || mouseDrag) { Input.lookAcc.x += e.movementX * 0.12; Input.lookAcc.y += e.movementY * 0.12; } });
  // Touch controls: left zone = movement stick, right zone = look. Robust on Android WebView:
  // - a new finger always takes over its zone (a lost "up" event can never lock the control);
  // - lost pointer capture (an overlay opened on top, the system cancelled the gesture) ends the control;
  // - a window-level up/cancel also releases it, wherever the finger was lifted.
  const zoneL = $('zoneL'), zoneR = $('zoneR'), stick = $('stick'), knob = $('knob'); let stickId = null, stickO = null, lookId = null, lookLast = null;
  const cap = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* capture not available: window listeners still release */ } };
  const endStick = e => { if (e && e.pointerId !== stickId) return; stickId = null; Input.stick = { x: 0, y: 0 }; knob.style.transform = ''; stick.style.left = ''; stick.style.top = ''; };
  const endLook = e => { if (!e || e.pointerId === lookId) lookId = null; };
  zoneL.addEventListener('pointerdown', e => { e.preventDefault(); A.start(); stickId = e.pointerId; cap(zoneL, e.pointerId); stickO = { x: e.clientX, y: e.clientY }; Input.stick = { x: 0, y: 0 }; knob.style.transform = ''; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; });
  zoneL.addEventListener('pointermove', e => { if (e.pointerId !== stickId) return; let dx = e.clientX - stickO.x, dy = e.clientY - stickO.y; const l = Math.hypot(dx, dy), m = 52 * settings.btn; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; const v = Math.hypot(dx, dy) / m; Input.stick = v < 0.12 ? { x: 0, y: 0 } : { x: dx / m, y: -dy / m }; });
  zoneR.addEventListener('pointerdown', e => { e.preventDefault(); A.start(); lookId = e.pointerId; cap(zoneR, e.pointerId); lookLast = { x: e.clientX, y: e.clientY }; });
  zoneR.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return; const k = 170 / Math.max(1, window.innerHeight);
    // coalesced events carry every intermediate finger position (smooth look even when frames are slow)
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null, pts = list && list.length ? list : [e];
    for (const q of pts) { Input.lookAcc.x += (q.clientX - lookLast.x) * k; Input.lookAcc.y += (q.clientY - lookLast.y) * k; lookLast = { x: q.clientX, y: q.clientY }; }
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) { zoneL.addEventListener(t, endStick); zoneR.addEventListener(t, endLook); }
  window.addEventListener('pointerup', e => { endStick(e); endLook(e); }, true); window.addEventListener('pointercancel', e => { endStick(e); endLook(e); }, true);
  window.addEventListener('blur', () => { endStick(); endLook(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) { endStick(); endLook(); } });
  const tap = (id, name) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); A.start(); Input.taps[name] = true; $(id).classList.add('on'); setTimeout(() => $(id).classList.remove('on'), 140); });
  tap('bUse', 'use'); tap('bLight', 'flash'); tap('bCard', 'card'); tap('bCount', 'count');
  $('bUse').addEventListener('pointerup', () => { if (G.hold) cancelHold(); });
  $('bRun').addEventListener('pointerdown', e => { e.preventDefault(); Input.touchRun = !Input.touchRun; $('bRun').classList.toggle('on', Input.touchRun); });
  $('bMenu').addEventListener('click', () => { Input.taps.pause = true; });
  $('bPda').addEventListener('click', () => { Input.taps.pda = true; });
  $('bHud').addEventListener('click', () => { Input.taps.hud = true; });
  function readInput() {
    const k = Input.keys; let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1; if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1; if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    mx += Input.stick.x; my += Input.stick.y; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    Input.move = { x: mx, y: my }; Input.look = { x: Input.lookAcc.x, y: Input.lookAcc.y }; Input.lookAcc = { x: 0, y: 0 };
    Input.run = k.has('ShiftLeft') || k.has('ShiftRight') || Input.touchRun;
    for (const n of ['use', 'flash', 'card', 'count', 'pause', 'pda', 'hud']) { Input[n] = !!Input.taps[n]; Input.taps[n] = false; }
    if (G.hold && !settings.touch && !k.has('KeyE')) cancelHold();
  }

  // ------------------------------------------------------------------ UI helpers
  const UI = {
    msg(text, color) { const w = G.world, el = document.createElement('div'); el.innerHTML = '<span class="t">' + (w ? S.fmtTime(w.now) : '') + '</span>' + esc(text); el.style.color = color || '#e6e8e3'; el.dataset.until = performance.now() + 11000; const f = $('feed'); f.appendChild(el); while (f.children.length > 4) f.removeChild(f.firstChild); },
    dialogue(title, lines, acts) {
      $('dTitle').textContent = title; $('dBody').textContent = lines.join('\n'); const box = $('dActs'); box.innerHTML = '';
      for (const [label, fn] of (acts || [])) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => fn()); box.appendChild(b); }
      const c = document.createElement('button'); c.textContent = 'Закрыть'; c.addEventListener('click', () => UI.closeDialogue()); box.appendChild(c);
      $('dialogue').hidden = false;
    },
    closeDialogue() { $('dialogue').hidden = true; },
    modal() { return ['menu', 'pause', 'settings', 'dialogue', 'death', 'terminal', 'pda', 'roles', 'create', 'dossier', 'sleep'].some(id => !$(id).hidden); },
    paused() { return ['pause', 'settings', 'death', 'menu', 'roles', 'create', 'dossier'].some(id => !$(id).hidden); },
    refreshSettings() {
      const on = v => v ? 'ВКЛ' : 'ВЫКЛ';
      $('sSens').textContent = settings.sens.toFixed(1); $('sFov').textContent = settings.fov + '°'; $('sInvert').textContent = on(settings.invert); $('sQuality').textContent = QUALITY[settings.quality].name;
      $('sVolume').textContent = Math.round(settings.volume * 100) + '%'; $('sMusic').textContent = Math.round(settings.music * 100) + '%'; $('sHud').textContent = Math.round(settings.hud * 100) + '%'; $('sBtn').textContent = Math.round(settings.btn * 100) + '%';
      $('sGore').textContent = ['НЕТ', 'УМЕРЕННО', 'ПОЛНОСТЬЮ'][settings.gore]; $('sDeath').textContent = DEATH_MODES[settings.deathMode];
      $('sLefty').textContent = settings.lefty ? 'СЛЕВА' : 'СПРАВА'; $('sTouch').textContent = on(settings.touch); $('sFx').textContent = Math.round(settings.fx * 100) + '%'; $('sNoFlash').textContent = on(settings.noflash); $('sShake').textContent = on(settings.shake); $('sMinHud').textContent = on(settings.minhud);
    },
    syncTouch() {
      const overlay = ['terminal', 'pda', 'pause', 'settings', 'death', 'sleep', 'chat'].some(id => !$(id).hidden);
      const tHide = !(G.playing && settings.touch && !overlay); if (tHide && !$('touch').hidden) { endStick(); endLook(); } $('touch').hidden = tHide; $('topbtns').hidden = !G.playing || overlay;
      $('hud').hidden = !G.playing || !$('terminal').hidden || !$('pda').hidden;
      for (const id of ['status', 'taskbox', 'feed', 'card']) $(id).style.visibility = G.hudHidden ? 'hidden' : '';
    }
  };

  // ------------------------------------------------------------------ conversations with people
  const Talk = {
    open(id, topic) {
      const w = G.world, n = w.npc(id); if (!n) return;
      const lines = w.talk(id, topic), p = w.player, acts = [['Работа', () => Talk.open(id, 'work')], ['Слухи', () => Talk.open(id, 'rumor')], ['О себе', () => Talk.open(id, 'self')], ['Вы это видите?', () => Talk.open(id, 'see')]];
      if (n.prof === 'doctor' || n.prof === 'psychiatrist' || n.prof === 'field_medic') acts.push(['Пройти осмотр', () => UI.dialogue(n.displayName, [Talk.selfExam(n)])]);
      if ((p.prof === 'doctor' || p.prof === 'psychiatrist') && n.role !== 'DClass') acts.push(['Обследовать', () => UI.dialogue(n.displayName, [w.life.examined('player', n.id)])]);
      if (p.prof === 'psychiatrist' || p.prof === 'anomaly_psychologist') acts.push(['Беседа психиатра', () => UI.dialogue(n.displayName, [w.life.psychEval('player', n.id)])]);
      if (p.dept === 'security' && n.role === 'DClass' && !n.escortedBy) acts.push(['Конвоировать за мной', () => { n.escortedBy = 'player'; n.followId = 'player'; n.nextThink = 0; UI.msg(n.callsign + ' идёт за вами.', '#ccc'); UI.closeDialogue(); }]);
      if (n.escortedBy === 'player') acts.push(['Отпустить', () => { n.escortedBy = null; n.followId = null; n.nextThink = 0; UI.closeDialogue(); }]);
      UI.dialogue(n.displayName + ' · ' + S.Professions.get(n.prof).name, lines, acts);
    },
    selfExam(n) {
      const w = G.world, p = w.player, eff = w.horror.effectsOf('player');
      let r;
      if (p.psy.exposure > 6 || eff.length) { const src = eff.length ? eff[0].src : null; r = 'Выявлены признаки аномального когнитивного воздействия' + (src ? ' (источник предположительно ' + src + ')' : '') + '. То, что вы видите или слышите, может не существовать.'; }
      else if (p.psy.fatigue > 70) r = 'Сильное переутомление. Аномального воздействия не выявлено. Сон и отдых.';
      else r = 'Здоровы. Признаков воздействия нет.';
      if (n.prof === 'psychiatrist') { let k = 0; for (const e of eff.slice()) if (e.end && e.end.therapy) { w.horror.end('player', e, 'беседа с психиатром'); k++; } p.psy.fear = Math.max(0, p.psy.fear - 25); if (k) r += ' После беседы ощущение прошло.'; }
      p.examResult = { t: w.now, text: r };
      return r;
    }
  };

  // ------------------------------------------------------------------ HUD
  const ALERT_COLORS = ['#3fd16a', '#f2d23f', '#ff8c26', '#ff3333'];
  let hudT = 0;
  const word = (v, a, b, c) => v < 30 ? a : v < 65 ? b : c;
  function updateHud(dt, gameplay) {
    const w = G.world, p = w.player, room = w.fac.room(p.roomId), fx = w.horror.fx;
    $('clock').innerHTML = esc(S.fmtStamp(w.now)) + ' <small>' + esc(room ? w.roomName(room.id) : '—') + '</small>';
    $('status').style.borderLeftColor = ALERT_COLORS[w.alert.level];
    $('alert').innerHTML = '<span style="color:' + ALERT_COLORS[w.alert.level] + '">' + S.ALERT_NAMES[w.alert.level] + '</span> · ' + esc(w.alert.reason);
    $('hp').style.width = Math.max(0, p.health) + '%'; $('stam').style.width = (P.stamina * 100) + '%';
    const c = w.card(p.selectedCardId());
    $('card').textContent = c ? 'L' + S.effLevel(c, w.now) + ' · ' + c.ownerName + (p.cards.length > 1 ? ' (' + (p.sel % p.cards.length + 1) + '/' + p.cards.length + ')' : '') + (c.revoked ? ' · АННУЛИРОВАНА' : '') + (p.limitUntil > w.now ? ' · ДОПУСК ОГРАНИЧЕН' : '') : 'Карты нет';
    $('bCard').firstChild.innerHTML = 'КАРТА<br>' + (c ? 'L' + c.level : '—');
    if (!G.hold) $('prompt').textContent = gameplay && P.current ? promptFor(P.current) : '';
    $('counting').textContent = p.counting ? 'ПРОТОКОЛ СЧЁТА: ' + S.numWords(Math.floor(p.countSec / 1.2) % 100 + 1) + '… — не двигайтесь' : fx.compulsion ? 'Вам кажется важным: ' + fx.compulsion.toLowerCase() : '';
    const can = !p.dead && countable(); $('bCount').hidden = !(can || p.counting); $('bCount').firstChild.textContent = p.counting ? 'СТОП' : 'СЧЁТ';
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.4; const ts = w.tasks.activeFor('player'); let h = '<h3>' + esc(S.Professions.get(p.prof).name.toUpperCase()) + (p.onShift ? ' · НА СМЕНЕ' : ' · ВНЕ СМЕНЫ') + '</h3>';
      if (ts.length) {
        const t = ts[0], s = t.steps[t.si], fake = fx.falseDone === t.id;
        h += '<div class="t">' + esc(t.title) + (fake ? ' <span class="f">✓ выполнено</span>' : '') + '</div>';
        if (s && !fake) h += '<div class="s">▶ ' + esc(s.label) + ' <span class="p">' + (t.si + 1) + '/' + t.steps.length + '</span>' + (s.room !== p.roomId ? ' · «' + esc(w.roomName(s.room)) + '»' : '') + (t.deadline ? ' · ' + esc(S.durationText(t.deadline - w.now)) : '') + '</div>';
        if (ts.length > 1) h += '<div class="s">ещё задач: ' + (ts.length - 1) + ' — КПК</div>';
      } else h += '<div class="s">' + (p.onShift ? 'Задач нет. SCP LIFE назначит работу.' : 'Свободное время.') + '</div>';
      $('taskbox').innerHTML = h;
      $('psy').innerHTML = '<span' + (p.psy.fatigue > 65 ? ' class="hi"' : '') + '>усталость: <b>' + word(p.psy.fatigue, 'низкая', 'средняя', 'высокая') + '</b></span><span' + (p.psy.fear > 55 ? ' class="hi"' : '') + '>тревога: <b>' + word(Math.max(p.psy.fear, p.psy.stress), 'спокойны', 'напряжены', 'страх') + '</b></span>';
    }
    const now = performance.now();
    for (const el of Array.from($('feed').children)) { const left = +el.dataset.until - now; if (left <= 0) el.remove(); else if (left < 2000) el.style.opacity = left / 2000; }
    const targetA = p.health < 30 ? 0.35 : 0; G.dmg = Math.max(targetA, (G.dmg || 0) - dt * 0.6); if (p.health < (G.lastHp || 100) - 0.5) G.dmg = settings.noflash ? 0.4 : 0.85; G.lastHp = p.health; $('damage').style.opacity = G.dmg;
    // perception overlays (player only)
    const I = settings.fx;
    $('vignette').style.opacity = Math.min(0.75, (fx.tension * 0.35 + fx.heartbeat * 0.4) * I);
    const per = $('peripheral'); if (fx.peripheral) { per.className = fx.peripheral.side < 0 ? 'l' : 'r'; per.style.opacity = 0.8 * I; } else per.style.opacity = 0;
    $('whisper').textContent = fx.whisper ? fx.whisper.text : '';
    renderer.domElement.style.filter = fx.color > 0 ? 'hue-rotate(' + Math.round(fx.color * 90 * I) + 'deg) saturate(' + (1 - fx.color * 0.4 * I).toFixed(2) + ')' : '';
    updateSpeech();
  }
  const speechPool = [];
  function updateSpeech() {
    const w = G.world, box = $('speech'); let used = 0; const v3 = new T.Vector3();
    if (!G.cctv) for (const id in G.npcViews) {
      const nv = G.npcViews[id], n = nv.npc; if (used >= 6 || !nv.root.visible || !n.bark || n.barkUntil < w.now) continue;
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
      else if (e.type === 'PatrolCheckpoint' || e.type === 'Observation' || e.type === 'DoorAccess' || e.type === 'Conversation') continue;
      else if (e.radio) { color = '#bfe0ff'; A.play('radio', null, 0.5, { dry: true }); }
      else { if (e.severity <= 0 && !e.pub && e.type !== 'CountingProtocol' && !e.perceived && e.type !== 'Discipline' && e.type !== 'Personnel') continue; color = e.severity >= 3 ? '#ff4d4d' : e.severity === 2 ? '#ff9a59' : e.perceived ? '#c7c2b0' : '#e6e3bf'; }
      if (e.speech) { color = '#cdb8f5'; Chat.hear(e); }
      if (e.pub) { prefix = '[ОПОВЕЩЕНИЕ] '; A.play('chime', null, 0.5, { dry: true }); }
      UI.msg(prefix + e.text, color);
    }
  }

  // ------------------------------------------------------------------ world sounds (real events through walls and floors; player-only perception)
  function occlusionOf(roomId) { const w = G.world, pr = w.fac.room(w.player.roomId), r = w.fac.room(roomId); if (!pr || !r) return 1; if (r.level !== pr.level) return 2; if (r.id === pr.id || pr.canSeeInto(r.id)) return 0; return 1; }
  // People are heard with the same physics as the player: a footstep at every foot contact (one per stride length travelled),
  // surface of the room they are in, their shoes and gear; nothing while standing. Work at a station is heard too.
  const ACT_SND = { Desk: ['keyboard', 0.25, 0.22], Console: ['keyboard', 0.25, 0.2], Terminal: ['keyboard', 0.3, 0.2], Workbench: ['computer', 0.12, 0.2], Panel: ['metal_hit', 0.08, 0.25],
    FoodCounter: ['pot', 0.15, 0.3], Seat: ['cup', 0.05, 0.2], MedBed: ['cloth', 0.06, 0.25], Stand: ['paper', 0.06, 0.25], GuardPost: ['gear', 0.04, 0.2], Hazmat: ['cloth', 0.05, 0.25] };
  function npcSounds(dt, t) {
    const w = G.world, P0 = w.player.pos, gs = G.gaits || (G.gaits = {}), night = w.clock.night;
    for (const n of w.active) {
      const a = n.agent; if (a.transitT > 0) continue;
      const dy = Math.abs(a.pos.y - P0.y), d = Math.hypot(a.pos.x - P0.x, a.pos.z - P0.z); if (d > 20 || dy > 8) { delete gs[n.id]; continue; }
      const v = G.npcViews[n.id], pos = v && v.root.visible && v.drawPos ? v.drawPos : a.pos;
      let g = gs[n.id]; if (!g) g = gs[n.id] = { x: pos.x, z: pos.z, ph: Math.random(), was: false, act: 1 + Math.random() * 4 };
      const moved = Math.hypot(pos.x - g.x, pos.z - g.z); g.x = pos.x; g.z = pos.z;
      const room = w.fac.room(a.roomId), occ = occlusionOf(a.roomId);
      if (moved > 0.6) { g.was = false; continue; } // teleport / interpolation jump
      const sp = dt > 0 ? moved / dt : 0, gait = sp > 2.6 ? 'run' : 'walk', stride = gait === 'run' ? 1.0 : 0.68;
      if (moved > 0.001 && !g.was) g.ph = Math.floor(g.ph) + 0.55;
      const p0 = g.ph; g.ph += moved / stride; g.was = moved > 0.001; if (v) v.gait = g.ph;
      if (Math.floor(g.ph) > Math.floor(p0)) A.footstep({ x: pos.x, y: a.pos.y, z: pos.z }, { surface: A.surfaceOf(room, w), gait, shoe: shoeOf(n), gear: gearOf(n), occ, vol: 0.42 });
      if (g.was || d > 12) continue;
      // work sounds at a station
      g.act -= dt; if (g.act > 0) continue; g.act = 2.5 + Math.random() * 6;
      const poi = n.reservedPoi && w.fac.poi(n.reservedPoi), here = poi && Math.hypot(poi.pos.x - a.pos.x, poi.pos.z - a.pos.z) < 1.2;
      const spot = { x: a.pos.x, y: a.pos.y + 0.9, z: a.pos.z };
      if (here && ACT_SND[poi.type] && Math.random() < 0.7) { const [id, vol, dur] = ACT_SND[poi.type]; A.play(id, spot, vol * 2.2, { occ, range: 12, offset: id === 'keyboard' ? 0 : undefined }); }
      else if (n.activity === 'Eat' && Math.random() < 0.5) A.play('cup', spot, 0.3, { occ, range: 10 });
      else if (n.role === 'Janitor' && Math.random() < 0.25) A.play('bucket', spot, 0.35, { occ, range: 12 });
      else if (night && n.activity !== 'Sleep' && n.psy && n.psy.fatigue > 60 && Math.random() < 0.08) A.play('yawn', spot, 0.35, { occ, range: 10, rate: n.female ? 1.15 : 0.95 });
      else if ((n.sick || (n.needs && n.needs.health < 60)) && Math.random() < 0.2) A.play('cough', spot, 0.4, { occ, range: 12, rate: n.female ? 1.15 : 0.95 });
      else if (Math.random() < 0.04) A.play('sniff', spot, 0.25, { occ, range: 8 });
    }
  }
  // doors: each kind has its own mechanism; the reader click and the lock are separate events
  function doorSound(kind, pos, door) {
    const w = G.world, occ = occlusionOf((w.fac.roomAt(pos) || {}).id), opening = door && door.state === S.DS.Opening, k = door ? door.kind : kind;
    const at = { x: pos.x, y: (pos.y || 0) + 1.2, z: pos.z };
    if (k === 'Heavy') { A.play(opening ? 'door_heavy_open' : 'door_heavy_close', at, 0.8, { occ, range: 28 }); if (opening) A.play('hydraulic', at, 0.35, { occ, range: 20, delay: 0.1 }); else A.play('door_lock', at, 0.5, { occ, delay: 1.6 }); }
    else if (k === 'Airlock') A.play(opening ? 'door_airlock_open' : 'door_airlock_close', at, 0.75, { occ, range: 24 });
    else if (door && door.lockdown && !opening) A.play('door_blast_close', at, 0.8, { occ, range: 34 });
    else { A.play(opening ? 'door_slide_open' : 'door_slide_close', at, 0.6, { occ, range: 20 }); if (!opening && k === 'Security') A.play('door_lock', at, 0.35, { occ, delay: 0.9 }); }
  }
  function playWorldSounds() {
    const w = G.world;
    while (w.sounds.length) {
      const s = w.sounds.shift(), occ = occlusionOf(s.roomId);
      if (s.kind === 'knock') { A.play('knock_metal', s.pos, 0.85, { occ, range: 26 }); if (Math.random() < 0.5) A.play('knock_metal', s.pos, 0.6, { occ, range: 26, delay: 0.35 + Math.random() * 0.3 }); }
      else if (s.kind === 'breaker') { A.play('lever', s.pos, 0.7, { occ }); A.play('power_down', s.pos, 0.5, { occ, range: 30, delay: 0.25 }); }
      else if (s.kind === 'scream') { const self = s.who === 'player'; A.play(self ? (s.female ? 'hurt_f' : 'hurt_m') : (s.female ? 'scream_f' : 'scream_m'), self ? null : s.pos, 0.9, { occ: self ? 0 : occ, range: 40, dry: self }); }
      else if (s.kind && A.man && A.man[s.kind]) A.play(s.kind, s.pos, s.vol || 0.7, { occ, range: s.range || 22 });
    }
    const fx = w.horror.fx;
    while (fx.sounds.length) {
      const s = fx.sounds.shift(), r = w.fac.roomAt(s.pos);
      if (s.kind === 'step_far') A.footstep(s.pos, { surface: A.surfaceOf(r, w), shoe: 'boots', vol: 0.55 * (s.boost || 1), occ: occlusionOf((r || {}).id), range: 28 });
      else if (s.kind === 'step_behind') A.footstep(s.pos, { surface: A.surfaceOf(r, w), shoe: 'shoes', vol: 0.4 * settings.fx, range: 10 });
      else if (s.kind === 'breath') A.play(Math.random() < 0.5 ? 'breath_m' : 'breath_f', s.pos, 0.3 * settings.fx, { range: 6, offset: Math.random() * 6, dur: 2.2 });
      else if (A.man && A.man[s.kind]) A.play(s.kind, s.pos, (s.vol || 0.5) * settings.fx, { range: s.range || 14, occ: occlusionOf((r || {}).id) });
    }
    if (fx.whisper && fx.whisper !== G.lastWhisper) { G.lastWhisper = fx.whisper; if (fx.whisper.radio) A.play('radio', null, 0.4 * settings.fx, { dry: true }); else A.play('whisper_far', null, 0.35 * settings.fx, { dry: true }); }
  }


  // ------------------------------------------------------------------ PDA
  const PDA_TABS = [['tasks', 'ЗАДАЧИ'], ['journal', 'ЖУРНАЛ'], ['career', 'КАРЬЕРА'], ['health', 'САМОЧУВСТВИЕ'], ['radio', 'РАЦИЯ'], ['dossier', 'ДОСЬЕ SCP'], ['people', 'ЛЮДИ']];
  const PDA = {
    tab: 'tasks', refresh: 0,
    build() { const box = $('pdaTabs'); for (const [id, name] of PDA_TABS) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = name; b.dataset.tab = id; b.addEventListener('click', () => this.select(id)); box.appendChild(b); } $('pdaClose').addEventListener('click', () => this.close()); $('pdaText').addEventListener('click', e => this.act(e)); },
    open(tab) { $('pda').hidden = false; this.select(tab || this.tab); },
    close() { $('pda').hidden = true; },
    select(id) { this.tab = id; this.refresh = 0; for (const b of $('pdaTabs').children) b.classList.toggle('on', b.dataset.tab === id); },
    tick(dt) { if ($('pda').hidden) return; const w = G.world; $('pdaHead').textContent = 'КПК · ' + w.player.name + ' · ' + S.fmtStamp(w.now); this.refresh -= dt; if (this.refresh > 0) return; this.refresh = 1; const el = $('pdaText'), y = el.scrollTop; el.innerHTML = this[this.tab](w); el.scrollTop = y; },
    tasks(w) {
      const p = w.player, fx = w.horror.fx; let h = '<b>АКТИВНЫЕ ЗАДАЧИ</b>\n';
      const ts = w.tasks.activeFor('player'); if (!ts.length) h += '<span class="d">Нет. ' + (p.onShift ? 'SCP LIFE скоро назначит работу.' : 'Вы вне смены.') + '</span>\n';
      for (const t of ts) { const fake = fx.falseDone === t.id; h += '\n<b>' + esc(t.title) + '</b>' + (fake ? ' <span class="g">✓ выполнено</span>' : '') + ' <span class="d">— ' + esc(t.by) + (t.deadline ? ', срок ' + S.fmtTime(t.deadline) : '') + '</span>\n'; t.steps.forEach((s, i) => { h += (s.done || fake ? '  ✓ ' : i === t.si ? '  ▶ ' : '  · ') + esc(s.label) + ' <span class="d">«' + esc(w.roomName(s.room)) + '»' + (s.need && s.need !== 'hold' ? ' · ' + esc(needText(s.need)) : '') + '</span>\n'; }); }
      h += '\n<b>НЕДАВНО</b>\n'; let n = 0; for (let i = w.tasks.list.length - 1; i >= 0 && n < 10; i--) { const t = w.tasks.list[i]; if (t.who !== 'player' || t.status === 'Active') continue; n++; h += S.fmtTime(t.doneAt || t.issued) + ' ' + (t.status === 'Completed' ? '<span class="g">выполнено</span>' : '<span class="r">провалено</span>') + ' ' + esc(t.title) + (t.note ? ' <span class="d">— ' + esc(t.note) + '</span>' : '') + '\n'; }
      return h;
    },
    journal(w) { const j = w.player.journal; let h = '<b>ЛИЧНЫЙ ЖУРНАЛ</b>\n'; for (let i = j.length - 1; i >= 0 && i >= j.length - 40; i--) h += esc(typeof j[i] === 'string' ? j[i] : j[i].text) + '\n'; return h; },
    career(w) {
      const p = w.player, pr = S.Professions.get(p.prof), dept = S.Professions.DEPTS[p.dept];
      let h = '<b>' + esc(p.name) + '</b>\n' + esc(pr.name) + ' · ' + esc(dept ? dept.name : '') + ' · допуск L' + p.level + ' · режим: ' + (p.mode === 'free' ? 'свободный' : 'карьера') + '\n' + esc(pr.desc) + '\n\n';
      h += 'Репутация в отделе: <b>' + Math.round(p.repOf(p.dept)) + '</b>/100 · заданий в должности: ' + p.tasksInRole + ' · дней: ' + p.daysInRole + '\nВыполнено: ' + p.done + ' · провалено: ' + p.failed + ' · отчётов: ' + p.reportsDone + ' · экспериментов: ' + p.experiments + ' · открытий: ' + p.discoveries + ' · дел: ' + p.cases + '\nЗамечания: <span class="r">' + p.reprimands + '</span> · благодарности: <span class="g">' + p.commendations + '</span>\n';
      if (p.promoOffer) h += '\n<span class="w">Предложено повышение: «' + esc(S.Professions.get(p.promoOffer).name) + '»</span>\n<button data-act="promo-yes">ПРИНЯТЬ</button><button data-act="promo-no">ОТКАЗАТЬСЯ</button>\n';
      const next = pr.next.map(id => { const r = S.Professions.PROMO[id] || {}; return '• ' + S.Professions.get(id).name + ': репутация ' + (r.rep || '—') + ', заданий ' + (r.tasks || '—') + ', дней ' + (r.days || '—') + (r.reports ? ', отчётов ' + r.reports : ''); });
      if (next.length) h += '\n<b>Повышение (по должности и решению руководства, не за очки)</b>\n' + esc(next.join('\n')) + '\n';
      if (pr.lateral.length) { h += '\n<b>Перевод</b> <span class="d">(нужно: репутация ' + S.Professions.TRANSFER.rep + ', заданий ' + S.Professions.TRANSFER.tasks + '; решение совещания)</span>\n'; for (const id of pr.lateral) h += '<button data-act="transfer" data-id="' + id + '">' + esc(S.Professions.get(id).name) + '</button>'; h += '\n'; }
      if (p.pendingTransfer) h += '<span class="g">Перевод одобрен: «' + esc(S.Professions.get(p.pendingTransfer).name) + '»</span> <button data-act="transfer-go">ПРИСТУПИТЬ</button>\n';
      h += '\n<b>Личное дело</b>\n'; for (const r of p.record.slice(-10).reverse()) h += S.fmtStamp(r.t) + ' ' + (r.kind === 'reprimand' ? '<span class="r">замечание</span>' : '<span class="g">благодарность</span>') + ': ' + esc(r.text) + ' <span class="d">(' + esc(r.by) + ')</span>\n';
      return h;
    },
    health(w) {
      const p = w.player, ps = p.psy;
      let h = '<b>САМОЧУВСТВИЕ</b>\nЗдоровье: ' + Math.round(p.health) + '%\nУсталость: ' + word(ps.fatigue, 'низкая', 'заметная', 'сильная') + ' (' + Math.round(ps.fatigue) + ')\nСтресс: ' + word(ps.stress, 'низкий', 'средний', 'высокий') + '\nТревога: ' + word(ps.fear, 'спокойны', 'насторожены', 'страх') + '\nКонцентрация: ' + Math.round(ps.focus * 100) + '%\nПсихологическая устойчивость: ' + Math.round(ps.resilience * 100) + '%\n';
      h += '\n<span class="d">Усталость замедляет работу и внимание. Отдых, сон, еда и общение восстанавливают. Обычный стресс не вызывает видений: если вы видите то, чего не видят другие, — это повод для медосмотра.</span>\n';
      h += '\n<b>Последний медосмотр</b>\n' + (p.examResult ? S.fmtStamp(p.examResult.t) + ': ' + esc(p.examResult.text) : 'не проводился (поговорите с врачом в медблоке)') + '\n';
      return h;
    },
    radio(w) {
      const p = w.player; let h = '<b>РАЦИЯ</b> <span class="d">(вызов сотрудника на смене)</span>\n';
      const on = w.active.filter(n => n.role !== 'DClass' && (n.dept === p.dept || ['dispatcher', 'shift_chief', 'doctor'].indexOf(n.prof) >= 0) && S.People.block(w, n).activity === 'Duty').slice(0, 14);
      for (const n of on) h += '<button data-act="call" data-id="' + n.id + '">' + esc(n.shortName) + ' · ' + esc(S.Professions.get(n.prof).name) + '</button>';
      h += '\n\n<b>СООБЩИТЬ ДИСПЕТЧЕРУ О СТРАННОМ</b>\n<button data-act="sight" data-t="кто-то идёт за мной, но никого нет">шаги за спиной</button><button data-act="sight" data-t="неизвестный человек в коридоре">неизвестный человек</button><button data-act="sight" data-t="движение на краю зрения">движение краем глаза</button><button data-act="sight" data-t="странный звук">странный звук</button>\n';
      h += '\n<b>ЭФИР</b>\n'; for (const r of (p.heardRadio || []).slice(-6).reverse()) h += S.fmtTime(r.t) + ' голос ' + esc(w.nameOf(r.from)) + '\n';
      for (const r of w.infra.radioLogList.filter(x => x.to === 'player').slice(-6).reverse()) h += S.fmtTime(r.t) + ' вызов от ' + esc(w.nameOf(r.from)) + ': «' + esc(r.text) + '»\n';
      if (G.radioReply) h += '\n<span class="w">' + esc(G.radioReply) + '</span>\n';
      return h;
    },
    dossier(w) { return dossierHtml(w, true); },
    people(w) {
      const p = w.player; let h = '<b>ЗНАКОМЫЕ И КОЛЛЕГИ</b>\n';
      const list = w.npcs.filter(n => n.rel.player || n.dept === p.dept).sort((a, b) => b.relTo('player') - a.relTo('player')).slice(0, 30);
      for (const n of list) h += esc(n.displayName) + ' · ' + esc(S.Professions.get(n.prof).name) + ' · отношение ' + Math.round(w.life.attitude(n, p)) + ' · ' + (n.onSite ? 'на территории' : 'вне комплекса') + (n.isSick(w.now) ? ' · <span class="w">болеет</span>' : '') + '\n';
      return h;
    },
    act(e) {
      const b = e.target.closest('button'); if (!b) return; const w = G.world, p = w.player, act = b.dataset.act;
      if (act === 'promo-yes') { promotePlayer(p.promoOffer); p.promoOffer = null; }
      if (act === 'promo-no') { p.promoOffer = null; UI.msg('Вы отказались от повышения.', '#ccc'); }
      if (act === 'transfer') { const ok = p.repOf(p.dept) >= S.Professions.TRANSFER.rep && p.tasksInRole >= S.Professions.TRANSFER.tasks; if (!ok) UI.msg('Перевод: не выполнены условия (репутация и задания).', '#ff9a59'); else { w.life.addAgenda('transfer', 'Перевод: ' + p.name + ' → ' + S.Professions.get(b.dataset.id).name, 'Сотрудник просит перевода.', { to: b.dataset.id }); UI.msg('Заявка на перевод вынесена на совещание.', '#8dff9e'); } }
      if (act === 'transfer-go') { promotePlayer(p.pendingTransfer, true); p.pendingTransfer = null; }
      if (act === 'call') { const n = w.npc(b.dataset.id); A.play('radio', null, 0.4, { dry: true }); G.radioReply = n && n.radioOk && n.onSite ? n.shortName + ': «На связи. Я в «' + w.roomName(n.agent.roomId) + '», ' + (n.label || '').toLowerCase() + '.»' : (n ? n.shortName : '') + ' не отвечает. Шипение в эфире.'; }
      if (act === 'sight') UI.msg(w.reportSighting(b.dataset.t), '#bfe0ff');
      this.refresh = 0;
    }
  };
  function needText(n) { if (/^cams:/.test(n)) return 'просмотреть камеры (' + n.split(':')[1] + ')'; if (/^stay:/.test(n)) return 'находиться ' + n.split(':')[1] + ' мин'; if (/^observe:/.test(n)) return 'наблюдать через окно/камеру'; if (/^talk:/.test(n)) return 'поговорить: ' + G.world.nameOf(n.split(':')[1]); if (/^escort:/.test(n)) return 'забрать и сопроводить'; if (/^terminal:/.test(n)) return 'терминал: ' + n.split(':')[1]; if (n === 'experiment') return 'терминал: исследования'; if (/^interview:/.test(n)) return 'интерком: беседа'; return n; }
  function promotePlayer(to, transfer) {
    const w = G.world, p = w.player, pr = S.Professions.get(to); if (!pr) return;
    const from = S.Professions.get(p.prof).name; p.prof = to; p.dept = pr.dept; p.level = pr.level; p.title = S.People.TITLES[to]; p.name = p.title + ' ' + p.first[0] + '. ' + p.last; p.tasksInRole = 0; p.daysInRole = 0; p.workRoom = pr.work[0];
    const c = w.card('card.player'); c.level = pr.level; c.perms = pr.perms; c.ownerName = p.name; w.lockEpoch++;
    p.record.push({ t: w.now, kind: 'commendation', text: (transfer ? 'Перевод: ' : 'Повышение: ') + from + ' → ' + pr.name, by: 'руководство' });
    w.events.post({ time: w.now, type: S.EV.Personnel, actor: 'player', severity: 1, text: 'Приказ: ' + p.first + ' ' + p.last + ' — ' + pr.name + '. Новый допуск L' + pr.level + '.' });
  }
  function dossierHtml(w, full) {
    let h = '';
    for (const a of w ? w.anomalies : S.Anoms.ORDER.map(id => S.Anoms.create(id))) {
      const d = a.def; h += '<b>' + a.displayName + '</b> · класс ' + esc(d.cls) + ' · ' + (a.arrived ? '<span class="g">в комплексе</span>' : '<span class="w">ожидается поступление</span>') + (w ? ' · изученность ' + Math.round(a.knowledge) + '%' : '') + '\n' + esc(d.desc) + '\n<span class="d">Содержание:</span> ' + esc(d.contain) + '\n<span class="d">Опасно при:</span> ' + esc(d.triggers) + '\n';
      const known = a.props.filter(p => p.revealed).map(p => p.text); if (known.length) h += '<span class="d">Установлено:</span> ' + esc(known.join('; ')) + '\n';
      const hidden = a.props.filter(p => !p.revealed).length; if (hidden) h += '<span class="d">Не изучено свойств: ' + hidden + '</span>\n';
      if (full && w && a.journal.length) h += '<span class="d">Последнее наблюдение:</span> ' + esc(a.journal[a.journal.length - 1].text) + '\n';
      h += '\n';
    }
    return h;
  }
  PDA.build();

  // ------------------------------------------------------------------ terminals (tabs depend on the profession)
  const TAB_NAMES = { minds: 'РАЗУМ ОБЪЕКТОВ', cams: 'КАМЕРЫ', access: 'ДОСТУП', events: 'СОБЫТИЯ', tasks: 'ЗАДАЧИ', report: 'РАПОРТ', research: 'ИССЛЕДОВАНИЯ', cases: 'РАССЛЕДОВАНИЯ', manage: 'УПРАВЛЕНИЕ', ethics: 'ЭТИКА', radio: 'ДИСПЕТЧЕРСКАЯ', scplife: 'ЖУРНАЛ SCP LIFE', eng: 'ИНЖЕНЕРИЯ', med: 'МЕДИЦИНА', arrivals: 'ПОСТУПЛЕНИЯ', staff: 'ПЕРСОНАЛ', archive: 'АРХИВ SCP' };
  function tabsFor(p) {
    const d = p.dept, pr = p.prof, t = [];
    if (d === 'security' || d === 'mtf' || ['dispatcher', 'director', 'sysadmin', 'dept_head'].indexOf(pr) >= 0) t.push('cams');
    if (['security_officer', 'shift_chief', 'director', 'sysadmin', 'cctv_operator'].indexOf(pr) >= 0) t.push('access');
    if (d === 'science' || pr === 'director') t.push('research');
    if (d === 'science' || ['director', 'research_director', 'anomaly_psychologist', 'ethics_inspector'].indexOf(pr) >= 0) t.push('minds');
    if (['security_officer', 'shift_chief', 'director', 'dept_head'].indexOf(pr) >= 0) t.push('cases');
    if (['director', 'dept_head', 'research_director', 'shift_chief', 'mtf_commander'].indexOf(pr) >= 0) t.push('manage');
    if (['ethics_inspector', 'director', 'research_director'].indexOf(pr) >= 0) t.push('ethics');
    if (['dispatcher', 'shift_chief', 'cctv_operator', 'director', 'guard', 'patrol'].indexOf(pr) >= 0) t.push('radio');
    if (['director', 'shift_chief', 'dispatcher', 'sysadmin', 'dept_head'].indexOf(pr) >= 0) t.push('scplife');
    if (d === 'engineering') t.push('eng');
    if (d === 'medical' || pr === 'field_medic' || pr === 'anomaly_psychologist') t.push('med');
    if (['logistician', 'mtf_commander', 'director', 'dept_head', 'operative'].indexOf(pr) >= 0) t.push('arrivals');
    t.push('events', 'tasks', 'report', 'staff', 'archive');
    return t;
  }
  const Terminal = {
    tab: 'events', refresh: 0, lastCam: null, viewT: 0, msg: '', sel: {}, tabs: [],
    build() {
      $('tClose').addEventListener('click', () => this.close());
      $('camPrev').addEventListener('click', () => { G.camIndex = (G.camIndex + G.world.cams.length - 1) % G.world.cams.length; this.viewT = 0; });
      $('camNext').addEventListener('click', () => { G.camIndex = (G.camIndex + 1) % G.world.cams.length; this.viewT = 0; });
      $('camObserve').addEventListener('click', () => { const w = G.world, cam = w.cams[G.camIndex]; const a = w.anomalies.find(x => x.arrived && x.agent.roomId === cam.roomId); UI.dialogue('Камера ' + cam.name, [a ? w.observe(a.id, true) : 'Объекта в поле зрения камеры нет.']); });
      $('tText').addEventListener('click', e => this.act(e));
    },
    open(tab) {
      const box = $('tTabs'); box.innerHTML = ''; this.tabs = tabsFor(G.world.player);
      for (const id of this.tabs) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = TAB_NAMES[id]; b.dataset.tab = id; b.addEventListener('click', () => this.select(id)); box.appendChild(b); }
      $('terminal').hidden = false; this.select(tab && this.tabs.indexOf(tab) >= 0 ? tab : this.tabs.indexOf(this.tab) >= 0 ? this.tab : this.tabs[0]);
    },
    close() { $('terminal').hidden = true; G.cctv = false; G.extraRoom = null; $('terminal').classList.remove('cctv'); },
    select(id) {
      this.tab = id; this.refresh = 0; this.msg = '';
      for (const b of $('tTabs').children) b.classList.toggle('on', b.dataset.tab === id);
      const cams = id === 'cams'; $('tCam').hidden = !cams; $('tText').hidden = cams; G.cctv = cams; $('terminal').classList.toggle('cctv', cams); this.viewT = 0;
      const w = G.world, done = { access: 'access', radio: 'radio' }[id]; if (done) { const r = w.playerTerminal(done); if (r) UI.msg(r, '#e8d77a'); }
    },
    tick(dt) {
      if ($('terminal').hidden) return;
      const w = G.world; $('tHead').textContent = 'ТЕРМИНАЛ · ' + w.player.name + ' · ' + S.fmtStamp(w.now) + ' · ТРЕВОГА ' + S.ALERT_NAMES[w.alert.level];
      if (this.tab === 'cams') return this.cams(dt);
      this.refresh -= dt; if (this.refresh > 0) return; this.refresh = 1.5;
      const el = $('tText'), y = el.scrollTop; el.innerHTML = this[this.tab](w) + (this.msg ? '\n<span class="w">' + esc(this.msg) + '</span>' : ''); el.scrollTop = y;
    },
    // what researchers can know about the minds: observed behaviour, decisions and their source (model or local), requests, refusals
    minds(w) {
      if (!w.ai) return 'Модуль интеллекта объектов не загружен.';
      const st = S.LLM ? S.LLM.status() : { online: false, reason: '—' }, T = S.AITypes || {};
      let h = '<b>РАЗУМ ОБЪЕКТОВ</b> · языковая модель: ' + (st.online ? '<span style="color:#8dff9e">' + esc(st.provider) + '</span>' : '<span style="color:#ffb36b">нет (' + esc(st.reason) + ')</span>') + ' · очередь ' + st.queue + '\n\n';
      for (const id in w.ai.agents) {
        const ag = w.ai.agents[id], a = ag.a; if (!a || !a.arrived) continue; const s2 = ag.s, last = s2.decisions[s2.decisions.length - 1];
        const mood = Object.entries(s2.emo).sort((x, y) => y[1] - x[1])[0];
        h += '<b>' + esc(a.displayName) + '</b> — ' + esc(T[ag.p.type] || ag.p.type) + (ag.p.llm ? ', мышление: языковая модель' : ', поведенческий ИИ') + '\n';
        h += '  Наблюдаемое: ' + esc(a.status) + (mood ? ' · состояние: ' + esc(mood[0]) : '') + (s2.refuseUntil > w.now ? ' · <span style="color:#ff8a6b">отказывается от экспериментов</span>' : '') + (s2.request ? ' · просит: ' + esc(s2.request.item) : '') + '\n';
        if (last) h += '  Последнее действие: ' + esc(last.rejected ? 'решение отклонено (' + last.rejected + ')' : last.action + (last.target ? ' → ' + w.nameOf(last.target) : '') + (last.say ? ' «' + last.say + '»' : '')) + ' <span style="color:#7c858a">[' + (last.src === 'llm' ? 'модель' : 'локально') + ', ' + S.fmtTime(last.t) + ']</span>\n';
        const known = Object.keys(s2.rel).filter(k => s2.rel[k].fam > 0.3).map(k => w.nameOf(k)); if (known.length) h += '  Узнаёт: ' + esc(known.slice(0, 5).join(', ')) + '\n';
        h += '  Решений: модель ' + s2.llmUses + ', локально ' + s2.localUses + '\n\n';
      }
      h += '<b>AI OVERSEER</b>\n'; for (const l of w.ai.overseer.log.slice(-6).reverse()) h += '  ' + S.fmtTime(l.t) + ' [' + (l.src === 'llm' ? 'модель' : 'локально') + '] ' + esc(l.text) + '\n';
      h += '\n<b>ЖУРНАЛ РАЗУМОВ</b>\n'; for (const l of w.ai.log.slice(-14).reverse()) h += '  ' + S.fmtTime(l.t) + ' ' + esc(l.scp) + ' [' + (l.src === 'llm' ? 'модель' : 'локально') + '] ' + esc(l.text) + '\n';
      return h;
    },
    cams(dt) {
      const w = G.world, cam = w.cams[G.camIndex]; G.extraRoom = cam.roomId;
      if (this.lastCam !== cam.id) { this.lastCam = cam.id; this.viewT = 0; }
      this.viewT += dt; const counted = w.player.camsViewed.indexOf(cam.id) >= 0; if (this.viewT > 1.5 && !this.viewedOnce) { this.viewedOnce = cam.id; } if (this.viewT > 1.5 && this.viewedFor !== cam.id) { this.viewedFor = cam.id; w.viewedCamera(cam.id); }
      $('camOver').innerHTML = esc(cam.name) + '\n' + S.fmtStamp(w.now) + ' ' + (!cam.operational ? '<span style="color:#ff4040">НЕТ СИГНАЛА</span>' : (performance.now() / 700 | 0) % 2 ? '<span style="color:#ff4040">● ЗАПИСЬ</span>' : '');
      let t = '<b>' + esc(cam.name) + '</b>\n' + esc(w.roomName(cam.roomId)) + '\n' + (counted ? '<span style="color:#8dff9e">Просмотрена</span>' : '') + '\n\nВ кадре:\n';
      if (!cam.operational) t += '  сигнал отсутствует\n'; else if (!cam.visible.length) t += '  никого\n';
      for (const id of cam.visible) { const n = w.npc(id), a = w.anomaly(id); t += '  • ' + esc(w.nameOf(id)) + (n ? ' — ' + esc((n.label || '').toLowerCase()) : a ? ' — <span style="color:#ff8a7a">' + esc(a.status) + '</span>' : '') + '\n'; }
      t += '\nКамера ' + (G.camIndex + 1) + ' из ' + w.cams.length;
      $('camText').innerHTML = t; $('camObserve').hidden = w.fac.room(cam.roomId).type !== 'Containment';
    },
    access(w) { let h = '<b>ЖУРНАЛ СЧИТЫВАТЕЛЕЙ</b> (новые сверху)\n\n'; for (let i = w.accessLog.length - 1, n = 0; i >= 0 && n < 120; i--, n++) { const e = w.accessLog[i], d = w.fac.door(e.door), ok = /Granted/.test(e.r); h += S.fmtStamp(e.t) + '  ' + esc(d ? d.name : e.door) + ' — ' + esc(e.owner) + ' — <span class="' + (ok ? 'g' : e.r === S.R.Await ? 'w' : 'r') + '">' + esc(S.RESULT_TEXT[e.r] || e.r) + '</span>\n'; } return h; },
    events(w) {
      let h = '<b>СОБЫТИЯ, ЗАФИКСИРОВАННЫЕ СИСТЕМАМИ</b>\n<span class="d">Наблюдения сотрудников, которые никто не подтвердил, помечены как «не подтверждено».</span>\n\n', n = 0;
      for (let i = w.events.recent.length - 1; i >= 0 && n < 120; i--) { const e = w.events.recent[i]; if (e.hidden || e.quiet || e.type === 'Conversation') continue; n++; const cls = e.severity >= 2 ? 'r' : e.severity === 1 ? 'w' : 'g'; h += S.fmtStamp(e.time) + ' <span class="' + cls + '">[' + esc(S.EV_NAMES[e.type] || e.type) + ']</span> ' + esc(e.text) + '\n'; }
      return h;
    },
    tasks(w) { return PDA.tasks(w); },
    report() {
      let h = '<b>РАПОРТ</b>\nРапорт уходит в SCP LIFE. Система действует по вашим личным наблюдениям: осмотрите объект через окно или камеру.\n<button data-act="report">ПОДАТЬ РАПОРТ О СОСТОЯНИИ ОБЪЕКТОВ</button>\n';
      h += '\n<b>СООБЩИТЬ О НЕПОДТВЕРЖДЁННОМ НАБЛЮДЕНИИ</b>\n<button data-act="sight" data-t="неизвестный человек в коридоре">неизвестный человек</button><button data-act="sight" data-t="шаги за спиной в пустом помещении">шаги за спиной</button><button data-act="sight" data-t="фигура в кресле">фигура в кресле</button><button data-act="sight" data-t="лишняя дверь в коридоре">лишняя дверь</button>\n';
      if (this.reportText) h += '\n<span class="w">Ответ SCP LIFE: ' + esc(this.reportText) + '</span>\n';
      return h;
    },
    research(w) {
      const p = w.player, L = w.life; let h = '<b>ИССЛЕДОВАНИЯ</b> · бюджет науки: ' + Math.round(L.res.budget.science) + ' · образцов: ' + (w.research.samples || 0) + '\n';
      const ws = w.playerStepFor(s => s.need === 'terminal:report');
      if ((p.reportsPending || 0) > 0 || ws) {
        h += '\n<b>НАУЧНЫЙ ОТЧЁТ</b> <span class="d">(отметьте наблюдения, которые включаете; качество зависит от полноты)</span>\n';
        (p.obsNotes || []).slice(-6).forEach((o, i) => { const on = this.sel['n' + i]; h += '<button data-act="note" data-i="' + i + '">' + (on ? '☑' : '☐') + '</button> ' + S.fmtTime(o.t) + ' ' + esc(o.scp) + ': ' + esc(String(o.text).slice(0, 110)) + '\n'; });
        if (!(p.obsNotes || []).length) h += '<span class="d">Нет записанных наблюдений — понаблюдайте за объектом.</span>\n';
        h += '<button data-act="writereport">СДАТЬ ОТЧЁТ</button>\n';
      }
      const exp = w.playerStepFor(s => s.need === 'experiment');
      if (exp) h += '\n<span class="w">Назначен эксперимент: ' + esc(exp.t.title) + '</span> <button data-act="runexp">ПРОВЕСТИ</button> <span class="d">(нужно быть в наблюдательном пункте объекта)</span>\n';
      h += '\n<b>ЗАЯВКИ</b>\n';
      for (const r of L.requests.slice(-12).reverse()) { h += r.id + ' ' + esc(r.title) + ' — ' + esc(w.nameOf(r.by)) + ' — <span class="' + (r.status === 'done' ? 'g' : r.status === 'rejected' ? 'r' : 'w') + '">' + ({ pending: 'ждёт утверждения', ethics: 'на этике', approved: 'утверждена', scheduled: 'назначена', done: 'проведена', rejected: 'отклонена' })[r.status] + '</span>'; if (r.status === 'pending' && ['research_director', 'director', 'senior_scientist'].indexOf(p.prof) >= 0) h += ' <button data-act="approve" data-id="' + r.id + '">УТВЕРДИТЬ</button><button data-act="reject" data-id="' + r.id + '">ОТКЛОНИТЬ</button>'; if (r.result) h += '\n   <span class="d">' + esc(r.result) + '</span>'; h += '\n'; }
      h += '\n<b>ПОДАТЬ ЗАЯВКУ</b>\n';
      for (const a of w.anomalies.filter(x => x.arrived && (p.assignedScps.indexOf(x.id) >= 0 || p.level >= 3))) { h += esc(a.id) + ': '; for (const e of a.def.exps || []) { const done = a.experiments.some(x => x.id === e.id); h += '<button data-act="request" data-scp="' + a.id + '" data-exp="' + e.id + '">' + (done ? '↻ ' : '') + esc(e.name) + (e.ethics || e.dclass ? ' ⚖' : '') + '</button>'; } h += '\n'; }
      h += '\n<b>РЕЗУЛЬТАТЫ</b>\n'; for (const a of w.anomalies) for (const e of a.experiments.slice(-2)) h += S.fmtStamp(e.t) + ' ' + a.id + ' «' + esc(e.name) + '»: ' + esc(e.text) + (e.revealed.length ? ' <span class="g">[открыто: ' + esc(e.revealed.join('; ')) + ']</span>' : '') + '\n';
      return h;
    },
    cases(w) {
      const L = w.life; let h = '<b>РАССЛЕДОВАНИЯ</b>\n<span class="d">Причиной не всегда бывает саботаж. Новые факты могут изменить заключение.</span>\n';
      for (const c of L.cases.slice().reverse()) {
        h += '\n<b>' + c.id + ' ' + esc(c.title) + '</b> · ' + ({ open: 'открыто', closed: 'закрыто', reopened: '<span class="w">пересмотрено</span>' })[c.status] + (c.conclusion ? ' · заключение: ' + esc(S.CAUSES[c.conclusion]) + ' (' + esc(w.nameOf(c.closedBy)) + ')' : '') + '\n';
        if (this.sel.case === c.id) {
          for (const e of c.evidence) h += '  [' + esc(e.src) + '] ' + esc(e.text) + '\n';
          if (c.timeline && c.timeline.length) h += '  <span class="d">Хронология:</span>\n' + c.timeline.map(x => '   ' + esc(x)).join('\n') + '\n';
          for (const x of c.history) h += '  <span class="d">' + esc(x) + '</span>\n';
          if (c.status !== 'closed') { h += '  Заключение: '; for (const k in S.CAUSES) h += '<button data-act="conclude" data-id="' + c.id + '" data-h="' + k + '">' + esc(S.CAUSES[k]) + '</button>'; h += '\n'; }
        } else h += '<button data-act="case" data-id="' + c.id + '">МАТЕРИАЛЫ ДЕЛА</button>\n';
      }
      if (!L.cases.length) h += '\nДел нет.';
      return h;
    },
    manage(w) {
      const L = w.life, p = w.player; let h = '<b>УПРАВЛЕНИЕ КОМПЛЕКСОМ</b>\n';
      h += 'Бюджеты: ' + Object.entries(L.res.budget).map(([k, v]) => k + ' ' + Math.round(v) + (p.prof === 'director' || p.prof === 'dept_head' ? ' <button data-act="budget" data-k="' + k + '" data-d="10">+</button><button data-act="budget" data-k="' + k + '" data-d="-10">−</button>' : '')).join(' · ') + '\nМатериалы: ' + Math.round(L.res.materials) + ' · оборудование: ' + Math.round(L.res.equipment) + '\nНехватка персонала: ' + (Object.entries(L.short).map(([k, v]) => k + ' ' + v).join(', ') || 'нет') + '\n';
      h += '\n<b>ПОВЕСТКА</b> <span class="d">(решения вступают в силу на совещании в 09:00 или немедленно — решением директора)</span>\n';
      for (const it of L.agenda.filter(x => x.status === 'open')) { h += '\n<b>' + esc(it.title) + '</b>\n' + esc(it.desc) + '\n'; for (const o of it.options) h += '<button data-act="agenda" data-id="' + it.id + '" data-o="' + o.id + '">' + (it.playerChoice === o.id ? '● ' : '') + esc(o.text) + '</button>'; if (p.prof === 'director') h += ' <button data-act="decide" data-id="' + it.id + '">РЕШИТЬ СЕЙЧАС</button>'; h += '\n'; }
      h += '\n<b>РЕШЁННЫЕ ВОПРОСЫ</b>\n'; for (const it of L.agenda.filter(x => x.status === 'decided').slice(-6).reverse()) h += esc(it.title) + ' → ' + esc((it.options.find(o => o.id === it.decided) || {}).text) + '\n';
      h += '\n<button data-act="reviewreports">ПРОВЕРИТЬ ОТЧЁТЫ ПОДЧИНЁННЫХ</button>\n';
      return h;
    },
    ethics(w) {
      const L = w.life; let h = '<b>КОМИТЕТ ПО ЭТИКЕ</b>\n<span class="d">Ни один вариант не бывает безусловно правильным: отказ тормозит науку и злит учёных, согласие — бьёт по людям и отношениям.</span>\n';
      for (const r of L.requests.filter(x => x.status === 'ethics')) { const a = w.anomaly(r.scp), ex = a.def.exps.find(e => e.id === r.exp); h += '\n<b>' + r.id + ' ' + esc(r.title) + '</b> — ' + esc(w.nameOf(r.by)) + '\n' + esc(ex.desc) + '\n<button data-act="eth" data-id="' + r.id + '" data-d="approve">ОДОБРИТЬ</button><button data-act="eth" data-id="' + r.id + '" data-d="volunteer">ТОЛЬКО ДОБРОВОЛЕЦ</button><button data-act="eth" data-id="' + r.id + '" data-d="reject">ОТКЛОНИТЬ</button>\n'; }
      h += '\n<b>ОБРАЩЕНИЯ И СПОРЫ</b>\n'; for (const it of L.agenda.filter(x => x.status === 'open' && (x.kind === 'd_refusal' || x.kind === 'therapy' || x.kind === 'healer'))) h += esc(it.title) + ' — ' + esc(it.desc) + '\n';
      return h;
    },
    radio(w) {
      const L = w.life; let h = '<b>ДИСПЕТЧЕРСКАЯ</b>\n<span class="d">Сообщения сотрудников — это субъективные наблюдения, пока проверка их не подтвердит.</span>\n\n<b>СООБЩЕНИЯ</b>\n';
      for (const s of L.sightings.slice(-12).reverse()) h += S.fmtTime(s.t) + ' ' + esc(w.nameOf(s.reporter)) + ' (' + esc(w.roomName(s.roomId)) + '): ' + esc(s.text) + ' — <span class="' + (s.status === 'unconfirmed' ? 'w' : 'd') + '">' + (s.status === 'unconfirmed' ? 'не подтверждено' : 'проверяется') + '</span>' + (s.checks.length ? '\n   <span class="d">' + esc(s.checks.slice(-1)[0]) + '</span>' : '') + '\n';
      h += '\n<b>РАДИОЖУРНАЛ</b>\n'; const located = w.anomaly('SCP-LF-135').props.find(p => p.id === 'source_located').revealed; for (const r of w.infra.radioLogList.slice(-12).reverse()) h += S.fmtTime(r.t) + ' от ' + esc(w.nameOf(r.from)) + ' к ' + esc(w.nameOf(r.to)) + ': «' + esc(r.text) + '»' + (r.bearing && located ? ' <span class="r">[пеленг: камера LF-135]</span>' : '') + '\n';
      h += '\n<b>РАЦИИ НА СМЕНЕ</b>\n'; for (const n of w.active.filter(x => x.dept === 'security' && S.People.block(w, x).activity === 'Duty').slice(0, 16)) h += esc(n.shortName) + ': ' + (n.radioOk ? '<span class="g">на связи</span>' : '<span class="r">не отвечает</span>') + ' · ' + esc(w.roomName(n.agent.roomId)) + '\n';
      return h;
    },
    scplife(w) { let h = '<b>ЖУРНАЛ РЕШЕНИЙ SCP LIFE</b>\n<span class="d">причина → данные → решение → исполнитель → результат</span>\n\n'; for (const d of w.life.decisions.slice(-60).reverse()) { if (d.hidden) continue; h += S.fmtStamp(d.t) + ' <b>' + esc(d.cause) + '</b>\n   данные: ' + esc(d.data.join('; ')) + '\n   решение: ' + esc(d.decision) + ' → ' + esc(d.assigned) + (d.result ? '\n   результат: ' + esc(d.result) : '') + (d.cons.length ? '\n   последствия: ' + esc(d.cons.join('; ')) : '') + '\n'; } return h; },
    eng(w) {
      const I = w.infra; let h = '<b>ИНЖЕНЕРНЫЕ СИСТЕМЫ</b>\nГлавный генератор: ' + (I.gens.genMain.fault ? '<span class="r">НЕИСПРАВЕН</span>' : 'в работе') + ', износ ' + Math.round(I.gens.genMain.wear) + '% · резервный: ' + (I.gens.genC.on ? '<span class="w">работает</span>' : 'в резерве') + '\n';
      h += '\n<b>ИЗВЕСТНЫЕ НЕИСПРАВНОСТИ</b>\n'; for (const f of I.openFaults().filter(x => x.known)) h += f.id + ' ' + esc(f.text) + ' <span class="d">(' + esc(f.knownBy) + ', ' + S.fmtTime(f.knownAt) + ')</span>\n';
      h += '\n<b>ДАТЧИКИ КАМЕР</b> <span class="d">(как их видит система; исправность датчика проверяет только калибровка)</span>\n';
      for (const cell in I.sensors) { const s = I.sensors[cell].last; if (s) h += esc(w.roomName(cell)) + ': движение ' + s.motion.toFixed(2) + ' · ЭМ ' + s.em.toFixed(2) + ' · ' + s.temp.toFixed(1) + '°C · замок ' + s.lock + '%\n'; }
      h += '\n<b>ЖУРНАЛ ОБСЛУЖИВАНИЯ И ГРАФИК</b>\n'; for (const l of I.log.slice(-20).reverse()) h += S.fmtStamp(l.t) + ' ' + esc(l.text) + '\n';
      for (const fa of w.horror.falseAlarms) if (!fa.explained && (fa.kind === 'knock' || fa.kind === 'outage')) w.horror.explain(fa.kind, fa.cause);
      return h;
    },
    med(w) {
      let h = '<b>МЕДИЦИНСКАЯ СЛУЖБА</b>\n\n<b>ПАЦИЕНТЫ</b>\n';
      for (const n of w.active.filter(x => x.activity === 'SeekTreatment' || x.needs.health < 70 || x.restricted)) h += esc(n.displayName) + ' · здоровье ' + Math.round(n.needs.health) + (n.restricted ? ' · <span class="w">отстранён до осмотра</span>' : '') + ' · ' + esc(w.roomName(n.agent.roomId)) + '\n';
      h += '\n<b>БОЛЬНИЧНЫЕ</b>\n'; for (const n of w.npcs.filter(x => x.isSick(w.now)).slice(0, 20)) h += esc(n.displayName) + ' до ' + S.fmtStamp(n.sickUntil) + '\n';
      h += '\n<b>ЖАЛОБЫ НА ВОСПРИЯТИЕ</b> <span class="d">(со слов сотрудников)</span>\n'; for (const s of w.life.sightings.slice(-8).reverse()) h += esc(w.nameOf(s.reporter)) + ': ' + esc(s.text) + '\n';
      return h;
    },
    arrivals(w) { const L = w.life; let h = '<b>ПОСТУПЛЕНИЯ ОБЪЕКТОВ</b>\n'; for (const a of L.arrivals) { const an = w.anomaly(a.scp); h += '\n<b>' + esc(a.scp) + ' «' + esc(an.name) + '»</b> · ' + esc(a.origin) + ' · этап: ' + esc({ planned: 'планируется', notice: 'уведомление', dock: 'в шлюзе', temp: 'временная зона', contained: 'содержится' }[a.stage]) + '\n' + esc((a.history || []).join('\n')) + '\n'; } h += '\n<b>ЖУРНАЛ ТРАНСПОРТИРОВОК</b>\n'; for (const t of L.transport.slice(-20).reverse()) h += S.fmtStamp(t.t) + ' ' + esc(t.scp) + ': ' + esc(t.text) + '\n'; return h; },
    staff(w) {
      const p = w.player, hr = p.prof === 'director' || p.prof === 'dept_head'; let h = '<b>ПЕРСОНАЛ</b> · зарегистрировано ' + w.npcs.length + ' · на территории ' + w.active.length + '\n<span class="d">Система знает только то, что видели камеры. График — это план, а не факт.</span>\n\n';
      const list = hr ? w.active.slice(0, 80) : w.active.filter(n => n.dept === p.dept).slice(0, 40);
      for (const n of list) { let seen = 'не фиксировался'; for (const c of w.cams) if (c.visible.indexOf(n.id) >= 0) seen = '<span class="g">сейчас: ' + esc(c.name) + '</span>'; if (seen === 'не фиксировался') for (let i = w.camLog.length - 1; i >= 0; i--) if (w.camLog[i].subj === n.id) { const cc = w.cams.find(x => x.id === w.camLog[i].cam); seen = S.fmtTime(w.camLog[i].time) + ', ' + esc(cc ? cc.name : ''); break; } const b = S.People.block(w, n); h += '<b>' + esc(n.displayName) + '</b> · ' + esc(S.Professions.get(n.prof).name) + (hr ? ' · ' + esc(n.character) : '') + '\n   по графику: ' + esc(b.label) + ' · камеры: ' + seen + '\n'; }
      return h;
    },
    archive(w) { return '<b>АРХИВ АНОМАЛИЙ</b>\n\n' + dossierHtml(w, true); },
    act(e) {
      const b = e.target.closest('button'); if (!b) return; const w = G.world, L = w.life, p = w.player, act = b.dataset.act; let r = null;
      switch (act) {
        case 'report': this.reportText = w.report(); A.play('ok'); break;
        case 'sight': this.reportText = w.reportSighting(b.dataset.t); break;
        case 'note': this.sel['n' + b.dataset.i] = !this.sel['n' + b.dataset.i]; break;
        case 'writereport': { const notes = (p.obsNotes || []).slice(-6).filter((o, i) => this.sel['n' + i]); p.lastReportQuality = Math.min(0.55, notes.length * 0.15) + (new Set(notes.map(x => x.scp)).size > 1 ? 0.05 : 0); const scp = notes.length ? notes[notes.length - 1].scp : null; r = L.reportWritten('player', scp); const s = w.playerTerminal('report'); this.sel = {}; this.msg = 'Отчёт сдан: ' + r + (s ? ' · ' + s : ''); break; }
        case 'runexp': { const m = w.playerStepFor(s => s.need === 'experiment'); if (!m) break; const a = w.anomaly(m.s.scp); if (p.roomId !== (a.obsRoom || a.containRoom) && p.roomId !== a.containRoom) { this.msg = 'Нужно находиться в «' + w.roomName(a.obsRoom) + '».'; break; } r = w.playerExperiment(m.s.scp, m.s.exp); this.msg = 'Эксперимент проведён: ' + r; break; }
        case 'approve': case 'reject': { const q = L.requests.find(x => x.id === b.dataset.id); if (q) { L.approveDecision(q, act === 'approve', 'player'); const s = w.playerTerminal('research'); this.msg = 'Решение принято.' + (s ? ' ' + s : ''); } break; }
        case 'request': { const q = L.request('player', b.dataset.scp, b.dataset.exp, 'Заявка ' + p.name); this.msg = q ? 'Заявка ' + q.id + ' подана' + (q.ethics ? ' — на рассмотрение комитета по этике' : ' — руководителю исследований') : 'Ошибка заявки'; break; }
        case 'case': this.sel.case = this.sel.case === b.dataset.id ? null : b.dataset.id; break;
        case 'conclude': { const c = L.cases.find(x => x.id === b.dataset.id); if (c) { L.conclude(c, b.dataset.h, 'player'); this.msg = 'Заключение по делу ' + c.id + ' внесено: ' + S.CAUSES[b.dataset.h] + '.'; } break; }
        case 'agenda': { const it = L.agenda.find(x => x.id === b.dataset.id); if (it) { it.playerChoice = b.dataset.o; const s = w.playerTerminal('management'); this.msg = 'Позиция записана.' + (s ? ' ' + s : ''); } break; }
        case 'decide': { const it = L.agenda.find(x => x.id === b.dataset.id); if (it) { if (!it.playerChoice) it.playerChoice = it.options[0].id; L.resolveAgenda(it, 'Решение директора'); w.playerTerminal('management'); this.msg = 'Решение принято.'; } break; }
        case 'budget': { const k = b.dataset.k, d = +b.dataset.d, others = Object.keys(L.res.budget).filter(x => x !== k); if (d > 0) { const from = others.sort((x, y) => L.res.budget[y] - L.res.budget[x])[0]; if (L.res.budget[from] >= 10) { L.res.budget[from] -= 10; L.res.budget[k] += 10; } } else if (L.res.budget[k] >= 10) { L.res.budget[k] -= 10; L.res.budget[others[0]] += 10; } L.decide('Перераспределение бюджета', [k + ' ' + (d > 0 ? '+' : '') + d], 'Решение руководства', p.name); w.playerTerminal('management'); break; }
        case 'reviewreports': { r = L.reviewReports('player'); const s = w.playerTerminal('reports'); this.msg = r + (s ? ' · ' + s : ''); break; }
        case 'eth': { const q = L.requests.find(x => x.id === b.dataset.id); if (q) { L.ethicsDecision(q, b.dataset.d, 'player'); const it = L.agenda.find(x => x.kind === 'experiment_ethics' && x.data.req === q.id && x.status === 'open'); if (it) { it.status = 'decided'; it.decided = b.dataset.d; } const s = w.playerTerminal('ethics'); this.msg = 'Решение комитета внесено.' + (s ? ' ' + s : ''); } break; }
      }
      this.refresh = 0;
    }
  };
  Terminal.build();

  // ------------------------------------------------------------------ views
  function buildViews() {
    if (G.fv) scene.remove(G.fv.root);
    for (const id in G.npcViews) scene.remove(G.npcViews[id].root);
    for (const v of G.anomViews) { scene.remove(v.root); if (v.fixed) scene.remove(v.fixed); }
    for (const c of G.cams) scene.remove(c.group);
    for (const k in (G.cardMeshes || {})) scene.remove(G.cardMeshes[k]);
    for (const h of G.hallu) scene.remove(h.root);
    const w = G.world; S.Render.setQuality && S.Render.setQuality(settings.quality); G.fv = new S.Render.FacilityView(w, scene); if (w.setNavColliders) w.setNavColliders(G.fv.colliders); G.npcViews = {}; G.anomViews = []; G.cams = []; G.cardMeshes = {}; G.hallu = [];
    for (const a of w.anomalies) { const v = a.model === 'tallyman' ? new S.Render.TallymanView(a, G.fv.m, w, G.fv) : S.Creatures && S.Creatures.MAP[a.model] ? S.Creatures.create(a, w) : new S.Render.AnomalyView(a, G.fv.m, w, G.fv); v.a = a; if (v.fixed) scene.add(v.fixed); Object.assign(v, { prev: S.V.copy(a.agent.pos), cur: S.V.copy(a.agent.pos), py: a.agent.yaw, cy: a.agent.yaw, last: S.V.copy(a.agent.pos) }); scene.add(v.root); G.anomViews.push(v); }
    for (const c of w.cams) { const m = S.Render.cameraModel(c, G.fv.m); scene.add(m.group); G.cams.push(m); }
    const p = w.player; P.yaw = p.yaw; P.pitch = p.pitch || 0; P.stamina = 1;
  }
  // actions at the window of a living anomaly: knock (creatures that hear will react), read the observation journal
  function livingActs(a) {
    const w = G.world;
    return [['Постучать по стеклу', () => { S.Living.knock(w, 'player', a.id); UI.msg('Вы постучали по стеклу.', '#ccc'); }],
      ['Журнал наблюдений', () => UI.dialogue('Журнал: ' + a.displayName, S.Living.dossier(w, a))]];
  }
  // actions offered by an anomaly's mind (talking objects get the intercom; objects with wishes can receive an item)
  function mindActs(a) {
    const w = G.world, ag = w.ai && w.ai.agent(a.id), acts = a.def.living ? livingActs(a) : [];
    if (ag && ag.p.llm && ag.p.speech.mode !== 'none') acts.unshift(['Говорить (интерком)', () => { UI.closeDialogue(); Chat.open(a.id); }]);
    if (ag && (ag.p.items || []).length) acts.push(['Передать предмет', () => UI.dialogue('Передать в камеру', ['Что передать ' + a.displayName + '?' + (ag.s.request ? '\nОбъект просил: ' + ag.s.request.item : '')], ag.p.items.map(it => [it, () => { UI.msg(w.ai.giveItem(a.id, 'player', it), '#cdb8f5'); UI.closeDialogue(); }]))]);
    return acts.length ? acts : undefined;
  }
  // ------------------------------------------------------------------ intercom chat with a thinking anomaly (language model)
  const QUICK = { 'SCP-LF-144': ['Который сейчас час?', 'Как вас зовут?', 'Что вы пишете?'], 'SCP-LF-146': ['Почему вы на меня смотрите?', 'Что вы видите?', 'Кто смотрел на вас дольше всех?'], 'SCP-LF-142': ['Привет', 'Повтори за мной', 'Кого ты копируешь?'], 'SCP-L-001': ['Сколько нас?', 'Что ты считаешь?', 'Сколько осталось?'], 'SCP-LF-124': ['Что нас ждёт завтра?', 'Кому вы доверяете?', 'Почему вы отказались?'], 'SCP-LF-128': ['Как ты?', 'Тебе одиноко?', 'Хочешь игрушку?'] };
  const Chat = {
    scp: null, busy: false,
    open(id) {
      this.scp = id; const w = G.world, a = w.anomaly(id), ag = w.ai.agent(id); $('chatTitle').textContent = a.displayName + ' · интерком'; $('chat').hidden = false; $('chatLog').innerHTML = '';
      const conv = (ag.s.mem.convo.player || []).slice(-8); for (const l of conv) this.add(l.from === 'scp' ? 'scp' : 'me', l.text, l.from === 'scp' ? 'из памяти разговоров' : '');
      if (ag.s.mem.summary.player) this.add('sys', 'Раньше: ' + ag.s.mem.summary.player.slice(-200));
      const q = $('chatQuick'); q.innerHTML = ''; for (const t of (QUICK[id] || ['Здравствуйте', 'Как вы?'])) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', () => this.send(t)); q.appendChild(b); }
      this.mode(); A.play('ui_open', null, 0.5, { dry: true, ui: true });
    },
    close() { $('chat').hidden = true; this.scp = null; $('chatIn').blur(); },
    mode() { const st = S.LLM ? S.LLM.status() : { online: false, reason: 'модуль ИИ не загружен' }; const el = $('chatMode'); el.textContent = st.online ? 'ИИ: ' + st.provider : 'локальный режим'; el.classList.toggle('on', st.online); el.title = st.reason; },
    add(cls, text, src) { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; if (src) { const s2 = document.createElement('span'); s2.className = 'src'; s2.textContent = src; d.appendChild(s2); } const log = $('chatLog'); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; },
    send(text) {
      text = String(text || '').trim(); if (!text || this.busy || !this.scp) return; const w = G.world, id = this.scp, a = w.anomaly(id);
      if (w.player.roomId !== a.obsRoom && w.player.roomId !== a.containRoom) { this.add('sys', 'Интерком работает только из наблюдательной объекта.'); return; }
      this.add('me', text); $('chatIn').value = ''; this.busy = true; const wait = this.add('sys', '…'); this.mode();
      w.ai.talk(id, 'player', text).then(r => {
        this.busy = false; wait.remove(); if (this.scp !== id) return;
        if (r.say) this.add('scp', r.say, 'ответ создан языковой моделью (' + (r.provider === 'artifact' ? 'Claude' : r.provider === 'proxy' ? 'сервер ИИ' : r.provider) + ')');
        if (r.nonverbal) this.add('sys', r.nonverbal);
        if (!r.ok) this.add('sys', 'Ответа словами нет: ' + (r.reason || 'модель недоступна') + '.');
        else if (!r.say && !r.nonverbal) this.add('sys', 'Объект молчит.');
        if (r.rejected) this.add('sys', 'Часть ответа отклонена проверкой: ' + r.rejected);
        this.mode();
      });
    },
    hear(e) { if (!$('chat').hidden && e.scp === this.scp) this.add('scp', e.text.replace(/^[^:]*:\s*/, '').replace(/^«|»$/g, ''), e.src === 'llm' ? 'объект заговорил сам (языковая модель)' : 'локально'); }
  };
  $('chatClose').addEventListener('click', () => Chat.close());
  $('chatForm').addEventListener('submit', e => { e.preventDefault(); Chat.send($('chatIn').value); });
  $('chatIn').addEventListener('keydown', e => e.stopPropagation());
  function makeRig(npc) { return (S.Humans && S.Humans.create(npc)) || new S.Render.Humanoid(npc, G.fv.m); }
  // ---- bodies, stretchers and blood (amount by the "gore" setting)
  function stretcherAt(id, x, y, z, yaw) {
    const S2 = G.stretchers || (G.stretchers = {}); let m = S2[id];
    if (!m) { m = new T.Group(); const fv = G.fv.m; const bed = new T.Mesh(new T.BoxGeometry(0.62, 0.06, 2.0), fv.fabric || fv.dark); bed.position.y = 0.66; m.add(bed); for (const sx of [-0.33, 0.33]) { const pole = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 2.5), fv.metal); pole.position.set(sx, 0.68, 0); m.add(pole); } scene.add(m); S2[id] = m; }
    m.position.set(x, y, z); m.rotation.y = yaw * D2R; m.visible = true; m.used = true;
  }
  function bloodAt(key, x, y, z, r) {
    const B = G.blood || (G.blood = {}); let m = B[key];
    if (!m) {
      if (!G.bloodMat) G.bloodMat = new T.MeshBasicMaterial({ color: 0x3b0606, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      m = new T.Mesh(new T.CircleGeometry(1, 20), G.bloodMat); m.rotation.x = -Math.PI / 2; scene.add(m); B[key] = m;
      const keys = Object.keys(B); if (keys.length > 60) { const k0 = keys[0]; scene.remove(B[k0]); B[k0].geometry.dispose(); delete B[k0]; }
    }
    m.position.set(x, y + 0.012, z); m.scale.setScalar(r); m.visible = true;
  }
  function gore(w, dt) {
    for (const id in G.stretchers || {}) { const m = G.stretchers[id]; if (!m.used) m.visible = false; m.used = false; }
    const level = settings.gore, md = w.med; if (!md) return;
    for (const k in G.blood || {}) G.blood[k].visible = level > 0;
    for (const b of md.bodies) {
      if (b.inMorgue) continue;
      const npcShown = w.npc(b.who) && !w.npc(b.who).played;
      if (!npcShown) bodyRig(w, b);                                      // a former player character lies where they fell
      if (b.carriedBy && !npcShown) stretcherAt(b.id, b.pos.x, b.pos.y, b.pos.z, b.yaw || 0);
      if (level > 0 && !b.carriedBy && !b.recovered) { const age = (w.now - b.t) / w.clock.minPerSec, bloody = ['cut', 'bite', 'claw', 'gunshot', 'crush'].indexOf(b.cause) >= 0; if (bloody || level === 2) bloodAt('b:' + b.id, b.pos.x, b.pos.y, b.pos.z, Math.min(level === 2 ? 1.25 : 0.7, 0.25 + age * 0.02) * (bloody ? 1 : 0.4)); }
    }
    // fresh bleeding leaves drops (full detail only)
    if (level === 2) { G.dripT = (G.dripT || 0) - dt; if (G.dripT <= 0) { G.dripT = 0.6; for (const n of w.active) if (!n.dead && n.wounds && n.wounds.some(k => k.bleed > 0.05) && G.visible.has(n.agent.roomId)) bloodAt('d:' + n.id + ':' + Math.round(w.realTime * 2), n.agent.pos.x + (Math.random() - 0.5) * 0.3, n.agent.pos.y, n.agent.pos.z + (Math.random() - 0.5) * 0.3, 0.06 + Math.random() * 0.06); } }
  }
  function bodyRig(w, b) {
    const R = G.bodyRigs || (G.bodyRigs = {}); let r = R[b.id];
    if (!r) { const look = b.look || 'Guard'; r = R[b.id] = (S.Humans && S.Humans.create({ id: b.id, role: look, female: b.female })) || new S.Render.Humanoid({ id: b.id, role: look, female: b.female, colorVariant: 0 }, G.fv.m); scene.add(r.root); }
    r.root.position.set(b.pos.x, b.pos.y, b.pos.z); r.root.rotation.y = (b.yaw || 0) * D2R; r.root.visible = G.visible.has(b.roomId);
    if (r.mixer) r.animate(0.05, 0, 'Dead', 0, 0, { deathPose: b.pose, since: (w.now - b.t) / w.clock.minPerSec, carried: !!b.carriedBy }); else r.animate(0.05, 0, 'Down', 0, 0);
  }
  function npcView(n) {
    let v = G.npcViews[n.id]; if (v) return v;
    const rig = makeRig(n); scene.add(rig.root);
    v = G.npcViews[n.id] = { npc: n, rig, root: rig.root, prev: S.V.copy(n.agent.pos), cur: S.V.copy(n.agent.pos), py: n.agent.yaw, cy: n.agent.yaw, last: S.V.copy(n.agent.pos), sp: 0, step: 0 };
    return v;
  }
  function syncCards() {
    const w = G.world, fv = G.fv;
    for (const id in w.cards) {
      const c = w.cards[id], show = !c.holder && c.room, has = !!G.cardMeshes[id];
      if (show && !has) {
        const room = w.fac.room(c.room), proxy = new T.Mesh(new T.BoxGeometry(0.4, 0.2, 0.4), new T.MeshBasicMaterial({ visible: false }));
        proxy.position.set(c.pos.x, (room ? room.floorY : 0) + 0.1, c.pos.z); proxy.userData.interact = { kind: 'card', id };
        const card = new T.Mesh(new T.BoxGeometry(0.086, 0.006, 0.054), fv.m.colored([0xf2730f, 0xbfbfbf, 0x408cf2, 0x4dcc66, 0xe6bf33, 0xd93340][c.level] || 0xbfbfbf));
        card.position.y = -0.095; card.rotation.y = (id.length * 1.7) % 3; proxy.add(card); scene.add(proxy); G.cardMeshes[id] = proxy;
      } else if (!show && has) { scene.remove(G.cardMeshes[id]); delete G.cardMeshes[id]; }
    }
  }

  // ------------------------------------------------------------------ visibility (portal BFS without lifts and stairs), lights with day and night
  function computeVisible() {
    const w = G.world, vis = new Set(), camPos = camera.position;
    const expand = (start, preload) => {
      if (!start) return; vis.add(start); let frontier = [start];
      for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const next = [];
        for (const rid of frontier) {
          const r = w.fac.room(rid); if (!r) continue;
          for (const v of r.visibleRooms) if (!vis.has(v)) { vis.add(v); next.push(v); }
          for (const did of r.doorIds) {
            const d = w.fac.door(did); if (d.isTransit) continue; const o = d.other(rid), see = d.kind === 'Archway' || d.openness > 0.02;
            if (see) { if (!vis.has(o)) { vis.add(o); next.push(o); } }
            else if (preload && depth === 0) { const dx = d.pos.x - camPos.x, dz = d.pos.z - camPos.z; if (dx * dx + dz * dz < 25) vis.add(o); }
          }
        }
        frontier = next;
      }
    };
    expand(w.player.roomId, true); if (G.cctv && G.extraRoom) expand(G.extraRoom, false);
    const pr = w.fac.room(w.player.roomId); if (pr) for (const did of pr.doorIds) { const d = w.fac.door(did); if (!d.isTransit) G.fv.ensure(d.other(pr.id)); }
    G.visible = vis;
    for (const id in G.fv.rooms) { const rv = G.fv.rooms[id], on = vis.has(id); if (on && !rv.built) G.fv.ensure(id); if (rv.group && rv.group.visible !== on) rv.group.visible = on; }
    for (const id in G.fv.doors) { const dv = G.fv.doors[id], on = vis.has(dv.door.roomA) || vis.has(dv.door.roomB); if (dv.group.visible !== on) dv.group.visible = on; }
    for (const wv of G.fv.windows) { const on = vis.has(wv.rooms[0]) || vis.has(wv.rooms[1]); wv.glass.visible = on; wv.frame.visible = on; }
  }
  const NIGHT_DIM = { Office: 0.3, Laboratory: 0.45, Meeting: 0.2, Canteen: 0.5, Kitchen: 0.3, Workshop: 0.35, Storage: 0.4, Corridor: 0.72, Tunnel: 0.6, Archive: 0.3 };
  function assignLights(viewPos) {
    const w = G.world, q = QUALITY[settings.quality], cand = [], now = w.now, t = performance.now() / 1000, night = w.clock.night;
    for (const id of G.visible) {
      const rv = G.fv.rooms[id]; if (!rv || !rv.built) continue; const r = rv.room;
      const flick = r.isFlickering(now), on = r.lightsOn && r.powered !== false && (!flick || (settings.noflash ? Math.sin(t * 3) > -0.5 : Math.sin(t * 37 + id.length) * Math.sin(t * 13.3) > -0.1));
      if (rv.fixtures) rv.fixtures.material = on ? G.fv.m.light : G.fv.m.lightOff;
      let k = 1; if (night && NIGHT_DIM[r.type] && w.countIn(id) === 0) k = NIGHT_DIM[r.type]; else if (night && (r.type === 'Corridor' || r.type === 'Tunnel')) k = 0.8;
      if (!on) { if (r.powered === false && (r.type === 'Corridor' || r.type === 'Tunnel')) for (const l of rv.lights.slice(0, 1)) cand.push({ x: l.x, y: l.y, z: l.z, color: 0xff2a1a, intensity: 0.35, range: 9 }); continue; }
      for (const l of rv.lights) cand.push(k === 1 ? l : { x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity * k, range: l.range });
    }
    for (const v of G.anomViews) if (v.a.model === 'light' && v.root.visible) cand.push({ x: v.root.position.x, y: v.root.position.y, z: v.root.position.z, color: v.a.lookAt ? 0x5aa0ff : 0xbfe3ff, intensity: 1.4, range: 6, pri: true });
    const dist = c => (c.x - viewPos.x) ** 2 + (c.z - viewPos.z) ** 2 + (c.y - viewPos.y) ** 2 * 4;
    cand.sort((a, b) => (b.pri ? 1 : 0) - (a.pri ? 1 : 0) || dist(a) - dist(b));
    for (let i = 0; i < pool.length; i++) { const l = pool[i], c = i < q.lights ? cand[i] : null; if (c) { l.position.set(c.x, c.y, c.z); l.color.setHex(c.color); l.intensity = c.intensity; l.distance = c.range; } else l.intensity = 0; }
    const alarm = w.alert.level >= 2, pulse = Math.abs(Math.sin(t * (w.alert.level >= 3 ? 4 : 2)));
    ambient.color.setRGB((night ? 0.12 : 0.165) + (alarm ? pulse * 0.22 * (settings.noflash ? 0.4 : 1) : 0), night ? 0.13 : 0.176, night ? 0.16 : 0.2);
    for (const b of G.fv.beacons) b.material = alarm && pulse > 0.5 ? G.fv.m.alarmOn : G.fv.m.alarm;
  }

  // ------------------------------------------------------------------ the player's hallucinations (layer HALLU: invisible to CCTV, not part of the world)
  function updateHallucinations() {
    const w = G.world, fx = w.horror.fx, want = [];
    for (const f of fx.figures) {
      if (f.kind === 'seated') { for (const id of G.visible) { const r = w.fac.room(id); if (!r) continue; const seat = r.pois.find(p => p.type === 'Seat' && !p.reservedBy && S.V.distXZ(p.pos, w.player.pos) > 3.5 && S.V.distXZ(p.pos, w.player.pos) < 14); if (seat) { want.push({ key: f.seed + seat.id, pos: seat.pos, yaw: seat.yaw, posture: 'Sitting' }); break; } } }
      if (f.kind === 'reflection') { const win = G.fv.windows.find(x => x.rooms[0] === w.player.roomId); if (win) want.push({ key: f.seed, pos: { x: S.clamp(w.player.pos.x, win.win.min + 0.3, win.win.max - 0.3), y: w.fac.room(w.player.roomId).floorY, z: win.z + (w.fac.room(win.rooms[1]).center.z > win.z ? 0.9 : -0.9) }, yaw: w.player.yaw + 180, posture: 'Standing', self: true }); }
    }
    for (const h of G.hallu) h.keep = false;
    for (const wnt of want) {
      let h = G.hallu.find(x => x.key === wnt.key);
      if (!h) { const rig = makeRig({ id: wnt.key, role: wnt.self ? S.Professions.get(w.player.prof).look : 'Silhouette', female: w.player.female, colorVariant: 1 }); S.Render.setLayer(rig.root, S.Render.HALLU); scene.add(rig.root); h = { key: wnt.key, rig, root: rig.root }; G.hallu.push(h); }
      h.keep = true; h.root.position.set(wnt.pos.x, wnt.pos.y, wnt.pos.z); h.root.rotation.y = wnt.yaw * D2R; h.rig.animate(0.05, 0, wnt.posture, 0, performance.now() / 1000);
      h.root.visible = S.V.distXZ(wnt.pos, w.player.pos) > 2.2 || wnt.self;
    }
    for (const h of G.hallu) if (!h.keep) scene.remove(h.root);
    G.hallu = G.hallu.filter(x => x.keep);
    const d = fx.doors[0], pr = w.fac.room(w.player.roomId); if (d && pr && /Corridor|Tunnel/.test(pr.type)) G.fv.fakeDoors(w.player.roomId, d.seed); else G.fv.clearFakeDoors();
  }

  // ------------------------------------------------------------------ main loop
  let lastT = performance.now(), saveT = 120, lastBarkSnd = 0;
  function frame(nowT) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (nowT - lastT) / 1000); lastT = nowT;
    readInput(); if (G.playing) Perf.tick(dt);
    if (!G.playing || !G.world) { renderer.setScissorTest(false); Menu3D.frame(dt); A.tick(null, dt); return; }
    const w = G.world;
    if (Input.pause) { if (!$('chat').hidden) Chat.close(); else if (!$('terminal').hidden) Terminal.close(); else if (!$('pda').hidden) PDA.close(); else if (!$('dialogue').hidden) UI.closeDialogue(); else if (!$('settings').hidden) $('settings').hidden = true; else if (!$('pause').hidden) $('pause').hidden = true; else if (!w.player.dead) openPause(); }
    if (Input.pda && $('terminal').hidden) { if ($('pda').hidden) PDA.open(); else PDA.close(); }
    if (Input.hud) G.hudHidden = !G.hudHidden;
    const paused = UI.paused(), gameplay = !UI.modal();
    updatePlayer(dt, gameplay); Ride.tick(dt); Sleep.tick();
    if (!paused) {
      G.acc += dt * G.timeScale; let steps = 0; const maxSteps = G.timeScale > 4 ? 400 : 60;
      while (G.acc >= S.World.FIXED && steps++ < maxSteps) {
        w.tick(S.World.FIXED); G.acc -= S.World.FIXED;
        for (const id in G.npcViews) { const v = G.npcViews[id]; v.prev = v.cur; v.py = v.cy; v.cur = S.V.copy(v.npc.agent.pos); v.cy = v.npc.agent.yaw; if (S.V.distXZ(v.prev, v.cur) > 3) v.prev = v.cur; }
        for (const v of G.anomViews) { v.prev = v.cur; v.py = v.cy; v.cur = S.V.copy(v.a.agent.pos); v.cy = v.a.agent.yaw; if (S.V.distXZ(v.prev, v.cur) > 3) v.prev = v.cur; }
      }
      if (steps >= maxSteps) G.acc = 0;
    }
    const alpha = Math.min(1, G.acc / S.World.FIXED), t = nowT / 1000;
    computeVisible();
    const camPos = camera.position, maxRigs = QUALITY[settings.quality].npcs; let rigs = 0;
    for (const id in G.npcViews) G.npcViews[id].root.visible = false;
    for (const n of w.active) {
      if (!G.visible.has(n.agent.roomId) || n.agent.transitT > 0) continue;
      const dist = Math.hypot(n.agent.pos.x - camPos.x, n.agent.pos.z - camPos.z); if (dist > 40 || Math.abs(n.agent.pos.y - w.player.pos.y) > 3 || rigs >= maxRigs) continue;
      rigs++; let v = npcView(n);
      if (S.Humans && S.Humans.ready && !v.rig.mixer) { scene.remove(v.root); delete G.npcViews[n.id]; v = npcView(n); }
      const x = v.prev.x + (v.cur.x - v.prev.x) * alpha, z = v.prev.z + (v.cur.z - v.prev.z) * alpha, yaw = v.py + S.deltaAngle(v.py, v.cy) * alpha;
      v.root.position.set(x, n.agent.pos.y, z); v.root.rotation.y = yaw * D2R; v.root.visible = true;
      const moved = Math.hypot(x - v.last.x, z - v.last.z); v.last = { x, y: 0, z }; v.sp += (Math.min(3, dt > 0 ? moved / dt : 0) - v.sp) * Math.min(1, dt * 10);
      const posture = n.dead ? 'Dead' : n.carriedBy ? 'Lying' : n.agent.moving ? 'Standing' : n.posture; let look = 0, target = null;
      if (n.carriedBy) stretcherAt(n.id, x, n.agent.pos.y, z, yaw);
      if (n.conv) { const o = w.npc(n.conv); if (o) target = o.agent.pos; } else if (dist < 3.5 && !G.cctv && ['Lying', 'Down', 'Counting'].indexOf(posture) < 0) target = w.player.pos;
      if (target) look = S.deltaAngle(yaw, Math.atan2(target.x - x, target.z - z) / D2R);
      if (v.rig.mixer) {
        const poi = n.reservedPoi && w.fac.poi(n.reservedPoi), atPoi = poi && Math.hypot(poi.pos.x - n.agent.pos.x, poi.pos.z - n.agent.pos.z) < 1.0;
        v.rig.gait = v.gait || 0; v.rig.lod = dist < 8 ? 0 : dist < 18 ? 1 : 2;
        const fear = n.psy ? n.psy.fear : 0; if (v.lastFear != null && fear - v.lastFear > 12 && dist < 25) v.rig.react(fear > 70 ? 'flinch' : 'surprise'); v.lastFear = fear;
        if (n.agent.waitingDoor && n.agent.waitingDoor !== v.lastDoor) v.rig.react('door'); v.lastDoor = n.agent.waitingDoor;
        const tgtY = target ? (target === w.player.pos ? target.y + 1.6 : target.y + 1.55) : 0, lp = target ? -Math.atan2(tgtY - (n.agent.pos.y + 1.55), Math.max(0.5, Math.hypot(target.x - x, target.z - z))) / D2R : 0;
        v.rig.animate(dt, v.sp, posture, look, t, { deathPose: n.deathPose, since: n.dead ? (w.now - n.deathAt) / w.clock.minPerSec : 0, carried: !!n.carriedBy, bedH: n.carriedBy ? 0.75 : undefined, talking: !!n.conv, typing: atPoi && /Desk|Console|Terminal/.test(poi.type) && posture === 'Sitting', repair: n.activity === 'Maintenance' || n.activity === 'RepairDoor' || (atPoi && poi.type === 'Panel'),
          torch: w.clock.night && (n.role === 'Guard') && n.activity === 'Patrol', alert: w.alert && w.alert.level >= 2, stress: S.clamp((fear - 30) / 70, 0, 1), tired: n.psy && n.psy.fatigue > 75, lookPitch: lp, seatH: 0.47 });
      } else v.rig.animate(dt, v.sp, posture, look, t);
      v.drawPos = { x, y: n.agent.pos.y, z };
    }
    gore(w, dt);
    npcSounds(dt, t);
    for (const v of G.anomViews) {
      const a = v.a, x = v.prev.x + (v.cur.x - v.prev.x) * alpha, z = v.prev.z + (v.cur.z - v.prev.z) * alpha, yaw = v.py + S.deltaAngle(v.py, v.cy) * alpha;
      if (v instanceof S.Render.TallymanView) { const fy = (w.fac.room(a.agent.roomId) || { floorY: 0 }).floorY; v.root.position.set(x, fy, z); v.root.rotation.y = yaw * D2R; const moved = Math.hypot(x - v.last.x, z - v.last.z); v.last = { x, y: 0, z }; v.root.visible = G.visible.has(a.agent.roomId); if (v.root.visible || !a.contained) v.animate(dt, dt > 0 ? Math.min(3, moved / dt) : 0, w, yaw, t, (name, pos) => A.play(name, pos, name === 'knock' ? 0.9 : 0.5, { occ: occlusionOf(a.agent.roomId) })); }
      else if (v.fixed) {
        // living anomalies (creatures.js): own rigs, sounds and loops; updated only when their cell or observation room is near
        const vis = G.visible.has(a.containRoom), near = vis || S.V.distXZ(a.agent.pos, w.player.pos) < 22 && Math.abs(a.agent.pos.y - w.player.pos.y) < 3;
        v.root.visible = v.fixed.visible = vis;
        if (near) { const occ = occlusionOf(a.containRoom); v.update(dt, w, t, { occ, cctv: G.cctv, play: (n, pos, vol, o) => A.play(n, pos, vol, Object.assign({ occ }, o || {})), footstep: (pos, o) => A.footstep(pos, o), emitter: (k, id, pos, vol, o) => A.emitter(k, id, pos, vol, o) });
          if (v.loop) A.emitter('crea.' + a.id, v.loop.id, { x: v.pos.x, y: v.pos.y + 0.5, z: v.pos.z }, v.loop.vol, { occ, range: 16 }); }
      }
      else { v.update(dt, w, t, (name, pos) => A.play(name, pos, 0.6, { occ: occlusionOf(a.containRoom) })); if (v.root.visible) v.root.visible = G.visible.has(a.agent.roomId || a.containRoom); }
    }
    for (const c of G.cams) { c.group.visible = G.visible.has(c.cam.roomId); c.pivot.rotation.y = c.cam.yaw * D2R; c.pivot.rotation.x = c.cam.pitch * D2R; c.led.visible = c.cam.operational && (t % 1.6) < 0.8; }
    G.fv.updateDoors(w.realTime, w.now, doorSound);
    syncCards(); updateHallucinations(); playWorldSounds(); processNotifications(); updateHud(dt, gameplay); Terminal.tick(dt); PDA.tick(dt);
    // what the player actually looks at (living anomalies know it) and which cell is on the CCTV screen
    { const pp = w.player; pp.speed = P.speed || 0; pp.gazeAt = null;
      if (G.cctv) { const cam = w.cams[G.camIndex]; if (cam) w.camWatch[cam.roomId] = w.realTime; }
      else { const fwd = new T.Vector3(); camera.getWorldDirection(fwd); let best = 0.965;
        for (const v of G.anomViews) { if (!v.fixed || !v.root.visible) continue; const tp = v.pos || v.a.agent.pos, dx = tp.x - camera.position.x, dy = (tp.y + 1.2) - camera.position.y, dz = tp.z - camera.position.z, d = Math.hypot(dx, dy, dz); if (d > 16 || d < 0.3) continue; const c = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (c > best) { best = c; pp.gazeAt = v.a.id; pp.gazeT = w.realTime; } } } }
    Dust.tick(dt, w);
    { const fx = w.horror.fx, st = fx.state, pp = w.player;
      A.tick(w, dt, { heartbeat: fx.heartbeat, intensity: settings.fx, occOf: occlusionOf, female: !!pp.female,
        dread: settings.fx * (st === 'threat' ? 0.9 : st === 'paranoia' ? 0.55 : st === 'tension' ? 0.25 : 0) * (pp.roomId === 'nullfloor' ? 0 : 1),
        fear: S.clamp((pp.psy.fear - 40) / 60, 0, 1) * settings.fx, exertion: 1 - P.stamina }); }
    UI.syncTouch();
    renderer.setScissorTest(false); renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.clear();
    if (G.cctv) {
      const cam = G.cams[G.camIndex], lw = cam.lens.getWorldPosition(new T.Vector3()), fw = new T.Vector3(0, 0, 1).applyQuaternion(cam.pivot.getWorldQuaternion(new T.Quaternion()));
      cctvCam.position.copy(lw); cctvCam.lookAt(lw.clone().add(fw));
      const r = $('feedArea').getBoundingClientRect(), H = window.innerHeight;
      cctvCam.aspect = r.width / Math.max(1, r.height); cctvCam.updateProjectionMatrix(); assignLights(lw);
      renderer.setScissorTest(true); renderer.setScissor(r.left, H - r.bottom, r.width, r.height); renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      if (cam.cam.operational && w.infra.isPowered(cam.cam.roomId)) renderer.render(scene, cctvCam); renderer.setScissorTest(false);
    } else { assignLights(camPos); renderer.render(scene, camera); }
    if (w.player.dead && $('death').hidden) showDeath(w);
    saveT -= dt; if (saveT <= 0) { saveT = 120; saveGame(false); }
  }

  // ------------------------------------------------------------------ profession selection and character creation
  const Roles = {
    sel: null,
    open(mode) {
      G.mode = mode || G.mode; for (const b of $('modeSeg').children) b.classList.toggle('on', b.dataset.mode === G.mode);
      if (this.sel && G.mode === 'career' && !S.Professions.get(this.sel).entry) this.sel = null;
      const box = $('roleList'); box.innerHTML = '';
      for (const dk in S.Professions.DEPTS) {
        const list = S.Professions.LIST.filter(p => p.dept === dk); if (!list.length) continue;
        const d = document.createElement('div'); d.className = 'dept'; d.innerHTML = '<h2>' + esc(S.Professions.DEPTS[dk].name.toUpperCase()) + '</h2>'; const g = document.createElement('div'); g.className = 'grid';
        for (const p of list) { const b = document.createElement('button'); b.className = 'pc' + (this.sel === p.id ? ' on' : ''); b.disabled = G.mode === 'career' && !p.entry; b.dataset.prof = p.id; b.innerHTML = '<b>' + esc(p.name) + '</b><span>L' + p.level + ' · ' + esc(p.desc.split('.')[0]) + '</span>'; b.addEventListener('click', () => { this.sel = p.id; this.open(); }); g.appendChild(b); }
        d.appendChild(g); box.appendChild(d);
      }
      this.info(); $('roles').hidden = false; $('menu').hidden = true;
    },
    info() {
      const p = this.sel ? S.Professions.get(this.sel) : null; $('rNext').disabled = !p;
      if (!p) { $('roleInfo').innerHTML = '<h3>Выберите должность</h3><div class="k">' + (G.mode === 'career' ? 'Режим карьеры: начинать можно с должностей начального уровня. Остальные открываются повышением и переводом — по решению руководства, а не за очки опыта.' : 'Свободный режим: доступна любая из 33 должностей.') + '</div>'; return; }
      const fac = Menu3D.fv ? Menu3D.fv.w.fac : null, work = p.work.map(r => { const room = fac && fac.room(r); return room ? room.name : r; }).join(', ');
      const shift = p.shifts.indexOf('night') >= 0 ? 'дневные и ночные смены' : p.dept === 'science' || p.dept === 'admin' ? 'офисный день 08:30–17:30' : 'дневная смена 07:00–19:00';
      const att = { dclass: 'Охрана держит дистанцию, заключённые — свои.', security: 'Заключённые класса D относятся настороженно, учёные иногда спорят о доступе.', science: 'Охрана ворчит о допусках; администрация ждёт отчётов.', admin: 'Подчинённые ждут решений; ошибки руководства запоминают надолго.', engineering: 'Без вас комплекс встанет — это ценят, но заявок всегда больше, чем рук.', medical: 'Вам доверяют, особенно после странных происшествий.', mtf: 'Уважают и побаиваются.', service: 'Вас мало замечают — и много о вас не знают.' }[p.dept];
      $('roleInfo').innerHTML = '<h3>' + esc(p.name) + '</h3><div>' + esc(p.desc) + '</div><p><span class="k">Отдел:</span> ' + esc(S.Professions.DEPTS[p.dept].name) + '<br><span class="k">Допуск:</span> L' + p.level + (p.perms ? ' · ' + esc(S.permList(p.perms)) : '') + '<br><span class="k">Рабочие помещения:</span> ' + esc(work) + '<br><span class="k">График:</span> ' + shift + '</p><span class="k">Обязанности:</span><ul>' + p.duties.map(d => '<li>' + esc(S.Professions.TASK_NAMES[d] || d) + '</li>').join('') + '</ul><span class="k">Карьера:</span> ' + esc((p.next.map(id => S.Professions.get(id).name).join(', ') || 'высшая ступень отдела') + (p.lateral.length ? '; перевод: ' + p.lateral.map(id => S.Professions.get(id).name).join(', ') : '')) + '<br><span class="k">Отношение окружающих:</span> ' + esc(att);
    }
  };
  $('modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) Roles.open(b.dataset.mode); });
  $('rBack').addEventListener('click', () => { $('roles').hidden = true; showMenu(); });
  $('rNext').addEventListener('click', () => { if (!Roles.sel) return; $('roles').hidden = true; Create.open(); });
  const Create = {
    sex: 'm',
    open() { const p = S.Professions.get(Roles.sel); $('cRole').textContent = p.name.toUpperCase() + ' · ' + (G.mode === 'career' ? 'КАРЬЕРА' : 'СВОБОДНЫЙ РЕЖИМ'); if (!$('cFirst').value) this.random(); this.info(); $('create').hidden = false; },
    random() { const r = Math.random, f = this.sex === 'f', L = S.People, names = L[f ? 'FEMALE' : 'MALE']; $('cFirst').value = names[Math.floor(r() * names.length)]; const s = L.SURN[Math.floor(r() * L.SURN.length)]; $('cLast').value = f ? L.fem(s) : s; for (const id of ['cBrav', 'cAtt', 'cSoc']) $(id).value = 30 + Math.floor(r() * 50); this.info(); },
    info() {
      const v = id => +$(id).value / 100, b = v('cBrav'), a = v('cAtt'), s = v('cSoc'); $('cBravV').textContent = Math.round(b * 100); $('cAttV').textContent = Math.round(a * 100); $('cSocV').textContent = Math.round(s * 100);
      const p = S.Professions.get(Roles.sel); if (!p) return; const title = p.id === 'dclass' ? 'D-XXXX' : S.People.TITLES[p.id];
      $('cInfo').innerHTML = '<h3>' + esc(title + ' ' + ($('cFirst').value || '?') + ' ' + ($('cLast').value || '?')) + '</h3><div class="k">' + esc(S.People.character({ bravery: b, sociability: s, diligence: a, temper: 0.4, curiosity: 0.5 }, { science: p.dept === 'science' ? 0.8 : 0.4, safety: p.dept === 'security' ? 0.8 : 0.4, ethics: 0.5, order: 0.5 })) + '</div><p>Устойчивость влияет на то, как сильно на вас действуют страх и когнитивные аномалии. Внимательность — на скорость работы и концентрацию. Общительность — на отношения с коллегами.</p><p class="k">Стартовые условия: ' + esc(p.desc) + '</p>';
    },
    start() {
      const p = S.Professions.get(Roles.sel); $('create').hidden = true;
      const opts = { prof: p.id, first: $('cFirst').value.trim() || 'Алексей', last: $('cLast').value.trim() || 'Волков', female: this.sex === 'f', mode: G.mode, hardcore: settings.deathMode === 2, traits: { bravery: +$('cBrav').value / 100, diligence: +$('cAtt').value / 100, sociability: +$('cSoc').value / 100 } };
      A.start(); begin(S.Content.createWorld((Date.now() >>> 0) ^ 0x5bd1e995, opts));
      UI.msg('Смена началась. Должность: ' + p.name + '. Текущая задача — справа вверху, подробности — в КПК.', '#f2d873');
      saveGame(false);
    }
  };
  $('cSex').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Create.sex = b.dataset.sex; for (const x of $('cSex').children) x.classList.toggle('on', x === b); Create.random(); });
  for (const id of ['cFirst', 'cLast', 'cBrav', 'cAtt', 'cSoc']) $(id).addEventListener('input', () => Create.info());
  for (const id of ['cFirst', 'cLast']) { $(id).addEventListener('pointerdown', e => e.stopPropagation()); $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }); }
  $('cBack').addEventListener('click', () => { $('create').hidden = true; Roles.open(); });
  $('cRand').addEventListener('click', () => Create.random());
  $('cStart').addEventListener('click', () => Create.start());

  // ------------------------------------------------------------------ flow, saves
  function hasSave() { return !!(store.get(SAVE_KEY) || store.get(BAK_KEY)); }
  function saveGame(notify) {
    const w = G.world; if (!w || w.player.dead) return;
    const json = w.save(), prev = store.get(SAVE_KEY);
    if (prev) store.set(BAK_KEY, prev);
    let ok = store.set(SAVE_KEY, json); if (!ok) { store.del(BAK_KEY); ok = store.set(SAVE_KEY, json); }
    if (notify) UI.msg(ok ? 'Игра сохранена (' + S.fmtStamp(w.now) + ', ' + Math.round(json.length / 1024) + ' КБ)' : 'Сохранение недоступно в этом окне браузера', ok ? '#8dff9e' : '#ff6a5c');
  }
  function begin(world) {
    G.world = world; G.acc = 0; G.timeScale = 1; G.camIndex = 0; buildViews(); expose();
    for (const id of ['menu', 'pause', 'settings', 'dialogue', 'death', 'terminal', 'pda', 'roles', 'create', 'dossier', 'sleep']) $(id).hidden = true;
    G.cctv = false; G.playing = true; G.hudHidden = false; $('hud').hidden = false; UI.syncTouch(); $('pSpeed').textContent = 'СКОРОСТЬ ВРЕМЕНИ: ×1';
    world.horror.settings.intensity = Math.max(0.3, settings.fx);
  }
  function expose() { window.__scp = G; G.P = P; G.scene = scene; G.camera = camera; G.Terminal = Terminal; G.PDA = PDA; G.interact = interact; G.Roles = Roles; G.Create = Create; window.scpSave = () => { if (G.playing) saveGame(false); }; }
  function loadGame() {
    A.start();
    for (const k of [SAVE_KEY, BAK_KEY]) { const s = store.get(k); if (!s) continue; try { begin(S.World.load(s)); UI.msg('Сохранение загружено: ' + S.fmtStamp(G.world.now), '#fff'); return true; } catch (e) { console.warn('save unreadable', e); } }
    UI.msg('Сохранение не найдено', '#ff6a5c'); return false;
  }
  function toMenu() { if (G.world && !G.world.player.dead) saveGame(false); G.playing = false; $('hud').hidden = true; for (const id of ['pause', 'settings', 'dialogue', 'death', 'terminal', 'pda', 'sleep']) $(id).hidden = true; Terminal.close(); showMenu(); UI.syncTouch(); }
  function showMenu() { $('menu').hidden = false; $('mContinue').disabled = !hasSave(); }
  function openPause() { $('pause').hidden = false; try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ } }
  $('mNew').addEventListener('click', () => { A.start(); Roles.sel = null; Roles.open('career'); });
  $('mRoles').addEventListener('click', () => { A.start(); Roles.open('free'); });
  $('mContinue').addEventListener('click', loadGame);
  $('mDossier').addEventListener('click', () => { $('dosText').innerHTML = dossierHtml(null, false); $('dossier').hidden = false; $('menu').hidden = true; });
  $('dosBack').addEventListener('click', () => { $('dossier').hidden = true; showMenu(); });
  // AI settings: provider, own server address and access token (no API keys in the app), connection test with a real round trip
  const AISet = {
    refresh() {
      const L = S.LLM; if (!L) { $('aiStatus').textContent = 'Модуль ИИ не загружен.'; return; } const st = L.status(), u = st.usage;
      $('aiStatus').textContent = (st.online ? 'На связи: ' + st.provider : 'Локальный ИИ: ' + st.reason) + ' · сегодня запросов ' + (u.requests || 0) + ', ~' + Math.round((u.tokens || 0) / 1000) + ' тыс. токенов из ' + Math.round(L.cfg.dailyTokens / 1000) + ' тыс., из кэша ' + (u.cached || 0) + (L.lastError ? ' · последняя ошибка: ' + L.lastError : '');
      $('aiToggle').textContent = L.cfg.enabled ? 'МОДЕЛЬ: ВКЛ' : 'МОДЕЛЬ: ВЫКЛ'; $('aiProv').textContent = 'ИСТОЧНИК: ' + ({ auto: 'АВТО', artifact: 'CLAUDE (CLAUDE.AI)', proxy: 'СЕРВЕР ИИ' }[L.cfg.provider] || L.cfg.provider);
      if (document.activeElement !== $('aiUrl')) $('aiUrl').value = L.cfg.proxyUrl || ''; if (document.activeElement !== $('aiTok')) $('aiTok').value = L.cfg.proxyToken || '';
    }
  };
  if (S.LLM) {
    S.LLM.init();
    $('aiToggle').addEventListener('click', () => { S.LLM.cfg.enabled = !S.LLM.cfg.enabled; S.LLM.saveCfg(); AISet.refresh(); });
    $('aiProv').addEventListener('click', () => { const o = ['auto', 'artifact', 'proxy']; S.LLM.cfg.provider = o[(o.indexOf(S.LLM.cfg.provider) + 1) % 3]; S.LLM.saveCfg(); AISet.refresh(); });
    $('aiUrl').addEventListener('change', () => { S.LLM.cfg.proxyUrl = $('aiUrl').value.trim(); S.LLM.saveCfg(); AISet.refresh(); });
    $('aiTok').addEventListener('change', () => { S.LLM.cfg.proxyToken = $('aiTok').value.trim(); S.LLM.saveCfg(); AISet.refresh(); });
    for (const id of ['aiUrl', 'aiTok']) $(id).addEventListener('keydown', e => e.stopPropagation());
    $('aiTest').addEventListener('click', () => { $('aiStatus').textContent = 'Проверка связи…'; S.LLM.Providers.artifact.probe().then(() => S.LLM.test()).then(r => { AISet.refresh(); $('aiStatus').textContent = (r.ok ? 'Связь есть: модель ответила «' + (r.json.answer || 'ok') + '» (' + (r.provider === 'artifact' ? 'Claude' : r.provider) + '). ' : 'Нет ответа модели: ' + (r.error || r.reason) + '. ') + $('aiStatus').textContent; }); });
    setInterval(() => { if (!$('settings').hidden) AISet.refresh(); }, 2000);
  }
  $('mSettings').addEventListener('click', () => { UI.refreshSettings(); AISet.refresh(); $('settings').hidden = false; });
  // credits: every third-party resource with its author and licence (CC BY 4.0 for the Oculus Audio Pack requires it)
  $('mCredits').addEventListener('click', () => {
    const base = (window.SCP_ASSET_BASE || 'assets/'), get = f => fetch(base + f).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([get('audio/sounds.json'), get('models/models.json'), get('textures/textures.json')]).then(([snd, mdl, tex]) => {
      const L = ['Звуки:'];
      if (snd) for (const k in snd.sources) { const s = snd.sources[k]; L.push('• «' + s.name + '» — ' + s.author + ', ' + s.license + (s.credit ? '. ' + s.credit : ' (' + s.url + ')')); }
      L.push('3D-модель и анимации людей:'); if (mdl) for (const k in mdl.models) { const m = mdl.models[k]; L.push('• ' + m.author + ', ' + m.license + ' (' + m.url + ')'); }
      L.push('Текстуры:'); if (tex) { const t = Object.values(tex.textures)[0]; L.push('• ambientCG.com — ' + Object.keys(tex.textures).join(', ') + ' — ' + (t ? t.license : 'CC0')); }
      L.push('Движок: three.js r128, GLTFLoader, SkeletonUtils — MIT License, © three.js authors.');
      L.push('Полный реестр с исходными файлами и местом использования — Docs/ASSETS.md в репозитории.');
      UI.dialogue('Авторы и лицензии', L);
    });
  });
  $('mHelp').addEventListener('click', () => UI.dialogue('Как играть', [
    'Телефон: левая половина экрана — движение, правая — обзор. ИСПОЛЬЗ. — действие (удерживайте для работы: ремонт, осмотр, отметка). КПК — задачи, журнал, карьера, самочувствие, рация, досье. HUD — скрыть интерфейс.',
    'Компьютер: WASD, мышь (клик по экрану), E — действие (удерживать), Shift — бег, F — фонарь, Q — карта, C — протокол счёта, Tab — КПК, H — скрыть интерфейс, Esc — меню.',
    'Комплекс живёт сам: SCP LIFE распределяет смены, ремонты, исследования и тревоги. Вы получаете задачи своей профессии. Терминалы на постах, в командном центре и у рабочих мест открывают инструменты вашей должности.',
    'Не всё, что вы видите и слышите, существует. Камеры записывают только реальный мир. Сомневаетесь — спросите коллегу, проверьте камеры и журналы, пройдите медосмотр.'
  ]));
  $('pResume').addEventListener('click', () => { $('pause').hidden = true; });
  $('pSave').addEventListener('click', () => saveGame(true));
  $('pLoad').addEventListener('click', loadGame);
  $('pSettings').addEventListener('click', () => { UI.refreshSettings(); AISet.refresh(); $('settings').hidden = false; });
  $('pSpeed').addEventListener('click', () => { G.timeScale = G.timeScale === 1 ? 2 : G.timeScale === 2 ? 4 : 1; $('pSpeed').textContent = 'СКОРОСТЬ ВРЕМЕНИ: ×' + G.timeScale; });
  $('pFull').addEventListener('click', () => { const el = document.documentElement, fn = el.requestFullscreen || el.webkitRequestFullscreen; try { const r = fn ? fn.call(el) : null; if (!fn) UI.msg('Полный экран недоступен в этом окне.', '#ff9a59'); else if (r && r.catch) r.catch(() => UI.msg('Полный экран недоступен в этом окне. Откройте страницу в отдельной вкладке браузера.', '#ff9a59')); } catch (e) { UI.msg('Полный экран недоступен в этом окне.', '#ff9a59'); } $('pause').hidden = true; });
  $('pMenu').addEventListener('click', toMenu);
  $('sBack').addEventListener('click', () => { $('settings').hidden = true; saveSettings(); });
  for (const b of document.querySelectorAll('#settings button[data-s]')) b.addEventListener('click', () => {
    const k = b.dataset.s, d = +b.dataset.d, r1 = v => Math.round(v * 10) / 10;
    if (k === 'sens') settings.sens = r1(S.clamp(settings.sens + d * 0.1, 0.2, 3));
    if (k === 'fov') settings.fov = S.clamp(settings.fov + d * 4, 56, 100);
    if (k === 'quality') { settings.quality = S.clamp(settings.quality + d, 0, 2); resize(); }
    if (k === 'volume') settings.volume = r1(S.clamp(settings.volume + d * 0.1, 0, 1));
    if (k === 'music') settings.music = r1(S.clamp(settings.music + d * 0.1, 0, 1));
    if (k === 'hud') settings.hud = r1(S.clamp(settings.hud + d * 0.1, 0.7, 1.5));
    if (k === 'btn') settings.btn = r1(S.clamp(settings.btn + d * 0.1, 0.7, 1.5));
    if (k === 'fx') { settings.fx = r1(S.clamp(settings.fx + d * 0.1, 0, 1)); if (G.world) G.world.horror.settings.intensity = Math.max(0.3, settings.fx); }
    for (const tg of ['invert', 'touch', 'lefty', 'noflash', 'shake', 'minhud']) if (k === tg) settings[tg] = !settings[tg];
    if (k === 'gore') settings.gore = S.clamp(settings.gore + d, 0, 2);
    if (k === 'deathMode') { if (G.world && G.world.opts && G.world.opts.hardcore && G.playing) UI.msg('Хардкор выбран при начале игры и не меняется', '#ff9a59'); else settings.deathMode = (settings.deathMode + 1) % 3; }
    applySettings(); UI.refreshSettings(); UI.syncTouch(); saveSettings();
  });
  $('sleepWake').addEventListener('click', () => Sleep.wake());
  // death: normal (load the save), continue the same world as another available person, or hardcore (the save is gone)
  function showDeath(w) {
    const ev = w.events.recent.slice().reverse().find(e => (e.type === 'Death' || e.type === 'Injury') && e.target === 'player');
    const mode = w.opts && w.opts.hardcore ? 2 : settings.deathMode, pick = $('deathPick'); pick.innerHTML = '';
    $('deathCause').textContent = ev ? ev.text : ''; $('deathMode').textContent = 'Режим: ' + DEATH_MODES[mode].toLowerCase();
    $('xLoad').hidden = mode !== 0; $('xLoad').textContent = 'ЗАГРУЗИТЬ СОХРАНЕНИЕ';
    if (mode === 2) { store.del(SAVE_KEY); store.del(BAK_KEY); $('deathMode').textContent = 'ХАРДКОР: сохранение удалено. Мир этого персонажа закончился.'; }
    if (mode === 1) {
      const p = w.player, near = w.active.filter(n => !n.dead && !n.incap(w.now) && !n.missing && n.agent.roomId && (p.prof === 'dclass' ? true : n.role !== 'DClass'))
        .sort((a, b) => w.fac.roomDistance(a.agent.roomId, p.roomId) - w.fac.roomDistance(b.agent.roomId, p.roomId)).slice(0, 8);
      $('deathMode').textContent = near.length ? 'Мир продолжается. Выберите, за кого продолжить:' : 'Свободных персонажей нет — загрузите сохранение.';
      if (!near.length) $('xLoad').hidden = false;
      for (const n of near) { const b = document.createElement('button'); b.className = 'mbtn'; b.textContent = n.displayName + ' · ' + (S.Professions.get(n.prof) || { name: '' }).name + ' · ' + w.roomName(n.agent.roomId); b.addEventListener('click', () => { if (w.takeOver(n.id)) { $('death').hidden = true; G.npcViews[n.id] && scene.remove(G.npcViews[n.id].root); delete G.npcViews[n.id]; P.yaw = w.player.yaw; UI.msg('Вы продолжаете за: ' + w.player.name, '#e8d77a'); saveGame(false); UI.syncTouch(); } }); pick.appendChild(b); }
    }
    $('death').hidden = false; UI.syncTouch();
  }
  $('xLoad').addEventListener('click', () => { if (!loadGame()) { $('death').hidden = true; G.playing = false; Roles.open(); } });
  $('xNew').addEventListener('click', () => { $('death').hidden = true; G.playing = false; Roles.open(); });
  $('xMenu').addEventListener('click', () => { $('death').hidden = true; toMenu(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.playing) saveGame(false); });
  window.addEventListener('pagehide', () => { if (G.playing) saveGame(false); });

  resize(); applySettings();
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: G.playing && G.world && !G.world.player.dead ? G.world.save() : null }));
  const boot = data => {
    showMenu();
    if (data && data.save) { try { begin(S.World.load(data.save)); } catch (e) { console.warn(e); } }
    requestAnimationFrame(frame);
  };
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
  expose();
})();
