/* SCP LIFE — GAMEPLAY: interactive repair procedures. Every fault has a hidden cause among a few plausible ones, with
   symptoms; diagnosis (fault log, inspection, multimeter, test run) reveals clues; the right fix needs the right tool or
   spare part from the engineering store; working on live equipment can end in an electric shock, and cutting the power
   really darkens the room; a wrong fix wastes time or a part; only a verification closes the job. Tightening,
   calibrating and load balancing are short timing mini-games on the screen. NPC technicians run the same procedure,
   with mistakes that depend on their skill and fatigue, and walk to the store for parts. */
(function (root) {
  'use strict';
  const S = root.SCP, { clamp, EV, fmtStamp } = S;

  const ACT = {
    logbook: { label: 'Журнал неисправностей', sec: 1.5, diag: true },
    inspect: { label: 'Осмотреть', sec: 2, diag: true },
    measure: { label: 'Замерить мультиметром', sec: 2.5, diag: true, tool: 'мультиметр' },
    test: { label: 'Проверить в работе', sec: 2, diag: true, live: true },
    power: { label: 'Обесточить участок', sec: 1.5, safety: true },
    tighten: { label: 'Подтянуть контакты', sec: 3, fix: true, tool: 'набор инструментов', touch: true, mini: 'torque' },
    replace: { label: 'Заменить деталь', sec: 3.5, fix: true, tool: 'набор инструментов', touch: true },
    rebalance: { label: 'Перераспределить нагрузку', sec: 2.5, fix: true, touch: true, mini: 'balance' },
    clean: { label: 'Почистить и продуть', sec: 3, fix: true, tool: 'набор инструментов', touch: true },
    reset: { label: 'Перезапустить контроллер', sec: 2, fix: true },
    calibrate: { label: 'Откалибровать', sec: 3.5, fix: true, tool: 'калибратор', mini: 'needle' },
    lubricate: { label: 'Смазать и отрегулировать', sec: 3, fix: true, tool: 'набор инструментов', touch: true },
    reseal: { label: 'Заменить уплотнитель', sec: 4, fix: true, tool: 'набор инструментов', touch: true },
    verify: { label: 'Проверить результат', sec: 2, verify: true }
  };
  // timing mini-games: a marker runs along a bar, the player stops it inside the green zone
  const MINI = {
    torque: { name: 'Момент затяжки', zone: 0.24, speed: 0.85, fail: 'перетянули клемму — нужно ослабить и затянуть заново' },
    needle: { name: 'Стрелка калибратора', zone: 0.14, speed: 0.7, fail: 'стрелка вышла из зоны — калибровка неточная' },
    balance: { name: 'Нагрузка по фазам', zone: 0.2, speed: 0.8, fail: 'фазы перекошены — автомат выбило, свет моргнул' }
  };
  const C = (id, name, clues, fix, part, elec) => ({ id, name, clues, fix, part: part || null, elec: !!elec });
  // per fault kind: symptom, fixes on offer (the right one depends on the hidden cause), causes with their clues
  const KINDS = {
    light: { sym: 'свет мигает', elec: true, fixes: ['tighten', 'replace', 'rebalance'], causes: [
      C('contact', 'ослабший контакт в щитке', { inspect: 'клеммы потемнели, одна тёплая на ощупь', measure: 'напряжение «плавает»: 190–235 В', test: 'мигание усиливается, если постучать по щитку' }, 'tighten', null, true),
      C('driver', 'сгоревший драйвер светильника', { inspect: 'щиток в порядке, у одного светильника потемнел корпус', measure: 'напряжение в норме', test: 'мигает один светильник, остальные горят ровно' }, 'replace', 'драйвер светильника', true),
      C('overload', 'перегрузка линии', { inspect: 'автомат горячий, запах пластика', measure: 'ток выше нормы на треть', test: 'мигание сильнее, когда включены приборы' }, 'rebalance', null, true)] },
    panel: { sym: 'щиток перегревается', elec: true, fixes: ['tighten', 'replace', 'rebalance'], causes: [
      C('contact', 'подгоревший контакт шины', { inspect: 'потемнение на шине', measure: 'падение напряжения на контакте', test: 'нагрев в одной точке' }, 'tighten', null, true),
      C('breaker', 'изношенный автомат', { inspect: 'корпус автомата оплавлен', measure: 'автомат греется без нагрузки', test: 'щелчки внутри автомата' }, 'replace', 'автомат защиты', true),
      C('overload', 'перегрузка', { inspect: 'все автоматы тёплые', measure: 'суммарный ток на пределе', test: 'нагрев растёт с нагрузкой' }, 'rebalance', null, true)] },
    camera: { sym: 'нет сигнала с камеры', fixes: ['tighten', 'replace', 'reset'], causes: [
      C('cable', 'повреждён кабель', { inspect: 'кабель перетёрт у кронштейна', measure: 'обрыв линии', test: 'изображение появляется, если пошевелить кабель' }, 'tighten', null, true),
      C('module', 'вышел из строя модуль камеры', { inspect: 'индикатор на камере не горит', measure: 'питание до камеры доходит', test: 'камера не отвечает на команды' }, 'replace', 'модуль камеры', true),
      C('freeze', 'завис контроллер камеры', { inspect: 'индикатор мигает часто', measure: 'питание и линия в норме', logbook: 'в журнале — ошибка прошивки' }, 'reset')] },
    reader: { sym: 'считыватель сбоит', fixes: ['clean', 'reset', 'replace'], causes: [
      C('dirty', 'загрязнены контакты считывателя', { inspect: 'на окне считывателя налёт', test: 'карта срабатывает со второго-третьего раза' }, 'clean'),
      C('firmware', 'завис контроллер замка', { inspect: 'снаружи всё чисто', logbook: 'в журнале — повторяющаяся ошибка 0x2F', test: 'считыватель не реагирует вовсе' }, 'reset'),
      C('solenoid', 'неисправен соленоид замка', { inspect: 'слышен слабый щелчок', measure: 'на соленоид подаётся ток, ход не полный', test: 'карта принимается, но замок не открывается' }, 'replace', 'соленоид замка', true)] },
    sensor: { sym: 'датчик камеры даёт странные показания', fixes: ['calibrate', 'replace', 'tighten'], causes: [
      C('drift', 'дрейф калибровки', { logbook: 'показания медленно уходят', test: 'датчик реагирует, но с ошибкой' }, 'calibrate'),
      C('stuck', 'датчик залип', { logbook: 'показания не меняются часами', test: 'на контрольный сигнал не реагирует' }, 'replace', 'датчик', true),
      C('spike', 'наводки на линии', { inspect: 'кабель датчика проложен рядом с силовым', measure: 'шум на линии', logbook: 'всплески в случайные моменты' }, 'tighten', null, true)] },
    vent: { sym: 'вентиляция остановилась', fixes: ['clean', 'replace', 'reset'], causes: [
      C('debris', 'в вентилятор попал мусор', { inspect: 'в решётке застрял пакет и пыль', test: 'вентилятор дёргается и встаёт' }, 'clean'),
      C('motor', 'перегорел двигатель вентилятора', { inspect: 'запах горелой изоляции', measure: 'обмотка в обрыве', test: 'двигатель гудит, не крутится' }, 'replace', 'двигатель вентилятора', true),
      C('relay', 'залипло реле управления', { inspect: 'механика в порядке', logbook: 'команда на пуск не проходит', measure: 'на двигатель питание не приходит' }, 'reset')] },
    humidity: { sym: 'растёт влажность', fixes: ['reseal', 'replace', 'reset'], causes: [
      C('leak', 'течь в трубопроводе', { inspect: 'капли на потолке у стыка трубы', test: 'влажность растёт и при выключенном оборудовании' }, 'reseal'),
      C('dryer', 'вышел из строя осушитель', { inspect: 'осушитель не гудит', measure: 'на осушитель питание есть', test: 'бак осушителя пустой' }, 'replace', 'компрессор осушителя', true),
      C('control', 'сбой контроллера климата', { logbook: 'контроллер отключил осушитель по ошибке датчика' }, 'reset')] },
    shield: { sym: 'ослабло экранирование', fixes: ['replace', 'tighten', 'calibrate'], causes: [
      C('plate', 'деградировали экранирующие пластины', { inspect: 'пятна коррозии на пластинах', measure: 'экран пропускает больше нормы' }, 'replace', 'экранирующая пластина'),
      C('ground', 'нарушено заземление экрана', { inspect: 'шина заземления отошла', measure: 'потенциал экрана плавает' }, 'tighten', null, true),
      C('generator', 'сбилась настройка генератора поля', { logbook: 'частота генератора ушла', measure: 'поле нестабильно' }, 'calibrate')] },
    lift: { sym: 'лифт не идёт', fixes: ['lubricate', 'reset', 'replace'], causes: [
      C('interlock', 'не срабатывает блокировка дверей', { inspect: 'створка не доходит до упора', test: 'лифт стоит с «открытыми» дверями' }, 'lubricate'),
      C('controller', 'ошибка контроллера лифта', { logbook: 'ошибка E7 после скачка напряжения', test: 'кнопки не отвечают' }, 'reset'),
      C('brake', 'изношены колодки тормоза', { inspect: 'металлическая пыль у тормоза', test: 'лифт дёргается и встаёт' }, 'replace', 'тормозные колодки')] },
    gen: { sym: 'неисправен генератор', elec: true, fixes: ['clean', 'replace', 'reset'], causes: [
      C('filter', 'забит топливный фильтр', { inspect: 'грязь в отстойнике', test: 'обороты падают под нагрузкой' }, 'clean'),
      C('starter', 'неисправен стартер', { measure: 'стартер не держит ток', test: 'генератор не заводится, щелчок' }, 'replace', 'стартер генератора', true),
      C('ecu', 'сбой блока управления', { logbook: 'аварийный останов по ложному сигналу', test: 'запускается и сразу глохнет' }, 'reset')] },
    door: { sym: 'дверь заклинило', fixes: ['lubricate', 'reset', 'replace'], causes: [
      C('track', 'перекошена направляющая', { inspect: 'створка трётся о направляющую, свежие царапины', test: 'идёт рывками и встаёт' }, 'lubricate'),
      C('drive', 'привод двери ушёл в защиту', { logbook: 'привод отключился по перегрузке', test: 'мотор не включается' }, 'reset'),
      C('belt', 'порван приводной ремень', { inspect: 'обрывки ремня в кожухе', test: 'мотор крутится, створка стоит' }, 'replace', 'приводной ремень', true)] },
    terminal: { sym: 'терминал не отвечает', elec: true, fixes: ['reset', 'replace', 'tighten'], causes: [
      C('hang', 'зависла система', { inspect: 'экран застыл, индикатор диска горит постоянно', logbook: 'последняя запись — переполнение памяти' }, 'reset'),
      C('psu', 'сгорел блок питания терминала', { inspect: 'терминал не включается, запах гари', measure: 'на выходе блока питания ноль' }, 'replace', 'блок питания терминала', true),
      C('link', 'нет связи с сервером', { inspect: 'терминал работает, сеть недоступна', measure: 'сетевой кабель в обрыве' }, 'tighten')] },
    cooling: { sym: 'перегревается серверная', fixes: ['clean', 'replace', 'reset'], causes: [
      C('dust', 'забиты фильтры кондиционера', { inspect: 'фильтры серые от пыли', test: 'поток воздуха слабый' }, 'clean'),
      C('compressor', 'неисправен компрессор', { inspect: 'компрессор не гудит', measure: 'обмотка компрессора в обрыве' }, 'replace', 'компрессор кондиционера', true),
      C('setpoint', 'сбита уставка климат-контроля', { logbook: 'уставка 35 °C вместо 20 °C', test: 'кондиционер работает вполсилы' }, 'reset')] },
    emlight: { sym: 'не работает аварийное освещение', elec: true, fixes: ['replace', 'tighten', 'reset'], causes: [
      C('battery', 'разряжены аккумуляторы аварийных светильников', { test: 'при отключении сети светильники гаснут через секунды', measure: 'напряжение батарей низкое' }, 'replace', 'аккумулятор аварийного света'),
      C('line', 'обрыв линии аварийного освещения', { inspect: 'кабель повреждён за потолочной панелью', measure: 'линия в обрыве' }, 'tighten', null, true),
      C('module', 'сбой модуля переключения', { logbook: 'модуль не переключается на резерв' }, 'reset')] }
  };
  const PARTS = [...new Set(Object.values(KINDS).flatMap(k => k.causes.map(c => c.part)).filter(Boolean))];
  const STORES = ['engStore', 'storage', 'storage4'];
  const TECH = ['technician', 'electrician', 'mechanic', 'containment_engineer', 'sysadmin'];
  const MAX_ITEMS = 4;

  // a hidden cause when a fault appears (older saves get one lazily)
  function seed(w, f) { const K = KINDS[f.kind]; if (!K || f.cause) return f; f.cause = K.causes[w.rng.int(0, K.causes.length)].id; f.clues = []; f.repaired = false; f.powerOff = false; f.tries = 0; f.misses = 0; return f; }
  const causeOf = f => { const K = KINDS[f.kind]; return K ? K.causes.find(c => c.id === f.cause) || null : null; };
  const kindParts = kind => (KINDS[kind] ? KINDS[kind].causes.map(c => c.part).filter(Boolean) : []);
  // tools: technicians carry a toolkit and a multimeter, engineers also a calibrator; parts are carried items
  function tools(w, who) {
    const P = who === 'player', prof = P ? w.player.prof : who.prof, base = TECH.indexOf(prof) >= 0 ? ['набор инструментов', 'мультиметр'] : [];
    if (prof === 'containment_engineer' || prof === 'technician' || prof === 'electrician') base.push('калибратор');
    return base.concat(P ? (w.player.items || []) : (who.carry ? [who.carry] : []));
  }
  // ---------------------------------------------------------------- store of spare parts
  function stock(w) { const I = w.infra; if (!I.stock) { I.stock = {}; for (const p of PARTS) I.stock[p] = 2; } return I.stock; }
  function takePart(w, part, who) {
    const s = stock(w); if (!(s[part] > 0)) return false;
    if (who === 'player') { const p = w.player; p.items = p.items || []; if (p.items.length >= MAX_ITEMS) return false; p.items.push(part); }
    else who.carry = part;
    s[part]--; w.infra.addLog('Склад: выдано «' + part + '» (' + (who === 'player' ? w.player.name : who.displayName) + '), осталось ' + s[part], 'store');
    return true;
  }
  function putBack(w, part) { const p = w.player, i = (p.items || []).indexOf(part); if (i < 0) return false; p.items.splice(i, 1); stock(w)[part] = (stock(w)[part] || 0) + 1; return true; }
  // daily delivery; costs materials from the facility budget when there are any
  function resupply(w) {
    const s = stock(w), got = []; const res = w.life && w.life.res;
    for (const p of PARTS) if ((s[p] || 0) < 2 && (!res || res.materials > 0)) { s[p] = (s[p] || 0) + 1; got.push(p); if (res) res.materials--; }
    if (got.length) w.infra.addLog('Склад инженерной службы: поступили ' + got.join(', '), 'store');
    for (const f of w.infra.faults) if (!f.fixed && f.waitPart && got.indexOf(f.waitPart) >= 0) { f.wait = 0; f.waitPart = null; }
    return got;
  }

  // cutting the power of the site is a real outage of that room: lights go out until it is switched back on
  function setPower(w, f, off, who) {
    const I = w.infra; f.powerOff = off;
    I.outages = I.outages.filter(o => o.fault !== f.id);
    if (off) I.outages.push({ from: w.now, to: w.now + 1e6, rooms: [f.site], fault: f.id, vent: false, by: who === 'player' ? 'player' : who.id });
    f.lastAct = w.now; f.lastBy = who === 'player' ? 'player' : who.id;
  }

  function options(w, f, who) {
    const K = KINDS[f.kind]; if (!K) return [];
    seed(w, f);
    const have = tools(w, who), ids = ['logbook', 'inspect', 'measure', 'test', 'power'].concat(K.fixes, ['verify']);
    return ids.map(id => ({ id, label: id === 'power' && f.powerOff ? 'Подать питание' : ACT[id].label, sec: ACT[id].sec, mini: ACT[id].mini || null, missing: ACT[id].tool && have.indexOf(ACT[id].tool) < 0 ? ACT[id].tool : null, seen: !!ACT[id].diag && f.clues.indexOf(id) >= 0 }));
  }
  // one action: returns { text, ok, done, hurt, miss, needPart } and changes the world
  function act(w, f, who, id, opt) {
    opt = opt || {}; seed(w, f);
    const K = KINDS[f.kind], c = causeOf(f), A = ACT[id], P = who === 'player', name = P ? w.player.name : who.displayName, wid = P ? 'player' : who.id;
    if (!K || !c || !A) return { text: '' };
    if (f.fixed) return { text: 'неисправность уже устранена', done: true, ok: true };
    const have = tools(w, who); if (A.tool && have.indexOf(A.tool) < 0) return { text: 'нужен инструмент: ' + A.tool };
    f.lastAct = w.now; f.lastBy = wid;
    if (A.diag) {
      if (A.live && f.powerOff) return { text: 'участок обесточен — проверить в работе нельзя' };
      const clue = c.clues[id] || (id === 'logbook' ? 'записано: «' + K.sym + '» с ' + fmtStamp(f.since) + (f.knownBy ? ', сообщил ' + f.knownBy : '') : 'ничего необычного');
      if (f.clues.indexOf(id) < 0) f.clues.push(id);
      return { text: A.label + ': ' + clue };
    }
    if (A.safety) { setPower(w, f, !f.powerOff, who); return { text: f.powerOff ? 'участок обесточен — в помещении погас свет' : 'питание подано' }; }
    if (A.fix) {
      f.tries++;
      const live = !f.powerOff && (c.elec || K.elec);
      if (A.touch && live && w.rng.chance(P ? 0.4 : opt.risk != null ? opt.risk : 0.1)) {
        S.Med.hurt(w, wid, P ? 10 : 12, 'shock', null, name + ': удар током при работе под напряжением');
        return { text: 'Удар током! Работа под напряжением.', hurt: true };
      }
      if (A.touch && !c.elec && !f.powerOff && (f.kind === 'vent' || f.kind === 'cooling' || f.kind === 'lift' || f.kind === 'door') && w.rng.chance(P ? 0.2 : 0.05)) {
        S.Med.hurt(w, wid, 8, 'cut', null, name + ': механизм провернулся под руками');
        return { text: 'Механизм провернулся под руками — порез. Сначала обесточьте участок.', hurt: true };
      }
      if (A.mini && opt.miss) {
        f.misses++;
        if (A.mini === 'balance') w.infra.outages.push({ from: w.now, to: w.now + 1.5, rooms: [f.site], vent: false });
        return { text: A.label + ': ' + MINI[A.mini].fail, miss: true };
      }
      if (id === 'replace') {
        const want = kindParts(f.kind), carried = P ? (w.player.items || []).filter(x => want.indexOf(x) >= 0) : (who.carry && want.indexOf(who.carry) >= 0 ? [who.carry] : []);
        if (!carried.length) return { text: 'нет подходящей детали. Для «' + K.sym + '» бывают нужны: ' + want.join(', ') + ' — склад инженерной службы', needPart: c.fix === 'replace' ? c.part : want[0] || null };
        const part = c.fix === 'replace' && carried.indexOf(c.part) >= 0 ? c.part : carried[0];
        if (P) w.player.items.splice(w.player.items.indexOf(part), 1); else who.carry = null;
        if (c.fix !== 'replace' || part !== c.part) return { text: 'Установлена новая деталь («' + part + '») — не помогло, симптомы те же. Деталь потрачена.' };
      } else if (id !== c.fix) return { text: A.label + ': не помогло — симптомы те же' };
      f.repaired = true; return { text: A.label + ': сделано. Нужна проверка.' };
    }
    if (A.verify) {
      if (f.powerOff) return { text: 'Проверка невозможна: участок обесточен — подайте питание' };
      if (!f.repaired) return { text: 'Проверка: ' + K.sym + ' — неисправность сохраняется' };
      w.infra.fix(f.id, wid); f.solvedBy = wid; f.solution = c.name;
      w.infra.addLog('Причина ' + f.id + ': ' + c.name + ' (действий: ' + f.tries + (f.misses ? ', ошибок: ' + f.misses : '') + ')', 'fix');
      return { text: 'Проверка пройдена: ' + c.name + ' — устранено.', ok: true, done: true };
    }
    return { text: '' };
  }
  // NPC technicians: one decision per call, by skill; returns { min, needPart, done }
  function skillOf(n) { return clamp(0.45 + ((n.traits && n.traits.diligence) || 0.5) * 0.4 + (n.level >= 3 ? 0.1 : 0) - n.psy.fatigue / 300 - n.psy.fear / 400, 0.2, 0.95); }
  function npcStep(w, n, f) {
    seed(w, f); const c = causeOf(f), K = KINDS[f.kind]; if (!c || f.fixed) return { min: 0, done: true };
    const skill = skillOf(n); let id;
    const diagOrder = ['logbook', 'inspect', 'measure', 'test'].filter(x => f.clues.indexOf(x) < 0 && (x !== 'test' || !f.powerOff));
    if (!f.repaired) {
      const diagnosed = f.clues.some(x => c.clues[x]) && f.clues.length >= 2;
      if (!diagnosed && diagOrder.length) id = diagOrder[0];
      else if ((c.elec || K.elec) && !f.powerOff && ACT[c.fix].touch && w.rng.chance(skill)) id = 'power';
      else id = w.rng.chance(skill) ? c.fix : K.fixes[w.rng.int(0, K.fixes.length)];
    } else id = f.powerOff ? 'power' : 'verify';
    const miss = ACT[id].mini ? !w.rng.chance(skill) : false;
    const r = act(w, f, n, id, { miss, risk: 0.15 * (1 - skill) });
    if (r.needPart) return { min: 1, needPart: r.needPart };
    return { min: Math.max(1, ACT[id].sec * 1.6), done: !!r.done, text: r.text };
  }
  S.Proc = { ACT, MINI, KINDS, PARTS, STORES, TECH, MAX_ITEMS, seed, causeOf, kindParts, options, act, npcStep, tools, stock, takePart, putBack, resupply, setPower, skillOf };
})(typeof window !== 'undefined' ? window : globalThis);
