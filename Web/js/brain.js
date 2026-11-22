/* SCP LIFE — NPC behaviour and dialogue (port of NpcBrain.cs / NpcDialogue.cs). */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, Hm, fmtTime, fmtStamp, durationText, EV, Memory, ACT_NAMES } = S;
  const THINK = 1.6;

  function plan(activity, roomId, poi, label) { return { activity, roomId, poi, label, route: null, needDriven: false, taskId: null, targetId: null, duration: 0, specificPoi: null }; }

  const Brain = {
    update(w, npc, dt, gm) {
      const now = w.now;
      updateNeeds(w, npc, gm);
      if (npc.pendingBark && now >= npc.pendingBarkAt) { npc.say(npc.pendingBark, now); npc.pendingBark = null; }
      if (npc.incap(now)) {
        if (npc.activity !== 'Injured') {
          releasePoi(w, npc); if (npc.conv) endConv(w, npc); npc.agent.clear();
          npc.activity = 'Injured'; npc.label = 'Без сознания'; npc.taskId = null; npc.targetRoom = npc.agent.roomId;
        }
        npc.posture = 'Down'; return;
      }
      perceive(w, npc);
      npc.nextThink -= dt;
      if (npc.nextThink <= 0) { npc.nextThink = THINK * (0.75 + w.rng.next() * 0.5); think(w, npc); }
      act(w, npc, dt, gm);
      updateConversation(w, npc);
    },
    decide: null
  };

  // ------------------------------------------------------------------ needs
  function updateNeeds(w, npc, gm) {
    const h = gm / 60; if (h <= 0) return;
    const n = npc.needs, settled = npc.arrived && !npc.agent.moving;
    if (npc.activity === 'Sleep' && settled) { n.energy += 13 * h; n.hunger += 1.5 * h; n.stress -= 5 * h; }
    else {
      n.energy -= 4.2 * h; n.hunger += 5.5 * h; n.social -= 2.5 * h;
      const base = npc.role === 'DClass' ? 30 : 8 + (1 - npc.traits.bravery) * 8;
      n.stress += (base - n.stress) * Math.min(1, 0.08 * h);
    }
    if (settled) {
      switch (npc.activity) {
        case 'Eat': n.hunger -= 130 * h; break;
        case 'Leisure': n.stress -= 10 * h; n.social += 4 * h; break;
        case 'Work': case 'Maintenance': case 'RepairDoor': n.energy -= 1.5 * h; break;
        case 'Labor': n.energy -= 2 * h; n.stress += h; break;
        case 'Shelter': case 'Confined': if (w.alert.level >= 3) n.stress += 6 * h; break;
      }
    }
    if (npc.activity === 'Patrol') n.energy -= h;
    if (npc.conv) n.social += 45 * h;
    if (npc.activity !== 'Injured' && n.health < 100) n.health += 1.5 * h;
    for (const k in n) n[k] = clamp(n[k], 0, 100);
  }
  function needSatisfied(npc) {
    switch (npc.activity) {
      case 'Eat': return npc.needs.hunger < 15; case 'Sleep': return npc.needs.energy > 92;
      case 'Leisure': return npc.needs.stress < 35; case 'SeekTreatment': return npc.needs.health >= 90; default: return true;
    }
  }

  // ------------------------------------------------------------------ perception
  function perceive(w, npc) {
    const my = w.fac.room(npc.agent.roomId); if (!my) return;
    for (const a of w.anomalies) {
      if (!a.agent.roomId || !my.canSeeInto(a.agent.roomId)) continue;
      if (V.distXZ(npc.agent.pos, a.agent.pos) > 22) continue;
      npc.knownThreat = a.beh.threat; npc.knownThreatTime = w.now;
      if (a.contained) continue;
      if (!a.detected || w.now - w.alert.lastTime > 0.5) w.alert.reportBreach(w, a, a.agent.roomId, npc.displayName);
      if (npc.activity !== 'CountingProtocol' && npc.activity !== 'Flee') npc.nextThink = 0;
    }
  }
  function visibleBreached(w, npc) {
    const my = w.fac.room(npc.agent.roomId); if (!my) return null;
    for (const a of w.anomalies) { if (a.contained || !a.agent.roomId || !my.canSeeInto(a.agent.roomId)) continue; if (V.distXZ(npc.agent.pos, a.agent.pos) > 22) continue; return a; }
    return null;
  }

  // ------------------------------------------------------------------ decision
  function think(w, npc) { const p = decide(w, npc); if (samePlan(npc, p)) return; begin(w, npc, p); }

  function decide(w, npc) {
    const now = w.now, fac = w.fac;
    const vis = visibleBreached(w, npc);
    if (vis) {
      const canCount = npc.protocol && npc.role !== 'DClass' && npc.traits.bravery >= 0.3 && npc.needs.health > 35;
      if (canCount) { const p = plan('CountingProtocol', vis.agent.roomId, 'Stand', 'Протокол счёта'); p.targetId = vis.id; return p; }
      return plan('Flee', safestRoom(w, npc, vis.agent.roomId, null), 'Stand', 'Бегство');
    }
    const breached = w.alert.level >= 3 ? w.anomaly(w.alert.breachId) : null;
    if (breached && !breached.contained) {
      const last = w.alert.lastRoom || breached.containRoom;
      const responder = npc.role === 'Guard' && npc.traits.bravery >= 0.3 && npc.needs.health > 35;
      const brave = npc.role === 'Scientist' && npc.protocol && npc.traits.bravery >= 0.7;
      if (responder || brave) { const p = plan('Respond', last, 'Stand', 'Реагирование: ' + w.roomName(last)); p.targetId = breached.id; return p; }
      if (npc.role === 'DClass') { const p = plan('Confined', roomOfPoi(w, npc.bedPoi), 'CellBunk', 'Изоляция блока D'); p.specificPoi = npc.bedPoi; return p; }
      return plan('Shelter', safestRoom(w, npc, last, ['Dormitory', 'Laboratory', 'MedicalBay', 'SecurityPost', 'Canteen', 'Engineering']), 'Seat', 'Укрытие');
    }
    const card = w.card(npc.cardId);
    if (card && card.holder !== npc.id && npc.role !== 'DClass') {
      if (!card.holder && card.room && !card.revoked) { const p = plan('RetrieveCard', card.room, 'Stand', 'Ищет ключ-карту'); p.targetId = card.id; return p; }
      if (npc.cardLostAt < 0) {
        npc.cardLostAt = now; npc.say('Кто-то забрал мою карту! Докладываю на пост.', now);
        w.events.post({ time: now, type: EV.Report, roomId: npc.agent.roomId, pos: V.copy(npc.agent.pos), actor: npc.id, target: card.id, severity: 1, pub: true, text: npc.displayName + ' сообщает об утере ключ-карты ' + card.id });
      }
    }
    if (npc.needs.health < 60 && npc.role !== 'Medic') {
      if (npc.role === 'DClass') { const p = plan('Confined', roomOfPoi(w, npc.bedPoi), 'CellBunk', 'Отлёживается'); p.specificPoi = npc.bedPoi; return p; }
      const med = fac.firstRoom('MedicalBay');
      if (med) { const p = plan('SeekTreatment', med.id, 'MedBed', 'В медпункт'); p.needDriven = true; p.duration = 240; return p; }
    }
    for (const t of w.tasks.activeFor(npc.id)) {
      if (t.kind === 'ObservationSession') { const p = plan('ObservationSession', t.room, 'Console', 'Внеплановый сеанс счёта'); p.taskId = t.id; return p; }
      if (t.kind === 'RepairDoor') { const d = fac.door(t.target); const p = plan('RepairDoor', t.room, 'Panel', 'Ремонт: ' + (d ? d.name : 'замок')); p.taskId = t.id; p.targetId = t.target; return p; }
    }
    if (npc.needDriven && now < npc.actUntil && !needSatisfied(npc)) return currentPlan(npc);
    if (npc.role !== 'DClass') {
      if (npc.needs.energy < 10 && npc.bedPoi) { const p = plan('Sleep', roomOfPoi(w, npc.bedPoi), 'Bed', 'Сон (переутомление)'); p.needDriven = true; p.duration = 240; p.specificPoi = npc.bedPoi; return p; }
      if (npc.needs.hunger > 85) { const c = fac.firstRoom('Canteen'); if (c) { const p = plan('Eat', c.id, 'Seat', 'Внеплановый перекус'); p.needDriven = true; p.duration = 40; return p; } }
      if (npc.needs.stress > 85) { const d = fac.firstRoom('Dormitory'); if (d) { const p = plan('Leisure', d.id, 'Seat', 'Перерыв: нервы'); p.needDriven = true; p.duration = 30; return p; } }
    }
    const block = npc.schedule.at(w.clock.mod);
    if (block) {
      if (block.activity === 'ChamberInspection') {
        const caution = 45 + (1 - npc.traits.diligence) * 40;
        const believes = npc.knownThreat >= caution && now - npc.knownThreatTime < 8 * 60;
        if (believes) { const obs = fac.firstRoom('Observation'); return plan('ObservationSession', obs && obs.id, 'Console', 'Осмотр отменён: объект возбуждён — сеанс счёта'); }
      }
      const p = plan(block.activity, block.roomId, block.poi, block.label); p.route = block.route;
      if (block.roomId === '@bed') { p.roomId = roomOfPoi(w, npc.bedPoi); if (block.poi === 'Bed' || block.poi === 'CellBunk') p.specificPoi = npc.bedPoi; }
      return p;
    }
    return plan('Idle', npc.workRoom || npc.agent.roomId, 'Stand', 'Свободное время');
  }
  Brain.decide = decide;

  function currentPlan(npc) { return { activity: npc.activity, roomId: npc.targetRoom, label: npc.label, route: npc.route, needDriven: npc.needDriven, taskId: npc.taskId, targetId: npc.followId, specificPoi: npc.reservedPoi, duration: 0 }; }
  function samePlan(npc, p) {
    if (npc.activity !== p.activity || npc.taskId !== p.taskId) return false;
    switch (p.activity) {
      case 'CountingProtocol': case 'Flee': return true;
      case 'Respond': case 'Shelter': return npc.targetRoom === p.roomId;
      default: return npc.targetRoom === p.roomId && npc.label === (p.label || npc.label);
    }
  }
  const roomOfPoi = (w, id) => { const p = w.fac.poi(id); return p ? p.roomId : null; };

  function safestRoom(w, npc, danger, allowed) {
    const card = w.card(npc.cardId); let best = npc.agent.roomId, bs = -Infinity;
    for (const room of w.fac.roomList) {
      if (room.id === danger || room.type === 'Containment') continue;
      if (allowed && allowed.indexOf(room.type) < 0) continue;
      const dd = w.fac.roomDistance(danger, room.id), ds = w.fac.roomDistance(npc.agent.roomId, room.id);
      if (dd === Infinity || ds === Infinity) continue;
      let score = Math.min(dd, 6) - ds * 0.35; if (room.id === npc.agent.roomId) score += 0.2;
      if (score <= bs) continue;
      const goal = room.hubNodes.length ? room.hubNodes[0] : -1; if (goal < 0) continue;
      if (room.id !== npc.agent.roomId && !w.planPath(npc.agent.pos, npc.agent.roomId, goal, (d, f) => w.canPlanThrough(d, f, card))) continue;
      bs = score; best = room.id;
    }
    return best;
  }

  // ------------------------------------------------------------------ starting activities
  function begin(w, npc, p) {
    const now = w.now;
    releasePoi(w, npc); if (npc.conv) endConv(w, npc);
    npc.activity = p.activity; npc.label = p.label || ACT_NAMES[p.activity] || p.activity; npc.targetRoom = p.roomId; npc.taskId = p.taskId;
    npc.needDriven = p.needDriven; npc.actStart = now; npc.actUntil = p.duration > 0 ? now + p.duration : 0; npc.route = p.route || []; npc.routeIndex = 0;
    npc.arrived = false; npc.posture = 'Standing'; npc.dwell = 0; npc.blockedCount = 0; npc.blockedRetry = 0; npc.followId = p.targetId;
    switch (p.activity) {
      case 'Flee': npc.say(npc.role === 'DClass' ? 'Откройте! Оно идёт!' : 'Оно здесь! Уходим!', now); break;
      case 'CountingProtocol': npc.say('Протокол счёта! Один… два… три…', now); break;
      case 'Shelter': if (w.alert.level >= 3) npc.say('В укрытие, быстро!', now); break;
      case 'Respond': npc.say('Иду на сигнал: ' + w.roomName(p.roomId) + '.', now); break;
      case 'RepairDoor': npc.say('Принял заявку, иду чинить замок.', now); break;
    }
    setDestination(w, npc, p.poi, p.specificPoi);
  }

  function setDestination(w, npc, poiType, specific) {
    let goal = -1, yaw = null; const room = w.fac.room(npc.targetRoom);
    switch (npc.activity) {
      case 'Patrol': case 'Maintenance': {
        if (!npc.route.length) break; const poi = w.fac.poi(npc.route[npc.routeIndex % npc.route.length]); if (!poi) break;
        npc.targetRoom = poi.roomId; goal = poi.node; yaw = poi.yaw; break;
      }
      case 'CountingProtocol': {
        const a = w.anomaly(npc.followId); if (!a) break; const mine = w.fac.room(npc.agent.roomId);
        const tr = mine && mine.canSeeInto(a.agent.roomId) ? mine.id : a.agent.roomId;
        goal = nearestNodeTowards(w, tr, a.agent.pos, npc.agent.pos, 6); break;
      }
      case 'RetrieveCard': { const c = w.card(npc.followId); if (!c || c.holder) break; goal = w.fac.nearestNode(c.pos, c.room); break; }
      default: {
        if (!room) break; const poi = reservePoi(w, npc, room, poiType, specific);
        if (poi) { goal = poi.node; yaw = poi.yaw; } else if (room.hubNodes.length) goal = room.hubNodes[w.rng.int(0, room.hubNodes.length)];
      }
    }
    if (goal < 0) { npc.agent.clear(); npc.arrived = true; return; }
    const card = w.card(npc.cardId);
    const path = w.planPath(npc.agent.pos, npc.agent.roomId, goal, (d, f) => card && card.holder === npc.id ? w.canPlanThrough(d, f, card) : d.passable);
    if (!path) {
      npc.agent.clear(); npc.arrived = true; npc.blockedRetry = 8;
      if (npc.blockedCount++ < 1) npc.say('Не могу пройти в «' + w.roomName(npc.targetRoom) + '».', w.now);
      return;
    }
    npc.agent.setPath(path); npc.agent.arriveYaw = yaw; npc.arrived = false;
  }
  function nearestNodeTowards(w, roomId, target, from, keep) {
    let best = -1, bs = Infinity;
    for (const n of w.fac.graph.nodes) { if (n.roomId !== roomId) continue; const s = Math.abs(V.distXZ(n.pos, target) - keep) + V.distXZ(n.pos, from) * 0.15; if (s < bs) { bs = s; best = n.index; } }
    return best;
  }
  function reservePoi(w, npc, room, type, specific) {
    let chosen = null;
    if (specific) { chosen = w.fac.poi(specific); if (chosen && chosen.reservedBy && chosen.reservedBy !== npc.id) chosen = null; }
    if (!chosen) {
      const cands = [];
      for (const p of room.pois) {
        if (p.type !== type) continue; if (p.reservedBy && p.reservedBy !== npc.id) continue; if (p.owner && p.owner !== npc.id) continue;
        if (p.owner === npc.id) { chosen = p; break; } cands.push(p);
      }
      if (!chosen && cands.length) chosen = cands[w.rng.int(0, cands.length)];
    }
    if (chosen) { chosen.reservedBy = npc.id; npc.reservedPoi = chosen.id; }
    return chosen;
  }
  function releasePoi(w, npc) { if (!npc.reservedPoi) return; const p = w.fac.poi(npc.reservedPoi); if (p && p.reservedBy === npc.id) p.reservedBy = null; npc.reservedPoi = null; }

  // ------------------------------------------------------------------ acting
  function act(w, npc, dt, gm) {
    const now = w.now;
    if (npc.agent.hasPath) {
      const st = w.moveAgent(npc.agent, dt, handler(w, npc), true);
      npc.posture = 'Standing';
      if (st === 'Arrived') onArrived(w, npc);
      else if (st === 'Blocked') onBlocked(w, npc);
      else if (st === 'Waiting' && npc.agent.blocked > 1.2 && npc.agent.blocked < 1.2 + dt + 0.01) npc.say(npc.role === 'DClass' ? 'Можно пройти, начальник?' : 'Разрешите пройти.', now);
      if (npc.activity === 'CountingProtocol') updateCounting(w, npc, dt);
      return;
    }
    if (npc.blockedRetry > 0) { npc.blockedRetry -= dt; if (npc.blockedRetry <= 0) { const rp = w.fac.poi(npc.reservedPoi); setDestination(w, npc, rp ? rp.type : 'Stand', npc.reservedPoi); } return; }
    if (!npc.arrived) onArrived(w, npc);
    switch (npc.activity) {
      case 'Patrol': case 'Maintenance':
        npc.dwell -= dt;
        if (npc.dwell <= 0 && npc.route.length) { npc.routeIndex = (npc.routeIndex + 1) % npc.route.length; npc.arrived = false; setDestination(w, npc, 'Stand', null); }
        break;
      case 'CountingProtocol': updateCounting(w, npc, dt); break;
      case 'Respond': { const last = w.alert.lastRoom; if (last && last !== npc.targetRoom) { npc.targetRoom = last; npc.label = 'Реагирование: ' + w.roomName(last); npc.arrived = false; setDestination(w, npc, 'Stand', null); } break; }
      case 'Flee': npc.activity = 'Shelter'; npc.label = 'Укрытие'; npc.posture = 'Cowering'; break;
      case 'RetrieveCard': { const c = w.card(npc.followId); if (c && !c.holder && V.distXZ(c.pos, npc.agent.pos) < 2.5) { c.holder = npc.id; c.room = null; npc.say('Вот она, моя карта.', now); } npc.nextThink = 0; break; }
      case 'RepairDoor': {
        npc.dwell += gm; const t = w.tasks.get(npc.taskId); const d = t ? w.fac.door(t.target) : null;
        if (d && npc.dwell >= 15) { d.integrity = 100; d.faultUntil = 0; if (d.state === S.DS.Open && !w.doorOccupied(d)) d.close(); w.tasks.complete(w, t, 'замок восстановлен'); npc.say('Замок перебран, контроллер в норме.', now); npc.taskId = null; npc.nextThink = 0; }
        break;
      }
      case 'ObservationSession':
        if (npc.taskId && now - npc.actStart > 25) { const t = w.tasks.get(npc.taskId); if (t) w.tasks.complete(w, t, 'сеанс проведён'); npc.taskId = null; npc.nextThink = 0; }
        else if (w.rng.chance(dt * 0.05)) npc.say(countLine(w), now, 1.0);
        break;
      case 'Treat': treat(w, npc, gm); break;
      case 'GuardPost': monitorCameras(w, npc, gm); break;
      case 'SeekTreatment': if (!medicWorking(w, npc.agent.roomId)) npc.needs.health += gm / 60 * 3; break;
    }
    if (npc.needDriven && needSatisfied(npc)) { npc.needDriven = false; npc.nextThink = 0; }
  }

  function onArrived(w, npc) {
    npc.arrived = true; const poi = w.fac.poi(npc.reservedPoi);
    npc.posture = postureFor(npc.activity, poi ? poi.type : 'Stand', w.alert.level);
    if (npc.activity === 'Patrol') {
      npc.dwell = w.rng.range(10, 22);
      if (w.rng.chance(0.35)) { const cp = npc.route.length ? w.fac.poi(npc.route[npc.routeIndex % npc.route.length]) : null; npc.say(cp ? 'Точка «' + cp.label + '»: без происшествий.' : 'Чисто.', w.now); }
    } else if (npc.activity === 'Maintenance') {
      npc.dwell = w.rng.range(18, 32); npc.posture = 'Working'; if (w.rng.chance(0.3)) npc.say('Щиток в норме, напряжение стабильное.', w.now);
    } else if (npc.activity === 'RepairDoor') npc.dwell = 0;
  }
  function postureFor(a, poi, alert) {
    switch (a) {
      case 'Sleep': return poi === 'Bed' || poi === 'CellBunk' ? 'Lying' : 'Sitting';
      case 'Confined': return alert >= 3 ? 'Cowering' : (poi === 'CellBunk' ? 'Sitting' : 'Standing');
      case 'Eat': case 'Leisure': return poi === 'Seat' || poi === 'Bed' ? 'Sitting' : 'Standing';
      case 'GuardPost': return 'Sitting';
      case 'Work': return poi === 'Desk' || poi === 'Console' ? 'Sitting' : 'Working';
      case 'ObservationSession': return 'Counting';
      case 'ChamberInspection': case 'Maintenance': case 'RepairDoor': case 'Labor': case 'Hygiene': case 'Treat': return 'Working';
      case 'SeekTreatment': return poi === 'MedBed' ? 'Lying' : 'Sitting';
      case 'Shelter': return alert >= 3 ? 'Cowering' : 'Standing';
      case 'CountingProtocol': return 'Counting';
      default: return 'Standing';
    }
  }
  function onBlocked(w, npc) {
    npc.blockedCount++; const d = w.fac.door(npc.agent.waitingDoor); const name = d ? d.name : 'дверь'; npc.agent.clear();
    if (npc.blockedCount >= 3) { npc.say(name + ' не открывается. Подожду.', w.now); npc.arrived = true; npc.blockedRetry = 25; npc.blockedCount = 0; npc.nextThink = 20; return; }
    npc.say('Странно, не пускает…', w.now); npc.blockedRetry = 4 + npc.blockedCount * 2; npc.arrived = true;
  }
  function handler(w, npc) { if (!npc._dh) npc._dh = (door, from) => handleDoor(w, npc, door, from); return npc._dh; }
  function handleDoor(w, npc, door, from) {
    if (door.state === S.DS.Opening) return 'Wait';
    if (npc.agent.doorCd > 0) return 'Wait';
    npc.agent.doorCd = 1.3;
    const card = w.card(npc.cardId);
    if (!card || card.holder !== npc.id) { if (npc.agent.wait < 1.5) npc.say('Где моя карта?..', w.now); return npc.agent.wait > 10 ? 'Blocked' : 'Wait'; }
    const r = w.presentCard(door.id, card.id, npc.id, from);
    switch (r) {
      case S.R.Granted: case S.R.Override: return 'Wait';
      case S.R.Await: if (npc.agent.wait > 60) { npc.say('Второй карты так и нет. Отбой.', w.now); return 'Blocked'; } if (npc.agent.wait < 1.5) npc.say('Жду вторую карту.', w.now); return 'Wait';
      case S.R.DSame: return 'Wait';
      case S.R.Fault: if (npc.agent.wait < 1.5) npc.say('Считыватель глючит…', w.now); return npc.agent.wait > 25 ? 'Blocked' : 'Wait';
      default: return 'Blocked';
    }
  }

  function updateCounting(w, npc, dt) {
    const a = w.anomaly(npc.followId);
    if (!a || a.contained) { npc.nextThink = 0; return; }
    if (w.canCount(npc.agent.pos, npc.agent.roomId, a)) {
      if (npc.agent.hasPath) npc.agent.clear();
      npc.posture = 'Counting'; npc.arrived = true; w.faceTowards(npc.agent, a.agent.pos, dt);
      if (w.now >= npc.barkUntil - 0.3) npc.say(countLine(w), w.now, 0.9);
      if (V.distXZ(npc.agent.pos, a.agent.pos) < 2) {
        const retreat = nearestNodeTowards(w, npc.agent.roomId, a.agent.pos, npc.agent.pos, 7); const card = w.card(npc.cardId);
        const path = w.planPath(npc.agent.pos, npc.agent.roomId, retreat, (d, f) => w.canPlanThrough(d, f, card)); if (path) npc.agent.setPath(path);
      }
      return;
    }
    npc.dwell -= dt;
    if (npc.dwell <= 0 || !npc.agent.hasPath) { npc.dwell = 2; setDestination(w, npc, 'Stand', null); }
  }
  function countLine(w) { return S.numWords(Math.floor(w.realTime / 1.5) % 100 + 1) + '…'; }
  function medicWorking(w, roomId) { return w.npcs.some(o => o.role === 'Medic' && o.activity === 'Treat' && o.arrived && o.agent.roomId === roomId && !o.incap(w.now)); }
  function treat(w, medic, gm) {
    const heal = gm / 60 * 35;
    for (const p of w.npcs) {
      if (p === medic || p.activity !== 'SeekTreatment' || !p.arrived || p.agent.roomId !== medic.agent.roomId) continue;
      const below = p.needs.health < 90;
      p.needs.health = Math.min(100, p.needs.health + heal); p.needs.stress = Math.max(0, p.needs.stress - heal * 0.5);
      if (below && p.needs.health >= 90) {
        w.events.post({ time: w.now, type: EV.Treatment, roomId: medic.agent.roomId, actor: medic.id, target: p.id, text: medic.displayName + ' оказала помощь: ' + p.displayName + ' снова в строю' });
        medic.say(p.shortName + ', можете возвращаться к работе.', w.now); p.nextThink = 0;
      }
    }
  }
  function monitorCameras(w, npc, gm) {
    if (!npc.arrived || gm <= 0) return;
    for (const a of w.anomalies) {
      if (!a.contained || !a.beh.isTallyman) continue;
      const st = a.beh.state; if (st !== 'Signaling' && st !== 'Probing') continue;
      if (!w.cams.some(c => c.operational && c.roomId === a.agent.roomId)) continue;
      const per = 0.04 + npc.traits.diligence * 0.1 - npc.needs.stress * 0.0005;
      if (!w.rng.chance(Math.max(0.01, per) * gm)) continue;
      w.reportAnomaly(npc.id, npc.displayName, { actor: a.id, roomId: a.agent.roomId });
    }
  }

  // ------------------------------------------------------------------ conversations
  function social(npc) {
    switch (npc.activity) { case 'Eat': case 'Leisure': return true; case 'Labor': case 'Confined': return npc.role === 'DClass' && npc.posture !== 'Cowering'; default: return false; }
  }
  function updateConversation(w, npc) {
    const now = w.now;
    if (npc.conv) { const p = w.npc(npc.conv); if (!p || now >= npc.convUntil || p.agent.roomId !== npc.agent.roomId || p.incap(now) || npc.agent.hasPath) endConv(w, npc); return; }
    if (!npc.arrived || npc.agent.hasPath || !social(npc)) return;
    if (now < npc.nextConv) return;
    if (npc.needs.social > 85 && !w.rng.chance(0.25)) { npc.nextConv = now + 20; return; }
    let best = null, bs = -Infinity;
    for (const o of w.npcs) {
      if (o === npc || o.conv || !o.arrived || o.agent.hasPath || o.agent.roomId !== npc.agent.roomId || !social(o) || o.incap(now)) continue;
      if (V.distXZ(o.agent.pos, npc.agent.pos) > 6) continue;
      const s = npc.relTo(o.id) * 0.02 + w.rng.next() + o.traits.sociability * 0.5; if (s > bs) { bs = s; best = o; }
    }
    if (!best || !w.rng.chance(0.35 + npc.traits.sociability * 0.5)) { npc.nextConv = now + w.rng.range(8, 20); return; }
    startConv(w, npc, best);
  }
  function startConv(w, a, b) {
    const now = w.now, dur = w.rng.range(6, 12);
    a.conv = b.id; b.conv = a.id; a.convUntil = b.convUntil = now + dur;
    a.nextConv = now + dur + w.rng.range(35, 80); b.nextConv = now + dur + w.rng.range(35, 80);
    const r = Dialogue.converse(w, a, b);
    a.say(r.opening, now, 2); b.pendingBark = r.reply; b.pendingBarkAt = now + 1.2;
    if (r.follow) { a.pendingBark = r.follow; a.pendingBarkAt = now + 3; }
    if (r.conflict) w.events.post({ time: now, type: EV.Conflict, roomId: a.agent.roomId, pos: V.copy(a.agent.pos), actor: a.id, target: b.id, severity: a.role === 'DClass' || b.role === 'DClass' ? 2 : 1, text: 'Ссора: ' + a.displayName + ' и ' + b.displayName });
  }
  function endConv(w, npc) { const p = w.npc(npc.conv); npc.conv = null; if (p && p.conv === npc.id) p.conv = null; }

  // ------------------------------------------------------------------ dialogue
  function sev(m) { switch (m.type) { case EV.ContainmentBreach: case EV.Injury: return 3; case EV.ContainmentWarning: case EV.Conflict: case EV.AlertChanged: case EV.SuspiciousActivity: return 2; default: return 1; } }
  const pick = (w, arr) => arr[w.rng.int(0, arr.length)];
  const shorten = s => !s ? 'что-то странное' : (s.length > 110 ? s.slice(0, 107) + '…' : s);
  function gossipLine(w, sp, m) {
    const when = fmtTime(m.time), text = shorten(m.text);
    switch (m.src) {
      case 'Witnessed': return sp.G('Я сам видел', 'Я сама видела') + ' в ' + when + ': ' + text;
      case 'HeardFrom': { const t = w.npc(m.toldBy); return t ? t.shortName + ' говорит: ' + text : 'Говорят: ' + text; }
      case 'Announcement': return 'Слышал' + sp.G('', 'а') + ' оповещение в ' + when + '? ' + text;
      default: return 'По камерам видно: ' + text;
    }
  }
  function share(w, sp, li, m) {
    m.shared = true;
    li.memory.remember({ eventId: m.eventId, time: m.time, type: m.type, roomId: m.roomId, subject: m.subject, text: m.text, imp: m.imp * 0.85, conf: m.conf * 0.8, src: 'HeardFrom', toldBy: sp.id }, w.now);
    if ((m.type === EV.AnomalyBehaviour || m.type === EV.ContainmentWarning) && m.time > li.knownThreatTime) { li.knownThreat = m.type === EV.ContainmentWarning ? 75 : 55; li.knownThreatTime = m.time; }
  }
  function smallTalk(w, a) {
    if (a.needs.energy < 25) return 'Я с ног валюсь. Скорее бы отбой.';
    if (a.needs.hunger > 70) return 'Когда уже раздача? Есть хочется.';
    if (a.needs.stress > 60) return 'Нервы ни к чёрту в последнее время.';
    switch (a.role) {
      case 'DClass': return pick(w, ['Слышал, через месяц обещают перевод. Врут, конечно.', 'Опять эта баланда.', 'Сколько тебе ещё сидеть?', 'Ночью опять что-то скреблось за стеной.']);
      case 'Scientist': return pick(w, ['Счетовод сегодня сделал на стене новую серию отметок.', 'Я дописываю отчёт по сеансам счёта.', 'Гипотеза о ритме подтверждается — он реагирует на распорядок.', 'Кофе в лаборатории опять кончился.']);
      case 'Guard': return pick(w, ['На посту всё тихо.', 'Камера К-04 снова мутит изображение.', 'Начальник смены опять менял маршруты.', 'Говорят, в восточном крыле меняют замки.']);
      case 'Technician': return pick(w, ['Генератор гудит громче обычного.', 'Половина ламп в коридоре на последнем издыхании.', 'Заявок сегодня — как никогда.']);
      case 'Medic': return pick(w, ['У D-класса опять жалобы на бессонницу.', 'Запасы перевязки пора пополнять.', 'Вы спите хоть иногда?']);
      default: return 'Как смена?';
    }
  }
  const Dialogue = {
    converse(w, a, b) {
      const now = w.now, r = { opening: '', reply: '', follow: null, conflict: false };
      const stress = (a.needs.stress + b.needs.stress) / 2, temper = (a.traits.temper + b.traits.temper) / 2, rel = (a.relTo(b.id) + b.relTo(a.id)) / 2;
      let cc = 0;
      if (rel < 5 && stress > 45) cc = 0.15 + temper * 0.5 + (stress - 45) / 150;
      if (rel < -20) cc = Math.max(cc, 0.1 + temper * 0.3);
      if (rel < -30) cc += 0.2;
      if (w.rng.chance(cc)) {
        r.conflict = true;
        r.opening = pick(w, a.role === 'DClass' ? ['Чего уставился? Отвали.', 'Это моё место, понял?', 'Ещё раз тронешь мои вещи — пожалеешь.'] : ['Опять ты за своё? Хватит.', 'Мне надоело за тебя отдуваться.', 'Не указывай мне, как работать.']);
        r.reply = pick(w, b.role === 'DClass' ? ['Сам отвали!', 'Ты кому это сказал?', 'Посмотрим, кто пожалеет.'] : ['Это я-то? На себя посмотри.', 'Поговорим об этом у начальства.', 'Не начинай.']);
        a.adjustRel(b.id, -12); b.adjustRel(a.id, -12); a.needs.stress = Math.min(100, a.needs.stress + 10); b.needs.stress = Math.min(100, b.needs.stress + 10);
        return r;
      }
      const ga = a.memory.bestGossip(now, m => !b.memory.knows(m.eventId) && m.subject !== b.id);
      const gb = b.memory.bestGossip(now, m => !a.memory.knows(m.eventId) && m.subject !== a.id);
      if (ga) { r.opening = gossipLine(w, a, ga); share(w, a, b, ga); } else r.opening = smallTalk(w, a);
      if (gb) { r.reply = gossipLine(w, b, gb); share(w, b, a, gb); }
      else if (ga) { const s = sev(ga); r.reply = s === 3 ? pick(w, ['Чёрт… Кто пострадал?', 'Мне это совсем не нравится.']) : s === 2 ? pick(w, ['Серьёзно? Надо быть осторожнее.', 'Опять? Уже не первый раз.']) : pick(w, ['Ну и дела.', 'Хм, буду иметь в виду.', 'Интересно.']); }
      else r.reply = b.needs.stress > 60 ? 'Да уж… Держимся.' : pick(w, ['Угу.', 'И не говори.', 'Бывает.', 'Точно.']);
      if (ga && sev(ga) >= 2 && w.rng.chance(0.5)) r.follow = a.role === 'DClass' ? 'Нас тут всех когда-нибудь пустят в расход.' : 'Надеюсь, СБ разберётся.';
      const gain = 2 + a.traits.sociability * 2 + b.traits.sociability * 2; a.adjustRel(b.id, gain); b.adjustRel(a.id, gain);
      return r;
    },
    talk(w, npc) {
      const now = w.now, lines = [], rel = npc.relTo('player');
      if (npc.incap(now)) return [npc.displayName + ' без сознания. Дыхание есть.'];
      let greet;
      if (npc.role === 'DClass') greet = rel < -20 ? 'Чего надо, начальник?' : 'Здравствуйте, гражданин начальник.';
      else if (rel > 30) greet = 'А, Волков! Рад' + npc.G('', 'а') + ' видеть.';
      else greet = pick(w, ['Слушаю.', 'Да?', 'Что-то случилось?']);
      lines.push(greet);
      const block = npc.schedule.at(w.clock.mod), act = (npc.label || ACT_NAMES[npc.activity] || '').toLowerCase();
      lines.push(block && block.activity === npc.activity ? 'Сейчас у меня ' + act + ', по графику до ' + fmtTime(block.end) + '.' : 'Сейчас: ' + act + '.');
      const g = npc.memory.bestGossip(now, m => m.subject !== 'player');
      if (g) { lines.push(gossipLine(w, npc, g)); g.shared = true; w.player.addJournal('[' + fmtStamp(now) + '] ' + npc.shortName + ': ' + shorten(g.text)); }
      else lines.push('Ничего особенного не слышал' + npc.G('', 'а') + '.');
      if (npc.role === 'Scientist' && npc.knownThreatTime >= 0) {
        const st = npc.knownThreat < 30 ? 'спокоен' : npc.knownThreat < 55 ? 'насторожен' : npc.knownThreat < 75 ? 'возбуждён' : 'крайне возбуждён';
        lines.push('Когда я видел' + npc.G('', 'а') + ' SCP-L-001 (' + durationText(now - npc.knownThreatTime) + ' назад), он был ' + st + '.');
      }
      if (npc.needs.hunger > 70) lines.push('Ещё бы поесть успеть…'); else if (npc.needs.energy < 25) lines.push('Я почти не спал' + npc.G('', 'а') + '.'); else if (npc.needs.stress > 65) lines.push('Честно — мне здесь страшно.');
      npc.adjustRel('player', 1.5);
      return lines;
    }
  };

  S.Brain = Brain; S.Dialogue = Dialogue;
})(typeof window !== 'undefined' ? window : globalThis);
