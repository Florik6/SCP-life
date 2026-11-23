/* SCP LIFE — GAMEPLAY: the Task Director. Every task on the board carries who started it and why, where, which
   profession and access level it needs, priority, its steps, the tools, the participants, complications that can
   arise, what counts as success and as failure, the consequences and a log. Tasks come from duties, superiors,
   other staff, faults, research, class D, security, SCP behaviour, staff problems and AI OVERSEER proposals (checked
   against real mechanics). A task reaches the player by radio, terminal, the shift chief or an employee in person. */
(function (root) {
  'use strict';
  const S = root.SCP, { clamp, EV, fmtTime, fmtStamp } = S;

  const SOURCES = { duty: 'плановая обязанность', order: 'распоряжение начальства', request: 'заявка сотрудника', fault: 'техническая неисправность', research: 'исследовательская потребность', dclass: 'событие класса D', security: 'нарушение безопасности', scp: 'поведение объекта', staff: 'проблема персонала', overseer: 'предложение AI OVERSEER', medical: 'медицинский вызов', event: 'происшествие' };
  const CHANNELS = { radio: 'по рации', terminal: 'через терминал', chief: 'от начальника смены', person: 'лично от сотрудника' };
  // per kind: source, priority 1–5, tools, success / failure conditions; consequences are applied by consequence()
  const M = {
    patrol: { src: 'duty', prio: 2, tools: ['рация', 'фонарь'], ok: 'все контрольные точки отмечены', fail: 'точки пропущены или срок истёк' },
    long_patrol: { src: 'duty', prio: 2, tools: ['рация', 'фонарь'], ok: 'маршрут пройден', fail: 'маршрут не завершён' },
    camera_check: { src: 'duty', prio: 2, tools: ['пульт видеонаблюдения'], ok: 'камеры просмотрены, замечания записаны', fail: 'камеры не проверены' },
    post_duty: { src: 'duty', prio: 2, tools: ['рация'], ok: 'пост не оставлен без присмотра', fail: 'пост оставлен' },
    escort_d: { src: 'research', prio: 4, tools: ['наручники', 'рация', 'ключ-карта конвоя'], ok: 'испытуемый доставлен и возвращён', fail: 'испытуемый не доставлен, отказ или инцидент' },
    investigate: { src: 'security', prio: 3, tools: ['рация', 'фонарь'], ok: 'место осмотрено, вывод доложен', fail: 'сообщение не проверено' },
    scene_check: { src: 'security', prio: 4, tools: ['рация', 'фотофиксация'], ok: 'место зарегистрировано', fail: 'место не осмотрено' },
    detain: { src: 'security', prio: 4, tools: ['наручники', 'рация'], ok: 'задержанный в камере', fail: 'задержание сорвано' },
    repair: { src: 'fault', prio: 3, tools: ['набор инструментов', 'мультиметр'], ok: 'неисправность устранена и проверена', fail: 'неисправность осталась' },
    repair_door: { src: 'fault', prio: 3, tools: ['набор инструментов', 'запасной замок'], ok: 'замок работает', fail: 'замок не исправлен' },
    repair_camera: { src: 'fault', prio: 3, tools: ['модуль камеры', 'стремянка'], ok: 'камера пишет', fail: 'камера не работает' },
    calibrate_sensors: { src: 'duty', prio: 3, tools: ['калибратор', 'журнал датчиков'], ok: 'показания достоверны', fail: 'датчики не откалиброваны' },
    maintenance_round: { src: 'duty', prio: 2, tools: ['набор инструментов'], ok: 'щитки осмотрены', fail: 'обход не завершён' },
    power_check: { src: 'duty', prio: 3, tools: ['мультиметр'], ok: 'генератор проверен', fail: 'проверка не проведена' },
    observe_scp: { src: 'research', prio: 2, tools: ['журнал наблюдений'], ok: 'наблюдение записано', fail: 'наблюдение не проведено' },
    experiment: { src: 'research', prio: 4, tools: ['пульт испытаний', 'регистратор'], ok: 'эксперимент проведён, данные записаны', fail: 'эксперимент сорван' },
    write_report: { src: 'duty', prio: 2, tools: ['терминал'], ok: 'отчёт сдан', fail: 'отчёт не сдан' },
    first_aid: { src: 'medical', prio: 5, tools: ['аптечка'], ok: 'помощь оказана вовремя', fail: 'помощь не оказана' },
    transport_patient: { src: 'medical', prio: 4, tools: ['носилки'], ok: 'пациент доставлен', fail: 'пациент не доставлен' },
    treat: { src: 'duty', prio: 3, tools: ['аптечка', 'карты пациентов'], ok: 'приём проведён', fail: 'приём сорван' },
    surgery: { src: 'medical', prio: 5, tools: ['операционный набор'], ok: 'операция проведена', fail: 'операция не проведена' },
    body_recovery: { src: 'event', prio: 3, tools: ['носилки', 'мешок для тела'], ok: 'тело в морге', fail: 'тело не вынесено' },
    autopsy: { src: 'event', prio: 2, tools: ['секционный набор'], ok: 'заключение оформлено', fail: 'заключение не оформлено' },
    d_interview: { src: 'dclass', prio: 2, tools: [], ok: 'обращение выслушано', fail: 'обращение проигнорировано' },
    return_d: { src: 'dclass', prio: 3, tools: ['наручники'], ok: 'заключённый в блоке', fail: 'заключённый не возвращён' },
    labor: { src: 'duty', prio: 1, tools: [], ok: 'норма выполнена', fail: 'норма не выполнена' },
    d_test: { src: 'research', prio: 3, tools: [], ok: 'испытание пройдено', fail: 'испытание сорвано' },
    deliver: { src: 'request', prio: 2, tools: ['тележка'], ok: 'груз доставлен', fail: 'груз не доставлен' },
    stand_guard: { src: 'request', prio: 3, tools: ['рация'], ok: 'сопровождение обеспечено', fail: 'сопровождение не обеспечено' },
    pass_control: { src: 'order', prio: 3, tools: ['рация', 'терминал базы пропусков'], ok: 'пост не оставлен, нарушители не прошли', fail: 'пост оставлен или пропущены нарушители' },
    cp_assist: { src: 'security', prio: 3, tools: ['рация'], ok: 'спорный случай разобран', fail: 'разбор не проведён' },
    visit: { src: 'staff', prio: 2, tools: [], ok: 'дело сделано', fail: 'не вышло' }
  };
  const meta = kind => M[kind] || { src: 'duty', prio: 2, tools: [], ok: 'задание выполнено', fail: 'задание не выполнено' };
  // who asked, from the free-text "by" of older code paths
  function sourceOf(t) {
    const by = String(t.by || '');
    if (t.src) return t.src;
    if (/OVERSEER/.test(by)) return 'overseer';
    if (/Начальник|Руководитель|Директор|Командир|комитет/i.test(by)) return 'order';
    if (t.kind === 'repair' || t.kind === 'repair_door' || t.kind === 'repair_camera') return 'fault';
    return meta(t.kind).src;
  }
  // tasks can meet complications that really change their course; rolled once from the state of the world
  function complications(w, t) {
    const out = [], room = w.fac.room(t.room), danger = room && (room.type === 'Containment' || room.type === 'Observation' || room.style === 'heavy');
    const loose = w.anomalies.some(a => a.arrived && (!a.contained || a.breached));
    if (/repair/.test(t.kind) && danger) out.push({ id: 'escort', text: 'оборудование в опасной зоне — можно запросить сопровождение охраны' });
    if (/repair/.test(t.kind) && w.rng.chance(0.25)) out.push({ id: 'part', text: 'на месте может не оказаться нужной детали — придётся сходить на склад' });
    if ((t.kind === 'patrol' || t.kind === 'long_patrol') && w.rng.chance(0.3)) out.push({ id: 'noise', text: 'на маршруте возможна внеплановая проверка' });
    if (t.kind === 'escort_d') { const d = w.npc(t.data && t.data.dclass); if (d && d.psy.fear > 45) out.push({ id: 'fear', text: d.callsign + ' напуган — возможен отказ' }); }
    if (loose) out.push({ id: 'alert', text: 'в комплексе объект вне камеры — маршрут может измениться' });
    return out;
  }

  const TD = {
    SOURCES, CHANNELS, M, meta,
    // called by the task board right after a task gets its id
    enrich(w, t) {
      const m = meta(t.kind), P = S.Professions;
      t.src = sourceOf(t); t.reason = t.reason || (t.data && t.data.reason) || SOURCES[t.src];
      t.initiator = t.initiator || t.by || 'SCP LIFE';
      const who = t.who === 'player' ? w.player : w.npc(t.who);
      t.prof = t.prof || (who ? who.prof : null); t.access = t.access != null ? t.access : (who ? (t.who === 'player' ? w.player.level : who.level) : 1);
      t.prio = t.prio || m.prio; t.tools = t.tools || m.tools.slice(); t.cond = t.cond || { ok: m.ok, fail: m.fail };
      t.participants = t.participants || [t.who].concat(t.data && t.data.dclass ? [t.data.dclass] : [], t.data && t.data.patient ? [t.data.patient] : []);
      t.compl = t.compl || complications(w, t);
      t.channel = t.channel || (t.who !== 'player' ? null : t.src === 'order' ? 'chief' : t.src === 'request' || t.src === 'medical' ? 'person' : t.src === 'duty' ? 'terminal' : 'radio');
      t.log = t.log || [];
      TD.log(w, t, 'выдано: ' + t.initiator + ' — ' + t.reason + (t.channel ? ' (' + CHANNELS[t.channel] + ')' : ''));
      for (const c of t.compl) TD.log(w, t, 'возможное осложнение: ' + c.text);
      if (t.who === 'player') w.player.taskNews = { id: t.id, t: w.now };
      return t;
    },
    log(w, t, text) { (t.log || (t.log = [])).push({ t: w.now, text }); if (t.log.length > 30) t.log.shift(); },
    // consequences that change the world, not only text
    consequence(w, t, ok, note, result) {
      if (t.who === 'player') { const d = TD.D(w); d.lastDone = w.now; }
      const who = t.who === 'player' ? w.player : w.npc(t.who), init = typeof t.initiator === 'string' ? w.npcs.find(n => t.initiator.indexOf(n.last) >= 0 && n.last.length > 2) : null;
      TD.log(w, t, (result === 'partial' ? 'выполнено частично' : ok ? 'выполнено' : 'провалено') + (note ? ': ' + note : ''));
      if (init && who && init !== who && init.adjustRel) init.adjustRel(t.who === 'player' ? 'player' : who.id, result === 'partial' ? 2 : ok ? 6 : -8);
      if (t.who === 'player') { const p = w.player; p.career = p.career || []; p.career.push({ t: w.now, task: t.title, ok, result: result || (ok ? 'success' : 'failure'), by: t.initiator }); if (p.career.length > 200) p.career.shift(); }
      if (!ok && t.kind === 'escort_d' && w.life) { const r = (w.life.requests || []).find(q => q.task && q.dclass === (t.data && t.data.dclass)); if (r && r.status === 'scheduled') { r.status = 'approved'; r.task = null; } w.life.decide('Сорван конвой на испытание', [t.title, note || ''], 'Испытание перенесено, разбор у начальника смены', 'Начальник смены'); const ex = w.tasks.list.find(x => x.kind === 'experiment' && x.status === 'Active' && x.data && x.data.dclass === (t.data && t.data.dclass)); if (ex) w.tasks.fail(w, ex, 'испытуемый не доставлен'); }
      if (!ok && t.kind === 'first_aid') { const pt = w.npc(t.data && t.data.patient); if (pt && !pt.dead && w.life && !w.tasks.hasActive('first_aid', pt.id)) w.life.assign('first_aid', S.Med.MEDICS, { patient: pt.id, target: pt.id }, 'SCP LIFE: повторный вызов', 20, pt.agent.roomId, { npcOnly: true }); }
      if (ok && (t.kind === 'calibrate_sensors' || /repair/.test(t.kind))) { const r = w.fac.room(t.room); if (r) r.sensorsTrusted = w.now; }
    },
    // what the player's shift looks like: active tasks with their story
    brief(w, t) {
      const L = [t.title + ' · приоритет ' + t.prio, 'Кто: ' + t.initiator + ' · причина: ' + t.reason, 'Где: ' + w.roomName(t.room) + ' · допуск L' + t.access];
      if (t.tools && t.tools.length) L.push('Нужно: ' + t.tools.join(', '));
      L.push('Успех: ' + t.cond.ok + ' · провал: ' + t.cond.fail);
      for (const c of t.compl || []) L.push('Осложнение: ' + c.text);
      return L;
    }
  };
  // ================================================================ «Наряд»: situations from the state of the world, pacing, delivery, outcomes
  // A situation template: roles, weight, cooldown, test(w) → context or null, make(w, ctx) → the task. The player gets
  // work from what is really happening; NPCs keep getting theirs through SCP LIFE. Without the language model.
  const PACE = {
    calm: { name: 'спокойная', pause: 7, filler: 12, danger: 0.5, events: 0.6 },
    standard: { name: 'стандартная', pause: 2, filler: 4, danger: 1, events: 1 },
    tense: { name: 'напряжённая', pause: 1.5, filler: 4, danger: 1.6, events: 1.5 }
  };
  const FAM = {
    guard: ['guard', 'patrol', 'escort', 'security_officer', 'shift_chief'],
    tech: ['technician', 'electrician', 'mechanic', 'containment_engineer', 'sysadmin'],
    sci: ['scientist', 'senior_scientist', 'junior_researcher', 'lab_assistant', 'biologist', 'memetics', 'anomaly_psychologist', 'research_director'],
    d: ['dclass']
  };
  const FAULT_ROLES = { electrician: ['electrician', 'technician'], mechanic: ['mechanic', 'technician'], sysadmin: ['sysadmin', 'technician'], containment_engineer: ['containment_engineer', 'technician'], technician: ['technician', 'electrician', 'mechanic'] };
  const SITS = {};
  const SIT = (id, spec) => { SITS[id] = Object.assign({ id, weight: 1, cool: 20, prio: 2 }, spec); };
  function D(w) { if (!w.td) w.td = { cool: {}, recent: [], last: -1e4, lastDone: -1e4, brief: { day: -1, lines: [] }, cases: {}, nextCase: 1, pace: 'standard', t: 0, given: {} }; return w.td; }
  const onDuty = (w, profs) => w.active.filter(n => profs.indexOf(n.prof) >= 0 && !n.dead && !n.incap(w.now) && S.People.block(w, n).activity === 'Duty');
  const voice = (w, profs) => { const l = onDuty(w, profs); return l.length ? l[0] : null; };
  const chiefOf = (w, dept) => voice(w, { security: ['shift_chief', 'security_officer'], engineering: ['dept_head', 'technician'], science: ['research_director', 'senior_scientist'], medical: ['doctor', 'psychiatrist'], dclass: ['escort', 'shift_chief'] }[dept] || ['shift_chief']);
  const dispatcher = w => voice(w, ['dispatcher', 'cctv_operator', 'shift_chief']);

  // ---------------------------------------------------------------- investigations: go, look, compare clues, report a conclusion
  const CASES = {
    knock: { title: 'Стук в вентиляции', clues: {
        thermal: ['стук ритмичный, примерно раз в минуту', 'воздуховод тёплый на ощупь', 'в графике инженерной службы — цикл отопления'],
        quiet: ['на месте тихо, стука нет', 'в воздуховоде ничего необычного', 'двери и решётки закрыты'],
        anomaly: ['стук неровный, перемещается по воздуховоду', 'на решётке свежие царапины', 'по рации: объект вне камеры в этом секторе'] },
      options: [{ id: 'thermal', label: 'Тепловое расширение — без мер', ok: ['thermal'], meh: ['quiet'] }, { id: 'nothing', label: 'Ничего не обнаружено', ok: ['quiet'], meh: ['thermal'] }, { id: 'tech', label: 'Вызвать техника', meh: ['thermal', 'quiet'] }, { id: 'alarm', label: 'Поднять тревогу', ok: ['anomaly'] }] },
    radio: { title: 'Не отвечает рация', clues: {
        battery: ['сотрудник на месте, жив и здоров', 'рация молчит: индикатор батареи не горит', 'в журнале — нет зарядки со вчерашнего вечера'],
        asleep: ['сотрудник спит на посту', 'рация в порядке, громкость убавлена'],
        missing: ['на месте никого нет', 'последняя отметка — у служебного лифта', 'рация не отвечает и не пеленгуется'] },
      options: [{ id: 'battery', label: 'Заменить батарею, доложить', ok: ['battery'] }, { id: 'wake', label: 'Разбудить, сделать замечание', ok: ['asleep'] }, { id: 'search', label: 'Объявить поиск сотрудника', ok: ['missing'] }, { id: 'nothing', label: 'Всё в порядке — без мер', meh: ['battery', 'asleep'] }] },
    fakecall: { title: 'Вызов по рации', clues: {
        fake: ['на месте никого нет', 'сотрудник, который «вызывал», в это время был в другом конце комплекса (журнал доступа)', 'в радиожурнале нет исходящего с его рации'],
        real: ['сотрудник на месте, ждёт помощи', 'рядом сбоит дверь'] },
      options: [{ id: 'report', label: 'Ложный вызов — доложить несоответствие', ok: ['fake'] }, { id: 'nothing', label: 'Никого не нашёл — без мер', meh: ['fake'] }, { id: 'alarm', label: 'Поднять тревогу', ok: [] }, { id: 'help', label: 'Помочь на месте', ok: ['real'] }] },
    sensor: { title: 'Всплеск датчиков', clues: {
        sensor: ['показания скачут, а за стеклом объект неподвижен', 'соседний датчик спокоен', 'последняя калибровка — давно'],
        object: ['объект у стекла, движется', 'звук из камеры совпадает с показаниями', 'датчик откалиброван недавно'],
        noise: ['одиночный всплеск, дальше норма', 'за стеклом всё спокойно', 'в журнале — плановое включение оборудования рядом'] },
      options: [{ id: 'sensor', label: 'Неисправен датчик — заявка на ремонт', ok: ['sensor'] }, { id: 'object', label: 'Объект активен — усилить наблюдение', ok: ['object'], meh: [] }, { id: 'noise', label: 'Помеха — без мер', ok: ['noise'], meh: ['sensor'] }] },
    observe: { title: 'Наблюдение с выводом', clues: (w, c) => {
        const a = w.anomaly(c.scp); if (!a) return ['объект недоступен'];
        const t = a.truth ? a.truth(w) : { motion: 0, em: 0, sound: 0 }, L = [];
        L.push('датчики: движение ' + Math.round((t.motion || 0) * 100) + '%, ЭМ-фон ' + Math.round((t.em || 0) * 100) + '%, звук ' + Math.round((t.sound || 0) * 100) + '%');
        if (c.truth === 'agitated') L.push('объект беспокоен: ' + (a.status || 'ходит по камере, подходит к двери'), 'показатели выше вчерашних по журналу');
        else if (c.truth === 'new') { const p = a.props.find(x => x.id === c.prop); L.push('повторяющееся поведение, которого нет в досье: ' + (p ? p.text.charAt(0).toLowerCase() + p.text.slice(1) : '—'), 'повторилось трижды за время наблюдения'); }
        else L.push('поведение совпадает с описанием в досье', 'показатели в пределах обычного');
        return L; },
      options: [{ id: 'normal', label: 'По досье — запись в журнал', ok: ['normal'], meh: ['new'] }, { id: 'warn', label: 'Возбуждение — предупредить охрану', ok: ['agitated'], meh: ['new'] }, { id: 'new', label: 'Новое поведение — внести в досье', ok: ['new'] }] },
    panel: { title: 'Обход щитка с замером', clues: {
        latent: ['напряжение на вводе 204 В при норме 220', 'одна клемма нагрета до 68 °C', 'в журнале щитка — три срабатывания автомата за сутки'],
        ok: ['напряжение на вводе 221 В', 'нагрев клемм в норме, 31 °C', 'журнал щитка чистый'] },
      options: [{ id: 'ok', label: 'Норма — без замечаний', ok: ['ok'] }, { id: 'repair', label: 'Открыть заявку на ремонт', ok: ['latent'], meh: ['ok'] }, { id: 'shutdown', label: 'Отключить щиток до ремонта', meh: ['latent'] }] }
  };
  function newCase(w, type, truth, room, extra) { const d = D(w), id = 'K' + d.nextCase++; d.cases[id] = Object.assign({ id, type, truth, room, t: w.now, found: [], done: false }, extra || {}); return d.cases[id]; }
  // what the investigator finds on the spot
  function look(w, c) { const def = CASES[c.type]; c.found = (typeof def.clues === 'function' ? def.clues(w, c) : (def.clues[c.truth] || [])).slice(); return c.found; }
  // the conclusion and its consequences in the world
  function conclude(w, caseId, choice, who) {
    const c = D(w).cases[caseId], def = c && CASES[c.type]; if (!c || c.done) return { result: 'failure', text: '' };
    const o = def.options.find(x => x.id === choice) || def.options[0], P = who === 'player';
    const result = (o.ok || []).indexOf(c.truth) >= 0 ? 'success' : (o.meh || []).indexOf(c.truth) >= 0 ? 'partial' : 'failure';
    c.done = true; c.choice = choice; c.result = result; c.by = who;
    let text = o.label;
    const n = c.who ? w.npc(c.who) : null, a = c.scp ? w.anomaly(c.scp) : null;
    if (c.type === 'knock') {
      if (choice === 'thermal' && c.truth === 'thermal' && w.horror) w.horror.explain('knock', 'Стук — тепловое расширение воздуховодов при прогреве');
      if (choice === 'tech' && w.life) { w.life.assign('investigate', FAM.tech, { room: c.room, title: 'Проверить воздуховод' }, 'Охрана', 90, c.room, { npcOnly: true }); text += ': техник направлен'; }
      if (choice === 'alarm') { if (c.truth === 'anomaly' && a) w.alert.reportBreach(w, a, c.room, P ? w.player.name : 'охрана'); else { w.alert.raise && w.alert.raise(w, 1, 'проверка сообщения о стуке', c.room); if (w.life) w.life.decide('Ложная тревога', ['стук в воздуховоде «' + w.roomName(c.room) + '»'], 'Разбор у начальника смены', 'служба безопасности'); } }
    } else if (c.type === 'radio') {
      if (n && (choice === 'battery' || choice === 'wake')) { const r = w.infra.radios[n.id]; if (r) { r.bat = 100; r.ok = true; n.radioOk = true; } n.say(choice === 'wake' ? 'А?.. Я не сплю. Простите.' : 'Спасибо, а я и не заметил, что сел.', w.now); if (w.horror) w.horror.explain('radio', 'Рация молчала — села батарея', n.id); }
      if (choice === 'wake' && n && c.truth === 'asleep' && n.history) n.history.push({ t: w.now, text: 'Замечание: сон на посту' });
      if (choice === 'search' && w.life) w.life.openCase('missing', 'Не выходит на связь: ' + (n ? n.shortName : '—'), c.room, { cause: c.truth === 'missing' ? 'unknown' : 'false_report' }, true);
    } else if (c.type === 'fakecall') {
      if (choice === 'report' && w.life) { w.life.openCase('radio', 'Ложный вызов по рации от имени ' + (n ? n.shortName : 'коллеги'), c.room, { cause: c.truth === 'fake' ? 'anomalous' : 'unknown', scp: c.truth === 'fake' ? 'SCP-LF-135' : null }, true); if (a && a.st) a.st.reported = (a.st.reported || 0) + 1; }
      if (choice === 'alarm') { w.alert.raise && w.alert.raise(w, 1, 'вызов по рации', c.room); if (w.life) w.life.decide('Ложная тревога', ['вызов по рации — на месте никого'], 'Разбор у начальника смены', 'служба безопасности'); }
    } else if (c.type === 'observe' && a) {
      if (choice === 'new' && c.truth === 'new') { const pr = a.reveal(w, c.prop, who); if (pr) text += ': в досье внесено — ' + pr.text; }
      if (choice === 'new' && c.truth !== 'new') { a.falseNotes = (a.falseNotes || []).concat({ t: w.now, by: who, text: 'непроверенная запись о новом поведении' }); text += ': запись внесена (не подтверждена)'; }
      if (choice === 'warn') { if (w.life) w.life.assign('post_duty', ['guard', 'patrol'], { title: 'Пост у камеры ' + a.id }, 'Научный отдел', 60, a.obsRoom || a.containRoom, { npcOnly: true }); if (c.truth === 'agitated' && a.threat >= 60) w.alert.raise && w.alert.raise(w, 1, 'возбуждение ' + a.id, a.containRoom); }
      if (choice !== 'warn' && c.truth === 'agitated' && w.life) w.life.decide('Пропущено возбуждение объекта', [a.id, 'наблюдение: «' + o.label + '»'], 'Разбор в научном отделе', 'научный отдел');
      if (P) w.player.obsNotes = (w.player.obsNotes || []).concat({ scp: a.id, t: w.now, text: c.found.join('; ') }).slice(-10);
    } else if (c.type === 'panel') {
      const r = w.fac.room(c.room), hidden = w.infra.faults.filter(f => !f.fixed && !f.known && (f.site === c.room || (r && w.fac.room(f.site) && w.fac.room(f.site).sector === r.sector && w.fac.room(f.site).level === r.level)));
      if (choice === 'repair' || choice === 'shutdown') { for (const f of hidden) w.infra.discover(f, P ? 'player' : w.nameOf(who)); if (!hidden.length && w.life) w.life.decide('Лишняя заявка', ['щиток «' + w.roomName(c.room) + '» исправен'], 'Заявка закрыта без работ', 'инженерная служба'); }
      if (choice === 'shutdown') { w.infra.outages.push({ from: w.now, to: w.now + 30, rooms: [c.room], vent: false }); w.infra.addLog('Щиток «' + w.roomName(c.room) + '» отключён до ремонта (' + w.nameOf(who) + ')', 'planned'); }
      if (choice === 'ok' && hidden.length) c.missed = hidden.map(f => f.id);
    } else if (c.type === 'sensor') {
      if (choice === 'sensor') { const f = w.infra.faults.find(x => !x.fixed && x.kind === 'sensor' && x.obj === c.cell); if (f) w.infra.discover(f, P ? 'player' : w.nameOf(who)); else if (c.truth !== 'sensor' && w.life) { w.life.assign('calibrate_sensors', FAM.tech, { cells: [c.cell] }, 'Научный отдел', 180, c.room, { npcOnly: true }); text += ': заявка на калибровку (лишняя)'; } }
      if (choice === 'object' && a) { if (w.life) w.life.assign('observe_scp', FAM.sci, { target: a.id, title: 'Усиленное наблюдение ' + a.id }, 'Научный отдел', 120, c.room, { npcOnly: true }); if (c.truth === 'object' && a.threat >= 45) w.alert.raise && w.alert.raise(w, 1, 'активность ' + a.id, a.containRoom); }
      if (choice === 'noise' && c.truth === 'object' && a && w.life) w.life.decide('Пропущена активность объекта', [a.id, 'всплеск датчиков отнесён к помехам'], 'Разбор в научном отделе', 'научный отдел');
    }
    const line = def.title + ' («' + w.roomName(c.room) + '»): ' + text;
    if (w.life) w.life.decide('Доклад: ' + def.title, [w.roomName(c.room), 'вывод: ' + o.label, 'проверил: ' + w.nameOf(who)], result === 'success' ? 'Принято' : result === 'partial' ? 'Принято, без последствий' : 'Вывод не подтвердился', w.nameOf(who));
    return { result, text: line };
  }

  // ---------------------------------------------------------------- situations (M1)
  // guard: the checkpoint at peak hours
  SIT('G01', { name: 'Пик пропусков', src: 'duty', roles: FAM.guard.slice(0, 4), weight: 3, cool: 60, prio: 3,
    test(w) { if (!S.CP) return null; const mod = w.clock.mod; const peak = (mod >= 380 && mod < 570) || (mod >= 710 && mod < 880) || (mod >= 1050 && mod < 1180); if (!peak) return null; for (const id in S.CP.CPS) { const cp = S.CP.CPS[id]; if (!S.CP.manned(w, cp) && !w.tasks.list.some(t => t.kind === 'pass_control' && t.status === 'Active' && t.data && t.data.cp === id)) return { cp: id, site: cp.inner }; } return null; },
    make(w, c) { const cp = S.CP.CPS[c.cp], ch = chiefOf(w, 'security'); return { kind: 'pass_control', opts: { cp: c.cp, mins: 45 }, reason: 'час пик у «' + cp.name + '», на посту никого', initiator: ch ? ch.displayName : 'Начальник смены', from: ch && ch.id, channel: 'chief', prio: 3, deadline: 110 }; } });
  // guard: class D seen outside the block by a camera
  SIT('G08', { name: 'Класс D вне блока', src: 'dclass', roles: FAM.guard, weight: 4, cool: 15, prio: 4, danger: true,
    test(w) { for (let i = w.camLog.length - 1; i >= 0 && i > w.camLog.length - 60; i--) { const e = w.camLog[i]; if (!e.flag || !/Класс D/.test(e.note || '') || w.now - e.time > 20) continue; const d = w.npc(e.subj); if (!d || d.dead || d.escortedBy || !d.onSite || w.tasks.hasActive('return_d', d.id) || w.tasks.list.some(t => t.status === 'Active' && t.kind === 'return_d' && t.data && t.data.dclass === d.id)) continue; const r = w.fac.room(d.agent.roomId); if (r && r.sector === 'D') continue; return { d: d.id, site: d.agent.roomId, cam: e.cam }; } return null; },
    make(w, c) { const d = w.npc(c.d), op = voice(w, ['cctv_operator', 'dispatcher']); return { kind: 'return_d', opts: { dclass: c.d, target: c.d }, reason: (op ? 'оператор видит на камере ' : 'камера показывает ') + d.callsign + ' без конвоя в «' + w.roomName(c.site) + '»', initiator: op ? op.displayName : 'Видеонаблюдение', from: op && op.id, channel: 'radio', prio: 4, deadline: 40 }; } });
  // guard: a knock in a duct (thermal expansion, or nothing, or rarely a loose object)
  SIT('G09', { name: 'Стук в вентиляции', src: 'staff', roles: FAM.guard, weight: 2, cool: 30, prio: 2,
    test(w) { const fa = w.horror && w.horror.falseAlarms.find(f => f.kind === 'knock' && !f.explained && !f.td && w.now - f.t < 15); const k = !fa && w.infra.knocks.find(x => x.cause === 'thermal' && w.now - x.t < 3); const room = fa ? fa.roomId : k ? k.roomId : null; if (!room) return null; return { fa, room, site: room }; },
    make(w, c) { if (c.fa) c.fa.td = true; const r = w.fac.room(c.room), loose = w.anomalies.find(a => a.arrived && !a.contained && w.fac.room(a.agent.roomId) && w.fac.room(a.agent.roomId).sector === (r && r.sector)); const truth = loose ? 'anomaly' : w.infra.heating || (c.fa) ? 'thermal' : 'quiet'; const k = newCase(w, 'knock', truth, c.room, { scp: loose ? loose.id : null }); const n = voice(w, ['janitor', 'cook', 'technician', 'lab_assistant']); return { kind: 'inspect_report', opts: { case: k.id, room: c.room, title: 'Проверить стук в вентиляции' }, reason: (n ? n.shortName + ' слышит' : 'сообщают о') + ' стук в воздуховоде «' + w.roomName(c.room) + '»', initiator: n ? n.displayName : 'Сотрудник', from: n && n.id, channel: n ? 'radio' : 'radio', prio: 2, deadline: 45 }; } });
  // guard: a colleague does not answer the radio check
  SIT('G10', { name: 'Молчащая рация', src: 'staff', roles: FAM.guard, weight: 2, cool: 40, prio: 3,
    test(w) { const g = w.active.find(n => (n.prof === 'guard' || n.prof === 'patrol') && n.radioOk === false && !n.dead && n.onSite && S.People.block(w, n).activity === 'Duty' && !Object.values(D(w).cases).some(c => c.type === 'radio' && c.who === n.id && !c.done)); return g ? { g: g.id, site: g.agent.roomId } : null; },
    make(w, c) { const g = w.npc(c.g), truth = g.missing ? 'missing' : (g.activity === 'Sleep' || (g.psy.fatigue > 80 && w.clock.night)) ? 'asleep' : 'battery'; const k = newCase(w, 'radio', truth, g.missing ? (g.missingWhere || c.site) : c.site, { who: g.id }); const ch = chiefOf(w, 'security'); return { kind: 'inspect_report', opts: { case: k.id, room: k.room, title: 'Найти ' + g.shortName + ' (рация молчит)' }, reason: g.shortName + ' не отвечает на перекличку', initiator: ch ? ch.displayName : 'Начальник смены', from: ch && ch.id, channel: 'radio', prio: 3, deadline: 40 }; } });
  // guard: a radio call for help (sometimes in somebody else's voice)
  SIT('G11', { name: 'Вызов по рации', src: 'scp', roles: FAM.guard.concat(['cctv_operator', 'dispatcher']), weight: 4, cool: 20, prio: 3,
    test(w) { const a = w.anomaly('SCP-LF-135'); const call = a && a.st && (a.st.calls || []).find(x => x.listener === 'player' && !x.td && w.now - x.t < 10); return call ? { call, site: call.room } : null; },
    make(w, c) { c.call.td = true; const k = newCase(w, 'fakecall', 'fake', c.call.room, { who: c.call.caller, scp: 'SCP-LF-135' }); return { kind: 'inspect_report', opts: { case: k.id, room: c.call.room, title: 'Вызов в «' + w.roomName(c.call.room) + '»' }, reason: 'по рации просят срочно подойти', initiator: w.nameOf(c.call.caller), from: null, channel: 'none', prio: 3, deadline: 30 }; } });
  // guard: somebody where they have no business (a personal errand into a guarded wing, suspended, class D alone…)
  SIT('G12', { name: 'Стоять, документы!', src: 'security', roles: FAM.guard, weight: 3, cool: 25, prio: 3,
    test(w, p) {
      if (!S.CP) return null;
      const near = w.active.filter(n => !n.dead && n.onSite && !n.incap(w.now) && n.agent.roomId && n.dept !== 'security' && n.dept !== 'mtf' && !n.escortedBy && p.roomId && w.fac.roomDistance(n.agent.roomId, p.roomId) <= 4 && !w.tasks.list.some(t => t.status === 'Active' && t.kind === 'doc_check' && t.data && t.data.target === n.id));
      const bad = near.find(n => { const v = S.CP.streetVerdict(w, n.id); return v && !v.valid; });
      if (bad) return { n: bad.id, site: bad.agent.roomId };
      // nobody suspicious around: an ordinary person in a guarded wing is sometimes worth a check
      const any = near.filter(n => n.role !== 'DClass' && S.CP.zoneFor(w, n.agent.roomId).id !== 'street');
      return any.length && w.rng.chance(0.35) ? { n: w.rng.pick(any).id, site: null, routine: true } : null;
    },
    make(w, c) { const n = w.npc(c.n), ch = chiefOf(w, 'security'); return { kind: 'doc_check', opts: { target: c.n, title: 'Проверить документы: ' + n.shortName }, reason: c.routine ? 'выборочная проверка в охраняемой зоне' : (ch ? ch.shortName + ' видит на камере' : 'на камере') + ' ' + n.shortName + ' в «' + w.roomName(n.agent.roomId) + '»', initiator: ch ? ch.displayName : 'Начальник смены', from: ch && ch.id, channel: 'radio', prio: 3, deadline: 50 }; } });
  // technicians: known faults with nobody on them
  SIT('T01', { name: 'Неисправность', src: 'fault', roles: FAM.tech, weight: 4, cool: 2, prio: 3,
    test(w, p) { const fs = w.infra.faults.filter(f => !f.fixed && f.known && !(f.wait > w.now) && !w.tasks.hasActive('repair', f.id) && (FAULT_ROLES[f.who] || ['technician']).indexOf(p.prof) >= 0); if (!fs.length) return null; fs.sort((a, b) => urgency(b) - urgency(a)); return { f: fs[0], site: fs[0].room, prio: urgency(fs[0]) }; },
    make(w, c) { const f = c.f, op = dispatcher(w); return { kind: 'repair', opts: { fault: f.id, title: 'Ремонт: ' + f.text }, reason: f.text + ' — с ' + fmtTime(f.knownAt || f.since) + (f.knownBy ? ', сообщил ' + (f.knownBy === 'player' ? 'вы' : f.knownBy) : ''), initiator: op ? op.displayName : 'Диспетчер', from: op && op.id, channel: c.prio >= 4 ? 'radio' : 'terminal', prio: c.prio, deadline: 240 }; } });
  // scientists: a spike on the cell sensors — the object, the sensor, or noise?
  SIT('S02', { name: 'Всплеск датчиков', src: 'scp', roles: FAM.sci, weight: 3, cool: 45, prio: 3,
    test(w) { for (const cell in w.infra.sensors) { const s = w.infra.sensors[cell], a = w.anomalies.find(x => x.arrived && x.containRoom === cell && x.contained); if (!a || Object.values(D(w).cases).some(c => c.type === 'sensor' && c.cell === cell && !c.done)) continue; const bad = s.mode === 'spike' || s.mode === 'stuck'; const active = a.threat >= 50; if ((bad && w.rng.chance(0.25)) || (active && w.rng.chance(0.08)) || w.rng.chance(0.004)) return { cell, a: a.id, site: a.obsRoom || cell, bad, active }; } return null; },
    make(w, c) { const truth = c.bad ? 'sensor' : c.active ? 'object' : 'noise'; const k = newCase(w, 'sensor', truth, c.site, { cell: c.cell, scp: c.a }); const op = voice(w, ['cctv_operator', 'containment_engineer', 'dispatcher']); return { kind: 'inspect_report', opts: { case: k.id, room: c.site, title: 'Всплеск датчиков ' + c.a }, reason: 'датчики камеры ' + c.a + ' показали всплеск движения и ЭМ-поля', initiator: op ? op.displayName : 'Система контроля', from: op && op.id, channel: 'radio', prio: 3, deadline: 60 }; } });
  // scientists: an observation that ends with a conclusion (normal / agitated / a new behaviour from the hidden properties)
  SIT('S04', { name: 'Наблюдение с выводом', src: 'research', roles: FAM.sci, weight: 3, cool: 12, prio: 2,
    test(w, p) {
      const pool = w.anomalies.filter(a => a.arrived && a.contained && a.obsRoom && w.fac.room(a.obsRoom) && !Object.values(D(w).cases).some(c => c.type === 'observe' && c.scp === a.id && !c.done));
      if (!pool.length) return null; const mine = pool.filter(a => (p.assignedScps || []).indexOf(a.id) >= 0 || (a.assigned || []).indexOf('player') >= 0);
      const a = w.rng.pick(mine.length && w.rng.chance(0.6) ? mine : pool), hidden = a.props.filter(x => !x.revealed);
      const truth = a.threat >= 45 ? 'agitated' : hidden.length && w.rng.chance(0.35) ? 'new' : 'normal';
      return { a: a.id, site: a.obsRoom, truth, prop: truth === 'new' ? w.rng.pick(hidden).id : null };
    },
    make(w, c) { const k = newCase(w, 'observe', c.truth, c.site, { scp: c.a, prop: c.prop }), ch = chiefOf(w, 'science'); return { kind: 'inspect_report', opts: { case: k.id, room: c.site, title: 'Наблюдение: ' + c.a }, reason: 'наблюдение по плану исследований, нужен вывод в журнал', initiator: ch ? ch.displayName : 'Руководитель исследований', from: ch && ch.id, channel: 'terminal', prio: 2, deadline: 120 }; } });
  // technicians: a round with measurements at a panel; a hidden fault shows in the numbers
  SIT('T09', { name: 'Обход щитка с замером', src: 'duty', roles: FAM.tech, weight: 3, cool: 8, prio: 2,
    test(w) {
      const panels = Object.values(w.fac.pois).filter(p => p.type === 'Panel' && p.node >= 0 && (w.fac.room(p.roomId).level === 3 || w.fac.room(p.roomId).level === 4) && !w.infra.idle(p.roomId)); if (!panels.length) return null;
      const p = w.rng.pick(panels);
      return { poi: p.id, site: p.roomId };
    },
    make(w, c) {
      const r = w.fac.room(c.site); let hidden = w.infra.faults.some(f => !f.fixed && !f.known && w.fac.room(f.site) && w.fac.room(f.site).sector === r.sector && w.fac.room(f.site).level === r.level);
      if (!hidden && w.rng.chance(0.35)) hidden = !!w.infra.create(w.rng.chance(0.5) ? 'panel' : 'light', c.site);    // wear that nobody has noticed yet
      c.truth = hidden ? 'latent' : 'ok';
      const k = newCase(w, 'panel', c.truth, c.site, {}), ch = chiefOf(w, 'engineering'); return { kind: 'inspect_report', opts: { case: k.id, room: c.site, poi: c.poi, title: 'Замер на щитке: ' + w.roomName(c.site) }, reason: 'плановый обход: замер напряжения и нагрева', initiator: ch ? ch.displayName : 'Руководитель инженерной службы', from: ch && ch.id, channel: 'terminal', prio: 2, deadline: 90 }; } });
  // technicians: the generators wear out; a check lowers the wear and finds hidden faults at the switchboard
  SIT('T07', { name: 'Проверка генератора', src: 'duty', roles: ['electrician', 'technician'], weight: 2, cool: 90, prio: 2,
    test(w) { const g = ['genMain', 'genC'].find(id => w.infra.gens[id].wear > 15 && !w.tasks.hasActive('power_check')); return g ? { g, site: g, prio: w.infra.gens[g].wear > 60 ? 3 : 2 } : null; },
    make(w, c) { const ch = chiefOf(w, 'engineering'); return { kind: 'power_check', opts: { gen: c.g, title: 'Проверка: ' + w.roomName(c.g) }, reason: 'износ ' + Math.round(w.infra.gens[c.g].wear) + '% — плановое обслуживание', initiator: ch ? ch.displayName : 'Руководитель инженерной службы', from: ch && ch.id, channel: 'terminal', prio: c.prio, deadline: 180 }; } });
  // containment engineers: cell sensors not calibrated for half a day
  SIT('T04', { name: 'Калибровка датчиков', src: 'duty', roles: ['containment_engineer', 'technician'], weight: 2, cool: 60, prio: 2,
    test(w) { const cells = Object.keys(w.infra.sensors).filter(c => w.now - (w.infra.sensors[c].cal || 0) > 360 && w.anomalies.some(a => a.arrived && a.containRoom === c)); return cells.length && !w.tasks.hasActive('calibrate_sensors') ? { cells: cells.slice(0, 3), site: null } : null; },
    make(w, c) { const ch = chiefOf(w, 'engineering'); return { kind: 'calibrate_sensors', opts: { cells: c.cells }, reason: 'датчики не калибровались больше 6 часов: ' + c.cells.map(x => w.roomName(x)).join(', '), initiator: ch ? ch.displayName : 'Руководитель инженерной службы', from: ch && ch.id, channel: 'terminal', prio: 2, deadline: 240 }; } });
  // technicians and logisticians: parts ran out; a delivery waits at the freight lift
  SIT('T12', { name: 'Пополнить склад', src: 'request', roles: FAM.tech.concat(['logistician']), weight: 2, cool: 120, prio: 2,
    test(w) { if (!S.Proc || w.tasks.hasActive('restock')) return null; const st0 = S.Proc.stock(w), low = Object.keys(st0).filter(k => st0[k] <= 0); const waiting = w.infra.faults.filter(f => !f.fixed && f.waitPart).map(f => f.waitPart); const parts = [...new Set(waiting.concat(low))].slice(0, 4); return parts.length >= (waiting.length ? 1 : 2) ? { parts, site: 'freightS', prio: waiting.length ? 3 : 2 } : null; },
    make(w, c) { const lg = voice(w, ['logistician']); return { kind: 'restock', opts: { parts: c.parts, title: 'Пополнить склад: ' + c.parts.length + ' поз.' }, reason: 'на складе нет: ' + c.parts.join(', ') + ' — поставка у грузового лифта', initiator: lg ? lg.displayName : 'Логистика', from: lg && lg.id, channel: lg ? 'radio' : 'terminal', prio: c.prio, deadline: 180 }; } });
  function urgency(f) { return f.kind === 'gen' || f.kind === 'shield' || f.kind === 'sensor' || f.kind === 'cooling' ? 4 : f.kind === 'door' || f.kind === 'reader' || f.kind === 'camera' || f.kind === 'emlight' ? 3 : 2; }

  // ---------------------------------------------------------------- delivery without big pop-ups
  function deliver(w, t, ch, from) {
    const p = w.player, who = from ? w.npc(from) : null, nm = who ? who.displayName : ch === 'chief' ? 'Начальник смены' : 'Диспетчер', line = t.reason ? t.title + ' — ' + t.reason : t.title;
    if (ch === 'none') return;
    if (ch === 'person' && who && V.distXZ(who.agent.pos, p.pos) < 7) { who.say(line, w.now); w.notify.push({ time: w.now, type: 'Personnel', severity: 1, text: nm + ' (лично): ' + line }); return; }
    if (ch === 'chief') { w.notify.push({ time: w.now, type: 'Personnel', severity: 1, text: nm + ': ' + line }); return; }
    if (ch === 'terminal') { w.notify.push({ time: w.now, type: 'Personnel', severity: 1, text: 'Терминал — наряд: ' + line }); return; }
    w.notify.push({ time: w.now, type: EV.Radio, radio: true, text: 'Рация, ' + nm + ': «' + line + '»' });
    w.infra.radioLog({ t: w.now, from: from || 'dispatch', to: 'player', text: line });
  }
  // the shift briefing: planned blocks and open questions from the real state
  function briefing(w) {
    const d = D(w), p = w.player; if (!p.onShift || d.brief.day === w.clock.day + (p.shift === 'night' ? 0.5 : 0)) return;
    d.brief.day = w.clock.day + (p.shift === 'night' ? 0.5 : 0);
    const L = [], fam = famOf(p.prof);
    if (fam === 'guard') { if (S.CP) L.push('Часы пик на КПП: 06:20–09:30, 11:50–14:40, 17:30–19:40 — при пустом посту заступать.'); const br = S.CP ? S.CP.M(w).breaches.filter(b => !b.audited).length : 0; if (br) L.push('Есть непроверенные нарушения пропускного режима: ' + br + '.'); const dOut = w.camLog.filter(e => e.flag && w.now - e.time < 600).length; if (dOut) L.push('За смену камеры отметили ' + dOut + ' подозрительных эпизодов.'); }
    if (fam === 'tech') { const open = w.infra.faults.filter(f => !f.fixed && f.known); L.push(open.length ? 'Открытые заявки: ' + open.slice(0, 4).map(f => f.text).join('; ') + (open.length > 4 ? ' и ещё ' + (open.length - 4) : '') : 'Открытых заявок нет — обход щитков по графику.'); const st0 = S.Proc ? S.Proc.stock(w) : null; if (st0) { const out = Object.keys(st0).filter(k => !st0[k]); if (out.length) L.push('На складе закончились: ' + out.join(', ') + '.'); } const pl = w.life && w.life.planned.filter(x => !x.done && x.at > w.now && x.at - w.now < 720); if (pl && pl.length) L.push('План работ: ' + pl.map(x => fmtTime(x.at) + ' ' + x.text).join('; ') + '.'); }
    if (fam === 'sci') { const t = w.anomaly('SCP-L-001'); if (t && t.tm) L.push('SCP-L-001: последний сеанс счёта ' + fmtTime(t.tm.lastSession) + '.'); const pend = w.life ? w.life.requests.filter(r => r.status === 'approved' || r.status === 'pending' || r.status === 'ethics').length : 0; if (pend) L.push('Заявок на эксперименты в работе: ' + pend + '.'); const sh = w.infra.shields.cell135; if (sh != null && sh < 85) L.push('Экран LF-135: ' + Math.round(sh) + '%.'); }
    if (fam === 'd' && S.DBlock) { const b = S.DBlock.hall(w, S.DBlock.hallOf(w, 'player')); L.push('Распорядок: 07:00 поверка и пайка, 07:40–17:00 работа с обедом, 21:45 вечерняя поверка у коек.'); L.push('В блоке: ' + S.DBlock.STAGES[b.stage][1] + '.'); if ((p.items || []).length) L.push('При себе: ' + p.items.map(x => S.DBlock.ITEMS[x] || x).join(', ') + '.'); }
    if (!L.length) return;
    const ch = fam === 'd' ? chiefOf(w, 'dclass') : chiefOf(w, p.dept); d.brief.lines = L; d.brief.by = ch ? ch.displayName : 'Начальник смены';
    w.notify.push({ time: w.now, type: 'Personnel', severity: 1, text: 'Наряд на смену (' + d.brief.by + '): ' + L.join(' ') });
    p.addJournal('[' + fmtStamp(w.now) + '] Наряд на смену: ' + L.join(' '));
  }
  const famOf = prof => FAM.guard.indexOf(prof) >= 0 ? 'guard' : FAM.tech.indexOf(prof) >= 0 ? 'tech' : FAM.sci.indexOf(prof) >= 0 ? 'sci' : prof === 'dclass' ? 'd' : null;
  function give(w, sit, ctx) {
    const d = D(w), m = sit.make(w, ctx); d.cool[sit.id] = w.now + sit.cool; if (!m) return null;     // a situation handled another way also cools down
    const t = w.life.issue(m.kind, 'player', m.opts, m.initiator, m.deadline || 120, { src: sit.src, reason: m.reason, initiator: m.initiator, channel: m.channel === 'none' ? 'radio' : m.channel, prio: m.prio || sit.prio, sit: sit.id });
    if (!t) return null;
    d.cool[sit.id] = w.now + sit.cool; d.recent.push(sit.id); if (d.recent.length > 8) d.recent.shift(); d.last = w.now; d.given[m.kind] = (d.given[m.kind] || 0) + 1;
    deliver(w, t, m.channel, m.from);
    return t;
  }
  Object.assign(TD, {
    PACE, FAM, SITS, SIT, CASES, D, conclude, look, newCase, briefing, deliver, famOf,
    drives(w) { return !!famOf(w.player.prof); },
    // SCP LIFE asks before handing the player an order of its own
    accepts(w, kind) { const d = D(w), pace = PACE[d.pace] || PACE.standard, n = w.tasks.activeFor('player').length; if (!TD.drives(w)) return true; if (n >= 2) return false; if (w.now - Math.max(d.last, d.lastDone) < pace.pause) return false; d.last = w.now; return true; },
    setPace(w, id) { if (PACE[id]) D(w).pace = id; },
    tick(w, dt) {
      const d = D(w); d.t -= dt; if (d.t > 0) return; d.t = 2;
      const p = w.player; if (p.dead || p.sleeping || !p.prof || !TD.drives(w)) return;
      briefing(w);
      if (!p.onShift || w.alert.level >= 3) return;
      const act = w.tasks.activeFor('player'), pace = PACE[d.pace] || PACE.standard;
      // a quiet watch for a guard: now and then somebody really heads into a wing on a personal errand
      if (famOf(p.prof) === 'guard' && S.CP && w.now - (d.seedAt || -1e4) > 45 / pace.events && w.rng.chance(0.2)) { d.seedAt = w.now; S.CP.makeCase(w, w.rng.pick(Object.values(S.CP.CPS))); }
      if (act.length >= 2 || w.now - Math.max(d.last, d.lastDone) < pace.pause) return;
      let best = null, total = 0; const cands = [];
      for (const id in SITS) {
        const x = SITS[id]; if (x.roles.indexOf(p.prof) < 0 || (d.cool[id] || -1e9) > w.now || (act.length && x.prio < 4)) continue;
        const ctx = x.test(w, p); if (!ctx) continue;
        const prio = ctx.prio || x.prio; if (act.length && prio < 4) continue;
        const sc = x.weight * prio * (d.recent[d.recent.length - 1] === id ? 0.3 : 1) / (1 + (ctx.site && p.roomId ? w.fac.roomDistance(p.roomId, ctx.site) : 0) / 6) * (x.danger ? pace.danger : 1);
        cands.push({ x, ctx, sc }); total += sc;
      }
      if (cands.length) { let r = w.rng.next() * total; for (const c of cands) { r -= c.sc; if (r <= 0) { best = c; break; } } best = best || cands[cands.length - 1]; give(w, best.x, best.ctx); return; }
      // false notes in a dossier are found out by colleagues after a while
      if (w.rng.chance(0.01)) for (const a of w.anomalies) for (const fn of (a.falseNotes || [])) if (!fn.found && w.now - fn.t > 600) { fn.found = true; if (w.life) w.life.openCase('procedure', 'Ошибка в досье ' + a.id + ': ' + fn.text, a.obsRoom || a.containRoom, { cause: 'human_error', scp: a.id }, true); if (fn.by === 'player') { p.addRep('science', -5); w.notify.push({ time: w.now, type: EV.Discipline, severity: 1, text: 'Повторное наблюдение ' + a.id + ' не подтвердило вашу запись в досье. Открыт разбор.' }); } }
      // nothing is happening: the profession's own routine work (rounds that can find something)
      if (!act.length && w.now - Math.max(d.last, d.lastDone) > pace.filler && w.life && w.life.playerFiller) { if (w.life.playerFiller()) d.last = w.now; }
    },
    save(w) { const d = D(w); return { cool: d.cool, recent: d.recent, last: d.last, lastDone: d.lastDone, brief: d.brief, cases: d.cases, nextCase: d.nextCase, pace: d.pace, given: d.given }; },
    load(w, o) { if (!o) return; Object.assign(D(w), o, { t: 0 }); const d = D(w); for (const id in d.cases) if (d.cases[id].done && w.now - d.cases[id].t > 1440) delete d.cases[id]; }
  });
  S.TaskDirector = TD;
})(typeof window !== 'undefined' ? window : globalThis);
