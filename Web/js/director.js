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
    stand_guard: { src: 'request', prio: 3, tools: ['рация'], ok: 'сопровождение обеспечено', fail: 'сопровождение не обеспечено' }
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
    consequence(w, t, ok, note) {
      const who = t.who === 'player' ? w.player : w.npc(t.who), init = typeof t.initiator === 'string' ? w.npcs.find(n => t.initiator.indexOf(n.last) >= 0 && n.last.length > 2) : null;
      TD.log(w, t, (ok ? 'выполнено' : 'провалено') + (note ? ': ' + note : ''));
      if (init && who && init !== who && init.adjustRel) init.adjustRel(t.who === 'player' ? 'player' : who.id, ok ? 6 : -8);
      if (t.who === 'player') { const p = w.player; p.career = p.career || []; p.career.push({ t: w.now, task: t.title, ok, by: t.initiator }); if (p.career.length > 200) p.career.shift(); }
      if (!ok && t.kind === 'escort_d' && w.life) { const r = (w.life.requests || []).find(q => q.task && q.dclass === (t.data && t.data.dclass)); if (r && r.status === 'scheduled') { r.status = 'approved'; r.task = null; } w.life.decide('Сорван конвой на испытание', [t.title, note || ''], 'Испытание перенесено, разбор у начальника смены', 'Начальник смены'); }
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
  S.TaskDirector = TD;
})(typeof window !== 'undefined' ? window : globalThis);
