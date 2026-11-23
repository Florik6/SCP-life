/* SCP LIFE — CRISIS: weapons on screen. The first-person weapon (CC0 "Flat Guns" models with a rig: slide, bolt,
   magazine, pump) with sway, recoil, slide/bolt/pump action, magazine change on reload, draw and holster; weapons in
   NPC hands; muzzle flashes, tracers, bullet holes and hit puffs. Procedural taser and baton (no external asset). */
(function (root) {
  'use strict';
  const S = root.SCP, T = root.THREE;
  const URL0 = 'assets/models/weapons/';
  const FILES = { pistol: 'pistol', carbine: 'carbine', smg: 'smg', shotgun: 'shotgun' };
  // view-model placement (camera space); flip: the model's barrel points to +z and is turned around
  const VM = {
    pistol: { p: [0.13, -0.15, -0.38], s: 1.12, flip: false, muzzle: -0.13, kick: 1 },
    carbine: { p: [0.14, -0.17, -0.42], s: 0.95, flip: false, muzzle: -0.36, kick: 0.7 },
    smg: { p: [0.14, -0.16, -0.38], s: 1.05, flip: false, muzzle: -0.2, kick: 0.45 },
    shotgun: { p: [0.14, -0.17, -0.44], s: 1.0, flip: false, muzzle: -0.3, kick: 1.6 },
    taser: { p: [0.16, -0.17, -0.34], s: 1, flip: false, muzzle: -0.1, kick: 0.2 },
    baton: { p: [0.17, -0.22, -0.36], s: 1, flip: false, muzzle: -0.3, kick: 0 }
  };
  const M = { lib: {}, loading: false };

  function load() {
    if (M.loading) return; M.loading = true;
    for (const id in FILES) {
      const ok = g => { const sc = g.scene; sc.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); M.lib[id] = sc; };
      const url = URL0 + FILES[id] + '.glb';
      try { new T.GLTFLoader().load(url, ok, null, () => new T.GLTFLoader().load(url.replace(/\.glb$/, '.gltf.json'), ok, null, () => {})); } catch (e) { /* the weapon falls back to a box */ }
    }
    M.lib.taser = taserModel(); M.lib.baton = batonModel();
  }
  function mat(c, e) { return new T.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: e || 0.2 }); }
  function taserModel() {
    const g = new T.Group(), body = mat(0x1d1f22), acc = mat(0xe8c21a);
    const b = new T.Mesh(new T.BoxGeometry(0.035, 0.05, 0.15), body); b.position.set(0, 0, -0.05); g.add(b);
    const grip = new T.Mesh(new T.BoxGeometry(0.03, 0.09, 0.04), body); grip.position.set(0, -0.06, 0.01); grip.rotation.x = 0.25; g.add(grip);
    const cart = new T.Mesh(new T.BoxGeometry(0.038, 0.045, 0.035), acc); cart.position.set(0, 0, -0.14); g.add(cart); return g;
  }
  function batonModel() {
    const g = new T.Group(), m = mat(0x111214, 0.05);
    const shaft = new T.Mesh(new T.CylinderGeometry(0.016, 0.018, 0.55, 10), m); shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.2; g.add(shaft);
    const grip = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.13, 10), mat(0x2a2b2e, 0.05)); grip.rotation.x = Math.PI / 2; grip.position.z = 0.1; g.add(grip); return g;
  }
  function instance(id) {
    const src = M.lib[id]; if (!src) return null;
    const o = T.SkeletonUtils && src.getObjectByProperty && (() => { let sk = false; src.traverse(x => { if (x.isSkinnedMesh) sk = true; }); return sk; })() ? T.SkeletonUtils.clone(src) : src.clone(true);
    const parts = {}; o.traverse(x => { if (['Slide', 'Bolt', 'Magazine', 'Pump', 'Trigger', 'Charging Handle'].indexOf(x.name) >= 0) parts[x.name] = { o: x, p: x.position.clone() }; });
    return { o, parts };
  }

  // ---------------------------------------------------------------- first person
  class FirstPerson {
    constructor(camera, scene) {
      this.camera = camera; this.scene = scene; this.root = new T.Group(); camera.add(this.root); if (!camera.parent) scene.add(camera); /* camera children render only with the camera in the scene */ this.cur = null; this.inst = {}; this.show = 0;
      this.kick = 0; this.reloadT = 0; this.reloadDur = 0; this.pumpT = 0; this.sway = { x: 0, y: 0 }; this.bob = 0; this.swing = 0;
      this.flash = new T.PointLight(0xffd59a, 0, 6, 2); this.root.add(this.flash);
      const fm = new T.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
      this.fmesh = new T.Mesh(new T.PlaneGeometry(0.16, 0.16), fm); this.root.add(this.fmesh); this.flashT = 0;
    }
    weapon(id) {
      if (this.cur === id && this.inst[id]) return; if (this.cur && this.inst[this.cur]) this.inst[this.cur].o.visible = false; this.cur = id; if (!id) return;
      if (!this.inst[id]) { const it = instance(id); if (!it) return; const v = VM[id]; it.o.scale.setScalar(v.s); if (v.flip) it.o.rotation.y = Math.PI; this.root.add(it.o); this.inst[id] = it; }
      this.inst[id].o.visible = true;
    }
    fired(id) { const v = VM[id] || VM.pistol; this.kick = Math.min(1.6, this.kick + v.kick); if (id === 'baton') this.swing = 1; else { this.flashT = id === 'taser' ? 0.03 : 0.06; this.pumpT = id === 'shotgun' ? 0.95 : 0; } }
    reload(dur) { this.reloadT = dur; this.reloadDur = dur; }
    update(dt, k, moving, lookX, lookY, gait) {
      const id = k && k.drawn ? k.cur : null; if (id && !this.inst[id] && !M.lib[id]) load();
      if (id) this.weapon(id); const it = this.cur && this.inst[this.cur]; if (!it) { this.root.visible = false; return; }
      this.show += ((id ? 1 : 0) - this.show) * Math.min(1, dt * 9); this.root.visible = this.show > 0.02; if (!id && this.show < 0.03) { it.o.visible = false; this.cur = null; return; }
      const v = VM[this.cur]; this.kick = Math.max(0, this.kick - dt * 6); this.swing = Math.max(0, this.swing - dt * 2.8);
      this.sway.x += (S.clamp(-lookX * 0.004, -0.04, 0.04) - this.sway.x) * Math.min(1, dt * 8); this.sway.y += (S.clamp(lookY * 0.004, -0.04, 0.04) - this.sway.y) * Math.min(1, dt * 8);
      const bob = moving ? Math.sin((gait || 0) * Math.PI) * 0.012 : 0, bobX = moving ? Math.cos((gait || 0) * Math.PI) * 0.008 : 0;
      let rx = this.kick * 0.18, rz = 0, dy = 0, dz = this.kick * 0.05;
      if (this.reloadT > 0) { this.reloadT -= dt; const ph = 1 - Math.max(0, this.reloadT) / Math.max(0.1, this.reloadDur), w = Math.sin(ph * Math.PI); rz = 0.55 * w; dy = -0.07 * w; rx -= 0.25 * w; const mg = it.parts.Magazine; if (mg) mg.o.position.y = mg.p.y - (ph > 0.15 && ph < 0.65 ? Math.sin((ph - 0.15) / 0.5 * Math.PI) * 0.18 : 0); }
      if (this.swing > 0) { const s = Math.sin(this.swing * Math.PI); rx += -0.9 * s; rz += 0.4 * s; dz -= 0.15 * s; }
      const slide = it.parts.Slide || it.parts.Bolt; if (slide) slide.o.position.z = slide.p.z + this.kick * 0.03;
      if (this.pumpT > 0) { this.pumpT -= dt; const pm = it.parts.Pump; if (pm) { const ph = 1 - this.pumpT / 0.95; pm.o.position.z = pm.p.z + (ph > 0.3 && ph < 0.85 ? Math.sin((ph - 0.3) / 0.55 * Math.PI) * 0.06 : 0); } }
      const hide = (1 - this.show) * 0.35;
      it.o.position.set(v.p[0] + this.sway.x + bobX, v.p[1] + this.sway.y + bob + dy - hide, v.p[2] + dz);
      it.o.rotation.set(rx, (v.flip ? Math.PI : 0) + this.sway.x * 2, rz);
      // muzzle flash
      this.flashT = Math.max(0, this.flashT - dt); const f = this.flashT > 0 ? 1 : 0;
      this.flash.intensity = f * 2.2; this.flash.position.set(v.p[0], v.p[1] + 0.03, v.p[2] + v.muzzle * v.s);
      this.fmesh.material.opacity = f * 0.9; this.fmesh.position.copy(this.flash.position); this.fmesh.rotation.z = Math.random() * 3;
    }
  }

  // ---------------------------------------------------------------- weapons in NPC hands
  const _v = new T.Vector3(), _q = new T.Quaternion(), _off = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, Math.PI));
  function npcWeapon(scene, view, k) {
    const want = k && k.drawn ? k.cur : null;
    if (view.wpId !== want) { if (view.wpObj) { scene.remove(view.wpObj); view.wpObj = null; } view.wpId = want; if (want && M.lib[want]) { const it = instance(want); if (it) { view.wpObj = it.o; scene.add(it.o); } } else if (want) load(); }
    if (!view.wpObj) return;
    const hand = view.rig && view.rig.hands ? view.rig.hands.R : null; if (!hand || !view.root.visible) { view.wpObj.visible = false; return; }
    hand.getWorldPosition(_v); hand.getWorldQuaternion(_q); view.wpObj.position.copy(_v); view.wpObj.quaternion.copy(_q).multiply(_off); view.wpObj.visible = true;
  }

  // ---------------------------------------------------------------- tracers, holes, hit puffs
  class Effects {
    constructor(scene) { this.scene = scene; this.items = []; this.seen = 0; this.holeMat = new T.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }); this.trMat = new T.LineBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.85 }); this.puffMat = new T.MeshBasicMaterial({ color: 0x6b0a0a, transparent: true, opacity: 0.8, depthWrite: false }); this.sparkMat = new T.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending }); }
    update(dt, fxList, gore, realTime) {
      for (const f of fxList) {
        if (f.t <= this.seen) continue;
        if (f.kind === 'shot' && f.weapon !== 'taser') { const g = new T.BufferGeometry().setFromPoints([new T.Vector3(f.from.x, f.from.y, f.from.z), new T.Vector3(f.to.x, f.to.y, f.to.z)]); const l = new T.Line(g, this.trMat); this.scene.add(l); this.items.push({ o: l, life: 0.07, geo: g }); }
        if (f.hit === 'wall') { const h = new T.Mesh(new T.CircleGeometry(0.03, 8), this.holeMat); h.position.set(f.to.x, f.to.y, f.to.z); h.lookAt(f.from.x, f.from.y, f.from.z); this.scene.add(h); this.items.push({ o: h, life: 40, hole: true });
          const s = new T.Mesh(new T.SphereGeometry(0.05, 6, 4), this.sparkMat); s.position.copy(h.position); this.scene.add(s); this.items.push({ o: s, life: 0.08 }); }
        if (f.hit === 'body' && gore > 0) { const p = new T.Mesh(new T.SphereGeometry(gore === 2 ? 0.16 : 0.09, 8, 6), this.puffMat); p.position.set(f.to.x, f.to.y, f.to.z); this.scene.add(p); this.items.push({ o: p, life: 0.25, grow: true }); }
      }
      if (fxList.length) this.seen = Math.max(this.seen, fxList[fxList.length - 1].t);
      for (const it of this.items) { it.life -= dt; if (it.grow) it.o.scale.multiplyScalar(1 + dt * 3); }
      const holes = this.items.filter(i => i.hole); if (holes.length > 80) holes[0].life = 0;
      this.items = this.items.filter(it => { if (it.life > 0) return true; this.scene.remove(it.o); if (it.geo) it.geo.dispose(); else if (it.o.geometry) it.o.geometry.dispose(); return false; });
    }
  }

  S.ArmsView = { load, FirstPerson, Effects, npcWeapon, VM, M };
})(typeof window !== 'undefined' ? window : globalThis);
