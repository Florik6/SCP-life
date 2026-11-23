/* SCP LIFE — skinned, animated staff built on Quaternius' Universal Animation Library mannequin (CC0, Web/assets/models).
   One skeleton and clip set for all people (no retargeting); every person gets their own look, and the whole person is ONE
   skinned mesh (one draw call on a phone):
   - the body, clothing shells (lab coat, tactical vest, apron, belts — copies of the body surface pushed out along the normal, so
     they deform with the skin), hair shells that follow the head, beards, hair styles, headwear, face parts (eyes, irises, lids,
     brows, nose, mouth, ears, glasses) and gear (radio, holster, badge) are merged into one geometry per outfit;
     rigid parts are skinned to their bone with weight 1; eyelids close through a morph target (blinking);
   - colours per person come from a palette per region (skin tone, hair colour incl. grey with age, uniform by job);
   - body type: height, build (spine width), belly, limb thickness, head size, age (stoop);
   - animation: locomotion phase driven by the distance walked (feet do not slide, steps match the footstep sounds), idle variants,
     talking, sitting, typing, repairs, crouch/cower, flinch, defend, injured on the floor, sleeping; crossfades between states;
     head look at a target with neck/head split; breathing and blinking with per-person random phase and rate.
   Falls back to the box figures in render.js until the model is loaded (or if it cannot be loaded). */
(function (root) {
  'use strict';
  const S = root.SCP, T = root.THREE;
  const D2R = Math.PI / 180;
  const H = { ready: false, failed: false, base: null, clips: {}, outfits: {}, waiting: [] };
  // death falls by cause (S.Med.KIND[].pose): preceding hit, fall speed, twist (yaw), roll, height, seizure, crouch first
  const DEATH = {
    fall_back: { hit: 'Hit_Head', rate: 1 }, collapse_fwd: { hit: 'Hit_Chest', rate: 1.45, roll: 9, dy: -0.04 }, kneel_fall: { crouch: true, rate: 0.8, roll: -7 },
    twist_fall: { hit: 'Hit_Chest', rate: 1.05, yaw: 78 }, crumple: { rate: 1.9, dy: -0.05 }, seizure: { rate: 0.7, seize: true }, slump: { crouch: true, rate: 0.55, roll: 15 }, curl: { crouch: true, rate: 0.6, roll: 24, yaw: -30 }
  };
  const URL = (root.SCP_ASSET_BASE || 'assets/') + 'models/ual_mannequin.glb';
  const R = { skin: 0, hair: 1, shirt: 2, sleeve: 3, hand: 4, pants: 5, shoe: 6, belt: 7, collar: 8, coat: 9, vest: 10, apron: 11, hat: 12, gear: 13, badge: 14, sclera: 15, iris: 16, mouth: 17, frame: 18, visor: 19, stripe: 20, lip: 21, beard: 22 };
  const GET = ['getX', 'getY', 'getZ', 'getW'], comp = (a, i, k) => a[GET[k]](i);
  function hashOf(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  H.load = function () {
    if (H.loading || H.ready || H.failed) return; H.loading = true;
    if (!T.GLTFLoader || !T.SkeletonUtils) { H.failed = true; return; }
    // GLB (APK, local server); the same model as glTF JSON with an embedded buffer where .glb is not served
    const ok = g => { try { prepare(g); H.ready = true; } catch (e) { H.failed = true; console.warn('humans: prepare failed', e); } H.loading = false; };
    new T.GLTFLoader().load(URL, ok, null, () => new T.GLTFLoader().load(URL.replace(/\.glb$/, '.gltf.json'), ok, null, e => { H.failed = true; H.loading = false; console.warn('humans: model not loaded', e); }));
  };

  // ------------------------------------------------------------ preparation (once)
  function prepare(g) {
    const sc = g.scene; sc.updateMatrixWorld(true);
    for (const c of g.animations) H.clips[c.name] = c;
    const meshes = []; sc.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const skel = meshes[0].skeleton, bones = skel.bones, bname = bones.map(b => b.name);
    const bi = n => bname.indexOf(n.replace(/\./g, ''));
    skel.pose(); sc.updateMatrixWorld(true);
    const bw = bones.map(b => b.matrixWorld.clone()), bp = bones.map(b => new T.Vector3().setFromMatrixPosition(b.matrixWorld));
    // merge the mannequin primitives into one base (model space; same skeleton)
    let nv = 0, ni = 0; for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), REG = new Uint8Array(nv), I = new Uint32Array(ni);
    let o = 0, oi = 0; const v = new T.Vector3(), nn = new T.Vector3(), nm = new T.Matrix3();
    for (const m of meshes) {
      const gm = m.geometry, pos = gm.attributes.position, nor = gm.attributes.normal, si = gm.attributes.skinIndex, sw = gm.attributes.skinWeight, map = bones.length ? m.skeleton.bones.map(b => bname.indexOf(b.name)) : null;
      const div = sw.normalized ? (sw.array instanceof Uint8Array ? 255 : 65535) : 1; nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        P.set([v.x, v.y, v.z], (o + i) * 3); N.set([nn.x, nn.y, nn.z], (o + i) * 3);
        for (let k = 0; k < 4; k++) { SI[(o + i) * 4 + k] = map[comp(si, i, k)]; SW[(o + i) * 4 + k] = comp(sw, i, k) / div; }
      }
      const idx = gm.index; if (idx) for (let t = 0; t < idx.count; t++) I[oi++] = idx.array[t] + o; else for (let t = 0; t < pos.count; t++) I[oi++] = t + o;
      o += pos.count;
    }
    // region of every vertex: dominant bone + height
    const headI = bi('DEF-head'), neckI = bi('DEF-neck');
    const head = { min: new T.Vector3(1e9, 1e9, 1e9), max: new T.Vector3(-1e9, -1e9, -1e9) };
    for (let i = 0; i < nv; i++) {
      let best = 0, bj = 0; for (let k = 0; k < 4; k++) { const w = SW[i * 4 + k]; if (w > best) { best = w; bj = SI[i * 4 + k]; } }
      const n = bname[bj] || '', y = P[i * 3 + 1]; let r = R.shirt;
      if (bj === headI) { r = R.skin; v.set(P[i * 3], y, P[i * 3 + 2]); head.min.min(v); head.max.max(v); }
      else if (bj === neckI) r = y > bp[neckI].y + 0.04 ? R.skin : R.collar;
      else if (/hand|f_|thumb/.test(n)) r = R.hand;
      else if (/forearm|upper_arm|shoulder/.test(n)) r = R.sleeve;
      else if (/foot|toe/.test(n)) r = R.shoe;
      else if (/thigh|shin/.test(n)) r = R.pants;
      else if (/hips/.test(n)) r = y > 0.97 ? R.belt : R.pants;
      else if (/spine/.test(n)) r = y < 1.0 ? R.belt : R.shirt;
      REG[i] = r;
    }
    const hh = head.max.y - head.min.y, browY = head.min.y + hh * 0.66, faceZ = head.max.z;
    for (let i = 0; i < nv; i++) if (REG[i] === R.skin && SI[i * 4] !== neckI) { const y = P[i * 3 + 1], z = P[i * 3 + 2]; if ((y > browY && z < faceZ - 0.035) || y > head.max.y - hh * 0.12) REG[i] = R.hair; }
    // clip analysis: left foot contact time of the locomotion clips; hips height when seated
    const mixer = new T.AnimationMixer(sc), contact = {};
    const footL = bones[bi('DEF-foot.L')], hips = bones[bi('DEF-hips')];
    for (const cn of ['Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop']) {
      const clip = H.clips[cn]; if (!clip) continue; const a = mixer.clipAction(clip); a.play(); let low = [9, 0];
      for (let i = 0; i < 48; i++) { const t = clip.duration * i / 48; a.time = t; mixer.update(0); sc.updateMatrixWorld(true); const y = new T.Vector3().setFromMatrixPosition(footL.matrixWorld).y; if (y < low[0]) low = [y, t]; }
      contact[cn] = low[1]; a.stop();
    }
    let sitHips = 0.5; { const clip = H.clips.Sitting_Idle_Loop; if (clip) { const a = mixer.clipAction(clip); a.play(); a.time = 0.1; mixer.update(0); sc.updateMatrixWorld(true); sitHips = new T.Vector3().setFromMatrixPosition(hips.matrixWorld).y; a.stop(); } }
    mixer.stopAllAction(); skel.pose(); sc.updateMatrixWorld(true);
    H.base = { scene: sc, P, N, SI, SW, REG, I, nv, bw, bp, bname, bi, head, browY, faceZ, hh, contact, sitHips };
    H.geo = { box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(1, 10, 8), cyl: new T.CylinderGeometry(1, 1, 1, 12), dome: new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), disc: new T.CircleGeometry(1, 10), lid: new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0) };
    H.mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, vertexColors: true, skinning: true, morphTargets: true });
    H.silMat = new T.MeshStandardMaterial({ color: 0x030303, roughness: 1, metalness: 0, skinning: true, morphTargets: true });
    for (const cb of H.waiting) cb(); H.waiting = [];
  }

  // ------------------------------------------------------------ outfit geometry builder
  class Builder {
    constructor() { this.P = []; this.N = []; this.SI = []; this.SW = []; this.R = []; this.I = []; this.lid = []; }
    get n() { return this.P.length / 3; }
    base(regMap) {
      const B = H.base, o = this.n;
      for (let i = 0; i < B.nv; i++) { this.P.push(B.P[i * 3], B.P[i * 3 + 1], B.P[i * 3 + 2]); this.N.push(B.N[i * 3], B.N[i * 3 + 1], B.N[i * 3 + 2]); for (let k = 0; k < 4; k++) { this.SI.push(B.SI[i * 4 + k]); this.SW.push(B.SW[i * 4 + k]); } this.R.push(regMap ? regMap(B.REG[i]) : B.REG[i]); }
      for (let t = 0; t < B.I.length; t++) this.I.push(B.I[t] + o);
    }
    // copy of the body triangles whose vertices pass keep(region, x, y, z), pushed out along the normal by off(...)
    shell(keep, off, region) {
      const B = H.base, ok = new Uint8Array(B.nv), map = new Int32Array(B.nv).fill(-1);
      for (let i = 0; i < B.nv; i++) ok[i] = keep(B.REG[i], B.P[i * 3], B.P[i * 3 + 1], B.P[i * 3 + 2]) ? 1 : 0;
      for (let t = 0; t < B.I.length; t += 3) {
        const a = B.I[t], b = B.I[t + 1], c = B.I[t + 2]; if (!(ok[a] && ok[b] && ok[c])) continue;
        for (const i of [a, b, c]) {
          if (map[i] < 0) {
            map[i] = this.n; const d = off(B.REG[i], B.P[i * 3], B.P[i * 3 + 1], B.P[i * 3 + 2]);
            this.P.push(B.P[i * 3] + B.N[i * 3] * d, B.P[i * 3 + 1] + B.N[i * 3 + 1] * d, B.P[i * 3 + 2] + B.N[i * 3 + 2] * d); this.N.push(B.N[i * 3], B.N[i * 3 + 1], B.N[i * 3 + 2]);
            for (let k = 0; k < 4; k++) { this.SI.push(B.SI[i * 4 + k]); this.SW.push(B.SW[i * 4 + k]); } this.R.push(region);
          }
          this.I.push(map[i]);
        }
      }
    }
    // rigid part (unit geometry transformed in bind-pose model space) skinned to one bone; closed: matrix of a blink morph
    rigid(geo, boneName, region, x, y, z, sx, sy, sz, rx, ry, rz, closed) {
      const B = H.base, bone = B.bi(boneName), m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx, sy, sz));
      const nm = new T.Matrix3().getNormalMatrix(m), pos = geo.attributes.position, nor = geo.attributes.normal, o = this.n, v = new T.Vector3(), w = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); if (closed) { w.copy(v).applyMatrix4(closed); this.lid.push([o + i, w.x, w.y, w.z]); }
        v.applyMatrix4(m); this.P.push(v.x, v.y, v.z); v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.N.push(v.x, v.y, v.z);
        this.SI.push(bone, 0, 0, 0); this.SW.push(1, 0, 0, 0); this.R.push(region);
      }
      if (geo.index) for (let t = 0; t < geo.index.count; t++) this.I.push(geo.index.array[t] + o); else for (let t = 0; t < pos.count; t++) this.I.push(o + t);
    }
    build() {
      const g = new T.BufferGeometry(), P = new Float32Array(this.P);
      g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.N, 3));
      g.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(this.SW, 4));
      g.setIndex(this.n > 65535 ? new T.Uint32BufferAttribute(this.I, 1) : new T.Uint16BufferAttribute(this.I, 1));
      const M = P.slice(); for (const [i, x, y, z] of this.lid) { M[i * 3] = x; M[i * 3 + 1] = y; M[i * 3 + 2] = z; }
      g.morphAttributes.position = [new T.BufferAttribute(M, 3)];
      g.boundingSphere = new T.Sphere(new T.Vector3(0, 0.9, 0), 1.3);
      g.userData.reg = Uint8Array.from(this.R);
      g.userData.far = null;
      return g;
    }
  }

  // far LOD: vertex clustering on a grid; vertices merge only within the same colour region and dominant bone (no stretching)
  function decimate(src, cell) {
    const P = src.attributes.position.array, Nn = src.attributes.normal.array, SI = src.attributes.skinIndex.array, SW = src.attributes.skinWeight.array, reg = src.userData.reg, I = src.index.array, n = P.length / 3;
    const key = new Map(), remap = new Int32Array(n), oP = [], oN = [], oSI = [], oSW = [], oR = [], cnt = [];
    for (let i = 0; i < n; i++) {
      let best = 0, bj = 0; for (let k = 0; k < 4; k++) if (SW[i * 4 + k] > best) { best = SW[i * 4 + k]; bj = SI[i * 4 + k]; }
      const c = (reg[i] === R.sclera || reg[i] === R.iris || reg[i] === R.lip || reg[i] === R.frame) ? cell * 0.25 : cell;
      const kk = Math.floor(P[i * 3] / c) + ',' + Math.floor(P[i * 3 + 1] / c) + ',' + Math.floor(P[i * 3 + 2] / c) + ',' + reg[i] + ',' + bj + ',' + (Nn[i * 3 + 1] > 0.5 ? 1 : Nn[i * 3 + 1] < -0.5 ? -1 : 0);
      let j = key.get(kk);
      if (j === undefined) { j = oR.length; key.set(kk, j); oP.push(0, 0, 0); oN.push(0, 0, 0); for (let k = 0; k < 4; k++) { oSI.push(SI[i * 4 + k]); oSW.push(SW[i * 4 + k]); } oR.push(reg[i]); cnt.push(0); }
      oP[j * 3] += P[i * 3]; oP[j * 3 + 1] += P[i * 3 + 1]; oP[j * 3 + 2] += P[i * 3 + 2]; oN[j * 3] += Nn[i * 3]; oN[j * 3 + 1] += Nn[i * 3 + 1]; oN[j * 3 + 2] += Nn[i * 3 + 2]; cnt[j]++; remap[i] = j;
    }
    for (let j = 0; j < cnt.length; j++) { for (let k = 0; k < 3; k++) oP[j * 3 + k] /= cnt[j]; const l = Math.hypot(oN[j * 3], oN[j * 3 + 1], oN[j * 3 + 2]) || 1; for (let k = 0; k < 3; k++) oN[j * 3 + k] /= l; }
    const oI = []; for (let t = 0; t < I.length; t += 3) { const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]]; if (a !== b && b !== c && a !== c) oI.push(a, b, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(oP, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(oN, 3));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(oSI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(oSW, 4)); g.setIndex(oI);
    g.morphAttributes.position = [g.attributes.position]; g.boundingSphere = new T.Sphere(new T.Vector3(0, 0.9, 0), 1.3); g.userData.reg = Uint8Array.from(oR);
    return g;
  }
  // ------------------------------------------------------------ looks
  const SKIN = [0xf1c8a8, 0xe0ac87, 0xc68b62, 0x9b6a47, 0x6e4a33, 0xf6d5bd];
  const HAIRC = [0x1d1612, 0x3b2a1e, 0x6b4a2f, 0x9a7b4f, 0x2a2420, 0x4a3a2c, 0xc9b28a];
  const GREY = [0x8c8a86, 0xb5b3ae, 0xd3d1cc];
  const UNI = {
    Guard: { shirt: 0x232b36, sleeve: 0x232b36, pants: 0x1b1d22, shoe: 0x0c0c0d, belt: 0x0d0d0f, collar: 0x232b36, vest: 0x15181c, hat: 0x14171a, gear: 0x101010 },
    Scientist: { shirt: 0x8cadd1, sleeve: 0x8cadd1, pants: 0x40424d, shoe: 0x2a221c, belt: 0x1e1e1e, collar: 0xdfe6ee, coat: 0xe9e9e3 },
    Technician: { shirt: 0xd78a22, sleeve: 0xd78a22, pants: 0xcf8420, shoe: 0x2b2116, belt: 0x3a2a18, collar: 0xd78a22, hat: 0xf2cc1a, stripe: 0xe8e8e8, gear: 0x3a2a18 },
    Medic: { shirt: 0x8fc9bd, sleeve: 0x8fc9bd, pants: 0x8fc9bd, shoe: 0xe8e8e8, belt: 0x8fc9bd, collar: 0x8fc9bd, coat: 0xf0f0ec, gear: 0x222222 },
    DClass: { shirt: 0xe8700f, sleeve: 0xe8700f, pants: 0xe06a10, shoe: 0x2a2a2a, belt: 0xe06a10, collar: 0xe8700f, badge: 0x1d1d1d },
    MTF: { shirt: 0x3b4231, sleeve: 0x3b4231, pants: 0x2f3428, shoe: 0x141412, belt: 0x1a1d16, collar: 0x3b4231, vest: 0x22261d, hat: 0x2a2f24, gloves: 0x111111, gear: 0x101010, visor: 0x0a0a0a },
    Admin: { shirt: 0x262c3e, sleeve: 0x262c3e, pants: 0x262c3e, shoe: 0x111111, belt: 0x111111, collar: 0xe8e8e8 },
    Janitor: { shirt: 0x4c6175, sleeve: 0x4c6175, pants: 0x4c6175, shoe: 0x1c1c1c, belt: 0x2d3b47, collar: 0x4c6175, hat: 0x2d3b47 },
    Cook: { shirt: 0xf0f0ea, sleeve: 0xf0f0ea, pants: 0x3a3a3a, shoe: 0x1a1a1a, belt: 0xf0f0ea, collar: 0xf0f0ea, apron: 0xfafaf6, hat: 0xffffff },
    Silhouette: null
  };
  function spec(npc) {
    if (npc.custom) {
      const c = npc.custom, r = rng(hashOf(npc.id || 'x') ^ 0x51ed27);
      return { role: 'Custom', custom: c, U: c.clothes, female: !!c.female, age: c.age || 40, r, skin: c.skin, hair: c.hair || c.skin, style: c.hair ? (c.style || 'short') : 'bald', beard: false, moustache: !!c.moustache, glasses: false, hat: false, iris: c.iris || 0x1a1410,
        key: 'custom|' + (c.key || npc.id) };
    }
    const r = rng(hashOf(npc.id || 'x') ^ 0x9e3779b9), role = UNI.hasOwnProperty(npc.role) ? npc.role : 'Scientist', female = !!npc.female;
    const age = npc.age || (25 + Math.floor(r() * 35));
    const s = { role, female, age, r };
    s.skin = SKIN[Math.floor(r() * SKIN.length)]; const grey = age > 50 && r() < 0.7; s.hair = grey ? GREY[Math.floor(r() * 3)] : HAIRC[Math.floor(r() * HAIRC.length)];
    s.style = female ? ['long', 'bun', 'pony', 'bob'][Math.floor(r() * 4)] : age > 50 && r() < 0.35 ? 'bald' : ['short', 'short', 'crew', 'side'][Math.floor(r() * 4)];
    s.beard = !female && r() < 0.3; s.moustache = !female && !s.beard && r() < 0.2; s.glasses = (role === 'Scientist' || role === 'Admin') && r() < 0.35;
    s.hat = role === 'MTF' || role === 'Cook' || role === 'Janitor' || (role === 'Guard' && r() < 0.7) || (role === 'Technician' && r() < 0.6);
    s.iris = [0x3a2a1a, 0x5a7a9a, 0x4a6a3a, 0x2a1a10][Math.floor(r() * 4)];
    s.key = role === 'Silhouette' ? 'sil' : [role, female ? 'f' : 'm', s.style, s.beard ? 'b' : '', s.moustache ? 'm' : '', s.glasses ? 'g' : '', s.hat ? 'h' : '', age > 50 ? 'o' : ''].join('|');
    return s;
  }
  function outfit(s) {
    if (H.outfits[s.key]) return H.outfits[s.key];
    const B = H.base, G = H.geo, hd = B.head, b = new Builder(), role = s.role, U = s.U || UNI[role], cu = s.custom || {};
    if (!U) { b.base(() => R.skin); return (H.outfits[s.key] = b.build()); }
    const bald = s.style === 'bald' || role === 'MTF';
    if (cu.coatShell) U.coat = U.coat || U.shirt;
    b.base(rg => rg === R.hair && bald ? R.skin : rg);
    const hx = (hd.max.x - hd.min.x) / 2, hz = (hd.max.z - hd.min.z) / 2, cx = (hd.max.x + hd.min.x) / 2, cz = (hd.max.z + hd.min.z) / 2, top = hd.max.y, hy = hd.min.y, hh = B.hh, fz = hd.max.z;
    // clothing shells
    if (U.coat) b.shell((g, x, y) => (g === R.shirt || g === R.belt || g === R.collar || g === R.sleeve || (g === R.pants && y > 0.5)) && !(g === R.sleeve && Math.abs(x) > 0.6),
      (g, x, y) => g === R.pants ? 0.03 + (0.95 - y) * 0.03 : g === R.sleeve ? 0.012 : 0.016, R.coat);
    if (U.vest) b.shell((g, x, y) => (g === R.shirt || g === R.collar) && y > 1.02 && y < 1.47, () => 0.03, R.vest);
    if (U.apron) b.shell((g, x, y, z) => (g === R.shirt || g === R.belt || g === R.pants) && z > 0.0 && y > 0.45 && y < 1.38 && Math.abs(x) < 0.17, () => 0.02, R.apron);
    if (role === 'Technician' || role === 'Guard' || role === 'MTF') b.shell((g, x, y) => g === R.belt && y > 0.92 && y < 1.03, () => 0.014, R.gear);
    if (role === 'Technician') { b.shell((g, x, y) => g === R.pants && Math.abs(y - 0.3) < 0.03, () => 0.004, R.stripe); b.shell((g, x, y) => g === R.shirt && Math.abs(y - 1.18) < 0.025, () => 0.004, R.stripe); }
    // hair
    if (!bald) b.shell((g, x, y, z) => g === R.hair || (g === R.skin && y > B.browY + 0.01 && z < fz - 0.02 && y > hy + hh * 0.45 && z < cz + hz * 0.2), (g, x, y) => (s.female ? 0.014 : 0.008) + (y > top - 0.03 ? 0.006 : 0), R.hair);
    if (!bald) {
      if (s.style === 'long') b.rigid(G.box, 'DEF-head', R.hair, cx, hy + hh * 0.32, hd.min.z + 0.012, hx * 1.95, hh * 0.75, 0.05);
      if (s.style === 'bob') b.shell((g, x, y, z) => (g === R.skin || g === R.hair) && z < cz + hz * 0.15 && y > hy + hh * 0.18 && !(z > cz && y < B.browY), (g, x, y) => 0.016 + Math.max(0, (B.browY - y)) * 0.12, R.hair);
      if (s.style === 'bun') b.rigid(G.sph, 'DEF-head', R.hair, cx, hy + hh * 0.68, hd.min.z - 0.02, 0.045, 0.045, 0.04);
      if (s.style === 'pony') { b.rigid(G.sph, 'DEF-head', R.hair, cx, hy + hh * 0.6, hd.min.z - 0.02, 0.03, 0.03, 0.03); b.rigid(G.sph, 'DEF-head', R.hair, cx, hy + hh * 0.3, hd.min.z - 0.035, 0.022, hh * 0.3, 0.022); }
    }
    if (s.beard) b.shell((g, x, y, z) => g === R.skin && y < hy + hh * 0.36 && z > cz - 0.02 && y > hy + 0.005, () => 0.005, R.beard);
    // headwear
    if (s.hat) {
      if (role === 'Guard') { b.rigid(G.cyl, 'DEF-head', R.hat, cx, top - 0.005, cz, hx * 1.1, 0.05, hz * 1.1); b.rigid(G.box, 'DEF-head', R.hat, cx, top - 0.025, fz + 0.03, hx * 1.7, 0.008, 0.07); }
      if (role === 'Janitor') { b.rigid(G.dome, 'DEF-head', R.hat, cx, top - 0.04, cz, hx * 1.08, 0.06, hz * 1.08); b.rigid(G.box, 'DEF-head', R.hat, cx, top - 0.035, fz + 0.025, hx * 1.5, 0.008, 0.06); }
      if (role === 'Technician') { b.rigid(G.dome, 'DEF-head', R.hat, cx, top - 0.035, cz, hx * 1.2, 0.09, hz * 1.2); b.rigid(G.cyl, 'DEF-head', R.hat, cx, top - 0.035, cz + 0.01, hx * 1.45, 0.01, hz * 1.4); }
      if (role === 'MTF') { b.rigid(G.dome, 'DEF-head', R.hat, cx, top - 0.06, cz, hx * 1.25, 0.12, hz * 1.25); b.rigid(G.box, 'DEF-head', R.visor, cx, hy + hh * 0.62, fz + 0.012, hx * 1.6, 0.035, 0.012); }
      if (role === 'Cook') b.rigid(G.cyl, 'DEF-head', R.hat, cx, top + 0.04, cz, hx * 1.05, 0.12, hz * 1.05);
    }
    // face (anomalous humanoids: no face at all, or oversized lidless eyes)
    const ey = hy + hh * 0.58, ex = hx * 0.36, ez = fz - 0.012, big = cu.bigEyes ? 1.9 : 1;
    if (!cu.noFace) for (const sd of [-1, 1]) {
      b.rigid(G.sph, 'DEF-head', R.sclera, cx + sd * ex * (cu.bigEyes ? 1.15 : 1), ey, ez, 0.0105 * big, 0.0084 * big, 0.0063 * big);
      b.rigid(G.disc, 'DEF-head', R.iris, cx + sd * ex * (cu.bigEyes ? 1.15 : 1), ey, ez + 0.0068 * big, 0.0055 * big * (cu.bigEyes ? 1.3 : 1), 0.0055 * big * (cu.bigEyes ? 1.3 : 1), 1);
      if (cu.bigEyes) continue;
      const closed = new T.Matrix4().compose(new T.Vector3(cx + sd * ex, ey + 0.0092, ez + 0.0062), new T.Quaternion(), new T.Vector3(0.024, 0.019, 0.004));
      b.rigid(G.lid, 'DEF-head', R.skin, cx + sd * ex, ey + 0.0092, ez + 0.0062, 0.024, 0.0028, 0.004, 0, 0, 0, closed);
      b.rigid(G.box, 'DEF-head', R.hair, cx + sd * ex, ey + 0.022, ez + 0.004, 0.028, s.female ? 0.004 : 0.006, 0.006, 0, 0, -sd * 0.08);
      b.rigid(G.sph, 'DEF-head', R.skin, cx + sd * hx, ey - 0.01, cz - 0.005, 0.012, 0.024, 0.016);
    }
    if (!cu.noFace) { b.rigid(G.box, 'DEF-head', R.skin, cx, ey - 0.026, fz + 0.001, 0.013, 0.028, 0.014, -0.25); b.rigid(G.box, 'DEF-head', R.lip, cx, hy + hh * 0.3, fz - 0.004, cu.bigEyes ? 0.02 : 0.034, 0.005, 0.006); }
    if (s.moustache) b.rigid(G.box, 'DEF-head', R.beard, cx, hy + hh * 0.36, fz - 0.002, 0.04, 0.008, 0.01);
    if (s.glasses) { for (const sd of [-1, 1]) b.rigid(G.box, 'DEF-head', R.frame, cx + sd * ex, ey, fz + 0.006, 0.026, 0.018, 0.002); b.rigid(G.box, 'DEF-head', R.frame, cx, ey + 0.004, fz + 0.006, 0.02, 0.003, 0.002); }
    // gear
    if (role === 'Custom') return (H.outfits[s.key] = b.build());
    if (role === 'Guard' || role === 'MTF') { b.rigid(G.box, 'DEF-spine.003', R.gear, 0.09, 1.36, 0.12, 0.04, 0.07, 0.025); b.rigid(G.box, 'DEF-hips', R.gear, -0.2, 0.95, 0.0, 0.05, 0.14, 0.08); }
    if (role !== 'DClass') b.rigid(G.box, 'DEF-spine.003', R.badge, -0.09, 1.33, 0.135, 0.05, 0.065, 0.004);
    if (role === 'DClass') b.rigid(G.box, 'DEF-spine.003', R.badge, 0.08, 1.38, 0.13, 0.09, 0.03, 0.004);
    if (role === 'Medic') b.rigid(G.cyl, 'DEF-neck', R.gear, 0, 1.42, 0.09, 0.006, 0.18, 0.006, Math.PI / 2);
    return (H.outfits[s.key] = b.build());
  }
  function palette(s) {
    const U = s.U || UNI[s.role] || {}, c = [];
    c[R.skin] = s.skin; c[R.hair] = s.hair; c[R.beard] = s.hair; c[R.shirt] = U.shirt; c[R.sleeve] = U.sleeve; c[R.hand] = U.gloves || s.skin; c[R.pants] = U.pants; c[R.shoe] = U.shoe; c[R.belt] = U.belt; c[R.collar] = U.collar;
    c[R.coat] = U.coat || U.shirt; c[R.vest] = U.vest || U.shirt; c[R.apron] = U.apron || U.shirt; c[R.hat] = U.hat || s.hair; c[R.gear] = U.gear || 0x151515; c[R.badge] = U.badge || 0xe4e4e0;
    c[R.sclera] = 0xd8d3ca; c[R.iris] = s.iris; c[R.mouth] = 0x2a1612; c[R.frame] = 0x111111; c[R.visor] = U.visor || 0x0a0a0a; c[R.stripe] = U.stripe || 0xe8e8e8; c[R.lip] = s.female ? 0x9a5a52 : 0x7a4a40;
    return c.map(x => new T.Color(x == null ? 0xff00ff : x));
  }

  // ------------------------------------------------------------ the character
  class SkinnedHuman {
    constructor(npc) {
      const B = H.base, s = spec(npc), r = s.r, role = s.role, sil = role === 'Silhouette';
      this.npc = npc; this.role = role; this.r = r; this.sil = sil; this.look = s;
      this.root = new T.Group(); this.model = T.SkeletonUtils.clone(B.scene); this.root.add(this.model);
      const src = []; this.model.traverse(o => { if (o.isSkinnedMesh) src.push(o); });
      const skeleton = src[0].skeleton, bindMatrix = src[0].bindMatrix.clone(), parent = src[0].parent;
      for (const m of src) m.parent.remove(m);
      this.bones = {}; for (const bn of skeleton.bones) this.bones[bn.name] = bn;
      const bone = n => this.bones[n] || this.bones[n.replace(/\./g, '')];
      this.b = { hips: bone('DEF-hips'), sp1: bone('DEF-spine.001'), sp2: bone('DEF-spine.002'), sp3: bone('DEF-spine.003'), neck: bone('DEF-neck'), head: bone('DEF-head'),
        uaL: bone('DEF-upper_arm.L'), uaR: bone('DEF-upper_arm.R'), shL: bone('DEF-shoulder.L'), shR: bone('DEF-shoulder.R') };
      // one skinned mesh: shared outfit geometry + this person's colours
      const og = outfit(s); if (!og.userData.far) og.userData.far = decimate(og, 0.035);
      const pal = sil ? null : palette(s);
      const inst = src => { const g = new T.BufferGeometry(); for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, src.attributes[k]); g.setIndex(src.index); g.morphAttributes = src.morphAttributes; g.boundingSphere = src.boundingSphere;
        if (pal) { const reg = src.userData.reg, col = new Uint8Array(reg.length * 3); for (let i = 0; i < reg.length; i++) { const c = pal[reg[i]]; col[i * 3] = c.r * 255; col[i * 3 + 1] = c.g * 255; col[i * 3 + 2] = c.b * 255; } g.setAttribute('color', new T.BufferAttribute(col, 3, true)); } return g; };
      this.geoNear = inst(og); this.geoFar = inst(og.userData.far);
      const mesh = this.mesh = new T.SkinnedMesh(this.geoNear, sil ? H.silMat : H.mat); mesh.frustumCulled = true; parent.add(mesh); mesh.bind(skeleton, bindMatrix); mesh.updateMorphTargets(); this.meshes = [mesh];
      // body proportions (bone scales persist: the clips only rotate bones). The source mannequin is athletic: slimmed, then varied.
      const female = s.female, age = s.age;
      const cu = s.custom || {};
      const height = cu.height || (female ? 0.92 : 0.98) * (0.95 + r() * 0.1), build = cu.build || (female ? 0.78 + r() * 0.1 : 0.84 + r() * 0.13), belly = !cu.build && age > 40 && r() < 0.4 ? 1.1 + r() * 0.12 : 1;
      this.root.scale.setScalar(height);
      for (const k of ['sp1', 'sp2']) this.b[k].scale.set(build * (k === 'sp1' && belly > 1 ? 1.05 : 1), 1, (k === 'sp1' ? build * belly : build) * 1.02);
      this.b.sp3.scale.set(build * (female ? 0.93 : 0.98), 1, build * 0.96);
      const inv = new T.Vector3(1 / (this.b.sp1.scale.x * this.b.sp2.scale.x * this.b.sp3.scale.x), 1, 1 / (this.b.sp1.scale.z * this.b.sp2.scale.z * this.b.sp3.scale.z));
      for (const k of ['neck', 'shL', 'shR']) this.b[k].scale.copy(inv);
      const limb = cu.limb || (female ? 0.74 + r() * 0.06 : 0.8 + r() * 0.1);
      for (const k of ['uaL', 'uaR']) this.b[k].scale.set(limb, 1, limb);
      for (const n of ['DEF-thigh.L', 'DEF-thigh.R']) { const bb = bone(n); if (bb) bb.scale.set(female ? 0.86 : 0.9, 1, female ? 0.86 : 0.9); }
      for (const n of ['DEF-hand.L', 'DEF-hand.R']) { const bb = bone(n); if (bb) bb.scale.setScalar(1 / limb * (female ? 0.86 : 0.92)); }
      this.b.head.scale.setScalar(cu.head || 0.96 + r() * 0.08);
      if (cu.armLen) for (const n of ['DEF-upper_arm.L', 'DEF-upper_arm.R', 'DEF-forearm.L', 'DEF-forearm.R']) { const bb = bone(n); if (bb) bb.scale.y = cu.armLen; }
      this.lids = !sil && !cu.noFace && !cu.bigEyes && !cu.noBlink;
      this.og = og;
      this.stoop = !cu.height && age > 55 ? 4 + r() * 5 : 0;
      // animation
      this.mixer = new T.AnimationMixer(this.model); this.acts = {};
      for (const n in H.clips) { const a = this.mixer.clipAction(H.clips[n]); a.enabled = true; a._on = false; this.acts[n] = a; }
      for (const n of ['Sitting_Enter', 'Sitting_Exit', 'Hit_Chest', 'Hit_Head', 'Death01', 'Interact', 'PickUp_Table', 'Punch_Enter', 'Jump_Land']) { const a = this.acts[n]; if (a) { a.setLoop(T.LoopOnce); a.clampWhenFinished = true; } }
      this.w = {}; this.state = 'idle'; this.oneShot = null; this.gait = 0; this.speed = 0; this.lookY = 0; this.lookP = 0;
      this.tsc = 0.9 + r() * 0.2; for (const n in this.acts) if (/Idle|Talking|Sitting_Idle|Driving|Crouch_Idle/.test(n)) { this.acts[n].time = r() * H.clips[n].duration; this.acts[n].timeScale = this.tsc; }
      this.breath = { rate: 0.22 + r() * 0.08, ph: r() * 6.28 }; this.blink = { t: 1 + r() * 4, k: 0 };
      this.formal = role === 'Admin' || (npc.prof && /director|ethic/.test(npc.prof));
      this.upd = 0; this.lod = 0;
      if (!sil) { this.proxy = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 1.8, 6), new T.MeshBasicMaterial({ visible: false })); this.proxy.position.y = 0.9; this.root.add(this.proxy); this.proxy.userData.interact = { kind: 'npc', id: npc.id }; }
      this.mixer.update(0);
    }
    // recolour in place (the mimic takes on the colours of whoever it copies)
    setColors(sp) {
      const pal = palette(sp);
      for (const [g, src] of [[this.geoNear, this.og], [this.geoFar, this.og.userData.far]]) { const reg = src.userData.reg, col = g.attributes.color; if (!col) continue; for (let i = 0; i < reg.length; i++) { const c = pal[reg[i]]; col.array[i * 3] = c.r * 255; col.array[i * 3 + 1] = c.g * 255; col.array[i * 3 + 2] = c.b * 255; } col.needsUpdate = true; }
    }
    // direct control for anomalous humanoids: want = { clip: { w, t (fixed time) | ts (time scale) } }; the rest fades out
    drive(dt, want, k) {
      k = k == null ? Math.min(1, dt * 5) : k;
      for (const n in this.acts) { const o = want[n]; this.setW(n, o ? o.w : 0, o && o.snap ? 1 : k); const a = this.acts[n]; if (!o || !a._on) continue; if (o.t != null) { a.timeScale = 0; a.time = Math.max(0, Math.min(H.clips[n].duration - 0.001, o.t)); } else a.timeScale = o.ts == null ? 1 : o.ts; }
      this.mixer.update(dt);
    }
    clipDur(n) { return H.clips[n] ? H.clips[n].duration : 1; }
    // only clips with weight are active in the mixer (a person blends 1-3 clips, not all 27)
    setW(n, target, k) {
      const a = this.acts[n]; if (!a) return; const cur = this.w[n] || 0; let v = cur + (target - cur) * k; if (v < 0.002) v = 0; this.w[n] = v;
      if (v > 0) { if (!a._on) { a._on = true; a.reset(); a.play(); if (a.timeScale !== 0 && a.loop === T.LoopRepeat) a.time = this.r() * H.clips[n].duration; } a.setEffectiveWeight(v); }
      else if (a._on) { a._on = false; a.stop(); }
    }
    react(kind) {
      const n = { surprise: 'Hit_Chest', flinch: 'Hit_Head', inspect: 'PickUp_Table', door: 'Interact', defend: this.role === 'Guard' || this.role === 'MTF' ? 'Pistol_Aim_Neutral' : 'Punch_Enter', land: 'Jump_Land' }[kind];
      if (!n || !this.acts[n]) return; if (this.oneShot && this.oneShot.name === n && this.oneShot.t < 0.4) return;
      const a = this.acts[n]; a.reset(); a.setEffectiveWeight(0); a.play(); a._on = true; this.oneShot = { name: n, t: 0, dur: H.clips[n].duration * (kind === 'defend' ? 3 : 1) };
    }
    // Death: each cause has its own fall — the hit that precedes it, speed, twist, roll, a seizure — on top of the fall clip.
    die(dt, pose, since, carried) {
      const P = DEATH[pose] || DEATH.fall_back, dur = this.clipDur('Death01'), pre = P.hit ? 0.35 : P.crouch ? 0.7 : 0, want = {};
      if (P.hit && since < pre) want[P.hit] = { w: 1, t: since / pre * this.clipDur(P.hit) * 0.7 };
      if (P.crouch && since < pre + 0.4) want.Crouch_Idle_Loop = { w: since < pre ? 1 : 1 - (since - pre) / 0.4, t: 0.4 };
      const ft = Math.max(0, since - pre) * P.rate; want.Death01 = { w: since < pre ? 0 : 1, t: Math.min(dur - 0.01, ft), snap: since > pre + 1 };
      this.drive(dt, want, since > pre + 1 ? 1 : Math.min(1, dt * 12));
      const k = S.clamp(ft / dur, 0, 1), m = this.model;
      m.rotation.x = 0; m.rotation.y = (P.yaw || 0) * D2R * k; m.rotation.z = (P.roll || 0) * D2R * k; m.position.z = 0;
      m.position.y = (P.dy || 0) * k + (carried ? 0.72 : 0);
      if (P.seize && since > pre && since < pre + 3.4) { const f = 1 - (since - pre) / 3.4, s = Math.sin(since * 36) * 0.22 * f; this.b.sp2.rotation.z += s; this.b.sp3.rotation.x += s * 0.6; if (this.b.head) this.b.head.rotation.y += s * 1.2; }
      if (this.lids) this.mesh.morphTargetInfluences[0] = since > pre + 0.6 ? 0.75 : 0;
    }
    // speed (m/s), posture (sim), lookYaw (deg, relative), t (s); this.gait (steps walked) is set by the caller for synced feet
    animate(dt, speed, posture, lookYaw, t, opt) {
      opt = opt || {};
      const want = this.lod >= 1 ? this.geoFar : this.geoNear; if (this.mesh.geometry !== want) this.mesh.geometry = want;
      this.upd += dt; const every = this.lod >= 2 ? 0.12 : this.lod === 1 ? 0.05 : 0; if (this.upd < every) return; dt = this.upd; this.upd = 0;
      if (posture === 'Dead') { this.die(dt, opt.deathPose, opt.since == null ? 99 : opt.since, opt.carried); return; }
      const k = Math.min(1, dt * 6), B = H.base, moving = speed > 0.15;
      this.speed += (speed - this.speed) * Math.min(1, dt * 6);
      const sp = this.speed;
      // locomotion weights
      let wIdle = 0, wWalk = 0, wJog = 0, wSprint = 0, wCrouchF = 0, st = 'idle';
      if (posture === 'Cowering' && !moving) st = 'cower'; else if (posture === 'Sitting' && !moving) st = opt.typing ? 'type' : opt.talking ? 'sittalk' : 'sit'; else if (posture === 'Lying' && !moving) st = 'lie';
      else if (posture === 'Down' && !moving) st = 'down'; else if (posture === 'Working' && !moving) st = opt.repair ? 'repair' : 'work'; else if (moving) st = opt.crouch ? 'crouchwalk' : 'move';
      else if (opt.talking) st = 'talk'; else if (opt.torch) st = 'torch'; else if (opt.alert && (this.role === 'Guard' || this.role === 'MTF')) st = 'alert';
      this.state = st;
      const walkClip = this.formal ? 'Walk_Formal_Loop' : 'Walk_Loop';
      if (st === 'move') { wWalk = S.clamp(1 - (sp - 1.6) / 0.9, 0, 1); wJog = sp > 1.6 ? S.clamp((sp - 1.6) / 0.9, 0, 1) * S.clamp(1 - (sp - 3.0) / 0.8, 0, 1) : 0; wSprint = sp > 3.0 ? S.clamp((sp - 3.0) / 0.8, 0, 1) : 0; if (sp < 0.5) { wIdle = 1 - sp / 0.5; wWalk *= sp / 0.5; } }
      else if (st === 'crouchwalk') wCrouchF = 1;
      // phase-driven locomotion: clip time follows the steps actually walked (even step = left foot contact)
      const ph = ((this.gait || 0) / 2) % 1;
      for (const [n, w] of [[walkClip, wWalk], ['Jog_Fwd_Loop', wJog], ['Sprint_Loop', wSprint], ['Crouch_Fwd_Loop', wCrouchF]]) {
        const a = this.acts[n]; if (!a) continue; const d = H.clips[n].duration; a.timeScale = 0; a.time = ((B.contact[n] || 0) + ph * d) % d; this.setW(n, w, Math.min(1, dt * 10));
      }
      if (walkClip !== 'Walk_Loop') this.setW('Walk_Loop', 0, 1); else this.setW('Walk_Formal_Loop', 0, 1);
      const idleN = st === 'alert' ? 'Pistol_Idle_Loop' : st === 'torch' ? 'Idle_Torch_Loop' : st === 'talk' ? 'Idle_Talking_Loop' : 'Idle_Loop';
      const targets = { Idle_Loop: 0, Idle_Talking_Loop: 0, Idle_Torch_Loop: 0, Pistol_Idle_Loop: 0, Sitting_Idle_Loop: 0, Sitting_Talking_Loop: 0, Driving_Loop: 0, Crouch_Idle_Loop: 0, Fixing_Kneeling: 0, Interact: 0, Death01: 0 };
      if (st === 'move') targets[idleN] = wIdle; else if (st === 'idle' || st === 'talk' || st === 'torch' || st === 'alert' || st === 'lie') targets[idleN] = 1;
      if (st === 'sit') targets.Sitting_Idle_Loop = 1; if (st === 'sittalk') targets.Sitting_Talking_Loop = 1; if (st === 'type') targets.Driving_Loop = 1;
      if (st === 'cower') targets.Crouch_Idle_Loop = 1; if (st === 'repair') targets.Fixing_Kneeling = 1; if (st === 'down') targets.Death01 = 1;
      if (st === 'work') { targets.Idle_Loop = 0.45; targets.Interact = 0.55; }
      // loop the work clips
      for (const n of ['Fixing_Kneeling', 'Interact']) { const a = this.acts[n]; if (a && targets[n] > 0 && a._on && !a.isRunning()) { a.reset(); a.play(); } }
      
      // one-shot reactions on top
      let os = 0; if (this.oneShot) { this.oneShot.t += dt; const o = this.oneShot, f = o.t < 0.15 ? o.t / 0.15 : o.t > o.dur - 0.25 ? Math.max(0, (o.dur - o.t) / 0.25) : 1; os = f; if (o.t >= o.dur) { this.setW(o.name, 0, 1); this.oneShot = null; os = 0; } else this.acts[o.name].setEffectiveWeight(f); }
      const kk = this.first === false ? Math.min(1, dt * 5) : 1; this.first = false;
      for (const n in targets) if (!(this.oneShot && this.oneShot.name === n)) this.setW(n, targets[n] * (1 - os * 0.85), kk);
      for (const n of [walkClip, 'Jog_Fwd_Loop', 'Sprint_Loop']) if (os && this.w[n]) this.acts[n].setEffectiveWeight(this.w[n] * (1 - os * 0.5));
      // timescale variation for idles (no two people in sync); stress makes idles a bit faster
      const stress = opt.stress || 0; for (const n of ['Idle_Loop', 'Idle_Talking_Loop', 'Pistol_Idle_Loop', 'Crouch_Idle_Loop']) if (this.acts[n]) this.acts[n].timeScale = this.tsc * (1 + stress * 0.35);
      this.mixer.update(dt);
      // whole-body offsets: sitting height, lying on a bed
      const hipsSit = st === 'sit' || st === 'sittalk' || st === 'type';
      const ty = st === 'lie' ? (opt.bedH || 0.62) : hipsSit ? S.clamp((opt.seatH || 0.47) + 0.08 - B.sitHips, -0.3, 0.3) : 0;
      this.model.position.y += (ty - this.model.position.y) * k;
      if (st === 'lie') { this.model.rotation.x += (-Math.PI / 2 - this.model.rotation.x) * k; this.model.position.z += (0.88 - this.model.position.z) * k; }
      else { this.model.rotation.x += (0 - this.model.rotation.x) * k; this.model.position.z += (0 - this.model.position.z) * k; }
      // procedural layers: stoop, breathing, head look, blink
      const D = D2R, b = this.b;
      if (this.stoop) b.sp2.rotation.x += this.stoop * D * 0.5;
      this.breath.ph += dt * Math.PI * 2 * this.breath.rate * (1 + stress * 0.8);
      const br = Math.sin(this.breath.ph); b.sp3.rotation.x += br * 0.012; b.sp3.scale.y = 1 + br * 0.008;
      const allowLook = st !== 'lie' && st !== 'down' && st !== 'repair';
      const wantY = allowLook ? S.clamp(lookYaw || 0, -75, 75) : 0, wantP = allowLook ? (opt.lookPitch || 0) : 0;
      this.lookY += (wantY - this.lookY) * Math.min(1, dt * 4); this.lookP += (wantP - this.lookP) * Math.min(1, dt * 4);
      this.turnBone(b.neck, this.lookY * 0.4, this.lookP * 0.4); this.turnBone(b.head, this.lookY * 0.6, this.lookP * 0.6);
      if (this.lids && this.lod < 2) {
        this.blink.t -= dt; if (this.blink.t <= 0) { this.blink.k = 0.14; this.blink.t = (stress > 0.5 ? 1.2 : 2.5) + this.r() * 4; }
        const c = this.blink.k > 0 ? 1 : st === 'lie' && opt.asleep !== false ? 1 : opt.tired ? 0.35 : 0; this.blink.k = Math.max(0, this.blink.k - dt);
        this.mesh.morphTargetInfluences[0] = c;
      }
    }
    // rotate a bone around the character's up axis (yaw) and side axis (pitch), in degrees
    turnBone(bone, yawDeg, pitchDeg) {
      if (!bone || (!yawDeg && !pitchDeg)) return;
      const pq = bone.parent.getWorldQuaternion(_q1), mq = this.root.getWorldQuaternion(_q2);
      // axes in the parent's local frame
      const up = _v1.set(0, 1, 0).applyQuaternion(mq).applyQuaternion(_q3.copy(pq).invert());
      const side = _v2.set(1, 0, 0).applyQuaternion(mq).applyQuaternion(_q3.copy(pq).invert());
      _q4.setFromAxisAngle(up, yawDeg * D2R); bone.quaternion.premultiply(_q4);
      _q4.setFromAxisAngle(side, -pitchDeg * D2R); bone.quaternion.premultiply(_q4);
    }
    headWorld(v) { return this.b.head.getWorldPosition(v).add(_v3.set(0, 0.2 * this.root.scale.y, 0)); }
  }
  const _q1 = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion(), _q4 = new T.Quaternion(), _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3();
  H.SkinnedHuman = SkinnedHuman;
  H.create = npc => H.ready ? new SkinnedHuman(npc) : null;
  H.specOf = spec; H.UNI = UNI;
  S.Humans = H;
})(typeof window !== 'undefined' ? window : globalThis);
