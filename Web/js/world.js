/* SCP LIFE 2.0 — the world: simulation loop with LOD tiers, navigation with local avoidance, lanes, door flow, transit,
   stuck recovery and path cache; doors and access; CCTV; events and memory; the player (profession, psyche, career); saves. */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, Hm, fmtTime, fmtStamp, durationText, EV, R, RESULT_TEXT, isSuccess, checkCard, findPath } = S;
  const FIXED = 0.1, REMOTE_DIST = 3, REMOTE_STEP = 1, ABSTRACT_STEP = 5;
  const NARROW = 2.1;
  // local avoidance: candidate headings (radians, the walker's right first after straight on) and speed factors
  const AV_DIRS = [0, -16, 16, -32, 32, -52, 52, -76, 76, -105, 105, -140, 140].map(d => d * Math.PI / 180), AV_SPD = [1, 0.6, 0.3], AV_H = 2.5, AV_HS = 1.0, AV_W = 1.1;
  // time until two discs touch: p = relative position of the other, w = my velocity relative to theirs
  function ttc(px, pz, wx, wz, R) {
    const c = px * px + pz * pz - R * R, b = px * wx + pz * wz;
    if (c < 0) return b > 0 ? 0 : Infinity;
    if (b <= 0) return Infinity;
    const a = wx * wx + wz * wz, disc = b * b - a * c;
    return disc <= 0 ? Infinity : (b - Math.sqrt(disc)) / a;
  }

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
      { const p = this.player, b = this.playerBody(), l = this._ppos; if (b) { b.vx = l ? (p.pos.x - l.x) / dt : 0; b.vz = l ? (p.pos.z - l.z) / dt : 0; if (b.vx * b.vx + b.vz * b.vz > 36) b.vx = b.vz = 0; } this._ppos = { x: p.pos.x, z: p.pos.z }; }
      this.tickDoors(dt);
      this.infra.tick(dt);
      for (const a of this.anomalies) if (!a.carriedBy) a.tick(this, dt, gm);   // a subdued object is being taken back by the MTF
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
      this.resolveCrowd(dt);
      S.Med.tick(this, dt, gm);
      S.Arms.tick(this, dt);
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
    // the corridor the player stands in: non-urgent errands take another route when one exists (empty corridors are part of the horror)
    quietRoom() { const p = this.player; if (p.dead || !p.roomId) return null; const r = this.fac.room(p.roomId); return r && (r.type === 'Corridor' || r.type === 'Tunnel') ? r.id : null; }
    planPath(from, fromRoom, goal, canUse, cacheKey, opt) {
      let start = this.fac.nearestNode(from, fromRoom || (this.fac.roomAt(from) || {}).id);
      if (start < 0) start = this.fac.nearestNode(from, null);
      if (start < 0 || goal < 0) return null;
      // jammed passages (people stuck there recently) cost extra, so others take another route while it lasts
      let jam = null;
      if (this.congest) { let any = false; for (const k in this.congest) { if (this.congest[k] <= this.realTime) delete this.congest[k]; else any = true; } if (any) { const c = this.congest; jam = (f, t) => c[f + '>' + t] ? 25 : 0; } }
      const quiet = opt && opt.quiet, gn = this.fac.graph.nodes;
      // stronger while the horror director builds tension: the corridors around the player go quiet
      const qk = this.horror && (this.horror.state === 'uncertainty' || this.horror.state === 'tension' || this.horror.state === 'paranoia') ? 30 : 12;
      if (quiet) { const j0 = jam; jam = (f, t) => (j0 ? j0(f, t) : 0) + (gn[f].roomId === quiet && gn[t].roomId === quiet ? qk : 0); }
      if (cacheKey) {
        const k = start + '>' + goal + '|' + cacheKey + '|' + this.lockEpoch + '|' + (this.clock.hour >> 2) + (jam ? '|j' + this.congestEpoch + (quiet ? quiet + qk : '') : '');
        if (this._paths.has(k)) { const p = this._paths.get(k); return p ? p.slice() : null; }
        const p = findPath(this.fac, start, goal, canUse, jam); if (this._paths.size > 4000) this._paths.clear(); this._paths.set(k, p); return p ? p.slice() : null;
      }
      return findPath(this.fac, start, goal, canUse, jam);
    }
    // Can this person (with their own card) reach a room? Cached per lock epoch.
    reachable(who, roomId) {
      const n = who === 'player' ? null : (typeof who === 'string' ? this.npc(who) : who); const card = this.card(n ? n.cardId : this.player.selectedCardId()), room = this.fac.room(roomId);
      if (!room || !card) return false; const from = n ? n.agent.pos : this.player.pos, fr = n ? n.agent.roomId : this.player.roomId;
      if (!fr) return true;
      return !!this.planPath(from, fr, room.hubNodes[0], (d, f) => this.canPlanThrough(d, f, card), card.id);
    }
    // ---------------------------------------------------------------- crowd navigation
    // Every person is a disc (radius ≈0.28 m). A step picks a collision-free velocity by sampling reciprocal velocity
    // obstacles; corridors keep to the right; doorways are gated (one or two lanes) with a queue beside the door on each
    // side; people stand at reserved spots instead of one shared waypoint; a hard overlap pass separates bodies every
    // tick. Stuck = no real displacement: ask the way → other side → re-route around the jam → give up the goal.
    // Nobody is teleported to get unstuck.
    playerBody() {
      const p = this.player; if (p.dead || p.hidden || !p.roomId) return null;
      const b = this._pb || (this._pb = { pos: p.pos, vx: 0, vz: 0, radius: 0.3, player: true, transitT: 0, crowd: false }); b.pos = p.pos; return b;
    }
    neighbours(a, range, out) {
      out.length = 0; const ix = Math.floor(a.pos.x / 2), iz = Math.floor(a.pos.z / 2), iy = Math.round(a.pos.y), r2 = range * range;
      for (let x = ix - 1; x <= ix + 1; x++) for (let z = iz - 1; z <= iz + 1; z++) {
        const c = this.grid.get(x + ':' + z + ':' + iy); if (!c) continue;
        for (const o of c) { if (o === a || o.transitT > 0) continue; const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z; if (dx * dx + dz * dz < r2) out.push(o); }
      }
      const pb = this.playerBody();
      if (pb && pb !== a && Math.abs(pb.pos.y - a.pos.y) < 1) { const dx = pb.pos.x - a.pos.x, dz = pb.pos.z - a.pos.z; if (dx * dx + dz * dz < r2) out.push(pb); }
      return out;
    }
    bodiesNear(x, z, y, out) {
      out.length = 0; const ix = Math.floor(x / 2), iz = Math.floor(z / 2), iy = Math.round(y);
      for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++) { const c = this.grid.get(i + ':' + j + ':' + iy); if (c) for (const o of c) if (o.transitT <= 0) out.push(o); }
      return out;
    }
    // sampling RVO: candidate velocities scored by deviation from the preferred one and by time to the first contact
    avoid(a, px, pz, vmax, b) {
      const nb = this.neighbours(a, 2.6, this._nb || (this._nb = []));
      if (!nb.length) return [px, pz];
      // fast path: the preferred velocity is free of contacts within the horizon
      let clear = true;
      for (const o of nb) {
        const rx = o.pos.x - a.pos.x, rz = o.pos.z - a.pos.z, R = a.radius + (o.radius || 0.28) + 0.05 - this.squeeze(a, o), still = o.anchored || o.nudge;
        const ovx = still ? 0 : (o.vx || 0), ovz = still ? 0 : (o.vz || 0);
        if (ttc(rx, rz, px - ovx, pz - ovz, R) < (ovx * ovx + ovz * ovz > 0.02 ? AV_H : AV_HS)) { clear = false; break; }
      }
      if (clear) return [px, pz];
      const pl = Math.sqrt(px * px + pz * pz), base = pl > 1e-3 ? Math.atan2(pz, px) : Math.atan2(a.dir.z || 0, a.dir.x || 1), bias = a.sideBias || 1;
      const sp = Math.min(vmax, Math.max(pl, 0.45)), cvl = Math.sqrt(a.vx * a.vx + a.vz * a.vz);
      let bx = 0, bz = 0, bc = Infinity;
      for (let si = 0; si <= AV_SPD.length; si++) {
        const sf = si < AV_SPD.length ? AV_SPD[si] : 0;
        for (let di = 0; di < AV_DIRS.length; di++) {
          if (sf === 0 && di > 0) break;
          const da = AV_DIRS[di] * bias, an = base + da, cx = Math.cos(an) * sp * sf, cz = Math.sin(an) * sp * sf;
          let inv = 0;
          for (const o of nb) {
            const rx = o.pos.x - a.pos.x, rz = o.pos.z - a.pos.z, R = a.radius + (o.radius || 0.28) + 0.05 - this.squeeze(a, o);
            const still = o.anchored || o.nudge, ovx = still ? 0 : (o.vx || 0), ovz = still ? 0 : (o.vz || 0);
            const mov = ovx * ovx + ovz * ovz > 0.02, recip = o.crowd && !still && mov, H = mov ? AV_H : AV_HS;   // someone standing still is only a short-range concern
            const t = ttc(rx, rz, recip ? 2 * cx - a.vx - ovx : cx - ovx, recip ? 2 * cz - a.vz - ovz : cz - ovz, R);
            if (t < H) { const k = 1 / Math.max(t, 0.04) - 1 / H; if (k > inv) inv = k; }
          }
          const ex = cx - px, ez = cz - pz;
          // hysteresis on the heading only (not on speed): turning away from the current walking direction costs a little
          let cost = Math.sqrt(ex * ex + ez * ez) + AV_W * inv + (da < 0 ? 0.035 : 0) + (sf === 0 ? 0.25 * Math.min(a.stuckN, 4) : 0);   // standing still gets less attractive while stuck
          if (cvl > 0.2 && sf > 0) cost += 0.3 * (1 - (cx * a.vx + cz * a.vz) / (sp * sf * cvl));
          if (b) { const fx = a.pos.x + cx * 0.6, fz = a.pos.z + cz * 0.6; if (fx < b[0] || fx > b[1] || fz < b[2] || fz > b[3]) cost += 0.6; }
          if (cost < bc) { bc = cost; bx = cx; bz = cz; }
        }
      }
      return [bx, bz];
    }
    // right of way: someone passing a doorway (holding its gate) may press past people waiting or standing; a walker may
    // brush past someone just standing around. The overlap pass then moves the others aside.
    squeeze(a, o) {
      if (o.player || o.anchored) return 0;
      if (a.gate && !o.gate) return 0.16;
      if ((!o.hasPath || o.waitingDoor) && !o.nudge) return 0.08;                 // standing around or queueing
      return 0;
    }
    applyVel(a, vx, vz, dt, b) {
      const ax = vx - a.vx, az = vz - a.vz, al = Math.sqrt(ax * ax + az * az), amax = 6 * dt;
      if (al > amax) { vx = a.vx + ax / al * amax; vz = a.vz + az / al * amax; }
      let nx = a.pos.x + vx * dt, nz = a.pos.z + vz * dt;
      if (b) { nx = clamp(nx, Math.min(b[0], a.pos.x), Math.max(b[1], a.pos.x)); nz = clamp(nz, Math.min(b[2], a.pos.z), Math.max(b[3], a.pos.z)); }
      a.vx = (nx - a.pos.x) / dt; a.vz = (nz - a.pos.z) / dt; a.pos.x = nx; a.pos.z = nz;
    }
    roomBounds(a, room) {
      if (!room) return null; const r = a.radius || 0.28;
      let x0 = room.minX + r, x1 = room.maxX - r, z0 = room.minZ + r, z1 = room.maxZ - r;
      if (x0 > x1) x0 = x1 = (room.minX + room.maxX) / 2; if (z0 > z1) z0 = z1 = (room.minZ + room.maxZ) / 2;
      return [x0, x1, z0, z1];
    }
    walkBounds(a, door, tn) {
      if (door) { const h = Math.max(0.04, door.width / 2 - (a.radius || 0.28) - 0.02), f = 3.2; return door.alongX ? [door.pos.x - f, door.pos.x + f, door.pos.z - h, door.pos.z + h] : [door.pos.x - h, door.pos.x + h, door.pos.z - f, door.pos.z + f]; }
      if (!tn || tn.roomId === a.roomId) return this.roomBounds(a, this.fac.room(a.roomId));
      return null;
    }
    // walk to a free point with local avoidance (queues, stepping aside, standing spots)
    stepTowards(a, x, z, tol, vmax, dt, b) {
      const dx = x - a.pos.x, dz = z - a.pos.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d <= tol) { this.applyVel(a, 0, 0, dt, b); return true; }
      const s = Math.min(vmax, 0.2 + d * 1.5), v = this.avoid(a, dx / d * s, dz / d * s, vmax, b);
      a.want = { x: dx / d, z: dz / d }; this.applyVel(a, v[0], v[1], dt, b); return false;
    }
    // ---- doorway gates
    routeDoor(a) {
      if (!a.hasNodes) return null;
      const g = this.fac.graph, nodes = g.nodes, tn = nodes[a.path[a.pi]], prev = a.pi > 0 ? nodes[a.path[a.pi - 1]] : null;
      if (prev) {
        const e = g.find(prev.index, tn.index);
        if (e && e.doorId) {
          const d = this.fac.doors[e.doorId]; if (d.isTransit) return null;
          const ox = tn.pos.x - d.pos.x, oz = tn.pos.z - d.pos.z, ol = Math.sqrt(ox * ox + oz * oz) || 1;
          return { door: d, side: prev.roomId, crossing: true, passed: ((a.pos.x - d.pos.x) * ox + (a.pos.z - d.pos.z) * oz) / ol > 0.35 };
        }
      }
      if (tn.kind === 'door' && a.pi + 1 < a.path.length) {
        const nx = nodes[a.path[a.pi + 1]], e = g.find(tn.index, nx.index);
        if (e && e.doorId) { const d = this.fac.doors[e.doorId]; if (!d.isTransit) return { door: d, side: tn.roomId, crossing: false, passed: false }; }
      }
      return null;
    }
    gateTry(d, side, id, a, crossing) {
      const G = d.gate || (d.gate = { occ: [], q: [], at: -1, passed: 0, waits: 0 }), now = this.realTime;
      if (G.at !== now) { G.at = now; G.occ = G.occ.filter(x => now - x.t < 0.5); G.q = G.q.filter(x => now - x.t < 0.5); }
      const me = G.occ.find(x => x.id === id); if (me) { me.t = now; return true; }
      let same = 0, other = 0; for (const x of G.occ) if (x.side === side) same++; else other++;
      const lanes = Math.max(1, Math.floor(d.width / 0.8)), myq = G.q.find(x => x.id === id);
      let ok = crossing || (lanes === 1 ? other === 0 && same < 2 : other < lanes && same < lanes);
      // the other side has waited long enough: stop letting people in from this side
      if (ok && !crossing) for (const x of G.q) if (x.side !== side && now - x.since > 4 && (!myq || x.since < myq.since)) { ok = false; break; }
      // first come, first served on this side
      if (ok && !crossing) for (const x of G.q) if (x.side === side && x.id !== id && (!myq || x.since < myq.since || (x.since === myq.since && x.id < id))) { ok = false; break; }
      if (ok) { G.occ.push({ id, side, t: now }); if (myq) G.q.splice(G.q.indexOf(myq), 1); a.gate = d.id; G.passed++; return true; }
      if (myq) myq.t = now; else { G.q.push({ id, side, t: now, since: now }); G.waits++; }
      return false;
    }
    gateRelease(a, id) {
      const d = a.gate ? this.fac.doors[a.gate] : null; a.gate = null; if (!d || !d.gate) return;
      const i = d.gate.occ.findIndex(x => x.id === id); if (i >= 0) d.gate.occ.splice(i, 1);
    }
    gateSpot(d, side, id) {
      const G = d.gate, mine = G.q.filter(x => x.side === side).sort((p, q) => p.since - q.since || (p.id < q.id ? -1 : 1));
      const k = Math.max(0, mine.findIndex(x => x.id === id)), room = this.fac.room(side), ap = this.fac.graph.nodes[d.nodeOn(side)].pos;
      let ux = ap.x - d.pos.x, uz = ap.z - d.pos.z; const ul = Math.sqrt(ux * ux + uz * uz) || 1; ux /= ul; uz /= ul;
      const lx = -uz, lz = ux, file = k % 2 ? -1 : 1, row = k >> 1, lat = d.width / 2 + 0.5 + row * 0.66, m = 0.35;
      let x = d.pos.x + ux * 0.6 + lx * file * lat, z = d.pos.z + uz * 0.6 + lz * file * lat;
      if (x < room.minX + m || x > room.maxX - m || z < room.minZ + m || z > room.maxZ - m) { x = d.pos.x + ux * (1.6 + row * 0.7) + lx * file * 0.85; z = d.pos.z + uz * (1.6 + row * 0.7) + lz * file * 0.85; }
      return { x: clamp(x, room.minX + m, room.maxX - m), z: clamp(z, room.minZ + m, room.maxZ - m) };
    }
    congestEdge(from, to, sec) { const c = this.congest || (this.congest = {}); c[from + '>' + to] = this.realTime + (sec || 20); this.congestEpoch = (this.congestEpoch || 0) + 1; }
    // a doorway or a narrow corridor: no room to walk around the player
    tight(a, door) {
      if (door) return true; for (const id of (this.fac.room(a.roomId) || { doorIds: [] }).doorIds) if (V.distXZ(this.fac.doors[id].pos, a.pos) < 1.6) return true;
      const r = this.fac.room(a.roomId); return !!r && Math.min(r.width, r.depth) < 2.3;
    }
    // people standing in the way step aside
    askWay(a) {
      const w = a.want; if (!w) return;
      for (const o of this.neighbours(a, 1.4, this._nb2 || (this._nb2 = []))) {
        if (o.player || o.anchored || o.transitT > 0 || o.nudge || (o.hasPath && !o.waitingDoor)) continue;
        const rx = o.pos.x - a.pos.x, rz = o.pos.z - a.pos.z, d = Math.sqrt(rx * rx + rz * rz) || 1; if ((rx * w.x + rz * w.z) / d < 0.2) continue;
        const sgn = rx * w.z - rz * w.x >= 0 ? 1 : -1;
        o.nudge = { x: o.pos.x + w.z * sgn * 0.8, z: o.pos.z - w.x * sgn * 0.8, until: this.realTime + 2.5 };
      }
    }
    // ---- standing spots: a room holds as many standing people as it has free places, each place reserved by one person
    navBlocks(room) {
      if (room._blocks) return room._blocks;
      const b = [], R = (cx, cz, sx, sz) => b.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
      const cx = (room.minX + room.maxX) / 2, cz = (room.minZ + room.maxZ) / 2;
      switch (room.type) {
        case 'Canteen': if (room.id === 'canteen') { for (const tx of [-12.6, -5.8]) for (const tz of [5.5, 8.5]) R(tx, tz, 2.4, 1.0); R(-9.15, 11.85, 8.7, 0.8); R(-14.45, 10.6, 0.9, 0.8); } break;
        case 'Meeting': R(cx, cz, 3.6, 1.3); break;
        case 'Kitchen': R(cx, room.minZ + 0.6, room.width - 2, 0.6); break;
        case 'Dock': for (let i = 0; i < 4; i++) R(room.minX + 2 + i * 1.6, room.minZ + 1.2, 1.2, 1.0); break;
      }
      for (const p of room.pois) {
        const f = V.dirFromYaw(p.yaw || 0), ax = p.pos.x + f.x * 0.6, az = p.pos.z + f.z * 0.6;
        if (p.type === 'Desk' || p.type === 'Console' || p.type === 'GuardPost' || p.type === 'Workbench') R(ax, az, Math.abs(f.x) > 0.5 ? 0.8 : 1.3, Math.abs(f.x) > 0.5 ? 1.3 : 0.8);
        else if (p.type === 'Bed' || p.type === 'CellBunk' || p.type === 'MedBed') R(p.pos.x, p.pos.z, Math.abs(f.x) > 0.5 ? 2.0 : 1.0, Math.abs(f.x) > 0.5 ? 1.0 : 2.0);
      }
      if (this.navColliders) for (const c of this.navColliders) if (Math.abs(c.lv - room.floorY) < 1 && c.x1 > room.minX + 0.2 && c.x0 < room.maxX - 0.2 && c.z1 > room.minZ + 0.2 && c.z0 < room.maxZ - 0.2 && (c.x1 - c.x0) < room.width * 0.8 && (c.z1 - c.z0) < room.depth * 0.8) b.push(c);
      room._blocks = b; return b;
    }
    setNavColliders(cs) { this.navColliders = cs; for (const r of this.fac.roomList) { r._blocks = null; r._spots = null; } this._spotOf = {}; }
    spotsOf(room) {
      if (room._spots) return room._spots;
      const out = [], blocks = this.navBlocks(room), m = 0.5, cor = room.type === 'Corridor' || room.type === 'Tunnel', g = this.fac.graph;
      const inBlock = (x, z, e) => { for (const b of blocks) if (x > b.x0 - e && x < b.x1 + e && z > b.z0 - e && z < b.z1 + e) return true; return false; };
      const ok = (x, z, hx, hz) => {
        if (x < room.minX + m || x > room.maxX - m || z < room.minZ + m || z > room.maxZ - m || inBlock(x, z, 0.35)) return false;
        for (const p of room.pois) { const e = p.type === 'Seat' || p.type === 'Stand' || p.type === 'PatrolPoint' || p.type === 'Panel' ? 0.6 : 0.8; if ((p.pos.x - x) * (p.pos.x - x) + (p.pos.z - z) * (p.pos.z - z) < e * e) return false; }
        for (const id of room.doorIds) {
          const d = this.fac.doors[id]; if ((d.pos.x - x) * (d.pos.x - x) + (d.pos.z - z) * (d.pos.z - z) < 1.9 * 1.9) return false;
          const nn = d.nodeOn(room.id); if (nn >= 0) { const q = g.nodes[nn].pos; if ((q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < 1.0) return false; }
        }
        for (const s of out) if ((s.x - x) * (s.x - x) + (s.z - z) * (s.z - z) < 0.74) return false;
        // a straight walk from the hub must not cross furniture
        const L = Math.sqrt((x - hx) * (x - hx) + (z - hz) * (z - hz)); for (let t = 0.25; t < L; t += 0.25) if (inBlock(hx + (x - hx) * t / L, hz + (z - hz) * t / L, 0.25)) return false;
        return true;
      };
      const add = (x, z) => { const hub = this.fac.nearestHub(room, V.v(x, room.floorY, z)); out.push({ x, z, y: room.floorY, hub, room: room.id, by: null }); };
      if (cor) {
        const alongX = room.width >= room.depth, half = (alongX ? room.depth : room.width) / 2, off = half - 0.55;
        if (off >= 0.55) {
          const L0 = alongX ? room.minX : room.minZ, L1 = alongX ? room.maxX : room.maxZ, c = alongX ? (room.minZ + room.maxZ) / 2 : (room.minX + room.maxX) / 2;
          for (let t = L0 + 0.8; t <= L1 - 0.8; t += 1.1) for (const sg of [1, -1]) { const x = alongX ? t : c + sg * off, z = alongX ? c + sg * off : t, hx = alongX ? t : c, hz = alongX ? c : t; if (ok(x, z, hx, hz)) add(x, z); }
        }
      } else {
        for (const h of room.hubPoints) for (const [rad, n] of [[0, 1], [0.86, 6], [1.72, 11], [2.58, 16], [3.44, 21]]) for (let i = 0; i < n; i++) {
          const an = i / n * Math.PI * 2 + rad, x = h.x + Math.cos(an) * rad, z = h.z + Math.sin(an) * rad; if (ok(x, z, h.x, h.z)) add(x, z);
        }
      }
      room._spots = out; room.standCap = out.length + room.pois.length; return out;
    }
    spotValid(s) {
      const n = this.npc(s.by); return !!n && n.onSite && !n.missing && (this._spotOf || {})[n.id] === s && (n.targetRoom === s.room || n.agent.roomId === s.room);
    }
    claimSpot(id, room, near) {
      this.releaseSpot(id); if (!room) return null;
      const spots = this.spotsOf(room), free = [];
      for (const s of spots) if (!s.by || s.by === id || !this.spotValid(s)) free.push(s);
      if (!free.length) return null;
      let s;
      if (near) { free.sort((p, q) => ((p.x - near.x) ** 2 + (p.z - near.z) ** 2) - ((q.x - near.x) ** 2 + (q.z - near.z) ** 2)); s = free[this.rng.int(0, Math.min(3, free.length))]; }
      else s = free[this.rng.int(0, free.length)];
      s.by = id; (this._spotOf || (this._spotOf = {}))[id] = s; return s;
    }
    releaseSpot(id) { const m = this._spotOf; if (!m) return; const s = m[id]; if (s && s.by === id) s.by = null; delete m[id]; }
    roomFull(room) { if (!room) return true; const sp = this.spotsOf(room); let used = 0; for (const s of sp) if (s.by && this.spotValid(s)) used++; return used >= sp.length && room.pois.every(p => p.reservedBy); }
    // ---- hard overlap pass, idle turning, stepping aside (after every brain update)
    resolveCrowd(dt) {
      // people near the player are resolved every tick, people in far rooms (moved once a second) every tenth tick
      const list = this._bodies || (this._bodies = []); list.length = 0; const cg = this._cg || (this._cg = new Map()); cg.clear();
      const all = (this._rc = ((this._rc || 0) + 1) % 10) === 0, CK = (x, z, y) => (x * 4099 + z) * 32 + ((Math.round(y) + 16) & 31);
      for (const n of this.active) {
        const a = n.agent; if (a.transitT > 0 || !a.roomId || n.missing) continue;
        const idle = !a.hasPath && !a.final; let anch = idle && (n.posture === 'Sitting' || n.posture === 'Lying' || n.posture === 'Down' || n.posture === 'Counting');
        if (idle && !anch && n.reservedPoi && n.arrived) { const p = this.fac.pois[n.reservedPoi]; anch = !!p && Math.abs(p.pos.x - a.pos.x) + Math.abs(p.pos.z - a.pos.z) < 0.35; }
        a.anchored = anch; a.iter = all || !this.isRemote(a.roomId);
        if (idle && !a.nudge) { a.vx *= 0.5; a.vz *= 0.5; }
        a._i = list.length; list.push(a);
        const k = CK(Math.floor(a.pos.x / 1.5), Math.floor(a.pos.z / 1.5), a.pos.y); let c = cg.get(k); if (!c) cg.set(k, c = []); c.push(a);
      }
      for (const a of list) {
        if (a.nudge) {
          if ((a.hasPath && !a.waitingDoor) || a.anchored || this.realTime > a.nudge.until || !a.iter) { a.nudge = null; if (!a.hasPath) { a.moving = false; a.vx = a.vz = 0; } }
          else { const done = this.stepTowards(a, a.nudge.x, a.nudge.z, 0.12, 0.9, dt, this.roomBounds(a, this.fac.room(a.roomId))); a.moving = !done; if (done) { a.nudge = null; a.vx = a.vz = 0; } }
        }
        if (a.yawGoal != null && !a.moving) { a.yaw = a.iter ? S.moveTowardsAngle(a.yaw, a.yawGoal, 300 * dt) : a.yawGoal; if (Math.abs(((a.yaw - a.yawGoal) % 360 + 540) % 360 - 180) < 1) a.yawGoal = null; }
      }
      const pb = this.playerBody(), touched = this._touched || (this._touched = []); touched.length = 0;
      for (let it = 0; it < 2; it++) {
        for (const a of list) {
          if (!a.iter) continue;
          const ix = Math.floor(a.pos.x / 1.5), iz = Math.floor(a.pos.z / 1.5);
          for (let x = ix - 1; x <= ix + 1; x++) for (let z = iz - 1; z <= iz + 1; z++) {
            const c = cg.get(CK(x, z, a.pos.y)); if (!c) continue;
            for (let j = 0; j < c.length; j++) {
              const b = c[j]; if (b === a || (b.iter && b._i <= a._i)) continue;
              const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, R = a.radius + b.radius, d2 = dx * dx + dz * dz;
              if (d2 >= R * R || Math.abs(a.pos.y - b.pos.y) > 1) continue;
              const ma = a.anchored ? 0 : a.gate ? 0.3 : a.moving ? 0.6 : 1, mb = b.anchored ? 0 : b.gate ? 0.3 : b.moving ? 0.6 : 1; if (ma + mb === 0) continue;
              let d = Math.sqrt(d2), ux, uz;
              if (d < 1e-4) { const h = (a._i * 2.399963 + b._i * 0.7) % (Math.PI * 2); ux = Math.cos(h); uz = Math.sin(h); d = 0; } else { ux = dx / d; uz = dz / d; }
              const pen = Math.min(R - d, 0.1), sa = pen * ma / (ma + mb), sb = pen * mb / (ma + mb);
              a.pos.x -= ux * sa; a.pos.z -= uz * sa; b.pos.x += ux * sb; b.pos.z += uz * sb;
              if (sa && !a._t) { a._t = true; touched.push(a); } if (sb && !b._t) { b._t = true; touched.push(b); }
            }
          }
          if (pb && !a.anchored && Math.abs(pb.pos.y - a.pos.y) < 1) {
            const dx = a.pos.x - pb.pos.x, dz = a.pos.z - pb.pos.z, R = a.radius + pb.radius, d2 = dx * dx + dz * dz;
            if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2), pen = Math.min(R - d, 0.1); a.pos.x += dx / d * pen; a.pos.z += dz / d * pen; if (!a._t) { a._t = true; touched.push(a); } }
          }
        }
      }
      // pushed people stay inside walls (a doorway is part of both rooms)
      for (const a of touched) {
        a._t = false; const room = this.fac.room(a.roomId); if (!room) continue; let inDoor = false;
        for (const id of room.doorIds) { const d = this.fac.doors[id]; if (!d.isTransit && Math.abs(d.pos.x - a.pos.x) + Math.abs(d.pos.z - a.pos.z) < 1.4) { inDoor = true; break; } }
        if (inDoor) continue; const b = this.roomBounds(a, room); a.pos.x = clamp(clamp(a.pos.x, b[0], b[1]), a.pos.x - 0.12, a.pos.x + 0.12); a.pos.z = clamp(clamp(a.pos.z, b[2], b[3]), a.pos.z - 0.12, a.pos.z + 0.12);
      }
    }
    moveAgent(a, dt, onDoor, o) {
      o = o || {};
      if (o.id && !o.remote && dt > 0.15) dt = 0.15;   // catch-up time after a far room is not walked in one leap
      if (!a.hasPath) { a.moving = false; a.vx = a.vz = 0; return 'Idle'; }
      const g = this.fac.graph, nodes = g.nodes, crowd = !!o.id && !o.remote;
      const vmax = a.speed * (a.slow || 1); a.slow = 1; a.crowd = crowd; a.doorCd -= dt; a.yawGoal = null;
      let rem = dt, guard = 0, waiting = null, faceTo = null, status = 'Moving';
      // doorway ahead: enter only with a free place in it; otherwise queue beside the door
      let qd = null;
      if (crowd) {
        const rd = this.routeDoor(a);
        if (a.gate && (!rd || rd.door.id !== a.gate || rd.passed)) this.gateRelease(a, o.id);
        // whoever already stands in the queue stays in it (no flicker at the edge of the zone)
        if (rd && !rd.passed && (rd.crossing || V.distXZ(a.pos, rd.door.pos) < 2.3 || (a.queuedAt === rd.door.id && V.distXZ(a.pos, rd.door.pos) < 6)) && !this.gateTry(rd.door, rd.side, o.id, a, rd.crossing)) qd = rd;
        a.queuedAt = qd ? qd.door.id : null;
      }
      if (qd && a.nudge) { a.waitingDoor = qd.door.id; a.wait += dt; return 'Waiting'; }
      if (qd) {
        const sp = this.gateSpot(qd.door, qd.side, o.id);
        a.waitingDoor = qd.door.id; a.wait += dt; waiting = 'queue'; faceTo = qd.door.pos;
        this.stepTowards(a, sp.x, sp.z, 0.15, vmax * 0.8, dt, this.roomBounds(a, this.fac.room(qd.side)));
        if (a.wait > 30) { a.wait = 0; this.congestEdge(qd.door.nodeA, qd.door.nodeB); this.congestEdge(qd.door.nodeB, qd.door.nodeA); status = 'Replan'; } else status = 'Waiting';
      } else while (rem > 1e-5 && a.hasPath && guard++ < 16) {
        if (crowd && a.pi === 0 && a.path.length > 1) {
          const n0 = nodes[a.path[0]], n1 = nodes[a.path[1]], e = g.find(n0.index, n1.index);
          if (n1.roomId === a.roomId && n0.roomId === a.roomId && !(e && e.doorId)) a.pi = 1;
        }
        let tx, tz, tol, door = null, tn = null, prev = null, last;
        if (a.hasNodes) {
          const ti = a.path[a.pi]; tn = nodes[ti]; prev = a.pi > 0 ? nodes[a.path[a.pi - 1]] : null;
          if (prev) { const e = g.find(prev.index, ti); if (e && e.doorId) door = this.fac.doors[e.doorId]; }
          if (door) {
            if (door.isTransit) { this.beginTransit(a, door, prev, tn, o.id); if (crowd) this.gateRelease(a, o.id); return 'Moving'; }
            if (!door.passable && V.distXZ(a.pos, prev.pos) < 0.8) {
              a.moving = false; a.vx = a.vz = 0; a.waitingDoor = door.id; a.wait += dt; this.faceTowards(a, door.pos, dt);
              const out = onDoor ? onDoor(door, prev.roomId) : 'Blocked';
              return out === 'Blocked' ? 'Blocked' : 'Waiting';
            }
          }
          last = a.pi === a.path.length - 1 && !a.final; tx = tn.pos.x; tz = tn.pos.z;
          tol = !crowd ? 0 : last ? 0.1 : door ? 0.65 : tn.kind === 'door' ? 0.3 : tn.kind === 'hub' ? 0.8 : 0.25;
        } else { tx = a.final.x; tz = a.final.z; tol = crowd ? 0.12 : 0; last = true; }
        a.waitingDoor = null; a.wait = 0;
        // yield to the player where there is no room to walk around them
        if (o.yieldPlayer && this.playerBlocking(a, { x: tx, z: tz }) && (!crowd || this.tight(a, door))) {
          a.blocked += dt; if (a.blocked < 3.5) { waiting = 'player'; faceTo = this.player.pos; status = 'Waiting'; if (crowd) this.applyVel(a, 0, 0, rem, null); else a.moving = false; break; }
        } else a.blocked = 0;
        const dx = tx - a.pos.x, dz = tz - a.pos.z, dist = Math.sqrt(dx * dx + dz * dz), step = vmax * rem;
        const soft = !crowd && !last && tn && tn.kind === 'hub' && !door;
        if (dist <= tol || (!crowd && (dist <= step || (soft && dist < 0.7)))) {
          if (crowd) { if (last) { a.pos.x = tx; a.pos.z = tz; } }       // the last few centimetres onto a reserved point
          else if (!soft) { a.pos = V.v(tx, tn ? tn.pos.y : a.pos.y, tz); rem -= vmax > 0 ? dist / vmax : rem; }
          else rem = Math.max(0, rem - dist / Math.max(0.1, vmax));
          if (tn) { a.roomId = tn.roomId; a.pos.y = tn.pos.y; a.pi++; } else a.final = null;
          continue;
        }
        let mx = dx / dist, mz = dz / dist;
        if (!crowd) {
          let nx = a.pos.x + mx * step, nz = a.pos.z + mz * step;
          if (!door && tn && tn.roomId === a.roomId) { const r = this.fac.room(a.roomId); if (r) { nx = clamp(nx, r.minX + 0.3, r.maxX - 0.3); nz = clamp(nz, r.minZ + 0.3, r.maxZ - 0.3); } }
          a.vx = (nx - a.pos.x) / rem; a.vz = (nz - a.pos.z) / rem;
          a.pos = V.v(nx, a.pos.y, nz); a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: mx, z: mz }), 540 * rem); a.moving = true; rem = 0; break;
        }
        const room = this.fac.room(a.roomId);
        if (prev && !door && tn.kind !== 'poi' && room && (room.type === 'Corridor' || room.type === 'Tunnel')) {
          // keep to the right of the walking direction; the lane fades out near the waypoint so it is still reached
          const sx = tn.pos.x - prev.pos.x, sz = tn.pos.z - prev.pos.z, sl = Math.sqrt(sx * sx + sz * sz) || 1, rx = sz / sl, rz = -sx / sl;
          const lane = clamp(Math.min(room.width, room.depth) * 0.19, 0, 0.75) * clamp((dist - 0.6) / 2.4, 0, 1), err = (a.pos.x - prev.pos.x) * rx + (a.pos.z - prev.pos.z) * rz;
          mx += rx * (lane - err) * 0.7; mz += rz * (lane - err) * 0.7;
        } else if (door) {
          // a two-lane doorway is used on the right half, a single-lane one in the middle
          const rx = mz, rz = -mx, lane = door.width >= 1.5 ? Math.min(0.26, door.width / 2 - a.radius - 0.06) * clamp(dist - 0.3, 0, 1) : 0, err = (a.pos.x - door.pos.x) * rx + (a.pos.z - door.pos.z) * rz;
          mx += rx * (lane - err) * 0.9; mz += rz * (lane - err) * 0.9;
        }
        const l = Math.sqrt(mx * mx + mz * mz) || 1; mx /= l; mz /= l;
        const spd = last ? Math.min(vmax, 0.25 + dist * 1.6) : vmax, bnd = this.walkBounds(a, door, tn);
        const v = this.avoid(a, mx * spd, mz * spd, vmax, bnd);
        this.applyVel(a, v[0], v[1], rem, bnd); a.want = { x: mx, z: mz }; rem = 0;
      }
      if (crowd) {
        const s2 = a.vx * a.vx + a.vz * a.vz;
        if (s2 > 0.36 && !waiting) {
          // the body faces a smoothed heading: walking direction blended with the goal direction; when dodging sideways
          // or backing off in a crowd the person keeps facing the goal instead of turning with every small push
          const sp = Math.sqrt(s2), ux = a.vx / sp, uz = a.vz / sp, w2 = a.want; let hx = ux, hz = uz;
          if (w2) { const dot = ux * w2.x + uz * w2.z; if (dot < 0.4) { hx = w2.x; hz = w2.z; } else { hx = ux + w2.x * 1.2; hz = uz + w2.z * 1.2; } }
          const hd = a.hd || (a.hd = { x: hx, z: hz }); hd.x += (hx - hd.x) * 0.25; hd.z += (hz - hd.z) * 0.25;
          a.dir = { x: hd.x, z: hd.z }; a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir(a.dir), 270 * dt);
        }
        else if (faceTo) this.faceTowards(a, faceTo, dt);
        else if (a.want && s2 > 0.01) a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir(a.want), 180 * dt);
        a.moving = s2 > 0.04;
        // progress watchdog on real displacement (deliberate waiting does not count)
        if (!waiting && a.hasPath) {
          a.stT += dt;
          if (a.stT >= 1) {
            const tgt = a.hasNodes ? nodes[a.path[a.pi]].pos : a.final, dNow = tgt ? Math.sqrt((tgt.x - a.pos.x) ** 2 + (tgt.z - a.pos.z) ** 2) : 0;
            const prog = !a.stP || a.stP.pi !== a.pi || a.stP.f !== a.final ? 1 : a.stP.d - dNow; a.stT = 0; a.stP = { d: dNow, pi: a.pi, f: a.final };
            if (prog < 0.3) a.stuckN++; else a.stuckN = 0;
            if (a.stuckN >= 1) this.askWay(a);
            if (a.stuckN === 2) a.sideBias = -(a.sideBias || 1);
            const tp = a.path.length ? nodes[a.path[a.path.length - 1]] : null, end = a.final || (tp && tp.pos), lastLeg = a.final ? !a.hasNodes : a.pi === a.path.length - 1;
            if (a.stuckN >= 3 && lastLeg && end && V.distXZ(end, a.pos) < 1.4 && !(tp && tp.kind === 'poi' && !a.final)) { a.path = []; a.pi = 0; a.final = null; a.stuckN = 0; }  // close enough: stand here
            else if (a.stuckN === 4) { if (a.hasNodes && a.pi > 0) this.congestEdge(a.path[a.pi - 1], a.path[a.pi]); status = 'Replan'; }
            else if (a.stuckN >= 8) { a.stuckN = 0; status = 'Stuck'; }
          }
        } else { a.stT = 0; a.stP = null; }
      } else if (!a.hasPath) a.vx = a.vz = 0;
      const r = this.fac.roomAt(a.pos); if (r && r.contains(a.pos)) a.roomId = r.id;
      if (!a.hasPath) {
        a.moving = false; a.vx = a.vz = 0; a.stuckN = 0;
        if (a.arriveYaw != null) { if (crowd) a.yawGoal = a.arriveYaw; else a.yaw = a.arriveYaw; }
        if (crowd) this.gateRelease(a, o.id); return 'Arrived';
      }
      return status;
    }
    freeLanding(tn, me) {
      const room = this.fac.room(tn.roomId), busy = (x, z) => { for (const n of this.active) { const o = n.agent; if (o === me || o.transitT > 0 || o.roomId !== tn.roomId) continue; if ((o.pos.x - x) ** 2 + (o.pos.z - z) ** 2 < 0.36) return true; } return false; };
      if (!busy(tn.pos.x, tn.pos.z) || !room) return V.copy(tn.pos);
      for (const rad of [0.65, 1.2, 1.75]) for (let i = 0; i < 8; i++) {
        const an = i / 8 * Math.PI * 2, x = clamp(tn.pos.x + Math.cos(an) * rad, room.minX + 0.3, room.maxX - 0.3), z = clamp(tn.pos.z + Math.sin(an) * rad, room.minZ + 0.3, room.maxZ - 0.3);
        if (!busy(x, z)) return V.v(x, tn.pos.y, z);
      }
      return V.copy(tn.pos);
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
      a.pos = this.freeLanding(tn, a); a.roomId = tn.roomId;
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
    faceTowards(a, p, dt) { a.yawGoal = null; const dx = p.x - a.pos.x, dz = p.z - a.pos.z; if (dx * dx + dz * dz < 0.12) return; a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: dx, z: dz }), 360 * dt); }

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
    // harm goes through the medical model (kinds of injury, bleeding, unconsciousness, death, witnesses)
    damagePlayer(amount, src, text, kind, o) { if (this.player.dead) return null; return S.Med.hurt(this, 'player', amount, kind || 'blunt', src, text, o); }
    injureNpc(n, amount, src, text, mins, kind, o) { if (!n || n.dead) return null; return S.Med.hurt(this, n.id, amount, kind || 'anomalous', src, text, Object.assign({ mins }, o || {})); }

    // Continue the same world as another person after the player character died: the body of the former character stays
    // where it fell (found, examined, carried to the morgue like anyone else's); the chosen person leaves the NPC simulation.
    takeOver(id) {
      const n = this.npc(id), p = this.player; if (!n || n.dead || n.incap(this.now)) return false;
      const md = S.Med.M(this), gen = (md.played = (md.played || 0) + 1), oldName = p.name;
      for (const b of md.bodies) if (b.who === 'player') b.who = 'ex' + gen;
      const journal = p.journal.slice(-30), rep = p.rep;
      p.counting = false; p.dead = false; p.wounds = (n.wounds || []).map(k => Object.assign({}, k)); p.unconUntil = 0; p.assignedScps = []; p.cards = [];
      S.Content.setupPlayer(this, { prof: n.prof, first: n.first, last: n.last, female: n.female, mode: p.mode });
      if (n.role === 'DClass') { p.title = n.callsign; p.name = n.callsign; } else { p.title = n.title; p.name = n.displayName; }
      const c = this.card('card.player'); if (c) c.ownerName = p.name;
      p.pos = V.copy(n.agent.pos); p.roomId = n.agent.roomId; p.yaw = n.agent.yaw; p.health = Math.max(20, n.needs.health); p.psy = Object.assign({}, n.psy);
      p.bedPoi = n.bedPoi; p.homeRoom = n.homeRoom || p.homeRoom; p.hallRoom = n.hallRoom || p.hallRoom; p.workRoom = n.workRoom || p.workRoom; p.post = n.post || p.post; p.shift = n.shift || p.shift;
      for (const scp of n.assignedScps || []) { const a = this.anomaly(scp); if (a) { a.assigned = a.assigned.filter(x => x !== n.id); if (a.assigned.indexOf('player') < 0) a.assigned.push('player'); p.assignedScps.push(scp); } }
      p.rep = rep; p.journal = journal; p.addJournal('[' + fmtStamp(this.now) + '] Связь с «' + oldName + '» потеряна. Наблюдение продолжается через: ' + p.name + '.');
      if (n.reservedPoi) { const q = this.fac.poi(n.reservedPoi); if (q && q.reservedBy === n.id) q.reservedBy = null; }
      if (n.taskId) { const t = this.tasks.get(n.taskId); if (t && t.status === 'Active') t.status = 'Failed'; }
      const nc = this.card(n.cardId); if (nc) { nc.revoked = true; nc.holder = null; }
      n.played = true; n.onSite = false; n.job = null; n.agent.clear(); this.releaseSpot(n.id); this.setActive(n, false);
      this.events.post({ time: this.now, type: EV.Report, roomId: p.roomId, actor: 'player', severity: 1, pub: true, text: 'Наблюдение продолжается: ' + p.name + ' (' + S.Professions.get(p.prof).name + ').' });
      return true;
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
        player: this.player.save(), research: this.research, food: this.food, queues: this.queues, ai: this.ai ? this.ai.save() : null, med: S.Med.save(this), arms: S.Arms.save(this)
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
      // people hired during the game are recreated from their hiring record first
      if (o.med && o.med.hires) for (const h of o.med.hires) if (!w.npc(h.id)) S.People.hire(w, h, true);
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
      S.Med.load(w, o.med); S.Arms.load(w, o.arms); w.life.load(o.life); w.infra.load(o.infra); w.horror.load(o.horror); w.dirt.load(o.dirt); w.player.load(o.player); w.research = o.research || w.research; w.food = o.food != null ? o.food : 100;
      w.lockEpoch++;
      return w;
    }
  }
  World.FIXED = FIXED;
  S.World = World; S.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
