// A whole shift for an "ideal player" (instant movement, correct decisions) — measures what there is to do
// (node Web/tests/shift-test.js [prof] [seed] [pace]). KPI from Docs/studio/design.md §10.3: idle ≤ 35 %, ≥ 4 kinds of tasks,
// ≥ half of the tasks with a decision of the player.
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'procedures', 'checkpoint', 'dclass', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V, TD = S.TaskDirector, P = S.Proc, CP = S.CP;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };

// walking takes time: the distance along the route at 1.4 m/s (0.5 game minutes per real second); WALK=0 teleports
const WALK = process.env.WALK !== '0'; let walkUntil = 0;
function goTo(w, room, pos) {
  const r = w.fac.room(room); if (!r) return; const p = w.player, to = pos ? V.v(pos.x, r.floorY, pos.z) : V.v(r.center.x, r.floorY, r.center.z);
  const d = Math.hypot(to.x - p.pos.x, to.z - p.pos.z) * 1.35 + Math.abs(to.y - p.pos.y) * 6;
  if (WALK && d > 3) walkUntil = w.now + d / 1.4 * w.clock.minPerSec;
  p.pos = to; p.roomId = room;
}
const DECISION = new Set(['pass_control', 'repair', 'inspect_report', 'cp_assist', 'experiment', 'doc_check', 'labor_quota', 'petition_guard', 'd_test_follow']);
function shift(prof, seed, pace) {
  const w = S.Content.createWorld(seed, { prof }); TD.setPace(w, pace || 'standard');
  const p = w.player;
  // to the start of the shift
  let guard = 0; while (p.dutyBlock(w) !== 'Duty' && guard++ < 30000) w.tick(0.1);
  const t0 = w.now, END = t0 + 450; let idle = 0, steps = 0; const kinds = {}, results = {}, seen = new Set(), unsupported = {};
  const handled = new Set(); let decisions = 0;
  while (w.now < END && !p.dead) {
    w.tick(0.1); steps++;
    const act = w.tasks.activeFor('player');
    if (!act.length) { idle += 0.1 * w.clock.minPerSec; continue; }
    const t = act[0], s = t.steps[t.si]; if (!s) continue;
    if (!seen.has(t.id)) { seen.add(t.id); const cs = t.kind === 'inspect_report' && t.data && TD.D(w).cases[t.data.case]; const k = cs ? 'inspect:' + cs.type : t.kind; kinds[k] = (kinds[k] || 0) + 1; }
    if (w.now < walkUntil || (s.busyUntil && w.now < s.busyUntil)) continue;           // the player is "doing" the step for a realistic time
    const need = s.need || '';
    if (s.fault) {                                              // repair: diagnose, cut power if needed, right fix, verify
      const f = w.infra.fault(s.fault); if (!f) { w.playerStepDone(t); continue; }
      goTo(w, f.room, f.poi ? w.fac.poi(f.poi).pos : null);
      const c = P.causeOf(P.seed(w, f)); if (!c) continue;
      if (c.part && !(p.items || []).includes(c.part)) { if (!P.takePart(w, c.part, 'player')) { s.busyUntil = w.now + 30; continue; } }
      P.act(w, f, 'player', 'logbook'); P.act(w, f, 'player', 'inspect'); if ((c.elec || P.KINDS[f.kind].elec)) P.act(w, f, 'player', 'power');
      P.act(w, f, 'player', c.fix); if (f.powerOff) P.act(w, f, 'player', 'power'); const r = P.act(w, f, 'player', 'verify');
      if (r.done) { w.playerStepDone(t); decisions++; } s.busyUntil = w.now + 6; continue;
    }
    if (/^post:/.test(need)) { const id = need.split(':')[1], cp = CP.CPS[id], poi = w.fac.poi(cp.poi); goTo(w, poi.roomId, poi.pos); const st = CP.M(w).st[id], q = st.queue.find(e => !e.held && w.now - e.since > 1); if (q) { const v = CP.verdict(w, cp, q.who, q.card); CP.decide(w, id, q.who, v.valid ? 'pass' : 'deny', 'player'); decisions++; } continue; }
    if (S.DBlock) { const of = S.DBlock.M(w).offers.player; if (of && of.until > w.now) { S.DBlock.answer(w, of.kind === 'trade' ? 'accept' : 'ignore'); decisions++; } }
    if (s.sort) { goTo(w, s.room); if (!s.held) { s.held = true; s.busyUntil = w.now + 10; continue; } t.data.q = 0.9; t.data.note = S.DBlock.quota(w, 9, 10); w.playerStepDone(t); decisions++; continue; }   // ten items, about 20 real seconds
    if (need === 'petition') { goTo(w, s.room); S.DBlock.petition(w, 'psych'); decisions++; continue; }
    if (/^follow:/.test(need)) { const g = w.npc(need.split(':')[1]); if (g) { if (g.agent.roomId === s.room) goTo(w, s.room); else goTo(w, g.agent.roomId, g.agent.pos); } continue; }
    if (/^find:/.test(need)) { const n = w.npc(need.split(':')[1]); if (n) goTo(w, n.agent.roomId, n.agent.pos); continue; }
    if (/^docs:/.test(need)) { const id = need.split(':')[1], v = CP.streetVerdict(w, id); CP.street(w, id, !v || v.valid ? 'ok' : v.reasons.indexOf('dclass') >= 0 ? 'detain' : 'out', 'player'); w.playerStepDone(t); decisions++; continue; }
    if (/^report:/.test(need)) { const c = TD.D(w).cases[s.case], def = TD.CASES[c.type], o = def.options.find(x => (x.ok || []).indexOf(c.truth) >= 0) || def.options[0]; const r = TD.conclude(w, s.case, o.id, 'player'); t.result = r.result; w.playerStepDone(t); decisions++; continue; }
    if (/^stay:/.test(need)) { goTo(w, s.room); if (s.count) { const a = w.anomaly('SCP-L-001'); if (a && !p.counting) { p.counting = true; p.countTarget = a.id; } } continue; }
    if (/^cams:/.test(need)) { goTo(w, s.room); for (const c of w.cams.slice(0, +need.split(':')[1] + 2)) w.viewedCamera(c.id); continue; }
    if (/^observe:/.test(need)) { goTo(w, s.room); w.observe(need.split(':')[1], false); continue; }
    if (/^interview:/.test(need)) { goTo(w, s.room); w.interview(need.split(':')[1]); continue; }
    if (need === 'experiment') { goTo(w, s.room); const r = w.playerExperiment(s.scp, s.exp); if (r && r.wait) s.busyUntil = w.now + 3; else decisions++; continue; }
    if (/^escort:/.test(need) || s.pickup) { const d = w.npc(s.pickup || need.split(':')[1]); if (d) { goTo(w, d.agent.roomId, d.agent.pos); d.escortedBy = 'player'; d.followId = 'player'; } w.playerStepDone(t); continue; }
    if (s.deliver || s.release) { goTo(w, s.room); const d = w.npc(s.deliver || s.release); if (d) { d.agent.pos = V.copy(p.pos); d.agent.roomId = p.roomId; if (s.release) { d.escortedBy = null; d.followId = null; } } w.playerStepDone(t); continue; }
    if (!need || need === 'hold') { const poi = s.poi ? w.fac.poi(s.poi) : null; goTo(w, s.room, poi ? poi.pos : s.pos); s.busyUntil = w.now + Math.min(6, (s.dur || 5) * 0.4); if (s.held) { w.playerStepDone(t); } else s.held = true; continue; }
    if (/^terminal:/.test(need)) { const m = w.playerStepFor(x => x === s); if (m) w.playerStepDone(t); continue; }
    unsupported[need] = (unsupported[need] || 0) + 1; if (unsupported[need] > 300) { w.playerStepDone(t); }
  }
  for (const t of w.tasks.list.filter(x => x.who === 'player' && x.issued >= t0)) results[t.result || t.status] = (results[t.result || t.status] || 0) + 1;
  const all = w.tasks.list.filter(x => x.who === 'player' && x.issued >= t0), withDec = all.filter(x => DECISION.has(x.kind)).length;
  return { w, idle: idle / 450, kinds, results, total: all.length, withDec, decisions, unsupported, brief: TD.D(w).brief.lines, src: all.reduce((o, x) => { o[x.src] = (o[x.src] || 0) + 1; return o; }, {}), channels: all.reduce((o, x) => { o[x.channel || '—'] = (o[x.channel || '—'] || 0) + 1; return o; }, {}) };
}
const only = process.argv[2], seed = +(process.argv[3] || 7), pace = process.argv[4] || 'standard';
for (const prof of only ? [only] : ['guard', 'technician', 'scientist', 'dclass']) {
  const r = shift(prof, seed, pace);
  console.log('\n== ' + prof + ' (seed ' + seed + ', ' + pace + (WALK ? ', с ходьбой' : ', без ходьбы') + '): задач ' + r.total + ', виды ' + JSON.stringify(r.kinds) + '\n   итоги ' + JSON.stringify(r.results) + ' · источники ' + JSON.stringify(r.src) + ' · каналы ' + JSON.stringify(r.channels) + '\n   решений игрока: ' + r.decisions + ' · без задачи ' + Math.round(r.idle * 100) + '%' + (Object.keys(r.unsupported).length ? ' · не поддержано харнессом: ' + JSON.stringify(r.unsupported) : ''));
  if (r.brief && r.brief.length) console.log('   наряд: ' + r.brief.join(' / '));
  if (process.env.FAILS) for (const t of r.w.tasks.list.filter(x => x.who === 'player' && (x.result === 'failure' || x.status === 'Failed'))) console.log('   провал: ' + t.kind + ' «' + t.title + '» — ' + (t.note || '') + ' [' + (t.log || []).slice(-2).map(l => l.text).join(' | ') + ']');
  ok(r.idle <= 0.35, prof + ': без задачи ≤ 35 % (' + Math.round(r.idle * 100) + '%)');
  ok(Object.keys(r.kinds).length >= 4, prof + ': не меньше 4 видов заданий (' + Object.keys(r.kinds).length + ')');
  ok(r.withDec * 2 >= r.total, prof + ': не меньше половины заданий с решением (' + r.withDec + ' из ' + r.total + ')');
}
console.log(failures ? '\n' + failures + ' FAILED' : '\nALL SHIFT CHECKS PASSED');
process.exit(failures ? 1 : 0);
