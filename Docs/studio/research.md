# SCP LIFE — исследование рынка (market researcher)

Дата доступа ко всем источникам: 2026-11-23.

## 0. Ограничения метода (читать первым)

- WebSearch работал. WebFetch НЕ работал: ошибка DNS (`getaddrinfo ENOTFOUND`) для gamedeveloper.com и rimworldwiki.com. Чтобы открывать страницы целиком, эти хосты нужно разрешить в сетевых настройках сессии.
- Поэтому ни одну страницу целиком я не открывал. Всё ниже опирается на выдачу поиска: краткие пересказы и сниппеты со ссылками на URL. Это вторичные данные.
- Прямых текстов Steam-отзывов и Reddit-тредов получить не удалось. Часть «жалоб» взята с агрегаторов (vaporlens.app), которые сами делают AI-сводки. Это слабое доказательство, помечено как МНЕНИЕ ИГРОКОВ (агрегат).
- Цитат не привожу, только пересказ. Числа отзывов Steam меняются от снимка к снимку; приводятся как «по снимку поиска».
- Не найдено: отзывы по SCP: Pandemic (почти ничего), жалобы «SCP-173 перестал пугать» из первых рук (только косвенно), PC Gamer обзор Lobotomy Corporation (вердикт не виден), Reddit вообще.
- Метки: ФАКТ (проверено по источнику в выдаче), МНЕНИЕ ИГРОКОВ (мнение игроков или критиков), ПРЕДПОЛОЖЕНИЕ (мой вывод).

## 1. Таблица источников

| # | Источник | Ссылка | Что дал | Надёжность |
|---|---|---|---|---|
| S1 | Steam, SCP: Secret Laboratory | https://store.steampowered.com/app/700330 | Рейтинг Very Positive, ~91% (по снимку поиска) | страница не открывалась напрямую, цифры из выдачи |
| S2 | Metacritic user reviews, SCP:SL | https://legacy.prod.metacritic.com/game/pc/scp-secret-laboratory/user-reviews | Похвала: напряжённые моменты, двери; критика: оптимизация, баги | мнения пользователей, 79 оценок |
| S3 | RAWG review SCP:SL | https://rawg.io/reviews/1579568 | Один отзыв о багах раунда | единичный отзыв |
| S4 | Steam, SCP: Containment Breach | https://store.steampowered.com/app/2178380/SCP__Containment_Breach/ | Overwhelmingly Positive (~1400 отзывов, по снимку) | цифры из выдачи |
| S5 | CBR, SCP:CB horror masterpiece | https://www.cbr.com/scp-containment-breach-horror-masterpiece/ | Непредсказуемость как сила; постоянный преследователь | пресса |
| S6 | Bloody Disgusting, SCP:CB spotlight | https://bloody-disgusting.com/news/3258847/indie-horror-spotlight-scp-containment-breach-is-scarier-than-it-should-be/ | Игра пугает сильнее, чем «должна» | пресса |
| S7 | GameSkinny, SCP:CB review | https://www.gameskinny.com/reviews/cute-little-things-scp-containment-breach-review/ | Страх, постоянная уязвимость | пресса |
| S8 | Vaporlens, SCP:CB summary | https://vaporlens.app/app/2178380/scp_containment_breach.md | Жалоба: повторяемость без модов | AI-агрегат, слабое |
| S9 | DTF, «Нарушение условий содержания» | https://dtf.ru/yakor/1964898-narushenie-uslovii-soderzhaniya | Автор привык к звуку SCP-173, стал улыбаться | личный обзор, RU |
| S10 | Steam, SCP: 5K | https://store.steampowered.com/app/872670/SCP_5K/ | Рейтинг Mostly/Very Positive (по снимкам 79% на ~8,4 тыс.) | цифры из выдачи |
| S11 | Vaporlens, SCP: 5K | https://vaporlens.app/app/872670/scp_5_k | Похвала: стрельба, графика; жалобы: мало контента, нет чекпоинтов, производительность | AI-агрегат, слабое |
| S12 | Couch Soup, SCP: Pandemic EA | https://couchsoup.com/games/early-access-scp-pandemic | Мультиплеер «реально весело», кампания короткая и сырая | один обзор, 2022 |
| S13 | Metacritic, SCP: Pandemic | https://legacy.prod.metacritic.com/game/pc/scp-pandemic | Оценок нет; описание: кооперативный тактический шутер | ФАКТ об отсутствии оценок |
| S14 | PC Gamer, RimWorld review | https://www.pcgamer.com/rimworld-review/ | «Хорошая менеджмент-игра, слабый генератор историй» | пресса |
| S15 | Steam-обсуждение RimWorld | https://steamcommunity.com/app/294100/discussions/0/3160958175962150146 | Игрок: после ~5 лет скучно | одно мнение |
| S16 | Ludeon forum, «Cassandra doesn't understand...» | https://ludeon.com/forums/index.php?msg=243215 | Рассказчик не понимает нарастания угроз; затишья без рейдов | форум |
| S17 | RimWorld Wiki, Storytellers | https://rimworldwiki.com/wiki/Storyteller | Cassandra / Phoebe / Randy, их логика | упомянут в выдаче, сам не открыт |
| S18 | Rock Paper Shotgun, How RimWorld Generates Great Stories | https://hn.jakechampion.name/reader/https://www.rockpapershotgun.com/2016/08/12/how-rimworld-generates-great-stories | Настроение, черты, простая легко читаемая симуляция | зеркало, из выдачи |
| S19 | Game Developer, RimWorld/Dwarf Fortress storytelling | https://gamedeveloper.com/design/rimworld-dwarf-fortress-and-procedurally-generated-story-telling | «Генератор историй», смысл достраивает игрок | не открыт, из выдачи |
| S20 | Steam, Lobotomy Corporation | https://store.steampowered.com/app/568220 | Very Positive (~52,9 тыс., по снимку) | цифры из выдачи |
| S21 | PC Gamer, Lobotomy Corporation | https://www.pcgamer.com/manage-monsters-and-inevitably-get-eaten-in-lobotomy-corporation/ | Описание: энергия из монстров, сотрудники гибнут | вердикт не виден |
| S22 | OpenCritic, Lobotomy Corporation | https://opencritic.com/game/5924/lobotomy-corporation | Сильный сюжет, сложный геймплей, трудно рекомендовать всем | агрегатор |
| S23 | Vaporlens, Lobotomy Corporation | https://vaporlens.app/app/568220/lobotomy_corporation_monster_management_simulation | Крутая кривая обучения, баги/утечки памяти | AI-агрегат, слабое |
| S24 | GameSkinny, Barotrauma impressions | https://www.gameskinny.com/opinion/barotrauma-impressions-unique-roleplaying-in-an-unforgiving-ocean/ | Капитан и инженер привязаны к постам, остальные свободнее | 7+ лет, возможно устарел |
| S25 | PC Gamer, Barotrauma | https://pcgamer.com/barotrauma-pits-you-against-an-ocean-of-horrors-in-a-submarine | Хаос при затоплении, специалист эффективнее неспециалиста | пресса |
| S26 | Steam, Barotrauma | https://store.steampowered.com/app/602960/Barotrauma/ | 6 классов; Overwhelmingly Positive (по снимку) | цифры из выдачи |
| S27 | Vaporlens, Barotrauma | https://vaporlens.app/app/602960/barotrauma | Повторяемость в позднем этапе, соло слабое | AI-агрегат, слабое |
| S28 | Project Zomboid blog (Tales from the Metaverse) | https://projectzomboid.com/blog/news/2013/01/tales-from-the-metaverse/ | Замысел метагейма: каждая игра как фильм о зомби | слова разработчиков (интент) |
| S29 | PCGamesN, Project Zomboid narrative system | https://www.pcgamesn.com/project-zomboid/narrative-system-meta | Нарративный метасистем | пресса |
| S30 | Steam-обсуждение Zomboid | https://steamcommunity.com/app/108600/discussions/0/1499000547491566065 | Игрок бросил, когда база построена; ответ про планы позднего этапа | форум |
| S31 | GamesRadar, 11 years of Zomboid | https://www.gamesradar.com/games/simulation/11-years-in-early-access-has-turned-project-zomboid-into-the-ultimate-survival-sim-but-i-think-the-best-is-yet-to-come | Игру нельзя «пройти» | пресса |
| S32 | Dread Central, Voices of the Void | https://www.dreadcentral.com/news/489349/ultra-indie-spotlight-sunday-voices-of-the-void/ | Хвалят атмосферу, звук, рутину (голод, сон); жалоба: те же цели по кругу | обзор демо |
| S33 | Steam, Voices of the Void | https://store.steampowered.com/app/670940 | Страница магазина (в выдаче) | не использован для цифр |
| S34 | TechRadar, Alien: Isolation AI | https://techradar.com/news/gaming/design-nightmare-just-how-smart-is-alien-isolation-s-monster-1268919 | Чужой выслеживает по чувствам | пресса |
| S35 | Game Developer, The Perfect Organism | https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation | Двухуровневый ИИ: директор + микро-ИИ; нельзя пугать постоянно | не открыт, из выдачи |
| S36 | MCV, A tiger in the office | https://www.mcvuk.com/a-tiger-in-the-office-how-alien-isolations-xenomorph-took-shape/ | Чужой не знает точной позиции игрока; директор регулирует угрозу | из выдачи |
| S37 | Kotaku, Alien: Isolation unpredictable alien | https://kotaku.com/alien-isolations-worst-aspect-the-unpredictable-alien-1607096520 | Хаос: и сила, и слабость | пресса |
| S38 | Valve, AI Systems of L4D (Booth) | https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf | Цель «драматический ритм» среди 4 целей ИИ | PDF в выдаче, сам не открыт |
| S39 | Valve, GDC 2009 Replayable Co-op | https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf | «Adaptive Dramatic Pacing» как механика | заголовок из выдачи |
| S40 | Game Developer, Balancing Act of Tension | https://www.gamedeveloper.com/design/the-balancing-act-of-tension-in-horror-game-design | Экшен-хоррор: монстры без передышки притупляют страх | не открыт, из выдачи |
| S41 | Bulletpoints Monthly, Amnesia: The Bunker | https://bulletpointsmonthly.com/2023/06/21/amnesiac-remembers-amnesia-the-bunker | Предсказуемость — враг хоррора | из выдачи |
| S42 | Yahoo, Alan Wake 2 jump scares | https://uk.news.yahoo.com/alan-wake-2-stuffed-jump-160011367.html | Перебор скримеров обесценивает страх | из выдачи |
| S43 | Escapist, Back 4 Blood director | https://escapistmagazine.com/?p=113025 | Директор без «напряжения» | из выдачи |

## 2. Находки по играм

### SCP: Secret Laboratory
- МНЕНИЕ ИГРОКОВ: хвалят напряжённые моменты (уговорить SCP-173 не убивать, когда прижат) и «простые, но напряжённые» двери; критикуют оптимизацию, баги, неудобное движение, медленную разработку; часть считает её «мультиплеерным SCP:CB» без большого добавления; шутка «симулятор дверей под видом хоррора» ([S2](https://legacy.prod.metacritic.com/game/pc/scp-secret-laboratory/user-reviews)).
- ФАКТ (по снимку): Very Positive ~91% ([S1](https://store.steampowered.com/app/700330)).
- ПРЕДПОЛОЖЕНИЕ: сила игры — роли с разными целями у людей, а не у NPC. Её слабость для нас — нет жизни между раундами. SCP LIFE может взять «роль = своя цель», но заполнить «между».

### SCP: Containment Breach
- МНЕНИЕ ИГРОКОВ/ПРЕССЫ: страшна постоянной уязвимостью, невозможностью предсказать, что и где, случайной раскладкой, постоянным преследователем, принудительным морганием у SCP-173 ([S5](https://www.cbr.com/scp-containment-breach-horror-masterpiece/), [S6](https://bloody-disgusting.com/news/3258847/indie-horror-spotlight-scp-containment-breach-is-scarier-than-it-should-be/), [S7](https://www.gameskinny.com/reviews/cute-little-things-scp-containment-breach-review/)).
- МНЕНИЕ ИГРОКОВ (слабое, AI-агрегат): повторяемость без модов ([S8](https://vaporlens.app/app/2178380/scp_containment_breach.md)). Автор DTF привык к звуку SCP-173 и стал улыбаться ([S9](https://dtf.ru/yakor/1964898-narushenie-uslovii-soderzhaniya)) — привыкание к известной угрозе.
- ФАКТ (по снимку): Overwhelmingly Positive ([S4](https://store.steampowered.com/app/2178380/SCP__Containment_Breach/)).

### SCP: 5K
- МНЕНИЕ ИГРОКОВ (AI-агрегат): хвалят стрельбу и графику, большие карты; критикуют нехватку контента и миссий, отсутствие чекпоинтов, производительность, цену ([S11](https://vaporlens.app/app/872670/scp_5_k)). Рейтинг по снимкам 79% positive ([S10](https://store.steampowered.com/app/872670/SCP_5K/)).
- ПРЕДПОЛОЖЕНИЕ: это шутер, для SCP LIFE (рутина профессий) полезен мало; урок один — «мало контента» убивает интерес быстрее всего.

### SCP: Pandemic
- ФАКТ: оценок на Metacritic нет ([S13](https://legacy.prod.metacritic.com/game/pc/scp-pandemic)). Единственный найденный обзор (2022): мультиплеер «реально весело», кампания короткая, сырая ([S12](https://couchsoup.com/games/early-access-scp-pandemic)). Данных недостаточно для выводов.

### RimWorld
- ФАКТ (из выдачи): рассказчик (Cassandra/Phoebe/Randy) выбирает события по ситуации колонии; смоделирован по директору L4D; настроение зависит от нужд, черт и биографий, низкое настроение ведёт к срывам (S17, S18, [S14](https://www.pcgamer.com/rimworld-review/)).
- ФАКТ (интент автора): простая, наблюдаемая и понятная симуляция лучше сложной; игрок достраивает смысл событий ([S18](https://hn.jakechampion.name/reader/https://www.rockpapershotgun.com/2016/08/12/how-rimworld-generates-great-stories), [S19](https://gamedeveloper.com/design/rimworld-dwarf-fortress-and-procedurally-generated-story-telling)).
- МНЕНИЕ ИГРОКОВ: после нескольких лет скучно ([S15](https://steamcommunity.com/app/294100/discussions/0/3160958175962150146)); рассказчик считает только время между «плохими событиями» и не понимает нарастание/составные угрозы ([S16](https://ludeon.com/forums/index.php?msg=243215)); Randy даёт и скучные засухи, и несправедливые удары. PC Gamer: сильная менеджмент-игра, слабый генератор историй ([S14](https://www.pcgamer.com/rimworld-review/)).

### Lobotomy Corporation
- ФАКТ: сотрудников губят монстры, «не тайкун, а игра об избегании катастроф» (описание в [S21](https://www.pcgamer.com/manage-monsters-and-inevitably-get-eaten-in-lobotomy-corporation/)); Very Positive ([S20](https://store.steampowered.com/app/568220)).
- МНЕНИЕ: критики — сильный сюжет, уникальный сложный геймплей, но трудно рекомендовать всем ([S22](https://opencritic.com/game/5924/lobotomy-corporation)); игроки хвалят реиграбельность и нюансы управления аномалиями и агентами, жалуются на крутое обучение и баги (AI-агрегат, [S23](https://vaporlens.app/app/568220/lobotomy_corporation_monster_management_simulation)).
- ПРЕДПОЛОЖЕНИЕ: ценность — в изучении правил каждой аномалии (наблюдение → знание → ошибка → цена). Прямо применимо: каждая SCP — своя «головоломка протокола». Прямых данных о скуке/повторах у меня нет.

### Barotrauma
- МНЕНИЕ/ФАКТ: 6 классов ([S26](https://store.steampowered.com/app/602960/Barotrauma/)); капитан и инженер привязаны к постам, остальные свободнее; роли зависят друг от друга ([S24](https://www.gameskinny.com/opinion/barotrauma-impressions-unique-roleplaying-in-an-unforgiving-ocean/)); специалист заметно эффективнее неспециалиста; хаос затопления, когда надо слаженно работать ([S25](https://pcgamer.com/barotrauma-pits-you-against-an-ocean-of-horrors-in-a-submarine)).
- МНЕНИЕ ИГРОКОВ (AI-агрегат): повторяемость в позднем этапе и соло, боты-напарники слабые ([S27](https://vaporlens.app/app/602960/barotrauma)).

### Project Zomboid
- ФАКТ (интент): метагейм, чтобы каждая игра была «фильмом о зомби» ([S28](https://projectzomboid.com/blog/news/2013/01/tales-from-the-metaverse/), [S29](https://www.pcgamesn.com/project-zomboid/narrative-system-meta)); игру нельзя «пройти» ([S31](https://www.gamesradar.com/games/simulation/11-years-in-early-access-has-turned-project-zomboid-into-the-ultimate-survival-sim-but-i-think-the-best-is-yet-to-come)).
- МНЕНИЕ ИГРОКОВ: бросил, когда база построена и запасы собраны; ответ в теме признаёт слабый поздний этап ([S30](https://steamcommunity.com/app/108600/discussions/0/1499000547491566065)). Сведения старые, возможно изменились.

### Voices of the Void
- МНЕНИЕ: обзор демо хвалит предпосылку, атмосферу, звук, детализацию, интерактивность, ритм повествования; рутина (голод, сон, цели) — часть игры; но автор чуть не бросил из-за одних и тех же нескольких задач по кругу ([S32](https://www.dreadcentral.com/news/489349/ultra-indie-spotlight-sunday-voices-of-the-void/)). Один обзор демо, данных мало.
- ПРЕДПОЛОЖЕНИЕ: самый близкий аналог SCP LIFE (один человек, рутина научника, редкая жуть). Предупреждение: рутина без нарастания и новизны утомляет.

### Дополнительно: Alien: Isolation и Left 4 Dead (как образцы ритма и ужаса)
- ФАКТ (из выдачи): Чужой выслеживает по чувствам, не знает точной позиции игрока; «директор» решает, где ему быть, «микро-ИИ» исполняет; директор регулирует давление, чтобы не пугать постоянно ([S34](https://techradar.com/news/gaming/design-nightmare-just-how-smart-is-alien-isolation-s-monster-1268919), [S35](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation), [S36](https://www.mcvuk.com/a-tiger-in-the-office-how-alien-isolations-xenomorph-took-shape/)). Критика: хаос — сила и слабость ([S37](https://kotaku.com/alien-isolations-worst-aspect-the-unpredictable-alien-1607096520)).
- ФАКТ: у Valve «драматический ритм» — явная цель ИИ-директора ([S38](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf), [S39](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)); критика директора Back 4 Blood за отсутствие напряжения ([S43](https://escapistmagazine.com/?p=113025)).

## 3. Сквозные паттерны

1. Директор/рассказчик управляет ритмом (RimWorld, L4D, Alien: Isolation) — S17, S35, S38. Но «чистая случайность» даёт засухи и несправедливость (S15, S16), поэтому нужен управляемый ритм, а не просто частота.
2. Роль = отдельный набор действий и зависимостей (Barotrauma): привязка к посту, специалист эффективнее, команда зависит друг от друга (S24, S25).
3. Простая читаемая симуляция рождает истории (RimWorld, S18); игрок сам достраивает смысл (S19).
4. Поздний этап скучнеет везде, где игрок «решил» игру: Zomboid после базы (S30), RimWorld после лет (S15), Barotrauma повторяются миссии (S27), VotV те же цели (S32).
5. Страх гибнет от привыкания: постоянные монстры (S40), предсказуемость (S41), перебор скримеров (S42), знакомый звук угрозы (S9).
6. Страх держится на уязвимости, неопределённости и персистентном преследователе (S5, S7, S34).
7. Правила аномалий, которые можно узнать (Lobotomy Corporation), дают реиграбельность — ПРЕДПОЛОЖЕНИЕ на основе S21–S23.

## 4. Принципы для SCP LIFE (адаптировать, не копировать)

Каждый принцип — ПРЕДПОЛОЖЕНИЕ дизайнера, опирающееся на указанные источники.

1. **Рабочая смена как цикл с «задачами-ожидаемыми»**: у каждой профессии свой набор шагов (охранник: обход, проверка камер, досмотр; учёный: запрос → опыт → отчёт; Д-класс: наряд, еда, тест; техник: поломка → диагностика → ремонт). Основа: роли Barotrauma (S24, S25), рутина VotV (S32).
2. **Профессиональный вес выбора**: специалист справляется лучше и быстрее, неспециалист — медленно и с риском (S25). Д-класс не чинит щит, техник не ведёт тест.
3. **Зависимость между ролями**: учёному нужны охрана и Д-класс, технику нужны отчёты, медику нужны инциденты (S24).
4. **Рассказчик событий с памятью и ритмом**: фаза «тихо — нарастание — пик — разрядка», учитывает нагрузку игрока и недавние события (S17, S35, S38). Не равномерный random (S15, S16).
5. **Многоступенчатые истории**: мелкая неисправность → слух → расследование → последствие, а не одиночное событие. Критика одиночных независимых «плохих событий» (S16).
6. **Редкая, но серьёзная опасность**: пик должен быть настоящим и необратимым там, где это честно. Чужой «не пугает всё время» (S35); экшен без передышки притупляет страх (S40).
7. **Угроза не знает точной позиции игрока**: охота по звуку, свету, шуму (S34, S36) — честнее и страшнее, чем «видит сквозь стены» (S40, жалоба на нечестное обнаружение).
8. **Правила аномалий открываются наблюдением**: каждая SCP — своя «головоломка протокола», знание стоит цены (S21–S23).
9. **Читаемая симуляция вместо глубокой, но скрытой**: игрок должен видеть причины (журнал, камеры, отчёты), чтобы достраивать истории (S18, S19). Брифу это уже соответствует (EventLog, журнал решений).
10. **Нужды и настроение как источник драмы**: усталость, страх, голод, конфликты ведут к срывам и ошибкам NPC и игрока (S17, S18, S32).
11. **Пустые коридоры как инструмент страха**: меньше людей в «ненужных» местах, люди там, где у них задача по расписанию; тишина — часть ритма (S35, S40). ПРЕДПОЛОЖЕНИЕ, прямых источников про «толпу» мало (см. раздел 5).
12. **Угрозы с разными «лицами»**, а не один приём на всех: Dead Space/Alan Wake критикуют за одинаковые реакции (S40 из выдачи). Пусть у SCP разные сигналы, слабости и поведение.
13. **Поздняя игра меняется**: рост ответственности, новые должности, эскалации сюжета, чтобы «решённая» смена не становилась пустой (S15, S30, S27).
14. **Слабый шаблон повторов**: ротация задач и вариативные параметры в рамках одной роли (S32, S27); не одни и те же 3–4 цели.
15. **Сохранять непредсказуемость, но давать игроку агентность**: жалоба Kotaku на хаос (S37) — игрок должен понимать, чем мог бы это предотвратить, иначе это «несправедливо».

## 5. Чего избегать

- Постоянной погони/боя; страх требует передышек (S35, S40).
- Равномерного random в событиях: засухи и несправедливые удары (S15, S16).
- Одной «цели» на всю смену, повторяющейся без новизны (S32).
- Одинаковых реакций игрока на все угрозы (S40).
- Привыкания к знакомому сигналу угрозы без вариантов (S9).
- «Мало контента» — первая жалоба в SCP: 5K (S11); хорошая система без разнообразия сценариев скучнеет.
- Нечестного обнаружения («видит сквозь стены») (из выдачи по S40).
- Слишком крутого обучения без подсказок (Lobotomy Corporation, S23).
- Рассказчика, который не понимает составные угрозы (S16).
- Слепого переноса: Barotrauma/SCP:SL опираются на живых игроков; в одиночной игре эти роли должны играть NPC и события.

## 6. Пробелы

- Не найдены Reddit-треды, Steam-отзывы целиком и Steam-обсуждения про толпы в коридорах (для вопроса 4 сквозные источники — общие статьи о дизайне хоррора, не про SCP).
- Нет первоисточников по SCP: Pandemic.
- Чтобы закрыть пробелы: разрешить хосты gamedeveloper.com, rimworldwiki.com, steamcommunity.com, reddit.com для WebFetch и повторить.
