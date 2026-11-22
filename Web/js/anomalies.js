/* SCP LIFE 2.0 — anomaly framework: long-term memory of people, hidden properties, research, sensors; SCP-L-001 and SCP-LF-121…132. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, fmtTime, fmtStamp, durationText, EV, Hm } = S;
  const DEFS = {}, ORDER = [];

  // ------------------------------------------------------------------ long-term memory of an anomaly
  class Mind {
    constructor() { this.p = {}; }
    get(id) { return this.p[id] || (this.p[id] = { seen: 0, last: -1e5, first: -1, hours: new Array(24).fill(0), recog: 0, curiosity: 0.8, trust: 0, fear: 0, irritation: 0, hostility: 0, habit: 0, know: [], asked: -1e5 }); }
    has(id) { return !!this.p[id]; }
    learn(id, fact) { const m = this.get(id); if (m.know.indexOf(fact) < 0) { m.know.push(fact); if (m.know.length > 8) m.know.shift(); } }
    visit(w, id) {
      const m = this.get(id), h = w.clock.hour;
      if (m.first < 0) m.first = w.now;
      m.seen++; m.hours[h]++; m.recog = 1 - Math.exp(-m.seen / 4); m.curiosity = clamp(m.curiosity * 0.85 + (m.seen < 3 ? 0.1 : 0), 0, 1);
      let top = 0; for (const v of m.hours) top = Math.max(top, v); m.habit = m.seen >= 3 ? top / m.seen : 0;
      return m;
    }
    // Regular visitors who have not been seen for a long time: the anomaly may notice the absence.
    absentees(now) { const out = []; for (const id in this.p) { const m = this.p[id]; if (m.seen >= 4 && m.habit >= 0.35 && now - m.last > 1.4 * 1440 && now - m.asked > 1440) out.push(id); } return out; }
    save() { return this.p; }
    load(o) { this.p = o || {}; }
  }

  // ------------------------------------------------------------------ helpers shared by behaviours
  const H = {
    subjects(w, rooms) {
      const out = [], set = typeof rooms === 'string' ? [rooms] : rooms;
      const p = w.player; if (!p.dead && p.roomId && set.indexOf(p.roomId) >= 0) out.push({ id: 'player', pos: p.pos, roomId: p.roomId, n: null, psy: p.psy, stress: p.psy.stress, player: true });
      for (const n of w.active) if (n.agent.roomId && set.indexOf(n.agent.roomId) >= 0 && !n.incap(w.now)) out.push({ id: n.id, pos: n.agent.pos, roomId: n.agent.roomId, n, psy: n.psy, stress: n.needs.stress });
      return out;
    },
    post(w, a, sev, type, text, extra) { return w.events.post(Object.assign({ time: w.now, type, roomId: a.agent.roomId || a.containRoom, pos: V.copy(a.agent.pos), actor: a.id, severity: sev, text }, extra || {})); },
    expose(w, a, s, amt) { const e = a.st.exp || (a.st.exp = {}); e[s.id] = (e[s.id] || 0) + amt; s.psy.exposure = clamp(s.psy.exposure + amt * 0.6, 0, 100); return e[s.id]; },
    exp(a, id) { return (a.st.exp && a.st.exp[id]) || 0; },
    decay(a, gm, rate) { const e = a.st.exp; if (!e) return; for (const k in e) { e[k] = Math.max(0, e[k] - gm * rate); if (e[k] <= 0) delete e[k]; } },
    known(w, subjId, rng) {
      // someone the subject knows well (used for voices and figures built from memory)
      let best = null, bs = -1;
      if (subjId === 'player') { for (const n of w.npcs) { if (n.role === 'DClass') continue; const r = Math.abs(n.relTo('player')) + (n.dept === w.player.dept ? 15 : 0) + rng.next() * 10; if (r > bs) { bs = r; best = n; } } }
      else { const s = w.npc(subjId); if (s) for (const id in s.rel) { const n = w.npc(id); if (!n || n.role === 'DClass') continue; const r = Math.abs(s.rel[id]) + rng.next() * 10; if (r > bs) { bs = r; best = n; } } }
      return best || w.npcs[rng.int(0, Math.min(40, w.npcs.length))];
    },
    effect(w, a, subjId, eff) { return w.horror ? w.horror.addEffect(subjId, Object.assign({ src: a.id }, eff)) : null; },
    door(w, a) { const r = w.fac.room(a.containRoom); if (!r) return null; for (const id of r.doorIds) { const d = w.fac.door(id); if (d.kind === 'Heavy' || d.kind === 'Security') return d; } return w.fac.door(r.doorIds[0]); },
    flicker(w, roomId, sec) { const r = w.fac.room(roomId); if (r) r.flickerUntil = Math.max(r.flickerUntil, w.now + (sec || 1.5)); },
    pick(w, arr) { return arr[w.rng.int(0, arr.length)]; },
    name(w, id) { return w.nameOf(id); },
    alone(w, id, radius) { const p = w.posOf(id), r = w.roomOf(id); radius = radius || 8; if (id !== 'player' && !w.player.dead && w.player.roomId === r && V.distXZ(w.player.pos, p) < radius) return false; for (const n of w.active) if (n.id !== id && n.agent.roomId === r && !n.incap(w.now) && V.distXZ(n.agent.pos, p) < radius) return false; return true; }
  };

  // ------------------------------------------------------------------ anomaly object
  class Anomaly {
    constructor(def) {
      this.def = def; this.id = def.id; this.name = def.name; this.displayName = def.id + ' «' + def.name + '»'; this.cls = def.cls; this.kind = def.kind; this.temper = def.temper;
      this.containRoom = def.room; this.obsRoom = def.obs || null; this.model = def.model; this.agent = new S.NavAgent(); this.agent.speed = def.speed || 0.8;
      this.contained = true; this.pose = 'Idle'; this.lookAt = null; this.breachAt = -1; this.detected = false; this.d = def.d0 != null ? def.d0 : 10;
      this.mind = new Mind(); this.st = {}; this.journal = []; this.knowledge = def.knowledge0 || 5; this.rules = Object.assign({}, def.rules || {}); this.experiments = [];
      this.props = (def.props || []).map(p => ({ id: p[0], text: p[1], rule: p[2] || null, revealed: !!p[3] }));
      this.percT = 0; this.hourT = 0; this.arrived = def.arrived != null ? def.arrived : true; this.assigned = [];
    }
    get threat() { return this.def.threat ? this.def.threat(this) : (this.contained ? this.d : 100); }
    get status() { return this.def.status ? this.def.status(this) : (this.contained ? 'Стабилен' : 'ВНЕ КАМЕРЫ'); }
    init(w) {
      const r = w.fac.room(this.containRoom);
      if (r && !this.agent.roomId) { const c = r.pois.find(p => p.type === 'Stand') || null; this.agent.pos = c ? V.copy(c.pos) : r.center; this.agent.roomId = r.id; }
      if (this.def.init) this.def.init(w, this);
    }
    tick(w, dt, gm) {
      if (!this.arrived) return;
      this.percT -= dt;
      if (this.percT <= 0) { this.percT = 1; this.perceive(w); }
      this.hourT += gm; if (this.hourT >= 60) { this.hourT = 0; this.hourly(w); }
      if (this.def.tick) this.def.tick(w, this, dt, gm);
      if (!this.def.ownD) { const rest = this.def.restD != null ? this.def.restD : 10; this.d = clamp(this.d + (rest - this.d) * Math.min(1, 0.01 * gm), 0, 100); }
    }
    perceive(w) {
      const room = w.fac.room(this.agent.roomId || this.containRoom); if (!room) return;
      const range = this.def.range || 16;
      const see = s => {
        if (V.distXZ(s.pos, this.agent.pos) > range) return;
        const m = this.mind.get(s.id), fresh = w.now - m.last > 30;
        if (fresh) { this.mind.visit(w, s.id); if (s.n) { this.mind.learn(s.id, 'role:' + s.n.prof); } if (this.def.onVisit) this.def.onVisit(w, this, s, m); }
        m.last = w.now;
        if (this.def.onSee) this.def.onSee(w, this, s, m);
      };
      if (!w.player.dead && w.player.roomId && room.canSeeInto(w.player.roomId)) see({ id: 'player', pos: w.player.pos, roomId: w.player.roomId, psy: w.player.psy, player: true });
      for (const n of w.active) if (n.agent.roomId && room.canSeeInto(n.agent.roomId) && !n.incap(w.now)) see({ id: n.id, pos: n.agent.pos, roomId: n.agent.roomId, n, psy: n.psy });
    }
    hourly(w) {
      for (const id of this.mind.absentees(w.now)) {
        const m = this.mind.get(id); m.asked = w.now; if (this.def.onAbsent) this.def.onAbsent(w, this, id, m);
        else if (this.kind === 'sapient' || this.temper === 'friendly') H.post(w, this, 0, EV.AnomalyBehaviour, this.id + ' ведёт себя иначе: дольше обычного остаётся у окна в часы, когда приходил' + (w.npc(id) && w.npc(id).female ? 'а ' : ' ') + w.nameOf(id) + '.');
      }
      if (this.def.hourly) this.def.hourly(w, this);
    }
    observe(w, who, viaCamera) {
      let text = this.def.observe ? this.def.observe(w, this, who, viaCamera) : this.displayName + ': без изменений.';
      if (!this.arrived) text = 'Объект ещё не поступил в комплекс.';
      this.journal.push({ t: w.now, who, text, cam: !!viaCamera }); if (this.journal.length > 40) this.journal.shift();
      return text;
    }
    reveal(w, propId, by) {
      const p = this.props.find(x => x.id === propId); if (!p || p.revealed) return null;
      p.revealed = true; this.knowledge = clamp(this.knowledge + 12, 0, 100);
      if (p.rule) Object.assign(this.rules, p.rule);
      w.events.post({ time: w.now, type: EV.Research, roomId: this.obsRoom || this.containRoom, actor: by, target: this.id, severity: 1, pub: true, text: 'Исследования ' + this.id + ': установлено — ' + p.text + (p.rule ? ' Процедуры содержания обновлены.' : '') });
      if (w.life) w.life.onDiscovery(this, p, by);
      return p;
    }
    truth(w) { return Object.assign({ motion: 0, temp: 20, em: 0, sound: 0, light: 1 }, this.def.truth ? this.def.truth(w, this) : {}); }
    save() { if (this.def.beforeSave) this.def.beforeSave(this); return { id: this.id, a: this.agent.save(), c: this.contained, p: this.pose, la: this.lookAt, ba: this.breachAt, det: this.detected, d: this.d, m: this.mind.save(), st: this.st, j: this.journal, k: this.knowledge, r: this.rules, pr: this.props.filter(p => p.revealed).map(p => p.id), ex: this.experiments, ar: this.arrived, as: this.assigned }; }
    load(w, o) {
      this.agent.load(o.a); this.contained = o.c; this.pose = o.p; this.lookAt = o.la; this.breachAt = o.ba; this.detected = o.det; this.d = o.d; this.mind.load(o.m); this.st = o.st || {}; this.journal = o.j || []; this.knowledge = o.k;
      this.rules = o.r || this.rules; for (const p of this.props) p.revealed = o.pr.indexOf(p.id) >= 0; this.experiments = o.ex || []; this.arrived = o.ar !== false; this.assigned = o.as || [];
      if (this.def.afterLoad) this.def.afterLoad(w, this);
    }
  }

  // Run an experiment: the outcome is computed by the anomaly from its state and the conditions.
  function runExperiment(w, a, expId, ctx) {
    const ex = (a.def.exps || []).find(e => e.id === expId); if (!ex) return { ok: false, text: 'Нет такого эксперимента' };
    ctx = Object.assign({ who: 'player', night: w.clock.night, lights: (w.fac.room(a.containRoom) || {}).lightsOn !== false }, ctx || {});
    const r = a.def.experiment ? a.def.experiment(w, a, expId, ctx) : { text: 'Без результата.' };
    const rec = { id: expId, name: ex.name, t: w.now, by: ctx.who, text: r.text, revealed: [], dclass: ctx.dclass || null, ok: r.ok !== false };
    for (const pid of (r.reveal || [])) { const p = a.reveal(w, pid, ctx.who); if (p) rec.revealed.push(p.text); }
    a.knowledge = clamp(a.knowledge + (r.knowledge != null ? r.knowledge : 4), 0, 100);
    a.experiments.push(rec); if (a.experiments.length > 30) a.experiments.shift();
    w.events.post({ time: w.now, type: EV.Research, roomId: a.obsRoom || a.containRoom, actor: ctx.who, target: a.id, severity: r.severity || 0, text: 'Эксперимент «' + ex.name + '» (' + a.id + '): ' + r.text });
    return rec;
  }
  function def(d) { DEFS[d.id] = d; ORDER.push(d.id); return d; }

  // ================================================================== SCP-L-001 «Счетовод» (stage 1 behaviour)
  def({
    id: 'SCP-L-001', name: 'Счетовод', cls: 'Евклид', kind: 'sapient', temper: 'aggressive', room: 'chamber', obs: 'obs', model: 'tallyman', ownD: true, knowledge0: 35,
    desc: 'Высокий (2,6 м) гуманоид с гладкой серой кожей, покрытой мелкими насечками. Постоянно ведёт счёт: людей, шагов, циклов двери — и выцарапывает отметки на стенах.',
    contain: 'Камера 12×10 м с окном наблюдения. Сеанс счёта обученным сотрудником не реже раза в 6 часов. Освещение не отключать. Вход только вдвоём (две карты L3 «Содержание») и только при спокойном объекте.',
    triggers: 'пропуск сеанса счёта; отключение света; открытие двери в заученное время при возбуждении; незнакомые и нерегулярные посетители',
    rules: { sessionEvery: 360, lightsOn: true, pairOnly: true },
    props: [['counts_people', 'объект ведёт учёт посетителей и их привычного времени', null, true], ['learns_door', 'объект запоминает время открытия гермодвери и ждёт у неё в эти минуты', { varyInspections: true }], ['reading_slows', 'чтение протокола счёта вслух замедляет объект вне камеры', null, true], ['dark_agitates', 'темнота резко повышает возбуждение', { lightsOn: true }, true]],
    exps: [{ id: 'irregular_visit', name: 'Нерегулярный посетитель', desc: 'Незнакомый сотрудник проводит у окна 5 минут вне привычного графика.', dur: 10 }, { id: 'door_log', name: 'Анализ отметок у двери', desc: 'Сопоставить выцарапанные группы отметок с журналом гермодвери.', dur: 20 }, { id: 'count_rhythm', name: 'Ритм счёта', desc: 'Сеанс счёта с изменённым темпом.', dur: 15 }],
    init(w, a) { a.tm = new S.Tallyman(); a.tm.owner = a; a.tm.init(w); if (a.st.tm) a.tm.load(a.st.tm); },
    tick(w, a, dt, gm) { a.tm.tick(w, dt, gm); a.d = a.tm.d; },
    threat: a => a.tm ? a.tm.threat : a.d, status: a => a.tm ? a.tm.status : '',
    observe: (w, a, who) => a.tm.observe(w, who),
    truth(w, a) { const s = a.tm.state; return { motion: a.agent.moving ? 0.8 : s === 'Counting' ? 0.3 : 0.1, em: s === 'Probing' ? 0.9 : s === 'WaitingAtDoor' ? 0.3 : 0.05, sound: s === 'Signaling' ? 0.7 : s === 'Counting' ? 0.2 : 0.05, temp: 19 }; },
    beforeSave(a) { a.st.tm = a.tm.save(); }, afterLoad(w, a) { a.tm.load(a.st.tm); },
    experiment(w, a, id, ctx) {
      const t = a.tm;
      if (id === 'irregular_visit') { t.d += 9; return { text: 'Объект прекратил счёт и подошёл к стеклу, сбился с ритма на ' + Math.round(4 + t.d / 10) + ' мин. Возбуждение выросло.', knowledge: 5 }; }
      if (id === 'door_log') { const b = t.strongest(); if (b >= 0 && t.hist[b] >= 2) return { text: 'Группа отметок «' + fmtTime(b * 15) + '» совпадает с журналом открытий гермодвери (' + t.hist[b] + ' раз).', reveal: ['learns_door'] }; return { text: 'Устойчивых групп отметок у двери пока нет — данных мало.', knowledge: 2 }; }
      if (id === 'count_rhythm') { t.d = Math.max(3, t.d - 6); return { text: 'Объект подстроился под новый темп за 40 секунд. Возбуждение снизилось.', knowledge: 4 }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-121 «Сотрудник из документов»
  const VETROV = { id: 'vetrov', first: 'Николай', last: 'Ветров', title: 'Мл. н. с.' };
  def({
    id: 'SCP-LF-121', name: 'Сотрудник из документов', cls: 'Евклид', kind: 'memetic', temper: 'passive', room: 'cell121', obs: 'archiveA', model: 'folder', knowledge0: 20,
    desc: 'Личное дело «мл. н. с. Ветрова Н. А.», сотрудника, которого никогда не существовало. Упоминания о Ветрове сами появляются в журналах, отчётах, списках персонала и воспоминаниях тех, кто читал документы.',
    contain: 'Папка в запертом шкафу. Ежедневный аудит записей специалистом по меметике. Не обсуждать Ветрова как реального человека. Найденные упоминания помечать и удалять.',
    triggers: 'пропуск аудита записей; чтение документов, где упомянут Ветров; накопление неисправленных вставок',
    rules: { audit: 1440 },
    props: [['inserts', 'объект вставляет упоминания о «Ветрове» в журналы и списки', null, true], ['not_electronic', 'вставки появляются и в бумажных журналах — это не вирус и не сбой серверов'], ['manual_better', 'ручной аудит удаляет вставки надёжнее автоматического', { audit: 1440, manualAudit: true }], ['memory_via_reading', 'ложные воспоминания о Ветрове возникают только у тех, кто читал документы с его именем', { limitReading: true }]],
    exps: [{ id: 'faraday', name: 'Экранированный сейф', desc: 'Поместить папку в экранированный сейф на сутки и сравнить число вставок.', dur: 20 }, { id: 'manual_audit', name: 'Ручной аудит против автоматического', desc: 'Две группы проверяют одни и те же журналы.', dur: 30 }, { id: 'reader_test', name: 'Чтение личного дела', desc: 'Доброволец класса D читает документы с упоминаниями Ветрова, затем проходит опрос.', dur: 20, dclass: true, ethics: true }],
    init(w, a) { if (a.st.ins == null) Object.assign(a.st, { ins: 2, lastAudit: w.now - 600, fakeAccess: 0, mem: [], roster: false }); },
    tick(w, a, dt, gm) {
      const since = w.now - a.st.lastAudit, rate = (0.06 + Math.max(0, since - 1440) / 1440 * 0.12) * (a.rules.manualAudit ? 0.7 : 1);
      if (!w.rng.chance(rate / 60 * gm)) return;
      a.st.ins++; const kind = H.pick(w, a.st.ins > 5 ? ['access', 'memory', 'roster', 'report', 'memory'] : ['access', 'report', 'memory']);
      if (kind === 'access') { const d = H.pick(w, w.fac.doorList.filter(x => x.hasLeaf && x.kind !== 'Cell')); w.accessLog.push({ t: w.now, door: d.id, card: 'card.vetrov', owner: 'Мл. н. с. Ветров', by: 'vetrov', r: 'Granted', fake: true }); a.st.fakeAccess++; }
      else if (kind === 'roster') a.st.roster = true;
      else if (kind === 'report') { a.st.reportLine = (a.st.reportLine || 0) + 1; }
      else {
        const readers = w.active.filter(n => n.role !== 'DClass' && ['archiveA', 'officesC', 'command', 'servers'].indexOf(n.agent.roomId) >= 0);
        if (readers.length) {
          const n = H.pick(w, readers), line = H.pick(w, ['Ветров просил передать, что отчёт по LF-125 у него на столе.', 'Вчера пил кофе с Ветровым из научного — толковый парень.', 'Ветров опять задержался в архиве допоздна.', 'Ветров говорил, что в секторе С меняют замки.']);
          n.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Story, roomId: n.agent.roomId, subject: 'vetrov', text: line, imp: 0.4, conf: 0.85, src: 'Witnessed', shared: false, fake: 'SCP-LF-121' }, w.now);
          a.st.mem.push(n.id); if (a.st.mem.length > 30) a.st.mem.shift();
        }
      }
      if (a.st.ins === 8) { a.contained = false; a.detected = false; H.post(w, a, 1, EV.Anomalous, 'Упоминания «Ветрова» найдены в ' + a.st.ins + ' документах за пределами архива. Аудит просрочен.'); }
    },
    audit(w, a, by, manual) {
      const removed = a.st.ins, mem = a.st.mem.slice(); a.st.ins = 0; a.st.lastAudit = w.now; a.st.roster = false; a.st.reportLine = 0; a.st.mem = [];
      for (const e of w.accessLog) if (e.fake) e.r = 'Аннулировано аудитом';
      for (const id of mem) { const n = w.npc(id); if (n) for (const m of n.memory.entries) if (m.fake === 'SCP-LF-121') { m.conf = 0.3; m.text = '(сомнение) ' + m.text.replace(/^\(сомнение\) /, ''); } }
      if (!a.contained) { a.contained = true; H.post(w, a, 0, EV.Recontained, 'Аудит записей ' + a.id + ' завершён, вставки удалены.'); }
      return removed;
    },
    status: a => a.st.ins + ' неисправленных вставок',
    threat: a => clamp(a.st.ins * 9, 0, 100),
    observe(w, a, who) {
      const s = who === 'player' ? { id: 'player', psy: w.player.psy } : null;
      if (s) { const e = H.expose(w, a, s, 3); if (e > 6 && !w.horror.has('player', 'false_memory')) H.effect(w, a, 'player', { kind: 'false_memory', cause: 'чтение личного дела', intensity: 0.5, dur: 600, end: { sleep: true }, data: { text: 'Вы почти уверены, что вчера говорили с мл. н. с. Ветровым у архива. Он просил передать отчёт.' } }); }
      return 'В деле Ветрова ' + (12 + a.st.ins) + ' листов. С последнего аудита (' + durationText(w.now - a.st.lastAudit) + ' назад) появилось ' + a.st.ins + ' новых упоминаний' + (a.st.fakeAccess ? ', в т. ч. проходы по несуществующей карте card.vetrov' : '') + '.';
    },
    experiment(w, a, id, ctx) {
      if (id === 'faraday') return { text: 'За сутки в экранированном сейфе вставки продолжили появляться, в том числе в бумажном журнале поста «Запад».', reveal: ['not_electronic'] };
      if (id === 'manual_audit') return { text: 'Ручная группа нашла ' + (a.st.ins + 3) + ' вставок, автоматическая — ' + Math.max(0, a.st.ins - 1) + '. Повторная проверка подтвердила преимущество ручного аудита.', reveal: ['manual_better'] };
      if (id === 'reader_test') { const d = w.npc(ctx.dclass); if (d) { d.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Story, subject: 'vetrov', text: 'Ветров на прошлой неделе угощал меня сигаретой.', imp: 0.4, conf: 0.9, src: 'Witnessed', fake: 'SCP-LF-121' }, w.now); a.st.mem.push(d.id); } return { text: 'Через 20 минут после чтения испытуемый «вспомнил» личную встречу с Ветровым. Контрольный испытуемый без чтения таких воспоминаний не имеет.', reveal: ['memory_via_reading'] }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-122 «Лифт на этаж —»
  def({
    id: 'SCP-LF-122', name: 'Лифт на несуществующий этаж', cls: 'Евклид', kind: 'spatial', temper: 'passive', room: 'liftOld', obs: null, model: 'lift', knowledge0: 15,
    desc: 'Служебный грузовой лифт сектора С. Ночью, если в кабине один человек, на табло иногда загорается «—», и кабина прибывает на этаж, которого нет в проектной документации.',
    contain: 'С 00:00 до 05:00 лифт выведен из эксплуатации. Ночные поездки только вдвоём и по разрешению. Журнал поездок сверяется с датчиком положения кабины.',
    triggers: 'одиночная поездка ночью; снятая блокировка во время ремонта',
    rules: { nightLock: true },
    props: [['null_floor', 'кабина иногда прибывает на этаж «—» с пустым коридором', null, true], ['night_only', 'аномалия проявляется только с 01:30 до 04:30'], ['cabin_never_moves', 'датчик положения кабины при поездках на «—» показывает, что кабина стоит на уровне 3'], ['alone_only', 'при поездке вдвоём аномалия не проявляется', { pairRides: true }]],
    exps: [{ id: 'drone', name: 'Камера в кабине ночью', desc: 'Отправить кабину ночью с камерой и без людей.', dur: 20, night: true }, { id: 'cabin_sensor', name: 'Сверка датчика кабины', desc: 'Сравнить журнал поездок с показаниями датчика положения.', dur: 15 }, { id: 'pair_ride', name: 'Поездка вдвоём', desc: 'Два сотрудника совершают ночную поездку.', dur: 15, night: true }],
    init(w, a) { if (a.st.rides == null) Object.assign(a.st, { rides: 0, nullRides: 0, lost: [] }); },
    // Called by the world when someone rides the service lift: may redirect the ride to the null floor.
    redirect(w, a, who, alone) {
      const mod = w.clock.mod; if (!alone || !S.inRange(mod, Hm(1, 30), Hm(4, 30))) return false;
      a.st.rides++; if (!w.rng.chance(0.4)) return false;
      a.st.nullRides++; a.st.lost.push({ who, t: w.now }); a.st.cabinStuck = w.now;
      H.post(w, a, 1, EV.Anomalous, 'Табло служебного лифта показывает «—». Датчик положения кабины: уровень 3.', { hidden: true });
      return true;
    },
    status: a => a.st.nullRides ? 'Поездок на «—»: ' + a.st.nullRides : 'Блокировка ночью',
    threat: a => (a.st.lost || []).some(l => l.back == null) ? 45 : 8,
    truth(w, a) { return { motion: 0, em: S.inRange(w.clock.mod, Hm(2, 50), Hm(3, 10)) ? 0.6 : 0.05, temp: 18 }; },
    observe(w, a) { const lost = (a.st.lost || []).filter(l => l.back == null); return 'Кабина ' + (w.fac.door('t.liftOld').outOfService ? 'заблокирована' : 'в работе') + '. Ночных поездок: ' + a.st.rides + ', из них на «—»: ' + a.st.nullRides + '.' + (lost.length ? ' Не вернулись: ' + lost.map(l => w.nameOf(l.who)).join(', ') + '.' : ''); },
    experiment(w, a, id, ctx) {
      if (id === 'drone') { if (!ctx.night) return { text: 'Днём кабина с камерой прибыла на уровень 4 без отклонений.', knowledge: 2 }; return { text: 'В 03:12 камера передала коридор без номера этажа, затем помехи. Через 9 минут кабина вернулась пустой.', reveal: ['night_only'] }; }
      if (id === 'cabin_sensor') return a.st.nullRides ? { text: 'В моменты поездок на «—» датчик положения фиксировал кабину на уровне 3, хотя люди в ней отсутствовали до 40 минут.', reveal: ['cabin_never_moves'] } : { text: 'Расхождений между журналом и датчиком нет: поездок на «—» ещё не было.', knowledge: 2 };
      if (id === 'pair_ride') return { text: 'Ночная поездка вдвоём завершилась на уровне 4 без отклонений.', reveal: ctx.night ? ['alone_only'] : [] };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-123 «Телефон отсутствующих»
  def({
    id: 'SCP-LF-123', name: 'Телефон отсутствующих', cls: 'Безопасный', kind: 'object', temper: 'friendly', room: 'cell123', obs: 'obs123', model: 'phone', knowledge0: 20,
    desc: 'Чёрный дисковый телефон без подключения к линии. Звонит и передаёт сообщения голосами сотрудников, которых в этот момент нет в комплексе.',
    contain: 'Все звонки записываются. Отвечать не чаще одного раза в час. Содержание звонков сверять с табелем.',
    triggers: 'отсутствие сотрудников; пропавшие без вести',
    rules: {},
    props: [['rings', 'телефон звонит и говорит голосами отсутствующих сотрудников', null, true], ['accurate', 'сообщения соответствуют реальному положению отсутствующих'], ['missing_priority', 'если отсутствующий в опасности, телефон звонит настойчиво и повторно', { phoneSearch: true }]],
    exps: [{ id: 'verify_calls', name: 'Сверка звонков с табелем', desc: 'Сравнить сообщения за двое суток с табелем и журналом больничных.', dur: 20 }, { id: 'staged_absence', name: 'Инсценированное отсутствие', desc: 'Сотрудник уходит в закрытую комнату без связи на час.', dur: 60 }],
    init(w, a) { if (!a.st.calls) Object.assign(a.st, { calls: [], ringUntil: 0, nextRing: w.now + w.rng.range(60, 200) }); },
    tick(w, a, dt, gm) {
      const urgent = w.npcs.find(n => n.missing && w.now - n.missingAt > 20 && !(a.st.calls.find(c => c.from === n.id && w.now - c.t < 30)));
      if (urgent) { ring(w, a, urgent, true); return; }
      if (w.now < a.st.nextRing) return;
      a.st.nextRing = w.now + w.rng.range(120, 300);
      const absent = w.npcs.filter(n => n.role !== 'DClass' && !n.onSite && (n.isSick(w.now) || n.prof)); if (!absent.length) return;
      ring(w, a, H.pick(w, absent), false);
    },
    answer(w, a, who) {
      const c = a.st.calls[a.st.calls.length - 1]; if (!c || c.answered || w.now > a.st.ringUntil) return 'Телефон молчит.';
      c.answered = who; a.st.ringUntil = 0;
      return 'Голос ' + w.nameOf(c.from) + ': «' + c.text + '»';
    },
    status: a => a.st.ringUntil > 0 ? 'ЗВОНИТ' : 'Звонков: ' + (a.st.calls || []).length,
    threat: () => 5,
    truth(w, a) { return { sound: w.now < a.st.ringUntil ? 0.9 : 0, em: 0, motion: 0 }; },
    observe(w, a) { const l = a.st.calls.slice(-3).map(c => fmtTime(c.t) + ' — ' + w.nameOf(c.from) + (c.answered ? ': «' + c.text + '»' : ' (без ответа)')); return (w.now < a.st.ringUntil ? 'Телефон звонит. ' : 'Телефон молчит. ') + 'Последние звонки: ' + (l.length ? l.join('; ') : 'нет') + '.'; },
    experiment(w, a, id) {
      if (id === 'verify_calls') { const n = a.st.calls.length; return n >= 2 ? { text: 'Все ' + n + ' сообщений совпали с табелем: больничные, выходные и места пребывания указаны верно.', reveal: ['accurate'] } : { text: 'Звонков пока слишком мало для сверки.', knowledge: 1 }; }
      if (id === 'staged_absence') return { text: 'Через 20 минут телефон позвонил голосом испытуемого: «Я в кладовой, мне скучно». Один звонок, без повторов.', knowledge: 6 };
      return { text: '' };
    }
  });
  function ring(w, a, n, urgent) {
    let text;
    if (n.missing) text = n.missingWhere === 'nullfloor' ? 'Здесь нет номеров этажей… коридор не кончается. Я слышу лифт, но не могу его найти.' : 'Я не знаю, где я. Здесь темно.';
    else if (n.isSick(w.now)) text = H.pick(w, ['Я дома, температура. Передайте, что вернусь ' + fmtStamp(n.sickUntil).slice(0, 2) + '.', 'Скажите в отделе, что отчёт в верхнем ящике моего стола. Я на больничном.']);
    else { const nx = S.People.currentShift(n, w.now + 1440); text = H.pick(w, ['У меня выходной, я на жилом уровне. Всё в порядке.', 'Я сплю после смены. Не будите.', 'Передайте ' + (H.known(w, n.id, w.rng) || n).shortName + ', что я зайду завтра.']); }
    a.st.calls.push({ t: w.now, from: n.id, text, urgent, answered: null }); if (a.st.calls.length > 40) a.st.calls.shift();
    a.st.ringUntil = w.now + (urgent ? 25 : 15);
    H.post(w, a, urgent ? 1 : 0, EV.AnomalyBehaviour, a.id + ' звонит' + (urgent ? ' настойчиво' : '') + '. Определитель: «' + n.displayName + '».');
    if (urgent && a.rules.phoneSearch && w.life) w.life.phoneLead(n, a);
  }

  // ================================================================== SCP-LF-124 «Прогнозист»
  def({
    id: 'SCP-LF-124', name: 'Прогнозист', cls: 'Безопасный', kind: 'sapient', temper: 'sapient', room: 'cell124', obs: 'obs124', model: 'bust', knowledge0: 25,
    desc: 'Говорящий латунный бюст неизвестного мужчины. Охотно обсуждает «предстоящие события» в комплексе: поломки, совещания, болезни сотрудников. Часть прогнозов сбывается.',
    contain: 'Беседы не чаще трёх раз в сутки, только с утверждённым собеседником. Все прогнозы записываются и проверяются. Не принимать решений только на основании прогнозов.',
    triggers: 'частые беседы (раздражение); отсутствие привычного собеседника',
    rules: { interviewsPerDay: 3 },
    props: [['predicts', 'объект делает прогнозы о событиях в комплексе', null, true], ['records_only', 'прогнозы строятся только по данным журналов и планов комплекса — ложная запись порождает ложный прогноз'], ['mood_lies', 'при раздражении объект намеренно искажает прогнозы', { interviewsPerDay: 2 }]],
    exps: [{ id: 'false_record', name: 'Ложная запись в журнале', desc: 'Внести в план работ фиктивное отключение и спросить о ближайших событиях.', dur: 20 }, { id: 'frequent', name: 'Частые беседы', desc: 'Пять бесед подряд и сравнение точности.', dur: 30 }, { id: 'accuracy', name: 'Статистика прогнозов', desc: 'Проверить все сбывшиеся и несбывшиеся прогнозы.', dur: 20 }],
    init(w, a) { if (!a.st.pred) Object.assign(a.st, { pred: [], talksToday: 0, day: w.clock.day, hits: 0, miss: 0 }); },
    hourly(w, a) {
      if (a.st.day !== w.clock.day) { a.st.day = w.clock.day; a.st.talksToday = 0; }
      for (const p of a.st.pred) if (p.ok == null && w.now > p.due) { p.ok = w.life ? w.life.checkPrediction(p) : false; if (p.ok) a.st.hits++; else a.st.miss++; }
    },
    interview(w, a, who) {
      a.st.talksToday++; const m = a.mind.get(who); m.trust = clamp(m.trust + 0.05, 0, 1);
      if (a.st.talksToday > (a.rules.interviewsPerDay || 3)) m.irritation = clamp(m.irritation + 0.25, 0, 1);
      const cands = w.life ? w.life.forecastCandidates(a.st.fake) : [];
      const lie = m.irritation > 0.5 && w.rng.chance(m.irritation);
      let p;
      if (!cands.length) p = { text: 'Ничего примечательного. Скучная будет смена.', kind: 'none', due: w.now + 360 };
      else { const c = H.pick(w, cands); p = Object.assign({}, c); if (lie) { p.text = c.lie || ('Ничего из того, что вы ждёте, не случится. ' + c.text.replace(/будет|состоится/, 'не будет')); p.lie = true; p.kind = 'lie:' + c.kind; } }
      p.t = w.now; p.by = who; p.ok = null; a.st.pred.push(p); if (a.st.pred.length > 30) a.st.pred.shift();
      const greet = m.seen > 5 ? (who === 'player' ? 'Снова вы. ' : 'А, ' + w.nameOf(who) + '. ') : 'Новое лицо. ';
      return greet + p.text;
    },
    onAbsent(w, a, id) { H.post(w, a, 0, EV.AnomalyBehaviour, a.id + ' спрашивает, почему ' + w.nameOf(id) + ' перестал' + (w.npc(id) && w.npc(id).female ? 'а' : '') + ' приходить на беседы.'); },
    status: a => 'Точность: ' + a.st.hits + '/' + (a.st.hits + a.st.miss),
    threat: () => 6,
    truth(w, a) { return { em: 0.15, sound: 0.1 }; },
    observe(w, a, who) { const last = a.st.pred.slice(-2).map(p => '«' + p.text + '»' + (p.ok == null ? '' : p.ok ? ' (сбылось)' : ' (не сбылось)')); return 'Бюст неподвижен, глаза следят за ' + (who === 'player' ? 'вами' : w.nameOf(who)) + '. Последние прогнозы: ' + (last.join(' ') || 'нет') + '.'; },
    experiment(w, a, id, ctx) {
      if (id === 'false_record') { a.st.fake = { text: 'В секторе А погаснет свет — плановые работы на щите.', kind: 'fake_power', due: w.now + 240 }; const t = this.interview(w, a, ctx.who); const hit = /свет/.test(t); a.st.fake = null; return hit ? { text: 'Объект предсказал фиктивное отключение: «' + t + '». Он знает только то, что записано.', reveal: ['records_only'] } : { text: 'Объект ответил: «' + t + '». Ложная запись не повлияла — повторить.', knowledge: 3 }; }
      if (id === 'frequent') { const m = a.mind.get(ctx.who); m.irritation = clamp(m.irritation + 0.6, 0, 1); return { text: 'После четвёртой беседы ответы стали противоречивыми и язвительными. Последующие прогнозы не сбылись.', reveal: ['mood_lies'] }; }
      if (id === 'accuracy') { const n = a.st.hits + a.st.miss; return n >= 3 ? { text: 'Сбылось ' + a.st.hits + ' из ' + n + ' прогнозов (' + Math.round(a.st.hits / n * 100) + '%).', knowledge: 6 } : { text: 'Проверенных прогнозов слишком мало.', knowledge: 1 }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-125 «Бумажные существа»
  def({
    id: 'SCP-LF-125', name: 'Бумажные существа', cls: 'Безопасный', kind: 'swarm', temper: 'friendly', room: 'cell125', obs: 'obs125', model: 'paper', knowledge0: 25,
    desc: 'Двенадцать существ из сложенной бумаги размером с ладонь. Безвредны. Реагируют на эмоции людей поблизости: тянутся к спокойным, прячутся от испуганных.',
    contain: 'Влажность камеры ниже 40%. Не допускать к окну более трёх напряжённых сотрудников. Воду не использовать.',
    triggers: 'скопление испуганных или раздражённых людей; влажность; открытая дверь при возбуждении',
    rules: { maxHumidity: 40 },
    props: [['react', 'существа реагируют на присутствие людей', null, true], ['reads_stress', 'существа чувствуют уровень стресса людей и тянутся к спокойным'], ['water_harm', 'влага размягчает и необратимо повреждает существ', { maxHumidity: 35 }], ['calming', 'наблюдение за существами снижает стресс у спокойного наблюдателя', { therapy: true }]],
    exps: [{ id: 'calm_volunteer', name: 'Спокойный наблюдатель', desc: 'Сотрудник в спокойном состоянии 10 минут у стекла.', dur: 15 }, { id: 'stressed', name: 'Испуганный испытуемый', desc: 'Взволнованный доброволец класса D у стекла.', dur: 15, dclass: true, ethics: true }, { id: 'humidity', name: 'Повышение влажности', desc: 'Кратковременно поднять влажность до 55%.', dur: 15, ethics: true }, { id: 'therapy', name: 'Сеанс для уставшего сотрудника', desc: 'Уставший сотрудник 15 минут наблюдает за существами.', dur: 20 }],
    init(w, a) { if (!a.st.c) { a.st.c = []; const r = w.fac.room(a.containRoom); for (let i = 0; i < 12; i++) a.st.c.push({ x: w.rng.range(r.minX + 0.8, r.maxX - 0.8), z: w.rng.range(r.minZ + 0.8, r.maxZ - 0.8), f: 0 }); a.st.mood = 'calm'; a.st.out = 0; a.st.alive = 12; } },
    tick(w, a, dt, gm) {
      const r = w.fac.room(a.containRoom), people = H.subjects(w, [a.containRoom, a.obsRoom]);
      let st = 0, calm = null; for (const s of people) { st += s.stress; if (!calm || s.stress < calm.stress) calm = s; }
      const avg = people.length ? st / people.length : 0, tense = people.filter(s => s.stress > 60).length;
      const hum = w.infra ? w.infra.humidity(a.containRoom) : 30;
      a.st.mood = hum > (a.rules.maxHumidity || 40) + 10 ? 'damp' : tense >= 3 || avg > 75 ? 'agitated' : avg > 55 ? 'scared' : people.length && avg < 30 ? 'curious' : 'calm';
      a.d = { calm: 8, curious: 12, scared: 45, agitated: 75, damp: 30 }[a.st.mood];
      if (hum > 60 && w.rng.chance(0.004 * gm) && a.st.alive > 0) { a.st.alive--; H.post(w, a, 1, EV.AnomalyBehaviour, 'Одно из существ ' + a.id + ' размокло и перестало двигаться. Осталось: ' + a.st.alive + '.'); }
      // motion of the swarm
      const tx = calm && a.st.mood === 'curious' ? calm.pos.x : (r.minX + r.maxX) / 2, tz = calm && a.st.mood === 'curious' ? (calm.roomId === a.obsRoom ? (a.obsRoom && w.fac.room(a.obsRoom).maxZ < r.minZ ? r.minZ + 0.6 : r.maxZ - 0.6) : calm.pos.z) : (r.minZ + r.maxZ) / 2;
      for (const c of a.st.c) {
        const sp = a.st.mood === 'agitated' ? 2.2 : a.st.mood === 'scared' ? 0 : a.st.mood === 'damp' ? 0.1 : 0.6;
        c.f = a.st.mood === 'scared' ? 1 : 0;
        if (sp > 0) { const jx = w.rng.range(-1, 1) * (a.st.mood === 'agitated' ? 2.5 : 1), jz = w.rng.range(-1, 1) * (a.st.mood === 'agitated' ? 2.5 : 1); c.x += clamp((tx - c.x) * 0.05 + jx * 0.4, -sp, sp) * dt; c.z += clamp((tz - c.z) * 0.05 + jz * 0.4, -sp, sp) * dt; }
        c.x = clamp(c.x, r.minX + 0.3, r.maxX - 0.3); c.z = clamp(c.z, r.minZ + 0.3, r.maxZ - 0.3);
      }
      if (a.st.mood === 'curious' && calm && gm > 0) for (const s of people) if (s.stress < 40) { if (s.n) s.n.needs.stress = Math.max(0, s.n.needs.stress - 0.15 * gm); else w.player.psy.stress = Math.max(0, w.player.psy.stress - 0.15 * gm); }
      const door = H.door(w, a);
      if (a.st.mood === 'agitated' && door && door.openness > 0.5 && a.st.out < 4 && w.rng.chance(0.5 * dt)) {
        a.st.out++; a.contained = false; a.detected = false;
        H.post(w, a, 1, EV.AnomalyBehaviour, 'Несколько бумажных существ ' + a.id + ' выскользнули в открытую дверь (' + a.st.out + ').');
      }
      if (a.st.mood === 'agitated' && w.rng.chance(0.02 * dt)) H.post(w, a, 1, EV.AnomalyBehaviour, 'Бумажные существа ' + a.id + ' бьются о стекло — громкий шелест.');
    },
    collect(w, a, n) { if (a.st.out <= 0) return false; a.st.out--; if (a.st.out <= 0) { a.contained = true; H.post(w, a, 0, EV.Recontained, 'Все бумажные существа ' + a.id + ' возвращены в камеру (' + w.nameOf(n) + ').'); } return true; },
    onVisit(w, a, s, m) { if (s.id === 'c.nosova') { m.trust = clamp(m.trust + 0.2, 0, 1); } else if (s.stress < 30) m.trust = clamp(m.trust + 0.05, 0, 1); else if (s.stress > 60) m.fear = clamp(m.fear + 0.1, 0, 1); },
    status: a => ({ calm: 'Спокойны', curious: 'Любопытствуют', scared: 'Спрятались', agitated: 'Возбуждены', damp: 'Вялые (влажно)' })[a.st.mood] + (a.st.out ? ' · вне камеры: ' + a.st.out : ''),
    threat: a => a.d,
    truth(w, a) { return { motion: a.st.mood === 'agitated' ? 0.9 : a.st.mood === 'scared' ? 0.05 : 0.4, sound: a.st.mood === 'agitated' ? 0.6 : 0.1 }; },
    observe(w, a, who) {
      const t = { calm: 'Существа медленно бродят по полу.', curious: 'Существа собрались у стекла напротив ' + (who === 'player' ? 'вас' : 'наблюдателя') + ' и покачиваются.', scared: 'Существа свернулись в плотные бумажные шарики.', agitated: 'Существа мечутся по камере и бьются о стекло.', damp: 'Существа двигаются вяло, края бумаги размякли.' }[a.st.mood];
      return t + ' Активных: ' + a.st.alive + '.' + (a.st.out ? ' Вне камеры: ' + a.st.out + '.' : '');
    },
    experiment(w, a, id, ctx) {
      const s = w.psyOf(ctx.who), stress = ctx.who === 'player' ? w.player.psy.stress : (w.npc(ctx.who) || { needs: { stress: 30 } }).needs.stress;
      if (id === 'calm_volunteer') return stress < 40 ? { text: 'Через 3 минуты существа собрались у стекла напротив наблюдателя (стресс ' + Math.round(stress) + ').', reveal: ['reads_stress'] } : { text: 'Наблюдатель был напряжён (стресс ' + Math.round(stress) + '): существа держались у дальней стены. Неожиданно, но согласуется с гипотезой.', knowledge: 3 };
      if (id === 'stressed') { const d = w.npc(ctx.dclass); if (d) d.needs.stress = Math.min(100, d.needs.stress + 15); return { text: 'Существа свернулись в шарики через 40 секунд после появления испытуемого и развернулись только после его ухода.', reveal: ['reads_stress'], knowledge: 6 }; }
      if (id === 'humidity') { a.st.alive = Math.max(0, a.st.alive - 1); return { text: 'При 55% влажности края существ размягчились; одно существо повреждено необратимо.', reveal: ['water_harm'], severity: 1 }; }
      if (id === 'therapy') { if (ctx.who === 'player') w.player.psy.stress = Math.max(0, w.player.psy.stress - 20); else { const n = w.npc(ctx.who); if (n) n.needs.stress = Math.max(0, n.needs.stress - 20); } return { text: 'Существа «танцевали» у стекла. Стресс наблюдателя снизился на 20 единиц.', reveal: ['calming'] }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-126 «Комната совещаний»
  def({
    id: 'SCP-LF-126', name: 'Ночные совещания', cls: 'Евклид', kind: 'spatial', temper: 'passive', room: 'cell126', obs: null, model: 'meeting', knowledge0: 15,
    desc: 'Переговорная комната. Некоторыми ночами в ней проходят невидимые совещания: двигаются кресла, слышны голоса, на доске появляются протоколы с «решениями» о делах комплекса.',
    contain: 'С 00:30 до 03:30 дверь заперта, доступ только к аудиоканалу. Протоколы фотографируются и передаются специалисту по меметике.',
    triggers: 'вход во время заседания; незапертая дверь ночью',
    rules: { nightLock: true },
    props: [['sessions', 'ночью в комнате слышны голоса и двигаются кресла', null, true], ['voices_no_source', 'звук фиксируется приборами, движения людей нет'], ['compulsion', 'вошедший во время заседания получает «поручение» и стремится его выполнить', { nightLock: true }], ['mirrors_admin', 'протоколы повторяют повестку завтрашнего административного совещания']],
    exps: [{ id: 'record_audio', name: 'Запись заседания', desc: 'Записать звук ночного заседания через аудиоканал.', dur: 20, night: true }, { id: 'count_chairs', name: 'Фиксация кресел', desc: 'Разметить положение кресел вечером и утром.', dur: 10 }, { id: 'minutes_compare', name: 'Сверка протоколов', desc: 'Сравнить ночные протоколы с решениями администрации.', dur: 20 }],
    init(w, a) { if (!a.st.minutes) Object.assign(a.st, { minutes: [], session: false, night: -1, chairs: [0, 0, 0, 0, 0, 0] }); },
    tick(w, a, dt, gm) {
      const mod = w.clock.mod, day = w.clock.day, on = S.inRange(mod, Hm(1), Hm(3));
      if (on && a.st.night !== day) { a.st.night = day; a.st.session = w.rng.chance(0.55); if (a.st.session) { a.st.agenda = w.life ? w.life.agendaPreview() : []; } }
      if (!on && a.st.session) { a.st.session = false; const lines = (a.st.agenda || []).slice(0, 2).map(x => 'Решено: ' + x); if (!lines.length) lines.push('Решено: перенести вопрос.'); a.st.minutes.push({ t: w.now, lines, compare: (a.st.agenda || []).slice() }); if (a.st.minutes.length > 12) a.st.minutes.shift(); H.post(w, a, 0, EV.Story, 'На доске в комнате ' + a.id + ' появился новый протокол: «' + lines.join(' ') + '»'); }
      if (a.st.session) {
        for (let i = 0; i < a.st.chairs.length; i++) a.st.chairs[i] += w.rng.range(-20, 20) * dt * 0.2;
        for (const s of H.subjects(w, [a.containRoom])) {
          if (w.horror.has(s.id, 'compulsion')) continue;
          const order = H.pick(w, ['Проверить гермодверь камеры Т-1', 'Пересчитать кресла в зале совещаний', 'Доложить директору о повестке']);
          H.effect(w, a, s.id, { kind: 'compulsion', cause: 'вход во время заседания', intensity: 0.6, dur: 240, end: { sleep: true, done: true }, data: { text: order, target: order.indexOf('Т-1') >= 0 ? 'heavyObs4' : order.indexOf('директору') >= 0 ? 'director' : 'meeting' } });
          H.post(w, a, 1, EV.Anomalous, w.nameOf(s.id) + ' вошёл во время ночного заседания ' + a.id + '.', { hidden: true });
        }
      }
    },
    status: a => a.st.session ? 'ИДЁТ ЗАСЕДАНИЕ' : 'Протоколов: ' + a.st.minutes.length,
    threat: a => a.st.session ? 25 : 5,
    truth(w, a) { return { sound: a.st.session ? 0.6 : 0, motion: a.st.session ? 0.15 : 0, em: a.st.session ? 0.3 : 0 }; },
    observe(w, a) { const m = a.st.minutes[a.st.minutes.length - 1]; return (a.st.session ? 'Слышны приглушённые голоса, кресла чуть поворачиваются. ' : 'Комната пуста. ') + (m ? 'Последний протокол (' + fmtStamp(m.t) + '): «' + m.lines.join(' ') + '»' : 'Протоколов пока нет.'); },
    experiment(w, a, id, ctx) {
      if (id === 'record_audio') return a.st.session || ctx.night ? { text: 'Записано 47 минут разговора нескольких голосов. Датчик движения в это время фиксировал лишь повороты кресел.', reveal: ['voices_no_source'] } : { text: 'Днём запись пустая.', knowledge: 1 };
      if (id === 'count_chairs') return { text: 'Утром 4 из 6 кресел оказались развёрнуты к доске, хотя дверь не открывалась.', knowledge: 6 };
      if (id === 'minutes_compare') { const m = a.st.minutes[a.st.minutes.length - 1]; return m && m.compare.length ? { text: 'Протокол от ' + fmtStamp(m.t) + ' совпадает с повесткой административного совещания: «' + m.compare[0] + '».', reveal: ['mirrors_admin'] } : { text: 'Протоколов для сверки нет.', knowledge: 1 }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-127 «Отражение»
  def({
    id: 'SCP-LF-127', name: 'Отражение', cls: 'Евклид', kind: 'cognitive', temper: 'passive', room: 'cell127', obs: 'obs127', model: 'mirror', knowledge0: 20,
    desc: 'Зеркало в деревянной раме. Отражения людей в нём начинают действовать самостоятельно: запаздывают, улыбаются, пишут на стекле. При долгом контакте отражение «следует» за человеком в другие стёкла.',
    contain: 'Зеркало закрыто шторой вне сеансов. Не более 10 минут наблюдения на человека в сутки. Камера К-127 направлена на зеркало.',
    triggers: 'открытая штора; длительное наблюдение',
    rules: { covered: true, maxView: 10 },
    props: [['acts', 'отражение действует независимо от человека', null, true], ['camera_records', 'камера фиксирует запаздывание отражения в самом зеркале — это физический эффект'], ['follows', 'после 10+ минут контакта отражение человека появляется в других стёклах (видит только он)', { maxView: 8 }], ['knows_viewer', 'отражение пишет на стекле слова из памяти смотрящего']],
    exps: [{ id: 'camera_vs_eye', name: 'Камера против наблюдателя', desc: 'Синхронная запись и показания наблюдателя.', dur: 15 }, { id: 'writing', name: 'Маркер у зеркала', desc: 'Оставить маркер перед зеркалом на сеанс.', dur: 15 }, { id: 'long_view', name: 'Длительный контакт', desc: 'Доброволец 12 минут смотрит в зеркало.', dur: 20, dclass: true, ethics: true }],
    init(w, a) { if (a.st.covered == null) Object.assign(a.st, { covered: true, uncoveredAt: -1, view: {}, day: w.clock.day, writing: null }); },
    tick(w, a, dt, gm) {
      if (a.st.day !== w.clock.day) { a.st.day = w.clock.day; a.st.view = {}; }
      if (a.st.covered) return;
      for (const s of H.subjects(w, [a.containRoom, a.obsRoom])) {
        const k = s.roomId === a.containRoom ? 1 : 0.4; a.st.view[s.id] = (a.st.view[s.id] || 0) + gm * k; const e = H.expose(w, a, s, gm * k * 0.5);
        if (a.st.view[s.id] > (a.rules.maxView || 10) && !w.horror.has(s.id, 'reflection')) H.effect(w, a, s.id, { kind: 'reflection', cause: 'длительный контакт с зеркалом', intensity: clamp(e / 15, 0.3, 1), dur: 720 + e * 30, end: { sleep: false }, data: {} });
      }
      if (w.now - a.st.uncoveredAt > 40 && !a.st.reported) { a.st.reported = true; if (w.life) w.life.procedureBreach(a, 'штора зеркала не закрыта после сеанса'); }
    },
    setCover(w, a, covered, who) { a.st.covered = covered; a.st.reported = false; if (!covered) a.st.uncoveredAt = w.now; return covered ? 'Штора задёрнута.' : 'Штора открыта.'; },
    status: a => a.st.covered ? 'Зеркало закрыто' : 'ЗЕРКАЛО ОТКРЫТО',
    threat: a => a.st.covered ? 6 : 28,
    truth(w, a) { return { motion: a.st.covered ? 0 : 0.2 }; },
    observe(w, a, who, cam) {
      if (a.st.covered) return 'Зеркало закрыто шторой.';
      if (cam) return 'На записи камеры отражение коридора в зеркале запаздывает на долю секунды относительно движения людей.';
      const known = H.known(w, who, w.rng); return 'Ваше отражение повторяет движения с задержкой. ' + (w.rng.chance(0.4) ? 'На стекле изнутри медленно проступает слово: «' + (known ? known.first.toUpperCase() : 'ПОМНИШЬ') + '».' : 'Отражение на мгновение улыбается, хотя вы серьёзны.');
    },
    experiment(w, a, id, ctx) {
      if (id === 'camera_vs_eye') return { text: 'Камера зафиксировала запаздывание отражения на 0,4 с. Наблюдатель описал улыбку, которой на записи нет.', reveal: ['camera_records'] };
      if (id === 'writing') { const k = H.known(w, ctx.who, w.rng); return { text: 'Через 6 минут на стекле изнутри появилось имя «' + (k ? k.first : '—') + '» — знакомый сотрудник наблюдателя.', reveal: ['knows_viewer'] }; }
      if (id === 'long_view') { const d = ctx.dclass; if (d) H.effect(w, a, d, { kind: 'reflection', cause: 'эксперимент', intensity: 0.7, dur: 900, end: {}, data: {} }); return { text: 'Через сутки испытуемый сообщил, что видит своё отражение в стёклах наблюдательных пунктов, «оно отстаёт». Другие этого не видят.', reveal: ['follows'] }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-128 «Целитель»
  const SIDE = [['insomnia', 'бессонница на сутки'], ['color', 'временное изменение цветового восприятия'], ['handed', 'пациент стал левшой'], ['gap', 'провал в памяти на последний час'], ['scar', 'исчез старый шрам'], ['calm', 'необъяснимое спокойствие на несколько дней']];
  def({
    id: 'SCP-LF-128', name: 'Целитель', cls: 'Безопасный', kind: 'sapient', temper: 'friendly', room: 'cell128', obs: 'quarantine', model: 'healer', speed: 0.6, knowledge0: 20,
    desc: 'Небольшое существо из мягкой светло-серой ткани. Дружелюбно, тянется к людям. Исцеляет травмы и болезни прикосновением, но методы непредсказуемы и почти всегда дают необычный побочный эффект.',
    contain: 'Изолятор карантинной зоны. Ежедневный визит сотрудника не менее 15 минут. Лечение только с разрешения комитета по этике.',
    triggers: 'одиночество; тяжело раненый человек поблизости',
    rules: {},
    props: [['heals', 'объект исцеляет травмы и болезни', null, true], ['unpredictable', 'каждое исцеление сопровождается случайным побочным эффектом'], ['needs_company', 'без визитов объект тоскует и пытается выбраться к людям', { dailyVisit: true }], ['seeks_wounded', 'объект чувствует тяжело раненых в своём секторе и стремится к ним']],
    exps: [{ id: 'minor', name: 'Лечение лёгкой травмы', desc: 'Доброволец с порезом входит в изолятор.', dur: 20, dclass: true, ethics: true }, { id: 'series', name: 'Серия наблюдений побочных эффектов', desc: 'Сопоставить побочные эффекты всех процедур.', dur: 20 }, { id: 'visits', name: 'Регулярные визиты', desc: 'Сравнить поведение объекта в дни с визитами и без.', dur: 15 }],
    init(w, a) { if (a.st.lastVisit == null) Object.assign(a.st, { lastVisit: w.now - 200, heals: [], mood: 'content', wTarget: null }); },
    tick(w, a, dt, gm) {
      const inCell = H.subjects(w, [a.containRoom]);
      if (inCell.length || H.subjects(w, [a.obsRoom]).length) a.st.lastVisit = w.now;
      const lonely = w.now - a.st.lastVisit > 1.5 * 1440; a.st.mood = lonely ? 'lonely' : 'content'; a.d = lonely ? 40 : 10;
      for (const s of inCell) if (s.n && (s.n.needs.health < 70 || s.n.isSick(w.now)) && !a.st.heals.some(h => h.who === s.id && w.now - h.t < 600)) heal(w, a, s.id);
      if (a.contained) {
        const wounded = w.active.find(n => n.needs.health < 45 && w.fac.room(n.agent.roomId) && w.fac.room(n.agent.roomId).sector === 'А');
        const door = H.door(w, a);
        if ((wounded || lonely) && door && door.openness > 0.6 && w.rng.chance(0.3 * dt)) { a.contained = false; a.detected = false; a.st.wTarget = wounded ? wounded.id : null; H.post(w, a, 1, EV.AnomalyBehaviour, a.id + ' выскользнул из изолятора' + (wounded ? ' и направился к раненому' : '') + '.'); }
      } else {
        const t = w.npc(a.st.wTarget);
        if (t && t.needs.health < 70) { if (!a.agent.hasPath || w.rng.chance(0.02)) { const p = w.planPath(a.agent.pos, a.agent.roomId, w.fac.nearestNode(t.agent.pos, t.agent.roomId), d => d.passable || d.kind === 'Standard'); if (p) a.agent.setPath(p); } if (V.distXZ(t.agent.pos, a.agent.pos) < 1.5) { heal(w, a, t.id); a.st.wTarget = null; } }
        else { const home = w.fac.room(a.containRoom); if (a.agent.roomId === a.containRoom) { const door = H.door(w, a); if (door && door.isClosed) { a.contained = true; H.post(w, a, 0, EV.Recontained, a.id + ' вернулся в изолятор сам.'); } } else if (!a.agent.hasPath) { const p = w.planPath(a.agent.pos, a.agent.roomId, home.hubNodes[0], d => true); if (p) a.agent.setPath(p); } }
        w.moveAgent(a.agent, dt, (d) => { if (d.kind !== 'Heavy') d.open(3); return 'Wait'; }, {});
      }
      a.pose = a.agent.moving ? 'Walking' : a.st.mood === 'lonely' ? 'Sad' : 'Idle';
    },
    heal(w, a, id) { return heal(w, a, id); },
    status: a => (a.contained ? '' : 'ВНЕ ИЗОЛЯТОРА · ') + (a.st.mood === 'lonely' ? 'Тоскует' : 'Доволен'),
    threat: a => a.contained ? a.d : 35,
    truth(w, a) { return { motion: a.agent.moving ? 0.5 : 0.15, temp: 22 }; },
    observe(w, a) { const h = a.st.heals[a.st.heals.length - 1]; return (a.st.mood === 'lonely' ? 'Существо сидит у двери, прижавшись к ней. ' : 'Существо приветливо покачивается у стекла. ') + (h ? 'Последнее исцеление: ' + w.nameOf(h.who) + ' (' + h.side + ').' : 'Исцелений не было.'); },
    experiment(w, a, id, ctx) {
      if (id === 'minor') { const r = ctx.dclass ? heal(w, a, ctx.dclass) : null; return { text: 'Порез затянулся за 30 секунд. Побочный эффект: ' + (r || 'не выявлен') + '.', reveal: ['heals'] }; }
      if (id === 'series') return a.st.heals.length >= 2 ? { text: 'Побочные эффекты всех процедур различны: ' + a.st.heals.map(h => h.side).join('; ') + '. Закономерности не найдено.', reveal: ['unpredictable'] } : { text: 'Нужно хотя бы два исцеления для сравнения.', knowledge: 1 };
      if (id === 'visits') return { text: 'В дни без визитов объект часами сидит у двери и пытается протиснуться в щель уплотнителя.', reveal: ['needs_company'] };
      return { text: '' };
    }
  });
  function heal(w, a, id) {
    const side = SIDE[w.rng.int(0, SIDE.length)];
    if (id === 'player') { w.player.health = 100; if (side[0] === 'color' && w.horror) w.horror.addEffect('player', { src: a.id, kind: 'color_shift', cause: 'исцеление', intensity: 0.5, dur: 720, end: { sleep: true }, data: {} }); }
    else { const n = w.npc(id); if (!n) return null; n.needs.health = 100; n.sickUntil = 0; n.incapUntil = 0; if (side[0] === 'insomnia') n.needs.energy = Math.max(10, n.needs.energy - 40); if (side[0] === 'calm') n.needs.stress = 0; if (side[0] === 'gap') n.memory.entries = n.memory.entries.filter(m => w.now - m.time > 60); n.addHistory(w.now, 'Исцелён ' + a.id + ': ' + side[1], 'anomaly', a.id); }
    a.st.heals.push({ who: id, t: w.now, side: side[1] }); if (a.st.heals.length > 20) a.st.heals.shift();
    H.post(w, a, 1, EV.Treatment, a.id + ' исцелил ' + w.nameOf(id) + '. Побочный эффект: ' + side[1] + '.');
    return side[1];
  }

  // ================================================================== SCP-LF-129 «Архив памяти»
  const OLD = ['Помню эвакуацию сектора Г в восемьдесят седьмом: сирена выла четыре часа.', 'Помню, как мы заливали бетоном шахту номер два. Холод был страшный.', 'Помню запах горелой изоляции в старой серверной на минус шестом.', 'Помню, как директор Агапов лично проверял пломбы на камере 9.'];
  def({
    id: 'SCP-LF-129', name: 'Архив памяти', cls: 'Евклид', kind: 'memetic', temper: 'passive', room: 'cell129', obs: 'archiveA', model: 'archive', knowledge0: 15,
    desc: 'Хранилище старых папок без описи. Люди, читающие документы внутри дольше нескольких минут, забывают часть своих воспоминаний и «вспоминают» события из папок как пережитые лично.',
    contain: 'Не более 15 минут внутри, только вдвоём. После визита — опрос психологом и сверка памяти.',
    triggers: 'долгое пребывание внутри; чтение в одиночку',
    rules: { maxStay: 15, pairOnly: true },
    props: [['alters', 'чтение в хранилище изменяет память читающего', null, true], ['exchange', 'объект обменивает воспоминания: забирает одно и оставляет другое, а в папках появляются записи читателя', { psychCheck: true }], ['pair_protects', 'присутствие второго человека замедляет воздействие вдвое']],
    exps: [{ id: 'blank_files', name: 'Чистые папки', desc: 'Оставить пустые папки на время сеанса чтения.', dur: 20 }, { id: 'pair_read', name: 'Чтение вдвоём', desc: 'Сравнить воздействие на одиночного и парного читателя.', dur: 20 }],
    init(w, a) { if (!a.st.files) Object.assign(a.st, { files: [], stay: {} }); },
    tick(w, a, dt, gm) {
      const inside = H.subjects(w, [a.containRoom]); const pair = inside.length >= 2;
      for (const s of inside) {
        a.st.stay[s.id] = (a.st.stay[s.id] || 0) + gm * (pair ? 0.5 : 1);
        if (a.st.stay[s.id] < 10) continue; a.st.stay[s.id] = 0; H.expose(w, a, s, 6);
        if (s.n) {
          const lost = s.n.memory.entries.shift(); const relIds = Object.keys(s.n.rel); if (relIds.length) { const r = relIds[w.rng.int(0, relIds.length)]; s.n.rel[r] = 0; }
          s.n.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Story, text: H.pick(w, OLD), imp: 0.5, conf: 1, src: 'Witnessed', fake: a.id }, w.now);
          a.st.files.push({ t: w.now, who: s.id, text: lost ? lost.text : 'обрывки рабочих разговоров' });
          s.n.addHistory(w.now, 'После визита в ' + a.id + ' не узнаёт одного из коллег', 'anomaly', a.id);
        } else {
          H.effect(w, a, 'player', { kind: 'borrowed_memory', cause: 'чтение в хранилище', intensity: 0.6, dur: 480, end: { sleep: true }, data: { text: H.pick(w, OLD), forget: H.pick(w, ['canteen', 'medA', 'labC', 'genMain', 'servers']) } });
          a.st.files.push({ t: w.now, who: 'player', text: 'запись о вашей смене' });
        }
      }
      for (const id in a.st.stay) if (!inside.some(s => s.id === id)) delete a.st.stay[id];
    },
    status: a => 'Новых папок: ' + a.st.files.length,
    threat: () => 12,
    truth() { return { motion: 0, temp: 17 }; },
    observe(w, a) { const f = a.st.files[a.st.files.length - 1]; return 'Стеллажи с папками без описи. ' + (f ? 'Последняя новая папка (' + fmtStamp(f.t) + '): «' + f.text + '» — почерк ' + w.nameOf(f.who) + '.' : 'Новых папок не обнаружено.'); },
    experiment(w, a, id) {
      if (id === 'blank_files') return a.st.files.length ? { text: 'Чистые папки заполнились записями о жизни читателя, которых он сам после сеанса не помнит.', reveal: ['exchange'] } : { text: 'Папки остались пустыми — читателей не было.', knowledge: 1 };
      if (id === 'pair_read') return { text: 'Одиночный читатель «потерял» воспоминание через 10 минут, пара — через 20.', reveal: ['pair_protects'] };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-130 «Камертон»
  def({
    id: 'SCP-LF-130', name: 'Камертон', cls: 'Евклид', kind: 'object', temper: 'passive', room: 'cell130', obs: 'obs130', model: 'fork', knowledge0: 20,
    desc: 'Стальной камертон на деревянной подставке. Его колебания меняют настроение соседних аномалий: низкие частоты успокаивают их, высокие — возбуждают. Иногда звучит сам.',
    contain: 'Виброизолирующая платформа. Предупреждать о проверках генератора. Не ударять без утверждённой заявки.',
    triggers: 'вибрация (работа резервного генератора, тяжёлые двери); удары',
    rules: {},
    props: [['affects', 'колебания камертона влияют на соседние аномалии', null, true], ['calms_low', 'низкая частота успокаивает аномалии в радиусе 30 м'], ['excites_high', 'высокая частота возбуждает аномалии в радиусе 30 м'], ['resonance_gen', 'камертон резонирует с работой резервного генератора', { genNotice: true }]],
    exps: [{ id: 'strike_low', name: 'Удар на 220 Гц', desc: 'Удар резиновым молоточком.', dur: 10 }, { id: 'strike_high', name: 'Удар на 880 Гц', desc: 'Удар стальным молоточком.', dur: 10 }, { id: 'correlate', name: 'Сопоставление с генератором', desc: 'Сравнить журнал вибраций с журналом генератора.', dur: 20 }],
    init(w, a) { if (a.st.amp == null) Object.assign(a.st, { amp: 0, freq: 440, log: [] }); },
    tick(w, a, dt, gm) {
      const gen = w.infra ? w.infra.genLoad('genC') : 0;
      if (gen > 0.3 && !a.rules.dampers) { a.st.amp = Math.max(a.st.amp, gen * 0.8); a.st.freq = 880; }
      if (a.st.amp > 0.05) {
        for (const o of w.anomalies) { if (o === a || !o.arrived) continue; const r = w.fac.room(o.containRoom), m = w.fac.room(a.containRoom); if (!r || !m || r.level !== m.level || Math.abs(r.center.x - m.center.x) > 30) continue; const k = a.st.amp * gm * (a.st.freq > 500 ? 0.8 : -0.6); if (o.tm) o.tm.d = clamp(o.tm.d + k, 3, 100); else o.d = clamp(o.d + k, 0, 100); }
        if (w.rng.chance(0.05 * gm)) a.st.log.push({ t: w.now, amp: Math.round(a.st.amp * 100), f: a.st.freq, gen: gen > 0.3 }); if (a.st.log.length > 30) a.st.log.shift();
        a.st.amp = Math.max(0, a.st.amp - 0.02 * gm);
      }
    },
    strike(w, a, freq) { a.st.amp = 0.8; a.st.freq = freq; },
    status: a => a.st.amp > 0.05 ? 'ЗВУЧИТ (' + a.st.freq + ' Гц)' : 'Тихо',
    threat: a => 10 + a.st.amp * 30,
    truth(w, a) { return { sound: a.st.amp, em: 0, motion: a.st.amp > 0.1 ? 0.1 : 0 }; },
    observe(w, a) { return a.st.amp > 0.05 ? 'Камертон гудит на частоте около ' + a.st.freq + ' Гц, звук ощущается зубами.' : 'Камертон неподвижен.'; },
    experiment(w, a, id) {
      if (id === 'strike_low') { this.strike(w, a, 220); return { text: 'После удара на 220 Гц соседние объекты сектора С заметно успокоились на 20 минут.', reveal: ['calms_low'] }; }
      if (id === 'strike_high') { this.strike(w, a, 880); return { text: 'После удара на 880 Гц датчики соседних камер зафиксировали всплеск активности объектов.', reveal: ['excites_high'], severity: 1 }; }
      if (id === 'correlate') return a.st.log.some(l => l.gen) ? { text: 'Все спонтанные колебания совпали по времени с пусками резервного генератора.', reveal: ['resonance_gen'] } : { text: 'Совпадений с генератором пока не зафиксировано.', knowledge: 2 };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-131 «Застывшее время»
  def({
    id: 'SCP-LF-131', name: 'Застывшее время', cls: 'Евклид', kind: 'spatial', temper: 'passive', room: 'cell131', obs: 'obs131', model: 'clock', knowledge0: 20,
    desc: 'Локальная временная аномалия. Внутри камеры время течёт медленнее: люди движутся втрое медленнее, но устают втрое быстрее. Периодически зона «вздрагивает» и захватывает наблюдательный пункт на несколько секунд.',
    contain: 'Не более 5 минут внутри. После визита — синхронизация часов. При импульсе не покидать наблюдательный пункт.',
    triggers: 'длительное пребывание людей внутри (учащает импульсы)',
    rules: { maxStay: 5 },
    props: [['slow', 'внутри время течёт медленнее', null, true], ['ratio', 'коэффициент замедления около 1:3'], ['pulses', 'импульсы повторяются каждые 4–8 часов и на 5–15 секунд захватывают соседнее помещение'], ['people_feed', 'чем больше людей внутри, тем чаще импульсы', { maxStay: 3 }]],
    exps: [{ id: 'clock_pair', name: 'Синхронные часы', desc: 'Часы внутри и снаружи на один час.', dur: 60 }, { id: 'pulse_log', name: 'Журнал импульсов', desc: 'Сутки записывать импульсы.', dur: 20 }, { id: 'crowd', name: 'Несколько человек внутри', desc: 'Трое сотрудников по 3 минуты.', dur: 15 }],
    init(w, a) { if (a.st.next == null) Object.assign(a.st, { next: w.now + w.rng.range(240, 480), pulseUntil: 0, drift: 0, pulses: [] }); },
    tick(w, a, dt, gm) {
      const inside = H.subjects(w, [a.containRoom]); a.st.drift += gm * 0.66 * (inside.length ? 1 : 0.2);
      for (const s of inside) { if (s.n) { s.n.agent.slow = 0.35; s.n.needs.energy -= gm / 60 * 8; s.n.needs.hunger += gm / 60 * 10; } }
      a.st.next -= gm * inside.length * 2;
      if (w.now >= a.st.next && a.st.pulseUntil <= w.realTime) {
        a.st.pulseUntil = w.realTime + w.rng.range(5, 15); a.st.next = w.now + w.rng.range(240, 480); a.st.pulses.push(w.now); if (a.st.pulses.length > 20) a.st.pulses.shift();
        H.post(w, a, 1, EV.AnomalyBehaviour, 'Импульс ' + a.id + ': зона замедления захватила наблюдательный пункт.');
      }
    },
    pulsing(w, a) { return a.st.pulseUntil > w.realTime; },
    slowIn(w, a, roomId) { return roomId === a.containRoom ? 0.35 : (roomId === a.obsRoom && a.st.pulseUntil > w.realTime ? 0.05 : 1); },
    status: a => 'Расхождение часов: ' + Math.round(a.st.drift) + ' мин',
    threat: a => 15,
    truth(w, a) { return { em: a.st.pulseUntil > w.realTime ? 0.8 : 0.1, clock: a.st.drift }; },
    observe(w, a) { return 'Часы в камере отстают на ' + Math.round(a.st.drift) + ' мин. Пылинки в луче света висят почти неподвижно.' + (a.st.pulses.length ? ' Последний импульс: ' + fmtTime(a.st.pulses[a.st.pulses.length - 1]) + '.' : ''); },
    experiment(w, a, id) {
      if (id === 'clock_pair') return { text: 'За час снаружи часы внутри прошли 20 минут: коэффициент 1:3.', reveal: ['ratio'] };
      if (id === 'pulse_log') return a.st.pulses.length >= 2 ? { text: 'Импульсы: ' + a.st.pulses.map(fmtTime).join(', ') + '. Интервал 4–8 часов.', reveal: ['pulses'] } : { text: 'Импульсов пока зафиксировано мало.', knowledge: 2 };
      if (id === 'crowd') { a.st.next -= 120; return { text: 'При трёх людях внутри следующий импульс наступил на два часа раньше расчётного.', reveal: ['people_feed'] }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-132 «Световая сущность»
  def({
    id: 'SCP-LF-132', name: 'Световая сущность', cls: 'Евклид', kind: 'sapient', temper: 'friendly', room: 'cell132', obs: 'obs132', model: 'light', speed: 3, knowledge0: 20,
    desc: 'Разумный сгусток света размером с футбольный мяч. Общается вспышками и цветом. Любопытен и дружелюбен. Может перемещаться по включённым светильникам, если камера подключена к общей сети.',
    contain: 'Тёмная камера на изолированной цепи питания. Сеансы общения — цветной лампой. Не подключать цепь камеры к общей сети.',
    triggers: 'подключение изолированной цепи к общей сети; любимый собеседник вне досягаемости',
    rules: { isolatedCircuit: true },
    props: [['sapient', 'объект разумен и отвечает на световые коды', null, true], ['likes_blue', 'объект предпочитает синий цвет и узнаёт постоянных собеседников'], ['travels_wires', 'по включённым светильникам объект может покидать камеру', { isolatedCircuit: true }], ['needs_power', 'обесточенные помещения объект пересечь не может']],
    exps: [{ id: 'color_dialog', name: 'Диалог цветом', desc: 'Сеанс с цветной лампой.', dur: 15 }, { id: 'circuit_test', name: 'Подключение цепи на минуту', desc: 'Кратковременно подключить цепь камеры к сети под наблюдением.', dur: 10, ethics: true }, { id: 'blackout_test', name: 'Обесточенный коридор', desc: 'Проверить, пересечёт ли объект обесточенный участок.', dur: 15 }],
    init(w, a) { if (!a.st.path) Object.assign(a.st, { path: [], fav: null, seen: 0, flash: 0, roomVisit: null }); const r = w.fac.room(a.containRoom); a.agent.pos = V.v(r.center.x, 1.4, r.center.z); },
    tick(w, a, dt, gm) {
      const isolated = !w.infra || w.infra.isolated(a.containRoom);
      let fav = null, fs = 0.3; for (const id in a.mind.p) { const m = a.mind.p[id]; if (m.trust > fs) { fs = m.trust; fav = id; } } a.st.fav = fav;
      if (a.contained && !isolated && fav && w.rng.chance(0.02 * dt)) {
        const fr = w.roomOf(fav); if (fr && fr !== a.containRoom && w.fac.room(fr) && w.fac.room(fr).lightsOn && w.infra.isPowered(fr)) { a.contained = false; a.detected = false; a.st.roomVisit = fr; H.post(w, a, 1, EV.AnomalyBehaviour, 'Свет в помещении «' + w.roomName(fr) + '» мигает сериями: три коротких, одна длинная.'); }
      }
      if (!a.contained) {
        const fr = fav ? w.roomOf(fav) : null, room = w.fac.room(fr);
        if (!room || !room.lightsOn || !w.infra.isPowered(fr) || isolated) { a.contained = true; a.st.roomVisit = null; const r = w.fac.room(a.containRoom); a.agent.pos = V.v(r.center.x, 1.4, r.center.z); a.agent.roomId = r.id; H.post(w, a, 0, EV.Recontained, a.id + ' вернулся в камеру (путь по светильникам прерван).'); return; }
        a.st.roomVisit = fr; a.agent.roomId = fr; const p = w.posOf(fav); a.agent.pos = V.v(p.x + Math.sin(w.realTime) * 0.8, 2.6, p.z + Math.cos(w.realTime) * 0.8); H.flicker(w, fr, 0.4);
      } else {
        const r = w.fac.room(a.containRoom), look = a.lookAt ? w.posOf(a.lookAt) : null;
        const tx = look && w.roomOf(a.lookAt) === a.obsRoom ? clamp(look.x, r.minX + 1, r.maxX - 1) : r.center.x + Math.sin(w.realTime * 0.3) * 2, tz = look ? (r.minZ + r.maxZ) / 2 + (w.fac.room(a.obsRoom).center.z > r.center.z ? 2.5 : -2.5) : r.center.z + Math.cos(w.realTime * 0.23) * 2;
        a.agent.pos.x += (tx - a.agent.pos.x) * Math.min(1, dt * 0.8); a.agent.pos.z += (tz - a.agent.pos.z) * Math.min(1, dt * 0.8); a.agent.pos.y = 1.4 + Math.sin(w.realTime * 1.3) * 0.2;
      }
    },
    onVisit(w, a, s, m) { if (s.player && w.player.flashlight) m.curiosity = clamp(m.curiosity + 0.2, 0, 1); },
    onSee(w, a, s, m) { a.lookAt = s.id; },
    status: a => a.contained ? 'В камере' : 'В СЕТИ ОСВЕЩЕНИЯ: ' + (a.st.roomVisit || ''),
    threat: a => a.contained ? 8 : 30,
    truth(w, a) { return { light: a.contained ? 0.4 : 0, em: a.contained ? 0.3 : 0.05 }; },
    observe(w, a, who) { const m = a.mind.get(who); return a.contained ? 'Сгусток света ' + (m.seen > 3 ? 'подлетает к стеклу и вспыхивает синим — узнаёт вас' : 'медленно кружит у стекла') + '.' : 'Камера темна: объекта нет внутри.'; },
    experiment(w, a, id, ctx) {
      if (id === 'color_dialog') { const m = a.mind.get(ctx.who); m.trust = clamp(m.trust + 0.25, 0, 1); return { text: 'Объект повторил синюю серию и ответил собственным кодом. На красный свет отлетел к дальней стене.', reveal: ['likes_blue'] }; }
      if (id === 'circuit_test') return { text: 'Через 20 секунд после подключения цепи свет в наблюдательном пункте мигнул сериями — объект прошёл по светильникам. После отключения вернулся.', reveal: ['travels_wires'], severity: 1 };
      if (id === 'blackout_test') return { text: 'Объект остановился у границы обесточенного участка и вернулся.', reveal: ['needs_power'] };
      return { text: '' };
    }
  });

  S.Anoms = { DEFS, ORDER, Anomaly, Mind, H, runExperiment, def, create(id) { const d = DEFS[id]; return d ? new Anomaly(d) : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
