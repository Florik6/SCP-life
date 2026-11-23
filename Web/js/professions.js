/* SCP LIFE 2.0 — professions, departments, duties and careers. */
(function (root) {
  'use strict';
  const S = root.SCP, P = S.P;

  const DEPTS = {
    science: { name: 'Научный отдел', head: 'research_director' }, security: { name: 'Служба безопасности', head: 'shift_chief' }, mtf: { name: 'МОГ «Ключ-9»', head: 'mtf_commander' },
    engineering: { name: 'Инженерная служба', head: 'dept_head' }, medical: { name: 'Медицинская служба', head: 'psychiatrist' }, admin: { name: 'Администрация', head: 'director' },
    service: { name: 'Хозяйственная служба', head: 'dept_head' }, dclass: { name: 'Класс D', head: 'shift_chief' }
  };

  // look: appearance of the procedural model. duties: task kinds the role receives (player and NPC).
  // work: rooms where the role works; home: where staff of the role sleep.
  const R = (id, name, dept, level, perms, look, work, duties, extra) => Object.assign({ id, name, dept, level, perms, look, work, duties, home: 'quarters', shifts: ['day'], next: [], lateral: [], entry: false, desc: '' }, extra || {});
  const SCI = P.Research, SEC = P.Security | P.DClassBlock | P.Surveillance, ENG = P.Engineering, MED = P.Medical | P.DClassBlock;
  const LIST = [
    R('lab_assistant', 'Лаборант', 'science', 1, SCI, 'Scientist', ['labC', 'lab', 'lab2'], ['prepare_samples', 'deliver_samples', 'assist_session'], { entry: true, next: ['junior_researcher'], desc: 'Готовит образцы, переносит пробы между лабораториями, помогает на сеансах наблюдения.' }),
    R('junior_researcher', 'Младший исследователь', 'science', 2, SCI, 'Scientist', ['officesC', 'labC'], ['observe_scp', 'write_report', 'assist_session'], { entry: true, next: ['scientist'], lateral: ['biologist'], desc: 'Наблюдает за объектами, ведёт записи и пишет первичные отчёты.' }),
    R('scientist', 'Учёный', 'science', 3, SCI | P.Containment, 'Scientist', ['officesC', 'labC', 'lab'], ['observe_scp', 'experiment', 'write_report', 'counting_session'], { next: ['senior_scientist'], lateral: ['biologist', 'anomaly_psychologist', 'memetics'], desc: 'Проводит эксперименты по утверждённым заявкам, сеансы счёта и пишет научные отчёты.' }),
    R('senior_scientist', 'Старший учёный', 'science', 3, SCI | P.Containment | P.Records, 'Scientist', ['officesC', 'lab'], ['experiment', 'review_reports', 'counting_session', 'interview_scp'], { next: ['research_director'], desc: 'Руководит экспериментами, проверяет отчёты младших сотрудников, ведёт беседы с разумными объектами.' }),
    R('biologist', 'Биолог', 'science', 3, SCI | P.Containment | P.Medical, 'Scientist', ['lab2', 'labC'], ['prepare_samples', 'experiment', 'write_report'], { lateral: ['scientist'], desc: 'Работает с биологическими объектами и пробами: LF-125, LF-128, образцы карантина.' }),
    R('anomaly_psychologist', 'Психолог аномалий', 'science', 3, SCI | P.Medical | P.Containment, 'Scientist', ['officesC', 'medA'], ['psych_eval', 'interview_scp', 'write_report'], { lateral: ['scientist', 'psychiatrist'], desc: 'Опрашивает сотрудников, переживших когнитивные воздействия, и ведёт беседы с разумными объектами.' }),
    R('memetics', 'Специалист по меметике', 'science', 3, SCI | P.Containment | P.Records, 'Scientist', ['officesC', 'archiveA'], ['records_audit', 'exposure_check', 'write_report'], { lateral: ['scientist'], desc: 'Следит за когнитивными угрозами: аудит записей (LF-121), проверки воздействия LF-133–138.' }),
    R('research_director', 'Руководитель исследований', 'science', 4, SCI | P.Containment | P.Records | P.Command, 'Scientist', ['officesC', 'meeting'], ['approve_research', 'review_reports', 'meeting'], { desc: 'Утверждает эксперименты, назначает учёных, представляет научный отдел на совещаниях.' }),
    R('guard', 'Охранник', 'security', 2, SEC, 'Guard', ['post', 'postA', 'postC', 'reservePost', 'detHall'], ['patrol', 'camera_check', 'post_duty', 'observe_scp'], { entry: true, home: 'barracks', shifts: ['day', 'night'], next: ['security_officer'], lateral: ['patrol', 'escort', 'cctv_operator'], desc: 'Обходы, проверка камер, дежурство на посту, наблюдение за объектами.' }),
    R('patrol', 'Патрульный', 'security', 2, SEC, 'Guard', ['corrA', 'corrC', 'corr4', 'galW', 'galE', 'escD'], ['long_patrol', 'post_duty'], { home: 'barracks', shifts: ['day', 'night'], next: ['security_officer'], lateral: ['guard'], desc: 'Длинные маршруты по всем секторам, включая технические тоннели уровня 4.' }),
    R('escort', 'Конвоир D-класса', 'security', 2, SEC, 'Guard', ['postD', 'dhall', 'd3wait'], ['escort_d', 'post_duty'], { home: 'barracks', next: ['security_officer'], lateral: ['guard'], desc: 'Сопровождает заключённых класса D на испытания и обратно.' }),
    R('cctv_operator', 'Оператор видеонаблюдения', 'security', 2, SEC | P.Command, 'Guard', ['command', 'secObs'], ['camera_watch', 'camera_check'], { home: 'barracks', shifts: ['day', 'night'], next: ['security_officer'], lateral: ['guard', 'dispatcher'], desc: 'Следит за камерами в командном центре и фиксирует подозрительное.' }),
    R('security_officer', 'Офицер безопасности', 'security', 3, SEC | P.Armory | P.Records, 'Guard', ['postA', 'command', 'secCoord', 'detHall'], ['investigate', 'access_audit', 'patrol'], { home: 'barracks', next: ['shift_chief'], desc: 'Расследует происшествия, проверяет журналы доступа, контролирует дисциплину.' }),
    R('shift_chief', 'Начальник смены', 'security', 4, SEC | P.Armory | P.Records | P.Command, 'Guard', ['command', 'postA', 'secCoord'], ['assign_posts', 'investigate', 'meeting'], { home: 'barracks', desc: 'Распределяет посты, утверждает конвои, руководит реагированием.' }),
    R('operative', 'Оперативник МОГ', 'mtf', 3, SEC | P.MTF | P.Armory | P.Containment, 'MTF', ['mtfPrep', 'mtfEquip', 'mtf'], ['mtf_drill', 'standby', 'escort_arrival'], { entry: true, home: 'barracks', shifts: ['day', 'night'], next: ['mtf_commander'], lateral: ['field_medic'], desc: 'Готовность к реагированию, учения, сопровождение поступающих объектов.' }),
    R('field_medic', 'Полевой медик МОГ', 'mtf', 3, SEC | P.MTF | P.Medical | P.Containment, 'MTF', ['mtf', 'mtfMed', 'medA'], ['first_aid', 'standby', 'mtf_drill'], { home: 'barracks', lateral: ['operative', 'doctor'], desc: 'Оказывает первую помощь на месте происшествий, дежурит с группой.' }),
    R('mtf_commander', 'Командир подразделения МОГ', 'mtf', 4, SEC | P.MTF | P.Armory | P.Containment | P.Command, 'MTF', ['mtfHQ', 'mtf', 'command'], ['plan_operation', 'mtf_drill', 'meeting'], { home: 'barracks', desc: 'Планирует операции и транспортировку объектов, командует реагированием.' }),
    R('armorer', 'Оружейник', 'security', 3, SEC | P.Armory | P.Records, 'Guard', ['armory', 'mtfEquip'], ['post_duty', 'access_audit'], { home: 'barracks', lateral: ['guard', 'security_officer'], desc: 'Выдаёт и принимает оружие и спецсредства по ведомости, следит за боекомплектом и состоянием оружия.' }),
    R('technician', 'Техник', 'engineering', 2, ENG, 'Technician', ['eng', 'workshop'], ['repair', 'maintenance_round'], { entry: true, shifts: ['day', 'night'], next: ['containment_engineer'], lateral: ['electrician', 'mechanic'], desc: 'Устраняет неисправности и обходит щитки.' }),
    R('electrician', 'Электрик', 'engineering', 2, ENG, 'Technician', ['genC', 'genMain', 'eng'], ['power_check', 'repair', 'planned_maintenance'], { next: ['containment_engineer'], lateral: ['technician'], desc: 'Генераторы, щиты, плановые отключения и ремонт освещения.' }),
    R('mechanic', 'Механик', 'engineering', 2, ENG, 'Technician', ['workshop', 'pumps'], ['repair_door', 'repair', 'maintenance_round'], { next: ['containment_engineer'], lateral: ['technician'], desc: 'Замки, двери, лифты, насосы и вентиляция.' }),
    R('containment_engineer', 'Инженер систем содержания', 'engineering', 3, ENG | P.Containment, 'Technician', ['eng', 'heavyObs4'], ['calibrate_sensors', 'prepare_cell', 'repair_door'], { desc: 'Датчики камер, замки, УФ-лампы, подготовка камер для новых объектов.' }),
    R('sysadmin', 'Системный администратор', 'engineering', 3, ENG | P.Records | P.Surveillance, 'Technician', ['servers', 'command'], ['server_check', 'records_audit', 'repair_camera'], { shifts: ['day', 'night'], lateral: ['technician'], desc: 'Серверы, сеть камер, терминалы и целостность записей.' }),
    R('orderly', 'Санитар', 'medical', 1, P.Medical, 'Medic', ['medA', 'med', 'wards', 'icu'], ['transport_patient', 'clean_med', 'assist_doctor'], { entry: true, next: ['doctor'], desc: 'Помогает врачам, сопровождает пациентов, поддерживает чистоту в медблоке.' }),
    R('doctor', 'Врач', 'medical', 2, MED, 'Medic', ['medA', 'med', 'wards', 'icu'], ['treat', 'medical_exam'], { shifts: ['day', 'night'], next: ['psychiatrist'], lateral: ['field_medic'], desc: 'Лечит заболевших и пострадавших, обследует сотрудников после воздействий.' }),
    R('psychiatrist', 'Психиатр', 'medical', 3, MED | P.Records, 'Medic', ['medA'], ['psych_eval', 'medical_exam', 'clear_for_duty'], { lateral: ['anomaly_psychologist'], desc: 'Оценивает состояние сотрудников с нарушениями восприятия и допускает их к работе.' }),
    R('surgeon', 'Хирург', 'medical', 3, MED | P.Containment, 'Medic', ['operating', 'icu', 'wards'], ['treat', 'medical_exam'], { shifts: ['day', 'night'], lateral: ['doctor'], desc: 'Оперирует тяжело раненых, ведёт реанимацию и палаты медсектора.' }),
    R('pathologist', 'Судмедэксперт', 'medical', 3, MED | P.Records | P.Security, 'Medic', ['morgue', 'medInv'], ['medical_exam', 'records_audit'], { lateral: ['doctor'], desc: 'Устанавливает причину смерти, ведёт морг и медицинские расследования.' }),
    R('dispatcher', 'Диспетчер', 'admin', 2, P.Command | P.Surveillance, 'Admin', ['command'], ['dispatch_calls', 'camera_check'], { entry: true, shifts: ['day', 'night'], next: ['dept_head'], lateral: ['cctv_operator'], desc: 'Принимает радиовызовы, направляет патрули и техников.' }),
    R('ethics_inspector', 'Инспектор по этике', 'admin', 3, P.Ethics | P.Records | P.DClassBlock, 'Admin', ['meeting', 'dhall'], ['ethics_review', 'd_interview', 'meeting'], { desc: 'Рассматривает заявки на эксперименты, жалобы класса D, участвует в комитете по этике.' }),
    R('dept_head', 'Руководитель отдела', 'admin', 4, P.Command | P.Records | ENG | P.Logistics, 'Admin', ['command', 'meeting'], ['manage_resources', 'review_reports', 'meeting'], { next: ['director'], desc: 'Ресурсы, кадры, переводы и жалобы сотрудников.' }),
    R('director', 'Директор объекта', 'admin', 5, 0x7fff, 'Admin', ['director', 'meeting', 'command'], ['set_priorities', 'approve_research', 'manage_resources', 'meeting'], { desc: 'Определяет приоритеты комплекса, утверждает исследования и решает в кризисах.' }),
    R('janitor', 'Уборщик', 'service', 1, 0, 'Janitor', ['janitor', 'corridor', 'corrA', 'corrC', 'galW', 'galE'], ['clean_route'], { entry: true, shifts: ['day', 'night'], lateral: ['cook', 'logistician'], desc: 'Убирает коридоры и помещения, находит потерянные вещи.' }),
    R('cook', 'Работник столовой', 'service', 1, 0, 'Cook', ['kitchen', 'canteen'], ['cook', 'serve'], { entry: true, lateral: ['janitor', 'logistician'], desc: 'Готовит и раздаёт еду по волнам приёма пищи.' }),
    R('logistician', 'Логист', 'service', 2, P.Logistics, 'Admin', ['storage', 'storage4', 'arrivalDock', 'engStore'], ['deliver', 'arrival_logistics'], { entry: true, next: ['dept_head'], desc: 'Доставляет материалы и оформляет поступление объектов.' }),
    R('dclass', 'Заключённый класса D', 'dclass', 0, P.CellResident, 'DClass', ['dhall', 'dblock', 'd3common'], ['labor', 'd_test'], { entry: true, home: 'dcell', desc: 'Живёт по распорядку блока, работает, участвует в испытаниях, выполняет разрешённые поручения.' })
  ];
  const BY_ID = {}; for (const p of LIST) BY_ID[p.id] = p;

  // Promotion requirements per target role: department reputation, completed tasks in the
  // current role, days of service and special conditions. Access comes with the position.
  const PROMO = {
    junior_researcher: { rep: 55, tasks: 6, days: 1 }, scientist: { rep: 60, tasks: 8, days: 2, reports: 2 }, senior_scientist: { rep: 70, tasks: 10, days: 3, reports: 4 },
    research_director: { rep: 80, tasks: 12, days: 4, reports: 6 }, security_officer: { rep: 65, tasks: 10, days: 2 }, shift_chief: { rep: 78, tasks: 12, days: 3 },
    mtf_commander: { rep: 75, tasks: 10, days: 3 }, containment_engineer: { rep: 65, tasks: 9, days: 2 }, doctor: { rep: 60, tasks: 7, days: 2 }, psychiatrist: { rep: 70, tasks: 9, days: 3 },
    dept_head: { rep: 75, tasks: 10, days: 3 }, director: { rep: 90, tasks: 15, days: 6 }
  };
  const TRANSFER = { rep: 55, tasks: 4 };

  // Human readable task kinds (shared by the player HUD and SCP LIFE logs).
  const TASK_NAMES = {
    patrol: 'Обход сектора', long_patrol: 'Дальний патруль', camera_check: 'Проверка камер', camera_watch: 'Наблюдение за камерами', post_duty: 'Дежурство на посту', observe_scp: 'Наблюдение за объектом',
    escort_d: 'Конвой класса D', investigate: 'Расследование', access_audit: 'Аудит журнала доступа', assign_posts: 'Распределение постов', mtf_drill: 'Учения МОГ', standby: 'Готовность', escort_arrival: 'Сопровождение объекта',
    first_aid: 'Первая помощь', plan_operation: 'Планирование операции', repair: 'Ремонт', maintenance_round: 'Обход щитков', power_check: 'Проверка генератора', planned_maintenance: 'Плановое отключение', repair_door: 'Ремонт замка',
    calibrate_sensors: 'Калибровка датчиков', prepare_cell: 'Подготовка камеры', server_check: 'Проверка серверов', records_audit: 'Аудит записей', repair_camera: 'Ремонт камеры', transport_patient: 'Сопровождение пациента',
    clean_med: 'Уборка медблока', assist_doctor: 'Помощь врачу', treat: 'Приём пациента', medical_exam: 'Медосмотр', psych_eval: 'Психологическая оценка', clear_for_duty: 'Допуск к работе', dispatch_calls: 'Радиовызовы',
    ethics_review: 'Этическая экспертиза', d_interview: 'Обращение класса D', meeting: 'Совещание', manage_resources: 'Распределение ресурсов', set_priorities: 'Приоритеты комплекса', approve_research: 'Утверждение исследований',
    review_reports: 'Проверка отчётов', clean_route: 'Уборка', cook: 'Готовка', serve: 'Раздача', deliver: 'Доставка', arrival_logistics: 'Оформление поступления', labor: 'Трудовая смена', d_test: 'Испытание',
    prepare_samples: 'Подготовка образцов', deliver_samples: 'Перенос проб', assist_session: 'Помощь на сеансе', write_report: 'Научный отчёт', experiment: 'Эксперимент', counting_session: 'Сеанс счёта SCP-L-001',
    interview_scp: 'Беседа с объектом', exposure_check: 'Проверка когнитивного воздействия', feed_scp: 'Кормление объекта'
  };

  S.Professions = { DEPTS, LIST, BY_ID, PROMO, TRANSFER, TASK_NAMES, get: id => BY_ID[id] || null };
})(typeof window !== 'undefined' ? window : globalThis);
