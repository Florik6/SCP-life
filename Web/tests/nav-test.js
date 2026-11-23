// Crowd navigation checks (node Web/tests/nav-test.js)
// 48 walkers through doors and corridor crossings, a 36-person lunch rush, a single-lane door swapped from both sides,
// an unreachable goal, and the real brain-driven world near the canteen at lunch. Measured on every tick:
// body overlap, jumps (teleports), spinning on the spot, long hangs, arrivals, door gate queues.
const path = require('path'), fs = require('fs'), vm = require('vm');
const MODS = ['core', 'professions', 'map', 'people', 'anomalies', 'cognitive', 'tallyman', 'jobs', 'medical', 'arms', 'director', 'living', 'ai/llm', 'ai/profiles', 'ai/minds', 'brain', 'infra', 'procedures', 'checkpoint', 'dclass', 'scplife', 'horror', 'world', 'content'];
for (const f of MODS) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), { filename: f + '.js' });
const S = globalThis.SCP, V = S.V;
let failures = 0;
const ok = (c, msg) => { if (!c) { failures++; console.log('FAIL: ' + msg); } else console.log('ok   ' + msg); };
const realUpdate = S.Brain.update, DBG = !!process.env.NAVDBG;
const desc = n => { const a = n.agent; return [n.activity, n.label, a.roomId, 'path ' + a.pi + '/' + a.path.length, a.final ? 'final' : '', a.waitingDoor ? 'door ' + a.waitingDoor : '', a.gate ? 'gate ' + a.gate : '', 'mv ' + a.moving, 'st ' + a.stuckN, n.posture, n.queue ? 'queue' : '', n.conv ? 'conv' : '', a.anchored ? 'anch' : '', n.blockedRetry > 0 ? 'retry' : '', 'v ' + Math.hypot(a.vx, a.vz).toFixed(2)].filter(Boolean).join(' '); };

// ---------------------------------------------------------------- measuring
function Meter(w, agents) {
  const m = { ticks: 0, pairTicks: 0, overlap: 0, deep: 0, maxDepth: 0, jumps: 0, spins: 0, hangs: 0, maxHang: 0, win: new Map() };
  m.sample = () => {
    m.ticks++;
    const list = agents().filter(n => n.agent.transitT <= 0 && n.agent.roomId), inView = list.filter(n => { const s = m.win.get(n.id); return s && s.seen === m.ticks - 1 && m.ticks - s.since >= 10; });
    for (let i = 0; i < inView.length; i++) for (let j = i + 1; j < inView.length; j++) {
      const a = inView[i].agent, b = inView[j].agent; if (Math.abs(a.pos.y - b.pos.y) > 1) continue;
      if (a.anchored && b.anchored) continue;                    // two seats placed close by the map, not a navigation fault
      m.pairTicks++;
      const depth = a.radius + b.radius - V.distXZ(a.pos, b.pos);
      if (depth > 0.06) { m.overlap++; if (depth > 0.15) { m.deep++; if (DBG && m.deep <= 4) console.log('     deep', inView[i].id, inView[j].id, depth.toFixed(2), desc(inView[i]), '|', desc(inView[j])); } }
      if (depth > m.maxDepth) m.maxDepth = depth;
    }
    for (const n of list) {
      const a = n.agent; let s = m.win.get(n.id);
      if (s && s.seen !== m.ticks - 1) s = null;
      if (s) s.seen = m.ticks;
      if (!s) { s = { x: a.pos.x, z: a.pos.z, y: a.pos.y, yaw: a.yaw, t: 0, turn: 0, wx: a.pos.x, wz: a.pos.z, hang: 0, hx: a.pos.x, hz: a.pos.z, tr: 0, seen: m.ticks, since: m.ticks }; m.win.set(n.id, s); continue; }
      const step = Math.hypot(a.pos.x - s.x, a.pos.z - s.z);
      if (step > 0.42 && Math.abs(a.pos.y - s.y) < 0.5 && s.tr === 0) { m.jumps++; if (m.jumps <= 3) console.log('     jump', n.id, step.toFixed(2), a.roomId); }
      s.tr = a.transitT > 0 ? 2 : Math.max(0, s.tr - 1);
      let dy = Math.abs(((a.yaw - s.yaw) % 360 + 540) % 360 - 180); s.turn += dy; s.t += 0.1;
      if (DBG && process.env.NAVTRACE === n.id) console.log('     tr', m.ticks, a.yaw.toFixed(0), 'v', a.vx.toFixed(2), a.vz.toFixed(2), 'want', a.want ? a.want.x.toFixed(2) + ',' + a.want.z.toFixed(2) : '-', a.waitingDoor || '', a.gate || '', 'pos', a.pos.x.toFixed(2), a.pos.z.toFixed(2), 'pi', a.pi + '/' + a.path.length, a.hasNodes ? 'tn ' + w.fac.graph.nodes[a.path[a.pi]].id : '');
      if (s.t >= 5) { if (s.turn > 540 && Math.hypot(a.pos.x - s.wx, a.pos.z - s.wz) < 0.5) { m.spins++; if (DBG && m.spins <= 6) console.log('     spin', n.id, s.turn.toFixed(0), desc(n)); } s.t = 0; s.turn = 0; s.wx = a.pos.x; s.wz = a.pos.z; }
      const trying = (a.hasPath || a.final) && !a.waitingDoor && a.transitT <= 0;
      if (trying && Math.hypot(a.pos.x - s.hx, a.pos.z - s.hz) < 0.3) { s.hang += 0.1; if (s.hang > m.maxHang) m.maxHang = s.hang; if (s.hang >= 20 && s.hang < 20.1) { m.hangs++; if (DBG && m.hangs <= 6) { const tn = a.hasNodes ? w.fac.graph.nodes[a.path[a.pi]] : null; console.log('     hang', n.id, desc(n), 'pos', a.pos.x.toFixed(2), a.pos.z.toFixed(2), 'tn', tn ? tn.id + ' ' + tn.pos.x.toFixed(2) + ',' + tn.pos.z.toFixed(2) : a.final ? 'final ' + a.final.x.toFixed(2) + ',' + a.final.z.toFixed(2) : '', 'near', w.active.filter(o => o !== n && V.distXZ(o.agent.pos, a.pos) < 1.2).map(o => o.id + '(' + (o.agent.hasPath ? 'go' : o.posture) + ')').join(' ')); } } }
      else { s.hang = 0; s.hx = a.pos.x; s.hz = a.pos.z; }
      s.x = a.pos.x; s.z = a.pos.z; s.y = a.pos.y; s.yaw = a.yaw;
    }
  };
  m.report = (label) => console.log('     ' + label + ': пар·тиков ' + m.pairTicks + ', перекрытий >6 см ' + m.overlap + ' (' + (100 * m.overlap / Math.max(1, m.pairTicks)).toFixed(3) + '%), >15 см ' + m.deep + ', макс. ' + (m.maxDepth * 100).toFixed(1) + ' см; рывков ' + m.jumps + ', вращений ' + m.spins + ', зависаний ≥20 с ' + m.hangs + ' (макс. ' + m.maxHang.toFixed(1) + ' с)');
  return m;
}

// ---------------------------------------------------------------- scripted walkers (navigation only, no brain decisions)
function crowdWorld(seed) {
  const w = S.Content.createWorld(seed, { prof: 'guard' });
  w.isRemote = () => false;                                    // every walker gets full local avoidance
  w.setActive = () => {}; w._sync = Infinity;                   // shifts do not swap people in or out during the scene
  w.player.pos = V.v(-24.5, 0, -8.5); w.player.roomId = 'post';
  return w;
}
function walkers(w, n, pick) {
  const list = w.active.filter(pick).slice(0, n);
  for (const x of w.active) if (list.indexOf(x) < 0) { x.agent.clear(); x.agent.roomId = null; }
  w.active = list; return list.slice();
}
const anyDoor = d => !d.outOfService && !d.isTransit;
const opener = () => (d) => { if (d.locked || d.lockdown) return 'Blocked'; d.open(3); return 'Wait'; };
function drive(w, plan, st) {
  S.Brain.update = (ww, n, dt) => {
    const s = st[n.id]; if (!s) return;
    const a = n.agent;
    if (!a.hasPath && !a.final) {
      if (s.dwell > 0) { s.dwell -= dt; n.posture = s.sit ? 'Sitting' : 'Standing'; return; }
      plan(n, s);
      return;
    }
    const r = w.moveAgent(a, dt, s.onDoor || opener(), { id: n.id });
    if (r === 'Arrived') { s.arrivals++; s.dwell = s.dwellFor != null ? s.dwellFor : 1 + (s.arrivals % 3); s.sit = s.poi && n.reservedPoi === s.poi; }
    else if (r === 'Replan') { s.replans++; s.retarget(n, s); }
    else if (r === 'Stuck') { s.stucks++; a.clear(); w.releaseSpot(n.id); s.dwell = 2; }
  };
}
function goRoom(w, n, roomId, wantPoi) {
  const room = w.fac.room(roomId); let goal, spot = null, yaw = null;
  if (n.reservedPoi) { const p = w.fac.poi(n.reservedPoi); if (p && p.reservedBy === n.id) p.reservedBy = null; n.reservedPoi = null; }
  if (wantPoi) { const p = room.pois.find(x => x.type === wantPoi && !x.reservedBy); if (p) { p.reservedBy = n.id; n.reservedPoi = p.id; goal = p.node; yaw = p.yaw; } }
  if (goal == null) { spot = w.claimSpot(n.id, room, null); goal = spot ? spot.hub : room.hubNodes[0]; } else w.releaseSpot(n.id);
  const p = w.planPath(n.agent.pos, n.agent.roomId, goal, anyDoor);
  if (!p) return false;
  n.agent.setPath(p); n.agent.final = spot ? { x: spot.x, z: spot.z } : null; n.agent.arriveYaw = yaw; n.targetRoom = roomId; return true;
}
function tick(w, sec, m) { for (let k = 0; k < sec * 10; k++) { w.tick(0.1); if (m) m.sample(); } }

// 1. Rush hour: 48 people cycling through rooms in opposite orders → crossing flows in corridors and doorways
{
  const w = crowdWorld(11);
  const rooms = ['canteen', 'lab', 'medA', 'dorm', 'post', 'archive', 'officeA', 'meeting'].filter(id => w.fac.room(id));
  const lv0 = w.fac.roomList.filter(r => r.level !== 4 && r.floorY === 0 && ['Laboratory', 'MedicalBay', 'Office', 'Meeting', 'Archive', 'Dormitory', 'Canteen', 'SecurityPost', 'Barracks', 'Storage'].indexOf(r.type) >= 0).map(r => r.id);
  for (const id of lv0) if (rooms.length < 8 && rooms.indexOf(id) < 0) rooms.push(id);
  const people = walkers(w, 48, n => n.agent.roomId && w.fac.room(n.agent.roomId).floorY === 0);
  const st = {};
  people.forEach((n, i) => {
    const dir = i % 2 ? 1 : -1, start = i % rooms.length;
    st[n.id] = { k: start, dwell: (i % 7) * 0.4, arrivals: 0, replans: 0, stucks: 0, dwellFor: 1.5,
      retarget: (nn, s) => goRoom(w, nn, rooms[s.k], null) };
    st[n.id].next = () => { const s = st[n.id]; s.k = (s.k + dir + rooms.length) % rooms.length; return rooms[s.k]; };
    const home = w.fac.room(rooms[start]), sp = w.claimSpot(n.id, home, null) || { x: home.center.x, z: home.center.z };   // everyone starts inside the scene
    n.agent.clear(); n.agent.roomId = home.id; n.agent.pos = V.v(sp.x, home.floorY, sp.z); w.releaseSpot(n.id);
  });
  drive(w, (n, s) => { goRoom(w, n, s.next ? s.next() : st[n.id].next(), null); }, st);
  const m = Meter(w, () => people);
  tick(w, 3, null);                                           // spawned bodies separate first
  tick(w, 480, m);
  const arr = people.map(n => st[n.id].arrivals), tot = arr.reduce((a, b) => a + b, 0), minA = Math.min(...arr);
  const gates = w.fac.doorList.filter(d => d.gate && d.gate.passed > 0), passed = gates.reduce((a, d) => a + d.gate.passed, 0), waits = gates.reduce((a, d) => a + d.gate.waits, 0);
  m.report('час пик, 48 человек, 8 мин, комнаты ' + rooms.join(', '));
  console.log('     прибытий ' + tot + ' (мин. у одного ' + minA + '), проходов через двери ' + passed + ', постановок в очередь ' + waits + ', перестроений маршрута ' + people.reduce((a, n) => a + st[n.id].replans, 0) + ', отказов от цели ' + people.reduce((a, n) => a + st[n.id].stucks, 0));
  ok(people.length >= 40, 'в сцене ' + people.length + ' NPC');
  ok(m.overlap / Math.max(1, m.pairTicks) < 0.002 && m.deep === 0, 'тела не проникают друг в друга (глубже 15 см — ' + m.deep + ')');
  ok(m.jumps === 0, 'нет телепортаций: ' + m.jumps);
  ok(m.spins === 0, 'никто не крутится на месте: ' + m.spins);
  ok(m.hangs === 0 && m.maxHang < 20, 'нет долгих зависаний на маршруте (макс. ' + m.maxHang.toFixed(1) + ' с)');
  ok(minA >= 4 && tot > 48 * 6, 'каждый проходит маршрут: всего прибытий ' + tot + ', минимум ' + minA);
  ok(passed > 200 && waits > 0, 'двери пропускают поток с очередями: проходов ' + passed + ', ожиданий ' + waits);
}

// 2. Lunch rush: 36 people into the canteen at once — distinct seats, standing places, nobody inside anybody
{
  const w = crowdWorld(12);
  const people = walkers(w, 36, n => n.agent.roomId && w.fac.room(n.agent.roomId).floorY === 0 && n.agent.roomId !== 'canteen');
  const st = {};
  people.forEach((n, i) => { st[n.id] = { dwell: (i % 6) * 0.3, arrivals: 0, replans: 0, stucks: 0, dwellFor: 1e9, poi: null, retarget: (nn) => goRoom(w, nn, 'canteen', 'Seat') }; });
  drive(w, (n, s) => { if (s.arrivals) return; goRoom(w, n, 'canteen', 'Seat'); s.poi = n.reservedPoi; }, st);
  const m = Meter(w, () => people);
  tick(w, 3, null); tick(w, 150, m);
  const inside = people.filter(n => n.agent.roomId === 'canteen' && !n.agent.hasPath && !n.agent.final);
  const seats = people.map(n => n.reservedPoi).filter(Boolean), seatSet = new Set(seats);
  let close = 0; for (let i = 0; i < inside.length; i++) for (let j = i + 1; j < inside.length; j++) if (V.distXZ(inside[i].agent.pos, inside[j].agent.pos) < 0.5) close++;
  m.report('обед, 36 человек');
  ok(inside.length >= 34, 'дошли до столовой и стоят/сидят: ' + inside.length + ' из 36');
  ok(seats.length === seatSet.size && seats.length >= 14, 'места за столами разные: ' + seatSet.size + ' занято, без двойных');
  ok(close === 0, 'нет двух людей в одной точке: ' + close);
  ok(m.deep === 0 && m.overlap / Math.max(1, m.pairTicks) < 0.003 && m.jumps === 0 && m.spins === 0, 'без проникновений, рывков и вращений');
  const cap = w.fac.room('canteen').standCap; ok(cap >= 30, 'вместимость столовой считается: ' + cap + ' мест (столы + места стоя)');
}

// 3. Single-lane door swapped from both sides: queues on each side, alternating passage, no deadlock
{
  const w = crowdWorld(13);
  const door = w.fac.door('d.lab'), A = door.roomA, B = door.roomB; door.width = 1.2;
  const people = walkers(w, 20, n => !!n.agent.roomId && w.fac.room(n.agent.roomId).floorY === 0);
  const st = {};
  people.forEach((n, i) => {
    const from = i % 2 ? A : B, to = from === A ? B : A, room = w.fac.room(from), sp = w.claimSpot(n.id, room, null);
    n.agent.clear(); n.agent.roomId = from; n.agent.pos = V.v(sp.x, room.floorY, sp.z);
    st[n.id] = { dwell: 0.2, arrivals: 0, replans: 0, stucks: 0, dwellFor: 1e9, to, retarget: (nn, s) => goRoom(w, nn, s.to, null) };
  });
  drive(w, (n, s) => { if (s.arrivals) return; goRoom(w, n, s.to, null); }, st);
  const m = Meter(w, () => people); tick(w, 2, null); tick(w, 120, m);
  const done = people.filter(n => st[n.id].arrivals > 0 && n.agent.roomId === st[n.id].to).length;
  m.report('однополосная дверь, 10 + 10 человек навстречу');
  ok(done === people.length, 'все поменялись сторонами через дверь шириной 1,2 м: ' + done + '/' + people.length);
  ok(door.gate && door.gate.waits >= 4, 'у двери выстраивалась очередь: ' + (door.gate ? door.gate.waits : 0) + ' постановок');
  ok(m.deep === 0 && m.jumps === 0 && m.spins === 0, 'в дверях без проникновений, рывков и вращений');
}

// 4. Unreachable goal behind a locked door: waits and reports instead of spinning
{
  const w = crowdWorld(14);
  const door = w.fac.door('d.lab'); door.locked = true; door.close();
  for (let k = 0; k < 30; k++) w.tick(0.1);
  const [n] = walkers(w, 1, x => x.agent.roomId === door.roomB || x.agent.roomId === door.roomA || true);
  const from = door.roomB === 'lab' ? door.roomA : door.roomB, room = w.fac.room(from);
  n.agent.clear(); n.agent.roomId = from; n.agent.pos = V.copy(room.hubPoints[0]);
  const st = { [n.id]: { dwell: 0, arrivals: 0, replans: 0, stucks: 0, blocked: 0, onDoor: (d) => d.locked ? 'Blocked' : 'Wait', retarget: () => {} } };
  let blocked = 0;
  S.Brain.update = (ww, x, dt) => {
    const s = st[x.id]; if (!s) return;
    if (!x.agent.hasPath && !x.agent.final) { if (blocked || s.dwell > 0) { s.dwell -= dt; return; } goRoom(w, x, 'lab', null); return; }
    const r = w.moveAgent(x.agent, dt, s.onDoor, { id: x.id });
    if (r === 'Blocked') { blocked++; x.agent.clear(); }
  };
  const m = Meter(w, () => [n]); tick(w, 30, m);
  ok(blocked >= 1 && !n.agent.moving && m.spins === 0, 'недостижимая цель за запертой дверью: «нет прохода», стоит, не крутится (отказов ' + blocked + ')');
}

// 5. The real game: brain-driven staff at lunch around the canteen, near the player
{
  S.Brain.update = realUpdate;
  const w = S.Content.createWorld(21, { prof: 'guard' });
  while (w.clock.hour !== 12 || w.clock.minute < 5) w.tick(0.1);
  w.player.pos = V.v(-9, 0, 1); w.player.roomId = w.fac.roomAt(w.player.pos) ? w.fac.roomAt(w.player.pos).id : 'canteen';
  const near = () => w.active.filter(n => !w.isRemote(n.agent.roomId));
  const m = Meter(w, near); tick(w, 300, m);
  m.report('живой мир, обед, люди рядом с игроком (' + near().length + ' чел.)');
  ok(m.deep === 0 && m.overlap / Math.max(1, m.pairTicks) < 0.003, 'в живом мире тела не проникают друг в друга');
  ok(m.jumps === 0, 'в живом мире нет телепортаций: ' + m.jumps);
  ok(m.spins === 0, 'в живом мире никто не крутится: ' + m.spins);
  ok(m.maxHang < 25, 'в живом мире нет долгих зависаний (макс. ' + m.maxHang.toFixed(1) + ' с)');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL NAVIGATION CHECKS PASSED');
process.exit(failures ? 1 : 0);
