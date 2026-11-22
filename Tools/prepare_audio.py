#!/usr/bin/env python3
"""Prepare the game's audio set from downloaded source packs.

Usage:  python3 -I Tools/prepare_audio.py SRC_ROOT OUT_DIR

SRC_ROOT holds the cloned source repositories (see SOURCES below).
For every sound id the script decodes the source files with ffmpeg, converts
them to mono 44.1 kHz (stereo kept for ambience beds), trims leading silence of
one-shots so that a footstep lands exactly on foot contact, peak-normalises to
-1.5 dBFS (no clipping), fades tails, splits multi-step recordings into single
steps, makes non-loop recordings loop seamlessly with a crossfade, and encodes
Ogg Vorbis.  It writes OUT_DIR/sounds.json (id -> files, loop, gain, source)
which the game loads, and OUT_DIR/CREDITS.txt.

The source files are only read as audio data; nothing from them is executed.
"""
import json, os, subprocess, sys
import numpy as np

SR = 44100

SOURCES = {
    'oculus': dict(
        dir='ls_facebookincubator_Meta-open-sound/corpora/oculus-audio-pack/ogg',
        name='Oculus Audio Pack 01', author='Oculus VR, LLC',
        url='https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/',
        mirror='https://github.com/facebookincubator/Meta-open-sound',
        license='CC BY 4.0',
        credit='"Oculus Audio Pack 01" by Oculus VR, LLC (https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/), licensed under CC BY 4.0. Files renamed to the UCS naming convention; OGG previews transcoded from the original WAVs. Further trimmed, normalised and re-encoded for SCP LIFE.'),
    'owlish': dict(
        dir='ls_EternityForest_Free-SFX/Owlish/Sound Effects Pack',
        name='Sound Effects Pack', author='Owlish Media (OpenGameArt)',
        url='https://opengameart.org/content/sound-effects-pack',
        mirror='https://github.com/EternityForest/Free-SFX', license='CC0 1.0'),
    'electricity': dict(
        dir='ls_EternityForest_Free-SFX/Electricity',
        name='Electricity game sound pack', author='OpenGameArt contributor (via EternityForest/Free-SFX)',
        url='https://opengameart.org/content/electricity-game-sound-pack',
        mirror='https://github.com/EternityForest/Free-SFX', license='CC0 1.0'),
    'fs_critters': dict(
        dir='ls_EternityForest_Free-SFX/Freesound/Animals',
        name='critters creeping', author='jhumbucker (Freesound)',
        url='https://freesound.org/people/jhumbucker/sounds/250540/',
        mirror='https://github.com/EternityForest/Free-SFX', license='CC0 1.0'),
    'fs_water': dict(
        dir='ls_EternityForest_Free-SFX/Freesound/Nature',
        name='water trickling', author='kaydinhamby (Freesound)',
        url='https://freesound.org/people/kaydinhamby/sounds/381202/',
        mirror='https://github.com/EternityForest/Free-SFX', license='CC0 1.0'),
    'fs_wind': dict(
        dir='ls_EternityForest_Free-SFX/Freesound/Nature',
        name='Wind 01 - Inside a metallic squeaking building', author='Julien Matthey (Freesound)',
        url='https://freesound.org/people/Julien%20Matthey/sounds/557188/',
        mirror='https://github.com/EternityForest/Free-SFX', license='CC0 1.0'),
    'k_impact': dict(
        dir='impact/addons/kenney impact sounds', name='Impact Sounds', author='Kenney (kenney.nl)',
        url='https://kenney.nl/assets/impact-sounds',
        mirror='https://github.com/Boyquotes/kenney-impact-sounds-for-godot', license='CC0 1.0'),
    'k_rpg': dict(
        dir='rpg/addons/kenney rpg audio', name='RPG Audio', author='Kenney (kenney.nl)',
        url='https://kenney.nl/assets/rpg-audio',
        mirror='https://github.com/Boyquotes/kenney-rpg-audio-for-godot', license='CC0 1.0'),
    'k_scifi': dict(
        dir='scifi/addons/kenney sci-fi sounds', name='Sci-fi Sounds', author='Kenney (kenney.nl)',
        url='https://kenney.nl/assets/sci-fi-sounds',
        mirror='https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot', license='CC0 1.0'),
}

def O(*names):
    return [('oculus', n + '.ogg') for n in names]

def K(src, *names):
    return [(src, n + '.ogg') for n in names]

def rng(prefix, a, b, fmt='%s%02d'):
    return [fmt % (prefix, i) for i in range(a, b + 1)]

# id: dict(src=[(source, file)], kind=oneshot|loop|split, gain, use, stereo, maxlen, fade, cut=(start,len))
CATALOG = {
    # ---------------------------------------------------------------- footsteps
    'step_concrete_walk': dict(src=O(*rng('FEETHmn_ShoeConcreteWalk_OS_', 1, 5)) +
                               [('owlish', 'Footsteps/hard-footstep%d.opus' % i) for i in range(1, 5)],
                               use='Шаги: бетон, обычная обувь (игрок и NPC)'),
    'step_concrete_run': dict(src=O(*rng('FEETHmn_ShoeConcreteRun_OS_', 1, 5)), use='Бег по бетону'),
    'step_concrete_land': dict(src=O(*rng('FEETHmn_ShoeConcreteLand_OS_', 1, 2)), use='Тяжёлые ботинки (слой удара пятки), остановка'),
    'step_metal_walk': dict(src=O(*rng('FEETHmn_ShoeMetalWalk_OS_', 1, 5)), use='Шаги: металлическая решётка, мостки, тоннели'),
    'step_metal_run': dict(src=O(*rng('FEETHmn_ShoeMetalRun_OS_', 1, 5)), use='Бег по металлу'),
    'step_metal_land': dict(src=O(*rng('FEETHmn_ShoeMetalLand_OS_', 1, 2)), use='Тяжёлые ботинки по металлу'),
    'step_grit_walk': dict(src=O(*rng('FEETHmn_ShoeDirtWalk_OS_', 1, 5)), use='Шаги: технический пол с песком и пылью, мокрый/грязный пол (слой)'),
    'step_grit_run': dict(src=O(*rng('FEETHmn_ShoeDirtRun_OS_', 1, 3)), use='Бег по грязному техническому полу'),
    'step_panel_walk': dict(src=O(*rng('FEETHmn_ShoeWoodWalk_OS_', 1, 5)), use='Шаги: фальшпол (серверные, диспетчерская) — полый отзвук'),
    'step_tile_walk': dict(src=K('k_impact', *['footstep_concrete_%03d' % i for i in range(5)]), use='Шаги: кафель (лаборатории, медблок, кухня)'),
    'step_carpet_walk': dict(src=K('k_impact', *['footstep_carpet_%03d' % i for i in range(5)]), use='Шаги: ковролин (кабинеты администрации, жилой блок)'),
    'step_heels': dict(src=[('owlish', 'Footsteps/Womens_shoes_%d.opus' % i) for i in (1, 2, 3)], kind='split',
                       use='Шаги: женская обувь на каблуке по твёрдому полу (администрация)'),
    'stumble': dict(src=[('owlish', 'Footsteps/stumble.opus')], use='Спотыкание (реакция испуга)'),
    'cloth': dict(src=O(*rng('CLOTHMvmt_ClothingMovement_OS_', 1, 4)) + K('k_rpg', 'cloth_1', 'cloth_2', 'cloth_3', 'cloth_4'),
                  gain=0.7, use='Шорох одежды при движении, посадке, жестах'),
    'gear': dict(src=O(*rng('CLOTHMvmt_MovementWithGear_OS_', 1, 4)) + K('k_rpg', 'belt_handle_1', 'belt_handle_2'),
                 gain=0.7, use='Снаряжение охраны и МОГ (бряцание при ходьбе и беге)'),
    # -------------------------------------------------------------------- doors
    'door_slide_open': dict(src=O('DOORSlid_SlidingDoorOpen_OS_01') + K('k_scifi', 'door_open_000', 'door_open_001'),
                            use='Обычная раздвижная дверь: открытие'),
    'door_slide_close': dict(src=O('DOORSlid_SlidingDoorClose_OS_01') + K('k_scifi', 'door_close_000', 'door_close_001'),
                             use='Обычная раздвижная дверь: закрытие'),
    'door_heavy_open': dict(src=O('DOORMetl_HatchOpen_OS_01'), use='Гермодверь камеры содержания: открытие'),
    'door_heavy_close': dict(src=O('DOORMetl_HatchClose_OS_01'), use='Гермодверь камеры содержания: закрытие'),
    'door_blast_open': dict(src=O('DOORMetl_GarageDoorOpen_OS_01'), maxlen=5.0, use='Взрывозащитная дверь при локдауне: открытие'),
    'door_blast_close': dict(src=O('DOORMetl_GarageDoorClose_OS_01'), maxlen=5.0, use='Взрывозащитная дверь при локдауне: закрытие'),
    'door_airlock_open': dict(src=O('TRNDoor_TrainDoorsOpen_OS_01'), use='Шлюз (пневматика): открытие'),
    'door_airlock_close': dict(src=O('TRNDoor_TrainDoorsClose_OS_01'), use='Шлюз (пневматика): закрытие'),
    'hydraulic': dict(src=O('MACHInd_Hydraulic_OS_01'), use='Гидравлика шлюза, лифта, тяжёлых затворов'),
    'door_lock': dict(src=O('DOORHdwr_SlidingDoorLock_OS_01', 'DOORHdwr_OfficeDoorLock_OS_01', 'MECHLock_DoorLockKey_OS_01'),
                      use='Замок двери, блокировка'),
    'door_unlock': dict(src=O('MECHLock_DoorUnlockKey_OS_01', 'DOORHdwr_OfficeDoorKnob_OS_01'), use='Отпирание'),
    'card_ok': dict(src=O('UIClick_ScifiHightechConfirm_OS_01'), use='Считыватель карты: доступ разрешён'),
    'card_deny': dict(src=O('UIAlert_ScifiHightechError_OS_01'), use='Считыватель карты: отказ'),
    'knock_door': dict(src=O('DOORKnck_OfficeDoorKnock_OS_01'), use='Стук в дверь'),
    'knock_metal': dict(src=K('k_impact', *['impact_metal_light_%03d' % i for i in range(5)]),
                        use='Стук в воздуховоде/по металлу (вентиляция, сущности)'),
    'glass_tap': dict(src=K('k_impact', *['impact_glass_light_%03d' % i for i in range(5)]),
                      use='Касание/постукивание по стеклу смотрового окна'),
    'glass_hit': dict(src=K('k_impact', *['impact_glass_medium_%03d' % i for i in range(5)]),
                      use='Удар по стеклу (существо у стекла)'),
    # ------------------------------------------------------- facility machines
    'amb_machine': dict(src=O('AMBInd_RoomToneMachineRoom_LOOP_01'), kind='loop', stereo=True, use='Фон машинного зала, генераторная'),
    'amb_hvac': dict(src=O('MACHHvac_HVAC_LOOP_01'), kind='loop', use='Вентиляция (работает по реальному состоянию систем)'),
    'amb_fan': dict(src=O('MACHFan_Fan_LOOP_01'), kind='loop', use='Вентилятор в помещении, серверные стойки'),
    'amb_hum1': dict(src=O('MACHMisc_MachineHum_LOOP_01'), kind='loop', stereo=True, use='Гул лабораторного оборудования'),
    'amb_hum2': dict(src=O('MACHMisc_MachineHum_LOOP_02'), kind='loop', stereo=True, use='Гул щитовых, трансформаторов'),
    'amb_machine2': dict(src=O('MACHMisc_MachineGeneric_LOOP_01'), kind='loop', use='Мастерская, насосы'),
    'amb_machine3': dict(src=O('MACHMisc_MachineGeneric_LOOP_02'), kind='loop', use='Генератор (позиционный источник)'),
    'amb_room1': dict(src=O('AMBHome_RoomTone_LOOP_01'), kind='loop', stereo=True, use='Тихий тон помещения: кабинеты, жилой блок'),
    'amb_room2': dict(src=O('AMBHome_RoomTone_LOOP_02'), kind='loop', stereo=True, use='Тихий тон помещения: наблюдательные'),
    'amb_canteen': dict(src=O('CRWDConv_Restaurant_LOOP_01'), kind='loop', stereo=True, gain=0.6, use='Гомон столовой (громкость по числу людей)'),
    'amb_water': dict(src=O('WATRPlmb_FaucetWaterRun_LOOP_01'), kind='loop', use='Вода на кухне, в душевых'),
    'amb_drip': dict(src=[('fs_water', '381202__kaydinhamby__water-trickling.opus')], kind='loop', maxlen=24.0,
                     use='Протечка (высокая влажность, неисправность)'),
    'amb_shaft': dict(src=[('fs_wind', '557188__julien-matthey__jm_natural-elements_wind-01-tornado-inside-a-metalic-squeaking-building.opus')],
                      kind='loop', stereo=True, maxlen=30.0, gain=0.7, use='Сквозняк и скрип металла: шахты, тоннели уровня 4'),
    'amb_dread1': dict(src=O('DSGNDron_DroneCreepy_OS_01'), kind='loop', stereo=True, gain=0.6,
                       use='Тревожный фон (только состояния «паранойя/угроза» директора хоррора)'),
    'amb_dread2': dict(src=O('DSGNDron_DroneCreepy_OS_02'), kind='loop', stereo=True, gain=0.6, use='Тревожный фон, нулевой этаж'),
    'hvac_on': dict(src=O('MACHHvac_HVACOn_OS_01'), use='Пуск вентиляции после отключения'),
    'hvac_off': dict(src=O('MACHHvac_HVACOff_OS_01'), use='Остановка вентиляции'),
    'fan_start': dict(src=O('MACHFan_FanStart_OS_01'), maxlen=5.0, use='Раскрутка вентилятора'),
    'fan_off': dict(src=O('MACHFan_FanOff_OS_01'), maxlen=5.0, use='Остановка вентилятора'),
    'power_down': dict(src=[('electricity', 'powerdown.opus')], use='Отключение питания сектора'),
    'power_up': dict(src=[('electricity', 'powerup.opus')], use='Восстановление питания'),
    'spark': dict(src=[('electricity', 'crackleelectricityloop.opus')], kind='loop', gain=0.6, use='Искрение неисправной проводки'),
    'servo': dict(src=O('MOTRSrvo_Servo_OS_01', 'MOTRSrvo_Servo_OS_02'), maxlen=2.5, use='Сервопривод поворотной камеры, манипулятор'),
    'lever': dict(src=O('MECHLvr_LeverPull_OS_01', 'MECHLvr_LeverPull_OS_02'), use='Рубильник, аварийный рычаг'),
    'switch_on': dict(src=O('MECHSwtch_SwitchSmallOn_OS_01'), use='Выключатель'),
    'switch_off': dict(src=O('MECHSwtch_SwitchSmallOff_OS_01'), use='Выключатель'),
    'panel_open': dict(src=O('METLHndl_ElectricBoxOpen_OS_01'), use='Электрощит открыт (ремонт)'),
    'valve': dict(src=O('WATRPlmb_ValveTurn_OS_01'), use='Вентиль (сантехника, увлажнение)'),
    'keyboard': dict(src=O('UIClick_KeyboardTyping_OS_01'), kind='split', use='Печать на клавиатуре терминала (NPC и игрок)'),
    'computer': dict(src=K('k_scifi', *['computer_noise_%03d' % i for i in range(4)]), gain=0.6, use='Сигналы терминалов и приборов'),
    'ui_open': dict(src=O('UIClick_ScifiHightechOpen_OS_01'), use='Интерфейс КПК/терминала: открыть'),
    'ui_close': dict(src=O('UIClick_ScifiHightechClose_OS_01'), use='Интерфейс: закрыть'),
    'ui_notify': dict(src=O('UIAlert_Notification_OS_01'), use='Уведомление КПК'),
    'alarm': dict(src=[('owlish', 'Scifi/siren.opus')], kind='loop', maxlen=12.0, use='Сирена тревоги (локдаун, нарушение содержания)'),
    'clock': dict(src=[('owlish', 'Ambience/loopable-ticking-clock.opus')], kind='loop', gain=0.5, use='Настенные часы в кабинетах'),
    'clock_creepy': dict(src=O('CLOCKTick_ClockCreepy_OS_01'), kind='loop', gain=0.6, use='Часы в камере LF-140 «Сидящий»'),
    # ------------------------------------------------------------------ objects
    'paper': dict(src=O('PAPRHndl_BookPageTurns_OS_01') + K('k_rpg', 'book_flip_1', 'book_flip_2', 'book_flip_3'), maxlen=2.0,
                  use='Листание документов, чтение'),
    'paper_crumple': dict(src=O('PAPRHndl_PaperCrumple_OS_01'), maxlen=1.6, use='Мятая бумага'),
    'book_open': dict(src=O('OBJBook_BookOpen_OS_01') + K('k_rpg', 'book_open'), use='Папка/журнал открыт'),
    'book_close': dict(src=O('OBJBook_BookClose_OS_01') + K('k_rpg', 'book_close'), use='Папка/журнал закрыт'),
    'cup': dict(src=O('PLASImpt_PlasticCupDrop_OS_01', 'FOODTware_SpoonDrop_OS_01'), use='Посуда в столовой'),
    'pot': dict(src=K('k_rpg', 'metal_pot_1', 'metal_pot_2', 'metal_pot_3'), use='Кухня: кастрюли, раздача'),
    'cart': dict(src=O('WOODFric_LargeWoodMetalDrag_OS_01'), use='Тележка, перемещение ящиков'),
    'metal_hit': dict(src=O('METLImpt_MetalHitSurface_OS_01', 'METLImpt_MetalHitSurface_OS_02') + K('k_scifi', 'impact_metal_000', 'impact_metal_001'),
                      use='Удар металла (инструмент, падение предмета)'),
    'bucket': dict(src=O('METLImpt_BucketDrop_OS_01'), use='Ведро уборщика'),
    'toolbag': dict(src=O('OBJBag_ToolBagDrop_OS_01'), use='Сумка с инструментом техника'),
    'keys': dict(src=O('OBJKey_KeyDrop_OS_01'), use='Связка ключей'),
    'latch': dict(src=K('k_rpg', 'metal_latch', 'metal_click'), use='Защёлка шкафа, кобуры, фиксатор'),
    'flush': dict(src=O('WATRPlmb_ToiletFlushEuropean_OS_01'), maxlen=5.0, use='Санузел'),
    # ------------------------------------------------------------------- humans
    'breath_m': dict(src=[('owlish', 'Human/breath-male.opus')] + O('HMNBrth_MaleBreathing_OS_01'), kind='loop', maxlen=10.0,
                     use='Дыхание рядом (усталость, бег, страх)'),
    'breath_f': dict(src=[('owlish', 'Human/breath-female.opus')] + O('HMNBrth_FemaleBreathing_OS_01'), kind='loop', maxlen=10.0,
                     use='Дыхание (женский персонаж)'),
    'breath_scared': dict(src=[('owlish', 'Human/scared-breathing.opus')], kind='loop', maxlen=12.0, use='Испуганное дыхание игрока'),
    'gasp': dict(src=[('owlish', 'Human/freakedbreath.opus')], use='Резкий вдох (испуг)'),
    'cough': dict(src=[('owlish', 'Human/cough1.opus'), ('owlish', 'Human/cough2.opus')], use='Кашель (болезнь, пыль)'),
    'sniff': dict(src=[('owlish', 'Human/sniff.opus')], use='Шмыганье'),
    'yawn': dict(src=[('owlish', 'Human/yawn1.opus')], use='Зевота (ночная смена, усталость)'),
    'shh': dict(src=[('owlish', 'Human/shh1.opus')], use='«Тсс» (наблюдатели у LF-140, LF-145)'),
    'hurt_m': dict(src=O('VOXMale_Male01Hurt_OS_01'), use='Травма (мужской голос) — только при реальной травме'),
    'hurt_f': dict(src=O('VOXFem_Female01Hurt_OS_01'), use='Травма (женский голос)'),
    'scream_m': dict(src=O('VOXScrm_MaleScream_OS_01'), use='Крик — только при реальной травме/атаке'),
    'scream_f': dict(src=O('VOXScrm_FemaleScream_OS_01'), use='Крик (женский)'),
    'effort_m': dict(src=O('VOXEfrt_Male01Effort_OS_01'), use='Усилие (подъём, рычаг)'),
    'effort_f': dict(src=O('VOXEfrt_Female01Effort_OS_01'), use='Усилие (женский)'),
    # --------------------------------------------------------------- creatures
    'crea_breath': dict(src=O(*rng('CREAMnstr_CreatureCreepy_OS_', 1, 3)), use='Дыхание/хрип существа (LF-141, LF-143)'),
    'crea_breath_far': dict(src=O(*rng('CREAMnstr_CreatureCreepyReverb_OS_', 1, 3)), use='То же из глубины камеры/вентиляции'),
    'scratch': dict(src=O('METLFric_ScratchCreepy_OS_01', 'METLFric_ScratchCreepy_OS_02'), use='Когти по металлу/стеклу (LF-143)'),
    'scratch_far': dict(src=O('METLFric_ScratchCreepyReverb_OS_01', 'METLFric_ScratchCreepyReverb_OS_02'), use='Скрежет в воздуховоде'),
    'creak': dict(src=O('WOODFric_CreaksCreepy_OS_01', 'WOODFric_CreaksCreepy_OS_02') + K('k_rpg', 'creak_1', 'creak_2', 'creak_3'),
                  maxlen=2.5, use='Скрип суставов (LF-144), кресла (LF-140)'),
    'whisper': dict(src=O('VOXWhsp_WhispersCreepy_OS_01'), use='Шёпот (только эффекты восприятия, LF-142)'),
    'whisper_far': dict(src=O('VOXWhsp_WhispersCreepyReverb_OS_01'), use='Шёпот издалека (галлюцинации)'),
    'groan_m': dict(src=O('VOXMale_GroanCreepy_OS_01'), use='Стон (LF-139 «Длинношеий» в темноте)'),
    'groan_f': dict(src=O('VOXFem_GroanCreepy_OS_01'), use='Низкий напев (LF-145 «Тихая мать»)'),
    'chains': dict(src=O('CHAINMvmt_ChainsCreepy_OS_01', 'CHAINMvmt_ChainsCreepy_OS_02'), maxlen=3.0, use='Фиксаторы, цепи в камере'),
    'bone_crack': dict(src=O('GOREBone_BonesBreaking_OS_01'), gain=0.55, use='Хруст позвонков при повороте головы (LF-139, LF-146)'),
    'flesh': dict(src=O(*rng('GORESqsh_BloodSquishSlimy_OS_', 1, 4)), maxlen=2.5, gain=0.6,
                  use='Влажное движение тела (LF-141 «Ползун», щупальца LF-145)'),
    'skitter': dict(src=[('fs_critters', '250540__jhumbucker__critters-creeping.opus')], kind='loop', maxlen=14.0,
                    use='Скребущее перемещение многих конечностей (LF-141 в вентиляции)'),
    'slime': dict(src=K('k_scifi', 'slime_000', 'slime_001'), use='Слизь, отделение потомства (LF-145)'),
    'field_hum': dict(src=K('k_scifi', 'force_field_000', 'force_field_001', 'force_field_002'), gain=0.5,
                      use='Аномальное поле (локальное искажение у LF-146)'),
    'sting': dict(src=O(*rng('DSGNImpt_ImpactCreepyReverb_OS_', 1, 3)), gain=0.7,
                  use='Редкий акцент для реального события (не для ложных скримеров)'),
}

def ffdecode(path, stereo):
    ch = 2 if stereo else 1
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    a = np.frombuffer(out, dtype=np.float32).copy()
    return a.reshape(-1, ch)

def ffencode(a, path, q):
    ch = a.shape[1]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-',
                    '-c:a', 'libvorbis', '-q:a', str(q), path], input=a.astype(np.float32).tobytes(), check=True)

def env(a):
    return np.abs(a).max(axis=1)

def trim(a, thr_db=-46, pre=0.004):
    e = env(a); peak = e.max() or 1.0
    thr = peak * 10 ** (thr_db / 20)
    idx = np.nonzero(e > thr)[0]
    if not len(idx):
        return a
    s = max(0, idx[0] - int(pre * SR)); t = min(len(a), idx[-1] + int(0.06 * SR))
    return a[s:t]

def fade(a, fin=0.003, fout=0.04):
    n = len(a); i = min(int(fin * SR), n // 4); o = min(int(fout * SR), n // 3)
    if i > 0: a[:i] *= np.linspace(0, 1, i)[:, None]
    if o > 0: a[-o:] *= np.linspace(1, 0, o)[:, None]
    return a

def normalize(a, peak_db=-1.5):
    p = np.abs(a).max()
    if p <= 0: return a
    return a * (10 ** (peak_db / 20) / p)

def loudness_rms(a):
    return float(np.sqrt(np.mean(a ** 2)) + 1e-9)

def crossfade_loop(a, xf=1.5):
    n = int(min(xf, len(a) / 4 / SR) * SR)
    if n < 64: return a
    head = a[:n]; tail = a[-n:]
    w = np.linspace(0, 1, n)[:, None]
    # equal power crossfade: tail fades out while head fades in, placed at the start
    mixed = tail * np.cos(w * np.pi / 2) + head * np.sin(w * np.pi / 2)
    return np.concatenate([mixed, a[n:-n]])

def split_steps(a, min_gap=0.09, thr_db=-30, min_len=0.06, max_len=0.5):
    e = env(a); peak = e.max() or 1
    win = int(0.005 * SR)
    sm = np.convolve(e, np.ones(win) / win, mode='same')
    on = sm > peak * 10 ** (thr_db / 20)
    parts = []; i = 0; n = len(a); gap = int(min_gap * SR)
    while i < n:
        if not on[i]: i += 1; continue
        s = i; last = i
        while i < n and (on[i] or i - last < gap):
            if on[i]: last = i
            i += 1
        seg = a[max(0, s - int(0.004 * SR)):min(n, last + int(0.05 * SR))]
        if len(seg) >= min_len * SR:
            parts.append(seg[:int(max_len * SR)])
    return parts

def main():
    root, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    manifest = {}; used_sources = set(); total = 0
    for sid, d in CATALOG.items():
        kind = d.get('kind', 'oneshot'); stereo = d.get('stereo', False)
        clips = []
        for src, fn in d['src']:
            path = os.path.join(root, SOURCES[src]['dir'], fn)
            if not os.path.exists(path):
                print('MISSING', sid, path); continue
            a = ffdecode(path, stereo)
            used_sources.add(src)
            if kind == 'split':
                kb = sid == 'keyboard'
                pieces = split_steps(a, max_len=1.6 if kb else 0.5, min_gap=0.25 if kb else 0.09,
                                     min_len=0.06 if kb else 0.1)
                clips += [(src, fn, p) for p in pieces[:10 if kb else 4]]
            else:
                clips.append((src, fn, a))
        files = []; rms = []
        for k, (src, fn, a) in enumerate(clips):
            if kind != 'loop':
                a = trim(a)
            cut = d.get('maxlen') or (32.0 if kind == 'loop' else None)
            trimmed = bool(cut) and len(a) > cut * SR
            if trimmed:
                a = a[:int((cut + (1.5 if kind == 'loop' else 0)) * SR)]
            if kind == 'loop':
                if 'LOOP' not in fn or trimmed:
                    a = crossfade_loop(a)
                a = normalize(a, -3.0)
            else:
                a = fade(normalize(a, -1.5))
            rms.append(loudness_rms(a))
            name = '%s_%d.ogg' % (sid, k + 1) if len(clips) > 1 else sid + '.ogg'
            ffencode(a, os.path.join(out, name), 3 if kind == 'loop' else 4)
            total += os.path.getsize(os.path.join(out, name))
            files.append({'f': name, 'src': src, 'orig': fn, 'dur': round(len(a) / SR, 3)})
        if not files:
            continue
        manifest[sid] = {'files': [x['f'] for x in files], 'loop': kind == 'loop', 'gain': d.get('gain', 1.0),
                         'dur': [x['dur'] for x in files], 'use': d['use'],
                         'sources': sorted({x['src'] for x in files}),
                         'orig': [x['orig'] for x in files]}
        print('%-20s %2d files' % (sid, len(files)))
    meta = {k: {kk: vv for kk, vv in v.items() if kk != 'dir'} for k, v in SOURCES.items() if k in used_sources}
    with open(os.path.join(out, 'sounds.json'), 'w', encoding='utf-8') as fh:
        json.dump({'sources': meta, 'sounds': manifest}, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(out, 'CREDITS.txt'), 'w', encoding='utf-8') as fh:
        for k, v in meta.items():
            fh.write('%s — %s — %s — %s\n  %s\n' % (v['name'], v['author'], v['license'], v['url'], v.get('credit', 'mirror: ' + v['mirror'])))
    print('total %.1f MB in %d sounds' % (total / 1e6, len(manifest)))

if __name__ == '__main__':
    main()
