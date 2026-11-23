// Weapons, rules of engagement, security response, MTF (node Web/tests/arms-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, Arms = S.Arms;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min) => { const end = w.now + min; while (w.now < end) w.tick(0.1); };
const park = w => { w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; };
const place = (w, n, roomId, x, z) => { const r = w.fac.room(roomId); n.agent.clear(); n.agent.pos = V.v(x, r.floorY, z); n.agent.roomId = roomId; n.job = null; n.nextThink = 999; };
const fresh = seed => { const w = S.Content.createWorld(seed, { prof: 'scientist' }); park(w); run(w, 3); return w; };

// 1. Weapons by role, not for everyone
{
  const w = fresh(41);
  const by = p => w.npcs.find(n => n.prof === p);
  ok(Arms.kit(w, by('guard')).weapons.join() === 'pistol,baton' && Arms.kit(w, by('guard')).gear.indexOf('vest') >= 0, 'охранник: пистолет, дубинка, бронежилет, рация, фонарь, наручники');
  ok(Arms.kit(w, by('escort')).weapons.every(i => !Arms.W[i].lethal), 'конвоир класса D без огнестрела (шокер, дубинка)');
  ok(Arms.kit(w, by('operative')).weapons[0] === 'carbine' && Arms.kit(w, by('operative')).gear.indexOf('armor') >= 0, 'оперативник МОГ: карабин, пистолет, бронекостюм, набор содержания');
  ok(!Arms.kit(w, by('scientist')).weapons.length && !Arms.kit(w, by('cook')).weapons.length, 'учёные и повара без оружия');
}
// 2. Ballistics: hit in the open, walls stop bullets, armour absorbs, reload works
{
  const w = fresh(42);
  const [g, t1, t2] = w.active.filter(n => n.role !== 'DClass' && !n.dead && n.dept !== 'security' && n.dept !== 'mtf').slice(0, 3); const guard = w.npcs.find(n => n.prof === 'guard' && n.onSite);
  place(w, guard, 'corridor', -10, 0); place(w, t1, 'corridor', -4, 0); place(w, t2, 'canteen', -9.2, 7);
  for (const t of [t1, t2]) Arms.markHostile(w, t.id, { kind: 'person', room: t.agent.roomId, verified: true, level: 2, armed: true, why: 'тест: вооружённая угроза' });
  Arms.draw(w, guard, 'pistol'); w.realTime += 1;
  let h1 = 0, n1 = 0; for (let i = 0; i < 6 && !t1.dead; i++) { w.realTime += 0.5; n1++; const r = Arms.fire(w, guard.id, t1.id); if (r && r.hits.indexOf(t1.id) >= 0) h1++; }
  ok(h1 >= Math.ceil(n1 / 2) && t1.wounds.some(k => k.k === 'gunshot'), 'выстрелы на открытом месте попадают: ' + h1 + ' из ' + n1 + (t1.dead ? ' (цель погибла)' : ''));
  place(w, t2, 'lab', 3.3, 8); const hp0 = t2.needs.health; for (let i = 0; i < 4; i++) { w.realTime += 0.5; Arms.fire(w, guard.id, t2.id); }
  ok(t2.needs.health === hp0, 'стена останавливает пули: цель в лаборатории за стеной не ранена');
  const k = Arms.kit(w, guard); k.ammo.pistol = 0; w.realTime += 1; const fr = Arms.fire(w, guard.id, t1.id); if (process.env.DBG) console.log('fire', fr, JSON.stringify(k), guard.incap(w.now), t1.dead); ok(Arms.reload(w, guard) || k.reloadUntil > w.realTime, 'пустой магазин → перезарядка (магазинов осталось ' + k.spare.pistol + ')');
  const op = w.npcs.find(n => n.prof === 'operative'); Arms.kit(w, op); const a = Arms.armor(op); ok(a >= 0.6, 'бронекостюм МОГ гасит ' + Math.round(a * 100) + '% урона пули');
  const fx = Arms.A(w).fx; ok(fx.some(f => f.hit === 'body') && fx.some(f => f.hit === 'wall'), 'следы выстрелов для отрисовки: попадания в тело и в стену');
}
// 3. Rules of engagement: firing at a colleague without cause → unjustified, investigation, the shooter becomes a threat
{
  const w = fresh(43);
  const guard = w.npcs.find(n => n.prof === 'guard' && n.onSite), vic = w.active.find(n => n.prof === 'technician' && !n.dead);
  place(w, guard, 'corridor', -10, 0); place(w, vic, 'corridor', -6, 0);
  const r0 = Arms.roe(w, guard, vic.id, 'pistol'); ok(!r0.ok, 'по своему сотруднику без угрозы стрелять нельзя: «' + r0.why + '»');
  Arms.draw(w, guard, 'pistol'); w.realTime += 1; Arms.fire(w, guard.id, vic.id);
  ok(w.life.cases.some(c => c.kind === 'force') && S.Med.M(w).reports.some(r => r.kind === 'force'), 'необоснованный выстрел: расследование и отчёт об инциденте');
  ok(Arms.A(w).threats[guard.id] && Arms.A(w).threats[guard.id].verified, 'стрелявший стал подтверждённой угрозой для охраны');
  run(w, 4); const resp = w.active.filter(n => n.combat && n.combat.threat === guard.id).length;
  ok(resp >= 1, 'на угрозу выдвинулась охрана: ' + resp + ' чел.');
}
// 4. A violent D-class: warning first, then surrender or non-lethal force; surrender ends the use of force
{
  const w = fresh(44);
  const d = w.active.find(n => n.role === 'DClass' && !n.dead), guard = w.npcs.find(n => n.prof === 'guard' && n.onSite);
  place(w, d, 'dblock', -2, -6); place(w, guard, 'dblock', -6, -6); guard.nextThink = 0;
  d.hostileUntil = w.now + 60; d.hostileWhy = 'драка в блоке D'; d.compliance = 0.95; d.psy.fear = 80;
  guard.combat = { threat: d.id, role: 'engage', since: w.now }; run(w, 1);
  ok(Arms.kit(w, guard).warned[d.id] > 0, 'охранник сначала предупредил: «Стоять!»');
  ok(d.surrenderUntil > w.now, 'послушный заключённый сдался после предупреждения');
  ok(!Arms.roe(w, guard, d.id, 'pistol').ok, 'по сдавшемуся силу применять нельзя');
  const d2 = w.active.find(n => n.role === 'DClass' && !n.dead && n !== d); place(w, d2, 'dblock', -3, -8); d2.hostileUntil = w.now + 60; d2.compliance = 0.0; d2.traits.temper = 1;
  Arms.markHostile(w, d2.id, { kind: 'riot', room: 'dblock', verified: true, level: 1, why: 'нападение' }); guard.combat = { threat: d2.id, role: 'engage', since: w.now }; Arms.kit(w, guard).warned = {};
  run(w, 8);
  const used = Arms.A(w).log.filter(l => l.by === guard.id && l.target === d2.id);
  ok(used.length && used.every(l => !Arms.W[l.w].lethal), 'против безоружного бунтовщика — только спецсредства (' + [...new Set(used.map(l => l.w))].join(', ') + ', ударов ' + used.length + ')');
  let t2 = 0; while (!(d2.incap(w.now) || d2.surrenderUntil > w.now) && t2 < 20) { run(w, 1); t2++; }
  const nHits = Arms.A(w).log.filter(l => l.by === guard.id && l.target === d2.id).length; run(w, 4);
  const after = Arms.A(w).log.filter(l => l.by === guard.id && l.target === d2.id).length - nHits;
  ok((d2.incap(w.now) || d2.surrenderUntil > w.now) && after === 0, 'сопротивление сломлено (' + (d2.surrenderUntil > w.now ? 'сдался' : 'обездвижен') + '), после этого ни одного удара');
}
// 5. A breach: verified threat, responders, the MTF musters and deploys, the operation is recorded
{
  const w = fresh(45);
  const a = w.anomaly('SCP-LF-141') || w.anomalies.find(x => x.arrived && x.def.temper === 'aggressive');
  a.contained = false; a.breached = true; const r = w.fac.room('corrT2'); a.agent.pos = V.v(40, r.floorY, -12.2); a.agent.roomId = 'corrT2';
  run(w, 2);
  ok(Arms.A(w).threats[a.id], 'объект вне камеры — подтверждённая угроза');
  const m = Arms.MTF.S(w); ok(m.op && (m.op.status === 'mustering' || m.op.status === 'deployed'), Arms.MTF.S(w).name + ': операция ' + (m.op ? m.op.id + ' — ' + m.op.status : 'нет'));
  run(w, 60); ok(m.ops.length >= 1 && (m.ops[0].status !== 'mustering'), 'группа МОГ выдвинулась (' + m.ops[0].status + ', ' + m.ops[0].squad.length + ' чел.)');
  a.contained = true; a.breached = false; run(w, 4);
  ok(m.ops[0].status === 'done' && S.Med.M(w).reports.some(x => x.kind === 'mtf'), 'операция закрыта и записана: ' + m.ops[0].result);
}
// 6. Save / load keeps weapons, ammunition and the MTF
{
  const w = fresh(46); const g = w.npcs.find(n => n.prof === 'guard'); Arms.kit(w, g).ammo.pistol = 7; Arms.MTF.S(w).readiness = 42;
  const w2 = S.World.load(w.save()); ok(Arms.kit(w2, w2.npc(g.id)).ammo.pistol === 7 && Arms.MTF.S(w2).readiness === 42, 'сохранение: патроны и готовность МОГ восстановлены');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL ARMS CHECKS PASSED');
process.exit(failures ? 1 : 0);
