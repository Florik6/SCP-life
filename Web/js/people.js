/* SCP LIFE 2.0 — population: roster of ~300 registered people, shifts, daily routine, presence tiers. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, Hm, Npc, clamp } = S;
  const DAY = 1440;

  const MALE = ['Алексей', 'Андрей', 'Антон', 'Артём', 'Борис', 'Вадим', 'Валерий', 'Василий', 'Виктор', 'Виталий', 'Владимир', 'Вячеслав', 'Геннадий', 'Георгий', 'Глеб', 'Григорий', 'Даниил', 'Денис', 'Дмитрий', 'Евгений', 'Егор', 'Иван', 'Игорь', 'Илья', 'Кирилл', 'Константин', 'Леонид', 'Максим', 'Марк', 'Матвей', 'Михаил', 'Никита', 'Николай', 'Олег', 'Павел', 'Пётр', 'Роман', 'Руслан', 'Рустам', 'Семён', 'Сергей', 'Станислав', 'Степан', 'Тимур', 'Фёдор', 'Юрий', 'Ярослав', 'Эдуард', 'Аркадий', 'Лев'];
  const FEMALE = ['Алина', 'Алла', 'Анастасия', 'Анна', 'Валентина', 'Валерия', 'Вера', 'Виктория', 'Галина', 'Дарья', 'Евгения', 'Екатерина', 'Елена', 'Елизавета', 'Жанна', 'Зоя', 'Ирина', 'Карина', 'Кира', 'Ксения', 'Лариса', 'Лидия', 'Любовь', 'Людмила', 'Маргарита', 'Марина', 'Мария', 'Надежда', 'Наталья', 'Нина', 'Оксана', 'Олеся', 'Ольга', 'Полина', 'Светлана', 'София', 'Тамара', 'Татьяна', 'Ульяна', 'Юлия', 'Яна', 'Эльвира', 'Римма', 'Таисия'];
  const SURN = ['Абрамов', 'Агапов', 'Алексеев', 'Андреев', 'Антонов', 'Баранов', 'Белов', 'Беляев', 'Бирюков', 'Блинов', 'Богданов', 'Борисов', 'Быков', 'Васильев', 'Ветлугин', 'Виноградов', 'Власов', 'Воронин', 'Гаврилов', 'Герасимов', 'Голубев', 'Горбунов', 'Григорьев', 'Гуров', 'Давыдов', 'Данилов', 'Дементьев', 'Денисов', 'Дорофеев', 'Евдокимов', 'Егоров', 'Ершов', 'Жуков', 'Журавлёв', 'Захаров', 'Зимин', 'Зуев', 'Иванов', 'Игнатьев', 'Ильин', 'Казаков', 'Калинин', 'Карпов', 'Киселёв', 'Климов', 'Ковалёв', 'Козлов', 'Колесников', 'Комаров', 'Корнилов', 'Котов', 'Крылов', 'Кудрявцев', 'Кузнецов', 'Куликов', 'Лазарев', 'Ларионов', 'Литвинов', 'Логинов', 'Лукин', 'Макаров', 'Максимов', 'Марков', 'Мартынов', 'Медведев', 'Миронов', 'Михайлов', 'Морозов', 'Назаров', 'Наумов', 'Некрасов', 'Никитин', 'Новиков', 'Носов', 'Овчинников', 'Осипов', 'Павлов', 'Панов', 'Пестов', 'Покровский', 'Поляков', 'Пономарёв', 'Попов', 'Прохоров', 'Родионов', 'Романов', 'Рябов', 'Савельев', 'Сафонов', 'Селезнёв', 'Семёнов', 'Сидоров', 'Симонов', 'Смирнов', 'Соболев', 'Суханов', 'Тарасов', 'Тихонов', 'Третьяков', 'Тимофеев', 'Уваров', 'Ушаков', 'Фадеев', 'Федотов', 'Филиппов', 'Фомин', 'Фролов', 'Харитонов', 'Чернов', 'Шарапов', 'Шестаков', 'Широков', 'Щербаков', 'Юдин', 'Яковлев', 'Ястребов', 'Гладких', 'Шевчук', 'Бондаренко', 'Ткаченко', 'Савчук', 'Мельник', 'Кравец', 'Лысенко'];
  const fem = s => /(ов|ев|ёв|ин|ын)$/.test(s) ? s + 'а' : /ский$/.test(s) ? s.slice(0, -2) + 'ая' : s;
  const COUNTS = {
    lab_assistant: 12, junior_researcher: 14, scientist: 18, senior_scientist: 8, biologist: 6, anomaly_psychologist: 4, memetics: 4, research_director: 1,
    guard: 36, patrol: 14, escort: 10, cctv_operator: 8, security_officer: 6, shift_chief: 4, operative: 18, field_medic: 4, mtf_commander: 2,
    technician: 12, electrician: 8, mechanic: 8, containment_engineer: 6, sysadmin: 5, orderly: 6, doctor: 8, psychiatrist: 2, armorer: 2, surgeon: 2, pathologist: 2,
    dispatcher: 6, ethics_inspector: 3, dept_head: 4, director: 1, janitor: 10, cook: 8, logistician: 6
  };
  const TITLES = { lab_assistant: 'Лаборант', junior_researcher: 'Мл. н. с.', scientist: 'Д-р', senior_scientist: 'Д-р', biologist: 'Д-р', anomaly_psychologist: 'Д-р', memetics: 'Д-р', research_director: 'Проф.', guard: 'Охранник', patrol: 'Патрульный', escort: 'Конвоир', cctv_operator: 'Оператор', security_officer: 'Офицер', shift_chief: 'Нач. смены', operative: 'Оперативник', field_medic: 'Медик МОГ', mtf_commander: 'Командир', technician: 'Техник', electrician: 'Электрик', mechanic: 'Механик', containment_engineer: 'Инженер', sysadmin: 'Сисадмин', orderly: 'Санитар', doctor: 'Врач', psychiatrist: 'Д-р', dispatcher: 'Диспетчер', ethics_inspector: 'Инспектор', dept_head: 'Рук. отдела', director: 'Директор', janitor: 'Уборщик', cook: 'Повар', logistician: 'Логист', armorer: 'Оружейник', surgeon: 'Хирург', pathologist: 'Судмедэксперт' };
  // Department head per working sector (where the staff of a profession enter the complex).
  const ENTRY = { science: 'stairsC', security: 'liftB', mtf: 'freightS', engineering: 'liftB', medical: 'stairsA', admin: 'stairsA', service: 'liftB' };
  const SEAT_ROOMS = { science: ['officesC', 'canteen', 'staffRoom'], security: ['barracks', 'canteen', 'guardPrep', 'staffRoom'], mtf: ['mtfBarracks', 'mtfPrep'], engineering: ['canteen', 'workshop', 'staffRoom'], medical: ['medA', 'canteen', 'staffRoom'], admin: ['canteen', 'meeting', 'staffRoom'], service: ['canteen', 'kitchen', 'staffRoom'] };

  // ------------------------------------------------------------------ roster
  function card(w, n, level, perms) {
    const c = { id: 'card.' + n.id, owner: n.id, ownerName: n.role === 'DClass' ? n.callsign : n.title + ' ' + n.last, level, perms, revoked: false, holder: n.id, room: null, pos: V.v(0, 0, 0), tempLevel: 0, tempPerms: 0, tempUntil: -1 };
    w.cards[c.id] = c; n.cardId = c.id; return c;
  }
  function makeTraits(rng, base) {
    const t = { bravery: rng.range(0.2, 0.9), sociability: rng.range(0.2, 0.9), diligence: rng.range(0.3, 0.95), temper: rng.range(0.1, 0.8), curiosity: rng.range(0.2, 0.9) };
    return Object.assign(t, base || {});
  }
  function makeBeliefs(rng, prof) {
    const b = { science: rng.range(0.2, 0.8), safety: rng.range(0.2, 0.8), ethics: rng.range(0.2, 0.8), order: rng.range(0.2, 0.8) };
    const d = S.Professions.get(prof).dept;
    if (d === 'science') b.science += 0.25; if (d === 'security' || d === 'mtf') { b.safety += 0.2; b.order += 0.2; } if (prof === 'ethics_inspector') b.ethics += 0.35; if (d === 'medical') b.ethics += 0.15;
    for (const k in b) b[k] = clamp(b[k], 0, 1); return b;
  }
  function character(t, b) {
    const w = [];
    w.push(t.bravery > 0.65 ? 'смелый' : t.bravery < 0.35 ? 'осторожный' : 'сдержанный');
    w.push(t.sociability > 0.65 ? 'общительный' : t.sociability < 0.35 ? 'замкнутый' : 'вежливый');
    if (t.diligence > 0.75) w.push('педантичный'); else if (t.diligence < 0.4) w.push('небрежный');
    if (t.temper > 0.65) w.push('вспыльчивый'); if (t.curiosity > 0.75) w.push('любопытный');
    const top = Object.keys(b).sort((x, y) => b[y] - b[x])[0];
    const pr = { science: 'ставит науку выше удобства', safety: 'прежде всего думает о безопасности', ethics: 'щепетилен в вопросах этики', order: 'уважает устав и порядок' }[top];
    return w.join(', ') + '; ' + pr;
  }
  // people come on site by the lift or stairs nearest their workplace, not all through one central lift
  const ENTRIES = ['liftB', 'stairsA', 'stairsC', 'freightS', 'stairsS'];
  function nearestEntry(w, room) { let best = null, bd = Infinity; for (const e of ENTRIES) { if (!w.fac.room(e) || !w.fac.room(room)) continue; const d = w.fac.roomDistance(e, room); if (d < bd) { bd = d; best = e; } } return best; }
  function staff(w, rng, used, prof, o) {
    o = o || {}; const pr = S.Professions.get(prof);
    const female = o.female != null ? o.female : rng.chance(prof === 'operative' || prof === 'mechanic' ? 0.18 : 0.45);
    let first = o.first, last = o.last;
    for (let k = 0; !last && k < 50; k++) { const f = rng.pick(female ? FEMALE : MALE), l0 = rng.pick(SURN), l = female ? fem(l0) : l0; if (!used.has(f + l)) { used.add(f + l); first = f; last = l; } }
    const id = o.id || ('p.' + prof.slice(0, 4) + '.' + (w.npcs.length + 1));
    const traits = makeTraits(rng, o.traits), beliefs = makeBeliefs(rng, prof);
    const n = new Npc({ id, first, last, female, role: pr.look, prof, title: o.title || TITLES[prof], level: pr.level, dept: pr.dept, traits, beliefs, colorVariant: rng.int(0, 4), protocol: pr.dept === 'science' || pr.dept === 'security' || pr.dept === 'mtf', tier: 'abstract', onSite: false });
    n.character = character(traits, beliefs);
    n.shift = o.shift || (pr.shifts.indexOf('night') >= 0 ? (rng.chance(0.5) ? 'day' : 'night') : (pr.dept === 'science' || pr.dept === 'admin' || prof === 'psychiatrist' ? 'office' : 'day'));
    n.restOffset = o.restOffset != null ? o.restOffset : rng.int(0, 6); n.startJit = rng.int(-28, 22); n.mealWave = rng.int(0, 5);
    n.workRooms = pr.work.slice(); n.workRoom = o.workRoom || rng.pick(pr.work); n.entry = nearestEntry(w, n.workRoom) || ENTRY[pr.dept] || 'liftB'; n.resident = !!o.resident; n.bedPoi = o.bedPoi || null;
    n.post = null; n.assignedScps = []; n.tasksDone = 0; n.reportsDone = 0; n.since = 0; n.story = o.story || null; n.avoidAlone = 0;
    n.needs.hunger = rng.range(10, 35); n.needs.energy = rng.range(65, 92); n.needs.social = rng.range(40, 75); n.needs.stress = rng.range(5, 22);
    card(w, n, pr.level, pr.perms); w.addNpc(n); return n;
  }

  // ------------------------------------------------------------------ routine
  // rotation: office staff 4 days of 7, shift staff 3 of 6 — a big roster, a modest number on site at once
  function works(n, day) { if (n.shift === 'office') return ((day + n.restOffset) % 7) < 4; return ((day + n.restOffset) % 6) < 3; }
  // people eat near their own sector: security in the guard prep room, MTF in their barracks, engineers and medics in the staff lounge
  function mealRoom(w, n) { const m = { security: 'guardPrep', mtf: 'mtfBarracks', engineering: 'staffRoom', medical: 'staffRoom' }[n.dept]; return m && w.fac.room(m) ? m : 'canteen'; }
  function shiftSpan(n, day) {
    const j = n.startJit; let s, e;
    if (n.shift === 'night') { s = day * DAY + Hm(19) + j; e = (day + 1) * DAY + Hm(7) + j; }
    else if (n.shift === 'office') { s = day * DAY + Hm(8, 30) + j; e = day * DAY + Hm(17, 30) + j; }
    else { s = day * DAY + Hm(7) + j; e = day * DAY + Hm(19) + j; }
    return { s, e };
  }
  function currentShift(n, t) {
    const day = Math.floor(t / DAY);
    for (const d of [day, day - 1]) { if (!works(n, d)) continue; const sp = shiftSpan(n, d); if (t >= sp.s - 25 && t < sp.e + 10) return sp; }
    return null;
  }
  function nextShift(n, t) { const day = Math.floor(t / DAY); for (let d = day; d < day + 8; d++) { if (!works(n, d)) continue; const sp = shiftSpan(n, d); if (sp.s - 25 > t) return sp; } return null; }
  const B = (activity, roomId, poi, label, start, end, extra) => Object.assign({ activity, roomId, poi, label, start, end }, extra || {});
  function mealSlot(n, sp) {
    // lunch waves of 25 minutes (12:00–14:30), night snack 00:30–02:30, office lunch 12:30–14:30
    if (n.shift === 'night') { const s = Math.floor(sp.s / DAY) * DAY + DAY + Hm(0, 30) + n.mealWave * 22; return { s, e: s + 25 }; }
    const s = Math.floor(sp.s / DAY) * DAY + (n.shift === 'office' ? Hm(12, 30) : Hm(12)) + n.mealWave * 25; return { s, e: s + 28 };
  }
  function staffBlock(w, n, t) {
    const sp = currentShift(n, t), mod = ((t % DAY) + DAY) % DAY;
    if (n.overtime > t && !n.isSick(t)) return B('Duty', n.workRoom, null, S.Professions.get(n.prof).name + ': сверхурочно', t, n.overtime);
    if (n.isSick(t)) return n.resident ? B('Sick', bedRoom(w, n), 'Bed', 'Больничный', t, n.sickUntil, { specificPoi: n.bedPoi }) : B('Offsite', n.entry, null, 'На больничном (жилой уровень 2)', t, n.sickUntil);
    if (sp) {
      if (t < sp.s) return B('Arrive', n.workRoom, null, 'Прибытие на смену', sp.s - 25, sp.s);
      if (t >= sp.e) return n.resident ? B('Leisure', leisureRoom(w, n), 'Seat', 'После смены', sp.e, sp.e + 10) : B('Leave', n.entry, null, 'Сдал смену, уходит', sp.e, sp.e + 10);
      const m = mealSlot(n, sp); if (t >= m.s && t < m.e) return B('Eat', mealRoom(w, n), 'Seat', n.shift === 'night' ? 'Ночной перекус' : 'Обед', m.s, m.e);
      return B('Duty', n.workRoom, null, S.Professions.get(n.prof).name + ': смена', sp.s, sp.e);
    }
    if (!n.resident) { const nx = nextShift(n, t); return B('Offsite', n.entry, null, 'Вне сектора (жилой уровень 2)', t, nx ? nx.s - 25 : t + DAY); }
    // residents: sleep in the shared bunk outside their shift, eat, rest
    const night = n.shift === 'night', sleepS = night ? Hm(8) : Hm(23), sleepE = night ? Hm(15) : Hm(6, 15);
    if (S.inRange(mod, sleepS, sleepE)) return B('Sleep', bedRoom(w, n), 'Bed', 'Сон', t, t + ((sleepE - mod + DAY) % DAY), { specificPoi: n.bedPoi });
    const meals = night ? [[Hm(16), Hm(16, 40), 'Обед'], [Hm(18), Hm(18, 30), 'Ужин перед сменой']] : [[Hm(6, 30), Hm(7), 'Завтрак'], [Hm(19, 30), Hm(20, 10), 'Ужин']];
    for (const m of meals) if (S.inRange(mod, m[0], m[1])) return B('Eat', mealRoom(w, n), 'Seat', m[2], t, t + ((m[1] - mod + DAY) % DAY));
    if (S.inRange(mod, night ? Hm(15) : Hm(6, 15), night ? Hm(15, 25) : Hm(6, 30))) return B('Hygiene', bedRoom(w, n), 'Stand', 'Подъём, гигиена', t, t + 15);
    return B('Leisure', leisureRoom(w, n), 'Seat', 'Свободное время', t, t + 30);
  }
  function dBlock(w, n, t) {
    const mod = ((t % DAY) + DAY) % DAY, home = n.homeRoom, hall = n.hallRoom, lab = n.laborLabel;
    const mess = n.messRoom || hall;
    const T = [[Hm(22), Hm(6, 30), 'Sleep', '@bed', 'CellBunk', 'Отбой'], [Hm(6, 30), Hm(7), 'Hygiene', '@bed', 'Stand', 'Подъём, гигиена'], [Hm(7), Hm(7, 40), 'Eat', mess, 'Seat', 'Раздача пайков'],
      [Hm(7, 40), Hm(12), 'Labor', hall, 'Workbench', lab], [Hm(12), Hm(12, 40), 'Eat', mess, 'Seat', 'Обед'], [Hm(12, 40), Hm(17), 'Labor', hall, 'Workbench', lab], [Hm(17), Hm(18, 30), 'Leisure', hall, 'Seat', 'Свободное время'],
      [Hm(18, 30), Hm(19, 10), 'Eat', mess, 'Seat', 'Ужин'], [Hm(19, 10), Hm(21, 45), 'Leisure', hall, 'Seat', 'Свободное время'], [Hm(21, 45), Hm(22), 'Confined', '@bed', 'CellBunk', 'Вечерняя поверка']];
    if (!n.onSite && n.reserve) return B('Offsite', null, null, 'Резервный блок D-1', t, t + DAY);
    for (const b of T) if (S.inRange(mod, b[0], b[1])) {
      const room = b[3] === '@bed' ? home : b[3];
      return B(b[2], room, b[4], b[5], t, t + ((b[1] - mod + DAY) % DAY), b[3] === '@bed' && (b[4] === 'CellBunk') ? { specificPoi: n.bedPoi } : null);
    }
    return B('Idle', home, 'Stand', 'Свободное время', t, t + 10);
  }
  function bedRoom(w, n) { const p = w.fac.poi(n.bedPoi); return p ? p.roomId : (n.resident ? 'quartersA' : n.workRoom); }
  function leisureRoom(w, n) { const l = SEAT_ROOMS[n.dept] || ['canteen']; return String(n.id || 'p').charCodeAt(String(n.id || 'p').length - 1) % 3 === 0 ? (n.bedPoi ? bedRoom(w, n) : l[0]) : l[0]; }
  function block(w, n, t) { if (t == null) t = w.now; return n.role === 'DClass' ? dBlock(w, n, t) : staffBlock(w, n, t); }

  // ------------------------------------------------------------------ presence (multi-tier)
  function wantsOnSite(w, n) {
    if (n.dead || n.played) return false;
    if (n.role === 'DClass') return !n.reserve;
    if (n.resident) return !n.isSick(w.now) || !!n.bedPoi;
    const b = block(w, n); return b.activity !== 'Offsite';
  }
  function spawn(w, n, roomId) {
    const room = w.fac.room(roomId || n.entry) || w.fac.room('liftB'), hub = room.hubPoints[0] || room.center;
    n.agent.pos = V.v(hub.x + w.rng.range(-0.6, 0.6), room.floorY, hub.z + w.rng.range(-0.6, 0.6)); n.agent.roomId = room.id; n.agent.clear();
    n.onSite = true; n.tier = 'active'; n.activity = 'Idle'; n.arrived = false; n.nextThink = 0; n.reservedPoi = null;
    w.setActive(n, true);
  }
  function despawn(w, n) {
    if (n.reservedPoi) { const p = w.fac.poi(n.reservedPoi); if (p && p.reservedBy === n.id) p.reservedBy = null; n.reservedPoi = null; }
    n.agent.clear(); n.onSite = false; n.tier = 'abstract'; n.activity = 'Offsite'; n.label = 'Вне сектора'; n.conv = null; n.agent.roomId = null;
    w.setActive(n, false);
  }
  function sync(w) {
    for (const n of w.npcs) {
      if (n.onSite || n.role === 'DClass' || n.missing || n.dead || n.played) continue;
      if (wantsOnSite(w, n)) spawn(w, n, n.entry);
    }
  }
  // Abstract people: cheap needs, sleep, illness and off-site life (no geometry, no paths).
  function tickAbstract(w, gmin) {
    const h = gmin / 60, day = w.clock.day;
    for (const n of w.npcs) {
      if (n.onSite || n.dead || n.played) continue;
      const nd = n.needs; nd.energy = clamp(nd.energy + 6 * h, 0, 100); nd.hunger = clamp(nd.hunger - 3 * h, 0, 100); nd.stress = clamp(nd.stress - 3 * h, 0, 100); nd.social = clamp(nd.social + 4 * h, 0, 100);
      n.psy.fatigue = clamp(n.psy.fatigue - 8 * h, 0, 100); n.psy.fear = clamp(n.psy.fear - 10 * h, 0, 100); n.psy.exposure = clamp(n.psy.exposure - 2 * h, 0, 100);
      if (nd.health < 100) nd.health = clamp(nd.health + 2 * h, 0, 100);
    }
    if (w._illDay !== day) { w._illDay = day; illnessRoll(w); }
  }
  // Daily illness roll: tired and stressed people fall ill more often; long-exposed staff develop symptoms.
  function illnessRoll(w) {
    for (const n of w.npcs) {
      if (n.role === 'DClass' || n.isSick(w.now) || n.missing) continue;
      const p = 0.006 + (100 - n.needs.energy) * 0.0002 + n.needs.stress * 0.00015 + n.psy.exposure * 0.0003;
      if (!w.rng.chance(p)) continue;
      const days = w.rng.int(1, 4); n.sickUntil = w.now + days * DAY - (w.now % DAY) + Hm(7);
      n.addHistory(w.now, 'Взял больничный на ' + days + ' дн.', 'sick');
      w.events.post({ time: w.now, type: S.EV.Personnel, actor: n.id, severity: 0, text: n.displayName + ' (' + S.Professions.get(n.prof).name.toLowerCase() + ') на больничном до ' + S.fmtStamp(n.sickUntil) });
      if (w.life) w.life.onAbsence(n, 'sick');
    }
  }

  // ------------------------------------------------------------------ generation
  function generate(w, opts) {
    opts = opts || {}; const rng = new S.SimRandom((opts.seed || 1) * 7919 + 13), used = new Set();
    // story characters and the stage-1 staff keep their ids and histories
    const keep = [
      ['g.petrenko', 'guard', { first: 'Олег', last: 'Петренко', female: false, shift: 'day', restOffset: 2, resident: true, bedPoi: 'dorm.bed1', workRoom: 'post', traits: { bravery: 0.7, sociability: 0.6, diligence: 0.6, temper: 0.4, curiosity: 0.4 } }],
      ['g.melnik', 'guard', { first: 'Ирина', last: 'Мельник', female: true, shift: 'night', restOffset: 2, resident: true, bedPoi: 'dorm.bed2', workRoom: 'post', traits: { bravery: 0.55, sociability: 0.4, diligence: 0.8, temper: 0.3, curiosity: 0.3 } }],
      ['s.orlova', 'senior_scientist', { first: 'Вера', last: 'Орлова', female: true, shift: 'office', restOffset: 0, resident: true, bedPoi: 'dorm.bed3', workRoom: 'lab', traits: { bravery: 0.75, sociability: 0.5, diligence: 0.9, temper: 0.2, curiosity: 0.9 } }],
      ['s.kim', 'scientist', { first: 'Артём', last: 'Ким', female: false, shift: 'office', restOffset: 1, resident: true, bedPoi: 'dorm.bed4', workRoom: 'lab', traits: { bravery: 0.45, sociability: 0.7, diligence: 0.6, temper: 0.35, curiosity: 0.7 } }],
      ['s.lebedev', 'junior_researcher', { first: 'Павел', last: 'Лебедев', female: false, shift: 'night', restOffset: 3, resident: true, bedPoi: 'dorm.bed5', workRoom: 'lab', traits: { bravery: 0.35, sociability: 0.8, diligence: 0.5, temper: 0.5, curiosity: 0.6 } }],
      ['t.sokolov', 'technician', { first: 'Игорь', last: 'Соколов', female: false, shift: 'day', restOffset: 4, resident: true, bedPoi: 'dorm.bed6', workRoom: 'eng', traits: { bravery: 0.5, sociability: 0.5, diligence: 0.7, temper: 0.45, curiosity: 0.4 } }],
      ['m.zaitseva', 'doctor', { first: 'Анна', last: 'Зайцева', female: true, shift: 'day', restOffset: 5, resident: true, bedPoi: 'dorm.bed7', workRoom: 'med', title: 'Фельдшер', traits: { bravery: 0.4, sociability: 0.65, diligence: 0.75, temper: 0.25, curiosity: 0.5 } }],
      ['t.gurov', 'technician', { first: 'Семён', last: 'Гуров', female: false, shift: 'day', restOffset: 1, workRoom: 'workshop', story: 'escort_only', traits: { bravery: 0.25, diligence: 0.85 } }],
      ['g.yastrebov', 'guard', { first: 'Тимур', last: 'Ястребов', female: false, shift: 'night', restOffset: 0, workRoom: 'postC', story: 'breach_survivor', traits: { bravery: 0.6, temper: 0.6 } }],
      ['s.vetlugina', 'memetics', { first: 'Римма', last: 'Ветлугина', female: true, shift: 'office', restOffset: 2, workRoom: 'archiveA', story: 'lf121_lead', traits: { diligence: 0.9, curiosity: 0.8 } }],
      ['s.pokrovsky', 'senior_scientist', { first: 'Аркадий', last: 'Покровский', female: false, shift: 'office', restOffset: 3, workRoom: 'officesC', story: 'lf124_believer', traits: { curiosity: 0.95, temper: 0.55 } }],
      ['c.nosova', 'cook', { first: 'Тамара', last: 'Носова', female: true, shift: 'day', restOffset: 0, workRoom: 'kitchen', story: 'paper_friend', traits: { sociability: 0.9, bravery: 0.5 } }],
      ['e.larionov', 'ethics_inspector', { first: 'Лев', last: 'Ларионов', female: false, shift: 'office', restOffset: 4, workRoom: 'meeting', traits: { temper: 0.3, diligence: 0.8 } }],
      ['a.director', 'director', { first: 'Маргарита', last: 'Широкова', female: true, shift: 'office', restOffset: 0, resident: true, workRoom: 'director', title: 'Директор', traits: { bravery: 0.7, diligence: 0.85, temper: 0.4 } }],
      ['s.rd', 'research_director', { first: 'Георгий', last: 'Ушаков', female: false, shift: 'office', restOffset: 1, resident: true, workRoom: 'officesC', traits: { curiosity: 0.8, diligence: 0.7 } }]
    ];
    const counts = Object.assign({}, COUNTS);
    for (const k of keep) { const n = staff(w, rng, used, k[1], Object.assign({ id: k[0] }, k[2])); counts[k[1]] = Math.max(0, counts[k[1]] - 1); if (n.story) storyHistory(w, n); }
    const npl = opts.playerProf; if (npl && counts[npl] > 0) counts[npl]--;
    for (const prof of Object.keys(counts)) for (let i = 0; i < counts[prof]; i++) staff(w, rng, used, prof);
    // residents: MTF and part of security live on site with hot bunking (day + night share a bunk)
    const bunks = ['mtfBarracks', 'barracks'].map(id => w.fac.room(id)).filter(Boolean).flatMap(r => r.pois.filter(p => p.type === 'Bed')), qbeds = w.fac.room('quartersA').pois.filter(p => p.type === 'Bed');
    const resid = w.npcs.filter(n => !n.bedPoi && (n.dept === 'mtf' || n.prof === 'shift_chief'));
    let bi = 0; for (const n of resid) { const b = bunks[Math.floor(bi / 2) % bunks.length]; if (Math.floor(bi / 2) >= bunks.length * 2) break; n.resident = true; n.bedPoi = b.id; b.owners = (b.owners || []).concat(n.id); bi++; }
    const sres = w.npcs.filter(n => !n.bedPoi && (n.prof === 'senior_scientist' || n.prof === 'research_director' || n.prof === 'director' || n.prof === 'dept_head'));
    sres.forEach((n, i) => { const b = qbeds[i % qbeds.length]; if (!b || (b.owners && b.owners.length >= 2)) return; n.resident = true; n.bedPoi = b.id; b.owners = (b.owners || []).concat(n.id); });
    for (const p of Object.values(w.fac.pois)) if (p.type === 'Bed' && !p.owners) { const o = w.npcs.find(n => n.bedPoi === p.id); if (o) p.owners = [o.id]; }
    // posts for security, scientists to anomalies
    const posts = ['post', 'postA', 'postC', 'postD', 'reservePost', 'ctrlPost', 'detHall'];
    w.npcs.filter(n => n.prof === 'guard').forEach((n, i) => { n.post = n.workRoom = n.id === 'g.yastrebov' ? 'postC' : posts[i % posts.length]; });
    w.npcs.filter(n => n.prof === 'escort').forEach((n, i) => { n.post = n.workRoom = i % 3 === 2 ? 'd3wait' : 'postD'; });
    // D-class: 4 cells in sector B, 8 double cells on level 4, 20 more in the reserve block
    const dn = ['Виктор', 'Сергей', 'Марина', 'Рустам'], dc = ['D-9341', 'D-7720', 'D-4108', 'D-5512'], df = [false, false, true, false], did = ['d.9341', 'd.7720', 'd.4108', 'd.5512'];
    const dtr = [[0.6, 0.4, 0.7], [0.3, 0.6, 0.5], [0.5, 0.7, 0.3], [0.45, 0.5, 0.55]];
    for (let i = 0; i < 4; i++) dclass(w, rng, did[i], dn[i], 'Ветров', dc[i], df[i], 'cell' + (i + 1), 'dblock', 'cell' + (i + 1) + '.bunk', i % 2 ? 'Трудовая смена: прачечная' : 'Трудовая смена: сортировка', { bravery: dtr[i][0], sociability: dtr[i][1], temper: dtr[i][2] });
    for (let c = 0; c < 8; c++) for (let k = 0; k < 2; k++) { const num = 'D-' + (2000 + rng.int(0, 7999)); dclass(w, rng, 'd.' + num.slice(2) + (w.npcs.length), null, null, num, rng.chance(0.25), 'dcell' + (c + 1), 'dhall', 'dcell' + (c + 1) + '.bunk', rng.pick(['Трудовая смена: ремонт тары', 'Трудовая смена: сборка', 'Трудовая смена: стирка'])); }
    // sector D-3 on level 4: six double cells, own common room and mess
    for (let c = 0; c < 6; c++) for (let k = 0; k < 2; k++) { const num = 'D-' + (2000 + rng.int(0, 7999)); const n = dclass(w, rng, 'd.' + num.slice(2) + (w.npcs.length), null, null, num, rng.chance(0.25), 'd3cell' + (c + 1), 'd3common', 'd3cell' + (c + 1) + '.bunk', rng.pick(['Трудовая смена: сортировка ветоши', 'Трудовая смена: ремонт тары', 'Трудовая смена: уборка сектора'])); n.messRoom = 'd3mess'; }
    for (let i = 0; i < 20; i++) { const num = 'D-' + (1000 + rng.int(0, 8999)); const n = dclass(w, rng, 'd.r' + num.slice(2) + i, null, null, num, rng.chance(0.25), null, 'dhall', null, 'Трудовая смена'); n.reserve = true; }
    const rel = (a, b, v) => { const x = w.npc(a), y = w.npc(b); if (x && y) { x.adjustRel(y.id, v); y.adjustRel(x.id, v); } };
    rel('s.orlova', 's.kim', 35); rel('s.orlova', 's.lebedev', 15); rel('s.kim', 's.lebedev', 20); rel('g.petrenko', 'g.melnik', 25); rel('t.sokolov', 'g.petrenko', 15); rel('m.zaitseva', 's.orlova', 20);
    rel('d.9341', 'd.7720', -25); rel('d.4108', 'd.5512', 20); rel('d.7720', 'd.4108', 10); rel('t.gurov', 't.sokolov', 30); rel('s.pokrovsky', 's.vetlugina', -15); rel('s.pokrovsky', 's.rd', -10); rel('e.larionov', 's.pokrovsky', -20); rel('a.director', 's.rd', 20);
    // colleagues of one department and room know each other; a few rivalries
    const byDept = {}; for (const n of w.npcs) (byDept[n.dept] = byDept[n.dept] || []).push(n);
    for (const d in byDept) { const L = byDept[d]; for (let i = 0; i < L.length; i++) for (let k = 1; k <= 2; k++) { const o = L[(i + k * 7) % L.length]; if (o === L[i]) continue; const v = rng.chance(0.12) ? -rng.range(10, 30) : rng.range(5, 30); L[i].adjustRel(o.id, v); o.adjustRel(L[i].id, v * rng.range(0.6, 1)); } }
    w.npc('g.petrenko').adjustRel('player', 10); w.npc('g.melnik').adjustRel('player', 5);
  }
  function dclass(w, rng, id, first, lastIgnored, callsign, female, home, hall, bed, labor, tr) {
    const n = new Npc({ id, first: first || rng.pick(female ? FEMALE : MALE), last: callsign, female, role: 'DClass', prof: 'dclass', title: '', callsign, level: 0, dept: 'dclass', traits: makeTraits(rng, tr), beliefs: { science: 0.2, safety: 0.6, ethics: 0.5, order: 0.3 }, colorVariant: rng.int(0, 4), protocol: false, tier: 'abstract', onSite: false });
    n.character = character(n.traits, n.beliefs); n.homeRoom = home; n.hallRoom = hall; n.bedPoi = bed; n.laborLabel = labor; n.workRoom = hall; n.shift = 'dclass'; n.resident = true; n.entry = 'dhall';
    n.needs.stress = rng.range(20, 40); n.needs.hunger = rng.range(10, 35); n.needs.energy = rng.range(65, 90); n.compliance = rng.range(0.3, 0.9); n.testsDone = 0; n.assignedScps = []; n.tasksDone = 0;
    const bp = w.fac.poi(bed); if (bp) bp.owners = (bp.owners || []).concat(id);
    card(w, n, 0, S.P.CellResident); w.addNpc(n); return n;
  }
  // A replacement arrives: a new person with name, profession, character, rank, access card, workplace, relations and traits.
  // The hiring record (spec) is enough to recreate exactly the same person when a save is loaded.
  function hire(w, spec, restoring) {
    const rng = new S.SimRandom(((w.seed || 1) * 7919 + spec.n * 104729 + 17) >>> 0), used = new Set(w.npcs.map(x => x.first + x.last));
    const id = spec.id || ('h.' + spec.prof.slice(0, 4) + '.' + spec.n), kept = w.cards['card.' + id];
    if (w.npc(id)) return w.npc(id);
    let n;
    if (spec.prof === 'dclass') {
      const num = 'D-' + (3000 + rng.int(0, 6999)), hall = spec.hall || 'dhall';
      n = dclass(w, rng, id, null, null, num, rng.chance(0.2), spec.home || 'dcell1', hall, spec.bed || null, rng.pick(['Трудовая смена: сортировка', 'Трудовая смена: ремонт тары', 'Трудовая смена: уборка сектора']));
      if (hall === 'd3common') n.messRoom = 'd3mess'; n.entry = hall;
    } else {
      n = staff(w, rng, used, spec.prof, { id, workRoom: spec.room && w.fac.room(spec.room) ? spec.room : undefined });
      if (spec.post) n.post = n.workRoom = spec.post;
      if (spec.bed) { const b = w.fac.poi(spec.bed); if (b) { n.bedPoi = b.id; n.resident = true; b.owners = (b.owners || []).filter(o => o !== spec.by).concat(n.id); } }
      // knows a couple of colleagues from earlier postings; strangers to the rest
      const mates = w.npcs.filter(o => o !== n && o.dept === n.dept && !o.dead); for (let k = 0; k < Math.min(2, mates.length); k++) { const o = mates[rng.int(0, mates.length)]; const v = rng.range(5, 25); n.adjustRel(o.id, v); o.adjustRel(n.id, v * 0.7); }
    }
    if (kept) w.cards[kept.id] = kept;
    n.hired = spec.t != null ? spec.t : w.now; n.hireSpec = Object.assign({}, spec, { id, t: n.hired });
    if (!restoring) {
      n.addHistory(w.now, 'Переведён' + (n.female ? 'а' : '') + ' на объект на замену выбывшего сотрудника', 'personnel');
      if (n.role === 'DClass') { spawn(w, n, n.hallRoom); w.events.post({ time: w.now, type: S.EV.Personnel, roomId: n.hallRoom, severity: 1, text: 'Конвой доставил заключённого ' + n.callsign + ' в «' + w.roomName(n.hallRoom) + '».' }); }
    }
    return n;
  }
  function storyHistory(w, n) {
    const H = {
      escort_only: 'Три года назад был в камере при сбое замка. С тех пор не подходит к SCP без сопровождения охраны.',
      breach_survivor: 'Пережил прорыв на другом объекте. Плохо спит в ночные смены у камер содержания.',
      lf121_lead: 'Ведёт аудит записей SCP-LF-121. Уверена, что объект «пишет» себя и в её отчёты.',
      lf124_believer: 'Считает, что Прогнозист говорит правду чаще, чем принято признавать. Спорит с комитетом по этике.',
      paper_friend: 'Носит бумажным существам LF-125 обрезки бумаги из столовой, хотя это не предусмотрено процедурами.'
    };
    n.addHistory(0, H[n.story], 'story');
    if (n.story === 'escort_only') n.fears.any = 0.8;
    if (n.story === 'breach_survivor') n.fears['SCP-L-001'] = 0.5;
  }

  // Initial placement at game start: people already in their rooms, the rest off site.
  function placeAll(w) {
    for (const n of w.npcs) {
      if (!wantsOnSite(w, n)) { n.onSite = false; n.tier = 'abstract'; n.activity = 'Offsite'; continue; }
      const b = block(w, n); let room = w.fac.room(b.roomId), poi = null;
      if (b.activity === 'Arrive') room = w.fac.room(n.entry);
      if (b.specificPoi) poi = w.fac.poi(b.specificPoi);
      if (!poi && room && b.poi) poi = room.pois.find(p => p.type === b.poi && !p.reservedBy && (!p.owners || p.owners.indexOf(n.id) >= 0)) || null;
      if (!room || b.activity === 'Duty') room = w.fac.room(n.workRoom) || w.fac.room('corridor');
      if (poi) { n.agent.pos = V.copy(poi.pos); n.agent.roomId = poi.roomId; n.agent.yaw = poi.yaw; }
      else { const h = room.hubPoints[w.rng.int(0, room.hubPoints.length)] || room.center; n.agent.pos = V.v(h.x + w.rng.range(-0.8, 0.8), room.floorY, h.z + w.rng.range(-0.8, 0.8)); n.agent.roomId = room.id; }
      n.onSite = true; n.tier = 'active'; n.nextConv = w.now + w.rng.range(5, 40);
      w.setActive(n, true);
    }
  }

  S.People = { generate, hire, block, staffBlock, currentShift, works, wantsOnSite, spawn, despawn, sync, tickAbstract, placeAll, COUNTS, TITLES, MALE, FEMALE, SURN, fem, character, makeTraits, makeBeliefs };
})(typeof window !== 'undefined' ? window : globalThis);
