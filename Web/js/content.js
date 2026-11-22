/* SCP LIFE — stage 1 content: sector B-3 layout, staff, cameras, SCP-L-001 (port of Stage1Content.cs). */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, Hm, L, P, req, Room, Door, Facility, Npc, World, Tallyman } = S;
  const START = 7 * 60 + 30;
  const ROUTE_A = ['pp.post', 'pp.corr_w', 'pp.dorm', 'pp.canteen', 'pp.lab', 'pp.obs', 'pp.corr_e', 'pp.eng', 'pp.dblock', 'pp.med'];
  const ROUTE_B = ['pp.med', 'pp.dblock', 'pp.eng', 'pp.corr_e', 'pp.obs', 'pp.lab', 'pp.canteen', 'pp.dorm', 'pp.corr_w', 'pp.post'];
  const MAINT = ['panel.eng1', 'panel.corr', 'panel.lab', 'panel.obs', 'panel.canteen', 'panel.dblock', 'panel.eng2'];

  function buildFacility() {
    const f = new Facility();
    const R = (id, name, type, x0, x1, z0, z1, h) => f.addRoom(new Room({ id, name, type, minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: h || 3.2 }));
    const Pz = (room, id, type, x, z, yaw, label, owner) => { const p = { id, type, roomId: room.id, pos: V.v(x, 0, z), yaw, label, owner: owner || null, reservedBy: null, node: -1 }; room.pois.push(p); return p; };
    const hubs = (room, ...xz) => { for (let i = 0; i + 1 < xz.length; i += 2) room.hubPoints.push(V.v(xz[i], 0, xz[i + 1])); };
    const links = (room, ...p) => { for (let i = 0; i + 1 < p.length; i += 2) room.hubEdges.push([p[i], p[i + 1]]); };
    const D = (id, name, a, b, x, z, alongX, kind, rq, width) => {
      const d = new Door({ id, name, roomA: a, roomB: b, pos: V.v(x, 0, z), alongX, kind, req: rq, width: width || 1.6 });
      if (kind === 'Heavy') { d.openSeconds = 3; d.autoClose = 6; d.width = 2.2; d.height = 3; }
      if (kind === 'Security') d.openSeconds = 1.4;
      if (kind === 'Cell') { d.openSeconds = 1.2; d.width = 1.2; }
      if (kind === 'Archway') d.openness = 1;
      return f.addDoor(d);
    };

    const corr = R('corridor', 'Коридор сектора Б-3', 'Corridor', -26, 26, -2, 2);
    hubs(corr, -24, 0, -16, 0, -8, 0, 0, 0, 8, 0, 16, 0, 24, 0);
    Pz(corr, 'pp.corr_w', 'PatrolPoint', -12, -0.9, 90, 'Коридор, запад');
    Pz(corr, 'pp.corr_e', 'PatrolPoint', 21, 0.9, 270, 'Коридор, восток');
    Pz(corr, 'panel.corr', 'Panel', 4, 1.4, 0, 'Электрощиток коридора');

    const dorm = R('dorm', 'Жилой блок персонала', 'Dormitory', -26, -15.3, 2.3, 12.3);
    hubs(dorm, -20.6, 3.8, -20.6, 7.3, -20.6, 10.8);
    [4.3, 6.6, 8.9, 11.2].forEach((z, i) => { Pz(dorm, 'dorm.bed' + (i + 1), 'Bed', -24.6, z, 270, 'Койка ' + (i + 1)); Pz(dorm, 'dorm.bed' + (i + 5), 'Bed', -16.7, z, 90, 'Койка ' + (i + 5)); });
    Pz(dorm, 'dorm.seat1', 'Seat', -21.8, 11.6, 180, 'Кресло'); Pz(dorm, 'dorm.seat2', 'Seat', -19.4, 11.6, 180, 'Кресло');
    Pz(dorm, 'pp.dorm', 'PatrolPoint', -20.6, 5.5, 0, 'Жилой блок');

    const can = R('canteen', 'Столовая', 'Canteen', -15, -3.3, 2.3, 12.3);
    hubs(can, -9.2, 3.6, -9.2, 7.0, -9.2, 10.2);
    Pz(can, 'canteen.counter', 'FoodCounter', -9.2, 10.7, 0, 'Раздача');
    let seat = 0;
    for (const tx of [-12.6, -5.8]) for (const tz of [5.5, 8.5]) {
      Pz(can, 'canteen.seat' + (++seat), 'Seat', tx - 0.6, tz - 0.85, 0, 'Место'); Pz(can, 'canteen.seat' + (++seat), 'Seat', tx + 0.6, tz - 0.85, 0, 'Место');
      Pz(can, 'canteen.seat' + (++seat), 'Seat', tx - 0.6, tz + 0.85, 180, 'Место'); Pz(can, 'canteen.seat' + (++seat), 'Seat', tx + 0.6, tz + 0.85, 180, 'Место');
    }
    Pz(can, 'pp.canteen', 'PatrolPoint', -8.4, 8.6, 0, 'Столовая'); Pz(can, 'panel.canteen', 'Panel', -14.4, 3.1, 270, 'Щиток столовой');

    const lab = R('lab', 'Лаборатория исследований', 'Laboratory', -3, 9.7, 2.3, 12.3);
    hubs(lab, 0.6, 4.4, 6.1, 4.4, 0.6, 10.6, 6.1, 10.6); links(lab, 0, 1, 0, 2, 1, 3, 2, 3);
    [4.8, 7.3, 9.8].forEach((z, i) => { Pz(lab, 'lab.deskW' + (i + 1), 'Desk', -1.6, z, 270, 'Рабочее место'); Pz(lab, 'lab.deskE' + (i + 1), 'Desk', 8.3, z, 90, 'Рабочее место'); });
    Pz(lab, 'lab.bench1', 'Workbench', 3.35, 6.4, 0, 'Лабораторный стол'); Pz(lab, 'lab.bench2', 'Workbench', 3.35, 9.2, 180, 'Лабораторный стол');
    Pz(lab, 'lab.console', 'Console', 3.35, 11.3, 0, 'Терминал лаборатории'); Pz(lab, 'pp.lab', 'PatrolPoint', 3.3, 3.4, 0, 'Лаборатория'); Pz(lab, 'panel.lab', 'Panel', 9.1, 3.1, 90, 'Щиток лаборатории');

    const obs = R('obs', 'Наблюдательный пункт SCP-L-001', 'Observation', 10, 16.7, 2.3, 8.3);
    hubs(obs, 13.35, 3.8, 13.35, 5.8);
    Pz(obs, 'obs.console1', 'Console', 12.4, 7.0, 0, 'Пульт наблюдения'); Pz(obs, 'obs.console2', 'Console', 14.3, 7.0, 0, 'Пульт наблюдения');
    Pz(obs, 'pp.obs', 'PatrolPoint', 11.2, 3.6, 0, 'Наблюдательный пункт'); Pz(obs, 'panel.obs', 'Panel', 16.1, 3.1, 90, 'Щиток наблюдательного пункта');

    const air = R('airlock', 'Шлюз камеры содержания', 'Airlock', 17, 22, 2.3, 8.3);
    hubs(air, 19.5, 4.2, 19.5, 6.6); Pz(air, 'airlock.panel', 'Panel', 21.3, 7.2, 90, 'Контроллер замка гермодвери');

    const ch = R('chamber', 'Камера содержания SCP-L-001', 'Containment', 10, 22, 8.6, 18.6, 4.5);
    hubs(ch, 16, 11, 16, 15.8, 12.6, 13.5, 19.4, 13.5);
    Pz(ch, 'l001.center', 'Stand', 16, 13.6, 0, 'Центр камеры'); Pz(ch, 'l001.cornerNW', 'Stand', 11.3, 17.3, 315, 'Северо-западная стена');
    Pz(ch, 'l001.cornerNE', 'Stand', 20.7, 17.3, 45, 'Северо-восточная стена'); Pz(ch, 'l001.wallW', 'Stand', 11.3, 12.5, 270, 'Западная стена');
    Pz(ch, 'l001.wallE', 'Stand', 20.7, 13.5, 90, 'Восточная стена'); Pz(ch, 'l001.window', 'Window', 13.35, 9.6, 180, 'У окна наблюдения');
    Pz(ch, 'chamber.sensor1', 'Terminal', 18.4, 10.6, 0, 'Датчики камеры'); Pz(ch, 'chamber.sensor2', 'Terminal', 20.5, 10.6, 0, 'Датчики камеры');
    ch.visibleRooms.push('obs'); obs.visibleRooms.push('chamber');

    const post = R('post', 'КПП охраны', 'SecurityPost', -26, -17.3, -10.3, -2.3);
    hubs(post, -21.6, -3.9, -21.6, -7.2);
    Pz(post, 'post.console1', 'GuardPost', -23.0, -8.8, 180, 'Пульт видеонаблюдения'); Pz(post, 'post.console2', 'GuardPost', -20.5, -8.8, 180, 'Пульт видеонаблюдения');
    Pz(post, 'pp.post', 'PatrolPoint', -19.2, -4.0, 0, 'КПП');

    const med = R('med', 'Медпункт', 'MedicalBay', -17, -9.3, -10.3, -2.3);
    hubs(med, -13.15, -3.9, -13.15, -6.8);
    Pz(med, 'med.bed1', 'MedBed', -15.6, -9.2, 180, 'Койка медпункта'); Pz(med, 'med.bed2', 'MedBed', -12.4, -9.2, 180, 'Койка медпункта');
    Pz(med, 'med.desk', 'Desk', -10.7, -5.3, 90, 'Стол фельдшера'); Pz(med, 'pp.med', 'PatrolPoint', -15.5, -3.8, 0, 'Медпункт');

    const db = R('dblock', 'Блок класса D — общий зал', 'DClassCommon', -9, 7.7, -10.3, -2.3);
    hubs(db, -7.6, -3.5, -0.6, -3.5, 6.3, -3.5, -0.6, -6.3, -7.6, -9.0, -0.6, -9.0, 6.3, -9.0); links(db, 0, 1, 1, 2, 4, 5, 5, 6, 1, 3, 3, 5, 0, 4, 2, 6);
    let ds = 0;
    for (const tx of [-4.5, 3.2]) for (let k = -1; k <= 1; k++) { Pz(db, 'dblock.seat' + (++ds), 'Seat', tx + k * 1.2, -5.45, 180, 'Скамья'); Pz(db, 'dblock.seat' + (++ds), 'Seat', tx + k * 1.2, -7.15, 0, 'Скамья'); }
    Pz(db, 'dblock.work1', 'Workbench', -8.3, -4.5, 270, 'Сортировочный стол'); Pz(db, 'dblock.work2', 'Workbench', -8.3, -7.8, 270, 'Сортировочный стол');
    Pz(db, 'dblock.work3', 'Workbench', 7.0, -4.5, 90, 'Стиральная машина'); Pz(db, 'dblock.work4', 'Workbench', 7.0, -7.8, 90, 'Стиральная машина');
    Pz(db, 'pp.dblock', 'PatrolPoint', -2.6, -3.4, 0, 'Блок D'); Pz(db, 'panel.dblock', 'Panel', 2.0, -2.9, 0, 'Щиток блока D');

    const dIds = ['d.9341', 'd.7720', 'd.4108', 'd.5512'];
    for (let i = 0; i < 4; i++) {
      const cx = -7.15 + 4 * i, cell = R('cell' + (i + 1), 'Камера D-' + (i + 1), 'DClassCell', cx - 1.85, cx + 1.85, -16.6, -10.6, 2.8);
      hubs(cell, cx + 0.3, -11.8, cx + 0.3, -14.6); Pz(cell, 'cell' + (i + 1) + '.bunk', 'CellBunk', cx - 1.3, -15.4, 180, 'Нары', dIds[i]);
    }
    const eng = R('eng', 'Инженерный блок', 'Engineering', 8, 18.7, -10.3, -2.3);
    hubs(eng, 10.0, -3.8, 16.7, -3.8, 10.0, -9.4, 16.7, -9.4); links(eng, 0, 1, 0, 2, 1, 3, 2, 3);
    Pz(eng, 'panel.eng1', 'Panel', 8.7, -4.8, 270, 'Главный распределительный щит'); Pz(eng, 'panel.eng2', 'Panel', 8.7, -7.8, 270, 'Щит резервного питания');
    Pz(eng, 'eng.bench', 'Workbench', 18.0, -5.5, 90, 'Верстак'); Pz(eng, 'pp.eng', 'PatrolPoint', 11.0, -3.5, 0, 'Инженерный блок');

    D('d.post', 'Дверь КПП', 'post', 'corridor', -21.5, -2.15, false, 'Security', req(2, P.Security));
    D('d.med', 'Дверь медпункта', 'med', 'corridor', -13.2, -2.15, false, 'Standard', req(1));
    D('d.dblock', 'Шлюз блока D', 'dblock', 'corridor', -0.6, -2.15, false, 'Security', req(2, P.Security | P.DClassBlock | P.Engineering));
    for (let i = 0; i < 4; i++) {
      const cd = D('d.cell' + (i + 1), 'Дверь камеры D-' + (i + 1), 'cell' + (i + 1), 'dblock', -7.15 + 4 * i, -10.45, false, 'Cell', req(0, P.CellResident | P.DClassBlock | P.Security));
      cd.curfewStart = Hm(22); cd.curfewEnd = Hm(6, 30);
    }
    D('d.eng', 'Дверь инженерного блока', 'eng', 'corridor', 13.3, -2.15, false, 'Standard', req(2, P.Engineering | P.Security));
    D('d.dorm', 'Дверь жилого блока', 'dorm', 'corridor', -20.5, 2.15, false, 'Standard', req(1));
    D('d.canteen', 'Проём столовой', 'canteen', 'corridor', -9.2, 2.15, false, 'Archway', req(0), 2.4);
    D('d.lab', 'Дверь лаборатории', 'lab', 'corridor', 3.3, 2.15, false, 'Standard', req(2, P.Research | P.Security | P.Engineering));
    D('d.obs', 'Дверь наблюдательного пункта', 'obs', 'corridor', 13.3, 2.15, false, 'Standard', req(2, P.Research | P.Security | P.Engineering));
    D('d.airlock', 'Шлюз зоны содержания', 'airlock', 'corridor', 19.5, 2.15, false, 'Security', req(3, P.Containment | P.Research));
    const heavy = D('d.chamber', 'Гермодверь камеры SCP-L-001', 'chamber', 'airlock', 19.5, 8.45, false, 'Heavy', req(3, P.Containment, true));
    heavy.hasExit = true; heavy.exitFrom = 'chamber'; heavy.exitReq = req(3, P.Containment);
    f.buildNavigation();
    return f;
  }

  function addCameras(w) {
    const C = (id, name, room, x, y, z, yaw, range, fov, sweep) => {
      const n = w.cams.length;
      w.cams.push({ id, name, roomId: room, pos: V.v(x, y, z), baseYaw: yaw, yaw, pitch: 25, fov: fov || 75, range, sweep: sweep == null ? 25 : sweep, period: 12 + n * 1.7, phase: n * 0.13, operational: true, visible: [] });
    };
    C('cam01', 'К-01 Коридор, запад', 'corridor', -25.5, 2.9, 1.6, 90, 28, 60, 12);
    C('cam02', 'К-02 Коридор, восток', 'corridor', 25.5, 2.9, -1.6, 270, 28, 60, 12);
    C('cam03', 'К-03 КПП', 'post', -17.8, 2.9, -2.8, 225, 12);
    C('cam04', 'К-04 Блок D', 'dblock', 7.2, 2.9, -2.8, 240, 18, 85, 25);
    C('cam05', 'К-05 Лаборатория', 'lab', 9.2, 2.9, 11.8, 225, 16);
    C('cam06', 'К-06 Камера SCP-L-001', 'chamber', 10.5, 4.2, 18.1, 135, 18, 85, 20);
    C('cam07', 'К-07 Шлюз', 'airlock', 21.5, 2.9, 2.8, 315, 8, 80, 20);
    C('cam08', 'К-08 Столовая', 'canteen', -3.8, 2.9, 11.8, 225, 16);
    C('cam09', 'К-09 Инженерный блок', 'eng', 18.2, 2.9, -2.8, 225, 14);
  }

  function person(w, id, first, last, female, role, title, level, perms, bed, work, br, so, di, te, cu, protocol) {
    const n = new Npc({ id, first, last, female, role, title, callsign: role === 'DClass' ? last : null, bedPoi: bed, workRoom: work, protocol, colorVariant: 0, traits: { bravery: br, sociability: so, diligence: di, temper: te, curiosity: cu } });
    const card = { id: 'card.' + id, owner: id, ownerName: role === 'DClass' ? last : title + ' ' + last, level, perms, revoked: false, holder: id, room: null, pos: V.v(0, 0, 0), tempLevel: 0, tempPerms: 0, tempUntil: -1 };
    n.cardId = card.id; const bp = w.fac.poi(bed); if (bp && !bp.owner) bp.owner = id;
    w.cards[card.id] = card; w.addNpc(n); return n;
  }
  const H = Hm;

  function addPeople(w) {
    const gp = P.Security | P.DClassBlock | P.Surveillance;
    const pe = person(w, 'g.petrenko', 'Олег', 'Петренко', false, 'Guard', 'Охранник', 2, gp, 'dorm.bed1', 'post', 0.7, 0.6, 0.6, 0.4, 0.4, true);
    pe.schedule.add(H(22, 30), H(6), 'Sleep', '@bed', 'Bed', 'Сон').add(H(6), H(6, 40), 'Leisure', 'dorm', 'Seat', 'Подъём').add(H(6, 40), H(7, 15), 'Eat', 'canteen', 'Seat', 'Завтрак')
      .add(H(7, 15), H(12), 'Patrol', 'corridor', 'PatrolPoint', 'Патрулирование, маршрут А', ROUTE_A).add(H(12), H(12, 40), 'Eat', 'canteen', 'Seat', 'Обед')
      .add(H(12, 40), H(17), 'GuardPost', 'post', 'GuardPost', 'Пост видеонаблюдения').add(H(17), H(19), 'Patrol', 'corridor', 'PatrolPoint', 'Патрулирование, маршрут Б', ROUTE_B)
      .add(H(19), H(19, 40), 'Eat', 'canteen', 'Seat', 'Ужин').add(H(19, 40), H(22, 30), 'Leisure', 'canteen', 'Seat', 'Отдых');
    const me = person(w, 'g.melnik', 'Ирина', 'Мельник', true, 'Guard', 'Охранник', 2, gp, 'dorm.bed2', 'post', 0.55, 0.4, 0.8, 0.3, 0.3, true);
    me.schedule.add(H(7, 30), H(14, 30), 'Sleep', '@bed', 'Bed', 'Сон после ночной смены').add(H(14, 30), H(15, 10), 'Leisure', 'canteen', 'Seat', 'Подъём').add(H(15, 10), H(15, 50), 'Eat', 'canteen', 'Seat', 'Обед')
      .add(H(15, 50), H(20), 'Patrol', 'corridor', 'PatrolPoint', 'Патрулирование, маршрут Б', ROUTE_B).add(H(20), H(20, 40), 'Eat', 'canteen', 'Seat', 'Ужин')
      .add(H(20, 40), H(4), 'GuardPost', 'post', 'GuardPost', 'Ночной пост').add(H(4), H(7), 'Patrol', 'corridor', 'PatrolPoint', 'Ночной обход, маршрут А', ROUTE_A).add(H(7), H(7, 30), 'Eat', 'canteen', 'Seat', 'Завтрак после смены');
    const or = person(w, 's.orlova', 'Вера', 'Орлова', true, 'Scientist', 'Д-р', 3, P.Research | P.Containment, 'dorm.bed3', 'lab', 0.75, 0.5, 0.9, 0.2, 0.9, true);
    or.schedule.add(H(23), H(6, 45), 'Sleep', '@bed', 'Bed', 'Сон').add(H(6, 45), H(7, 30), 'Eat', 'canteen', 'Seat', 'Завтрак').add(H(7, 30), H(8), 'Work', 'lab', 'Desk', 'Подготовка к сеансу')
      .add(H(8), H(8, 30), 'ObservationSession', 'obs', 'Console', 'Сеанс счёта (утро)').add(H(8, 30), H(12), 'Work', 'lab', 'Desk', 'Анализ записей сеансов').add(H(12), H(12, 45), 'Eat', 'canteen', 'Seat', 'Обед')
      .add(H(12, 45), H(14), 'Work', 'lab', 'Workbench', 'Эксперимент с отметками').add(H(14), H(14, 30), 'ObservationSession', 'obs', 'Console', 'Сеанс счёта (день)').add(H(14, 30), H(16), 'Work', 'lab', 'Desk', 'Отчёт')
      .add(H(16), H(16, 20), 'ChamberInspection', 'chamber', 'Terminal', 'Плановый осмотр камеры').add(H(16, 20), H(19), 'Work', 'lab', 'Desk', 'Обработка данных осмотра').add(H(19), H(19, 45), 'Eat', 'canteen', 'Seat', 'Ужин')
      .add(H(19, 45), H(20), 'Leisure', 'canteen', 'Seat', 'Перерыв').add(H(20), H(20, 30), 'ObservationSession', 'obs', 'Console', 'Сеанс счёта (вечер)').add(H(20, 30), H(23), 'Leisure', 'canteen', 'Seat', 'Отдых');
    const ki = person(w, 's.kim', 'Артём', 'Ким', false, 'Scientist', 'Д-р', 3, P.Research | P.Containment, 'dorm.bed4', 'lab', 0.45, 0.7, 0.6, 0.35, 0.7, true);
    ki.schedule.add(H(23, 30), H(7), 'Sleep', '@bed', 'Bed', 'Сон').add(H(7), H(7, 45), 'Eat', 'canteen', 'Seat', 'Завтрак').add(H(7, 45), H(12, 30), 'Work', 'lab', 'Desk', 'Исследования')
      .add(H(12, 30), H(13, 15), 'Eat', 'canteen', 'Seat', 'Обед').add(H(13, 15), H(16), 'Work', 'lab', 'Workbench', 'Калибровка датчиков').add(H(16), H(16, 20), 'ChamberInspection', 'chamber', 'Terminal', 'Плановый осмотр камеры')
      .add(H(16, 20), H(19, 30), 'Work', 'lab', 'Desk', 'Исследования').add(H(19, 30), H(20, 15), 'Eat', 'canteen', 'Seat', 'Ужин').add(H(20, 15), H(23, 30), 'Leisure', 'canteen', 'Seat', 'Отдых');
    const le = person(w, 's.lebedev', 'Павел', 'Лебедев', false, 'Scientist', 'Мл. н. с.', 2, P.Research, 'dorm.bed5', 'lab', 0.35, 0.8, 0.5, 0.5, 0.6, true);
    le.schedule.add(H(3), H(10, 30), 'Sleep', '@bed', 'Bed', 'Сон').add(H(10, 30), H(11, 15), 'Eat', 'canteen', 'Seat', 'Поздний завтрак').add(H(11, 15), H(12), 'Leisure', 'canteen', 'Seat', 'Перерыв')
      .add(H(12), H(18), 'Work', 'lab', 'Desk', 'Расшифровка записей').add(H(18), H(18, 45), 'Eat', 'canteen', 'Seat', 'Ужин').add(H(18, 45), H(20), 'Work', 'lab', 'Desk', 'Расшифровка записей')
      .add(H(20), H(20, 30), 'ObservationSession', 'obs', 'Console', 'Сеанс счёта (ассистент)').add(H(20, 30), H(2), 'Work', 'lab', 'Desk', 'Ночная смена')
      .add(H(2), H(2, 30), 'ObservationSession', 'obs', 'Console', 'Сеанс счёта (ночь)').add(H(2, 30), H(3), 'Eat', 'canteen', 'Seat', 'Ночной перекус');
    const so = person(w, 't.sokolov', 'Игорь', 'Соколов', false, 'Technician', 'Техник', 2, P.Engineering, 'dorm.bed6', 'eng', 0.5, 0.5, 0.7, 0.45, 0.4, false);
    so.schedule.add(H(23), H(6, 30), 'Sleep', '@bed', 'Bed', 'Сон').add(H(6, 30), H(7, 10), 'Eat', 'canteen', 'Seat', 'Завтрак').add(H(7, 10), H(7, 30), 'Leisure', 'canteen', 'Seat', 'Перекур')
      .add(H(7, 30), H(12), 'Maintenance', 'eng', 'Panel', 'Обход щитков', MAINT).add(H(12), H(12, 40), 'Eat', 'canteen', 'Seat', 'Обед').add(H(12, 40), H(18), 'Work', 'eng', 'Workbench', 'Ремонт оборудования')
      .add(H(18), H(18, 40), 'Eat', 'canteen', 'Seat', 'Ужин').add(H(18, 40), H(20), 'Maintenance', 'eng', 'Panel', 'Вечерний обход щитков', MAINT).add(H(20), H(23), 'Leisure', 'canteen', 'Seat', 'Отдых');
    const za = person(w, 'm.zaitseva', 'Анна', 'Зайцева', true, 'Medic', 'Фельдшер', 2, P.Medical | P.DClassBlock, 'dorm.bed7', 'med', 0.4, 0.65, 0.75, 0.25, 0.5, false);
    za.schedule.add(H(23), H(6, 45), 'Sleep', '@bed', 'Bed', 'Сон').add(H(6, 45), H(7, 30), 'Eat', 'canteen', 'Seat', 'Завтрак').add(H(7, 30), H(12), 'Treat', 'med', 'Desk', 'Приём в медпункте')
      .add(H(12), H(12, 40), 'Eat', 'canteen', 'Seat', 'Обед').add(H(12, 40), H(13, 30), 'Work', 'dblock', 'Stand', 'Медосмотр класса D').add(H(13, 30), H(19), 'Treat', 'med', 'Desk', 'Приём в медпункте')
      .add(H(19), H(19, 40), 'Eat', 'canteen', 'Seat', 'Ужин').add(H(19, 40), H(23), 'Leisure', 'canteen', 'Seat', 'Отдых');
    const names = ['Виктор', 'Сергей', 'Марина', 'Рустам'], calls = ['D-9341', 'D-7720', 'D-4108', 'D-5512'], fem = [false, false, true, false];
    const brv = [0.6, 0.3, 0.5, 0.45], soc = [0.4, 0.6, 0.7, 0.5], tem = [0.7, 0.5, 0.3, 0.55], ids = ['d.9341', 'd.7720', 'd.4108', 'd.5512'], dcl = [];
    for (let i = 0; i < 4; i++) {
      const d = person(w, ids[i], names[i], calls[i], fem[i], 'DClass', '', 0, P.CellResident, 'cell' + (i + 1) + '.bunk', 'dblock', brv[i], soc[i], 0.4, tem[i], 0.3, false);
      d.colorVariant = i; const lab = i % 2 === 0 ? 'Трудовая смена: сортировка' : 'Трудовая смена: прачечная';
      d.schedule.add(H(22), H(6, 30), 'Sleep', '@bed', 'CellBunk', 'Отбой').add(H(6, 30), H(7), 'Hygiene', '@bed', 'Stand', 'Подъём, гигиена').add(H(7), H(7, 40), 'Eat', 'dblock', 'Seat', 'Раздача пайков')
        .add(H(7, 40), H(12), 'Labor', 'dblock', 'Workbench', lab).add(H(12), H(12, 40), 'Eat', 'dblock', 'Seat', 'Обед').add(H(12, 40), H(17), 'Labor', 'dblock', 'Workbench', lab)
        .add(H(17), H(18, 30), 'Leisure', 'dblock', 'Seat', 'Свободное время').add(H(18, 30), H(19, 10), 'Eat', 'dblock', 'Seat', 'Ужин').add(H(19, 10), H(21, 45), 'Leisure', 'dblock', 'Seat', 'Свободное время')
        .add(H(21, 45), H(22), 'Confined', '@bed', 'CellBunk', 'Вечерняя поверка');
      dcl.push(d);
    }
    const rel = (a, b, v) => { a.adjustRel(b.id, v); b.adjustRel(a.id, v); };
    rel(or, ki, 35); rel(or, le, 15); rel(ki, le, 20); rel(pe, me, 25); rel(so, pe, 15); rel(za, or, 20); rel(dcl[0], dcl[1], -25); rel(dcl[2], dcl[3], 20); rel(dcl[1], dcl[2], 10);
    pe.adjustRel('player', 10); me.adjustRel('player', 5);
    for (const n of w.npcs) {
      n.needs.hunger = w.rng.range(10, 35); n.needs.energy = w.rng.range(65, 90); n.needs.social = w.rng.range(40, 75);
      n.needs.stress = w.rng.range(5, 25) + (n.role === 'DClass' ? 15 : 0); n.nextConv = START + w.rng.range(5, 40); place(w, n);
    }
    me.needs.energy = 22;
  }
  function place(w, n) {
    const b = n.schedule.at(w.clock.mod); let room = null, poi = null;
    if (b) {
      if (b.activity === 'Patrol' || b.activity === 'Maintenance') poi = b.route.length ? w.fac.poi(b.route[0]) : null;
      else {
        const rid = b.roomId === '@bed' ? (w.fac.poi(n.bedPoi) || {}).roomId : b.roomId; room = w.fac.room(rid);
        if (room) {
          if (b.roomId === '@bed' && (b.poi === 'Bed' || b.poi === 'CellBunk')) poi = w.fac.poi(n.bedPoi);
          if (!poi) poi = room.pois.find(p => p.type === b.poi && !p.reservedBy && (!p.owner || p.owner === n.id)) || null;
        }
      }
    }
    if (poi) { n.agent.pos = V.copy(poi.pos); n.agent.roomId = poi.roomId; n.agent.yaw = poi.yaw; }
    else { room = room || w.fac.room(n.workRoom) || w.fac.roomList[0]; n.agent.pos = V.copy(room.hubPoints[0] || room.center); n.agent.roomId = room.id; }
  }

  function addAnomaly(w) {
    const beh = new Tallyman();
    const a = { id: 'SCP-L-001', name: 'Счетовод', displayName: 'SCP-L-001 «Счетовод»', containRoom: 'chamber', agent: new S.NavAgent(), beh, contained: true, pose: 'Idle', lookAt: null, breachAt: -1, detected: false };
    beh.owner = a; w.anomalies.push(a); beh.init(w);
    beh.lastSession = START - 300;
    beh.seedFamiliarity('s.orlova', [8, 14, 16, 20]); beh.seedFamiliarity('s.kim', [16]); beh.seedFamiliarity('s.lebedev', [2, 20]);
    beh.seedDoor(16, 0, 1); beh.seedDoor(16, 20, 1);
  }
  function setupPlayer(w) {
    const card = { id: 'card.player', owner: 'player', ownerName: w.player.name, level: 2, perms: P.Security | P.DClassBlock | P.Surveillance, revoked: false, holder: 'player', room: null, pos: V.v(0, 0, 0), tempLevel: 0, tempPerms: 0, tempUntil: -1 };
    w.cards[card.id] = card; w.player.cards.push(card.id);
    w.player.pos = V.v(-21.6, 0, -5.5); w.player.yaw = 180; w.player.roomId = 'post';
    w.player.addJournal('[' + S.fmtStamp(START) + '] Заступил на смену. Пост: КПП сектора Б-3. Карта L2 «Охрана».');
  }

  S.Content = {
    START,
    createWorld(seed) { const w = new World(buildFacility(), START, seed); addCameras(w); addPeople(w); addAnomaly(w); setupPlayer(w); return w; },
    ARCHIVE: [{
      id: 'SCP-L-001', name: 'Счетовод', cls: 'Euclid', kind: 'разумный',
      desc: 'Высокий (2,6 м) гуманоид с гладкой серой кожей, покрытой мелкими насечками. Постоянно ведёт счёт: людей, шагов, циклов двери — и выцарапывает отметки на стенах.',
      contain: 'Камера 12×10 м с окном наблюдения. Сеанс счёта обученным сотрудником не реже раза в 6 часов. Освещение не отключать. Вход только вдвоём (две карты L3 «Содержание») и только при спокойном объекте.',
      triggers: 'пропуск сеанса счёта; отключение света; открытие двери в заученное время при возбуждении; незнакомые и нерегулярные посетители'
    }]
  };
})(typeof window !== 'undefined' ? window : globalThis);
