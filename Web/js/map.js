/* SCP LIFE — facility layout: level 3 (sectors A, B, C; south gallery with security, MTF and medical sectors), level 4 (technical,
   D-2, D-3, heavy block, dock, wing T-2 of living anomalies, isolators С-4) and level −9 (zone of special containment). */
(function (root) {
  'use strict';
  const S = root.SCP, { V, Hm, P, req, Room, Door, Facility } = S;
  const L4Y = -7;

  function build() {
    const f = new Facility(); f.windows = []; f.blocks = {};
    const R = (id, name, type, x0, x1, z0, z1, o) => { o = o || {}; const lvl = o.level || 3; return f.addRoom(new Room(Object.assign({ id, name, type, minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: lvl === 4 ? 3.5 : 3.2, level: lvl }, o, { floorY: lvl === 4 ? L4Y : (o.floorY || 0) }))); };
    const Pz = (room, id, type, x, z, yaw, label, extra) => { const p = Object.assign({ id, type, roomId: room.id, pos: V.v(x, room.floorY, z), yaw, label, owner: null, owners: null, reservedBy: null, node: -1 }, extra || {}); room.pois.push(p); return p; };
    const hubs = (room, ...xz) => { for (let i = 0; i + 1 < xz.length; i += 2) room.hubPoints.push(V.v(xz[i], room.floorY, xz[i + 1])); };
    const links = (room, ...p) => { for (let i = 0; i + 1 < p.length; i += 2) room.hubEdges.push([p[i], p[i + 1]]); };
    const D = (id, name, a, b, x, z, alongX, kind, rq, width, extra) => {
      const ra = f.room(a); const d = new Door(Object.assign({ id, name, roomA: a, roomB: b, pos: V.v(x, ra.floorY, z), alongX, kind, req: rq, width: width || 1.6 }, extra || {}));
      if (kind === 'Heavy') { d.openSeconds = 3; d.autoClose = 6; d.width = 2.2; d.height = 3; }
      if (kind === 'Security') d.openSeconds = 1.4;
      if (kind === 'Cell') { d.openSeconds = 1.2; d.width = 1.2; }
      return f.addDoor(d);
    };
    // line of hubs along the longer axis (rooms with furniture against the walls)
    const autoHubs = room => {
      if (room.hubPoints.length) return;
      const cx = (room.minX + room.maxX) / 2, cz = (room.minZ + room.maxZ) / 2;
      if (room.width >= room.depth) { const n = Math.max(1, Math.round(room.width / 4.5)); for (let i = 0; i < n; i++) room.hubPoints.push(V.v(room.minX + (i + 0.5) * room.width / n, room.floorY, cz)); }
      else { const n = Math.max(1, Math.round(room.depth / 4.5)); for (let i = 0; i < n; i++) room.hubPoints.push(V.v(cx, room.floorY, room.minZ + (i + 0.5) * room.depth / n)); }
    };
    // POIs along a wall, facing the wall (desks) or with the head to the wall (beds)
    const row = (room, side, type, spacing, inset, label, skipNear, extra, prefix) => {
      const out = []; const ax = side === 'N' || side === 'S'; const a0 = ax ? room.minX : room.minZ, a1 = ax ? room.maxX : room.maxZ;
      const n = Math.floor((a1 - a0 - 0.6) / spacing); const yaw = { N: 0, S: 180, E: 90, W: 270 }[side];
      for (let i = 0; i < n; i++) {
        const a = a0 + 0.3 + spacing * (i + 0.5) + ((a1 - a0 - 0.6) - n * spacing) / 2;
        if (skipNear && skipNear.some(s => Math.abs(s - a) < 1.3)) continue;
        const x = ax ? a : (side === 'E' ? room.maxX - inset : room.minX + inset), z = ax ? (side === 'N' ? room.maxZ - inset : room.minZ + inset) : a;
        out.push(Pz(room, (prefix || room.id + '.' + type.toLowerCase()) + (room.pois.length + 1), type, x, z, yaw, label, extra));
      }
      return out;
    };
    // a room on the north/south side of a corridor with a door in the shared wall
    const along = (corr, side, x0, x1, depth, id, name, type, doorX, o, dk, dr) => {
      const z0 = side === 'N' ? corr.maxZ + 0.3 : corr.minZ - 0.3 - depth, z1 = side === 'N' ? corr.maxZ + 0.3 + depth : corr.minZ - 0.3;
      const r = R(id, name, type, x0, x1, z0, z1, Object.assign({ level: corr.level, floorY: corr.floorY, sector: corr.sector, style: corr.style }, o));
      D('d.' + id, (o && o.doorName) || ('Дверь: ' + name.toLowerCase()), id, corr.id, doorX == null ? (x0 + x1) / 2 : doorX, side === 'N' ? corr.maxZ + 0.15 : corr.minZ - 0.15, false, dk || 'Standard', dr || req(1));
      return r;
    };
    const beyond = (base, side, x0, x1, depth, id, name, type, doorX, o, dk, dr) => {
      const z0 = side === 'N' ? base.maxZ + 0.3 : base.minZ - 0.3 - depth, z1 = side === 'N' ? base.maxZ + 0.3 + depth : base.minZ - 0.3;
      const r = R(id, name, type, x0, x1, z0, z1, Object.assign({ level: base.level, floorY: base.floorY, sector: base.sector, style: base.style }, o));
      D('d.' + id, (o && o.doorName) || ('Дверь: ' + name.toLowerCase()), id, base.id, doorX == null ? (x0 + x1) / 2 : doorX, side === 'N' ? base.maxZ + 0.15 : base.minZ - 0.15, false, dk || 'Standard', dr || req(1));
      return r;
    };
    const transit = (id, name, a, b, kind, seconds, rq) => D(id, name, a, b, f.room(a).center.x, f.room(a).center.z, false, kind, rq || req(1), 1.6, { transit: seconds });

    // ================================================================= LEVEL 3 · SECTOR B (stage 1, unchanged)
    const corr = R('corridor', 'Коридор сектора Б-3', 'Corridor', -26, 26, -2, 2, { sector: 'Б' });
    hubs(corr, -24, 0, -16, 0, -8, 0, 0, 0, 8, 0, 16, 0, 24, 0);
    Pz(corr, 'pp.corr_w', 'PatrolPoint', -12, -0.9, 90, 'Коридор Б, запад'); Pz(corr, 'pp.corr_e', 'PatrolPoint', 21, 0.9, 270, 'Коридор Б, восток'); Pz(corr, 'panel.corr', 'Panel', 4, 1.4, 0, 'Электрощиток коридора Б');
    const dorm = R('dorm', 'Жилой блок персонала Б', 'Dormitory', -26, -15.3, 2.3, 12.3, { sector: 'Б' });
    hubs(dorm, -20.6, 3.8, -20.6, 7.3, -20.6, 10.8);
    [4.3, 6.6, 8.9, 11.2].forEach((z, i) => { Pz(dorm, 'dorm.bed' + (i + 1), 'Bed', -24.6, z, 270, 'Койка ' + (i + 1)); Pz(dorm, 'dorm.bed' + (i + 5), 'Bed', -16.7, z, 90, 'Койка ' + (i + 5)); });
    Pz(dorm, 'dorm.seat1', 'Seat', -21.8, 11.6, 180, 'Кресло'); Pz(dorm, 'dorm.seat2', 'Seat', -19.4, 11.6, 180, 'Кресло'); Pz(dorm, 'pp.dorm', 'PatrolPoint', -20.6, 5.5, 0, 'Жилой блок Б');
    const can = R('canteen', 'Столовая', 'Canteen', -15, -3.3, 2.3, 12.3, { sector: 'Б' });
    hubs(can, -9.2, 3.6, -9.2, 7.0, -9.2, 10.2);
    Pz(can, 'canteen.counter', 'FoodCounter', -9.2, 10.7, 0, 'Раздача'); let seat = 0;
    for (const tx of [-12.6, -5.8]) for (const tz of [5.5, 8.5]) { Pz(can, 'canteen.seat' + (++seat), 'Seat', tx - 0.6, tz - 0.85, 0, 'Место'); Pz(can, 'canteen.seat' + (++seat), 'Seat', tx + 0.6, tz - 0.85, 0, 'Место'); Pz(can, 'canteen.seat' + (++seat), 'Seat', tx - 0.6, tz + 0.85, 180, 'Место'); Pz(can, 'canteen.seat' + (++seat), 'Seat', tx + 0.6, tz + 0.85, 180, 'Место'); }
    Pz(can, 'pp.canteen', 'PatrolPoint', -8.4, 8.6, 0, 'Столовая'); Pz(can, 'panel.canteen', 'Panel', -14.4, 3.1, 270, 'Щиток столовой');
    const lab = R('lab', 'Лаборатория исследований', 'Laboratory', -3, 9.7, 2.3, 12.3, { sector: 'Б' });
    hubs(lab, 0.6, 4.4, 6.1, 4.4, 0.6, 10.6, 6.1, 10.6); links(lab, 0, 1, 0, 2, 1, 3, 2, 3);
    [4.8, 7.3, 9.8].forEach((z, i) => { Pz(lab, 'lab.deskW' + (i + 1), 'Desk', -1.6, z, 270, 'Рабочее место'); Pz(lab, 'lab.deskE' + (i + 1), 'Desk', 8.3, z, 90, 'Рабочее место'); });
    Pz(lab, 'lab.bench1', 'Workbench', 3.35, 6.4, 0, 'Лабораторный стол'); Pz(lab, 'lab.bench2', 'Workbench', 3.35, 9.2, 180, 'Лабораторный стол');
    Pz(lab, 'lab.console', 'Console', 3.35, 11.3, 0, 'Терминал экспериментов'); Pz(lab, 'pp.lab', 'PatrolPoint', 3.3, 3.4, 0, 'Лаборатория Б'); Pz(lab, 'panel.lab', 'Panel', 9.1, 3.1, 90, 'Щиток лаборатории');
    const obs = R('obs', 'Наблюдательный пункт SCP-L-001', 'Observation', 10, 16.7, 2.3, 8.3, { sector: 'Б' });
    hubs(obs, 13.35, 3.8, 13.35, 5.8);
    Pz(obs, 'obs.console1', 'Console', 12.4, 7.0, 0, 'Пульт наблюдения'); Pz(obs, 'obs.console2', 'Console', 14.3, 7.0, 0, 'Пульт наблюдения');
    Pz(obs, 'pp.obs', 'PatrolPoint', 11.2, 3.6, 0, 'Наблюдательный пункт L-001'); Pz(obs, 'panel.obs', 'Panel', 16.1, 3.1, 90, 'Щиток наблюдательного пункта');
    const air = R('airlock', 'Шлюз камеры содержания', 'Airlock', 17, 22, 2.3, 8.3, { sector: 'Б' });
    hubs(air, 19.5, 4.2, 19.5, 6.6); Pz(air, 'airlock.panel', 'Panel', 21.3, 7.2, 90, 'Контроллер замка гермодвери');
    const ch = R('chamber', 'Камера содержания SCP-L-001', 'Containment', 10, 22, 8.6, 18.6, { sector: 'Б', height: 4.5, style: 'heavy', scp: 'SCP-L-001' });
    hubs(ch, 16, 11, 16, 15.8, 12.6, 13.5, 19.4, 13.5);
    Pz(ch, 'l001.center', 'Stand', 16, 13.6, 0, 'Центр камеры'); Pz(ch, 'l001.cornerNW', 'Stand', 11.3, 17.3, 315, 'Северо-западная стена'); Pz(ch, 'l001.cornerNE', 'Stand', 20.7, 17.3, 45, 'Северо-восточная стена');
    Pz(ch, 'l001.wallW', 'Stand', 11.3, 12.5, 270, 'Западная стена'); Pz(ch, 'l001.wallE', 'Stand', 20.7, 13.5, 90, 'Восточная стена'); Pz(ch, 'l001.window', 'Window', 13.35, 9.6, 180, 'У окна наблюдения');
    Pz(ch, 'chamber.sensor1', 'Terminal', 18.4, 10.6, 0, 'Датчики камеры'); Pz(ch, 'chamber.sensor2', 'Terminal', 20.5, 10.6, 0, 'Датчики камеры');
    ch.visibleRooms.push('obs'); obs.visibleRooms.push('chamber');
    f.windows.push({ a: 'obs', b: 'chamber', min: 11.0, max: 15.7, y0: 1.0, y1: 2.4, scp: 'SCP-L-001' });
    const post = R('post', 'КПП охраны Б', 'SecurityPost', -26, -17.3, -10.3, -2.3, { sector: 'Б' });
    hubs(post, -21.6, -3.9, -21.6, -7.2);
    Pz(post, 'post.console1', 'GuardPost', -23.0, -8.8, 180, 'Пульт видеонаблюдения'); Pz(post, 'post.console2', 'GuardPost', -20.5, -8.8, 180, 'Пульт видеонаблюдения'); Pz(post, 'pp.post', 'PatrolPoint', -19.2, -4.0, 0, 'КПП Б');
    post.terminal = { x: -17.4, z: -6.0, yaw: 270 };
    const med = R('med', 'Медпункт Б', 'MedicalBay', -17, -9.3, -10.3, -2.3, { sector: 'Б' });
    hubs(med, -13.15, -3.9, -13.15, -6.8);
    Pz(med, 'med.bed1', 'MedBed', -15.6, -9.2, 180, 'Койка медпункта'); Pz(med, 'med.bed2', 'MedBed', -12.4, -9.2, 180, 'Койка медпункта'); Pz(med, 'med.desk', 'Desk', -10.7, -5.3, 90, 'Стол врача'); Pz(med, 'pp.med', 'PatrolPoint', -15.5, -3.8, 0, 'Медпункт Б');
    const db = R('dblock', 'Блок класса D — общий зал', 'DClassCommon', -9, 7.7, -10.3, -2.3, { sector: 'Б', style: 'dclass' });
    hubs(db, -7.6, -3.5, -0.6, -3.5, 6.3, -3.5, -0.6, -6.3, -7.6, -9.0, -0.6, -9.0, 6.3, -9.0); links(db, 0, 1, 1, 2, 4, 5, 5, 6, 1, 3, 3, 5, 0, 4, 2, 6);
    let ds = 0; for (const tx of [-4.5, 3.2]) for (let k = -1; k <= 1; k++) { Pz(db, 'dblock.seat' + (++ds), 'Seat', tx + k * 1.2, -5.45, 180, 'Скамья'); Pz(db, 'dblock.seat' + (++ds), 'Seat', tx + k * 1.2, -7.15, 0, 'Скамья'); }
    Pz(db, 'dblock.work1', 'Workbench', -8.3, -4.5, 270, 'Сортировочный стол'); Pz(db, 'dblock.work2', 'Workbench', -8.3, -7.8, 270, 'Сортировочный стол'); Pz(db, 'dblock.work3', 'Workbench', 7.0, -4.5, 90, 'Стиральная машина'); Pz(db, 'dblock.work4', 'Workbench', 7.0, -7.8, 90, 'Стиральная машина');
    Pz(db, 'pp.dblock', 'PatrolPoint', -2.6, -3.4, 0, 'Блок D'); Pz(db, 'panel.dblock', 'Panel', 2.0, -2.9, 0, 'Щиток блока D');
    for (let i = 0; i < 4; i++) { const cx = -7.15 + 4 * i, cell = R('cell' + (i + 1), 'Камера D-' + (i + 1), 'DClassCell', cx - 1.85, cx + 1.85, -16.6, -10.6, { sector: 'Б', height: 2.8, style: 'dclass' }); hubs(cell, cx + 0.3, -11.8, cx + 0.3, -14.6); Pz(cell, 'cell' + (i + 1) + '.bunk', 'CellBunk', cx - 1.3, -15.4, 180, 'Нары'); }
    const eng = R('eng', 'Инженерный блок Б', 'Engineering', 8, 18.7, -10.3, -2.3, { sector: 'Б' });
    hubs(eng, 10.0, -3.8, 16.7, -3.8, 10.0, -9.4, 16.7, -9.4); links(eng, 0, 1, 0, 2, 1, 3, 2, 3);
    Pz(eng, 'panel.eng1', 'Panel', 8.7, -4.8, 270, 'Распределительный щит Б'); Pz(eng, 'panel.eng2', 'Panel', 8.7, -7.8, 270, 'Щит резервного питания Б'); Pz(eng, 'eng.bench', 'Workbench', 18.0, -5.5, 90, 'Верстак'); Pz(eng, 'pp.eng', 'PatrolPoint', 11.0, -3.5, 0, 'Инженерный блок Б');
    D('d.post', 'Дверь КПП Б', 'post', 'corridor', -21.5, -2.15, false, 'Security', req(2, P.Security));
    D('d.med', 'Дверь медпункта Б', 'med', 'corridor', -13.2, -2.15, false, 'Standard', req(1));
    D('d.dblock', 'Шлюз блока D', 'dblock', 'corridor', -0.6, -2.15, false, 'Security', req(2, P.Security | P.DClassBlock | P.Engineering | P.Medical | P.Ethics));
    for (let i = 0; i < 4; i++) { const cd = D('d.cell' + (i + 1), 'Дверь камеры D-' + (i + 1), 'cell' + (i + 1), 'dblock', -7.15 + 4 * i, -10.45, false, 'Cell', req(0, P.CellResident | P.DClassBlock | P.Security)); cd.curfewStart = Hm(22); cd.curfewEnd = Hm(6, 30); }
    D('d.eng', 'Дверь инженерного блока Б', 'eng', 'corridor', 13.3, -2.15, false, 'Standard', req(2, P.Engineering | P.Security));
    D('d.dorm', 'Дверь жилого блока Б', 'dorm', 'corridor', -20.5, 2.15, false, 'Standard', req(1));
    D('d.canteen', 'Проём столовой', 'canteen', 'corridor', -9.2, 2.15, false, 'Archway', req(0), 2.4);
    D('d.lab', 'Дверь лаборатории Б', 'lab', 'corridor', 3.3, 2.15, false, 'Standard', req(1, P.Research | P.Security | P.Engineering));
    D('d.obs', 'Дверь наблюдательного пункта L-001', 'obs', 'corridor', 13.3, 2.15, false, 'Standard', req(2, P.Research | P.Security | P.Engineering));
    D('d.airlock', 'Шлюз зоны содержания L-001', 'airlock', 'corridor', 19.5, 2.15, false, 'Security', req(3, P.Containment | P.Research));
    const heavy = D('d.chamber', 'Гермодверь камеры SCP-L-001', 'chamber', 'airlock', 19.5, 8.45, false, 'Heavy', req(3, P.Containment, true));
    heavy.hasExit = true; heavy.exitFrom = 'chamber'; heavy.exitReq = req(3, P.Containment);
    const kitchen = beyond(can, 'N', -15, -3.3, 4.4, 'kitchen', 'Кухня столовой', 'Kitchen', -4.0, { doorName: 'Дверь кухни' }, 'Standard', req(1));
    row(kitchen, 'N', 'Stove', 2.0, 0.7, 'Плита'); Pz(kitchen, 'kitchen.prep', 'Workbench', -12.5, 13.4, 180, 'Разделочный стол'); hubs(kitchen, -12, 14.8, -7, 14.8, -4.5, 14.8);

    // ================================================================= LEVEL 3 · SECTOR A (administration, housing, medicine)
    const corrA = R('corrA', 'Коридор сектора А-3', 'Corridor', -80, -26.3, -2, 2, { sector: 'А', style: 'admin' });
    for (let x = -76; x <= -30; x += 8) hubs(corrA, x, 0);
    Pz(corrA, 'pp.corrA_w', 'PatrolPoint', -70, 0.9, 90, 'Коридор А, запад'); Pz(corrA, 'pp.corrA_e', 'PatrolPoint', -36, -0.9, 270, 'Коридор А, восток'); Pz(corrA, 'panel.corrA', 'Panel', -60, 1.4, 0, 'Электрощиток коридора А');
    D('d.ab', 'Переход А–Б', 'corrA', 'corridor', -26.15, 0, true, 'Security', req(1), 2.0);
    Pz(corrA, 'cp.B', 'Checkpoint', -27.7, -1.5, 90, 'Пост КПП «Б–А»');
    const bar = along(corrA, 'N', -38, -26.6, 10, 'barracks', 'Казармы охраны', 'Barracks', -32, { doorName: 'Дверь казарм' }, 'Standard', req(1, P.Security | P.MTF));
    row(bar, 'N', 'Bed', 1.25, 1.1, 'Двухъярусная койка', null, { bunk: true }); row(bar, 'W', 'Seat', 1.4, 0.6, 'Табурет'); Pz(bar, 'pp.barracks', 'PatrolPoint', -30, 4.2, 0, 'Казармы');
    const qa = along(corrA, 'N', -50, -38.3, 10, 'quartersA', 'Жилые помещения сотрудников А', 'Quarters', -44, null, 'Standard', req(1));
    row(qa, 'N', 'Bed', 1.3, 1.1, 'Койка'); row(qa, 'W', 'Desk', 1.6, 0.6, 'Стол'); row(qa, 'E', 'Seat', 1.6, 0.6, 'Кресло');
    const cmd = along(corrA, 'N', -62, -50.3, 10, 'command', 'Командный центр', 'Command', -56, { style: 'admin', doorName: 'Дверь командного центра' }, 'Security', req(2, P.Command | P.Security | P.Ethics | P.Records | P.Surveillance));
    row(cmd, 'N', 'Console', 1.5, 0.8, 'Пульт оператора'); row(cmd, 'W', 'Console', 1.6, 0.8, 'Пульт диспетчера'); cmd.terminal = { x: -50.6, z: 5.5, yaw: 90 }; Pz(cmd, 'pp.command', 'PatrolPoint', -53, 3.5, 0, 'Командный центр');
    const srv = along(corrA, 'N', -70, -62.3, 10, 'servers', 'Серверная', 'Servers', -66, null, 'Security', req(2, P.Engineering | P.Records | P.Command));
    row(srv, 'N', 'Rack', 1.1, 0.7, 'Серверная стойка'); row(srv, 'E', 'Rack', 1.1, 0.7, 'Серверная стойка'); Pz(srv, 'servers.desk', 'Console', -69.3, 4.5, 270, 'Консоль администратора');
    const shA = along(corrA, 'N', -80, -70.3, 10, 'shelterA', 'Аварийное убежище А', 'Shelter', -75, null, 'Heavy', req(0));
    row(shA, 'N', 'Seat', 1.0, 0.6, 'Скамья'); row(shA, 'W', 'Shelf', 1.6, 0.6, 'Запасы');
    const pA = along(corrA, 'S', -34, -26.6, 8, 'postA', 'Пост безопасности «Запад»', 'SecurityPost', -30, null, 'Security', req(2, P.Security));
    row(pA, 'S', 'GuardPost', 1.8, 1.2, 'Пульт поста'); pA.terminal = { x: -26.9, z: -6.3, yaw: 90 }; Pz(pA, 'pp.postA', 'PatrolPoint', -32.5, -3.6, 0, 'Пост «Запад»');
    const mtf = along(corrA, 'S', -44, -34.3, 8, 'mtf', 'Дежурная часть МОГ «Ключ-9»', 'MTF', -39, null, 'Security', req(3, P.MTF | P.Command));
    row(mtf, 'S', 'Seat', 1.3, 0.6, 'Скамья'); row(mtf, 'W', 'Workbench', 1.6, 0.6, 'Оружейный стол');
    const medA = along(corrA, 'S', -56, -44.3, 8, 'medA', 'Медицинский блок А', 'MedicalBay', -50, null, 'Standard', req(1));
    row(medA, 'S', 'MedBed', 1.6, 1.1, 'Койка'); Pz(medA, 'medA.desk1', 'Desk', -55.4, -5, 270, 'Стол врача'); Pz(medA, 'medA.desk2', 'Desk', -44.9, -5, 90, 'Кабинет психиатра'); Pz(medA, 'pp.medA', 'PatrolPoint', -47, -3.5, 0, 'Медблок А');
    const qz = along(corrA, 'S', -66, -56.3, 8, 'quarantine', 'Карантинная зона', 'Quarantine', -61, { style: 'research' }, 'Security', req(2, P.Medical | P.Containment));
    Pz(qz, 'quarantine.suit1', 'Hazmat', -65.4, -9.6, 0, 'Защитный костюм на стойке'); Pz(qz, 'quarantine.suit2', 'Hazmat', -64.4, -9.6, 0, 'Защитный костюм на стойке'); Pz(qz, 'quarantine.desk', 'Desk', -56.9, -5, 90, 'Пост карантина');
    const stA = along(corrA, 'S', -80, -66.3, 8, 'storage', 'Склад сектора А', 'Storage', -73, null, 'Standard', req(1, P.Logistics | P.Engineering | P.Security));
    row(stA, 'S', 'Shelf', 1.6, 0.6, 'Стеллаж'); row(stA, 'W', 'Shelf', 1.6, 0.6, 'Стеллаж'); Pz(stA, 'storage.suit', 'Hazmat', -67.0, -9.6, 0, 'Защитный костюм на стойке');
    const dirr = beyond(cmd, 'N', -62, -56.3, 5.4, 'director', 'Кабинет директора', 'Office', -59, { doorName: 'Дверь кабинета директора' }, 'Security', req(4, P.Command));
    Pz(dirr, 'director.desk', 'Desk', -59.2, 17.2, 0, 'Стол директора'); Pz(dirr, 'director.seat', 'Seat', -61.2, 14.0, 90, 'Кресло');
    const meet = beyond(cmd, 'N', -56, -50.3, 5.4, 'meeting', 'Зал совещаний', 'Meeting', -53, null, 'Standard', req(2, P.Command | P.Ethics | P.Research | P.Security));
    for (let i = 0; i < 3; i++) { Pz(meet, 'meeting.s' + (2 * i), 'Seat', -54.4 + i * 1.1, 14.6, 0, 'Место за столом'); Pz(meet, 'meeting.s' + (2 * i + 1), 'Seat', -54.4 + i * 1.1, 16.6, 180, 'Место за столом'); }
    hubs(meet, -55.3, 13.3, -51.3, 13.3, -51.3, 17.6, -55.3, 17.6); links(meet, 0, 1, 1, 2, 2, 3, 3, 0);
    const arch = beyond(srv, 'N', -70, -62.3, 5.4, 'archiveA', 'Архив записей', 'Archive', -66, { style: 'admin' }, 'Security', req(2, P.Records | P.Research));
    row(arch, 'W', 'Shelf', 1.3, 0.6, 'Стеллаж с делами'); Pz(arch, 'archive.desk', 'Console', -62.9, 15.3, 90, 'Терминал архива');
    const stairsA = R('stairsA', 'Лестничная шахта А', 'Stairs', -86, -80.3, -3, 3, { sector: 'А', style: 'tech' });
    D('d.stairsA', 'Дверь лестничной шахты А', 'stairsA', 'corrA', -80.15, 0, true, 'Standard', req(1));
    const qcell = beyond(qz, 'S', -66, -56.3, 5.9, 'cell128', 'Изолятор SCP-LF-128', 'Containment', -59, { style: 'research', scp: 'SCP-LF-128' }, 'Heavy', req(3, P.Medical | P.Containment));
    const c121 = beyond(arch, 'N', -70, -66.3, 5.6, 'cell121', 'Камера SCP-LF-121', 'Containment', -68, { style: 'admin', scp: 'SCP-LF-121' }, 'Security', req(3, P.Records | P.Containment));
    const c129 = beyond(arch, 'N', -66, -62.3, 5.6, 'cell129', 'Хранилище SCP-LF-129', 'Containment', -64, { style: 'admin', scp: 'SCP-LF-129' }, 'Security', req(3, P.Records | P.Containment));

    // ================================================================= LEVEL 3 · SECTOR C (research and containment)
    const liftB = R('liftB', 'Лифтовой узел Б-3', 'Lift', 26.3, 32, -3, 3, { sector: 'С', style: 'tech' });
    D('d.liftB', 'Проход к лифтам', 'liftB', 'corridor', 26.15, 0, true, 'Standard', req(1));
    const corrC = R('corrC', 'Коридор сектора С-3', 'Corridor', 32.3, 110, -2, 2, { sector: 'С', style: 'research' });
    for (let x = 36; x <= 106; x += 8) hubs(corrC, x, 0);
    Pz(corrC, 'pp.corrC_w', 'PatrolPoint', 45, -0.9, 90, 'Коридор С, запад'); Pz(corrC, 'pp.corrC_e', 'PatrolPoint', 95, 0.9, 270, 'Коридор С, восток'); Pz(corrC, 'panel.corrC', 'Panel', 62, 1.4, 0, 'Электрощиток коридора С');
    D('d.liftBC', 'Проход в сектор С', 'liftB', 'corrC', 32.15, 0, true, 'Security', req(1), 2.0);
    Pz(corrC, 'cp.C', 'Checkpoint', 33.7, -1.5, 270, 'Пост КПП «Восток»');
    // Containment block planner: observation room by the corridor, chamber behind it, window between, heavy door.
    const block = (side, x0, scp, name, o) => {
      o = o || {}; const w = 8, ob = along(o.corr || corrC, side, x0, x0 + w, 6, 'obs' + scp.slice(-3), 'Наблюдение ' + scp, 'Observation', x0 + 2.0, { style: 'research' }, 'Standard', req(2, P.Research | P.Security | P.Engineering));
      const depth = o.depth || 8; const chm = beyond(ob, side, x0, x0 + w, depth, 'cell' + scp.slice(-3), 'Камера ' + scp + (name ? ' «' + name + '»' : ''), 'Containment', x0 + w - 1.6, { style: o.style || 'heavy', scp, dark: !!o.dark, height: o.height || 3.4 }, 'Heavy', o.req || req(3, P.Containment));
      const n = side === 'N'; const wz = n ? ob.maxZ : ob.minZ;
      Pz(ob, ob.id + '.c1', 'Console', x0 + 2.6, n ? wz - 1.2 : wz + 1.2, n ? 0 : 180, 'Пульт наблюдения'); Pz(ob, ob.id + '.c2', 'Console', x0 + 4.4, n ? wz - 1.2 : wz + 1.2, n ? 0 : 180, 'Пульт наблюдения');
      ob.intercom = { x: x0 + 6.4, z: n ? wz - 0.12 : wz + 0.12, yaw: n ? 0 : 180 };
      const cz = (chm.minZ + chm.maxZ) / 2, cx = x0 + w / 2;
      Pz(chm, chm.id + '.center', 'Stand', cx, cz, 0, 'Центр камеры'); Pz(chm, chm.id + '.window', 'Window', x0 + 3.5, n ? chm.minZ + 1.1 : chm.maxZ - 1.1, n ? 180 : 0, 'У окна');
      Pz(chm, chm.id + '.w1', 'Stand', x0 + 1.3, n ? chm.maxZ - 1.3 : chm.minZ + 1.3, 0, 'Угол'); Pz(chm, chm.id + '.w2', 'Stand', x0 + w - 1.3, cz, 0, 'Стена');
      hubs(chm, cx, cz, x0 + 2.5, n ? chm.minZ + 1.6 : chm.maxZ - 1.6, x0 + w - 1.6, n ? chm.minZ + 1.0 : chm.maxZ - 1.0);
      ob.visibleRooms.push(chm.id); chm.visibleRooms.push(ob.id);
      f.windows.push({ a: ob.id, b: chm.id, min: x0 + 1.2, max: x0 + 5.6, y0: 1.0, y1: 2.3, scp });
      f.blocks[scp] = { obs: ob.id, cell: chm.id, side };
      return { ob, chm };
    };
    block('N', 32.6, 'SCP-LF-125', 'Бумажные существа', { style: 'research' });
    block('N', 40.9, 'SCP-LF-132', 'Световая сущность', { dark: true });
    block('N', 49.2, 'SCP-LF-124', 'Прогнозист', { style: 'research' });
    block('N', 57.5, 'SCP-LF-136', 'Пустое кресло', { style: 'research' });
    block('N', 65.8, 'SCP-LF-127', 'Отражение', {});
    block('N', 74.1, 'SCP-LF-133', 'Человек за плечом', {});
    block('N', 82.4, 'SCP-LF-138', 'Наблюдатель', { dark: true });
    const offC = along(corrC, 'N', 90.7, 100, 10, 'officesC', 'Исследовательские кабинеты', 'Office', 93, { style: 'research' }, 'Standard', req(2, P.Research | P.Command));
    row(offC, 'E', 'Desk', 1.6, 0.65, 'Рабочее место учёного'); row(offC, 'W', 'Desk', 1.6, 0.65, 'Рабочее место учёного'); Pz(offC, 'pp.officesC', 'PatrolPoint', 95.3, 3.5, 0, 'Кабинеты С');
    const labC = along(corrC, 'N', 100.3, 110, 10, 'labC', 'Научная лаборатория С', 'Laboratory', 103, { style: 'research' }, 'Standard', req(1, P.Research | P.Security));
    row(labC, 'N', 'Workbench', 1.8, 0.7, 'Лабораторный стол'); row(labC, 'E', 'Desk', 1.8, 0.65, 'Прибор'); Pz(labC, 'labC.console', 'Console', 100.9, 7.5, 270, 'Терминал экспериментов');
    const conf = beyond(offC, 'N', 90.7, 100, 6.4, 'cell126', 'Комната совещаний SCP-LF-126', 'Containment', 98.2, { style: 'admin', scp: 'SCP-LF-126' }, 'Security', req(3, P.Containment | P.Research));
    const pC = along(corrC, 'S', 32.6, 40.6, 8, 'postC', 'Пост безопасности «Восток»', 'SecurityPost', 36, null, 'Security', req(2, P.Security));
    row(pC, 'S', 'GuardPost', 1.8, 1.2, 'Пульт поста'); pC.terminal = { x: 40.3, z: -6.3, yaw: 90 }; Pz(pC, 'pp.postC', 'PatrolPoint', 34, -3.6, 0, 'Пост «Восток»');
    block('S', 40.9, 'SCP-LF-123', 'Телефон отсутствующих', { style: 'admin' });
    block('S', 49.2, 'SCP-LF-135', 'Знакомый голос', {});
    block('S', 57.5, 'SCP-LF-130', 'Камертон', { style: 'research' });
    block('S', 65.8, 'SCP-LF-134', 'Неправильный коридор', { depth: 10 });
    block('S', 74.1, 'SCP-LF-137', 'Последняя смена', { style: 'admin' });
    block('S', 82.4, 'SCP-LF-131', 'Застывшее время', { style: 'research' });
    const genC = along(corrC, 'S', 90.7, 100, 8, 'genC', 'Резервная генераторная', 'Generator', 95, { style: 'tech' }, 'Security', req(2, P.Engineering));
    Pz(genC, 'panel.genC', 'Panel', 91.3, -5, 270, 'Щит резервного генератора'); Pz(genC, 'genC.check', 'Workbench', 99.4, -5, 90, 'Пульт генератора'); hubs(genC, 92.5, -3.4, 98.4, -3.4, 92.5, -9.3, 98.4, -9.3); links(genC, 0, 1, 0, 2, 1, 3, 2, 3);
    const jan = along(corrC, 'S', 100.3, 104, 8, 'janitor', 'Подсобка уборщиков', 'Janitor', 102, { style: 'tech' }, 'Standard', req(1));
    Pz(jan, 'janitor.cart', 'Workbench', 103.4, -6, 90, 'Тележка');
    const lab2 = along(corrC, 'S', 104.3, 110, 8, 'lab2', 'Биолаборатория', 'Laboratory', 107, { style: 'research' }, 'Standard', req(1, P.Research | P.Medical));
    row(lab2, 'S', 'Workbench', 1.8, 0.7, 'Бокс'); Pz(lab2, 'lab2.console', 'Console', 109.4, -5, 90, 'Анализатор');
    const stairsC = R('stairsC', 'Лестничная шахта С', 'Stairs', 110.3, 116, -3, 3, { sector: 'С', style: 'tech' });
    D('d.stairsC', 'Дверь лестничной шахты С', 'stairsC', 'corrC', 110.15, 0, true, 'Standard', req(1));
    const liftOld = R('liftOld', 'Служебный лифт (SCP-LF-122)', 'Lift', 110.3, 116, 3.3, 9, { sector: 'С', style: 'tech', scp: 'SCP-LF-122' });
    D('d.liftOld', 'Дверь служебного лифта', 'liftOld', 'stairsC', 113, 3.15, false, 'Standard', req(2, P.Engineering | P.Research | P.Security | P.Logistics));

    // ================================================================= LEVEL 4 (technical level, D-2, heavy block, dock)
    const o4 = (s, st) => ({ level: 4, sector: s, style: st || 'tech' });
    const c4 = R('corr4', 'Технический тоннель уровня 4', 'Tunnel', -20, 110, -1.5, 1.5, o4('Т'));
    for (let x = -16; x <= 106; x += 9) hubs(c4, x, 0);
    Pz(c4, 'pp.corr4_w', 'PatrolPoint', -10, -0.6, 90, 'Тоннель, запад'); Pz(c4, 'pp.corr4_m', 'PatrolPoint', 40, 0.6, 270, 'Тоннель, центр'); Pz(c4, 'pp.corr4_e', 'PatrolPoint', 92, -0.6, 90, 'Тоннель, восток');
    Pz(c4, 'panel.corr4', 'Panel', 20, 1.0, 0, 'Электрощиток тоннеля');
    const c4w = R('corr4w', 'Западный тоннель уровня 4', 'Tunnel', -80, -20.3, -1.5, 1.5, o4('Т'));
    for (let x = -76; x <= -24; x += 9) hubs(c4w, x, 0);
    Pz(c4w, 'pp.corr4w', 'PatrolPoint', -50, 0.6, 90, 'Западный тоннель');
    D('d.c4w', 'Гермоперегородка тоннеля', 'corr4w', 'corr4', -20.15, 0, true, 'Security', req(1), 2.0);
    const liftB4 = R('liftB4', 'Лифтовой узел, уровень 4', 'Lift', 26.3, 32, 1.8, 7.8, o4('Т'));
    D('d.liftB4', 'Дверь лифтового узла', 'liftB4', 'corr4', 29.15, 1.65, false, 'Standard', req(1));
    transit('t.liftB', 'Лифт Б-3 ↔ уровень 4', 'liftB', 'liftB4', 'Lift', 9, req(1));
    const stairsA4 = R('stairsA4', 'Лестничная шахта А, уровень 4', 'Stairs', -86, -80.3, -3, 3, o4('Т'));
    D('d.stairsA4', 'Дверь лестничной шахты', 'stairsA4', 'corr4w', -80.15, 0, true, 'Standard', req(1));
    transit('t.stairsA', 'Лестница А', 'stairsA', 'stairsA4', 'Stairs', 14, req(1));
    const stairsC4 = R('stairsC4', 'Лестничная шахта С, уровень 4', 'Stairs', 110.3, 116, -3, 3, o4('Т'));
    D('d.stairsC4', 'Дверь лестничной шахты', 'stairsC4', 'corr4', 110.15, 0, true, 'Standard', req(1));
    transit('t.stairsC', 'Лестница С', 'stairsC', 'stairsC4', 'Stairs', 14, req(1));
    const liftOld4 = R('liftOld4', 'Служебный лифт, уровень 4', 'Lift', 110.3, 116, 3.3, 9, o4('Т'));
    D('d.liftOld4', 'Дверь служебного лифта', 'liftOld4', 'stairsC4', 113, 3.15, false, 'Standard', req(1));
    transit('t.liftOld', 'Служебный лифт', 'liftOld', 'liftOld4', 'Lift', 10, req(2, P.Engineering | P.Research | P.Security | P.Logistics));
    // D-2 sector
    const dh = R('dhall', 'Сектор D-2 — общий зал', 'DClassCommon', -18, 12, 1.8, 13.8, o4('D', 'dclass'));
    hubs(dh, -16, 3.2, -3, 3.2, 10, 3.2, -16, 12.4, -3, 12.4, 10, 12.4, -3, 7.8); links(dh, 0, 1, 1, 2, 3, 4, 4, 5, 0, 3, 2, 5, 1, 6, 6, 4);
    let dseat = 0; for (const tx of [-11, 4]) for (let k = -2; k <= 2; k++) { Pz(dh, 'dhall.s' + (++dseat), 'Seat', tx + k * 1.1, 7.1, 180, 'Скамья'); Pz(dh, 'dhall.s' + (++dseat), 'Seat', tx + k * 1.1, 8.6, 0, 'Скамья'); }
    row(dh, 'S', 'Workbench', 2.2, 0.7, 'Рабочий стол', [-3], null, 'dhall.work');
    Pz(dh, 'dhall.counter', 'FoodCounter', 11.4, 7.8, 90, 'Раздача пайков'); Pz(dh, 'pp.dhall', 'PatrolPoint', -14, 4.2, 0, 'Сектор D-2');
    D('d.dhall', 'Шлюз сектора D-2', 'dhall', 'corr4', -3, 1.65, false, 'Security', req(2, P.Security | P.DClassBlock | P.Medical | P.Ethics | P.Engineering));
    for (let i = 0; i < 8; i++) {
      const x0 = -18 + i * 3.75, x1 = x0 + 3.45, cell = R('dcell' + (i + 1), 'Камера D2-' + (i + 1), 'DClassCell', x0, x1, 14.1, 19.8, Object.assign(o4('D', 'dclass'), { height: 2.8 }));
      hubs(cell, x0 + 2.2, 15.2, x0 + 2.2, 18.2); Pz(cell, 'dcell' + (i + 1) + '.bunk', 'CellBunk', x0 + 0.75, 18.5, 0, 'Нары', { bunk: true });
      const cd = D('d.dcell' + (i + 1), 'Дверь камеры D2-' + (i + 1), 'dcell' + (i + 1), 'dhall', x0 + 2.2, 13.95, false, 'Cell', req(0, P.CellResident | P.DClassBlock | P.Security)); cd.curfewStart = Hm(22); cd.curfewEnd = Hm(6, 30);
    }
    const dsh = R('dshower', 'Душевые D-2', 'Shower', 12.3, 18, 1.8, 7.5, o4('D', 'dclass')); D('d.dshower', 'Дверь душевых', 'dshower', 'dhall', 12.15, 4.6, true, 'Standard', req(0, P.CellResident | P.DClassBlock | P.Security));
    const dtest = R('dtest', 'Испытательная камера D-2', 'TestChamber', 12.3, 18, 7.8, 13.8, o4('D', 'heavy')); D('d.dtest', 'Дверь испытательной камеры', 'dtest', 'dhall', 12.15, 10.8, true, 'Security', req(2, P.DClassBlock | P.Research | P.Security));
    Pz(dtest, 'dtest.spot', 'Stand', 15.6, 11, 90, 'Место испытуемого'); Pz(dtest, 'dtest.obs', 'Console', 13.2, 8.6, 180, 'Пульт испытаний');
    const pD = R('postD', 'Пост сектора D-2', 'SecurityPost', -28, -20.6, 1.8, 9, o4('D'));
    row(pD, 'N', 'GuardPost', 1.8, 1.0, 'Пульт поста'); pD.terminal = { x: -27.7, z: 5, yaw: 270 }; Pz(pD, 'pp.postD', 'PatrolPoint', -22, 3, 0, 'Пост D-2');
    D('d.postD', 'Дверь поста D-2', 'postD', 'corr4w', -24, 1.65, false, 'Security', req(2, P.Security)); D('d.postDh', 'Проход пост — зал D-2', 'postD', 'dhall', -18.15, 5, true, 'Security', req(2, P.Security | P.DClassBlock));
    const gm = R('genMain', 'Главная генераторная', 'Generator', 34, 56, 1.8, 16, o4('Т'));
    hubs(gm, 36, 3.5, 54, 3.5, 36, 14.5, 54, 14.5); links(gm, 0, 1, 0, 2, 1, 3, 2, 3);
    Pz(gm, 'panel.gen1', 'Panel', 34.6, 6, 270, 'Пульт главного генератора'); Pz(gm, 'panel.gen2', 'Panel', 34.6, 11, 270, 'Распределительный щит уровня 4'); Pz(gm, 'gen.check', 'Workbench', 55.4, 9, 90, 'Журнал генератора');
    D('d.genMain', 'Дверь главной генераторной', 'genMain', 'corr4', 45, 1.65, false, 'Security', req(2, P.Engineering));
    const hob = R('heavyObs4', 'Наблюдение тяжёлого блока', 'Observation', 58, 74, 1.8, 7.8, o4('Т', 'heavy'));
    Pz(hob, 'heavyObs4.c1', 'Console', 63, 6.6, 0, 'Пульт наблюдения'); Pz(hob, 'heavyObs4.c2', 'Console', 66, 6.6, 0, 'Пульт наблюдения'); hob.intercom = { x: 71, z: 7.68, yaw: 0 };
    D('d.heavyObs4', 'Шлюз тяжёлого блока', 'heavyObs4', 'corr4', 60, 1.65, false, 'Security', req(3, P.Containment | P.Security | P.Engineering));
    const hc = R('heavyCell4', 'Тяжёлая камера Т-1 (свободна)', 'Containment', 58, 74, 8.1, 20, o4('Т', 'heavy')); hc.vacant = true;
    Pz(hc, 'heavyCell4.center', 'Stand', 66, 14, 0, 'Центр камеры'); Pz(hc, 'heavyCell4.window', 'Window', 63, 9.2, 180, 'У окна'); Pz(hc, 'heavyCell4.w1', 'Stand', 59.5, 18.5, 0, 'Угол'); Pz(hc, 'heavyCell4.w2', 'Stand', 72.5, 14, 0, 'Стена');
    hubs(hc, 66, 14, 62, 10, 71, 10);
    const hc4 = D('d.heavyCell4', 'Гермодверь камеры Т-1', 'heavyCell4', 'heavyObs4', 72, 7.95, false, 'Heavy', req(3, P.Containment)); hc4.hasExit = true; hc4.exitFrom = 'heavyCell4'; hc4.exitReq = req(0);
    hob.visibleRooms.push(hc.id); hc.visibleRooms.push(hob.id); f.windows.push({ a: 'heavyObs4', b: 'heavyCell4', min: 61, max: 69, y0: 1.0, y1: 2.4, scp: null });
    const th = R('tempHold', 'Временная безопасная зона', 'TempHold', 76, 90, 1.8, 10, o4('Т', 'heavy')); th.vacant = true;
    Pz(th, 'tempHold.bay1', 'Stand', 79, 7, 0, 'Отсек 1'); Pz(th, 'tempHold.bay2', 'Stand', 86, 7, 0, 'Отсек 2'); Pz(th, 'tempHold.desk', 'Desk', 89.4, 3.5, 90, 'Пост приёмки');
    D('d.tempHold', 'Дверь временной зоны', 'tempHold', 'corr4', 80, 1.65, false, 'Security', req(3, P.Containment | P.Logistics | P.MTF));
    const pumps = R('pumps', 'Насосная', 'Pumps', 0, 18, -9.8, -1.8, o4('Т'));
    Pz(pumps, 'panel.pumps', 'Panel', 0.6, -6, 270, 'Щит насосной'); row(pumps, 'S', 'Workbench', 3.5, 0.7, 'Насосный агрегат'); D('d.pumps', 'Дверь насосной', 'pumps', 'corr4', 9, -1.65, false, 'Standard', req(2, P.Engineering));
    const ws = R('workshop', 'Мастерская механиков', 'Workshop', 34, 50, -9.8, -1.8, o4('Т'));
    row(ws, 'S', 'Workbench', 2.2, 0.7, 'Верстак'); D('d.workshop', 'Дверь мастерской', 'workshop', 'corr4', 42, -1.65, false, 'Standard', req(2, P.Engineering));
    const dock = R('arrivalDock', 'Приёмный шлюз', 'Dock', 92, 108, -9.8, -1.8, o4('Т', 'heavy'));
    Pz(dock, 'dock.bay', 'Stand', 100, -7, 0, 'Разгрузочная площадка'); Pz(dock, 'dock.desk', 'Desk', 92.6, -4, 270, 'Пост логиста');
    D('d.dock', 'Ворота приёмного шлюза', 'arrivalDock', 'corr4', 100, -1.65, false, 'Security', req(2, P.Logistics | P.MTF | P.Security | P.Containment), 2.4);
    const st4 = R('storage4', 'Склад уровня 4', 'Storage', -40, -28, -9.8, -1.8, o4('Т'));
    row(st4, 'S', 'Shelf', 1.6, 0.6, 'Стеллаж'); Pz(st4, 'storage4.suit', 'Hazmat', -39.4, -2.6, 90, 'Защитный костюм на стойке'); D('d.storage4', 'Дверь склада', 'storage4', 'corr4w', -34, -1.65, false, 'Standard', req(1, P.Logistics | P.Engineering | P.Security));
    const sh4 = R('shelter4', 'Аварийное убежище «Глубокое»', 'Shelter', -60, -46, -9.8, -1.8, o4('Т'));
    row(sh4, 'S', 'Seat', 1.0, 0.6, 'Скамья'); D('d.shelter4', 'Гермодверь убежища', 'shelter4', 'corr4w', -53, -1.65, false, 'Heavy', req(0));
    // Wing T-2: living anomalies (SCP-LF-139…146). Link from the level 4 tunnel, wing corridor, observation lab, 8 blocks.
    const lk = R('linkT2', 'Переход в крыло Т-2', 'Corridor', 59.5, 62.5, -9.9, -1.8, o4('Т-2', 'heavy'));
    hubs(lk, 61, -3, 61, -8.6);
    D('d.linkT2', 'Шлюз крыла Т-2', 'linkT2', 'corr4', 61, -1.65, false, 'Security', req(2, P.Research | P.Containment | P.Security | P.Engineering | P.Medical | P.MTF), 2.0);
    const cT2 = R('corrT2', 'Коридор крыла Т-2 (живые объекты)', 'Corridor', 20, 92, -14.3, -10.2, o4('Т-2', 'heavy'));
    for (let x = 22; x <= 90; x += 8.3) hubs(cT2, x, -12.25);
    D('d.corrT2', 'Дверь коридора Т-2', 'corrT2', 'linkT2', 61, -10.05, false, 'Standard', req(2, P.Research | P.Containment | P.Security | P.Engineering | P.Medical | P.MTF));
    Pz(cT2, 'pp.corrT2_w', 'PatrolPoint', 30, -11.2, 90, 'Крыло Т-2, запад'); Pz(cT2, 'pp.corrT2_e', 'PatrolPoint', 84, -13.3, 270, 'Крыло Т-2, восток'); Pz(cT2, 'panel.corrT2', 'Panel', 50, -10.6, 0, 'Электрощит крыла Т-2');
    const labT2 = R('labT2', 'Лаборатория наблюдения Т-2', 'Laboratory', 63, 76, -9.9, -2.1, o4('Т-2', 'research'));
    D('d.labT2', 'Дверь лаборатории Т-2', 'labT2', 'corrT2', 69.5, -10.05, false, 'Standard', req(2, P.Research | P.Containment | P.Medical));
    row(labT2, 'N', 'Desk', 2.2, 0.7, 'Рабочее место наблюдателя'); Pz(labT2, 'labT2.console', 'Console', 64, -6, 270, 'Сервер журналов движения'); Pz(labT2, 'labT2.bench', 'Workbench', 75, -6, 90, 'Стол анализа записей'); Pz(labT2, 'pp.labT2', 'PatrolPoint', 69.5, -8.8, 0, 'Лаборатория Т-2');
    const T2 = [['SCP-LF-139', 'Длинношеий', { height: 5.2, dark: true }], ['SCP-LF-140', 'Сидящий', { style: 'admin' }], ['SCP-LF-141', 'Ползун', { height: 3.8 }], ['SCP-LF-142', 'Лицевой подражатель', { style: 'research' }],
      ['SCP-LF-143', 'Существо у стекла', { dark: true }], ['SCP-LF-144', 'Забывающий двигаться', { style: 'research' }], ['SCP-LF-145', 'Тихая мать', { height: 4.2, depth: 10 }], ['SCP-LF-146', 'Обратный наблюдатель', {}]];
    T2.forEach(([scp, name, o], i) => block('S', 22 + i * 8.6, scp, name, Object.assign({ corr: cT2 }, o)));
    // ================================================================= LEVEL 3 · SOUTH (CRISIS update): transport gallery with a junction hall,
    // security sector, MTF sector, medical sector, services. A second east–west spine; three routes join it to the main
    // one (west stairs shaft, link B-3, the service passage of medpoint B), so key sectors can be reached two ways.
    const galW = R('galW', 'Транспортная галерея Ю-3 (запад)', 'Corridor', -86, -36.3, -24, -20, { sector: 'Ю', style: 'tech' });
    for (let x = -82; x <= -40; x += 7) hubs(galW, x, -22);
    const galHub = R('galHub', 'Развязка Ю-3', 'Corridor', -36, -24, -28, -16, { sector: 'Ю', style: 'tech' });
    hubs(galHub, -30, -22, -33.5, -18.5, -26.5, -18.5, -33.5, -25.5, -26.5, -25.5); links(galHub, 0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 3, 4, 1, 3, 2, 4);
    const galE = R('galE', 'Транспортная галерея Ю-3 (восток)', 'Corridor', -23.7, 25.7, -24, -20, { sector: 'Ю', style: 'tech' });
    for (let x = -20; x <= 22; x += 7) hubs(galE, x, -22);
    D('d.galW', 'Проход галереи (запад)', 'galW', 'galHub', -36.15, -22, true, 'Archway', req(0), 3.6);
    D('d.galE', 'Проход галереи (восток)', 'galHub', 'galE', -23.85, -22, true, 'Archway', req(0), 3.6);
    Pz(galW, 'pp.galW', 'PatrolPoint', -66, -21, 90, 'Галерея Ю, запад'); Pz(galHub, 'pp.galHub', 'PatrolPoint', -30, -17, 0, 'Развязка Ю-3'); Pz(galE, 'pp.galE', 'PatrolPoint', 4, -23, 270, 'Галерея Ю, восток');
    Pz(galW, 'panel.galW', 'Panel', -52, -20.4, 0, 'Электрощит галереи'); Pz(galE, 'panel.galE', 'Panel', 14, -20.4, 0, 'Электрощит галереи (восток)');
    // routes between the spines
    const linkW = R('linkW', 'Западный переход', 'Corridor', -86, -82.3, -19.7, -3.3, { sector: 'А', style: 'tech' }); hubs(linkW, -84.15, -17, -84.15, -11, -84.15, -5.5);
    D('d.linkWs', 'Дверь западного перехода (лестница)', 'linkW', 'stairsA', -84.15, -3.15, false, 'Standard', req(1));
    D('d.linkWg', 'Дверь западного перехода (галерея)', 'linkW', 'galW', -84.15, -19.85, false, 'Standard', req(1));
    const linkB = R('linkB', 'Переход Б-3 — галерея', 'Corridor', 20, 24, -19.7, -2.3, { sector: 'Б', style: 'tech' }); hubs(linkB, 22, -4.5, 22, -11, 22, -17.5);
    D('d.linkBn', 'Дверь перехода Б-3', 'linkB', 'corridor', 22, -2.15, false, 'Security', req(1), 2.0);
    D('d.linkBs', 'Дверь перехода в галерею', 'linkB', 'galE', 22, -19.85, false, 'Standard', req(1), 2.0);
    const medLink = R('medLink', 'Служебный проход медпункта Б', 'Corridor', -14.2, -11.8, -19.7, -10.6, { sector: 'Б', style: 'tech' }); hubs(medLink, -13, -12, -13, -18.3);
    D('d.medLinkN', 'Служебная дверь медпункта Б', 'medLink', 'med', -13, -10.45, false, 'Standard', req(1, P.Medical | P.Security | P.MTF | P.Engineering));
    D('d.medLinkS', 'Дверь служебного прохода (галерея)', 'medLink', 'galE', -13, -19.85, false, 'Standard', req(1, P.Medical | P.Security | P.MTF | P.Engineering));
    // vertical routes from the gallery: stairs Ю (west) and a freight lift (east)
    const stairsS = along(galW, 'N', -40.7, -36.6, 5.7, 'stairsS', 'Лестница Ю', 'Stairs', -38.65, { style: 'tech' }, 'Standard', req(1));
    const freightS = R('freightS', 'Грузовой лифт Ю-3', 'Lift', 26, 32, -25, -19, { sector: 'Ю', style: 'tech' });
    D('d.freightS', 'Ворота грузового лифта', 'freightS', 'galE', 25.85, -22, true, 'Standard', req(1, P.Logistics | P.Security | P.MTF | P.Engineering | P.Medical), 2.4);
    // SECURITY SECTOR (west part of the gallery)
    const secObs = along(galW, 'N', -82, -74, 8, 'secObs', 'Пункт видеонаблюдения охраны', 'Command', -78, { style: 'admin' }, 'Security', req(2, P.Security | P.Surveillance));
    row(secObs, 'N', 'Console', 1.5, 0.8, 'Монитор камер'); Pz(secObs, 'secObs.chief', 'Console', -74.6, -15, 90, 'Пульт старшего оператора');
    const ctrlPost = along(galW, 'N', -73.7, -66.6, 8, 'ctrlPost', 'Защищённый пост управления', 'SecurityPost', -70, { style: 'heavy' }, 'Heavy', req(2, P.Security | P.Command));
    row(ctrlPost, 'N', 'GuardPost', 1.8, 1.0, 'Пульт блокировок'); ctrlPost.terminal = { x: -67, z: -16, yaw: 90 }; Pz(ctrlPost, 'pp.ctrlPost', 'PatrolPoint', -72.5, -18.6, 0, 'Пост управления');
    const armory = along(galW, 'S', -86, -78, 8, 'armory', 'Оружейная охраны', 'Armory', -80, { style: 'heavy' }, 'Security', req(3, P.Armory));
    row(armory, 'S', 'WeaponRack', 1.2, 0.5, 'Оружейная пирамида'); row(armory, 'W', 'WeaponRack', 1.4, 0.5, 'Шкаф спецсредств'); Pz(armory, 'armory.desk', 'Desk', -78.6, -27, 90, 'Стол выдачи оружия');
    const guardPrep = along(galW, 'S', -77.7, -69, 8, 'guardPrep', 'Комната подготовки охраны', 'Locker', -73, null, 'Standard', req(1, P.Security | P.MTF));
    row(guardPrep, 'W', 'Seat', 1.3, 0.6, 'Скамья'); Pz(guardPrep, 'guardPrep.brief', 'Desk', -70, -30, 90, 'Стол инструктажа');
    const secCoord = along(galW, 'S', -68.7, -59, 8, 'secCoord', 'Координационный центр безопасности', 'Command', -64, { style: 'admin' }, 'Security', req(2, P.Security | P.Command));
    row(secCoord, 'S', 'Console', 1.6, 0.8, 'Пульт координации'); Pz(secCoord, 'secCoord.table', 'Desk', -63.8, -28, 0, 'Оперативный стол'); secCoord.terminal = { x: -59.3, z: -27, yaw: 90 };
    const detHall = along(galW, 'S', -58.7, -50, 6, 'detHall', 'Временное задержание: пост', 'SecurityPost', -54.3, null, 'Security', req(2, P.Security));
    Pz(detHall, 'detHall.desk', 'GuardPost', -51, -26, 90, 'Пост задержания');
    [[-58.7, -55.9], [-55.6, -52.8], [-52.5, -50]].forEach(([x0, x1], i) => {
      const c = beyond(detHall, 'S', x0, x1, 5.4, 'det' + (i + 1), 'Камера задержания ' + (i + 1), 'Detention', (x0 + x1) / 2, { style: 'dclass', height: 2.8 }, 'Cell', req(2, P.Security));
      Pz(c, c.id + '.bunk', 'CellBunk', x0 + 0.7, c.minZ + 1.0, 180, 'Нары'); hubs(c, (x0 + x1) / 2 + 0.3, c.maxZ - 1.0, (x0 + x1) / 2 + 0.3, c.minZ + 2.4);
    });
    // MTF SECTOR (around the junction hall)
    const mtfBar = along(galW, 'S', -49.7, -42, 9, 'mtfBarracks', 'Казармы МОГ «Ключ-9»', 'Barracks', -46, null, 'Security', req(2, P.MTF | P.Command));
    row(mtfBar, 'S', 'Bed', 1.25, 1.1, 'Двухъярусная койка', null, { bunk: true }); row(mtfBar, 'W', 'Seat', 1.6, 0.6, 'Табурет');
    const mtfEquip = along(galW, 'S', -41.7, -36.3, 9, 'mtfEquip', 'Снаряжение МОГ', 'Armory', -39, { style: 'heavy' }, 'Security', req(3, P.MTF | P.Armory));
    row(mtfEquip, 'E', 'WeaponRack', 1.3, 0.5, 'Стойка снаряжения'); Pz(mtfEquip, 'mtfEquip.bench', 'Workbench', -41.1, -28, 270, 'Стол подготовки снаряжения');
    const mtfHQ = beyond(galHub, 'S', -36, -30.3, 7.7, 'mtfHQ', 'Оперативный штаб МОГ', 'Command', -33, { style: 'admin' }, 'Security', req(3, P.MTF | P.Command));
    row(mtfHQ, 'S', 'Console', 1.5, 0.8, 'Пульт штаба'); Pz(mtfHQ, 'mtfHQ.map', 'Desk', -33.2, -31, 0, 'Стол с планом комплекса');
    const mtfPrep = beyond(galHub, 'S', -30, -24, 7.7, 'mtfPrep', 'Подготовка группы МОГ', 'MTF', -27, null, 'Security', req(3, P.MTF));
    row(mtfPrep, 'S', 'Seat', 1.2, 0.6, 'Скамья'); row(mtfPrep, 'E', 'WeaponRack', 1.4, 0.5, 'Шкаф снаряжения');
    const garage = R('mtfGarage', 'Транспортная зона МОГ', 'Garage', -49.7, -36.3, -46, -33.6, { sector: 'Ю', style: 'heavy', height: 4.2 });
    D('d.mtfGarage', 'Ворота транспортной зоны', 'mtfGarage', 'mtfEquip', -39, -33.45, false, 'Security', req(3, P.MTF | P.Logistics), 2.4);
    D('d.mtfGarageHQ', 'Дверь штаба в транспортную зону', 'mtfGarage', 'mtfHQ', -36.15, -35, true, 'Security', req(3, P.MTF));
    Pz(garage, 'garage.bay', 'Stand', -43, -40, 0, 'Стоянка транспорта'); Pz(garage, 'garage.desk', 'Desk', -49.1, -35, 270, 'Пост транспортной зоны'); hubs(garage, -43, -35.5, -38, -35.5, -38, -44, -48, -44);
    const mtfMed = along(galE, 'S', -23.4, -17, 8, 'mtfMed', 'Медпункт МОГ', 'MedicalBay', -20.2, null, 'Security', req(2, P.MTF | P.Medical));
    row(mtfMed, 'S', 'MedBed', 1.8, 1.1, 'Койка медпункта МОГ'); Pz(mtfMed, 'mtfMed.desk', 'Desk', -17.6, -27, 90, 'Стол полевого медика');
    const resPost = along(galE, 'N', -23.7, -18, 8, 'reservePost', 'Резервный пост охраны', 'SecurityPost', -20.8, null, 'Security', req(2, P.Security));
    row(resPost, 'N', 'GuardPost', 1.8, 1.0, 'Пульт резервного поста'); resPost.terminal = { x: -18.3, z: -15, yaw: 90 };
    // MEDICAL SECTOR (east part of the gallery)
    const opRoom = along(galE, 'S', -16.7, -10, 8, 'operating', 'Операционная', 'Operating', -13.3, { style: 'research' }, 'Security', req(2, P.Medical));
    Pz(opRoom, 'operating.table', 'MedBed', -13.3, -29, 0, 'Операционный стол'); Pz(opRoom, 'operating.inst', 'Workbench', -10.6, -27, 90, 'Инструментальный стол'); Pz(opRoom, 'operating.desk', 'Desk', -16.1, -27, 270, 'Анестезиологический пульт');
    const icu = along(galE, 'S', -9.7, -3, 8, 'icu', 'Реанимация', 'MedicalBay', -6.4, { style: 'research' }, 'Security', req(2, P.Medical));
    row(icu, 'S', 'MedBed', 2.2, 1.1, 'Реанимационная койка'); Pz(icu, 'icu.desk', 'Desk', -3.6, -26, 90, 'Пост реанимации');
    const qWard = beyond(icu, 'S', -9.7, -3, 6, 'quarWard', 'Карантинная палата', 'Quarantine', -6.4, { style: 'research' }, 'Security', req(2, P.Medical | P.Containment));
    Pz(qWard, 'quarWard.bed1', 'MedBed', -8.2, qWard.minZ + 1.4, 180, 'Изолированная койка'); Pz(qWard, 'quarWard.bed2', 'MedBed', -4.5, qWard.minZ + 1.4, 180, 'Изолированная койка'); Pz(qWard, 'quarWard.suit', 'Hazmat', -3.6, qWard.maxZ - 0.8, 90, 'Защитный костюм на стойке');
    const wards = along(galE, 'S', -2.7, 6, 8, 'wards', 'Палаты медсектора', 'MedicalBay', 1.6, null, 'Standard', req(1));
    row(wards, 'S', 'MedBed', 1.7, 1.1, 'Койка палаты'); row(wards, 'E', 'Seat', 1.6, 0.6, 'Стул посетителя');
    const medInv = along(galE, 'S', 6.3, 11, 8, 'medInv', 'Кабинет медицинских расследований', 'Office', 8.6, { style: 'admin' }, 'Security', req(2, P.Medical | P.Security | P.Records));
    Pz(medInv, 'medInv.desk1', 'Desk', 7.0, -27, 270, 'Стол судмедэксперта'); Pz(medInv, 'medInv.desk2', 'Desk', 10.4, -29, 90, 'Стол следователя'); row(medInv, 'S', 'Shelf', 1.5, 0.5, 'Шкаф с делами');
    const morgue = along(galE, 'S', 11.3, 19.7, 8, 'morgue', 'Морг', 'Morgue', 13.5, { style: 'research' }, 'Security', req(2, P.Medical | P.Security));
    Pz(morgue, 'morgue.slab1', 'Slab', 15.5, -28, 0, 'Секционный стол'); Pz(morgue, 'morgue.slab2', 'Slab', 15.5, -30.6, 0, 'Секционный стол'); Pz(morgue, 'morgue.desk', 'Desk', 19.1, -26, 90, 'Журнал морга');
    morgue.drawers = 12;
    // SERVICES on the north side of the gallery
    const staffRoom = along(galW, 'N', -56, -47, 8, 'staffRoom', 'Комната отдыха персонала', 'Lounge', -51.5, null, 'Standard', req(1));
    row(staffRoom, 'N', 'Seat', 1.3, 0.7, 'Кресло'); Pz(staffRoom, 'staffRoom.coffee', 'Workbench', -55.4, -15, 270, 'Кофемашина');
    const archS = along(galW, 'N', -46.7, -41, 8, 'archiveS', 'Архив галереи Ю', 'Archive', -43.8, { style: 'admin' }, 'Security', req(2, P.Records | P.Research | P.Security));
    row(archS, 'E', 'Shelf', 1.3, 0.6, 'Стеллаж с делами'); Pz(archS, 'archiveS.desk', 'Console', -46.1, -15.5, 270, 'Терминал архива');
    const engStore = along(galE, 'N', 8, 19.7, 8, 'engStore', 'Склад инженерной службы', 'Storage', 12, { style: 'tech' }, 'Standard', req(1, P.Engineering | P.Logistics | P.Security));
    row(engStore, 'N', 'Shelf', 1.6, 0.6, 'Стеллаж'); Pz(engStore, 'engStore.suit', 'Hazmat', 19.1, -15, 90, 'Защитный костюм на стойке');

    // ================================================================= LEVEL 4 additions: stairs Ю, freight lift, D-3 sector, SCP isolators С-4
    const stairsS4 = R('stairsS4', 'Лестница Ю, уровень 4', 'Stairs', -45.7, -40.3, -9.8, -1.8, o4('Т'));
    D('d.stairsS4', 'Дверь лестницы Ю', 'stairsS4', 'corr4w', -43, -1.65, false, 'Standard', req(1));
    transit('t.stairsS', 'Лестница Ю', 'stairsS', 'stairsS4', 'Stairs', 14, req(1));
    const freight4 = R('freight4', 'Грузовой лифт, уровень 4', 'Lift', -10, -4, -9.8, -1.8, o4('Т'));
    D('d.freight4', 'Ворота грузового лифта', 'freight4', 'corr4', -7, -1.65, false, 'Standard', req(1, P.Logistics | P.Security | P.MTF | P.Engineering | P.Medical), 2.4);
    transit('t.freight', 'Грузовой лифт Ю-3 ↔ уровень 4', 'freightS', 'freight4', 'Lift', 12, req(1, P.Logistics | P.Security | P.MTF | P.Engineering | P.Medical));
    // D-3: housing, common room, mess, showers, medical room, waiting room, test airlocks; a separate escort corridor to D-2
    const sluD3 = R('sluiceD3', 'Шлюз сектора D-3', 'Airlock', -50, -46, 1.8, 10.2, o4('D', 'dclass')); hubs(sluD3, -48, 3.5, -48, 8.5);
    D('d.sluiceD3', 'Шлюз сектора D-3 (тоннель)', 'sluiceD3', 'corr4w', -48, 1.65, false, 'Security', req(2, P.Security | P.DClassBlock | P.Medical | P.Ethics));
    const escD = R('escD', 'Коридор конвоирования D-3', 'Corridor', -80, -18.3, 10.5, 13.5, o4('D', 'dclass'));
    for (let x = -77; x <= -21; x += 7) hubs(escD, x, 12);
    D('d.sluiceD3n', 'Шлюз сектора D-3 (коридор)', 'sluiceD3', 'escD', -48, 10.35, false, 'Security', req(2, P.Security | P.DClassBlock | P.Medical | P.Ethics));
    D('d.escDh', 'Конвойный проход в сектор D-2', 'escD', 'dhall', -18.15, 12, true, 'Security', req(2, P.Security | P.DClassBlock));
    Pz(escD, 'pp.escD', 'PatrolPoint', -60, 11.2, 90, 'Коридор конвоирования D-3');
    for (let i = 0; i < 6; i++) {
      const x0 = -79.6 + i * 3.9, x1 = x0 + 3.6, cell = R('d3cell' + (i + 1), 'Камера D3-' + (i + 1), 'DClassCell', x0, x1, 13.8, 19.5, Object.assign(o4('D', 'dclass'), { height: 2.8 }));
      hubs(cell, x0 + 2.3, 14.9, x0 + 2.3, 18.2); Pz(cell, cell.id + '.bunk', 'CellBunk', x0 + 0.75, 18.4, 0, 'Нары', { bunk: true });
      const cd = D('d.d3cell' + (i + 1), 'Дверь камеры D3-' + (i + 1), cell.id, 'escD', x0 + 2.3, 13.65, false, 'Cell', req(0, P.CellResident | P.DClassBlock | P.Security)); cd.curfewStart = Hm(22); cd.curfewEnd = Hm(6, 30);
    }
    const d3c = R('d3common', 'Сектор D-3 — общая комната', 'DClassCommon', -56.2, -46, 13.8, 21.8, o4('D', 'dclass'));
    D('d.d3common', 'Дверь общей комнаты D-3', 'd3common', 'escD', -51, 13.65, false, 'Standard', req(0, P.CellResident | P.DClassBlock | P.Security));
    let s3 = 0; for (let k = -2; k <= 2; k++) { Pz(d3c, 'd3common.s' + (++s3), 'Seat', -51 + k * 1.1, 17.1, 180, 'Скамья'); Pz(d3c, 'd3common.s' + (++s3), 'Seat', -51 + k * 1.1, 18.6, 0, 'Скамья'); }
    row(d3c, 'N', 'Workbench', 2.2, 0.7, 'Рабочий стол', null, null, 'd3common.work'); Pz(d3c, 'pp.d3common', 'PatrolPoint', -55, 14.8, 0, 'Общая комната D-3');
    const d3m = R('d3mess', 'Столовая сектора D-3', 'DClassCommon', -45.7, -36, 13.8, 21.8, o4('D', 'dclass'));
    D('d.d3mess', 'Дверь столовой D-3', 'd3mess', 'escD', -41, 13.65, false, 'Standard', req(0, P.CellResident | P.DClassBlock | P.Security));
    Pz(d3m, 'd3mess.counter', 'FoodCounter', -40.85, 21.0, 0, 'Раздача пайков D-3'); let m3 = 0; for (const tx of [-43.5, -38.2]) for (let k = 0; k < 3; k++) Pz(d3m, 'd3mess.s' + (++m3), 'Seat', tx, 15.5 + k * 1.5, 90, 'Место');
    const d3sh = R('d3shower', 'Душевые D-3', 'Shower', -35.7, -30, 13.8, 19.5, o4('D', 'dclass')); D('d.d3shower', 'Дверь душевых D-3', 'd3shower', 'escD', -32.8, 13.65, false, 'Standard', req(0, P.CellResident | P.DClassBlock | P.Security));
    const d3med = R('d3medical', 'Медкабинет сектора D-3', 'MedicalBay', -79.6, -71, 1.8, 10.2, o4('D', 'dclass'));
    D('d.d3medical', 'Дверь медкабинета D-3', 'd3medical', 'escD', -75, 10.35, false, 'Standard', req(1, P.Medical | P.Security | P.DClassBlock));
    Pz(d3med, 'd3medical.bed1', 'MedBed', -78, 3, 180, 'Смотровая кушетка'); Pz(d3med, 'd3medical.bed2', 'MedBed', -75, 3, 180, 'Смотровая кушетка'); Pz(d3med, 'd3medical.desk', 'Desk', -71.6, 6, 90, 'Стол врача D-3');
    const d3w = R('d3wait', 'Комната ожидания испытаний', 'Waiting', -70.7, -62, 1.8, 10.2, o4('D', 'dclass'));
    D('d.d3wait', 'Дверь комнаты ожидания', 'd3wait', 'escD', -66, 10.35, false, 'Security', req(1, P.Security | P.DClassBlock | P.Research));
    row(d3w, 'S', 'Seat', 1.0, 0.6, 'Скамья ожидания'); Pz(d3w, 'd3wait.guard', 'GuardPost', -62.6, 8.6, 90, 'Пост конвоя');
    const lock3 = R('testLock3', 'Испытательный шлюз D-3/1', 'Airlock', -61.7, -56, 1.8, 10.2, o4('D', 'heavy')); hubs(lock3, -58.85, 8.2, -58.85, 4.2);
    D('d.testLock3', 'Вход в испытательный шлюз 1', 'testLock3', 'escD', -58.85, 10.35, false, 'Security', req(2, P.Security | P.Research | P.DClassBlock));
    const t3 = R('d3test', 'Испытательная камера D-3/1', 'TestChamber', -55.7, -50.3, 1.8, 10.2, o4('D', 'heavy'));
    D('d.d3test', 'Гермодверь испытательной камеры 1', 'd3test', 'testLock3', -55.85, 4.5, true, 'Security', req(2, P.Security | P.Research | P.DClassBlock));
    Pz(t3, 'd3test.spot', 'Stand', -53, 7, 0, 'Место испытуемого'); Pz(t3, 'd3test.obs', 'Console', -54.9, 2.6, 270, 'Пульт испытаний');
    const lock4 = R('testLock4', 'Испытательный шлюз D-3/2', 'Airlock', -45.7, -40.3, 1.8, 10.2, o4('D', 'heavy')); hubs(lock4, -43, 8.2, -43, 4.2);
    D('d.testLock4', 'Вход в испытательный шлюз 2', 'testLock4', 'escD', -43, 10.35, false, 'Security', req(2, P.Security | P.Research | P.DClassBlock));
    const t4 = R('d3test2', 'Испытательная камера D-3/2', 'TestChamber', -40, -29, 1.8, 10.2, o4('D', 'heavy'));
    D('d.d3test2', 'Гермодверь испытательной камеры 2', 'd3test2', 'testLock4', -40.15, 4.5, true, 'Security', req(2, P.Security | P.Research | P.DClassBlock));
    Pz(t4, 'd3test2.spot', 'Stand', -33, 6, 0, 'Место испытуемого'); Pz(t4, 'd3test2.obs', 'Console', -39.4, 2.6, 270, 'Пульт испытаний');
    // SCP isolators С-4: the wing T-2 corridor continues east to six new containment blocks, a control room and a temporary isolator
    const cS4 = R('corrS4', 'Коридор изоляторов С-4', 'Corridor', 92.3, 142, -14.3, -10.2, o4('С-4', 'heavy'));
    for (let x = 95; x <= 139; x += 7.3) hubs(cS4, x, -12.25);
    D('d.corrS4', 'Гермоперегородка Т-2 / С-4', 'corrT2', 'corrS4', 92.15, -12.25, true, 'Security', req(3, P.Containment | P.Security | P.Research | P.MTF), 2.4);
    Pz(cS4, 'pp.corrS4', 'PatrolPoint', 118, -11.2, 90, 'Изоляторы С-4');
    const ctrlS4 = along(cS4, 'N', 130, 142, 7.9, 'ctrlS4', 'Пульт управления изоляторами С-4', 'Command', 134, { style: 'heavy' }, 'Security', req(3, P.Containment | P.Security));
    row(ctrlS4, 'N', 'Console', 1.6, 0.8, 'Пульт изолятора'); ctrlS4.terminal = { x: 141.6, z: -6, yaw: 90 };
    const isoS4 = along(cS4, 'N', 117, 129.7, 7.9, 'isoS4', 'Временный изолятор С-4', 'TempHold', 123, { style: 'heavy' }, 'Security', req(3, P.Containment | P.MTF)); isoS4.vacant = true;
    Pz(isoS4, 'isoS4.bay', 'Stand', 123, -5.5, 0, 'Изоляционный отсек'); Pz(isoS4, 'isoS4.desk', 'Desk', 129.1, -9, 90, 'Пост приёмки');
    // special access lift to level −9
    const liftS4 = R('liftS4', 'Спецлифт уровня 4', 'Lift', 92, 98, 1.8, 7.8, o4('Т', 'heavy'));
    D('d.liftS4', 'Дверь спецлифта', 'liftS4', 'corr4', 95, 1.65, false, 'Security', req(4, P.Containment | P.Command | P.MTF));

    // ================================================================= LEVEL −9: zone of special containment (access L4)
    const o9 = (st) => ({ level: 9, floorY: -14, sector: '−9', style: st || 'heavy' });
    const liftS9 = R('liftS9', 'Спецлифт, уровень −9', 'Lift', 92, 98, 2.3, 8.3, o9());
    transit('t.liftS', 'Спецлифт: уровень 4 ↔ уровень −9', 'liftS4', 'liftS9', 'Lift', 16, req(4, P.Containment | P.Command | P.MTF));
    const c9 = R('corr9', 'Коридор зоны особого содержания (−9)', 'Corridor', 68, 122, -2, 2, o9());
    for (let x = 71; x <= 119; x += 8) hubs(c9, x, 0);
    D('d.liftS9', 'Дверь спецлифта (−9)', 'liftS9', 'corr9', 95, 2.15, false, 'Security', req(4, P.Containment | P.Command | P.MTF));
    Pz(c9, 'pp.corr9', 'PatrolPoint', 100, -0.9, 90, 'Уровень −9'); Pz(c9, 'panel.corr9', 'Panel', 110, 1.4, 0, 'Щит уровня −9');
    const ctrl9 = along(c9, 'N', 98.3, 108, 8, 'ctrl9', 'Пост управления уровня −9', 'SecurityPost', 102, null, 'Heavy', req(4, P.Containment | P.Security));
    row(ctrl9, 'N', 'GuardPost', 1.8, 1.0, 'Пульт особого содержания'); ctrl9.terminal = { x: 107.6, z: 6, yaw: 90 }; Pz(ctrl9, 'pp.ctrl9', 'PatrolPoint', 100, 3.4, 0, 'Пост −9');
    const lab9 = along(c9, 'N', 108.3, 122, 8, 'lab9', 'Лаборатория особого содержания', 'Laboratory', 112, { style: 'research' }, 'Security', req(4, P.Containment | P.Research));
    row(lab9, 'N', 'Workbench', 2.0, 0.7, 'Лабораторный стол'); Pz(lab9, 'lab9.console', 'Console', 121.4, 5, 90, 'Терминал особого содержания');
    // observation gallery over two large cells
    const gal9 = along(c9, 'N', 68, 91.7, 5, 'obsGal9', 'Галерея наблюдения −9', 'Observation', 80, { style: 'research' }, 'Security', req(4, P.Containment | P.Research | P.Security));
    Pz(gal9, 'obsGal9.c1', 'Console', 73, 6.4, 0, 'Пульт наблюдения'); Pz(gal9, 'obsGal9.c2', 'Console', 85.5, 6.4, 0, 'Пульт наблюдения'); gal9.intercom = { x: 79.5, z: 7.18, yaw: 0 };
    const bigCell = (id, scp, name, x0, x1) => {
      const c = R(id, 'Большая камера ' + scp + ' «' + name + '»', 'Containment', x0, x1, 7.6, 21.6, Object.assign(o9(), { height: 5.5, scp, vacant: true }));
      const cx = (x0 + x1) / 2; hubs(c, cx, 14.6, x0 + 2.4, 9.4, x1 - 2.4, 9.4, x0 + 2.4, 19.8, x1 - 2.4, 19.8);
      Pz(c, id + '.center', 'Stand', cx, 14.6, 0, 'Центр камеры'); Pz(c, id + '.window', 'Window', cx - 1.5, 8.7, 180, 'У стекла галереи'); Pz(c, id + '.w1', 'Stand', x0 + 1.3, 20.3, 0, 'Угол'); Pz(c, id + '.w2', 'Stand', x1 - 1.3, 14.6, 0, 'Стена');
      const d = D('d.' + id, 'Гермодверь большой камеры ' + scp, id, 'obsGal9', x1 - 1.6, 7.45, false, 'Heavy', req(4, P.Containment, true)); d.hasExit = true; d.exitFrom = id; d.exitReq = req(4, P.Containment);
      gal9.visibleRooms.push(id); c.visibleRooms.push(gal9.id);
      f.windows.push({ a: gal9.id, b: id, min: x0 + 1.4, max: x1 - 3.4, y0: 1.0, y1: 2.6, scp });
      f.blocks[scp] = { obs: gal9.id, cell: id, side: 'N' };
      return c;
    };
    bigCell('bigCell9a', 'SCP-LF-151', 'Рой', 68, 79.7);
    bigCell('bigCell9b', 'SCP-LF-156', 'Слепой зверь', 80, 91.7);
    // four special blocks on the south side (cells deeper than usual)
    [['SCP-LF-147', 'Пустотник'], ['SCP-LF-150', 'Чёрный узник'], ['SCP-LF-155', 'Голодная тень'], ['SCP-LF-158', 'Последний свидетель']].forEach(([scp, name], i) => {
      const b = block('S', 68.3 + i * 8.3, scp, name, { corr: c9, depth: 9, dark: scp === 'SCP-LF-155' }); b.chm.vacant = true;
    });
    // six blocks of the С-4 isolators
    [['SCP-LF-148', 'Костяной сторож'], ['SCP-LF-149', 'Смотрящий'], ['SCP-LF-152', 'Ложный охранник'], ['SCP-LF-153', 'Собиратель'], ['SCP-LF-154', 'Тонкий', { height: 4.6 }], ['SCP-LF-157', 'Ночной пациент', { style: 'research' }]].forEach(([scp, name, o], i) => {
      const b = block('S', 92.6 + i * 8.3, scp, name, Object.assign({ corr: cS4 }, o || {})); b.chm.vacant = true;
    });
    // Anomalous: the floor that does not exist (reachable only through SCP-LF-122).
    const nf = R('nullfloor', 'Этаж «—»', 'NullFloor', 120, 140, 20, 26, { level: 3.5, floorY: -3.5, height: 2.9, sector: '?', style: 'null' });
    hubs(nf, 123, 23, 130, 23, 137, 23); Pz(nf, 'nullfloor.end', 'Stand', 138, 23, 90, 'Тупик');
    transit('t.lf122', 'Служебный лифт → этаж «—»', 'liftOld', 'nullfloor', 'Lift', 12, req(0)); f.doors['t.lf122'].outOfService = true; f.doors['t.lf122'].anomalous = true;

    for (const r of f.roomList) autoHubs(r);
    f.buildNavigation();
    return f;
  }

  S.Map = { build, L4Y, L9Y: -14 };
})(typeof window !== 'undefined' ? window : globalThis);
