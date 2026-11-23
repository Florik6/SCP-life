/* SCP LIFE — CRISIS: weapons and protective gear by role, ballistics (walls, line of fire, armour), rules of engagement
   (threat verification, friend recognition, warnings, surrender, friendly-fire risk), accountability for the use of force,
   the security response AI and the Mobile Task Force «Ключ-9» as an organisation (base, roster, readiness, operations). */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, EV, fmtStamp } = S;

  const W = {
    pistol: { name: 'Служебный пистолет', short: 'ПИСТОЛЕТ', model: 'pistol', sound: 'gun_pistol', kind: 'gunshot', dmg: 30, mag: 15, spare: 3, reload: 2.2, rate: 0.3, range: 32, spread: 2.2, lethal: true, hands: 1 },
    carbine: { name: 'Карабин', short: 'КАРАБИН', model: 'carbine', sound: 'gun_carbine', kind: 'gunshot', dmg: 38, mag: 30, spare: 3, reload: 2.8, rate: 0.16, range: 60, spread: 1.1, lethal: true, hands: 2 },
    smg: { name: 'Пистолет-пулемёт', short: 'ПП', model: 'smg', sound: 'gun_smg', kind: 'gunshot', dmg: 24, mag: 30, spare: 3, reload: 2.4, rate: 0.09, range: 28, spread: 2.6, lethal: true, hands: 2 },
    shotgun: { name: 'Помповое ружьё', short: 'РУЖЬЁ', model: 'shotgun', sound: 'gun_shotgun', kind: 'gunshot', dmg: 11, pellets: 8, mag: 6, spare: 18, perShell: true, reload: 0.65, rate: 0.95, range: 16, spread: 6, lethal: true, hands: 2 },
    taser: { name: 'Электрошокер', short: 'ШОКЕР', model: 'taser', sound: 'spark', kind: 'nonlethal', dmg: 3, ko: 3, mag: 1, spare: 3, reload: 2.5, rate: 1.2, range: 6, spread: 3, lethal: false, hands: 1 },
    baton: { name: 'Резиновая дубинка', short: 'ДУБИНКА', model: 'baton', sound: 'metal_hit', kind: 'blunt', dmg: 10, melee: true, range: 1.7, rate: 0.9, lethal: false, hands: 1 }
  };
  const GEAR = { vest: { name: 'бронежилет', armor: 0.45 }, armor: { name: 'бронекостюм МОГ', armor: 0.65 }, helmet: { name: 'шлем', armor: 0.1 }, radio: { name: 'рация' }, radio_cmd: { name: 'командная рация' }, flashlight: { name: 'фонарь' }, medkit: { name: 'аптечка полевого медика' }, restraints: { name: 'наручники' }, kit: { name: 'набор повторного содержания' } };
  // only those whose duty needs it carry anything; escorts next to class D carry no firearm
  const LOADOUT = {
    guard: ['pistol', 'baton', '+vest', '+radio', '+flashlight', '+restraints'], patrol: ['pistol', 'taser', '+vest', '+radio', '+flashlight', '+restraints'],
    escort: ['taser', 'baton', '+vest', '+radio', '+restraints'], security_officer: ['pistol', '+radio', '+restraints'], shift_chief: ['pistol', '+radio_cmd'], armorer: ['pistol', '+radio'],
    cctv_operator: ['+radio'], operative: ['carbine', 'pistol', '+armor', '+helmet', '+radio_cmd', '+flashlight', '+kit', '+restraints'],
    field_medic: ['smg', '+armor', '+helmet', '+radio_cmd', '+medkit'], mtf_commander: ['carbine', 'pistol', '+armor', '+helmet', '+radio_cmd', '+kit']
  };
  const pick = (w, a) => a[w.rng.int(0, a.length)];
  const person = (w, id) => id === 'player' ? w.player : w.npc(id);
  const isP = (w, x) => x === w.player;
  const posOf = (w, x) => isP(w, x) ? x.pos : x.agent.pos;
  const roomOf = (w, x) => isP(w, x) ? x.roomId : x.agent.roomId;
  const nameOf = (w, x) => isP(w, x) ? x.name : x.displayName;
  const alive = (w, x) => x && !x.dead && !(x.incap ? x.incap(w.now) : (x.unconUntil || 0) > w.now);

  // ---------------------------------------------------------------- state
  function A(w) { return w.arms || (w.arms = { log: [], fx: [], threats: {}, t: 0, nextId: 1, armory: { pistol: 40, carbine: 18, smg: 8, shotgun: 6, taser: 16 } }); }
  function kit(w, x, force) {
    if (!x) return null; if (x.kit && !force) return x.kit;
    const L = LOADOUT[x.prof] || [], k = { weapons: [], gear: [], ammo: {}, spare: {}, cur: null, drawn: false, reloadUntil: 0, nextShot: 0, warned: {}, shots: 0, hits: 0, withdrawn: false };
    for (const it of L) { if (it[0] === '+') k.gear.push(it.slice(1)); else { k.weapons.push(it); const wp = W[it]; if (!wp.melee) { k.ammo[it] = wp.mag; k.spare[it] = wp.spare; } } }
    k.cur = k.weapons[0] || null; x.kit = k; return k;
  }
  const armor = x => { const k = x.kit; if (!k) return 0; let a = 0; for (const g of k.gear) a = Math.max(a, (GEAR[g] || {}).armor || 0); if (k.gear.indexOf('helmet') >= 0) a += 0.05; return clamp(a, 0, 0.75); };
  // training: MTF best, security good, the rest poor; fear and fatigue make it worse
  function skill(w, x) {
    const d = x.dept || (S.Professions.get(x.prof) || {}).dept, base = d === 'mtf' ? 0.85 : d === 'security' ? 0.66 : 0.3;
    const bravery = x.traits ? x.traits.bravery : 0.6; return clamp(base + (bravery - 0.5) * 0.15 - (x.psy ? x.psy.fear / 400 + x.psy.fatigue / 600 : 0), 0.1, 0.95);
  }

  // ---------------------------------------------------------------- ballistics
  // a point is open air if it is inside a room on that level or inside an open doorway
  function open(w, p, lvlY) {
    for (const r of w.fac.roomList) if (Math.abs(r.floorY - lvlY) < 1.5 && p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) { if (p.y > r.floorY - 0.05 && p.y < r.floorY + r.height) return true; }
    for (const d of w.fac.doorList) { if (d.isTransit || !d.passable || Math.abs(d.pos.y - lvlY) > 1.5) continue; const lat = d.alongX ? Math.abs(p.z - d.pos.z) : Math.abs(p.x - d.pos.x), lon = d.alongX ? Math.abs(p.x - d.pos.x) : Math.abs(p.z - d.pos.z); if (lat < d.width / 2 && lon < 0.45 && p.y < lvlY + (d.height || 2.4)) return true; }
    return false;
  }
  function bodies(w, ex, lvlY) {
    const out = [];
    for (const n of w.active) { if (n.id === ex || n.dead || n.agent.transitT > 0 || !n.agent.roomId || Math.abs(n.agent.pos.y - lvlY) > 2) continue; const down = n.incap(w.now); out.push({ id: n.id, p: n.agent.pos, r: n.agent.radius || 0.28, h: down ? 0.45 : 1.75 }); }
    const p = w.player; if (ex !== 'player' && !p.dead && p.roomId && Math.abs(p.pos.y - lvlY) < 2) out.push({ id: 'player', p: p.pos, r: 0.3, h: 1.75 });
    for (const a of w.anomalies) if (a.arrived && a.agent.roomId && Math.abs(a.agent.pos.y - lvlY) < 2) out.push({ id: a.id, p: a.agent.pos, r: a.def.radius || 0.5, h: a.def.height || 1.8, anomaly: true });
    return out;
  }
  // trace one bullet: returns { id (who was hit) or null, at: point }
  function trace(w, from, dir, range, ex) {
    const lvlY = w.fac.roomAt(from) ? w.fac.roomAt(from).floorY : Math.round(from.y), B = bodies(w, ex, lvlY);
    let wallT = range;
    for (let t = 0.3; t < range; t += 0.2) { const q = { x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t }; if (!open(w, q, lvlY)) { wallT = t; break; } }
    let best = null, bt = wallT;
    for (const b of B) {
      const ox = b.p.x - from.x, oz = b.p.z - from.z, hl = Math.hypot(dir.x, dir.z) || 1e-6, ux = dir.x / hl, uz = dir.z / hl, along = ox * ux + oz * uz;
      if (along <= 0.15 || along >= bt / Math.max(1e-6, hl) * hl) continue;
      const tt = along / hl, perp = Math.abs(ox * uz - oz * ux), y = from.y + dir.y * tt;
      if (perp < b.r && y > b.p.y && y < b.p.y + b.h && tt < bt) { bt = tt; best = b; }
    }
    return { id: best ? best.id : null, anomaly: !!(best && best.anomaly), at: { x: from.x + dir.x * bt, y: from.y + dir.y * bt, z: from.z + dir.z * bt }, wall: !best && bt < range };
  }
  const eye = (w, x) => { const p = posOf(w, x); return { x: p.x, y: p.y + 1.45, z: p.z }; };
  function aimDir(w, from, to, spreadDeg) {
    let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const s = spreadDeg * Math.PI / 180, a1 = (w.rng.next() * 2 - 1) * s, a2 = (w.rng.next() * 2 - 1) * s * 0.6;
    const c = Math.cos(a1), sn = Math.sin(a1); let nx = dx * c - dz * sn, nz = dx * sn + dz * c; return { x: nx, y: dy + a2, z: nz };
  }

  // ---------------------------------------------------------------- firing
  // aim: a point (player: where the crosshair points) or a target id; returns what happened
  function fire(w, sid, aim, o) {
    o = o || {}; const x = person(w, sid); if (!alive(w, x)) return null; const k = kit(w, x), id = k.cur, wp = W[id], rt = w.realTime;
    if (!wp || !k.drawn || k.reloadUntil > rt || k.nextShot > rt) return null;
    if (!wp.melee && k.ammo[id] <= 0) { k.nextShot = rt + 0.3; w.sounds.push({ t: w.now, kind: 'dryfire', roomId: roomOf(w, x), pos: V.copy(posOf(w, x)), who: sid }); if (!isP(w, x)) reload(w, x); return 'empty'; }
    k.nextShot = rt + wp.rate; if (!wp.melee) k.ammo[id]--; k.shots++;
    const from = eye(w, x), tgtId = typeof aim === 'string' ? aim : null, tp = tgtId ? aimPoint(w, tgtId) : aim; if (!tp) return null;
    const roomId = roomOf(w, x), results = [];
    if (wp.melee) {
      const t = tgtId ? person(w, tgtId) : null; if (t && V.distXZ(posOf(w, t), posOf(w, x)) <= wp.range) results.push({ id: tgtId, at: V.copy(posOf(w, t)) });
      w.sounds.push({ t: w.now, kind: 'swing', roomId, pos: V.copy(from), who: sid });
    } else {
      const sp = isP(w, x) ? wp.spread * (0.45 + (x.psy.fear || 0) / 250) : wp.spread * (1.6 - skill(w, x)) * (x.agent.moving ? 1.4 : 1);
      for (let i = 0; i < (wp.pellets || 1); i++) results.push(trace(w, from, aimDir(w, from, tp, sp), wp.range, sid));
      w.sounds.push({ t: w.now, kind: 'gunshot', weapon: id, roomId, pos: V.copy(from), who: sid }); w.makeNoise('gunshot', from, roomId, id === 'taser' ? 0.3 : 1, sid);
    }
    const ar = A(w), hits = {};
    for (const r of results) {
      ar.fx.push({ t: rt, kind: wp.melee ? 'melee' : 'shot', weapon: id, from: V.copy(from), to: r.at, hit: r.id ? (r.anomaly ? 'anomaly' : 'body') : r.wall ? 'wall' : 'air', by: sid });
      if (r.id) hits[r.id] = (hits[r.id] || 0) + 1;
    }
    if (ar.fx.length > 60) ar.fx.splice(0, ar.fx.length - 60);
    const justified = judge(w, x, tgtId || Object.keys(hits)[0] || null, id);
    for (const hid in hits) {
      k.hits++; const a = w.anomaly(hid);
      if (a) { hitAnomaly(w, a, wp.dmg * hits[hid], sid, id); continue; }
      const t = person(w, hid); if (!t || t.dead) continue; const prot = wp.kind === 'gunshot' ? armor(t) : 0;
      const dmg = wp.dmg * hits[hid] * (1 - prot) * (o.dmgMul || 1);
      S.Med.hurt(w, hid, dmg, wp.kind, sid, nameOf(w, x) + ': ' + wp.name.toLowerCase() + (prot ? ' (броня поглотила часть)' : ''), wp.ko ? { ko: wp.ko + w.rng.range(0, 2) } : null);
      if (hid !== tgtId && tgtId) friendlyFire(w, x, t, id);
    }
    if (!justified.ok) unjustified(w, x, tgtId || Object.keys(hits)[0] || null, id, justified.why);
    log(w, x, tgtId, id, Object.keys(hits), justified);
    return { hits: Object.keys(hits), justified: justified.ok };
  }
  function aimPoint(w, id) { const a = w.anomaly(id); if (a) return { x: a.agent.pos.x, y: a.agent.pos.y + (a.def.height || 1.6) * 0.6, z: a.agent.pos.z }; const x = person(w, id); if (!x) return null; const p = posOf(w, x), down = x.incap ? x.incap(w.now) : false; return { x: p.x, y: p.y + (down ? 0.25 : 1.25), z: p.z }; }
  function reload(w, x) {
    const k = kit(w, x), id = k.cur, wp = W[id]; if (!wp || wp.melee || k.reloadUntil > w.realTime) return false;
    if (k.ammo[id] >= wp.mag || k.spare[id] <= 0) return false;
    const dur = wp.perShell ? wp.reload * Math.min(wp.mag - k.ammo[id], k.spare[id]) : wp.reload; k.reloadUntil = w.realTime + dur * (isP(w, x) ? 1 : 1.15);
    if (wp.perShell) { const n = Math.min(wp.mag - k.ammo[id], k.spare[id]); k.ammo[id] += n; k.spare[id] -= n; } else { k.ammo[id] = wp.mag; k.spare[id]--; }
    w.sounds.push({ t: w.now, kind: 'reload', weapon: id, roomId: roomOf(w, x), pos: V.copy(posOf(w, x)), who: x.id, dur });
    return true;
  }
  function draw(w, x, id) { const k = kit(w, x); if (!k.weapons.length) return false; if (id && k.weapons.indexOf(id) >= 0) k.cur = id; if (!k.cur) k.cur = k.weapons[0]; if (!k.drawn) { k.drawn = true; k.nextShot = w.realTime + 0.45; w.sounds.push({ t: w.now, kind: 'draw', roomId: roomOf(w, x), pos: V.copy(posOf(w, x)), who: x.id }); } return true; }
  function holster(w, x) { const k = kit(w, x); if (k.drawn) { k.drawn = false; w.sounds.push({ t: w.now, kind: 'holster', roomId: roomOf(w, x), pos: V.copy(posOf(w, x)), who: x.id }); } }
  // bullets: some objects do not care (stage notes in their definitions: def.bullets = 'none' | 'stagger' | 'harm')
  function hitAnomaly(w, a, dmg, by, wid) {
    const how = a.def.bullets || (a.def.temper === 'aggressive' ? 'stagger' : 'none');
    a.st = a.st || {}; a.st.shotAt = w.now; a.st.shotBy = by;
    if (how === 'harm') { a.hp = (a.hp == null ? (a.def.hp || 120) : a.hp) - dmg; if (a.def.onHarm) a.def.onHarm(w, a, dmg, by); if (a.hp <= 0 && a.def.onDown) a.def.onDown(w, a, by); }
    else if (how === 'stagger') { a.staggerUntil = w.realTime + 1.2; if (a.def.onShot) a.def.onShot(w, a, by); }
    else if (a.def.onShot) a.def.onShot(w, a, by);
    a.lastShotEffect = how;
  }

  // ---------------------------------------------------------------- rules of engagement and accountability
  function hostile(w, id) { const t = A(w).threats[id]; return t && t.verified && w.now - t.seen < 30 ? t : null; }
  // may this person use force against the target, which kind, and is a warning needed first?
  function roe(w, x, tid, wid) {
    if (!tid) return { ok: false, why: 'нет цели' };
    const a = w.anomaly(tid);
    if (a) { const loose = !a.contained || a.breached; return loose ? { ok: true, lethal: true, warn: false, why: 'объект вне камеры' } : { ok: false, why: 'объект содержится' }; }
    const t = person(w, tid); if (!t || t.dead) return { ok: false, why: 'цели нет' };
    if (t.surrenderUntil > w.now) return { ok: false, why: 'цель сдалась' };
    const th = hostile(w, tid), lethal = W[wid] ? W[wid].lethal : true;
    if (!th) return { ok: false, why: t.role === 'DClass' || tid === 'player' ? 'угроза не подтверждена' : 'свой сотрудник, угрозы нет' };
    const imminent = th.attacking && w.now - th.attacking < 0.5;            // attacking right now: no time for a warning
    if (th.level < 2 && lethal) return { ok: false, why: 'для этой угрозы — только спецсредства', nonlethal: true, warn: !imminent };
    const warned = x.kit && x.kit.warned[tid] && w.realTime - x.kit.warned[tid] > 3.5;
    return { ok: imminent || warned || th.armed, lethal: th.level >= 2, warn: !imminent && !warned && !th.armed, why: th.why };
  }
  function judge(w, x, tid, wid) {
    if (!tid) return { ok: !isP(w, x) || !!A(w).lastThreat, why: 'выстрел без цели' };
    const tt = person(w, tid); if (tt && tt.dead && w.now - (tt.deathAt || 0) < 1) return { ok: true, why: 'цель уже поражена (избыточный огонь)' };
    const r = roe(w, x, tid, wid); if (r.ok || r.nonlethal && !W[wid].lethal) return { ok: true, why: r.why };
    return { ok: false, why: r.why };
  }
  function warn(w, x, tid) {
    const k = kit(w, x); if (k.warned[tid] && w.realTime - k.warned[tid] < 6) return; k.warned[tid] = w.realTime;
    const t = person(w, tid); if (!t) return;
    if (!isP(w, x)) x.say(pick(w, t.role === 'DClass' ? ['Стоять! Руки за голову! На колени!', 'Лечь на пол! Немедленно!', 'Последнее предупреждение! На пол!'] : ['Стоять! Охрана! Бросить всё!', 'Руки вверх! Не двигаться!']), w.now);
    if (isP(w, t)) return;
    // the warned decides: surrender, freeze, or keep going (fear, temper and how far it already went)
    const comply = clamp((t.compliance == null ? 0.6 : t.compliance) + t.psy.fear / 200 - (t.traits.temper || 0.4) * 0.3 - (t.riotUntil > w.now ? 0.15 : 0), 0.05, 0.95);
    if (w.rng.chance(comply)) surrender(w, t, x);
  }
  function surrender(w, t, by) {
    t.surrenderUntil = w.now + 30; t.hostileUntil = 0; t.riotUntil = 0; t.agent.clear(); t.posture = 'Cowering'; t.nextThink = 0;
    t.say(pick(w, ['Всё, всё! Сдаюсь!', 'Не стреляйте!', 'Я на полу, я на полу!']), w.now);
    const th = A(w).threats[t.id]; if (th) th.verified = false;
    w.events.post({ time: w.now, type: EV.Report, roomId: t.agent.roomId, actor: by.id, target: t.id, severity: 1, text: t.displayName + ' сдался охране (' + nameOf(w, by) + ').' });
    if (w.life) w.life.assign('detain', ['guard', 'escort', 'security_officer'], { target: t.id, patient: t.id }, 'Служба безопасности', 60, t.agent.roomId, { npcOnly: true });
  }
  function friendlyFire(w, x, victim, wid) {
    S.Incident.open(w, 'friendly_fire', 'Попадание в своего: ' + nameOf(w, victim), roomOf(w, victim), { participants: [x.id, victim.id], causes: ['линия огня перекрыта, ' + W[wid].name.toLowerCase()] });
    if (!isP(w, x)) x.say(pick(w, ['Нет! Свой, свой!', 'Чёрт, задел своего!']), w.now);
  }
  function unjustified(w, x, tid, wid, why) {
    const t = tid ? person(w, tid) : null, rep = S.Incident.open(w, 'force', 'Необоснованное применение силы: ' + nameOf(w, x), roomOf(w, x), { participants: [x.id].concat(tid ? [tid] : []), causes: [W[wid].name + ' — ' + why] });
    // whoever fires without cause becomes a threat to the others
    const ar = A(w), lvl = W[wid].lethal ? 2 : 1;
    if (t || W[wid].lethal) ar.threats[x.id] = { id: x.id, kind: 'armed', level: lvl, verified: true, seen: w.now, since: w.now, room: roomOf(w, x), why: 'стрельба без оснований', armed: W[wid].lethal };
    if (w.life) w.life.openCase('force', 'Применение силы: ' + nameOf(w, x), roomOf(w, x), { cause: 'person', culprit: x.id, victim: tid });
    if (isP(w, x)) { x.reprimands = (x.reprimands || 0) + 1; x.addRep && x.addRep('security', -15); x.addJournal('[' + fmtStamp(w.now) + '] Применение оружия без оснований (' + why + '). Начато служебное расследование.'); }
    else { x.reprimands++; const k = kit(w, x); if (x.reprimands >= 2 && !k.withdrawn) { k.withdrawn = true; k.weapons = k.weapons.filter(i => !W[i].lethal); k.cur = k.weapons[0] || null; S.Incident.add(w, rep.id, 'decisions', 'оружие изъято у ' + x.displayName); } x.addHistory(w.now, 'Применил оружие без оснований: ' + why, 'discipline'); }
  }
  function log(w, x, tid, wid, hits, j) { const ar = A(w); ar.log.push({ t: w.now, by: x.id, w: wid, target: tid, hits, ok: j.ok, why: j.why }); if (ar.log.length > 300) ar.log.splice(0, ar.log.length - 300); }

  // ---------------------------------------------------------------- threats and the security response
  function markHostile(w, id, o) {
    const ar = A(w), t = ar.threats[id] || (ar.threats[id] = { id, since: w.now, level: 1, verified: false });
    Object.assign(t, o || {}); t.seen = w.now; if (o && o.attacking) t.attacking = w.now; return t;
  }
  function refreshThreats(w) {
    const ar = A(w), now = w.now;
    for (const a of w.anomalies) {
      if (!a.arrived) continue; const loose = !a.contained || a.breached;
      if (loose) { const t = markHostile(w, a.id, { kind: 'anomaly', room: a.agent.roomId, verified: true, level: a.def.temper === 'aggressive' ? 3 : 2, why: 'нарушение содержания ' + a.id }); t.pos = V.copy(a.agent.pos); }
      else if (ar.threats[a.id]) delete ar.threats[a.id];
    }
    for (const n of w.active) if (n.hostileUntil > now && !n.dead) { const t = markHostile(w, n.id, { kind: n.role === 'DClass' ? 'riot' : 'person', room: n.agent.roomId, verified: true, level: n.armedHostile ? 2 : 1, why: n.hostileWhy || 'нападение на людей', armed: !!n.armedHostile }); t.pos = V.copy(n.agent.pos); }
    for (const id in ar.threats) { const t = ar.threats[id], x = person(w, id); if ((x && (x.dead || (x.surrenderUntil || 0) > now)) || now - t.seen > 30) delete ar.threats[id]; }
    ar.lastThreat = Object.keys(ar.threats).length ? now : ar.lastThreat;
  }
  // responders by proximity and training; nobody stands idle: those who will not engage cordon the doors or evacuate
  function respond(w) {
    const ar = A(w), now = w.now;
    for (const id in ar.threats) {
      const t = ar.threats[id]; if (!t.verified || (t.dispatched && now - t.dispatched < 10)) continue; t.dispatched = now;
      const need = t.level >= 3 ? 5 : t.level === 2 ? 3 : 2, have = w.active.filter(n => n.combat && n.combat.threat === id && !n.dead).length; if (have >= need) continue;
      const cands = w.active.filter(n => !n.dead && !n.incap(now) && !n.combat && (n.dept === 'security' || n.dept === 'mtf') && kit(w, n).weapons.length && n.onSite && n.agent.roomId)
        .map(n => ({ n, d: w.fac.roomDistance(n.agent.roomId, t.room) })).filter(c => c.d < 12).sort((a, b) => a.d - b.d).slice(0, need - have);
      for (const { n } of cands) {
        const brave = n.traits.bravery + (n.dept === 'mtf' ? 0.3 : 0) - n.psy.fear / 150, role = t.level >= 3 && brave < 0.45 ? 'cordon' : 'engage';
        n.combat = { threat: id, role, since: now }; n.activity = 'Respond'; n.targetRoom = t.room; n.label = (role === 'engage' ? 'Реагирование: ' : 'Оцепление: ') + w.roomName(t.room); n.arrived = false; n.nextThink = 0; n.job = null; n.agent.clear();
        n.say(role === 'engage' ? pick(w, ['Выдвигаюсь.', 'Принял, иду.', 'Иду на сигнал.']) : pick(w, ['Перекрываю проход.', 'Держу дверь.']), now);
      }
      if (t.level >= 2 && MTF.can(w) && !MTF.busyWith(w, id)) MTF.dispatch(w, t.kind === 'anomaly' ? 'recontain' : 'assist', id, t.room, t.why);
    }
  }
  // one tick of an armed NPC in a confrontation; returns true when it took over the body this tick
  function npcTick(w, n, dt) {
    const c = n.combat; if (!c || n.dead) return false; const now = w.now, ar = A(w), t = ar.threats[c.threat];
    if (!t || now - c.since > 90) { n.combat = null; holster(w, n); n.nextThink = 0; return false; }
    const tgt = w.anomaly(c.threat) || person(w, c.threat); if (!tgt) { n.combat = null; return false; }
    const tp = w.anomaly(c.threat) ? tgt.agent.pos : posOf(w, tgt), tr = w.anomaly(c.threat) ? tgt.agent.roomId : roomOf(w, tgt);
    // a person who is down is no longer a threat: stop, cuff, take to detention — never beat someone on the ground
    if (!w.anomaly(c.threat) && !isP(w, tgt) && (tgt.dead || tgt.incap(now))) {
      delete ar.threats[c.threat]; n.combat = null; holster(w, n); n.nextThink = 0;
      if (!tgt.dead) { tgt.hostileUntil = 0; tgt.riotUntil = 0; n.say(pick(w, ['Готов. Наручники.', 'Обездвижен. Медиков и конвой.']), now); if (w.life && !w.tasks.hasActive('detain', tgt.id)) w.life.assign('detain', ['guard', 'escort', 'security_officer'], { target: tgt.id, patient: tgt.id }, 'Служба безопасности', 60, tgt.agent.roomId, { npcOnly: true }); }
      return false;
    }
    if (n.targetRoom !== tr && !n.agent.hasPath) { n.targetRoom = tr; n.arrived = false; n.nextThink = 0; }
    const room = w.fac.room(n.agent.roomId), sees = room && (room.id === tr || room.canSeeInto(tr)) && V.distXZ(n.agent.pos, tp) < 26 && Math.abs(n.agent.pos.y - tp.y) < 2;
    if (!sees) return false;
    const k = kit(w, n), d = V.distXZ(n.agent.pos, tp);
    if (c.role === 'cordon') { if (d < 8) { n.agent.clear(); w.faceTowards(n.agent, tp, dt); draw(w, n); if (!n.agent.hasPath && w.rng.chance(0.02)) n.say(pick(w, ['Назад! Всем назад!', 'Проход закрыт!']), now); return true; } return false; }
    // fear: someone weak against something bullets do not stop backs off and calls for help instead of freezing
    if (tgt.lastShotEffect === 'none' && n.dept !== 'mtf' && k.shots > 6) { c.role = 'cordon'; n.say('Пули не действуют! Нужен МОГ!', now); if (MTF.can(w)) MTF.dispatch(w, 'recontain', c.threat, tr, 'оружие охраны неэффективно'); return false; }
    // choose the means: non-lethal first against people when allowed
    const human = !w.anomaly(c.threat), r0 = roe(w, n, c.threat, k.cur);
    if (human && k.weapons.length > 1) {
      const inReach = k.weapons.find(i => !W[i].lethal && (W[i].melee ? d < 1.6 : d < W[i].range)), anyNl = k.weapons.find(i => !W[i].lethal);
      if (r0.nonlethal || !r0.lethal) { if (inReach || anyNl) k.cur = inReach || k.weapons.find(i => !W[i].lethal && !W[i].melee) || anyNl; }
      else if (r0.lethal) k.cur = k.weapons.find(i => W[i].lethal) || k.cur;
    }
    draw(w, n);
    const r = roe(w, n, c.threat, k.cur), wp = W[k.cur]; if (!wp) return true;
    // closing in for a baton: walk to them (the path is refreshed as they move)
    if (wp.melee && d > 1.4 && (r.ok || !r.warn)) { c.chaseT = (c.chaseT || 0) - dt; if (c.chaseT <= 0 || !n.agent.hasPath) { c.chaseT = 1; n.agent.setPath([w.fac.nearestNode(n.agent.pos, n.agent.roomId)]); n.agent.final = { x: tp.x, z: tp.z }; } return false; }
    n.agent.clear(); w.faceTowards(n.agent, tp, dt * 2); n.posture = 'Standing';
    if (r.warn) { warn(w, n, c.threat); return true; }
    if (!r.ok) return true;
    if (!wp.melee && d > wp.range) return false;
    if (!wp.melee && k.ammo[k.cur] <= 0) { if (!reload(w, n) && k.weapons.length > 1) k.cur = k.weapons.find(i => i !== k.cur); return true; }
    // a colleague in the line of fire: trained people hold, the rest risk it
    if (!wp.melee && blocked(w, n, tp, c.threat) && w.rng.chance(skill(w, n))) { if (w.rng.chance(0.05)) n.say('Линия огня! Отойди!', now); return true; }
    const res = fire(w, n.id, c.threat);
    // pain and fear break resistance: someone hit with non-lethal means often gives up
    if (res && human && !wp.lethal && res.hits.indexOf(c.threat) >= 0 && !tgt.dead && !isP(w, tgt) && w.rng.chance(clamp(tgt.psy.fear / 140 - (tgt.traits.temper || 0.4) * 0.2, 0.05, 0.8))) surrender(w, tgt, n);
    return true;
  }
  function blocked(w, n, tp, tid) {
    const from = n.agent.pos, dx = tp.x - from.x, dz = tp.z - from.z, L = Math.hypot(dx, dz) || 1;
    for (const o of w.active) { if (o === n || o.id === tid || o.dead || o.agent.roomId == null) continue; const ox = o.agent.pos.x - from.x, oz = o.agent.pos.z - from.z, al = (ox * dx + oz * dz) / L; if (al < 0.3 || al > L - 0.3) continue; if (Math.abs(ox * dz - oz * dx) / L < 0.5) return true; }
    return false;
  }

  // ---------------------------------------------------------------- MTF «Ключ-9» as an organisation
  const MTF = {
    S(w) { const ar = A(w); return ar.mtf || (ar.mtf = { name: 'МОГ «Ключ-9»', readiness: 85, ammo: 100, kits: 6, state: 'standby', op: null, ops: [], cd: 0 }); },
    roster(w) { return w.npcs.filter(n => n.dept === 'mtf' && !n.dead && !n.played); },
    can(w) { const m = MTF.S(w); return m.state === 'standby' && m.readiness >= 30 && w.now >= m.cd && MTF.available(w).length >= 2; },
    busyWith(w, id) { const m = MTF.S(w); return m.op && m.op.target === id; },
    available(w) { return w.active.filter(n => n.dept === 'mtf' && !n.dead && !n.incap(w.now) && !n.isSick(w.now) && n.agent.roomId); },
    // tasks: sweep, protect, evacuate, assist security, localize a sector, re-contain an object
    dispatch(w, task, target, room, why) {
      const m = MTF.S(w); if (m.state !== 'standby') return null;
      const av = MTF.available(w), lead = av.find(n => n.prof === 'mtf_commander') || av.find(n => n.prof === 'operative'); if (!lead) return null;
      const squad = [lead].concat(av.filter(n => n !== lead && n.prof === 'operative').slice(0, 3)).concat(av.filter(n => n.prof === 'field_medic').slice(0, 1));
      const op = { id: 'OP-' + (m.ops.length + 1), task, target, room, why, started: w.now, status: 'mustering', squad: squad.map(n => n.id), lead: lead.id, result: null, casualties: [], ammo0: m.ammo };
      m.op = op; m.state = 'mustering'; m.ops.push(op); if (m.ops.length > 30) m.ops.shift();
      for (const n of squad) { n.job = null; n.agent.clear(); n.activity = 'Respond'; n.targetRoom = w.fac.room('mtfPrep') ? 'mtfPrep' : 'mtf'; n.label = op.id + ': сбор и снаряжение'; n.arrived = false; n.nextThink = 0; n.mtfOp = op.id; kit(w, n); }
      w.events.post({ time: w.now, type: EV.Report, roomId: room, severity: 2, pub: true, text: m.name + ': ' + op.id + ' — ' + MTF.TASKS[task] + ' («' + w.roomName(room) + '»). Причина: ' + why + '. Сбор группы.' });
      if (w.life) w.life.decide('Вызов ' + m.name + ': ' + MTF.TASKS[task], [why, 'группа: ' + squad.length + ' чел.', 'готовность ' + m.readiness + '%'], 'Отправить группу ' + op.id, 'Начальник смены / SCP LIFE');
      return op;
    },
    TASKS: { sweep: 'зачистка', protect: 'охрана', evacuate: 'эвакуация', assist: 'помощь охране', localize: 'изоляция сектора', recontain: 'повторное содержание' },
    tick(w) {
      const m = MTF.S(w), op = m.op, now = w.now; m.readiness = clamp(m.readiness + (m.state === 'standby' ? 0.05 : 0), 0, 100);
      if (!op) return;
      const squad = op.squad.map(id => w.npc(id)).filter(n => n && !n.dead);
      for (const id of op.squad) { const n = w.npc(id); if (n && n.dead && op.casualties.indexOf(id) < 0) op.casualties.push(id); }
      if (!squad.length) return MTF.finish(w, 'группа потеряна');
      if (op.status === 'mustering') { const ready = squad.filter(n => n.agent.roomId === 'mtfPrep' || n.agent.roomId === 'mtf').length; if (ready >= Math.ceil(squad.length * 0.6) || now - op.started > 6) { op.status = 'deployed'; op.deployed = now; for (const n of squad) { n.targetRoom = op.room; n.label = op.id + ': ' + MTF.TASKS[op.task]; n.arrived = false; n.nextThink = 0; n.combat = { threat: op.target, role: 'engage', since: now }; } w.events.post({ time: now, type: EV.Radio, roomId: op.room, severity: 1, text: m.name + ': группа ' + op.id + ' выдвинулась (' + squad.length + ' чел.).' }); } return; }
      if (op.status === 'deployed') {
        const ar = A(w), t = ar.threats[op.target], a = w.anomaly(op.target), here = squad.filter(n => n.agent.roomId === op.room || (t && n.agent.roomId === t.room)).length;
        for (const n of squad) if (!n.combat && t) n.combat = { threat: op.target, role: 'engage', since: now };
        if (op.task === 'recontain' && a && here >= 2) { const ok = MTF.recontain(w, a, squad); if (ok) return MTF.finish(w, 'объект возвращён в камеру'); }
        if (!t && (!a || a.contained)) return MTF.finish(w, 'угроза устранена');
        if (now - op.deployed > 180) return MTF.finish(w, 'операция прекращена по времени');
      }
    },
    // each object is re-contained its own way (definition: def.recontain(w, a, squad) → true when done); otherwise the squad
    // escorts it back with the containment kit when it is not actively resisting
    recontain(w, a, squad) {
      const m = MTF.S(w); if (a.def.recontain) return a.def.recontain(w, a, squad, m);
      if (a.carriedBy) return MTF.carry(w, a, squad);
      if (m.kits <= 0) return false;
      if (a.staggerUntil > w.realTime || a.def.temper !== 'aggressive' || w.rng.chance(0.15)) {
        m.kits--; const lead = squad.find(n => !n.dead && !n.incap(w.now)); if (!lead) return false;
        a.carriedBy = lead.id; a.agent.clear(); a.subdued = true;
        w.events.post({ time: w.now, type: EV.Report, roomId: a.agent.roomId, actor: lead.id, severity: 2, pub: true, text: m.name + ': ' + a.id + ' обездвижен (набор повторного содержания). Транспортировка в «' + w.roomName(a.containRoom) + '».' });
      }
      return false;
    },
    // the lead walks to the cell; the subdued object goes with the squad (cage / restraints) — no jump through walls
    carry(w, a, squad) {
      const lead = w.npc(a.carriedBy); if (!lead || lead.dead || lead.incap(w.now)) { a.carriedBy = squad.find(n => !n.dead && !n.incap(w.now)) ? squad.find(n => !n.dead && !n.incap(w.now)).id : null; return false; }
      const f = V.dirFromYaw(lead.agent.yaw || 0); a.agent.pos = V.v(lead.agent.pos.x - f.x * 1.3, lead.agent.pos.y, lead.agent.pos.z - f.z * 1.3); a.agent.roomId = lead.agent.roomId;
      lead.combat = null;
      if (lead.agent.roomId === a.containRoom) {
        a.carriedBy = null; a.subdued = false; a.contained = true; a.breached = false;
        w.events.post({ time: w.now, type: EV.Recontained, roomId: a.containRoom, actor: lead.id, severity: 2, pub: true, text: a.id + ' возвращён в камеру силами ' + MTF.S(w).name + '.' });
        return true;
      }
      if (!lead.agent.hasPath) { const home = w.fac.room(a.containRoom); if (home) { const p = w.planPath(lead.agent.pos, lead.agent.roomId, home.hubNodes[0], d => !d.outOfService); if (p) { lead.agent.setPath(p); lead.targetRoom = home.id; lead.activity = 'Escort'; lead.label = 'Конвой объекта ' + a.id; } } }
      for (const n of squad) if (n !== lead && !n.dead) { n.combat = null; n.targetRoom = a.containRoom; }
      return false;
    },
    finish(w, result) {
      const m = MTF.S(w), op = m.op; if (!op) return; op.status = 'done'; op.result = result; op.ended = w.now;
      const lost = op.casualties.length; m.readiness = clamp(m.readiness - 20 - lost * 15, 0, 100); m.ammo = clamp(m.ammo - 10, 0, 100); m.state = 'standby'; m.op = null; m.cd = w.now + 20;
      for (const id of op.squad) { const n = w.npc(id); if (!n || n.dead) continue; n.combat = null; n.mtfOp = null; holster(w, n); n.activity = 'Idle'; n.nextThink = 0; n.addHistory(w.now, op.id + ': ' + MTF.TASKS[op.task] + ' — ' + result, 'mtf'); }
      const rep = S.Incident.open(w, 'mtf', m.name + ': ' + op.id + ' (' + MTF.TASKS[op.task] + ')', op.room, { t: op.started, participants: op.squad.slice(), causes: [op.why], losses: op.casualties.map(id => w.nameOf(id)), decisions: ['задача: ' + MTF.TASKS[op.task]] });
      S.Incident.close(w, rep.id, result);
      w.events.post({ time: w.now, type: EV.Report, roomId: op.room, severity: 1, pub: true, text: m.name + ': ' + op.id + ' завершена — ' + result + (lost ? '. Потери: ' + lost : '') + '.' });
    }
  };

  function tick(w, dt) {
    const ar = A(w);
    for (const a of w.anomalies) if (a.carriedBy) { const lead = w.npc(a.carriedBy); if (lead && !lead.dead) { const f = V.dirFromYaw(lead.agent.yaw || 0); a.agent.pos = V.v(lead.agent.pos.x - f.x * 1.3, lead.agent.pos.y, lead.agent.pos.z - f.z * 1.3); a.agent.roomId = lead.agent.roomId; } }
    ar.t -= dt; if (ar.t > 0) return; ar.t = 1;
    refreshThreats(w); respond(w); MTF.tick(w);
    for (const n of w.active) if (n.combat && (n.dead || n.incap(w.now))) n.combat = null;
    while (ar.fx.length && w.realTime - ar.fx[0].t > 3) ar.fx.shift();
  }
  // people react to the player's drawn weapon: civilians grow nervous and back off, the one aimed at raises hands,
  // security orders to lower it, and someone who keeps aiming at staff becomes a threat themselves
  function playerTick(w, dt, aimedId) {
    const p = w.player, k = p.kit; if (!k || !k.drawn || p.dead) { p.aimT = 0; return; }
    const ar = A(w), lethal = W[k.cur] && W[k.cur].lethal, threatNear = Object.values(ar.threats).some(t => t.room && w.fac.roomDistance(t.room, p.roomId) <= 1);
    p.drawnT = (p.drawnT || 0) + dt;
    if (aimedId && aimedId !== 'player' && w.npc(aimedId) && !hostile(w, aimedId)) p.aimT = (p.aimedId === aimedId ? (p.aimT || 0) : 0) + dt; else p.aimT = 0; p.aimedId = aimedId;
    if (threatNear || !lethal) return;
    p.nervT = (p.nervT || 0) - dt; if (p.nervT > 0) return; p.nervT = 1;
    const room = w.fac.room(p.roomId); if (!room) return;
    for (const n of w.active) {
      if (n.dead || n.incap(w.now) || !n.agent.roomId || !(n.agent.roomId === p.roomId || room.canSeeInto(n.agent.roomId)) || V.distXZ(n.agent.pos, p.pos) > 12) continue;
      const sec = n.dept === 'security' || n.dept === 'mtf';
      if (sec) { if (p.drawnT > 6 && w.rng.chance(0.25)) n.say(pick(w, ['Убери оружие. Здесь нет угрозы.', 'Ствол в кобуру, ' + (p.female ? 'коллега' : 'коллега') + '.']), w.now); }
      else { n.psy.fear = clamp(n.psy.fear + (n.id === aimedId ? 12 : 3), 0, 100); if (w.rng.chance(0.12)) n.say(pick(w, ['Эй… ты чего с оружием?', 'Убери это, пожалуйста.']), w.now); }
    }
    const t = aimedId && w.npc(aimedId);
    if (t && p.aimT > 1.2 && !t.surrenderUntil) { t.say(pick(w, ['Не стреляй! Не стреляй!', 'Опусти пистолет!', 'Я ничего не сделал!']), w.now); t.psy.fear = clamp(t.psy.fear + 25, 0, 100); t.agent.clear(); t.posture = 'Cowering'; }
    if (t && p.aimT > 5 && !hostile(w, 'player')) {
      markHostile(w, 'player', { kind: 'person', room: p.roomId, verified: true, level: 2, armed: true, why: 'игрок держит на прицеле сотрудника' });
      S.Incident.open(w, 'force', 'Угроза оружием: ' + p.name, p.roomId, { participants: ['player', t.id], causes: ['прицеливание в сотрудника без оснований'] });
      p.addJournal('[' + fmtStamp(w.now) + '] Держал' + (p.female ? 'а' : '') + ' на прицеле ' + t.displayName + '. Охрана считает это угрозой.');
    }
  }
  // an attack by a person makes them a verified threat for security
  function attacked(w, attacker, victim, how) { if (!attacker || attacker === victim) return; const x = person(w, attacker); if (!x || isP(w, x) && how === 'gunshot') return; if (x.kit && x.kit.drawn && (x.dept === 'security' || x.dept === 'mtf')) return; markHostile(w, attacker, { kind: x.role === 'DClass' ? 'riot' : 'person', room: roomOf(w, x), verified: true, level: how === 'gunshot' ? 2 : 1, attacking: true, why: 'нападение на ' + w.nameOf(victim), armed: how === 'gunshot' }); }

  function save(w) { const ar = A(w); return { log: ar.log.slice(-100), threats: ar.threats, armory: ar.armory, mtf: ar.mtf || null, kits: w.npcs.filter(n => n.kit).map(n => [n.id, n.kit]), pk: w.player.kit || null }; }
  function load(w, o) { if (!o) return; const ar = A(w); ar.log = o.log || []; ar.threats = o.threats || {}; ar.armory = o.armory || ar.armory; ar.mtf = o.mtf || null; for (const [id, k] of o.kits || []) { const n = w.npc(id); if (n) n.kit = k; } if (o.pk) w.player.kit = o.pk; }

  S.Arms = { W, GEAR, LOADOUT, A, kit, playerTick, armor, skill, fire, reload, draw, holster, roe, warn, surrender, markHostile, attacked, npcTick, tick, trace, open, MTF, save, load };
})(typeof window !== 'undefined' ? window : globalThis);
