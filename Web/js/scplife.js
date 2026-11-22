/* SCP LIFE 2.0 — the central facility AI. It sees the complex only through sensors, cameras, terminals, reports and logs,
   keeps a decision log (cause → data → decision → assignee → result → consequences) and runs staffing, containment procedures,
   maintenance, research, arrivals, meetings and ethics, investigations, night planning, careers and long stories. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, Hm, EV, fmtTime, fmtStamp, durationText } = S;
  const ALERT_NAMES = ['ЗЕЛЁНЫЙ', 'ЖЁЛТЫЙ', 'ОРАНЖЕВЫЙ', 'КРАСНЫЙ'];
  const CAUSES = { sabotage: 'Умышленные действия', human_error: 'Ошибка персонала', technical: 'Техническая неисправность', information_gap: 'Недостаток информации', anomalous: 'Аномальное воздействие', natural: 'Обычное событие' };

  S.Jobs.K('stand_guard', { act: 'GuardPost', title: 'Сопровождение', build: (w, who, o) => [{ room: o.room, poi: null, poiType: null, label: 'Сопровождать сотрудника в «' + w.roomName(o.room) + '»', dur: 25, need: 'stay:6', done: false }], done: () => 'сопровождение окончено' });

  // ------------------------------------------------------------------ alert
  class Alert {
    constructor() { this.level = 0; this.reason = 'Штатный режим'; this.roomId = null; this.changed = 0; this.breachId = null; this.lastRoom = null; this.lastTime = 0; }
    raise(w, lvl, reason, roomId) { if (lvl <= this.level) return; this.set(w, lvl, reason, roomId); }
    lower(w, lvl, reason) { if (lvl >= this.level) return; this.set(w, lvl, reason, this.roomId); }
    set(w, lvl, reason, roomId) {
      const prev = this.level; this.level = lvl; this.reason = reason; this.roomId = roomId; this.changed = w.now;
      const lock = lvl >= 3, was = prev >= 3;
      if (lock !== was) { for (const d of w.fac.doorList) { const a = w.fac.room(d.roomA), b = w.fac.room(d.roomB); if (a.type !== 'DClassCommon' && b.type !== 'DClassCommon') continue; d.lockdown = lock; if (lock) d.close(); } w.lockEpoch++; }
      const room = w.fac.room(roomId);
      if (room && room.type === 'Containment' && lvl > prev) { const est = lvl >= 3 ? 100 : lvl === 2 ? 80 : 55; for (const n of w.active) { if (n.knownThreatTime > w.now - 0.01 && n.knownThreat >= est) continue; n.knownThreat = est; n.knownThreatTime = w.now; } }
      w.events.post({ time: w.now, type: EV.AlertChanged, roomId, severity: lvl >= 2 ? 3 : 1, pub: true, text: 'Уровень тревоги ' + ALERT_NAMES[lvl] + ': ' + reason + (room ? ' (' + room.name + ')' : '') });
      if (w.life) w.life.decide('Изменение уровня тревоги', [reason], 'Уровень ' + ALERT_NAMES[lvl], 'весь персонал');
    }
    reportBreach(w, a, roomId, source) {
      this.lastRoom = roomId; this.lastTime = w.now; this.breachId = a.id;
      if (!a.detected) {
        a.detected = true; const room = w.fac.room(roomId), hostile = a.temper === 'aggressive';
        w.events.post({ time: w.now, type: EV.ContainmentBreach, roomId, pos: V.copy(a.agent.pos), actor: a.id, severity: hostile ? 3 : 2, pub: true, text: (hostile ? 'ВНИМАНИЕ! ' : '') + 'Нарушение условий содержания ' + a.displayName + '. Обнаружено: ' + source + ', ' + (room ? room.name : '') + '.' + (hostile ? ' Персоналу укрыться, охране — протокол счёта.' : ' Объект не враждебен, сохранять спокойствие.') });
        if (w.life) w.life.openCase('breach', 'Нарушение содержания ' + a.id, roomId, { cause: a.breachCause || 'anomalous', scp: a.id });
      }
      this.raise(w, a.temper === 'aggressive' ? 3 : 1, 'Нарушение содержания ' + a.id, roomId);
    }
    save() { return Object.assign({}, this); }
    load(o) { Object.assign(this, o); }
  }

  // ------------------------------------------------------------------ task board
  class Tasks {
    constructor() { this.list = []; this.nextId = 1; this.done = { npc: 0, player: 0, failed: 0 }; }
    issue(w, t) {
      t.id = 'T' + this.nextId++; t.issued = w.now; t.status = 'Active'; t.by = t.by || 'SCP LIFE';
      this.list.push(t);
      if (this.list.length > 220) this.list = this.list.filter(x => x.status === 'Active' || w.now - x.issued < 720);
      w.events.post({ time: w.now, type: EV.TaskIssued, actor: t.who, target: t.id, roomId: t.room, quiet: t.who !== 'player', text: t.by + ' → ' + w.nameOf(t.who) + ': ' + t.title });
      const n = w.npc(t.who); if (n) n.nextThink = Math.min(n.nextThink, 0.3);
      return t;
    }
    get(id) { for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].id === id) return this.list[i]; return null; }
    activeFor(who) { const o = []; for (const t of this.list) if (t.status === 'Active' && t.who === who) o.push(t); return o.sort((a, b) => (b.prio || 0) - (a.prio || 0)); }
    firstActive(who, kind) { return this.list.find(t => t.status === 'Active' && t.who === who && t.kind === kind) || null; }
    hasActive(kind, target) { return this.list.some(t => t.status === 'Active' && t.kind === kind && (target == null || t.target === target || (t.data && t.data.target === target))); }
    complete(w, t, note) {
      if (t.status !== 'Active') return; t.status = 'Completed'; t.doneAt = w.now; t.note = note; this.done[t.who === 'player' ? 'player' : 'npc']++;
      if (t.who === 'player') { const p = w.player; p.done++; p.tasksInRole++; p.addRep(p.dept, 2); }
      w.events.post({ time: w.now, type: EV.TaskCompleted, actor: t.who, target: t.id, roomId: t.room, quiet: t.who !== 'player', text: w.nameOf(t.who) + ': выполнено «' + t.title + '»' + (note ? ' — ' + note : '') });
      if (t.decision && w.life) w.life.resolve(t.decision, 'выполнено: ' + (note || t.title));
    }
    fail(w, t, reason) {
      if (t.status !== 'Active') return; t.status = 'Failed'; t.doneAt = w.now; t.note = reason;
      if (t.who === 'player') { w.player.failed++; w.player.failedToday++; w.player.addRep(w.player.dept, -4); }
      w.events.post({ time: w.now, type: EV.TaskFailed, actor: t.who, target: t.id, severity: 1, quiet: t.who !== 'player', text: w.nameOf(t.who) + ': не выполнено «' + t.title + '» (' + reason + ')' });
      const spec = S.Jobs.J[t.kind]; if (spec && spec.fail) spec.fail(w, t.who === 'player' ? 'player' : w.npc(t.who), t);
      if (t.decision && w.life) w.life.resolve(t.decision, 'не выполнено: ' + reason);
      if (w.life) w.life.taskFailed(t, reason);
    }
    tick(w) { for (const t of this.list) if (t.status === 'Active' && t.deadline > 0 && w.now > t.deadline) this.fail(w, t, 'истёк срок'); }
  }

  // ------------------------------------------------------------------ the facility AI
  class SCPLife {
    constructor(w) {
      this.w = w; this.decisions = []; this.nextDec = 1; this.due = {}; this.t = 0;
      this.sightings = []; this.cases = []; this.nextCase = 1; this.requests = []; this.nextReq = 1; this.reports = [];
      this.arrivals = [{ scp: 'SCP-LF-147', notice: Hm(6) + 1440, eta: Hm(14) + 1440, stage: 'planned', origin: 'Филиал «Восток-2»' }, { scp: 'SCP-LF-148', notice: Hm(10) + 3 * 1440, eta: Hm(16) + 3 * 1440, stage: 'planned', origin: 'Полевая операция МОГ «Ключ-9»' }];
      this.transport = []; this.agenda = []; this.nextAg = 1; this.planned = []; this.happened = []; this.stories = []; this.restrictions = []; this.short = {}; this.night = { day: -1, plan: [] };
      this.res = { budget: { science: 100, security: 100, engineering: 90, medical: 60, service: 60 }, materials: 60, equipment: 40 };
      this.priorities = { science: 1, safety: 1, maintenance: 1 };
      this.calmSince = -1; this.lastEmergency = -1e4; this.lastInvestigate = -1e4; this.radioCheck = -1;
    }
    get now() { return this.w.now; }
    every(key, min) { const w = this.w; if ((this.due[key] || 0) > w.now) return false; this.due[key] = w.now + min; return true; }

    // ---------------------------------------------------------------- decision log
    decide(cause, data, decision, assigned, extra) {
      const d = Object.assign({ id: 'D' + this.nextDec++, t: this.now, cause, data: data || [], decision, assigned: assigned || '—', result: null, cons: [] }, extra || {});
      this.decisions.push(d); if (this.decisions.length > 250) this.decisions.shift(); return d;
    }
    resolve(id, result, cons) { const d = typeof id === 'string' ? this.decisions.find(x => x.id === id) : id; if (!d) return; if (!d.result) d.result = result; if (cons) d.cons.push(cons); }
    issue(kind, who, opts, by, deadline, extra) {
      const w = this.w, obj = who === 'player' ? 'player' : w.npc(who); if (!obj) return null;
      const job = S.Jobs.build(w, kind, obj, opts || {}); if (!job) return null;
      const t = Object.assign(job, { who: who === 'player' ? 'player' : obj.id, by: by || 'SCP LIFE', deadline: deadline ? w.now + deadline : 0 }, extra || {});
      if (obj !== 'player') this.tempAccess(obj, t, deadline || 240);
      return w.tasks.issue(w, t);
    }
    // Duties sometimes lead into rooms the position does not open: SCP LIFE grants temporary access for the job.
    tempAccess(n, t, minutes) {
      const w = this.w, card = w.card(n.cardId); if (!card) return;
      for (const s of t.steps) {
        if (!s.room || w.reachable(n, s.room)) continue;
        const room = w.fac.room(s.room); let lvl = 0, perms = 0; for (const id of room.doorIds) { const d = w.fac.door(id); if (d.isTransit) continue; const rq = d.reqFrom(d.other(room.id)); lvl = Math.max(lvl, rq.min, d.restricted ? 3 : 0); perms |= rq.anyOf; }
        for (const id of room.doorIds) { const d = w.fac.door(id), o = w.fac.room(d.other(room.id)); if (o && o.type !== 'Corridor' && o.type !== 'Tunnel') for (const id2 of o.doorIds) { const d2 = w.fac.door(id2); if (d2.isTransit) continue; const rq = d2.reqFrom(d2.other(o.id)); lvl = Math.max(lvl, rq.min, d2.restricted ? 3 : 0); perms |= rq.anyOf; } }
        if (lvl > 3) lvl = 3;
        card.tempLevel = Math.max(card.tempUntil > w.now ? card.tempLevel : 0, lvl); card.tempPerms = (card.tempUntil > w.now ? card.tempPerms : 0) | perms; card.tempUntil = Math.max(card.tempUntil, w.now + minutes);
        w.lockEpoch++;
        this.decide('Временный допуск', [n.displayName + ': задание «' + t.title + '»', 'помещение «' + room.name + '» закрыто для должности'], 'Допуск L' + lvl + ' (' + S.permList(perms) + ') до ' + fmtTime(card.tempUntil), n.displayName);
      }
    }
    happen(kind, data) { this.happened.push({ kind, t: this.now, data }); if (this.happened.length > 120) this.happened.shift(); }

    // ---------------------------------------------------------------- staff helpers
    onDuty(prof, filter) { const w = this.w, o = []; for (const n of w.active) { if (n.prof !== prof || n.incap(w.now) || n.isSick(w.now) || n.restricted) continue; const b = S.People.block(w, n); if (b.activity !== 'Duty' && b.activity !== 'Eat' && b.activity !== 'Arrive') continue; if (filter && !filter(n)) continue; o.push(n); } return o; }
    free(list) { const w = this.w; return list.filter(n => !w.tasks.activeFor(n.id).length).sort((a, b) => b.traits.diligence - a.traits.diligence); }
    pick(profs, near, filter) {
      let best = null, bs = -Infinity;
      for (const p of profs) for (const n of this.onDuty(p, filter)) {
        const busy = this.w.tasks.activeFor(n.id).length; let s = n.traits.diligence * 5 - busy * 10 - n.psy.fatigue * 0.05;
        if (near) { const d = this.w.fac.roomDistance(n.agent.roomId, near); s -= (d === Infinity ? 20 : d); }
        if (s > bs) { bs = s; best = n; }
      }
      return best;
    }
    playerIs(...profs) { const p = this.w.player; return !p.dead && p.onShift && profs.indexOf(p.prof) >= 0; }
    // Give a duty either to the player (if the profession matches and the player is free) or to an NPC.
    assign(kind, profs, opts, by, deadline, near, extra) {
      const w = this.w, p = w.player;
      if (profs.indexOf(p.prof) >= 0 && this.playerIs(p.prof) && w.tasks.activeFor('player').length < 2 && (!extra || !extra.npcOnly) && w.rng.chance(0.6)) { const t = this.issue(kind, 'player', opts, by, deadline, extra); if (t) return t; }
      const n = this.pick(profs, near); if (!n) return null;
      return this.issue(kind, n.id, opts, by, deadline, extra);
    }
    shortage(dept) { return this.short[dept] || 0; }
    deptStress(dept) { return Math.min(12, (this.short[dept] || 0) * 3); }

    // ---------------------------------------------------------------- main loop
    tick(dt) {
      this.t -= dt; if (this.t > 0) return; this.t = 1;
      const w = this.w;
      if (this.every('security', 2)) this.security();
      if (this.every('containment', 5)) this.containment();
      if (this.every('maintenance', 5)) this.maintenance();
      if (this.every('staffing', 15)) this.staffing();
      if (this.every('research', 30)) this.research();
      if (this.every('arrivals', 10)) this.arrivalTick();
      if (this.every('meetings', 5)) this.meetingTick();
      if (this.every('playerDuty', 6)) this.playerDuties();
      if (this.every('stories', 20)) this.storyTick();
      if (this.every('cases', 30)) this.caseTick();
      const mod = w.clock.mod, day = w.clock.day;
      if (mod >= Hm(23) && this.night.day !== day) this.planNight();
      if (mod >= Hm(23, 30) && this.evalDay !== day) { this.evalDay = day; this.careerDay(); }
      if (mod >= Hm(6) && this.planDay !== day) { this.planDay = day; this.dayPlan(); }
      this.runPlanned();
    }

    // ---------------------------------------------------------------- security
    security() {
      const w = this.w, now = w.now;
      let breach = false, hostile = false, restless = false;
      for (const a of w.anomalies) { if (!a.arrived) continue; if (!a.contained && a.detected) { breach = true; if (a.temper === 'aggressive') hostile = true; } if (a.tm && S.Tallyman.ORDER.indexOf(a.tm.state) >= 2) restless = true; }
      if (w.alert.level === 3 && !hostile) { w.alert.lower(w, breach ? 1 : 1, 'Объект возвращён в камеру содержания'); this.calmSince = now; }
      else if (!breach && !restless && !this.restrictions.length) { if (this.calmSince < 0) this.calmSince = now; if (w.alert.level > 0 && now - this.calmSince >= 60) w.alert.lower(w, 0, 'Показатели в норме'); }
      else this.calmSince = -1;
      // lost cards → reissue
      for (const n of w.active) {
        if (n.cardLostAt < 0 || now - n.cardLostAt < 30) continue;
        const old = w.card(n.cardId); if (old && old.holder === n.id) { n.cardLostAt = -1; continue; }
        if (old) old.revoked = true;
        const fresh = Object.assign({}, old || {}, { id: (old ? old.id : 'card.' + n.id) + 'r', owner: n.id, ownerName: n.displayName, revoked: false, holder: n.id, room: null, tempUntil: -1 });
        w.cards[fresh.id] = fresh; n.cardId = fresh.id; n.cardLostAt = -1; n.nextThink = 0; w.lockEpoch++;
        w.events.post({ time: now, type: EV.Announcement, actor: n.id, severity: 1, pub: true, text: 'SCP LIFE: карта ' + (old ? old.id : '') + ' аннулирована, ' + n.displayName + ' получает новую' });
        this.decide('Утеря ключ-карты', ['доклад: ' + n.displayName], 'Аннулировать карту, выдать новую', n.displayName);
      }
      // restrictions expire
      this.restrictions = this.restrictions.filter(r => { if (r.until > now) return true; w.events.post({ time: now, type: EV.Announcement, severity: 0, pub: true, text: 'Ограничение доступа снято: ' + r.text }); for (const d of r.doors || []) { const dd = w.fac.door(d); if (dd) dd.restricted = false; } w.lockEpoch++; return false; });
      // night radio roll call: a silent radio is noticed, a patrol goes to check
      const mod = w.clock.mod;
      if (w.clock.night && Math.floor(mod / 60) !== this.radioCheck && mod % 60 < 5) {
        this.radioCheck = Math.floor(mod / 60);
        for (const n of w.active) if ((n.prof === 'guard' || n.prof === 'patrol') && !n.radioOk && S.People.block(w, n).activity === 'Duty' && !n.radioSilentReported) {
          n.radioSilentReported = now;
          const d = this.decide('Перекличка по рации', [n.displayName + ' не отвечает на вызов', 'последнее место: ' + w.roomName(n.agent.roomId) + ' (по журналу доступа)'], 'Направить патруль проверить пост', '—');
          const t = this.assign('investigate', ['patrol', 'guard', 'security_officer'], { room: n.agent.roomId, missingGuard: n.id, title: 'Проверить молчащего сотрудника: ' + n.shortName }, 'Диспетчер', 150, n.agent.roomId, { decision: d.id });
          if (t) d.assigned = w.nameOf(t.who);
          w.events.post({ time: now, type: EV.Radio, severity: 1, pub: this.playerIs('dispatcher', 'shift_chief', 'guard', 'patrol', 'cctv_operator'), text: 'Перекличка: ' + n.displayName + ' не отвечает.' });
        }
      }
      // sightings that need a decision
      for (const s of this.sightings) if (!s.handled) this.handleSighting(s);
    }

    // ---------------------------------------------------------------- unconfirmed reports (real vs perceived)
    sighting(reporter, info) {
      const w = this.w, n = w.npc(reporter), r = w.fac.room(info.roomId);
      const s = { id: 'S' + (this.sightings.length + 1), t: w.now, reporter, roomId: info.roomId, sector: r ? r.sector : '?', level: r ? r.level : 3, text: info.text, kind: info.kind, status: 'reported', handled: false, src: info.perceived || null, checks: [] };
      this.sightings.push(s); if (this.sightings.length > 80) this.sightings.shift();
      w.events.post({ time: w.now, type: EV.Sighting, roomId: info.roomId, actor: reporter, severity: 1, pub: this.playerIs('dispatcher', 'shift_chief', 'security_officer', 'cctv_operator', 'director'), text: 'Сообщение (не подтверждено): ' + w.nameOf(reporter) + ' — ' + info.text + ' (' + (r ? r.name : '') + ')' });
      if (n) n.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Sighting, roomId: info.roomId, subject: reporter, text: 'Я видел' + n.G('', 'а') + ': ' + info.text, imp: 0.7, conf: 1, src: 'Witnessed', perceived: info.perceived }, w.now);
      return s;
    }
    handleSighting(s) {
      const w = this.w; s.handled = true;
      const cams = w.camLog.filter(e => e.roomId === s.roomId && Math.abs(e.time - s.t) < 15);
      const camText = w.roomCovered(s.roomId) ? (cams.length ? 'камеры: в помещении только сотрудники (' + cams.map(e => e.name).slice(0, 3).join(', ') + ')' : 'камеры: никого') : 'камер в помещении нет';
      const same = this.sightings.filter(x => x.sector === s.sector && x.level === s.level && this.now - x.t < 360 && x.reporter !== s.reporter);
      const reporters = new Set(same.map(x => x.reporter).concat([s.reporter]));
      const prev = this.sightings.filter(x => x.reporter === s.reporter && x !== s && this.now - x.t < 720).length;
      const d = this.decide('Сообщение сотрудника', [w.nameOf(s.reporter) + ': ' + s.text, camText, prev ? 'повторное сообщение от того же сотрудника (' + (prev + 1) + ')' : 'первое сообщение'], 'Направить патруль на проверку', '—');
      const t = this.assign('investigate', ['patrol', 'guard'], { room: s.roomId, sighting: s.id, title: 'Проверить сообщение: ' + w.roomName(s.roomId) }, 'Диспетчер', 150, s.roomId, { decision: d.id });
      if (t) d.assigned = w.nameOf(t.who);
      s.checks.push(camText);
      if (prev >= 1) {
        const n = w.npc(s.reporter);
        const d2 = this.decide('Сотрудник настаивает на наблюдении', [w.nameOf(s.reporter) + ' сообщает уже ' + (prev + 1) + ' раз(а)', camText], 'Дополнительная проверка: медосмотр и опрос специалистом по меметике', 'начальник смены');
        if (n) { this.assign('medical_exam', ['doctor', 'psychiatrist'], { patient: n.id }, 'Начальник смены', 720, 'medA', { decision: d2.id }); }
      }
      if (reporters.size >= 3) this.psychIncident(s.sector, s.level, same.concat([s]));
    }
    checked(who, task) {
      const w = this.w, room = task.data.room || task.room; const s = this.sightings.find(x => x.id === task.data.sighting);
      const present = w.roomPeople(room).filter(n => n.id !== who).map(n => n.shortName);
      let res;
      if (task.data.missingGuard) { const g = w.npc(task.data.missingGuard); res = g && g.onSite ? g.shortName + ' на месте: ' + (g.radioOk ? 'рация работает' : 'села батарея рации') + '. Происшествия нет.' : 'сотрудника на месте нет'; if (g && !g.radioOk) { this.closeFalseAlarm('radio', g.shortName + ': разряжена рация', g.id); g.say('Рация села, не заметил. Виноват.', w.now); if (w.infra) w.infra.radios[g.id].bat = 60; g.radioOk = true; g.radioSilentReported = 0; } }
      else res = present.length ? 'на месте: ' + present.slice(0, 3).join(', ') + '. Посторонних нет.' : 'помещение пусто, следов нет.';
      if (s) { s.status = 'unconfirmed'; s.checks.push('проверка: ' + res); this.openCase('sighting', 'Неподтверждённое наблюдение: ' + s.text, s.roomId, { cause: s.src ? 'anomalous' : 'human_error', scp: s.src, sighting: s.id }, true); }
      return res;
    }
    psychIncident(sector, level, list) {
      const w = this.w; if (this.restrictions.some(r => r.sector === sector && r.level === level)) return;
      const srcs = list.map(x => x.src).filter(Boolean), src = srcs.length ? srcs[0] : null;
      const d = this.decide('Серия однотипных сообщений', list.slice(-4).map(x => w.nameOf(x.reporter) + ': ' + x.text), 'Психологический инцидент: ограничить доступ в сектор ' + sector + ' на 6 ч, изучить записи, проверить когнитивное воздействие', 'начальник смены, специалист по меметике');
      const doors = w.fac.doorList.filter(x => { const a = w.fac.room(x.roomA), b = w.fac.room(x.roomB); return a.sector === sector && a.level === level && b.sector === sector && b.type === 'Observation'; }).map(x => x.id);
      for (const id of doors) w.fac.door(id).restricted = true; w.lockEpoch++;
      this.restrictions.push({ sector, level, until: this.now + 360, text: 'наблюдательные пункты сектора ' + sector + ' (психологический инцидент)', doors });
      w.alert.raise(w, 1, 'Психологический инцидент в секторе ' + sector, list[list.length - 1].roomId);
      this.assign('access_audit', ['security_officer', 'shift_chief'], {}, 'Начальник безопасности', 180, 'command', { decision: d.id });
      this.assign('exposure_check', ['memetics', 'anomaly_psychologist'], {}, 'Руководитель исследований', 240, null, { decision: d.id });
      this.addAgenda('restrict_sector', 'Ограничения в секторе ' + sector + ' после психологического инцидента', 'Несколько сотрудников независимо сообщили о ' + list[0].text + '. Камеры ничего не подтверждают.', { sector, src });
      this.openCase('psych', 'Психологический инцидент в секторе ' + sector, list[0].roomId, { cause: src ? 'anomalous' : 'natural', scp: src });
      this.startStory('psych_incident', { sector, src });
    }

    // ---------------------------------------------------------------- containment procedures
    containment() {
      const w = this.w, now = w.now, mod = w.clock.mod;
      for (const a of w.anomalies) {
        if (!a.arrived || !a.containRoom) continue;
        const sen = w.infra.sensor(a.containRoom);
        // anomalous readings (possibly from a faulty sensor — SCP LIFE cannot tell yet)
        if (sen && a.contained && !a.tm && sen.motion > 0.8 && sen.em > 0.55 && !this.w.tasks.hasActive('observe_scp', a.id) && now - (a.lastSensorAlarm || -1e4) > 120) {
          a.lastSensorAlarm = now;
          const d = this.decide('Показания датчиков камеры ' + a.id, ['движение ' + sen.motion.toFixed(2), 'ЭМ-фон ' + sen.em.toFixed(2), 'датчики считаются исправными'], 'Жёлтый уровень, внеплановое наблюдение', '—');
          w.alert.raise(w, 1, 'Датчики камеры ' + a.id, a.containRoom);
          const t = this.assign('observe_scp', ['scientist', 'junior_researcher', 'senior_scientist', 'guard'], { target: a.id }, 'SCP LIFE', 180, a.obsRoom, { decision: d.id });
          if (t) d.assigned = w.nameOf(t.who);
          this.openCase('sensor', 'Всплеск датчиков камеры ' + a.id, a.containRoom, { cause: w.infra.sensors[a.containRoom] && w.infra.sensors[a.containRoom].mode !== 'ok' ? 'technical' : 'anomalous', scp: a.id, cell: a.containRoom }, true);
        }
        if (a.def.lifeCheck) a.def.lifeCheck(w, a, this);
        switch (a.id) {
          case 'SCP-L-001': this.tallyman(a, sen); break;
          case 'SCP-LF-121': if (now - a.st.lastAudit > (a.rules.audit || 1440) && !w.tasks.hasActive('records_audit')) { const d = this.decide('Регламент LF-121', ['с последнего аудита ' + durationText(now - a.st.lastAudit)], 'Назначить ручной аудит записей', '—'); const t = this.assign('records_audit', ['memetics', 'sysadmin'], {}, 'SCP LIFE', 240, 'archiveA', { decision: d.id }); if (t) d.assigned = w.nameOf(t.who); else this.resolve(d, 'отложено: нет специалиста на смене'); } break;
          case 'SCP-LF-122': { const lock = this.liftLocked(), door = w.fac.door('t.liftOld'); const fault = w.infra.faults.some(f => !f.fixed && f.kind === 'lift'); const want = lock || fault; if (door.outOfService !== want) { door.outOfService = want; w.lockEpoch++; if (!fault) this.decide('Регламент LF-122', [lock ? 'ночное время' : 'утро'], lock ? 'Блокировка служебного лифта' : 'Лифт введён в эксплуатацию', 'автоматика'); } break; }
          case 'SCP-LF-123': if (now < a.st.ringUntil && !w.tasks.hasActive('answer_phone')) this.assign('answer_phone', ['scientist', 'junior_researcher', 'guard', 'lab_assistant'], {}, 'SCP LIFE', 40, 'obs123'); break;
          case 'SCP-LF-125': if (a.st.out > 0 && !w.tasks.hasActive('collect_paper')) { const nos = w.npc('c.nosova'); const d = this.decide('Бумажные существа вне камеры', ['вне камеры: ' + a.st.out], nos && nos.onSite && !nos.incap(now) ? 'Поручить Носовой (существа ей доверяют)' : 'Поручить сотруднику на смене', '—'); const t = nos && nos.onSite && !nos.incap(now) ? this.issue('collect_paper', nos.id, {}, 'SCP LIFE', 60, { decision: d.id }) : this.assign('collect_paper', ['janitor', 'lab_assistant', 'scientist'], {}, 'SCP LIFE', 60, 'corrC', { decision: d.id }); if (t) d.assigned = w.nameOf(t.who); } if (w.infra.humidity(a.containRoom) > (a.rules.maxHumidity || 40)) { const f = w.infra.faults.find(x => !x.fixed && x.kind === 'humidity' && x.room === a.containRoom); if (f && !f.known) w.infra.discover(f, 'датчик влажности'); } break;
          case 'SCP-LF-126': { const door = w.fac.door('d.cell126'), lock = a.rules.nightLock && S.inRange(mod, Hm(0, 30), Hm(3, 30)); if (door.locked !== lock) { door.locked = lock; if (lock) door.close(); w.lockEpoch++; } break; }
          case 'SCP-LF-127': if (!a.st.covered && now - a.st.uncoveredAt > 25 && !w.tasks.hasActive('cover_mirror')) this.assign('cover_mirror', ['containment_engineer', 'scientist', 'senior_scientist'], {}, 'SCP LIFE', 60, 'obs127'); break;
          case 'SCP-LF-128': if (a.rules.dailyVisit && now - a.st.lastVisit > 1100 && !w.tasks.hasActive('visit_healer')) this.assign('visit_healer', ['orderly', 'doctor', 'anomaly_psychologist', 'biologist'], {}, 'SCP LIFE', 300, 'quarantine'); break;
          case 'SCP-LF-135': if (w.infra.shield('cell135') < (a.rules.shieldCheck ? 85 : 72) && !w.tasks.hasActive('calibrate_sensors')) { const d = this.decide('Экранирование LF-135', ['экран ' + Math.round(w.infra.shield('cell135')) + '%'], 'Калибровка экрана', '—'); const t = this.assign('calibrate_sensors', ['containment_engineer', 'technician'], { cells: ['cell135'] }, 'SCP LIFE', 240, 'obs135', { decision: d.id }); if (t) d.assigned = w.nameOf(t.who); } break;
          case 'SCP-LF-132': if (!w.infra.iso.iso132 && !w.tasks.hasActive('repair', 'iso132')) { const f = w.infra.create('panel', 'obs132', { iso: true, text: 'цепь камеры LF-132 подключена к общей сети' }); if (f) { w.infra.discover(f, 'контроль цепей'); f.isoFix = true; } } break;
        }
      }
      if (this.every('exposure', 720) && !w.tasks.hasActive('exposure_check')) this.assign('exposure_check', ['memetics', 'anomaly_psychologist'], {}, 'SCP LIFE', 300);
    }
    liftLocked() { const a = this.w.anomaly('SCP-LF-122'); return !!(a && a.rules.nightLock && S.inRange(this.w.clock.mod, Hm(0), Hm(5))); }
    tallyman(a, sen) {
      const w = this.w, now = w.now, t = a.tm;
      const unrest = w.alert.level >= 1 && w.alert.roomId === a.containRoom && now - this.lastEmergency >= 45 && now - t.lastSession > 20;
      if ((t.overdue(now) > -40 || unrest) && !w.tasks.hasActive('counting_session') && a.contained) {
        if (unrest) this.lastEmergency = now;
        const sc = this.pickScientist(a);
        const d = this.decide(unrest ? 'Доклад о беспокойстве ' + a.id : 'Регламент сеансов счёта', ['последний сеанс ' + fmtTime(t.lastSession) + ' (' + durationText(now - t.lastSession) + ' назад)', 'ответственные: ' + a.assigned.map(id => w.nameOf(id)).join(', ')], sc ? 'Сеанс счёта' : 'Нет свободного учёного — сеанс отложен', sc ? w.nameOf(sc.id || sc) : '—');
        if (sc) { const tk = this.issue('counting_session', sc === 'player' ? 'player' : sc.id, {}, 'SCP LIFE', 90, { decision: d.id, prio: 5 }); if (!tk) this.resolve(d, 'не удалось назначить'); }
      }
      const door = w.fac.door(t.doorId);
      if (door && door.integrity < 70 && !w.tasks.hasActive('repair_door', door.id)) {
        const tech = this.pick(['containment_engineer', 'mechanic', 'technician']);
        if (tech) { const c = w.card(tech.cardId); if (c) { c.tempLevel = 3; c.tempPerms = (c.tempUntil > now ? c.tempPerms : 0) | S.P.Containment; c.tempUntil = Math.max(c.tempUntil, now + 120); w.lockEpoch++; } const d = this.decide('Датчик замка камеры ' + a.id, ['целостность ' + Math.round(sen ? sen.lock : door.integrity) + '%'], 'Ремонт замка, временный допуск L3 на 2 ч', tech.displayName); this.issue('repair_door', tech.id, { door: door.id }, 'SCP LIFE', 120, { decision: d.id, prio: 4 }); }
      }
      if (a.contained && sen && (sen.em > 0.7 || sen.lock < 50)) w.alert.raise(w, 2, 'Датчики камеры ' + a.id + ': воздействие на замок', a.containRoom);
      const reported = w.alert.level >= 1 && w.alert.roomId === a.containRoom;
      if (reported && a.contained && !w.tasks.hasActive('observe_scp', a.id) && now - this.lastInvestigate > 90) {
        this.lastInvestigate = now;
        this.assign('observe_scp', ['guard', 'scientist', 'senior_scientist'], { target: a.id, title: 'Проверить ' + a.id + ' (доклад)' }, 'SCP LIFE', 120, 'obs');
      }
    }
    pickScientist(a) {
      const w = this.w; let best = null, bs = -Infinity;
      if (this.playerIs('scientist', 'senior_scientist', 'junior_researcher') && (a.assigned.indexOf('player') >= 0 || w.rng.chance(0.3)) && !w.tasks.activeFor('player').some(t => t.kind === 'counting_session')) return 'player';
      for (const n of w.active) {
        if (n.dept !== 'science' || !n.protocol || n.incap(w.now) || n.restricted) continue;
        const b = S.People.block(w, n); const duty = b.activity === 'Duty';
        let s = n.traits.diligence * 10 + (a.assigned.indexOf(n.id) >= 0 ? 15 : 0) + (duty ? 10 : -15); if (n.activity === 'Sleep') s -= 20; s -= n.needs.stress * 0.05 + w.tasks.activeFor(n.id).length * 8;
        if (s > bs) { bs = s; best = n; }
      }
      return best;
    }
    reportAnomaly(w, id, name, e) {
      const a = w.anomaly(e.actor); if (!a || !a.contained) return;
      if (w.alert.level >= 1 && w.alert.roomId === a.containRoom) return;
      w.alert.raise(w, 1, 'Доклад: ' + name + ' — беспокойство ' + a.id, a.containRoom);
      this.decide('Доклад о беспокойстве объекта', [name + ': ' + a.id], 'Жёлтый уровень, внеплановое наблюдение', '—');
    }
    observed(id, a) { this.reportAnomaly(this.w, id, this.w.nameOf(id), { actor: a.id }); }
    procedureBreach(a, text) { const w = this.w; const d = this.decide('Нарушение процедуры ' + a.id, [text], 'Устранить, сделать замечание ответственному', '—'); this.openCase('procedure', 'Нарушение процедуры: ' + text, a.containRoom, { cause: 'human_error', scp: a.id }, true); }

    // ---------------------------------------------------------------- maintenance
    onFault(f) { this.happen('fault', f.kind); }
    onFaultFixed(f, who) { this.newFact('fault_fixed', { fault: f }); if (f.isoFix) this.w.infra.iso.iso132 = true; }
    maintenance() {
      const w = this.w;
      for (const f of w.infra.faults) {
        if (f.fixed || !f.known || w.tasks.hasActive('repair', f.id) || (f.wait || 0) > w.now) continue;
        // repeated failures (no way in, nobody qualified): back off and escalate instead of re-issuing the same order
        const fails = w.tasks.list.filter(t => t.kind === 'repair' && t.status === 'Failed' && t.steps && t.steps.some(s => s.fault === f.id)).length;
        if (fails > (f.fails || 0)) { f.fails = fails; f.wait = w.now + 90 * fails; this.decide('Ремонт ' + f.id + ' не выполнен (' + fails + ')', [f.text, 'исполнитель не смог пройти к месту'], fails >= 3 ? 'Передано начальнику инженерной службы, ремонт в плановое окно' : 'Повтор через ' + 90 * fails + ' мин', '—'); continue; }
        const profs = { electrician: ['electrician', 'technician'], mechanic: ['mechanic', 'technician'], sysadmin: ['sysadmin', 'technician'], containment_engineer: ['containment_engineer', 'technician'] }[f.who] || ['technician'];
        const d = this.decide('Неисправность ' + f.id, [f.text, 'обнаружил: ' + f.knownBy], 'Заявка на ремонт', '—');
        const t = this.assign('repair', profs, { fault: f.id, title: 'Ремонт: ' + f.text }, 'SCP LIFE', 720, f.room, { decision: d.id, prio: f.kind === 'gen' || f.kind === 'sensor' ? 3 : 1 });
        if (t) d.assigned = w.nameOf(t.who); else { this.resolve(d, 'отложено: нет свободного специалиста'); f.wait = w.now + 30; }
      }
    }
    dayPlan() {
      // planned works for the day: a short outage in a lab, a fan replacement, a generator test at night
      const w = this.w, day = w.clock.day;
      const inc = { science: 45, security: 30, engineering: 30, medical: 20, service: 15 }; for (const k in inc) this.res.budget[k] = Math.min(250, (this.res.budget[k] || 0) + inc[k]); this.res.materials += 10;
      const room = w.rng.pick(['lab', 'labC', 'officesC', 'lab2', 'canteen', 'workshop']);
      const at = (day - 1) * 1440 + Hm(w.rng.int(9, 17), w.rng.int(0, 59));
      this.planned.push({ kind: 'outage', room, at, text: 'плановые работы на щите «' + w.roomName(room) + '» (кратковременное отключение света)', profs: ['electrician'], done: false });
      if (day % 2 === 0) this.planned.push({ kind: 'gen_test', at: (day - 1) * 1440 + Hm(15, 10), text: 'проверка резервного генератора', done: false });
      w.infra.addLog('План работ на сутки: ' + this.planned.filter(p => !p.done && p.at > w.now).map(p => fmtTime(p.at) + ' — ' + p.text).join('; '), 'planned');
      this.decide('Суточный план работ', this.planned.filter(p => !p.done && p.at > w.now).map(p => fmtTime(p.at) + ' ' + p.text), 'Работы внесены в график', 'инженерная служба');
    }
    runPlanned() {
      const w = this.w;
      for (const p of this.planned) {
        if (p.done || w.now < p.at) continue; p.done = true;
        if (p.kind === 'outage') { const t = this.assign('planned_maintenance', p.profs || ['electrician'], { room: p.room }, 'График работ', 120, p.room, { npcOnly: true }); if (t) { this.happen('outage', p.room); if (w.rng.chance(0.4)) w.events.post({ time: w.now, type: EV.Announcement, pub: true, severity: 0, text: 'Внимание: ' + p.text + '.' }); } }
        else if (p.kind === 'gen_test') { w.infra.genTest(15); this.happen('gen_test'); }
        else if (p.kind === 'vent') { const rooms = p.rooms; w.infra.outages.push({ rooms, from: w.now, to: w.now + 20, vent: true, planned: true, by: 'mechanic' }); w.infra.addLog('Плановая остановка вентиляции: ' + rooms.map(r => w.roomName(r)).join(', ') + ' (20 мин)', 'vent'); this.happen('vent'); }
        else if (p.kind === 'radio_dead') { const g = w.npc(p.who); if (g && g.onSite) w.infra.dryRadio(g.id); }
        else if (p.kind === 'iso_mistake') { if (!w.anomaly('SCP-LF-132').props.find(x => x.id === 'travels_wires').revealed) { w.infra.iso.iso132 = false; w.infra.addLog('Работы на щите сектора С: цепи переключены по старой схеме', 'planned'); } }
      }
      if (this.planned.length > 60) this.planned = this.planned.filter(p => !p.done || w.now - p.at < 1440);
    }

    // ---------------------------------------------------------------- staffing
    staffing() {
      const w = this.w, now = w.now;
      const need = { guard: 4, cctv_operator: 1, dispatcher: 1, doctor: 1, technician: 1, electrician: 1, patrol: 1 }, h = w.clock.hour;
      if (h >= 8 && h < 18) Object.assign(need, { cook: 2, janitor: 1 }); if (h >= 9 && h < 17) need.scientist = 2;
      this.short = {};
      for (const prof in need) {
        const have = this.onDuty(prof).length + (this.playerIs(prof) ? 1 : 0); if (have >= need[prof]) continue;
        const dept = S.Professions.get(prof).dept; this.short[dept] = (this.short[dept] || 0) + (need[prof] - have);
        const cands = w.npcs.filter(n => n.prof === prof && !n.onSite && !n.isSick(now) && !n.missing && (n.lastCall || -1e4) < now - 1440);
        const d = this.decide('Нехватка персонала: ' + S.Professions.get(prof).name.toLowerCase(), ['на смене ' + have + ' из ' + need[prof], 'отсутствуют: ' + w.npcs.filter(n => n.prof === prof && n.isSick(now)).length + ' на больничном'], cands.length ? 'Вызвать сотрудника из резерва' : 'Продлить смену присутствующим', '—');
        if (cands.length) { const n = cands.sort((a, b) => b.needs.energy - a.needs.energy)[0]; n.lastCall = now; n.overtime = now + 360; S.People.spawn(w, n, n.entry); d.assigned = n.displayName; n.addHistory(now, 'Вызван на смену из-за нехватки персонала', 'personnel'); n.needs.stress = clamp(n.needs.stress + 10, 0, 100); w.events.post({ time: now, type: EV.Personnel, actor: n.id, severity: 0, text: 'SCP LIFE: ' + n.displayName + ' вызван на смену (нехватка: ' + S.Professions.get(prof).name.toLowerCase() + ')' }); }
        else { const on = this.onDuty(prof)[0]; if (on && !(on.overtime > now)) { on.overtime = now + 240; on.psy.fatigue = clamp(on.psy.fatigue + 10, 0, 100); d.assigned = on.displayName; on.addHistory(now, 'Смена продлена на 4 часа', 'personnel'); } else this.resolve(d, 'резерва нет'); }
      }
      // replacement of absent responsible scientists
      for (const a of w.anomalies) {
        if (!a.arrived) continue;
        const present = a.assigned.filter(id => { if (id === 'player') return this.playerIs('scientist', 'senior_scientist', 'junior_researcher', 'biologist', 'memetics', 'anomaly_psychologist'); const n = w.npc(id); return n && !n.isSick(now) && !n.missing; });
        if (present.length || !a.assigned.length) continue;
        const sub = w.npcs.find(n => n.dept === 'science' && !n.isSick(now) && n.prof !== 'lab_assistant' && n.assignedScps.length < 3 && a.assigned.indexOf(n.id) < 0);
        if (!sub) continue;
        a.assigned.push(sub.id); sub.assignedScps.push(a.id);
        this.decide('Ответственные за ' + a.id + ' отсутствуют', a.assigned.slice(0, -1).map(id => w.nameOf(id) + ': ' + (w.npc(id) && w.npc(id).isSick(now) ? 'больничный' : 'нет на месте')), 'Временно назначить замену', sub.displayName);
      }
    }
    onAbsence(n, reason) { this.due.staffing = 0; }
    strandedD(n) {
      const w = this.w; if (w.tasks.hasActive('return_d', n.id) || w.tasks.list.some(t => t.status === 'Active' && t.kind === 'return_d' && t.data.dclass === n.id)) return;
      const d = this.decide('Заключённый вне блока', [n.callsign + ' в «' + w.roomName(n.agent.roomId) + '» не может вернуться'], 'Конвой обратно в блок', '—');
      const t = this.assign('return_d', ['escort', 'guard'], { dclass: n.id, target: n.id }, 'Пост D-2', 180, n.agent.roomId, { decision: d.id, npcOnly: true }); if (t) d.assigned = w.nameOf(t.who);
    }

    // ---------------------------------------------------------------- research
    research() {
      const w = this.w, now = w.now;
      const open = this.requests.filter(r => r.status === 'pending' || r.status === 'ethics' || r.status === 'approved');
      if (open.length < 4) {
        const sci = w.active.filter(n => n.dept === 'science' && n.assignedScps.length && S.People.block(w, n).activity === 'Duty' && n.prof !== 'lab_assistant');
        if (sci.length && w.rng.chance(0.6)) {
          const n = w.rng.pick(sci), a = w.anomaly(w.rng.pick(n.assignedScps));
          if (a && a.arrived) {
            const done = new Set(a.experiments.map(e => e.id).concat(this.requests.filter(r => r.scp === a.id && r.status !== 'rejected').map(r => r.exp)));
            const ex = (a.def.exps || []).find(e => !done.has(e.id)) || (n.traits.curiosity > 0.7 ? w.rng.pick(a.def.exps || []) : null);
            if (ex) this.request(n.id, a.id, ex.id, 'Проверка гипотезы о свойствах ' + a.id);
          }
        }
      }
      // approved requests become tasks for the requester (or another scientist)
      for (const r of this.requests) {
        if (r.status !== 'approved' || r.task) continue;
        const a = w.anomaly(r.scp), ex = (a.def.exps || []).find(e => e.id === r.exp);
        let who = r.by === 'player' ? 'player' : w.npc(r.by); if (who !== 'player' && (!who || !who.onSite || who.isSick(now))) who = this.pick(['scientist', 'senior_scientist', 'biologist'], a.obsRoom);
        if (!who) continue;
        let dclass = null;
        if (ex.dclass) { const d = w.active.find(x => x.role === 'DClass' && !x.escortedBy && x.agent.roomId && (x.hallRoom === 'dhall') && (x.testsDone || 0) < 3 && w.rng.chance(0.5)); if (!d) continue; dclass = d.id; this.assign('escort_d', ['escort', 'guard'], { dclass, to: a.obsRoom || 'dtest', wait: (ex.dur || 15) + 10 }, 'SCP LIFE', 120, 'postD', { npcOnly: false }); }
        const t = this.issue('experiment', who === 'player' ? 'player' : who.id, { target: r.scp, exp: r.exp, request: r.id, dclass }, 'Руководитель исследований', 300);
        if (t) { r.task = t.id; r.status = 'scheduled'; r.dclass = dclass; this.decide('Утверждённая заявка ' + r.id, [r.title, a.id + ': «' + ex.name + '»'], 'Назначить эксперимент', w.nameOf(t.who)); }
      }
    }
    request(by, scp, exp, title) {
      const w = this.w, a = w.anomaly(scp), ex = (a.def.exps || []).find(e => e.id === exp); if (!ex) return null;
      const r = { id: 'R' + this.nextReq++, t: this.now, by, scp, exp, title: ex.name + ' (' + scp + ')', reason: title, status: ex.ethics || ex.dclass ? 'ethics' : 'pending', ethics: !!(ex.ethics || ex.dclass), dclass: !!ex.dclass, cost: 5 + (ex.dur || 10) / 3, notes: [] };
      this.requests.push(r); if (this.requests.length > 60) this.requests = this.requests.filter(x => x.status !== 'done' || this.now - x.t < 2880);
      w.events.post({ time: this.now, type: EV.Research, actor: by, target: scp, severity: 0, quiet: by !== 'player', text: 'Заявка ' + r.id + ' «' + r.title + '» от ' + w.nameOf(by) + (r.ethics ? ' → комитет по этике' : ' → руководителю исследований') });
      if (r.ethics) this.addAgenda('experiment_ethics', 'Заявка ' + r.id + ': ' + r.title, ex.desc, { req: r.id });
      return r;
    }
    pendingEthics() { return this.requests.find(r => r.status === 'ethics') || null; }
    ethicsDecision(r, decision, by) {
      const w = this.w; r.notes.push(w.nameOf(by) + ': ' + decision); if (decision === 'reject') { r.status = 'rejected'; this.cons(r, 'Заявка отклонена этикой'); const n = w.npc(r.by); if (n) { n.needs.stress = clamp(n.needs.stress + 8, 0, 100); n.adjustRel(by, -8); } }
      else { r.status = 'pending'; if (decision === 'volunteer') r.volunteer = true; }
      this.decide('Этическая экспертиза ' + r.id, [r.title, 'решение: ' + decision], decision === 'reject' ? 'Отклонить' : decision === 'volunteer' ? 'Одобрить только с добровольцем' : 'Одобрить', w.nameOf(by));
    }
    approveDecision(r, ok, by) {
      const w = this.w; if (ok && this.res.budget.science < r.cost) { ok = false; r.notes.push('нет бюджета'); }
      r.status = ok ? 'approved' : 'rejected'; if (ok) this.res.budget.science -= r.cost;
      this.decide('Рассмотрение заявки ' + r.id, [r.title, 'бюджет науки: ' + Math.round(this.res.budget.science)], ok ? 'Утвердить' : 'Отклонить', w.nameOf(by));
      if (r.by === 'player') w.notify.push({ time: this.now, type: EV.Research, text: 'Заявка ' + r.id + (ok ? ' утверждена' : ' отклонена') + ' (' + w.nameOf(by) + ')' });
    }
    cons(r, text) { r.notes.push(text); }
    ethicsReview(who) {
      const w = this.w, n = w.npc(who); let k = 0;
      for (const r of this.requests) if (r.status === 'ethics') { if (who === 'player') continue; const strict = n ? n.beliefs.ethics : 0.6; const risk = r.dclass ? 0.6 : 0.3; const dec = strict > 0.75 && risk > 0.5 ? (w.rng.chance(0.5) ? 'reject' : 'volunteer') : strict > 0.6 && r.dclass ? 'volunteer' : 'approve'; this.ethicsDecision(r, dec, who); k++; }
      return k ? 'рассмотрено заявок: ' + k : 'новых заявок нет';
    }
    approvals(who) {
      const w = this.w, n = w.npc(who); let k = 0;
      for (const r of this.requests) if (r.status === 'pending') { if (who === 'player') continue; const b = n ? n.beliefs : { science: 0.6, ethics: 0.5, safety: 0.5 }; const ok = b.science + 0.35 - (r.dclass ? b.ethics * 0.3 : 0) - (w.anomaly(r.scp).threat > 50 ? b.safety * 0.3 : 0) > 0.45; this.approveDecision(r, ok, who); k++; }
      return k ? 'рассмотрено заявок: ' + k : 'новых заявок нет';
    }
    experimentDone(who, a, rec, reqId) {
      const w = this.w, r = this.requests.find(x => x.id === reqId); if (r) { r.status = 'done'; r.result = rec.text; }
      if (who === 'player') { w.player.reportsPending = (w.player.reportsPending || 0) + 1; w.player.addRep('science', 3); w.player.experiments++; }
      else { const n = w.npc(who); if (n) { n.reportsPending = (n.reportsPending || 0) + 1; n.obsNotes = (n.obsNotes || []).concat({ scp: a.id, t: w.now, text: rec.text }).slice(-6); if (rec.dclass) n.addHistory(w.now, 'Провёл эксперимент с участием ' + w.nameOf(rec.dclass), 'research', a.id); } }
      if (rec.dclass) { const d = w.npc(rec.dclass); if (d) { d.psy.fear = clamp(d.psy.fear + 25, 0, 100); d.needs.stress = clamp(d.needs.stress + 20, 0, 100); d.addHistory(w.now, 'Участвовал в эксперименте с ' + a.id, 'research', a.id); } }
      if (rec.revealed.length) this.happen('discovery', a.id);
    }
    reportWritten(who, scp) {
      const w = this.w; const q = who === 'player' ? clamp(0.5 + (w.player.lastReportQuality || 0.3), 0, 1) : (() => { const n = w.npc(who); return n ? clamp(n.traits.diligence * 0.6 + n.psy.focus * 0.4, 0, 1) : 0.5; })();
      const a = w.anomaly(scp) || (who !== 'player' && w.npc(who) && w.npc(who).obsNotes && w.npc(who).obsNotes.length ? w.anomaly(w.npc(who).obsNotes[w.npc(who).obsNotes.length - 1].scp) : null);
      if (a) a.knowledge = clamp(a.knowledge + 2 + q * 4, 0, 100);
      const rep = { id: 'RP' + (this.reports.length + 1), t: w.now, by: who, scp: a ? a.id : null, q, reviewed: false };
      this.reports.push(rep); if (this.reports.length > 80) this.reports.shift();
      if (who === 'player') { w.player.reportsDone++; w.player.reportsPending = Math.max(0, (w.player.reportsPending || 0) - 1); w.player.addRep('science', q > 0.6 ? 3 : 1); }
      else { const n = w.npc(who); if (n) { n.reportsDone = (n.reportsDone || 0) + 1; n.reportsPending = Math.max(0, (n.reportsPending || 0) - 1); } }
      return 'отчёт ' + rep.id + (a ? ' по ' + a.id : '') + ', качество ' + Math.round(q * 100) + '%';
    }
    reviewReports(who) {
      const w = this.w; let k = 0;
      for (const r of this.reports) { if (r.reviewed) continue; r.reviewed = true; k++; if (r.q > 0.8) this.commend(r.by, 'качественный научный отчёт ' + r.id, who); else if (r.q < 0.35) this.reprimand(r.by, 'небрежный отчёт ' + r.id, who); }
      return k ? 'проверено отчётов: ' + k : 'новых отчётов нет';
    }
    onDiscovery(a, p, by) {
      const w = this.w; this.decide('Новые данные об объекте ' + a.id, [p.text, 'источник: ' + w.nameOf(by)], p.rule ? 'Обновить процедуры содержания' : 'Внести в досье', 'руководитель исследований');
      if (by === 'player') { w.player.discoveries++; w.player.addRep('science', 5); }
      if (a.id === 'SCP-LF-125' && p.id === 'calming') this.addAgenda('therapy', 'Использовать LF-125 для снятия стресса персонала?', 'Наблюдение за существами снижает стресс. Комитет по этике сомневается: зависимость персонала от аномалии, риск для существ.', { scp: a.id });
      if (a.id === 'SCP-LF-128' && p.id === 'heals') this.addAgenda('healer', 'Допустить лечение сотрудников объектом LF-128?', 'Исцеление надёжно, побочные эффекты непредсказуемы.', { scp: a.id });
      this.newFact('discovery', { scp: a.id, prop: p.id });
    }

    // ---------------------------------------------------------------- arrivals of new anomalies
    arrivalTick() {
      const w = this.w, now = w.now;
      for (const ar of this.arrivals) {
        const a = w.anomaly(ar.scp); if (!a) continue;
        if (ar.stage === 'planned' && now >= ar.notice) {
          const cell = w.fac.room('heavyCell4').vacant ? 'heavyCell4' : null;
          ar.stage = 'notice'; ar.cell = cell; ar.placement = cell ? 'камера Т-1' : 'временная безопасная зона';
          this.log(ar, 'Уведомление о переводе ' + ar.scp + ' «' + a.name + '» из: ' + ar.origin + '. Прибытие ' + fmtStamp(ar.eta) + '.');
          const d = this.decide('Поступление объекта ' + ar.scp, ['класс: ' + a.cls, 'отправитель: ' + ar.origin, 'свободные камеры: ' + (cell ? 'Т-1' : 'нет')], cell ? 'Подготовить камеру Т-1, карантин во временной зоне при задержке' : 'Разместить во временной безопасной зоне до подготовки камеры', 'инженеры, МОГ, логистика, наука');
          ar.decision = d.id; w.events.post({ time: now, type: EV.Arrival, severity: 1, pub: true, text: 'SCP LIFE: ожидается поступление ' + ar.scp + ' «' + a.name + '» (' + ar.origin + ') в ' + fmtTime(ar.eta) + '.' });
          if (cell) { w.fac.room(cell).vacant = false; ar.reserved = true; }
        }
        if (ar.stage === 'notice') {
          if (ar.cell && !ar.prepTask) { if (this.res.materials < 8) { if (!w.tasks.hasActive('deliver')) this.assign('deliver', ['logistician'], { to: 'heavyObs4', from: 'storage4', what: 'материалы для камеры', mat: 10 }, 'SCP LIFE', 240); this.logOnce(ar, 'mat', 'Подготовка камеры ждёт материалы.'); } else { const t = this.assign('prepare_cell', ['containment_engineer', 'technician'], { cell: ar.cell, obs: 'heavyObs4' }, 'SCP LIFE', 720, 'heavyObs4', { prio: 2 }); if (t) { ar.prepTask = t.id; this.res.materials -= 8; this.log(ar, 'Подготовка камеры поручена: ' + w.nameOf(t.who)); } else this.logOnce(ar, 'staff', 'Подготовка камеры задерживается: нет свободного инженера.'); } }
          if (now >= ar.eta) { ar.stage = 'dock'; this.log(ar, 'Транспорт прибыл в приёмный шлюз.'); a.containRoom = 'arrivalDock'; a.agent.roomId = 'arrivalDock'; const dp = w.fac.poi('dock.bay'); a.agent.pos = V.copy(dp.pos); a.arrived = true; a.contained = true; a.init(w); this.happen('arrival', ar.scp); }
        }
        if (ar.stage === 'dock' && !ar.escortTask) {
          const to = ar.cellReady ? ar.cell : 'tempHold';
          const t = this.assign('escort_arrival', ['operative', 'mtf_commander'], { scp: ar.scp, to }, 'Командир МОГ', 120, 'arrivalDock');
          if (t) { ar.escortTask = t.id; ar.to = to; this.log(ar, 'Сопровождение до «' + w.roomName(to) + '»: ' + w.nameOf(t.who)); this.assign('arrival_logistics', ['logistician'], { scp: ar.scp }, 'SCP LIFE', 180, 'arrivalDock'); }
        }
        if (ar.stage === 'temp' && ar.cellReady && !ar.escortTask2) { const t = this.assign('escort_arrival', ['operative'], { scp: ar.scp, to: ar.cell }, 'Командир МОГ', 120, 'tempHold'); if (t) { ar.escortTask2 = t.id; this.log(ar, 'Перевод из временной зоны в камеру: ' + w.nameOf(t.who)); } }
      }
    }
    log(ar, text) { this.transport.push({ t: this.now, scp: ar.scp, text }); if (this.transport.length > 80) this.transport.shift(); (ar.history || (ar.history = [])).push(fmtStamp(this.now) + ' ' + text); }
    logOnce(ar, key, text) { ar.once = ar.once || {}; if (ar.once[key] && this.now - ar.once[key] < 240) return; ar.once[key] = this.now; this.log(ar, text); }
    cellPrepared(cell, who) { const ar = this.arrivals.find(x => x.cell === cell); if (!ar) return; ar.cellReady = true; this.log(ar, 'Камера «' + this.w.roomName(cell) + '» подготовлена (' + this.w.nameOf(who) + ').'); this.happen('cell_ready'); }
    arrivalPaperwork(scp, who) { const ar = this.arrivals.find(x => x.scp === scp); if (ar) this.log(ar, 'Документы поступления оформлены (' + this.w.nameOf(who) + ').'); }
    arrivalMoved(scp, to, who) {
      const w = this.w, ar = this.arrivals.find(x => x.scp === scp), a = w.anomaly(scp); if (!a || !ar) return;
      const room = w.fac.room(to); a.containRoom = to; a.agent.roomId = to; const st = room.pois.find(p => p.type === 'Stand'); a.agent.pos = st ? V.copy(st.pos) : room.center; a.obsRoom = to === 'heavyCell4' ? 'heavyObs4' : null;
      if (to === 'tempHold') { ar.stage = 'temp'; this.log(ar, 'Объект во временной безопасной зоне (' + w.nameOf(who) + '). Ожидает камеру.'); }
      else {
        ar.stage = 'contained'; this.log(ar, 'Объект размещён в «' + room.name + '» (' + w.nameOf(who) + ').'); room.scp = scp; room.name = 'Камера Т-1: ' + scp; w.infra.addSensor(to);
        const sci = w.npcs.filter(n => (n.prof === 'scientist' || n.prof === 'biologist') && n.assignedScps.length < 2 && !n.isSick(w.now)).slice(0, 2);
        for (const n of sci) { n.assignedScps.push(scp); a.assigned.push(n.id); }
        this.log(ar, 'Ответственные учёные: ' + sci.map(n => n.displayName).join(', ') + '.');
        this.assign('calibrate_sensors', ['containment_engineer'], { cells: [to] }, 'SCP LIFE', 300, 'heavyObs4');
        this.resolve(ar.decision, 'объект размещён', 'новые задачи учёным и инженерам');
        w.events.post({ time: w.now, type: EV.Arrival, severity: 1, pub: true, text: scp + ' «' + a.name + '» помещён в камеру. Ответственные: ' + sci.map(n => n.shortName).join(', ') + '.' });
      }
    }

    // ---------------------------------------------------------------- meetings, ethics committee, management
    addAgenda(kind, title, desc, data) {
      if (this.agenda.some(x => x.kind === kind && x.status === 'open' && JSON.stringify(x.data) === JSON.stringify(data))) return null;
      const OPT = {
        experiment_ethics: [['approve', 'Одобрить'], ['volunteer', 'Только с добровольцем'], ['reject', 'Отклонить']],
        restrict_sector: [['keep', 'Сохранить ограничения ещё на 12 ч'], ['pairs', 'Снять, работать только парами'], ['lift', 'Снять ограничения']],
        therapy: [['allow', 'Разрешить сеансы для персонала'], ['limited', 'Только по направлению психиатра'], ['forbid', 'Запретить']],
        healer: [['allow', 'Разрешить с согласия пациента'], ['emergency', 'Только в экстренных случаях'], ['forbid', 'Запретить']],
        budget: [['science', 'Усилить научный отдел'], ['security', 'Усилить безопасность'], ['engineering', 'Усилить инженерную службу']],
        d_refusal: [['replace', 'Заменить испытуемого'], ['postpone', 'Отложить испытание'], ['force', 'Провести принудительно']],
        transfer: [['approve', 'Одобрить перевод'], ['deny', 'Отказать']],
        discipline: [['warning', 'Устное предупреждение'], ['limit', 'Ограничить допуск на сутки'], ['dismiss', 'Закрыть вопрос']],
        night_staffing: [['single', 'Один наблюдатель на последней смене'], ['overtime', 'Сверхурочные для двоих'], ['skip', 'Перенести сеанс']]
      };
      const it = { id: 'A' + this.nextAg++, kind, title, desc, data: data || {}, options: (OPT[kind] || [['yes', 'Да'], ['no', 'Нет']]).map(o => ({ id: o[0], text: o[1] })), status: 'open', t: this.now, votes: {}, playerChoice: null };
      this.agenda.push(it); if (this.agenda.length > 40) this.agenda = this.agenda.filter(x => x.status === 'open' || this.now - x.t < 2880);
      return it;
    }
    agendaPreview() { return this.agenda.filter(x => x.status === 'open').map(x => x.title); }
    meetingTick() {
      const w = this.w, mod = w.clock.mod, day = w.clock.day;
      const open = this.agenda.filter(x => x.status === 'open');
      if (mod >= Hm(9) && mod < Hm(9, 30) && this.meetDay !== day) {
        this.meetDay = day; this.meetEnd = w.now + 35;
        const roles = ['director', 'dept_head', 'research_director', 'shift_chief', 'ethics_inspector', 'mtf_commander'];
        const who = [];
        for (const r of roles) for (const n of this.onDuty(r).slice(0, r === 'dept_head' ? 2 : 1)) { this.issue('meeting', n.id, {}, 'Директор', 150); who.push(n.displayName); }
        if (roles.indexOf(w.player.prof) >= 0 && this.playerIs(w.player.prof)) this.issue('meeting', 'player', {}, 'Директор', 60);
        this.decide('Ежедневное административное совещание', open.map(x => x.title).slice(0, 5), 'Созвать совещание', who.join(', ') || 'нет участников');
        this.happen('meeting');
      }
      if (this.meetEnd && w.now >= this.meetEnd) { this.meetEnd = 0; for (const it of open) this.resolveAgenda(it, 'Административное совещание'); }
      if (mod >= Hm(15) && mod < Hm(15, 30) && this.ethicsDay !== day && open.some(x => x.kind === 'experiment_ethics' || x.kind === 'd_refusal')) {
        this.ethicsDay = day; for (const n of this.onDuty('ethics_inspector')) this.issue('ethics_review', n.id, {}, 'Комитет по этике', 120);
        for (const it of open.filter(x => x.kind === 'experiment_ethics' || x.kind === 'd_refusal')) this.resolveAgenda(it, 'Комитет по этике');
      }
    }
    resolveAgenda(it, body) {
      const w = this.w; if (it.status !== 'open') return;
      const voters = w.active.filter(n => ['director', 'dept_head', 'research_director', 'shift_chief', 'ethics_inspector', 'mtf_commander', 'psychiatrist'].indexOf(n.prof) >= 0 && n.agent.roomId && (n.agent.roomId === 'meeting' || n.activity === 'Meeting' || body === 'Комитет по этике'));
      const score = {}; for (const o of it.options) score[o.id] = 0;
      for (const n of voters) { const b = n.beliefs; for (const o of it.options) score[o.id] += this.voteWeight(it.kind, o.id, b) + w.rng.range(-0.15, 0.15); it.votes[n.id] = null; }
      let choice = it.playerChoice;
      if (!choice) { let best = it.options[0].id, bs = -Infinity; for (const k in score) if (score[k] > bs) { bs = score[k]; best = k; } choice = best; if (!voters.length) choice = it.options[it.options.length - 1].id === 'forbid' ? it.options[1].id : it.options[0].id; }
      it.status = 'decided'; it.decided = choice; it.by = it.playerChoice ? 'player' : body;
      const opt = it.options.find(o => o.id === choice);
      // the people whose position lost are unhappy
      for (const n of voters) { let bestFor = null, bf = -Infinity; for (const o of it.options) { const v = this.voteWeight(it.kind, o.id, n.beliefs); if (v > bf) { bf = v; bestFor = o.id; } } if (bestFor !== choice) { n.needs.stress = clamp(n.needs.stress + 5, 0, 100); for (const m of voters) if (m !== n) n.adjustRel(m.id, -2); } }
      this.applyAgenda(it, choice);
      const d = this.decide(body + ': ' + it.title, [it.desc, 'голосов: ' + voters.length], opt ? opt.text : choice, it.playerChoice ? w.player.name : body);
      w.events.post({ time: w.now, type: EV.Meeting, severity: 0, pub: true, text: body + ': «' + it.title + '» — ' + (opt ? opt.text.toLowerCase() : choice) + '.' });
    }
    voteWeight(kind, opt, b) {
      const T = {
        experiment_ethics: { approve: b.science - b.ethics * 0.6, volunteer: 0.3 + b.ethics * 0.2, reject: b.ethics - b.science * 0.7 },
        restrict_sector: { keep: b.safety - b.science * 0.5, pairs: 0.35 + b.order * 0.1, lift: b.science - b.safety * 0.7 },
        therapy: { allow: b.science * 0.6 - b.ethics * 0.3, limited: 0.35 + b.ethics * 0.1, forbid: b.ethics * 0.6 + b.safety * 0.3 - 0.2 },
        healer: { allow: b.science * 0.5 - b.ethics * 0.2, emergency: 0.4, forbid: b.safety * 0.5 + b.ethics * 0.3 - 0.2 },
        budget: { science: b.science, security: b.safety, engineering: b.order * 0.8 },
        d_refusal: { replace: 0.4 + b.ethics * 0.1, postpone: b.ethics * 0.5, force: b.science * 0.6 - b.ethics * 0.8 },
        transfer: { approve: 0.5, deny: b.order * 0.5 },
        discipline: { warning: 0.4, limit: b.order * 0.6, dismiss: 0.3 - b.order * 0.2 },
        night_staffing: { single: b.science * 0.4 - b.safety * 0.3 + 0.2, overtime: b.safety * 0.5, skip: b.ethics * 0.3 }
      };
      return (T[kind] && T[kind][opt]) || 0;
    }
    applyAgenda(it, c) {
      const w = this.w, d = it.data;
      switch (it.kind) {
        case 'experiment_ethics': { const r = this.requests.find(x => x.id === d.req); if (r && r.status === 'ethics') this.ethicsDecision(r, c, 'e.larionov'); break; }
        case 'restrict_sector': { const r = this.restrictions.find(x => x.sector === d.sector); if (c === 'keep' && r) r.until = this.now + 720; else if (r) { r.until = this.now; if (c === 'pairs') this.pairRule = this.now + 1440; } this.res.budget.science -= c === 'keep' ? 10 : 0; break; }
        case 'therapy': { const a = w.anomaly('SCP-LF-125'); if (a) a.rules.therapy = c; break; }
        case 'healer': { const a = w.anomaly('SCP-LF-128'); if (a) a.rules.healerUse = c; break; }
        case 'budget': this.res.budget[c] = (this.res.budget[c] || 0) + 30; break;
        case 'd_refusal': { const dd = w.npc(d.dclass); if (c === 'force' && dd) { dd.psy.fear = clamp(dd.psy.fear + 20, 0, 100); dd.compliance = Math.max(0, (dd.compliance || 0.5) - 0.2); for (const n of w.active) if (n.role === 'DClass') n.needs.stress = clamp(n.needs.stress + 4, 0, 100); } if (c === 'replace' || c === 'force') { const r = this.requests.find(x => x.id === d.req); if (r) { r.status = 'approved'; r.task = null; } } break; }
        case 'transfer': if (c === 'approve' && d.to) w.player.pendingTransfer = d.to; else w.player.pendingTransfer = null; w.notify.push({ time: this.now, type: EV.Personnel, text: 'Перевод в «' + S.Professions.get(d.to).name + '»: ' + (c === 'approve' ? 'одобрен' : 'отклонён') }); break;
        case 'discipline': if (c === 'limit') w.player.limitUntil = this.now + 1440; break;
        case 'night_staffing': this.nightSession = c; break;
      }
    }
    manage(who) {
      const w = this.w; if (who === 'player') return 'решения приняты через терминал';
      if (this.now - (this.lastManage || -1e4) < 240) return 'ресурсы без изменений'; this.lastManage = this.now;
      const b = this.res.budget, inc = w.events.recent.filter(e => e.severity >= 2 && this.now - e.time < 1440).length;
      const target = inc > 3 ? 'security' : this.short.engineering ? 'engineering' : 'science';
      b[target] += 10; for (const k in b) b[k] = Math.max(0, b[k] - 2);
      this.res.materials += 6; this.res.equipment += 2;
      this.decide('Распределение ресурсов', ['происшествий за сутки: ' + inc, 'нехватка: ' + Object.keys(this.short).join(', ')], 'Приоритет: ' + ({ security: 'безопасность', engineering: 'инженерия', science: 'исследования' })[target], w.nameOf(who));
      return 'приоритет: ' + target;
    }
    attendedMeeting() { return 'совещание проведено'; }
    assignPosts(who) {
      if (who !== 'player' && this.now - (this.lastPosts || -1e4) < 360) return; this.lastPosts = this.now;
      const w = this.w, posts = ['post', 'postA', 'postC', 'postD'], g = this.onDuty('guard'); g.forEach((n, i) => { n.post = posts[i % posts.length]; n.workRoom = n.post; n.routine = null; });
      this.decide('Распределение постов', g.map(n => n.shortName + ' → ' + w.roomName(n.post)).slice(0, 6), 'Посты назначены', w.nameOf(who));
    }
    planOperation(who) { this.decide('План МОГ', ['ожидаемые поступления: ' + this.arrivals.filter(a => a.stage !== 'contained').length], 'Готовность группы', this.w.nameOf(who)); }
    dispatchShift(who) { return 'вызовов обработано: ' + this.w.infra.radioLogList.filter(r => this.now - r.t < 60).length; }
    delivered(data, who) { if (data && data.mat) this.res.materials += data.mat; else this.res.materials += 3; }
    accessAudit(who) {
      const w = this.w, fakes = w.accessLog.filter(e => e.fake && e.r === 'Granted'), notes = [];
      if (fakes.length) { notes.push('проходы по несуществующей карте card.vetrov: ' + fakes.length); this.newFact('vetrov_card', { n: fakes.length }); }
      const pl = w.accessLog.filter(e => e.by === 'player' && e.card !== 'card.player' && this.now - e.t < 1440 && /Granted/.test(e.r));
      if (pl.length && who !== 'player') { notes.push('игрок использовал чужие карты: ' + pl.length); this.reprimand('player', 'проход по чужой ключ-карте', who); }
      return notes.length ? notes.join('; ') : 'нарушений не выявлено';
    }
    camReview(n) {
      const w = this.w, p = w.player; if (p.dead || !p.roomId || !w.roomCovered(p.roomId)) return;
      const card = w.card(p.selectedCardId()), room = w.fac.room(p.roomId); if (!room || !card || card.owner !== 'player') return;
      const allowed = room.doorIds.some(id => { const d = w.fac.door(id); return S.isSuccess(S.checkCard(card, d.reqFrom(d.other(room.id)), w.now)) || d.kind === 'Archway'; });
      if (!allowed && (p.lastCamFlag || -1e4) < w.now - 180) { p.lastCamFlag = w.now; this.reprimand('player', 'нахождение в «' + room.name + '» без допуска (камера, оператор ' + n.shortName + ')', n.id); }
    }

    // ---------------------------------------------------------------- medicine and perception checks
    examined(who, pid) {
      const w = this.w, p = w.npc(pid); if (!p) return 'пациент недоступен';
      const eff = w.horror ? w.horror.effectsOf(pid) : [];
      if (p.psy.exposure > 8 || eff.length) { this.newFact('exposure_confirmed', { who: pid, src: eff.length ? eff[0].src : null }); p.restricted = eff.length > 0; return 'признаки аномального когнитивного воздействия (экспозиция ' + Math.round(p.psy.exposure) + ')' + (eff.length ? '; рекомендована беседа с психиатром' : ''); }
      if (p.psy.fatigue > 70) { this.newFact('fatigue', { who: pid }); return 'сильное переутомление, аномального воздействия не выявлено'; }
      return 'здоров';
    }
    psychEval(who, pid) {
      const w = this.w, p = w.npc(pid); if (!p) return 'пациент недоступен';
      let ended = 0; if (w.horror) for (const e of w.horror.effectsOf(pid).slice()) if (e.end && e.end.therapy) { w.horror.end(pid, e, 'беседа с психиатром'); ended++; }
      p.psy.fear = Math.max(0, p.psy.fear - 30); p.needs.stress = Math.max(0, p.needs.stress - 20); if (!w.horror || !w.horror.effectsOf(pid).length) p.restricted = false;
      p.addHistory(w.now, 'Беседа с психиатром (' + w.nameOf(who) + ')', 'medical');
      return ended ? 'воздействие прекращено' : 'состояние стабилизировано' + (p.restricted ? ', до прекращения эффекта — отстранение' : '');
    }
    exposureCheck(who) {
      const w = this.w, hit = w.active.filter(n => n.psy.exposure > 10 && n.role !== 'DClass');
      for (const n of hit.slice(0, 3)) if (!w.tasks.hasActive('psych_eval', n.id)) this.assign('psych_eval', ['psychiatrist', 'anomaly_psychologist'], { patient: n.id, target: n.id }, 'Специалист по меметике', 900, 'medA');
      if (hit.length) this.decide('Проверка когнитивного воздействия', hit.slice(0, 5).map(n => n.shortName + ': экспозиция ' + Math.round(n.psy.exposure)), 'Направить к психиатру', w.nameOf(who));
      return hit.length ? 'выявлено пострадавших: ' + hit.length : 'воздействия не выявлено';
    }
    requestEscort(n, room) {
      const w = this.w; if (w.tasks.list.some(t => t.status === 'Active' && t.kind === 'stand_guard' && t.data.room === room)) return;
      const d = this.decide('Запрос сопровождения', [n.displayName + ' отказывается входить в «' + w.roomName(room) + '» без охраны', n.history.length ? n.history[0].text : ''], 'Выделить охранника', '—');
      const t = this.assign('stand_guard', ['guard', 'patrol'], { room }, 'Начальник смены', 90, room, { decision: d.id }); if (t) d.assigned = w.nameOf(t.who);
    }
    onRefusal(d, task, escort) {
      const w = this.w; d.addHistory(w.now, 'Отказался идти на испытание', 'discipline');
      const req = this.requests.find(r => r.dclass === d.id && (r.status === 'scheduled'));
      this.decide('Отказ испытуемого ' + d.callsign, ['страх ' + Math.round(d.psy.fear), 'стресс ' + Math.round(d.needs.stress), 'конвоир: ' + escort.shortName], 'Вынести на комитет по этике', 'комитет по этике');
      this.addAgenda('d_refusal', 'Отказ ' + d.callsign + ' от испытания', d.callsign + ' отказался идти на испытание. Конвоир: ' + escort.shortName + '.', { dclass: d.id, req: req ? req.id : null });
    }
    dTestHappened(d, task, escort) { d.testsDone = (d.testsDone || 0) + 1; d.psy.fear = clamp(d.psy.fear + 10, 0, 100); }
    radioCallChecked(n, call) {
      const w = this.w; const caller = w.npc(call.caller);
      const d = this.decide('Вызов по рации не подтверждён', [n.shortName + ' прибыл в «' + w.roomName(call.room) + '» — никого', (caller ? caller.shortName : 'вызывавший') + ' вызова не отправлял' + (caller && !caller.onSite ? ' (вне комплекса)' : '')], 'Проверить журнал радиосвязи', 'офицер безопасности');
      this.openCase('radio', 'Ложный вызов по рации от имени ' + (caller ? caller.shortName : '?'), call.room, { cause: 'anomalous', scp: 'SCP-LF-135' });
    }
    phoneLead(n, a) { const w = this.w; if (w.tasks.hasActive('search_missing')) return; const d = this.decide('Звонок LF-123', ['определитель: ' + n.displayName, 'сотрудник числится пропавшим'], 'Поиск у служебного лифта', 'патруль'); this.assign('search_missing', ['patrol', 'guard', 'operative'], { missing: n.id }, 'SCP LIFE', 60, 'liftOld', { decision: d.id }); }
    searched(id, who) { const w = this.w, n = w.npc(id); if (n && n.missing) { w.returnFromNullFloor(n); return n.shortName + ' найден у дверей служебного лифта'; } return 'никого не найдено'; }
    onPatrol(who, t) { if (who === 'player') this.w.player.patrols++; }
    serverChecked(who) { const st = this.stories.find(s => s.kind === 'old_terminal' && !s.done); if (st && st.stage >= 1) { st.found = true; } }
    taskFailed(t, reason) {
      const w = this.w;
      if (t.who === 'player' && w.player.failedToday >= 3 && !w.player.reprimandedToday) { w.player.reprimandedToday = true; this.reprimand('player', 'систематическое невыполнение заданий', 'shift_chief'); }
      if (t.kind === 'counting_session') this.openCase('procedure', 'Сорван сеанс счёта SCP-L-001', 'obs', { cause: 'human_error' }, true);
    }
    closeFalseAlarm(kind, text, who) { const w = this.w; if (w.horror) w.horror.explain(kind, text, who); }

    // ---------------------------------------------------------------- career, reputation, discipline
    reprimand(who, why, by) {
      const w = this.w;
      if (who === 'player') { const p = w.player; p.reprimands++; p.addRep(p.dept, -6); p.record.push({ t: w.now, kind: 'reprimand', text: why, by: w.nameOf(by) }); w.notify.push({ time: w.now, type: EV.Discipline, severity: 1, text: 'Замечание: ' + why }); if (p.reprimands % 3 === 0) { p.limitUntil = w.now + 720; this.addAgenda('discipline', 'Дисциплина: ' + p.name, 'Третье замечание: ' + why, { who: 'player' }); w.notify.push({ time: w.now, type: EV.Discipline, severity: 2, text: 'Допуск ограничен на 12 часов, назначена проверка офицером безопасности.' }); this.assign('d_interview', ['security_officer'], {}, 'Начальник смены', 300); } }
      else { const n = w.npc(who); if (n) { n.reprimands = (n.reprimands || 0) + 1; n.addHistory(w.now, 'Замечание: ' + why, 'discipline'); n.needs.stress = clamp(n.needs.stress + 8, 0, 100); } }
      w.events.post({ time: w.now, type: EV.Discipline, actor: who, severity: 0, quiet: who !== 'player', text: 'Замечание ' + w.nameOf(who) + ': ' + why });
    }
    commend(who, why, by) {
      const w = this.w;
      if (who === 'player') { const p = w.player; p.commendations++; p.addRep(p.dept, 5); p.record.push({ t: w.now, kind: 'commendation', text: why, by: w.nameOf(by) }); w.notify.push({ time: w.now, type: EV.Personnel, text: 'Благодарность: ' + why }); }
      else { const n = w.npc(who); if (n) { n.commendations = (n.commendations || 0) + 1; n.addHistory(w.now, 'Благодарность: ' + why, 'career'); } }
    }
    careerDay() {
      const w = this.w, p = w.player;
      if (!p.dead && p.prof) {
        const d = p.tasksToday();
        if (d.done >= 4 && d.failed === 0) this.commend('player', 'добросовестная смена (' + d.done + ' заданий)', 'shift_chief');
        p.failedToday = 0; p.reprimandedToday = false; p.daysInRole++;
        const next = S.Professions.get(p.prof).next.find(id => { const r = S.Professions.PROMO[id]; if (!r) return false; return p.repOf(p.dept) >= r.rep && p.tasksInRole >= r.tasks && p.daysInRole >= r.days && (!r.reports || p.reportsDone >= r.reports) && p.reprimands - p.commendations < 2; });
        if (next && p.mode === 'career' && !p.promoOffer) { p.promoOffer = next; w.notify.push({ time: w.now, type: EV.Personnel, severity: 1, text: 'Руководство рассматривает ваше повышение до должности «' + S.Professions.get(next).name + '». Откройте карьеру в КПК.' }); this.decide('Аттестация: ' + p.name, ['репутация ' + Math.round(p.repOf(p.dept)), 'заданий ' + p.tasksInRole, 'дней в должности ' + p.daysInRole], 'Рекомендовать к повышению', 'руководитель отдела'); }
      }
      // NPC careers: one promotion per day if a department lacks a senior role
      const cands = w.npcs.filter(n => n.role !== 'DClass' && (n.tasksDone || 0) >= 12 && S.Professions.get(n.prof).next.length && (n.reprimands || 0) < 2);
      if (cands.length && w.rng.chance(0.5)) { const n = w.rng.pick(cands), to = S.Professions.get(n.prof).next[0]; this.promote(n, to); }
    }
    promote(n, to) {
      const w = this.w, pr = S.Professions.get(to), from = S.Professions.get(n.prof).name;
      n.prof = to; n.level = pr.level; n.title = S.People.TITLES[to]; n.tasksDone = 0; n.routine = null; n.workRoom = w.rng.pick(pr.work);
      const c = w.card(n.cardId); if (c) { c.level = pr.level; c.perms = pr.perms; c.ownerName = n.title + ' ' + n.last; }
      n.addHistory(w.now, 'Повышен: ' + from + ' → ' + pr.name, 'career'); w.lockEpoch++;
      this.decide('Кадровое решение', [n.displayName, from + ' → ' + pr.name], 'Повышение', 'руководитель отдела');
      w.events.post({ time: w.now, type: EV.Personnel, actor: n.id, severity: 0, text: 'Приказ: ' + n.first + ' ' + n.last + ' назначен' + n.G('', 'а') + ' на должность «' + pr.name + '».' });
    }
    attitude(n, p) {
      let a = n.relTo('player') + (p.repOf(n.dept) - 50) / 3 - p.reprimands * 3 + p.commendations * 2;
      if (n.role === 'DClass' && (p.dept === 'security')) a -= 15; if (n.role === 'DClass' && p.prof === 'dclass') a += 10; if (p.prof === 'dclass' && n.role !== 'DClass') a -= 10;
      if (n.dept === 'security' && p.dept === 'science') a -= 3; if (p.prof === 'director' || p.prof === 'dept_head') a += 5;
      return a;
    }

    // ---------------------------------------------------------------- night planning (causal, quiet nights possible)
    planNight() {
      const w = this.w, day = w.clock.day; this.night.day = day; const base = (day - 1) * 1440, plan = [];
      const quiet = w.rng.chance(0.3);
      const nightWorkers = p => w.npcs.filter(n => n.prof === p && n.shift === 'night' && S.People.works(n, day - 1) && !n.isSick(w.now));
      if (!quiet) {
        if (nightWorkers('mechanic').length && w.rng.chance(0.5)) plan.push({ kind: 'vent', at: base + 1440 + Hm(1, w.rng.int(0, 40)), rooms: w.rng.pick([['corrC', 'obs133', 'obs138', 'obs136'], ['corridor', 'obs', 'airlock', 'lab'], ['corr4', 'genMain']]), text: 'плановая остановка вентиляции' });
        if (nightWorkers('electrician').length && w.rng.chance(0.45)) { const room = w.rng.pick(['lab', 'labC', 'officesC', 'lab2']); plan.push({ kind: 'outage', room, at: base + 1440 + Hm(w.rng.int(0, 4), w.rng.int(0, 59)), text: 'ночные работы на щите «' + w.roomName(room) + '»', profs: ['electrician'] }); if (w.rng.chance(0.15)) plan.push({ kind: 'iso_mistake', at: base + 1440 + Hm(4, 30), text: 'переключение цепей сектора С' }); }
        const lazy = w.npcs.filter(n => (n.prof === 'guard' || n.prof === 'patrol') && n.shift === 'night' && S.People.works(n, day - 1) && n.traits.diligence < 0.5);
        if (lazy.length && w.rng.chance(0.4)) { const g = w.rng.pick(lazy); plan.push({ kind: 'radio_dead', who: g.id, at: base + 1440 + Hm(w.rng.int(0, 4), 30), text: 'не заряженная рация (' + g.shortName + ')', hidden: true }); }
      }
      if (day % 2 === 1) plan.push({ kind: 'gen_test', at: base + 1440 + Hm(3, 10), text: 'проверка резервного генератора' });
      // last observation shift: too few night scientists for the 02:00 counting session
      const nsci = w.npcs.filter(n => n.dept === 'science' && n.shift === 'night' && S.People.works(n, day - 1) && !n.isSick(w.now));
      if (nsci.length < 2) { this.addAgenda('night_staffing', 'Последняя смена наблюдения', 'На ночь доступно ' + nsci.length + ' учёных для сеансов счёта SCP-L-001.', { day }); this.decide('Последняя смена наблюдения', ['учёных на ночь: ' + nsci.length], 'Один наблюдатель на сеансах 02:00–06:00', nsci.length ? nsci[0].displayName : 'резерв'); }
      for (const p of plan) this.planned.push(Object.assign({ done: false }, p));
      this.decide('План ночной смены', plan.filter(p => !p.hidden).map(p => fmtTime(p.at) + ' — ' + p.text).concat(quiet ? ['тихая ночь: работ не запланировано'] : []), quiet ? 'Тихая ночь' : 'Ночные работы по графику', 'дежурная смена');
      w.infra.addLog('График ночи: ' + (plan.filter(p => !p.hidden).map(p => fmtTime(p.at) + ' ' + p.text).join('; ') || 'работ нет'), 'planned');
    }

    // ---------------------------------------------------------------- predictions for SCP-LF-124 (built from SCP LIFE records)
    forecastCandidates(fake) {
      const w = this.w, out = [];
      if (fake) out.push(fake);
      for (const p of this.planned) if (!p.done && !p.hidden && p.at > w.now && p.at - w.now < 720) out.push({ text: { outage: 'В «' + w.roomName(p.room) + '» ненадолго погаснет свет.', gen_test: 'Ночью загудит резервный генератор.', vent: 'Станет очень тихо — вентиляция замолчит.' }[p.kind] || 'Будут работы.', kind: p.kind, due: p.at + 60 });
      const a = w.anomaly('SCP-L-001'); if (a && a.tm && a.tm.overdue(w.now) > -60) out.push({ text: 'Счетовод будет стучать в стекло. Скоро.', kind: 'agitation', due: w.now + 180 });
      const sick = w.npcs.filter(n => n.isSick(w.now) && n.dept === 'science').length; if (sick >= 2) out.push({ text: 'Завтра в научном отделе не хватит рук.', kind: 'shortage', due: w.now + 1440 });
      for (const ar of this.arrivals) if (ar.stage === 'notice') out.push({ text: 'Привезут кого-то нового. ' + (ar.cellReady ? 'Его ждут.' : 'Его не успеют встретить как положено.'), kind: 'arrival', due: ar.eta + 120 });
      if (w.clock.mod < Hm(9)) out.push({ text: 'Утром начальство будет спорить. Долго.', kind: 'meeting', due: w.now + 600 });
      return out;
    }
    checkPrediction(p) {
      const kind = String(p.kind).replace(/^lie:/, ''), hit = this.happened.some(h => h.t >= p.t && h.t <= p.due + 60 && h.kind === kind);
      if (kind === 'agitation') { const a = this.w.anomaly('SCP-L-001'); return p.lie ? !(a.tm.d > 50) : a.tm.d > 50 || this.happened.some(h => h.kind === 'agitation' && h.t >= p.t); }
      if (kind === 'shortage') return (Object.values(this.short).reduce((a, b) => a + b, 0) > 0) !== !!p.lie;
      return p.lie ? !hit : hit;
    }

    // ---------------------------------------------------------------- investigations
    openCase(kind, title, roomId, truth, quiet) {
      const w = this.w;
      if (this.cases.some(c => c.kind === kind && c.roomId === roomId && c.status !== 'closed' && this.now - c.t < 240)) return null;
      const c = { id: 'C' + this.nextCase++, kind, title, roomId, t: this.now, truth: truth || { cause: 'natural' }, status: 'open', evidence: [], hyp: {}, conclusion: null, by: null, facts: [], history: [] };
      this.collect(c);
      this.cases.push(c); if (this.cases.length > 40) this.cases = this.cases.filter(x => x.status !== 'closed' || this.now - x.t < 4320);
      if (!quiet || kind === 'breach') { w.events.post({ time: this.now, type: EV.Investigation, roomId, severity: 0, pub: this.playerIs('security_officer', 'shift_chief', 'director', 'dept_head'), text: 'Открыто расследование ' + c.id + ': ' + title }); }
      const off = this.pick(['security_officer', 'shift_chief']); if (off && !this.playerIs('security_officer')) { c.by = off.id; c.due = this.now + w.rng.range(120, 360); }
      else if (this.playerIs('security_officer', 'shift_chief')) this.issue('investigate', 'player', { room: roomId, caseId: c.id, title: 'Расследование ' + c.id + ': осмотр места' }, 'Начальник смены', 300);
      return c;
    }
    collect(c) {
      const w = this.w, t0 = c.t, room = w.fac.room(c.roomId), doorIds = room ? room.doorIds : [];
      const add = (src, text, sup) => { if (c.evidence.some(e => e.text === text)) return; c.evidence.push({ src, text, sup, t: this.now }); for (const k in sup) c.hyp[k] = (c.hyp[k] || 0) + sup[k]; };
      // sensors
      const cell = c.truth.cell || (room && room.type === 'Containment' ? room.id : null) || (c.truth.scp && w.anomaly(c.truth.scp) ? w.anomaly(c.truth.scp).containRoom : null);
      if (cell && w.infra.sensors[cell]) { const s = w.infra.sensors[cell].last || w.infra.sensor(cell); if (s) add('датчики', 'Датчики «' + w.roomName(cell) + '»: движение ' + s.motion.toFixed(2) + ', ЭМ ' + s.em.toFixed(2) + ', замок ' + s.lock + '%', s.em > 0.5 ? { anomalous: 0.4, technical: 0.3 } : { natural: 0.2, human_error: 0.1 }); }
      // door history
      const acc = w.accessLog.filter(e => doorIds.indexOf(e.door) >= 0 && Math.abs(e.t - t0) < 45).slice(-6);
      for (const e of acc) add('журнал дверей', fmtTime(e.t) + ' ' + w.fac.door(e.door).name + ': ' + e.owner + ' — ' + (S.RESULT_TEXT[e.r] || e.r), e.fake ? { anomalous: 0.6, sabotage: 0.3 } : /Denied/.test(e.r) ? { human_error: 0.15 } : { natural: 0.05 });
      if (!acc.length && doorIds.length) add('журнал дверей', 'В интервале ±45 мин проходов через двери «' + (room ? room.name : '') + '» нет', { information_gap: 0.2 });
      // cameras
      const cams = w.camLog.filter(e => e.roomId === c.roomId && Math.abs(e.time - t0) < 30).slice(-5);
      if (w.roomCovered(c.roomId)) { if (cams.length) for (const e of cams) add('камеры', fmtTime(e.time) + ' ' + e.cam + ': ' + e.name + (e.note ? ' — ' + e.note : ''), e.flag ? { anomalous: 0.3, sabotage: 0.1 } : { natural: 0.1 }); else add('камеры', 'Камеры помещения не зафиксировали ничего необычного', c.kind === 'sighting' || c.kind === 'psych' ? { anomalous: 0.3, human_error: 0.3 } : { information_gap: 0.2 }); }
      else add('камеры', 'Помещение не покрыто камерами', { information_gap: 0.4 });
      // staff reports and timeline
      for (const e of w.events.recent) { if (Math.abs(e.time - t0) > 60 || (e.roomId !== c.roomId && e.type !== EV.Radio)) continue; if (e.type === EV.Report || e.type === EV.Sighting) add('доклады', fmtTime(e.time) + ' ' + e.text, e.type === EV.Sighting ? { anomalous: 0.25, human_error: 0.25 } : { natural: 0.05 }); }
      if (c.kind === 'radio') { const rl = w.infra.radioLogList.filter(r => r.fake && Math.abs(r.t - t0) < 60); for (const r of rl) add('радиожурнал', fmtTime(r.t) + ' вызов от имени ' + w.nameOf(r.from) + ': «' + r.text + '»', { sabotage: 0.4, human_error: 0.2, anomalous: 0.2 }); const caller = rl.length ? w.npc(rl[0].from) : null; if (caller) add('табель', caller.shortName + (caller.onSite ? ' в это время находил' + caller.G('ся', 'ась') + ' в «' + w.roomName(caller.agent.roomId) + '»' : ' в это время был вне комплекса'), caller.onSite ? { sabotage: 0.2 } : { anomalous: 0.4, technical: 0.2 }); const a = w.anomaly('SCP-LF-135'); if (a && a.props.find(p => p.id === 'source_located').revealed) add('пеленгация', 'Пеленг ложных вызовов указывает на камеру LF-135', { anomalous: 1.2 }); }
      if (c.kind === 'sensor' && w.infra.sensors[cell] && w.infra.sensors[cell].mode === 'ok' && w.infra.sensors[cell].cal > t0) add('калибровка', 'Датчики откалиброваны после происшествия', { technical: 0.2 });
      c.timeline = w.events.recent.filter(e => Math.abs(e.time - t0) < 60 && (e.roomId === c.roomId || e.severity >= 2) && !e.quiet).slice(-10).map(e => fmtTime(e.time) + ' ' + e.text);
    }
    newFact(kind, data) {
      const w = this.w;
      for (const c of this.cases) {
        let text = null, sup = null;
        if (kind === 'sensor_fault' && (c.kind === 'sensor' || c.truth.cell === data.cell) && (c.truth.cell === data.cell || (c.truth.scp && w.anomaly(c.truth.scp) && w.anomaly(c.truth.scp).containRoom === data.cell))) { text = 'Калибровка выявила дефект датчика «' + w.roomName(data.cell) + '»: ' + data.mode; sup = { technical: 1.5 }; }
        if (kind === 'exposure_confirmed' && (c.kind === 'sighting' || c.kind === 'psych') && w.events.recent.some(e => e.actor === data.who && e.type === EV.Sighting)) { text = 'Медосмотр: у свидетеля ' + w.nameOf(data.who) + ' признаки когнитивного воздействия'; sup = { anomalous: 1.2 }; }
        if (kind === 'fatigue' && (c.kind === 'sighting')) { text = 'Медосмотр: свидетель ' + w.nameOf(data.who) + ' сильно переутомлён'; sup = { human_error: 0.6 }; }
        if (kind === 'discovery' && c.truth.scp === data.scp) { text = 'Новые данные исследований ' + data.scp + ' (' + data.prop + ')'; sup = { anomalous: 0.8 }; }
        if (kind === 'vetrov_card' && c.kind === 'ghost') { text = 'Аудит доступа: карта card.vetrov в системе не выпускалась'; sup = { anomalous: 1 }; }
        if (!text || c.facts.indexOf(text) >= 0) continue;
        c.facts.push(text); c.evidence.push({ src: 'новый факт', text, sup, t: this.now }); for (const k in sup) c.hyp[k] = (c.hyp[k] || 0) + sup[k];
        if (c.status === 'closed' && c.conclusion && this.topHyp(c) !== c.conclusion) { c.status = 'reopened'; c.history.push(fmtStamp(this.now) + ' дело пересмотрено: ' + text); w.events.post({ time: this.now, type: EV.Investigation, severity: 0, pub: this.playerIs('security_officer', 'shift_chief', 'director'), text: 'Расследование ' + c.id + ' пересмотрено: ' + text }); }
      }
    }
    topHyp(c) { let best = 'natural', bs = -1; for (const k in c.hyp) if (c.hyp[k] > bs) { bs = c.hyp[k]; best = k; } return best; }
    caseTick() {
      const w = this.w;
      for (const c of this.cases) {
        if (c.status === 'closed') continue;
        if (this.now - c.t < 120) this.collect(c);
        if (c.by && c.by !== 'player' && c.due && this.now >= c.due) { const h = this.topHyp(c); this.conclude(c, h, c.by); }
        else if (c.status === 'reopened' && c.by && c.by !== 'player') this.conclude(c, this.topHyp(c), c.by);
      }
    }
    conclude(c, hyp, by) {
      const w = this.w; c.conclusion = hyp; c.status = 'closed'; c.closedBy = by; c.closedAt = this.now;
      const correct = hyp === c.truth.cause; c.correct = correct;
      c.history.push(fmtStamp(this.now) + ' заключение (' + w.nameOf(by) + '): ' + CAUSES[hyp]);
      if (by === 'player') { w.player.cases++; if (correct) { w.player.addRep('security', 6); this.commend('player', 'верное заключение по делу ' + c.id, 'shift_chief'); } else w.player.addRep('security', -2); }
      w.events.post({ time: this.now, type: EV.Investigation, roomId: c.roomId, severity: 0, quiet: by !== 'player', text: 'Дело ' + c.id + ' закрыто: ' + CAUSES[hyp] + '.' });
      return correct;
    }

    // ---------------------------------------------------------------- hidden multi-day stories
    startStory(kind, data) { if (this.stories.some(s => s.kind === kind && !s.done)) return null; const s = { kind, data: data || {}, stage: 0, t: this.now, next: this.now + 60, log: [], done: false }; this.stories.push(s); return s; }
    storyStep(s, text, delay) { s.stage++; s.log.push(fmtStamp(this.now) + ' ' + text); s.next = this.now + (delay || 600); this.w.events.post({ time: this.now, type: EV.Story, severity: 0, quiet: true, text }); }
    storyTick() {
      const w = this.w, now = w.now;
      // triggers
      const v = w.anomaly('SCP-LF-121'); if (v && v.st.ins >= 3) this.startStory('vetrov');
      if (w.clock.day >= 2 && w.rng.chance(0.02)) this.startStory('old_terminal', { cause: w.rng.chance(0.6) ? 'script' : 'lf126' });
      if (w.clock.day >= 2 && w.rng.chance(0.015)) this.startStory('dept_conflict');
      const fork = w.anomaly('SCP-LF-130'); if (fork && fork.st.log && fork.st.log.filter(l => l.gen).length >= 2) this.startStory('sensor_chain');
      for (const a of w.anomalies) if (a.arrived && a.mind.absentees(now + 1440).length && (a.kind === 'sapient' || a.temper === 'friendly') && w.rng.chance(0.05)) this.startStory('absent_regular', { scp: a.id, who: a.mind.absentees(now + 1440)[0] });
      for (const s of this.stories) {
        if (s.done || now < s.next) continue;
        switch (s.kind) {
          case 'vetrov':
            if (s.stage === 0) this.storyStep(s, 'Сотрудники всё чаще упоминают «мл. н. с. Ветрова», которого никто не может найти.', 480);
            else if (s.stage === 1) { if (v.st.ins >= 5) { const t = { kind: 'observe_scp', title: 'Задание для мл. н. с. Ветрова', who: 'vetrov', steps: [{ room: 'archiveA', label: '—', dur: 5 }], si: 0, data: {}, deadline: now + 60, by: 'SCP LIFE' }; w.tasks.issue(w, t); this.decide('Назначение задания', ['сотрудник «Ветров» найден в списке персонала'], 'Задание выдано', 'Ветров Н.'); this.openCase('ghost', 'Задание выдано несуществующему сотруднику', 'archiveA', { cause: 'anomalous', scp: 'SCP-LF-121' }); this.storyStep(s, 'SCP LIFE выдала задание сотруднику «Ветров». Задание не выполнено: такого человека нет.', 600); } else s.next = now + 120; }
            else if (s.stage === 2) { if (v.st.ins === 0) { this.storyStep(s, 'После ручного аудита упоминания Ветрова исчезли. Специалисты по меметике требуют ежедневного аудита.', 60); s.done = true; } else s.next = now + 120; }
            break;
          case 'old_terminal':
            if (s.stage < 3) { if (w.clock.night) { this.storyStep(s, 'В 03:0' + s.stage + ' старый терминал архива снова вывел на печать лист без автора (' + (s.stage + 1) + '-я ночь).', 900); w.infra.addLog('Архив: ночная активность старого терминала', 'info'); } else s.next = now + 60; }
            else if (s.stage === 3) { if (s.found || w.rng.chance(0.2)) { this.storyStep(s, s.data.cause === 'script' ? 'Системный администратор нашёл забытый скрипт резервного копирования, печатавший отчёт по ночам. Загадка оказалась обычной.' : 'Листы с терминала совпали с протоколами ночных заседаний SCP-LF-126. Терминал отключён от сети.', 60); s.done = true; } else s.next = now + 240; }
            break;
          case 'dept_conflict':
            if (s.stage === 0) { this.storyStep(s, 'Научный отдел жалуется: охрана задерживает учёных у наблюдательных пунктов без объяснений.', 720); const a = w.npc('s.pokrovsky'), b = w.npc('g.yastrebov'); if (a && b) { a.adjustRel(b.id, -15); b.adjustRel(a.id, -15); } }
            else if (s.stage === 1) { this.storyStep(s, 'Конфликт вынесен на совещание: наука требует свободного доступа, безопасность — сопровождения.', 600); this.addAgenda('budget', 'Конфликт науки и безопасности: кому усилить ресурсы?', 'Взаимные жалобы отделов.', { story: true }); }
            else { this.storyStep(s, 'Решение совещания принято; отношения отделов остаются натянутыми.', 60); s.done = true; }
            break;
          case 'sensor_chain':
            if (s.stage === 1 && (s.tries = (s.tries || 0) + 1) > 3) { this.storyStep(s, 'Причина повторяющихся ошибок датчиков так и не установлена. Дело отложено до новых данных.', 60); s.done = true; break; }
            if (s.stage === 0) { this.storyStep(s, 'Инженеры заметили: ошибки датчиков в секторе С повторяются в одно и то же время по ночам.', 720); this.openCase('sensor', 'Повторяющиеся ошибки датчиков сектора С', 'corrC', { cause: 'anomalous', scp: 'SCP-LF-130' }); }
            else if (s.stage === 1) { const f = w.anomaly('SCP-LF-130'); if (f.props.find(p => p.id === 'resonance_gen').revealed) { f.rules.dampers = true; this.storyStep(s, 'Причина найдена: камертон LF-130 резонирует с резервным генератором. Установлены демпферы.', 60); s.done = true; } else { this.storyStep(s, 'Версия о неисправной проводке не подтвердилась. Журнал ошибок совпадает с проверками генератора.', 720); s.stage = 1; } }
            break;
          case 'absent_regular': {
            const a = w.anomaly(s.data.scp), p = w.npc(s.data.who);
            if (s.stage === 0) this.storyStep(s, a.id + ' изменил поведение: часами ждёт у стекла в то время, когда обычно приходил' + (p && p.female ? 'а ' : ' ') + w.nameOf(s.data.who) + '.', 720);
            else if (s.stage === 1) this.storyStep(s, 'Психолог аномалий связывает перемену с отсутствием ' + w.nameOf(s.data.who) + (p && p.isSick(now) ? ' (больничный).' : '.'), 900);
            else { if (p && p.onSite) { this.storyStep(s, w.nameOf(s.data.who) + ' вернул' + (p.female ? 'ась' : 'ся') + ' — поведение ' + a.id + ' пришло в норму.', 60); s.done = true; } else s.next = now + 240; }
            break;
          }
          case 'psych_incident':
            if (s.stage === 0) this.storyStep(s, 'Начальник безопасности поручил изучить записи камер сектора ' + s.data.sector + '. Записи чисты.', 240);
            else if (s.stage === 1) this.storyStep(s, 'Учёные предполагают когнитивное воздействие' + (s.data.src ? ' (подозрение на ' + s.data.src + ')' : ', источник не установлен') + '.', 600);
            else { this.storyStep(s, 'Камеры содержания работают штатно, ни один объект не покидал камер. Наблюдение за пострадавшими продолжается.', 60); s.done = true; }
            break;
        }
      }
      if (this.stories.length > 30) this.stories = this.stories.filter(s => !s.done || now - s.t < 4320);
    }

    // ---------------------------------------------------------------- duties of the player (by profession)
    playerDuties() {
      const w = this.w, p = w.player; if (p.dead || !p.prof) return;
      const b = p.dutyBlock(w); p.onShift = b === 'Duty';
      if (!p.onShift || w.alert.level >= 3) return;
      if (w.tasks.activeFor('player').length >= 2) return;
      if (w.now - (p.lastAssigned || -1e4) < 25) return;
      p.lastAssigned = w.now;
      const fake = { prof: p.prof, dept: p.dept, workRoom: p.workRoom, assignedScps: p.assignedScps, reportsPending: p.reportsPending, obsNotes: [], post: p.post, hallRoom: p.hallRoom, agent: { roomId: p.roomId, pos: p.pos } };
      const r = S.Jobs.routine(w, fake);
      if (p.prof === 'dclass') { const kind = w.clock.hour >= 8 && w.clock.hour < 17 ? (w.rng.chance(0.75) ? 'labor' : 'd_chore') : null; if (kind) this.issue(kind, 'player', {}, 'Охрана блока D', 90); return; }
      const t = this.issue(r[0], 'player', r[1] || {}, this.byFor(p.dept), 240);
      if (!t) this.issue('patrol', 'player', {}, this.byFor(p.dept), 240);
    }
    byFor(dept) { return { science: 'Руководитель исследований', security: 'Начальник смены', mtf: 'Командир МОГ', engineering: 'Руководитель инженерной службы', medical: 'Главный врач', admin: 'Директор', service: 'Хозяйственная служба', dclass: 'Охрана блока D' }[dept] || 'SCP LIFE'; }

    save() { const o = Object.assign({}, this); delete o.w; delete o.t; return o; }
    load(o) { const w = this.w; Object.assign(this, o); this.w = w; this.t = 0; }
  }

  S.SCPLife = SCPLife; S.Alert = Alert; S.Tasks = Tasks; S.ALERT_NAMES = ALERT_NAMES; S.CAUSES = CAUSES;
})(typeof window !== 'undefined' ? window : globalThis);
