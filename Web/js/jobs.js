/* SCP LIFE 2.0 — duties of every profession as step-based jobs shared by the player and NPCs, with real effects on the world. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, Hm, EV, fmtTime } = S;
  const J = {};
  const K = (kind, spec) => { J[kind] = Object.assign({ act: 'Work', dur: 15 }, spec); };

  // ------------------------------------------------------------------ helpers
  const info = (w, who) => who === 'player' ? { id: 'player', prof: w.player.prof, pos: w.player.pos, roomId: w.player.roomId, dept: w.player.dept, post: w.player.post, level: w.player.level, n: null } : { id: who.id, prof: who.prof, pos: who.agent.pos, roomId: who.agent.roomId, dept: who.dept, post: who.post, level: who.level, n: who };
  const st = (room, poiType, label, dur, extra) => Object.assign({ room, poiType: poiType || null, poi: null, label, dur: dur || 5, done: false }, extra || {});
  const sp = (poi, label, dur, extra) => Object.assign({ room: poi.roomId, poi: poi.id, poiType: poi.type, label: label || poi.label, dur: dur || 5, done: false }, extra || {});
  const pois = (w, type, filter) => Object.values(w.fac.pois).filter(p => p.type === type && (!filter || filter(p)));
  const sectorOf = (w, roomId) => { const r = w.fac.room(roomId); return r ? r.sector : 'Б'; };
  const levelOf = (w, roomId) => { const r = w.fac.room(roomId); return r ? r.level : 3; };
  function pickN(w, list, k) { const a = list.slice(), out = []; while (a.length && out.length < k) out.push(a.splice(w.rng.int(0, a.length), 1)[0]); return out; }
  function order(list, from) { const out = []; let cur = from; const a = list.slice(); while (a.length) { let bi = 0, bd = Infinity; a.forEach((p, i) => { const d = V.distXZ(cur, p.pos) + Math.abs(cur.y - p.pos.y) * 8; if (d < bd) { bd = d; bi = i; } }); out.push(a[bi]); cur = a[bi].pos; a.splice(bi, 1); } return out; }
  const anomaly = (w, id) => w.anomaly(id);
  const obsOf = (w, a) => a.obsRoom || (w.fac.blocks[a.id] && w.fac.blocks[a.id].obs) || a.containRoom;
  const mood = (w, who) => who === 'player' ? w.player.name : who.displayName;

  // ================================================================== security
  K('patrol', { act: 'Patrol', title: 'Обход сектора', build(w, who, o) {
    const i = info(w, who), sec = o.sector || sectorOf(w, i.post || i.roomId), lvl = o.level || levelOf(w, i.post || i.roomId);
    let c = pois(w, 'PatrolPoint', p => { const r = w.fac.room(p.roomId); return r.sector === sec && r.level === lvl && w.reachable(who, p.roomId); }); if (c.length < 3) c = pois(w, 'PatrolPoint', p => levelOf(w, p.roomId) === lvl && w.reachable(who, p.roomId));
    return order(pickN(w, c, o.count || 4), i.pos).map(p => sp(p, 'Точка «' + p.label + '»', 2, { need: 'hold' }));
  }, done: (w, who, t) => { w.life && w.life.onPatrol(who === 'player' ? 'player' : who.id, t); return 'маршрут пройден'; } });
  K('long_patrol', { act: 'Patrol', title: 'Дальний патруль', build(w, who) {
    const i = info(w, who), c = pois(w, 'PatrolPoint', p => w.reachable(who, p.roomId)); const a = pickN(w, c.filter(p => levelOf(w, p.roomId) === 3), 3).concat(pickN(w, c.filter(p => levelOf(w, p.roomId) === 4), 3));
    return order(a, i.pos).map(p => sp(p, 'Точка «' + p.label + '»', 2, { need: 'hold' }));
  }, done: (w, who, t) => { w.life && w.life.onPatrol(who === 'player' ? 'player' : who.id, t); return 'маршрут пройден'; } });
  K('camera_check', { title: 'Проверка камер', build(w, who) { const i = info(w, who), room = w.fac.room(i.post) && w.fac.room(i.post).type === 'SecurityPost' ? i.post : 'post'; return [st(room, 'GuardPost', 'Просмотреть 4 камеры', 15, { need: 'cams:4', act: 'GuardPost' })]; }, done: () => 'камеры проверены' });
  K('camera_watch', { title: 'Наблюдение за камерами', build: () => [st('command', 'Console', 'Смотреть камеры командного центра', 60, { need: 'cams:6', act: 'GuardPost' })], done: () => 'смена у мониторов' });
  K('post_duty', { act: 'GuardPost', title: 'Дежурство на посту', build(w, who) { const i = info(w, who), room = i.post && w.fac.room(i.post) ? i.post : 'post'; return [st(room, 'GuardPost', 'Нести дежурство (10 мин)', 60, { need: 'stay:10' })]; }, done: () => 'дежурство сдано' });
  K('observe_scp', { act: 'Work', title: 'Наблюдение за объектом', build(w, who, o) {
    const a = anomaly(w, o.target) || w.anomalies.find(x => x.arrived && x.obsRoom); if (!a) return null; const r = obsOf(w, a);
    return [st(r, 'Console', 'Наблюдать ' + a.id, 15, { need: 'observe:' + a.id, scp: a.id })];
  }, tickStep(w, n, t, s) { if (!s.obs) { s.obs = true; const a = anomaly(w, s.scp); if (a) { const txt = a.observe(w, n.id); n.obsNotes = (n.obsNotes || []).concat({ scp: a.id, t: w.now, text: txt }).slice(-6); if (a.threat >= 45 && a.contained) w.life && w.life.observed(n.id, a); } } }, done: (w, who, t) => { if (who !== 'player') who.reportsPending = (who.reportsPending || 0) + 1; return 'наблюдение записано'; } });
  K('escort_d', { act: 'Escort', title: 'Конвой класса D', build(w, who, o) {
    const d = w.npc(o.dclass); if (!d || !d.onSite) return null; const to = o.to || 'dtest', back = d.hallRoom || 'dhall';
    return [st(d.agent.roomId, null, 'Забрать ' + d.callsign, 1, { need: 'escort:' + d.id, pickup: d.id }), st(to, 'Stand', 'Доставить в «' + w.roomName(to) + '»', o.wait || 20, { deliver: d.id }), st(back, null, 'Вернуть ' + d.callsign + ' в блок', 1, { release: d.id })];
  }, done: (w, who, t) => { const d = w.npc(t.data.dclass); if (d) { d.followId = null; d.escortedBy = null; d.nextThink = 0; } return 'конвой завершён'; }, fail(w, who, t) { const d = w.npc(t.data.dclass); if (d) { d.followId = null; d.escortedBy = null; } } });
  K('investigate', { act: 'Respond', title: 'Проверка доклада', build(w, who, o) { const r = o.room || 'corridor'; return [st(r, null, 'Осмотреть «' + w.roomName(r) + '»', 6, { need: 'hold', look: true })]; }, done: (w, who, t) => w.life ? w.life.checked(who === 'player' ? 'player' : who.id, t) : 'проверено' });
  K('access_audit', { title: 'Аудит журнала доступа', build: () => [st('command', 'Console', 'Проверить журнал доступа', 25, { need: 'terminal:access' })], done: (w, who) => w.life ? w.life.accessAudit(who === 'player' ? 'player' : who.id) : 'журнал проверен' });
  K('assign_posts', { title: 'Распределение постов', build: () => [st('command', 'Console', 'Распределить посты смены', 15, { need: 'hold' })], done: (w, who) => { w.life && w.life.assignPosts(who === 'player' ? 'player' : who.id); return 'посты распределены'; } });
  // the MTF lives, trains and waits inside its own sector (equipment room, transport zone, squad prep) — not in the corridors
  K('mtf_drill', { title: 'Учения МОГ', build: (w) => w.fac.room('mtfEquip') ? [st('mtfEquip', 'Workbench', 'Проверка снаряжения', 20, { need: 'hold' }), st('mtfGarage', null, 'Отработка выдвижения', 15, { need: 'hold' })] : [st('mtf', 'Workbench', 'Проверка снаряжения', 20, { need: 'hold' }), st('corr4', null, 'Отработка выдвижения', 15, { need: 'hold' })], done: () => 'учения проведены' });
  K('standby', { act: 'Leisure', title: 'Готовность', build: (w) => [st(w.fac.room('mtfPrep') ? 'mtfPrep' : 'mtf', 'Seat', 'Готовность к выдвижению', 60, { need: 'stay:10' })], done: () => 'дежурство в готовности' });
  K('escort_arrival', { act: 'Escort', title: 'Сопровождение объекта', build(w, who, o) { return [st('arrivalDock', 'Stand', 'Принять объект ' + o.scp, 10, { need: 'hold' }), st(o.to || 'tempHold', 'Stand', 'Доставить в «' + w.roomName(o.to || 'tempHold') + '»', 10, { need: 'hold' })]; }, done: (w, who, t) => { w.life && w.life.arrivalMoved(t.data.scp, t.data.to || 'tempHold', who === 'player' ? 'player' : who.id); return 'объект доставлен'; } });
  K('first_aid', { act: 'Respond', title: 'Первая помощь', build(w, who, o) { const p = w.npc(o.patient); if (!p) return null; return [st(p.agent.roomId, null, 'Помочь: ' + p.shortName, 5, { need: 'talk:' + p.id, patient: p.id })]; }, done(w, who, t) { return S.Med.firstAid(w, who, t.data.patient); } });
  K('plan_operation', { title: 'Планирование операции', build: () => [st('command', 'Console', 'План операции', 25, { need: 'hold' })], done: (w, who) => { w.life && w.life.planOperation(who === 'player' ? 'player' : who.id); return 'план утверждён'; } });

  // ================================================================== engineering
  K('repair', { act: 'Maintenance', title: 'Ремонт', build(w, who, o) { const f = w.infra.fault(o.fault); if (!f) return null; return [st(f.room, f.poiType || null, 'Устранить: ' + f.text, f.dur || 15, { need: 'hold', poi: f.poi || null, fault: f.id })]; }, done(w, who, t) { w.infra.fix(t.data.fault, who === 'player' ? 'player' : who.id); return 'неисправность устранена'; } });
  K('maintenance_round', { act: 'Maintenance', title: 'Обход щитков', build(w, who) {
    const i = info(w, who), lvl = levelOf(w, i.roomId); const c = pois(w, 'Panel', p => levelOf(w, p.roomId) === lvl && w.reachable(who, p.roomId));
    return order(pickN(w, c, 4), i.pos).map(p => sp(p, 'Осмотр: ' + p.label, 4, { need: 'hold', inspect: true }));
  }, stepDone(w, who, t, s) { w.infra.inspect(s.room, who === 'player' ? 'player' : who.id); }, done: () => 'обход завершён' });
  K('power_check', { act: 'Maintenance', title: 'Проверка генератора', build(w, who, o) { const g = o.gen || (w.rng.chance(0.5) ? 'genMain' : 'genC'); const p = w.fac.room(g).pois.find(x => x.type === 'Panel'); return [sp(p, 'Проверка: ' + w.roomName(g), 12, { need: 'hold' })]; }, done(w, who, t) { return w.infra.genCheck(t.steps[0].room, who === 'player' ? 'player' : who.id); } });
  K('planned_maintenance', { act: 'Maintenance', title: 'Плановое отключение', build(w, who, o) { const r = w.fac.room(o.room || 'lab'); const p = r.pois.find(x => x.type === 'Panel') || pois(w, 'Panel', x => w.fac.room(x.roomId).sector === r.sector)[0]; return [sp(p, 'Работы на щите «' + r.name + '»', 12, { need: 'hold', outage: o.room || r.id })]; }, arrive(w, who, t, s) { w.infra.plannedOutage([s.outage], 1.2, who === 'player' ? 'player' : who.id); }, done: () => 'работы выполнены' });
  K('repair_door', { act: 'RepairDoor', title: 'Ремонт замка', build(w, who, o) { const d = w.fac.door(o.door); if (!d) return null; const room = w.fac.room(d.roomA).type === 'Containment' ? d.roomB : d.roomA; return [st(room, null, 'Перебрать замок: ' + d.name, 15, { need: 'hold', door: d.id })]; }, done(w, who, t) { const d = w.fac.door(t.data.door); if (d) { d.integrity = 100; d.faultUntil = 0; if (d.state === S.DS.Open && !w.doorOccupied(d)) d.close(); } w.infra.doorFixed(t.data.door); return 'замок восстановлен'; } });
  K('calibrate_sensors', { title: 'Калибровка датчиков', build(w, who, o) { const cells = (o.cells || w.anomalies.filter(a => a.arrived && a.obsRoom).map(a => a.containRoom)).slice(0, 3); return cells.map(c => { const a = w.anomalies.find(x => x.containRoom === c); return st(a && a.obsRoom ? a.obsRoom : c, 'Console', 'Датчики камеры «' + w.roomName(c) + '»', 8, { need: 'hold', cell: c }); }); }, stepDone(w, who, t, s) { w.infra.calibrate(s.cell, who === 'player' ? 'player' : who.id); }, done: () => 'датчики откалиброваны' });
  K('prepare_cell', { title: 'Подготовка камеры', build(w, who, o) { return [st(o.obs || 'heavyObs4', 'Console', 'Проверка систем камеры', 15, { need: 'hold' }), st(o.cell || 'heavyCell4', 'Stand', 'Монтаж оборудования', 25, { need: 'hold' })]; }, done(w, who, t) { w.life && w.life.cellPrepared(t.data.cell || 'heavyCell4', who === 'player' ? 'player' : who.id); return 'камера подготовлена'; } });
  K('server_check', { title: 'Проверка серверов', build(w) { return pickN(w, w.fac.room('servers').pois.filter(p => p.type === 'Rack'), 2).map(p => sp(p, 'Стойка: журнал ошибок', 8, { need: 'hold' })); }, done(w, who) { return w.infra.serverCheck(who === 'player' ? 'player' : who.id); } });
  K('records_audit', { title: 'Аудит записей', build: () => [st('archiveA', 'Console', 'Ручной аудит журналов (SCP-LF-121)', 30, { need: 'hold' })], done(w, who) { const a = w.anomaly('SCP-LF-121'); const n = a ? a.def.audit(w, a, who === 'player' ? 'player' : who.id, true) : 0; return 'удалено вставок: ' + n; } });
  K('repair_camera', { title: 'Ремонт камеры', build(w, who, o) { const c = w.cams.find(x => x.id === o.cam); if (!c) return null; return [st(c.roomId, null, 'Камера ' + c.name, 15, { need: 'hold' })]; }, done(w, who, t) { w.infra.repairCamera(t.data.cam, who === 'player' ? 'player' : who.id); return 'камера работает'; } });

  // ================================================================== medical
  K('transport_patient', { act: 'Escort', title: 'Сопровождение пациента', build(w, who, o) { const p = w.npc(o.patient); if (!p || p.dead) return null; const to = o.to && w.fac.room(o.to) ? o.to : 'medA'; return [st(p.agent.roomId, null, 'Забрать пациента ' + p.shortName, 2, { need: 'talk:' + p.id, pickup: p.id }), st(to, null, 'Доставить в «' + w.roomName(to) + '»', 3, { deliver: p.id })]; },
    done(w, who, t) { const p = w.npc(t.data.patient); if (p) { p.followId = null; p.escortedBy = null; p.nextThink = 0; S.Med.admit(w, p, t.steps[t.steps.length - 1].room); } return 'пациент доставлен'; } });
  // bodies: the scene is checked and registered, the body goes to the morgue, the pathologist writes the conclusion
  K('body_recovery', { act: 'Work', title: 'Вынос тела', build(w, who, o) { const b = S.Med.body(w, o.body); if (!b || b.inMorgue || b.carriedBy) return null; return [st(b.roomId, null, 'Подойти к телу: ' + b.name, 2, { pos: b.pos, body: b.id, lift: true }), st('morgue', 'Slab', 'Доставить тело в морг', 3, { body: b.id })]; },
    stepDone(w, who, t, s) { if (s.lift && who !== 'player') S.Med.lift(w, who, s.body); }, done(w, who, t) { return S.Med.toMorgue(w, t.data.body, who); } });
  K('scene_check', { act: 'Respond', title: 'Осмотр места происшествия', build(w, who, o) { const b = S.Med.body(w, o.body); if (!b) return null; return [st(o.room || b.roomId, null, 'Осмотреть место: ' + b.name, 6, { pos: b.pos })]; }, done(w, who, t) { const b = S.Med.body(w, t.data.body); S.Med.register(w, b, who === 'player' ? 'player' : who.id); return 'место осмотрено'; } });
  // a person who surrendered is taken to temporary detention
  K('detain', { act: 'Escort', title: 'Задержание', build(w, who, o) { const t = w.npc(o.target); if (!t || t.dead) return null; const cell = ['det1', 'det2', 'det3'].find(id => w.fac.room(id) && !w.active.some(n => n.agent.roomId === id && n !== t)) || 'detHall'; return [st(t.agent.roomId, null, 'Надеть наручники: ' + t.shortName, 1, { need: 'talk:' + t.id, pickup: t.id }), st(cell, null, 'Доставить в камеру задержания', 2, { deliver: t.id })]; },
    done(w, who, t) { const p = w.npc(t.data.target); if (p) { p.followId = null; p.escortedBy = null; p.surrenderUntil = 0; p.detainedUntil = w.now + 720; p.nextThink = 0; p.addHistory(w.now, 'Помещён во временное задержание', 'discipline'); } return 'задержанный в камере'; } });
  K('autopsy', { act: 'Work', title: 'Вскрытие', build(w, who, o) { const b = S.Med.body(w, o.body); if (!b || !b.inMorgue || b.autopsy) return null; return [st('morgue', 'Slab', 'Вскрытие: ' + b.name, 25)]; }, done(w, who, t) { return S.Med.autopsy(w, t.data.body, who); } });
  K('surgery', { act: 'Treat', title: 'Операция', build(w, who, o) { const p = w.npc(o.patient); if (!p || p.dead) return null; return [st('operating', 'Desk', 'Подготовка к операции', 4), st('operating', null, 'Операция: ' + p.shortName, 30, { pos: p.agent.pos })]; }, done(w, who, t) { return S.Med.surgery(w, who === 'player' ? null : who, t.data.patient); } });
  K('clean_med', { act: 'Maintenance', title: 'Уборка медблока', build: (w) => [st('medA', null, 'Обработать поверхности', 10, { need: 'hold' }), st('med', null, 'Медпункт Б', 8, { need: 'hold' })], done: (w) => { w.dirt.clean('medA'); return 'чисто'; } });
  K('assist_doctor', { title: 'Помощь врачу', build: () => [st('medA', 'Desk', 'Помогать на приёме', 30, { need: 'stay:8' })], done: () => 'смена в медблоке' });
  K('treat', { act: 'Treat', title: 'Приём пациентов', build(w, who, o) { const p = o.patient ? w.npc(o.patient) : null; return [st(o.room || 'medA', 'Desk', p ? 'Осмотреть ' + p.shortName : 'Вести приём', p ? 10 : 60, { need: p ? 'talk:' + p.id : 'stay:10', patient: p ? p.id : null })]; }, done(w, who, t) { const p = w.npc(t.data.patient); if (p) { p.needs.health = 100; if (p.isSick(w.now) && w.rng.chance(0.5)) p.sickUntil = w.now; p.nextThink = 0; } return p ? 'пациент осмотрен' : 'приём окончен'; } });
  K('medical_exam', { title: 'Медосмотр', build(w, who, o) { const p = w.npc(o.patient); if (!p) return null; return [st(p.agent.roomId || 'medA', null, 'Обследовать ' + p.shortName, 10, { need: 'talk:' + p.id, patient: p.id })]; }, done(w, who, t) { return w.life ? w.life.examined(who === 'player' ? 'player' : who.id, t.data.patient) : 'обследован'; } });
  K('psych_eval', { title: 'Психологическая оценка', build(w, who, o) { const p = w.npc(o.patient); if (!p) return null; return [st(p.agent.roomId || 'medA', null, 'Беседа с ' + p.shortName, 15, { need: 'talk:' + p.id, patient: p.id })]; }, done(w, who, t) { return w.life ? w.life.psychEval(who === 'player' ? 'player' : who.id, t.data.patient) : 'оценка проведена'; } });
  K('clear_for_duty', { title: 'Допуск к работе', build(w, who, o) { const p = w.npc(o.patient); if (!p) return null; return [st('medA', 'Desk', 'Допуск: ' + p.shortName, 10, { need: 'hold', patient: p.id })]; }, done(w, who, t) { const p = w.npc(t.data.patient); if (p) { p.restricted = false; p.addHistory(w.now, 'Допущен к работе психиатром', 'medical'); } return 'допущен'; } });

  // ================================================================== administration
  K('dispatch_calls', { act: 'GuardPost', title: 'Радиовызовы', build: () => [st('command', 'Console', 'Принимать вызовы', 60, { need: 'terminal:radio' })], done: (w, who) => w.life ? w.life.dispatchShift(who === 'player' ? 'player' : who.id) : 'смена' });
  K('ethics_review', { title: 'Этическая экспертиза', build: () => [st('meeting', 'Seat', 'Рассмотреть заявки', 25, { need: 'terminal:ethics' })], done: (w, who) => w.life ? w.life.ethicsReview(who === 'player' ? 'player' : who.id) : 'рассмотрено' });
  K('d_interview', { title: 'Обращение класса D', build(w, who, o) { const d = w.npc(o.dclass) || w.active.find(n => n.role === 'DClass'); if (!d) return null; return [st(d.agent.roomId, null, 'Выслушать ' + d.callsign, 10, { need: 'talk:' + d.id, dclass: d.id })]; }, done(w, who, t) { const d = w.npc(t.data.dclass); if (d) { d.needs.stress = Math.max(0, d.needs.stress - 15); d.adjustRel(who === 'player' ? 'player' : who.id, 8); } return 'обращение принято'; } });
  K('meeting', { act: 'Meeting', title: 'Совещание', build: () => [st('meeting', 'Seat', 'Совещание', 30, { need: 'stay:6' })], done: (w, who) => w.life ? w.life.attendedMeeting(who === 'player' ? 'player' : who.id) : 'совещание' });
  K('manage_resources', { title: 'Распределение ресурсов', build: () => [st('command', 'Console', 'Ресурсы отделов', 20, { need: 'terminal:management' })], done: (w, who) => w.life ? w.life.manage(who === 'player' ? 'player' : who.id) : 'ресурсы распределены' });
  K('set_priorities', { title: 'Приоритеты комплекса', build: () => [st('director', 'Desk', 'Приоритеты на сутки', 15, { need: 'terminal:management' })], done: (w, who) => w.life ? w.life.manage(who === 'player' ? 'player' : who.id) : 'приоритеты' });
  K('approve_research', { title: 'Утверждение исследований', build: (w, who) => [st(info(w, who).prof === 'director' ? 'director' : 'officesC', 'Desk', 'Рассмотреть заявки на эксперименты', 15, { need: 'terminal:research' })], done: (w, who) => w.life ? w.life.approvals(who === 'player' ? 'player' : who.id) : 'рассмотрено' });
  K('review_reports', { title: 'Проверка отчётов', build: (w, who) => [st(who !== 'player' && who.workRoom ? who.workRoom : 'officesC', 'Desk', 'Проверить отчёты', 25, { need: 'terminal:reports' })], done: (w, who) => w.life ? w.life.reviewReports(who === 'player' ? 'player' : who.id) : 'отчёты проверены' });

  // ================================================================== service
  K('clean_route', { act: 'Maintenance', title: 'Уборка', build(w, who) { const i = info(w, who); const spots = w.dirt.spots(levelOf(w, i.roomId)); const pick = spots.length ? order(pickN(w, spots, 4), i.pos) : []; if (!pick.length) return [st('corridor', null, 'Протереть пол', 5, { need: 'hold' })]; return pick.map(d => ({ room: d.roomId, poi: null, pos: d.pos, label: 'Пятно: ' + w.roomName(d.roomId), dur: 3, need: 'hold', dirt: d.id, done: false })); }, stepDone(w, who, t, s) { if (s.dirt) w.dirt.remove(s.dirt, who === 'player' ? 'player' : who.id); }, done: () => 'чисто' });
  K('cook', { act: 'Work', title: 'Готовка', build: (w) => pickN(w, w.fac.room('kitchen').pois.filter(p => p.type === 'Stove'), 2).map(p => sp(p, 'Плита: готовка', 12, { need: 'hold' })), done(w) { w.food = Math.min(200, (w.food || 0) + 40); return 'еда готова (запас ' + w.food + ')'; } });
  K('serve', { act: 'Treat', title: 'Раздача', build: () => [st('canteen', 'FoodCounter', 'Раздача обедов', 45, { need: 'stay:8', serve: true })], done: () => 'раздача окончена' });
  K('deliver', { act: 'Work', title: 'Доставка', build(w, who, o) { const to = o.to || 'labC'; return [st(o.from || 'storage', 'Shelf', 'Взять: ' + (o.what || 'расходные материалы'), 3, { need: 'hold' }), st(to, null, 'Доставить в «' + w.roomName(to) + '»', 3, { need: 'hold' })]; }, done(w, who, t) { w.life && w.life.delivered(t.data, who === 'player' ? 'player' : who.id); return 'доставлено'; } });
  K('arrival_logistics', { title: 'Оформление поступления', build: (w, who, o) => [st('arrivalDock', 'Desk', 'Оформить документы ' + (o.scp || ''), 15, { need: 'hold' })], done(w, who, t) { w.life && w.life.arrivalPaperwork(t.data.scp, who === 'player' ? 'player' : who.id); return 'документы оформлены'; } });

  // ================================================================== class D
  K('labor', { act: 'Labor', title: 'Трудовая смена', build(w, who) { const i = info(w, who), hall = who === 'player' ? (w.player.hallRoom || 'dhall') : (who.hallRoom || 'dhall'); return [st(hall, 'Workbench', 'Работа за столом', 60, { need: 'stay:8' })]; }, done: (w, who) => { if (who === 'player') w.player.rep.dclass = clamp((w.player.rep.dclass || 50) + 2, 0, 100); return 'норма выполнена'; } });
  K('return_d', { act: 'Escort', title: 'Вернуть заключённого в блок', build(w, who, o) { const d = w.npc(o.dclass); if (!d || !d.onSite) return null; return [st(d.agent.roomId, null, 'Забрать ' + d.callsign, 1, { need: 'escort:' + d.id, pickup: d.id }), st(d.hallRoom || 'dhall', null, 'Вернуть в блок', 1, { release: d.id })]; }, done: (w, who, t) => { const d = w.npc(t.data.dclass); if (d) { d.escortedBy = null; d.followId = null; d.nextThink = 0; } return 'заключённый в блоке'; }, fail(w, who, t) { const d = w.npc(t.data.dclass); if (d) { d.escortedBy = null; d.followId = null; } } });
  K('d_test', { act: 'Escorted', title: 'Испытание', build(w, who, o) { return [st(o.room || 'dtest', 'Stand', 'Стоять на месте испытуемого', o.dur || 10, { need: 'stay:3' })]; }, done: (w, who, t) => { if (who !== 'player') who.testsDone = (who.testsDone || 0) + 1; else w.player.testsDone = (w.player.testsDone || 0) + 1; return 'испытание окончено'; } });
  K('d_chore', { act: 'Maintenance', title: 'Разрешённое поручение', build(w, who) { const hall = who === 'player' ? (w.player.hallRoom || 'dhall') : who.hallRoom; return [st(hall, null, 'Вымыть пол в зале', 5, { need: 'hold' }), st(hall, 'FoodCounter', 'Помочь на раздаче', 5, { need: 'hold' })]; }, done: (w, who) => { if (who === 'player') w.player.rep.dclass = clamp((w.player.rep.dclass || 50) + 3, 0, 100); return 'поручение выполнено'; } });

  // ================================================================== science
  K('prepare_samples', { title: 'Подготовка образцов', build(w) { const lab = w.rng.chance(0.5) ? 'lab2' : 'labC'; return [st(lab, 'Workbench', 'Подготовить образцы', 15, { need: 'hold' })]; }, done(w) { w.research.samples = (w.research.samples || 0) + 2; return 'образцов: ' + w.research.samples; } });
  K('deliver_samples', { act: 'Work', title: 'Перенос проб', build: () => [st('lab2', 'Workbench', 'Забрать пробы', 3, { need: 'hold' }), st('lab', 'Workbench', 'Передать в лабораторию Б', 3, { need: 'hold' })], done(w) { w.research.samples = Math.max(0, (w.research.samples || 0) - 1); w.research.analyses = (w.research.analyses || 0) + 1; return 'пробы переданы'; } });
  K('assist_session', { title: 'Помощь на сеансе', build(w, who, o) { const a = anomaly(w, o.target) || w.anomaly('SCP-L-001'); return [st(obsOf(w, a), 'Console', 'Ассистировать на сеансе ' + a.id, 20, { need: 'stay:5', scp: a.id })]; }, done: () => 'сеанс проведён' });
  K('write_report', { title: 'Научный отчёт', build(w, who, o) { const room = who !== 'player' && w.fac.room(who.workRoom) && w.fac.room(who.workRoom).pois.some(p => p.type === 'Desk') ? who.workRoom : 'officesC'; return [st(room, 'Desk', 'Написать отчёт' + (o.target ? ' по ' + o.target : ''), 30, { need: 'terminal:report', scp: o.target || null })]; }, done(w, who, t) { return w.life ? w.life.reportWritten(who === 'player' ? 'player' : who.id, t.data.target) : 'отчёт сдан'; } });
  K('experiment', { title: 'Эксперимент', build(w, who, o) { const a = anomaly(w, o.target); if (!a) return null; const ex = (a.def.exps || []).find(e => e.id === o.exp); if (!ex) return null; return [st(obsOf(w, a), 'Console', 'Эксперимент «' + ex.name + '»', ex.dur || 15, { need: 'experiment', scp: a.id, exp: ex.id })]; }, done(w, who, t) { const a = anomaly(w, t.data.target); if (!a) return 'объект недоступен'; const r = S.Anoms.runExperiment(w, a, t.data.exp, { who: who === 'player' ? 'player' : who.id, dclass: t.data.dclass }); w.life && w.life.experimentDone(who === 'player' ? 'player' : who.id, a, r, t.data.request); return r.text; } });
  K('counting_session', { act: 'ObservationSession', title: 'Сеанс счёта SCP-L-001', build: () => [st('obs', 'Console', 'Вести счёт у окна', 16, { need: 'stay:8', count: true })], done(w, who) { if (who === 'player') return 'сеанс проведён'; return 'сеанс проведён'; } });
  K('interview_scp', { title: 'Беседа с объектом', build(w, who, o) { const a = anomaly(w, o.target || 'SCP-LF-124'); if (!a) return null; return [st(obsOf(w, a), 'Console', 'Беседа через интерком с ' + a.id, 15, { need: 'interview:' + a.id, scp: a.id })]; }, tickStep(w, n, t, s) { if (!s.said) { s.said = true; const a = anomaly(w, s.scp); const mind = w.ai && w.ai.agent(s.scp); if (a && mind && mind.p.llm) { w.ai.npcInterview(s.scp, n); return; } if (a && a.def.interview) { const txt = a.def.interview(w, a, n.id); n.obsNotes = (n.obsNotes || []).concat({ scp: a.id, t: w.now, text: txt }).slice(-6); n.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Research, subject: a.id, text: a.id + ' сказал: «' + txt + '»', imp: 0.4, conf: 1, src: 'Witnessed' }, w.now); } } }, done: (w, who) => { if (who !== 'player') who.reportsPending = (who.reportsPending || 0) + 1; return 'беседа записана'; } });
  K('exposure_check', { title: 'Проверка когнитивного воздействия', build(w) { return ['obs133', 'obs136', 'obs138'].map(r => st(r, 'Console', 'Опрос персонала: «' + w.roomName(r) + '»', 6, { need: 'hold' })); }, done(w, who) { return w.life ? w.life.exposureCheck(who === 'player' ? 'player' : who.id) : 'проверено'; } });
  K('answer_phone', { title: 'Ответить на звонок LF-123', build: () => [st('obs123', 'Console', 'Снять трубку через интерком', 2, { need: 'hold' })], done(w, who) { const a = w.anomaly('SCP-LF-123'); const t = a ? a.def.answer(w, a, who === 'player' ? 'player' : who.id) : ''; if (who !== 'player') who.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.AnomalyBehaviour, subject: 'SCP-LF-123', text: t, imp: 0.5, conf: 1, src: 'Witnessed' }, w.now); return t; } });
  K('cover_mirror', { title: 'Закрыть зеркало LF-127', build: () => [st('cell127', 'Stand', 'Задёрнуть штору', 2, { need: 'hold' })], done(w, who) { const a = w.anomaly('SCP-LF-127'); return a ? a.def.setCover(w, a, true, who) : ''; } });
  K('collect_paper', { act: 'Respond', title: 'Собрать бумажных существ', build(w, who, o) { return [st(o.room || 'corrC', null, 'Найти существ', 5, { need: 'hold' }), st('cell125', 'Stand', 'Вернуть в камеру', 2, { need: 'hold' })]; }, done(w, who) { const a = w.anomaly('SCP-LF-125'); while (a && a.st.out > 0 && a.def.collect(w, a, who === 'player' ? 'player' : who.id)); return 'существа в камере'; } });
  K('visit_healer', { act: 'Leisure', title: 'Визит к LF-128', build: () => [st('quarantine', 'Desk', 'Побыть у изолятора 15 минут', 15, { need: 'stay:5' })], done: () => 'объект доволен' });
  K('search_missing', { act: 'Respond', title: 'Поиск пропавшего', build(w, who, o) { return [st('liftOld', null, 'Осмотреть служебный лифт', 5, { need: 'hold' }), st('stairsC', null, 'Лестничная шахта С', 3, { need: 'hold' })]; }, done(w, who, t) { return w.life ? w.life.searched(t.data.missing, who === 'player' ? 'player' : who.id) : 'поиск'; } });

  // ------------------------------------------------------------------ routine selection when no task is assigned
  function routine(w, n) {
    const r = w.rng, p = n.prof;
    switch (p) {
      case 'guard': return r.chance(0.55) ? ['post_duty'] : r.chance(0.6) ? ['patrol'] : ['camera_check'];
      case 'patrol': return ['long_patrol'];
      case 'escort': return ['post_duty'];
      case 'cctv_operator': return ['camera_watch'];
      case 'security_officer': return r.chance(0.4) ? ['access_audit'] : ['patrol'];
      case 'shift_chief': return r.chance(0.3) ? ['assign_posts'] : ['camera_watch'];
      case 'operative': case 'field_medic': return r.chance(0.2) ? ['mtf_drill'] : ['standby'];
      case 'mtf_commander': return r.chance(0.3) ? ['plan_operation'] : ['standby'];
      case 'technician': case 'mechanic': return ['maintenance_round'];
      case 'electrician': return ['power_check'];
      case 'containment_engineer': return ['calibrate_sensors'];
      case 'sysadmin': return ['server_check'];
      case 'orderly': return r.chance(0.5) ? ['clean_med'] : ['assist_doctor'];
      case 'doctor': return ['treat', { room: n.workRoom === 'med' ? 'med' : 'medA' }];
      case 'psychiatrist': return ['treat', { room: 'medA' }];
      case 'dispatcher': return ['dispatch_calls'];
      case 'ethics_inspector': return r.chance(0.4) ? ['d_interview'] : ['ethics_review'];
      case 'dept_head': return r.chance(0.5) ? ['manage_resources'] : ['review_reports'];
      case 'director': return r.chance(0.5) ? ['set_priorities'] : ['approve_research'];
      case 'research_director': return r.chance(0.5) ? ['approve_research'] : ['review_reports'];
      case 'janitor': return ['clean_route'];
      case 'cook': return ['cook'];
      case 'logistician': { const to = ['labC', 'lab2', 'medA', 'workshop', 'kitchen', 'heavyObs4'].filter(x => w.reachable(n, x)); return ['deliver', { to: to.length ? r.pick(to) : 'medA', from: r.pick(['storage', 'storage4']) }]; }
      case 'lab_assistant': return r.chance(0.5) ? ['prepare_samples'] : ['deliver_samples'];
      default: {
        // researchers: observation of assigned objects and writing up what they saw
        if (n.reportsPending > 0 && r.chance(0.6)) return ['write_report', { target: (n.obsNotes || []).length ? n.obsNotes[n.obsNotes.length - 1].scp : null }];
        const scp = n.assignedScps.length ? r.pick(n.assignedScps) : null;
        if (scp === 'SCP-LF-124' && r.chance(0.4) && (p === 'senior_scientist' || p === 'anomaly_psychologist')) return ['interview_scp', { target: scp }];
        if (w.ai && w.ai.agent(scp) && w.ai.agent(scp).p.llm && scp !== 'SCP-LF-124' && r.chance(0.3)) return ['interview_scp', { target: scp }];
        if (p === 'memetics' && r.chance(0.3)) return ['exposure_check'];
        return scp ? ['observe_scp', { target: scp }] : ['write_report', {}];
      }
    }
  }

  function build(w, kind, who, opts) {
    const spec = J[kind]; if (!spec) return null; opts = opts || {};
    const steps = spec.build(w, who, opts); if (!steps || !steps.length) return null;
    return { kind, title: opts.title || spec.title, act: spec.act, steps, si: 0, data: opts, room: steps[0].room, target: opts.target || opts.scp || opts.fault || opts.door || null };
  }
  function stepDone(w, who, t, s) { s.done = true; const spec = J[t.kind]; if (spec && spec.stepDone) spec.stepDone(w, who, t, s); while (t.si < t.steps.length && t.steps[t.si].done) t.si++; return t.si >= t.steps.length; }
  function finish(w, who, t) { const spec = J[t.kind]; return spec && spec.done ? spec.done(w, who, t) : ''; }

  S.Jobs = { J, K, build, routine, stepDone, finish, info, pois, order, pickN };
})(typeof window !== 'undefined' ? window : globalThis);
