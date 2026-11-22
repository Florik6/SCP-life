// Headless checks of the browser simulation (node Web/tests/sim-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
for (const f of ['core', 'brain', 'tallyman', 'world', 'content']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const park = w => { w.player.pos = { x: -24.5, y: 0, z: -8.5 }; w.player.roomId = 'post'; };
const run = (w, min) => { const end = w.now + min; while (w.now < end) w.tick(0.1); };
const until = (w, h, m) => run(w, w.clock.minutesUntil(S.Hm(h, m || 0)));

// 1. Routine over 3 days
{
  const w = S.Content.createWorld(1); park(w); let conflicts = 0, blocked = 0;
  w.events.listeners.push(e => { if (e.type === 'Conflict') conflicts++; });
  const t0 = Date.now();
  until(w, 8, 15);
  const or = w.npc('s.orlova'); ok(or.activity === 'ObservationSession' && or.agent.roomId === 'obs', 'Орлова на утреннем сеансе в наблюдательной');
  until(w, 10, 0);
  ok(w.npcs.filter(n => n.role === 'DClass').every(n => n.activity === 'Labor' && n.agent.roomId === 'dblock'), 'класс D на трудовой смене в блоке D');
  ok(w.npc('m.zaitseva').agent.roomId === 'med', 'фельдшер в медпункте');
  until(w, 23, 30);
  ok(w.npcs.filter(n => n.role === 'DClass').every((n, i) => n.activity === 'Sleep' && n.agent.roomId === 'cell' + (i + 1) && n.posture === 'Lying'), 'класс D спят в своих камерах');
  run(w, 3 * 1440);
  for (const n of w.npcs) if (n.bark && /Не могу|не открывается/.test(n.bark)) blocked++;
  ok(w.npcs.every(n => n.needs.hunger < 95 && n.needs.energy > 3), 'потребности в норме после 3 суток');
  ok(w.accessLog.length > 150, 'проходы по картам: ' + w.accessLog.length);
  ok(conflicts > 0, 'ссоры случаются: ' + conflicts);
  ok(w.anomalies[0].contained && w.alert.level === 0, 'спокойная смена без происшествий');
  console.log('     3+ суток за ' + (Date.now() - t0) + ' мс');
}
// 2. Dual authorisation & curfew
{
  const w = S.Content.createWorld(2); park(w);
  ok(w.presentCard('d.chamber', 'card.s.orlova', 's.orlova', 'airlock') === 'AwaitingSecondCard', 'гермодверь ждёт вторую карту');
  ok(w.presentCard('d.chamber', 'card.s.kim', 's.kim', 'airlock') === 'Granted', 'две карты разных владельцев открывают');
  ok(w.presentCard('d.airlock', 'card.player', 'player', 'corridor') === 'DeniedLevel', 'охраннику L2 в шлюз нельзя');
  until(w, 23, 0);
  ok(w.presentCard('d.cell1', 'card.d.9341', 'd.9341', 'cell1') === 'DeniedCurfew', 'комендантский час для класса D');
}
// 3. Alert informs staff, inspection cancelled
{
  const w = S.Content.createWorld(40); park(w); const a = w.anomalies[0], t = a.beh;
  until(w, 15, 30); t.d = 82; run(w, 5);
  ok(w.alert.level >= 2, 'датчики замка: оранжевая тревога');
  const before = w.fac.door(t.doorId).cycles; until(w, 16, 40);
  ok(w.fac.door(t.doorId).cycles === before && a.contained, 'осмотр отменён, объект в камере');
  ok(w.tasks.list.some(x => x.kind === 'ObservationSession'), 'назначен внеплановый сеанс счёта');
}
// 4. Silent waiting at learned time exploits uninformed inspection
{
  const w = S.Content.createWorld(41); park(w); const a = w.anomalies[0], t = a.beh;
  t.seedDoor(16, 0, 3); t.seedDoor(16, 15, 3);
  until(w, 15, 50); t.d = 76; run(w, 2);
  ok(t.state === 'WaitingAtDoor' && w.alert.level < 2, 'молча ждёт у двери, датчики молчат');
  until(w, 16, 40);
  ok(w.events.recent.some(e => /выходит из камеры/.test(e.text || '')), 'плановое открытие выпускает объект');
  ok(w.events.recent.some(e => e.type === 'ContainmentBreach'), 'прорыв обнаружен');
  run(w, 120);
  ok(a.contained, 'объект возвращён: ' + t.state);
}
// 5. Save/load round trip
{
  const w = S.Content.createWorld(21); park(w); run(w, 9 * 60);
  const s1 = w.save(), w2 = S.World.load(s1), s2 = w2.save();
  ok(s1 === s2, 'сохранение без потерь (' + Math.round(s1.length / 1024) + ' КБ)');
  park(w2); run(w2, 120); ok(true, 'загруженный мир продолжает симуляцию');
}
// 6. Determinism
{
  const a = S.Content.createWorld(42), b = S.Content.createWorld(42); park(a); park(b); run(a, 180); run(b, 180);
  ok(a.save() === b.save(), 'детерминизм');
}
console.log(failures ? failures + ' FAILED' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
