/* SCP LIFE — GAMEPLAY: «Барак», life in the class D block. The block has a mood (discontent 0–100) that grows from
   deaths and injuries of prisoners, forced tests, hunger and punishments, and falls with calm days, the ethics
   inspector's talks and answered petitions. Thresholds change behaviour: murmur (slower work), a petition carried to the
   guard post, a sit-down strike, and rarely — with a trigger — a riot (handled by the guards' rules of engagement) or an
   escape attempt. A player who is class D has a day of their own: roll call, rations, a work quota (a sorting
   mini-game), trading allowed items, provocations by other prisoners, complaints to the guard, and being called to a
   test: a guard comes, the player follows — or refuses, or runs. Respect among prisoners (dstanding) and the guards'
   favour (rep.dclass) pull in different directions. */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, EV, fmtTime, fmtStamp, Hm } = S;

  const ITEMS = { bread: 'хлеб', cig: 'сигареты', soap: 'мыло', letter: 'письмо из дома', choc: 'шоколад', pills: 'таблетки от головы' };
  const VALUE = { bread: 1, soap: 1, cig: 2, letter: 2, choc: 3, pills: 3 };
  const HALLS = ['dhall', 'd3hall'];
  const STAGES = [[0, 'спокойно'], [40, 'ропот'], [60, 'петиция'], [75, 'забастовка'], [90, 'на грани бунта']];

  function M(w) { if (!w.dblock) w.dblock = { halls: {}, t: 0, day: -1, ev: 0, offers: {}, log: [] }; return w.dblock; }
  function hall(w, id) { const m = M(w); if (!m.halls[id]) m.halls[id] = { discontent: 18, stage: 0, petition: null, strike: false, riotAt: -1e4, escapeAt: -1e4, calm: 0 }; return m.halls[id]; }
  const hallOf = (w, n) => (n === 'player' ? w.player.hallRoom : n.hallRoom) || 'dhall';
  const residents = (w, h) => w.active.filter(n => n.role === 'DClass' && !n.dead && !n.incap(w.now) && n.onSite && (n.hallRoom || 'dhall') === h);
  const stageOf = v => { let s = 0; for (let i = 0; i < STAGES.length; i++) if (v >= STAGES[i][0]) s = i; return s; };
  function log(w, h, text) { const m = M(w); m.log.push({ t: w.now, h, text }); if (m.log.length > 60) m.log.shift(); }
  function shiftMood(w, h, d, why) { const b = hall(w, h); b.discontent = clamp(b.discontent + d, 0, 100); if (Math.abs(d) >= 4) log(w, h, (d > 0 ? '+' : '') + Math.round(d) + ': ' + why); return b.discontent; }
  const guardAt = (w, room) => w.active.find(n => (n.prof === 'escort' || n.prof === 'guard' || n.prof === 'shift_chief') && !n.dead && n.onSite && (n.agent.roomId === room || (room && w.fac.roomDistance(n.agent.roomId, room) <= 1)));
  const isD = w => w.player.prof === 'dclass';

  // ---------------------------------------------------------------- the world tick: what moves the mood, what the mood does
  function tick(w, dt) {
    const m = M(w); m.t -= dt; if (m.t > 0) return; m.t = 4;                 // every 2 game minutes
    if (!m.seeded) { m.seeded = true; seedItems(w); }
    const now = w.now;
    // events since the last look: deaths and injuries of prisoners, refusals
    for (const e of w.events.recent) {
      if (e.id <= m.ev) continue;
      const v = e.target && w.npc(e.target);
      if (v && v.role === 'DClass') { if (e.type === EV.Death) shiftMood(w, hallOf(w, v), 12, 'гибель ' + v.callsign); else if (e.type === EV.Injury) shiftMood(w, hallOf(w, v), 4, 'травма ' + v.callsign); }
    }
    if (w.events.recent.length) m.ev = Math.max(m.ev, w.events.recent[w.events.recent.length - 1].id || 0);
    // the day: hunger, calm days
    if (m.day !== w.clock.day) { m.day = w.clock.day; for (const h of HALLS) { const b = hall(w, h); if ((w.food || 100) < 30) shiftMood(w, h, 8, 'урезанные пайки'); else if (b.calm >= 1) shiftMood(w, h, -4, 'спокойные сутки'); b.calm = 1; } }
    for (const h of HALLS) {
      if (!w.fac.room(h)) continue;
      const b = hall(w, h), was = b.stage; b.stage = stageOf(b.discontent);
      const ppl = residents(w, h); if (!ppl.length) continue;
      if (b.stage !== was) { log(w, h, 'настроение блока: ' + STAGES[b.stage][1]); if (b.stage > was && w.life) w.life.decide('Настроение блока «' + w.roomName(h) + '»', ['недовольство ' + Math.round(b.discontent), STAGES[b.stage][1]], b.stage >= 3 ? 'Усилить охрану, направить инспектора по этике' : 'Наблюдать', 'охрана блока D'); if (b.stage >= 2 && w.life) w.life.assign('d_interview', ['ethics_inspector', 'psychiatrist'], { dclass: ppl[0].id }, 'Охрана блока D', 240, h, { npcOnly: true }); }
      // murmur: grumbling at work; a petition; a strike; rarely a riot or an escape
      if (b.stage >= 1 && w.rng.chance(0.08)) { const n = w.rng.pick(ppl); n.say(w.rng.pick(['Сколько можно нас гонять…', 'Опять урезали пайку.', 'Вчера Сухова увели — и всё.', 'Нас тут за людей не считают.']), now); }
      if (b.stage >= 2 && !b.petition) {
        const lead = ppl.slice().sort((x, y) => ((y.traits.temper || 0) + (y.traits.sociability || 0)) - ((x.traits.temper || 0) + (x.traits.sociability || 0)))[0];
        b.petition = { t: now, by: lead.id, status: 'carried', signed: Math.min(ppl.length, 3 + w.rng.int(0, ppl.length)) };
        lead.say('Пишем бумагу. Кто подпишется — подходите.', now); log(w, h, lead.callsign + ' собирает подписи под петицией');
        if (w.life) w.life.addAgenda && w.life.addAgenda('d_petition', 'Петиция блока D (' + w.roomName(h) + ')', 'Требования: пайки, отдых, прекратить принудительные испытания. Подписей: ' + b.petition.signed, { hall: h });
      }
      if (b.petition && b.petition.status === 'carried' && now - b.petition.t > 60) answerPetition(w, h, w.rng.chance(0.55), 'администрация');
      b.strike = b.stage >= 3 && !(b.petition && b.petition.status === 'accepted');
      if (b.stage >= 4 && now - b.riotAt > 720 && w.rng.chance(0.04)) { if (w.rng.chance(0.6)) riot(w, h, ppl); else escape(w, h, ppl); }
      if (b.stage === 0) b.calm = 1; else if (b.stage >= 2) b.calm = 0;
    }
    // offers from other prisoners to the player (trade, provocation)
    if (isD(w) && !w.player.dead) approaches(w);
  }
  function answerPetition(w, h, yes, by) {
    const b = hall(w, h); if (!b.petition || b.petition.status !== 'carried') return;
    b.petition.status = yes ? 'accepted' : 'rejected'; b.petition.answeredBy = by;
    shiftMood(w, h, yes ? -30 : 10, yes ? 'петиция удовлетворена' : 'петиция отклонена');
    if (w.life) w.life.decide('Петиция блока D', [w.roomName(h), 'подписей: ' + b.petition.signed], yes ? 'Удовлетворить: доп. отдых, проверка пайков' : 'Отклонить', by);
    if (yes) w.food = Math.max(w.food || 100, 60);
    if (isD(w) && hallOf(w, 'player') === h) w.notify.push({ time: w.now, type: 'Personnel', severity: 1, text: 'Блок D: петиция ' + (yes ? 'удовлетворена — дадут лишний час отдыха.' : 'отклонена. В зале злые голоса.') });
  }
  function riot(w, h, ppl) {
    const b = hall(w, h); b.riotAt = w.now;
    const hot = ppl.filter(n => (n.traits.temper || 0.4) > 0.45).slice(0, 6); if (hot.length < 3) return false;
    for (const n of hot) { n.hostileUntil = w.now + 20; n.riotUntil = w.now + 20; n.say(w.rng.pick(['Хватит!', 'Бей их!', 'Двери! К дверям!']), w.now); }
    w.events.post({ time: w.now, type: EV.SuspiciousActivity, roomId: h, severity: 3, pub: true, text: 'Беспорядки в блоке D: «' + w.roomName(h) + '»' });
    shiftMood(w, h, -20, 'бунт подавлен'); setTimeout2(w, 240, () => shiftMood(w, h, 10, 'после подавления бунта'));
    log(w, h, 'бунт: ' + hot.map(n => n.callsign).join(', ')); return true;
  }
  function escape(w, h, ppl) {
    const b = hall(w, h); b.escapeAt = w.now; b.riotAt = w.now;
    const n = ppl.slice().sort((x, y) => (y.traits.temper || 0) - (x.traits.temper || 0))[0]; if (!n) return false;
    const out = w.rng.pick(['corr4w', 'corridor', 'galE'].filter(id => w.fac.room(id))); if (!out) return false;
    n.say('Сейчас или никогда…', w.now); n.escaping = { t: w.now, to: out };
    const job = S.Jobs.build(w, 'visit', n, { room: out, label: 'Побег' }); if (job) { n.routine = job; n.nextThink = 0; }
    log(w, h, n.callsign + ' пытается бежать'); return true;
  }
  // a delayed effect in game minutes (kept in the save as plain data)
  function setTimeout2(w, mins, fn) { (w.dblockLater || (w.dblockLater = [])).push({ at: w.now + mins, fn }); }
  function later(w) { const l = w.dblockLater; if (!l || !l.length) return; for (let i = l.length - 1; i >= 0; i--) if (l[i].at <= w.now) { const f = l[i].fn; l.splice(i, 1); try { f(); } catch (e) { /* stale */ } } }

  // ---------------------------------------------------------------- items
  function give(w, from, to, item) {
    const src = from === 'player' ? w.player : w.npc(from), dst = to === 'player' ? w.player : w.npc(to); if (!src || !dst) return false;
    const a = src.items || (src.items = []), i = a.indexOf(item); if (i < 0) return false; a.splice(i, 1); (dst.items || (dst.items = [])).push(item); return true;
  }
  const has = (x, item) => !!(x && (x.items || []).includes(item));
  function seedItems(w) { for (const n of w.npcs) if (n.role === 'DClass' && !n.items) { n.items = []; const k = w.rng.int(0, 3); for (let i = 0; i < k; i++) n.items.push(w.rng.pick(Object.keys(ITEMS))); } const p = w.player; if (isD(w) && !p.items) p.items = ['bread']; }

  // ---------------------------------------------------------------- other prisoners come to the player: trade or provocation
  function approaches(w) {
    const p = w.player, m = M(w), now = w.now; if (!p.roomId) return;
    const room = w.fac.room(p.roomId); if (!room || (room.type !== 'DClassCommon' && room.type !== 'DClassCell' && room.type !== 'Canteen')) return;
    if (m.offers.player && m.offers.player.until > now) return;
    if (now - (m.lastOffer || -1e4) < 25 || !w.rng.chance(0.1)) return;
    const near = w.active.filter(n => n.role === 'DClass' && !n.dead && n.onSite && n.agent.roomId === p.roomId && !n.escortedBy && !n.incap(now)); if (!near.length) return;
    const n = w.rng.pick(near), rel = n.rel ? (n.rel.player || 0) : 0, b = hall(w, hallOf(w, n));
    let offer;
    if (rel < -15 || ((n.traits.temper || 0.4) > 0.65 && b.stage >= 1 && w.rng.chance(0.4))) offer = { kind: 'provoke', from: n.id, text: w.rng.pick(['Чего уставился? Новенький, а уже стучишь охране?', 'Твоя пайка теперь моя. Возражения?', 'Говорят, ты вчера сдал Сухова. Правда?']) };
    else { const want = w.rng.pick(Object.keys(ITEMS).filter(k => !has(n, k))), give0 = (n.items || []).find(k => k !== want); if (!want || !give0) return; offer = { kind: 'trade', from: n.id, want, give: give0, text: 'Слышь, есть ' + ITEMS[give0] + '. Поменяю на ' + ITEMS[want] + '.' }; }
    offer.until = now + 8; m.offers.player = offer; m.lastOffer = now;
    n.say(offer.text, now); w.notify.push({ time: now, type: 'Personnel', severity: 1, text: n.callsign + ': «' + offer.text + '»' });
    n.heldUntil = now + 6;
  }
  // the player's answer to an offer
  function answer(w, choice) {
    const m = M(w), o = m.offers.player, p = w.player, now = w.now; if (!o || o.until < now) return 'никто ничего не предлагает';
    const n = w.npc(o.from); m.offers.player = null; if (!n) return '';
    n.heldUntil = 0;
    if (o.kind === 'trade') {
      if (choice === 'accept') { if (!has(p, o.want)) { n.say('Нет у тебя ничего. Не морочь голову.', now); n.adjustRel('player', -2); return 'у вас нет: ' + ITEMS[o.want]; } give(w, 'player', n.id, o.want); give(w, n.id, 'player', o.give); n.adjustRel('player', 6); p.dstanding = clamp((p.dstanding || 0) + 2, -100, 100); n.say('Честно. Держи.', now); return 'обмен: ' + ITEMS[o.want] + ' → ' + ITEMS[o.give]; }
      n.adjustRel('player', -2); n.say('Ну как знаешь.', now); return 'отказались от обмена';
    }
    // provocation
    if (choice === 'ignore') { p.psy.stress = clamp(p.psy.stress + 8, 0, 100); p.dstanding = clamp((p.dstanding || 0) - 3, -100, 100); n.say('Так и думал. Слабак.', now); return 'вы промолчали'; }
    if (choice === 'answer') { if (w.rng.chance(0.5 - ((n.traits.temper || 0.4) - 0.4))) { n.say('Ладно, ладно. Остынь.', now); n.adjustRel('player', 3); p.dstanding = clamp((p.dstanding || 0) + 5, -100, 100); return 'он отступил'; } n.say('Ах ты!..', now); S.Med.hurt(w, 'player', 12, 'blunt', n.id, n.callsign + ' ударил ' + p.name); n.hostileUntil = now + 5; p.dstanding = clamp((p.dstanding || 0) + 2, -100, 100); shiftMood(w, hallOf(w, 'player'), 2, 'драка'); return 'драка — охрана уже бежит'; }
    if (choice === 'hit') { S.Med.hurt(w, n.id, 14, 'blunt', 'player', p.name + ' ударил ' + n.callsign); p.dstanding = clamp((p.dstanding || 0) + 6, -100, 100); p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 8, 0, 100); p.hostileUntil = now + 6; shiftMood(w, hallOf(w, 'player'), 3, 'драка'); return 'вы ударили первым — охрана это видела'; }
    if (choice === 'report') { p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) + 5, 0, 100); if (w.rng.chance(0.5)) { p.dstanding = clamp((p.dstanding || 0) - 15, -100, 100); n.say('Стукач. Запомню.', now); n.adjustRel('player', -15); } if (w.life) w.life.assign('d_interview', ['escort', 'guard'], { dclass: n.id }, 'Охрана блока D', 60, n.agent.roomId, { npcOnly: true }); return 'вы доложили охране'; }
    return '';
  }
  // the player's part in the block's unrest
  function stance(w, choice) {
    const p = w.player, h = hallOf(w, 'player'), b = hall(w, h);
    if (choice === 'lead') { p.dstanding = clamp((p.dstanding || 0) + 12, -100, 100); p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 6, 0, 100); if (b.petition) b.petition.signed += 3; return 'вы понесли петицию на пост'; }
    if (choice === 'join') { p.dstanding = clamp((p.dstanding || 0) + 6, -100, 100); p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 3, 0, 100); if (b.petition) b.petition.signed++; return 'вы подписали петицию'; }
    if (choice === 'inform') { p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) + 8, 0, 100); p.dstanding = clamp((p.dstanding || 0) - (w.rng.chance(0.6) ? 20 : 5), -100, 100); shiftMood(w, h, -6, 'охрана узнала заранее'); return 'вы рассказали охране'; }
    return 'вы остались в стороне';
  }

  // ---------------------------------------------------------------- the sorting quota (mini-game data): bins and a stream of items
  const SORT = { bins: ['металл', 'пластик', 'ткань'], items: [['гайка', 0], ['болт', 0], ['пружина', 0], ['крышка', 1], ['трубка', 1], ['пакет', 1], ['ветошь', 2], ['перчатка', 2], ['лоскут', 2]] };
  function sortStream(w, n) { const out = []; for (let i = 0; i < (n || 10); i++) out.push(SORT.items[w.rng.int(0, SORT.items.length)]); return out; }
  function quota(w, correct, total) {
    const p = w.player, q = total ? correct / total : 0;
    p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) + (q >= 0.7 ? 3 : -4), 0, 100);
    if (q >= 0.9 && w.rng.chance(0.5)) { (p.items || (p.items = [])).push('cig'); return 'норма выполнена отлично — конвоир сунул пачку сигарет'; }
    if (q < 0.5) { p.lowQuota = (p.lowQuota || 0) + 1; if (p.lowQuota >= 3) { p.lowQuota = 0; p.limitLeisure = w.now + 600; return 'норма сорвана третий раз: свободное время отменено до вечера'; } return 'норма не выполнена — замечание конвоира'; }
    return 'норма выполнена (' + Math.round(q * 100) + '%)';
  }

  // ---------------------------------------------------------------- jobs for the player (and the guard who fetches them)
  const K = S.Jobs.K, st = (room, poiType, label, dur, extra) => Object.assign({ room, poiType: poiType || null, poi: null, label, dur: dur || 5, done: false }, extra || {});
  K('roll_call', { act: 'Confined', title: 'Поверка', build(w, who, o) { const p = w.player, eve = o.evening, room = eve ? (p.homeRoom || p.hallRoom || 'dhall') : (p.hallRoom || 'dhall'); return [st(room, eve ? 'CellBunk' : 'Stand', eve ? 'Стоять у своей койки' : 'Встать в строй в зале', 3, { need: 'stay:3' })]; }, done(w, who) { if (who === 'player') w.player.rep.dclass = clamp((w.player.rep.dclass == null ? 50 : w.player.rep.dclass) + 1, 0, 100); return 'на поверке'; }, fail(w, who) { if (who === 'player') { const p = w.player; p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 6, 0, 100); p.addJournal('[' + fmtStamp(w.now) + '] Опоздал на поверку — нарушение режима.'); } } });
  K('ration', { act: 'Eat', title: 'Пайка', build(w, who) { const p = w.player, mess = p.messRoom || p.hallRoom || 'dhall'; return [st(mess, 'FoodCounter', 'Получить пайку на раздаче', 2, { need: 'hold' })]; }, done(w, who) { if (who === 'player') { const p = w.player; (p.items || (p.items = [])).push('bread'); p.psy.stress = clamp(p.psy.stress - 6, 0, 100); p.fed = w.now; } return 'пайка получена'; } });
  K('labor_quota', { act: 'Labor', title: 'Трудовая норма', build(w, who) { const hall = who === 'player' ? (w.player.hallRoom || 'dhall') : who.hallRoom; return [st(hall, 'Workbench', 'Сортировка за верстаком', 3, { need: 'hold', sort: true })]; }, outcome(w, who, t) { return t.data.q == null ? 'success' : t.data.q >= 0.7 ? 'success' : t.data.q >= 0.5 ? 'partial' : 'failure'; }, done(w, who, t) { return t.data.note || 'смена отработана'; } });
  K('petition_guard', { act: 'Talk', title: 'Обращение к охране', build(w, who, o) { const post = w.fac.room('postD') ? 'postD' : (w.player.hallRoom || 'dhall'); return [st(post, null, 'Подойти к посту охраны', 1, { need: 'petition' })]; }, done: () => 'обращение передано' });
  // a guard fetches the player for a test; the player follows, refuses or runs
  K('fetch_player', { act: 'Escort', title: 'Конвой заключённого', build(w, who, o) { const p = w.player; return [st(p.roomId || 'dhall', null, 'Забрать ' + p.name, 1, { pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, fetch: true }), st(o.to || 'dtest', 'Stand', 'Довести до «' + w.roomName(o.to || 'dtest') + '»', 40, { wait: true })]; },
    tickStep(w, n, t, s) {
      const p = w.player;
      if (s.fetch && !s.told) { s.told = true; n.say('Заключённый ' + p.name + ', на выход. Испытание. За мной.', w.now); const tk = w.life.issue('d_test_follow', 'player', { guard: n.id, to: t.data.to || 'dtest', exp: t.data.exp }, n.displayName, 60, { prio: 5, channel: 'person', reason: 'конвоир пришёл за вами' }); t.data.ptask = tk && tk.id; s.dur = 0; return; }
      if (s.wait) { if (p.roomId === s.room) { if (!s.inRoom) { s.inRoom = w.now; n.say('Стоять тут. Не двигаться.', w.now); } if (w.now - s.inRoom > 12) s.dur = 0; else n.dwell = 0; } else { n.dwell = Math.min(n.dwell, s.dur - 1); const pt = w.tasks.get(t.data.ptask); if (!pt || pt.status !== 'Active') s.dur = 0; } }
    },
    done: () => 'испытуемый доставлен' });
  K('d_test_follow', { act: 'Escorted', title: 'Вызов на испытание', build(w, who, o) { return [st(o.to || 'dtest', null, 'Идти за конвоиром', 1, { need: 'follow:' + o.guard, guard: o.guard }), st(o.to || 'dtest', 'Stand', 'Стоять на месте испытуемого', 6, { need: 'stay:6' })]; },
    done(w, who, t) { const p = w.player; p.testsDone = (p.testsDone || 0) + 1; p.psy.fear = clamp(p.psy.fear + 15, 0, 100); return 'испытание закончилось — вас отводят обратно'; },
    fail(w, who, t) { const p = w.player; if (/отказ/.test(t.note || '')) { p.dstanding = clamp((p.dstanding || 0) + 5, -100, 100); p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 5, 0, 100); if (w.life) w.life.decide('Отказ испытуемого', [p.name, 'испытание «' + (t.data.exp || '—') + '»'], w.rng.chance(0.5) ? 'Заменить испытуемого' : 'Перенести испытание', 'комитет по этике'); } else if (/сбежал|отстал/.test(t.note || '')) { p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) - 12, 0, 100); w.events.post({ time: w.now, type: EV.SuspiciousActivity, roomId: p.roomId, actor: 'player', severity: 2, text: 'Испытуемый ' + p.name + ' ушёл от конвоя' }); } } });

  // ---------------------------------------------------------------- situations for a class D player (the Task Director paces them)
  function situations() {
    const TD = S.TaskDirector; if (!TD || !TD.SIT) return;
    const R = ['dclass'], esc = w => w.active.find(n => (n.prof === 'escort' || n.prof === 'guard') && !n.dead && n.onSite);
    TD.SIT('D01', { name: 'Поверка', src: 'duty', roles: R, weight: 6, cool: 120, prio: 4,
      test(w) { const mod = w.clock.mod; const morning = mod >= Hm(6, 50) && mod < Hm(7, 5), eve = mod >= Hm(21, 38) && mod < Hm(21, 50); return morning || eve ? { evening: eve, site: w.player.hallRoom } : null; },
      make(w, c) { const g = esc(w); return { kind: 'roll_call', opts: { evening: c.evening }, reason: c.evening ? 'вечерняя поверка у коек' : 'утреннее построение в зале', initiator: g ? g.displayName : 'Охрана блока D', from: g && g.id, channel: 'chief', prio: 4, deadline: c.evening ? 12 : 14 }; } });
    TD.SIT('D02', { name: 'Пайка', src: 'duty', roles: R, weight: 4, cool: 200, prio: 3,
      test(w) { const mod = w.clock.mod; const meal = (mod >= Hm(7) && mod < Hm(7, 30)) || (mod >= Hm(12) && mod < Hm(12, 30)) || (mod >= Hm(18, 30) && mod < Hm(19)); return meal && w.now - (w.player.fed || -1e4) > 200 ? { site: w.player.messRoom || w.player.hallRoom } : null; },
      make(w) { return { kind: 'ration', opts: {}, reason: 'раздача пайков', initiator: 'Раздача', channel: 'chief', prio: 3, deadline: 35 }; } });
    TD.SIT('D03', { name: 'Трудовая норма', src: 'duty', roles: R, weight: 4, cool: 20, prio: 2,
      test(w) { const mod = w.clock.mod; return ((mod >= Hm(7, 40) && mod < Hm(12)) || (mod >= Hm(12, 40) && mod < Hm(17))) ? { site: w.player.hallRoom } : null; },
      make(w) { const g = esc(w); return { kind: 'labor_quota', opts: {}, reason: 'норма на смену: рассортировать партию', initiator: g ? g.displayName : 'Конвоир', from: g && g.id, channel: 'chief', prio: 2, deadline: 60 }; } });
    TD.SIT('D05', { name: 'Жалоба охране', src: 'request', roles: R, weight: 2, cool: 240, prio: 2,
      test(w) { const p = w.player; const why = p.health < 70 ? 'health' : p.psy.stress > 60 ? 'stress' : hall(w, hallOf(w, 'player')).stage >= 2 ? 'block' : null; return why ? { why, site: 'postD' } : null; },
      make(w, c) { return { kind: 'petition_guard', opts: { why: c.why }, reason: c.why === 'health' ? 'болит после вчерашнего — можно попросить врача' : c.why === 'stress' ? 'не спится, нервы — можно попросить разговор с психиатром' : 'в блоке собирают подписи — можно передать требования', initiator: 'Вы сами', channel: 'none', prio: 2, deadline: 120 }; } });
    TD.SIT('D04', { name: 'Вызов на испытание', src: 'research', roles: R, weight: 3, cool: 360, prio: 5, danger: true,
      test(w) { const p = w.player, mod = w.clock.mod; if (mod < Hm(9) || mod > Hm(16, 30) || w.tasks.hasActive('fetch_player')) return null; const a = w.anomalies.find(x => x.arrived && x.contained && (x.def.exps || []).some(e => e.dclass)); return a && w.rng.chance(0.5) ? { a: a.id, site: a.obsRoom || 'dtest' } : null; },
      make(w, c) { const a = w.anomaly(c.a), ex = (a.def.exps || []).find(e => e.dclass), to = w.fac.room('dtest') ? 'dtest' : (a.obsRoom || 'dhall'); const g = w.life && w.life.issue && w.active.find(n => (n.prof === 'escort' || n.prof === 'guard') && !n.dead && n.onSite && !n.job); if (!g) return null; w.life.issue('fetch_player', g.id, { to, exp: ex && ex.name, scp: a.id }, 'Научный отдел', 90, { prio: 4 }); return null; } });
  }

  // ---------------------------------------------------------------- the player's day: following the guard; leaving the block alone
  function playerTick(w) {
    const p = w.player; if (!isD(w) || p.dead) return;
    for (const t of w.tasks.activeFor('player')) { const s = t.steps[t.si], m = s && /^follow:(.+)/.exec(s.need || ''); if (!m) continue; const g = w.npc(m[1]); if (!g) { w.tasks.fail(w, t, 'конвоир пропал'); continue; }
      const d = V.distXZ(g.agent.pos, p.pos); if (p.roomId === s.room && d < 10) { s.away = 0; w.playerStepDone(t); continue; }
      if (d > 18) { s.away = (s.away || 0) + 0.5; if (s.away > 6) { w.tasks.fail(w, t, 'отстал от конвоя (сбежал)'); g.say('Испытуемый сбежал! Объявляю розыск.', w.now); } } else s.away = 0; }
  }
  // the player's choices at the post (petition) and to the guard (refusal)
  function petition(w, kind) {
    const p = w.player, h = hallOf(w, 'player'), m = w.playerStepFor(s => s.need === 'petition'); if (m) w.playerStepDone(m.t);
    if (kind === 'doctor') { if (w.life) w.life.assign('treat', S.Med.MEDICS, { patient: 'player', title: 'Осмотр заключённого ' + p.name }, 'Охрана блока D', 180, h, { npcOnly: true }); p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) + 1, 0, 100); return 'охранник записал: «к врачу после обеда»'; }
    if (kind === 'psych') { p.psy.stress = clamp(p.psy.stress - 10, 0, 100); return 'обещали разговор с психиатром — уже легче'; }
    if (kind === 'demands') { const b = hall(w, h); if (b.petition && b.petition.status === 'carried') { answerPetition(w, h, w.rng.chance(0.6), 'начальник смены'); return 'требования переданы начальнику смены'; } shiftMood(w, h, -3, 'выслушали жалобу'); return 'охранник выслушал и записал'; }
    if (kind === 'complain') { p.rep.dclass = clamp((p.rep.dclass == null ? 50 : p.rep.dclass) + 2, 0, 100); p.dstanding = clamp((p.dstanding || 0) - 6, -100, 100); return 'жалоба на соседа записана; в зале на вас косятся'; }
    return '';
  }
  function refuseTest(w) { const t = w.tasks.activeFor('player').find(x => x.kind === 'd_test_follow'); if (!t) return null; const g = w.npc(t.data.guard); if (g) g.say(w.rng.chance(0.5) ? 'Отказ? Ладно. Доложу — пусть комиссия решает.' : 'Не хочешь — не надо. Но это запишут.', w.now); w.tasks.fail(w, t, 'отказ испытуемого'); return 'вы отказались идти на испытание'; }

  function save(w) { const m = M(w); return { halls: m.halls, day: m.day, ev: m.ev, log: m.log }; }
  function load(w, o) { if (!o) return; const m = M(w); m.halls = o.halls || {}; m.day = o.day; m.ev = o.ev || 0; m.log = o.log || []; }
  S.DBlock = { ITEMS, VALUE, HALLS, STAGES, SORT, M, hall, hallOf, shiftMood, tick: (w, dt) => { tick(w, dt); later(w); playerTick(w); }, answerPetition, riot, escape, give, has, seedItems, answer, stance, sortStream, quota, petition, refuseTest, save, load };
  situations();
})(typeof window !== 'undefined' ? window : globalThis);
