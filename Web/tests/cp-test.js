// Checkpoints («Пропуск»): posts, lines, checks, mistakes and their consequences (node Web/tests/cp-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'procedures', 'checkpoint', 'dclass', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, CP = S.CP;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min, each) => { const end = w.now + min; while (w.now < end) { w.tick(0.1); if (each && each()) return true; } return false; };
const toTime = (w, h, m) => { const day = Math.floor(w.now / 1440); let t = day * 1440 + h * 60 + (m || 0); if (t <= w.now) t += 1440; run(w, t - w.now); };
const park = w => { w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; };
const fresh = (seed, prof) => { const w = S.Content.createWorld(seed, { prof: prof || 'technician' }); park(w); w.infra.wear = () => {}; return w; };

// 0. The appearance on the card photo is the same as the 3D model (humans.js spec)
{
  const deep = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'prototype' ? {} : deep(), apply: () => deep(), construct: () => deep() });
  globalThis.THREE = deep(); let same = 0, n = 0;
  try {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/humans.js'), 'utf8'), { filename: 'humans.js' });
    const w = fresh(50);
    for (const x of w.npcs.slice(0, 60)) { const a = S.Humans.specOf(x), b = CP.looks(x); n++; if (a.female === b.female && a.age === b.age && a.style === b.style && a.beard === b.beard && a.moustache === b.moustache && a.glasses === b.glasses) same++; }
  } catch (e) { console.log('humans.js: ' + e.message); }
  ok(n > 0 && same === n, 'приметы на фото совпадают с 3D-моделью: ' + same + '/' + n);
}
// 1. Posts exist; at peak hours guards hold them and check people; the line really waits
{
  const w = fresh(51); toTime(w, 6, 10);
  ok(Object.values(CP.CPS).every(c => { const p = w.fac.poi(c.poi); return p && p.node >= 0; }), 'посты КПП на карте: ' + Object.values(CP.CPS).map(c => c.name).join(', '));
  let maxQ = 0, mannedMin = 0, crossed = new Set();
  run(w, 180, () => { for (const id in CP.CPS) { const c = CP.CPS[id]; if (CP.manned(w, c)) mannedMin += 0.05 / 60 * 60 * 0 + 0.1 * w.clock.minPerSec / 60; maxQ = Math.max(maxQ, CP.M(w).st[id].queue.length); } });
  const checks = Object.values(CP.M(w).st).reduce((s, x) => s + x.checks.length, 0), byNpc = Object.values(CP.M(w).st).flatMap(x => x.checks).filter(c => c.by !== 'player');
  ok(w.tasks.list.some(t => t.kind === 'pass_control' && t.who !== 'player'), 'начальник смены выставил охрану на КПП в час пик');
  ok(checks >= 8 && byNpc.length === checks, 'NPC-охранники проверили людей: ' + checks + ' (пропущено ' + byNpc.filter(c => c.decision === 'pass').length + ', отказано ' + byNpc.filter(c => c.decision !== 'pass').length + ')');
  ok(maxQ >= 1, 'очередь у КПП реально ждёт проверки (макс. ' + maxQ + ')');
}
// 2. The rules: a swapped card, a personal visit, a suspended person
{
  const w = fresh(52); toTime(w, 9, 40);
  const cp = CP.CPS.cpC, sci = w.active.filter(n => n.dept === 'science' && !n.dead);
  const [a, b] = sci; const ca = a.cardId, cb = b.cardId;
  a.cardId = cb; b.cardId = ca; w.card(cb).holder = a.id; w.card(ca).holder = b.id;
  ok(CP.verdict(w, cp, a.id, cb).reasons.indexOf('swap') >= 0, 'чужая карта: ' + CP.verdict(w, cp, a.id, cb).reasons.join(','));
  const cook = w.npcs.find(n => n.prof === 'cook' || n.dept === 'service');
  ok(!CP.verdict(w, cp, cook.id, cook.cardId).valid && CP.verdict(w, cp, cook.id, cook.cardId).reasons.indexOf('no_zone') >= 0, 'повару без задания в исследовательское крыло нельзя');
  const c = sci[2]; c.restricted = true; ok(CP.verdict(w, cp, c.id, c.cardId).reasons.indexOf('suspended') >= 0, 'отстранённого не пропускают');
  const base = CP.baseCheck(w, cp, c.id, c.cardId).join(' | '); ok(/ОТСТРАНЁН/.test(base), 'сверка с базой показывает отстранение: ' + base.slice(0, 120));
  ok(/^.+\. /.test(CP.answer(w, cp, a.id)) && CP.answer(w, cp, a.id).indexOf(a.last) >= 0 && w.card(cb).ownerName.indexOf(a.last) < 0, 'человек называет своё имя — оно не совпадает с картой: «' + CP.answer(w, cp, a.id) + '»');
}
// 3. The player on the post: people line up, decisions have consequences
{
  const w = fresh(53, 'guard'); toTime(w, 7, 25);
  for (const t of w.tasks.activeFor('player')) t.status = 'Failed';
  const t = w.life.issue('pass_control', 'player', { cp: 'cpC', mins: 60 }, 'Начальник смены', 90);
  const poi = w.fac.poi('cp.C'); w.player.pos = V.copy(poi.pos); w.player.roomId = poi.roomId;
  w.playerStepDone(t);                                                     // took the post
  // one certain case: a cook heads into the research wing on a personal errand
  { const cook = w.active.find(n => (n.dept === 'service' || n.dept === 'dclass' && false) && !n.dead && n.cardId && S.People.block(w, n).activity === 'Duty'), side = w.fac.room('liftB'); if (cook) { cook.agent.clear(); cook.agent.pos = V.v(side.center.x - 1, side.floorY, side.center.z); cook.agent.roomId = 'liftB'; CP.errand(w, cook, 'corrC', ['занести обед знакомому', 'Мне на минутку — занесу обед знакомому.']); } }
  const st = CP.M(w).st.cpC; let decided = 0, wrongPass = null, wrongDeny = null;
  run(w, 90, () => {
    w.player.pos = V.copy(poi.pos);
    const q = st.queue[0]; if (!q || w.now - q.since < 0.5) return false;
    const v = CP.verdict(w, CP.CPS.cpC, q.who, q.card);
    // a careless guard: lets the first invalid person through and turns back the first valid one after that
    let dec = v.valid ? 'pass' : 'deny';
    if (!v.valid && !wrongPass) { dec = 'pass'; wrongPass = { who: q.who, v }; }
    else if (v.valid && wrongPass && !wrongDeny) { dec = 'deny'; wrongDeny = { who: q.who, rel0: (w.npc(q.who).rel && w.npc(q.who).rel.player) || 0 }; }
    CP.decide(w, 'cpC', q.who, dec, 'player'); decided++; return false;
  });
  ok(st.special >= 1, 'на смене игрока появились особые случаи (реальные изменения мира): ' + st.special);
  ok(decided >= 3, 'игрок принял решения по людям в очереди: ' + decided);
  const passed = st.checks.filter(c => c.by === 'player' && c.decision === 'pass').map(c => w.npc(c.who)).filter(Boolean);
  ok(passed.some(n => CP.inZone(w, CP.CPS.cpC, n.agent.roomId) || n.agent.roomId === 'corrC'), 'пропущенные прошли в крыло С');
  ok(wrongDeny && CP.M(w).complaints.some(c => c.who === wrongDeny.who && c.by === 'player'), 'отказ сотруднику с правом прохода — жалоба' + (wrongDeny ? ' (' + w.nameOf(wrongDeny.who) + ')' : ''));
  const rep0 = w.player.repOf('security');
  if (wrongPass) { const disc0 = w.player.journal.length; run(w, 140); const br = CP.M(w).breaches.find(b => b.who === wrongPass.who); console.log('   breach', JSON.stringify(br), 'rep', rep0, '→', w.player.repOf('security')); ok(br && br.audited && w.player.journal.some(j => /Разбор журнала доступа/.test(typeof j === 'string' ? j : j.text)), 'проверка журнала нашла пропущенного нарушителя (' + wrongPass.v.reasons.join(', ') + '), игроку замечание'); }
  else ok(false, 'не нашлось нарушителя в очереди');
  ok(t.status === 'Done' || t.status === 'Active' || t.status === 'Completed', 'смена на посту засчитана: ' + t.status);
}
// 4. The player who is not a guard is checked by an NPC guard; somebody else's card is taken away
{
  const w = fresh(54, 'technician'); toTime(w, 6, 30);
  run(w, 90, () => CP.manned(w, CP.CPS.cpB) || CP.manned(w, CP.CPS.cpC));
  const cp = CP.manned(w, CP.CPS.cpB) ? CP.CPS.cpB : CP.CPS.cpC, st = CP.M(w).st[cp.id];
  ok(CP.manned(w, cp) && st.by !== 'player', 'на ' + cp.name + ' стоит ' + w.nameOf(st.by));
  const other = w.npcs.find(n => n.dept === 'science' && w.card(n.cardId)), card = w.card(other.cardId); card.holder = null; w.player.cards.push(card.id);
  const r = w.presentCard(cp.door, card.id, 'player', cp.side);
  ok(r === S.R.DGuard && w.player.cards.indexOf(card.id) < 0 && card.holder === other.id, 'охранник изъял у игрока чужую карту (' + S.RESULT_TEXT[r] + ')');
  const r2 = w.presentCard(cp.door, 'card.player', 'player', cp.side);
  ok(r2 === S.R.DGuard, 'после попытки по чужой карте игрока на время не пускают');
}
// 5. Nobody at the window: people give up waiting, complain, the watch fails if the post is left
{
  const w = fresh(55, 'guard'); toTime(w, 7, 25);
  for (const t of w.tasks.activeFor('player')) t.status = 'Failed';
  const t = w.life.issue('pass_control', 'player', { cp: 'cpC', mins: 60 }, 'Начальник смены', 90);
  const poi = w.fac.poi('cp.C'); w.player.pos = V.copy(poi.pos); w.player.roomId = poi.roomId; w.playerStepDone(t);
  { const v = w.active.find(n => n.dept === 'science' && !n.dead && n.cardId && S.People.block(w, n).activity === 'Duty' && !CP.inZone(w, CP.CPS.cpC, n.agent.roomId)), side = w.fac.room('liftB'); if (v) { v.agent.clear(); v.agent.pos = V.v(side.center.x - 1, side.floorY, side.center.z); v.agent.roomId = 'liftB'; w.life.issue('observe_scp', v.id, { target: 'SCP-LF-127' }, 'Научный отдел', 120); } }
  run(w, 45, () => { w.player.pos = V.copy(poi.pos); return false; });
  ok(CP.M(w).complaints.some(c => c.wait && c.cp === 'cpC'), 'люди не дождались проверки и пожаловались');
  w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; run(w, 6);
  ok(t.status === 'Failed', 'пост оставлен — смена провалена');
  const w2 = S.World.load(w.save());
  ok(CP.M(w2).complaints.length === CP.M(w).complaints.length && CP.M(w2).st.cpC.checks.length === CP.M(w).st.cpC.checks.length, 'сохранение: состояние КПП восстановлено');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL CHECKPOINT CHECKS PASSED');
process.exit(failures ? 1 : 0);
