/* SCP LIFE 2.0 — NPC behaviour: needs and psyche, profession duties, perception reactions, doors, queues, escort, conversations and dialogue. */
(function (root) {
  'use strict';
  const S = root.SCP;
  const { V, clamp, Hm, fmtTime, fmtStamp, durationText, EV, ACT_NAMES } = S;
  const THINK = 1.6;
  const SAFE = ['Shelter', 'Dormitory', 'Quarters', 'Barracks', 'Laboratory', 'MedicalBay', 'SecurityPost', 'Canteen', 'Engineering', 'Office', 'Command', 'Meeting', 'Storage', 'Workshop'];

  function plan(activity, roomId, poi, label) { return { activity, roomId, poi, label, needDriven: false, taskId: null, targetId: null, duration: 0, specificPoi: null, job: null }; }

  const Brain = {
    update(w, n, dt, gm, remote) {
      const now = w.now;
      updateNeeds(w, n, gm);
      if (n.pendingBark && now >= n.pendingBarkAt) { n.say(n.pendingBark, now); n.pendingBark = null; }
      if (n.agent.transitT > 0) { w.tickTransit(n.agent, dt); return; }
      if (n.incap(now)) {
        if (n.activity !== 'Injured') { releasePoi(w, n); leaveQueue(w, n); if (n.conv) endConv(w, n); n.agent.clear(); n.activity = 'Injured'; n.label = 'Без сознания'; n.taskId = null; n.targetRoom = n.agent.roomId; }
        n.posture = 'Down'; return;
      }
      perceive(w, n, dt);
      n.nextThink -= dt;
      if (n.nextThink <= 0) { n.nextThink = THINK * (0.75 + w.rng.next() * 0.5) * (remote ? 1.5 : 1); think(w, n); }
      act(w, n, dt, gm, remote);
      if (!remote) updateConversation(w, n);
    },
    decide: null, plan
  };

  // ------------------------------------------------------------------ needs and psyche
  function updateNeeds(w, n, gm) {
    const h = gm / 60; if (h <= 0) return;
    const nd = n.needs, ps = n.psy, settled = n.arrived && !n.agent.moving;
    const sleeping = (n.activity === 'Sleep' || n.activity === 'Sick') && settled;
    if (sleeping) { nd.energy += 13 * h; nd.hunger += 1.5 * h; nd.stress -= 5 * h; ps.fatigue -= 14 * h; }
    else {
      nd.energy -= 4.2 * h; nd.hunger += 5.5 * h; nd.social -= 2.5 * h; ps.fatigue += (n.activity === 'Duty' || n.taskId || n.routine ? 4.5 : 3) * h + (w.clock.night && n.role !== 'DClass' ? 1.5 * h : 0);
      const base = n.role === 'DClass' ? 30 : 8 + (1 - n.traits.bravery) * 8 + (n.dept && w.life ? w.life.deptStress(n.dept) : 0);
      nd.stress += (base - nd.stress) * Math.min(1, 0.08 * h);
    }
    if (settled) switch (n.activity) {
      case 'Eat': nd.hunger -= 130 * h; break;
      case 'Leisure': nd.stress -= 10 * h; nd.social += 4 * h; ps.fear -= 10 * h; break;
      case 'Work': case 'Maintenance': case 'RepairDoor': nd.energy -= 1.5 * h; break;
      case 'Labor': nd.energy -= 2 * h; nd.stress += h; break;
      case 'Shelter': case 'Confined': if (w.alert.level >= 3) nd.stress += 6 * h; break;
    }
    if (n.activity === 'Patrol') nd.energy -= h;
    if (n.conv) { nd.social += 45 * h; ps.fear -= 15 * h; }
    if (n.activity !== 'Injured' && nd.health < 100) nd.health += 1.5 * h;
    ps.fear -= 20 * h * (0.5 + ps.resilience); ps.exposure -= 1 * h;
    if (w.clock.night && n.role !== 'DClass' && n.traits.bravery < 0.4 && w.isolated(n.agent.roomId, n.id)) ps.fear += 3 * h;
    for (const k in nd) nd[k] = clamp(nd[k], 0, 100);
    ps.fatigue = clamp(ps.fatigue, 0, 100); ps.fear = clamp(ps.fear, 0, 100); ps.exposure = clamp(ps.exposure, 0, 100);
    ps.focus = clamp(1 - ps.fatigue / 160 - ps.fear / 220 - nd.stress / 320 - (100 - nd.energy) / 400, 0.15, 1);
  }
  function needSatisfied(n) {
    switch (n.activity) {
      case 'Eat': return n.needs.hunger < 15; case 'Sleep': return n.needs.energy > 92;
      case 'Leisure': return n.needs.stress < 35; case 'SeekTreatment': return n.needs.health >= 90 && !n.isSick(0); default: return true;
    }
  }

  // ------------------------------------------------------------------ perception (real world) and subjective effects
  function perceive(w, n, dt) {
    const my = w.fac.room(n.agent.roomId); if (!my) return;
    for (const a of w.anomalies) {
      if (!a.arrived || !a.agent.roomId || !my.canSeeInto(a.agent.roomId)) continue;
      if (V.distXZ(n.agent.pos, a.agent.pos) > 22) continue;
      n.knownThreat = a.threat; n.knownThreatTime = w.now; n.lastSeenScp = a.id;
      if (a.contained) continue;
      if (!a.detected || w.now - w.alert.lastTime > 0.5) w.alert.reportBreach(w, a, a.agent.roomId, n.displayName);
      if (a.temper === 'aggressive' && n.activity !== 'CountingProtocol' && n.activity !== 'Flee') n.nextThink = 0;
    }
    // subjective perception: reactions to effects that exist only for this person
    n.percT = (n.percT || 0) - dt; if (n.percT > 0 || !w.horror) return; n.percT = 3 + w.rng.next() * 3;
    for (const e of w.horror.effectsOf(n.id)) {
      if (!w.horror.active(e, n.id)) continue;
      switch (e.kind) {
        case 'follower': if (w.rng.chance(0.25)) { n.say(w.rng.pick(['Кто здесь?', 'Опять шаги…', 'Кто идёт за мной?']), w.now); n.agent.yaw += 180; n.psy.fear = clamp(n.psy.fear + 6 * e.intensity, 0, 100); if (w.rng.chance(0.15)) report(w, n, 'кто-то идёт за мной по пятам, но когда я оборачиваюсь — никого', 'follower', e); } break;
        case 'peripheral': if (w.rng.chance(0.2)) { n.say(w.rng.pick(['Что это было?', 'Там что-то мелькнуло.']), w.now); n.psy.fear = clamp(n.psy.fear + 4, 0, 100); if (w.rng.chance(0.1)) report(w, n, 'движение на краю зрения, будто кто-то наблюдает', 'peripheral', e); } break;
        case 'voice': if (w.rng.chance(0.15)) { const c = w.npc(e.data.caller); n.say((c ? c.first : 'Кто-то') + '? Ты меня звал' + (c && c.female ? 'а' : '') + '?', w.now); } break;
        case 'seated_figure': if (my.pois.some(p => p.type === 'Seat' && !p.reservedBy) && w.rng.chance(0.15)) { n.say('Вы тоже на смене? …Странно, тут же никого.', w.now); n.addHistory(w.now, 'Видел человека в пустом кресле: ' + e.data.desc, 'perception', e.src); if (w.rng.chance(0.3)) report(w, n, 'в пустом кресле сидел человек (' + e.data.desc + ')', 'seated_figure', e); } break;
        case 'extra_doors': if (my.type === 'Corridor' && w.rng.chance(0.12)) { n.say('Здесь же была дверь…', w.now); n.agent.clear(); n.arrived = true; n.blockedRetry = 3; if (w.rng.chance(0.25)) report(w, n, 'в коридоре исчезла дверь, которую я только что видел', 'extra_doors', e); } break;
        case 'reflection': if (my.type === 'Observation' && w.rng.chance(0.2)) { n.say('Моё отражение… оно не двигается вместе со мной.', w.now); n.psy.fear = clamp(n.psy.fear + 5, 0, 100); } break;
        case 'compulsion': if (!n.taskId && n.activity !== 'Compelled' && w.rng.chance(0.3)) n.nextThink = 0; break;
      }
    }
  }
  function report(w, n, what, kind, e) {
    if (n.role === 'DClass') { n.say('Гражданин начальник! Тут ' + what + '!', w.now); }
    else n.say('Диспетчер, это ' + n.shortName + ': ' + what + '.', w.now);
    n.sightings = (n.sightings || 0) + 1;
    if (w.life) w.life.sighting(n.id, { roomId: n.agent.roomId, text: what, kind, perceived: e ? e.src : null });
  }
  function visibleBreached(w, n) {
    const my = w.fac.room(n.agent.roomId); if (!my) return null;
    for (const a of w.anomalies) { if (a.contained || !a.arrived || !a.agent.roomId || !my.canSeeInto(a.agent.roomId)) continue; if (V.distXZ(n.agent.pos, a.agent.pos) > 22) continue; return a; }
    return null;
  }

  // ------------------------------------------------------------------ decision
  function think(w, n) { const p = decide(w, n); if (samePlan(n, p)) return; begin(w, n, p); }

  function decide(w, n) {
    const now = w.now, fac = w.fac, P = S.People;
    if (n.escortedBy) { const e = escortOf(w, n.escortedBy); if (e) { const p = plan('Escorted', e.roomId, 'Stand', 'Под конвоем: ' + e.name); p.targetId = n.escortedBy; return p; } n.escortedBy = null; n.followId = null; }
    if (n.missing) { const p = plan('Lost', n.agent.roomId, 'Stand', 'Заблудился'); return p; }
    const vis = visibleBreached(w, n);
    if (vis && vis.temper === 'aggressive') {
      const canCount = n.protocol && n.role !== 'DClass' && n.traits.bravery >= 0.3 && n.needs.health > 35 && vis.tm;
      if (canCount) { const p = plan('CountingProtocol', vis.agent.roomId, 'Stand', 'Протокол счёта'); p.targetId = vis.id; return p; }
      return plan('Flee', safestRoom(w, n, vis.agent.roomId, null), 'Stand', 'Бегство');
    }
    const breached = w.alert.level >= 3 ? w.anomaly(w.alert.breachId) : null;
    if (breached && !breached.contained && breached.temper === 'aggressive') {
      const last = w.alert.lastRoom || breached.containRoom;
      const responder = (n.dept === 'security' || n.dept === 'mtf') && n.traits.bravery >= 0.3 && n.needs.health > 35;
      const brave = n.dept === 'science' && n.protocol && n.traits.bravery >= 0.7;
      if (responder || brave) { const p = plan('Respond', last, 'Stand', 'Реагирование: ' + w.roomName(last)); p.targetId = breached.id; return p; }
      if (n.role === 'DClass') { const p = plan('Confined', n.homeRoom, 'CellBunk', 'Изоляция блока D'); p.specificPoi = n.bedPoi; return p; }
      return plan('Shelter', safestRoom(w, n, last, SAFE), 'Seat', 'Укрытие');
    }
    const card = w.card(n.cardId);
    if (card && card.holder !== n.id && n.role !== 'DClass') {
      if (!card.holder && card.room && !card.revoked) { const p = plan('RetrieveCard', card.room, 'Stand', 'Ищет ключ-карту'); p.targetId = card.id; return p; }
      if (n.cardLostAt < 0) { n.cardLostAt = now; n.say('Кто-то забрал мою карту! Докладываю на пост.', now); w.events.post({ time: now, type: EV.Report, roomId: n.agent.roomId, pos: V.copy(n.agent.pos), actor: n.id, target: card.id, severity: 1, pub: true, text: n.displayName + ' сообщает об утере ключ-карты ' + card.id }); }
    }
    if ((n.needs.health < 60 || (n.isSick(now) && !n.resident)) && n.prof !== 'doctor') {
      if (n.role === 'DClass') { const p = plan('Confined', n.homeRoom, 'CellBunk', 'Отлёживается'); p.specificPoi = n.bedPoi; return p; }
      const med = n.agent.roomId && fac.room(n.agent.roomId).sector === 'Б' ? 'med' : 'medA';
      if (n.needs.health < 60 || !n.treated) { const p = plan('SeekTreatment', med, 'MedBed', n.isSick(now) ? 'Заболел — в медблок' : 'В медблок'); p.needDriven = true; p.duration = 240; return p; }
    }
    // tasks from the board, then a compulsion from an anomaly, then radio calls
    if (!n.falseDone) for (const t of w.tasks.activeFor(n.id)) {
      if (t.blockedUntil > now) continue;
      const p = plan(t.act || 'Work', null, null, t.title); p.taskId = t.id; p.job = t; return p;
    }
    if (w.horror) { const c = w.horror.effectsOf(n.id).find(e => e.kind === 'compulsion' && w.horror.active(e, n.id)); if (c && n.role !== 'DClass') { const p = plan('Compelled', c.data.target, 'Stand', c.data.text); p.effectId = c.id; return p; } }
    if (n.radioCall && now - n.radioCall.t < 40 && n.radioOk) { const p = plan('Respond', n.radioCall.room, 'Stand', 'Вызов по рации: ' + w.roomName(n.radioCall.room)); p.radio = true; return p; }
    if (n.needDriven && now < n.actUntil && !needSatisfied(n)) return currentPlan(n);
    const b = P.block(w, n);
    if (n.role !== 'DClass' && (b.activity === 'Duty' || b.activity === 'Leisure')) {
      if (n.needs.energy < 10 && n.bedPoi) { const p = plan('Sleep', roomOfPoi(w, n.bedPoi), 'Bed', 'Сон (переутомление)'); p.needDriven = true; p.duration = 240; p.specificPoi = n.bedPoi; return p; }
      if (n.needs.hunger > 85) { const p = plan('Eat', 'canteen', 'Seat', 'Внеплановый перекус'); p.needDriven = true; p.duration = 40; return p; }
      if (n.needs.stress > 85) { const p = plan('Leisure', n.dept === 'mtf' ? 'barracks' : 'canteen', 'Seat', 'Перерыв: нервы'); p.needDriven = true; p.duration = 30; return p; }
      if (w.horror && w.horror.effectsOf(n.id).some(e => e.kind === 'follower' && w.horror.active(e, n.id)) && w.isolated(n.agent.roomId, n.id)) { const p = plan('Leisure', busiestRoom(w, n), 'Seat', 'Ищет людей: не по себе одному'); p.needDriven = true; p.duration = 20; return p; }
    }
    switch (b.activity) {
      case 'Offsite': case 'Leave': { const p = plan('Leave', n.entry, null, b.activity === 'Leave' ? 'Сдал смену, уходит' : b.label); return p; }
      case 'Arrive': { const p = plan('Arrive', n.workRoom, 'Stand', 'Прибытие на смену'); return p; }
      case 'Duty': {
        if (n.restricted && n.dept !== 'medical') { const p = plan('Leisure', 'canteen', 'Seat', 'Отстранён до осмотра психиатра'); return p; }
        if (n.routine && !n.routine.failed && n.routine.si < n.routine.steps.length) { const p = plan(n.routine.act || 'Work', null, null, n.routine.title); p.job = n.routine; return p; }
        const r = S.Jobs.routine(w, n), job = S.Jobs.build(w, r[0], n, r[1]);
        if (job) job.steps = job.steps.filter(s => !s.room || s.pickup || w.reachable(n, s.room));
        if (job && job.steps.length) { n.routine = job; const p = plan(job.act || 'Work', null, null, job.title); p.job = job; return p; }
        return plan('Idle', n.workRoom, 'Stand', 'На рабочем месте');
      }
      default: {
        const p = plan(b.activity, b.roomId, b.poi, b.label); p.specificPoi = b.specificPoi || null;
        if (b.activity === 'Eat' && n.role !== 'DClass' && (w.food || 0) <= 0 && w.rng.chance(0.5)) { p.label = 'Обед: еды нет, сухпаёк'; p.roomId = n.dept === 'mtf' ? 'mtf' : 'canteen'; }
        return p;
      }
    }
  }
  Brain.decide = decide;

  function currentPlan(n) { return { activity: n.activity, roomId: n.targetRoom, label: n.label, needDriven: n.needDriven, taskId: n.taskId, targetId: n.followId, specificPoi: n.reservedPoi, duration: 0, job: n.job }; }
  function samePlan(n, p) {
    if (n.activity !== p.activity || n.taskId !== p.taskId) return false;
    if (p.job) return n.job === p.job;
    switch (p.activity) {
      case 'CountingProtocol': case 'Flee': case 'Escorted': case 'Lost': return true;
      case 'Respond': case 'Shelter': case 'Leave': return n.targetRoom === p.roomId;
      default: return n.targetRoom === p.roomId && n.label === (p.label || n.label);
    }
  }
  const roomOfPoi = (w, id) => { const p = w.fac.poi(id); return p ? p.roomId : null; };
  function busiestRoom(w, n) { let best = 'canteen', bc = -1; for (const r of ['canteen', 'command', 'barracks', 'officesC', 'corridor', 'corrC']) { const c = w.countIn(r); if (c > bc && w.fac.roomDistance(n.agent.roomId, r) < 8) { bc = c; best = r; } } return best; }
  function safestRoom(w, n, danger, allowed) {
    const card = w.card(n.cardId); let best = n.agent.roomId, bs = -Infinity;
    for (const room of w.fac.roomList) {
      if (room.id === danger || room.type === 'Containment' || room.level !== (w.fac.room(n.agent.roomId) || {}).level) continue;
      if (allowed && allowed.indexOf(room.type) < 0) continue;
      const dd = w.fac.roomDistance(danger, room.id), ds = w.fac.roomDistance(n.agent.roomId, room.id);
      if (dd === Infinity || ds === Infinity) continue;
      let score = Math.min(dd, 6) - ds * 0.35 + (room.type === 'Shelter' ? 1.5 : 0); if (room.id === n.agent.roomId) score += 0.2;
      if (score <= bs) continue;
      if (room.id !== n.agent.roomId && !w.planPath(n.agent.pos, n.agent.roomId, room.hubNodes[0], (d, f) => w.canPlanThrough(d, f, card))) continue;
      bs = score; best = room.id;
    }
    return best;
  }

  // ------------------------------------------------------------------ starting activities
  function begin(w, n, p) {
    const now = w.now;
    releasePoi(w, n); leaveQueue(w, n); if (n.conv) endConv(w, n);
    if (n.job && n.job !== p.job && n.waitingEscort) n.waitingEscort = false;
    if (p.activity === 'Eat' && n.activity !== 'Eat') n.hadTray = false;
    n.activity = p.activity; n.label = p.label || ACT_NAMES[p.activity] || p.activity; n.targetRoom = p.roomId; n.taskId = p.taskId; n.job = p.job || null; n.effectId = p.effectId || null;
    n.needDriven = p.needDriven; n.actStart = now; n.actUntil = p.duration > 0 ? now + p.duration : 0; n.radioResp = !!p.radio;
    n.arrived = false; n.posture = 'Standing'; n.dwell = 0; n.blockedCount = 0; n.blockedRetry = 0; n.followId = p.targetId;
    switch (p.activity) {
      case 'Flee': n.say(n.role === 'DClass' ? 'Откройте! Оно идёт!' : 'Оно здесь! Уходим!', now); break;
      case 'CountingProtocol': n.say('Протокол счёта! Один… два… три…', now); break;
      case 'Shelter': if (w.alert.level >= 3) n.say('В укрытие, быстро!', now); break;
      case 'Respond': n.say(p.radio ? 'Принял вызов, выдвигаюсь.' : 'Иду на сигнал: ' + w.roomName(p.roomId) + '.', now); break;
      case 'Leave': if (w.rng.chance(0.3)) n.say(w.rng.pick(['Всё, смену сдал.', 'До завтра.', 'Наконец-то домой.']), now); break;
    }
    if (n.job) { if (n.job.kind === 'repair_door' || n.job.kind === 'repair') n.say('Принял заявку: ' + n.job.title.toLowerCase() + '.', now); jobDestination(w, n); }
    else setDestination(w, n, p.poi, p.specificPoi);
  }

  function goTo(w, n, goal, yaw) {
    if (goal < 0) { n.agent.clear(); n.arrived = true; return false; }
    const card = w.card(n.cardId);
    const path = w.planPath(n.agent.pos, n.agent.roomId, goal, (d, f) => card && card.holder === n.id ? w.canPlanThrough(d, f, card) : d.passable, card ? card.id : 'none');
    if (!path) {
      n.agent.clear(); n.arrived = true; n.blockedRetry = 8; if (n.blockedCount++ < 1) n.say('Не могу пройти в «' + w.roomName(n.targetRoom) + '».', w.now);
      if (n.role === 'DClass' && !n.escortedBy && w.life) w.life.strandedD(n);
      else if (n.job && n.blockedCount > 2) failJob(w, n, 'нет прохода в «' + w.roomName(n.targetRoom) + '»');
      return false;
    }
    n.agent.setPath(path); n.agent.arriveYaw = yaw; n.arrived = false; return true;
  }
  function setDestination(w, n, poiType, specific) {
    let goal = -1, yaw = null; const room = w.fac.room(n.targetRoom);
    switch (n.activity) {
      case 'CountingProtocol': { const a = w.anomaly(n.followId); if (!a) break; const mine = w.fac.room(n.agent.roomId); const tr = mine && mine.canSeeInto(a.agent.roomId) ? mine.id : a.agent.roomId; goal = nearestNodeTowards(w, tr, a.agent.pos, n.agent.pos, 6); break; }
      case 'RetrieveCard': { const c = w.card(n.followId); if (!c || c.holder) break; goal = w.fac.nearestNode(c.pos, c.room); break; }
      case 'Escorted': { const e = escortOf(w, n.followId); if (!e) break; goal = w.fac.nearestNode(e.pos, e.roomId); break; }
      case 'Leave': case 'Arrive': case 'Lost': case 'Respond': case 'Compelled': { if (room) goal = room.hubNodes[w.rng.int(0, room.hubNodes.length)]; if (n.activity === 'Arrive' && room) { const poi = reservePoi(w, n, room, workPoiType(n), null); if (poi) { goal = poi.node; yaw = poi.yaw; } } break; }
      case 'Eat': {
        if (!room) break; const counter = room.pois.find(p => p.type === 'FoodCounter');
        if (counter && !n.hadTray) { joinQueue(w, n, counter); const spot = queueSpot(w, counter, n); goal = w.fac.nearestNode(spot, room.id); n.queueTarget = spot; break; }
      }
      // falls through
      default: {
        if (!room) break; const poi = reservePoi(w, n, room, poiType, specific);
        if (poi) { goal = poi.node; yaw = poi.yaw; } else if (room.hubNodes.length) goal = room.hubNodes[w.rng.int(0, room.hubNodes.length)];
      }
    }
    goTo(w, n, goal, yaw);
  }
  const workPoiType = n => ({ science: 'Desk', security: 'GuardPost', admin: 'Console', engineering: 'Workbench', medical: 'Desk', mtf: 'Seat', service: 'Workbench' })[n.dept] || 'Stand';
  function jobDestination(w, n) {
    const t = n.job, s = t.steps[t.si]; if (!s) { n.arrived = true; return; }
    n.targetRoom = s.room; n.label = t.title + ': ' + s.label; let goal = -1, yaw = null; const room = w.fac.room(s.room); if (!room) { failJob(w, n, 'нет помещения'); return; }
    if (s.pickup || s.release) { const o = w.npc(s.pickup || s.release); if (s.pickup && o) { goal = w.fac.nearestNode(o.agent.pos, o.agent.roomId); n.targetRoom = o.agent.roomId; } else goal = room.hubNodes[0]; }
    else if (s.pos) goal = w.fac.nearestNode(s.pos, s.room);
    else if (s.poi) { const p = w.fac.poi(s.poi); if (p && (!p.reservedBy || p.reservedBy === n.id)) { p.reservedBy = n.id; n.reservedPoi = p.id; goal = p.node; yaw = p.yaw; } else goal = room.hubNodes[0]; }
    else if (s.poiType) { const p = reservePoi(w, n, room, s.poiType, null); if (p) { goal = p.node; yaw = p.yaw; } else goal = room.hubNodes[w.rng.int(0, room.hubNodes.length)]; }
    else goal = room.hubNodes[w.rng.int(0, room.hubNodes.length)];
    // a technician with an old fear does not enter containment areas without a guard nearby
    if (n.fears && n.fears.any > 0.6 && (room.type === 'Containment' || room.type === 'Observation') && !guardIn(w, s.room)) {
      if (!n.waitingEscort) { n.waitingEscort = true; n.say('Без охраны туда не пойду. Пусть пришлют кого-нибудь.', w.now); w.life && w.life.requestEscort(n, s.room); }
      n.agent.clear(); n.arrived = true; n.blockedRetry = 10; n.label = 'Ждёт охрану: ' + w.roomName(s.room); return;
    }
    n.waitingEscort = false;
    goTo(w, n, goal, yaw);
  }
  function guardIn(w, roomId) { for (const o of w.active) if ((o.dept === 'security' || o.dept === 'mtf') && !o.incap(w.now) && (o.agent.roomId === roomId || o.targetRoom === roomId)) return true; return false; }
  function nearestNodeTowards(w, roomId, target, from, keep) {
    const room = w.fac.room(roomId); if (!room) return -1; let best = -1, bs = Infinity;
    for (const i of room.nodes) { const n = w.fac.graph.nodes[i]; const s = Math.abs(V.distXZ(n.pos, target) - keep) + V.distXZ(n.pos, from) * 0.15; if (s < bs) { bs = s; best = i; } }
    return best;
  }
  function reservePoi(w, n, room, type, specific) {
    let chosen = null;
    if (specific) { chosen = w.fac.poi(specific); if (chosen && chosen.reservedBy && chosen.reservedBy !== n.id) chosen = null; }
    if (!chosen && type) {
      const cands = [];
      for (const p of room.pois) {
        if (p.type !== type || (p.reservedBy && p.reservedBy !== n.id)) continue;
        if (p.owners && p.owners.indexOf(n.id) < 0) continue;
        if (p.owners) { chosen = p; break; } cands.push(p);
      }
      if (!chosen && cands.length) { cands.sort((a, b) => V.distXZ(a.pos, n.agent.pos) - V.distXZ(b.pos, n.agent.pos)); chosen = cands[Math.min(cands.length - 1, w.rng.int(0, 3))]; }
    }
    if (chosen) { chosen.reservedBy = n.id; n.reservedPoi = chosen.id; }
    return chosen;
  }
  function releasePoi(w, n) { if (!n.reservedPoi) return; const p = w.fac.poi(n.reservedPoi); if (p && p.reservedBy === n.id) p.reservedBy = null; n.reservedPoi = null; }

  // ------------------------------------------------------------------ queues (food counters)
  function joinQueue(w, n, poi) { const q = w.queues[poi.id] || (w.queues[poi.id] = []); if (q.indexOf(n.id) < 0) q.push(n.id); n.queue = poi.id; }
  function leaveQueue(w, n) { if (!n.queue) return; const q = w.queues[n.queue]; if (q) { const i = q.indexOf(n.id); if (i >= 0) q.splice(i, 1); } n.queue = null; n.queueT = 0; }
  function queueSpot(w, poi, n) {
    const q = w.queues[poi.id] || [], k = Math.max(0, q.indexOf(n.id)), back = V.dirFromYaw(poi.yaw + 180), side = { x: -back.z, z: back.x };
    const room = w.fac.room(poi.roomId), row = Math.floor(k / 7), col = k % 7, dist = 0.9 + col * 0.75;
    const p = V.v(poi.pos.x + back.x * dist + side.x * row * 0.8, poi.pos.y, poi.pos.z + back.z * dist + side.z * row * 0.8);
    p.x = clamp(p.x, room.minX + 0.5, room.maxX - 0.5); p.z = clamp(p.z, room.minZ + 0.5, room.maxZ - 0.5); return p;
  }
  function tickQueue(w, n, dt) {
    const poi = w.fac.poi(n.queue); if (!poi) { leaveQueue(w, n); return; }
    const q = w.queues[poi.id] || [], k = q.indexOf(n.id), spot = queueSpot(w, poi, n);
    if (V.distXZ(spot, n.agent.pos) > 0.15) { const dx = spot.x - n.agent.pos.x, dz = spot.z - n.agent.pos.z, d = Math.sqrt(dx * dx + dz * dz), stp = Math.min(d, 1.1 * dt); n.agent.pos.x += dx / d * stp; n.agent.pos.z += dz / d * stp; n.agent.moving = true; } else n.agent.moving = false;
    w.faceTowards(n.agent, poi.pos, dt); n.posture = 'Standing';
    if (k === 0) {
      const served = w.active.some(o => o.prof === 'cook' && o.agent.roomId === poi.roomId && o.arrived) || n.role === 'DClass' || poi.roomId !== 'canteen';
      n.queueT = (n.queueT || 0) + dt * (served ? 1 : 0.4);
      if (n.queueT > 4) { leaveQueue(w, n); n.hadTray = true; if (poi.roomId === 'canteen') w.food = Math.max(0, (w.food || 0) - 1); setDestination(w, n, 'Seat', null); }
    }
  }

  // ------------------------------------------------------------------ acting
  function act(w, n, dt, gm, remote) {
    const now = w.now;
    if (n.queue && !n.agent.hasPath) { tickQueue(w, n, dt); return; }
    if (n.agent.hasPath) {
      const st = w.moveAgent(n.agent, dt, handler(w, n), { yieldPlayer: true, id: n.id, remote });
      n.posture = 'Standing';
      if (st === 'Arrived') onArrived(w, n);
      else if (st === 'Blocked') onBlocked(w, n);
      else if (st === 'Waiting' && n.agent.blocked > 1.2 && n.agent.blocked < 1.2 + dt + 0.01) n.say(n.role === 'DClass' ? 'Можно пройти, начальник?' : 'Разрешите пройти.', now);
      if (n.activity === 'CountingProtocol') updateCounting(w, n, dt);
      if (n.activity === 'Escorted') followEscort(w, n, dt);
      return;
    }
    if (n.blockedRetry > 0) { n.blockedRetry -= dt; if (n.blockedRetry <= 0) { if (n.job) jobDestination(w, n); else { const rp = w.fac.poi(n.reservedPoi); setDestination(w, n, rp ? rp.type : 'Stand', n.reservedPoi); } } return; }
    if (!n.arrived) onArrived(w, n);
    if (n.job) { tickJob(w, n, dt, gm); return; }
    switch (n.activity) {
      case 'CountingProtocol': updateCounting(w, n, dt); break;
      case 'Escorted': followEscort(w, n, dt); break;
      case 'Respond': {
        const last = w.alert.level >= 3 ? w.alert.lastRoom : null;
        if (last && last !== n.targetRoom && !n.radioResp) { n.targetRoom = last; n.label = 'Реагирование: ' + w.roomName(last); n.arrived = false; setDestination(w, n, 'Stand', null); }
        else if (n.radioResp) { n.dwell += gm; if (n.dwell > 3) { n.radioResp = false; const c = n.radioCall; n.radioCall = null; if (c) { n.say('Диспетчер, на месте никого. Кто вызывал?', now); w.life && w.life.radioCallChecked(n, c); } n.nextThink = 0; } }
        break;
      }
      case 'Compelled': { n.dwell += gm; if (n.dwell > 4) { const e = w.horror.effectsOf(n.id).find(x => x.id === n.effectId); if (e) w.horror.end(n.id, e, 'поручение выполнено'); n.say('Зачем я сюда пришёл?..', now); n.addHistory(now, 'Ночью без причины пошёл в «' + w.roomName(n.targetRoom) + '»', 'perception', 'SCP-LF-126'); n.nextThink = 0; } break; }
      case 'Lost': lostWander(w, n, dt, gm); break;
      case 'Leave': if (n.agent.roomId === n.entry || w.fac.roomDistance(n.agent.roomId, n.entry) === 0) S.People.despawn(w, n); break;
      case 'Arrive': n.nextThink = Math.min(n.nextThink, 0.5); break;
      case 'Flee': n.activity = 'Shelter'; n.label = 'Укрытие'; n.posture = 'Cowering'; break;
      case 'RetrieveCard': { const c = w.card(n.followId); if (c && !c.holder && V.distXZ(c.pos, n.agent.pos) < 2.5) { c.holder = n.id; c.room = null; n.say('Вот она, моя карта.', now); } n.nextThink = 0; break; }
      case 'SeekTreatment': if (!medicWorking(w, n.agent.roomId)) n.needs.health += gm / 60 * 3; if (n.isSick(now) && n.treated && !n.resident) n.nextThink = 0; break;
      case 'Eat': if (!n.hadTray && n.agent.roomId !== n.targetRoom) n.nextThink = 0; break;
    }
    if (n.needDriven && needSatisfied(n)) { n.needDriven = false; n.nextThink = 0; }
  }
  function onArrived(w, n) {
    n.arrived = true; const poi = w.fac.poi(n.reservedPoi);
    n.posture = postureFor(n.activity, poi ? poi.type : 'Stand', w.alert.level);
    if (n.job) {
      const s = n.job.steps[n.job.si]; if (!s) return; s.arrived = w.now; n.dwell = 0;
      const spec = S.Jobs.J[n.job.kind]; if (spec && spec.arrive) spec.arrive(w, n, n.job, s);
      if (s.poiType === 'Panel' || s.inspect) n.posture = 'Working';
      if (n.job.act === 'Patrol' && w.rng.chance(0.3)) n.say('Точка «' + (poi ? poi.label : w.roomName(s.room)) + '»: без происшествий.', w.now);
    }
  }
  function tickJob(w, n, dt, gm) {
    const t = n.job, s = t.steps[t.si]; if (!s) { endJob(w, n); return; }
    if (t.status && t.status !== 'Active') { n.job = null; n.taskId = null; n.nextThink = 0; return; }
    const spec = S.Jobs.J[t.kind];
    if (s.pickup) {
      const d = w.npc(s.pickup); if (!d || !d.onSite) { failJob(w, n, 'испытуемого нет на месте'); return; }
      if (V.distXZ(d.agent.pos, n.agent.pos) > 2.5) { n.arrived = false; goTo(w, n, w.fac.nearestNode(d.agent.pos, d.agent.roomId), null); return; }
      if (refuses(w, d)) { d.say(w.rng.pick(['Я туда не пойду!', 'Нет! В прошлый раз оттуда не вернулся Сухов!', 'Не трогайте меня!']), w.now); n.say('Испытуемый отказывается. Докладываю.', w.now); w.life && w.life.onRefusal(d, t, n); failJob(w, n, 'отказ испытуемого'); return; }
      d.escortedBy = n.id; d.followId = n.id; d.nextThink = 0; d.say(w.rng.pick(['Иду, иду.', 'Куда на этот раз?', 'Ладно…']), w.now);
      S.Jobs.stepDone(w, n, t, s); jobDestination(w, n); return;
    }
    if (s.release) { const d = w.npc(s.release); if (d) { d.escortedBy = null; d.followId = null; d.nextThink = 0; } }
    if (spec && spec.tickStep) spec.tickStep(w, n, t, s, gm);
    if (s.count) n.activity = 'ObservationSession';
    n.dwell += gm * (0.6 + 0.4 * n.psy.focus);
    if (t.act === 'GuardPost' || s.poiType === 'GuardPost' || s.poiType === 'Console') monitorCameras(w, n, gm);
    if (n.activity === 'Treat' || t.kind === 'treat') treat(w, n, gm);
    if (s.deliver && s.arrived) { const d = w.npc(s.deliver); if (d && d.escortedBy === n.id && t.kind === 'escort_d' && n.dwell > s.dur * 0.3 && !s.tested) { s.tested = true; w.life && w.life.dTestHappened(d, t, n); } }
    if (n.dwell < s.dur) return;
    if (S.Jobs.stepDone(w, n, t, s)) endJob(w, n);
    else { n.arrived = false; jobDestination(w, n); }
  }
  function endJob(w, n) {
    const t = n.job; n.job = null; releasePoi(w, n);
    const note = S.Jobs.finish(w, n, t);
    n.tasksDone = (n.tasksDone || 0) + 1;
    if (t.id && w.tasks.get(t.id)) w.tasks.complete(w, t, note); else n.routine = null;
    n.taskId = null; n.nextThink = 0;
  }
  function failJob(w, n, reason) {
    const t = n.job; n.job = null; releasePoi(w, n); n.taskId = null; n.nextThink = 0;
    if (!t) return; const spec = S.Jobs.J[t.kind]; if (spec && spec.fail) spec.fail(w, n, t);
    if (t.id && w.tasks.get(t.id)) w.tasks.fail(w, t, reason); else { n.routine = null; }
  }
  function refuses(w, d) {
    const p = clamp((d.psy.fear - 45) / 50 + (d.needs.stress - 65) / 70 - (d.compliance || 0.6) * 0.6 + (d.testsDone || 0) * 0.05, 0, 0.9);
    return w.rng.chance(p);
  }
  function escortOf(w, id) {
    if (id === 'player') { const p = w.player; return p.dead ? null : { pos: p.pos, roomId: p.roomId, name: p.name, transit: false }; }
    const e = w.npc(id); return e && e.onSite && !e.incap(w.now) ? { pos: e.agent.pos, roomId: e.agent.roomId, name: e.shortName, transit: e.agent.transitT > 0 } : null;
  }
  function followEscort(w, n, dt) {
    const e = escortOf(w, n.followId); if (!e) { n.escortedBy = null; n.followId = null; n.nextThink = 0; return; }
    if (e.transit || e.roomId !== n.agent.roomId || V.distXZ(e.pos, n.agent.pos) > 2.2) {
      n.dwell -= dt; if (n.dwell <= 0 || !n.agent.hasPath) { n.dwell = 1.2; goTo(w, n, w.fac.nearestNode(e.pos, e.roomId), null); }
    } else { if (n.agent.hasPath && V.distXZ(e.pos, n.agent.pos) < 1.4) n.agent.clear(); w.faceTowards(n.agent, e.pos, dt); n.posture = 'Standing'; }
  }
  function lostWander(w, n, dt, gm) {
    n.dwell += gm; if (n.dwell > 2 && !n.agent.hasPath) { n.dwell = 0; const r = w.fac.room(n.agent.roomId); if (r) goTo(w, n, r.hubNodes[w.rng.int(0, r.hubNodes.length)], null); if (w.rng.chance(0.2)) n.say(w.rng.pick(['Эй! Есть кто-нибудь?', 'Где номер этажа?..', 'Лифт… где лифт?']), w.now); }
    n.psy.fear = clamp(n.psy.fear + gm * 0.5, 0, 100);
    if (w.now - n.missingAt > (n.missingFor || 40)) w.returnFromNullFloor(n);
  }
  function postureFor(a, poi, alert) {
    switch (a) {
      case 'Sleep': case 'Sick': return poi === 'Bed' || poi === 'CellBunk' ? 'Lying' : 'Sitting';
      case 'Confined': return alert >= 3 ? 'Cowering' : (poi === 'CellBunk' ? 'Sitting' : 'Standing');
      case 'Eat': case 'Leisure': case 'Meeting': return poi === 'Seat' || poi === 'Bed' ? 'Sitting' : 'Standing';
      case 'GuardPost': return poi === 'GuardPost' || poi === 'Console' || poi === 'Seat' ? 'Sitting' : 'Standing';
      case 'Work': return poi === 'Desk' || poi === 'Console' ? 'Sitting' : 'Working';
      case 'ObservationSession': return 'Counting';
      case 'Maintenance': case 'RepairDoor': case 'Labor': case 'Hygiene': case 'Treat': return poi === 'Desk' ? 'Sitting' : 'Working';
      case 'SeekTreatment': return poi === 'MedBed' ? 'Lying' : 'Sitting';
      case 'Shelter': return alert >= 3 ? 'Cowering' : 'Standing';
      case 'CountingProtocol': return 'Counting';
      default: return 'Standing';
    }
  }
  function onBlocked(w, n) {
    n.blockedCount++; const d = w.fac.door(n.agent.waitingDoor); const name = d ? d.name : 'дверь'; n.agent.clear();
    if (n.blockedCount >= 3) {
      n.say(name + ' не открывается. Подожду.', w.now); n.arrived = true; n.blockedRetry = 25; n.blockedCount = 0; n.nextThink = 20;
      if (n.job && n.job.id) { n.job.blockedUntil = w.now + 30; n.job = null; n.taskId = null; } else if (n.job) { n.routine = null; n.job = null; }
      return;
    }
    n.say('Странно, не пускает…', w.now); n.blockedRetry = 4 + n.blockedCount * 2; n.arrived = true;
  }
  function handler(w, n) { if (!n._dh) n._dh = (door, from) => handleDoor(w, n, door, from); return n._dh; }
  function handleDoor(w, n, door, from) {
    if (door.state === S.DS.Opening) return 'Wait';
    if (n.agent.doorCd > 0) return 'Wait';
    n.agent.doorCd = 1.3;
    if (n.escortedBy) return 'Wait';
    const card = w.card(n.cardId);
    if (!card || card.holder !== n.id) { if (n.agent.wait < 1.5) n.say('Где моя карта?..', w.now); return n.agent.wait > 10 ? 'Blocked' : 'Wait'; }
    const r = w.presentCard(door.id, card.id, n.id, from);
    switch (r) {
      case S.R.Granted: case S.R.Override: return 'Wait';
      case S.R.Await: if (n.agent.wait > 60) { n.say('Второй карты так и нет. Отбой.', w.now); return 'Blocked'; } if (n.agent.wait < 1.5) n.say('Жду вторую карту.', w.now); return 'Wait';
      case S.R.DSame: return 'Wait';
      case S.R.Fault: if (n.agent.wait < 1.5) n.say('Считыватель глючит…', w.now); return n.agent.wait > 25 ? 'Blocked' : 'Wait';
      default: return 'Blocked';
    }
  }
  function updateCounting(w, n, dt) {
    const a = w.anomaly(n.followId);
    if (!a || a.contained) { n.nextThink = 0; return; }
    if (w.canCount(n.agent.pos, n.agent.roomId, a)) {
      if (n.agent.hasPath) n.agent.clear();
      n.posture = 'Counting'; n.arrived = true; w.faceTowards(n.agent, a.agent.pos, dt);
      if (w.now >= n.barkUntil - 0.3) n.say(countLine(w), w.now, 0.9);
      if (V.distXZ(n.agent.pos, a.agent.pos) < 2) { const retreat = nearestNodeTowards(w, n.agent.roomId, a.agent.pos, n.agent.pos, 7); goTo(w, n, retreat, null); }
      return;
    }
    n.dwell -= dt;
    if (n.dwell <= 0 || !n.agent.hasPath) { n.dwell = 2; setDestination(w, n, 'Stand', null); }
  }
  function countLine(w) { return S.numWords(Math.floor(w.realTime / 1.5) % 100 + 1) + '…'; }
  function medicWorking(w, roomId) { return w.active.some(o => (o.prof === 'doctor' || o.prof === 'field_medic') && o.agent.roomId === roomId && o.arrived && !o.incap(w.now)); }
  function treat(w, medic, gm) {
    const heal = gm / 60 * 35;
    for (const p of w.active) {
      if (p === medic || p.activity !== 'SeekTreatment' || !p.arrived || p.agent.roomId !== medic.agent.roomId) continue;
      const below = p.needs.health < 90 || (p.isSick(w.now) && !p.treated);
      p.needs.health = Math.min(100, p.needs.health + heal); p.needs.stress = Math.max(0, p.needs.stress - heal * 0.5);
      if (below && p.needs.health >= 90) {
        p.treated = true; if (p.isSick(w.now) && !p.resident) p.addHistory(w.now, 'Врач отправил домой на больничный', 'sick');
        w.events.post({ time: w.now, type: EV.Treatment, roomId: medic.agent.roomId, actor: medic.id, target: p.id, text: medic.displayName + ' оказал' + medic.G('', 'а') + ' помощь: ' + p.displayName + (p.isSick(w.now) ? ' отправлен на больничный' : ' снова в строю') });
        medic.say(p.shortName + (p.isSick(w.now) ? ', идите домой и лечитесь.' : ', можете возвращаться к работе.'), w.now); p.nextThink = 0;
      }
    }
  }
  function monitorCameras(w, n, gm) {
    if (!n.arrived || gm <= 0 || n.role === 'DClass') return;
    const per = (0.04 + n.traits.diligence * 0.1) * n.psy.focus;
    for (const a of w.anomalies) {
      if (!a.arrived || !a.contained) continue;
      const restless = a.tm ? (a.tm.state === 'Signaling' || a.tm.state === 'Probing') : a.threat >= 45;
      if (!restless || !w.roomCovered(a.agent.roomId)) continue;
      if (!w.rng.chance(Math.max(0.005, per) * gm)) continue;
      w.reportAnomaly(n.id, n.displayName, { actor: a.id, roomId: a.agent.roomId });
    }
    if (w.life && w.rng.chance(0.02 * gm * n.psy.focus)) w.life.camReview(n);
  }

  // ------------------------------------------------------------------ conversations
  function social(n) { switch (n.activity) { case 'Eat': case 'Leisure': case 'Meeting': return true; case 'Labor': case 'Confined': return n.role === 'DClass' && n.posture !== 'Cowering'; case 'GuardPost': return n.dwell > 5; default: return false; } }
  function updateConversation(w, n) {
    const now = w.now;
    if (n.conv) { const p = w.npc(n.conv); if (!p || now >= n.convUntil || p.agent.roomId !== n.agent.roomId || p.incap(now) || n.agent.hasPath) endConv(w, n); return; }
    if (!n.arrived || n.agent.hasPath || !social(n) || now < n.nextConv) return;
    if (n.needs.social > 85 && !w.rng.chance(0.25)) { n.nextConv = now + 20; return; }
    let best = null, bs = -Infinity;
    for (const o of w.roomPeople(n.agent.roomId)) {
      if (o === n || o.conv || !o.arrived || o.agent.hasPath || !social(o) || o.incap(now) || V.distXZ(o.agent.pos, n.agent.pos) > 6) continue;
      const s = n.relTo(o.id) * 0.02 + w.rng.next() + o.traits.sociability * 0.5 + (o.dept === n.dept ? 0.3 : 0); if (s > bs) { bs = s; best = o; }
    }
    if (!best || !w.rng.chance(0.35 + n.traits.sociability * 0.5)) { n.nextConv = now + w.rng.range(8, 20); return; }
    startConv(w, n, best);
  }
  function startConv(w, a, b) {
    const now = w.now, dur = w.rng.range(6, 12);
    a.conv = b.id; b.conv = a.id; a.convUntil = b.convUntil = now + dur;
    a.nextConv = now + dur + w.rng.range(35, 80); b.nextConv = now + dur + w.rng.range(35, 80);
    const r = Dialogue.converse(w, a, b);
    a.say(r.opening, now, 2); b.pendingBark = r.reply; b.pendingBarkAt = now + 1.2;
    if (r.follow) { a.pendingBark = r.follow; a.pendingBarkAt = now + 3; }
    w.events.post({ time: now, type: EV.Conversation, roomId: a.agent.roomId, actor: a.id, target: b.id, text: a.shortName + ' — ' + b.shortName + ': «' + r.opening + '»', quiet: true });
    if (r.conflict) w.events.post({ time: now, type: EV.Conflict, roomId: a.agent.roomId, pos: V.copy(a.agent.pos), actor: a.id, target: b.id, severity: a.role === 'DClass' || b.role === 'DClass' ? 2 : 1, text: 'Ссора: ' + a.displayName + ' и ' + b.displayName + (r.topic ? ' (' + r.topic + ')' : '') });
  }
  function endConv(w, n) { const p = w.npc(n.conv); n.conv = null; if (p && p.conv === n.id) p.conv = null; }

  // ------------------------------------------------------------------ dialogue (based on what the speaker actually knows)
  function sev(m) { switch (m.type) { case EV.ContainmentBreach: case EV.Injury: return 3; case EV.ContainmentWarning: case EV.Conflict: case EV.AlertChanged: case EV.SuspiciousActivity: case EV.Sighting: return 2; default: return 1; } }
  const pick = (w, arr) => arr[w.rng.int(0, arr.length)];
  const shorten = s => !s ? 'что-то странное' : (s.length > 120 ? s.slice(0, 117) + '…' : s);
  function gossipLine(w, sp, m) {
    const when = fmtTime(m.time), text = shorten(m.text);
    if (m.perceived) return sp.G('Я видел', 'Я видела') + ' это сам' + sp.G('', 'а') + ', клянусь: ' + text;
    switch (m.src) {
      case 'Witnessed': return sp.G('Я сам видел', 'Я сама видела') + ' в ' + when + ': ' + text;
      case 'HeardFrom': { const t = w.npc(m.toldBy); return t ? t.shortName + ' говорит: ' + text : 'Говорят: ' + text; }
      case 'Announcement': return 'Слышал' + sp.G('', 'а') + ' оповещение в ' + when + '? ' + text;
      default: return 'По камерам видно: ' + text;
    }
  }
  function share(w, sp, li, m) {
    m.shared = true;
    li.memory.remember({ eventId: m.eventId, time: m.time, type: m.type, roomId: m.roomId, subject: m.subject, text: m.text, imp: m.imp * 0.85, conf: m.conf * (m.perceived ? 0.5 : 0.8), src: 'HeardFrom', toldBy: sp.id, fake: m.fake, perceived: m.perceived ? null : undefined }, w.now);
    if ((m.type === EV.AnomalyBehaviour || m.type === EV.ContainmentWarning) && m.time > li.knownThreatTime) { li.knownThreat = m.type === EV.ContainmentWarning ? 75 : 55; li.knownThreatTime = m.time; }
    if (m.type === EV.Sighting && li.traits.bravery < 0.5) li.psy.fear = clamp(li.psy.fear + 5, 0, 100);
  }
  function workTalk(w, a) {
    const L = [];
    if (a.obsNotes && a.obsNotes.length) { const o = a.obsNotes[a.obsNotes.length - 1]; L.push('Наблюдал' + a.G('', 'а') + ' ' + o.scp + ': ' + shorten(o.text)); }
    if (w.life) { const short = w.life.shortage(a.dept); if (short > 0) L.push('В отделе не хватает ' + short + ' человек — все на больничных. Работаем за двоих.'); }
    const pr = { science: ['Заявку на эксперимент опять завернули на этике.', 'Пишу отчёт, без него не дадут допуск к новым опытам.'], security: ['Маршруты опять поменяли.', 'Ночью в тоннеле никого, только трубы гудят.'], engineering: ['Заявок сегодня — как никогда.', 'Генератор гудит громче обычного.'], medical: ['Жалоб на бессонницу всё больше.', 'Запасы перевязки пора пополнять.'], service: ['Еды опять впритык.', 'Полы в секторе С не успеваю мыть.'], mtf: ['Учения в четыре утра — кто это придумал?', 'Сидим в готовности, лишь бы не понадобилось.'], admin: ['Совещание опять затянулось.', 'Бюджет урезали, а планы прежние.'], dclass: ['Слышал, через месяц обещают перевод. Врут, конечно.', 'Опять эта баланда.', 'Ночью опять что-то скреблось за стеной.', 'Из испытательной вчера кого-то вынесли на носилках.'] }[a.dept] || ['Как смена?'];
    L.push(pick(w, pr));
    return pick(w, L);
  }
  function smallTalk(w, a) {
    if (a.needs.energy < 25) return 'Я с ног валюсь. Скорее бы отбой.';
    if (a.needs.hunger > 70) return 'Когда уже раздача? Есть хочется.';
    if (a.needs.stress > 60) return 'Нервы ни к чёрту в последнее время.';
    if (w.horror && w.horror.effectsOf(a.id).length && w.rng.chance(0.5)) { const e = w.horror.effectsOf(a.id)[0]; return { follower: 'Тебе не кажется, что за нами кто-то ходит?', peripheral: 'У меня весь день что-то мелькает краем глаза.', voice: 'Меня сегодня кто-то звал по имени. Голос знакомый.', seated_figure: 'Ты видел, кто сидел в том кресле?', extra_doors: 'В коридоре С сколько дверей? Я сбил' + a.G('ся', 'ась') + '.', reflection: 'Не смотри в стекло наблюдательной. Просто не смотри.', false_completion: 'Странно, я уверен' + a.G('', 'а') + ', что всё это уже делал' + a.G('', 'а') + ' сегодня.' }[e.kind] || 'Мне не по себе.'; }
    return workTalk(w, a);
  }
  function ethicsArgument(w, a, b) {
    const req = w.life && w.life.pendingEthics(); if (!req) return null;
    const pa = a.beliefs.science - a.beliefs.ethics, pb = b.beliefs.science - b.beliefs.ethics;
    if (Math.sign(pa) === Math.sign(pb) || Math.abs(pa - pb) < 0.4) return null;
    const pro = pa > pb ? a : b, con = pro === a ? b : a;
    return { opening: pro === a ? 'Заявку «' + req.title + '» надо одобрять: без опытов мы ничего не узнаем.' : 'Эксперимент «' + req.title + '» — это перебор. Люди не расходный материал.', reply: pro === a ? 'Легко говорить, когда в камеру идёшь не ты.' : 'А когда объект вырвется, этика нас спасёт?', topic: 'спор о заявке «' + req.title + '»' };
  }
  const Dialogue = {
    converse(w, a, b) {
      const now = w.now, r = { opening: '', reply: '', follow: null, conflict: false, topic: null };
      const stress = (a.needs.stress + b.needs.stress) / 2, temper = (a.traits.temper + b.traits.temper) / 2, rel = (a.relTo(b.id) + b.relTo(a.id)) / 2;
      let cc = 0; if (rel < 5 && stress > 45) cc = 0.15 + temper * 0.5 + (stress - 45) / 150; if (rel < -20) cc = Math.max(cc, 0.1 + temper * 0.3); if (rel < -30) cc += 0.2;
      if (a.role !== 'DClass' && b.role !== 'DClass' && w.rng.chance(0.25)) { const e = ethicsArgument(w, a, b); if (e) { Object.assign(r, e); if (w.rng.chance(0.3 + temper * 0.4)) { r.conflict = true; a.adjustRel(b.id, -6); b.adjustRel(a.id, -6); } else { a.adjustRel(b.id, -1); b.adjustRel(a.id, -1); } return r; } }
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
      else if (ga) { const s = sev(ga); r.reply = ga.perceived ? pick(w, ['Ты просто устал' + a.G('', 'а') + '. Сходи к психиатру.', 'Я тоже что-то такое слышал' + b.G('', 'а') + '… но не говорил' + b.G('', 'а') + '.', 'Камеры смотрели? Там же пусто.']) : s === 3 ? pick(w, ['Чёрт… Кто пострадал?', 'Мне это совсем не нравится.']) : s === 2 ? pick(w, ['Серьёзно? Надо быть осторожнее.', 'Опять? Уже не первый раз.']) : ga.fake ? 'Ветров? Какой Ветров? Не помню такого.' : pick(w, ['Ну и дела.', 'Хм, буду иметь в виду.', 'Интересно.']); }
      else r.reply = b.needs.stress > 60 ? 'Да уж… Держимся.' : pick(w, ['Угу.', 'И не говори.', 'Бывает.', 'Точно.']);
      if (ga && sev(ga) >= 2 && w.rng.chance(0.5)) r.follow = a.role === 'DClass' ? 'Нас тут всех когда-нибудь пустят в расход.' : 'Надеюсь, СБ разберётся.';
      const gain = 2 + a.traits.sociability * 2 + b.traits.sociability * 2; a.adjustRel(b.id, gain); b.adjustRel(a.id, gain);
      return r;
    },
    // Player conversation: topic = general | work | rumor | see | self
    talk(w, n, topic) {
      const now = w.now, lines = [], rel = n.relTo('player'), pp = w.player;
      if (n.incap(now)) return [n.displayName + ' без сознания. Дыхание есть.'];
      if (topic === 'see') return Dialogue.askSee(w, n);
      if (topic === 'self') { lines.push(S.Professions.get(n.prof).name + (n.workRoom ? ', работаю: «' + w.roomName(n.workRoom) + '»' : '') + '. ' + (n.character ? 'Говорят, я ' + n.character + '.' : '')); const h = n.history[n.history.length - 1]; if (h && h.kind !== 'perception') lines.push(h.text); return lines; }
      let greet;
      const attitude = w.life ? w.life.attitude(n, pp) : 0;
      if (n.role === 'DClass') greet = rel < -20 ? 'Чего надо, начальник?' : pp.prof === 'dclass' ? 'Здорово, сосед.' : 'Здравствуйте, гражданин начальник.';
      else if (rel > 30) greet = 'А, ' + pp.last + '! Рад' + n.G('', 'а') + ' видеть.';
      else if (attitude < -10) greet = pick(w, ['Чего тебе?', 'Некогда.', 'Опять вы?']);
      else greet = pick(w, ['Слушаю.', 'Да?', 'Что-то случилось?']);
      lines.push(greet);
      if (topic === 'work' || topic == null) {
        const b = S.People.block(w, n), act = (n.label || ACT_NAMES[n.activity] || '').toLowerCase();
        lines.push(b && b.end > now ? 'Сейчас: ' + act + ' (до ' + fmtTime(b.end) + ').' : 'Сейчас: ' + act + '.');
        if (topic === 'work') lines.push(workTalk(w, n));
      }
      if (topic === 'rumor' || topic == null) {
        const g = n.memory.bestGossip(now, m => m.subject !== 'player');
        if (g && (rel > -30 || n.traits.sociability > 0.5)) { lines.push(gossipLine(w, n, g)); g.shared = true; pp.addJournal('[' + fmtStamp(now) + '] ' + n.shortName + ': ' + shorten(g.text)); pp.heard = (pp.heard || []).concat({ t: now, from: n.id, text: g.text, fake: !!g.fake, perceived: !!g.perceived }).slice(-30); }
        else lines.push('Ничего особенного не слышал' + n.G('', 'а') + '.');
      }
      if (n.dept === 'science' && n.knownThreatTime >= 0 && n.lastSeenScp) lines.push('Когда я видел' + n.G('', 'а') + ' ' + n.lastSeenScp + ' (' + durationText(now - n.knownThreatTime) + ' назад), он был ' + (n.knownThreat < 30 ? 'спокоен' : n.knownThreat < 55 ? 'насторожен' : n.knownThreat < 75 ? 'возбуждён' : 'крайне возбуждён') + '.');
      if (n.needs.hunger > 70) lines.push('Ещё бы поесть успеть…'); else if (n.psy.fatigue > 70) lines.push('Я почти не спал' + n.G('', 'а') + '.'); else if (n.psy.fear > 50 || n.needs.stress > 65) lines.push('Честно — мне здесь страшно.');
      n.adjustRel('player', 1.5);
      return lines;
    },
    // "Do you see it too?" — the NPC answers from its own perception, never from the player's.
    askSee(w, n) {
      const mine = w.horror ? w.horror.playerVisible() : null, theirs = w.horror ? w.horror.effectsOf(n.id).filter(e => w.horror.active(e, n.id)) : [];
      if (!mine) return [pick(w, ['Что именно? Я ничего необычного не вижу.', 'Где? Там пусто.'])];
      const same = theirs.find(e => e.src === mine.src);
      if (same) { const d = same.data && same.data.desc ? same.data.desc : 'что-то'; n.addHistory(w.now, 'Подтвердил, что тоже видит странное (' + mine.src + ')', 'perception', mine.src); return ['…Да. Я тоже вижу. Только это не то, что вы описываете — ' + d + '.', 'Нам обоим надо к психиатру. Или к учёным.']; }
      n.psy.fear = clamp(n.psy.fear + 3, 0, 100);
      return [pick(w, ['Там никого нет. Вы в порядке?', 'Пусто. Камера тоже ничего не показывает.', 'Ничего не вижу. Может, вам отдохнуть?']), 'Если повторится — сообщите в медблок.'];
    }
  };

  S.Brain = Brain; S.Dialogue = Dialogue; S.Brain.postureFor = postureFor;
})(typeof window !== 'undefined' ? window : globalThis);
