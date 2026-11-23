/* SCP LIFE — living anomalies of wing T-2 (SCP-LF-139…146): creatures that know when they are watched.
   Shared systems:
   - GAZE & ATTENTION: who watches the creature (people at the window, the player's actual gaze, people in the cell, CCTV viewers,
     staff at the monitors), for how long, who watched longest, who is familiar (the anomaly's long-term memory);
   - HEARING: noises the creature can hear (knocks on the glass, screams, footsteps in the observation room, alarms);
     not every creature hears;
   - motion log, sound-reaction log, activity by hour, automatic hourly reports into the dossier; findings reveal hidden properties
     which change the containment procedures that SCP LIFE enforces (lifeCheck);
   - NPC reactions: stress and remarks of the staff at the window, sightings caused by the mimic.
   Every creature has its own behaviour states (st.act), which the renderer animates with its own rig and its own clip set. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, fmtTime, EV, Hm } = S, A = S.Anoms, H = A.H, def = A.def;
  const L = {};

  // ------------------------------------------------------------------ geometry of a block (cells are south of their observation rooms)
  L.cell = (w, a) => w.fac.room(a.containRoom);
  L.win = (w, a) => {
    const wi = (w.fac.windows || []).find(x => x.scp === a.id), c = L.cell(w, a);
    return wi ? { x0: wi.min, x1: wi.max, z: c.maxZ, inZ: c.maxZ - 0.55, cx: (wi.min + wi.max) / 2 } : { x0: c.center.x - 2, x1: c.center.x + 2, z: c.maxZ, inZ: c.maxZ - 0.55, cx: c.center.x };
  };
  L.clampIn = (r, x, z, m) => ({ x: clamp(x, r.minX + m, r.maxX - m), z: clamp(z, r.minZ + m, r.maxZ - m) });
  // move inside the cell toward (tx, tz); returns the remaining distance
  L.walk = (w, a, tx, tz, speed, dt, margin) => {
    const r = L.cell(w, a), p = a.agent.pos, t = L.clampIn(r, tx, tz, margin == null ? 0.5 : margin), dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { a.agent.moving = false; return 0; }
    const step = Math.min(d, speed * dt); p.x += dx / d * step; p.z += dz / d * step; a.agent.moving = true;
    L.face(a, Math.atan2(dx, dz) / (Math.PI / 180), dt * 3);
    a.st.moved = (a.st.moved || 0) + step; return d - step;
  };
  L.face = (a, yaw, k) => { const d = S.deltaAngle(a.agent.yaw, yaw); a.agent.yaw = (a.agent.yaw + d * Math.min(1, k) + 360) % 360; };
  L.yawTo = (a, pos) => Math.atan2(pos.x - a.agent.pos.x, pos.z - a.agent.pos.z) / (Math.PI / 180);

  // ------------------------------------------------------------------ GAZE & ATTENTION (once a second)
  L.attention = (w, a, opt) => {
    opt = opt || {}; const st = a.st, obs = a.obsRoom, cell = a.containRoom, by = [];
    const ws = st.ws || (st.ws = {});
    const p = w.player;
    if (!p.dead && p.roomId === obs) { const look = p.gazeAt === a.id && w.realTime - (p.gazeT || -9) < 0.8; if (look) by.push({ id: 'player', kind: 'window', w: 1, pos: p.pos }); }
    if (!p.dead && p.roomId === cell) by.push({ id: 'player', kind: 'cell', w: 1, pos: p.pos });
    for (const n of w.active) {
      const r = n.agent.roomId; if (r !== obs && r !== cell) continue; if (n.incap(w.now) || n.activity === 'Sleep') continue;
      if (r === cell) { by.push({ id: n.id, kind: 'cell', w: 1, pos: n.agent.pos, n }); continue; }
      const poi = n.reservedPoi && w.fac.poi(n.reservedPoi), atConsole = poi && poi.roomId === obs && poi.type === 'Console' && V.distXZ(poi.pos, n.agent.pos) < 1.2;
      const observing = n.job && n.job.steps && n.job.steps.some(s => !s.done && s.scp === a.id);
      const glance = !n.agent.moving && w.rng.chance(opt.glance != null ? opt.glance : 0.3);
      if (atConsole || observing || glance) by.push({ id: n.id, kind: 'window', w: atConsole || observing ? 1 : 0.5, pos: n.agent.pos, n });
    }
    const camDead = w.infra.faults.some(f => !f.fixed && f.kind === 'camera' && (f.room === cell || f.site === cell));
    if (!camDead && ((w.camWatch[cell] || -9) > w.realTime - 1.2 || a.rules.cctvContinuous)) by.push({ id: 'cctv', kind: 'cctv', w: 0.7 });
    if (!camDead && w.active.some(n => n.agent.roomId === 'command' && n.reservedPoi && !n.agent.moving) && w.rng.chance(0.012)) by.push({ id: 'cctv', kind: 'cctv', w: 0.3 });
    for (const b of by) ws[b.id] = (ws[b.id] || 0) + b.w;
    let top = null, tv = 0; for (const b of by) if (b.kind !== 'cctv' && ws[b.id] > tv) { tv = ws[b.id]; top = b.id; }
    const live = by.filter(b => b.kind !== 'cctv' || opt.cctvCounts);
    const watched = live.length > 0;
    st.att = { by, n: by.length, live: live.length, watched, cctv: by.some(b => b.kind === 'cctv'), top, inCell: by.some(b => b.kind === 'cell'),
      wt: watched ? ((st.att && st.att.wt) || 0) + 1 : 0, ut: watched ? 0 : ((st.att && st.att.ut) || 0) + 1, people: H.subjects(w, [obs]).length };
    if (watched) st.watchedSec = (st.watchedSec || 0) + 1; else st.unwatchedSec = (st.unwatchedSec || 0) + 1;
    return st.att;
  };
  L.familiar = (a, id) => id && id !== 'cctv' && a.mind.has(id) ? a.mind.get(id).recog : 0;

  // ------------------------------------------------------------------ HEARING
  L.hear = (w, a, sens) => {
    const st = a.st, since = st.heardT || 0, out = [], cell = L.cell(w, a);
    for (const e of w.noise) {
      if (e.t <= since) continue; let k = 0;
      if (e.roomId === a.containRoom) k = 1; else if (e.roomId === a.obsRoom) k = 0.75; else { const r = w.fac.room(e.roomId); if (r && r.level === cell.level && V.distXZ(e.pos, a.agent.pos) < 14) k = 0.25; }
      if (e.kind === 'glass_knock' && k < 0.5) continue;
      const loud = e.loud * k * (sens || 1); if (loud > 0.08) out.push({ kind: e.kind, loud, pos: e.pos, by: e.by, room: e.roomId });
    }
    st.heardT = w.realTime;
    // footsteps and voices in the observation room
    for (const s of H.subjects(w, [a.obsRoom])) { const mv = s.player ? w.player.moving : s.n.agent.moving; if (!mv) continue; const run = s.player ? (w.player.speed || 0) > 3 : s.n.agent.speed > 2.2; const loud = (run ? 0.45 : a.rules.quietWalk && s.n ? 0.05 : 0.14) * (sens || 1); if (loud > 0.08) out.push({ kind: 'steps', loud, pos: s.pos, by: s.id, room: a.obsRoom }); }
    if (w.alert && w.alert.level >= 3) out.push({ kind: 'alarm', loud: 0.6 * (sens || 1), pos: cell.center, by: null, room: a.containRoom });
    return out;
  };

  // ------------------------------------------------------------------ logs, reports, sounds, staff reactions
  L.log = (w, a, kind, text, extra) => {
    const st = a.st, log = st.log || (st.log = []); log.push(Object.assign({ t: w.now, kind, text, watched: !!(st.att && st.att.watched) }, extra || {})); if (log.length > 80) log.shift();
    const h = st.byHour || (st.byHour = new Array(24).fill(0)); if (kind === 'move' || kind === 'act') h[w.clock.hour]++;
  };
  L.act = (w, a, act, text) => { if (a.st.act === act) return; a.st.prevAct = a.st.act; a.st.act = act; a.st.actT = w.now; a.pose = act; if (text) L.log(w, a, 'act', text); };
  L.snd = (w, a, kind, pos, vol, range) => { if (w.sounds.length < 80) w.sounds.push({ t: w.now, kind, pos: V.copy(pos || a.agent.pos), roomId: a.containRoom, vol: vol || 0.6, range: range || 18, src: a.id }); };
  L.feel = (w, a, s, stress, line, chance) => {
    if (!s || !s.n) { if (s && s.player) w.player.psy.stress = clamp(w.player.psy.stress + stress * 0.5, 0, 100); return; }
    const n = s.n; n.needs.stress = clamp(n.needs.stress + stress, 0, 100); n.psy.fear = clamp(n.psy.fear + stress * 0.6, 0, 100);
    if (line && w.rng.chance(chance || 0.04) && w.now >= (n.barkUntil || 0)) n.say(line, w.now, 1.6);
  };
  // hourly automatic report from the motion sensors and the observation logs (shown in the dossier)
  L.report = (w, a, extra) => {
    const st = a.st, since = w.now - 60, log = (st.log || []).filter(e => e.t > since);
    const mv = log.filter(e => e.kind === 'move' || e.kind === 'act'), mw = mv.filter(e => e.watched).length, mu = mv.length - mw, snd = log.filter(e => e.kind === 'sound').length;
    const ws = st.ws || {}; let top = null, tv = 0; for (const id in ws) if (id !== 'cctv' && ws[id] > tv) { tv = ws[id]; top = id; }
    const txt = fmtTime(w.now) + ' · за час: действий ' + mv.length + ' (при наблюдении ' + mw + ', без наблюдения ' + mu + '), реакций на звук ' + snd + (top ? ', дольше всех наблюдал' + ' ' + w.nameOf(top) : '') + (extra ? '. ' + extra : '');
    const rp = st.reports || (st.reports = []); if (mv.length || snd || extra) { rp.push({ t: w.now, text: txt }); if (rp.length > 24) rp.shift(); }
    return txt;
  };
  L.dossier = (w, a) => {
    const st = a.st, out = [];
    out.push('Наблюдение: ' + Math.round((st.watchedSec || 0) / 60) + ' мин под наблюдением, ' + Math.round((st.unwatchedSec || 0) / 60) + ' мин без наблюдения.');
    const h = st.byHour; if (h) { let best = 0; h.forEach((v, i) => { if (v > h[best]) best = i; }); if (h[best] > 0) out.push('Наибольшая активность: ' + best + ':00–' + (best + 1) + ':00.'); }
    const fam = Object.keys(a.mind.p).filter(id => a.mind.p[id].recog > 0.6).map(id => w.nameOf(id)); if (fam.length) out.push('Узнаёт: ' + fam.slice(0, 5).join(', ') + '.');
    if (st.safe && st.safe.length) out.push('Безопасные предметы и методы: ' + st.safe.join('; ') + '.');
    for (const r of (st.reports || []).slice(-6)) out.push('Отчёт ' + r.text);
    for (const e of (st.log || []).slice(-8)) out.push(fmtTime(e.t) + (e.watched ? ' [наблюдение] ' : ' [без наблюдения] ') + e.text);
    return out;
  };
  L.addSafe = (a, text) => { const s = a.st.safe || (a.st.safe = []); if (s.indexOf(text) < 0) s.push(text); };
  L.isNight = w => w.clock.night;
  L.lights = (w, a) => { const r = L.cell(w, a); return r && r.powered !== false && !r.dark ? 1 : r && r.powered !== false ? 0.3 : 0; };

  // movement part of a mind's directive (returns false for commands the creature's own code animates: looks, speech)
  L.moveDirective = (w, a, d, dt) => {
    const win = L.win(w, a), r = L.cell(w, a), sp = a.def.speed || 0.8, tp = d.target && d.target !== 'cctv' ? w.posOf(d.target) : null;
    switch (d.cmd) {
      case 'APPROACH_WINDOW': L.walk(w, a, tp ? clamp(tp.x, win.x0 + 0.3, win.x1 - 0.3) : win.cx, win.inZ - 0.4, sp, dt); if (tp && !a.agent.moving) L.face(a, L.yawTo(a, tp), dt * 2); return true;
      case 'RETREAT': L.walk(w, a, r.center.x, r.minZ + 1.0, sp, dt); return true;
      case 'MOVE_TO_POINT': if (!d.point) return false; L.walk(w, a, d.point.x, d.point.z, sp, dt); return true;
      case 'HIDE': L.walk(w, a, r.minX + 0.6, r.minZ + 0.6, sp * 1.5, dt); return true;
      case 'REST': case 'SLEEP': a.agent.moving = false; return true;
      case 'LOOK_AT_TARGET': case 'OBSERVE_PERSON': if (!tp) return false; a.lookAt = d.target; if (a.def.model !== 'observer' && a.def.model !== 'mimic') { a.agent.moving = false; L.face(a, L.yawTo(a, tp), dt * 2); return true; } return false;
      default: return false;
    }
  };
  // a generic per-tick wrapper: decisions once a second, movement every tick
  function living(spec) {
    return Object.assign({ kind: 'living', living: true, knowledge0: 8 }, spec, {
      tick(w, a, dt, gm) {
        if (gm <= 0) return; const st = a.st;
        if (!st.init) { st.init = true; st.act = st.act || 'idle'; st.log = st.log || []; if (spec.setup) spec.setup(w, a); }
        // a directive chosen by the creature's mind (ai/minds.js, already validated); the creature's nature can still win
        const d = st.dir && st.dir.until > w.realTime ? st.dir : (st.dir = null), useDir = d && !(spec.instinct && spec.instinct(w, a, d));
        st.sec = (st.sec || 0) - dt;
        if (st.sec <= 0) { st.sec = 1; const att = L.attention(w, a, spec.attention); const heard = spec.hears ? L.hear(w, a, spec.hears) : []; spec.think(w, a, att, heard); if (useDir && spec.directive) spec.directive(w, a, d, att); }
        if (!(useDir && L.moveDirective(w, a, d, dt)) && spec.move) spec.move(w, a, dt);
      },
      hourly(w, a) { L.report(w, a, spec.hourNote ? spec.hourNote(w, a) : ''); if (spec.hourlyExtra) spec.hourlyExtra(w, a); },
      truth(w, a) { const t = spec.truthX ? spec.truthX(w, a) : {}; return Object.assign({ motion: a.agent.moving ? 0.7 : 0.02, sound: 0.05 }, t); }
    });
  }
  const dossierStatus = a => (a.st.act ? { idle: 'спокоен' }[a.st.act] || a.st.act : '—');

  // ================================================================== SCP-LF-139 «Длинношеий»
  def(living({
    id: 'SCP-LF-139', name: 'Длинношеий', cls: 'Евклид', temper: 'watcher', room: 'cell139', obs: 'obs139', model: 'longneck', speed: 0.35, hears: 1,
    desc: 'Истощённый гуманоид ростом 2,4 м с шеей, способной вытягиваться до 1,6 м. Большую часть времени стоит в самом тёмном углу лицом к стене. Когда у окна остаётся один человек, медленно разворачивается, подходит и вытягивает шею к стеклу, разглядывая лицо наблюдателя. Голова поворачивается на углы, недоступные человеку, — с отчётливым хрустом.',
    contain: 'Тёмная камера 8×8 м, высота 5,2 м. Линия безопасности — 2 м от стекла. Наблюдение по возможности парами. При необходимости отогнать объект — включить полный свет в камере. Вход только группой МОГ из трёх человек.',
    triggers: 'одиночный наблюдатель у окна; знакомые лица; темнота',
    rules: {},
    props: [['lone_observer', 'подходит к стеклу только когда у окна один человек', { pairOnly: true }], ['light_retreat', 'яркий свет в камере заставляет его втянуть шею и уйти в угол', { lightOnApproach: true }],
      ['remembers_faces', 'к знакомым сотрудникам подходит быстрее и смотрит дольше'], ['neck_limit', 'шея не вытягивается дальше 1,6 м — за линией 2 м от стекла он не дотягивается', null, false], ['hears_name', 'поворачивает голову на звук шагов и стук, даже стоя лицом к стене']],
    exps: [{ id: 'pair', name: 'Один и двое у окна', desc: 'Наблюдатель стоит у окна один, затем к нему присоединяется второй.', dur: 20 }, { id: 'lights', name: 'Полный свет', desc: 'Во время подхода включить полный свет в камере.', dur: 10 },
      { id: 'familiar', name: 'Знакомый и новичок', desc: 'По очереди к окну подходят постоянный сотрудник и новый.', dur: 20 }, { id: 'knock', name: 'Стук по стеклу', desc: 'Тихий стук по стеклу, пока объект стоит в углу.', dur: 5 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.minX + 1.0, r.floorY, r.minZ + 1.0); a.agent.yaw = 225; a.st.neck = 0; a.st.headTurn = 0; L.act(w, a, 'corner'); },
    instinct: (w, a, d) => d.cmd === 'APPROACH_WINDOW' && ((w.fac.room(a.containRoom).lightBoost || 0) > 0.5 || (a.st.att && a.st.att.people > 1)), // light and company always drive it back
    think(w, a, att, heard) {
      const st = a.st, win = L.win(w, a), light = (w.fac.room(a.containRoom).lightBoost || 0) > 0.5;
      const lone = att.people === 1 && att.by.filter(b => b.kind === 'window').length === 1, target = att.by.find(b => b.kind === 'window') || att.by.find(b => b.kind === 'cell');
      for (const h of heard) { if (h.loud > 0.12) { st.headTo = h.pos; st.headT = w.now + 0.3; if (st.act === 'corner') { L.log(w, a, 'sound', 'повернул голову на звук (' + ({ glass_knock: 'стук по стеклу', steps: 'шаги', scream: 'крик', alarm: 'сирена' }[h.kind] || h.kind) + '), не оборачиваясь телом'); L.snd(w, a, 'bone_crack', V.v(a.agent.pos.x, a.agent.pos.y + 2.2, a.agent.pos.z), 0.5, 14); if (!a.props.find(p => p.id === 'hears_name').revealed && (st.headSeen = (st.headSeen || 0) + 1) >= 3) a.reveal(w, 'hears_name', 'наблюдение'); } } }
      if (light && (st.act === 'approach' || st.act === 'peer')) { L.act(w, a, 'retreat', 'полный свет: втянул шею и ушёл в угол'); L.addSafe(a, 'полный свет в камере отгоняет объект'); return; }
      if (st.act === 'corner' || st.act === 'turn') {
        if (target && (lone || att.inCell) && !light) { const fam = L.familiar(a, target.id); st.patience = (st.patience || 0) + 1 + fam * 2; if (st.patience > (a.rules.pairOnly ? 12 : 16)) { st.who = target.id; L.act(w, a, 'turn', 'развернулся к окну'); if (st.patience > 20) L.act(w, a, 'approach', 'медленно идёт к стеклу, взгляд на ' + w.nameOf(target.id)); } }
        else st.patience = Math.max(0, (st.patience || 0) - 2);
      } else if (st.act === 'approach' || st.act === 'peer') {
        if (!target || (!lone && !att.inCell)) { L.act(w, a, 'retreat', att.people > 1 ? 'у окна появился второй человек — отступил' : 'наблюдатель ушёл — отступил'); if (att.people > 1 && !a.props.find(p => p.id === 'lone_observer').revealed && (st.pairSeen = (st.pairSeen || 0) + 1) >= 2) a.reveal(w, 'lone_observer', 'наблюдение'); }
        else { st.who = target.id; a.lookAt = target.id; for (const b of att.by) if (b.n) L.feel(w, a, b, 0.25, ['Он опять тянется к стеклу.', 'Не смотри ему в глаза.', 'Шея… она ещё длиннее, чем вчера.'][w.rng.int(0, 3)], 0.06); }
      } else if (st.act === 'retreat' && V.distXZ(a.agent.pos, st.cornerPos || a.agent.pos) < 0.3) { L.act(w, a, 'corner'); st.patience = 0; }
      if (st.act === 'corner' && L.isNight(w) && w.rng.chance(0.004)) L.snd(w, a, 'groan_m', null, 0.4, 16);
    },
    move(w, a, dt) {
      const st = a.st, r = L.cell(w, a), win = L.win(w, a); st.cornerPos = st.cornerPos || V.v(r.minX + 1.0, r.floorY, r.minZ + 1.0);
      const tgt = st.who ? w.posOf(st.who) : null;
      if (st.act === 'approach' || st.act === 'peer') {
        const tx = tgt ? clamp(tgt.x, win.x0 + 0.4, win.x1 - 0.4) : win.cx, rem = L.walk(w, a, tx, win.z - 2.1, 0.35, dt);
        if (rem < 0.1) { if (st.act !== 'peer') L.act(w, a, 'peer', 'вытянул шею к стеклу'); st.neck = Math.min(1, st.neck + dt * 0.12); if (tgt) L.face(a, L.yawTo(a, tgt), dt); }
      } else if (st.act === 'retreat') { st.neck = Math.max(0, st.neck - dt * 0.5); L.walk(w, a, st.cornerPos.x, st.cornerPos.z, 0.45, dt); }
      else if (st.act === 'turn') { a.agent.moving = false; if (tgt) L.face(a, L.yawTo(a, tgt), dt * 0.4); st.neck = Math.max(0, st.neck - dt * 0.2); }
      else { a.agent.moving = false; L.face(a, 225, dt * 0.5); st.neck = Math.max(0, st.neck - dt * 0.3); }
      // head: follows the target beyond human limits; snaps to sounds
      const want = st.headT > w.now - 3 && st.headTo ? S.deltaAngle(a.agent.yaw, L.yawTo(a, st.headTo)) : tgt && (st.act === 'peer' || st.act === 'turn') ? S.deltaAngle(a.agent.yaw, L.yawTo(a, tgt)) : 0;
      st.headTurn += (clamp(want, -170, 170) - st.headTurn) * Math.min(1, dt * 2);
    },
    hourNote: (w, a) => a.st.neck > 0.6 ? 'шея вытянута на ' + Math.round(a.st.neck * 160) + ' см' : '',
    status: a => ({ corner: 'в углу, лицом к стене', turn: 'развернулся к окну', approach: 'идёт к стеклу', peer: 'вытянул шею к стеклу', retreat: 'отступает' }[a.st.act] || '—'),
    threat: a => a.st.act === 'peer' ? 38 : a.st.act === 'approach' ? 28 : 15,
    truthX: (w, a) => ({ temp: 17, light: 0.2, sound: a.st.act === 'peer' ? 0.2 : 0.05 }),
    observe(w, a, who, cam) {
      const st = a.st; if (cam) return 'На записи: высокая фигура ' + ({ corner: 'в углу лицом к стене', peer: 'у стекла, шея вытянута к окну', approach: 'медленно идёт к окну' }[st.act] || 'в полумраке') + '.';
      return { corner: 'Он стоит в углу лицом к стене. Голова чуть наклонена, как будто прислушивается к вам.', turn: 'Он развернулся. Лица почти не видно в темноте, но голова повёрнута точно к вам.', approach: 'Он идёт к стеклу — очень медленно, по полшага. Шея уже длиннее, чем должна быть.', peer: 'Голова на вытянутой шее висит в метре от стекла и разглядывает ваше лицо. Веки не двигаются.', retreat: 'Он уходит обратно в угол, втягивая шею с сухим хрустом.' }[st.act] || 'В камере темно.';
    },
    experiment(w, a, id, ctx) {
      if (id === 'pair') return { text: 'Один наблюдатель: через 20 с объект развернулся и подошёл. Второй наблюдатель у окна: объект отступил в угол за 6 с.', reveal: ['lone_observer'] };
      if (id === 'lights') { L.addSafe(a, 'полный свет в камере отгоняет объект'); return { text: 'При включении полного света объект втянул шею и ушёл в угол. Повторный подход — только после выключения.', reveal: ['light_retreat'] }; }
      if (id === 'familiar') return { text: 'К постоянному сотруднику объект подошёл за 25 с и простоял у стекла 4 мин; к новичку — за 70 с, 40 с у стекла.', reveal: ['remembers_faces'] };
      if (id === 'knock') { L.knock(w, ctx.who || 'player', a.id); return { text: 'Голова повернулась на звук на 160°, тело осталось неподвижным. Отчётливый хруст.', reveal: ['hears_name'] }; }
      return { text: '' };
    },
    lifeCheck(w, a, life) { if (a.rules.pairOnly && a.st.act === 'peer' && life.every('lf139pair', 60)) life.decide('Процедура LF-139', ['объект у стекла', 'у окна один сотрудник'], 'Напоминание: наблюдение только парами'); }
  }));

  // ================================================================== SCP-LF-140 «Сидящий»
  def(living({
    id: 'SCP-LF-140', name: 'Сидящий', cls: 'Безопасный', temper: 'still', room: 'cell140', obs: 'obs140', model: 'seated', hears: 0,
    attention: { cctvCounts: true, glance: 0.5 },
    desc: 'Мужская фигура в костюме конторского служащего 1980-х годов, сидящая на офисном стуле лицом к стене. Никто и никогда не видел, чтобы он двигался. Тем не менее между осмотрами стул оказывается повёрнутым на несколько градусов к окну, а голова — к месту, где обычно стоят наблюдатели.',
    contain: 'Непрерывная запись камерой камеры содержания. Положение стула и головы фиксируется при каждом осмотре. Не допускать перерывов наблюдения дольше 60 с. Не входить в камеру со спины объекта.',
    triggers: 'отсутствие наблюдения (включая камеры); постоянные посетители',
    rules: {},
    props: [['cctv_counts', 'наблюдение через камеру тоже удерживает его неподвижным', { cctvContinuous: true }], ['turns_to_regulars', 'поворачивается к месту, где обычно стоят постоянные наблюдатели'],
      ['blind_gap', 'перерыв наблюдения в 60 с и больше достаточно для поворота на несколько градусов'], ['never_seen', 'ни одна запись не содержит момента движения', null, true]],
    exps: [{ id: 'cctv_off', name: 'Отключение камеры', desc: 'Камеру отключают на 2 минуты, в наблюдательной никого.', dur: 5 }, { id: 'regular_absent', name: 'Без постоянного наблюдателя', desc: 'Постоянный наблюдатель неделю не приходит.', dur: 30 }, { id: 'marked_floor', name: 'Разметка пола', desc: 'Положение ножек стула размечают мелом.', dur: 10 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x, r.floorY, r.minZ + 2.2); a.st.chair = 180; a.st.head = 0; a.agent.yaw = 180; L.act(w, a, 'sit'); a.st.turned = 0; },
    think(w, a, att) {
      const st = a.st, win = L.win(w, a), watched = att.watched || att.cctv;
      if (watched) { st.gap = 0; if (att.top && att.top !== 'cctv' && att.by.some(b => b.id === att.top && b.kind === 'window')) { const p = w.posOf(att.top); st.regular = { x: p.x, z: p.z }; } return; }
      st.gap = (st.gap || 0) + 1;
      if (st.gap >= (a.rules.cctvContinuous ? 75 : 60) && w.rng.chance(0.08)) {
        // turns a little toward where the regulars stand — never while anyone (or any camera) watches
        const tgt = st.regular || { x: win.cx, z: win.z + 1.2 }, want = L.yawTo(a, tgt), d = S.deltaAngle(st.chair, want);
        const step = clamp(d, -6, 6); st.chair = (st.chair + step + 360) % 360; st.head = clamp(S.deltaAngle(st.chair, want), -60, 60); a.agent.yaw = st.chair; st.turned += Math.abs(step);
        st.gap = 0; L.log(w, a, 'move', 'при осмотре стул повёрнут на ' + Math.abs(Math.round(step)) + '° к ' + (st.regular ? 'месту постоянного наблюдателя' : 'окну') + '; момент движения не записан');
        if (st.turned > 15 && !a.props.find(p => p.id === 'blind_gap').revealed) a.reveal(w, 'blind_gap', 'журнал положений');
        if (st.turned > 40 && st.regular && !a.props.find(p => p.id === 'turns_to_regulars').revealed) a.reveal(w, 'turns_to_regulars', 'журнал положений');
        if (Math.abs(S.deltaAngle(st.chair, L.yawTo(a, { x: win.cx, z: win.z }))) < 10 && !st.facedLogged) { st.facedLogged = true; L.log(w, a, 'act', 'стул развёрнут к окну полностью'); H.post(w, a, 1, EV.AnomalyBehaviour, 'SCP-LF-140 при осмотре обнаружен лицом к окну. Записи момента поворота нет.'); }
      }
    },
    move(w, a) { a.agent.moving = false; },
    hourNote: a => '',
    status: a => 'стул повёрнут на ' + Math.round(Math.abs(S.deltaAngle(180, a.st.chair || 180))) + '° от стены',
    threat: a => 6,
    truthX: () => ({ motion: 0, temp: 20, sound: 0 }),
    observe(w, a, who, cam) {
      const deg = Math.round(Math.abs(S.deltaAngle(180, a.st.chair || 180)));
      if (cam) return 'На записи: человек на стуле, неподвижен. Поворот от стены — ' + deg + '°.';
      return deg < 3 ? 'Он сидит лицом к стене. Руки на коленях. Вы смотрите долго — он не шевелится, даже не дышит заметно.' : 'Стул повёрнут к окну на ' + deg + '°. Голова чуть повёрнута ' + (a.st.head > 0 ? 'вправо' : 'влево') + ' — туда, где вы обычно стоите. Он неподвижен.';
    },
    experiment(w, a, id) {
      if (id === 'cctv_off') { a.st.chair = (a.st.chair + 5) % 360; return { text: 'После двух минут без камеры и людей стул оказался повёрнут на 5°. На последнем кадре перед отключением и первом после — разные положения.', reveal: ['cctv_counts', 'blind_gap'] }; }
      if (id === 'regular_absent') return { text: 'Без постоянного наблюдателя объект неделю не менял положения. После его возвращения — поворот на 9° к его обычному месту за одну ночь.', reveal: ['turns_to_regulars'] };
      if (id === 'marked_floor') return { text: 'Меловые метки стёрты не были: ножки стула стоят точно на метках, но сам стул повёрнут. Механизм поворота неизвестен.' };
      return { text: '' };
    },
    lifeCheck(w, a, life) { if (a.rules.cctvContinuous && !a.st.monitor) { a.st.monitor = true; life.decide('Процедура LF-140', ['наблюдение через камеру удерживает объект'], 'Камера камеры LF-140 выведена на постоянный монитор диспетчерской'); } }
  }));

  // ================================================================== SCP-LF-141 «Ползун»
  def(living({
    id: 'SCP-LF-141', name: 'Ползун', cls: 'Евклид', temper: 'shy-predator', room: 'cell141', obs: 'obs141', model: 'crawler', speed: 1.2, hears: 1.6,
    desc: 'Сегментированное существо длиной около 1,4 м с восемью конечностями. Передвигается по полу, стенам и потолку. Замирает, как только на него смотрят или рядом слышны шаги. Ночью исследует вентиляционную решётку в углу камеры.',
    contain: 'Камера с гладкими стенами, вентиляция закрыта двойной стальной решёткой. Еженедельная проверка решётки. В наблюдательной ходить тихо. Тепловые лампы использовать как приманку при осмотре.',
    triggers: 'шаги и громкие звуки (замирание, бегство на потолок); тепло; отсутствие наблюдения ночью',
    rules: {},
    props: [['freezes_watched', 'замирает под взглядом — движение фиксируется только датчиками в отсутствие наблюдателей', null, false], ['vent_probing', 'по ночам проверяет решётку вентиляции на прочность', { meshCheck: true }],
      ['hears_footsteps', 'слышит шаги в наблюдательной и замирает', { quietWalk: true }], ['warm_attracts', 'тянется к источникам тепла — тепловую лампу можно использовать как приманку']],
    exps: [{ id: 'quiet_watch', name: 'Тихое наблюдение', desc: 'Наблюдение без движения и звука в течение 10 минут.', dur: 15 }, { id: 'heat_lamp', name: 'Тепловая лампа', desc: 'Включить тепловую лампу у окна.', dur: 10 }, { id: 'night_log', name: 'Ночной журнал датчиков', desc: 'Сопоставить ночные показания датчиков с состоянием решётки.', dur: 10 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.maxX - 1, r.floorY, r.minZ + 1); a.st.surf = 'floor'; a.st.mesh = 100; a.st.h = 0; L.act(w, a, 'rest'); },
    instinct: (w, a) => !!(a.st.att && a.st.att.watched), // under a gaze it freezes whatever it intended
    think(w, a, att, heard) {
      const st = a.st, r = L.cell(w, a);
      const loud = heard.reduce((m, h) => Math.max(m, h.loud), 0);
      if (loud > 0.5) { if (st.act !== 'flee') { L.act(w, a, 'flee', 'громкий звук — метнулся на потолок в угол'); L.log(w, a, 'sound', 'бегство от звука силой ' + loud.toFixed(2)); st.tgt = { x: r.minX + 0.6, z: r.minZ + 0.6, surf: 'ceiling' }; L.snd(w, a, 'skitter', null, 0.7, 16); } return; }
      if (loud > 0.12 && st.act !== 'freeze') { st.fz = 6; L.act(w, a, 'freeze', 'замер на звук шагов'); L.log(w, a, 'sound', 'замер: шаги в наблюдательной'); if ((st.stepFreeze = (st.stepFreeze || 0) + 1) >= 3 && !a.props.find(p => p.id === 'hears_footsteps').revealed) a.reveal(w, 'hears_footsteps', 'наблюдение'); return; }
      if (att.watched) { if (st.act !== 'freeze' && st.act !== 'flee') L.act(w, a, 'freeze', 'замер под взглядом'); st.fz = 4; for (const b of att.by) if (b.n) L.feel(w, a, b, 0.15, ['Он шевелится только когда отворачиваешься.', 'Видел? Нет? Я тоже…'][w.rng.int(0, 2)], 0.04); return; }
      if (st.fz > 0) { st.fz--; return; }
      if (st.act === 'freeze' || st.act === 'rest' || st.act === 'flee' && V.distXZ(a.agent.pos, st.tgt || a.agent.pos) < 0.3) {
        // unobserved: explores; at night probes the vent grille
        const night = L.isNight(w), heat = st.heatUntil > w.now;
        if (heat) { const win = L.win(w, a); st.tgt = { x: win.cx, z: win.z - 0.4, surf: 'wall' }; L.act(w, a, 'crawl', 'ползёт к тепловой лампе'); }
        else if (night && w.rng.chance(0.3)) { st.tgt = { x: r.maxX - 0.5, z: r.minZ + 0.5, surf: 'wall' }; L.act(w, a, 'vent', 'ползёт к вентиляционной решётке'); }
        else if (w.rng.chance(0.35)) { const s = w.rng.pick(['floor', 'floor', 'wall', 'ceiling']); st.tgt = { x: w.rng.range(r.minX + 0.6, r.maxX - 0.6), z: w.rng.range(r.minZ + 0.6, r.maxZ - 1.2), surf: s }; L.act(w, a, 'crawl', 'перемещается по ' + ({ floor: 'полу', wall: 'стене', ceiling: 'потолку' }[s]) + ' (датчики движения)'); }
        else L.act(w, a, 'rest');
      }
      if (st.act === 'vent' && st.atVent) { st.mesh = Math.max(0, st.mesh - 0.004); if (w.rng.chance(0.15)) L.snd(w, a, 'scratch_far', null, 0.5, 14); if (w.rng.chance(0.02)) L.log(w, a, 'act', 'скребёт решётку вентиляции; прочность ' + Math.round(st.mesh) + '%'); if (w.rng.chance(0.01)) st.atVent = false; }
    },
    move(w, a, dt) {
      const st = a.st; if (!st.tgt || st.act === 'freeze' || st.act === 'rest') { a.agent.moving = false; return; }
      const sp = st.act === 'flee' ? 2.6 : st.act === 'vent' ? 0.8 : 1.0, rem = L.walk(w, a, st.tgt.x, st.tgt.z, sp, dt, 0.35);
      st.surf = rem < 1.5 ? st.tgt.surf : st.surf === 'ceiling' && st.tgt.surf !== 'ceiling' ? 'wall' : st.surf;
      const hWant = st.surf === 'ceiling' ? (L.cell(w, a).height - 0.25) : st.surf === 'wall' ? 1.4 : 0; st.h += (hWant - st.h) * Math.min(1, dt * 1.5);
      if (rem <= 0.05) { if (st.act === 'vent') st.atVent = true; else if (st.act !== 'flee') L.act(w, a, 'rest'); }
    },
    hourNote: (w, a) => 'решётка ' + Math.round(a.st.mesh) + '%',
    status: a => ({ rest: 'неподвижен', freeze: 'замер', crawl: 'перемещается', vent: 'у решётки вентиляции', flee: 'бегство на потолок' }[a.st.act] || '—') + ' · решётка ' + Math.round(a.st.mesh || 100) + '%',
    threat: a => 15 + (100 - (a.st.mesh == null ? 100 : a.st.mesh)) * 0.35,
    truthX: (w, a) => ({ motion: a.agent.moving ? 0.9 : 0.01, temp: 24, sound: a.st.atVent ? 0.3 : 0.02 }),
    observe(w, a, who, cam) {
      const st = a.st, where = { floor: 'на полу', wall: 'на стене', ceiling: 'на потолке' }[st.surf] || 'на полу';
      if (cam) return 'На записи: существо ' + where + ', ' + (a.agent.moving ? 'движется' : 'неподвижно') + '. Решётка вентиляции — ' + Math.round(st.mesh) + '%.';
      return 'Существо ' + where + '. Все восемь конечностей прижаты к поверхности. Пока вы смотрите, оно не двигается — только сегменты чуть подрагивают, как от дыхания.';
    },
    experiment(w, a, id) {
      if (id === 'quiet_watch') return { text: 'За 10 минут неподвижного наблюдения объект не сдвинулся. Датчики движения в те же минуты молчали. После ухода наблюдателя — 40 с движения.', reveal: ['freezes_watched'] };
      if (id === 'heat_lamp') { a.st.heatUntil = w.now + 20; L.addSafe(a, 'тепловая лампа у окна приманивает объект к стеклу (удобно для осмотра)'); return { text: 'Через 3 минуты после включения лампы объект переполз на стену у окна и оставался там, пока лампа горела.', reveal: ['warm_attracts'] }; }
      if (id === 'night_log') return { text: 'Ночные всплески датчиков совпадают со звуками скрежета в вентиляции. На решётке свежие царапины.', reveal: ['vent_probing'] };
      return { text: '' };
    },
    lifeCheck(w, a, life) {
      if (a.st.mesh < (a.rules.meshCheck ? 75 : 50) && !w.tasks.hasActive('mesh_repair', a.id)) { const d = life.decide('Решётка вентиляции LF-141', ['прочность ' + Math.round(a.st.mesh) + '%'], 'Замена секции решётки'); const t = life.assign('mesh_repair', ['containment_engineer', 'technician', 'engineer'], { target: a.id }, 'SCP LIFE', 240, a.obsRoom, { decision: d.id }); if (t) d.assigned = w.nameOf(t.who); }
    }
  }));

  // ================================================================== SCP-LF-142 «Лицевой подражатель»
  def(living({
    id: 'SCP-LF-142', name: 'Лицевой подражатель', cls: 'Евклид', temper: 'mimic', room: 'cell142', obs: 'obs142', model: 'mimic', speed: 1.0, hears: 1,
    desc: 'Гуманоид с гладким лицом без черт. Перенимает облик и позу того, кто смотрит на него дольше всех: цвет формы, причёску, манеру стоять. Повторяет движения наблюдателя с задержкой около полутора секунд и отвечает на стук тем же числом ударов. Со временем начинает принимать облик постоянных посетителей, даже когда их нет у окна.',
    contain: 'Смена наблюдателей каждые 15 минут. Не стучать по стеклу. О каждом случае «двойника» сообщать дежурному. Записи камер — основной источник (на камерах лицо гладкое).',
    triggers: 'длительный взгляд одного человека; стук; отсутствие постоянного посетителя',
    rules: {},
    props: [['copies_knocks', 'отвечает на стук тем же числом ударов'], ['delay', 'копирует движения с задержкой ~1,5 с — по ней копию можно отличить', null, false],
      ['copies_absent', 'принимает облик отсутствующего постоянного посетителя', { rotateWatchers: true }], ['cctv_blank', 'на камерах лицо и одежда остаются гладкими — облик видят только живые наблюдатели']],
    exps: [{ id: 'knock_pattern', name: 'Ритм стука', desc: 'Постучать по стеклу три раза, затем пять.', dur: 5 }, { id: 'two_watchers', name: 'Два наблюдателя', desc: 'Двое смотрят на объект по очереди.', dur: 15 }, { id: 'cctv_compare', name: 'Сравнение с записью', desc: 'Сравнить облик у окна с записью камеры.', dur: 10 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x, r.floorY, r.center.z); a.agent.yaw = 0; a.st.copy = null; a.st.mirror = []; L.act(w, a, 'blank'); },
    directive(w, a, d) { if ((d.cmd === 'OBSERVE_PERSON' || d.cmd === 'LOOK_AT_TARGET') && d.target && d.target !== 'cctv' && [a.obsRoom, a.containRoom].indexOf(w.roomOf(d.target)) >= 0) { if (a.st.copy !== d.target) L.log(w, a, 'act', 'выбрал, кого копировать: ' + w.nameOf(d.target)); a.st.copy = d.target; L.act(w, a, 'mirror'); } else if (d.cmd === 'IGNORE' || d.cmd === 'RETREAT') { a.st.copy = null; L.act(w, a, 'blank'); } else if (d.cmd === 'CHANGE_POSTURE') a.st.crouch = !a.st.crouch; },
    think(w, a, att, heard) {
      const st = a.st, win = L.win(w, a);
      for (const h of heard) if (h.kind === 'glass_knock') { st.knocks = (st.knocks || 0) + 1; st.knockAt = w.realTime; }
      if (st.knocks && w.realTime - st.knockAt > 1.2) { const n = st.knocks; st.knocks = 0; st.reply = { n, t: w.realTime + 0.6 }; L.log(w, a, 'sound', 'ответил на стук: ' + n + ' удар(а)'); if (!a.props.find(p => p.id === 'copies_knocks').revealed && (st.kr = (st.kr || 0) + 1) >= 2) a.reveal(w, 'copies_knocks', 'наблюдение'); }
      if (st.reply && w.realTime >= st.reply.t) { const kp = V.v(clamp(a.agent.pos.x, win.x0, win.x1), a.agent.pos.y + 1.4, win.z); for (let i = 0; i < st.reply.n; i++) if (w.sounds.length < 80) w.sounds.push({ t: w.now, kind: 'glass_tap', pos: kp, roomId: a.containRoom, vol: 0.75, range: 14, delay: 0.45 * i, src: a.id }); st.replyN = st.reply.n; st.replyT = w.realTime; st.reply = null; }
      const live = att.by.filter(b => b.kind === 'window' || b.kind === 'cell');
      const regular = Object.keys(a.mind.p).filter(id => a.mind.p[id].seen >= 4 && a.mind.p[id].habit >= 0.3).sort((x, y) => a.mind.p[y].seen - a.mind.p[x].seen)[0];
      if (live.length && att.top) {
        const was = st.copy; st.copy = att.top; st.copyAbsent = false;
        if (was !== st.copy) { L.act(w, a, 'mirror', 'перенимает облик: ' + w.nameOf(st.copy)); for (const b of live) if (b.n) L.feel(w, a, b, 2, 'Это же… я?', 0.3); }
        st.wt = (st.wt || 0) + 1; for (const b of live) if (b.n && b.id === st.copy) L.feel(w, a, b, 0.3, ['Он стоит, как я.', 'Перестань меня повторять.'][w.rng.int(0, 2)], 0.05);
        if (a.rules.rotateWatchers && st.wt > 15 * 60) { st.wt = 0; w.life && w.life.decide('Процедура LF-142', ['наблюдатель у окна более 15 мин'], 'Смена наблюдателя'); }
      } else if (regular && w.now - a.mind.p[regular].last > 600 && w.rng.chance(0.0015)) {
        st.copy = regular; st.copyAbsent = true; L.act(w, a, 'absent', 'принял облик отсутствующего посетителя: ' + w.nameOf(regular));
        const seer = w.active.find(n => n.agent.roomId === a.obsRoom && n.id !== regular);
        if (seer && w.life) { w.life.sighting(seer.id, { roomId: a.obsRoom, text: 'в камере LF-142 стоит ' + w.nameOf(regular) + ', хотя его нет в секторе', kind: 'double' }); if (!a.props.find(p => p.id === 'copies_absent').revealed) a.reveal(w, 'copies_absent', 'сообщение сотрудника'); }
      } else if (!live.length && st.act === 'mirror') { L.act(w, a, 'blank', 'наблюдатель ушёл — лицо снова гладкое'); st.copy = null; st.wt = 0; }
    },
    move(w, a, dt) {
      const st = a.st, win = L.win(w, a);
      if ((st.act === 'mirror' || st.act === 'absent') && st.copy) {
        // mirrored copy: stands opposite the watcher behind the glass, repeating their movement with a delay
        const p = st.copy === 'player' ? w.player : w.npc(st.copy);
        const pos = st.copy === 'player' ? p.pos : p && p.agent ? p.agent.pos : null;
        const hist = st.mirror; if (pos) hist.push({ x: pos.x, z: pos.z, t: w.realTime, crouch: st.copy === 'player' ? !!w.player.crouch : false }); while (hist.length > 2 && w.realTime - hist[0].t > 1.6) hist.shift();
        const h = st.act === 'absent' ? { x: win.cx, z: win.z + 1.5 } : hist[0];
        if (h) { const mz = win.z - (h.z - win.z); L.walk(w, a, clamp(h.x, win.x0 + 0.3, win.x1 - 0.3), Math.max(mz, win.z - 2.5), 1.4, dt, 0.4); L.face(a, 0, dt * 4); st.crouch = !!h.crouch; }
      } else { a.agent.moving = false; L.face(a, 0, dt); }
    },
    status: a => ({ blank: 'стоит неподвижно, лицо гладкое', mirror: 'копирует наблюдателя', absent: 'в облике отсутствующего сотрудника' }[a.st.act] || '—'),
    threat: a => a.st.act === 'absent' ? 30 : 18,
    observe(w, a, who, cam) {
      const st = a.st; if (cam) return 'На записи: гладкая фигура без черт лица' + (st.act === 'mirror' ? ', повторяет движения человека у окна с задержкой.' : '.');
      if (st.copy === who) return 'За стеклом стоите вы. Та же форма, тот же наклон головы. Вы поднимаете руку — через полторы секунды поднимается и его рука.';
      if (st.copy) return 'Объект выглядит как ' + w.nameOf(st.copy) + (st.copyAbsent ? ', хотя ' + w.nameOf(st.copy) + ' сейчас не в секторе.' : '.');
      return 'Гладкое лицо без черт. Объект стоит посреди камеры и ждёт.';
    },
    experiment(w, a, id) {
      if (id === 'knock_pattern') return { text: 'Три удара — через 1,5 с объект ответил тремя ударами. Пять — пятью. Ритм повторён точно.', reveal: ['copies_knocks'] };
      if (id === 'two_watchers') return { text: 'Объект перенимал облик того, кто смотрел дольше; переход занимал около 4 секунд. Движения повторял с задержкой 1,5 с.', reveal: ['delay'] };
      if (id === 'cctv_compare') { L.addSafe(a, 'сверка с камерой: на записи облик не копируется'); return { text: 'Пока сотрудники у окна видели «двойника», камера фиксировала гладкую фигуру без одежды и лица.', reveal: ['cctv_blank'] }; }
      return { text: '' };
    }
  }));

  // ================================================================== SCP-LF-143 «Существо у стекла»
  def(living({
    id: 'SCP-LF-143', name: 'Существо у стекла', cls: 'Кетер', temper: 'predator', room: 'cell143', obs: 'obs143', model: 'glass', speed: 1.6, hears: 1.4,
    desc: 'Худое четвероногое существо с длинными передними конечностями и расщеплённой нижней челюстью. Живёт в тёмной части камеры, но стоит кому-то войти в наблюдательную — подходит к окну, упирается ладонями в стекло и следует за человеком вдоль окна. Стучит, царапает стекло; на стекле остаются следы дыхания.',
    contain: 'Бронестекло 60 мм, осмотр стекла еженедельно и после каждого эпизода царапания. В наблюдательной не делать резких движений. Яркий свет со стороны наблюдательной — для отгона от стекла.',
    triggers: 'движение в наблюдательной; стук по стеклу; запах крови (не проверялось)',
    rules: {},
    props: [['follows_movement', 'следует только за движущимися людьми; неподвижного теряет через ~20 с', null, false], ['glass_wear', 'царапание снижает прочность стекла', { glassCheck: true }],
      ['quiet_calms', 'тишина и неподвижность у окна — уходит в темноту'], ['light_blind', 'яркий свет со стороны наблюдательной ослепляет — отходит от стекла']],
    exps: [{ id: 'stand_still', name: 'Замереть у окна', desc: 'Наблюдатель стоит неподвижно у окна 2 минуты.', dur: 10 }, { id: 'knock', name: 'Стук по стеклу', desc: 'Один удар по стеклу в дальнем углу окна.', dur: 5 }, { id: 'light', name: 'Прожектор', desc: 'Включить прожектор со стороны наблюдательной.', dur: 5 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x, r.floorY, r.minZ + 1.2); a.agent.yaw = 0; a.st.glass = 100; a.st.fog = 0; L.act(w, a, 'lurk'); },
    think(w, a, att, heard) {
      const st = a.st, win = L.win(w, a), people = H.subjects(w, [a.obsRoom]);
      const knock = heard.find(h => h.kind === 'glass_knock' && h.loud > 0.2);
      if (knock) { st.still = 0; st.tx = clamp(knock.pos.x, win.x0 + 0.3, win.x1 - 0.3); st.excite = Math.min(10, (st.excite || 0) + 4); L.act(w, a, 'rush', 'бросился к месту стука'); L.log(w, a, 'sound', 'реакция на стук по стеклу'); }
      const moving = people.filter(s => s.player ? w.player.moving : s.n.agent.moving);
      if (st.blindUntil > w.now) { L.act(w, a, 'lurk'); return; }
      if (people.length) {
        const tgt = moving[0] || people[0]; st.who = tgt.id; a.lookAt = tgt.id;
        if (moving.length) st.still = 0; else st.still = (st.still || 0) + 1;
        if (st.still > 20) { if (st.act !== 'lurk') { L.act(w, a, 'lurk', 'наблюдатель неподвижен — ушёл в темноту'); if ((st.stillSeen = (st.stillSeen || 0) + 1) >= 2 && !a.props.find(p => p.id === 'follows_movement').revealed) a.reveal(w, 'follows_movement', 'наблюдение'); L.addSafe(a, 'неподвижность у окна — объект теряет интерес'); } return; }
        if (st.act === 'lurk' || st.act === 'rush' && V.distXZ(a.agent.pos, { x: st.tx || win.cx, z: win.inZ }) < 0.4) L.act(w, a, 'press', 'подошёл к стеклу, упёрся ладонями');
        if (st.act === 'press' || st.act === 'scratch') {
          st.excite = Math.min(10, (st.excite || 0) + (moving.length ? 0.4 : -0.2));
          if (st.excite > 6 && w.rng.chance(0.25)) { L.act(w, a, 'scratch'); st.glass = Math.max(0, st.glass - 0.25); L.snd(w, a, 'scratch', V.v(a.agent.pos.x, a.agent.pos.y + 1.4, win.z), 0.8, 16); if (w.rng.chance(0.1)) L.log(w, a, 'act', 'царапает стекло; прочность ' + Math.round(st.glass) + '%'); }
          else if (w.rng.chance(0.18)) { L.snd(w, a, 'glass_tap', V.v(a.agent.pos.x, a.agent.pos.y + 1.5, win.z), 0.6, 14); if (st.act === 'scratch') L.act(w, a, 'press'); }
          if (w.rng.chance(0.06)) L.snd(w, a, 'crea_breath', V.v(a.agent.pos.x, a.agent.pos.y + 1.3, win.z), 0.5, 10);
          st.fog = Math.min(1, st.fog + 0.08);
          for (const s of people) L.feel(w, a, s, 0.35, ['Не подходи к стеклу.', 'Он идёт за тобой.', 'Стекло выдержит. Наверное.'][w.rng.int(0, 3)], 0.05);
        }
      } else { st.fog = Math.max(0, st.fog - 0.03); if (st.act !== 'lurk') L.act(w, a, 'lurk', 'в наблюдательной никого — ушёл в темноту'); st.excite = Math.max(0, (st.excite || 0) - 0.5); }
    },
    move(w, a, dt) {
      const st = a.st, win = L.win(w, a), r = L.cell(w, a);
      if (st.act === 'lurk') { L.walk(w, a, r.center.x + Math.sin(w.now * 0.05) * 2, r.minZ + 1.0, 0.6, dt); return; }
      const tp = st.who ? w.posOf(st.who) : null;
      const tx = st.act === 'rush' ? st.tx : tp ? clamp(tp.x, win.x0 + 0.3, win.x1 - 0.3) : win.cx;
      L.walk(w, a, tx, win.inZ, st.act === 'rush' ? 3.2 : 1.8, dt, 0.4); if (st.act !== 'rush' && st.act !== 'lurk') L.face(a, 0, dt * 4);
      st.fog = Math.max(0, (st.fog || 0) - dt * 0.01);
    },
    hourNote: (w, a) => 'стекло ' + Math.round(a.st.glass) + '%',
    status: a => ({ lurk: 'в темноте у задней стены', press: 'у стекла', scratch: 'царапает стекло', rush: 'бросился к окну' }[a.st.act] || '—') + ' · стекло ' + Math.round(a.st.glass || 100) + '%',
    threat: a => 22 + (100 - (a.st.glass == null ? 100 : a.st.glass)) * 0.4 + (a.st.act === 'scratch' ? 8 : 0),
    truthX: (w, a) => ({ motion: a.agent.moving ? 0.9 : 0.1, temp: 26, sound: a.st.act === 'scratch' ? 0.7 : a.st.act === 'press' ? 0.3 : 0.05 }),
    observe(w, a, who, cam) {
      const st = a.st; if (cam) return 'На записи: существо ' + ({ lurk: 'у задней стены', press: 'у окна, ладони на стекле', scratch: 'царапает стекло', rush: 'бежит к окну' }[st.act] || '') + '. Стекло — ' + Math.round(st.glass) + '%.';
      return { lurk: 'В темноте у задней стены что-то ворочается. Два влажных отблеска — глаза.', press: 'Длинные ладони прижаты к стеклу на уровне вашего лица. Челюсть приоткрыта, на стекле запотевают пятна дыхания. Вы шагаете в сторону — оно шагает за вами.', scratch: 'Когти скребут по стеклу. Звук проходит сквозь зубы.', rush: 'Оно бросилось к окну так быстро, что вы отшатнулись.' }[st.act] || 'Темно.';
    },
    experiment(w, a, id, ctx) {
      if (id === 'stand_still') { L.addSafe(a, 'неподвижность у окна — объект теряет интерес через ~20 с'); return { text: 'Пока наблюдатель двигался, объект держался напротив. Через 22 с неподвижности отошёл в темноту.', reveal: ['follows_movement', 'quiet_calms'] }; }
      if (id === 'knock') { const win = L.win(w, a); w.makeNoise('glass_knock', V.v(win.x1 - 0.3, a.agent.pos.y + 1.4, win.z), a.obsRoom, 0.7, ctx.who); return { text: 'На одиночный удар объект бросился к месту стука за 0,8 с и дважды ударил ладонью по стеклу.' }; }
      if (id === 'light') { a.st.blindUntil = w.now + 10; L.addSafe(a, 'прожектор со стороны наблюдательной отгоняет объект'); return { text: 'Прожектор: объект закрыл глаза конечностью и отошёл к задней стене на 10 минут.', reveal: ['light_blind'] }; }
      return { text: '' };
    },
    lifeCheck(w, a, life) {
      const lim = a.rules.glassCheck ? 85 : 65;
      if (a.st.glass < lim && !w.tasks.hasActive('glass_inspect', a.id)) { const d = life.decide('Стекло камеры LF-143', ['прочность ' + Math.round(a.st.glass) + '%', 'царапание за сутки'], 'Осмотр и полировка стекла'); const t = life.assign('glass_inspect', ['containment_engineer', 'technician', 'engineer'], { target: a.id }, 'SCP LIFE', 240, a.obsRoom, { decision: d.id }); if (t) d.assigned = w.nameOf(t.who); }
      if (a.st.glass < 30 && w.alert.level < 2) w.alert.raise(w, 2, 'Стекло камеры LF-143 ниже 30%', a.containRoom);
    }
  }));

  // ================================================================== SCP-LF-144 «Забывающий двигаться»
  const ROUTINE = [{ h: 7, act: 'drink', text: 'тянется к чашке' }, { h: 9, act: 'write', text: 'садится писать' }, { h: 12, act: 'eat', text: 'ест за столом' }, { h: 14, act: 'walk', text: 'идёт к двери' }, { h: 17, act: 'coat', text: 'надевает пальто' }, { h: 22, act: 'lie', text: 'ложится на койку' }];
  def(living({
    id: 'SCP-LF-144', name: 'Забывающий двигаться', cls: 'Безопасный', temper: 'still', room: 'cell144', obs: 'obs144', model: 'frozen', hears: 0,
    attention: { cctvCounts: true, glance: 0.45 },
    desc: 'Мужчина в форме сотрудника Фонда образца 1970-х. «Забывает» двигаться: застывает посреди действия — на полушаге, с поднятой к губам чашкой — и продолжает движение, только когда на него никто не смотрит. Его действия повторяют распорядок дня сотрудника тех лет. При долгом наблюдении начинает дрожать — объект явно испытывает напряжение.',
    contain: 'Сеансы наблюдения не дольше 10 минут. Распорядок объекта не нарушать: приносить еду в 12:00. Разговаривать через интерком спокойно, ответ может прийти через несколько часов.',
    triggers: 'наблюдение (застывает); долгий взгляд (дрожь и стресс)',
    rules: {},
    props: [['progress_unobserved', 'продолжает начатое движение только без наблюдения (включая камеры)'], ['tremor_long_watch', 'наблюдение дольше 10 минут вызывает у него дрожь и стресс', { sessionLimit: 10 }],
      ['routine', 'действия повторяют распорядок сотрудника 1970-х: чай в 7:00, работа, обед в 12:00, уход в 17:00'], ['delayed_answer', 'на вопросы через интерком отвечает спустя часы — когда никто не слушает']],
    exps: [{ id: 'blink_test', name: 'Поочерёдный взгляд', desc: 'Наблюдатели отворачиваются по очереди на 10 секунд.', dur: 15 }, { id: 'routine_log', name: 'Журнал распорядка', desc: 'Сопоставить положения объекта по часам за трое суток.', dur: 10 }, { id: 'talk', name: 'Вопрос через интерком', desc: 'Задать вопрос и оставить запись диктофона.', dur: 10 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x - 1, r.floorY, r.center.z); a.agent.yaw = 90; a.st.frame = 0.3; a.st.task = 'walk'; a.st.tremor = 0; L.act(w, a, 'frozen'); },
    instinct: (w, a, d) => !!(a.st.att && (a.st.att.watched || a.st.att.cctv)) && d.cmd !== 'SPEAK' && d.cmd !== 'REFUSE' && d.cmd !== 'REQUEST_ITEM',
    directive(w, a, d) { if ((d.cmd === 'SLEEP' || d.cmd === 'REST') && a.st.task !== 'lie' && w.clock.night) { a.st.task = 'lie'; a.st.frame = 0.5; L.log(w, a, 'move', 'лёг на койку (решение объекта, без наблюдения)'); } },
    think(w, a, att) {
      const st = a.st, watched = att.watched || att.cctv;
      const due = ROUTINE.slice().reverse().find(x => w.clock.hour >= x.h) || ROUTINE[ROUTINE.length - 1];
      if (due.act !== st.task && !watched) { st.task = due.act; st.frame = 0; L.log(w, a, 'move', 'сменил занятие: ' + due.text); }
      if (watched) {
        st.held = (st.held || 0) + 1; if (st.act !== 'frozen') L.act(w, a, 'frozen');
        if (st.held > 600) { st.tremor = Math.min(1, st.tremor + 0.01); for (const b of att.by) if (b.n) L.feel(w, a, b, 0.2, 'Он дрожит. Может, отвернёмся?', 0.05); if (st.held === 610) { L.log(w, a, 'act', 'дрожь после 10 минут наблюдения'); if (!a.props.find(p => p.id === 'tremor_long_watch').revealed) a.reveal(w, 'tremor_long_watch', 'наблюдение'); } }
        if (a.rules.sessionLimit && st.held > a.rules.sessionLimit * 60 && w.life && w.life.every('lf144lim', 30)) w.life.decide('Процедура LF-144', ['сеанс дольше ' + a.rules.sessionLimit + ' мин'], 'Наблюдателям выйти из наблюдательной');
        return;
      }
      st.held = 0; st.tremor = Math.max(0, st.tremor - 0.05);
      // unobserved: the movement resumes for a moment and freezes again
      if (w.rng.chance(0.25)) { const before = st.frame; st.frame = Math.min(1, st.frame + 0.12 + w.rng.next() * 0.1); L.act(w, a, 'resume'); st.resumeUntil = w.now + 0.3; if (st.frame >= 1) { st.frame = 0.999; } if (Math.floor(before * 4) !== Math.floor(st.frame * 4)) L.log(w, a, 'move', 'продвинулся в движении «' + due.text + '» до ' + Math.round(st.frame * 100) + '%');
        if ((st.prog = (st.prog || 0) + 1) > 12 && !a.props.find(p => p.id === 'progress_unobserved').revealed) a.reveal(w, 'progress_unobserved', 'журнал положений'); }
      else if (st.act === 'resume' && w.now > st.resumeUntil) L.act(w, a, 'frozen');
    },
    move(w, a, dt) {
      const st = a.st, r = L.cell(w, a);
      if (st.act === 'resume' && st.task === 'walk') L.walk(w, a, r.maxX - 1.2, r.center.z, 0.4, dt); else a.agent.moving = false;
    },
    hourNote: (w, a) => 'занятие: ' + (ROUTINE.find(x => x.act === a.st.task) || {}).text + ', ' + Math.round((a.st.frame || 0) * 100) + '%',
    status: a => 'застыл: ' + ((ROUTINE.find(x => x.act === a.st.task) || {}).text || '—') + (a.st.tremor > 0.2 ? ' · дрожит' : ''),
    threat: a => 4,
    truthX: (w, a) => ({ motion: a.st.act === 'resume' ? 0.5 : 0, temp: 36, sound: 0 }),
    observe(w, a, who, cam) {
      const st = a.st, t = (ROUTINE.find(x => x.act === st.task) || {}).text;
      if (cam) return 'На записи: человек застыл — ' + t + '.';
      return 'Он ' + t + ' — и застыл. ' + (st.tremor > 0.3 ? 'Рука, державшая чашку, мелко дрожит; по виску течёт пот.' : 'Ни движения глаз, ни дыхания. Как будто кто-то нажал паузу.');
    },
    experiment(w, a, id) {
      if (id === 'blink_test') return { text: 'Каждый раз, когда все отворачивались, объект продвигался в движении на несколько сантиметров. При любом взгляде — даже через камеру — оставался неподвижным.', reveal: ['progress_unobserved'] };
      if (id === 'routine_log') return { text: 'Положения объекта повторяют распорядок: чай в 7:00, письменный стол, обед в 12:00, к двери в 14:00, пальто в 17:00, койка в 22:00.', reveal: ['routine'] };
      if (id === 'talk') { L.addSafe(a, 'вопросы через интерком — ответ на запись диктофона спустя часы'); return { text: 'Вопрос «Как вас зовут?». Через 5 часов диктофон записал: «…Мартынов. Отдел учёта. Который час?»', reveal: ['delayed_answer'] }; }
      return { text: '' };
    }
  }));

  // ================================================================== SCP-LF-145 «Тихая мать»
  def(living({
    id: 'SCP-LF-145', name: 'Тихая мать', cls: 'Евклид', temper: 'protective', room: 'cell145', obs: 'obs145', model: 'mother', speed: 0.5, hears: 1.3,
    desc: 'Крупное (около 2 м) мягкотелое существо с восемью щупальцами. Ухаживает за четырьмя детёнышами размером с кошку. Почти всё время тихо гудит. Громкий звук или вошедший человек заставляют её собрать детёнышей под себя и поднять щупальца в предупреждающей позе. Изъятие детёныша вызывает многочасовое возбуждение.',
    contain: 'Камера 8×10 м, высота 4,2 м. В блоке соблюдать тишину. Кормление ночью. Смотритель — постоянный, один и тот же. Изъятие детёныша — только по решению комитета по этике.',
    triggers: 'шум; чужие в камере; изъятие или недостача детёнышей',
    rules: {},
    props: [['counts_offspring', 'пересчитывает детёнышей; при недостаче ищет у окна'], ['quiet_rule', 'шум выше порога — защитная поза, детёныши перестают есть', { quietWalk: true }],
      ['feeds_at_night', 'кормит детёнышей ночью'], ['recognizes_caretaker', 'узнаёт постоянного смотрителя — при нём спокойна']],
    exps: [{ id: 'noise', name: 'Порог шума', desc: 'Постепенно повышать громкость звука в камере.', dur: 10 }, { id: 'remove_offspring', name: 'Изъятие детёныша', desc: 'Изъять одного детёныша на 2 часа (решение комитета по этике).', dur: 30 }, { id: 'caretaker', name: 'Смотритель и посторонний', desc: 'В камеру по очереди входят смотритель и посторонний сотрудник.', dur: 15 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x, r.floorY, r.center.z - 1); a.agent.yaw = 0; a.st.young = [0, 1, 2, 3].map(i => ({ x: r.center.x + Math.cos(i * 1.6) * 1.4, z: r.center.z - 1 + Math.sin(i * 1.6) * 1.4, here: true, tx: 0, tz: 0 })); a.st.agit = 0; L.act(w, a, 'tend'); },
    think(w, a, att, heard) {
      const st = a.st, r = L.cell(w, a), loud = heard.reduce((m, h) => Math.max(m, h.loud), 0);
      const missing = st.young.filter(y => !y.here).length;
      const stranger = att.by.find(b => b.kind === 'cell' && L.familiar(a, b.id) < 0.6), caretaker = att.by.find(b => b.kind === 'cell' && L.familiar(a, b.id) >= 0.6);
      if (loud > 0.35 || stranger || missing) {
        st.agit = Math.min(1, st.agit + (missing ? 0.05 : loud > 0.35 ? 0.5 : 0.2)); if (st.act !== 'guard' && st.act !== 'search') { L.act(w, a, missing ? 'search' : 'guard', missing ? 'ищет пропавшего детёныша у окна' : 'собрала детёнышей, подняла щупальца'); if (loud > 0.35) L.log(w, a, 'sound', 'защитная поза на шум (' + loud.toFixed(2) + ')'); }
        if (loud > 0.35 && (st.noiseSeen = (st.noiseSeen || 0) + 1) >= 3 && !a.props.find(p => p.id === 'quiet_rule').revealed) a.reveal(w, 'quiet_rule', 'наблюдение');
        for (const b of att.by) if (b.n) L.feel(w, a, b, 0.4, missing ? 'Она ищет его. Смотрит на нас.' : 'Тише. Тише!', 0.05);
        if (w.rng.chance(0.1)) L.snd(w, a, missing ? 'groan_f' : 'flesh', null, 0.6, 16);
      } else {
        st.agit = Math.max(0, st.agit - 0.006); if (st.agit < 0.2 && st.act !== 'tend' && st.act !== 'feed') L.act(w, a, 'tend', caretaker ? 'смотритель в камере — спокойна' : 'успокоилась, вернулась к детёнышам');
        if (caretaker && !a.props.find(p => p.id === 'recognizes_caretaker').revealed && (st.ct = (st.ct || 0) + 1) > 30) a.reveal(w, 'recognizes_caretaker', 'наблюдение');
        if (L.isNight(w) && st.act === 'tend' && w.rng.chance(0.02)) { L.act(w, a, 'feed', 'кормит детёнышей'); if (!a.props.find(p => p.id === 'feeds_at_night').revealed && (st.fn = (st.fn || 0) + 1) >= 3) a.reveal(w, 'feeds_at_night', 'ночной журнал'); }
        else if (!L.isNight(w) && st.act === 'feed') L.act(w, a, 'tend');
        if (w.rng.chance(0.012)) L.snd(w, a, 'groan_f', null, 0.25, 12);
      }
      if (st.removedUntil && w.now >= st.removedUntil) { st.young.forEach(y => { y.here = true; }); st.removedUntil = 0; L.log(w, a, 'act', 'детёныш возвращён — пересчитала всех четверых'); if (!a.props.find(p => p.id === 'counts_offspring').revealed) a.reveal(w, 'counts_offspring', 'наблюдение'); }
      // offspring wander around her
      for (const y of st.young) if (y.here && w.rng.chance(st.act === 'guard' ? 0.5 : 0.08)) { const ang = w.rng.range(0, Math.PI * 2), rad = st.act === 'guard' ? 0.5 : w.rng.range(0.8, 2.4); y.tx = a.agent.pos.x + Math.cos(ang) * rad; y.tz = a.agent.pos.z + Math.sin(ang) * rad; }
    },
    move(w, a, dt) {
      const st = a.st, win = L.win(w, a), r = L.cell(w, a);
      if (st.act === 'search') L.walk(w, a, win.cx, win.inZ - 0.6, 0.5, dt, 1.0); else if (st.act === 'guard') { a.agent.moving = false; const t = st.who ? w.posOf(st.who) : null; if (t) L.face(a, L.yawTo(a, t), dt); } else L.walk(w, a, r.center.x, r.center.z - 1, 0.3, dt, 1.0);
      for (const y of st.young) { if (!y.here) continue; const dx = y.tx - y.x, dz = y.tz - y.z, d = Math.hypot(dx, dz); if (d > 0.05) { const s = Math.min(d, 0.9 * dt); y.x += dx / d * s; y.z += dz / d * s; y.m = 1; } else y.m = 0; const c = L.clampIn(r, y.x, y.z, 0.4); y.x = c.x; y.z = c.z; }
    },
    hourNote: (w, a) => 'детёнышей ' + a.st.young.filter(y => y.here).length + '/4, возбуждение ' + Math.round(a.st.agit * 100) + '%',
    status: a => ({ tend: 'ухаживает за детёнышами', guard: 'защитная поза', search: 'ищет детёныша', feed: 'кормит детёнышей' }[a.st.act] || '—') + ' · детёнышей ' + ((a.st.young || []).filter(y => y.here).length) + '/4',
    threat: a => 12 + (a.st.agit || 0) * 30,
    truthX: (w, a) => ({ motion: a.agent.moving ? 0.6 : 0.2, temp: 30, sound: 0.15 + (a.st.agit || 0) * 0.4 }),
    observe(w, a, who, cam) {
      const st = a.st; if (cam) return 'На записи: крупное существо ' + ({ tend: 'среди детёнышей', guard: 'над детёнышами, щупальца подняты', search: 'у окна', feed: 'кормит детёнышей' }[st.act] || '') + '.';
      return { tend: 'Она лежит посреди камеры, детёныши копошатся вокруг. Тихий низкий гул, от которого вибрирует стекло. Одно щупальце лениво поправляет отбившегося малыша.', guard: 'Детёныши исчезли под её телом. Щупальца подняты веером. Она смотрит на вас — и гул стал тише, как будто она прислушивается.', search: 'Она у самого стекла, щупальца шарят по нему. Ищет. Детёнышей трое.', feed: 'Она кормит детёнышей — медленно, по очереди.' }[st.act] || '';
    },
    experiment(w, a, id) {
      if (id === 'noise') { a.st.agit = 0.8; L.act(w, a, 'guard'); return { text: 'Порог — около 55 дБ. Выше него — защитная поза и прекращение кормления на 40 минут.', reveal: ['quiet_rule'] }; }
      if (id === 'remove_offspring') { a.st.young[3].here = false; a.st.removedUntil = w.now + 120; a.st.agit = 1; L.act(w, a, 'search', 'детёныш изъят — ищет у окна'); if (w.life) for (const n of w.active.filter(n => n.agent.roomId === a.obsRoom)) n.needs.stress = clamp(n.needs.stress + 15, 0, 100); return { text: 'Детёныш изъят. Объект переместился к окну и не отходил от него, гул усилился. Сотрудники наблюдательной жаловались на чувство вины.', severity: 1 }; }
      if (id === 'caretaker') return { text: 'При смотрителе объект оставался спокойным; при постороннем — защитная поза через 4 секунды.', reveal: ['recognizes_caretaker'] };
      return { text: '' };
    }
  }));

  // ================================================================== SCP-LF-146 «Обратный наблюдатель»
  def(living({
    id: 'SCP-LF-146', name: 'Обратный наблюдатель', cls: 'Евклид', temper: 'watcher', room: 'cell146', obs: 'obs146', model: 'observer', hears: 0,
    attention: { cctvCounts: true, glance: 0.35 },
    desc: 'Фигура с непропорционально большими глазами, всегда обращённая к тому, кто на неё смотрит. Голова поворачивается на 180°, тело — следом. При наблюдении через камеру смотрит точно в объектив. Если смотрят несколько человек — выбирает того, кто смотрит дольше всех. После долгого зрительного контакта у наблюдателя часами сохраняется чувство, что на него смотрят.',
    contain: 'Матовая шторка на окне, открывается только на время сеанса (не дольше 5 минут). Не встречаться взглядом дольше 30 секунд. Пострадавших от «последействия» — к психиатру.',
    triggers: 'любой взгляд (включая камеры); долгий зрительный контакт',
    rules: {},
    props: [['looks_at_camera', 'при наблюдении через камеру смотрит точно в объектив'], ['longest_watcher', 'из нескольких наблюдателей выбирает того, кто смотрит дольше'],
      ['afterimage', 'после долгого контакта взглядом у человека остаётся чувство, что за ним наблюдают', { contactLimit: 30 }], ['blind_spot', 'не видит сквозь матовое стекло — шторка полностью блокирует воздействие', { shutter: true }]],
    exps: [{ id: 'camera', name: 'Камера и человек', desc: 'Сначала наблюдение только через камеру, затем у окна.', dur: 10 }, { id: 'three', name: 'Трое у окна', desc: 'Трое сотрудников смотрят по очереди.', dur: 15 }, { id: 'frosted', name: 'Матовая шторка', desc: 'Закрыть окно матовой шторкой во время контакта.', dur: 5 }],
    setup(w, a) { const r = L.cell(w, a); a.agent.pos = V.v(r.center.x, r.floorY, r.center.z); a.agent.yaw = 180; a.st.head = 0; a.st.shutter = false; L.act(w, a, 'wait'); },
    directive(w, a, d, att) { if (a.st.shutter) return; const inView = id => id === 'cctv' ? w.cams.some(c => c.roomId === a.containRoom) : [a.obsRoom, a.containRoom].indexOf(w.roomOf(id)) >= 0; if ((d.cmd === 'OBSERVE_PERSON' || d.cmd === 'LOOK_AT_TARGET') && d.target && inView(d.target)) { a.st.target = d.target; a.lookAt = d.target === 'cctv' ? null : d.target; L.act(w, a, d.target === 'cctv' ? 'camera' : 'stare'); } else if (d.cmd === 'IGNORE') { a.st.target = null; a.lookAt = null; L.act(w, a, 'wait', 'отвернулся от наблюдателей (решение объекта)'); } },
    think(w, a, att) {
      const st = a.st, cell = L.cell(w, a);
      if (a.rules.shutter && !att.inCell) { const session = H.subjects(w, [a.obsRoom]).some(s => s.n && s.n.job && s.n.job.steps && s.n.job.steps.some(x => !x.done && x.scp === a.id)); st.shutter = !session && !(w.player.roomId === a.obsRoom && w.player.gazeAt === a.id); }
      if (st.shutter) { if (st.act !== 'wait') L.act(w, a, 'wait', 'шторка закрыта — неподвижен'); return; }
      const people = att.by.filter(b => b.kind !== 'cctv');
      if (people.length) {
        st.target = att.top || people[0].id; a.lookAt = st.target; st.contact = (st.contact || 0) + 1; L.act(w, a, 'stare', 'смотрит на ' + w.nameOf(st.target));
        if (people.length >= 2 && !a.props.find(p => p.id === 'longest_watcher').revealed && (st.multi = (st.multi || 0) + 1) > 20) a.reveal(w, 'longest_watcher', 'наблюдение');
        const t = people.find(b => b.id === st.target);
        if (t) { L.feel(w, a, t, 0.25, ['Он смотрит прямо на меня.', 'Не отводи глаза первым… или наоборот?'][w.rng.int(0, 2)], 0.05); if (st.contact > (a.rules.contactLimit || 45) && !w.horror.has(t.id, 'peripheral')) { H.effect(w, a, t.id, { kind: 'peripheral', cause: 'зрительный контакт с ' + a.id, intensity: 0.5, dur: 360, end: { sleep: 0.5, therapy: true }, data: {} }); L.log(w, a, 'act', 'последействие у ' + w.nameOf(t.id) + ' после ' + st.contact + ' с контакта'); if (!a.props.find(p => p.id === 'afterimage').revealed && (st.ai = (st.ai || 0) + 1) >= 2) a.reveal(w, 'afterimage', 'жалобы сотрудников'); st.contact = 0; } }
      } else if (att.cctv) { st.target = 'cctv'; a.lookAt = null; L.act(w, a, 'camera', 'смотрит в объектив камеры'); if ((st.camSeen = (st.camSeen || 0) + 1) > 10 && !a.props.find(p => p.id === 'looks_at_camera').revealed) a.reveal(w, 'looks_at_camera', 'записи камер'); }
      else { st.contact = 0; if (st.act !== 'wait') L.act(w, a, 'wait', 'никто не смотрит — неподвижен'); st.target = null; a.lookAt = null; }
    },
    move(w, a, dt) {
      const st = a.st; a.agent.moving = false;
      let tp = null; if (st.target === 'cctv') { const cam = w.cams.find(c => c.roomId === a.containRoom); tp = cam ? cam.pos : null; } else if (st.target) tp = w.posOf(st.target);
      if (!tp) { st.head += (0 - st.head) * Math.min(1, dt); return; }
      const want = L.yawTo(a, tp), d = S.deltaAngle(a.agent.yaw, want);
      st.head = clamp(d, -180, 180);                     // the head snaps to the target at once — up to 180°
      if (Math.abs(d) > 100) L.face(a, want, dt * 0.25); // the body follows slowly only past 100°
      st.pitch = tp.y != null ? clamp(Math.atan2((tp.y + (st.target === 'cctv' ? 0 : 1.6)) - (a.agent.pos.y + 1.55), Math.max(0.5, V.distXZ(tp, a.agent.pos))) * 57.3, -50, 50) : 0;
    },
    status: a => ({ wait: a.st.shutter ? 'шторка закрыта' : 'неподвижен', stare: 'смотрит на наблюдателя', camera: 'смотрит в камеру' }[a.st.act] || '—'),
    threat: a => a.st.act === 'stare' ? 28 : 12,
    observe(w, a, who, cam) {
      if (a.st.shutter && !cam) return 'Окно закрыто матовой шторкой. За ней — неподвижный силуэт.';
      if (cam) return 'На записи: фигура смотрит прямо в объектив. Глаза занимают пол-лица.';
      return 'Он смотрит на вас. Не на окно — на вас: когда вы делаете шаг, голова поворачивается следом, слишком далеко для человеческой шеи. Моргать он, кажется, не умеет.';
    },
    experiment(w, a, id) {
      if (id === 'camera') return { text: 'Пока шло наблюдение через камеру, объект смотрел в объектив. Как только сотрудник подошёл к окну — голова повернулась к нему за 0,3 с.', reveal: ['looks_at_camera'] };
      if (id === 'three') return { text: 'Из трёх наблюдателей объект каждый раз выбирал того, кто дольше смотрел; переключался через 2–3 секунды после смены лидера.', reveal: ['longest_watcher'] };
      if (id === 'frosted') { a.rules.shutter = true; L.addSafe(a, 'матовая шторка на окне полностью блокирует воздействие'); return { text: 'С закрытой шторкой объект оставался неподвижным, последействия не возникло.', reveal: ['blind_spot'] }; }
      return { text: '' };
    }
  }));

  // ------------------------------------------------------------------ duties for the wing (maintenance of glass and vent grille)
  if (S.Jobs && S.Jobs.K) {
    const st = (room, poiType, label, dur, extra) => Object.assign({ room, poiType: poiType || null, poi: null, label, dur: dur || 5, done: false }, extra || {});
    S.Jobs.K('glass_inspect', { act: 'Maintenance', title: 'Осмотр стекла камеры', build(w, who, o) { const a = w.anomaly(o.target); if (!a) return null; return [st(a.obsRoom, 'Console', 'Осмотреть и отполировать стекло ' + a.id, 20, { need: 'hold', scp: a.id })]; },
      done(w, who, t) { const a = w.anomaly(t.steps[0].scp); if (a) { a.st.glass = Math.min(100, (a.st.glass || 100) + 45); L.log(w, a, 'act', 'стекло осмотрено и отполировано: ' + Math.round(a.st.glass) + '%'); } return 'стекло в порядке'; } });
    S.Jobs.K('mesh_repair', { act: 'Maintenance', title: 'Замена решётки вентиляции', build(w, who, o) { const a = w.anomaly(o.target); if (!a) return null; return [st(a.obsRoom, 'Console', 'Заменить секцию решётки ' + a.id + ' (со стороны короба)', 25, { need: 'hold', scp: a.id })]; },
      done(w, who, t) { const a = w.anomaly(t.steps[0].scp); if (a) { a.st.mesh = 100; L.log(w, a, 'act', 'секция решётки заменена'); } return 'решётка заменена'; } });
  }

  // knock on a window of the wing (player or NPC); creatures that hear react
  L.knock = (w, who, scpId) => {
    const a = w.anomaly(scpId); if (!a) return null; const win = L.win(w, a), r = L.cell(w, a), p = who === 'player' ? w.player.pos : (w.npc(who) || {}).agent.pos;
    const pos = V.v(clamp(p.x, win.x0, win.x1), r.floorY + 1.4, win.z + 0.1);
    w.makeNoise('glass_knock', pos, a.obsRoom, 0.6, who); if (w.sounds.length < 80) w.sounds.push({ t: w.now, kind: 'glass_tap', pos, roomId: a.obsRoom, vol: 0.8, range: 16 });
    return pos;
  };
  S.Living = L;
})(typeof window !== 'undefined' ? window : globalThis);
