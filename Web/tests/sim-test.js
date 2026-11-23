// Headless checks of the SCP LIFE 2.0 simulation (node Web/tests/sim-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min) => { const end = w.now + min; while (w.now < end) w.tick(0.1); };
const until = (w, h, m) => run(w, w.clock.minutesUntil(S.Hm(h, m || 0)));
const park = w => { const r = w.fac.room('post'); w.player.pos = { x: -24.5, y: 0, z: -8.5 }; w.player.roomId = r.id; };

// 1. Population, professions, tiers
{
  const w = S.Content.createWorld(1, { prof: 'guard' });
  const profs = new Set(w.npcs.map(n => n.prof));
  ok(w.npcs.length >= 300, 'зарегистрировано людей: ' + w.npcs.length);
  ok(S.Professions.LIST.length >= 33 && profs.size >= 33, 'профессий в штате: ' + profs.size + ' (игровых должностей: ' + S.Professions.LIST.length + ')');
  ok(w.active.length > 60 && w.active.length < w.npcs.length, 'активных на территории: ' + w.active.length + ', остальные — упрощённая симуляция');
  ok(w.npcs.every(n => n.first && n.last && n.prof && n.character && n.beliefs), 'у каждого есть имя, должность, характер, убеждения');
  ok(w.fac.roomList.length >= 90 && w.fac.roomList.some(r => r.level === 4), 'комплекс: ' + w.fac.roomList.length + ' помещений на двух уровнях');
  ok(w.anomalies.length >= 21 && w.anomalies.filter(a => a.arrived).length >= 19, 'объектов: ' + w.anomalies.length + ' (' + w.anomalies.filter(a => a.arrived).length + ' в комплексе)');
}
// 2. Three days of autonomous life
let W3 = null;
{
  const w = S.Content.createWorld(7, { prof: 'guard' }); park(w); W3 = w;
  const t0 = Date.now(); let day = 0, night = 0, stuckMax = 0; const still = {};
  let maxActive = 0, minActive = 1e9;
  for (let k = 0; k < 3 * 1440 * 20; k++) {
    w.tick(0.1);
    if (k % 50 === 0) { for (const n of w.active) { if (n.agent.hasPath && !n.agent.moving && n.agent.transitT <= 0 && !n.agent.waitingDoor) still[n.id] = (still[n.id] || 0) + 5; else still[n.id] = 0; stuckMax = Math.max(stuckMax, still[n.id] || 0); } maxActive = Math.max(maxActive, w.active.length); minActive = Math.min(minActive, w.active.length); }
  }
  const ms = Date.now() - t0;
  ok(maxActive > minActive + 30, 'смены приходят и уходят: на территории от ' + minActive + ' до ' + maxActive);
  const a = w.anomaly('SCP-L-001');
  ok(w.now - a.tm.lastSession < 600 && a.contained, 'сеансы счёта L-001 идут по регламенту (последний ' + S.fmtStamp(a.tm.lastSession) + ')');
  const done = w.tasks.done.npc;
  ok(done > 60, 'NPC выполнили заданий SCP LIFE: ' + done + ' (+ рутина по профессиям)');
  const exps = w.anomalies.reduce((s, x) => s + x.experiments.length, 0), props = w.anomalies.reduce((s, x) => s + x.props.filter(p => p.revealed).length, 0);
  ok(exps >= 6, 'учёные провели экспериментов: ' + exps);
  ok(w.anomalies.some(x => x.props.some(p => p.revealed && !x.def.props.find(q => q[0] === p.id)[3])), 'исследования открыли скрытые свойства (открыто всего ' + props + ')');
  const known = w.infra.faults.filter(f => f.known).length, fixed = w.infra.faults.filter(f => f.fixed).length;
  ok(known > 5 && fixed >= known * 0.6, 'неисправности находят и чинят: ' + fixed + '/' + known);
  ok(w.life.agenda.some(x => x.status === 'decided'), 'совещания и комитет принимают решения: ' + w.life.agenda.filter(x => x.status === 'decided').length);
  ok(w.life.decisions.length > 50 && w.life.decisions.every(d => d.cause && d.decision && Array.isArray(d.data)), 'журнал решений SCP LIFE: ' + w.life.decisions.length + ' записей (причина → данные → решение)');
  ok(stuckMax <= 60, 'никто не застревает надолго (максимум ' + stuckMax + ' с без движения при наличии маршрута)');
  ok(w.events.recent.some(e => e.type === 'Conversation') && w.events.recent.some(e => e.type === 'Conflict' || e.type === 'Meeting'), 'разговоры и споры случаются');
  ok(w.npcs.some(n => n.isSick(w.now) || n.history.some(h => h.kind === 'sick')), 'сотрудники болеют, SCP LIFE ищет замену');
  ok(w.life.decisions.some(d => /Нехватка|Ответственные/.test(d.cause)), 'нехватка персонала и замены отражены в журнале');
  ok(w.life.arrivals[0].stage !== 'planned' && w.life.transport.length >= 4, 'поступление SCP-LF-147: этап «' + w.life.arrivals[0].stage + '», записей в журнале транспортировки: ' + w.life.transport.length);
  ok(w.life.cases.length > 0 && w.life.cases.some(c => c.evidence.length >= 2), 'расследования собирают улики: дел ' + w.life.cases.length);
  console.log('     3 суток за ' + ms + ' мс');
}
// 3. Access: dual authorisation and curfew (cannot leave, can enter the cell)
{
  const w = S.Content.createWorld(2); park(w);
  ok(w.presentCard('d.chamber', 'card.s.orlova', 's.orlova', 'airlock') === 'AwaitingSecondCard', 'гермодверь L-001 ждёт вторую карту');
  ok(w.presentCard('d.chamber', 'card.s.kim', 's.kim', 'airlock') === 'Granted', 'две карты разных владельцев открывают');
  ok(w.presentCard('d.airlock', 'card.player', 'player', 'corridor') === 'DeniedLevel', 'охраннику L2 в шлюз нельзя');
  until(w, 23, 0);
  ok(w.presentCard('d.cell1', 'card.d.9341', 'd.9341', 'cell1') === 'DeniedCurfew', 'комендантский час: из камеры не выйти');
  ok(w.presentCard('d.cell1', 'card.d.9341', 'd.9341', 'dblock') === 'Granted', 'опоздавший заключённый может войти в свою камеру');
}
// 4. Breach of SCP-L-001 and recontainment
{
  const w = S.Content.createWorld(41); park(w); const a = w.anomaly('SCP-L-001'), t = a.tm;
  run(w, 5); t.d = 88; w.fac.door(t.doorId).integrity = 0; run(w, 30);
  ok(!a.contained || t.state === 'WaitingAtDoor' || w.events.recent.some(e => /выходит из камеры|Нарушение/.test(e.text || '')), 'отказ замка при возбуждении ведёт к прорыву');
  run(w, 300);
  ok(w.events.recent.some(e => e.type === 'ContainmentBreach') ? (a.contained || t.state === 'Returning') : true, 'объект возвращается/возвращён: ' + t.state);
}
// 5. Reality vs perception: a hallucination is not on camera, others do not share it, it ends on sleep, reports are checked
{
  const w = S.Content.createWorld(5); park(w); run(w, 10);
  const n = w.active.find(x => x.prof === 'guard' && x.agent.roomId);
  const e = w.horror.addEffect(n.id, { src: 'SCP-LF-133', kind: 'follower', cause: 'тест', intensity: 0.8, dur: 600, end: { sleep: true, company: true, therapy: true } });
  ok(!!e && w.horror.has(n.id, 'follower'), 'эффект восприятия создан у ' + n.shortName);
  ok(w.active.filter(x => x !== n).every(x => !w.horror.has(x.id, 'follower')) && !w.horror.has('player', 'follower'), 'другие люди этого не воспринимают');
  run(w, 20);
  const real = new Set(['player'].concat(w.npcs.map(x => x.id), w.anomalies.map(x => x.id)));
  ok(w.camLog.every(c => real.has(c.subj)), 'камеры записывают только реальный мир');
  const s = w.life.sighting(n.id, { roomId: n.agent.roomId, text: 'кто-то идёт за мной', kind: 'follower', perceived: 'SCP-LF-133' }); run(w, 3);
  ok(w.tasks.list.some(t => t.kind === 'investigate' && t.data.sighting === s.id), 'SCP LIFE направила патруль проверить сообщение');
  run(w, 240);
  ok(s.status === 'unconfirmed' || s.checks.length >= 1, 'проверка: «' + (s.checks.slice(-1)[0] || '') + '»');
  n.activity = 'Sleep'; n.arrived = true; w.horror.t = 0; w.horror.tick(0.1);
  ok(!w.horror.has(n.id, 'follower'), 'эффект прекращается после сна');
  // the player asks a colleague whether they see it
  w.horror.addEffect('player', { src: 'SCP-LF-136', kind: 'seated_figure', cause: 'тест', intensity: 0.7, dur: 300, end: { sleep: true }, data: { desc: 'старик с газетой' } });
  const other = w.active.find(x => x.role !== 'DClass' && !w.horror.effectsOf(x.id).length);
  ok(/никого|Пусто|Ничего|Что именно/.test(S.Dialogue.askSee(w, other)[0]), 'коллега без воздействия фигуры не видит');
  w.horror.addEffect(other.id, { src: 'SCP-LF-136', kind: 'seated_figure', cause: 'тест', intensity: 0.7, dur: 300, end: {}, data: { desc: 'мальчик лет десяти' } });
  ok(/мальчик/.test(S.Dialogue.askSee(w, other)[0]), 'пострадавший от того же SCP видит другую фигуру');
}
// 6. A false alarm with an ordinary cause is found and explained
{
  const w = S.Content.createWorld(6); park(w); until(w, 23, 30);
  const g = w.active.find(x => (x.prof === 'guard' || x.prof === 'patrol') && S.People.block(w, x).activity === 'Duty');
  ok(!!g, 'ночью на посту есть охрана');
  if (g) {
    const fa = { kind: 'radio', who: g.id, t: w.now, roomId: g.agent.roomId, cause: 'У ' + g.shortName + ' разрядилась рация', text: 'сотрудник не отвечает', explained: false };
    w.horror.falseAlarms.push(fa);
    w.infra.dryRadio(g.id); run(w, 300);
    ok(w.life.decisions.some(d => /Перекличка/.test(d.cause)), 'перекличка заметила молчащую рацию');
    ok(fa.explained || w.tasks.list.some(t => t.kind === 'investigate' && t.status === 'Completed' && /села батарея/.test(t.note || '')), 'патруль нашёл обычную причину: севшая батарея');
  }
}
// 7. A tense night can end without real danger
{
  const w = S.Content.createWorld(8, { prof: 'patrol' }); until(w, 23, 0);
  const r = w.fac.room('corrC'); w.player.pos = { x: 70, y: 0, z: 0 }; w.player.roomId = 'corrC'; w.player.psy.fear = 30; w.player.psy.fatigue = 60;
  const states = new Set(); for (let k = 0; k < 6 * 60 * 20; k++) { w.tick(0.1); if (k % 20 === 0) states.add(w.horror.state); }
  ok(states.has('uncertainty') || states.has('tension'), 'режиссёр создаёт напряжение: ' + [...states].join(', '));
  ok(w.alert.level < 3 && !w.events.recent.some(e => e.type === 'Injury' && w.now - e.time < 400), 'ночь прошла без реальной угрозы');
  ok(w.horror.falseAlarms.length <= 3, 'ложных тревог немного: ' + w.horror.falseAlarms.length);
}
// 8. Every playable profession receives its own duties and can complete them
{
  const tested = ['guard', 'patrol', 'escort', 'cctv_operator', 'technician', 'electrician', 'mechanic', 'sysadmin', 'containment_engineer', 'scientist', 'junior_researcher', 'lab_assistant', 'biologist', 'memetics', 'doctor', 'orderly', 'psychiatrist', 'dispatcher', 'ethics_inspector', 'janitor', 'cook', 'logistician', 'operative', 'director', 'dclass'];
  const got = {}, bad = [];
  for (const prof of tested) {
    const w = S.Content.createWorld(11, { prof });
    if (w.player.shift === 'office') until(w, 9, 30); else run(w, 20);
    const mine = () => w.tasks.list.filter(x => x.who === 'player');
    if (!mine().length) run(w, 40);
    const t = mine().find(x => x.status === 'Active') || mine()[0];
    if (!t) { bad.push(prof); continue; }
    got[prof] = t.kind;
    for (let i = 0; i < 10 && t.status === 'Active'; i++) w.playerStepDone(t);
    if (t.status !== 'Completed' || w.player.tasksInRole < 1) bad.push(prof + '(не завершилось)');
  }
  ok(!bad.length, 'должности с заданиями: ' + Object.keys(got).length + '/' + tested.length + (bad.length ? ' — проблемы: ' + bad.join(', ') : ''));
  console.log('     ' + Object.entries(got).map(([k, v]) => k + '→' + v).join(', '));
}
// 9. Career: promotion offer after meeting the requirements
{
  const w = S.Content.createWorld(12, { prof: 'guard', mode: 'career' }); const p = w.player;
  until(w, 23, 20); p.rep.security = 70; p.tasksInRole = 12; p.daysInRole = 2; p.reprimands = 0; until(w, 23, 40);
  ok(p.promoOffer === 'security_officer', 'предложено повышение: ' + p.promoOffer);
}
// 10. Save/load round trip and determinism
{
  const w = W3; const s1 = w.save(), w2 = S.World.load(s1), s2 = w2.save();
  ok(s1 === s2, 'сохранение без потерь (' + Math.round(s1.length / 1024) + ' КБ)');
  run(w2, 120); ok(w2.active.length > 0, 'загруженный мир продолжает симуляцию');
  ok(JSON.parse(s1).life.cases.length === w.life.cases.length && JSON.parse(s1).horror && JSON.parse(s1).npcs[0].m, 'расследования, восприятие и память NPC сохраняются');
  const a = S.Content.createWorld(42), b = S.Content.createWorld(42); park(a); park(b); run(a, 120); run(b, 120);
  ok(a.save() === b.save(), 'детерминизм');
}
// 10. Living anomalies of wing T-2: attention, hearing, behaviour that depends on being watched, research
{
  const w = S.Content.createWorld(11, { prof: 'scientist' }); park(w); run(w, 3);
  const p = w.player, L = S.Living, tick = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); w.tick(0.1); } };
  // the player alone at the window (other staff are sent out so that the test controls who watches)
  const clear = id => { const a = w.anomaly(id); for (const n of w.active) if (n.agent.roomId === a.obsRoom || n.agent.roomId === a.containRoom) { n.agent.pos = { x: -24, y: 0, z: -8 }; n.agent.roomId = 'post'; n.agent.clear(); } };
  const at = id => { const a = w.anomaly(id), r = w.fac.room(a.obsRoom), win = w.fac.windows.find(x => x.scp === id); p.pos = { x: (win.min + win.max) / 2, y: r.floorY, z: r.minZ + 1 }; p.roomId = r.id; a.st.ws = {}; clear(id); return a; };
  const away = () => { p.pos = { x: -24.5, y: 0, z: -8.5 }; p.roomId = 'post'; p.gazeAt = null; };
  const ids = ['SCP-LF-139', 'SCP-LF-140', 'SCP-LF-141', 'SCP-LF-142', 'SCP-LF-143', 'SCP-LF-144', 'SCP-LF-145', 'SCP-LF-146'];
  ok(ids.every(id => { const a = w.anomaly(id); return a && a.arrived && w.fac.room(a.containRoom) && w.fac.blocks[id]; }), 'крыло Т-2: 8 живых объектов в своих блоках (наблюдательная + камера + окно)');
  ok(ids.every(id => w.anomaly(id).assigned.length >= 1), 'у живых объектов есть ответственные учёные');
  ok(new Set(ids.map(id => w.anomaly(id).model)).size === 8, 'у каждого живого объекта своя модель');
  // LF-141 freezes under a gaze, moves only unwatched
  let a = at('SCP-LF-141'); p.gazeAt = a.id; let movedWatched = 0;
  tick(150, () => { clear('SCP-LF-141'); p.gazeT = w.realTime; p.moving = false; if (w.anomaly('SCP-LF-141').agent.moving) movedWatched++; });
  ok(a.st.act === 'freeze' && movedWatched < 20, 'LF-141 замирает под взглядом (движений под наблюдением: ' + movedWatched + ')');
  away(); const m0 = a.st.moved || 0; run(w, 25);
  ok((a.st.moved || 0) > m0 + 0.5, 'LF-141 перемещается без наблюдения (' + ((a.st.moved || 0) - m0).toFixed(1) + ' м)');
  // LF-143 follows a moving person along the glass, loses a motionless one
  a = at('SCP-LF-143'); p.gazeAt = a.id; tick(120, i => { clear('SCP-LF-143'); p.gazeT = w.realTime; p.moving = true; p.pos.x += Math.sin(i / 15) * 0.04; });
  ok(a.st.act === 'press' || a.st.act === 'scratch', 'LF-143 подходит к стеклу к движущемуся наблюдателю (' + a.st.act + ')');
  tick(300, () => { p.gazeT = w.realTime; p.moving = false; clear('SCP-LF-143'); });
  ok(a.st.act === 'lurk', 'LF-143 теряет неподвижного наблюдателя и уходит в темноту');
  L.knock(w, 'player', a.id); tick(15);
  ok(a.st.act === 'rush' || a.st.act === 'press', 'LF-143 реагирует на стук по стеклу (' + a.st.act + ')');
  // LF-142 answers knocks with the same number
  a = at('SCP-LF-142'); p.gazeAt = a.id; tick(30, () => { p.gazeT = w.realTime; clear('SCP-LF-142'); });
  for (let k = 0; k < 4; k++) L.knock(w, 'player', a.id); tick(40, () => { p.gazeT = w.realTime; clear('SCP-LF-142'); });
  ok(a.st.replyN === 4, 'LF-142 отвечает на 4 удара четырьмя (ответ: ' + a.st.replyN + ')');
  ok(a.st.copy === 'player', 'LF-142 перенимает облик того, кто смотрит дольше');
  // LF-140 never turns while a camera watches it
  a = w.anomaly('SCP-LF-140'); away(); const c0 = a.st.chair; a.rules.cctvContinuous = true; run(w, 60);
  ok(a.st.chair === c0, 'LF-140 не поворачивается, пока на него смотрит камера');
  a.rules.cctvContinuous = false; a.st.gap = 0; let turned = false; for (let k = 0; k < 6 && !turned; k++) { run(w, 30); turned = a.st.chair !== c0; }
  ok(turned, 'LF-140 поворачивается без наблюдения (стул: ' + c0 + '° → ' + a.st.chair + '°)');
  // LF-146 looks at whoever watches it and leaves an after-effect
  a = at('SCP-LF-146'); p.gazeAt = a.id; tick(700, () => { p.gazeT = w.realTime; clear('SCP-LF-146'); });
  const off146 = Math.abs(S.deltaAngle(a.agent.yaw + a.st.head, L.yawTo(a, p.pos)));
  ok(a.st.act === 'stare' && a.st.target === 'player' && off146 < 8, 'LF-146 смотрит на наблюдателя (голова ' + Math.round(a.st.head) + '°, отклонение взгляда ' + off146.toFixed(1) + '°)');
  ok(w.horror.effectsOf('player').some(e => e.src === 'SCP-LF-146'), 'после долгого контакта взглядом — последействие восприятия');
  // LF-145 protects the offspring from a loud noise
  a = w.anomaly('SCP-LF-145'); w.makeNoise('scream', w.fac.room(a.obsRoom).center, a.obsRoom, 1); tick(20);
  ok(a.st.act === 'guard', 'LF-145 закрывает детёнышей при громком звуке');
  // LF-139 approaches only a lone observer
  a = at('SCP-LF-139'); p.gazeAt = a.id; for (const n of w.active) if (n.agent.roomId === a.obsRoom) { n.agent.pos = { x: -24, y: 0, z: -8 }; n.agent.roomId = 'post'; }
  tick(500, () => { p.gazeT = w.realTime; for (const n of w.active) if (n.agent.roomId === a.obsRoom) n.agent.roomId = 'post'; });
  ok(a.st.act === 'approach' || a.st.act === 'peer', 'LF-139 подходит к одинокому наблюдателю (' + a.st.act + ')');
  // LF-144 freezes when watched
  a = at('SCP-LF-144'); p.gazeAt = a.id; const f0 = a.st.frame; tick(200, () => { p.gazeT = w.realTime; clear('SCP-LF-144'); });
  ok(a.st.frame === f0 && a.st.act === 'frozen', 'LF-144 застывает под взглядом');
  away(); run(w, 60);
  ok(ids.filter(id => (w.anomaly(id).st.reports || []).length).length >= 6, 'автоматические отчёты по журналам движения: ' + ids.filter(id => (w.anomaly(id).st.reports || []).length).length + ' объектов');
  const rec = S.Anoms.runExperiment(w, w.anomaly('SCP-LF-143'), 'light', { who: 'player' });
  ok(rec.revealed.length >= 1 && w.anomaly('SCP-LF-143').st.safe.length >= 1, 'эксперимент открывает свойство и безопасный метод (' + rec.revealed[0] + ')');
  ok(S.Living.dossier(w, w.anomaly('SCP-LF-143')).length >= 4, 'досье: наблюдение, активность по часам, узнаваемые сотрудники, журнал');
  const sv = w.save(), w2 = S.World.load ? null : null; ok(sv.length < 2.5e6 && JSON.parse(sv), 'сохранение с живыми объектами: ' + Math.round(sv.length / 1024) + ' КБ');
}
console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
