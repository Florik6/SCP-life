/* SCP LIFE 2.0 — anomalies that act on perception (SCP-LF-133…138) and objects arriving from other sites (LF-159, LF-160). */
(function (root) {
  'use strict';
  const S = root.SCP, { V, clamp, fmtTime, fmtStamp, durationText, EV, Hm } = S, A = S.Anoms, H = A.H, def = A.def;

  // Exposure helper: subjects in the observation room and the cell accumulate exposure at their own rate.
  function exposeRooms(w, a, gm, kCell, kObs, filter) {
    const out = [];
    for (const s of H.subjects(w, [a.containRoom, a.obsRoom].filter(Boolean))) {
      if (filter && !filter(s)) continue;
      const k = (s.roomId === a.containRoom ? kCell : kObs) * (1.2 - (s.psy.resilience || 0.6) * 0.4);
      out.push({ s, e: H.expose(w, a, s, gm * k) });
    }
    return out;
  }

  // ================================================================== SCP-LF-133 «Человек за плечом»
  def({
    id: 'SCP-LF-133', name: 'Человек за плечом', cls: 'Евклид', kind: 'cognitive', temper: 'cognitive', room: 'cell133', obs: 'obs133', model: 'photo', knowledge0: 15,
    desc: 'Групповая фотография сотрудников неизвестного объекта, 1960-е годы. За плечом одного из них — размытая фигура. Тот, кто долго смотрит на снимок, начинает чувствовать, что кто-то постоянно стоит у него за спиной.',
    contain: 'Снимок под непрозрачным колпаком. Наблюдение не дольше 5 минут. Сотрудники с признаками воздействия работают только в паре до прекращения эффекта.',
    triggers: 'длительный взгляд на снимок; одиночество, тишина и полумрак после воздействия',
    rules: { maxView: 5 },
    props: [['follower', 'после воздействия человеку кажется, что за ним кто-то идёт', null, true], ['no_physical', 'камеры и датчики за спиной пострадавших ничего не фиксируют'], ['dose', 'эффект возникает после ~8 минут суммарного наблюдения и длится до суток'], ['alone_only', 'эффект проявляется только когда пострадавший один', { pairExposed: true }]],
    exps: [{ id: 'cameras_behind', name: 'Камеры за спиной', desc: 'Пострадавший идёт по пустому коридору, за ним две камеры.', dur: 15 }, { id: 'dose', name: 'Дозированное наблюдение', desc: 'Три испытуемых смотрят на снимок 2, 5 и 10 минут.', dur: 20, dclass: true, ethics: true }, { id: 'company', name: 'Испытуемый в паре', desc: 'Пострадавший проводит час с напарником.', dur: 30 }],
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.004);
      for (const r of exposeRooms(w, a, gm, 1.2, 0.15)) if (r.e >= 8 && !w.horror.has(r.s.id, 'follower')) {
        const dur = clamp(r.e * 50, 360, 1440);
        H.effect(w, a, r.s.id, { kind: 'follower', cause: 'наблюдение снимка ' + a.id, intensity: clamp(r.e / 16, 0.3, 1), dur, end: { sleep: 0.5, company: true, therapy: true }, data: {} });
        if (r.s.n) r.s.n.addHistory(w.now, 'После наблюдения ' + a.id + ' чувствует, что за ним кто-то ходит', 'anomaly', a.id);
      }
    },
    status: a => 'Под воздействием: ' + Object.keys(a.st.exp || {}).filter(k => (a.st.exp[k] || 0) >= 8).length,
    threat: () => 12,
    truth() { return { motion: 0, temp: 19 }; },
    observe(w, a, who, cam) {
      if (cam) return 'На записи: снимок на подставке, в камере никого.';
      if (who === 'player') H.expose(w, a, { id: 'player', psy: w.player.psy }, 2);
      return 'Пожелтевший снимок: двенадцать человек в халатах. За левым плечом третьего слева — размытый силуэт. Чем дольше смотришь, тем отчётливее кажется, что он смотрит в объектив.';
    },
    experiment(w, a, id, ctx) {
      if (id === 'cameras_behind') return { text: 'Испытуемый трижды останавливался и оборачивался, описывал «шаги в метре позади». Обе камеры зафиксировали пустой коридор.', reveal: ['no_physical'] };
      if (id === 'dose') { if (ctx.dclass) H.effect(w, a, ctx.dclass, { kind: 'follower', cause: 'эксперимент', intensity: 0.7, dur: 900, end: { sleep: 0.5, company: true, therapy: true }, data: {} }); return { text: '2 минуты — без эффекта; 5 минут — слабое беспокойство; 10 минут — устойчивое ощущение преследования до утра.', reveal: ['dose'] }; }
      if (id === 'company') return { text: 'Пока рядом был напарник, жалоб не было. Через 4 минуты после его ухода испытуемый снова услышал шаги.', reveal: ['alone_only'] };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-134 «Неправильный коридор»
  def({
    id: 'SCP-LF-134', name: 'Неправильный коридор', cls: 'Евклид', kind: 'spatial', temper: 'cognitive', room: 'cell134', obs: 'obs134', model: 'corridor', knowledge0: 15,
    desc: 'Камера — десятиметровый отрезок служебного коридора. Пройти его занимает в несколько раз больше времени, чем должно. Прошедшие потом видят в обычных коридорах лишние двери и повороты.',
    contain: 'Проход по коридору — только по утверждённой заявке, со страховочным тросом. Пострадавшим запрещено ходить без сопровождения до прекращения эффекта.',
    triggers: 'проход по коридору камеры',
    rules: {},
    props: [['extra_doors', 'прошедшие коридор видят несуществующие двери и проходы', null, true], ['length_constant', 'длина коридора неизменна (10 м), но проход занимает в 2,5 раза дольше'], ['fades', 'ложные двери исчезают через 2–8 часов, сон ускоряет восстановление']],
    exps: [{ id: 'laser', name: 'Дальномер и шагомер', desc: 'Измерить коридор лазером и шагами.', dur: 15 }, { id: 'map_drawing', name: 'План по памяти', desc: 'Испытуемый проходит коридор и рисует план сектора.', dur: 20, dclass: true }],
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.01);
      for (const s of H.subjects(w, [a.containRoom])) {
        if (s.n) s.n.agent.slow = 0.4; const e = H.expose(w, a, s, gm * 1.5);
        if (e >= 3 && !w.horror.has(s.id, 'extra_doors')) H.effect(w, a, s.id, { kind: 'extra_doors', cause: 'проход по коридору ' + a.id, intensity: clamp(e / 8, 0.3, 1), dur: clamp(e * 60, 120, 480), end: { sleep: true }, data: {} });
      }
    },
    slowIn(w, a, roomId) { return roomId === a.containRoom ? 0.4 : 1; },
    status: a => 'Под воздействием: ' + Object.keys(a.st.exp || {}).length,
    threat: () => 10,
    truth() { return { motion: 0 }; },
    observe(w, a) { return 'Узкий служебный коридор с одинаковыми лампами. Кажется, что ламп больше, чем можно уместить в десять метров.'; },
    experiment(w, a, id, ctx) {
      if (id === 'laser') return { text: 'Дальномер: 10,02 м. Шагомер: 31 шаг вместо 13, время прохода 52 секунды.', reveal: ['length_constant'] };
      if (id === 'map_drawing') { if (ctx.dclass) H.effect(w, a, ctx.dclass, { kind: 'extra_doors', cause: 'эксперимент', intensity: 0.6, dur: 300, end: { sleep: true }, data: {} }); return { text: 'На плане испытуемого в коридоре сектора С 14 дверей вместо 9. Через 6 часов он нарисовал план верно.', reveal: ['fades'] }; }
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-135 «Знакомый голос»
  def({
    id: 'SCP-LF-135', name: 'Знакомый голос', cls: 'Евклид', kind: 'cognitive', temper: 'cognitive', room: 'cell135', obs: 'obs135', model: 'radio', knowledge0: 15,
    desc: 'Ламповый радиоприёмник без питания. Воспроизводит голоса сотрудников, знакомых слушателю. При ослабленном экранировании передаёт ложные вызовы в рабочий радиоэфир комплекса.',
    contain: 'Экранированная камера, контроль экрана ежедневно. Рации оставлять у входа в наблюдательный пункт. Сеансы — только с выключенной связью.',
    triggers: 'ослабленное экранирование; рация в камере или рядом',
    rules: { radioFree: true },
    props: [['voices', 'объект говорит голосами знакомых слушателю людей', null, true], ['radio_injection', 'при экранировании ниже 70% объект выходит в рабочий радиоэфир с чужим позывным', { shieldCheck: true }], ['voice_from_memory', 'голоса собраны из памяти слушателя, а не записаны где-то ещё'], ['source_located', 'пеленгация ложных вызовов указывает на камеру LF-135']],
    exps: [{ id: 'shield_test', name: 'Ослабление экрана', desc: 'Снизить экранирование на 15% на 10 минут.', dur: 15, ethics: false }, { id: 'voice_analysis', name: 'Спектральный анализ', desc: 'Сравнить голос объекта с записями голоса сотрудника.', dur: 20 }, { id: 'direction', name: 'Пеленгация', desc: 'Пеленговать ложные вызовы из трёх точек.', dur: 20 }],
    init(w, a) { if (!a.st.calls) Object.assign(a.st, { calls: [], next: w.now + w.rng.range(90, 240) }); },
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.006);
      for (const r of exposeRooms(w, a, gm, 1, 0.15)) if (r.e >= 6 && !w.horror.has(r.s.id, 'voice')) H.effect(w, a, r.s.id, { kind: 'voice', cause: 'контакт с ' + a.id, intensity: clamp(r.e / 12, 0.3, 1), dur: clamp(r.e * 40, 240, 900), end: { sleep: true, leave: [] }, data: { caller: (H.known(w, r.s.id, w.rng) || {}).id } });
      const shield = w.infra ? w.infra.shield(a.containRoom) : 100;
      if (shield < 70 && w.now >= a.st.next) {
        a.st.next = w.now + w.rng.range(40, 120);
        const targets = w.active.filter(n => n.prof && /guard|patrol|cctv|dispatcher|technician|electrician/.test(n.prof) && n.radioOk);
        const t = targets.length ? H.pick(w, targets) : null, asPlayer = !w.player.dead && w.rng.chance(0.35);
        const listener = asPlayer ? 'player' : t ? t.id : null; if (!listener) return;
        const caller = H.known(w, listener, w.rng), room = H.pick(w, w.fac.roomList.filter(r => r.type === 'Corridor' || r.type === 'Tunnel' || r.type === 'Storage'));
        const text = 'Это ' + caller.shortName + '. Срочно подойдите в «' + room.name + '», здесь что-то не так.';
        const call = { t: w.now, listener, caller: caller.id, room: room.id, text, fake: true };
        a.st.calls.push(call); if (a.st.calls.length > 30) a.st.calls.shift();
        if (w.infra) w.infra.radioLog({ t: w.now, from: caller.id, to: listener, text, fake: a.id, bearing: a.containRoom });
        if (listener === 'player') w.notify.push({ time: w.now, type: EV.Radio, radio: true, text: 'Рация: ' + text });
        else if (t) { t.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Radio, roomId: room.id, subject: caller.id, text: 'Вызов по рации: ' + text, imp: 0.6, conf: 1, src: 'Witnessed', fake: a.id }, w.now); t.radioCall = { room: room.id, caller: caller.id, t: w.now }; t.nextThink = 0; }
      }
    },
    status: a => 'Экранирование: ' + (a.st.shield != null ? a.st.shield : '—'),
    threat: a => 15,
    truth(w, a) { return { em: w.infra && w.infra.shield(a.containRoom) < 70 ? 0.7 : 0.1, sound: 0.05 }; },
    observe(w, a, who, cam) {
      if (cam) return 'На записи: приёмник на столе, шкала не светится.';
      const k = H.known(w, who, w.rng); return 'Из динамика тихо, но отчётливо: «' + (k ? k.first : 'Эй') + ', ты меня слышишь?» — голос ' + (k ? k.shortName : 'знакомого') + '.';
    },
    experiment(w, a, id, ctx) {
      if (id === 'shield_test') { if (w.infra) w.infra.weakenShield(a.containRoom, 15, 10); return { text: 'Через 4 минуты после ослабления экрана в рабочем эфире прозвучал вызов голосом начальника смены. Начальник смены в это время спал.', reveal: ['radio_injection'], severity: 1 }; }
      if (id === 'voice_analysis') return { text: 'Голос объекта совпадает с восприятием слушателя, но спектр не совпадает с реальной записью голоса сотрудника.', reveal: ['voice_from_memory'] };
      if (id === 'direction') return a.st.calls.length ? { text: 'Три пеленга сходятся на камере LF-135.', reveal: ['source_located'] } : { text: 'Ложных вызовов для пеленгации пока не было.', knowledge: 1 };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-136 «Пустое кресло»
  const FIG = ['пожилой мужчина в сером халате', 'женщина с короткой стрижкой, похожая на мою сестру', 'охранник в старой форме без нашивок', 'мальчик лет десяти', 'человек, очень похожий на меня самого', 'старик с газетой'];
  def({
    id: 'SCP-LF-136', name: 'Пустое кресло', cls: 'Безопасный', kind: 'cognitive', temper: 'cognitive', room: 'cell136', obs: 'obs136', model: 'chair', knowledge0: 20,
    desc: 'Офисное кресло 1970-х годов. Люди поблизости иногда видят в нём сидящего человека. Каждый описывает фигуру по-своему, часто — как знакомого.',
    contain: 'Кресло развёрнуто к стене. Наблюдатели чередуются. Описания фигуры записываются независимо.',
    triggers: 'пребывание рядом с креслом',
    rules: {},
    props: [['figure', 'наблюдатели видят в кресле сидящего человека', null, true], ['observer_specific', 'описания фигуры у разных наблюдателей не совпадают'], ['not_recorded', 'камеры фигуру не фиксируют'], ['memory_based', 'фигура строится из воспоминаний наблюдателя']],
    exps: [{ id: 'witness_compare', name: 'Сравнение описаний', desc: 'Три наблюдателя независимо описывают фигуру.', dur: 20 }, { id: 'camera_chair', name: 'Камера на кресло', desc: 'Запись во время свидетельства.', dur: 10 }],
    init(w, a) { if (!a.st.statements) a.st.statements = []; },
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.006);
      for (const r of exposeRooms(w, a, gm, 0.8, 0.2)) {
        if (w.rng.chance(0.02 * gm)) {
          const k = H.known(w, r.s.id, w.rng), desc = w.rng.chance(0.5) && k ? 'человек, похожий на ' + k.shortName : H.pick(w, FIG);
          a.st.statements.push({ t: w.now, who: r.s.id, desc }); if (a.st.statements.length > 30) a.st.statements.shift();
          if (r.s.n) r.s.n.memory.remember({ eventId: -(w.events.nextId++), time: w.now, type: EV.Sighting, roomId: r.s.roomId, text: 'В кресле ' + a.id + ' сидел ' + desc + '.', imp: 0.5, conf: 0.9, src: 'Witnessed', perceived: a.id }, w.now);
          else w.notify.push({ time: w.now, type: EV.Sighting, text: 'В кресле кто-то сидит: ' + desc + '. Моргаете — кресло пустое.' });
        }
        if (r.e >= 6 && !w.horror.has(r.s.id, 'seated_figure')) H.effect(w, a, r.s.id, { kind: 'seated_figure', cause: 'наблюдение ' + a.id, intensity: clamp(r.e / 12, 0.3, 1), dur: clamp(r.e * 40, 180, 720), end: { sleep: true }, data: { desc: H.pick(w, FIG) } });
      }
    },
    status: a => 'Описаний фигуры: ' + a.st.statements.length,
    threat: () => 4,
    truth() { return { motion: 0 }; },
    observe(w, a, who, cam) { if (cam) return 'На записи кресло пустое.'; const s = a.st.statements.slice(-3).map(x => w.nameOf(x.who) + ': «' + x.desc + '»'); return 'Кресло развёрнуто к стене. ' + (s.length ? 'Последние описания: ' + s.join('; ') + '.' : 'Описаний пока нет.'); },
    experiment(w, a, id) {
      if (id === 'witness_compare') return a.st.statements.length >= 2 ? { text: 'Описания не совпадают: ' + a.st.statements.slice(-3).map(x => '«' + x.desc + '»').join(', ') + '. Двое назвали фигуру знакомой.', reveal: ['observer_specific', 'memory_based'] } : { text: 'Описаний пока недостаточно.', knowledge: 1 };
      if (id === 'camera_chair') return { text: 'Во время свидетельства наблюдателя кресло на записи пустое.', reveal: ['not_recorded'] };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-137 «Последняя смена»
  def({
    id: 'SCP-LF-137', name: 'Последняя смена', cls: 'Евклид', kind: 'cognitive', temper: 'cognitive', room: 'cell137', obs: 'obs137', model: 'punch', knowledge0: 15,
    desc: 'Табельный аппарат с карточками. Находящиеся рядом начинают чувствовать, что уже проживали этот рабочий день, и «вспоминают» выполненные задания, которых не выполняли.',
    contain: 'Сотрудникам с активными заданиями не приближаться ближе 10 м. Выполнение заданий у пострадавших сверять с журналом SCP LIFE.',
    triggers: 'нахождение рядом во время смены; отметка карточки',
    rules: {},
    props: [['deja_vu', 'пострадавшие ощущают повтор прошедшего рабочего дня', null, true], ['false_completion', 'пострадавшие уверены, что выполнили задания, которых не выполняли', { verifyTasks: true }], ['sleep_resets', 'сон полностью снимает эффект']],
    exps: [{ id: 'self_vs_log', name: 'Самоотчёт против журнала', desc: 'Сравнить ответы пострадавших с журналом заданий.', dur: 20 }, { id: 'sleep', name: 'Контроль после сна', desc: 'Опрос пострадавших после сна.', dur: 15 }],
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.01);
      for (const r of exposeRooms(w, a, gm, 1, 0.25)) if (r.e >= 5 && !w.horror.has(r.s.id, 'false_completion')) {
        H.effect(w, a, r.s.id, { kind: 'false_completion', cause: 'нахождение рядом с ' + a.id, intensity: 0.7, dur: 900, end: { sleep: true }, data: {} });
        if (r.s.n) { r.s.n.falseDone = true; r.s.n.addHistory(w.now, 'Уверен, что уже выполнил сегодняшние задания (' + a.id + ')', 'anomaly', a.id); }
      }
    },
    status: a => 'Под воздействием: ' + Object.keys(a.st.exp || {}).filter(k => a.st.exp[k] >= 5).length,
    threat: () => 10,
    truth() { return { motion: 0, sound: 0.05 }; },
    observe(w, a, who) { if (who === 'player') H.expose(w, a, { id: 'player', psy: w.player.psy }, 1.5); return 'Табельный аппарат. Стрелка часов на нём стоит на 07:00. Карточка в прорези отмечена вчерашней датой — вашим почерком?'; },
    experiment(w, a, id) {
      if (id === 'self_vs_log') { const n = w.npcs.filter(x => x.falseDone).length; return n ? { text: n + ' пострадавших сообщили о выполненных заданиях, которые по журналу не выполнены.', reveal: ['false_completion'] } : { text: 'Пострадавших сейчас нет — сравнивать не с чем.', knowledge: 1 }; }
      if (id === 'sleep') return { text: 'После сна пострадавшие правильно описывают, что сделано, а что нет.', reveal: ['sleep_resets'] };
      return { text: '' };
    }
  });

  // ================================================================== SCP-LF-138 «Наблюдатель»
  def({
    id: 'SCP-LF-138', name: 'Наблюдатель', cls: 'Евклид', kind: 'cognitive', temper: 'cognitive', room: 'cell138', obs: 'obs138', model: 'void', knowledge0: 10,
    desc: 'Объект ни разу не был увиден прямо. Находящиеся рядом с его тёмной камерой испытывают ощущение постоянного наблюдения и замечают движение на краю поля зрения.',
    contain: 'Освещение наблюдательного пункта не отключать. Сеансы — только вдвоём. Оператор камеры К-138 во время сеанса смотрит на трансляцию.',
    triggers: 'темнота; одиночество; отсутствие наблюдения со стороны',
    rules: { pairOnly: true, lightsOn: true },
    props: [['peripheral', 'у находящихся рядом возникает движение на краю зрения и ощущение слежки', null, true], ['darkness_amplifies', 'в темноте воздействие усиливается втрое', { lightsOn: true }], ['watched_suppresses', 'если за человеком наблюдает другой человек или оператор камеры, эффект ослабевает', { operatorWatch: true }], ['cold_spot', 'единственный объективный признак — холодное пятно −2 °C у дальней стены']],
    exps: [{ id: 'peripheral_test', name: 'Тест периферийного зрения', desc: 'Испытуемый фиксирует взгляд на точке, отмечает движения.', dur: 15 }, { id: 'camera_watch', name: 'Наблюдение оператором', desc: 'Сравнить жалобы при включённой и выключенной трансляции.', dur: 20 }, { id: 'light_level', name: 'Уровень освещения', desc: 'Сеанс при полном и приглушённом свете.', dur: 15 }, { id: 'thermal', name: 'Тепловизор', desc: 'Снять камеру тепловизором.', dur: 10 }],
    tick(w, a, dt, gm) {
      if (gm <= 0) return; H.decay(a, gm, 0.008);
      const obs = w.fac.room(a.obsRoom), dark = obs && (!obs.lightsOn || !w.infra || !w.infra.isPowered(obs.id)) ? 3 : 1;
      const watched = w.cams.some(c => c.roomId === a.obsRoom && c.watchedBy && w.realTime - c.watchedAt < 3);
      for (const r of exposeRooms(w, a, gm, 1, 0.25 * dark * (watched ? 0.3 : 1), s => H.alone(w, s.id, 6) || dark > 1)) if (r.e >= 5 && !w.horror.has(r.s.id, 'peripheral')) H.effect(w, a, r.s.id, { kind: 'peripheral', cause: 'нахождение у камеры ' + a.id, intensity: clamp(r.e / 10, 0.3, 1), dur: clamp(r.e * 45, 180, 900), end: { sleep: true, company: true }, data: {} });
    },
    status: a => 'Под воздействием: ' + Object.keys(a.st.exp || {}).filter(k => a.st.exp[k] >= 5).length,
    threat: () => 10,
    truth() { return { motion: 0, temp: 17.8 }; },
    observe(w, a, who, cam) { return cam ? 'Трансляция: тёмная пустая камера. Шумы матрицы.' : 'Камера темна. Ничего не видно, но затылок покалывает, как от чужого взгляда.'; },
    experiment(w, a, id) {
      if (id === 'peripheral_test') return { text: 'Испытуемый отметил 14 движений «слева, на краю». Видеозапись движений не содержит.', knowledge: 6 };
      if (id === 'camera_watch') return { text: 'При активном наблюдении оператора жалоб в 3 раза меньше.', reveal: ['watched_suppresses'] };
      if (id === 'light_level') return { text: 'При приглушённом свете ощущение слежки возникло за 2 минуты вместо 7.', reveal: ['darkness_amplifies'] };
      if (id === 'thermal') return { text: 'Тепловизор: холодное пятно −2 °C у дальней стены, неподвижное. Других признаков нет.', reveal: ['cold_spot'] };
      return { text: '' };
    }
  });

  // ================================================================== arriving objects
  def({
    id: 'SCP-LF-159', name: 'Тёплый камень', cls: 'Безопасный', kind: 'object', temper: 'passive', room: null, obs: null, model: 'stone', arrived: false, knowledge0: 5,
    desc: 'Гладкий базальтовый валун массой 40 кг, постоянно тёплый (≈41 °C). Поступил из филиала «Восток-2» после закрытия объекта. Рядом с ним люди быстрее успокаиваются.',
    contain: 'Стандартная камера. Контроль температуры. Не оставлять рядом легковоспламеняющиеся материалы.',
    triggers: 'одиночество: температура камня растёт, когда рядом никого нет',
    rules: {},
    origin: 'Филиал «Восток-2» (закрытие объекта)',
    props: [['warm', 'камень постоянно тёплый', null, true], ['lonely_heat', 'без людей рядом температура растёт до 60 °C, при людях снижается'], ['soothes', 'рядом с камнем стресс снижается быстрее']],
    exps: [{ id: 'temp_log', name: 'Журнал температуры', desc: 'Сутки записи температуры и присутствия людей.', dur: 20 }, { id: 'calm_test', name: 'Сеанс у камня', desc: 'Сотрудник 20 минут рядом с камнем.', dur: 25 }],
    init(w, a) { if (a.st.temp == null) a.st.temp = 41; },
    tick(w, a, dt, gm) {
      if (!a.containRoom) return; const near = H.subjects(w, [a.containRoom, a.obsRoom].filter(Boolean));
      a.st.temp = clamp(a.st.temp + (near.length ? -0.05 : 0.02) * gm, 38, 62);
      for (const s of near) if (s.n) s.n.needs.stress = Math.max(0, s.n.needs.stress - 0.1 * gm); else w.player.psy.stress = Math.max(0, w.player.psy.stress - 0.1 * gm);
      if (a.st.temp > 58 && !a.st.warned) { a.st.warned = true; H.post(w, a, 1, EV.ContainmentWarning, 'Датчик температуры камеры ' + a.id + ': ' + a.st.temp.toFixed(1) + ' °C.'); } if (a.st.temp < 50) a.st.warned = false;
    },
    status: a => a.arrived ? Math.round(a.st.temp) + ' °C' : 'Ожидается поступление',
    threat: a => a.st.temp > 55 ? 30 : 5,
    truth(w, a) { return { temp: a.st.temp || 41 }; },
    observe(w, a) { return 'Тёмный валун, от него идёт ощутимое тепло. Термометр: ' + (a.st.temp || 41).toFixed(1) + ' °C.'; },
    experiment(w, a, id) {
      if (id === 'temp_log') return { text: 'Температура росла на 1 °C в час без людей и падала при их присутствии.', reveal: ['lonely_heat'] };
      if (id === 'calm_test') return { text: 'Стресс наблюдателя снизился вдвое быстрее, чем в контрольной комнате.', reveal: ['soothes'] };
      return { text: '' };
    }
  });
  def({
    id: 'SCP-LF-160', name: 'Шкатулка-эхо', cls: 'Безопасный', kind: 'object', temper: 'passive', room: null, obs: null, model: 'box', arrived: false, knowledge0: 5,
    desc: 'Музыкальная шкатулка. Вместо мелодии воспроизводит последние фразы, сказанные рядом с ней, — иногда фразы, которые ещё не были сказаны. Изъята при полевой операции МОГ.',
    contain: 'Стандартная камера. Записывать воспроизведения. Не обсуждать секретные данные в радиусе 5 м.',
    triggers: 'разговоры поблизости',
    rules: {},
    origin: 'Полевая операция МОГ «Ключ-9»',
    props: [['echo', 'шкатулка повторяет фразы, сказанные рядом', null, true], ['ahead', 'иногда повторяет фразы за несколько минут до того, как их скажут']],
    exps: [{ id: 'phrase', name: 'Контрольная фраза', desc: 'Произнести контрольную фразу и ждать воспроизведения.', dur: 15 }],
    init(w, a) { if (!a.st.heard) a.st.heard = []; },
    tick(w, a, dt, gm) { if (!a.containRoom) return; for (const s of H.subjects(w, [a.containRoom, a.obsRoom].filter(Boolean))) if (s.n && s.n.bark && w.rng.chance(0.02 * dt)) { a.st.heard.push({ t: w.now, text: s.n.bark }); if (a.st.heard.length > 10) a.st.heard.shift(); } },
    status: a => a.arrived ? 'Записей: ' + a.st.heard.length : 'Ожидается поступление',
    threat: () => 3,
    truth() { return { sound: 0.1 }; },
    observe(w, a) { const h = a.st.heard[a.st.heard.length - 1]; return 'Крышка шкатулки приоткрыта. ' + (h ? 'Тонкий металлический голос: «' + h.text + '»' : 'Тихо.'); },
    experiment(w, a, id) { return id === 'phrase' ? { text: 'Шкатулка произнесла контрольную фразу за 40 секунд до того, как её сказали вслух.', reveal: ['ahead'] } : { text: '' }; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
