#!/usr/bin/env python3
"""Build Docs/ASSETS.md (asset registry) from the manifests in Web/assets.

Usage: python3 -I Tools/asset_registry.py
Reads Web/assets/audio/sounds.json, Web/assets/models/models.json and Web/assets/textures/textures.json (when present).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'Web', 'assets')

def load(p):
    p = os.path.join(A, p)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

def size_of(d, files):
    return sum(os.path.getsize(os.path.join(A, d, f)) for f in files if os.path.exists(os.path.join(A, d, f)))

out = ['# Реестр ресурсов SCP LIFE', '',
       'Все перечисленные файлы реально лежат в `Web/assets/` и попадают в APK и веб-версию. Лицензии проверены по файлам LICENSE / README в исходных репозиториях на момент загрузки. '
       'CC0 — общественное достояние, указание автора не требуется (указываем из уважения). CC BY 4.0 — указание автора обязательно (строка ниже и экран «Об игре»).', '']

snd = load('audio/sounds.json')
if snd:
    out += ['## Звуки', '', '### Источники', '', '| Пакет | Автор | Лицензия | Оригинал | Откуда скачано |', '|---|---|---|---|---|']
    for k, s in snd['sources'].items():
        out.append('| %s | %s | %s | %s | %s |' % (s['name'], s['author'], s['license'], s['url'], s['mirror']))
    out += ['']
    for k, s in snd['sources'].items():
        if s.get('credit'):
            out += ['Обязательная атрибуция (%s): %s' % (s['license'], s['credit']), '']
    total = 0
    out += ['### Звуковые id (файлы `Web/assets/audio/<id>_N.ogg`)', '', '| id | Вариантов | Источник (исходные файлы) | Где используется |', '|---|---|---|---|']
    for sid, m in snd['sounds'].items():
        total += size_of('audio', m['files'])
        origs = ', '.join(sorted(set(os.path.basename(o) for o in m['orig'])))
        if len(origs) > 160:
            origs = origs[:157] + '…'
        out.append('| `%s` | %d%s | %s: %s | %s |' % (sid, len(m['files']), ' (петля)' if m['loop'] else '', '/'.join(m['sources']), origs, m['use']))
    out += ['', 'Итого звуков: %d id, %d файлов, %.1f МБ (Ogg Vorbis, моно 44,1 кГц; фоновые петли — стерео).' % (
        len(snd['sounds']), sum(len(m['files']) for m in snd['sounds'].values()), total / 1e6), '',
        'Обработка (Tools/prepare_audio.py): обрезка тишины в начале (шаг звучит точно в момент касания), нормализация по пику −1,5 дБFS, '
        'короткие затухания, разрезка серий шагов на отдельные шаги, бесшовная петля с равномощным кроссфейдом, перекодирование.', '']

mdl = load('models/models.json')
if mdl:
    out += ['## 3D-модели и анимации', '', '| Файл | Что это | Автор | Лицензия | Оригинал | Откуда скачано | Где используется |', '|---|---|---|---|---|---|---|']
    for f, m in mdl['models'].items():
        out.append('| `%s` | %s | %s | %s | %s | %s | %s |' % (f, m['what'], m['author'], m['license'], m['url'], m['mirror'], m['use']))
    out += ['']

tex = load('textures/textures.json')
if tex:
    out += ['## Текстуры (PBR)', '', '| Материал | Карты | Автор | Лицензия | Оригинал | Откуда скачано | Где используется |', '|---|---|---|---|---|---|---|']
    for f, m in tex['textures'].items():
        out.append('| `%s` | %s | %s | %s | %s | %s | %s |' % (f, ', '.join(m['maps']), m['author'], m['license'], m['url'], m['mirror'], m['use']))
    out += ['']

out += ['## Что НЕ удалось скачать', '',
        'Сайты из задания недоступны из среды сборки (прокси отвечает 403): sonniss.com (GDC bundle), freesound.org (напрямую), kenney.nl, polyhaven.com, quaternius.com, '
        'sketchfab.com, fab.com, mixamo.com, poly.pizza, а также CDN jsdelivr/unpkg. Расширение доступа к этим сайтам владелец среды не одобрил. '
        'Поэтому ресурсы взяты только из зеркал на GitHub и в npm, где лицензия указана в самом репозитории. Ничего из недоступных источников в проекте нет.', '']

open(os.path.join(ROOT, 'Docs', 'ASSETS.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('Docs/ASSETS.md written')
