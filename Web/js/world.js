/* SCP LIFE — SimWorld, alert, tasks, dispatcher, CCTV, player, save (port of the C# Simulation folder). */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, Hm, fmtTime, fmtStamp, inRange, durationText, EV, R, RESULT_TEXT, isSuccess, checkCard, findPath, Brain, Dialogue } = S;
  const FIXED = 0.1, REMOTE_DIST = 3, REMOTE_STEP = 1;
  const ALERT_NAMES = ['ЗЕЛЁНЫЙ', 'ЖЁЛТЫЙ', 'ОРАНЖЕВЫЙ', 'КРАСНЫЙ'];

  // ------------------------------------------------------------------ alert
  class Alert {
    constructor() { this.level = 0; this.reason = 'Штатный режим'; this.roomId = null; this.changed = 0; this.breachId = null; this.lastRoom = null; this.lastTime = 0; }
    raise(w, lvl, reason, roomId) { if (lvl <= this.level) return; this.set(w, lvl, reason, roomId); }
    lower(w, lvl, reason) { if (lvl >= this.level) return; this.set(w, lvl, reason, this.roomId); }
    set(w, lvl, reason, roomId) {
      const prev = this.level; this.level = lvl; this.reason = reason; this.roomId = roomId; this.changed = w.now;
      const lock = lvl >= 3, was = prev >= 3;
      if (lock !== was) for (const d of w.fac.doorList) {
        const a = w.fac.room(d.roomA), b = w.fac.room(d.roomB);
        if (a.type !== 'DClassCommon' && b.type !== 'DClassCommon') continue;
        d.lockdown = lock; if (lock) d.close();
      }
      const room = w.fac.room(roomId);
      if (room && room.type === 'Containment' && lvl > prev) {
        const est = lvl >= 3 ? 100 : lvl === 2 ? 80 : 55;
        for (const n of w.npcs) { if (n.knownThreatTime > w.now - 0.01 && n.knownThreat >= est) continue; n.knownThreat = est; n.knownThreatTime = w.now; }
      }
      w.events.post({ time: w.now, type: EV.AlertChanged, roomId, severity: lvl >= 2 ? 3 : 1, pub: true, text: 'Уровень тревоги ' + ALERT_NAMES[lvl] + ': ' + reason + (room ? ' (' + room.name + ')' : '') });
    }
    reportBreach(w, a, roomId, source) {
      this.lastRoom = roomId; this.lastTime = w.now; this.breachId = a.id;
      if (!a.detected) {
        a.detected = true; const room = w.fac.room(roomId);
        w.events.post({ time: w.now, type: EV.ContainmentBreach, roomId, pos: V.copy(a.agent.pos), actor: a.id, severity: 3, pub: true, text: 'ВНИМАНИЕ! Нарушение условий содержания ' + a.displayName + '. Обнаружено: ' + source + ', ' + (room ? room.name : '') + '. Персоналу укрыться, охране — протокол счёта.' });
      }
      this.raise(w, 3, 'Нарушение содержания ' + a.id, roomId);
    }
    save() { return Object.assign({}, this); }
    load(o) { Object.assign(this, o); }
  }

  // ------------------------------------------------------------------ tasks
  class Tasks {
    constructor() { this.list = []; this.nextId = 1; }
    issue(w, t) {
      t.id = 'T' + this.nextId++; t.issued = w.now; t.status = 'Active'; t.done = t.done || []; t.checkpoints = t.checkpoints || []; t.by = t.by || 'Диспетчер смены';
      this.list.push(t);
      if (this.list.length > 120) this.list = this.list.filter(x => x.status === 'Active' || w.now - x.issued < 1440);
      w.events.post({ time: w.now, type: EV.TaskIssued, actor: t.who, target: t.id, roomId: t.room, text: t.by + ' → ' + w.nameOf(t.who) + ': ' + t.title });
      return t;
    }
    get(id) { return this.list.find(t => t.id === id) || null; }
    activeFor(who) { return this.list.filter(t => t.status === 'Active' && t.who === who); }
    firstActive(who, kind) { return this.list.find(t => t.status === 'Active' && t.who === who && t.kind === kind) || null; }
    hasActive(kind, target) { return this.list.some(t => t.status === 'Active' && t.kind === kind && (target == null || t.target === target)); }
    progress(t) { return t.kind === 'Patrol' ? t.done.length + '/' + t.checkpoints.length + ' точек' : t.kind === 'CameraCheck' ? t.done.length + '/' + t.required + ' камер' : ''; }
    complete(w, t, note) {
      if (t.status !== 'Active') return; t.status = 'Completed';
      if (t.who === 'player') { w.player.done++; w.player.rep = Math.min(100, w.player.rep + 3); }
      w.events.post({ time: w.now, type: EV.TaskCompleted, actor: t.who, target: t.id, roomId: t.room, text: w.nameOf(t.who) + ': выполнено «' + t.title + '»' + (note ? ' — ' + note : '') });
    }
    fail(w, t, reason) {
      if (t.status !== 'Active') return; t.status = 'Failed';
      if (t.who === 'player') { w.player.failed++; w.player.rep = Math.max(0, w.player.rep - 5); }
      w.events.post({ time: w.now, type: EV.TaskFailed, actor: t.who, target: t.id, severity: 1, text: w.nameOf(t.who) + ': не выполнено «' + t.title + '» (' + reason + ')' });
    }
    tick(w) { for (const t of this.list.slice()) if (t.status === 'Active' && t.deadline > 0 && w.now > t.deadline) this.fail(w, t, 'истёк срок'); }
  }

  // ------------------------------------------------------------------ dispatcher
  class Dispatcher {
    constructor() { this.lastPatrol = -1e4; this.lastCams = -1e4; this.calmSince = -1; this.lastInvestigate = -1e4; this.lastEmergency = -1e4; this.timer = 0; }
    tick(w, dt) {
      this.timer -= dt; if (this.timer > 0) return; this.timer = 2;
      this.playerDuties(w); this.containment(w); this.lostCards(w); this.alertLevel(w);
    }
    playerDuties(w) {
      if (w.player.dead) return;
      const now = w.now, onDuty = inRange(w.clock.mod, Hm(7, 30), Hm(23));
      if (!onDuty || w.alert.level >= 3) return;
      if (!w.tasks.firstActive('player', 'Patrol') && now - this.lastPatrol >= 100) {
        const route = this.patrolRoute(w, 5);
        if (route.length) {
          w.tasks.issue(w, { kind: 'Patrol', title: 'Обход сектора', desc: 'Отметьтесь на контрольных точках: ' + route.map(id => w.fac.poi(id).label).join(' → '), who: 'player', deadline: now + 90, checkpoints: route });
          this.lastPatrol = now;
        }
      }
      if (!w.tasks.firstActive('player', 'CameraCheck') && now - this.lastCams >= 240) {
        w.tasks.issue(w, { kind: 'CameraCheck', title: 'Проверка видеонаблюдения', desc: 'На посту КПП просмотрите не менее 4 камер в терминале дежурного.', who: 'player', required: Math.min(4, w.cams.length), deadline: now + 120 });
        this.lastCams = now; w.player.camsViewed = [];
      }
    }
    patrolRoute(w, count) {
      const card = w.card(w.player.selectedCardId());
      const cands = Object.values(w.fac.pois).filter(p => p.type === 'PatrolPoint').sort((a, b) => a.id < b.id ? -1 : 1);
      const route = []; let guard = 0;
      while (route.length < count && cands.length && guard++ < 50) {
        const pick = cands.splice(w.rng.int(0, cands.length), 1)[0];
        const room = w.fac.room(pick.roomId);
        if (card && !w.planPath(w.player.pos, w.player.roomId || 'post', room.hubNodes[0], (d, f) => w.canPlanThrough(d, f, card))) continue;
        route.push(pick.id);
      }
      const ordered = []; let cur = w.player.pos;
      while (route.length) { let bi = 0, bd = Infinity; route.forEach((id, i) => { const d = V.distXZ(cur, w.fac.poi(id).pos); if (d < bd) { bd = d; bi = i; } }); ordered.push(route[bi]); cur = w.fac.poi(route[bi]).pos; route.splice(bi, 1); }
      return ordered;
    }
    pickScientist(w) {
      let best = null, bs = -Infinity;
      for (const n of w.npcs) {
        if (n.role !== 'Scientist' || !n.protocol || n.incap(w.now)) continue;
        let s = n.traits.diligence * 10; if (n.activity === 'Sleep') s -= 20; if (n.activity === 'Work') s += 5; s -= n.needs.stress * 0.05;
        if (s > bs) { bs = s; best = n; }
      }
      return best;
    }
    pickRole(w, role) { let best = null; for (const n of w.npcs) { if (n.role !== role || n.incap(w.now)) continue; if (!best || (best.activity === 'Sleep' && n.activity !== 'Sleep')) best = n; } return best; }
    containment(w) {
      const now = w.now;
      for (const a of w.anomalies) {
        const t = a.beh; if (!t.isTallyman) continue;
        const unrest = w.alert.level >= 1 && w.alert.roomId === a.containRoom && now - this.lastEmergency >= 45 && now - t.lastSession > 20;
        if ((t.overdue(now) > 0 || unrest) && !w.tasks.hasActive('ObservationSession', a.id) && a.contained) {
          if (unrest) this.lastEmergency = now;
          const sc = this.pickScientist(w), obs = w.fac.firstRoom('Observation');
          if (sc && obs) {
            w.tasks.issue(w, { kind: 'ObservationSession', title: 'Внеплановый сеанс счёта ' + a.id, desc: unrest ? 'Поступил доклад о беспокойстве объекта.' : 'Плановый сеанс просрочен.', who: sc.id, room: obs.id, target: a.id, deadline: now + 90 });
            sc.nextThink = 0;
          }
        }
        const door = w.fac.door(t.doorId);
        if (door && door.integrity < 70 && !w.tasks.hasActive('RepairDoor', door.id)) {
          const tech = this.pickRole(w, 'Technician');
          const rr = w.fac.room(door.roomA).type === 'Containment' ? w.fac.room(door.roomB) : w.fac.room(door.roomA);
          if (tech && rr) {
            const c = w.card(tech.cardId); if (c) { c.tempLevel = 3; c.tempPerms = S.P.Containment; c.tempUntil = now + 120; }
            w.tasks.issue(w, { kind: 'RepairDoor', title: 'Ремонт замка камеры ' + a.id, desc: 'Целостность замка: ' + Math.round(door.integrity) + '%. Временный допуск L3 на 2 часа.', who: tech.id, room: rr.id, target: door.id, deadline: now + 120 });
            tech.nextThink = 0;
          }
        }
        if (a.contained) {
          if (t.state === 'Probing' || (door && door.integrity < 50)) w.alert.raise(w, 2, 'Датчики камеры ' + a.id + ': воздействие на замок', a.containRoom);
          const reported = w.alert.level >= 1 && w.alert.roomId === a.containRoom;
          if (reported && !w.tasks.hasActive('Investigate', a.id) && !w.player.dead && now - this.lastInvestigate > 90) {
            this.lastInvestigate = now;
            const obs = w.fac.firstRoom('Observation');
            w.tasks.issue(w, { kind: 'Investigate', title: 'Проверить ' + a.id, desc: 'Поступил доклад. Осмотрите объект через окно наблюдательного пункта или по камере К-06 и доложите рапортом.', who: 'player', room: obs && obs.id, target: a.id, deadline: now + 45 });
          }
        }
      }
    }
    lostCards(w) {
      const now = w.now;
      for (const n of w.npcs) {
        if (n.cardLostAt < 0 || now - n.cardLostAt < 30) continue;
        const old = w.card(n.cardId);
        if (old && old.holder === n.id) { n.cardLostAt = -1; continue; }
        if (old) old.revoked = true;
        const fresh = { id: (old ? old.id : 'card.' + n.id) + 'r', owner: n.id, ownerName: n.displayName, level: old ? old.level : 1, perms: old ? old.perms : 0, revoked: false, holder: n.id, room: null, pos: V.v(0, 0, 0), tempLevel: 0, tempPerms: 0, tempUntil: -1 };
        w.cards[fresh.id] = fresh; n.cardId = fresh.id; n.cardLostAt = -1; n.nextThink = 0;
        w.events.post({ time: now, type: EV.Announcement, actor: n.id, target: old && old.id, severity: 1, pub: true, text: 'Диспетчер смены: карта ' + (old ? old.id : '') + ' аннулирована, ' + n.displayName + ' получает новую' });
      }
    }
    alertLevel(w) {
      const now = w.now; let breach = false, restless = false;
      for (const a of w.anomalies) { if (!a.contained) breach = true; if (a.beh.isTallyman && S.Tallyman.ORDER.indexOf(a.beh.state) >= 2) restless = true; }
      if (w.alert.level === 3 && !breach) { w.alert.lower(w, 1, 'Объект возвращён в камеру содержания'); this.calmSince = now; return; }
      if (breach || restless) { this.calmSince = -1; return; }
      if (this.calmSince < 0) this.calmSince = now;
      if (w.alert.level > 0 && now - this.calmSince >= 60) w.alert.lower(w, 0, 'Показатели в норме');
    }
    playerReport(w) {
      const now = w.now, parts = [];
      for (const a of w.anomalies) {
        const t = a.beh; if (!t.isTallyman) continue;
        const fresh = t.obsByPlayer >= 0 && now - t.obsByPlayer < 90;
        if (!a.contained && a.detected) { parts.push(a.id + ' вне камеры: тревога уже объявлена'); continue; }
        if (!fresh) { parts.push('по ' + a.id + ' нет свежих наблюдений — сначала осмотрите объект'); continue; }
        if (t.obsThreat >= 45) {
          w.alert.raise(w, 1, 'Рапорт охраны: беспокойство ' + a.id, a.containRoom);
          if (!w.tasks.hasActive('ObservationSession', a.id)) {
            const sc = this.pickScientist(w), obs = w.fac.firstRoom('Observation');
            if (sc && obs) { w.tasks.issue(w, { kind: 'ObservationSession', title: 'Сеанс счёта ' + a.id + ' по рапорту охраны', desc: 'Охрана сообщает о беспокойстве объекта.', who: sc.id, room: obs.id, target: a.id, deadline: now + 60 }); sc.nextThink = 0; parts.push(a.id + ' беспокоен — к окну направлен ' + sc.displayName); }
            else parts.push(a.id + ' беспокоен — свободных учёных нет');
          } else parts.push(a.id + ' беспокоен — сеанс счёта уже назначен');
          for (const tk of w.tasks.activeFor('player')) if (tk.kind === 'Investigate' && tk.target === a.id) w.tasks.complete(w, tk, 'рапорт принят');
        } else parts.push(a.id + ' в норме');
      }
      return parts.length ? parts.join('; ') : 'происшествий нет';
    }
    save() { const o = Object.assign({}, this); delete o.timer; return o; }
    load(o) { Object.assign(this, o); this.timer = 0; }
  }

  // ------------------------------------------------------------------ player
  class Player {
    constructor() { this.name = 'Сержант А. Волков'; this.role = 'Guard'; this.pos = V.v(0, 0, 0); this.yaw = 0; this.pitch = 0; this.roomId = null; this.health = 100; this.cards = []; this.sel = 0; this.flashlight = false; this.stunnedUntil = 0; this.dead = false; this.counting = false; this.countTarget = null; this.countSec = 0; this.done = 0; this.failed = 0; this.rep = 50; this.journal = []; this.camsViewed = []; }
    selectedCardId() { return this.cards.length ? this.cards[((this.sel % this.cards.length) + this.cards.length) % this.cards.length] : null; }
    addJournal(l) { this.journal.push(l); if (this.journal.length > 80) this.journal.shift(); }
    save() { const o = Object.assign({}, this); o.counting = false; return o; }
    load(o) { Object.assign(this, o); this.counting = false; this.countTarget = null; }
  }

  // ------------------------------------------------------------------ world
  class World {
    constructor(fac, start, seed) {
      this.fac = fac; this.clock = new S.GameClock(start); this.rng = new S.SimRandom(seed);
      this.events = new S.EventLog(); this.accessLog = []; this.cards = {}; this.npcs = []; this.npcMap = {}; this.anomalies = []; this.cams = []; this.camLog = [];
      this.alert = new Alert(); this.tasks = new Tasks(); this.dispatcher = new Dispatcher(); this.player = new Player();
      this.realTime = 0; this.notify = []; this._remote = {}; this._distCache = {}; this._distRoom = null; this._scan = 0;
      this.events.listeners.push(e => this.onEvent(e));
    }
    get now() { return this.clock.total; }
    addNpc(n) { this.npcs.push(n); this.npcMap[n.id] = n; }
    npc(id) { return id ? this.npcMap[id] || null : null; }
    card(id) { return id ? this.cards[id] || null : null; }
    anomaly(id) { return this.anomalies.find(a => a.id === id) || null; }
    nameOf(id) { if (!id) return '—'; if (id === 'player') return this.player.name; const n = this.npc(id); if (n) return n.displayName; const a = this.anomaly(id); return a ? a.id : id; }
    roomName(id) { const r = this.fac.room(id); return r ? r.name : '—'; }
    posOf(id) { if (id === 'player') return this.player.pos; const n = this.npc(id); if (n) return n.agent.pos; const a = this.anomaly(id); return a ? a.agent.pos : V.v(0, 0, 0); }
    roomOf(id) { if (id === 'player') return this.player.roomId; const n = this.npc(id); if (n) return n.agent.roomId; const a = this.anomaly(id); return a ? a.agent.roomId : null; }
    *subjects() {
      if (!this.player.dead) yield { id: 'player', name: this.player.name, pos: this.player.pos, roomId: this.player.roomId, player: true, role: 'Guard' };
      for (const n of this.npcs) yield { id: n.id, name: n.displayName, pos: n.agent.pos, roomId: n.agent.roomId, role: n.role };
      for (const a of this.anomalies) yield { id: a.id, name: a.displayName, pos: a.agent.pos, roomId: a.agent.roomId, anomaly: true };
    }
    *peopleVisibleFrom(roomId) {
      const room = this.fac.room(roomId); if (!room) return;
      if (!this.player.dead && this.player.roomId && room.canSeeInto(this.player.roomId)) yield { id: 'player', pos: this.player.pos, roomId: this.player.roomId };
      for (const n of this.npcs) if (n.agent.roomId && room.canSeeInto(n.agent.roomId)) yield { id: n.id, pos: n.agent.pos, roomId: n.agent.roomId };
    }

    // --- main loop
    tick(dt) {
      this.realTime += dt;
      const gm = this.clock.advance(dt);
      if (this.player.roomId !== this._distRoom) { this._distCache = {}; this._distRoom = this.player.roomId; }
      this.tickDoors(dt);
      for (const a of this.anomalies) a.beh.tick(this, dt, gm);
      for (const n of this.npcs) {
        if (this.isRemote(n.agent.roomId)) {
          const acc = (this._remote[n.id] || 0) + dt;
          if (acc < REMOTE_STEP) { this._remote[n.id] = acc; continue; }
          this._remote[n.id] = 0; Brain.update(this, n, acc, acc * this.clock.minPerSec);
        } else {
          const pend = this._remote[n.id] || 0;
          if (pend > 0) { this._remote[n.id] = 0; Brain.update(this, n, dt + pend, (dt + pend) * this.clock.minPerSec); }
          else Brain.update(this, n, dt, gm);
        }
      }
      this.tickCameras(dt);
      this.tasks.tick(this);
      this.dispatcher.tick(this, dt);
      for (const r of this.fac.roomList) if (r.flickerUntil > 0 && r.flickerUntil < this.now) r.flickerUntil = 0;
      this.tickPlayer(dt, gm);
    }
    isRemote(roomId) {
      if (!roomId || !this.player.roomId) return false;
      let d = this._distCache[roomId];
      if (d === undefined) { d = this.fac.roomDistance(this.player.roomId, roomId, REMOTE_DIST + 1); this._distCache[roomId] = d; }
      return d >= REMOTE_DIST;
    }
    tickDoors(dt) {
      const mod = this.clock.mod;
      for (const d of this.fac.doorList) {
        if (d.curfewStart >= 0) { const c = d.inCurfew(mod); if (c && !d.locked) { d.locked = true; d.close(); } else if (!c && d.locked) d.locked = false; }
        if (d.pendingCard && this.realTime - d.pendingTime > 20) d.pendingCard = null;
        d.tick(dt, this.doorOccupied(d));
      }
    }
    doorOccupied(d) {
      if (!d.hasLeaf) return false;
      if (!this.player.dead && World.inDoorway(d, this.player.pos)) return true;
      for (const n of this.npcs) if (World.inDoorway(d, n.agent.pos)) return true;
      for (const a of this.anomalies) if (World.inDoorway(d, a.agent.pos)) return true;
      return false;
    }
    static inDoorway(d, p) {
      const along = d.alongX ? Math.abs(p.x - d.pos.x) : Math.abs(p.z - d.pos.z), across = d.alongX ? Math.abs(p.z - d.pos.z) : Math.abs(p.x - d.pos.x);
      return along < 0.75 && across < d.width / 2 + 0.25;
    }
    tickPlayer(dt, gm) {
      const p = this.player; if (p.dead) return;
      const r = this.fac.roomAt(p.pos); if (r) p.roomId = r.id;
      if (p.health < 100 && p.health > 0) p.health = Math.min(100, p.health + gm * 0.05);
      if (p.counting) { const t = this.anomaly(p.countTarget); if (!t || !this.canCount(p.pos, p.roomId, t)) this.stopCounting('цель вне зоны видимости'); else p.countSec += dt; }
    }

    // --- cameras
    tickCameras(dt) {
      for (const c of this.cams) { if (!c.operational) continue; c.phase += dt / Math.max(1, c.period); if (c.phase > 1) c.phase -= 1; c.yaw = c.baseYaw + Math.sin(c.phase * Math.PI * 2) * c.sweep; }
      this._scan -= dt; if (this._scan > 0) return; this._scan = 0.5;
      for (const c of this.cams) {
        if (!c.operational) { c.visible = []; continue; }
        const now = [];
        for (const s of this.subjects()) {
          if (s.roomId !== c.roomId || !World.camSees(c, s.pos)) continue;
          now.push(s.id); if (c.visible.indexOf(s.id) >= 0) continue;
          this.sighting(c, s);
        }
        c.visible = now;
      }
    }
    static camSees(c, p) { const d = V.sub(p, c.pos), dist = V.lenXZ(d); if (dist > c.range) return false; if (dist < 1) return true; return Math.abs(S.deltaAngle(c.yaw, V.yawFromDir(d))) <= c.fov / 2 + 8; }
    sighting(c, s) {
      const e = { time: this.now, cam: c.id, subj: s.id, name: s.name, roomId: c.roomId, flag: false, note: null };
      const room = this.fac.room(c.roomId);
      if (s.anomaly) { const a = this.anomaly(s.id); if (a && !a.contained) { e.flag = true; e.note = 'Аномалия вне камеры содержания'; this.alert.reportBreach(this, a, c.roomId, 'камера ' + c.name); } }
      else if (s.role === 'DClass' && room && ['DClassCell', 'DClassCommon', 'MedicalBay'].indexOf(room.type) < 0) {
        e.flag = true; e.note = 'Класс D вне жилого блока';
        this.events.post({ time: this.now, type: EV.SuspiciousActivity, roomId: c.roomId, pos: V.copy(s.pos), actor: s.id, severity: 2, text: 'Камера ' + c.name + ': ' + s.name + ' вне блока D (' + room.name + ')' });
      }
      this.camLog.push(e); if (this.camLog.length > 300) this.camLog.splice(0, this.camLog.length - 300);
    }
    roomCovered(id) { return this.cams.some(c => c.roomId === id && c.operational); }

    // --- doors & access
    presentCard(doorId, cardId, who, fromRoom) {
      const d = this.fac.door(doorId); if (!d) return R.Fault;
      if (d.kind === 'Archway') return R.Granted;
      const card = this.card(cardId), mod = this.clock.mod; let r;
      if (!card) r = R.DLevel;
      else if (d.faultUntil > this.now) r = R.Fault;
      else if (d.lockdown && card.level < 4) r = R.DLockdown;
      else if (d.locked && d.inCurfew(mod) && (card.perms & S.P.CellResident) && card.level < 2) r = R.DCurfew;
      else if (d.locked && !d.inCurfew(mod) && card.level < 4) r = R.DLocked;
      else {
        const rq = d.reqFrom(fromRoom); r = checkCard(card, rq, this.now);
        if (isSuccess(r) && rq.dual && card.level < 5) {
          const pend = d.pendingCard && this.realTime - d.pendingTime <= 20;
          if (!pend) { d.pendingCard = card.id; d.pendingOwner = card.owner; d.pendingTime = this.realTime; r = R.Await; }
          else if (d.pendingOwner === card.owner) r = d.pendingCard === card.id ? R.Await : R.DSame;
          else d.pendingCard = null;
        }
      }
      if (isSuccess(r)) d.open(d.autoClose);
      const repeat = r === R.Await && d.lastResult === R.Await && this.realTime - d.lastResultTime < 20;
      d.lastResult = r; d.lastResultTime = this.realTime;
      if (!repeat) { this.accessLog.push({ t: this.now, door: d.id, card: card ? card.id : '—', owner: card ? card.ownerName : 'нет карты', by: who, r }); if (this.accessLog.length > 400) this.accessLog.splice(0, this.accessLog.length - 400); }
      if (!isSuccess(r) && r !== R.Await && !repeat)
        this.events.post({ time: this.now, type: r === R.Fault ? EV.ReaderMalfunction : EV.DoorDenied, roomId: fromRoom, pos: V.copy(d.pos), actor: who, target: d.id, text: d.name + ': ' + RESULT_TEXT[r] + ' (' + this.nameOf(who) + ')' });
      else if (d.kind === 'Heavy' && isSuccess(r))
        this.events.post({ time: this.now, type: EV.DoorAccess, roomId: fromRoom, pos: V.copy(d.pos), actor: who, target: d.id, severity: 1, text: d.name + ' открыта (' + this.nameOf(who) + ')' });
      return r;
    }
    canPlanThrough(d, from, card) {
      if (d.kind === 'Archway') return true;
      if (d.lockdown && (!card || card.level < 4)) return d.passable;
      if (!card) return d.passable;
      if (d.locked) { const c = d.inCurfew(this.clock.mod); if (c && (card.perms & S.P.CellResident) && card.level < 2) return false; if (!c && card.level < 4) return false; }
      return isSuccess(checkCard(card, d.reqFrom(from), this.now));
    }

    // --- movement
    planPath(from, fromRoom, goal, canUse) {
      let start = this.fac.nearestNode(from, fromRoom || (this.fac.roomAt(from) || {}).id);
      if (start < 0) start = this.fac.nearestNode(from, null);
      return findPath(this.fac, start, goal, canUse);
    }
    moveAgent(a, dt, onDoor, yieldPlayer) {
      if (!a.hasPath) { a.moving = false; return 'Idle'; }
      const nodes = this.fac.graph.nodes; a.doorCd -= dt; let guard = 0;
      while (dt > 1e-5 && a.hasPath && guard++ < 32) {
        const ti = a.path[a.pi], tn = nodes[ti];
        if (a.pi > 0) {
          const pi = a.path[a.pi - 1], e = this.fac.graph.find(pi, ti);
          if (e && e.doorId) {
            const d = this.fac.doors[e.doorId];
            if (!d.passable && V.distXZ(a.pos, nodes[pi].pos) < 0.7) {
              a.moving = false; a.waitingDoor = d.id; a.wait += dt; this.faceTowards(a, d.pos, dt);
              const out = onDoor ? onDoor(d, nodes[pi].roomId) : 'Blocked';
              return out === 'Blocked' ? 'Blocked' : 'Waiting';
            }
          }
        }
        a.waitingDoor = null; a.wait = 0;
        if (yieldPlayer && this.playerBlocking(a, tn.pos)) { a.blocked += dt; if (a.blocked < 3.5) { a.moving = false; return 'Waiting'; } }
        else a.blocked = 0;
        const dx = tn.pos.x - a.pos.x, dz = tn.pos.z - a.pos.z, dist = Math.sqrt(dx * dx + dz * dz), step = a.speed * dt;
        if (dist <= step) { a.pos = V.copy(tn.pos); dt -= a.speed > 0 ? dist / a.speed : dt; a.roomId = tn.roomId; a.pi++; }
        else { a.pos = V.v(a.pos.x + dx / dist * step, a.pos.y, a.pos.z + dz / dist * step); a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: dx, z: dz }), 540 * dt); dt = 0; }
        a.moving = true;
      }
      const r = this.fac.roomAt(a.pos); if (r && r.contains(a.pos)) a.roomId = r.id;
      if (!a.hasPath) { a.moving = false; if (a.arriveYaw != null) a.yaw = a.arriveYaw; return 'Arrived'; }
      return 'Moving';
    }
    playerBlocking(a, target) {
      if (this.player.dead) return false;
      const tp = { x: this.player.pos.x - a.pos.x, z: this.player.pos.z - a.pos.z }, d = Math.sqrt(tp.x * tp.x + tp.z * tp.z);
      if (d > 1.1 || d < 0.05) return false;
      const dir = V.normXZ({ x: target.x - a.pos.x, z: target.z - a.pos.z });
      return dir.x * tp.x / d + dir.z * tp.z / d > 0.55;
    }
    faceTowards(a, p, dt) { const dx = p.x - a.pos.x, dz = p.z - a.pos.z; if (dx * dx + dz * dz < 0.0025) return; a.yaw = S.moveTowardsAngle(a.yaw, V.yawFromDir({ x: dx, z: dz }), 360 * dt); }

    // --- perception & events
    onEvent(e) {
      const room = this.fac.room(e.roomId), imp = clamp(0.15 + e.severity * 0.28, 0, 1); let reporter = null;
      for (const n of this.npcs) {
        const nr = this.fac.room(n.agent.roomId);
        const wit = !!room && !!nr && !n.incap(this.now) && nr.canSeeInto(room.id);
        if (!wit && !e.pub) continue;
        if (e.type === EV.Conversation || e.type === EV.TaskIssued || e.type === EV.TaskCompleted) continue;
        if (e.type === EV.DoorDenied && e.actor === n.id) continue;
        n.memory.remember({ eventId: e.id, time: e.time, type: e.type, roomId: e.roomId, subject: e.actor, text: e.text, imp, conf: wit ? 1 : 0.9, src: wit ? 'Witnessed' : 'Announcement', shared: false }, this.now);
        if (wit && e.severity >= 2) n.needs.stress = Math.min(100, n.needs.stress + 6 * e.severity * (1.2 - n.traits.bravery));
        if (wit && !reporter && n.role !== 'DClass' && e.severity >= 1 && (e.type === EV.AnomalyBehaviour || e.type === EV.ContainmentWarning) && this.anomaly(e.actor)) reporter = n;
      }
      if (reporter) this.reportAnomaly(reporter.id, reporter.displayName, e);
      const pr = this.fac.room(this.player.roomId);
      const sees = !this.player.dead && !!pr && !!room && pr.canSeeInto(room.id);
      const own = e.actor === 'player' || e.target === 'player';
      const taskType = e.type === EV.TaskIssued || e.type === EV.TaskCompleted || e.type === EV.TaskFailed;
      if (e.pub || own || (sees && !taskType && e.type !== EV.DoorDenied)) this.notify.push(e);
    }
    reportAnomaly(id, name, e) {
      const a = this.anomaly(e.actor); if (!a || !a.contained) return;
      if (this.alert.level >= 1 && this.alert.roomId === a.containRoom) return;
      this.alert.raise(this, 1, 'Доклад: ' + name + ' — беспокойство ' + a.id, a.containRoom);
      const n = this.npc(id); if (n) n.say('Пост, это ' + name + ': ' + a.id + ' беспокоится, прошу внимания.', this.now);
    }
    canCount(pos, roomId, a) {
      const r = this.fac.room(roomId); if (!r || !a.agent.roomId || !r.canSeeInto(a.agent.roomId)) return false;
      return V.distXZ(pos, a.agent.pos) <= 10.5;
    }
    startCounting(id) {
      const a = this.anomaly(id), p = this.player; if (!a || p.dead || !this.canCount(p.pos, p.roomId, a)) return false;
      p.counting = true; p.countTarget = id; p.countSec = 0;
      this.events.post({ time: this.now, type: EV.CountingProtocol, roomId: p.roomId, pos: V.copy(p.pos), actor: 'player', target: id, severity: 1, text: p.name + ' начинает протокол счёта для ' + a.id });
      return true;
    }
    stopCounting(reason) { if (!this.player.counting) return; this.player.counting = false; this.notify.push({ time: this.now, type: EV.CountingProtocol, actor: 'player', severity: 1, text: 'Протокол счёта прерван: ' + reason }); }
    damagePlayer(amount, src, text) {
      const p = this.player; if (p.dead) return;
      p.health -= amount; p.stunnedUntil = this.realTime + 2.5; this.stopCounting('получен удар');
      this.events.post({ time: this.now, type: EV.Injury, roomId: p.roomId, pos: V.copy(p.pos), actor: src, target: 'player', severity: 2, text });
      if (p.health <= 0) { p.health = 0; p.dead = true; }
    }
    injureNpc(n, amount, src, text, mins) {
      n.needs.health = clamp(n.needs.health - amount, 0, 100); n.needs.stress = clamp(n.needs.stress + 35, 0, 100); n.incapUntil = this.now + mins; n.nextThink = 0;
      this.events.post({ time: this.now, type: EV.Injury, roomId: n.agent.roomId, pos: V.copy(n.agent.pos), actor: src, target: n.id, severity: 2, text });
    }

    // --- player actions
    checkpoint(poiId) {
      const poi = this.fac.poi(poiId); if (!poi) return null;
      const t = this.tasks.firstActive('player', 'Patrol');
      this.events.post({ time: this.now, type: EV.PatrolCheckpoint, roomId: poi.roomId, actor: 'player', target: poiId, text: this.player.name + ' отметился на точке «' + poi.label + '»' });
      if (!t) return 'Точка «' + poi.label + '» отмечена (активного обхода нет)';
      if (t.checkpoints.indexOf(poiId) < 0) return 'Точка «' + poi.label + '» не входит в текущий маршрут';
      if (t.done.indexOf(poiId) < 0) t.done.push(poiId);
      if (t.done.length >= t.checkpoints.length) { this.tasks.complete(this, t, 'маршрут пройден'); return 'Обход завершён: ' + t.done.length + '/' + t.checkpoints.length; }
      return 'Точка «' + poi.label + '» отмечена: ' + this.tasks.progress(t);
    }
    viewedCamera(id) {
      if (this.player.camsViewed.indexOf(id) < 0) this.player.camsViewed.push(id);
      const t = this.tasks.firstActive('player', 'CameraCheck'); if (!t) return;
      if (t.done.indexOf(id) < 0) t.done.push(id);
      if (t.done.length >= t.required) this.tasks.complete(this, t, 'камеры проверены');
    }
    observe(id, viaCamera) {
      const a = this.anomaly(id); if (!a) return 'Нет данных';
      const rep = a.beh.observe(this, 'player'); this.player.addJournal('[' + fmtStamp(this.now) + '] ' + rep);
      this.events.post({ time: this.now, type: EV.Observation, roomId: this.player.roomId, actor: 'player', target: id, text: this.player.name + ' наблюдает за ' + a.id + (viaCamera ? ' (камера)' : '') });
      for (const t of this.tasks.activeFor('player')) if (t.kind === 'Investigate' && t.target === id) this.tasks.complete(this, t, 'доклад передан');
      return rep;
    }
    report() { const s = this.dispatcher.playerReport(this); this.events.post({ time: this.now, type: EV.Report, roomId: this.player.roomId, actor: 'player', severity: 1, text: 'Рапорт ' + this.player.name + ': ' + s }); return s; }
    pickUp(cardId) {
      const c = this.card(cardId); if (!c || c.holder) return false;
      c.holder = 'player'; c.room = null; if (this.player.cards.indexOf(c.id) < 0) this.player.cards.push(c.id);
      this.events.post({ time: this.now, type: EV.SuspiciousActivity, roomId: this.player.roomId, actor: 'player', target: cardId, severity: c.owner === 'player' ? 0 : 1, text: this.player.name + ' подбирает ключ-карту L' + c.level + ' · ' + c.ownerName });
      return true;
    }
    talk(id) { const n = this.npc(id); return n ? Dialogue.talk(this, n) : ['...']; }

    // --- save
    save() {
      return JSON.stringify({
        version: 1, clock: this.clock.total, rng: this.rng.state, rt: this.realTime, ev: this.events.recent, evId: this.events.nextId, acc: this.accessLog, cards: this.cards,
        doors: this.fac.doorList.map(d => d.save()), rooms: this.fac.roomList.map(r => ({ id: r.id, l: r.lightsOn, f: r.flickerUntil })),
        npcs: this.npcs.map(n => n.save()), anomalies: this.anomalies.map(a => ({ id: a.id, a: a.agent.save(), c: a.contained, p: a.pose, la: a.lookAt, ba: a.breachAt, det: a.detected, b: a.beh.save() })),
        cams: this.cams.map(c => ({ id: c.id, op: c.operational, ph: c.phase })), camLog: this.camLog.slice(-120), alert: this.alert.save(),
        tasks: this.tasks.list, taskId: this.tasks.nextId, disp: this.dispatcher.save(), player: this.player.save()
      });
    }
    static load(json) {
      const o = JSON.parse(json);
      if (o.version !== 1) throw new Error('Несовместимая версия сохранения');
      const w = S.Content.createWorld(1);
      w.clock.total = o.clock; w.rng.state = o.rng; w.realTime = o.rt; w.events.recent = o.ev; w.events.nextId = o.evId; w.accessLog = o.acc; w.cards = o.cards;
      for (const d of o.doors) { const dd = w.fac.door(d.id); if (dd) dd.load(d); }
      for (const r of o.rooms) { const rr = w.fac.room(r.id); if (rr) { rr.lightsOn = r.l; rr.flickerUntil = r.f; } }
      for (const p of Object.values(w.fac.pois)) p.reservedBy = null;
      for (const n of o.npcs) { const nn = w.npc(n.id); if (nn) nn.load(n); }
      for (const a of o.anomalies) { const aa = w.anomaly(a.id); if (!aa) continue; aa.agent.load(a.a); aa.contained = a.c; aa.pose = a.p; aa.lookAt = a.la; aa.breachAt = a.ba; aa.detected = a.det; aa.beh.load(a.b); }
      for (const c of o.cams) { const cc = w.cams.find(x => x.id === c.id); if (cc) { cc.operational = c.op; cc.phase = c.ph; } }
      w.camLog = o.camLog; w.alert.load(o.alert); w.tasks.list = o.tasks; w.tasks.nextId = o.taskId; w.dispatcher.load(o.disp); w.player.load(o.player);
      return w;
    }
  }
  World.FIXED = FIXED;
  S.World = World; S.ALERT_NAMES = ALERT_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
