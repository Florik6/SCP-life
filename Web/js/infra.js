/* SCP LIFE 2.0 — infrastructure: power grid and generators, faults and wear, cell sensors, radios, ventilation, humidity, shielding, dirt, maintenance log. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, Hm, EV, fmtTime, fmtStamp } = S;

  // Sector circuits. The SCP-LF-132 cell has its own isolated circuit.
  function circuitOf(room) { if (room.id === 'cell132') return 'iso132'; if (room.level === 4) return 'L4'; if (room.level !== 3) return 'X'; return { 'А': 'A3', 'Б': 'B3', 'С': 'C3' }[room.sector] || 'B3'; }
  const FAULT_KINDS = {
    light: { who: 'electrician', text: r => 'мигает освещение: ' + r.name, dur: 12, poiType: 'Panel' },
    panel: { who: 'electrician', text: r => 'перегрев щитка: ' + r.name, dur: 18, poiType: 'Panel' },
    camera: { who: 'sysadmin', text: (r, c) => 'нет сигнала с камеры ' + (c ? c.name : ''), dur: 15 },
    reader: { who: 'mechanic', text: (r, d) => 'сбоит считыватель: ' + (d ? d.name : r.name), dur: 12 },
    sensor: { who: 'containment_engineer', text: r => 'неисправен датчик камеры: ' + r.name, dur: 10, poiType: 'Console' },
    vent: { who: 'mechanic', text: r => 'остановлена вентиляция: ' + r.name, dur: 20 },
    humidity: { who: 'containment_engineer', text: r => 'растёт влажность: ' + r.name, dur: 15 },
    shield: { who: 'containment_engineer', text: r => 'ослабло экранирование: ' + r.name, dur: 20 },
    lift: { who: 'mechanic', text: () => 'неисправен служебный лифт', dur: 25 },
    gen: { who: 'electrician', text: r => 'неисправность генератора: ' + r.name, dur: 30, poiType: 'Panel' },
    door: { who: 'mechanic', text: (r, d) => 'заклинило дверь: ' + (d ? d.name : r.name), dur: 15 },
    terminal: { who: 'sysadmin', text: r => 'не отвечает терминал: ' + r.name, dur: 12, poiType: 'Console' },
    cooling: { who: 'technician', text: () => 'перегрев серверной: охлаждение не справляется', dur: 20, poiType: 'Rack' },
    emlight: { who: 'electrician', text: r => 'не работает аварийное освещение: ' + r.name, dur: 12, poiType: 'Panel' }
  };

  class Infra {
    constructor(w) {
      this.w = w; this.faults = []; this.nextFault = 1; this.outages = []; this.log = []; this.radioLogList = []; this.sensors = {}; this.radios = {}; this.vents = {}; this.hum = {}; this.shields = {};
      this.gens = { genMain: { on: true, load: 0.6, wear: 10, fault: false, test: false }, genC: { on: false, load: 0, wear: 20, fault: false, test: false } };
      this.timer = 0; this.hourT = 0; this.knocks = []; this.heating = false; this.iso = { iso132: true };
    }
    init() {
      const w = this.w;
      for (const r of w.fac.roomList) { r.circuit = circuitOf(r); this.vents[r.id] = { on: true, noisy: false }; this.hum[r.id] = 30 + (r.level === 4 ? 6 : 0); }
      for (const a of w.anomalies) if (a.containRoom) this.addSensor(a.containRoom);
      this.addSensor('heavyCell4'); this.shields.cell135 = 92;
      for (const n of w.npcs) if (n.role !== 'DClass') this.radios[n.id] = { bat: w.rng.range(55, 100), ok: true };
    }
    addSensor(cell) { if (!this.sensors[cell]) this.sensors[cell] = { cell, mode: 'ok', last: null, cal: this.w.now, stuck: null, spikeT: 0 }; }

    // ------------------------------------------------------------------ queries used by the world and anomalies
    isPowered(roomId) { const r = this.w.fac.room(roomId); if (!r) return true; if (r.circuit === 'iso132') return true; return !this.outages.some(o => o.from <= this.w.now && o.to > this.w.now && (o.rooms.indexOf(roomId) >= 0 || o.circuits && o.circuits.indexOf(r.circuit) >= 0)) && !(this.gens.genMain.fault && !this.gens.genC.on && r.circuit !== 'L4'); }
    isolated(roomId) { return this.iso.iso132 !== false; }
    humidity(roomId) { return this.hum[roomId] || 30; }
    shield(roomId) { return this.shields[roomId] != null ? this.shields[roomId] : 100; }
    weakenShield(roomId, amt) { this.shields[roomId] = clamp(this.shield(roomId) - amt, 0, 100); }
    genLoad(id) { const g = this.gens[id]; return g && g.on ? g.load : 0; }
    radioLog(e) { this.radioLogList.push(e); if (this.radioLogList.length > 120) this.radioLogList.shift(); }
    fault(id) { return this.faults.find(f => f.id === id && !f.fixed) || null; }
    openFaults() { return this.faults.filter(f => !f.fixed); }
    addLog(text, kind) { this.log.push({ t: this.w.now, text, kind: kind || 'info' }); if (this.log.length > 160) this.log.shift(); }

    // Sensor reading as SCP LIFE sees it: real values + noise, distorted by faults.
    sensor(cell) {
      const w = this.w, s = this.sensors[cell]; if (!s) return null;
      const a = w.anomalies.find(x => x.containRoom === cell && x.arrived);
      const truth = a ? a.truth(w) : { motion: 0, temp: 20, em: 0, sound: 0, light: 1 };
      const door = (() => { const r = w.fac.room(cell); if (!r) return null; for (const id of r.doorIds) { const d = w.fac.door(id); if (d.kind === 'Heavy' || d.kind === 'Security') return d; } return null; })();
      let v = { motion: truth.motion + w.rng.range(-0.03, 0.03), temp: (truth.temp || 20) + w.rng.range(-0.2, 0.2), em: truth.em + w.rng.range(-0.02, 0.02), sound: (truth.sound || 0) + w.rng.range(-0.02, 0.02), lock: door ? Math.round(door.integrity) : 100, ok: s.mode === 'ok' };
      if (s.mode === 'stuck') { if (!s.stuck) s.stuck = v; v = Object.assign({}, s.stuck, { ok: false }); }
      else if (s.mode === 'spike') { if (w.rng.chance(0.15)) { v.em = w.rng.range(0.6, 1); v.motion = w.rng.range(0.5, 1); } v.ok = false; }
      else if (s.mode === 'drift') { v.temp += (w.now - s.cal) / 600; v.em += 0.2; v.ok = false; }
      if (!this.isPowered(cell) && cell !== 'cell132') { v.motion = 0; v.sound = 0; }
      for (const k of ['motion', 'em', 'sound']) v[k] = clamp(v[k], 0, 1);
      s.last = v; return v;
    }

    // ------------------------------------------------------------------ tick
    tick(dt) {
      const w = this.w; this.timer -= dt; if (this.timer > 0) return; this.timer = 1;
      const gm = 1 * w.clock.minPerSec; this.hourT += gm;
      // lights follow power; faulty lights flicker (a real, ordinary cause of flickering)
      for (const r of w.fac.roomList) {
        const p = this.isPowered(r.id); r.powered = p;
        const want = p && !r.dark; if (r.lightsOn !== want && !r.manualLights) r.lightsOn = want;
        if (this.faults.some(f => !f.fixed && f.kind === 'light' && f.room === r.id) && w.rng.chance(0.25)) r.flickerUntil = Math.max(r.flickerUntil, w.now + 0.6);
      }
      // generators: test runs of the reserve generator, failure of the main one
      const g = this.gens, mod = w.clock.mod;
      const testing = g.genC.test && w.now < g.genC.testUntil; if (g.genC.test && !testing) { g.genC.test = false; g.genC.on = g.genMain.fault; this.addLog('Проверка резервного генератора завершена', 'gen'); }
      if (g.genMain.fault && !g.genC.on) { g.genC.on = true; g.genC.load = 1; w.events.post({ time: w.now, type: EV.Power, roomId: 'genC', severity: 2, pub: true, text: 'Отказ главного генератора. Запущен резервный генератор, питание секторов ограничено.' }); }
      if (!g.genMain.fault && g.genC.on && !testing) { g.genC.on = false; g.genC.load = 0; }
      if (testing) g.genC.load = 0.7;
      // heating cycle at night: ducts expand and knock (ordinary cause of night knocks)
      const heat = S.inRange(mod, Hm(2), Hm(2, 30)) || S.inRange(mod, Hm(4, 40), Hm(5));
      if (heat && !this.heating) { this.heating = true; this.addLog('Цикл отопления: прогрев воздуховодов уровня 3', 'vent'); }
      if (!heat) this.heating = false;
      if (this.heating && w.rng.chance(0.08)) this.knock(w.rng.pick(['obs', 'corrC', 'airlock', 'obs133', 'obs138', 'obs124', 'cell131', 'labC']), 'thermal');
      // vents and humidity
      for (const id in this.vents) { const v = this.vents[id], r = w.fac.room(id); const on = !this.faults.some(f => !f.fixed && f.kind === 'vent' && f.room === id) && this.isPowered(id) && !this.outages.some(o => o.vent && o.from <= w.now && o.to > w.now && o.rooms.indexOf(id) >= 0); v.on = on; const target = (r && r.level === 4 ? 36 : 30) + (on ? 0 : 18) + (this.faults.some(f => !f.fixed && f.kind === 'humidity' && f.room === id) ? 30 : 0); this.hum[id] += (target - this.hum[id]) * 0.01 * gm; }
      if (this.shields.cell135 != null) this.shields.cell135 = clamp(this.shields.cell135 - 0.004 * gm, 0, 100);
      // radios drain during shifts and charge off site / during sleep
      for (const n of w.npcs) { const r = this.radios[n.id]; if (!r) continue; const charging = !n.onSite || n.activity === 'Sleep'; r.bat = clamp(r.bat + (charging ? 0.4 : -0.11) * gm, 0, 100); r.ok = r.bat > 1; if (n.radioOk !== r.ok) { n.radioOk = r.ok; if (!r.ok && n.onSite) this.addLog('Рация ' + n.shortName + ' не отвечает на опрос (батарея)', 'radio'); } }
      // wear: faults appear over time; some report themselves, others wait for inspection
      if (this.hourT >= 10) { this.hourT = 0; this.wear(); this.upkeep(); }
      this.outages = this.outages.filter(o => o.to > w.now - 5);
      this.knocks = this.knocks.filter(k => w.now - k.t < 3);
    }
    // every 10 game minutes: spare parts arrive once a day; a hot server room breaks cameras; a power cut left behind
    // by a repair is switched back on by the duty electrician (and noted against whoever left it)
    upkeep() {
      const w = this.w;
      if (S.Proc && (this.supplyDay || 0) < w.clock.day && w.clock.hour >= 8) { this.supplyDay = w.clock.day; S.Proc.resupply(w); }
      const hot = this.faults.find(f => !f.fixed && f.kind === 'cooling');
      if (hot) { this.serverHeat = (this.serverHeat || 0) + 1; if (this.serverHeat === 6) this.addLog('Серверная: температура 38 °C, растёт', 'fault'); if (this.serverHeat > 9 && w.rng.chance(0.25)) { const c = this.create('camera'); if (c) this.addLog('Перегрев серверной: отключилась камера ' + (c.text || ''), 'fault'); } }
      for (const f of this.faults) if (!f.fixed && f.powerOff && w.now - (f.lastAct || f.since) > 40) {
        f.powerOff = false; this.outages = this.outages.filter(o => o.fault !== f.id);
        this.addLog('Питание «' + w.roomName(f.site) + '» восстановлено дежурным электриком: ремонт ' + f.id + ' брошен обесточенным', 'fault');
        if (w.life) w.life.decide('Обесточенный участок оставлен без присмотра', [w.roomName(f.site), f.text], 'Питание восстановлено, замечание исполнителю', 'инженерная служба');
        if (f.lastBy === 'player') { w.player.addRep('engineering', -4); w.player.addJournal('[' + fmtStamp(w.now) + '] Замечание: оставил участок «' + w.roomName(f.site) + '» обесточенным.'); }
      }
    }
    wear() {
      const w = this.w; if (this.openFaults().length > 14) return;
      // wear follows the chosen intensity; a technician on shift makes faults surface a little more often (people use what works)
      const pace = S.TaskDirector && S.TaskDirector.PACE && w.td ? (S.TaskDirector.PACE[w.td.pace] || {}).events || 1 : 1, tech = S.TaskDirector && S.TaskDirector.famOf && S.TaskDirector.famOf(w.player.prof) === 'tech' && w.player.onShift ? 1.4 : 1;
      const r = w.rng; if (!r.chance(0.12 * pace * tech)) return;
      const kinds = ['light', 'light', 'panel', 'camera', 'reader', 'sensor', 'vent', 'humidity', 'shield', 'lift', 'gen', 'door', 'door', 'terminal', 'cooling', 'emlight'];
      this.create(r.pick(kinds));
    }
    // a cell (or its observation room) with no object in it yet: nobody would ever notice a fault there
    idle(roomId) {
      const w = this.w, r = w.fac.room(roomId); if (!r) return true;
      const cellOf = id => { if (w.fac.room(id) && w.fac.room(id).type === 'Containment') return id; const b = Object.values(w.fac.blocks || {}).find(x => x.obs === id); return b ? b.cell : null; };
      const cell = (r.type === 'Containment' || r.type === 'Observation') ? cellOf(roomId) : null;
      return !!cell && !w.anomalies.some(a => a.arrived && (a.containRoom === cell || a.obsRoom === roomId));
    }
    create(kind, roomId, extra) {
      const w = this.w, K = FAULT_KINDS[kind]; let room = roomId ? w.fac.room(roomId) : null, obj = null, poi = null;
      if (kind === 'camera') { const c = roomId ? w.cams.find(x => x.roomId === roomId && x.operational) : w.rng.pick(w.cams.filter(x => x.operational && !this.idle(x.roomId))); if (!c) return null; obj = c; room = w.fac.room(c.roomId); c.operational = false; }
      else if (kind === 'reader') { const d = roomId ? w.fac.door(roomId) : w.rng.pick(w.fac.doorList.filter(x => x.hasLeaf && x.kind !== 'Heavy')); if (!d) return null; obj = d; const ra = w.fac.room(d.roomA), rb = w.fac.room(d.roomB); room = rb && /Corridor|Tunnel/.test(rb.type) ? rb : /Corridor|Tunnel/.test(ra.type) ? ra : ra.type === 'Containment' ? rb : ra; d.readerFault = true; }
      else if (kind === 'sensor') { const cells = Object.keys(this.sensors).filter(c => this.sensors[c].mode === 'ok' && w.anomalies.some(a => a.arrived && a.containRoom === c)); if (!cells.length) return null; const c = roomId || w.rng.pick(cells); this.sensors[c].mode = w.rng.pick(['stuck', 'spike', 'drift']); this.sensors[c].stuck = null; const a = w.anomalies.find(x => x.containRoom === c); room = w.fac.room(a && a.obsRoom ? a.obsRoom : c); obj = { cell: c }; }
      else if (kind === 'humidity') room = room || w.fac.room(w.rng.pick(['cell125', 'cell129', 'labC', 'lab2', 'pumps']));
      else if (kind === 'shield') { room = w.fac.room('obs135'); this.shields.cell135 = clamp((this.shields.cell135 || 90) - 25, 0, 100); }
      else if (kind === 'lift') { room = w.fac.room('liftOld'); w.fac.door('t.liftOld').outOfService = true; w.lockEpoch++; }
      else if (kind === 'gen') { room = w.fac.room(w.rng.chance(0.7) ? 'genC' : 'genMain'); if (room.id === 'genMain') this.gens.genMain.fault = true; else this.gens.genC.fault = true; }
      else if (kind === 'door') {
        // a jammed leaf only where both sides keep another way out, so nobody is sealed in
        const detour = d => { const a = w.fac.room(d.roomA), b = w.fac.room(d.roomB); if (!a || !b || !a.hubNodes.length || !b.hubNodes.length) return false; d.outOfService = true; const p = S.findPath(w.fac, a.hubNodes[0], b.hubNodes[0], null); d.outOfService = false; return !!p && p.length < 400; };
        const ok = d => d.hasLeaf && d.kind === 'Standard' && !d.isTransit && !d.outOfService && [d.roomA, d.roomB].every(id => { const r = w.fac.room(id); return r && r.doorIds.filter(x => !w.fac.door(x).outOfService).length >= 2; });
        let d = roomId ? w.fac.door(roomId) : null;
        if (d && !(ok(d) && detour(d))) return null;
        if (!d) { const cands = w.fac.doorList.filter(ok); for (let i = 0; i < 12 && cands.length && !d; i++) { const c = cands.splice(w.rng.int(0, cands.length), 1)[0]; if (detour(c)) d = c; } }
        if (!d) return null;
        obj = d; const ra = w.fac.room(d.roomA), rb = w.fac.room(d.roomB); room = /Corridor|Tunnel/.test(rb.type) ? rb : ra; d.jammed = true; d.outOfService = true; w.lockEpoch++;
      }
      else if (kind === 'terminal') { const cands = Object.values(w.fac.pois).filter(p => p.type === 'Console' && !p.broken && (!roomId || p.roomId === roomId)); const p = w.rng.pick(cands); if (!p) return null; obj = p; p.broken = true; room = w.fac.room(p.roomId); poi = p.id; }
      else if (kind === 'cooling') { room = w.fac.room('servers'); this.serverHeat = this.serverHeat || 0; }
      else if (kind === 'emlight') { room = room || w.rng.pick(w.fac.roomList.filter(x => (x.type === 'Corridor' || x.type === 'Tunnel') && (x.level === 3 || x.level === 4) && !x.noEmergency)); if (room) room.noEmergency = true; }
      else room = room || w.rng.pick(w.fac.roomList.filter(x => (x.level === 3 || x.level === 4) && !this.idle(x.id)));
      if (!room) return null;
      if (this.faults.some(f => !f.fixed && f.kind === kind && f.room === room.id)) return null;
      if (K.poiType && !poi) { const p = room.pois.find(x => x.type === K.poiType); if (p) poi = p.id; else if (kind === 'light' || kind === 'panel' || kind === 'emlight') { const pp = Object.values(w.fac.pois).find(x => x.type === 'Panel' && w.fac.room(x.roomId).sector === room.sector && w.fac.room(x.roomId).level === room.level); if (pp) { poi = pp.id; } } }
      const f = Object.assign({ id: 'F' + this.nextFault++, kind, room: poi ? w.fac.poi(poi).roomId : room.id, site: room.id, poi, poiType: K.poiType || null, text: K.text(room, obj), who: K.who, dur: K.dur, since: w.now, known: false, fixed: false, obj: obj && obj.id ? obj.id : (obj && obj.cell) || null }, extra || {});
      // self-reporting faults: dead camera feed, reader errors, generator failure
      if (S.Proc) S.Proc.seed(w, f);
      if (kind === 'camera' || kind === 'gen' || kind === 'lift' || kind === 'cooling') this.discover(f, 'система');
      this.faults.push(f); if (this.faults.length > 80) this.faults = this.faults.filter(x => !x.fixed || w.now - x.fixedAt < 1440);
      return f;
    }
    discover(f, by) {
      if (f.known) return; f.known = true; f.knownBy = by; f.knownAt = this.w.now;
      this.addLog('Неисправность ' + f.id + ': ' + f.text + ' (обнаружил: ' + by + ')', 'fault');
      this.w.events.post({ time: this.w.now, type: EV.Fault, roomId: f.site, actor: by === 'player' ? 'player' : null, severity: f.kind === 'gen' ? 2 : 0, text: 'Неисправность: ' + f.text + '. Источник: ' + by + '.' });
      if (this.w.life) this.w.life.onFault(f);
    }
    // Inspection rounds find hidden faults in the same sector.
    inspect(roomId, who) {
      const w = this.w, r = w.fac.room(roomId); let found = 0;
      for (const f of this.faults) { if (f.fixed || f.known) continue; const fr = w.fac.room(f.site); if (fr && r && fr.sector === r.sector && fr.level === r.level && w.rng.chance(0.6)) { this.discover(f, who === 'player' ? 'player' : w.nameOf(who)); found++; } }
      return found;
    }
    fix(id, who) {
      const w = this.w, f = this.faults.find(x => x.id === id); if (!f || f.fixed) return;
      f.fixed = true; f.fixedAt = w.now; f.fixedBy = who;
      if (f.kind === 'camera') { const c = w.cams.find(x => x.id === f.obj); if (c) c.operational = true; }
      if (f.kind === 'reader') { const d = w.fac.door(f.obj); if (d) d.readerFault = false; }
      if (f.kind === 'sensor') this.calibrate(f.obj, who, true);
      if (f.kind === 'shield') this.shields.cell135 = 100;
      if (f.kind === 'lift') { w.fac.door('t.liftOld').outOfService = !!(w.life && w.life.liftLocked()); w.lockEpoch++; }
      if (f.kind === 'gen') { this.gens.genMain.fault = false; this.gens.genC.fault = false; }
      if (f.kind === 'door') { const d = w.fac.door(f.obj); if (d) { d.jammed = false; d.outOfService = false; w.lockEpoch++; } }
      if (f.kind === 'terminal') { const p = w.fac.poi(f.obj); if (p) p.broken = false; }
      if (f.kind === 'cooling') this.serverHeat = 0;
      if (f.kind === 'emlight') { const r = w.fac.room(f.site); if (r) r.noEmergency = false; }
      if (f.powerOff) { f.powerOff = false; this.outages = this.outages.filter(o => o.fault !== f.id); }
      this.addLog('Устранено ' + f.id + ': ' + f.text + ' (' + w.nameOf(who) + ')', 'fix');
      if (w.life) w.life.onFaultFixed(f, who);
    }
    calibrate(cell, who, silent) {
      const s = this.sensors[cell]; if (!s) return;
      const was = s.mode; s.mode = 'ok'; s.stuck = null; s.cal = this.w.now;
      for (const f of this.faults) if (!f.fixed && f.kind === 'sensor' && f.obj === cell) { f.fixed = true; f.fixedAt = this.w.now; f.fixedBy = who; }
      if (cell === 'cell135') this.shields.cell135 = Math.max(this.shields.cell135, 96);
      if (was !== 'ok') { this.addLog('Калибровка датчиков «' + this.w.roomName(cell) + '»: обнаружен и устранён дефект (' + ({ stuck: 'зависание показаний', spike: 'ложные всплески', drift: 'дрейф' })[was] + ')', 'fix'); if (this.w.life) this.w.life.newFact('sensor_fault', { cell, mode: was, by: who }); }
      else if (!silent) this.addLog('Калибровка датчиков «' + this.w.roomName(cell) + '»: в норме', 'info');
    }
    doorFixed(id) { for (const f of this.faults) if (!f.fixed && f.kind === 'reader' && f.obj === id) this.fix(f.id, 'mechanic'); }
    repairCamera(id, who) { for (const f of this.faults) if (!f.fixed && f.kind === 'camera' && f.obj === id) this.fix(f.id, who); }
    genCheck(roomId, who) {
      const id = roomId === 'genMain' ? 'genMain' : 'genC', g = this.gens[id]; g.wear = Math.max(0, g.wear - 15);
      for (const f of this.faults) if (!f.known && !f.fixed && (f.kind === 'gen' || f.kind === 'panel') && f.site === roomId) this.discover(f, who === 'player' ? 'player' : this.w.nameOf(who));
      this.addLog('Проверка ' + this.w.roomName(roomId) + ': износ ' + Math.round(g.wear) + '%', 'gen');
      return 'износ ' + Math.round(g.wear) + '%';
    }
    serverCheck(who) {
      const w = this.w; let n = 0; for (const f of this.faults) if (!f.known && !f.fixed && (f.kind === 'camera' || f.kind === 'sensor')) { this.discover(f, who === 'player' ? 'player' : w.nameOf(who)); n++; }
      if (w.life) w.life.serverChecked(who);
      return n ? 'найдено ошибок: ' + n : 'ошибок нет';
    }
    // Planned short outage (announced in the maintenance schedule; not always on the PA).
    plannedOutage(rooms, minutes, who, vent) {
      const w = this.w; this.outages.push({ rooms, from: w.now, to: w.now + minutes, by: who, planned: true, vent: !!vent });
      this.addLog('Плановое отключение: ' + rooms.map(r => w.roomName(r)).join(', ') + ' на ' + Math.round(minutes * 60 / w.clock.minPerSec / 60) + ' с (' + w.nameOf(who) + ')', 'planned');
      w.sounds.push({ t: w.now, kind: 'breaker', roomId: rooms[0], pos: w.fac.room(rooms[0]).center, cause: 'planned' });
    }
    genTest(minutes) { const g = this.gens.genC; g.test = true; g.on = true; g.testUntil = this.w.now + minutes; this.addLog('Плановая проверка резервного генератора (' + minutes + ' мин)', 'gen'); }
    knock(roomId, cause) { const r = this.w.fac.room(roomId); if (!r) return; const k = { t: this.w.now, kind: 'knock', roomId, pos: V.v(r.center.x + this.w.rng.range(-2, 2), r.floorY + 2.8, r.center.z + this.w.rng.range(-2, 2)), cause }; this.knocks.push(k); this.w.sounds.push(k); if (cause === 'thermal' && this.w.rng.chance(0.2)) this.addLog('Стук в воздуховоде «' + r.name + '» — тепловое расширение при прогреве', 'vent'); }
    dryRadio(id) { const r = this.radios[id]; if (r) { r.bat = 0; r.ok = false; const n = this.w.npc(id); if (n) n.radioOk = false; } }

    save() { return { f: this.faults, nf: this.nextFault, o: this.outages, l: this.log, rl: this.radioLogList, s: this.sensors, r: this.radios, v: this.vents, h: this.hum, sh: this.shields, g: this.gens, iso: this.iso, st: this.stock || null, sv: this.serverHeat || 0, sd: this.supplyDay || 0 }; }
    load(o) {
      this.faults = o.f; this.nextFault = o.nf; this.outages = o.o; this.log = o.l; this.radioLogList = o.rl; this.sensors = o.s; this.radios = o.r; this.vents = o.v; this.hum = o.h; this.shields = o.sh; this.gens = o.g; this.iso = o.iso || { iso132: true };
      this.stock = o.st || null; this.serverHeat = o.sv || 0; this.supplyDay = o.sd || 0;
      // world objects that carry a fault flag outside the save of the fault list
      const w = this.w; for (const f of this.faults) { if (f.fixed) continue;
        if (f.kind === 'door') { const d = w.fac.door(f.obj); if (d) { d.jammed = true; d.outOfService = true; } }
        if (f.kind === 'terminal') { const p = w.fac.poi(f.obj); if (p) p.broken = true; }
        if (f.kind === 'emlight') { const r = w.fac.room(f.site); if (r) r.noEmergency = true; } }
    }
  }

  // Dirt from foot traffic in corridors: janitors clean it, lost items are found on the way.
  class Dirt {
    constructor(w) { this.w = w; this.list = []; this.next = 1; this.t = 0; }
    tick(dt) {
      this.t -= dt; if (this.t > 0) return; this.t = 6; const w = this.w;
      if (this.list.length > 40) return;
      const busy = w.active.filter(n => n.agent.moving && n.agent.roomId && /Corridor|Tunnel|Canteen/.test((w.fac.room(n.agent.roomId) || {}).type));
      if (busy.length && w.rng.chance(0.25)) { const n = w.rng.pick(busy); this.list.push({ id: 'dirt' + this.next++, roomId: n.agent.roomId, pos: V.copy(n.agent.pos), t: w.now }); }
    }
    spots(level) { return this.list.filter(d => { const r = this.w.fac.room(d.roomId); return r && r.level === level; }); }
    remove(id, who) { const i = this.list.findIndex(d => d.id === id); if (i >= 0) this.list.splice(i, 1); const w = this.w; for (const c of Object.values(w.cards)) if (!c.holder && c.room && w.rng.chance(0.5)) { c.holder = who === 'player' ? null : who; if (who !== 'player') { const n = w.npc(who); if (n) n.say('Нашёл чью-то карту на полу. Сдам на пост.', w.now); } break; } }
    clean(roomId) { this.list = this.list.filter(d => d.roomId !== roomId); }
    save() { return { l: this.list, n: this.next }; }
    load(o) { if (o) { this.list = o.l; this.next = o.n; } }
  }

  S.Infra = Infra; S.Dirt = Dirt; S.FAULT_KINDS = FAULT_KINDS;
})(typeof window !== 'undefined' ? window : globalThis);
