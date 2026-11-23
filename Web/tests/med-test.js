// Injuries, death, medicine, bodies, staff losses (node Web/tests/med-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, Med = S.Med;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min) => { const end = w.now + min; while (w.now < end) w.tick(0.1); };
const park = w => { w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; };
const onSite = (w, f) => w.active.filter(n => !n.dead && !n.incap(w.now) && n.agent.roomId && (!f || f(n)));

// 1. Kinds of harm have different consequences
{
  const w = S.Content.createWorld(31, { prof: 'guard' }); park(w); run(w, 20);
  const [a, b, c] = onSite(w, n => n.role !== 'DClass').slice(0, 3);
  w.rng.state = 12345;
  Med.hurt(w, a.id, 35, 'gunshot', null, 'Тест: ранение');
  Med.hurt(w, b.id, 30, 'psych', null, 'Тест: шок');
  Med.hurt(w, c.id, 40, 'blunt', null, 'Тест: удар', { ko: 6 });
  ok(a.wounds.some(k => k.k === 'gunshot' && k.bleed > 0.3) && Med.state(w, a) === 'serious', 'огнестрел: кровотечение, тяжёлое состояние (' + Med.state(w, a) + ')');
  ok(!(b.wounds || []).length && b.needs.health > 90 && b.needs.stress > 40, 'психическая травма: стресс без ран (здоровье ' + Math.round(b.needs.health) + ', стресс ' + Math.round(b.needs.stress) + ')');
  ok(Med.state(w, c) === 'unconscious' && c.incap(w.now), 'удар с потерей сознания: человек без сознания');
  ok(w.tasks.hasActive('first_aid', a.id), 'к тяжело раненому вызвана первая помощь');
}
// 2. Bleeding kills without help; first aid saves
{
  const w = S.Content.createWorld(32, { prof: 'guard' }); park(w); run(w, 20);
  const [a, b] = onSite(w, n => n.role !== 'DClass').slice(0, 2);
  for (const t of w.tasks.list) t.status = 'Failed';
  w.life.assign = () => null;                                   // nobody comes: pure physiology
  Med.hurt(w, a.id, 45, 'claw', null, 'Тест'); Med.hurt(w, b.id, 45, 'claw', null, 'Тест');
  for (const x of [a, b]) x.incapUntil = w.now + 1e4;      // both stay where they fell: nobody walks to the medbay on their own here
  Med.firstAid(w, null, b.id);
  run(w, 120);
  ok(a.dead && a.deathCause === 'claw', 'без помощи раненый истёк кровью (' + (a.dead ? 'погиб' : Math.round(a.needs.health)) + ')');
  ok(!b.dead && b.wounds.every(k => k.bleed === 0), 'после первой помощи кровотечение остановлено, человек жив (здоровье ' + Math.round(b.needs.health) + ')');
}
// 3. Death: event, body, witnesses, report, vacancy; body found → morgue → autopsy; colleague takes over
{
  const w = S.Content.createWorld(33, { prof: 'guard' }); park(w);
  S.Content && run(w, 30);
  const room = Object.entries(w.byRoom).filter(([id, l]) => l.filter(n => !n.dead && n.role !== 'DClass').length >= 3).sort((x, y) => y[1].length - x[1].length)[0];
  const victim = room[1].find(n => n.role !== 'DClass'), others = room[1].filter(n => n !== victim && !n.dead);
  const friend = others[0]; friend.adjustRel(victim.id, 60);
  const fear0 = others.map(n => n.psy.fear);
  const deaths0 = w.events.recent.filter(e => e.type === 'Death').length;
  Med.die(w, victim.id, 'claw', 'SCP-LF-145', 'Тест');
  const b = Med.body(w, victim.id);
  ok(victim.dead && victim.activity === 'Dead' && w.events.recent.filter(e => e.type === 'Death').length === deaths0 + 1, 'гибель — событие симуляции, человек выбыл из жизни');
  ok(b && b.found && b.witnesses.length >= 1, 'тело на месте гибели, свидетели: ' + (b ? b.witnesses.length : 0));
  ok(others.some((n, i) => n.psy.fear > fear0[i] + 20) && others.some(n => n.memory.entries.some(m => m.subject === victim.id && m.imp > 0.9)), 'свидетели напуганы и запомнили гибель');
  ok(friend.history.some(h => h.text.indexOf(victim.last) >= 0 || h.text.indexOf(victim.callsign || '#') >= 0), 'близкий коллега переживает утрату (запись в истории)');
  ok(Med.M(w).vacancies.some(v => v.by === victim.id), 'рабочее место стало вакантным');
  ok(w.life.cases.some(c => c.kind === 'death'), 'открыто расследование гибели');
  const rep = S.Incident.get(w, b.report); ok(rep && rep.losses.length && rep.causes.length, 'создан отчёт об инциденте: ' + rep.id);
  let t = 0; while (!b.inMorgue && t < 600) { run(w, 5); t += 5; }
  ok(b.inMorgue && b.registered, 'тело зарегистрировано и доставлено в морг за ' + t + ' мин');
  t = 0; while (!b.autopsy && t < 1440) { run(w, 10); t += 10; }
  ok(!!b.autopsy, 'судмедэксперт провёл вскрытие: ' + (b.autopsy ? b.autopsy.detail : '—'));
  ok(rep.closed && /вскрытие/.test(rep.causes.join(' ')), 'медицинское заключение в отчёте');
  console.log('\n' + S.Incident.text(w, rep) + '\n');
}
// 4. Replacement is limited: reserve → decision → a new person with name, profession, card, workplace
{
  const w = S.Content.createWorld(34, { prof: 'guard' }); park(w); run(w, 10);
  const md = Med.M(w); md.reserve.staff = 1;
  const g = onSite(w, n => n.prof === 'technician').slice(0, 2);
  for (const n of g) Med.die(w, n.id, 'shock', null, 'Тест');
  run(w, 420); const decided = w.life.decisions.some(d => /Замещение/.test(d.cause));
  run(w, 2600);
  const vs = md.vacancies.filter(v => g.some(n => n.id === v.by));
  const filled = vs.filter(v => v.status === 'filled'), waiting = vs.filter(v => v.status === 'waiting');
  const h = filled.length ? w.npc(filled[0].hire) : null;
  ok(filled.length === 1 && waiting.length === 1, 'резерв ограничен: одна замена прибыла, вторая вакансия ждёт (' + vs.map(v => v.status).join(', ') + ')');
  ok(h && h.prof === 'technician' && h.first && h.last && h.character && w.card(h.cardId) && w.card(h.cardId).level === S.Professions.get('technician').level && h.workRoom, 'новый сотрудник: ' + (h ? h.displayName + ', ' + h.character + ', допуск L' + w.card(h.cardId).level + ', рабочее место «' + w.roomName(h.workRoom) + '»' : '—'));
  ok(decided, 'решение о замещении принято администрацией');
  // save / load keeps the dead, the bodies and the hired person
  const w2 = S.World.load(w.save());
  ok(w2.npc(h.id) && w2.npc(h.id).first === h.first && g.every(n => w2.npc(n.id).dead) && Med.M(w2).bodies.length === md.bodies.length, 'сохранение: погибшие, тела и новый сотрудник восстановлены');
}
// 5. The player can die too; the body stays in the world
{
  const w = S.Content.createWorld(35, { prof: 'guard' }); park(w); run(w, 5);
  w.damagePlayer(60, null, 'Тест', 'gunshot'); w.damagePlayer(60, null, 'Тест', 'gunshot');
  ok(w.player.dead && Med.body(w, 'player'), 'игрок погиб, тело осталось в мире');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL MEDICAL CHECKS PASSED');
process.exit(failures ? 1 : 0);
