# Реестр ресурсов SCP LIFE

Все перечисленные файлы реально лежат в `Web/assets/` и попадают в APK и веб-версию. Лицензии проверены по файлам LICENSE / README в исходных репозиториях на момент загрузки. CC0 — общественное достояние, указание автора не требуется (указываем из уважения). CC BY 4.0 — указание автора обязательно (строка ниже и экран «Об игре»).

## Звуки

### Источники

| Пакет | Автор | Лицензия | Оригинал | Откуда скачано |
|---|---|---|---|---|
| Oculus Audio Pack 01 | Oculus VR, LLC | CC BY 4.0 | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ | https://github.com/facebookincubator/Meta-open-sound |
| Sound Effects Pack | Owlish Media (OpenGameArt) | CC0 1.0 | https://opengameart.org/content/sound-effects-pack | https://github.com/EternityForest/Free-SFX |
| Electricity game sound pack | OpenGameArt contributor (via EternityForest/Free-SFX) | CC0 1.0 | https://opengameart.org/content/electricity-game-sound-pack | https://github.com/EternityForest/Free-SFX |
| critters creeping | jhumbucker (Freesound) | CC0 1.0 | https://freesound.org/people/jhumbucker/sounds/250540/ | https://github.com/EternityForest/Free-SFX |
| water trickling | kaydinhamby (Freesound) | CC0 1.0 | https://freesound.org/people/kaydinhamby/sounds/381202/ | https://github.com/EternityForest/Free-SFX |
| Wind 01 - Inside a metallic squeaking building | Julien Matthey (Freesound) | CC0 1.0 | https://freesound.org/people/Julien%20Matthey/sounds/557188/ | https://github.com/EternityForest/Free-SFX |
| Impact Sounds | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/impact-sounds | https://github.com/Boyquotes/kenney-impact-sounds-for-godot |
| RPG Audio | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/rpg-audio | https://github.com/Boyquotes/kenney-rpg-audio-for-godot |
| Sci-fi Sounds | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/sci-fi-sounds | https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot |

Обязательная атрибуция (CC BY 4.0): "Oculus Audio Pack 01" by Oculus VR, LLC (https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/), licensed under CC BY 4.0. Files renamed to the UCS naming convention; OGG previews transcoded from the original WAVs. Further trimmed, normalised and re-encoded for SCP LIFE.

### Звуковые id (файлы `Web/assets/audio/<id>_N.ogg`)

| id | Вариантов | Источник (исходные файлы) | Где используется |
|---|---|---|---|
| `step_concrete_walk` | 9 | oculus/owlish: FEETHmn_ShoeConcreteWalk_OS_01.ogg, FEETHmn_ShoeConcreteWalk_OS_02.ogg, FEETHmn_ShoeConcreteWalk_OS_03.ogg, FEETHmn_ShoeConcreteWalk_OS_04.ogg, FEETHmn_ShoeC… | Шаги: бетон, обычная обувь (игрок и NPC) |
| `step_concrete_run` | 5 | oculus: FEETHmn_ShoeConcreteRun_OS_01.ogg, FEETHmn_ShoeConcreteRun_OS_02.ogg, FEETHmn_ShoeConcreteRun_OS_03.ogg, FEETHmn_ShoeConcreteRun_OS_04.ogg, FEETHmn_ShoeConcr… | Бег по бетону |
| `step_concrete_land` | 2 | oculus: FEETHmn_ShoeConcreteLand_OS_01.ogg, FEETHmn_ShoeConcreteLand_OS_02.ogg | Тяжёлые ботинки (слой удара пятки), остановка |
| `step_metal_walk` | 5 | oculus: FEETHmn_ShoeMetalWalk_OS_01.ogg, FEETHmn_ShoeMetalWalk_OS_02.ogg, FEETHmn_ShoeMetalWalk_OS_03.ogg, FEETHmn_ShoeMetalWalk_OS_04.ogg, FEETHmn_ShoeMetalWalk_OS_… | Шаги: металлическая решётка, мостки, тоннели |
| `step_metal_run` | 5 | oculus: FEETHmn_ShoeMetalRun_OS_01.ogg, FEETHmn_ShoeMetalRun_OS_02.ogg, FEETHmn_ShoeMetalRun_OS_03.ogg, FEETHmn_ShoeMetalRun_OS_04.ogg, FEETHmn_ShoeMetalRun_OS_05.ogg | Бег по металлу |
| `step_metal_land` | 2 | oculus: FEETHmn_ShoeMetalLand_OS_01.ogg, FEETHmn_ShoeMetalLand_OS_02.ogg | Тяжёлые ботинки по металлу |
| `step_grit_walk` | 5 | oculus: FEETHmn_ShoeDirtWalk_OS_01.ogg, FEETHmn_ShoeDirtWalk_OS_02.ogg, FEETHmn_ShoeDirtWalk_OS_03.ogg, FEETHmn_ShoeDirtWalk_OS_04.ogg, FEETHmn_ShoeDirtWalk_OS_05.ogg | Шаги: технический пол с песком и пылью, мокрый/грязный пол (слой) |
| `step_grit_run` | 3 | oculus: FEETHmn_ShoeDirtRun_OS_01.ogg, FEETHmn_ShoeDirtRun_OS_02.ogg, FEETHmn_ShoeDirtRun_OS_03.ogg | Бег по грязному техническому полу |
| `step_panel_walk` | 5 | oculus: FEETHmn_ShoeWoodWalk_OS_01.ogg, FEETHmn_ShoeWoodWalk_OS_02.ogg, FEETHmn_ShoeWoodWalk_OS_03.ogg, FEETHmn_ShoeWoodWalk_OS_04.ogg, FEETHmn_ShoeWoodWalk_OS_05.ogg | Шаги: фальшпол (серверные, диспетчерская) — полый отзвук |
| `step_tile_walk` | 5 | k_impact: footstep_concrete_000.ogg, footstep_concrete_001.ogg, footstep_concrete_002.ogg, footstep_concrete_003.ogg, footstep_concrete_004.ogg | Шаги: кафель (лаборатории, медблок, кухня) |
| `step_carpet_walk` | 5 | k_impact: footstep_carpet_000.ogg, footstep_carpet_001.ogg, footstep_carpet_002.ogg, footstep_carpet_003.ogg, footstep_carpet_004.ogg | Шаги: ковролин (кабинеты администрации, жилой блок) |
| `step_heels` | 12 | owlish: Womens_shoes_1.opus, Womens_shoes_2.opus, Womens_shoes_3.opus | Шаги: женская обувь на каблуке по твёрдому полу (администрация) |
| `stumble` | 1 | owlish: stumble.opus | Спотыкание (реакция испуга) |
| `cloth` | 8 | k_rpg/oculus: CLOTHMvmt_ClothingMovement_OS_01.ogg, CLOTHMvmt_ClothingMovement_OS_02.ogg, CLOTHMvmt_ClothingMovement_OS_03.ogg, CLOTHMvmt_ClothingMovement_OS_04.ogg, cloth… | Шорох одежды при движении, посадке, жестах |
| `gear` | 6 | k_rpg/oculus: CLOTHMvmt_MovementWithGear_OS_01.ogg, CLOTHMvmt_MovementWithGear_OS_02.ogg, CLOTHMvmt_MovementWithGear_OS_03.ogg, CLOTHMvmt_MovementWithGear_OS_04.ogg, belt_… | Снаряжение охраны и МОГ (бряцание при ходьбе и беге) |
| `door_slide_open` | 3 | k_scifi/oculus: DOORSlid_SlidingDoorOpen_OS_01.ogg, door_open_000.ogg, door_open_001.ogg | Обычная раздвижная дверь: открытие |
| `door_slide_close` | 3 | k_scifi/oculus: DOORSlid_SlidingDoorClose_OS_01.ogg, door_close_000.ogg, door_close_001.ogg | Обычная раздвижная дверь: закрытие |
| `door_heavy_open` | 1 | oculus: DOORMetl_HatchOpen_OS_01.ogg | Гермодверь камеры содержания: открытие |
| `door_heavy_close` | 1 | oculus: DOORMetl_HatchClose_OS_01.ogg | Гермодверь камеры содержания: закрытие |
| `door_blast_open` | 1 | oculus: DOORMetl_GarageDoorOpen_OS_01.ogg | Взрывозащитная дверь при локдауне: открытие |
| `door_blast_close` | 1 | oculus: DOORMetl_GarageDoorClose_OS_01.ogg | Взрывозащитная дверь при локдауне: закрытие |
| `door_airlock_open` | 1 | oculus: TRNDoor_TrainDoorsOpen_OS_01.ogg | Шлюз (пневматика): открытие |
| `door_airlock_close` | 1 | oculus: TRNDoor_TrainDoorsClose_OS_01.ogg | Шлюз (пневматика): закрытие |
| `hydraulic` | 1 | oculus: MACHInd_Hydraulic_OS_01.ogg | Гидравлика шлюза, лифта, тяжёлых затворов |
| `door_lock` | 3 | oculus: DOORHdwr_OfficeDoorLock_OS_01.ogg, DOORHdwr_SlidingDoorLock_OS_01.ogg, MECHLock_DoorLockKey_OS_01.ogg | Замок двери, блокировка |
| `door_unlock` | 2 | oculus: DOORHdwr_OfficeDoorKnob_OS_01.ogg, MECHLock_DoorUnlockKey_OS_01.ogg | Отпирание |
| `card_ok` | 1 | oculus: UIClick_ScifiHightechConfirm_OS_01.ogg | Считыватель карты: доступ разрешён |
| `card_deny` | 1 | oculus: UIAlert_ScifiHightechError_OS_01.ogg | Считыватель карты: отказ |
| `knock_door` | 1 | oculus: DOORKnck_OfficeDoorKnock_OS_01.ogg | Стук в дверь |
| `knock_metal` | 5 | k_impact: impact_metal_light_000.ogg, impact_metal_light_001.ogg, impact_metal_light_002.ogg, impact_metal_light_003.ogg, impact_metal_light_004.ogg | Стук в воздуховоде/по металлу (вентиляция, сущности) |
| `glass_tap` | 5 | k_impact: impact_glass_light_000.ogg, impact_glass_light_001.ogg, impact_glass_light_002.ogg, impact_glass_light_003.ogg, impact_glass_light_004.ogg | Касание/постукивание по стеклу смотрового окна |
| `glass_hit` | 5 | k_impact: impact_glass_medium_000.ogg, impact_glass_medium_001.ogg, impact_glass_medium_002.ogg, impact_glass_medium_003.ogg, impact_glass_medium_004.ogg | Удар по стеклу (существо у стекла) |
| `amb_machine` | 1 (петля) | oculus: AMBInd_RoomToneMachineRoom_LOOP_01.ogg | Фон машинного зала, генераторная |
| `amb_hvac` | 1 (петля) | oculus: MACHHvac_HVAC_LOOP_01.ogg | Вентиляция (работает по реальному состоянию систем) |
| `amb_fan` | 1 (петля) | oculus: MACHFan_Fan_LOOP_01.ogg | Вентилятор в помещении, серверные стойки |
| `amb_hum1` | 1 (петля) | oculus: MACHMisc_MachineHum_LOOP_01.ogg | Гул лабораторного оборудования |
| `amb_hum2` | 1 (петля) | oculus: MACHMisc_MachineHum_LOOP_02.ogg | Гул щитовых, трансформаторов |
| `amb_machine2` | 1 (петля) | oculus: MACHMisc_MachineGeneric_LOOP_01.ogg | Мастерская, насосы |
| `amb_machine3` | 1 (петля) | oculus: MACHMisc_MachineGeneric_LOOP_02.ogg | Генератор (позиционный источник) |
| `amb_room1` | 1 (петля) | oculus: AMBHome_RoomTone_LOOP_01.ogg | Тихий тон помещения: кабинеты, жилой блок |
| `amb_room2` | 1 (петля) | oculus: AMBHome_RoomTone_LOOP_02.ogg | Тихий тон помещения: наблюдательные |
| `amb_canteen` | 1 (петля) | oculus: CRWDConv_Restaurant_LOOP_01.ogg | Гомон столовой (громкость по числу людей) |
| `amb_water` | 1 (петля) | oculus: WATRPlmb_FaucetWaterRun_LOOP_01.ogg | Вода на кухне, в душевых |
| `amb_drip` | 1 (петля) | fs_water: 381202__kaydinhamby__water-trickling.opus | Протечка (высокая влажность, неисправность) |
| `amb_shaft` | 1 (петля) | fs_wind: 557188__julien-matthey__jm_natural-elements_wind-01-tornado-inside-a-metalic-squeaking-building.opus | Сквозняк и скрип металла: шахты, тоннели уровня 4 |
| `amb_dread1` | 1 (петля) | oculus: DSGNDron_DroneCreepy_OS_01.ogg | Тревожный фон (только состояния «паранойя/угроза» директора хоррора) |
| `amb_dread2` | 1 (петля) | oculus: DSGNDron_DroneCreepy_OS_02.ogg | Тревожный фон, нулевой этаж |
| `hvac_on` | 1 | oculus: MACHHvac_HVACOn_OS_01.ogg | Пуск вентиляции после отключения |
| `hvac_off` | 1 | oculus: MACHHvac_HVACOff_OS_01.ogg | Остановка вентиляции |
| `fan_start` | 1 | oculus: MACHFan_FanStart_OS_01.ogg | Раскрутка вентилятора |
| `fan_off` | 1 | oculus: MACHFan_FanOff_OS_01.ogg | Остановка вентилятора |
| `power_down` | 1 | electricity: powerdown.opus | Отключение питания сектора |
| `power_up` | 1 | electricity: powerup.opus | Восстановление питания |
| `spark` | 1 (петля) | electricity: crackleelectricityloop.opus | Искрение неисправной проводки |
| `servo` | 2 | oculus: MOTRSrvo_Servo_OS_01.ogg, MOTRSrvo_Servo_OS_02.ogg | Сервопривод поворотной камеры, манипулятор |
| `lever` | 2 | oculus: MECHLvr_LeverPull_OS_01.ogg, MECHLvr_LeverPull_OS_02.ogg | Рубильник, аварийный рычаг |
| `switch_on` | 1 | oculus: MECHSwtch_SwitchSmallOn_OS_01.ogg | Выключатель |
| `switch_off` | 1 | oculus: MECHSwtch_SwitchSmallOff_OS_01.ogg | Выключатель |
| `panel_open` | 1 | oculus: METLHndl_ElectricBoxOpen_OS_01.ogg | Электрощит открыт (ремонт) |
| `valve` | 1 | oculus: WATRPlmb_ValveTurn_OS_01.ogg | Вентиль (сантехника, увлажнение) |
| `keyboard` | 10 | oculus: UIClick_KeyboardTyping_OS_01.ogg | Печать на клавиатуре терминала (NPC и игрок) |
| `computer` | 4 | k_scifi: computer_noise_000.ogg, computer_noise_001.ogg, computer_noise_002.ogg, computer_noise_003.ogg | Сигналы терминалов и приборов |
| `ui_open` | 1 | oculus: UIClick_ScifiHightechOpen_OS_01.ogg | Интерфейс КПК/терминала: открыть |
| `ui_close` | 1 | oculus: UIClick_ScifiHightechClose_OS_01.ogg | Интерфейс: закрыть |
| `ui_notify` | 1 | oculus: UIAlert_Notification_OS_01.ogg | Уведомление КПК |
| `alarm` | 1 (петля) | owlish: siren.opus | Сирена тревоги (локдаун, нарушение содержания) |
| `clock` | 1 (петля) | owlish: loopable-ticking-clock.opus | Настенные часы в кабинетах |
| `clock_creepy` | 1 (петля) | oculus: CLOCKTick_ClockCreepy_OS_01.ogg | Часы в камере LF-140 «Сидящий» |
| `paper` | 4 | k_rpg/oculus: PAPRHndl_BookPageTurns_OS_01.ogg, book_flip_1.ogg, book_flip_2.ogg, book_flip_3.ogg | Листание документов, чтение |
| `paper_crumple` | 1 | oculus: PAPRHndl_PaperCrumple_OS_01.ogg | Мятая бумага |
| `book_open` | 2 | k_rpg/oculus: OBJBook_BookOpen_OS_01.ogg, book_open.ogg | Папка/журнал открыт |
| `book_close` | 2 | k_rpg/oculus: OBJBook_BookClose_OS_01.ogg, book_close.ogg | Папка/журнал закрыт |
| `cup` | 2 | oculus: FOODTware_SpoonDrop_OS_01.ogg, PLASImpt_PlasticCupDrop_OS_01.ogg | Посуда в столовой |
| `pot` | 3 | k_rpg: metal_pot_1.ogg, metal_pot_2.ogg, metal_pot_3.ogg | Кухня: кастрюли, раздача |
| `cart` | 1 | oculus: WOODFric_LargeWoodMetalDrag_OS_01.ogg | Тележка, перемещение ящиков |
| `metal_hit` | 4 | k_scifi/oculus: METLImpt_MetalHitSurface_OS_01.ogg, METLImpt_MetalHitSurface_OS_02.ogg, impact_metal_000.ogg, impact_metal_001.ogg | Удар металла (инструмент, падение предмета) |
| `bucket` | 1 | oculus: METLImpt_BucketDrop_OS_01.ogg | Ведро уборщика |
| `toolbag` | 1 | oculus: OBJBag_ToolBagDrop_OS_01.ogg | Сумка с инструментом техника |
| `keys` | 1 | oculus: OBJKey_KeyDrop_OS_01.ogg | Связка ключей |
| `latch` | 2 | k_rpg: metal_click.ogg, metal_latch.ogg | Защёлка шкафа, кобуры, фиксатор |
| `flush` | 1 | oculus: WATRPlmb_ToiletFlushEuropean_OS_01.ogg | Санузел |
| `breath_m` | 2 (петля) | oculus/owlish: HMNBrth_MaleBreathing_OS_01.ogg, breath-male.opus | Дыхание рядом (усталость, бег, страх) |
| `breath_f` | 2 (петля) | oculus/owlish: HMNBrth_FemaleBreathing_OS_01.ogg, breath-female.opus | Дыхание (женский персонаж) |
| `breath_scared` | 1 (петля) | owlish: scared-breathing.opus | Испуганное дыхание игрока |
| `gasp` | 1 | owlish: freakedbreath.opus | Резкий вдох (испуг) |
| `cough` | 2 | owlish: cough1.opus, cough2.opus | Кашель (болезнь, пыль) |
| `sniff` | 1 | owlish: sniff.opus | Шмыганье |
| `yawn` | 1 | owlish: yawn1.opus | Зевота (ночная смена, усталость) |
| `shh` | 1 | owlish: shh1.opus | «Тсс» (наблюдатели у LF-140, LF-145) |
| `hurt_m` | 1 | oculus: VOXMale_Male01Hurt_OS_01.ogg | Травма (мужской голос) — только при реальной травме |
| `hurt_f` | 1 | oculus: VOXFem_Female01Hurt_OS_01.ogg | Травма (женский голос) |
| `scream_m` | 1 | oculus: VOXScrm_MaleScream_OS_01.ogg | Крик — только при реальной травме/атаке |
| `scream_f` | 1 | oculus: VOXScrm_FemaleScream_OS_01.ogg | Крик (женский) |
| `effort_m` | 1 | oculus: VOXEfrt_Male01Effort_OS_01.ogg | Усилие (подъём, рычаг) |
| `effort_f` | 1 | oculus: VOXEfrt_Female01Effort_OS_01.ogg | Усилие (женский) |
| `crea_breath` | 3 | oculus: CREAMnstr_CreatureCreepy_OS_01.ogg, CREAMnstr_CreatureCreepy_OS_02.ogg, CREAMnstr_CreatureCreepy_OS_03.ogg | Дыхание/хрип существа (LF-141, LF-143) |
| `crea_breath_far` | 3 | oculus: CREAMnstr_CreatureCreepyReverb_OS_01.ogg, CREAMnstr_CreatureCreepyReverb_OS_02.ogg, CREAMnstr_CreatureCreepyReverb_OS_03.ogg | То же из глубины камеры/вентиляции |
| `scratch` | 2 | oculus: METLFric_ScratchCreepy_OS_01.ogg, METLFric_ScratchCreepy_OS_02.ogg | Когти по металлу/стеклу (LF-143) |
| `scratch_far` | 2 | oculus: METLFric_ScratchCreepyReverb_OS_01.ogg, METLFric_ScratchCreepyReverb_OS_02.ogg | Скрежет в воздуховоде |
| `creak` | 5 | k_rpg/oculus: WOODFric_CreaksCreepy_OS_01.ogg, WOODFric_CreaksCreepy_OS_02.ogg, creak_1.ogg, creak_2.ogg, creak_3.ogg | Скрип суставов (LF-144), кресла (LF-140) |
| `whisper` | 1 | oculus: VOXWhsp_WhispersCreepy_OS_01.ogg | Шёпот (только эффекты восприятия, LF-142) |
| `whisper_far` | 1 | oculus: VOXWhsp_WhispersCreepyReverb_OS_01.ogg | Шёпот издалека (галлюцинации) |
| `groan_m` | 1 | oculus: VOXMale_GroanCreepy_OS_01.ogg | Стон (LF-139 «Длинношеий» в темноте) |
| `groan_f` | 1 | oculus: VOXFem_GroanCreepy_OS_01.ogg | Низкий напев (LF-145 «Тихая мать») |
| `chains` | 2 | oculus: CHAINMvmt_ChainsCreepy_OS_01.ogg, CHAINMvmt_ChainsCreepy_OS_02.ogg | Фиксаторы, цепи в камере |
| `bone_crack` | 1 | oculus: GOREBone_BonesBreaking_OS_01.ogg | Хруст позвонков при повороте головы (LF-139, LF-146) |
| `flesh` | 4 | oculus: GORESqsh_BloodSquishSlimy_OS_01.ogg, GORESqsh_BloodSquishSlimy_OS_02.ogg, GORESqsh_BloodSquishSlimy_OS_03.ogg, GORESqsh_BloodSquishSlimy_OS_04.ogg | Влажное движение тела (LF-141 «Ползун», щупальца LF-145) |
| `skitter` | 1 (петля) | fs_critters: 250540__jhumbucker__critters-creeping.opus | Скребущее перемещение многих конечностей (LF-141 в вентиляции) |
| `slime` | 2 | k_scifi: slime_000.ogg, slime_001.ogg | Слизь, отделение потомства (LF-145) |
| `field_hum` | 3 | k_scifi: force_field_000.ogg, force_field_001.ogg, force_field_002.ogg | Аномальное поле (локальное искажение у LF-146) |
| `sting` | 3 | oculus: DSGNImpt_ImpactCreepyReverb_OS_01.ogg, DSGNImpt_ImpactCreepyReverb_OS_02.ogg, DSGNImpt_ImpactCreepyReverb_OS_03.ogg | Редкий акцент для реального события (не для ложных скримеров) |

Итого звуков: 111 id, 241 файлов, 9.2 МБ (Ogg Vorbis, моно 44,1 кГц; фоновые петли — стерео).

Обработка (Tools/prepare_audio.py): обрезка тишины в начале (шаг звучит точно в момент касания), нормализация по пику −1,5 дБFS, короткие затухания, разрезка серий шагов на отдельные шаги, бесшовная петля с равномощным кроссфейдом, перекодирование.

## 3D-модели и анимации

| Файл | Что это | Автор | Лицензия | Оригинал | Откуда скачано | Где используется |
|---|---|---|---|---|---|---|
| `ual_mannequin.glb` | Скелетный манекен (53 кости) + 27 анимаций: ходьба, деловая ходьба, бег трусцой, спринт, ожидание, разговор, фонарь, пистолет, присед, сидя (вход/ожидание/разговор/выход), печать (Driving_Loop), взаимодействие, подъём предмета, ремонт на коленях, толкание, вздрагивания, падение, оборона, приземление | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-animation-library | https://github.com/J-Ponzo/gltf-universal-animation-library | Весь персонал и класс D (Web/js/humans.js), силуэты галлюцинаций и меню; гуманоидные аномалии LF-139, LF-142, LF-144, LF-146 |

## Текстуры (PBR)

| Материал | Карты | Автор | Лицензия | Оригинал | Откуда скачано | Где используется |
|---|---|---|---|---|---|---|
| `Concrete034` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Concrete034 | https://github.com/petroulacl/fps-asset-kit | Стены технических и тяжёлых зон, тоннели |
| `Concrete047A` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Concrete047A | https://github.com/petroulacl/fps-asset-kit | Бетонные полы, стены камер содержания |
| `Concrete048` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Concrete048 | https://github.com/petroulacl/fps-asset-kit | Стены коридоров сектора С и Т-2 |
| `Metal049A` | Color, NormalGL, Roughness, Metalness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Metal049A | https://github.com/petroulacl/fps-asset-kit | Двери, гермодвери, металлические панели |
| `Metal055A` | Color, NormalGL, Roughness, Metalness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Metal055A | https://github.com/petroulacl/fps-asset-kit | Решётки и настилы, лестницы, лифты |
| `Metal063` | Color, NormalGL, Roughness, Metalness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Metal063 | https://github.com/petroulacl/fps-asset-kit | Ржавый металл: насосная, генераторы, трубы |
| `Plaster001` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Plaster001 | https://github.com/petroulacl/fps-asset-kit | Стены административных помещений |
| `Plaster007` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Plaster007 | https://github.com/petroulacl/fps-asset-kit | Стены лабораторий и медблока |
| `Asphalt031` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Asphalt031 | https://github.com/petroulacl/fps-asset-kit | Пол тоннелей и приёмного шлюза (грязный) |
| `Wood092` | Color, NormalGL, Roughness | ambientCG (Lennart Demes) | CC0 1.0 | https://ambientcg.com/view?id=Wood092 | https://github.com/petroulacl/fps-asset-kit | Столы, двери кабинетов |

## Что НЕ удалось скачать

Сайты из задания недоступны из среды сборки (прокси отвечает 403): sonniss.com (GDC bundle), freesound.org (напрямую), kenney.nl, polyhaven.com, quaternius.com, sketchfab.com, fab.com, mixamo.com, poly.pizza, а также CDN jsdelivr/unpkg. Расширение доступа к этим сайтам владелец среды не одобрил. Поэтому ресурсы взяты только из зеркал на GitHub и в npm, где лицензия указана в самом репозитории. Ничего из недоступных источников в проекте нет.

