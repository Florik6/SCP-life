#!/usr/bin/env python3
"""Prepare PBR textures (ambientCG, CC0) for the game: resize to 512 px (phones) and 1024 px (high quality), JPEG.

Usage: python3 -I Tools/prepare_textures.py SRC_TEXTURES_DIR OUT_DIR
Writes OUT_DIR/<size>/<set>_<map>.jpg and OUT_DIR/textures.json (registry data used by Tools/asset_registry.py).
"""
import json, os, sys
from PIL import Image

SETS = {
    'Concrete034': 'Стены технических и тяжёлых зон, тоннели',
    'Concrete047A': 'Бетонные полы, стены камер содержания',
    'Concrete048': 'Стены коридоров сектора С и Т-2',
    'Metal049A': 'Двери, гермодвери, металлические панели',
    'Metal055A': 'Решётки и настилы, лестницы, лифты',
    'Metal063': 'Ржавый металл: насосная, генераторы, трубы',
    'Plaster001': 'Стены административных помещений',
    'Plaster007': 'Стены лабораторий и медблока',
    'Asphalt031': 'Пол тоннелей и приёмного шлюза (грязный)',
    'Wood092': 'Столы, двери кабинетов',
}
MAPS = ['Color', 'NormalGL', 'Roughness', 'Metalness']

def main():
    src, out = sys.argv[1], sys.argv[2]
    reg = {'textures': {}}
    for size in (512, 1024):
        os.makedirs(os.path.join(out, str(size)), exist_ok=True)
    for s, use in SETS.items():
        maps = []
        for m in MAPS:
            p = os.path.join(src, s, '%s_2K-JPG_%s.jpg' % (s, m))
            if not os.path.exists(p):
                continue
            im = Image.open(p)
            im = im.convert('RGB' if m in ('Color', 'NormalGL') else 'L')
            for size in (512, 1024):
                im.resize((size, size), Image.LANCZOS).save(os.path.join(out, str(size), '%s_%s.jpg' % (s, m)), quality=84 if m != 'NormalGL' else 90, optimize=True)
            maps.append(m)
        reg['textures'][s] = {'maps': maps, 'author': 'ambientCG (Lennart Demes)', 'license': 'CC0 1.0', 'url': 'https://ambientcg.com/view?id=' + s,
                              'mirror': 'https://github.com/petroulacl/fps-asset-kit', 'use': use}
        print(s, maps)
    json.dump(reg, open(os.path.join(out, 'textures.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
