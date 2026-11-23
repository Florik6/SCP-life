/* SCP LIFE — GAMEPLAY: checkpoints («Пропуск»). Two doors into guarded wings get a manned post. While a guard (the player
   or an NPC) stands there, everyone coming from the outer side waits in line and is checked: the card must belong to
   the person (photo and name), must not be revoked, the person must have business in the wing (department, task, work
   place), must not be suspended or sick, and class D only under escort. The guard decides: let through, turn back,
   detain, or call the officer. Correctness is not shown: a person let through by mistake becomes a breach found later
   by the access audit; a wrongly turned back colleague loses work time, complains and remembers. NPC guards check by
   their own diligence and make their own mistakes. A player who is not a guard is checked by NPC guards too — a picked
   up card of somebody else no longer opens everything. Special cases come from real changes to the world: room-mates
   who mixed up their cards, a personal visit into a wing where the person has no business. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, EV, fmtTime, fmtStamp } = S;

  const CPS = {
    cpB: { id: 'cpB', name: 'КПП «Б–А»', door: 'd.ab', side: 'corridor', inner: 'corrA', poi: 'cp.B', sector: 'А', level: 3, depts: ['admin', 'security', 'engineering', 'medical', 'mtf'], what: 'командный центр, серверная, медблок А, МОГ' },
    cpC: { id: 'cpC', name: 'КПП «Восток»', door: 'd.liftBC', side: 'liftB', inner: 'corrC', poi: 'cp.C', sector: 'С', level: 3, depts: ['science', 'security', 'engineering', 'medical', 'mtf', 'admin'], what: 'исследовательское крыло С: камеры объектов, лаборатории' }
  };
  const PEAK = [[6 * 60 + 20, 9 * 60 + 30], [11 * 60 + 50, 14 * 60 + 40], [17 * 60 + 30, 19 * 60 + 40]];
  const REASON = { no_card: 'нет карты', swap: 'карта другого сотрудника', revoked: 'карта аннулирована', no_zone: 'нет оснований для прохода в зону', suspended: 'отстранён от работы', sick: 'на больничном', dclass: 'класс D без конвоя', foreign: 'чужая карта' };
  const SEEN = { no_card: true, swap: 'face', revoked: 'base', no_zone: 'purpose', suspended: 'base', sick: 'base', dclass: true, foreign: 'face' };

  // ---------------------------------------------------------------- appearance of a card owner, the same as the 3D model (humans.js spec)
  function hashOf(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const HAIRW = ['чёрные', 'тёмные', 'каштановые', 'русые', 'тёмные', 'тёмно-русые', 'светлые'];
  const STYLEW = { long: 'длинные волосы', bun: 'волосы в пучке', pony: 'хвост', bob: 'каре', short: 'короткая стрижка', crew: 'стрижка под машинку', side: 'зачёс набок', bald: 'лысый' };
  function looks(n) {
    if (!n) return null;
    if (n.custom) return { female: !!n.custom.female, age: n.custom.age || 40, text: (n.custom.female ? 'женщина' : 'мужчина') + ', ~' + (n.custom.age || 40) };
    const r = rng(hashOf(n.id || 'x') ^ 0x9e3779b9), female = !!n.female, role = n.role || 'Scientist';
    const age = n.age || (25 + Math.floor(r() * 35));
    r(); const grey = age > 50 && r() < 0.7; const hairI = grey ? -1 : Math.floor(r() * 7); if (grey) r();
    const style = female ? ['long', 'bun', 'pony', 'bob'][Math.floor(r() * 4)] : age > 50 && r() < 0.35 ? 'bald' : ['short', 'short', 'crew', 'side'][Math.floor(r() * 4)];
    const beard = !female && r() < 0.3, moustache = !female && !beard && r() < 0.2, glasses = (role === 'Scientist' || role === 'Admin') && r() < 0.35;
    const hair = style === 'bald' ? '' : (grey ? 'седые' : HAIRW[hairI]) + ' ' + STYLEW[style];
    const parts = [(female ? 'женщина' : 'мужчина') + ', ~' + Math.round(age / 5) * 5 + ' лет', style === 'bald' ? 'лысый' : hair];
    if (beard) parts.push('борода'); if (moustache) parts.push('усы'); if (glasses) parts.push('очки');
    return { female, age, style, beard, moustache, glasses, grey, text: parts.join(', ') };
  }

  // ---------------------------------------------------------------- state
  function M(w) {
    if (!w.cp) { w.cp = { st: {}, breaches: [], complaints: [], swaps: [], nextAudit: 0, t: 0 }; }
    for (const id in CPS) if (!w.cp.st[id]) w.cp.st[id] = { by: null, seen: 0, cleared: {}, denied: {}, queue: [], checks: [], special: 0, shiftStart: 0 };
    return w.cp;
  }
  const cpOfDoor = (w, d) => { for (const id in CPS) if (CPS[id].door === d.id) return CPS[id]; return null; };
  const poiOf = (w, cp) => w.fac.poi(cp.poi);
  const inZone = (w, cp, roomId) => { const r = w.fac.room(roomId); return !!r && r.level === cp.level && r.sector === cp.sector && r.id !== cp.side && r.type !== 'Lift' && r.type !== 'Stairs'; };
  function manned(w, cp) {
    const st = M(w).st[cp.id], poi = poiOf(w, cp); if (!st.by || !poi) return false;
    if (st.by === 'player') { const p = w.player; return !p.dead && p.roomId && V.distXZ(p.pos, poi.pos) < 3.5 && Math.abs(p.pos.y - poi.pos.y) < 2; }
    const g = w.npc(st.by); return !!g && !g.dead && !g.incap(w.now) && w.now - st.seen < 1 && V.distXZ(g.agent.pos, poi.pos) < 2.5;
  }
  const personOf = (w, who) => who === 'player' ? w.player : w.npc(who);
  const nameOf = (w, who) => who === 'player' ? w.player.name : (w.npc(who) || {}).displayName || who;
  // what the person is going there for: their task step or their work place
  function purpose(w, cp, who) {
    if (who === 'player') { const p = w.player; for (const t of w.tasks.activeFor('player')) for (const s of t.steps) if (!s.done && inZone(w, cp, s.room)) return { ok: true, text: t.title + ' — «' + w.roomName(s.room) + '»' }; if (inZone(w, cp, p.workRoom)) return { ok: true, text: 'на рабочее место — «' + w.roomName(p.workRoom) + '»' }; return { ok: S.Professions.get(p.prof) && cp.depts.indexOf(p.dept) >= 0, text: 'по службе' }; }
    const n = w.npc(who); if (!n) return { ok: false, text: '—' };
    if (n.cpVisit && n.cpVisit.until > w.now) return { ok: false, text: n.cpVisit.text };
    const t = n.job, s = t && t.steps[t.si];
    if (t && t.steps.some(x => !x.done && inZone(w, cp, x.room))) { const x = t.steps.find(y => !y.done && inZone(w, cp, y.room)); return { ok: (!!t.id && !t.personal) || cp.depts.indexOf(n.dept) >= 0, text: (t.title || 'работа') + ' — «' + w.roomName(x.room) + '»' }; }
    if (inZone(w, cp, n.workRoom)) return { ok: true, text: 'на рабочее место — «' + w.roomName(n.workRoom) + '»' };
    if (n.targetRoom && inZone(w, cp, n.targetRoom)) return { ok: cp.depts.indexOf(n.dept) >= 0, text: (n.label || 'по делу') + ' — «' + w.roomName(n.targetRoom) + '»' };
    return { ok: cp.depts.indexOf(n.dept) >= 0, text: n.label || 'по службе' };
  }
  // the facts: is this person allowed through with this card?
  function verdict(w, cp, who, cardId) {
    const x = personOf(w, who), card = cardId ? w.card(cardId) : null, reasons = [], pur = purpose(w, cp, who), now = w.now;
    if (!x) return { valid: false, reasons: ['no_card'], purpose: pur, card };
    if (who !== 'player' && x.role === 'DClass' && !x.escortedBy) reasons.push('dclass');
    if (!card) reasons.push('no_card');
    else {
      if (card.owner !== (who === 'player' ? 'player' : x.id) && !(who === 'player' && card.id === 'card.player')) reasons.push(who === 'player' ? 'foreign' : 'swap');
      if (card.revoked) reasons.push('revoked');
    }
    if (who !== 'player') { if (x.restricted) reasons.push('suspended'); if (x.isSick && x.isSick(now) && !x.treated) reasons.push('sick'); }
    if (!pur.ok) reasons.push('no_zone');
    return { valid: reasons.length === 0, reasons, purpose: pur, card };
  }
  // what the guard learns from the database
  function baseCheck(w, cp, who, cardId) {
    const card = cardId ? w.card(cardId) : null, out = [];
    if (!card) return ['Карта не предъявлена — в базе искать нечего.'];
    const owner = card.owner === 'player' ? w.player : w.npc(card.owner);
    out.push('Карта ' + card.id + ' числится за: ' + card.ownerName + (owner && owner.prof ? ' (' + S.Professions.get(owner.prof).name + ')' : ''));
    out.push(card.revoked ? 'Статус: АННУЛИРОВАНА' + (card.revokedWhy ? ' — ' + card.revokedWhy : '') : 'Статус: действует');
    if (owner && card.owner !== 'player') {
      const sh = S.People.currentShift(owner, w.now); out.push(sh ? 'Смена владельца: до ' + fmtTime(sh.e) : 'Владелец сейчас не на смене');
      if (owner.restricted) out.push('ОТСТРАНЁН от работы в зонах содержания');
      if (owner.isSick && owner.isSick(w.now) && !owner.treated) out.push('Больничный: не допущен к работе');
      const tk = w.tasks.list.find(t => t.status === 'Active' && t.who === owner.id && t.steps.some(s => !s.done && inZone(w, cp, s.room)));
      out.push(tk ? 'Задание в зоне: «' + tk.title + '»' : (cp.depts.indexOf(owner.dept) >= 0 ? 'Отдел имеет допуск в зону' : 'Отдел не работает в зоне — нужно задание или разрешение'));
    }
    if (card.tempUntil > w.now) out.push('Временный допуск L' + card.tempLevel + ' до ' + fmtTime(card.tempUntil));
    return out;
  }
  // the person's own answer about the visit; they give their own name (which is how mixed up cards are noticed)
  function answer(w, cp, who) {
    const x = personOf(w, who), pur = purpose(w, cp, who);
    if (!x) return '—';
    if (x.role === 'DClass') return x.callsign + '. Мне… в медблок. Сказали, можно.';
    const nm = x.last ? x.first + ' ' + x.last : x.name;
    return nm + '. ' + (x.cpVisit && x.cpVisit.until > w.now ? x.cpVisit.say : 'Иду: ' + pur.text + '.');
  }

  // ---------------------------------------------------------------- the door: everybody coming from the outer side waits while a guard stands there
  // who walks past without a check: guards themselves, escorted people, responders, everybody during an alarm
  function exempt(w, who) { const x = personOf(w, who); return w.alert.level >= 2 || !!(x && who !== 'player' && (x.escortedBy || x.dept === 'security' || x.dept === 'mtf' || (x.job && (x.job.act === 'Respond' || (x.job.prio || 0) >= 5)))); }
  // an open door does not let anyone slip past a manned post (called by the crowd movement code, so it must stay cheap)
  function needsCheck(w, d, fromRoom, who) {
    if (d.id !== 'd.ab' && d.id !== 'd.liftBC') return false;
    const cp = cpOfDoor(w, d); if (!cp || fromRoom !== cp.side) return false;
    const st = M(w).st[cp.id]; if (who === st.by || st.cleared[who] > w.now || !st.by) return false;
    return manned(w, cp) && !exempt(w, who);
  }
  function gate(w, d, who, fromRoom, cardId) {
    const cp = cpOfDoor(w, d); if (!cp || fromRoom !== cp.side) return null;
    const st = M(w).st[cp.id];
    if (st.denied[who] > w.now) return S.R.DGuard;
    if (!manned(w, cp) || who === st.by || st.cleared[who] > w.now) return null;
    if (exempt(w, who)) return null;
    if (who === 'player' && st.by !== 'player') return npcChecksPlayer(w, cp, st, cardId);
    enqueue(w, cp, who, cardId); return S.R.Check;
  }
  function enqueue(w, cp, who, cardId) {
    const st = M(w).st[cp.id]; let q = st.queue.find(e => e.who === who);
    if (!q) { q = { who, card: cardId || null, since: w.now }; st.queue.push(q); const n = w.npc(who); if (n) n.say(n.role === 'DClass' ? 'Начальник, я только спросить…' : w.rng.pick(['Сейчас, пропуск…', 'Добрый день. Вот карта.', 'Мне туда, по работе.']), w.now); }
    else q.card = cardId || q.card;
    q.last = w.now;
    return q;
  }
  function leave(w, cp, who) { const st = M(w).st[cp.id]; st.queue = st.queue.filter(e => e.who !== who); }
  // a decision about one person; by = 'player' or a guard's id
  function decide(w, cpId, who, decision, by, opt) {
    const cp = CPS[cpId], st = M(w).st[cpId], q = st.queue.find(e => e.who === who) || { who, card: null, since: w.now }, v = verdict(w, cp, who, q.card), x = personOf(w, who), now = w.now, P = by === 'player';
    opt = opt || {};
    leave(w, cp, who);
    const correct = decision === 'pass' ? v.valid : decision === 'deny' ? !v.valid : decision === 'detain' ? v.reasons.some(r => r === 'dclass' || r === 'foreign') : true;
    st.checks.push({ t: now, who, card: q.card, verdict: v.reasons, decision, correct, by, base: !!opt.base, asked: !!opt.asked });
    if (st.checks.length > 60) st.checks.shift();
    let text = '';
    if (decision === 'pass') {
      st.cleared[who] = now + 25; if (x && x.nextThink !== undefined) x.nextThink = Math.min(x.nextThink, 0.3);
      if (!q.card) { const d = w.fac.door(cp.door); if (d) d.open(d.autoClose); }
      if (!v.valid) M(w).breaches.push({ t: now, cp: cpId, who, reasons: v.reasons, by, audited: false });
      text = nameOf(w, who) + ' прошёл' + (x && x.female ? 'а' : '');
      if (x && x.say) x.say(w.rng.pick(['Спасибо.', 'Хорошей смены.', 'Благодарю.']), now);
    } else if (decision === 'deny' || decision === 'detain') {
      st.denied[who] = now + 30;
      if (decision === 'detain' && x && who !== 'player') {
        if (w.life) w.life.assign('detain', ['guard', 'security_officer'], { target: who, title: 'Задержание у ' + cp.name }, cp.name, 60, cp.inner, { npcOnly: true });
        if (w.life) w.life.openCase('security', 'Задержание на ' + cp.name + ': ' + nameOf(w, who), cp.inner, { cause: v.reasons[0] || 'none' }, true);
      }
      text = nameOf(w, who) + (decision === 'detain' ? ' задержан' : ': проход запрещён');
      if (v.valid) {
        // a colleague with every right to pass loses time and remembers it
        if (x && x.adjustRel) x.adjustRel(by === 'player' ? 'player' : by, decision === 'detain' ? -12 : -8);
        M(w).complaints.push({ t: now, cp: cpId, who, by, heavy: decision === 'detain' });
        if (x && x.say) x.say(decision === 'detain' ? 'Вы с ума сошли?! Я тут работаю!' : w.rng.pick(['Да вы что? У меня работа там!', 'Я доложу начальнику смены.', 'Ну спасибо. Пойду объясняться.']), now);
        if (x && x.job && x.job.id) { x.job.blockedUntil = now + 30; }
        if (P) { const mine = M(w).complaints.filter(c => c.by === 'player' && now - c.t < 480); if (mine.length >= 2 || decision === 'detain') { w.player.reprimands = (w.player.reprimands || 0) + 1; w.player.addRep('security', -6); w.notify.push({ time: now, type: EV.Discipline, severity: 1, text: 'Начальник смены: жалобы на ' + cp.name + ' (' + mine.length + ') — замечание.' }); } }
      } else {
        if (P) w.player.addRep('security', 2);
        if (v.reasons.indexOf('swap') >= 0) unswap(w, who, 'на ' + cp.name);
        if (x && x.say) x.say(v.reasons.indexOf('swap') >= 0 ? 'Ой… это же карта соседа. Перепутали утром.' : v.reasons.indexOf('no_zone') >= 0 ? 'Ладно, понял. Без заявки нельзя.' : 'Понял…', now);
        if (x && x.cpVisit) { x.cpVisit = null; const pt = w.tasks.list.find(t => t.status === 'Active' && t.who === x.id && t.personal); if (pt) w.tasks.fail(w, pt, 'не пропустили'); }
      }
      if (x && who !== 'player') { x.nextThink = 0; if (x.agent) x.agent.clear(); }
    } else if (decision === 'officer') {
      st.denied[who] = 0; st.cleared[who] = 0;
      const off = w.life && w.life.assign('cp_assist', ['security_officer', 'shift_chief', 'guard'], { cp: cpId, target: who, title: 'Разобраться на ' + cp.name }, cp.name, 40, cp.inner, { npcOnly: true });
      st.queue.unshift(Object.assign(q, { held: true, officer: off ? off.who : null }));
      text = off ? 'Вызван ' + nameOf(w, off.who) : 'Свободного офицера нет';
    }
    if (P && w.tasks) { const t = w.tasks.activeFor('player').find(t => t.kind === 'pass_control' && t.data && t.data.cp === cpId); if (t && S.TaskDirector) S.TaskDirector.log(w, t, text); }
    return text;
  }
  // mixed up cards go back to their owners
  function unswap(w, who, where) {
    const sw = M(w).swaps.find(s => !s.done && (s.a === who || s.b === who)); if (!sw) return;
    const a = w.npc(sw.a), b = w.npc(sw.b); sw.done = true;
    if (a && b) { const ca = w.card(sw.ca), cb = w.card(sw.cb); a.cardId = sw.ca; b.cardId = sw.cb; if (ca) ca.holder = a.id; if (cb) cb.holder = b.id; }
    if (w.life) w.life.decide('Перепутанные карты', [nameOf(w, sw.a) + ' ↔ ' + nameOf(w, sw.b), 'выявлено ' + where], 'Карты возвращены владельцам', 'служба безопасности');
  }
  // an NPC guard checks the player
  function npcChecksPlayer(w, cp, st, cardId) {
    const g = w.npc(st.by), v = verdict(w, cp, 'player', cardId), now = w.now;
    if (st.cleared.player > now) return null;
    if (v.reasons.indexOf('foreign') >= 0) {
      const c = w.card(cardId); if (c) { w.player.cards = w.player.cards.filter(id => id !== c.id); c.holder = c.owner; }
      st.denied.player = now + 20; w.player.addRep('security', -8); w.player.reprimands = (w.player.reprimands || 0) + 1;
      if (g) g.say('Это не ваша карта. Изымаю. Рапорт будет у начальника смены.', now);
      w.notify.push({ time: now, type: EV.Discipline, severity: 2, text: cp.name + ': ' + (g ? g.displayName : 'охрана') + ' изъял чужую карту ' + (c ? c.ownerName : '') + '. Замечание в личное дело.' });
      return S.R.DGuard;
    }
    if (!v.valid) { st.denied.player = now + 15; if (g) g.say('Вам туда не нужно. Без задания не пропущу.', now); w.notify.push({ time: now, type: 'Personnel', severity: 1, text: cp.name + ': ' + (g ? g.displayName : 'охрана') + ' не пропустил — ' + v.reasons.map(r => REASON[r]).join(', ') + '.' }); return S.R.DGuard; }
    st.cleared.player = now + 25; if (g) g.say(w.rng.pick(['Проходите.', 'Всё в порядке, проходите.']), now);
    return null;
  }

  // ---------------------------------------------------------------- NPC guards on the post
  function skill(g) { return clamp(0.55 + 0.4 * ((g.traits && g.traits.diligence) || 0.5) * (g.psy ? clamp(1 - g.psy.fatigue / 160, 0.3, 1) : 1), 0.3, 0.97); }
  function npcGuard(w, g, cpId, gm) {
    const cp = CPS[cpId], st = M(w).st[cpId];
    if (st.by && st.by !== g.id && (st.by === 'player' ? manned(w, cp) : w.now - st.seen < 1)) return;   // somebody already holds the post (the player first)
    st.by = g.id; st.seen = w.now;
    const q = st.queue.find(e => !e.held); if (!q) return;
    q.work = (q.work || 0) + gm; if (q.work < 1.2 + (q.card ? 0 : 1)) return;
    const v = verdict(w, cp, q.who, q.card), sk = skill(g), base = w.rng.chance((g.traits && g.traits.diligence) || 0.5);
    let caught = v.reasons.filter(r => SEEN[r] === true || (SEEN[r] === 'face' && w.rng.chance(sk)) || (SEEN[r] === 'purpose' && w.rng.chance(sk * 0.9)) || (SEEN[r] === 'base' && base));
    decide(w, cpId, q.who, caught.length ? 'deny' : 'pass', g.id, { base });
    if (caught.length) g.say(caught.indexOf('swap') >= 0 ? 'На фото не вы. Чья карта?' : caught.indexOf('no_zone') >= 0 ? 'Без задания в крыло не пускаю.' : 'Не могу пропустить: ' + REASON[caught[0]] + '.', w.now);
  }

  // ---------------------------------------------------------------- tick: posts on peak hours, people who give up waiting, audits, special cases
  function tick(w, dt) {
    const m = M(w); m.t -= dt; if (m.t > 0) return; m.t = 2;
    const now = w.now, mod = ((now % 1440) + 1440) % 1440;
    for (const id in CPS) {
      const cp = CPS[id], st = m.st[id], on = manned(w, cp);
      if (!on && st.by && st.by !== 'player' && w.now - st.seen > 3) st.by = null;
      // people in line who were not dealt with: complaints, and they look for another way
      for (const q of st.queue.slice()) {
        const x = personOf(w, q.who);
        if (!x || x.dead || now - (q.last || q.since) > 6) { leave(w, cp, q.who); continue; }
        const patience = (q.held ? 40 : 18) + 14 * ((x.traits && x.traits.diligence) || 0.5) - ((x.job && (x.job.prio || 0) >= 4) ? 8 : 0);
        if (now - q.since > patience) {
          leave(w, cp, q.who); st.denied[q.who] = now + 20;
          if (x.say) x.say(w.rng.pick(['Сколько можно стоять?!', 'Пост «' + cp.name + '» держит нас уже полчаса.', 'Ладно, обойду.']), now);
          m.complaints.push({ t: now, cp: id, who: q.who, by: st.by, wait: true });
          if (st.by && x.adjustRel) x.adjustRel(st.by, -3);
          if (x.job && x.job.id) x.job.blockedUntil = now + 20;
          if (st.by === 'player') w.notify.push({ time: now, type: 'Personnel', severity: 1, radio: true, text: 'Рация: ' + nameOf(w, q.who) + ' ушёл с ' + cp.name + ', не дождавшись проверки.' });
        }
      }
      if (!on) { if (st.queue.length) st.queue = st.queue.filter(q => q.held); }
      // the post is staffed at peak hours (an order from the shift chief)
      const peak = PEAK.some(([a, b]) => mod >= a && mod < b);
      if (peak && !on && !w.tasks.list.some(t => t.kind === 'pass_control' && t.status === 'Active' && t.data && t.data.cp === id) && w.life && w.rng.chance(0.25)) {
        w.life.assign('pass_control', ['guard'], { cp: id, mins: 45 }, 'Начальник смены', 110, cp.inner, { prio: 3 });
      }
      // special cases while the player holds the post: a real mix-up in the world, at most two per watch
      if (st.by === 'player' && on && st.special < 2 && now - (st.lastSpecial || 0) > 12 && w.rng.chance(0.06)) { if (makeCase(w, cp)) { st.special++; st.lastSpecial = now; } }
    }
    // the player slipping through an open door past an NPC guard
    { const p = w.player, pr = m.playerRoom; m.playerRoom = p.roomId;
      for (const id in CPS) { const cp = CPS[id], st = m.st[id]; if (pr === cp.side && p.roomId === cp.inner && st.by && st.by !== 'player' && manned(w, cp) && !(st.cleared.player > now) && !exempt(w, 'player')) { const g = w.npc(st.by); if (g) g.say('Стой! Пропуск! Назад!', now); st.denied.player = now + 10; p.addRep('security', -3); w.notify.push({ time: now, type: EV.Discipline, severity: 1, text: cp.name + ': вы прошли мимо поста без проверки — нарушение пропускного режима.' }); } } }
    // access audit: the security officer goes through the access log and finds who was let in without grounds
    if (now >= m.nextAudit) {
      m.nextAudit = now + 60;
      for (const b of m.breaches) {
        if (b.audited || now - b.t < 25 || !w.rng.chance(0.6)) continue; b.audited = true;
        const what = nameOf(w, b.who) + ' (' + b.reasons.map(r => REASON[r]).join(', ') + ')';
        if (b.by === 'player') { w.player.addRep('security', -5); w.player.addJournal('[' + fmtStamp(now) + '] Разбор журнала доступа: пропустил ' + what + ' на ' + cpName(b.cp) + '.'); w.notify.push({ time: now, type: EV.Discipline, severity: 1, text: 'Проверка журнала доступа: на ' + cpName(b.cp) + ' пропущен ' + what + '. Замечание.' }); w.player.reprimands = (w.player.reprimands || 0) + (m.breaches.filter(x => x.by === 'player' && x.audited && now - x.t < 600).length >= 2 ? 1 : 0); }
        else { const g = w.npc(b.by); if (g) { g.adjustRel && 0; g.history && g.history.push({ t: now, text: 'Замечание: на ' + cpName(b.cp) + ' пропустил ' + what }); } }
        if (w.life) w.life.decide('Нарушение пропускного режима', [cpName(b.cp), what, 'на посту: ' + nameOf(w, b.by)], 'Замечание дежурному, проверка допуска', 'служба безопасности');
        if (b.reasons.indexOf('swap') >= 0) unswap(w, b.who, 'по журналу доступа');
      }
      m.breaches = m.breaches.filter(b => !b.audited || now - b.t < 1440);
      m.complaints = m.complaints.filter(c => now - c.t < 1440);
      // forgotten mix-ups are sorted out at night
      if (mod >= 180 && mod < 240) for (const s of m.swaps) if (!s.done) unswap(w, s.a, 'при ночной сверке');
      m.swaps = m.swaps.filter(s => !s.done || now - s.t < 1440);
    }
  }
  // a real mix-up: room-mates swap cards; or a person heads into the wing on a personal errand
  function makeCase(w, cp) {
    const near = n => !n.dead && n.role !== 'DClass' && n.onSite && !n.incap(w.now) && n.agent.roomId && !inZone(w, cp, n.agent.roomId) && n.dept !== 'security' && n.dept !== 'mtf' && w.fac.roomDistance(n.agent.roomId, cp.side) <= 4;
    const heading = w.active.filter(n => near(n) && cp.depts.indexOf(n.dept) >= 0 && n.targetRoom && inZone(w, cp, n.targetRoom));
    const idle = w.active.filter(n => near(n) && cp.depts.indexOf(n.dept) < 0 && !(n.job && n.job.id) && S.People.block(w, n).activity === 'Duty');
    const swap = heading.length && !M(w).swaps.some(s => !s.done) && (!idle.length || w.rng.chance(0.5));   // one mix-up at a time
    const n = swap ? w.rng.pick(heading) : idle.length ? w.rng.pick(idle) : null; if (!n) return false;
    if (swap) {
      const mate = w.npcs.find(o => o !== n && !o.dead && o.homeRoom && o.homeRoom === n.homeRoom && o.cardId && w.card(o.cardId) && w.card(o.cardId).holder === o.id) || w.npcs.find(o => o !== n && !o.dead && o.dept === n.dept && o.cardId && w.card(o.cardId) && w.card(o.cardId).holder === o.id);
      const ca = w.card(n.cardId); if (!mate || !ca || ca.holder !== n.id) return false;
      const cb = w.card(mate.cardId); M(w).swaps.push({ t: w.now, a: n.id, b: mate.id, ca: ca.id, cb: cb.id, done: false });
      n.cardId = cb.id; mate.cardId = ca.id; cb.holder = n.id; ca.holder = mate.id;
    } else {
      if (cp.depts.indexOf(n.dept) >= 0) return false;
      const room = w.rng.pick(w.fac.roomList.filter(r => inZone(w, cp, r.id) && (r.type === 'Office' || r.type === 'Laboratory' || r.type === 'Corridor' || r.type === 'Meeting') && w.fac.roomDistance(r.id, cp.inner) <= 2));
      if (!room) return false;
      const why = w.rng.pick([['занести знакомому обед', 'Мне на минутку — занесу обед знакомому.'], ['вернуть книгу коллеге', 'Книгу вернуть надо, коллега просил.'], ['посмотреть на объект', 'Говорят, там можно посмотреть на объект… я быстро.'], ['поговорить с другом', 'Мне к другу, в лабораторию. На пять минут.']]);
      if (!errand(w, n, room.id, why)) return false;
    }
    return true;
  }

  // a personal errand: the person really walks there (a task of their own, which is no grounds to pass a checkpoint)
  function errand(w, n, roomId, why) {
    why = why || ['поговорить с другом', 'Мне к другу. На пять минут.'];
    const job = S.Jobs.build(w, 'visit', n, { room: roomId, label: why[0], title: 'Личное дело' }); if (!job) return false;
    n.cpVisit = { until: w.now + 90, text: 'личное: ' + why[0], say: why[1], room: roomId };
    w.tasks.issue(w, Object.assign(job, { who: n.id, by: n.displayName, personal: true, prio: 2, deadline: w.now + 90, src: 'staff', reason: 'личное дело', initiator: n.displayName }));
    return true;
  }
  // ---------------------------------------------------------------- «Стоять, документы!»: a person met on the way
  function zoneFor(w, roomId) { for (const id in CPS) if (inZone(w, CPS[id], roomId)) return CPS[id]; return { id: 'street', name: 'проверка на месте', depts: Object.keys(S.Professions.DEPTS).filter(d => d !== 'dclass'), what: 'общие помещения', sector: '—', level: -99 }; }
  const cardOf = (w, n) => { const c = n && w.card(n.cardId); return c && c.holder === n.id ? c.id : null; };
  function streetVerdict(w, who) { const n = w.npc(who); return n ? verdict(w, zoneFor(w, n.agent.roomId), who, cardOf(w, n)) : null; }
  function street(w, who, decision, by) {
    const n = w.npc(who); if (!n) return '';
    const zone = zoneFor(w, n.agent.roomId), v = verdict(w, zone, who, cardOf(w, n)), now = w.now, P = by === 'player';
    n.heldUntil = 0;
    const correct = decision === 'ok' ? v.valid : decision === 'out' ? !v.valid && v.reasons.indexOf('dclass') < 0 : decision === 'detain' ? v.reasons.indexOf('dclass') >= 0 : true;
    M(w).checks = (M(w).checks || []); M(w).checks.push({ t: now, who, decision, correct, by, reasons: v.reasons, room: n.agent.roomId }); if (M(w).checks.length > 80) M(w).checks.shift();
    let text = '';
    if (decision === 'ok') { text = n.displayName + ': документы в порядке'; n.say('Спасибо. Можно идти?', now); if (!v.valid) M(w).breaches.push({ t: now, cp: zone.id, who, reasons: v.reasons, by, audited: false }); }
    else if (decision === 'out') {
      text = n.displayName + ' выпровожен' + (n.female ? 'а' : '') + ' из «' + w.roomName(n.agent.roomId) + '»';
      if (n.cpVisit) { n.cpVisit = null; const pt = w.tasks.list.find(t => t.status === 'Active' && t.who === n.id && t.personal); if (pt) w.tasks.fail(w, pt, 'выпровожен'); } n.nextThink = 0; n.agent.clear();
      if (v.reasons.indexOf('swap') >= 0) unswap(w, who, 'при проверке на месте');
      if (v.valid) { n.adjustRel && n.adjustRel(P ? 'player' : by, -8); M(w).complaints.push({ t: now, cp: zone.id, who, by }); n.say('Я здесь работаю! Это недоразумение.', now); if (n.job && n.job.id) n.job.blockedUntil = now + 20; }
      else { n.say(v.reasons.indexOf('no_zone') >= 0 ? 'Да я на минутку… Ладно, ухожу.' : 'Понял, иду.', now); if (P) w.player.addRep('security', 2); }
    } else if (decision === 'detain') {
      text = n.displayName + ' задержан' + (n.female ? 'а' : '');
      if (w.life) { w.life.assign(n.role === 'DClass' ? 'return_d' : 'detain', ['guard', 'security_officer', 'patrol'], n.role === 'DClass' ? { dclass: who, target: who } : { target: who, title: 'Задержание: ' + n.shortName }, 'Охрана', 60, n.agent.roomId, { npcOnly: true }); w.life.openCase('security', 'Задержание: ' + n.displayName, n.agent.roomId, { cause: v.reasons[0] || 'none' }, true); }
      if (!correct) { n.adjustRel && n.adjustRel(P ? 'player' : by, -12); M(w).complaints.push({ t: now, cp: zone.id, who, by, heavy: true }); if (P) { w.player.reprimands = (w.player.reprimands || 0) + 1; w.player.addRep('security', -6); w.notify.push({ time: now, type: EV.Discipline, severity: 1, text: 'Необоснованное задержание ' + n.displayName + ': замечание.' }); } }
    }
    return text;
  }
  const cpName = id => CPS[id] ? CPS[id].name : 'проверка на месте';

  // ---------------------------------------------------------------- save
  function save(w) { const m = M(w); return { st: m.st, b: m.breaches, c: m.complaints, s: m.swaps, na: m.nextAudit }; }
  function load(w, o) { if (!o) return; const m = M(w); m.st = Object.assign(m.st, o.st || {}); m.breaches = o.b || []; m.complaints = o.c || []; m.swaps = o.s || []; m.nextAudit = o.na || 0; M(w); }
  function stats(w, cpId, since, by) { const c = M(w).st[cpId].checks.filter(x => x.t >= since && x.by === by); return { n: c.length, pass: c.filter(x => x.decision === 'pass').length, deny: c.filter(x => x.decision !== 'pass').length, badPass: c.filter(x => x.decision === 'pass' && !x.correct).length, badDeny: c.filter(x => x.decision !== 'pass' && x.decision !== 'officer' && !x.correct).length }; }
  S.CP = { needsCheck, exempt, errand, zoneFor, streetVerdict, street, cpName, cardOf, CPS, REASON, looks, M, manned, inZone, purpose, verdict, baseCheck, answer, gate, enqueue, leave, decide, npcGuard, tick, makeCase, unswap, save, load, stats, cpOfDoor };
})(typeof window !== 'undefined' ? window : globalThis);
