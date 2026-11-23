/* SCP LIFE 2.0 — the world: simulation loop with LOD tiers, navigation with local avoidance, lanes, door flow, transit,
   stuck recovery and path cache; doors and access; CCTV; events and memory; the player (profession, psyche, career); saves. */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, Hm, fmtTime, fmtStamp, durationText, EV, R, RESULT_TEXT, isSuccess, checkCard, findPath } = S;
  const FIXED = 0.1, REMOTE_DIST = 3, REMOTE_STEP = 1, ABSTRACT_STEP = 5;
  const NARROW = 2.1;

  // ------------------------------------------------------------------ player
  class Player {
    constructor() {
      Object.assign(this, { id: 'player', name: 'Сотрудник', first: 'Алексей', last: 'Волков', female: false, prof: 'guard', dept: 'security', title: 'Охранник', level: 2, mode: 'career', pos: V.v(0, 0, 0), yaw: 0, pitch: 0, roomId: null, health: 100, cards: [], sel: 0, flashlight: false, stunnedUntil: 0, dead: false,
        counting: false, countTarget: null, countSec: 0, done: 0, failed: 0, failedToday: 0, tasksInRole: 0, daysInRole: 0, reportsDone: 0, reportsPending: 0, experiments: 0, discoveries: 0, patrols: 0, cases: 0, testsDone: 0,
        rep: {}, reprimands: 0, commendations: 0, record: [], journal: [], camsViewed: [], sleeping: false, moving: false, workRoom: 'post', post: 'post', hallRoom: null, homeRoom: null, assignedScps: [], limitUntil: -1, promoOffer: null, pendingTransfer: null,
        heard: [], heardRadio: [], onShift: false, shift: 'day', restOffset: 0, startJit: 0, mealWave: 2, entry: 'liftB', resident: true, bedPoi: null, overtime: 0, sickUntil: 0, lastAssigned: -1e4, alwaysDuty: false, lastReportQuality: 0.3 });
      this.psy = { fatigue: 12, stress: 10, fear: 0, focus: 1, exposure: 0, resilience: 0.6 };
    }
    isSick() { return false; }
    addRep(dept, d) { if (!dept) return; this.rep[dept] = clamp((this.rep[dept] == null ? 50 : this.rep[dept]) + d, 0, 100); }
    repOf(dept) { return this.rep[dept] == null ? 50 : this.rep[dept]; }
    selectedCardId() { return this.cards.length ? this.cards[((this.sel % this.cards.length) + this.cards.length) % this.cards.length] : null; }
    addJournal(l, perceived) { this.journal.push(perceived ? { text: l, perceived: true } : l); if (this.journal.length > 120) this.journal.shift(); }
    tasksToday() { return { done: this.doneToday || 0, failed: this.failedToday || 0 }; }
    dutyBlock(w) { if (this.alwaysDuty) return 'Duty'; if (this.prof === 'dclass') { const h = w.clock.hour; return h >= 7 && h < 21 ? 'Duty' : 'Rest'; } const b = S.People.staffBlock(w, this, w.now); return b.activity === 'Duty' || b.activity === 'Eat' ? 'Duty' : b.activity; }
    save() { const o = Object.assign({}, this); o.counting = false; return o; }
    load(o) { Object.assign(this, o); this.counting = false; this.countTarget = null; this.psy = Object.assign({ fatigue: 10, stress: 10, fear: 0, focus: 1, exposure: 0, resilience: 0.6 }, o.psy || {}); }
  }

  // ------------------------------------------------------------------ world
  class World {
    constructor(fac, start, seed) {
      this.fac = fac; this.clock = new S.GameClock(start); this.rng = new S.SimRandom(seed); this.seed = seed;
      this.events = new S.EventLog(); this.accessLog = []; this.cards = {}; this.npcs = []; this.npcMap = {}; this.active = []; this.anomalies = []; this.cams = []; this.camLog = [];
      this.alert = new S.Alert(); this.tasks = new S.Tasks(); this.player = new Player();
      this.realTime = 0; this.notify = []; this.sounds = []; this.noise = []; this.camWatch = {}; this.timers = []; this.queues = {}; this.research = { samples: 4, analyses: 0 }; this.food = 120;
      this._remote = {}; this._distCache = {}; this._distRoom = null; this._scan = 0; this._abs = 0; this._sync = 0; this.lockEpoch = 1; this._paths = new Map(); this.byRoom = {}; this.grid = new Map();
      this.life = new S.SCPLife(this); this.infra = new S.Infra(this); this.horror = new S.Horror(this); this.dirt = new S.Dirt(this);
      this.events.listeners.push(e => this.onEvent(e));
    }
    get now() { return this.clock.total; }
    addNpc(n) { this.npcs.push(n); this.npcMap[n.id] = n; }
    setActive(n, on) { const i = this.active.indexOf(n); if (on && i < 0) this.active.push(n); else if (!on && i >= 0) this.active.splice(i, 1); }
    npc(id) { return id ? this.npcMap[id] || null : null; }
    card(id) { return id ? this.cards[id] || null : null; }
    anomaly(id) { for (const a of this.anomalies) if (a.id === id) return a; return null; }
    nameOf(id) { if (!id) return '—'; if (id === 'player') return this.player.name; if (id === 'vetrov') return 'Мл. н. с. Ветров'; const n = this.npc(id); if (n) return n.displayName; const a = this.anomaly(id); if (a) return a.id; const P = S.Professions && S.Professions.get(id); return P ? P.name : id; }
    roomName(id) { const r = this.fac.room(id); if (!r) return '—'; if (this.horror && this.horror.fx.confuse === id) return '???'; return r.name; }
    posOf(id) { if (id === 'player') return this.player.pos; const n = this.npc(id); if (n) return n.agent.pos; const a = this.anomaly(id); return a ? a.agent.pos : V.v(0, 0, 0); }
    roomOf(id) { if (id === 'player') return this.player.roomId; const n = this.npc(id); if (n) return n.agent.roomId; const a = this.anomaly(id); return a ? a.agent.roomId : null; }
    psyOf(id) { if (id === 'player') return this.player.psy; const n = this.npc(id); return n ? n.psy : null; }
    roomPeople(roomId) { return this.byRoom[roomId] || []; }
    countIn(roomId) { return (this.byRoom[roomId] || []).length + (this.player.roomId === roomId && !this.player.dead ? 1 : 0); }
    isolated(roomId, id) { return S.Anoms.H.alone(this, id, 10); }
    *subjects() {
      if (!this.player.dead && !this.player.hidden) yield { id: 'player', name: this.player.name, pos: this.player.pos, roomId: this.player.roomId, player: true, role: this.player.prof === 'dclass' ? 'DClass' : 'Staff' };
      for (const n of this.active) if (!n.agent.transitT) yield { id: n.id, name: n.displayName, pos: n.agent.pos, roomId: n.agent.roomId, role: n.role };
      for (const a of this.anomalies) if (a.arrived && a.agent.roomId) yield { id: a.id, name: a.displayName, pos: a.agent.pos, roomId: a.agent.roomId, anomaly: true };
    }
    *peopleVisibleFrom(roomId) {
      const room = this.fac.room(roomId); if (!room) return;
      if (!this.player.dead && this.player.roomId && room.canSeeInto(this.player.roomId)) yield { id: 'player', pos: this.player.pos, roomId: this.player.roomId };
      for (const rid of [room.id].concat(room.visibleRooms)) for (const n of this.roomPeople(rid)) yield { id: n.id, pos: n.agent.pos, roomId: n.agent.roomId };
    }

    // ---------------------------------------------------------------- main loop
    tick(dt) {
      this.realTime += dt;
      const gm = this.clock.advance(dt);
      if (this.player.roomId !== this._distRoom) { this._distCache = {}; this._distRoom = this.player.roomId; }
      this.index();
      this.tickDoors(dt);
      this.infra.tick(dt);
      for (const a of this.anomalies) a.tick(this, dt, gm);
      for (let i = 0; i < this.active.length; i++) {
        const n = this.active[i];
        if (this.isRemote(n.agent.roomId)) {
          const acc = (this._remote[n.id] || 0) + dt;
          if (acc < REMOTE_STEP) { this._remote[n.id] = acc; continue; }
          this._remote[n.id] = 0; S.Brain.update(this, n, acc, acc * this.clock.minPerSec, true);
        } else {
          const pend = this._remote[n.id] || 0;
          if (pend > 0) { this._remote[n.id] = 0; S.Brain.update(this, n, dt + pend, (dt + pend) * this.clock.minPerSec, false); }
          else S.Brain.update(this, n, dt, gm, false);
        }
      }
      this._abs += dt; if (this._abs >= ABSTRACT_STEP) { S.People.tickAbstract(this, this._abs * this.clock.minPerSec); this._abs = 0; }
      this._sync -= dt; if (this._sync <= 0) { this._sync = 3; S.People.sync(this); }
      this.tickCameras(dt);
      this.tasks.tick(this);
      this.life.tick(dt);
      this.horror.tick(dt);
      if (this.ai) this.ai.tick(dt);
      this.dirt.tick(dt);
      for (const r of this.fac.roomList) if (r.flickerUntil > 0 && r.flickerUntil < this.now) r.flickerUntil = 0;
      if (this.timers.length) { const due = this.timers.filter(t => t.at <= this.realTime); this.timers = this.timers.filter(t => t.at > this.realTime); for (const t of due) t.fn(); }
      if (this.sounds.length > 60) this.sounds.splice(0, this.sounds.length - 60);
      this.tickPlayer(dt, gm);
    }
    index() {
      this.byRoom = {}; this.grid.clear();
      for (const n of this.active) {
        const a = n.agent; if (a.transitT > 0 || !a.roomId) continue;
        (this.byRoom[a.roomId] || (this.byRoom[a.roomId] = [])).push(n);
        const k = Math.floor(a.pos.x / 2) + ':' + Math.floor(a.pos.z / 2) + ':' + Math.round(a.pos.y); let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(a);
      }
    }
    isRemote(roomId) {
      if (!roomId || !this.player.roomId) return false;
      let d = this._distCache[roomId];
      if (d === undefined) { d = this.fac.roomDistance(this.player.roomId, roomId, REMOTE_DIST + 1); this._distCache[roomId] = d; }
      return d >= REMOTE_DIST;
    }

    // ---------------------------------------------------------------- doors and access
    tickDoors(dt) {
      const mod = this.clock.mod;
      for (const d of this.fac.doorList) {
        if (d.curfewStart >= 0) { const c = d.inCurfew(mod); if (c && !d.locked) { d.locked = true; d.close(); this.lockEpoch++; } else if (!c && d.locked) { d.locked = false; this.lockEpoch++; } }
        if (d.pendingCard && this.realTime - d.pendingTime > 20) d.pendingCard = null;
        if (d.hasLeaf) d.tick(dt, this.doorOccupied(d));
      }
    }
    doorOccupied(d) {
      if (!d.hasLeaf) return false;
      if (!this.player.dead && World.inDoorway(d, this.player.pos)) return true;
      for (const rid of [d.roomA, d.roomB]) for (const n of this.roomPeople(rid)) if (World.inDoorway(d, n.agent.pos)) return true;
      for (const a of this.anomalies) if (a.arrived && World.inDoorway(d, a.agent.pos)) return true;
      return false;
    }
    static inDoorway(d, p) {
      if (Math.abs(p.y - d.pos.y) > 1.5) return false;
      const along = d.alongX ? Math.abs(p.x - d.pos.x) : Math.abs(p.z - d.pos.z), across = d.alongX ? Math.abs(p.z - d.pos.z) : Math.abs(p.x - d.pos.x);
      return along < 0.75 && across < d.width / 2 + 0.25;
    }
    presentCard(doorId, cardId, who, fromRoom) {
      const d = this.fac.door(doorId); if (!d) return R.Fault;
      if (d.kind === 'Archway' || d.isTransit) return R.Granted;
      const card = this.card(cardId), mod = this.clock.mod; let r;
      const lvl = card ? S.effLevel(card, this.now) : 0, limited = who === 'player' && this.player.limitUntil > this.now;
      if (!card) r = R.DLevel;
      else if (d.faultUntil > this.now || (d.readerFault && this.rng.chance(0.4))) r = R.Fault;
      else if (d.lockdown && lvl < 4) r = R.DLockdown;
      else if (d.restricted && lvl < 3 && !(S.effPerms(card, this.now) & S.P.Security)) r = R.DLockdown;
      else if (d.locked && d.inCurfew(mod) && (card.perms & S.P.CellResident) && lvl < 2) r = fromRoom === d.roomA ? R.DCurfew : R.Granted;
      else if (d.locked && !d.inCurfew(mod) && lvl < 4) r = R.DLocked;
      else {
        const rq = d.reqFrom(fromRoom); r = checkCard(card, rq, this.now);
        if (limited && isSuccess(r) && rq.min >= 2) r = R.DRevoked;
        if (isSuccess(r) && rq.dual && lvl < 5) {
          const pend = d.pendingCard && this.realTime - d.pendingTime <= 20;
          if (!pend) { d.pendingCard = card.id; d.pendingOwner = card.owner; d.pendingTime = this.realTime; r = R.Await; }
          else if (d.pendingOwner === card.owner) r = d.pendingCard === card.id ? R.Await : R.DSame;
          else d.pendingCard = null;
        }
      }
      if (isSuccess(r)) d.open(d.autoClose);
      const repeat = r === R.Await && d.lastResult === R.Await && this.realTime - d.lastResultTime < 20;
      d.lastResult = r; d.lastResultTime = this.realTime;
      if (!repeat) { this.accessLog.push({ t: this.now, door: d.id, card: card ? card.id : '—', owner: card ? card.ownerName : 'нет карты', by: who, r }); if (this.accessLog.length > 600) this.accessLog.splice(0, this.accessLog.length - 600); }
      if (!isSuccess(r) && r !== R.Await && !repeat) this.events.post({ time: this.now, type: r === R.Fault ? EV.ReaderMalfunction : EV.DoorDenied, roomId: fromRoom, pos: V.copy(d.pos), actor: who, target: d.id, quiet: who !== 'player', text: d.name + ': ' + RESULT_TEXT[r] + ' (' + this.nameOf(who) + ')' });
      else if (d.kind === 'Heavy' && isSuccess(r)) this.events.post({ time: this.now, type: EV.DoorAccess, roomId: fromRoom, pos: V.copy(d.pos), actor: who, target: d.id, severity: 1, text: d.name + ' открыта (' + this.nameOf(who) + ')' });
      if (r === R.Fault && d.readerFault) { const f = this.infra.faults.find(x => !x.fixed && x.kind === 'reader' && x.obj === d.id); if (f && !f.known) this.infra.discover(f, who === 'player' ? 'player' : this.nameOf(who)); }
      return r;
    }
    canPlanThrough(d, from, card) {
      if (d.kind === 'Archway' || d.isTransit) return !d.outOfService;
      if (!card) return d.passable;
      const lvl = S.effLevel(card, this.now), perms = S.effPerms(card, this.now);
      if (d.lockdown && lvl < 4) return d.passable;
      if (d.restricted && lvl < 3 && !(perms & S.P.Security)) return false;
      if (d.locked) { const c = d.inCurfew(this.clock.mod); if (c && (perms & S.P.CellResident) && lvl < 2) return from !== d.roomA; if (!c && lvl < 4) return false; }
      return isSuccess(checkCard(card, d.reqFrom(from), this.now));
    }

    // ---------------------------------------------------------------- navigation
    planPath(from, fromRoom, goal, canUse, cacheKey) {
      let start = this.fac.nearestNode(from, fromRoom || (this.fac.roomAt(from) || {}).id);
      if (start < 0) start = this.fac.nearestNode(from, null);
      if (start < 0 || goal < 0) return null;
      if (cacheKey) {
        const k = start + '>' + goal + '|' + cacheKey + '|' + this.lockEpoch + '|' + (this.clock.hour >> 2);
        if (this._paths.has(k)) { const p = this._paths.get(k); return p ? p.slice() : null; }
        const p = findPath(this.fac, start, goal, canUse); if (this._paths.size > 4000) this._paths.clear(); this._paths.set(k, p); return p ? p.slice() : null;
      }
      return findPath(this.fac, start, goal, canUse);
    }
    // Can this person (with their own card) reach a room? Cached per lock epoch.
    reachable(who, roomId) {
      const n = who === 'player' ? null : (typeof who === 'string' ? this.npc(who) : who); const card = this.card(n ? n.cardId : this.player.selectedCardId()), room = this.fac.room(roomId);
      if (!room || !card) return false; const from = n ? n.agent.pos : this.player.pos, fr = n ? n.agent.roomId : this.player.roomId;
      if (!fr) return true;
      return !!this.planPath(from, fr, room.hubNodes[0], (d, f) => this.canPlanThrough(d, f, card), card.id);
    }
    separation(a, id) {
      let sx = 0, sz = 0; const ix = Math.floor(a.pos.x / 2), iz = Math.floor(a.pos.z / 2), iy = Math.round(a.pos.y);
      for (let x = ix - 1; x <= ix + 1; x++) for (let z = iz - 1; z <= iz + 1; z++) {
        const c = this.grid.get(x + ':' + z + ':' + iy); if (!c) continue;
        for (const o of c) { if (o === a) continue; const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z, d2 = dx * dx + dz * dz; if (d2 > 0.6 || d2 < 1e-6) continue; const d = Math.sqrt(d2), k = (0.78 - d) / 0.78; sx += dx / d * k; sz += dz / d * k; }
      }
      if (!this.player.dead) { const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.7 && d2 > 1e-6 && Math.abs(a.pos.y - this.player.pos.y) < 1) { const d = Math.sqrt(d2), k = (0.85 - d) / 0.85; sx += dx / d * k * 1.4; sz += dz / d * k * 1.4; } }
      return { x: sx, z: sz };
    }
    moveAgent(a, dt, onDoor, o) {
      o = o || {};
      if (!a.hasPath) { a.moving = false; return 'Idle'; }
      const g = this.fac.graph, nodes = g.nodes; a.doorCd -= dt; a.ghostT -= dt;
      const speed = a.speed * (a.slow || 1); a.slow = 1; let guard = 0;
      const p0x = a.pos.x, p0z = a.pos.z;
      while (dt > 1e-5 && a.hasPath && guard++ < 16) {
        const ti = a.path[a.pi], tn = nodes[ti], prev = a.pi > 0 ? nodes[a.path[a.pi - 1]] : null;
        let door = null;
        if (prev) { const e = g.find(prev.index, ti); if (e && e.doorId) door = this.fac.doors[e.doorId]; }
        if (door) {
          if (door.isTransit) { this.beginTransit(a, door, prev, tn, o.id); return 'Moving'; }
          if (!door.passable && V.distXZ(a.pos, prev.pos) < 0.7) {
            a.moving = false; a.waitingDoor = door.id; a.wait += dt; this.faceTowards(a, door.pos, dt);
            const out = onDoor ? onDoor(door, prev.roomId) : 'Blocked';
            return out === 'Blocked' ? 'Blocked' : 'Waiting';
          }
          // door flow: through a narrow door one direction at a time, others queue
          if (door.width < NARROW && door.flowFrom && door.flowFrom !== prev.roomId && this.realTime < door.flowUntil && door.flowBy !== o.id && V.distXZ(a.pos, door.pos) < 1.6 && V.distXZ(a.pos, door.pos) > 0.5) { a.moving = false; a.wait += dt; if (a.wait < 5) return 'Waiting'; }
          if (V.distXZ(a.pos, door.pos) < 1.1) { door.flowFrom = prev.roomId; door.flowUntil = this.realTime + 0.7; door.flowBy = o.id; }
        }
        a.waitingDoor = null; a.wait = 0;
        if (o.yieldPlayer && this.playerBlocking(a, tn.pos)) { a.blocked += dt; if (a.blocked < 3.5) { a.moving = false; return 'Waiting'; } } else a.blocked = 0;
        let dx = tn.pos.x - a.pos.x, dz = tn.pos.z - a.pos.z; const dist = Math.sqrt(dx * dx + dz * dz), step = speed * dt;
        const last = a.pi === a.path.length - 1, soft = !last && tn.kind === 'hub' && !door;
        if (dist <= step || (soft && dist < 0.7)) {
          if (!soft) { a.pos = V.v(tn.pos.x, tn.pos.y, tn.pos.z); dt -= speed > 0 ? dist / speed : dt; } else dt = Math.max(0, dt - dist / Math.max(0.1, speed));
          a.roomId = tn.roomId; a.pos.y = tn.pos.y; a.pi++; continue;
        }
        let mx = dx / dist, mz = dz / dist;
        if (!o.remote && o.id && a.ghostT <= 0) {
          const room = this.fac.room(a.roomId);
          if (prev && room && (room.type === 'Corridor' || room.type === 'Tunnel') && !door) {
            const sx = tn.pos.x - prev.pos.x, sz = tn.pos.z - prev.pos.z, sl = Math.sqrt(sx * sx + sz * sz) || 1, rx = -sz / sl, rz = sx / sl;
            const err = (a.pos.x - prev.pos.x) * rx + (a.pos.z - prev.pos.z) * rz, want = 0.45 * (a.side || 1);
            mx += rx * (want - err) * 0.9; mz += rz * (want - err) * 0.9;
          }
          const sep = this.separation(a, o.id); mx += sep.x * 1.2; mz += sep.z * 1.2;
          const l = Math.sqrt(mx * mx + mz * mz) || 1; mx /= l; mz /= l;
        }
        let nx = a.pos.x + mx * step, nz = a.pos.z + mz * step;
        if (!door && tn.roomId === a.roomId) { const r = this.fac.room(a.roomId); if (r) { nx = clamp(nx, r.minX + 0.3, r.maxX - 0.3); nz = clamp(nz, r.minZ + 0.3, r.maxZ - 0.3); } }
        a.pos = V.v(nx, a.pos.y, nz); a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: mx, z: mz }), 540 * dt); dt = 0;
        a.moving = true;
      }
      // stuck recovery: no progress while trying to move → ignore crowd briefly, then replan, then step past
      if (a.moving && !o.remote) {
        a.stuckT += Math.max(dt, FIXED);
        if (a.stuckT >= 2) {
          const moved = a.lastProg ? Math.abs(a.pos.x - a.lastProg.x) + Math.abs(a.pos.z - a.lastProg.z) : 1;
          if (moved < 0.2) { a.stuckN++; if (a.stuckN === 1) a.ghostT = 2.5; else if (a.stuckN === 2) a.needReplan = true; else if (a.hasPath) { const tn = nodes[a.path[a.pi]]; if (V.distXZ(tn.pos, a.pos) < 2.5) { a.pos = V.copy(tn.pos); a.roomId = tn.roomId; a.pi++; } a.stuckN = 0; } }
          else a.stuckN = 0;
          a.stuckT = 0; a.lastProg = { x: a.pos.x, z: a.pos.z };
        }
      }
      const r = this.fac.roomAt(a.pos); if (r && r.contains(a.pos)) a.roomId = r.id;
      if (!a.hasPath) { a.moving = false; if (a.arriveYaw != null) a.yaw = a.arriveYaw; return 'Arrived'; }
      return 'Moving';
    }
    beginTransit(a, door, from, to, id) {
      a.transitT = Math.max(1, door.transit * 0.5); a.transitTo = to.index; a.transitDoor = door.id; a.moving = false;
      if (door.id === 't.liftOld' && id && id !== 'player') {
        const lf = this.anomaly('SCP-LF-122'), alone = !this.active.some(n => n.agent !== a && n.agent.transitDoor === door.id && n.agent.transitT > 0) && !(this.npc(id) && this.npc(id).escortedBy);
        if (lf && lf.def.redirect(this, lf, id, alone)) a.transitTo = this.fac.room('nullfloor').hubNodes[0], a.nullRide = true;
      }
    }
    tickTransit(a, dt) {
      a.transitT -= dt; if (a.transitT > 0) return;
      const tn = this.fac.graph.nodes[a.transitTo]; a.transitT = 0; a.transitDoor = null;
      a.pos = V.copy(tn.pos); a.roomId = tn.roomId;
      if (a.nullRide) { a.nullRide = false; a.clear(); const n = this.active.find(x => x.agent === a); if (n) { n.missing = true; n.missingAt = this.now; n.missingWhere = 'nullfloor'; n.missingFor = this.rng.range(30, 80); n.nextThink = 0; n.addHistory(this.now, 'Служебный лифт привёз на этаж «—»', 'anomaly', 'SCP-LF-122'); } return; }
      a.pi++;
    }
    returnFromNullFloor(n) {
      const lift = this.fac.room('liftOld'); n.missing = false; n.agent.clear(); n.agent.pos = V.copy(lift.hubPoints[0]); n.agent.roomId = lift.id; n.nextThink = 0;
      n.memory.remember({ eventId: -(this.events.nextId++), time: this.now, type: EV.Anomalous, roomId: 'liftOld', subject: n.id, text: 'Лифт привёз меня на этаж без номера. Пустой коридор, лампы, двери без табличек. Я шёл, пока не увидел лифт снова.', imp: 0.9, conf: 1, src: 'Witnessed' }, this.now);
      n.psy.fear = clamp(n.psy.fear + 30, 0, 100); n.restricted = true;
      const lf = this.anomaly('SCP-LF-122'); if (lf) for (const l of lf.st.lost) if (l.who === n.id && l.back == null) l.back = this.now;
      this.events.post({ time: this.now, type: EV.Report, roomId: 'liftOld', actor: n.id, severity: 2, pub: true, text: n.displayName + ' вернулся после ' + durationText(this.now - n.missingAt) + ' отсутствия. Говорит о несуществующем этаже.' });
      this.life.openCase('missing', 'Исчезновение ' + n.shortName + ' в служебном лифте', 'liftOld', { cause: 'anomalous', scp: 'SCP-LF-122' });
      this.life.assign('medical_exam', ['doctor', 'psychiatrist'], { patient: n.id }, 'SCP LIFE', 300, 'medA');
    }
    playerBlocking(a, target) {
      if (this.player.dead) return false;
      const tp = { x: this.player.pos.x - a.pos.x, z: this.player.pos.z - a.pos.z }, d = Math.sqrt(tp.x * tp.x + tp.z * tp.z);
      if (d > 1.1 || d < 0.05 || Math.abs(this.player.pos.y - a.pos.y) > 1) return false;
      const dir = V.normXZ({ x: target.x - a.pos.x, z: target.z - a.pos.z });
      return dir.x * tp.x / d + dir.z * tp.z / d > 0.55;
    }
    faceTowards(a, p, dt) { const dx = p.x - a.pos.x, dz = p.z - a.pos.z; if (dx * dx + dz * dz < 0.0025) return; a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: dx, z: dz }), 360 * dt); }

    // ---------------------------------------------------------------- cameras (record only the real world)
    tickCameras(dt) {
      for (const c of this.cams) { if (!c.operational) continue; c.phase += dt / Math.max(1, c.period); if (c.phase > 1) c.phase -= 1; c.yaw = c.baseYaw + Math.sin(c.phase * Math.PI * 2) * c.sweep; }
      this._scan -= dt; if (this._scan > 0) return; this._scan = 0.5;
      for (const c of this.cams) {
        if (!c.operational || !this.infra.isPowered(c.roomId)) { c.visible = []; continue; }
        const now = [];
        const check = s => { if (s.roomId !== c.roomId || !World.camSees(c, s.pos)) return; now.push(s.id); if (c.visible.indexOf(s.id) < 0) this.sighting(c, s); };
        if (!this.player.dead && this.player.roomId === c.roomId) check({ id: 'player', name: this.player.name, pos: this.player.pos, roomId: this.player.roomId, role: this.player.prof === 'dclass' ? 'DClass' : 'Staff' });
        for (const n of this.roomPeople(c.roomId)) check({ id: n.id, name: n.displayName, pos: n.agent.pos, roomId: n.agent.roomId, role: n.role });
        for (const a of this.anomalies) if (a.arrived && a.agent.roomId === c.roomId && a.model !== 'void') check({ id: a.id, name: a.displayName, pos: a.agent.pos, roomId: a.agent.roomId, anomaly: true });
        c.visible = now;
      }
    }
    static camSees(c, p) { const d = V.sub(p, c.pos), dist = V.lenXZ(d); if (dist > c.range) return false; if (dist < 1) return true; return Math.abs(S.deltaAngle(c.yaw, V.yawFromDir(d))) <= c.fov / 2 + 8; }
    sighting(c, s) {
      const e = { time: this.now, cam: c.id, subj: s.id, name: s.name, roomId: c.roomId, flag: false, note: null };
      const room = this.fac.room(c.roomId);
      if (s.anomaly) { const a = this.anomaly(s.id); if (a && !a.contained && a.temper !== 'cognitive') { e.flag = true; e.note = 'Аномалия вне камеры содержания'; this.alert.reportBreach(this, a, c.roomId, 'камера ' + c.name); } }
      else if (s.role === 'DClass' && room && ['DClassCell', 'DClassCommon', 'MedicalBay', 'Shower', 'TestChamber', 'Observation', 'SecurityPost', 'Tunnel'].indexOf(room.type) < 0) {
        const n = this.npc(s.id); if (!n || !n.escortedBy) { e.flag = true; e.note = 'Класс D вне жилого блока'; this.events.post({ time: this.now, type: EV.SuspiciousActivity, roomId: c.roomId, pos: V.copy(s.pos), actor: s.id, severity: 2, text: 'Камера ' + c.name + ': ' + s.name + ' вне блока D (' + room.name + ')' }); }
      }
      this.camLog.push(e); if (this.camLog.length > 400) this.camLog.splice(0, this.camLog.length - 400);
    }
    roomCovered(id) { return this.cams.some(c => c.roomId === id && c.operational); }

    // ---------------------------------------------------------------- events and memory
    onEvent(e) {
      if (e.hidden) return;
      const room = this.fac.room(e.roomId), imp = clamp(0.15 + e.severity * 0.28, 0, 1); let reporter = null;
      const quiet = e.quiet || e.type === EV.Conversation || e.type === EV.TaskIssued || e.type === EV.TaskCompleted;
      if (!quiet) {
        const mem = (n, wit) => {
          if (n.incap(this.now) || (e.type === EV.DoorDenied && e.actor === n.id)) return;
          n.memory.remember({ eventId: e.id, time: e.time, type: e.type, roomId: e.roomId, subject: e.actor, text: e.text, imp, conf: wit ? 1 : 0.9, src: wit ? 'Witnessed' : 'Announcement', shared: false }, this.now);
          if (wit && e.severity >= 2) { n.needs.stress = Math.min(100, n.needs.stress + 6 * e.severity * (1.2 - n.traits.bravery)); n.psy.fear = clamp(n.psy.fear + 8 * e.severity * (1.2 - n.psy.resilience), 0, 100); }
          if (wit && !reporter && n.role !== 'DClass' && e.severity >= 1 && (e.type === EV.AnomalyBehaviour || e.type === EV.ContainmentWarning) && this.anomaly(e.actor)) reporter = n;
        };
        if (e.pub) { for (const n of this.active) mem(n, !!room && !!this.fac.room(n.agent.roomId) && this.fac.room(n.agent.roomId).canSeeInto(room.id)); }
        else if (room) { const seen = new Set(); for (const rid of [room.id].concat(room.visibleRooms)) for (const n of this.roomPeople(rid)) if (!seen.has(n.id)) { seen.add(n.id); mem(n, true); } }
      }
      if (reporter) this.reportAnomaly(reporter.id, reporter.displayName, e);
      const pr = this.fac.room(this.player.roomId);
      const sees = !this.player.dead && !!pr && !!room && pr.canSeeInto(room.id);
      const own = e.actor === 'player' || e.target === 'player' || e.who === 'player';
      const taskType = e.type === EV.TaskIssued || e.type === EV.TaskCompleted || e.type === EV.TaskFailed;
      if ((e.pub || own || (sees && !taskType && e.type !== EV.DoorDenied && e.type !== EV.Conversation)) && !(e.quiet && !own)) this.notify.push(e);
      if (this.notify.length > 50) this.notify.splice(0, this.notify.length - 50);
    }
    reportAnomaly(id, name, e) {
      const n = this.npc(id), a = this.anomaly(e.actor); if (!a || !a.contained) return;
      if (this.alert.level >= 1 && this.alert.roomId === a.containRoom) return;
      this.life.reportAnomaly(this, id, name, e);
      if (n) n.say('Пост, это ' + name + ': ' + a.id + ' беспокоится, прошу внимания.', this.now);
    }
    canCount(pos, roomId, a) { const r = this.fac.room(roomId); if (!r || !a.agent.roomId || !r.canSeeInto(a.agent.roomId)) return false; return V.distXZ(pos, a.agent.pos) <= 10.5; }
    startCounting(id) {
      const a = this.anomaly(id), p = this.player; if (!a || p.dead || !this.canCount(p.pos, p.roomId, a)) return false;
      p.counting = true; p.countTarget = id; p.countSec = 0;
      this.events.post({ time: this.now, type: EV.CountingProtocol, roomId: p.roomId, pos: V.copy(p.pos), actor: 'player', target: id, severity: 1, text: p.name + ' начинает протокол счёта для ' + a.id });
      return true;
    }
    stopCounting(reason) { if (!this.player.counting) return; this.player.counting = false; this.notify.push({ time: this.now, type: EV.CountingProtocol, actor: 'player', severity: 1, text: 'Протокол счёта прерван: ' + reason }); }
    // sounds the anomalies can hear (separate from the audio queue, which the renderer consumes)
    makeNoise(kind, pos, roomId, loud, by) { this.noise.push({ t: this.realTime, now: this.now, kind, pos: V.copy(pos), roomId, loud: loud == null ? 0.5 : loud, by: by || null }); if (this.noise.length > 40) this.noise.shift(); }
    damagePlayer(amount, src, text) {
      const p = this.player; if (p.dead) return;
      p.health -= amount; p.stunnedUntil = this.realTime + 2.5; p.psy.fear = clamp(p.psy.fear + 40, 0, 100); this.stopCounting('получен удар');
      this.events.post({ time: this.now, type: EV.Injury, roomId: p.roomId, pos: V.copy(p.pos), actor: src, target: 'player', severity: 2, text });
      this.sounds.push({ t: this.now, kind: 'scream', roomId: p.roomId, pos: V.copy(p.pos), cause: 'injury', who: 'player', female: !!p.female }); this.makeNoise('scream', p.pos, p.roomId, 1, 'player');
      if (p.health <= 0) { p.health = 0; p.dead = true; }
    }
    injureNpc(n, amount, src, text, mins) {
      n.needs.health = clamp(n.needs.health - amount, 0, 100); n.needs.stress = clamp(n.needs.stress + 35, 0, 100); n.psy.fear = clamp(n.psy.fear + 50, 0, 100); n.incapUntil = this.now + mins; n.nextThink = 0;
      this.events.post({ time: this.now, type: EV.Injury, roomId: n.agent.roomId, pos: V.copy(n.agent.pos), actor: src, target: n.id, severity: 2, text });
      this.sounds.push({ t: this.now, kind: 'scream', roomId: n.agent.roomId, pos: V.copy(n.agent.pos), cause: 'injury', who: n.id, female: !!n.female }); this.makeNoise('scream', n.agent.pos, n.agent.roomId, 1, n.id);
      this.life.openCase('injury', 'Травма: ' + n.shortName, n.agent.roomId, { cause: 'anomalous', scp: src });
      if (!this.tasks.hasActive('first_aid', n.id)) this.life.assign('first_aid', ['field_medic', 'doctor', 'operative'], { patient: n.id, target: n.id }, 'SCP LIFE', 30, n.agent.roomId);
    }

    // ---------------------------------------------------------------- player
    tickPlayer(dt, gm) {
      const p = this.player; if (p.dead) return;
      const r = this.fac.roomAt(p.pos); if (r) p.roomId = r.id;
      if (p.health < 100 && p.health > 0) p.health = Math.min(100, p.health + gm * 0.05);
      const h = gm / 60, ps = p.psy;
      if (p.sleeping) { ps.fatigue = clamp(ps.fatigue - 16 * h, 0, 100); ps.stress = clamp(ps.stress - 6 * h, 0, 100); }
      else { ps.fatigue = clamp(ps.fatigue + (p.onShift ? 3.5 : 2.5) * h + (this.clock.night ? 1 : 0) * h, 0, 100); ps.stress += (8 + this.alert.level * 6 - ps.stress) * Math.min(1, 0.08 * h); }
      ps.fear = clamp(ps.fear - (this.countIn(p.roomId) > 1 ? 30 : 12) * h * (0.5 + ps.resilience), 0, 100); ps.exposure = clamp(ps.exposure - h, 0, 100);
      ps.focus = clamp(1 - ps.fatigue / 160 - ps.fear / 220 - ps.stress / 320, 0.2, 1);
      if (p.counting) { const t = this.anomaly(p.countTarget); if (!t || !this.canCount(p.pos, p.roomId, t)) this.stopCounting('цель вне зоны видимости'); else p.countSec += dt; }
      // slow zones (LF-131, LF-134)
      p.slow = 1; for (const a of this.anomalies) if (a.arrived && a.def.slowIn) p.slow = Math.min(p.slow, a.def.slowIn(this, a, p.roomId));
      // tasks with "stay" steps progress while the player is in the room
      for (const t of this.tasks.activeFor('player')) { const s = t.steps[t.si]; if (!s || !s.need) continue; const m = /^stay:(\d+)/.exec(s.need); if (m && p.roomId === s.room) { s.stayed = (s.stayed || 0) + gm; if (s.stayed >= +m[1]) this.playerStepDone(t); } if (s.count && p.counting && p.roomId === s.room) { s.stayed = (s.stayed || 0) + gm; } }
      if (p.limitUntil > 0 && p.limitUntil < this.now) { p.limitUntil = -1; this.notify.push({ time: this.now, type: EV.Discipline, text: 'Ограничение допуска снято.' }); }
      const mod = this.clock.mod; if (mod < 1 && p._day !== this.clock.day) { p._day = this.clock.day; p.doneToday = 0; }
    }
    // Generic step progression for the player's duties. Returns the active task step a target matches.
    playerStepFor(test) { for (const t of this.tasks.activeFor('player')) { const s = t.steps[t.si]; if (s && test(s, t)) return { t, s }; } return null; }
    playerStepDone(t) {
      const s = t.steps[t.si]; if (!s) return null;
      if (S.Jobs.stepDone(this, 'player', t, s)) { const note = S.Jobs.finish(this, 'player', t); this.player.doneToday = (this.player.doneToday || 0) + 1; this.tasks.complete(this, t, note); return note || 'выполнено'; }
      return 'шаг выполнен: ' + s.label;
    }
    // A POI or room interaction: does it match the current step of a task?
    stepAtPoi(poi) {
      return this.playerStepFor(s => (!s.need || s.need === 'hold') && ((s.poi && s.poi === poi.id) || (!s.poi && s.poiType && s.poiType === poi.type && s.room === poi.roomId) || (!s.poi && !s.poiType && s.room === poi.roomId)));
    }
    stepInRoom() { return this.playerStepFor(s => (!s.need || s.need === 'hold') && !s.poi && !s.poiType && s.room === this.player.roomId && (!s.pos || V.distXZ(s.pos, this.player.pos) < 2.2)); }
    checkpoint(poiId) {
      const poi = this.fac.poi(poiId); if (!poi) return null;
      this.events.post({ time: this.now, type: EV.PatrolCheckpoint, roomId: poi.roomId, actor: 'player', target: poiId, quiet: true, text: this.player.name + ' отметился на точке «' + poi.label + '»' });
      const m = this.stepAtPoi(poi); if (!m) return 'Точка «' + poi.label + '» отмечена (не входит в текущий маршрут)';
      return this.playerStepDone(m.t);
    }
    viewedCamera(id) {
      const p = this.player; if (p.camsViewed.indexOf(id) < 0) p.camsViewed.push(id);
      const c = this.cams.find(x => x.id === id); if (c) { c.watchedBy = 'player'; c.watchedAt = this.realTime; }
      const m = this.playerStepFor(s => /^cams:/.test(s.need || '') && (p.roomId === s.room || this.fac.roomDistance(p.roomId, s.room) === 0)); if (!m) return;
      m.s.seen = m.s.seen || []; if (m.s.seen.indexOf(id) < 0) m.s.seen.push(id);
      if (m.s.seen.length >= +m.s.need.split(':')[1]) this.playerStepDone(m.t);
      const fa = this.horror.falseAlarms.find(f => !f.explained && f.kind === 'steps' && c && c.roomId === 'corr4'); if (fa) this.horror.explain('steps', fa.cause);
    }
    observe(id, viaCamera) {
      const a = this.anomaly(id); if (!a) return 'Нет данных';
      const rep = a.observe(this, 'player', viaCamera); this.player.addJournal('[' + fmtStamp(this.now) + '] ' + rep);
      this.player.obsNotes = (this.player.obsNotes || []).concat({ scp: id, t: this.now, text: rep }).slice(-10);
      this.events.post({ time: this.now, type: EV.Observation, roomId: this.player.roomId, actor: 'player', target: id, quiet: true, text: this.player.name + ' наблюдает за ' + a.id + (viaCamera ? ' (камера)' : '') });
      if (a.tm && !viaCamera) { a.tm.obsByPlayer = this.now; a.tm.obsThreat = a.threat; }
      const m = this.playerStepFor(s => s.need === 'observe:' + id); if (m) this.playerStepDone(m.t);
      return rep;
    }
    report() {
      const now = this.now, parts = [], p = this.player;
      for (const a of this.anomalies) {
        if (!a.arrived) continue; const last = (p.obsNotes || []).filter(o => o.scp === a.id && now - o.t < 90).pop();
        if (!a.contained && a.detected) { parts.push(a.id + ' вне камеры: тревога уже объявлена'); continue; }
        if (!last) continue;
        if (a.threat >= 45) { this.alert.raise(this, 1, 'Рапорт: беспокойство ' + a.id, a.containRoom); this.life.decide('Рапорт сотрудника', [p.name + ': ' + a.id + ' беспокоен'], 'Жёлтый уровень, внеплановое наблюдение', '—'); if (a.tm) this.life.due.containment = 0; parts.push(a.id + ' беспокоен — передано в SCP LIFE'); }
        else parts.push(a.id + ' в норме');
      }
      const s = parts.length ? parts.join('; ') : 'происшествий нет (свежих наблюдений нет)';
      this.events.post({ time: now, type: EV.Report, roomId: p.roomId, actor: 'player', severity: 1, text: 'Рапорт ' + p.name + ': ' + s });
      for (const t of this.tasks.activeFor('player')) { const st = t.steps[t.si]; if (st && st.look && st.room === p.roomId) this.playerStepDone(t); }
      return s;
    }
    // Player reports something they perceived; SCP LIFE treats it like any other unconfirmed report.
    reportSighting(text) { const p = this.player; const eff = this.horror.playerVisible(); this.life.sighting('player', { roomId: p.roomId, text, kind: eff ? eff.kind : 'unknown', perceived: eff ? eff.src : null }); return 'Сообщение передано диспетчеру. Будет проверено.'; }
    pickUp(cardId) {
      const c = this.card(cardId); if (!c || c.holder) return false;
      c.holder = 'player'; c.room = null; if (this.player.cards.indexOf(c.id) < 0) this.player.cards.push(c.id);
      this.events.post({ time: this.now, type: EV.SuspiciousActivity, roomId: this.player.roomId, actor: 'player', target: cardId, severity: c.owner === 'player' ? 0 : 1, text: this.player.name + ' подбирает ключ-карту L' + c.level + ' · ' + c.ownerName });
      return true;
    }
    talk(id, topic) {
      const n = this.npc(id); if (!n) return ['...'];
      const lines = S.Dialogue.talk(this, n, topic);
      const m = this.playerStepFor(s => s.need === 'talk:' + id || (/^escort:/.test(s.need || '') && s.need === 'escort:' + id));
      if (m) { if (/^escort:/.test(m.s.need)) { n.escortedBy = 'player'; n.followId = 'player'; n.nextThink = 0; lines.push('Пошли, начальник.'); } lines.push('(' + this.playerStepDone(m.t) + ')'); }
      // explanations of ordinary events come from the people involved
      for (const fa of this.horror.falseAlarms) if (!fa.explained && fa.who === id && this.now - fa.t < 120) { lines.push(fa.kind === 'steps' ? 'Я? Да, проходил по тоннелю внизу. Там гулко, слышно на весь сектор.' : 'Рация? Села, не заметил. Извините.'); this.horror.explain(fa.kind, fa.cause); }
      if (n.prof === 'electrician' || n.prof === 'mechanic') for (const fa of this.horror.falseAlarms) if (!fa.explained && (fa.kind === 'outage' || fa.kind === 'knock') && this.now - fa.t < 240) { lines.push(fa.kind === 'outage' ? 'Свет? Это мы на щите работали, по графику.' : 'Стук в вентиляции — трубы греются по ночам. Нормально.'); this.horror.explain(fa.kind, fa.cause); }
      return lines;
    }
    playerTerminal(tab) { const m = this.playerStepFor(s => s.need === 'terminal:' + tab); if (m) return this.playerStepDone(m.t); return null; }
    interview(id) {
      const a = this.anomaly(id); if (!a || !a.def.interview) return 'Объект не отвечает.';
      const txt = a.def.interview(this, a, 'player'); this.player.addJournal('[' + fmtStamp(this.now) + '] ' + a.id + ': «' + txt + '»');
      this.player.obsNotes = (this.player.obsNotes || []).concat({ scp: id, t: this.now, text: txt }).slice(-10);
      const m = this.playerStepFor(s => s.need === 'interview:' + id); if (m) this.playerStepDone(m.t);
      return txt;
    }
    playerExperiment(scp, exp) {
      const a = this.anomaly(scp); if (!a) return null;
      const m = this.playerStepFor(s => s.need === 'experiment' && s.scp === scp && (!s.exp || s.exp === exp));
      if (!m) return null;
      return this.playerStepDone(m.t);
    }

    // ---------------------------------------------------------------- save (v2)
    // Memories repeat the same texts (public announcements are remembered by everyone): store them once.
    static packNpc(o, tbl) {
      const idx = t => { if (t == null) return -1; let i = tbl.map.get(t); if (i === undefined) { i = tbl.list.length; tbl.list.push(t); tbl.map.set(t, i); } return i; };
      const r2 = v => Math.round(v * 100) / 100;
      if (o.x && o.x.obsNotes) o.x.obsNotes = o.x.obsNotes.slice(-3).map(x => ({ scp: x.scp, t: r2(x.t), text: String(x.text).slice(0, 160) }));
      o.m = o.m.map(m => [m.eventId, r2(m.time), m.type, m.roomId || 0, m.subject || 0, idx(m.text), r2(m.imp), r2(m.conf), m.src, m.shared ? 1 : 0, m.toldBy || 0, m.fake || 0, m.perceived || 0]);
      for (const k in o.n) o.n[k] = r2(o.n[k]); for (const k in o.psy) o.psy[k] = r2(o.psy[k]); for (const k in o.rel) o.rel[k] = r2(o.rel[k]);
      return o;
    }
    static unpackNpc(o, strings) {
      o.m = (o.m || []).map(a => { const m = { eventId: a[0], time: a[1], type: a[2], roomId: a[3] || null, subject: a[4] || null, text: a[5] >= 0 ? strings[a[5]] : null, imp: a[6], conf: a[7], src: a[8], shared: !!a[9] }; if (a[10]) m.toldBy = a[10]; if (a[11]) m.fake = a[11]; if (a[12]) m.perceived = a[12]; return m; });
      return o;
    }
    save() {
      const tbl = { list: [], map: new Map() };
      return JSON.stringify({
        version: 2, seed: this.seed, opts: this.opts, clock: this.clock.total, rng: this.rng.state, rt: this.realTime, ev: this.events.recent, evId: this.events.nextId, acc: this.accessLog, cards: this.cards,
        doors: this.fac.doorList.map(d => Object.assign(d.save(), { rf: d.readerFault || false, rs: d.restricted || false })), rooms: this.fac.roomList.map(r => ({ id: r.id, l: r.lightsOn, f: r.flickerUntil, v: r.vacant, n: r.name, s: r.scp })),
        pois: Object.values(this.fac.pois).filter(p => p.owners).map(p => [p.id, p.owners]),
        npcs: this.npcs.map(n => World.packNpc(n.save(), tbl)), strings: tbl.list, anomalies: this.anomalies.map(a => a.save()),
        cams: this.cams.map(c => ({ id: c.id, op: c.operational, ph: c.phase })), camLog: this.camLog.slice(-200), alert: this.alert.save(),
        tasks: this.tasks.list.filter(t => t.status === 'Active' || this.now - t.issued < 360), taskId: this.tasks.nextId, taskDone: this.tasks.done, life: this.life.save(), infra: this.infra.save(), horror: this.horror.save(), dirt: this.dirt.save(),
        player: this.player.save(), research: this.research, food: this.food, queues: this.queues, ai: this.ai ? this.ai.save() : null
      });
    }
    static load(json) {
      const o = JSON.parse(json);
      if (o.version !== 2) throw new Error('Несовместимая версия сохранения (нужна 2.0)');
      const w = S.Content.createWorld(o.seed || 1, Object.assign({}, o.opts || {}, { loading: true }));
      w.clock.total = o.clock; w.rng.state = o.rng; w.realTime = o.rt; w.events.recent = o.ev; w.events.nextId = o.evId; w.accessLog = o.acc; w.cards = o.cards;
      for (const d of o.doors) { const dd = w.fac.door(d.id); if (dd) { dd.load(d); dd.readerFault = d.rf; dd.restricted = d.rs; } }
      for (const r of o.rooms) { const rr = w.fac.room(r.id); if (rr) { rr.lightsOn = r.l; rr.flickerUntil = r.f; rr.vacant = r.v; rr.name = r.n || rr.name; rr.scp = r.s; } }
      for (const p of Object.values(w.fac.pois)) { p.reservedBy = null; }
      for (const [id, ow] of o.pois || []) { const p = w.fac.poi(id); if (p) p.owners = ow; }
      w.active.length = 0;
      for (const n of o.npcs) { const nn = w.npc(n.id); if (!nn) continue; nn.load(World.unpackNpc(n, o.strings || [])); if (nn.onSite) w.active.push(nn); }
      for (const a of o.anomalies) { const aa = w.anomaly(a.id); if (aa) aa.load(w, a); }
      for (const c of o.cams) { const cc = w.cams.find(x => x.id === c.id); if (cc) { cc.operational = c.op; cc.phase = c.ph; } }
      w.camLog = o.camLog; w.alert.load(o.alert); w.tasks.list = o.tasks; w.tasks.nextId = o.taskId; w.tasks.done = o.taskDone || { npc: 0, player: 0, failed: 0 };
      // re-link NPC jobs to board tasks after loading
      for (const n of w.npcs) {
        n.job = null; n.nextThink = 0;
        if (n.taskId) { const t = w.tasks.get(n.taskId); if (t && t.status === 'Active') n.job = t; }
        n.routine = null;
      }
      w.queues = o.queues || {};
      if (w.ai && o.ai) w.ai.load(o.ai);
      w.life.load(o.life); w.infra.load(o.infra); w.horror.load(o.horror); w.dirt.load(o.dirt); w.player.load(o.player); w.research = o.research || w.research; w.food = o.food != null ? o.food : 100;
      w.lockEpoch++;
      return w;
    }
  }
  World.FIXED = FIXED;
  S.World = World; S.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
