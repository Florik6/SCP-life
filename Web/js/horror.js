/* SCP LIFE 2.0 — SCP HORROR DIRECTOR and the perception layer.
   The real world and what each person perceives are kept apart: effects live here, are caused only by anomalies,
   are never seen by cameras or other people, and end when their conditions are met. The director builds tension
   from real world states (patrols, maintenance, heating, radios) and never invents physical events. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, Hm, EV, fmtTime, fmtStamp } = S;
  const STATES = { calm: 'Спокойствие', uncertainty: 'Неопределённость', tension: 'Напряжение', paranoia: 'Паранойя', threat: 'Угроза', aftermath: 'Последствия' };
  const KIND_NAMES = { follower: 'ощущение преследования', peripheral: 'движение на краю зрения', voice: 'знакомый голос', seated_figure: 'фигура в кресле', extra_doors: 'лишние двери', reflection: 'отражение в стекле', false_memory: 'ложное воспоминание', borrowed_memory: 'чужое воспоминание', false_completion: 'ложное выполнение', compulsion: 'навязанное поручение', color_shift: 'изменение цветов' };

  class Horror {
    constructor(w) {
      this.w = w; this.effects = {}; this.nextEff = 1; this.state = 'calm'; this.since = 0; this.tension = 0; this.score = 0;
      this.lastStim = -1e9; this.lastFalse = -1e9; this.falseToday = 0; this.day = -1; this.falseAlarms = []; this.history = []; this.t = 0; this.stimT = {};
      this.fx = { state: 'calm', tension: 0, silence: false, figures: [], doors: [], sounds: [], whisper: null, peripheral: null, color: 0, confuse: null, falseDone: null, compulsion: null, heartbeat: 0 };
      this.settings = { intensity: 1, noFlash: false };
      this.threatEnd = -1e9;
    }
    // ---------------------------------------------------------------- perception effects
    addEffect(subj, e) {
      const w = this.w, list = this.effects[subj] || (this.effects[subj] = []);
      if (list.some(x => x.kind === e.kind && x.src === e.src && !x.ended)) return null;
      const res = subj === 'player' ? w.player.psy.resilience : (w.npc(subj) ? w.npc(subj).psy.resilience : 0.6);
      const eff = Object.assign({ id: 'E' + this.nextEff++, subj, started: w.now, until: w.now + (e.dur || 240), intensity: 0.5, end: {}, data: {}, ended: false }, e);
      eff.intensity = clamp(eff.intensity * (1.35 - res * 0.7), 0.15, 1);
      list.push(eff);
      this.history.push({ t: w.now, subj, kind: eff.kind, src: eff.src, cause: eff.cause, text: 'начало: ' + (KIND_NAMES[eff.kind] || eff.kind) });
      if (this.history.length > 200) this.history.shift();
      if (subj === 'player') {
        const p = w.player;
        if (eff.kind === 'false_memory' || eff.kind === 'borrowed_memory') p.addJournal('[' + fmtStamp(w.now) + '] ' + eff.data.text, true);
        if (eff.kind === 'compulsion') w.notify.push({ time: w.now, type: EV.Anomalous, perceived: true, text: 'Вам вдруг кажется очень важным: ' + eff.data.text.toLowerCase() + '.' });
      } else { const n = w.npc(subj); if (n) { n.perceptions = (n.perceptions || []).concat({ t: w.now, kind: eff.kind, src: eff.src }).slice(-10); } }
      return eff;
    }
    effectsOf(subj) { const l = this.effects[subj]; return l ? l.filter(e => !e.ended) : []; }
    has(subj, kind) { return this.effectsOf(subj).some(e => e.kind === kind); }
    end(subj, e, reason) { if (e.ended) return; e.ended = true; e.endedAt = this.w.now; e.endReason = reason; this.history.push({ t: this.w.now, subj, kind: e.kind, src: e.src, text: 'прекращено: ' + reason }); if (subj === 'player' && reason !== 'истекло') this.w.notify.push({ time: this.w.now, type: EV.Anomalous, perceived: true, text: 'Странное ощущение прошло (' + reason + ').' }); }
    // pressure from the minds of anomalies: deliberate unsettling acts weigh more than incidental strangeness
    nudge(amount, why, deliberate) { this.aiPressure = clamp((this.aiPressure || 0) + amount * (deliberate ? 1 : 0.5), -0.3, 0.45); this.aiLog = (this.aiLog || []).concat({ t: this.w.now, why, deliberate: !!deliberate, amount }).slice(-30); }
    explain(kind, text, who) { const fa = (who && this.falseAlarms.find(f => f.kind === kind && !f.explained && f.who === who)) || this.falseAlarms.find(f => f.kind === kind && !f.explained); if (fa) { fa.explained = true; fa.explainedAt = this.w.now; this.w.player.addJournal('[' + fmtStamp(this.w.now) + '] Объяснение найдено: ' + text); this.w.notify.push({ time: this.w.now, type: EV.Report, text: 'Объяснение: ' + text }); this.w.player.psy.fear = Math.max(0, this.w.player.psy.fear - 20); } }
    // Does the effect manifest right now for this subject? (company, light and place matter)
    active(e, subj) {
      const w = this.w; if (e.ended) return false;
      if (e.end.company && !this.aloneOf(subj)) return false;
      if (e.kind === 'extra_doors') { const r = w.fac.room(w.roomOf(subj)); return !!r && (r.type === 'Corridor' || r.type === 'Tunnel'); }
      if (e.kind === 'reflection') { const r = w.fac.room(w.roomOf(subj)); return !!r && r.type === 'Observation'; }
      return true;
    }
    aloneOf(subj) { return S.Anoms.H.alone(this.w, subj, 9); }
    playerVisible() { const l = this.effectsOf('player').filter(e => this.active(e, 'player') && ['seated_figure', 'reflection', 'extra_doors', 'peripheral', 'follower', 'voice'].indexOf(e.kind) >= 0); return l[0] || null; }

    // ---------------------------------------------------------------- tick
    tick(dt) {
      const w = this.w; this.t -= dt; if (this.t > 0) { this.frame(dt); return; } this.t = 1;
      if (this.day !== w.clock.day) { this.day = w.clock.day; this.falseToday = 0; }
      // end conditions
      for (const subj in this.effects) {
        const sleeping = subj === 'player' ? w.player.sleeping : (() => { const n = w.npc(subj); return !!n && (n.activity === 'Sleep' && n.arrived || !n.onSite); })();
        for (const e of this.effects[subj]) {
          if (e.ended) continue;
          if (w.now > e.until) { this.end(subj, e, 'истекло'); continue; }
          if (sleeping && e.end.sleep) { if (e.end.sleep === true) this.end(subj, e, 'сон'); else e.until = w.now + (e.until - w.now) * e.end.sleep, e.end.sleep = false; }
          if (e.kind === 'false_completion' && subj !== 'player' && e.ended) { const n = w.npc(subj); if (n) n.falseDone = false; }
        }
        this.effects[subj] = this.effects[subj].filter(e => !e.ended || w.now - e.endedAt < 720);
        if (subj !== 'player') { const n = w.npc(subj); if (n && n.falseDone && !this.has(subj, 'false_completion')) n.falseDone = false; }
      }
      this.direct();
    }
    // The director: reads the player's situation and decides the atmosphere; arranges ordinary causes for false alarms.
    direct() {
      const w = this.w, p = w.player; if (p.dead) return;
      const room = w.fac.room(p.roomId), night = w.clock.night, alone = this.aloneOf('player');
      const dark = room && (!room.lightsOn || !room.powered || room.isFlickering(w.now));
      let realThreat = false;
      for (const a of w.anomalies) if (a.arrived && !a.contained && a.temper === 'aggressive' && a.agent.roomId) { const ar = w.fac.room(a.agent.roomId); if (ar && room && ar.level === room.level && w.fac.roomDistance(ar.id, room.id) <= 4) realThreat = true; }
      if (w.alert.level >= 3) realThreat = realThreat || (room && w.fac.room(w.alert.lastRoom) && w.fac.room(w.alert.lastRoom).level === room.level);
      const effs = this.effectsOf('player').filter(e => this.active(e, 'player'));
      const strange = w.sounds.filter(s => w.now - s.t < 20 && room && s.roomId && w.fac.roomDistance(s.roomId, room.id) <= 2).length + w.life.sightings.filter(s => w.now - s.t < 60 && room && s.sector === room.sector).length;
      let role = 0;
      switch (p.prof) {
        case 'dclass': role = w.tasks.activeFor('player').some(t => t.kind === 'd_test') ? 0.25 : 0.05; break;
        case 'guard': case 'patrol': role = night ? 0.15 : 0; break;
        case 'technician': case 'electrician': case 'mechanic': role = room && /Generator|Pumps|Workshop|Tunnel|Engineering/.test(room.type) && alone ? 0.15 : 0; break;
        case 'dispatcher': case 'cctv_operator': role = w.life.sightings.filter(s => w.now - s.t < 120).length * 0.08; break;
        case 'director': case 'shift_chief': role = w.events.recent.filter(e => e.severity >= 2 && w.now - e.time < 120).length * 0.05; break;
        default: role = room && room.type === 'Observation' && night ? 0.1 : 0;
      }
      const score = clamp((night ? 0.18 : 0) + (alone ? 0.14 : -0.1) + (dark ? 0.2 : 0) + p.psy.fear / 200 + p.psy.fatigue / 400 + strange * 0.07 + role + (room && room.level === 4 ? 0.05 : 0), 0, 1);
      this.aiPressure = (this.aiPressure || 0) * 0.97;
      this.score = clamp(score + this.aiPressure, 0, 1); this.tension += (this.score - this.tension) * 0.08;
      let st;
      if (realThreat) { st = 'threat'; this.threatEnd = w.now; }
      else if (w.now - this.threatEnd < 15) st = 'aftermath';
      else if (effs.some(e => e.intensity > 0.35) || (p.psy.fear > 60 && strange > 0)) st = 'paranoia';
      else if (this.tension > 0.55) st = 'tension';
      else if (this.tension > 0.3) st = 'uncertainty';
      else st = 'calm';
      if (st !== this.state) { this.state = st; this.since = w.now; }
      // occasional false alarm with an ordinary cause, only in quiet-but-uneasy moments, rarely
      const gap = (420 + w.rng.range(0, 360)) / this.settings.intensity;
      if ((st === 'uncertainty' || st === 'tension') && w.realTime - this.lastFalse > gap && this.falseToday < 3 && w.alert.level < 2 && w.rng.chance(0.012)) this.falseAlarm(room, alone, night);
    }
    falseAlarm(room, alone, night) {
      const w = this.w, p = w.player; if (!room) return;
      const cands = [];
      // 1. footsteps from the technical tunnel below / next door — a real patrol walks there
      if (room.level === 3 && (room.type === 'Corridor') && alone) cands.push('steps');
      // 2. a protective suit on a rack in a dim room
      const suitRoom = ['quarantine', 'storage', 'storage4'].find(r => r === room.id || w.fac.roomDistance(r, room.id) === 1); if (suitRoom && (night || !room.lightsOn)) cands.push('suit');
      // 3. knocks near a dangerous cell — the heating cycle in the ducts
      if (room.type === 'Observation' && night) cands.push('knock');
      // 4. a guard whose radio battery died
      if (['guard', 'patrol', 'dispatcher', 'shift_chief', 'cctv_operator'].indexOf(p.prof) >= 0 && night) cands.push('radio');
      // 5. a short planned outage by an electrician on shift
      if (['Laboratory', 'Office', 'Observation', 'Canteen', 'Workshop'].indexOf(room.type) >= 0 && w.life.onDuty('electrician').length) cands.push('outage');
      if (!cands.length) return;
      const kind = w.rng.pick(cands); let fa = null;
      if (kind === 'steps') {
        const tun = w.active.find(n => n.agent.roomId === 'corr4' && n.agent.moving && Math.abs(n.agent.pos.x - p.pos.x) < 25);
        const walker = tun || w.life.pick(['patrol', 'guard'], 'corr4');
        if (walker) { if (!tun) w.life.issue('patrol', walker.id, { level: 4, sector: 'Т', count: 3 }, 'Начальник смены', 60); fa = { kind, roomId: room.id, who: walker.id, cause: 'Шаги — ' + walker.shortName + ' обходит технический тоннель уровня 4', text: 'шаги за спиной в пустом коридоре' }; this.stimT.steps = { who: walker.id, until: w.realTime + 40 }; }
      } else if (kind === 'suit') { if (!w.infra.faults.some(f => !f.fixed && f.kind === 'light' && f.room === suitRoom)) w.infra.create('light', suitRoom); fa = { kind, roomId: suitRoom, cause: 'Силуэт — защитный костюм на стойке в «' + w.roomName(suitRoom) + '»', text: 'неподвижная фигура в полумраке' }; }
      else if (kind === 'knock') { for (let i = 0; i < 3; i++) setTimeoutGame(w, i * 4, () => w.infra.knock(room.id, 'thermal')); w.infra.addLog('Стук в воздуховоде «' + room.name + '» — тепловое расширение при прогреве', 'vent'); fa = { kind, roomId: room.id, cause: 'Металлический стук — тепловое расширение воздуховода (цикл отопления)', text: 'стук со стороны камеры' }; }
      else if (kind === 'radio') { const g = w.active.find(n => (n.prof === 'guard' || n.prof === 'patrol') && n.radioOk && S.People.block(w, n).activity === 'Duty'); if (g) { w.infra.dryRadio(g.id); fa = { kind, roomId: g.agent.roomId, who: g.id, cause: 'У ' + g.shortName + ' разрядилась рация', text: 'сотрудник не отвечает по рации' }; } }
      else if (kind === 'outage') { w.life.planned.push({ kind: 'outage', room: room.id, at: w.now + w.rng.range(1, 3), text: 'плановые работы на щите «' + room.name + '»', profs: ['electrician'], done: false }); w.infra.addLog('В график добавлены работы на щите «' + room.name + '»', 'planned'); fa = { kind, roomId: room.id, cause: 'Свет погас из-за плановых работ электрика на щите', text: 'внезапное отключение света' }; }
      if (!fa) return;
      fa.t = w.now; fa.explained = false; this.falseAlarms.push(fa); if (this.falseAlarms.length > 30) this.falseAlarms.shift();
      this.lastFalse = w.realTime; this.falseToday++;
      w.life.decide('Режиссёр атмосферы', ['состояние: ' + STATES[this.state], 'место: ' + room.name], 'Обычное событие: ' + fa.text, '—', { hidden: true });
    }
    // Per-frame output for rendering and sound. Only the player's perception; cameras never see it.
    frame(dt) {
      const w = this.w, p = w.player, fx = this.fx, rt = w.realTime, I = this.settings.intensity;
      fx.state = this.state; fx.tension = this.tension; fx.heartbeat = clamp((p.psy.fear - 35) / 65, 0, 1) * I;
      const room = w.fac.room(p.roomId); fx.silence = !!room && w.infra.vents[room.id] && !w.infra.vents[room.id].on;
      fx.figures = []; fx.doors = []; fx.color = 0; fx.confuse = null; fx.falseDone = null; fx.compulsion = null;
      if (fx.peripheral && fx.peripheral.until < rt) fx.peripheral = null; if (fx.whisper && fx.whisper.until < rt) fx.whisper = null;
      const st = this.stimT.steps; if (st && st.until > rt) { const n = w.npc(st.who); if (n && n.agent.moving && Math.random() < dt * 1.6) fx.sounds.push({ kind: 'step_far', pos: n.agent.pos, boost: 1.6 }); }
      for (const e of this.effectsOf('player')) {
        if (!this.active(e, 'player')) continue; const k = e.intensity * I;
        switch (e.kind) {
          case 'follower': if (Math.random() < dt * 0.05 * k * (p.moving ? 2 : 0.5)) { const f = V.dirFromYaw(p.yaw); fx.sounds.push({ kind: Math.random() < 0.7 ? 'step_behind' : 'breath', pos: V.v(p.pos.x - f.x * 2.2, p.pos.y, p.pos.z - f.z * 2.2), perceived: true }); p.psy.fear = clamp(p.psy.fear + 3 * k, 0, 100); } break;
          case 'peripheral': if (!fx.peripheral && Math.random() < dt * 0.06 * k) fx.peripheral = { side: Math.random() < 0.5 ? -1 : 1, until: rt + 0.7 + Math.random() * 0.5 }; break;
          case 'voice': if (!fx.whisper && Math.random() < dt * 0.025 * k) { const c = w.npc(e.data.caller); const radio = Math.random() < 0.3; fx.whisper = { text: radio ? 'Рация (голос ' + (c ? c.shortName : 'знакомого') + '): «' + p.last + ', подойдите ко мне. Срочно.»' : 'Шёпот голосом ' + (c ? c.shortName : 'знакомого') + ': «' + p.first + '…»', radio, until: rt + 4 }; if (radio) p.heardRadio = (p.heardRadio || []).concat({ t: w.now, from: c ? c.id : null, perceived: true }).slice(-10); } break;
          case 'seated_figure': fx.figures.push({ kind: 'seated', seed: e.id, desc: e.data.desc }); break;
          case 'reflection': fx.figures.push({ kind: 'reflection', seed: e.id }); break;
          case 'extra_doors': fx.doors.push({ seed: e.id, k }); break;
          case 'color_shift': fx.color = 0.6 * k; break;
          case 'borrowed_memory': fx.confuse = e.data.forget; break;
          case 'false_completion': { const t = w.tasks.activeFor('player')[0]; fx.falseDone = t ? t.id : null; break; }
          case 'compulsion': fx.compulsion = e.data.text; break;
        }
      }
      if (fx.sounds.length > 20) fx.sounds.splice(0, fx.sounds.length - 20);
    }
    save() { return { e: this.effects, ne: this.nextEff, s: this.state, fa: this.falseAlarms, h: this.history, ft: this.falseToday, d: this.day, te: this.threatEnd }; }
    load(o) { if (!o) return; this.effects = o.e || {}; this.nextEff = o.ne || 1; this.state = o.s || 'calm'; this.falseAlarms = o.fa || []; this.history = o.h || []; this.falseToday = o.ft || 0; this.day = o.d; this.threatEnd = o.te || -1e9; }
  }
  // short delays measured in simulation seconds (the world keeps the queue)
  function setTimeoutGame(w, sec, fn) { w.timers.push({ at: w.realTime + sec, fn }); }

  S.Horror = Horror; S.HORROR_STATES = STATES; S.PERCEPT_NAMES = KIND_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
