// Interactive repair procedures: hidden causes, diagnosis, safety, parts, verification, NPC technicians, new faults (node Web/tests/work-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'procedures', 'checkpoint', 'dclass', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, P = S.Proc;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min, each) => { const end = w.now + min; while (w.now < end) { w.tick(0.1); if (each && each()) return true; } return false; };
const park = w => { w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; };
const fresh = (seed, prof) => { const w = S.Content.createWorld(seed, { prof: prof || 'guard' }); park(w); w.infra.wear = () => {}; return w; };
const setCause = (f, id) => { f.cause = id; f.clues = []; f.repaired = false; f.tries = 0; f.misses = 0; };

// 1. Every fault has a hidden cause; the clues found by diagnosis belong to that cause
{
  const w = fresh(41, 'technician'); run(w, 5);
  const kinds = ['light', 'panel', 'camera', 'reader', 'sensor', 'vent', 'humidity', 'door', 'terminal', 'cooling', 'emlight'];
  const made = kinds.map(k => w.infra.create(k)).filter(Boolean);
  ok(made.length >= 10 && made.every(f => P.causeOf(f)), 'неисправности получили скрытые причины: ' + made.map(f => f.kind + '→' + f.cause).join(', '));
  const f = made.find(x => x.kind === 'light'); setCause(f, 'driver');
  const r1 = P.act(w, f, 'player', 'test'), r2 = P.act(w, f, 'player', 'measure');
  ok(/один светильник/.test(r1.text) && /в норме/.test(r2.text) && f.clues.length === 2, 'диагностика даёт улики причины: «' + r1.text + '» / «' + r2.text + '»');
  setCause(f, 'overload'); const r3 = P.act(w, f, 'player', 'test');
  ok(/приборы/.test(r3.text), 'другая причина — другие симптомы: «' + r3.text + '»');
}
// 2. The procedure: wrong fix does not help, verification without repair fails, power cut is a real outage, right fix + check closes it
{
  const w = fresh(42, 'technician'); run(w, 5);
  const f = w.infra.create('light', 'corrB'); w.infra.discover(f, 'тест'); setCause(f, 'contact');
  const rv = P.act(w, f, 'player', 'verify');
  ok(/сохраняется/.test(rv.text) && !f.fixed, 'проверка без ремонта: «' + rv.text + '»');
  P.act(w, f, 'player', 'power');
  ok(f.powerOff && !w.infra.isPowered(f.site), 'обесточивание — реальное отключение помещения «' + w.roomName(f.site) + '»');
  const rw = P.act(w, f, 'player', 'rebalance');
  ok(/не помогло/.test(rw.text) && !f.repaired, 'неверный способ не помогает: «' + rw.text + '»');
  const rm = P.act(w, f, 'player', 'tighten', { miss: true });
  ok(rm.miss && !f.repaired && f.misses === 1, 'промах в мини-игре затяжки: «' + rm.text + '»');
  P.act(w, f, 'player', 'tighten');
  const rp = P.act(w, f, 'player', 'verify');
  ok(/обесточен/.test(rp.text) && !f.fixed, 'проверка без питания невозможна');
  P.act(w, f, 'player', 'power'); const rd = P.act(w, f, 'player', 'verify');
  ok(rd.done && f.fixed && w.infra.isPowered(f.site) && f.solvedBy === 'player', 'верный ремонт + проверка: «' + rd.text + '»');
}
// 3. Working live is dangerous; with the power cut nobody gets a shock
{
  const w = fresh(43, 'technician'); run(w, 5); w.rng.state = 777;
  let live = 0, safe = 0;
  for (let i = 0; i < 30; i++) {
    w.player.health = 100; w.player.unconUntil = 0;
    const f = w.infra.create('panel', ['lab', 'labC', 'officesC', 'canteen', 'workshop', 'lab2'][i % 6]) || w.infra.create('panel'); if (!f) continue; setCause(f, 'contact');
    if (P.act(w, f, 'player', 'tighten').hurt) live++;
    P.act(w, f, 'player', 'power'); for (let k = 0; k < 3; k++) if (P.act(w, f, 'player', 'replace').hurt) safe++;
    w.infra.fix(f.id, 'player');
  }
  ok(live >= 5 && safe === 0, 'под напряжением: ударов током ' + live + ' из 30; обесточено: ' + safe);
}
// 4. Spare parts: none carried → told to fetch; store stock goes down; a wrong part is wasted; the right part fixes
{
  const w = fresh(44, 'technician'); run(w, 5);
  const f = w.infra.create('vent', 'canteen') || w.infra.create('vent'); setCause(f, 'motor');
  P.act(w, f, 'player', 'power');
  const r0 = P.act(w, f, 'player', 'replace');
  ok(r0.needPart && /склад/.test(r0.text), 'без детали: «' + r0.text + '»');
  const st0 = P.stock(w)['двигатель вентилятора'];
  ok(P.takePart(w, 'двигатель вентилятора', 'player') && P.stock(w)['двигатель вентилятора'] === st0 - 1 && w.player.items.length === 1, 'деталь взята со склада (осталось ' + P.stock(w)['двигатель вентилятора'] + ')');
  setCause(f, 'debris'); P.act(w, f, 'player', 'replace');
  ok(!f.repaired && w.player.items.length === 0, 'замена при другой причине: деталь потрачена впустую');
  P.takePart(w, 'двигатель вентилятора', 'player'); setCause(f, 'motor'); P.act(w, f, 'player', 'replace'); P.act(w, f, 'player', 'power');
  ok(P.act(w, f, 'player', 'verify').done && w.infra.vents.canteen !== undefined, 'нужная деталь + проверка — вентиляция работает');
}
// 5. An NPC technician repairs on their own through the same procedure and walks to the store for a part
{
  const w = fresh(45); run(w, 60);
  const f = w.infra.create('light', 'labC') || w.infra.create('light'); setCause(f, 'driver'); w.infra.discover(f, 'тест');
  const st0 = P.stock(w)['драйвер светильника']; let who = null, sawStore = false;
  run(w, 600, () => { const t = w.tasks.list.find(x => x.kind === 'repair' && x.data && x.data.fault === f.id && x.status === 'Active'); if (t && t.who !== 'player') { who = w.npc(t.who); if (who.agent.roomId === 'engStore') sawStore = true; } return f.fixed; });
  ok(f.fixed && who && f.solvedBy === who.id, 'техник ' + (who ? who.displayName + ' (' + who.prof + ')' : '—') + ' сам устранил неисправность: ' + (f.solution || '—'));
  ok(f.clues.length >= 2, 'техник провёл диагностику: ' + f.clues.join(', '));
  ok(sawStore && P.stock(w)['драйвер светильника'] === st0 - 1, 'за деталью сходил на склад (склад: ' + st0 + ' → ' + P.stock(w)['драйвер светильника'] + ')');
}
// 6. Empty store: the repair waits for a delivery, a decision is logged, the delivery releases it
{
  const w = fresh(46); run(w, 60);
  const f = w.infra.create('camera') ; setCause(f, 'module'); P.stock(w)['модуль камеры'] = 0;
  run(w, 400, () => !!f.waitPart);
  ok(f.waitPart === 'модуль камеры' && f.wait > w.now && w.life.decisions.some(d => /Нет детали/.test(d.cause)), 'склад пуст: ремонт ждёт поставку, заявка оформлена');
  ok(!w.tasks.list.some(t => t.kind === 'repair' && t.data && t.data.fault === f.id && t.status === 'Active'), 'задание закрыто, не висит');
  P.resupply(w);
  ok(P.stock(w)['модуль камеры'] === 1 && !f.waitPart && !f.wait, 'поставка пришла — ремонт снова в очереди');
  run(w, 600, () => f.fixed);
  ok(f.fixed, 'после поставки камера отремонтирована');
}
// 7. New faults change the world: jammed door, dead terminal, hot server room, dark emergency lights
{
  const w = fresh(47); run(w, 30);
  const f = w.infra.create('door'), d = w.fac.door(f.obj);
  ok(d && d.jammed && d.outOfService, 'заклинило «' + d.name + '»');
  const card = w.npcs.find(n => n.role !== 'DClass').cardId;
  ok(w.presentCard(d.id, card, 'test', d.roomA) === S.R.Fault, 'карта не открывает заклинившую дверь');
  const a = w.fac.room(d.roomA), b = w.fac.room(d.roomB);
  const path = S.findPath(w.fac, a.hubNodes[0], b.hubNodes[0], () => true), g = w.fac.graph;
  const through = path && path.some((u, i) => i > 0 && g.edges[path[i - 1]].some(e => e.to === u && e.doorId === d.id));
  ok(path && !through, 'маршруты обходят заклинившую дверь (обход: ' + (path ? path.length : 0) + ' узлов)');
  const t = w.infra.create('terminal'), poi = w.fac.poi(t.obj);
  ok(poi && poi.broken, 'терминал «' + poi.label + '» не отвечает');
  const c = w.infra.create('cooling'); const cams0 = w.cams.filter(x => !x.operational).length;
  for (let i = 0; i < 40; i++) w.infra.upkeep();
  ok(w.infra.serverHeat > 9 && w.cams.filter(x => !x.operational).length > cams0, 'перегрев серверной выводит из строя камеры (' + (w.cams.filter(x => !x.operational).length - cams0) + ')');
  const e = w.infra.create('emlight'); ok(w.fac.room(e.site).noEmergency, 'аварийный свет не работает: ' + w.roomName(e.site));
  // save / load keeps the hidden cause, clues, stock and world flags
  P.act(w, f, 'player', 'logbook'); P.stock(w)['датчик'] = 1;
  const w2 = S.World.load(w.save()); const f2 = w2.infra.fault(f.id), d2 = w2.fac.door(f.obj);
  ok(f2 && f2.cause === f.cause && f2.clues.length === 1 && d2.jammed && d2.outOfService && w2.fac.poi(t.obj).broken && P.stock(w2)['датчик'] === 1, 'сохранение: причина, улики, склад, заклинившая дверь и терминал');
  for (const x of [f, t, c, e]) w.infra.fix(x.id, 'тест');
  ok(!d.jammed && !d.outOfService && !poi.broken && !w.fac.room(e.site).noEmergency && w.infra.serverHeat === 0, 'после ремонта всё вернулось в строй');
}
// 8. A power cut left behind is switched back on by the duty electrician and noted against the player
{
  const w = fresh(48, 'technician'); run(w, 5);
  const f = w.infra.create('panel', 'workshop') || w.infra.create('panel'); P.act(w, f, 'player', 'power'); f.wait = w.now + 1e4;   // nobody takes the job over
  const rep0 = w.player.repOf('engineering');
  run(w, 60);
  ok(!f.powerOff && w.infra.isPowered(f.site) && w.player.repOf('engineering') < rep0 && w.life.decisions.some(d => /Обесточенный/.test(d.cause)), 'брошенный обесточенный участок включили, игроку замечание');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL WORK CHECKS PASSED');
process.exit(failures ? 1 : 0);
