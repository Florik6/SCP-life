/* SCP LIFE 2.0 — world assembly: facility, population, anomalies and their responsible scientists, CCTV, player start by profession. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, Hm, P } = S;
  const START = Hm(8, 40);

  function addCameras(w) {
    let n = 0;
    const C = (id, name, room, x, y, z, yaw, range, fov, sweep) => { n++; const r = w.fac.room(room); w.cams.push({ id, name, roomId: room, pos: V.v(x, r.floorY + y, z), baseYaw: yaw, yaw, pitch: 25, fov: fov || 75, range, sweep: sweep == null ? 25 : sweep, period: 12 + n * 1.7, phase: n * 0.13, operational: true, visible: [], watchedBy: null, watchedAt: -1e4 }); };
    // stage 1 cameras keep their ids
    C('cam01', 'К-01 Коридор Б, запад', 'corridor', -25.5, 2.9, 1.6, 90, 28, 60, 12); C('cam02', 'К-02 Коридор Б, восток', 'corridor', 25.5, 2.9, -1.6, 270, 28, 60, 12);
    C('cam03', 'К-03 КПП Б', 'post', -17.8, 2.9, -2.8, 225, 12); C('cam04', 'К-04 Блок D', 'dblock', 7.2, 2.9, -2.8, 240, 18, 85, 25); C('cam05', 'К-05 Лаборатория Б', 'lab', 9.2, 2.9, 11.8, 225, 16);
    C('cam06', 'К-06 Камера SCP-L-001', 'chamber', 10.5, 4.2, 18.1, 135, 18, 85, 20); C('cam07', 'К-07 Шлюз L-001', 'airlock', 21.5, 2.9, 2.8, 315, 8, 80, 20); C('cam08', 'К-08 Столовая', 'canteen', -3.8, 2.9, 11.8, 225, 16); C('cam09', 'К-09 Инженерный блок Б', 'eng', 18.2, 2.9, -2.8, 225, 14);
    // sector A
    C('cam10', 'К-10 Коридор А, запад', 'corrA', -79.5, 2.9, 1.6, 90, 28, 60, 12); C('cam11', 'К-11 Коридор А, восток', 'corrA', -27, 2.9, -1.6, 270, 28, 60, 12);
    C('cam12', 'К-12 Командный центр', 'command', -50.8, 2.9, 12.2, 225, 14); C('cam13', 'К-13 Серверная', 'servers', -62.8, 2.9, 12.2, 225, 10); C('cam14', 'К-14 Медблок А', 'medA', -44.8, 2.9, -2.6, 315, 14);
    C('cam15', 'К-15 Карантин', 'quarantine', -56.8, 2.9, -2.6, 300, 12); C('cam16', 'К-16 Изолятор LF-128', 'cell128', -56.8, 2.9, -10.6, 315, 10); C('cam17', 'К-17 Архив', 'archiveA', -62.8, 2.9, 17.5, 225, 10);
    C('cam18', 'К-18 Склад А', 'storage', -66.8, 2.9, -2.6, 300, 14); C('cam19', 'К-19 Казармы', 'barracks', -27, 2.9, 2.8, 225, 14);
    // sector C
    C('cam20', 'К-20 Коридор С, запад', 'corrC', 32.8, 2.9, 1.6, 90, 30, 60, 10); C('cam21', 'К-21 Коридор С, центр', 'corrC', 70, 2.9, -1.6, 90, 30, 60, 30); C('cam22', 'К-22 Коридор С, восток', 'corrC', 109.5, 2.9, 1.6, 270, 30, 60, 10);
    for (const [scp, b] of Object.entries(w.fac.blocks)) { const c = w.fac.room(b.cell); if (!c) continue; const n2 = scp.slice(-3); const north = b.side === 'N'; C('cam' + n2, 'К-' + n2 + ' Камера ' + scp, c.id, north ? c.minX + 0.4 : c.maxX - 0.4, 3.0, north ? c.maxZ - 0.4 : c.minZ + 0.4, north ? 135 : 315, 12, 85, 15); }
    C('cam23', 'К-23 Лаборатория С', 'labC', 109.6, 2.9, 12.3, 225, 14); C('cam24', 'К-24 Кабинеты С', 'officesC', 91, 2.9, 12.3, 135, 14); C('cam25', 'К-25 Пост «Восток»', 'postC', 40.2, 2.9, -2.6, 315, 10);
    C('cam26', 'К-26 Служебный лифт', 'liftOld', 115.6, 2.6, 8.6, 225, 8, 90, 0); C('cam27', 'К-27 Резервная генераторная', 'genC', 99.6, 2.9, -2.6, 315, 12);
    // level 4
    C('cam30', 'К-30 Тоннель, запад', 'corr4', -19.5, 2.9, 1.1, 90, 30, 60, 8); C('cam31', 'К-31 Тоннель, центр', 'corr4', 45, 2.9, -1.1, 90, 30, 60, 30); C('cam32', 'К-32 Тоннель, восток', 'corr4', 109.5, 2.9, 1.1, 270, 30, 60, 8);
    C('cam33', 'К-33 Сектор D-2', 'dhall', 11.6, 3.0, 2.2, 225, 22, 85, 25); C('cam34', 'К-34 Испытательная камера', 'dtest', 17.6, 3.0, 13.4, 225, 9); C('cam35', 'К-35 Главная генераторная', 'genMain', 55.6, 3.0, 2.2, 315, 16);
    C('cam36', 'К-36 Камера Т-1', 'heavyCell4', 73.6, 3.2, 19.6, 225, 16, 85, 15); C('cam37', 'К-37 Временная зона', 'tempHold', 89.6, 3.0, 2.2, 315, 14); C('cam38', 'К-38 Приёмный шлюз', 'arrivalDock', 107.6, 3.0, -2.2, 225, 16); C('cam39', 'К-39 Западный тоннель', 'corr4w', -79.5, 2.9, 1.1, 90, 30, 60, 10);
    C('cam40', 'К-40 Пост D-2', 'postD', -20.9, 3.0, 8.6, 225, 8);
  }

  // Responsible scientists: stage-1 staff keep SCP-L-001; story characters keep their objects.
  function assignScientists(w) {
    const fixed = { 'SCP-L-001': ['s.orlova', 's.kim', 's.lebedev'], 'SCP-LF-121': ['s.vetlugina'], 'SCP-LF-124': ['s.pokrovsky'] };
    const want = { 'SCP-LF-125': 'biologist', 'SCP-LF-128': 'biologist', 'SCP-LF-133': 'anomaly_psychologist', 'SCP-LF-136': 'anomaly_psychologist', 'SCP-LF-137': 'memetics', 'SCP-LF-138': 'memetics', 'SCP-LF-129': 'memetics', 'SCP-LF-135': 'scientist' };
    const pool = w.npcs.filter(n => n.dept === 'science' && n.prof !== 'lab_assistant' && n.prof !== 'research_director');
    for (const a of w.anomalies) {
      if (!a.arrived) continue;
      const ids = (fixed[a.id] || []).slice();
      const pref = want[a.id];
      const cands = pool.filter(n => ids.indexOf(n.id) < 0 && n.assignedScps.length < 2).sort((x, y) => (pref && y.prof === pref ? 1 : 0) - (pref && x.prof === pref ? 1 : 0) || x.assignedScps.length - y.assignedScps.length);
      while (ids.length < 3 && cands.length) ids.push(cands.shift().id);
      for (const id of ids) { const n = w.npc(id); if (!n) continue; if (n.assignedScps.indexOf(a.id) < 0) n.assignedScps.push(a.id); if (a.assigned.indexOf(id) < 0) a.assigned.push(id); }
    }
  }

  function setupPlayer(w, o) {
    const p = w.player, pr = S.Professions.get(o.prof || 'guard') || S.Professions.get('guard');
    p.prof = pr.id; p.dept = pr.dept; p.level = pr.level; p.mode = o.mode || 'career'; p.female = !!o.female;
    p.first = o.first || (p.female ? 'Анна' : 'Алексей'); p.last = o.last || (p.female ? 'Волкова' : 'Волков');
    p.title = pr.id === 'dclass' ? 'D-' + (9000 + (w.seed % 999)) : S.People.TITLES[pr.id];
    p.name = pr.id === 'dclass' ? p.title : p.title + ' ' + p.first[0] + '. ' + p.last;
    if (o.traits) p.psy.resilience = S.clamp(0.4 + (o.traits.bravery || 0.5) * 0.5, 0.3, 0.95);
    p.shift = pr.dept === 'science' || pr.dept === 'admin' || pr.id === 'psychiatrist' ? 'office' : 'day'; p.restOffset = 0; p.startJit = 0; p.mealWave = 2;
    p.workRoom = pr.work.find(r => w.fac.room(r)) || 'corridor'; p.post = pr.dept === 'security' ? (pr.id === 'escort' ? 'postD' : 'post') : null; p.rep = {}; p.rep[pr.dept] = 50;
    // home: on-site bed for staff, a cell for class D
    if (pr.id === 'dclass') {
      const bunk = Object.values(w.fac.pois).find(x => x.type === 'CellBunk' && x.roomId.indexOf('dcell') === 0 && (!x.owners || x.owners.length < 3));
      p.bedPoi = bunk.id; bunk.owners = (bunk.owners || []).concat('player'); p.homeRoom = bunk.roomId; p.hallRoom = 'dhall'; p.workRoom = 'dhall';
    } else { const bed = w.fac.poi('dorm.bed8') || Object.values(w.fac.pois).find(x => x.type === 'Bed' && !x.owners); p.bedPoi = bed ? bed.id : null; if (bed) bed.owners = (bed.owners || []).concat('player'); }
    const card = { id: 'card.player', owner: 'player', ownerName: p.name, level: pr.level, perms: pr.perms, revoked: false, holder: 'player', room: null, pos: V.v(0, 0, 0), tempLevel: 0, tempPerms: 0, tempUntil: -1 };
    w.cards[card.id] = card; p.cards = [card.id];
    // responsible objects for researchers
    const scpFor = { scientist: ['SCP-L-001', 'SCP-LF-130'], senior_scientist: ['SCP-L-001', 'SCP-LF-124'], junior_researcher: ['SCP-LF-125'], biologist: ['SCP-LF-125', 'SCP-LF-128'], anomaly_psychologist: ['SCP-LF-133', 'SCP-LF-136'], memetics: ['SCP-LF-121', 'SCP-LF-137'], research_director: ['SCP-LF-124'], lab_assistant: ['SCP-LF-131'] }[pr.id] || [];
    for (const id of scpFor) { const a = w.anomaly(id); if (a) { a.assigned.push('player'); p.assignedScps.push(id); } }
    // start position: at the workplace
    const room = w.fac.room(p.workRoom), spot = room.pois.find(x => ['GuardPost', 'Desk', 'Console', 'Workbench', 'Seat', 'Stand'].indexOf(x.type) >= 0 && !x.reservedBy && !x.owners) || null;
    const pos = spot ? spot.pos : (room.hubPoints[0] || room.center);
    p.pos = V.v(pos.x + (spot ? 0.6 : 0), room.floorY, pos.z + (spot ? 0.6 : 0)); p.roomId = room.id; p.yaw = spot ? (spot.yaw + 180) % 360 : 180;
    p.addJournal('[' + S.fmtStamp(w.now) + '] Заступил' + (p.female ? 'а' : '') + ' на смену. Должность: ' + pr.name + '. Рабочее место: «' + room.name + '». Карта L' + pr.level + (pr.perms ? ' «' + S.permList(pr.perms) + '»' : '') + '.');
    p.addJournal(pr.desc);
  }

  function createWorld(seed, opts) {
    opts = opts || {};
    const fac = S.Map.build(), w = new S.World(fac, START, seed);
    w.opts = { prof: opts.prof || 'guard', first: opts.first, last: opts.last, female: opts.female, mode: opts.mode || 'career', traits: opts.traits };
    S.People.generate(w, { seed, playerProf: w.opts.prof });
    for (const id of S.Anoms.ORDER) { const a = S.Anoms.create(id); w.anomalies.push(a); }
    addCameras(w);
    for (const a of w.anomalies) if (a.arrived) a.init(w);
    assignScientists(w);
    w.infra.init();
    S.People.placeAll(w);
    setupPlayer(w, w.opts);
    // SCP-L-001 starts with the stage-1 history
    const t = w.anomaly('SCP-L-001').tm; t.lastSession = START - 250;
    t.seedFamiliarity('s.orlova', [8, 14, 16, 20]); t.seedFamiliarity('s.kim', [16]); t.seedFamiliarity('s.lebedev', [2, 20]); t.seedDoor(16, 0, 1); t.seedDoor(16, 20, 1);
    // a few regular visitors that anomalies already know
    for (const a of w.anomalies) if (a.arrived) for (const id of a.assigned) { if (id === 'player') continue; const m = a.mind.get(id); m.seen = 6; m.recog = 0.8; m.trust = 0.3; m.last = START - 600; m.hours[w.rng.int(9, 17)] = 5; m.habit = 0.8; }
    const nos = w.anomaly('SCP-LF-125').mind.get('c.nosova'); nos.seen = 12; nos.trust = 0.8; nos.recog = 0.95; nos.last = START - 300;
    w.life.due = {}; w.life.planDay = w.clock.day; w.life.dayPlan();
    w.ai = S.AI ? new S.AI.Core(w) : null;
    return w;
  }

  S.Content = {
    START, createWorld,
    archive() { return S.Anoms.ORDER.map(id => { const d = S.Anoms.DEFS[id]; return { id, name: d.name, cls: d.cls, kind: d.kind, desc: d.desc, contain: d.contain, triggers: d.triggers }; }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
