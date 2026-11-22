/* SCP LIFE 2.0 — facility layout: level 3 (sectors A, B, C) and level 4 (technical, D-2, heavy block, dock). */
(function (root) {
  'use strict';
  const S = root.SCP, { V, Hm, P, req, Room, Door, Facility } = S;
  const L4Y = -7;

  function build() {
    const f = new Facility(); f.windows = []; f.blocks = {};
    const R = (id, name, type, x0, x1, z0, z1, o) => { o = o || {}; const lvl = o.level || 3; return f.addRoom(new Room(Object.assign({ id, name, type, minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: lvl === 4 ? 3.5 : 3.2, level: lvl, floorY: lvl === 4 ? L4Y : (o.floorY || 0) }, o))); };
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
      const r = R(id, name, type, x0, x1, z0, z1, Object.assign({ level: corr.level, sector: corr.sector, style: corr.style }, o));
      D('d.' + id, (o && o.doorName) || ('Дверь: ' + name.toLowerCase()), id, corr.id, doorX == null ? (x0 + x1) / 2 : doorX, side === 'N' ? corr.maxZ + 0.15 : corr.minZ - 0.15, false, dk || 'Standard', dr || req(1));
      return r;
    };
    const beyond = (base, side, x0, x1, depth, id, name, type, doorX, o, dk, dr) => {
      const z0 = side === 'N' ? base.maxZ + 0.3 : base.minZ - 0.3 - depth, z1 = side === 'N' ? base.maxZ + 0.3 + depth : base.minZ - 0.3;
      const r = R(id, name, type, x0, x1, z0, z1, Object.assign({ level: base.level, sector: base.sector, style: base.style }, o));
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
    // Containment block planner: observation room by the corridor, chamber behind it, window between, heavy door.
    const block = (side, x0, scp, name, o) => {
      o = o || {}; const w = 8, ob = along(corrC, side, x0, x0 + w, 6, 'obs' + scp.slice(-3), 'Наблюдение ' + scp, 'Observation', x0 + 2.0, { style: 'research' }, 'Standard', req(2, P.Research | P.Security | P.Engineering));
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
    // Anomalous: the floor that does not exist (reachable only through SCP-LF-122).
    const nf = R('nullfloor', 'Этаж «—»', 'NullFloor', 120, 140, 20, 26, { level: 3.5, floorY: -3.5, height: 2.9, sector: '?', style: 'null' });
    hubs(nf, 123, 23, 130, 23, 137, 23); Pz(nf, 'nullfloor.end', 'Stand', 138, 23, 90, 'Тупик');
    transit('t.lf122', 'Служебный лифт → этаж «—»', 'liftOld', 'nullfloor', 'Lift', 12, req(0)); f.doors['t.lf122'].outOfService = true; f.doors['t.lf122'].anomalous = true;

    for (const r of f.roomList) autoHubs(r);
    f.buildNavigation();
    return f;
  }

  S.Map = { build, L4Y };
})(typeof window !== 'undefined' ? window : globalThis);
