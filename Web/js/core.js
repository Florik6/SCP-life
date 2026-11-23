/* SCP LIFE 2.0 — simulation core: math, clock, access, facility (multi-level), navigation, events, memory, NPC data. */
(function (root) {
  'use strict';
  const SCP = root.SCP || (root.SCP = {});

  const V = {
    v: (x, y, z) => ({ x, y, z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    lenXZ: a => Math.sqrt(a.x * a.x + a.z * a.z),
    distXZ: (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); },
    dist: (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); },
    copy: a => ({ x: a.x, y: a.y, z: a.z }),
    yawFromDir: d => (Math.abs(d.x) < 1e-6 && Math.abs(d.z) < 1e-6) ? 0 : Math.atan2(d.x, d.z) * 180 / Math.PI,
    dirFromYaw: yaw => { const r = yaw * Math.PI / 180; return { x: Math.sin(r), y: 0, z: Math.cos(r) }; },
    normXZ: a => { const l = Math.sqrt(a.x * a.x + a.z * a.z); return l > 1e-6 ? { x: a.x / l, y: 0, z: a.z / l } : { x: 0, y: 0, z: 0 }; }
  };
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const clamp01 = v => clamp(v, 0, 1);
  function deltaAngle(from, to) { let d = (to - from) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
  function moveTowardsAngle(cur, target, maxD) { const d = deltaAngle(cur, target); return Math.abs(d) <= maxD ? target : cur + Math.sign(d) * maxD; }

  class SimRandom {
    constructor(seed) { this.state = (seed >>> 0) || 0x9E3779B9; }
    next() { let t = (this.state = (this.state + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return b <= a ? a : a + Math.floor(this.next() * (b - a)); }
    chance(p) { return this.next() < p; }
    pick(list) { return list[this.int(0, list.length)]; }
  }

  const MIN_PER_DAY = 1440;
  const Hm = (h, m) => h * 60 + (m || 0);
  function fmtTime(total) { let m = total % MIN_PER_DAY; if (m < 0) m += MIN_PER_DAY; const h = Math.floor(m / 60), mm = Math.floor(m % 60); return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function fmtStamp(total) { return 'Д' + (Math.floor(total / MIN_PER_DAY) + 1) + ' ' + fmtTime(total); }
  function inRange(mod, s, e) { if (s === e) return true; return s < e ? (mod >= s && mod < e) : (mod >= s || mod < e); }
  function durationText(min) { if (min < 60) return Math.max(0, Math.floor(min)) + ' мин'; const h = Math.floor(min / 60), m = Math.floor(min % 60); return m === 0 ? h + ' ч' : h + ' ч ' + m + ' мин'; }
  class GameClock {
    constructor(start) { this.total = start; this.minPerSec = 0.5; }
    get day() { return Math.floor(this.total / MIN_PER_DAY) + 1; }
    get mod() { return this.total % MIN_PER_DAY; }
    get hour() { return Math.floor(this.mod / 60); }
    get night() { const h = this.hour; return h >= 23 || h < 6; }
    advance(sec) { const m = sec * this.minPerSec; this.total += m; return m; }
    minutesUntil(t) { let d = t - this.mod; if (d < 0) d += MIN_PER_DAY; return d; }
  }

  // ------------------------------------------------------------------ access
  const P = { None: 0, Security: 1, Research: 2, Engineering: 4, Medical: 8, DClassBlock: 16, Containment: 32, Armory: 64, Command: 128, Surveillance: 256, CellResident: 512, Records: 1024, Ethics: 2048, Logistics: 4096, MTF: 8192 };
  const PERM_NAMES = { 1: 'Охрана', 2: 'Исследования', 4: 'Инженерия', 8: 'Медицина', 16: 'Блок D', 32: 'Содержание', 64: 'Оружейная', 128: 'Командование', 256: 'Наблюдение', 512: 'Камера D', 1024: 'Архив', 2048: 'Этика', 4096: 'Логистика', 8192: 'МОГ' };
  const R = { Granted: 'Granted', Override: 'GrantedOverride', Await: 'AwaitingSecondCard', DLevel: 'DeniedLevel', DPerm: 'DeniedPermission', DRevoked: 'DeniedRevoked', DLocked: 'DeniedLocked', DLockdown: 'DeniedLockdown', DSame: 'DeniedSameCard', DCurfew: 'DeniedCurfew', Fault: 'ReaderFault' };
  const RESULT_TEXT = { Granted: 'Доступ разрешён', GrantedOverride: 'Доступ разрешён (приоритет командования)', AwaitingSecondCard: 'Принято. Нужна вторая карта', DeniedLevel: 'Отказ: недостаточный уровень допуска', DeniedPermission: 'Отказ: нет разрешения для этой зоны', DeniedRevoked: 'Отказ: карта аннулирована', DeniedLocked: 'Отказ: дверь заблокирована', DeniedLockdown: 'Отказ: режим изоляции', DeniedSameCard: 'Отказ: вторая карта должна принадлежать другому сотруднику', DeniedCurfew: 'Отказ: комендантский час', ReaderFault: 'Ошибка считывателя' };
  const isSuccess = r => r === R.Granted || r === R.Override;
  function permList(p) { if (!p) return '—'; const o = []; for (const k in PERM_NAMES) if (p & k) o.push(PERM_NAMES[k]); return o.join('/'); }
  function req(min, anyOf, dual) { return { min, anyOf: anyOf || 0, dual: !!dual }; }
  function describeReq(r) { let s = 'L' + r.min; if (r.anyOf) s += ' + ' + permList(r.anyOf); if (r.dual) s += ' (две карты)'; return s; }
  function effLevel(c, now) { return c.tempUntil > now && c.tempLevel > c.level ? c.tempLevel : c.level; }
  function effPerms(c, now) { return c.tempUntil > now ? (c.perms | c.tempPerms) : c.perms; }
  function checkCard(card, r, now) {
    if (!card) return R.DLevel; if (card.revoked) return R.DRevoked;
    const lvl = effLevel(card, now || 0), perms = effPerms(card, now || 0);
    if (lvl < r.min) return R.DLevel; if (!r.anyOf || (perms & r.anyOf)) return R.Granted;
    const cont = (r.anyOf & P.Containment) === r.anyOf;
    if (lvl >= 5 || (lvl >= 4 && !cont)) return R.Override;
    return R.DPerm;
  }

  // ------------------------------------------------------------------ facility
  class Room {
    constructor(o) {
      Object.assign(this, { sector: 'Б', level: 3, floorY: 0, height: 3.2, style: 'standard' }, o);
      this.pois = []; this.hubPoints = []; this.hubNodes = []; this.hubEdges = []; this.visibleRooms = []; this.doorIds = []; this.nodes = [];
      this.lightsOn = true; this.flickerUntil = 0; this.powered = true; this.light = 1;
    }
    get width() { return this.maxX - this.minX; }
    get depth() { return this.maxZ - this.minZ; }
    get area() { return this.width * this.depth; }
    get capacity() { return Math.max(2, Math.floor(this.area / 5)); }
    get center() { return V.v((this.minX + this.maxX) / 2, this.floorY, (this.minZ + this.maxZ) / 2); }
    contains(p, m) { m = m || 0; return p.x >= this.minX - m && p.x <= this.maxX + m && p.z >= this.minZ - m && p.z <= this.maxZ + m && p.y >= this.floorY - 1.5 && p.y <= this.floorY + this.height + 1.5; }
    isFlickering(now) { return this.flickerUntil > now; }
    canSeeInto(id) { return id === this.id || this.visibleRooms.indexOf(id) >= 0; }
  }
  const DS = { Closed: 0, Opening: 1, Open: 2, Closing: 3 };
  const TRANSIT = { Lift: 1, Stairs: 1 };
  class Door {
    constructor(o) {
      Object.assign(this, { width: 1.6, height: 2.4, kind: 'Standard', openSeconds: 1.1, autoClose: 4, curfewStart: -1, curfewEnd: -1, hasExit: false, exitFrom: null, exitReq: null, nodeA: -1, nodeB: -1, transit: 0 }, o);
      this.state = DS.Closed; this.openness = (this.kind === 'Archway' || TRANSIT[this.kind]) ? 1 : 0; this.hold = 0; this.locked = false; this.lockdown = false; this.integrity = 100;
      this.faultUntil = 0; this.pendingCard = null; this.pendingOwner = null; this.pendingTime = 0; this.lastResult = R.Granted; this.lastResultTime = -1000; this.cycles = 0;
      this.flowFrom = null; this.flowUntil = 0; this.outOfService = false;
    }
    get isTransit() { return !!TRANSIT[this.kind]; }
    get passable() { return this.kind === 'Archway' || this.isTransit || this.openness >= 0.92; }
    get isClosed() { return this.hasLeaf && this.openness <= 0.01 && this.state === DS.Closed; }
    get hasLeaf() { return this.kind !== 'Archway' && !this.isTransit; }
    other(r) { return r === this.roomA ? this.roomB : this.roomA; }
    nodeOn(r) { return r === this.roomA ? this.nodeA : this.nodeB; }
    reqFrom(r) { return this.hasExit && r === this.exitFrom ? this.exitReq : this.req; }
    inCurfew(mod) { return this.curfewStart >= 0 && inRange(mod, this.curfewStart, this.curfewEnd); }
    open(hold) { if (!this.hasLeaf) return; if (this.state === DS.Closed || this.state === DS.Closing) { this.state = DS.Opening; this.cycles++; } this.hold = Math.max(this.hold, hold); }
    close() { if (!this.hasLeaf) return; if (this.state === DS.Open || this.state === DS.Opening) { this.state = DS.Closing; this.hold = 0; } }
    tick(dt, occupied) {
      if (!this.hasLeaf) { this.openness = 1; this.state = DS.Open; return; }
      const sp = 1 / Math.max(0.1, this.openSeconds);
      if (this.state === DS.Opening) { this.openness += sp * dt; if (this.openness >= 1) { this.openness = 1; this.state = DS.Open; } }
      else if (this.state === DS.Open) { if (occupied) this.hold = Math.max(this.hold, 1); this.hold -= dt; if (this.hold <= 0 && !occupied && this.integrity > 0) this.state = DS.Closing; }
      else if (this.state === DS.Closing) { if (occupied) { this.state = DS.Opening; this.hold = 1.5; return; } this.openness -= sp * dt; if (this.openness <= 0) { this.openness = 0; this.state = DS.Closed; } }
    }
    save() { return { id: this.id, s: this.state, o: this.openness, h: this.hold, l: this.locked, ld: this.lockdown, i: this.integrity, f: this.faultUntil, c: this.cycles, lr: this.lastResult, lt: this.lastResultTime, os: this.outOfService }; }
    load(o) { this.state = o.s; this.openness = o.o; this.hold = o.h; this.locked = o.l; this.lockdown = o.ld; this.integrity = o.i; this.faultUntil = o.f; this.cycles = o.c; this.lastResult = o.lr; this.lastResultTime = o.lt; this.outOfService = !!o.os; }
  }
  class NavGraph {
    constructor() { this.nodes = []; this.edges = []; }
    add(id, pos, roomId, doorId, kind) { const n = { index: this.nodes.length, id, pos, roomId, doorId: doorId || null, kind: kind || 'hub' }; this.nodes.push(n); this.edges.push([]); return n.index; }
    connect(a, b, doorId) { if (a === b) return; for (const e of this.edges[a]) if (e.to === b) return; const c = V.dist(this.nodes[a].pos, this.nodes[b].pos); this.edges[a].push({ to: b, cost: c, doorId: doorId || null }); this.edges[b].push({ to: a, cost: c, doorId: doorId || null }); }
    find(a, b) { for (const e of this.edges[a]) if (e.to === b) return e; return null; }
  }
  class Facility {
    constructor() { this.rooms = {}; this.roomList = []; this.doors = {}; this.doorList = []; this.graph = new NavGraph(); this.pois = {}; this.navVersion = 0; this._dist = new Map(); }
    addRoom(r) { if (this.rooms[r.id]) throw new Error('duplicate room ' + r.id); this.rooms[r.id] = r; this.roomList.push(r); return r; }
    addDoor(d) { this.doors[d.id] = d; this.doorList.push(d); this.rooms[d.roomA].doorIds.push(d.id); this.rooms[d.roomB].doorIds.push(d.id); return d; }
    room(id) { return id ? this.rooms[id] || null : null; }
    door(id) { return id ? this.doors[id] || null : null; }
    poi(id) { return id ? this.pois[id] || null : null; }
    roomAt(p) {
      for (const r of this.roomList) if (r.contains(p)) return r;
      let best = null, bd = 1.0;
      for (const r of this.roomList) {
        if (Math.abs(p.y - r.floorY) > 2) continue;
        const dx = Math.max(Math.max(r.minX - p.x, 0), p.x - r.maxX), dz = Math.max(Math.max(r.minZ - p.z, 0), p.z - r.maxZ), d = Math.sqrt(dx * dx + dz * dz);
        if (d < bd) { bd = d; best = r; }
      }
      return best;
    }
    nearestNode(p, roomId) {
      const list = roomId && this.rooms[roomId] ? this.rooms[roomId].nodes : null; let best = -1, bd = Infinity;
      const scan = i => { const n = this.graph.nodes[i]; if (!list && Math.abs(n.pos.y - p.y) > 2.5) return; const dx = n.pos.x - p.x, dz = n.pos.z - p.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
      if (list) for (const i of list) scan(i); else for (let i = 0; i < this.graph.nodes.length; i++) scan(i);
      return best;
    }
    roomDistance(from, to, maxDepth) {
      if (!from || !to) return Infinity; if (from === to) return 0;
      const key = from + '|' + to; const c = this._dist.get(key); if (c !== undefined) return c;
      maxDepth = maxDepth || 30; const visited = new Set([from]); let frontier = [from], res = Infinity;
      for (let d = 1; d <= maxDepth && res === Infinity; d++) {
        const next = [];
        for (const rid of frontier) for (const did of this.rooms[rid].doorIds) { const o = this.doors[did].other(rid); if (o === to) { res = d; break; } if (!visited.has(o)) { visited.add(o); next.push(o); } }
        if (!next.length) break; frontier = next;
      }
      this._dist.set(key, res); return res;
    }
    roomsOfType(t) { return this.roomList.filter(r => r.type === t); }
    firstRoom(t) { return this.roomList.find(r => r.type === t) || null; }
    nearestHub(room, p) { let best = room.hubNodes[0], bd = Infinity; for (const h of room.hubNodes) { const d = V.dist(this.graph.nodes[h].pos, p); if (d < bd) { bd = d; best = h; } } return best; }
    buildNavigation() {
      const g = this.graph;
      for (const room of this.roomList) {
        room.hubNodes = []; room.nodes = [];
        if (!room.hubPoints.length) room.hubPoints.push(room.center);
        room.hubPoints.forEach((p, i) => { const n = g.add(room.id + '.hub' + i, V.v(p.x, room.floorY, p.z), room.id, null, 'hub'); room.hubNodes.push(n); room.nodes.push(n); });
        if (room.hubEdges.length) for (const e of room.hubEdges) g.connect(room.hubNodes[e[0]], room.hubNodes[e[1]]);
        else for (let i = 0; i < room.hubNodes.length; i++) for (let j = i + 1; j < room.hubNodes.length; j++) g.connect(room.hubNodes[i], room.hubNodes[j]);
        for (const poi of room.pois) { poi.roomId = room.id; poi.pos.y = room.floorY; poi.node = g.add(poi.id, poi.pos, room.id, null, 'poi'); room.nodes.push(poi.node); g.connect(poi.node, this.nearestHub(room, poi.pos)); this.pois[poi.id] = poi; }
      }
      for (const d of this.doorList) {
        const a = this.rooms[d.roomA], b = this.rooms[d.roomB];
        d.nodeA = g.add(d.id + '.A', Facility.approach(d, a), a.id, d.id, 'door'); d.nodeB = g.add(d.id + '.B', Facility.approach(d, b), b.id, d.id, 'door');
        a.nodes.push(d.nodeA); b.nodes.push(d.nodeB);
        g.connect(d.nodeA, d.nodeB, d.id); this.linkDoorNode(d.nodeA, a); this.linkDoorNode(d.nodeB, b);
        if (d.isTransit) { const e1 = g.find(d.nodeA, d.nodeB), e2 = g.find(d.nodeB, d.nodeA); e1.cost = e2.cost = d.transit * 1.4; }
      }
    }
    linkDoorNode(node, room) {
      this.graph.connect(node, this.nearestHub(room, this.graph.nodes[node].pos));
      if (room.type !== 'Corridor' && room.type !== 'Airlock' && room.type !== 'Tunnel') return;
      for (const oid of room.doorIds) { const o = this.doors[oid]; if (o.nodeA < 0 || o.nodeB < 0) continue; const on = o.nodeOn(room.id); if (on !== node && on >= 0 && V.dist(this.graph.nodes[on].pos, this.graph.nodes[node].pos) < 14) this.graph.connect(node, on); }
    }
    static approach(d, room) {
      if (d.isTransit) { const h = room.hubPoints[0] || room.center; return V.v(h.x, room.floorY, h.z); }
      const c = room.center, p = d.pos, inset = 0.9;
      if (d.alongX) return V.v(c.x > p.x ? room.minX + inset : room.maxX - inset, room.floorY, p.z);
      return V.v(p.x, room.floorY, c.z > p.z ? room.minZ + inset : room.maxZ - inset);
    }
  }

  function findPath(fac, start, goal, canUseDoor, edgeCost) {
    const g = fac.graph, n = g.nodes.length;
    if (start < 0 || goal < 0 || start >= n || goal >= n) return null; if (start === goal) return [start];
    const gs = new Float64Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n), open = [];
    const push = (f, i) => { open.push([f, i]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; const t = open[p]; open[p] = open[k]; open[k] = t; k = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let s = k; if (l < open.length && open[l][0] < open[s][0]) s = l; if (r < open.length && open[r][0] < open[s][0]) s = r; if (s === k) break; const t = open[s]; open[s] = open[k]; open[k] = t; k = s; } } return top[1]; };
    const gp = g.nodes[goal].pos, h = i => { const p = g.nodes[i].pos; return Math.abs(p.x - gp.x) + Math.abs(p.z - gp.z) * 0.9 + Math.abs(p.y - gp.y) * 3; };
    gs[start] = 0; push(h(start), start);
    while (open.length) {
      const cur = pop();
      if (cur === goal) { const path = []; let c = goal; while (c >= 0) { path.push(c); c = came[c]; } return path.reverse(); }
      if (closed[cur]) continue; closed[cur] = 1;
      for (const e of g.edges[cur]) {
        if (closed[e.to]) continue; let extra = 0;
        if (e.doorId) { const d = fac.doors[e.doorId]; if (d.outOfService) continue; if (canUseDoor && !canUseDoor(d, g.nodes[cur].roomId)) continue; if (!d.passable) extra = d.kind === 'Heavy' ? 6 : 1.5; }
        const t = gs[cur] + e.cost + extra + (edgeCost ? edgeCost(cur, e.to) : 0);
        if (t < gs[e.to]) { gs[e.to] = t; came[e.to] = cur; push(t + h(e.to) * 0.8, e.to); }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ events & memory
  const EV_NAMES = {
    DoorAccess: 'Проход', DoorDenied: 'Отказ доступа', AnomalyBehaviour: 'Поведение аномалии', ContainmentWarning: 'Угроза содержанию', ContainmentBreach: 'НАРУШЕНИЕ СОДЕРЖАНИЯ', Recontained: 'Повторное содержание',
    Injury: 'Травма', Conversation: 'Разговор', Conflict: 'Конфликт', AlertChanged: 'Уровень тревоги', PatrolCheckpoint: 'Контрольная точка', TaskIssued: 'Новая задача', TaskCompleted: 'Задача выполнена', TaskFailed: 'Задача провалена',
    ReaderMalfunction: 'Сбой считывателя', Announcement: 'Оповещение', Observation: 'Наблюдение', CountingProtocol: 'Протокол счёта', Report: 'Доклад', Treatment: 'Медпомощь', SuspiciousActivity: 'Подозрительная активность',
    Radio: 'Радио', Power: 'Энергосистема', Fault: 'Неисправность', Maintenance: 'Обслуживание', Research: 'Исследование', Arrival: 'Поступление объекта', Personnel: 'Кадры', Discipline: 'Дисциплина', Meeting: 'Совещание',
    Investigation: 'Расследование', Death: 'Гибель', Story: 'Странность', Sighting: 'Неподтверждённое наблюдение', Anomalous: 'Аномальное воздействие', Night: 'Ночная смена'
  };
  const EV = {}; for (const k in EV_NAMES) EV[k] = k;
  class EventLog {
    constructor() { this.recent = []; this.nextId = 1; this.listeners = []; }
    post(e) { e.id = this.nextId++; e.severity = e.severity || 0; this.recent.push(e); if (this.recent.length > 400) this.recent.splice(0, this.recent.length - 400); for (const l of this.listeners) l(e); return e; }
  }
  class Memory {
    constructor(cap) { this.cap = cap || 30; this.entries = []; }
    static salience(m, now) { const age = Math.max(0, (now - m.time) / 60), half = 4 + m.imp * 30; return m.imp * m.conf * Math.pow(0.5, age / half); }
    knows(id) { return id > 0 && this.entries.some(m => m.eventId === id); }
    remember(e, now) {
      if (e.eventId > 0) { const ex = this.entries.find(m => m.eventId === e.eventId); if (ex) { if (e.conf > ex.conf) { ex.conf = e.conf; ex.src = e.src; } return false; } }
      this.entries.push(e);
      if (this.entries.length > this.cap) { let w = -1, ws = Infinity; this.entries.forEach((m, i) => { const s = Memory.salience(m, now); if (s < ws) { ws = s; w = i; } }); if (w >= 0) this.entries.splice(w, 1); }
      return true;
    }
    bestGossip(now, filter) { let best = null, bs = 0.08; for (const m of this.entries) { if (filter && !filter(m)) continue; const s = Memory.salience(m, now) * (m.shared ? 0.35 : 1); if (s > bs) { bs = s; best = m; } } return best; }
  }

  // ------------------------------------------------------------------ NPC data
  const ACT_NAMES = {
    Idle: 'Ожидание', Sleep: 'Сон', Eat: 'Приём пищи', Work: 'Работа', Patrol: 'Патрулирование', GuardPost: 'Дежурство на посту', Leisure: 'Отдых', Hygiene: 'Гигиена',
    ObservationSession: 'Сеанс счёта SCP-L-001', ChamberInspection: 'Осмотр камеры', Maintenance: 'Техобслуживание', Treat: 'Приём пациентов', Labor: 'Трудовая смена', Confined: 'В камере',
    Respond: 'Реагирование', Shelter: 'Укрытие', Flee: 'Бегство', Injured: 'Ранен', SeekTreatment: 'Идёт в медпункт', CountingProtocol: 'Протокол счёта', RepairDoor: 'Ремонт замка',
    RetrieveCard: 'Ищет ключ-карту', Task: 'Задание', Sick: 'На больничном', Offsite: 'Вне сектора', Meeting: 'Совещание', Escorted: 'Под конвоем', Escort: 'Конвой', Dead: 'Погиб'
  };
  class NavAgent {
    constructor() { this.pos = V.v(0, 0, 0); this.yaw = 0; this.roomId = null; this.path = []; this.pi = 0; this.speed = 1.3; this.wait = 0; this.blocked = 0; this.waitingDoor = null; this.doorCd = 0; this.arriveYaw = null; this.moving = false; this.lane = 0; this.side = 0; this.sideT = 0; this.transitT = 0; this.stuckT = 0; this.stuckN = 0; this.lastProg = null; this.ghostT = 0; this.dir = { x: 0, z: 0 };
      // crowd navigation: body radius, actual velocity, free end point after the path, doorway gate, stepping aside, watchdog
      this.radius = 0.28; this.vx = 0; this.vz = 0; this.final = null; this.anchored = false; this.gate = null; this.nudge = null; this.want = null; this.yawGoal = null; this.crowd = false; this.stT = 0; this.stP = null; this.sideBias = 1;
    }
    get hasPath() { return this.pi < this.path.length || !!this.final; }     // still navigating (path nodes or the free end point)
    get hasNodes() { return this.pi < this.path.length; }
    setPath(p) { this.path = p ? p.slice() : []; this.pi = 0; this.waitingDoor = null; this.wait = 0; this.blocked = 0; this.transitT = 0; this.final = null; this.nudge = null; }
    clear() { this.path = []; this.pi = 0; this.waitingDoor = null; this.moving = false; this.transitT = 0; this.final = null; this.vx = 0; this.vz = 0; }
    save() { return { p: [this.pos.x, this.pos.y, this.pos.z], y: this.yaw, r: this.roomId }; }
    load(o) { if (!o) return; this.pos = V.v(o.p[0], o.p[1], o.p[2]); this.yaw = o.y; this.roomId = o.r; this.clear(); }
  }
  class Schedule {
    constructor() { this.blocks = []; }
    add(start, end, activity, roomId, poi, label, route) { this.blocks.push({ start: ((start % 1440) + 1440) % 1440, end: ((end % 1440) + 1440) % 1440, activity, roomId, poi, label, route: route || [] }); return this; }
    at(mod) { for (const b of this.blocks) if (inRange(mod, b.start, b.end)) return b; return null; }
  }
  class Npc {
    constructor(o) {
      Object.assign(this, o);
      this.schedule = new Schedule(); this.agent = new NavAgent(); if (o.dept === 'mtf') this.agent.radius = 0.33; this.needs = { hunger: 20, energy: 80, social: 60, stress: 10, health: 100 };
      this.psy = { fatigue: 10, fear: 0, focus: 1, exposure: 0, resilience: (o.traits && o.traits.bravery != null) ? 0.4 + o.traits.bravery * 0.5 : 0.6 };
      this.memory = new Memory(o.tier === 'abstract' ? 16 : 30); this.rel = {}; this.history = []; this.fears = {}; this.perceptions = [];
      this.activity = 'Idle'; this.label = ''; this.targetRoom = null; this.reservedPoi = null; this.actStart = 0; this.actUntil = 0; this.route = []; this.routeIndex = 0;
      this.arrived = false; this.posture = 'Standing'; this.nextThink = 0; this.bark = null; this.barkUntil = 0; this.conv = null; this.convUntil = 0; this.nextConv = 0;
      this.incapUntil = 0; this.taskId = null; this.followId = null; this.knownThreat = 0; this.knownThreatTime = -1; this.needDriven = false; this.dwell = 0; this.blockedCount = 0;
      this.blockedRetry = 0; this.pendingBark = null; this.pendingBarkAt = 0; this.cardLostAt = -1; this.sickUntil = 0; this.reprimands = 0; this.commendations = 0; this.radioOk = true;
      this.tier = o.tier || 'active'; this.absArrive = 0; this.onSite = o.onSite !== false;
    }
    get displayName() { return this.role === 'DClass' ? this.callsign : this.title + ' ' + this.last; }
    get shortName() { return this.role === 'DClass' ? this.callsign : this.first[0] + '. ' + this.last; }
    G(m, f) { return this.female ? f : m; }
    incap(now) { return this.incapUntil > now || this.needs.health <= 0; }
    isSick(now) { return this.sickUntil > now; }
    relTo(id) { return this.rel[id] || 0; }
    adjustRel(id, d) { if (!id || id === this.id) return; this.rel[id] = clamp(this.relTo(id) + d, -100, 100); }
    say(text, now, dur) { this.bark = text; this.barkUntil = now + (dur || 1.5); }
    addHistory(now, text, kind, scp) { this.history.push({ t: now, text, kind, scp: scp || null }); if (this.history.length > 24) this.history.shift(); }
    save() {
      return { id: this.id, a: this.agent.save(), n: this.needs, psy: this.psy, m: this.memory.entries, rel: this.rel, act: this.activity, lab: this.label, as: this.actStart, au: this.actUntil, inc: this.incapUntil, task: this.taskId, card: this.cardId,
        nc: this.nextConv, kt: this.knownThreat, ktt: this.knownThreatTime, cl: this.cardLostAt, h: this.history, f: this.fears, sk: this.sickUntil, rp: this.reprimands, cm: this.commendations, ro: this.radioOk, prof: this.prof, title: this.title, lvl: this.level, os: this.onSite, pc: this.perceptions,
        tr: this.tier, x: Npc.EXTRA.reduce((o, k) => { if (this[k] !== undefined && this[k] !== null) o[k] = this[k]; return o; }, {}) };
    }
    load(o) {
      this.agent.load(o.a); this.needs = Object.assign({}, o.n); this.psy = Object.assign(this.psy, o.psy || {}); this.memory.entries = o.m || []; this.rel = o.rel || {}; this.activity = o.act; this.label = o.lab; this.actStart = o.as; this.actUntil = o.au;
      this.incapUntil = o.inc; this.taskId = o.task; this.cardId = o.card || this.cardId; this.nextConv = o.nc; this.knownThreat = o.kt; this.knownThreatTime = o.ktt; this.cardLostAt = o.cl;
      this.history = o.h || []; this.fears = o.f || {}; this.sickUntil = o.sk || 0; this.reprimands = o.rp || 0; this.commendations = o.cm || 0; this.radioOk = o.ro !== false; this.onSite = o.os !== false; this.perceptions = o.pc || [];
      if (o.prof) { this.prof = o.prof; this.title = o.title; this.level = o.lvl; }
      this.tier = o.tr || this.tier; for (const k of Npc.EXTRA) this[k] = o.x && o.x[k] !== undefined ? o.x[k] : (k === 'assignedScps' ? [] : null);
      this.arrived = false; this.reservedPoi = null; this.nextThink = 0; this.conv = null; this.needDriven = false;
    }
  }
  Npc.EXTRA = ['obsNotes', 'reportsPending', 'tasksDone', 'reportsDone', 'missing', 'missingAt', 'missingWhere', 'restricted', 'falseDone', 'radioCall', 'followId', 'escortedBy', 'post', 'workRoom', 'assignedScps', 'testsDone', 'compliance', 'since', 'dept', 'resident', 'bedPoi', 'shift', 'restOffset', 'mealWave', 'needEscort', 'queue', 'sightings', 'warned', 'role', 'overtime', 'treated', 'lastSeenScp', 'missingFor', 'reserve', 'dead', 'deathAt', 'deathCause', 'deathSrc', 'deathPose', 'wounds', 'unconUntil', 'carriedBy', 'admitted', 'admitAt', 'needSurgery', 'lastHarm', 'griefUntil', 'messRoom', 'hired', 'played', 'homeRoom', 'hallRoom', 'laborLabel', 'surrenderUntil', 'detainedUntil', 'hostileUntil', 'hostileWhy', 'armedHostile', 'riotUntil'];
  const NUM_UNITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const NUM_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  function numWords(n) { if (n < 20) return NUM_UNITS[n]; if (n < 100) return NUM_TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + NUM_UNITS[n % 10] : ''); return n === 100 ? 'сто' : String(n); }

  Object.assign(SCP, {
    V, clamp, clamp01, deltaAngle, moveTowardsAngle, SimRandom, GameClock, Hm, fmtTime, fmtStamp, inRange, durationText, MIN_PER_DAY,
    P, R, RESULT_TEXT, isSuccess, permList, req, describeReq, checkCard, effLevel, effPerms, Room, Door, DS, NavGraph, Facility, findPath,
    EV, EV_NAMES, EventLog, Memory, ACT_NAMES, NavAgent, Schedule, Npc, numWords
  });
})(typeof window !== 'undefined' ? window : globalThis);
