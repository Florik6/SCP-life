/* SCP LIFE — SCP-L-001 «Счетовод» behaviour (port of TallymanBehaviour.cs). */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, fmtTime, durationText, EV, numWords } = S;
  const SESSION_INTERVAL = 360, SESSION_GRACE = 60, BUCKETS = 96;
  const ORDER = ['Counting', 'Watching', 'Signaling', 'Probing', 'WaitingAtDoor', 'Breached', 'Returning'];
  const ord = s => ORDER.indexOf(s);
  const bucket = mod => ((Math.floor(mod / 15) % BUCKETS) + BUCKETS) % BUCKETS;
  const THRESH = { Watching: 30, Signaling: 55, Probing: 75, WaitingAtDoor: 70 };

  class Tallyman {
    constructor() {
      this.isTallyman = true; this.owner = null;
      this.doorId = null; this.obsRoom = null; this.windowPoi = null; this.centerPoi = null; this.wander = [];
      this.d = 12; this.state = 'Counting'; this.lastSession = 0; this.sessionProgress = 0; this.sessionActive = -1000;
      this.tally = 1342; this.hist = new Array(BUCKETS).fill(0); this.lastCycles = 0; this.people = {}; this.target = null;
      this.obsByPlayer = -1; this.obsThreat = 0; this.visitorsToday = 0; this.readers = 0; this.visitDay = -1;
      this.percT = 0; this.wanderT = 0; this.signalT = 30; this.probeT = 20; this.attackCd = 0; this.poseT = 0; this.repathT = 0; this.scratchT = 0; this.goal = -1; this.forcing = null; this.forceStart = 0;
    }
    get threat() { return this.owner && !this.owner.contained ? 100 : this.d; }
    get status() {
      return { Counting: 'Счёт · спокоен', Watching: 'Наблюдает · насторожен', Signaling: 'Стучит по стеклу · возбуждён', Probing: 'Воздействует на замок · опасно', WaitingAtDoor: 'Неподвижен у двери', Breached: 'ВНЕ КАМЕРЫ', Returning: 'Возвращается в камеру' }[this.state];
    }
    init(w) {
      const ch = w.fac.room(this.owner.containRoom);
      for (const did of ch.doorIds) if (w.fac.door(did).kind === 'Heavy') this.doorId = did;
      this.obsRoom = ch.visibleRooms[0] || null; this.wander = [];
      for (const p of ch.pois) { if (p.type === 'Window') this.windowPoi = p.id; else if (p.type === 'Stand') this.wander.push(p.id); }
      this.centerPoi = this.wander[0] || null;
      const d = w.fac.door(this.doorId); this.lastCycles = d ? d.cycles : 0;
      if (!this.owner.agent.roomId) { this.owner.agent.roomId = ch.id; const c = w.fac.poi(this.centerPoi); this.owner.agent.pos = c ? V.copy(c.pos) : ch.center; }
      this.owner.agent.speed = 0.9;
    }
    person(id) { return this.people[id] || (this.people[id] = { visits: 0, hours: new Array(24).fill(0), last: -1000, irr: 0 }); }
    seedFamiliarity(id, hours) { const p = this.person(id); for (const h of hours) { p.hours[((h % 24) + 24) % 24] += 2; p.visits += 2; } p.irr = 0.15; }
    seedDoor(h, m, c) { this.hist[bucket(h * 60 + m)] += c; }
    overdue(now) { return now - (this.lastSession + SESSION_INTERVAL + SESSION_GRACE); }
    predict(now) {
      const mod = now % 1440, cur = bucket(mod), into = mod - cur * 15;
      for (let k = 0; k <= 12; k++) if (this.hist[(cur + k) % BUCKETS] >= 2) return Math.max(0, k * 15 - into);
      return -1;
    }
    strongest() { let best = -1, bc = 1; for (let i = 0; i < BUCKETS; i++) if (this.hist[i] > bc) { bc = this.hist[i]; best = i; } return best; }

    tick(w, dt, gm) {
      const now = w.now, o = this.owner, room = w.fac.room(o.agent.roomId), door = w.fac.door(this.doorId);
      this.attackCd -= dt; this.poseT -= dt;
      if (w.clock.day !== this.visitDay) { this.visitDay = w.clock.day; this.visitorsToday = 0; }
      if (door && door.cycles !== this.lastCycles) {
        const delta = door.cycles - this.lastCycles; this.lastCycles = door.cycles;
        if (delta > 0) { const b = bucket(w.clock.mod), exp = this.hist[b] >= 2; this.hist[b]++; this.tally += delta; if (o.contained) this.d += exp ? -1.5 : 3; }
      }
      this.percT -= dt; if (this.percT <= 0) { this.percT = 1; this.perceive(w, now); }
      this.readers = this.countReaders(w);
      const session = o.contained && this.sessionOn(w), over = this.overdue(now), dark = room && !room.lightsOn;
      if (session) { this.sessionProgress += gm; this.sessionActive = now; this.d -= 1.2 * gm; if (this.sessionProgress >= 15) this.lastSession = now; }
      else if (now - this.sessionActive > 5) this.sessionProgress = 0;
      if (over > 0) this.d += gm * Math.min(0.6, 0.12 + over / 600);
      if (dark) this.d += 2.5 * gm;
      if (this.readers > 0) this.d -= (o.contained ? 1.5 : 3) * this.readers * gm;
      if (o.contained && over <= 0 && !dark && !this.readers && !session && ord(this.state) <= ord('Watching')) this.d -= 0.15 * gm;
      if (!o.contained) this.d -= 0.1 * gm;
      this.d = clamp(this.d, o.contained ? 3 : 0, 100);
      if (door && this.d < 50 && door.integrity < 100 && door.integrity > 0) door.integrity = Math.min(100, door.integrity + 0.1 * gm);
      if (o.contained) this.tickContained(w, dt, gm, door); else this.tickBreached(w, dt, door);
    }

    perceive(w, now) {
      const hour = w.clock.hour; let near = null, nd = Infinity, irrId = null, maxIrr = -1;
      for (const s of w.peopleVisibleFrom(this.owner.agent.roomId)) {
        const d = V.distXZ(this.owner.agent.pos, s.pos); if (d > 20) continue;
        if (s.id !== 'player') { const n = w.npc(s.id); if (n && n.incap(now)) continue; }
        const p = this.person(s.id);
        if (now - p.last > 30) {
          const fam = p.visits === 0 ? 0 : Math.min(1, (p.hours[hour] + 0.5 * (p.hours[(hour + 23) % 24] + p.hours[(hour + 1) % 24])) / 2);
          const irr = p.visits === 0 ? 0.8 : Math.max(0.1, 1 - fam);
          if (this.owner.contained) this.d += irr * 6 - (1 - irr) * 2;
          p.irr = p.visits === 0 ? irr : p.irr * 0.7 + irr * 0.3; p.visits++; p.hours[hour]++; this.tally++; this.visitorsToday++;
        }
        p.last = now;
        if (d < nd) { nd = d; near = s.id; }
        if (p.irr > maxIrr) { maxIrr = p.irr; irrId = s.id; }
      }
      this.owner.lookAt = irrId || near;
    }
    sessionOn(w) {
      return w.active.some(n => n.activity === 'ObservationSession' && n.arrived && !n.agent.hasPath && !n.incap(w.now) && (n.agent.roomId === this.obsRoom || n.agent.roomId === this.owner.containRoom));
    }
    countReaders(w) {
      let c = 0;
      for (const n of w.active) if (n.activity === 'CountingProtocol' && n.posture === 'Counting' && n.followId === this.owner.id && !n.incap(w.now) && w.canCount(n.agent.pos, n.agent.roomId, this.owner)) c++;
      const p = w.player; if (p.counting && p.countTarget === this.owner.id && !p.dead && w.canCount(p.pos, p.roomId, this.owner)) c++;
      return c;
    }

    tickContained(w, dt, gm, door) {
      const now = w.now, d = this.d, o = this.owner;
      let desired = d < 30 ? 'Counting' : d < 55 ? 'Watching' : d < 75 ? 'Signaling' : 'Probing';
      const until = this.predict(now);
      if (d >= 70 && ((until >= 0 && until <= 25) || (door && door.integrity <= 0))) desired = 'WaitingAtDoor';
      if (this.state !== 'Breached' && this.state !== 'Returning' && ord(desired) < ord(this.state) && this.state !== 'WaitingAtDoor' && d > (THRESH[this.state] || 0) - 3) desired = this.state;
      if (this.state === 'Breached' || this.state === 'Returning') desired = 'Counting';
      if (desired !== this.state) this.enter(w, desired);
      o.agent.speed = 0.9;
      const dn = door ? door.nodeOn(o.containRoom) : -1;
      switch (this.state) {
        case 'Counting':
          this.wanderT -= dt;
          if (!o.agent.hasPath && this.wanderT <= 0 && this.wander.length) { const p = w.fac.poi(this.wander[w.rng.int(0, this.wander.length)]); if (p) this.moveTo(w, p.node, p.yaw, false); this.wanderT = w.rng.range(18, 40); }
          this.scratchT -= dt; if (this.scratchT <= 0) { this.scratchT = 25; this.tally++; }
          this.pose(o.agent.moving ? 'Walking' : 'Scratching'); break;
        case 'Watching': this.moveToPoi(w, this.windowPoi); this.pose(o.agent.moving ? 'Walking' : 'Watching'); break;
        case 'Signaling':
          this.moveToPoi(w, this.windowPoi); this.pose(o.agent.moving ? 'Walking' : 'Tapping');
          this.signalT -= dt;
          if (this.signalT <= 0 && !o.agent.moving) { this.signalT = w.rng.range(45, 90); this.post(w, 1, EV.AnomalyBehaviour, o.id + ' стучит по стеклу: ' + this.tapPattern()); }
          break;
        case 'Probing':
          if (dn >= 0) this.moveTo(w, dn, null, false);
          this.pose(o.agent.moving ? 'Walking' : 'Probing');
          if (!o.agent.moving && door) {
            door.integrity = Math.max(0, door.integrity - 0.6 * gm); this.probeT -= dt;
            if (this.probeT <= 0) {
              this.probeT = w.rng.range(40, 80); door.faultUntil = now + 3;
              flicker(w, o.containRoom, now); flicker(w, this.obsRoom, now); flicker(w, door.other(o.containRoom), now);
              this.post(w, 2, EV.ContainmentWarning, 'Сбой контроллера замка камеры ' + o.id + ': целостность ' + Math.round(door.integrity) + '%. Мигает свет.');
            }
          }
          break;
        case 'WaitingAtDoor':
          if (dn >= 0) this.moveTo(w, dn, null, false);
          this.pose(o.agent.moving ? 'Walking' : 'Waiting');
          if (!o.agent.moving && door) door.integrity = Math.max(0, door.integrity - 0.3 * gm);
          break;
      }
      if (door) {
        if (door.integrity <= 0 && d >= 70 && door.state === S.DS.Closed) { door.open(30); this.post(w, 3, EV.ContainmentWarning, 'Замок двери камеры ' + o.id + ' отказал — дверь открывается!'); }
        if (door.passable && d >= 70) {
          const spot = dn >= 0 ? w.fac.graph.nodes[dn].pos : door.pos;
          if (V.distXZ(o.agent.pos, spot) < 2.8) { this.beginBreach(w); return; }
          o.agent.speed = 2.0; if (dn >= 0) this.moveTo(w, dn, null, false);
        }
      }
      if (d >= 60) this.tryAttack(w, true);
      w.moveAgent(o.agent, dt, () => 'Blocked', false);
    }
    enter(w, next) {
      const prev = this.state; this.state = next; this.goal = -1; const id = this.owner.id;
      if (next === 'Counting' && ord(prev) >= ord('Signaling') && ord(prev) <= ord('WaitingAtDoor')) this.post(w, 0, EV.AnomalyBehaviour, id + ' отошёл от двери и вернулся к счёту');
      else if (next === 'Watching' && prev === 'Counting') this.post(w, 0, EV.AnomalyBehaviour, id + ' прекратил счёт и подошёл к стеклу');
      else if (next === 'Signaling') this.signalT = 5;
      else if (next === 'Probing') { this.probeT = 10; this.post(w, 2, EV.ContainmentWarning, 'Датчики камеры: ' + id + ' у двери, фиксируется воздействие на замок'); }
    }
    tapPattern() {
      const b = this.strongest();
      const pl = n => { const a = n % 10, h = n % 100; if (a === 1 && h !== 11) return 'удар'; if (a >= 2 && a <= 4 && (h < 12 || h > 14)) return 'удара'; return 'ударов'; };
      if (b >= 0) { const hr = Math.floor(b / 4), t = Math.floor(hr / 10), u = hr % 10; return (t > 0 ? numWords(t) + ' ' + pl(t) + ', пауза, ' : '') + numWords(u) + ' ' + pl(u) + '. Повторяет снова и снова.'; }
      const n = Math.max(1, this.visitorsToday % 10); return numWords(n) + ' ' + pl(n) + ', затем долгая тишина.';
    }
    moveToPoi(w, id) { const p = w.fac.poi(id); if (p) this.moveTo(w, p.node, p.yaw, false); }
    moveTo(w, node, yaw, doors) {
      if (node < 0 || node === this.goal) return; this.goal = node;
      const path = w.planPath(this.owner.agent.pos, this.owner.agent.roomId, node, () => doors); if (!path) return;
      this.owner.agent.setPath(path); this.owner.agent.arriveYaw = yaw;
    }
    pose(p) { if (this.poseT > 0) return; this.owner.pose = p; }

    beginBreach(w) {
      const o = this.owner; o.contained = false; o.detected = false; o.breachAt = w.now; this.state = 'Breached'; this.goal = -1; o.agent.clear(); this.chooseTarget(w);
      this.post(w, 3, EV.AnomalyBehaviour, o.id + ' выходит из камеры содержания');
    }
    tickBreached(w, dt, door) {
      const o = this.owner, d = this.d;
      if (this.state === 'Breached' && d < 35) { this.state = 'Returning'; this.target = null; this.goal = -1; o.agent.clear(); this.post(w, 1, EV.AnomalyBehaviour, o.id + ' замедляется и поворачивает обратно к камере'); }
      else if (this.state === 'Returning' && d >= 60) { this.state = 'Breached'; this.chooseTarget(w); }
      else if (this.state !== 'Breached' && this.state !== 'Returning') { this.state = 'Breached'; this.chooseTarget(w); }
      const sf = 1 / (1 + 0.8 * this.readers);
      o.agent.speed = (this.state === 'Returning' ? 1.0 : 1.25) * sf;
      if (this.state === 'Breached') {
        if (!this.valid(w, this.target)) this.chooseTarget(w);
        this.repathT -= dt;
        if (this.target && (this.repathT <= 0 || !o.agent.hasPath)) { this.repathT = 3; this.pathTo(w, w.fac.nearestNode(w.posOf(this.target), w.roomOf(this.target))); }
        this.tryAttack(w, false);
      } else {
        const c = w.fac.poi(this.centerPoi);
        if (o.agent.roomId !== o.containRoom) { if (!o.agent.hasPath && c) this.pathTo(w, c.node); }
        else {
          if (!o.agent.hasPath && c && V.distXZ(c.pos, o.agent.pos) > 1) this.pathTo(w, c.node);
          if (door && door.isClosed && w.fac.room(o.containRoom).contains(o.agent.pos)) { this.recontain(w); return; }
        }
      }
      if (!this._force) this._force = (dr, from) => this.forceDoor(w, dr, from);
      const st = w.moveAgent(o.agent, dt, this._force, false);
      if (st !== 'Waiting') { this.forcing = null; this.pose(this.readers > 0 ? 'Slowed' : (o.agent.moving ? 'Walking' : 'Watching')); }
    }
    forceDoor(w, door, from) {
      if (this.forcing !== door.id) { this.forcing = door.id; this.forceStart = w.realTime; }
      this.pose('Probing');
      let need = door.kind === 'Heavy' ? 20 : door.kind === 'Security' ? 10 : 6; if (this.readers > 0) need *= 2;
      if (w.realTime - this.forceStart >= need) {
        door.faultUntil = w.now + 10; door.open(6); this.forcing = null; flicker(w, from, w.now);
        w.events.post({ time: w.now, type: EV.ReaderMalfunction, roomId: from, pos: V.copy(door.pos), actor: this.owner.id, target: door.id, severity: 2, text: door.name + ' открылась без авторизации (сбой контроллера)' });
      }
      return 'Wait';
    }
    valid(w, id) { if (!id) return false; if (id === 'player') return !w.player.dead; const n = w.npc(id); return !!n && !n.incap(w.now); }
    chooseTarget(w) {
      let best = null, bs = -Infinity; const my = w.fac.room(this.owner.agent.roomId);
      for (const id in this.people) {
        if (!this.valid(w, id)) continue; const r = w.roomOf(id); if (!r) continue;
        const vis = my && my.canSeeInto(r), dist = V.distXZ(w.posOf(id), this.owner.agent.pos);
        const s = this.people[id].irr * 2 + (vis ? 1 : 0) - dist / 40; if (s > bs) { bs = s; best = id; }
      }
      if (!best) { let bd = Infinity; for (const s of w.subjects()) { if (s.anomaly || !this.valid(w, s.id)) continue; const d = V.distXZ(s.pos, this.owner.agent.pos); if (d < bd) { bd = d; best = s.id; } } }
      this.target = best; this.owner.lookAt = best; this.repathT = 0;
    }
    pathTo(w, goal) { if (goal < 0) return; const p = w.planPath(this.owner.agent.pos, this.owner.agent.roomId, goal, () => true); if (!p) return; this.owner.agent.setPath(p); this.owner.agent.arriveYaw = null; }
    tryAttack(w, sameRoom) {
      if (this.attackCd > 0) return;
      let victim = null, bd = 1.5;
      for (const s of w.subjects()) {
        if (s.anomaly || !s.roomId) continue; if (sameRoom && s.roomId !== this.owner.agent.roomId) continue; if (!this.valid(w, s.id)) continue;
        const d = V.distXZ(s.pos, this.owner.agent.pos); if (d < bd) { bd = d; victim = s.id; }
      }
      if (!victim) return;
      this.attackCd = 6; this.owner.pose = 'Attacking'; this.poseT = 1.5; this.d = Math.max(0, this.d - 22);
      if (this.people[victim]) this.people[victim].irr *= 0.4;
      if (victim === 'player') w.damagePlayer(34, this.owner.id, this.owner.id + ' касается вас: резкая боль, перед глазами мелькают цифры');
      else {
        const n = w.npc(victim); w.injureNpc(n, 45, this.owner.id, this.owner.id + ' атакует: ' + n.displayName + ' без сознания', 25);
        const c = w.card(n.cardId);
        if (c && c.holder === n.id && w.rng.chance(0.5)) { c.holder = null; c.room = n.agent.roomId; c.pos = V.v(n.agent.pos.x + w.rng.range(-0.5, 0.5), 0, n.agent.pos.z + w.rng.range(-0.5, 0.5)); }
      }
      if (victim === this.target) this.chooseTarget(w);
    }
    recontain(w) {
      const o = this.owner; o.contained = true; o.detected = false; this.state = 'Counting'; this.d = Math.min(this.d, 25); this.target = null; this.goal = -1;
      w.events.post({ time: w.now, type: EV.Recontained, roomId: o.containRoom, pos: V.copy(o.agent.pos), actor: o.id, severity: 2, pub: true, text: o.displayName + ' в камере содержания, дверь закрыта. Повторное содержание подтверждено.' });
    }
    post(w, sev, type, text) { w.events.post({ time: w.now, type, roomId: this.owner.agent.roomId, pos: V.copy(this.owner.agent.pos), actor: this.owner.id, severity: sev, text }); }

    observe(w, who) {
      const now = w.now, o = this.owner, parts = [];
      switch (this.state) {
        case 'Counting': parts.push(o.id + ' медленно царапает стену, добавляя отметки. Всего отметок: ' + this.tally + '.'); break;
        case 'Watching': parts.push(o.id + ' стоит у стекла и неотрывно смотрит' + (o.lookAt === who ? ' прямо на вас.' : ' на ' + w.nameOf(o.lookAt) + '.')); break;
        case 'Signaling': parts.push(o.id + ' ритмично стучит по стеклу: ' + this.tapPattern()); break;
        case 'Probing': parts.push(o.id + ' прижал ладони к двери. Индикатор замка мигает, свет в камере дрожит.'); break;
        case 'WaitingAtDoor': parts.push(o.id + ' абсолютно неподвижно стоит у двери. Счёт прекратился.'); break;
        case 'Breached': parts.push(o.id + ' вне камеры содержания!'); break;
        case 'Returning': parts.push(o.id + ' бредёт обратно к камере.'); break;
      }
      parts.push('Оценка состояния: ' + (this.d < 30 ? 'спокоен' : this.d < 55 ? 'насторожен' : this.d < 75 ? 'возбуждён' : 'крайне возбуждён') + '.');
      parts.push('Последний сеанс счёта: ' + fmtTime(this.lastSession) + ' (' + durationText(now - this.lastSession) + ' назад).');
      const b = this.strongest();
      if (b >= 0 && this.hist[b] >= 2) parts.push('У двери на стене выцарапана отдельная группа: «' + fmtTime(b * 15) + '» и ' + this.hist[b] + ' черт. Похоже, он считает, когда открывается дверь.');
      const door = w.fac.door(this.doorId); if (door && door.integrity < 100) parts.push('Целостность замка: ' + Math.round(door.integrity) + '%.');
      const m = this.people[who]; if (m && m.visits > 0 && m.irr > 0.5) parts.push('Когда вы появляетесь, он сбивается со счёта.');
      if (who === 'player') { this.obsByPlayer = now; this.obsThreat = this.threat; }
      return parts.join(' ');
    }
    save() {
      return { d: this.d, st: this.state, ls: this.lastSession, sp: this.sessionProgress, sa: this.sessionActive, t: this.tally, h: this.hist, lc: this.lastCycles, pe: this.people, tg: this.target, ob: this.obsByPlayer, ot: this.obsThreat, vt: this.visitorsToday, vd: this.visitDay };
    }
    load(o) {
      this.d = o.d; this.state = o.st; this.lastSession = o.ls; this.sessionProgress = o.sp; this.sessionActive = o.sa; this.tally = o.t; this.hist = o.h.slice(); this.lastCycles = o.lc;
      this.people = o.pe || {}; this.target = o.tg; this.obsByPlayer = o.ob; this.obsThreat = o.ot; this.visitorsToday = o.vt; this.visitDay = o.vd; this.goal = -1;
    }
  }
  function flicker(w, roomId, now) { const r = w.fac.room(roomId); if (r) r.flickerUntil = Math.max(r.flickerUntil, now + 1.5); }
  Tallyman.ORDER = ORDER;
  S.Tallyman = Tallyman;
})(typeof window !== 'undefined' ? window : globalThis);
