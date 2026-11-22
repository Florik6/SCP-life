#!/usr/bin/env python3
"""Pack Quaternius' Universal Animation Library (CC0, glTF) into a compact GLB for the game.

Usage: python3 -I Tools/pack_ual.py SRC.gltf OUT.glb

- keeps the mannequin mesh, its skin and the clips listed in KEEP;
- drops translation tracks of every bone except the hips and all scale tracks (they are constant), so body proportions can
  be changed per character (height, build, neck length of anomalous humanoids) without the clips overwriting them;
- repacks only the accessors still referenced into a single binary chunk.
The source file is read as data only.
"""
import json, struct, sys, os

KEEP = ['A_TPose', 'Idle_Loop', 'Idle_Talking_Loop', 'Idle_Torch_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
        'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Driving_Loop',
        'Interact', 'PickUp_Table', 'Fixing_Kneeling', 'Push_Loop', 'Hit_Chest', 'Hit_Head', 'Death01', 'Pistol_Idle_Loop',
        'Pistol_Aim_Neutral', 'Punch_Enter', 'Spell_Simple_Idle_Loop', 'Jump_Land']

def main():
    src, out = sys.argv[1], sys.argv[2]
    g = json.load(open(src, encoding='utf-8'))
    binp = os.path.join(os.path.dirname(src), g['buffers'][0]['uri'])
    data = open(binp, 'rb').read()
    hips = next(i for i, n in enumerate(g['nodes']) if n['name'] == 'DEF-hips')
    anims = []
    for a in g['animations']:
        if a['name'] not in KEEP:
            continue
        chans, samps = [], []
        for c in a['channels']:
            p = c['target']['path']
            if p == 'scale' or (p == 'translation' and c['target']['node'] != hips):
                continue
            s = a['samplers'][c['sampler']]
            samps.append(dict(s)); chans.append({'sampler': len(samps) - 1, 'target': dict(c['target'])})
        anims.append({'name': a['name'], 'channels': chans, 'samplers': samps})
    g['animations'] = anims
    # collect referenced accessors
    used = []
    def use(i):
        if i not in used: used.append(i)
        return i
    for m in g['meshes']:
        for p in m['primitives']:
            for k in p['attributes']: use(p['attributes'][k])
            if 'indices' in p: use(p['indices'])
    for s in g['skins']:
        if 'inverseBindMatrices' in s: use(s['inverseBindMatrices'])
    for a in anims:
        for s in a['samplers']: use(s['input']); use(s['output'])
    remap = {}; accs = []; views = []; blob = bytearray()
    for old in used:
        A = dict(g['accessors'][old]); bv = g['bufferViews'][A['bufferView']]
        comp = {5126: 4, 5125: 4, 5123: 2, 5121: 1, 5122: 2, 5120: 1}[A['componentType']]
        ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[A['type']]
        stride = bv.get('byteStride', comp * ncomp)
        start = bv.get('byteOffset', 0) + A.get('byteOffset', 0)
        chunk = bytearray()
        for i in range(A['count']):
            chunk += data[start + i * stride:start + i * stride + comp * ncomp]
        while len(blob) % 4: blob.append(0)
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(chunk)}
        if bv.get('target'): v['target'] = bv['target']
        views.append(v); blob += chunk
        A['bufferView'] = len(views) - 1; A.pop('byteOffset', None)
        remap[old] = len(accs); accs.append(A)
    for m in g['meshes']:
        for p in m['primitives']:
            for k in p['attributes']: p['attributes'][k] = remap[p['attributes'][k]]
            if 'indices' in p: p['indices'] = remap[p['indices']]
    for s in g['skins']:
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = remap[s['inverseBindMatrices']]
    for a in anims:
        for s in a['samplers']: s['input'] = remap[s['input']]; s['output'] = remap[s['output']]
    g['accessors'] = accs; g['bufferViews'] = views
    while len(blob) % 4: blob.append(0)
    g['buffers'] = [{'byteLength': len(blob)}]
    g.setdefault('asset', {})['extras'] = {'source': 'Universal Animation Library (Standard) by Quaternius, CC0 1.0', 'packed': 'SCP LIFE Tools/pack_ual.py'}
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    print('wrote', out, total, 'bytes,', len(anims), 'clips')

if __name__ == '__main__':
    main()
