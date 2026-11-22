/* SCP LIFE — 3D rigs of the living anomalies of wing T-2 (SCP-LF-139…146). Every creature has its own rig and its own motion:
   humanoids reuse the staff skeleton but each drives a different set of clips and procedural layers
     139 «Длинношеий»: slow walk, corner idle, neck that stretches up to 1.6 m and bends toward the glass, head turning past 160°;
     140 «Сидящий»: one frozen seated frame, no breathing or blinking, chair and head turned between observations;
     142 «Лицевой подражатель»: featureless face, takes the colours of whoever it copies, mirrors their position with a delay;
     144 «Забывающий двигаться»: frozen frames of his daily routine (walking, cup to the lips, writing, coat, bunk) and tremor;
     146 «Обратный наблюдатель»: oversized lidless eyes, head that snaps up to 180° to the watcher or into the camera lens;
   non-humanoids are procedural articulated rigs
     141 «Ползун»: seven body segments following the head's path, eight two-bone IK legs with planted feet and stepping,
         crawls on the floor, walls and ceiling;
     143 «Существо у стекла»: quadruped with long arms and a hinged jaw; gallop, lurk, rearing up with palms IK-planted on the glass,
         claws dragged down the glass, breath fog on the glass;
     145 «Тихая мать»: soft body with eight verlet-simulated tentacles (secondary motion, fan threat display, probing the glass)
         and four offspring with their own gait.
   Positions and behaviour states come from the simulation (living.js); the rigs only animate them. */
(function (root) {
  'use strict';
  const S = root.SCP, T = root.THREE, D2R = Math.PI / 180;
  const GEO = { sph: new T.SphereGeometry(1, 14, 10), cyl: new T.CylinderGeometry(1, 1, 1, 10), cylT: new T.CylinderGeometry(0.6, 1, 1, 10), box: new T.BoxGeometry(1, 1, 1), cone: new T.ConeGeometry(1, 1, 8), disc: new T.CircleGeometry(1, 20) };
  const MAT = {};
  const mat = (c, r, extra) => MAT[c + '_' + r + JSON.stringify(extra || '')] || (MAT[c + '_' + r + JSON.stringify(extra || '')] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: r == null ? 0.7 : r, metalness: 0 }, extra || {})));
  const mesh = (geo, m, parent, x, y, z, sx, sy, sz) => { const o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.scale.set(sx || 1, sy == null ? sx || 1 : sy, sz == null ? sx || 1 : sz); if (parent) parent.add(o); return o; };
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _q = new T.Quaternion(), _m = new T.Matrix4();
  // place a unit cylinder (axis Y) between two points
  function segment(o, p, q, r) { _a.subVectors(q, p); const len = _a.length() || 1e-4; o.position.copy(p).addScaledVector(_a, 0.5); _q.setFromUnitVectors(_up, _a.multiplyScalar(1 / len)); o.quaternion.copy(_q); o.scale.set(r, len, r); }
  function segMatrix(p, q, r, out) { _a.subVectors(q, p); const len = _a.length() || 1e-4; _b.copy(p).addScaledVector(_a, 0.5); _q.setFromUnitVectors(_up, _a.multiplyScalar(1 / len)); out.compose(_b, _q, _c.set(r, len, r)); return out; }
  // two-bone IK: returns the joint position (knee/elbow) for root p, target t, lengths l1 l2, bend direction hint
  function ik(p, t, l1, l2, hint, out) {
    _a.subVectors(t, p); let d = _a.length(); const maxd = l1 + l2 - 1e-3; if (d > maxd) { _a.multiplyScalar(maxd / d); d = maxd; } if (d < 1e-3) d = 1e-3;
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const dir = _a.clone().normalize(); const side = _b.copy(hint).addScaledVector(dir, -hint.dot(dir)); if (side.lengthSq() < 1e-6) side.set(0, 1, 0); side.normalize();
    return out.copy(p).addScaledVector(dir, x).addScaledVector(side, h);
  }
  function proxy(view, sx, sy, sz, y) { const p = new T.Mesh(new T.BoxGeometry(sx, sy, sz), new T.MeshBasicMaterial({ visible: false })); p.position.y = y; p.userData.interact = { kind: 'anomaly', id: view.a.id }; view.root.add(p); view.proxy = p; }
  function winOf(w, a) { return S.Living.win(w, a); }

  // ------------------------------------------------------------------ base
  class Creature {
    constructor(a, w) { this.a = a; this.w = w; this.root = new T.Group(); this.fixed = new T.Group(); this.t = 0; this.pos = new T.Vector3(a.agent.pos.x, a.agent.pos.y, a.agent.pos.z); this.yaw = a.agent.yaw; this.loop = null; this.gait = 0; }
    follow(dt, k) { const p = this.a.agent.pos; const kk = Math.min(1, dt * (k || 8)); const ox = this.pos.x, oz = this.pos.z; this.pos.x += (p.x - this.pos.x) * kk; this.pos.z += (p.z - this.pos.z) * kk; this.pos.y = p.y; this.yaw += S.deltaAngle(this.yaw, this.a.agent.yaw) * kk; const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz); this.speed = dt > 0 ? moved / dt : 0; return moved; }
    place() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw * D2R; }
  }

  // ------------------------------------------------------------------ humanoid anomalies (shared skeleton, own clips and layers)
  class Humanoid extends Creature {
    constructor(a, w, custom) { super(a, w); this.custom = custom; this.h = null; this.ph = mesh(GEO.box, mat(0x111111, 1), this.root, 0, 0.9, 0, 0.4, 1.8, 0.3); proxy(this, 0.8, 2, 0.8, 1); this.ensure(); }
    ensure() { if (this.h || !S.Humans || !S.Humans.ready) return !!this.h; this.h = S.Humans.create({ id: this.a.id, custom: this.custom }); this.root.add(this.h.root); this.ph.visible = false; this.onHuman && this.onHuman(); return true; }
    roll(bone, deg) { if (!bone) return; const pq = bone.parent.getWorldQuaternion(new T.Quaternion()), mq = this.h.root.getWorldQuaternion(new T.Quaternion()); const ax = new T.Vector3(0, 0, 1).applyQuaternion(mq).applyQuaternion(pq.invert()); bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(ax, deg * D2R)); }
    stepSound(ctx, stride, opt) { const g0 = this.gait; this.gait += (this.speed * (1 / 60)) / stride; if (Math.floor(this.gait) > Math.floor(g0) && ctx.footstep) ctx.footstep({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, Object.assign({ surface: 'concrete', shoe: 'soft', vol: 0.3, occ: ctx.occ }, opt || {})); }
  }

  class Longneck extends Humanoid {
    constructor(a, w) { super(a, w, { key: 'lf139', skin: 0xa8a39a, clothes: { shirt: 0x9a958c, sleeve: 0xa8a39a, pants: 0x4e4b46, shoe: 0x9c978e, belt: 0x4e4b46, collar: 0xa8a39a }, height: 1.31, build: 0.64, limb: 0.6, armLen: 1.22, head: 0.9, noBlink: true }); this.neck = 0; this.cracked = false; }
    update(dt, w, t, ctx) {
      if (!this.ensure()) { this.follow(dt); this.place(); return; }
      const st = this.a.st, moved = this.follow(dt, 6); this.place(); const h = this.h, act = st.act;
      const walking = this.speed > 0.05; if (walking) { this.gait += moved / (0.68 * 1.31); }
      const ph = ((this.gait / 2) % 1) * h.clipDur('Walk_Loop');
      if (walking) h.drive(dt, { Walk_Loop: { w: 1, t: ph } }); else h.drive(dt, { Idle_Loop: { w: 1, ts: act === 'peer' ? 0.15 : 0.35 } });
      if (walking && Math.floor(this.gait) !== Math.floor(this.gait - moved / (0.68 * 1.31))) ctx.footstep && ctx.footstep({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { surface: 'concrete', shoe: 'soft', vol: 0.32, occ: ctx.occ, range: 14 });
      // the neck: stretches (bone length), bends forward toward the glass, the head tilts and turns beyond human limits
      this.neck += ((st.neck || 0) - this.neck) * Math.min(1, dt * 2);
      const b = h.b; b.neck.scale.y = 1 + this.neck * 13; b.neck.scale.x = b.neck.scale.z = 1 / (1 + this.neck * 0.8);
      h.turnBone(b.neck, (st.headTurn || 0) * 0.3, -this.neck * 62 + (act === 'corner' ? -8 : 0));
      h.turnBone(b.head, (st.headTurn || 0) * 0.7, this.neck * 48);
      this.roll(b.head, act === 'corner' ? 26 + Math.sin(t * 0.4) * 4 : act === 'peer' ? 38 * this.neck + Math.sin(t * 0.7) * 3 : 0);
      if (act === 'corner') this.h.model.rotation.z = Math.sin(t * 0.33) * 0.02; else this.h.model.rotation.z = 0;
      const big = Math.abs(st.headTurn || 0) > 110; if (big && !this.cracked && ctx.play) ctx.play('bone_crack', { x: this.pos.x, y: this.pos.y + 2.3, z: this.pos.z }, 0.45, { occ: ctx.occ, range: 12 }); this.cracked = big;
    }
  }

  class Seated extends Humanoid {
    constructor(a, w) {
      super(a, w, { key: 'lf140', skin: 0xd8b49a, hair: 0x6a5a48, clothes: { shirt: 0x5b4733, sleeve: 0x5b4733, pants: 0x4e3d2c, shoe: 0x1c1410, belt: 0x2a1f16, collar: 0xe2dccd }, height: 0.98, build: 0.86, limb: 0.82, age: 50, noBlink: true });
      const c = this.chair = new T.Group(); this.root.add(c); const brown = mat(0x3a2a22, 0.6), metal = mat(0x2a2a2a, 0.4, { metalness: 0.6 });
      mesh(GEO.box, brown, c, 0, 0.47, 0.02, 0.5, 0.07, 0.48); mesh(GEO.box, brown, c, 0, 0.82, -0.23, 0.48, 0.6, 0.07); mesh(GEO.cyl, metal, c, 0, 0.24, 0, 0.03, 0.42, 0.03);
      for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2, leg = mesh(GEO.box, metal, c, Math.sin(an) * 0.17, 0.04, Math.cos(an) * 0.17, 0.05, 0.03, 0.34); leg.rotation.y = an; }
      this.lastChair = a.st.chair;
    }
    onHuman() { this.h.root.position.z = 0.04; }
    update(dt, w, t, ctx) {
      this.pos.set(this.a.agent.pos.x, this.a.agent.pos.y, this.a.agent.pos.z); this.root.position.copy(this.pos); const st = this.a.st;
      this.root.rotation.y = (st.chair == null ? 180 : st.chair) * D2R;
      if (this.lastChair != null && st.chair !== this.lastChair && ctx.play) ctx.play('creak', { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z }, 0.55, { occ: ctx.occ, range: 14 }); this.lastChair = st.chair;
      if (ctx.emitter) ctx.emitter('lf140clock', 'clock_creepy', { x: this.pos.x + 2, y: this.pos.y + 2.2, z: this.pos.z }, 0.35, { occ: ctx.occ, range: 10 });
      if (!this.ensure()) return;
      const h = this.h; h.drive(dt, { Sitting_Idle_Loop: { w: 1, t: 0.25, snap: true } }, 1); // a single frame: no breathing, no idle motion
      h.model.position.y = 0.47 + 0.08 - 0.5 * 0 - (S.Humans.base ? S.Humans.base.sitHips - 0.5 : 0) - 0.03;
      h.turnBone(h.b.head, st.head || 0, 4);
    }
  }

  class Mimic extends Humanoid {
    constructor(a, w) { super(a, w, { key: 'lf142', skin: 0xc4bdb1, clothes: { shirt: 0xb5aea2, sleeve: 0xbdb6aa, pants: 0xaaa397, shoe: 0xa39c90, belt: 0xaaa397, collar: 0xbdb6aa }, coatShell: true, noFace: true, height: 0.99, build: 0.86, limb: 0.8 }); this.copy = undefined; this.cctv = false; }
    blank() { return S.Humans.specOf({ id: 'lf142', custom: this.custom }); }
    update(dt, w, t, ctx) {
      if (!this.ensure()) { this.follow(dt); this.place(); return; }
      const st = this.a.st, moved = this.follow(dt, 10); this.place(); const h = this.h;
      // appearance: the colours of whoever it copies — only for living eyes; the camera sees it blank
      const want = ctx.cctv ? null : st.copy || null;
      if (want !== this.copy || ctx.cctv !== this.cctv) {
        this.copy = want; this.cctv = !!ctx.cctv; let sp = this.blank();
        if (want === 'player') sp = S.Humans.specOf({ id: 'player-copy', role: (S.Professions.get(w.player.prof) || {}).look || 'Scientist', female: w.player.female });
        else if (want) { const n = w.npc(want); if (n) sp = S.Humans.specOf(n); }
        h.setColors(sp);
      }
      const walking = this.speed > 0.08; if (walking) this.gait += moved / 0.68;
      if (walking) h.drive(dt, { Walk_Loop: { w: 1, t: ((this.gait / 2) % 1) * h.clipDur('Walk_Loop') } }); else h.drive(dt, { [st.crouch ? 'Crouch_Idle_Loop' : 'Idle_Loop']: { w: 1, ts: 0.8 } });
      if (walking && Math.floor(this.gait) !== Math.floor(this.gait - moved / 0.68)) ctx.footstep && ctx.footstep({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { surface: 'tile', shoe: 'soft', vol: 0.2, occ: ctx.occ, range: 10 });
      // looks at whoever it copies
      const tp = st.copy ? w.posOf(st.copy) : null; if (tp) { const look = S.deltaAngle(this.yaw, Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z) / D2R); h.turnBone(h.b.neck, S.clamp(look, -70, 70) * 0.4, 0); h.turnBone(h.b.head, S.clamp(look, -70, 70) * 0.6, 0); }
    }
  }

  const POSE144 = { walk: ['Walk_Loop', f => f], drink: ['Idle_Loop', () => 0.4], write: ['Sitting_Idle_Loop', () => 0.3], eat: ['Driving_Loop', f => f * 0.6], coat: ['Interact', f => f], lie: ['Idle_Loop', () => 0.2] };
  class Frozen extends Humanoid {
    constructor(a, w) {
      super(a, w, { key: 'lf144', skin: 0xdcb79c, hair: 0x5a4a38, moustache: true, clothes: { shirt: 0x8a7c54, sleeve: 0x8a7c54, pants: 0x5a4a32, shoe: 0x2a2018, belt: 0x3a2e20, collar: 0xe0d8c0 }, height: 1.0, build: 0.88, limb: 0.84, age: 45 });
      // his furniture: desk, chair, cup, bunk, coat stand (fixed in the cell)
      const r = w.fac.room(a.containRoom), F = this.fixed, wood = mat(0x6b5034, 0.7), metal = mat(0x3a3a3a, 0.5, { metalness: 0.5 }), y = r.floorY;
      this.spots = { desk: new T.Vector3(r.center.x + 1.6, y, r.center.z), chair: new T.Vector3(r.center.x + 1.6, y, r.center.z - 0.75), bunk: new T.Vector3(r.minX + 0.6, y, r.minZ + 1.3), coat: new T.Vector3(r.maxX - 0.7, y, r.maxZ - 1.2) };
      mesh(GEO.box, wood, F, this.spots.desk.x, y + 0.74, this.spots.desk.z, 1.3, 0.05, 0.7); for (const sx of [-0.6, 0.6]) for (const sz of [-0.3, 0.3]) mesh(GEO.box, wood, F, this.spots.desk.x + sx, y + 0.37, this.spots.desk.z + sz, 0.05, 0.74, 0.05);
      this.cup = mesh(GEO.cyl, mat(0xe8e2d0, 0.4), F, this.spots.desk.x - 0.3, y + 0.81, this.spots.desk.z - 0.1, 0.04, 0.09, 0.04); mesh(GEO.box, mat(0xd8d0b8, 0.9), F, this.spots.desk.x + 0.2, y + 0.77, this.spots.desk.z, 0.3, 0.01, 0.22);
      mesh(GEO.box, wood, F, this.spots.chair.x, y + 0.45, this.spots.chair.z, 0.45, 0.05, 0.45); mesh(GEO.box, wood, F, this.spots.chair.x, y + 0.75, this.spots.chair.z - 0.22, 0.45, 0.55, 0.05);
      mesh(GEO.box, metal, F, this.spots.bunk.x + 0.4, y + 0.4, this.spots.bunk.z + 0.6, 0.85, 0.08, 2.0); mesh(GEO.box, mat(0x6a6650, 0.95), F, this.spots.bunk.x + 0.4, y + 0.48, this.spots.bunk.z + 0.6, 0.8, 0.1, 1.9);
      mesh(GEO.cyl, metal, F, this.spots.coat.x, y + 0.9, this.spots.coat.z, 0.025, 1.8, 0.025); this.coatMesh = mesh(GEO.box, mat(0x4a3f2c, 0.9), F, this.spots.coat.x, y + 1.25, this.spots.coat.z + 0.1, 0.45, 0.9, 0.15);
    }
    update(dt, w, t, ctx) {
      const st = this.a.st, task = st.task || 'walk', frame = st.frame || 0;
      if (!this.ensure()) { this.follow(dt); this.place(); return; }
      const h = this.h, [clip, tf] = POSE144[task] || POSE144.walk, b = h.b;
      // position: the sim walks him for "walk"; other tasks happen at their furniture
      if (task === 'walk') { this.follow(dt, 10); this.place(); h.model.rotation.x = 0; h.model.position.set(0, 0, 0); }
      else {
        const sp = task === 'write' || task === 'eat' ? this.spots.chair : task === 'lie' ? this.spots.bunk : task === 'coat' ? this.spots.coat : this.spots.desk.clone().add(new T.Vector3(-0.3, 0, -0.65));
        this.root.position.copy(sp); this.root.rotation.y = task === 'coat' ? 0 : task === 'lie' ? 0 : 0;
        h.model.position.set(0, task === 'write' || task === 'eat' ? 0.47 + 0.05 - (S.Humans.base.sitHips - 0.5) - 0.03 : task === 'lie' ? 0.55 : 0, task === 'lie' ? 0.9 : 0); h.model.rotation.x = task === 'lie' ? -Math.PI / 2 : 0;
      }
      h.drive(dt, { [clip]: { w: 1, t: tf(frame) * h.clipDur(clip), snap: true } }, 1);
      if (task === 'drink') { h.turnBone(b.uaR, 0, -frame * 70); const faR = h.bones['DEF-forearmR']; h.turnBone(faR, 0, -frame * 60); this.cup.visible = frame < 0.15; }
      else this.cup.visible = true;
      this.coatMesh.visible = !(task === 'coat' && frame > 0.6);
      // tremor under a long gaze
      const tr = st.tremor || 0; if (tr > 0.05) for (const k of ['sp3', 'head', 'uaL', 'uaR']) { const bb = b[k]; if (bb) { bb.rotation.x += (Math.random() - 0.5) * tr * 0.05; bb.rotation.z += (Math.random() - 0.5) * tr * 0.04; } }
    }
  }

  class Observer extends Humanoid {
    constructor(a, w) {
      super(a, w, { key: 'lf146', skin: 0xd9d3ca, clothes: { shirt: 0x6b6863, sleeve: 0x6b6863, pants: 0x5d5a55, shoe: 0xd9d3ca, belt: 0x5d5a55, collar: 0x6b6863 }, bigEyes: true, height: 1.04, build: 0.72, limb: 0.68, head: 1.06 });
      const win = winOf(w, a), r = w.fac.room(a.containRoom), y = r.floorY;
      this.shutter = mesh(GEO.box, mat(0xd6dad6, 0.95, { transparent: true, opacity: 0.94 }), this.fixed, win.cx, y + 1.65, win.z + 0.12, win.x1 - win.x0 + 0.1, 1.45, 0.02); this.headPrev = 0;
    }
    update(dt, w, t, ctx) {
      const st = this.a.st; this.shutter.visible = !!st.shutter;
      if (!this.ensure()) { this.follow(dt); this.place(); return; }
      this.follow(dt, 3); this.place(); const h = this.h;
      h.drive(dt, { Idle_Loop: st.act === 'wait' ? { w: 1, t: 1.0 } : { w: 1, ts: 0.12 } });
      // the head snaps to the watcher (up to 180°); the neck takes a quarter, the head the rest
      const hd = st.head || 0, pt = st.pitch || 0; h.turnBone(h.b.neck, hd * 0.25, pt * 0.3); h.turnBone(h.b.head, hd * 0.75, pt * 0.7);
      if (Math.abs(hd) > 150 && Math.abs(this.headPrev) <= 150 && ctx.play) ctx.play('bone_crack', { x: this.pos.x, y: this.pos.y + 1.7, z: this.pos.z }, 0.3, { occ: ctx.occ, range: 10 }); this.headPrev = hd;
    }
  }

  // ------------------------------------------------------------------ SCP-LF-141 «Ползун»
  class Crawler extends Creature {
    constructor(a, w) {
      super(a, w); this.cell = w.fac.room(a.containRoom);
      const skin = mat(0x3a2f2a, 0.32, { metalness: 0.08 }), dark = mat(0x1c1714, 0.45), eye = mat(0x000000, 0.2, { emissive: 0x3a0e06, emissiveIntensity: 0.6 });
      this.seg = []; for (let i = 0; i < 7; i++) { const s = 0.19 - i * 0.016; this.seg.push(mesh(GEO.sph, skin, this.root, 0, 0, 0, s * 1.05, s * 0.72, s * 1.25)); }
      this.mand = [mesh(GEO.cone, dark, this.root, 0, 0, 0, 0.025, 0.14, 0.025), mesh(GEO.cone, dark, this.root, 0, 0, 0, 0.025, 0.14, 0.025)]; this.eyes = [0, 1, 2, 3].map(() => mesh(GEO.sph, eye, this.root, 0, 0, 0, 0.018));
      this.legs = []; for (let i = 0; i < 8; i++) { const L = { seg: 1 + (i >> 1), side: i % 2 ? 1 : -1, foot: null, from: new T.Vector3(), to: new T.Vector3(), tt: 1, up: mesh(GEO.cylT, skin, this.root), lo: mesh(GEO.cylT, dark, this.root), group: ((i >> 1) + (i % 2)) % 2 }; this.legs.push(L); }
      this.path = []; this.head = new T.Vector3(); this.n = new T.Vector3(0, 1, 0); proxy(this, 1.6, 0.6, 1.6, 0.3); this.root.remove(this.proxy); this.fixed.add(this.proxy);
      const r = this.cell; // the vent grille in the corner
      this.vent = mesh(GEO.box, mat(0x2a2d2f, 0.5, { metalness: 0.6 }), this.fixed, r.maxX - 0.06, r.floorY + 0.5, r.minZ + 0.6, 0.04, 0.5, 0.7);
    }
    surfacePoint(st) {
      const r = this.cell, p = this.a.agent.pos, y0 = r.floorY, s = st.surf || 'floor';
      if (s === 'ceiling') { this.n.set(0, -1, 0); return new T.Vector3(p.x, y0 + r.height - 0.12, p.z); }
      if (s === 'wall') {
        const d = [[p.x - r.minX, 1, 0], [r.maxX - p.x, -1, 0], [p.z - r.minZ, 0, 1], [r.maxZ - p.z, 0, -1]].sort((u, v) => u[0] - v[0])[0];
        this.n.set(d[1], 0, d[2]); const x = d[1] ? (d[1] > 0 ? r.minX : r.maxX) + d[1] * 0.12 : p.x, z = d[2] ? (d[2] > 0 ? r.minZ : r.maxZ) + d[2] * 0.12 : p.z;
        return new T.Vector3(x, y0 + Math.max(0.3, st.h || 1.4), z);
      }
      this.n.set(0, 1, 0); return new T.Vector3(p.x, y0 + 0.12 + (st.h > 0.3 ? 0 : 0), p.z);
    }
    update(dt, w, t, ctx) {
      const st = this.a.st, tgt = this.surfacePoint(st), frozen = st.act === 'freeze' || st.act === 'rest';
      const prev = this.head.clone(); if (!this.path.length) { this.head.copy(tgt); for (let i = 0; i < 30; i++) this.path.push(tgt.clone().add(new T.Vector3(0, 0, -i * 0.05))); }
      this.head.lerp(tgt, Math.min(1, dt * (st.act === 'flee' ? 9 : 5)));
      const moved = this.head.distanceTo(prev), speed = dt > 0 ? moved / dt : 0;
      if (moved > 0.002) { this.path.unshift(this.head.clone()); if (this.path.length > 80) this.path.pop(); }
      // body: segments spaced along the travelled path, slight undulation; breathing when still
      const n = this.n, spacing = 0.2; let acc = 0, pi = 0; const pts = [];
      for (let i = 0; i < this.seg.length; i++) {
        const want = i * spacing; while (pi < this.path.length - 1 && acc + this.path[pi].distanceTo(this.path[pi + 1]) < want) { acc += this.path[pi].distanceTo(this.path[pi + 1]); pi++; }
        const p0 = this.path[pi], p1 = this.path[Math.min(pi + 1, this.path.length - 1)], f = p0.distanceTo(p1) > 1e-4 ? (want - acc) / p0.distanceTo(p1) : 0;
        const p = p0.clone().lerp(p1, S.clamp(f, 0, 1)); pts.push(p);
      }
      const fwd = pts[0].clone().sub(pts[1]); if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize(); const side = new T.Vector3().crossVectors(n, fwd).normalize();
      for (let i = 0; i < this.seg.length; i++) {
        const sg = this.seg[i], und = Math.sin(t * 9 - i * 0.9) * 0.035 * Math.min(1, speed), br = frozen ? 1 + Math.sin(t * 1.4 + i * 0.4) * 0.03 : 1;
        sg.position.copy(pts[i]).addScaledVector(side, und); const d = (i ? pts[i - 1] : pts[0].clone().addScaledVector(fwd, 0.1)).clone().sub(pts[i]); if (d.lengthSq() > 1e-6) { _m.lookAt(new T.Vector3(), d, n); sg.quaternion.setFromRotationMatrix(_m); } sg.scale.y = (0.19 - i * 0.016) * 0.72 * br;
      }
      const hq = this.seg[0].quaternion, hp = this.seg[0].position;
      this.mand.forEach((m, i) => { m.position.copy(hp).addScaledVector(fwd, 0.2).addScaledVector(side, (i ? 1 : -1) * 0.06); m.quaternion.setFromUnitVectors(_up, fwd.clone().addScaledVector(side, (i ? -1 : 1) * (0.5 + Math.sin(t * (frozen ? 0.5 : 6)) * 0.25)).normalize()); });
      this.eyes.forEach((e, i) => e.position.copy(hp).addScaledVector(fwd, 0.16).addScaledVector(side, (i % 2 ? 1 : -1) * (0.035 + (i >> 1) * 0.03)).addScaledVector(n, 0.06 + (i >> 1) * 0.015));
      // legs: two-bone IK to planted feet; a foot steps when it falls behind (alternating groups)
      const stepping = this.legs.filter(L => L.tt < 1).map(L => L.group); let walkedSound = false;
      for (const L of this.legs) {
        const base = pts[L.seg], hip = base.clone().addScaledVector(side, L.side * 0.12).addScaledVector(n, 0.02);
        const rest = base.clone().addScaledVector(side, L.side * 0.42).addScaledVector(fwd, (L.seg - 2.5) * 0.08 + (speed > 0.05 ? 0.12 : 0)).addScaledVector(n, -0.1);
        if (!L.foot) { L.foot = rest.clone(); L.to.copy(rest); }
        if (L.tt >= 1 && !frozen && L.foot.distanceTo(rest) > 0.28 && stepping.indexOf(1 - L.group) < 0) { L.from.copy(L.foot); L.to.copy(rest).addScaledVector(fwd, Math.min(0.15, speed * 0.12)); L.tt = 0; }
        if (L.tt < 1) { L.tt = Math.min(1, L.tt + dt / (st.act === 'flee' ? 0.07 : 0.14)); L.foot.lerpVectors(L.from, L.to, L.tt).addScaledVector(n, Math.sin(L.tt * Math.PI) * 0.12); if (L.tt >= 1) walkedSound = true; }
        if (frozen && Math.random() < dt * 0.05) L.foot.addScaledVector(n, 0.01);
        const knee = ik(hip, L.foot, 0.3, 0.36, n.clone().addScaledVector(side, L.side * 0.4), new T.Vector3());
        segment(L.up, hip, knee, 0.028); segment(L.lo, knee, L.foot, 0.018);
      }
      this.proxy.position.copy(pts[2]);
      // sounds: skitter while moving, wet body sounds, quiet when frozen
      this.loop = speed > 0.1 ? { id: 'skitter', vol: Math.min(0.8, 0.2 + speed * 0.3) } : null;
      if (walkedSound && ctx.play && Math.random() < 0.04) ctx.play('flesh', hp, 0.25, { occ: ctx.occ, range: 10 });
      this.pos.copy(pts[2]);
    }
  }

  // ------------------------------------------------------------------ SCP-LF-143 «Существо у стекла»
  class GlassThing extends Creature {
    constructor(a, w) {
      super(a, w); const skin = mat(0x4a4540, 0.55), dark = mat(0x1a1715, 0.4), tooth = mat(0xcfc7b2, 0.3), wet = mat(0x5a1e1a, 0.3), eye = mat(0x050505, 0.1, { emissive: 0x2a2a20, emissiveIntensity: 0.4 });
      const R = this.root; this.torso = mesh(GEO.sph, skin, R, 0, 0.6, 0, 0.2, 0.18, 0.45); this.chest = mesh(GEO.sph, skin, R, 0, 0.7, 0.35, 0.24, 0.2, 0.25);
      this.neck = mesh(GEO.cylT, skin, R); this.head = new T.Group(); R.add(this.head);
      mesh(GEO.sph, skin, this.head, 0, 0.02, 0.08, 0.11, 0.1, 0.17); this.jaw = new T.Group(); this.jaw.position.set(0, -0.03, 0.0); this.head.add(this.jaw);
      mesh(GEO.sph, skin, this.jaw, 0, -0.03, 0.1, 0.09, 0.04, 0.15); mesh(GEO.sph, wet, this.jaw, 0, 0.0, 0.1, 0.075, 0.025, 0.13);
      for (let i = 0; i < 6; i++) { mesh(GEO.cone, tooth, this.head, -0.05 + i * 0.02, -0.04, 0.2 - Math.abs(i - 2.5) * 0.012, 0.006, 0.03, 0.006).rotation.x = Math.PI; mesh(GEO.cone, tooth, this.jaw, -0.05 + i * 0.02, 0.0, 0.2 - Math.abs(i - 2.5) * 0.012, 0.006, 0.025, 0.006); }
      for (const s of [-1, 1]) mesh(GEO.sph, eye, this.head, s * 0.06, 0.05, 0.17, 0.018);
      this.limb = name => ({ a: mesh(GEO.cylT, skin, R), b: mesh(GEO.cylT, skin, R), c: mesh(GEO.box, skin, R), claws: [0, 1, 2].map(() => mesh(GEO.cone, dark, R, 0, 0, 0, 0.008, 0.07, 0.008)), name });
      this.arms = [this.limb('L'), this.limb('R')]; this.legs = [this.limb('hL'), this.limb('hR')];
      const win = winOf(w, a); this.win = win; const r = w.fac.room(a.containRoom);
      this.fog = mesh(GEO.disc, new T.MeshBasicMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0, depthWrite: false }), this.fixed, win.cx, r.floorY + 1.5, win.z - 0.04, 0.22, 0.16, 1); this.fog.rotation.y = Math.PI;
      proxy(this, 1.2, 1.6, 1.4, 0.8); this.prevAct = a.st.act;
    }
    update(dt, w, t, ctx) {
      const st = this.a.st, act = st.act, moved = this.follow(dt, act === 'rush' ? 12 : 7); this.place();
      this.gait += moved / 0.55; const g = this.gait * Math.PI;
      const press = act === 'press' || act === 'scratch', glassLocalZ = this.win.z - this.pos.z - 0.06;
      // body pose: low quadruped, or reared up against the glass
      const k = Math.min(1, dt * 5); this.rear = (this.rear || 0) + ((press ? 1 : 0) - (this.rear || 0)) * k;
      const r = this.rear, lurk = act === 'lurk', low = lurk ? 0.42 : 0.55;
      const pelvis = new T.Vector3(0, low + r * 0.22 + Math.abs(Math.sin(g)) * 0.03 * (1 - r), -0.25 + r * 0.1);
      const chest = new T.Vector3(0, low + 0.08 + r * 0.85 + Math.sin(t * 1.6) * 0.01, 0.25 + r * (Math.max(0.2, glassLocalZ - 0.45) - 0.25));
      this.torso.position.copy(pelvis.clone().lerp(chest, 0.35)); this.torso.lookAt(this.root.localToWorld(chest.clone())); this.torso.scale.set(0.2, 0.18, 0.4);
      this.chest.position.copy(chest);
      const headP = chest.clone().add(new T.Vector3(0, 0.22 + r * 0.12, 0.2 + r * 0.1)); if (lurk) headP.y -= 0.12;
      segment(this.neck, chest.clone().add(new T.Vector3(0, 0.08, 0.05)), headP, 0.06);
      this.head.position.copy(headP); this.head.rotation.set(lurk ? 0.35 : -r * 0.15 + Math.sin(t * 0.8) * 0.05, Math.sin(t * 0.37) * (press ? 0.2 : 0.1), 0);
      this.jaw.rotation.x = press ? 0.25 + Math.sin(t * 1.2) * 0.2 : 0.08 + Math.sin(t * 2.5) * 0.04;
      // arms: walking cycle, or palms planted on the glass (scratch drags one hand down)
      this.arms.forEach((L, i) => {
        const s = i ? 1 : -1, sh = chest.clone().add(new T.Vector3(s * 0.2, 0.02, 0.05));
        let hand;
        if (r > 0.5) { const drag = act === 'scratch' && i === (Math.floor(t / 1.5) % 2) ? (t % 1.5) / 1.5 : 0; hand = new T.Vector3(s * 0.32, 1.55 - drag * 0.55, glassLocalZ); }
        else { const ph = g + (i ? Math.PI : 0); hand = new T.Vector3(s * 0.28, Math.max(0, Math.sin(ph)) * 0.14, 0.55 + Math.cos(ph) * 0.28 * Math.min(1, this.speed)); }
        const el = ik(sh, hand, 0.52, 0.58, new T.Vector3(s * 0.6, -0.3, -1), new T.Vector3());
        segment(L.a, sh, el, 0.045); segment(L.b, el, hand, 0.035); L.c.position.copy(hand); L.c.scale.set(0.11, 0.02, 0.16); L.c.rotation.set(r > 0.5 ? Math.PI / 2 : 0, 0, 0);
        L.claws.forEach((c, j) => { c.position.copy(hand).add(new T.Vector3((j - 1) * 0.04, r > 0.5 ? 0.09 : 0, r > 0.5 ? 0 : 0.09)); c.rotation.set(r > 0.5 ? 0 : Math.PI / 2, 0, 0); });
      });
      this.legs.forEach((L, i) => { const s = i ? 1 : -1, hip = pelvis.clone().add(new T.Vector3(s * 0.15, 0, -0.05)), ph = g + (i ? 0 : Math.PI) + Math.PI / 2; const foot = new T.Vector3(s * 0.2, Math.max(0, Math.sin(ph)) * 0.1 * (1 - r), -0.35 + Math.cos(ph) * 0.22 * Math.min(1, this.speed) + r * 0.25); const kn = ik(hip, foot, 0.42, 0.48, new T.Vector3(0, 0.2, 1), new T.Vector3()); segment(L.a, hip, kn, 0.05); segment(L.b, kn, foot, 0.035); L.c.position.copy(foot); L.c.scale.set(0.07, 0.03, 0.16); L.claws.forEach(c => { c.visible = false; }); });
      // breath fog on the glass
      this.fog.material.opacity = Math.min(0.45, (st.fog || 0) * 0.45) * (0.75 + Math.sin(t * 1.2) * 0.25); this.fog.position.x = this.pos.x; this.fog.scale.setScalar(0.18 + (st.fog || 0) * 0.12); this.fog.scale.y *= 0.7;
      // sounds: soft thumps of the limbs, a hit when it reaches the glass running
      if (moved > 0.001 && Math.floor(this.gait) !== Math.floor(this.gait - moved / 0.55) && ctx.footstep) ctx.footstep({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { surface: 'grit', shoe: 'soft', vol: act === 'rush' ? 0.4 : 0.18, occ: ctx.occ, range: 12, gait: act === 'rush' ? 'run' : 'walk' });
      if (this.prevAct === 'rush' && act === 'press' && ctx.play) ctx.play('glass_hit', { x: this.pos.x, y: this.pos.y + 1.4, z: this.win.z }, 0.8, { occ: 0, range: 18 }); this.prevAct = act;
    }
  }

  // ------------------------------------------------------------------ SCP-LF-145 «Тихая мать»
  class Mother extends Creature {
    constructor(a, w) {
      super(a, w); const skin = mat(0x6d6370, 0.38), under = mat(0x8a7a80, 0.45), R = this.root;
      this.body = mesh(GEO.sph, skin, R, 0, 0.62, 0, 1.0, 0.72, 1.15); this.skirt = mesh(GEO.cylT, under, R, 0, 0.18, 0, 1.05, 0.36, 1.2);
      for (const s of [-1, 1]) mesh(GEO.sph, mat(0x0b0b0e, 0.1, { emissive: 0x101820, emissiveIntensity: 0.5 }), this.body, s * 0.25, 0.25, 0.9, 0.06, 0.05, 0.03);
      this.NT = 8; this.NS = 12; this.SL = 0.15;
      this.tent = new T.InstancedMesh(GEO.cylT, skin, this.NT * (this.NS - 1)); this.tent.instanceMatrix.setUsage(T.DynamicDrawUsage); this.tent.frustumCulled = false; this.fixed.add(this.tent);
      this.chains = []; for (let i = 0; i < this.NT; i++) { const c = []; for (let j = 0; j < this.NS; j++) c.push({ p: new T.Vector3(), o: new T.Vector3() }); this.chains.push(c); }
      this.kids = [0, 1, 2, 3].map(() => { const g = new T.Group(); this.fixed.add(g); const b = mesh(GEO.sph, skin, g, 0, 0.12, 0, 0.16, 0.11, 0.22); mesh(GEO.sph, under, g, 0, 0.14, 0.16, 0.08, 0.07, 0.07); return { g, b, ph: Math.random() * 6 }; });
      this.kidLegs = new T.InstancedMesh(GEO.cyl, under, 4 * 6); this.kidLegs.instanceMatrix.setUsage(T.DynamicDrawUsage); this.kidLegs.frustumCulled = false; this.fixed.add(this.kidLegs);
      this.init = false; this.humT = 2; proxy(this, 2.4, 1.6, 2.6, 0.8); this.win = winOf(w, a);
    }
    update(dt, w, t, ctx) {
      const st = this.a.st, act = st.act; this.follow(dt, 3); this.place();
      const br = 1 + Math.sin(t * 0.9) * 0.025 + (act === 'guard' ? Math.sin(t * 3) * 0.02 : 0); this.body.scale.set(1.0 * br, (act === 'guard' ? 0.82 : 0.72) / br, 1.15 * br); this.body.position.y = act === 'guard' ? 0.7 : 0.62;
      const yaw = this.yaw * D2R, base = this.pos, floor = this.pos.y;
      const toW = (lx, ly, lz) => new T.Vector3(base.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), floor + ly, base.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
      // tentacles: verlet chains pinned at the rim, tips pulled toward behaviour targets, gravity and floor
      const cell = w.fac.room(this.a.containRoom), ceil = floor + cell.height - 0.2;
      for (let i = 0; i < this.NT; i++) {
        const c = this.chains[i], an = i / this.NT * Math.PI * 2 + 0.2, root = toW(Math.sin(an) * 0.85, 0.32, Math.cos(an) * 0.95);
        if (!this.init) for (let j = 0; j < this.NS; j++) { c[j].p.copy(root).add(new T.Vector3(Math.sin(an) * j * this.SL, 0, Math.cos(an) * j * this.SL)); c[j].o.copy(c[j].p); }
        let tgt;
        if (act === 'guard') tgt = toW(Math.sin(an) * 1.5, 1.7 + Math.sin(t * 2 + i) * 0.15, Math.cos(an) * 1.6);
        else if (act === 'search' && Math.cos(an) > 0.2) tgt = new T.Vector3(base.x + Math.sin(an) * 1.2 + Math.sin(t * 0.9 + i) * 0.4, floor + 1.0 + Math.sin(t * 1.3 + i) * 0.4, this.win.z - 0.15);
        else { const kid = st.young && st.young[i % 4]; tgt = act === 'feed' && kid && kid.here ? new T.Vector3(kid.x, floor + 0.2, kid.z) : toW(Math.sin(an) * (1.7 + Math.sin(t * 0.3 + i * 1.7) * 0.4), 0.05, Math.cos(an) * (1.8 + Math.cos(t * 0.27 + i) * 0.4)); }
        for (let j = 1; j < this.NS; j++) { const q = c[j], v = q.p.clone().sub(q.o).multiplyScalar(0.94); q.o.copy(q.p); q.p.add(v); q.p.y -= (act === 'guard' ? 0.4 : 2.2) * dt * dt; }
        const tip = c[this.NS - 1]; tip.p.lerp(tgt, Math.min(1, dt * (act === 'guard' ? 3 : 1.2))); c[this.NS - 2].p.lerp(tgt, Math.min(1, dt * 0.4));
        c[0].p.copy(root);
        for (let it = 0; it < 6; it++) for (let j = 1; j < this.NS; j++) { const p0 = c[j - 1].p, p1 = c[j].p, d = p1.clone().sub(p0), l = d.length() || 1e-4, diff = (l - this.SL) / l; if (j === 1) p1.addScaledVector(d, -diff); else { p0.addScaledVector(d, diff * 0.5); p1.addScaledVector(d, -diff * 0.5); } c[0].p.copy(root); }
        for (let j = 0; j < this.NS; j++) { const p = c[j].p; if (p.y < floor + 0.04) p.y = floor + 0.04; if (p.y > ceil) p.y = ceil; p.x = S.clamp(p.x, cell.minX + 0.15, cell.maxX - 0.15); p.z = S.clamp(p.z, cell.minZ + 0.15, cell.maxZ - 0.15); }
        for (let j = 0; j < this.NS - 1; j++) this.tent.setMatrixAt(i * (this.NS - 1) + j, segMatrix(c[j].p, c[j + 1].p, 0.1 * (1 - j / this.NS) + 0.015, _m));
      }
      this.init = true; this.tent.instanceMatrix.needsUpdate = true;
      // offspring: their own little gait; hidden under the mother when she guards them
      let li = 0;
      this.kids.forEach((k, i) => {
        const y = st.young && st.young[i]; k.g.visible = !!(y && y.here); if (!y) return;
        const nx = y.x, nz = y.z, mv = Math.hypot(nx - k.g.position.x, nz - k.g.position.z); if (mv > 0.001) k.g.rotation.y = Math.atan2(nx - k.g.position.x, nz - k.g.position.z);
        k.g.position.set(nx, floor + (act === 'guard' ? -0.02 : 0), nz); k.ph += mv * 25; k.b.scale.y = 0.11 * (1 + Math.sin(t * 2 + i) * 0.05);
        for (let l = 0; l < 6; l++) { const s = l % 2 ? 1 : -1, row = (l >> 1) - 1, sw = Math.sin(k.ph + l * 1.7) * 0.06; const hip = k.g.localToWorld(new T.Vector3(s * 0.1, 0.1, row * 0.1)), foot = k.g.localToWorld(new T.Vector3(s * 0.22, 0, row * 0.12 + sw)); this.kidLegs.setMatrixAt(li++, segMatrix(hip, foot, 0.012, _m)); }
      });
      this.kidLegs.instanceMatrix.needsUpdate = true;
      // the hum: a low voice repeated with gaps; wet sounds when the tentacles rise
      this.humT -= dt; if (this.humT <= 0 && ctx.play) { this.humT = (act === 'search' ? 3 : 6) + Math.random() * 4; ctx.play('groan_f', { x: base.x, y: floor + 0.8, z: base.z }, act === 'search' ? 0.5 : 0.25, { occ: ctx.occ, range: 18, rate: 0.55 }); }
      if (act === 'guard' && this.prevAct !== 'guard' && ctx.play) ctx.play('flesh', { x: base.x, y: floor + 0.8, z: base.z }, 0.6, { occ: ctx.occ, range: 14 }); this.prevAct = act;
      this.loop = st.young && st.young.some(y => y.m) ? { id: 'skitter', vol: 0.12 } : null;
    }
  }

  const MAP = { longneck: Longneck, seated: Seated, crawler: Crawler, mimic: Mimic, glass: GlassThing, frozen: Frozen, mother: Mother, observer: Observer };
  S.Creatures = { create(a, w) { const C = MAP[a.model]; return C ? new C(a, w) : null; }, MAP };
})(typeof window !== 'undefined' ? window : globalThis);
