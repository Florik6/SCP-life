/* SCP LIFE — CRISIS: injuries with different consequences, bleeding, unconsciousness, death as a simulation event,
   witnesses' reactions, bodies (discovery → registration → removal → morgue → autopsy), medical treatment and recovery,
   staff losses (vacancies, workload, administration's decision) and limited replacement by new hires, incident reports. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, EV, fmtStamp } = S;

  // What each kind of harm does: bleeding per game minute at full severity, chance to knock out, pain, special effects.
  const KIND = {
    blunt: { name: 'тупая травма', bleed: 0.12, ko: 0.45, pain: 1, pose: 'fall_back' },
    cut: { name: 'резаная рана', bleed: 0.9, ko: 0.05, pain: 0.8, pose: 'kneel_fall' },
    bite: { name: 'укус', bleed: 0.75, ko: 0.1, pain: 1, infect: 0.25, pose: 'kneel_fall' },
    claw: { name: 'рваные раны', bleed: 1.0, ko: 0.15, pain: 1.1, pose: 'twist_fall' },
    gunshot: { name: 'огнестрельное ранение', bleed: 1.3, ko: 0.35, pain: 1.3, surgery: true, pose: 'collapse_fwd' },
    burn: { name: 'ожог', bleed: 0, ko: 0.1, pain: 1.4, pose: 'curl' },
    crush: { name: 'сдавление', bleed: 0.35, ko: 0.55, pain: 1.2, surgery: true, pose: 'crumple' },
    fall: { name: 'падение', bleed: 0.1, ko: 0.4, pain: 0.9, pose: 'fall_back' },
    shock: { name: 'электротравма', bleed: 0, ko: 0.75, pain: 0.7, pose: 'seizure' },
    toxic: { name: 'отравление', bleed: 0, ko: 0.25, pain: 0.6, sick: true, pose: 'curl' },
    anomalous: { name: 'аномальное воздействие', bleed: 0, ko: 0.6, pain: 0.5, pose: 'seizure' },
    drain: { name: 'истощение', bleed: 0, ko: 0.5, pain: 0.3, pose: 'slump' },
    psych: { name: 'психическая травма', bleed: 0, ko: 0.15, pain: 0, stress: 45, pose: 'slump' },
    nonlethal: { name: 'спецсредства', bleed: 0, ko: 0.6, pain: 0.7, temp: true, pose: 'kneel_fall' }
  };
  const STATE = { healthy: 'здоров', minor: 'лёгкие травмы', serious: 'тяжёлое состояние', incap: 'недееспособен', unconscious: 'без сознания', dead: 'погиб' };
  const MEDICS = ['field_medic', 'doctor', 'surgeon', 'orderly'];
  const pick = (w, a) => a[w.rng.int(0, a.length)];

  // ---------------------------------------------------------------- per-world state
  function M(w) { return w.med || (w.med = { bodies: [], vacancies: [], hires: [], reports: [], reserve: { staff: 10, dclass: 12, nextStaff: 7 * 1440, nextD: 3 * 1440 }, nextId: 1, t: 0, deaths: 0, injuries: 0 }); }
  const person = (w, id) => id === 'player' ? w.player : w.npc(id);
  const isP = (w, x) => x === w.player;
  const hpOf = (w, x) => isP(w, x) ? x.health : x.needs.health;
  const setHp = (w, x, v) => { v = clamp(v, 0, 100); if (isP(w, x)) x.health = v; else x.needs.health = v; };
  const posOf = (w, x) => isP(w, x) ? x.pos : x.agent.pos;
  const roomOf = (w, x) => isP(w, x) ? x.roomId : x.agent.roomId;
  const nameOf = (w, x) => isP(w, x) ? x.name : x.displayName;
  const fem = (x) => x && x.female ? 'а' : '';

  function state(w, x) {
    if (!x) return 'healthy'; if (x.dead) return 'dead';
    const hp = hpOf(w, x), now = w.now, wounds = x.wounds || [];
    if ((x.unconUntil || 0) > now) return 'unconscious';
    if (!isP(w, x) && x.incapUntil > now) return hp < 12 ? 'unconscious' : 'incap';
    if (hp < 25) return 'incap';
    const bleeding = wounds.some(k => k.bleed > 0.001);
    if (hp < 55 || (bleeding && hp < 75)) return 'serious';
    if (hp < 88 || wounds.length) return 'minor';
    return 'healthy';
  }
  // can walk and act on their own
  const mobile = (w, x) => { const s = state(w, x); return s === 'healthy' || s === 'minor' || s === 'serious'; };

  // ---------------------------------------------------------------- harm
  function hurt(w, id, dmg, kind, src, text, o) {
    o = o || {}; const x = person(w, id); if (!x || x.dead) return null;
    const K = KIND[kind] || KIND.blunt, now = w.now, P = isP(w, x), md = M(w);
    if (kind === 'psych') { const ps = x.psy; ps.fear = clamp(ps.fear + 20 + dmg, 0, 100); if (P) ps.stress = clamp(ps.stress + (K.stress || 30), 0, 100); else x.needs.stress = clamp(x.needs.stress + (K.stress || 30), 0, 100); dmg = Math.min(dmg, 8); }
    const hp = hpOf(w, x) - dmg; setHp(w, x, hp); md.injuries++;
    const sev = clamp(dmg / 60, 0.05, 1);
    x.wounds = x.wounds || [];
    if (kind !== 'psych' && kind !== 'nonlethal') x.wounds.push({ k: kind, sev: +sev.toFixed(2), bleed: +(K.bleed * sev * (o.bleedMul == null ? 1 : o.bleedMul)).toFixed(3), t: now, src: src || null, tr: false });
    if (x.wounds.length > 8) x.wounds.splice(0, x.wounds.length - 8);
    x.psy.fear = clamp(x.psy.fear + 20 + dmg * 0.5, 0, 100);
    if (P) x.psy.stress = clamp(x.psy.stress + 12, 0, 100); else x.needs.stress = clamp(x.needs.stress + 18, 0, 100);
    if (K.sick && !P) x.sickUntil = Math.max(x.sickUntil, now + 720);
    let ko = o.ko != null ? o.ko : 0;
    if (o.ko == null && hp > 0 && w.rng.chance(clamp(K.ko * dmg / 45, 0, 0.95))) ko = w.rng.range(2, 6) + dmg / 10;
    if (ko > 0) { x.unconUntil = Math.max(x.unconUntil || 0, now + ko); if (!P) x.incapUntil = Math.max(x.incapUntil, now + ko); }
    if (!P && o.mins) x.incapUntil = Math.max(x.incapUntil, now + o.mins);
    if (P) { x.stunnedUntil = w.realTime + (ko ? 4 : 2.5); w.stopCounting('получен удар'); } else x.nextThink = 0;
    const pos = posOf(w, x), roomId = roomOf(w, x), st = hp <= 0 ? 'dead' : state(w, x);
    x.lastHarm = { k: kind, src: src || null, t: now };
    w.events.post({ time: now, type: EV.Injury, roomId, pos: V.copy(pos), actor: src || null, target: x.id, severity: st === 'minor' ? 1 : 2, pub: P, text: (text ? text + ' ' : '') + '(' + K.name + ', ' + STATE[st] + ')' });
    if (kind !== 'psych') { w.sounds.push({ t: now, kind: ko || st === 'dead' ? 'bodyfall' : 'scream', roomId, pos: V.copy(pos), cause: 'injury', who: x.id, female: !!x.female }); w.makeNoise('scream', pos, roomId, 1, x.id); }
    if (hp <= 0) { die(w, id, kind, src, text); return 'dead'; }
    if (st !== 'minor' && st !== 'healthy') {
      if (!P) needCare(w, x, st);
      if (w.life) w.life.openCase('injury', 'Травма: ' + (P ? x.name : x.shortName), roomId, { cause: src && w.anomaly(src) ? 'anomalous' : kind, scp: src && w.anomaly(src) ? src : null });
    }
    witness(w, x, 'injury', kind, src);
    return st;
  }
  // first aid on the spot, then transport (stretcher if they cannot walk), surgery when the wound needs it
  function needCare(w, x, st) {
    if (!w.life || x.dead) return;
    if (!w.tasks.hasActive('first_aid', x.id)) w.life.assign('first_aid', MEDICS.concat(['operative']), { patient: x.id, target: x.id }, 'SCP LIFE', st === 'serious' ? 30 : 15, x.agent.roomId);
  }

  // ---------------------------------------------------------------- death
  function die(w, id, cause, src, text) {
    const x = person(w, id); if (!x || x.dead) return null;
    const P = isP(w, x), now = w.now, md = M(w), K = KIND[cause] || KIND.blunt;
    x.dead = true; x.deathAt = now; x.deathCause = cause; x.deathSrc = src || null; setHp(w, x, 0);
    x.deathPose = K.pose || 'fall_back';
    const pos = V.copy(posOf(w, x)), roomId = roomOf(w, x), name = nameOf(w, x), anom = src ? w.anomaly(src) : null, killer = src ? person(w, src) : null;
    if (!P) {
      if (x.reservedPoi) { const p = w.fac.poi(x.reservedPoi); if (p && p.reservedBy === x.id) p.reservedBy = null; x.reservedPoi = null; }
      x.agent.clear(); x.activity = 'Dead'; x.label = 'Погиб' + fem(x); x.posture = 'Dead'; x.conv = null; x.followId = null; x.escortedBy = null; x.queue = null;
      if (x.job) { x.job.status = 'Failed'; x.job = null; } if (x.taskId) { const t = w.tasks.get(x.taskId); if (t && t.status === 'Active') reassign(w, t, x); x.taskId = null; }
      x.incapUntil = now + 1e6; w.releaseSpot && w.releaseSpot(x.id);
      x.addHistory(now, 'Погиб' + fem(x) + ': ' + K.name + (anom ? ' (' + anom.id + ')' : killer ? ' (' + nameOf(w, killer) + ')' : ''), 'death', src || null);
    } else { x.counting = false; }
    md.deaths++;
    const b = { id: 'body.' + x.id + (P ? '.' + now.toFixed(1) : ''), who: x.id, name, role: P ? (x.prof === 'dclass' ? 'DClass' : 'Staff') : x.role, look: P ? (S.Professions.get(x.prof) || { look: 'Guard' }).look : x.role, prof: x.prof, female: !!x.female, roomId, pos, yaw: P ? x.yaw : x.agent.yaw, cause, src: src || null, text: text || '', t: now, pose: x.deathPose,
      found: null, registered: false, recovered: false, carriedBy: null, inMorgue: false, drawer: -1, autopsy: null, witnesses: [], report: null };
    md.bodies.push(b);
    w.events.post({ time: now, type: EV.Death, roomId, pos: V.copy(pos), actor: src || null, target: x.id, severity: 3, pub: true, text: (text ? text + '. ' : '') + name + ' погиб' + fem(x) + ' (' + K.name + ').' });
    w.sounds.push({ t: now, kind: 'bodyfall', roomId, pos: V.copy(pos), cause: 'death', who: x.id, female: !!x.female }); w.makeNoise('scream', pos, roomId, 0.8, x.id);
    const rep = S.Incident.open(w, 'death', 'Гибель: ' + name, roomId, { t: now, participants: [x.id].concat(src ? [src] : []), causes: [K.name + (anom ? ' — объект ' + anom.id : killer ? ' — ' + nameOf(w, killer) : '')], losses: [name + (P ? ' (игрок)' : ', ' + (S.Professions.get(x.prof) || { name: x.prof }).name)] });
    b.report = rep.id;
    const seen = witness(w, x, 'death', cause, src);
    if (seen.length) { b.witnesses = seen; found(w, b, seen[0], true); }
    if (w.life) {
      w.life.openCase('death', 'Гибель: ' + name, roomId, { cause: anom ? 'anomalous' : killer ? 'person' : cause, scp: anom ? anom.id : null, victim: x.id, culprit: killer ? x.id : null });
      w.life.decide('Гибель ' + (b.role === 'DClass' ? 'заключённого ' : 'сотрудника ') + name, [K.name, 'место: ' + w.roomName(roomId), seen.length ? 'свидетелей: ' + seen.length : 'свидетелей нет'], 'Расследование, медицинское заключение' + (b.role === 'DClass' ? '' : ', замещение должности'), 'Служба безопасности');
    }
    if (!P) vacancy(w, x, 'гибель');
    grief(w, x);
    return b;
  }
  // a job of someone who died or fell goes to a colleague
  function reassign(w, t, x) {
    t.status = 'Failed'; t.result = 'исполнитель выбыл';
    if (!w.life || !t.kind || t.kind === 'first_aid') return;
    const pr = S.Professions.get(x.prof); if (!pr) return;
    w.life.assign(t.kind, [x.prof], t.data || {}, 'SCP LIFE: замена выбывшего', 240, x.agent.roomId);
  }
  // friends learn; their stress and history keep it
  function grief(w, x) {
    for (const n of w.npcs) {
      if (n === x || n.dead) continue; const r = n.relTo(x.id); if (r < 25) continue;
      n.needs.stress = clamp(n.needs.stress + Math.min(35, r * 0.4), 0, 100); n.psy.resilience = clamp(n.psy.resilience - 0.03, 0.2, 1);
      n.addHistory(w.now, 'Погиб' + fem(x) + ' ' + (r > 50 ? 'близкий друг: ' : 'коллега: ') + nameOf(w, x), 'loss', x.id);
      n.griefUntil = w.now + (r > 50 ? 2880 : 1080);
    }
  }

  // ---------------------------------------------------------------- witnesses
  function witness(w, x, what, kind, src) {
    const roomId = roomOf(w, x), pos = posOf(w, x), room = w.fac.room(roomId), out = []; if (!room) return out;
    for (const n of w.active) {
      if (n === x || n.dead || n.missing || n.incap(w.now)) continue;
      const nr = n.agent.roomId, r2 = nr && w.fac.room(nr); if (!r2) continue;
      if (!(nr === roomId || room.canSeeInto(nr) || r2.canSeeInto(roomId)) || V.distXZ(n.agent.pos, pos) > 18 || Math.abs(n.agent.pos.y - pos.y) > 2) continue;
      out.push(n.id); react(w, n, x, what, kind, src);
    }
    const p = w.player;
    if (!p.dead && p !== x && p.roomId && (p.roomId === roomId || room.canSeeInto(p.roomId)) && V.distXZ(p.pos, pos) < 18) { out.push('player'); p.psy.fear = clamp(p.psy.fear + (what === 'death' ? 35 : 18), 0, 100); p.addJournal('[' + fmtStamp(w.now) + '] На моих глазах ' + (what === 'death' ? 'погиб' + fem(x) + ' ' : 'ранен' + (x.female ? 'а' : '') + ' ') + nameOf(w, x) + '.'); }
    return out;
  }
  function react(w, n, x, what, kind, src) {
    const death = what === 'death', now = w.now, friend = n.relTo(x.id) > 25, a = src ? w.anomaly(src) : null;
    const threat = a && a.agent && a.agent.roomId && (a.agent.roomId === n.agent.roomId || V.distXZ(a.agent.pos, n.agent.pos) < 10);
    n.psy.fear = clamp(n.psy.fear + (death ? 40 : 22) + (threat ? 20 : 0), 0, 100); n.needs.stress = clamp(n.needs.stress + (death ? 28 : 14) + (friend ? 18 : 0), 0, 100);
    n.memory.remember({ eventId: -(w.events.nextId++), time: now, type: death ? EV.Death : EV.Injury, roomId: x === w.player ? x.roomId : x.agent.roomId, subject: x.id, text: (death ? 'Видел' + n.G('', 'а') + ' гибель: ' : 'Видел' + n.G('', 'а') + ', как ранили: ') + nameOf(w, x) + ' (' + (KIND[kind] || KIND.blunt).name + ')' + (a ? ', рядом был ' + a.id : ''), imp: death ? 0.95 : 0.7, conf: 1, src: 'Witnessed' }, now);
    if (death && friend) n.addHistory(now, 'На глазах погиб' + fem(x) + ' ' + nameOf(w, x), 'loss', x.id);
    const medic = MEDICS.indexOf(n.prof) >= 0, guard = n.dept === 'security' || n.dept === 'mtf', room = w.roomName(x === w.player ? x.roomId : x.agent.roomId);
    let line;
    if (threat && !guard && n.traits.bravery < 0.75) { line = pick(w, ['Бежим! Оно здесь!', 'Назад! Назад!', 'Уходим, быстро!']); n.panicUntil = now + 10; n.nextThink = 0; }
    else if (guard) { line = death ? pick(w, ['Двухсотый в «' + room + '». Нужна группа и медики.', 'Потеря в «' + room + '». Перекрываю проход.']) : pick(w, ['Раненый в «' + room + '», медиков сюда!', 'Пострадавший в «' + room + '». Нужна помощь.']); n.radioCall = { t: now, room: x === w.player ? x.roomId : x.agent.roomId, what }; }
    else if (medic && !death) line = pick(w, ['Держись, я врач!', 'Не двигайся, сейчас помогу.', 'Дай посмотреть рану.']);
    else if (n.role === 'DClass') line = death ? pick(w, ['Он не дышит!', 'Начальник! Тут человек!', 'Твою ж… Он мёртвый.']) : pick(w, ['Эй, ему плохо!', 'Начальник, тут раненый!']);
    else line = death ? pick(w, ['Он не дышит… Позовите кого-нибудь!', 'Боже… Вызовите охрану!', 'Нет, нет, нет…']) : pick(w, ['Помогите! Здесь раненый!', 'Медиков! Срочно!', 'Он истекает кровью!']);
    n.say(line, now);
  }

  // ---------------------------------------------------------------- bodies
  function body(w, id) { return M(w).bodies.find(b => b.id === id || b.who === id) || null; }
  function found(w, b, by, witnessed) {
    if (b.found) return; b.found = { t: w.now, by }; const who = by === 'player' ? w.player.name : w.nameOf(by);
    if (!witnessed) {
      w.events.post({ time: w.now, type: EV.Report, roomId: b.roomId, pos: V.copy(b.pos), actor: by, target: b.who, severity: 3, pub: true, text: who + ' обнаружил тело: ' + b.name + ' («' + w.roomName(b.roomId) + '»).' });
      const n = w.npc(by); if (n) { n.say(pick(w, ['Здесь тело! Охрана!', 'Тут… тут человек. Мёртвый.', 'Вызовите охрану, здесь труп.']), w.now); n.psy.fear = clamp(n.psy.fear + 30, 0, 100); n.needs.stress = clamp(n.needs.stress + 20, 0, 100); }
    }
    S.Incident.add(w, b.report, 'reactions', fmtStamp(w.now) + ' тело обнаружил' + (witnessed ? 'и свидетели' : ': ' + who));
    if (w.life) {
      // the medical service carries bodies; guards only when no orderly or medic is on duty
      if (!w.life.assign('body_recovery', ['orderly', 'pathologist', 'field_medic', 'doctor'], { body: b.id, target: b.who }, 'SCP LIFE', 180, b.roomId, { npcOnly: true }))
        w.life.assign('body_recovery', ['guard', 'operative'], { body: b.id, target: b.who }, 'SCP LIFE', 180, b.roomId, { npcOnly: true });
      if (b.role !== 'DClass' || w.rng.chance(0.5)) w.life.assign('scene_check', ['security_officer', 'shift_chief', 'guard'], { body: b.id, target: b.who, room: b.roomId }, 'Служба безопасности', 120, b.roomId);
    }
  }
  function register(w, b, by) { if (!b || b.registered) return; b.registered = true; S.Incident.add(w, b.report, 'decisions', fmtStamp(w.now) + ' место осмотрено, тело зарегистрировано (' + w.nameOf(by) + ')'); }
  function lift(w, carrier, bodyId) {
    const b = body(w, bodyId); if (!b || b.inMorgue) return false; b.carriedBy = carrier.id; register(w, b, carrier.id);
    const x = person(w, b.who); if (x && !isP(w, x)) { x.carriedBy = carrier.id; }
    return true;
  }
  function toMorgue(w, bodyId, by) {
    const b = body(w, bodyId); if (!b) return 'тела нет'; const md = M(w), m = w.fac.room('morgue');
    b.carriedBy = null; b.recovered = true; b.inMorgue = true; b.roomId = 'morgue'; b.drawer = md.bodies.filter(o => o.inMorgue).length - 1;
    if (m) b.pos = V.v(m.minX + 0.9, m.floorY, m.minZ + 0.9 + (b.drawer % 12) * 0.75);
    const x = person(w, b.who); if (x && !isP(w, x)) { x.carriedBy = null; x.onSite = false; x.tier = 'abstract'; x.agent.roomId = null; w.setActive(x, false); }
    S.Incident.add(w, b.report, 'decisions', fmtStamp(w.now) + ' тело доставлено в морг (' + w.nameOf(by.id || by) + '), ячейка ' + (b.drawer + 1));
    if (w.life) w.life.assign('autopsy', ['pathologist', 'doctor'], { body: b.id, target: b.who }, 'Медицинская служба', 720, 'morgue', { npcOnly: true });
    return 'тело в морге';
  }
  function autopsy(w, bodyId, by) {
    const b = body(w, bodyId); if (!b || b.autopsy) return 'нет тела для вскрытия'; const K = KIND[b.cause] || KIND.blunt, a = b.src ? w.anomaly(b.src) : null, killer = b.src && !a ? person(w, b.src) : null;
    const x = person(w, b.who), wounds = (x && x.wounds) || [];
    b.autopsy = { t: w.now, by: by.id || by, cause: K.name, detail: wounds.map(k => (KIND[k.k] || K).name + ' (' + Math.round(k.sev * 100) + '%)').join(', ') || K.name, anomalous: !!a, src: b.src };
    S.Incident.add(w, b.report, 'causes', 'вскрытие: ' + b.autopsy.detail + (a ? '; признаки воздействия ' + a.id : killer ? '; причастен ' + nameOf(w, killer) : ''));
    S.Incident.close(w, b.report, 'медицинское заключение оформлено');
    if (w.life) w.life.decide('Медицинское заключение: ' + b.name, [b.autopsy.detail], a ? 'Передать данные исследователям ' + a.id : 'Приобщить к расследованию', w.nameOf(by.id || by));
    return 'заключение: ' + b.autopsy.cause;
  }

  // ---------------------------------------------------------------- treatment
  function firstAid(w, medic, id) {
    const x = person(w, id); if (!x || x.dead) return 'поздно';
    for (const k of x.wounds || []) { k.bleed = 0; k.tr = true; }
    setHp(w, x, Math.max(hpOf(w, x), 30)); const now = w.now;
    if ((x.unconUntil || 0) > now) x.unconUntil = Math.min(x.unconUntil, now + w.rng.range(1, 3));
    const surgery = (x.wounds || []).some(k => (KIND[k.k] || {}).surgery && k.sev > 0.35);
    if (!isP(w, x)) {
      x.treated = false; x.nextThink = 0;
      const lowHp = hpOf(w, x) < 40;
      x.incapUntil = lowHp ? Math.max(x.incapUntil, now + 30) : Math.min(x.incapUntil, now);
      if (surgery) x.needSurgery = true;
      if ((lowHp || surgery) && w.life && !w.tasks.hasActive('transport_patient', x.id)) w.life.assign('transport_patient', ['orderly', 'field_medic', 'doctor', 'operative'], { patient: x.id, target: x.id, to: surgery ? 'operating' : (x.role === 'DClass' ? 'd3medical' : 'wards') }, 'Медицинская служба', 60, x.agent.roomId, { npcOnly: true });
    }
    return surgery ? 'кровотечение остановлено, нужна операция' : 'кровотечение остановлено';
  }
  // a patient brought to bed (stretcher or on foot)
  function admit(w, x, roomId) {
    if (!x || x.dead) return; const room = w.fac.room(roomId); if (!room) return;
    const bed = room.pois.find(p => (p.type === 'MedBed' || p.type === 'CellBunk') && (!p.reservedBy || p.reservedBy === x.id));
    x.carriedBy = null;
    if (bed) { if (x.reservedPoi && x.reservedPoi !== bed.id) { const o = w.fac.poi(x.reservedPoi); if (o && o.reservedBy === x.id) o.reservedBy = null; } bed.reservedBy = x.id; x.reservedPoi = bed.id; x.agent.pos = V.copy(bed.pos); x.agent.roomId = room.id; x.agent.yaw = bed.yaw; x.posture = 'Lying'; }
    x.admitted = room.id; x.admitAt = w.now;
    if (x.needSurgery && room.id === 'operating' && w.life) w.life.assign('surgery', ['surgeon', 'doctor'], { patient: x.id, target: x.id }, 'Медицинская служба', 60, 'operating', { npcOnly: true });
  }
  function surgery(w, by, id) {
    const x = person(w, id); if (!x || x.dead) return 'пациент не дожил';
    const skill = by && by.prof === 'surgeon' ? 0.92 : 0.75, ok = w.rng.chance(skill);
    if (!ok && hpOf(w, x) < 30 && w.rng.chance(0.35)) { die(w, id, x.lastHarm ? x.lastHarm.k : 'gunshot', null, 'Смерть на операционном столе'); return 'пациент умер во время операции'; }
    for (const k of x.wounds || []) { k.sev = +(k.sev * (ok ? 0.4 : 0.7)).toFixed(2); k.bleed = 0; k.tr = true; }
    setHp(w, x, Math.max(hpOf(w, x), ok ? 55 : 40)); x.needSurgery = false; if (!isP(w, x)) { x.incapUntil = w.now + 120; x.unconUntil = w.now + 60; }
    if (!isP(w, x)) x.addHistory(w.now, 'Перенёс' + fem(x) + ' операцию (' + (by ? w.nameOf(by.id) : 'хирург') + ')', 'medical');
    return ok ? 'операция прошла успешно' : 'операция прошла с осложнениями';
  }

  // ---------------------------------------------------------------- staff losses and replacement
  function vacancy(w, x, why) {
    if (x.role === 'DClass') { M(w).vacancies.push({ id: 'V' + M(w).nextId++, prof: 'dclass', dept: 'dclass', room: x.homeRoom, since: w.now, by: x.id, why, status: 'open', decided: null, hire: null, home: x.homeRoom, bed: x.bedPoi, hall: x.hallRoom }); return; }
    const md = M(w), pr = S.Professions.get(x.prof);
    const v = { id: 'V' + md.nextId++, prof: x.prof, dept: x.dept, room: x.workRoom, post: x.post, since: w.now, by: x.id, why, status: 'open', decided: null, hire: null, bed: x.bedPoi, scps: (x.assignedScps || []).slice() };
    md.vacancies.push(v);
    // responsible objects are handed to colleagues right away
    for (const scp of v.scps) { const a = w.anomaly(scp); if (!a) continue; a.assigned = a.assigned.filter(i => i !== x.id); }
    w.events.post({ time: w.now, type: EV.Personnel, roomId: x.workRoom, severity: 1, pub: true, text: 'Вакансия: ' + (pr ? pr.name.toLowerCase() : x.prof) + ' (' + x.shortName + ', ' + why + '). Нагрузка на отдел растёт.' });
  }
  function personnelTick(w) {
    const md = M(w), now = w.now;
    if (now >= md.reserve.nextStaff) { md.reserve.staff = Math.min(10, md.reserve.staff + 2); md.reserve.nextStaff = now + 7 * 1440; }
    if (now >= md.reserve.nextD) { md.reserve.dclass = Math.min(12, md.reserve.dclass + 4); md.reserve.nextD = now + 3 * 1440; }
    for (const v of md.vacancies) {
      if (v.status === 'open') {
        // the department carries the load: overtime and fatigue for colleagues on duty
        if (v.prof !== 'dclass') for (const n of w.active) if (n.prof === v.prof && !n.dead && w.rng.chance(0.05)) n.psy.fatigue = clamp(n.psy.fatigue + 2, 0, 100);
        const wait = v.prof === 'dclass' ? 240 : 360;
        if (now - v.since < wait) continue;
        const pool = v.prof === 'dclass' ? 'dclass' : 'staff', can = md.reserve[pool] > 0;
        const head = v.prof === 'dclass' ? 'Начальник смены' : (S.Professions.DEPTS[v.dept] ? 'Руководитель: ' + S.Professions.DEPTS[v.dept].name : 'Администрация');
        if (can) { md.reserve[pool]--; v.status = 'approved'; v.decided = now; v.eta = now + (v.prof === 'dclass' ? w.rng.range(360, 900) : w.rng.range(720, 2160)); }
        else { v.status = 'waiting'; v.decided = now; }
        if (w.life) w.life.decide('Замещение: ' + (S.Professions.get(v.prof) || { name: 'класс D' }).name.toLowerCase(), ['причина: ' + v.why, 'резерв: ' + md.reserve[pool]], can ? 'Запросить сотрудника из резерва' : 'Резерв исчерпан — перераспределить нагрузку', head);
      } else if (v.status === 'waiting' && md.reserve[v.prof === 'dclass' ? 'dclass' : 'staff'] > 0) { v.status = 'open'; v.since = now - 1000; }
      else if (v.status === 'approved' && now >= v.eta) { const n = hire(w, v); v.status = 'filled'; v.hire = n ? n.id : null; }
    }
    if (md.vacancies.length > 60) md.vacancies = md.vacancies.filter(v => v.status !== 'filled' || now - v.since < 4320);
  }
  // a new person: name, profession, character, rank, access card, workplace, relations, traits
  function hire(w, v) {
    const md = M(w), seed = md.hires.length + 1, n = S.People.hire(w, { prof: v.prof, home: v.home, bed: v.bed, hall: v.hall, room: v.room, post: v.post, n: seed });
    if (!n) return null;
    md.hires.push(n.hireSpec);
    for (const scp of v.scps || []) { const a = w.anomaly(scp); if (a && a.assigned.indexOf(n.id) < 0) { a.assigned.push(n.id); n.assignedScps.push(scp); } }
    w.events.post({ time: w.now, type: EV.Personnel, roomId: n.entry, severity: 1, pub: true, text: 'Прибыл' + fem(n) + ' на замену: ' + n.displayName + ' (' + (S.Professions.get(n.prof) || { name: 'класс D' }).name + (n.role === 'DClass' ? '' : ', допуск L' + n.level) + ').' });
    return n;
  }

  // ---------------------------------------------------------------- tick
  function tick(w, dt, gm) {
    const md = M(w);
    // carried people and bodies follow the carrier (stretcher behind them)
    for (const b of md.bodies) if (b.carriedBy) follow(w, b, person(w, b.carriedBy));
    for (const n of w.active) if (n.carriedBy && !n.dead) follow(w, null, person(w, n.carriedBy), n);
    md.t -= dt; if (md.t > 0) return; const step = 1 - md.t; md.t = 1; const g = gm * step / Math.max(dt, 1e-6) * dt;
    const gmin = w.clock.minPerSec * step;
    for (const x of [w.player].concat(w.active)) {
      if (!x || x.dead || !x.wounds || !x.wounds.length) continue;
      let bleed = 0; for (const k of x.wounds) { if (k.bleed > 0) { bleed += k.bleed; if (k.sev < 0.25) k.bleed = +(k.bleed * (1 - 0.03 * gmin)).toFixed(4); } }
      if (bleed > 0) { setHp(w, x, hpOf(w, x) - bleed * gmin); if (hpOf(w, x) <= 0) { const k = x.wounds.find(q => q.bleed > 0) || x.wounds[0]; die(w, x.id, k.k, k.src, 'Кровопотеря'); continue; } }
      // treated wounds heal; someone in a medical room with staff heals faster
      const inMed = !isP(w, x) && x.admitted && x.agent.roomId === x.admitted;
      for (const k of x.wounds) if (k.tr || k.bleed <= 0) k.sev = +(k.sev - gmin * (inMed ? 0.004 : 0.0012)).toFixed(4);
      x.wounds = x.wounds.filter(k => k.sev > 0.02 || k.bleed > 0);
      if (inMed) setHp(w, x, hpOf(w, x) + gmin * 0.06);
      if (!x.wounds.length && x.admitted && hpOf(w, x) >= 80 && !isP(w, x)) { x.admitted = null; x.posture = 'Standing'; x.nextThink = 0; if (x.reservedPoi) { const p = w.fac.poi(x.reservedPoi); if (p && p.reservedBy === x.id) p.reservedBy = null; x.reservedPoi = null; } x.addHistory(w.now, 'Выписан' + (x.female ? 'а' : '') + ' после лечения', 'medical'); }
    }
    // undiscovered bodies are found by whoever sees them
    for (const b of md.bodies) {
      if (b.found || b.inMorgue) continue; const room = w.fac.room(b.roomId); if (!room) continue;
      for (const n of w.active) { if (n.dead || n.incap(w.now) || !n.agent.roomId) continue; const nr = n.agent.roomId; if ((nr === b.roomId || room.canSeeInto(nr)) && V.distXZ(n.agent.pos, b.pos) < 14) { found(w, b, n.id, false); break; } }
      if (!b.found) { const p = w.player; if (!p.dead && (p.roomId === b.roomId || (p.roomId && room.canSeeInto(p.roomId))) && V.distXZ(p.pos, b.pos) < 14) found(w, b, 'player', false); }
    }
    md.pt = (md.pt || 0) - step; if (md.pt <= 0) { md.pt = 15; personnelTick(w); }
  }
  function follow(w, b, c, x) {
    if (!c || c.dead) { if (b) b.carriedBy = null; if (x) x.carriedBy = null; return; }
    const cp = posOf(w, c), yaw = (isP(w, c) ? c.yaw : c.agent.yaw) || 0, f = V.dirFromYaw(yaw), p = V.v(cp.x - f.x * 1.1, cp.y, cp.z - f.z * 1.1), r = roomOf(w, c);
    if (b) { b.pos = p; b.roomId = r; b.yaw = yaw + 90; const o = person(w, b.who); if (o && !isP(w, o)) { o.agent.pos = V.copy(p); o.agent.roomId = r; o.agent.yaw = yaw + 90; } }
    if (x) { x.agent.pos = p; x.agent.roomId = r; x.agent.yaw = yaw + 90; x.posture = 'Lying'; }
  }

  // ---------------------------------------------------------------- incident reports (time, place, participants, causes, consequences, losses, reactions, decisions, result)
  const Incident = {
    open(w, kind, title, roomId, o) {
      const md = M(w), r = Object.assign({ id: 'I' + md.nextId++, kind, title, t: w.now, place: roomId, placeName: w.roomName(roomId), participants: [], causes: [], consequences: [], losses: [], reactions: [], decisions: [], result: null, closed: null }, o || {});
      md.reports.push(r); if (md.reports.length > 120) md.reports.splice(0, md.reports.length - 120); return r;
    },
    get(w, id) { return M(w).reports.find(r => r.id === id) || null; },
    add(w, id, field, text) { const r = Incident.get(w, id); if (r && r[field] && r[field].indexOf(text) < 0) r[field].push(text); return r; },
    close(w, id, result) { const r = Incident.get(w, id); if (r && !r.closed) { r.result = result; r.closed = w.now; } return r; },
    text(w, r) {
      const L = ['ОТЧЁТ ОБ ИНЦИДЕНТЕ ' + r.id + ': ' + r.title, 'Время: ' + fmtStamp(r.t) + (r.closed ? ' — ' + fmtStamp(r.closed) : ' (открыт)'), 'Место: ' + r.placeName];
      const part = r.participants.map(id => w.nameOf(id)).join(', '); if (part) L.push('Участники: ' + part);
      for (const [k, t] of [['causes', 'Причины'], ['consequences', 'Последствия'], ['losses', 'Потери'], ['reactions', 'Реакции персонала'], ['decisions', 'Решения']]) if (r[k].length) L.push(t + ': ' + r[k].join('; '));
      L.push('Итог: ' + (r.result || 'расследование продолжается')); return L.join('\n');
    }
  };

  function save(w) { const md = M(w); return { bodies: md.bodies, vacancies: md.vacancies, hires: md.hires, reports: md.reports, reserve: md.reserve, nextId: md.nextId, deaths: md.deaths, injuries: md.injuries }; }
  function load(w, o) { if (!o) return; const md = M(w); Object.assign(md, o); md.t = 0; }

  S.Med = { KIND, STATE, MEDICS, state, mobile, hurt, die, witness, body, found, register, lift, toMorgue, autopsy, firstAid, admit, surgery, vacancy, hire, tick, save, load, M };
  S.Incident = Incident;
})(typeof window !== 'undefined' ? window : globalThis);
