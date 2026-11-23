#!/usr/bin/env python3
"""Prepare weapon models and gunshot sounds for SCP LIFE (CRISIS update).

Usage:  python3 -I Tools/prepare_weapons.py FPS_ASSET_KIT_DIR

FPS_ASSET_KIT_DIR is a clone of https://github.com/petroulacl/fps-asset-kit (CC0):
  * weapons/flat_guns_west|east/.../GLB/*.glb  — "CC0 Flat Guns West/East" by Pitchblende / OpenGameArt
  * sfx/firearm_sfx/Prepared SFX Library/...   — "The Free Firearm Sound Library" (CC0), field recordings

For every weapon the script copies the GLB (rigged: slide, magazine, trigger, bolt, pump are separate bones) to
Web/assets/models/weapons/ and writes a glTF-JSON twin with an embedded buffer (the web build cannot serve .glb).
Gunshots: the first shot of the recording is cut out (onset detection), converted to mono 44.1 kHz, peak-normalised
to -1 dBFS, given a natural tail fade, and encoded Ogg Vorbis into Web/assets/audio; sounds.json and models.json get
the entries with source and licence. Source files are only read as data; nothing from them is executed.
"""
import base64, json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
LIB = 'sfx/firearm_sfx/Prepared SFX Library'
MODELS = {
    'pistol.glb': ('weapons/flat_guns_west/Flat Guns West/GLB/Pistol_Compact_West.glb', 'Пистолет (компактный), риг: затвор, магазин, спуск, ствол', 'Служебный пистолет охраны'),
    'carbine.glb': ('weapons/flat_guns_west/Flat Guns West/GLB/Rifle_Assault_West.glb', 'Карабин, риг: магазин, затвор, рукоять взведения, приклад', 'Карабин назначенных сотрудников охраны и оперативников МОГ'),
    'smg.glb': ('weapons/flat_guns_west/Flat Guns West/GLB/SMG_Compact_West.glb', 'Пистолет-пулемёт, риг: магазин, затвор, приклад', 'Оружие оперативников МОГ в тесных помещениях'),
    'shotgun.glb': ('weapons/flat_guns_west/Flat Guns West/GLB/Shotgun_Pump_West.glb', 'Помповое ружьё, риг: цевьё, патрон, подаватель', 'Оружие МОГ для работы с биологическими объектами'),
}
SOUNDS = {
    'gun_pistol': (['Walther PPQ/X_39P.wav', 'Walther PPQ/X_31P.wav'], 0.9, 1.0, 'Выстрел служебного пистолета (Walther PPQ, 9 мм)'),
    'gun_carbine': (['AR-15/D_32P.wav', 'AR-15/D_24P.wav'], 1.1, 1.0, 'Выстрел карабина (AR-15, 5,56 мм)'),
    'gun_smg': (['Carl Gustav M45/G_20P.wav'], 0.75, 0.95, 'Выстрел пистолета-пулемёта (Carl Gustav M45, 9 мм)'),
    'gun_shotgun': (['Mossberg/N_26P.wav'], 1.3, 1.0, 'Выстрел ружья (Mossberg, 12 калибр)'),
}

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

def first_shot(x, length):
    env = np.abs(x); thr = env.max() * 0.25
    on = int(np.argmax(env > thr)); start = max(0, on - int(0.004 * SR))
    seg = x[start:start + int(length * SR)].copy()
    fade = int(0.35 * len(seg)); seg[-fade:] *= np.linspace(1, 0, fade) ** 2
    seg /= max(1e-6, np.abs(seg).max()); seg *= 10 ** (-1 / 20)
    return seg

def encode(seg, out):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libvorbis', '-q:a', '5', out], input=seg.astype(np.float32).tobytes(), check=True)

def glb_to_json(glb):
    b = open(glb, 'rb').read(); n = int.from_bytes(b[12:16], 'little'); j = json.loads(b[20:20 + n])
    off = 20 + n; bl = int.from_bytes(b[off:off + 4], 'little'); bin_ = b[off + 8:off + 8 + bl]
    j['buffers'] = [{'byteLength': len(bin_), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bin_).decode()}]
    return j

def main():
    src = sys.argv[1]; mdir = os.path.join(ROOT, 'Web', 'assets', 'models', 'weapons'); adir = os.path.join(ROOT, 'Web', 'assets', 'audio')
    os.makedirs(mdir, exist_ok=True)
    mman_p = os.path.join(ROOT, 'Web', 'assets', 'models', 'models.json'); mman = json.load(open(mman_p, encoding='utf-8'))
    for name, (rel, what, use) in MODELS.items():
        glb = os.path.join(src, rel); data = open(glb, 'rb').read(); open(os.path.join(mdir, name), 'wb').write(data)
        json.dump(glb_to_json(glb), open(os.path.join(mdir, name.replace('.glb', '.gltf.json')), 'w'), separators=(',', ':'))
        mman['models']['weapons/' + name] = {'what': what + ' (исходный файл ' + os.path.basename(rel) + ')', 'author': 'Pitchblende (OpenGameArt)', 'license': 'CC0 1.0', 'url': 'https://opengameart.org/content/cc0-flat-guns-west', 'mirror': 'https://github.com/petroulacl/fps-asset-kit', 'use': use}
        print('model', name, len(data), 'bytes')
    json.dump(mman, open(mman_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sman_p = os.path.join(adir, 'sounds.json'); sman = json.load(open(sman_p, encoding='utf-8'))
    sman['sources']['firearms'] = {'name': 'The Free Firearm Sound Library', 'author': 'Sound Library contributors (OpenGameArt)', 'url': 'https://opengameart.org/content/the-free-firearm-sound-library', 'mirror': 'https://github.com/petroulacl/fps-asset-kit', 'license': 'CC0 1.0'}
    for sid, (files, length, gain, use) in SOUNDS.items():
        outs, durs = [], []
        for i, f in enumerate(files):
            seg = first_shot(decode(os.path.join(src, LIB, f)), length); fn = '%s_%d.ogg' % (sid, i + 1); encode(seg, os.path.join(adir, fn)); outs.append(fn); durs.append(round(len(seg) / SR, 3))
        sman['sounds'][sid] = {'files': outs, 'loop': False, 'gain': gain, 'dur': durs, 'use': use, 'sources': ['firearms'], 'orig': [os.path.basename(f) for f in files]}
        print('sound', sid, outs)
    json.dump(sman, open(sman_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cred = os.path.join(adir, 'CREDITS.txt'); txt = open(cred, encoding='utf-8').read()
    line = '\nThe Free Firearm Sound Library (CC0 1.0) — https://opengameart.org/content/the-free-firearm-sound-library — gunshots: Walther PPQ, AR-15, Carl Gustav M45, Mossberg (first shot cut, normalised, re-encoded).\n'
    if 'Free Firearm Sound Library' not in txt: open(cred, 'a', encoding='utf-8').write(line)

if __name__ == '__main__':
    main()
