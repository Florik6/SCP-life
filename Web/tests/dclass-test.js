// «Барак»: the class D block's mood, its consequences, and the day of a class D player (node Web/tests/dclass-test.js)
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'procedures', 'checkpoint', 'dclass', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, DB = S.DBlock;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const run = (w, min, each) => { const end = w.now + min; while (w.now < end) { w.tick(0.1); if (each && each()) return true; } return false; };
const toTime = (w, h, m) => { const day = Math.floor(w.now / 1440); let t = day * 1440 + h * 60 + (m || 0); if (t <= w.now) t += 1440; run(w, t - w.now); };

// 1. The mood of the block: deaths raise it; thresholds bring a petition, a strike; a riot and an escape are real
{
  const w = S.Content.createWorld(61, { prof: 'guard' }); w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post'; toTime(w, 10, 0);
  const h = 'dhall', d0 = DB.hall(w, h).discontent, ds = w.active.filter(n => n.role === 'DClass' && n.hallRoom === h);
  S.Med.die(w, ds[0].id, 'claw', null, 'Тест'); S.Med.die(w, ds[1].id, 'claw', null, 'Тест'); run(w, 6);
  ok(DB.hall(w, h).discontent >= d0 + 20, 'гибель заключённых подняла недовольство: ' + Math.round(d0) + ' → ' + Math.round(DB.hall(w, h).discontent));
  DB.hall(w, h).discontent = 64; run(w, 6);
  const b = DB.hall(w, h);
  ok(b.stage === 2 && b.petition && b.petition.status === 'carried', 'на пороге 60 — петиция: подписей ' + (b.petition ? b.petition.signed : 0));
  ok(w.tasks.list.some(t => t.kind === 'd_interview') || w.life.decisions.some(d => /Настроение блока/.test(d.cause)), 'администрация заметила настроение блока');
  run(w, 70); ok(b.petition.status !== 'carried', 'на петицию ответили: ' + b.petition.status + ' (недовольство ' + Math.round(b.discontent) + ')');
  b.discontent = 80; b.petition = null; run(w, 6); ok(b.strike || (b.petition && b.petition.status === 'accepted'), 'на пороге 75 — забастовка или уступки');
  const ppl = w.active.filter(n => n.role === 'DClass' && !n.dead && n.hallRoom === h); ppl.forEach(n => { n.traits.temper = 0.8; });
  ok(DB.riot(w, h, ppl) && ppl.filter(n => n.hostileUntil > w.now).length >= 3, 'бунт: ' + ppl.filter(n => n.hostileUntil > w.now).length + ' заключённых враждебны — отвечает охрана по ROE');
  run(w, 10); ok(w.active.some(n => n.combat), 'охрана выдвинулась на беспорядки');
  const w2 = S.World.load(w.save()); ok(Math.round(DB.hall(w2, h).discontent) === Math.round(b.discontent), 'сохранение: настроение блока восстановлено');
}
// 2. A class D player's day: roll call, ration, the work quota, with consequences
{
  const w = S.Content.createWorld(62, { prof: 'dclass' }); toTime(w, 6, 45);
  const p = w.player, seen = new Set(); let qDone = 0;
  run(w, 150, () => {
    for (const t of w.tasks.activeFor('player')) {
      seen.add(t.kind); const s = t.steps[t.si]; if (!s) continue;
      const r = w.fac.room(s.room); if (r && p.roomId !== s.room) { p.pos = V.v(r.center.x, r.floorY, r.center.z); p.roomId = s.room; }
      if (s.sort) { const q = DB.quota(w, 9, 10); t.data.q = 0.9; t.data.note = q; w.playerStepDone(t); qDone++; }
      else if (s.need === 'hold') w.playerStepDone(t);
    }
    return false;
  });
  ok(seen.has('roll_call') && seen.has('ration') && seen.has('labor_quota'), 'день заключённого: ' + [...seen].join(', '));
  ok((p.items || []).includes('bread'), 'пайка — реальный предмет: ' + (p.items || []).join(', '));
  ok(qDone >= 1 && p.rep.dclass > 50, 'норма выполнена, конвоир доволен (' + p.rep.dclass + ')');
  ok(S.TaskDirector.D(w).brief.lines.some(l => /Распорядок/.test(l)), 'наряд на день: ' + S.TaskDirector.D(w).brief.lines.join(' / '));
}
// 3. Other prisoners come with offers: a trade, a provocation; answers have consequences
{
  const w = S.Content.createWorld(63, { prof: 'dclass' }); toTime(w, 17, 20);
  const p = w.player; p.items = ['bread', 'soap']; const room = p.hallRoom || 'dhall', r = w.fac.room(room); p.pos = V.v(r.center.x, r.floorY, r.center.z); p.roomId = room;
  const n = w.active.find(x => x.role === 'DClass' && !x.dead && x.agent.roomId === room) || w.active.find(x => x.role === 'DClass' && !x.dead);
  n.items = ['cig']; DB.M(w).offers.player = { kind: 'trade', from: n.id, want: 'bread', give: 'cig', until: w.now + 8, text: '' };
  const r1 = DB.answer(w, 'accept');
  ok(p.items.includes('cig') && !p.items.includes('bread') && n.items.includes('bread'), 'обмен: ' + r1);
  DB.M(w).offers.player = { kind: 'provoke', from: n.id, until: w.now + 8, text: '' }; const hp0 = n.needs.health;
  const r2 = DB.answer(w, 'hit');
  ok(n.needs.health < hp0 && p.hostileUntil > w.now && p.rep.dclass < 50, 'ударил первым: ' + r2 + ' (расположение охраны ' + p.rep.dclass + ')');
  let offered = false; for (let i = 0; i < 400 && !offered; i++) { run(w, 1); offered = !!(DB.M(w).offers.player && DB.M(w).offers.player.until > w.now); }
  ok(offered, 'другие заключённые сами подходят с предложениями: «' + (offered ? DB.M(w).offers.player.text : '') + '»');
}
// 4. Called to a test: a guard comes, the player follows — or refuses
{
  const w = S.Content.createWorld(64, { prof: 'dclass' }); toTime(w, 10, 0);
  const p = w.player, room = p.hallRoom || 'dhall', r = w.fac.room(room); p.pos = V.v(r.center.x, r.floorY, r.center.z); p.roomId = room;
  for (const t of w.tasks.activeFor('player')) t.status = 'Failed';
  const sit = S.TaskDirector.SITS.D04, c = sit.test(w, p) || { a: w.anomalies.find(a => a.arrived && (a.def.exps || []).some(e => e.dclass)).id };
  sit.make(w, c);
  const fetch = w.tasks.list.find(t => t.kind === 'fetch_player' && t.status === 'Active');
  ok(!!fetch, 'за игроком идёт конвоир: ' + (fetch ? w.nameOf(fetch.who) : '—'));
  run(w, 60, () => w.tasks.activeFor('player').some(t => t.kind === 'd_test_follow'));
  const tk = w.tasks.activeFor('player').find(t => t.kind === 'd_test_follow');
  ok(!!tk, 'конвоир дошёл и вызвал игрока на испытание');
  if (tk) {
    const to = w.fac.room(tk.data.to), g = w.npc(tk.data.guard);
    run(w, 40, () => { if (V.distXZ(g.agent.pos, p.pos) > 3) { p.pos = V.v(g.agent.pos.x - 1, g.agent.pos.y, g.agent.pos.z); p.roomId = g.agent.roomId; } return tk.si > 0 || tk.status !== 'Active'; });
    ok(tk.si > 0 || tk.status === 'Completed', 'игрок дошёл за конвоиром до «' + w.roomName(tk.data.to) + '»');
    p.pos = V.v(to.center.x, to.floorY, to.center.z); p.roomId = to.id; run(w, 10); ok(tk.status === 'Completed' && p.testsDone >= 1, 'испытание пройдено: ' + tk.status);
  }
  // refusing
  const w2 = S.Content.createWorld(65, { prof: 'dclass' }); toTime(w2, 10, 0);
  const g2 = w2.active.find(n => n.prof === 'guard' && n.onSite);
  const t2 = w2.life.issue('d_test_follow', 'player', { guard: g2.id, to: 'dtest', exp: 'тест' }, g2.displayName, 60, {});
  const ds0 = w2.player.dstanding || 0; const rr = DB.refuseTest(w2);
  ok(t2.status === 'Failed' && (w2.player.dstanding || 0) > ds0 && w2.life.decisions.some(d => /Отказ испытуемого/.test(d.cause)), 'отказ от испытания: ' + rr + ' → решение комиссии');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL D-BLOCK CHECKS PASSED');
process.exit(failures ? 1 : 0);
