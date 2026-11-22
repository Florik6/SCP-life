/* SCP LIFE — WebGL presentation (Three.js r128): procedural facility, doors, people, SCP-L-001, cameras. */
(function (root) {
  'use strict';
  const S = root.SCP, T = root.THREE;
  const WALL = 0.15, LOWER = 1.1, STRIPE = 0.1, CHUNK = 13;
  const WINDOWS = [{ a: 'obs', b: 'chamber', min: 11.0, max: 15.7, y0: 1.0, y1: 2.4 }];

  // ------------------------------------------------------------------ procedural textures
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rnd(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function texConcrete(base, varAmt, seed, size) {
    size = size || 256; const c = canvas(size, size), g = c.getContext('2d'), r = rnd(seed);
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) { const x = r() * size, y = r() * size, rad = 8 + r() * 40; const grd = g.createRadialGradient(x, y, 0, x, y, rad); const a = (r() - 0.5) * varAmt; grd.addColorStop(0, a > 0 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (-a) + ')'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
    for (let i = 0; i < size * 6; i++) { g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)'; g.fillRect(r() * size, r() * size, 1, 1); }
    return tex(c);
  }
  function texTiles(tile, grout, n, seed) {
    const s = 256, c = canvas(s, s), g = c.getContext('2d'), r = rnd(seed), cell = s / n;
    g.fillStyle = grout; g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = tile; g.globalAlpha = 0.9 + r() * 0.1; g.fillRect(i * cell + 2, j * cell + 2, cell - 3, cell - 3); }
    g.globalAlpha = 1; for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(r() * s, r() * s, 1, 1); }
    return tex(c);
  }
  function texStripes(a, b) { const s = 64, c = canvas(s, s), g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, s, s); g.fillStyle = b; for (let i = -s; i < s * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 - s, s); g.lineTo(i - s, s); g.fill(); } return tex(c); }
  function texScreen(color, seed) { const s = 128, c = canvas(s, s), g = c.getContext('2d'), r = rnd(seed); g.fillStyle = '#04100a'; g.fillRect(0, 0, s, s); g.fillStyle = color; for (let y = 8; y < s - 8; y += 9) { const w = 10 + r() * (s - 30); for (let x = 8; x < 8 + w; x += 4) if (r() > 0.25) g.fillRect(x, y, 3, 4); } g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < s; y += 3) g.fillRect(0, y, s, 1); return tex(c, false); }
  function tex(c, repeat) { const t = new T.CanvasTexture(c); if (repeat !== false) { t.wrapS = t.wrapT = T.RepeatWrapping; } t.anisotropy = 2; return t; }

  function signTexture(text, bg, fg, w, h) {
    const scale = 200, c = canvas(Math.round(w * scale), Math.round(h * scale)), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 4; g.strokeRect(4, 4, c.width - 8, c.height - 8);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n'); let size = Math.floor(c.height / (lines.length + 0.8));
    g.font = '600 ' + size + 'px "Roboto Condensed","Arial Narrow",Arial,sans-serif';
    let maxW = Math.max.apply(null, lines.map(l => g.measureText(l).width));
    if (maxW > c.width * 0.92) { size = Math.floor(size * c.width * 0.92 / maxW); g.font = '600 ' + size + 'px "Roboto Condensed","Arial Narrow",Arial,sans-serif'; }
    lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.12));
    return tex(c, false);
  }

  // Tally marks + learned time (7-segment) for the chamber walls
  function drawTally(c, count, learnedTime, learnedCount) {
    const g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(232,226,210,0.9)'; g.lineWidth = 2; const gw = 22, gh = 26;
    const cols = Math.max(1, Math.floor((W - (learnedTime ? 120 : 0)) / gw)), groups = Math.min(Math.floor(count / 5), 900);
    g.beginPath();
    for (let k = 0; k <= groups; k++) {
      const cx = (k % cols) * gw + 4, cy = 6 + Math.floor(k / cols) * gh; if (cy + gh > H) break;
      const strokes = k < groups ? 4 : count % 5, j = (k * 7) % 4;
      for (let s = 0; s < strokes; s++) { g.moveTo(cx + s * 4, cy + j); g.lineTo(cx + s * 4 + 1, cy + gh - 6 + j); }
      if (k < groups) { g.moveTo(cx - 2, cy + gh - 10 + j); g.lineTo(cx + 15, cy + 4 + j); }
    }
    g.stroke();
    if (learnedTime) {
      g.strokeStyle = 'rgba(245,240,225,1)'; g.lineWidth = 3; const x0 = W - 112, y0 = H / 2 - 12;
      const SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']; let cur = x0; const cw = 14, ch = 24;
      g.beginPath();
      for (const chr of learnedTime) {
        if (chr === ':') { g.moveTo(cur + 2, y0 + 8); g.lineTo(cur + 3, y0 + 9); g.moveTo(cur + 2, y0 + 16); g.lineTo(cur + 3, y0 + 17); cur += 8; continue; }
        const sg = SEG[+chr] || ''; const t = y0, m = y0 + ch / 2, b = y0 + ch;
        if (sg.includes('a')) { g.moveTo(cur, t); g.lineTo(cur + cw, t); } if (sg.includes('b')) { g.moveTo(cur + cw, t); g.lineTo(cur + cw, m); }
        if (sg.includes('c')) { g.moveTo(cur + cw, m); g.lineTo(cur + cw, b); } if (sg.includes('d')) { g.moveTo(cur, b); g.lineTo(cur + cw, b); }
        if (sg.includes('e')) { g.moveTo(cur, m); g.lineTo(cur, b); } if (sg.includes('f')) { g.moveTo(cur, t); g.lineTo(cur, m); } if (sg.includes('g')) { g.moveTo(cur, m); g.lineTo(cur + cw, m); }
        cur += cw + 6;
      }
      for (let s = 0; s < Math.min(learnedCount, 10); s++) { g.moveTo(x0 + s * 9, y0 + 40); g.lineTo(x0 + s * 9 + 2, y0 + 64); }
      g.stroke();
    }
  }

  // ------------------------------------------------------------------ materials
  function makeMaterials() {
    const phong = (map, color, shin) => new T.MeshPhongMaterial({ map: map || null, color: color || 0xffffff, shininess: shin || 8, specular: 0x151515 });
    const basic = (color, map) => new T.MeshBasicMaterial({ color, map: map || null });
    const flat = c => new T.MeshLambertMaterial({ color: c });
    const m = {
      concrete: phong(texConcrete('#6b6b69', 0.35, 1)), tiles: phong(texTiles('#a3a6a4', '#4e5050', 4, 2)), corridorFloor: phong(texTiles('#5d6260', '#323434', 2, 3)),
      wallUpper: phong(texConcrete('#b3b5ae', 0.12, 4, 128)), wallLower: phong(texConcrete('#515b5b', 0.18, 5, 128)), ceiling: phong(texConcrete('#4b4b4e', 0.25, 6, 128)),
      stripe: phong(null, 0xc08c1f), hazard: phong(texStripes('#e6b814', '#141414')), chamber: phong(texConcrete('#7f7f84', 0.42, 13)),
      metal: phong(null, 0x8c9198, 30), dark: phong(null, 0x37393d, 20), door: phong(null, 0x606a75, 25), fabric: flat(0x3d5373), mattress: flat(0xc7c7bd),
      wood: flat(0x735438), plastic: phong(null, 0xd2d2cd, 20), black: flat(0x080809), white: flat(0xe5e5e1), orange: flat(0xf2730f),
      glass: new T.MeshPhongMaterial({ color: 0x8cb3cc, transparent: true, opacity: 0.22, shininess: 80, depthWrite: false }),
      light: basic(0xfff8e6), lightOff: basic(0x55554f), screenG: basic(0xffffff, texScreen('#4dff80', 14)), screenB: basic(0xffffff, texScreen('#66b3ff', 15)),
      red: basic(0xff2a1f), green: basic(0x33ff66), amber: basic(0xffa020), alarm: basic(0x5a0a0a), alarmOn: basic(0xff2020)
    };
    m.colored = (hex) => m['c' + hex] || (m['c' + hex] = flat(hex));
    return m;
  }

  // ------------------------------------------------------------------ mesh builder (world-space UVs, one mesh per room)
  class MB {
    constructor() { this.parts = new Map(); }
    part(mat) { let p = this.parts.get(mat); if (!p) { p = { pos: [], nor: [], uv: [], idx: [] }; this.parts.set(mat, p); } return p; }
    box(mat, cx, cy, cz, sx, sy, sz, uvs, bottom) {
      if (!mat || sx <= 1e-4 || sy <= 1e-4 || sz <= 1e-4) return;
      uvs = uvs || 2; const p = this.part(mat), hx = sx / 2, hy = sy / 2, hz = sz / 2, inv = 1 / uvs;
      const F = (ox, oy, oz, ux, uy, uz, vx, vy, vz, nx, ny, nz, proj) => {
        const s = p.pos.length / 3, cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [a, b] of cs) {
          const x = cx + ox + ux * a + vx * b, y = cy + oy + uy * a + vy * b, z = cz + oz + uz * a + vz * b;
          p.pos.push(x, y, z); p.nor.push(nx, ny, nz);
          if (proj === 0) p.uv.push(z * inv * (nx > 0 ? -1 : 1), y * inv); else if (proj === 1) p.uv.push(x * inv, z * inv); else p.uv.push(x * inv * (nz < 0 ? -1 : 1), y * inv);
        }
        p.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
      };
      F(hx, 0, 0, 0, 0, -hz, 0, hy, 0, 1, 0, 0, 0); F(-hx, 0, 0, 0, 0, hz, 0, hy, 0, -1, 0, 0, 0);
      F(0, hy, 0, hx, 0, 0, 0, 0, -hz, 0, 1, 0, 1); if (bottom !== false) F(0, -hy, 0, hx, 0, 0, 0, 0, hz, 0, -1, 0, 1);
      F(0, 0, hz, hx, 0, 0, 0, hy, 0, 0, 0, 1, 2); F(0, 0, -hz, -hx, 0, 0, 0, hy, 0, 0, 0, -1, 2);
    }
    build() {
      if (!this.parts.size) return null;
      const pos = [], nor = [], uv = [], idx = [], mats = [], geo = new T.BufferGeometry(); let vo = 0, io = 0, gi = 0;
      for (const [mat, p] of this.parts) {
        for (let i = 0; i < p.pos.length; i++) { pos.push(p.pos[i]); nor.push(p.nor[i]); }
        for (let i = 0; i < p.uv.length; i++) uv.push(p.uv[i]);
        for (let i = 0; i < p.idx.length; i++) idx.push(p.idx[i] + vo);
        geo.addGroup(io, p.idx.length, gi++); mats.push(mat); vo += p.pos.length / 3; io += p.idx.length;
      }
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(vo > 65000 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, mats); mesh.matrixAutoUpdate = false; mesh.updateMatrix(); return mesh;
    }
  }

  // ------------------------------------------------------------------ facility builder
  class FacilityView {
    constructor(world, scene) {
      this.w = world; this.scene = scene; this.m = makeMaterials();
      this.rooms = {}; this.colliders = []; this.interact = []; this.doors = {}; this.beacons = []; this.grid = new Map();
      this.root = new T.Group(); scene.add(this.root);
      for (const r of world.fac.roomList) this.buildRoom(r);
      for (const d of world.fac.doorList) this.buildDoor(d);
      this.buildWindows();
      for (const c of this.colliders) this.indexCollider(c);
    }
    indexCollider(c) { for (let x = Math.floor(c.x0 / 2); x <= Math.floor(c.x1 / 2); x++) for (let z = Math.floor(c.z0 / 2); z <= Math.floor(c.z1 / 2); z++) { const k = x + ',' + z; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(c); } }
    nearColliders(x, z) { const out = new Set(); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.grid.get((Math.floor(x / 2) + i) + ',' + (Math.floor(z / 2) + j)); if (a) for (const c of a) out.add(c); } return out; }
    col(cx, cz, sx, sz, h) { if ((h || 1) < 0.3) return; this.colliders.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 }); }
    mb(x) { const r = this.cur; let key = r.id; if (r.type === 'Corridor') key += '#' + Math.max(0, Math.min(9, Math.floor((x - r.minX) / CHUNK))); let b = this.builders[key]; if (!b) b = this.builders[key] = new MB(); return b; }
    box(mat, cx, cy, cz, sx, sy, sz, collide, uv) { this.mb(cx).box(mat, cx, cy, cz, sx, sy, sz, uv); if (collide) this.col(cx, cz, sx, sz, sy); }

    buildRoom(room) {
      this.cur = room; this.builders = {}; const t = WALL, h = room.height, m = this.m;
      const view = { room, group: new T.Group(), lights: [], fixtures: null, visible: true };
      this.rooms[room.id] = view; this.root.add(view.group); this.view = view;
      const floor = room.type === 'Corridor' ? m.corridorFloor : ['Laboratory', 'MedicalBay', 'Observation', 'Canteen'].indexOf(room.type) >= 0 ? m.tiles : m.concrete;
      const cz = (room.minZ + room.maxZ) / 2, dz = room.depth + 2 * t;
      for (let x = room.minX - t; x < room.maxX + t - 0.01; x += CHUNK) {
        const x1 = Math.min(x + CHUNK, room.maxX + t), cx = (x + x1) / 2;
        this.mb(cx).box(floor, cx, -0.05, cz, x1 - x, 0.1, dz, 2.5); this.mb(cx).box(m.ceiling, cx, h + 0.05, cz, x1 - x, 0.1, dz, 3);
      }
      this.buildWalls(room); this.props(room); this.lighting(room);
      for (const k in this.builders) { const mesh = this.builders[k].build(); if (mesh) view.group.add(mesh); }
    }
    buildWalls(room) {
      for (const side of ['N', 'S', 'E', 'W']) {
        const ops = [];
        for (const did of room.doorIds) {
          const d = this.w.fac.door(did); if (this.doorSide(room, d) !== side) continue;
          const along = d.alongX ? d.pos.z : d.pos.x, w = d.kind === 'Archway' ? d.width : d.width + 0.24, hh = d.kind === 'Archway' ? 2.6 : d.height + 0.12;
          ops.push({ a0: along - w / 2, a1: along + w / 2, y0: 0, y1: hh });
        }
        for (const win of WINDOWS) {
          if (win.a !== room.id && win.b !== room.id) continue;
          const other = this.w.fac.room(win.a === room.id ? win.b : win.a);
          if (this.sideTowards(room, other) === side) ops.push({ a0: win.min, a1: win.max, y0: win.y0, y1: win.y1 });
        }
        this.wallSide(room, side, ops);
      }
    }
    doorSide(r, d) { return d.alongX ? (d.pos.x > (r.minX + r.maxX) / 2 ? 'E' : 'W') : (d.pos.z > (r.minZ + r.maxZ) / 2 ? 'N' : 'S'); }
    sideTowards(r, o) { if (o.minZ >= r.maxZ - 0.01) return 'N'; if (o.maxZ <= r.minZ + 0.01) return 'S'; if (o.minX >= r.maxX - 0.01) return 'E'; return 'W'; }
    wallSide(room, side, ops) {
      const t = WALL, ax = side === 'N' || side === 'S';
      const a0 = ax ? room.minX - t : room.minZ, a1 = ax ? room.maxX + t : room.maxZ;
      const plane = side === 'N' ? room.maxZ + t / 2 : side === 'S' ? room.minZ - t / 2 : side === 'E' ? room.maxX + t / 2 : room.minX - t / 2;
      const cuts = [a0, a1]; for (const o of ops) cuts.push(S.clamp(o.a0, a0, a1), S.clamp(o.a1, a0, a1)); for (let c = a0 + 12; c < a1; c += 12) cuts.push(c);
      cuts.sort((x, y) => x - y);
      const m = this.m, chamber = room.type === 'Containment';
      for (let i = 0; i + 1 < cuts.length; i++) {
        const s0 = cuts[i], s1 = cuts[i + 1]; if (s1 - s0 < 0.01) continue; const mid = (s0 + s1) / 2;
        let solid = [[0, room.height]];
        for (const o of ops) if (mid > o.a0 && mid < o.a1) { const out = []; for (const r of solid) { if (o.y1 <= r[0] || o.y0 >= r[1]) { out.push(r); continue; } if (o.y0 > r[0]) out.push([r[0], o.y0]); if (o.y1 < r[1]) out.push([o.y1, r[1]]); } solid = out; }
        for (const r of solid) {
          if (r[1] - r[0] < 0.01) continue;
          const piece = (y0, y1, mat) => { y0 = Math.max(y0, r[0]); y1 = Math.min(y1, r[1]); if (y1 - y0 < 0.005) return; const cy = (y0 + y1) / 2, cl = (s0 + s1) / 2;
            if (ax) this.mb(cl).box(mat, cl, cy, plane, s1 - s0, y1 - y0, t, 2, false); else this.mb(plane).box(mat, plane, cy, cl, t, y1 - y0, s1 - s0, 2, false); };
          if (chamber) piece(0, room.height, m.chamber);
          else { piece(0, LOWER, m.wallLower); piece(LOWER, LOWER + STRIPE, m.stripe); piece(LOWER + STRIPE, room.height, m.wallUpper); }
          if (r[0] < 1.5) { const cl = (s0 + s1) / 2; if (ax) this.col(cl, plane, s1 - s0, t, 2); else this.col(plane, cl, t, s1 - s0, 2); }
        }
      }
    }

    // --- props
    fwd(yaw) { const r = yaw * Math.PI / 180; return { x: Math.round(Math.sin(r)), z: Math.round(Math.cos(r)) }; }
    sz(f, len, wid, hgt) { return Math.abs(f.x) > 0.5 ? [len, hgt, wid] : [wid, hgt, len]; }
    pois(type) { return this.cur.pois.filter(p => p.type === type); }
    chair(p, mat) {
      const f = this.fwd(p.yaw), m = this.m;
      this.box(m.dark, p.pos.x, 0.22, p.pos.z, 0.06, 0.44, 0.06); this.box(mat, p.pos.x, 0.46, p.pos.z, 0.44, 0.05, 0.44);
      const s = this.sz(f, 0.05, 0.44, 0.45); this.box(mat, p.pos.x - f.x * 0.21, 0.7, p.pos.z - f.z * 0.21, s[0], s[1], s[2]);
    }
    desk(p) {
      const f = this.fwd(p.yaw), m = this.m, cx = p.pos.x + f.x * 0.65, cz = p.pos.z + f.z * 0.65;
      let s = this.sz(f, 0.75, 1.4, 0.04); this.box(m.plastic, cx, 0.75, cz, s[0], s[1], s[2], true);
      s = this.sz(f, 0.6, 1.3, 0.72); this.box(m.dark, cx, 0.37, cz, s[0], s[1], s[2]);
      s = this.sz(f, 0.04, 0.6, 0.36); this.box(m.screenB, cx + f.x * 0.22, 1.05, cz + f.z * 0.22, s[0], s[1], s[2]);
      s = this.sz(f, 0.12, 0.12, 0.1); this.box(m.dark, cx + f.x * 0.2, 0.82, cz + f.z * 0.2, s[0], s[1], s[2]);
      this.chair(p, m.fabric);
    }
    bed(p, frame, sheet, hgt) {
      const f = this.fwd(p.yaw), m = this.m; let s = this.sz(f, 2.0, 0.9, hgt);
      this.box(frame, p.pos.x, hgt / 2, p.pos.z, s[0], s[1], s[2], true);
      s = this.sz(f, 1.95, 0.86, 0.14); this.box(m.mattress, p.pos.x, hgt + 0.07, p.pos.z, s[0], s[1], s[2]);
      s = this.sz(f, 0.35, 0.6, 0.1); this.box(m.white, p.pos.x + f.x * 0.75, hgt + 0.19, p.pos.z + f.z * 0.75, s[0], s[1], s[2]);
      s = this.sz(f, 1.2, 0.88, 0.04); this.box(sheet, p.pos.x - f.x * 0.35, hgt + 0.15, p.pos.z - f.z * 0.35, s[0], s[1], s[2]);
    }
    locker(x, z) { this.box(this.m.door, x, 0.95, z, 0.56, 1.9, 0.5, true); }
    sign(text, side, along, y, w, bg, fg) {
      const r = this.cur, h = 0.32, mat = new T.MeshBasicMaterial({ map: signTexture(text, bg, fg, w, h), transparent: false });
      const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat); const e = 0.02;
      if (side === 'N') { mesh.position.set(along, y, r.maxZ - e); mesh.rotation.y = Math.PI; }
      else if (side === 'S') { mesh.position.set(along, y, r.minZ + e); }
      else if (side === 'E') { mesh.position.set(r.maxX - e, y, along); mesh.rotation.y = -Math.PI / 2; }
      else { mesh.position.set(r.minX + e, y, along); mesh.rotation.y = Math.PI / 2; }
      this.view.group.add(mesh);
    }
    proxy(name, x, y, z, sx, sy, sz, data, parent) {
      const mesh = new T.Mesh(new T.BoxGeometry(sx, sy, sz), new T.MeshBasicMaterial({ visible: false }));
      mesh.position.set(x, y, z); mesh.userData.interact = data; (parent || this.view.group).add(mesh); this.interact.push(mesh); return mesh;
    }
    props(room) {
      const m = this.m, r = room;
      const fn = { Corridor: this.corridor, Dormitory: this.dorm, Canteen: this.canteen, Laboratory: this.lab, Observation: this.observation, Airlock: this.airlock, Containment: this.chamberProps, SecurityPost: this.post, MedicalBay: this.medbay, DClassCommon: this.dblock, DClassCell: this.cell, Engineering: this.eng }[r.type];
      if (fn) fn.call(this, r);
      for (const p of this.pois('PatrolPoint')) {
        const f = this.fwd(p.yaw), x = p.pos.x + f.x * 0.55, z = p.pos.z + f.z * 0.55;
        this.box(m.dark, x, 0.6, z, 0.1, 1.2, 0.1); this.box(m.hazard, x, 1.25, z, 0.22, 0.16, 0.22, false, 0.3);
        this.proxy('cp', x, 1.2, z, 0.5, 0.6, 0.5, { kind: 'checkpoint', id: p.id, label: p.label });
      }
      for (const p of this.pois('Panel')) {
        const f = this.fwd(p.yaw), x = p.pos.x + f.x * 0.55, z = p.pos.z + f.z * 0.55; const s = this.sz(f, 0.18, 0.6, 0.8);
        this.box(m.metal, x, 1.35, z, s[0], s[1], s[2]); this.box(m.green, x - f.x * 0.1, 1.63, z - f.z * 0.1, 0.06, 0.04, 0.06); this.box(m.red, x - f.x * 0.1 + f.z * 0.12, 1.63, z - f.z * 0.1 + f.x * 0.12, 0.06, 0.04, 0.06);
      }
    }
    corridor(r) {
      const m = this.m, h = r.height;
      for (let x = r.minX; x < r.maxX; x += 12) { const x1 = Math.min(x + 12, r.maxX), cx = (x + x1) / 2;
        this.box(m.metal, cx, h - 0.25, r.maxZ - 0.3, x1 - x, 0.16, 0.16); this.box(m.dark, cx, h - 0.25, r.maxZ - 0.55, x1 - x, 0.12, 0.12); this.box(m.hazard, cx, h - 0.42, r.minZ + 0.3, x1 - x, 0.08, 0.08, false, 0.5); }
      for (let x = r.minX + 6; x < r.maxX - 2; x += 13) {
        this.box(m.red, x, 0.55, r.minZ + 0.12, 0.18, 0.5, 0.18);
        const b = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.12), m.alarm); b.position.set(x + 1, h - 0.35, r.maxZ - 0.12); this.view.group.add(b); this.beacons.push(b);
      }
      this.box(m.hazard, 19.5, 0.005, 1.2, 3.0, 0.01, 0.5, false, 0.5);
      const ex = r.maxX - 0.08;
      this.box(m.dark, ex, 1.3, -0.95, 0.12, 2.6, 0.2); this.box(m.dark, ex, 1.3, 0.95, 0.12, 2.6, 0.2); this.box(m.dark, ex, 2.7, 0, 0.12, 0.2, 2.1);
      this.box(m.door, ex - 0.02, 1.25, -0.43, 0.06, 2.5, 0.84); this.box(m.door, ex - 0.02, 1.25, 0.43, 0.06, 2.5, 0.84); this.box(m.hazard, ex - 0.05, 1.25, 0, 0.02, 2.5, 0.04, false, 0.3);
      this.sign('ЛИФТ Б-3 · УРОВНИ 1–8\nОБСЛУЖИВАНИЕ — ДВИЖЕНИЕ ПРИОСТАНОВЛЕНО', 'E', 0, 3.0, 2.2, '#d9a619', '#111');
      this.sign('ЗОНА-19 · УРОВЕНЬ 3 · СЕКТОР Б-3\nСЕКТОР СОДЕРЖАНИЯ', 'W', 0, 2.0, 2.6, '#14171a', '#e8e8e0');
      for (const did of r.doorIds) {
        const d = this.w.fac.door(did), o = this.w.fac.room(d.other(r.id)), north = d.pos.z > 0;
        let text = o.name.toUpperCase(); if (d.kind !== 'Archway' && d.req.min > 0) text += '\nДОПУСК ' + S.describeReq(d.req);
        const red = o.type === 'Airlock', yel = o.type === 'DClassCommon';
        this.sign(text, north ? 'N' : 'S', d.pos.x + d.width / 2 + 0.95, 2.05, 1.5, red ? '#8c1010' : yel ? '#d9a619' : '#14171a', yel ? '#111' : '#e8e8e0');
      }
    }
    dorm(r) {
      const m = this.m; for (const b of this.pois('Bed')) this.bed(b, m.dark, m.fabric, 0.4);
      for (const s of this.pois('Seat')) { const f = this.fwd(s.yaw); this.box(m.fabric, s.pos.x, 0.22, s.pos.z, 0.7, 0.44, 0.7, true); const z = this.sz(f, 0.12, 0.7, 0.5); this.box(m.fabric, s.pos.x - f.x * 0.32, 0.65, s.pos.z - f.z * 0.32, z[0], z[1], z[2]); }
      this.box(m.wood, -20.6, 0.25, 11.75, 0.6, 0.5, 0.5, true);
      for (let x = -25.5; x < -23; x += 0.6) this.locker(x + 0.3, r.minZ + 0.28); for (let x = -18.1; x < -15.6; x += 0.6) this.locker(x + 0.3, r.minZ + 0.28);
      this.sign('ЖИЛОЙ БЛОК ПЕРСОНАЛА · ТИШИНА 23:00–06:30', 'N', -20.6, 2.4, 2.4, '#14171a', '#e8e8e0');
    }
    canteen(r) {
      const m = this.m;
      for (const tx of [-12.6, -5.8]) for (const tz of [5.5, 8.5]) { this.box(m.plastic, tx, 0.75, tz, 2.4, 0.05, 1.0); this.box(m.dark, tx - 0.8, 0.37, tz, 0.12, 0.72, 0.12); this.box(m.dark, tx + 0.8, 0.37, tz, 0.12, 0.72, 0.12); this.col(tx, tz, 2.4, 1.0, 1); this.box(m.dark, tx - 0.6, 0.785, tz - 0.25, 0.4, 0.02, 0.3); this.box(m.white, tx + 0.5, 0.82, tz + 0.2, 0.08, 0.1, 0.08); }
      for (const s of this.pois('Seat')) this.chair(s, m.plastic);
      this.box(m.metal, -9.15, 0.47, 11.85, 8.7, 0.95, 0.8, true); this.box(m.plastic, -9.15, 0.97, 11.85, 8.8, 0.04, 0.85);
      for (let x = -13; x < -5; x += 1.1) this.box(m.metal, x, 1.05, 11.95, 0.5, 0.12, 0.35);
      this.box(m.white, -14.45, 1.0, 10.6, 0.9, 2.0, 0.8, true); this.box(m.screenG, -14.0, 1.4, 10.6, 0.02, 0.3, 0.4);
      this.sign('СТОЛОВАЯ · ЗАВТРАК 06:30–08:00 · ОБЕД 12:00–13:30 · УЖИН 18:30–20:30', 'N', -9.15, 2.5, 3.8, '#14171a', '#e8e8e0');
    }
    lab(r) {
      const m = this.m; for (const d of this.pois('Desk')) this.desk(d);
      this.box(m.metal, 3.35, 0.45, 7.8, 2.4, 0.9, 1.6, true); this.box(m.plastic, 3.35, 0.92, 7.8, 2.5, 0.04, 1.7);
      this.box(m.dark, 2.7, 1.12, 7.6, 0.35, 0.36, 0.35); this.box(m.white, 3.6, 1.05, 8.1, 0.5, 0.22, 0.4); this.box(m.glass, 4.1, 1.1, 7.5, 0.3, 0.3, 0.3);
      this.box(m.dark, 3.35, 0.6, 11.95, 0.9, 1.2, 0.5, true); this.box(m.screenG, 3.35, 1.4, 11.68, 0.7, 0.45, 0.04);
      this.box(m.metal, 8.75, 1.1, 11.7, 1.6, 2.2, 0.9, true);
      for (let x = -2.5; x < 1; x += 1.2) { this.box(m.dark, x + 0.6, 1.0, 12.05, 1.1, 2.0, 0.4, true); for (let s = 0; s < 4; s++) this.box(s % 2 ? m.wood : m.white, x + 0.6, 0.4 + s * 0.45, 11.84, 0.9, 0.25, 0.04); }
      this.sign('ЛАБОРАТОРИЯ ИССЛЕДОВАНИЙ · ПРОЕКТ «СЧЕТОВОД»', 'S', 6.6, 2.5, 2.6, '#14171a', '#e8e8e0');
    }
    observation(r) {
      const m = this.m; this.box(m.dark, 13.35, 0.42, 7.95, 4.7, 0.85, 0.6, true); this.box(m.plastic, 13.35, 0.86, 7.9, 4.8, 0.04, 0.7);
      this.box(m.screenG, 11.4, 1.1, 8.1, 0.6, 0.4, 0.05); this.box(m.screenB, 15.3, 1.1, 8.1, 0.6, 0.4, 0.05);
      for (let i = 0; i < 6; i++) this.box(i % 3 ? m.green : m.red, 12.6 + i * 0.3, 0.9, 7.75, 0.06, 0.03, 0.06);
      for (const c of this.pois('Console')) this.chair(c, m.fabric);
      this.sign('НЕ СТУЧАТЬ ПО СТЕКЛУ · СЕАНС СЧЁТА КАЖДЫЕ 6 Ч\nПРИ ВОЗБУЖДЕНИИ ОБЪЕКТА — ДОКЛАД НА ПОСТ', 'E', 5.3, 2.3, 2.8, '#d9a619', '#111');
    }
    airlock(r) {
      const m = this.m; this.box(m.hazard, 19.5, 0.005, 7.8, 2.6, 0.01, 0.6, false, 0.5); this.box(m.hazard, 19.5, 0.005, 2.8, 2.0, 0.01, 0.4, false, 0.5);
      for (let i = 0; i < 3; i++) this.box(m.metal, 18.2 + i * 1.3, r.height - 0.1, 5.2, 0.3, 0.12, 0.3);
      this.box(m.dark, 17.35, 0.25, 5.3, 0.5, 0.5, 2.4, true);
      this.sign('ВХОД В КАМЕРУ — ТОЛЬКО ДВЕ КАРТЫ L3 «СОДЕРЖАНИЕ»\nПРИ ВОЗБУЖДЕНИИ ОБЪЕКТА ВХОД ЗАПРЕЩЁН', 'W', 5.3, 2.2, 2.6, '#8c1010', '#e8e8e0');
    }
    chamberProps(r) {
      const m = this.m; this.box(m.dark, 16, 0.005, 13.6, 0.7, 0.01, 0.7);
      for (const s of this.pois('Terminal')) { const f = this.fwd(s.yaw), x = s.pos.x + f.x * 0.55, z = s.pos.z + f.z * 0.55; this.box(m.dark, x, 0.55, z, 0.4, 1.1, 0.3, true); this.box(m.screenG, x - f.x * 0.16, 1.0, z - f.z * 0.16, 0.3, 0.2, 0.02); }
    }
    post(r) {
      const m = this.m; this.box(m.dark, -21.65, 0.4, -9.9, 5.8, 0.8, 0.8, true); this.box(m.plastic, -21.65, 0.82, -9.85, 5.9, 0.04, 0.9);
      for (let i = 0; i < 6; i++) { const x = -24 + (i % 3) * 1.4 + (i >= 3 ? 0.7 : 0) + 0.35, y = i < 3 ? 1.3 : 1.85; this.box(m.dark, x, y, -10.25, 0.8, 0.52, 0.08); this.box(i % 2 ? m.screenB : m.screenG, x, y, -10.2, 0.7, 0.42, 0.02); }
      for (const c of this.pois('GuardPost')) this.chair(c, m.fabric);
      for (let z = -9.2; z < -4.5; z += 0.6) this.box(m.door, r.minX + 0.28, 0.95, z + 0.3, 0.5, 1.9, 0.56, true);
      this.box(m.dark, r.minX + 0.18, 1.2, -3.3, 0.3, 1.4, 1.0, true);
      this.sign('КПП · ПОСТ ОХРАНЫ СЕКТОРА Б-3', 'N', -24.2, 2.5, 2.2, '#14171a', '#e8e8e0');
      this.sign('ТЕРМИНАЛ ДЕЖУРНОГО', 'E', -6.0, 2.1, 1.2, '#14171a', '#e8e8e0');
      this.box(m.dark, r.maxX - 0.1, 1.3, -6.0, 0.16, 0.7, 1.0); this.box(m.screenG, r.maxX - 0.19, 1.35, -6.0, 0.02, 0.5, 0.85);
      this.proxy('terminal', r.maxX - 0.3, 1.3, -6.0, 0.5, 0.9, 1.1, { kind: 'terminal' });
    }
    medbay(r) {
      const m = this.m; for (const b of this.pois('MedBed')) this.bed(b, m.metal, m.white, 0.6); for (const d of this.pois('Desk')) this.desk(d);
      this.box(m.white, r.minX + 0.3, 1.0, -6.0, 0.5, 2.0, 1.4, true); this.box(m.red, r.minX + 0.56, 1.5, -6.0, 0.02, 0.4, 0.12); this.box(m.red, r.minX + 0.56, 1.5, -6.0, 0.02, 0.12, 0.4);
      this.sign('МЕДПУНКТ · ПРИЁМ 07:30–19:00', 'N', -11.0, 2.4, 1.8, '#14171a', '#e8e8e0');
    }
    dblock(r) {
      const m = this.m;
      for (const tx of [-4.5, 3.2]) { this.box(m.metal, tx, 0.74, -6.3, 4.0, 0.06, 1.0); this.box(m.dark, tx, 0.36, -6.3, 3.6, 0.72, 0.2); this.col(tx, -6.3, 4.0, 1.0, 1);
        this.box(m.metal, tx, 0.44, -5.45, 4.0, 0.05, 0.35); this.box(m.metal, tx, 0.44, -7.15, 4.0, 0.05, 0.35); this.box(m.dark, tx, 0.21, -5.45, 3.6, 0.42, 0.08); this.box(m.dark, tx, 0.21, -7.15, 3.6, 0.42, 0.08); }
      for (const w of this.pois('Workbench')) { const f = this.fwd(w.yaw), x = w.pos.x + f.x * 0.5, z = w.pos.z + f.z * 0.5;
        if (w.pos.x > 0) { this.box(m.white, x, 0.45, z, 0.65, 0.9, 0.65, true); this.box(m.black, x - f.x * 0.33, 0.5, z, 0.02, 0.38, 0.38); }
        else { const s = this.sz(f, 0.7, 1.4, 0.9); this.box(m.metal, x, 0.45, z, s[0], s[1], s[2], true); this.box(m.orange, x, 0.95, z, 0.4, 0.12, 0.6); } }
      for (let i = 0; i < 4; i++) this.box(m.hazard, -7.15 + 4 * i, 0.005, r.minZ + 0.35, 1.6, 0.01, 0.5, false, 0.5);
      this.sign('РАСПОРЯДОК КЛАССА D: 06:30 ПОДЪЁМ · 07:00 РАЗДАЧА\n07:40 ТРУДОВАЯ СМЕНА · 22:00 ОТБОЙ', 'E', -6.3, 2.2, 3.4, '#d9a619', '#111');
      this.sign('ПЕРЕМЕЩЕНИЕ ВНЕ БЛОКА — ТОЛЬКО ПОД КОНВОЕМ', 'W', -6.3, 2.2, 2.6, '#8c1010', '#e8e8e0');
    }
    cell(r) {
      const m = this.m; for (const b of this.pois('CellBunk')) this.bed(b, m.dark, m.orange, 0.45);
      const cx = (r.minX + r.maxX) / 2; this.box(m.metal, cx + 1.35, 0.22, r.minZ + 0.4, 0.45, 0.45, 0.55, true); this.box(m.metal, cx + 1.45, 0.85, r.minZ + 1.2, 0.35, 0.15, 0.45);
    }
    eng(r) {
      const m = this.m; this.box(m.dark, 13.35, 0.9, -7.4, 4.0, 1.8, 2.4, true); this.box(m.hazard, 13.35, 1.0, -6.19, 4.0, 0.2, 0.02, false, 0.5);
      this.box(m.metal, 12.0, 1.9 + (r.height - 1.9) / 2, -7.4, 0.35, r.height - 1.9, 0.35); this.box(m.screenG, 13.35, 1.5, -6.18, 0.6, 0.3, 0.02);
      this.box(m.green, 14.6, 1.4, -6.18, 0.1, 0.06, 0.02); this.box(m.red, 14.9, 1.4, -6.18, 0.1, 0.06, 0.02);
      for (let x = r.minX; x < r.maxX; x += 5.4) { const x1 = Math.min(x + 5.4, r.maxX); this.box(m.metal, (x + x1) / 2, r.height - 0.3, r.minZ + 0.35, x1 - x, 0.22, 0.22); this.box(m.orange, (x + x1) / 2, r.height - 0.6, r.minZ + 0.35, x1 - x, 0.12, 0.12); }
      this.box(m.dark, 18.4, 0.43, -5.5, 0.7, 0.86, 1.8, true); this.box(m.wood, 18.4, 0.88, -5.5, 0.75, 0.04, 1.9);
      this.box(m.orange, 18.1, 0.45, -9.6, 0.6, 0.9, 0.6, true); this.box(m.dark, 17.3, 0.45, -9.6, 0.6, 0.9, 0.6, true);
      this.sign('ИНЖЕНЕРНЫЙ БЛОК · ВЫСОКОЕ НАПРЯЖЕНИЕ', 'N', 10.5, 2.5, 2.2, '#d9a619', '#111');
    }
    lighting(r) {
      const m = this.m, h = r.height, fb = new MB();
      const nx = Math.max(1, Math.round(r.width / (r.type === 'Corridor' ? 4 : 3.5))), nz = r.type === 'Corridor' ? 1 : Math.max(1, Math.round(r.depth / 3.5));
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) { const x = r.minX + (ix + 0.5) * r.width / nx, z = r.minZ + (iz + 0.5) * r.depth / nz; fb.box(m.light, x, h - 0.03, z, 1.1, 0.05, 0.28, 1); }
      const fx = fb.build(); fx.material = m.light; this.view.fixtures = fx; this.view.group.add(fx);
      const count = r.type === 'Corridor' ? 7 : r.type === 'DClassCommon' ? 3 : ['DClassCell', 'Airlock', 'Observation'].indexOf(r.type) >= 0 ? 1 : 2;
      let color = 0xfff2db, inten = 1.15; if (r.type === 'Containment') color = 0xcce6ff; if (r.type === 'DClassCommon' || r.type === 'DClassCell') color = 0xe6ffe0; if (r.type === 'Engineering') color = 0xffe0b3;
      const alongX = r.width >= r.depth;
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count;
        this.view.lights.push({ x: alongX ? r.minX + f * r.width : (r.minX + r.maxX) / 2, y: h - 0.4, z: alongX ? (r.minZ + r.maxZ) / 2 : r.minZ + f * r.depth, color, intensity: inten, range: S.clamp(Math.max(r.width / count, r.depth) * 1.1, 6, 11) });
      }
    }

    // --- doors
    buildDoor(d) {
      const m = this.m, g = new T.Group(); g.position.set(d.pos.x, 0, d.pos.z); g.rotation.y = d.alongX ? Math.PI / 2 : 0; this.root.add(g);
      const w = d.width, h = d.kind === 'Archway' ? 2.6 : d.height, depth = WALL * 2 + 0.06, jamb = 0.12, fm = d.kind === 'Heavy' ? m.hazard : m.dark;
      const add = (mat, x, y, z, sx, sy, sz, parent) => { const b = new T.Mesh(new T.BoxGeometry(sx, sy, sz), mat); b.position.set(x, y, z); (parent || g).add(b); return b; };
      add(fm, -(w / 2 + jamb / 2), h / 2, 0, jamb, h + 0.12, depth); add(fm, w / 2 + jamb / 2, h / 2, 0, jamb, h + 0.12, depth); add(fm, 0, h + 0.06, 0, w + jamb * 2, 0.12, depth);
      const view = { door: d, group: g, leaves: [], leds: [], last: d.state };
      this.doors[d.id] = view;
      if (d.kind === 'Archway') return;
      const lm = d.kind === 'Heavy' ? m.dark : d.kind === 'Cell' ? m.metal : m.door, th = d.kind === 'Heavy' ? 0.22 : 0.08;
      if (d.kind === 'Heavy' || d.kind === 'Security') {
        for (const s of [-1, 1]) { const leaf = add(lm, s * w / 4, h / 2, 0, w / 2, h, th); leaf.userData = { closed: s * w / 4, open: s * w / 4 + s * w / 2 };
          if (d.kind === 'Heavy') { add(m.hazard, 0, -h * 0.15, 0, w / 2 + 0.01, 0.2, th + 0.02, leaf); } view.leaves.push(leaf); }
      } else {
        const leaf = add(lm, 0, h / 2, 0, w, h, th); leaf.userData = { closed: 0, open: w * 0.98 }; view.leaves.push(leaf);
        add(d.kind === 'Cell' ? m.black : m.glass, 0, 0.45, 0, 0.4, 0.3, th + 0.02, leaf);
      }
      for (const side of [-1, 1]) {
        const z = side * (depth / 2 + 0.03), rx = w / 2 + jamb + 0.18;
        add(m.dark, rx, 1.25, z, 0.13, 0.2, 0.05);
        view.leds.push(add(m.amber, rx, 1.31, z + side * 0.03, 0.06, 0.025, 0.01));
        const wp = new T.Vector3(0, 0, side * 0.9).applyAxisAngle(new T.Vector3(0, 1, 0), g.rotation.y).add(g.position);
        const room = this.w.fac.roomAt({ x: wp.x, y: 0, z: wp.z });
        const px = this.proxy('reader', rx, 1.25, z, 0.35, 0.4, 0.2, { kind: 'reader', door: d.id, side: room ? room.id : d.roomA }, g);
      }
    }
    buildWindows() {
      const m = this.m;
      for (const win of WINDOWS) {
        const a = this.w.fac.room(win.a), b = this.w.fac.room(win.b), z = (a.maxZ + b.minZ) / 2, cx = (win.min + win.max) / 2, w = win.max - win.min, cy = (win.y0 + win.y1) / 2, hh = win.y1 - win.y0;
        const glass = new T.Mesh(new T.BoxGeometry(w, hh, 0.04), m.glass); glass.position.set(cx, cy, z); glass.renderOrder = 5; this.root.add(glass);
        glass.userData.interact = { kind: 'window', id: 'SCP-L-001' }; this.interact.push(glass);
        this.colliders.push({ x0: win.min, x1: win.max, z0: z - 0.15, z1: z + 0.15 });
        const fr = new MB(), t = 0.08;
        fr.box(m.dark, cx, win.y1 + t / 2, z, w + 2 * t, t, 0.36); fr.box(m.dark, cx, win.y0 - t / 2, z, w + 2 * t, t, 0.36); fr.box(m.dark, win.min - t / 2, cy, z, t, hh, 0.36); fr.box(m.dark, win.max + t / 2, cy, z, t, hh, 0.36);
        for (let i = 1; i < 3; i++) fr.box(m.dark, win.min + w * i / 3, cy, z, 0.04, hh, 0.06);
        this.root.add(fr.build());
      }
    }
    // Closed door leaves block movement.
    doorBlockers() {
      const out = [];
      for (const id in this.doors) {
        const v = this.doors[id], d = v.door; if (!d.hasLeaf || d.openness > 0.8) continue;
        const half = d.width / 2 + 0.15;
        if (d.alongX) out.push({ x0: d.pos.x - 0.15, x1: d.pos.x + 0.15, z0: d.pos.z - half, z1: d.pos.z + half });
        else out.push({ x0: d.pos.x - half, x1: d.pos.x + half, z0: d.pos.z - 0.15, z1: d.pos.z + 0.15 });
      }
      return out;
    }
    updateDoors(realTime, now, sound) {
      const m = this.m;
      for (const id in this.doors) {
        const v = this.doors[id], d = v.door, t = d.openness, e = t * t * (3 - 2 * t);
        for (const leaf of v.leaves) leaf.position.x = leaf.userData.closed + (leaf.userData.open - leaf.userData.closed) * e;
        if (v.last !== d.state) { if ((d.state === S.DS.Opening || d.state === S.DS.Closing) && sound) sound(d.kind === 'Heavy' ? 'heavy' : 'servo', d.pos); v.last = d.state; }
        if (!v.leds.length) continue;
        const age = realTime - d.lastResultTime; let mat = m.amber;
        if (d.locked || d.lockdown) mat = m.red;
        if (age < 2.5) mat = S.isSuccess(d.lastResult) ? m.green : d.lastResult === S.R.Await ? ((realTime * 3) % 1 > 0.5 ? m.green : m.amber) : m.red;
        else if (d.pendingCard) mat = (realTime * 3) % 1 > 0.5 ? m.green : m.amber;
        if (d.faultUntil > now) mat = (realTime * 7) % 1 > 0.5 ? m.red : m.black;
        for (const led of v.leds) led.material = mat;
      }
    }
  }

  // ------------------------------------------------------------------ characters
  const SKIN = [0xedc7a8, 0xd6a885, 0xa87a5c, 0x7a543d, 0xf5d6bd], HAIR = [0x1f1712, 0x593d24, 0x9e8052, 0x808080, 0x331f14];
  function part(parent, mat, x, y, z, sx, sy, sz) { const b = new T.Mesh(BOX, mat); b.scale.set(sx, sy, sz); b.position.set(x, y, z); parent.add(b); return b; }
  function pivot(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  const BOX = new T.BoxGeometry(1, 1, 1);

  class Humanoid {
    constructor(npc, mats) {
      this.npc = npc; this.root = new T.Group(); this.phase = 0; this.speed = 0;
      const role = npc.role, v = npc.colorVariant + Math.abs(hash(npc.id) % 5), col = mats.colored;
      const U = { Guard: [0x212933, 0x1a1c21, 0x0d0d0f], Scientist: [0x8cadd1, 0x40424d, 0xebebe6], Technician: [0xdb8c1f, 0xd1851a, 0xd9d933], Medic: [0x9ed1c7, 0x94c7bd, 0xcc1a1a], DClass: [0xf2730f, 0xeb6e12, 0x262626] }[role];
      const uni = col(U[0]), pants = col(U[1]), acc = col(U[2]), skin = col(SKIN[v % 5]), hair = col(HAIR[(v * 7 + 3) % 5]), shoe = col(0x0f0f0f);
      const body = this.body = pivot(this.root, 0, 0, 0); body.rotation.order = 'YXZ';
      const hips = this.hips = pivot(body, 0, 0.95, 0); part(hips, pants, 0, 0, 0, 0.34, 0.18, 0.2);
      const torso = this.torso = pivot(hips, 0, 0.08, 0);
      part(torso, uni, 0, 0.27, 0, npc.female ? 0.36 : 0.4, 0.5, 0.22);
      if (role === 'Guard') { part(torso, acc, 0, 0.3, 0, 0.43, 0.38, 0.25); }
      if (role === 'Scientist') { part(torso, acc, -0.12, 0.12, 0, 0.18, 0.78, 0.25); part(torso, acc, 0.12, 0.12, 0, 0.18, 0.78, 0.25); }
      if (role === 'Technician') { part(torso, col(0xe6e6e6), 0, 0.32, 0, 0.41, 0.04, 0.23); part(torso, col(0xe6e6e6), 0, 0.15, 0, 0.41, 0.04, 0.23); }
      if (role === 'Medic') part(torso, acc, 0.24, 0.38, 0, 0.1, 0.06, 0.12);
      if (role === 'DClass') part(torso, acc, 0.09, 0.4, 0.11, 0.12, 0.06, 0.01);
      const head = this.head = pivot(torso, 0, 0.56, 0);
      part(head, skin, 0, -0.02, 0, 0.1, 0.08, 0.1); part(head, skin, 0, 0.12, 0, 0.19, 0.23, 0.21);
      part(head, mats.black, -0.045, 0.14, 0.105, 0.03, 0.02, 0.01); part(head, mats.black, 0.045, 0.14, 0.105, 0.03, 0.02, 0.01);
      if (role === 'Guard') { part(head, col(0x14171a), 0, 0.245, 0, 0.22, 0.07, 0.23); part(head, col(0x14171a), 0, 0.22, 0.13, 0.2, 0.02, 0.08); }
      else if (role === 'Technician') part(head, col(0xf2cc1a), 0, 0.24, 0, 0.24, 0.1, 0.26);
      else part(head, hair, 0, 0.2, -0.015, 0.205, npc.female ? 0.12 : 0.08, 0.22);
      if (npc.female && role !== 'Guard' && role !== 'Technician') part(head, hair, 0, 0.08, -0.1, 0.18, 0.22, 0.05);
      const sleeve = role === 'Scientist' ? acc : uni;
      this.shL = pivot(torso, -0.25, 0.47, 0); this.shR = pivot(torso, 0.25, 0.47, 0);
      for (const sh of [this.shL, this.shR]) { part(sh, sleeve, 0, -0.15, 0, 0.1, 0.3, 0.1); const el = pivot(sh, 0, -0.3, 0); part(el, sleeve, 0, -0.13, 0, 0.09, 0.26, 0.09); part(el, skin, 0, -0.29, 0, 0.08, 0.09, 0.08); sh.userData.el = el; }
      this.hipL = pivot(hips, -0.1, -0.05, 0); this.hipR = pivot(hips, 0.1, -0.05, 0);
      for (const hp of [this.hipL, this.hipR]) { part(hp, pants, 0, -0.22, 0, 0.14, 0.44, 0.14); const kn = pivot(hp, 0, -0.44, 0); part(kn, pants, 0, -0.2, 0, 0.11, 0.4, 0.11); part(kn, shoe, 0, -0.43, 0.05, 0.11, 0.07, 0.24); hp.userData.kn = kn; }
      this.seed = v * 1.37;
      this.proxy = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 1.8, 6), new T.MeshBasicMaterial({ visible: false })); this.proxy.position.y = 0.9; this.root.add(this.proxy);
      this.proxy.userData.interact = { kind: 'npc', id: npc.id };
    }
    animate(dt, speed, posture, lookYaw, t) {
      const k = Math.min(1, dt * 8), walk = Math.min(1, speed / 1.4); this.speed += (walk - this.speed) * Math.min(1, dt * 4); const bl = this.speed;
      this.phase += speed * dt * 4.2; const s = Math.sin(this.phase), br = Math.sin(t * 1.6 + this.seed) * 1.5;
      let bodyRot = [0, 0], bodyPos = [0, 0, 0], hipsY = 0.95 + Math.abs(Math.cos(this.phase)) * 0.03 * bl, torso = br * 0.3 + bl * 4;
      let tL = s * 28 * bl, tR = -s * 28 * bl, kL = Math.max(0, -s) * 35 * bl, kR = Math.max(0, s) * 35 * bl, aL = -s * 22 * bl, aR = s * 22 * bl, eL = -10 - bl * 10, eR = eL, sideL = 4, sideR = -4, hp = 0, hy = lookYaw;
      if (bl < 0.5) switch (posture) {
        case 'Sitting': hipsY = 0.5; tL = tR = -88; kL = kR = 88; aL = aR = -35; eL = eR = -55; torso = 4; break;
        case 'Lying': bodyRot = [-90, 180]; bodyPos = [0, 0.55, -0.9]; aL = aR = 0; eL = eR = -5; hy = 0; torso = br * 0.5; break;
        case 'Working': aL = -55 + Math.sin(t * 3.1 + this.seed) * 8; aR = -60 + Math.sin(t * 3.7 + this.seed + 1) * 10; eL = eR = -35; torso = 12; hp = 20; break;
        case 'Counting': aR = -95 + Math.sin(t * 4.2) * 6; eR = -5; aL = -20; hp = -5 + Math.sin(t * 4.2) * 3; break;
        case 'Cowering': hipsY = 0.55; tL = tR = -110; kL = kR = 125; aL = aR = -150; eL = eR = -120; torso = 35; hp = 30; break;
        case 'Down': bodyRot = [90, 0]; bodyPos = [0, 0.12, -0.9]; aL = -160; aR = -20; sideL = 30; sideR = -40; hy = 70; break;
      }
      const D = Math.PI / 180, lerp = (a, b) => a + (b - a) * k;
      this.body.position.set(lerp(this.body.position.x, bodyPos[0]), lerp(this.body.position.y, bodyPos[1]), lerp(this.body.position.z, bodyPos[2]));
      this.body.rotation.x = lerp(this.body.rotation.x, bodyRot[0] * D); this.body.rotation.y = lerp(this.body.rotation.y, bodyRot[1] * D);
      this.hips.position.y = lerp(this.hips.position.y, hipsY); this.torso.rotation.x = lerp(this.torso.rotation.x, torso * D);
      this.head.rotation.x = lerp(this.head.rotation.x, hp * D); this.head.rotation.y = lerp(this.head.rotation.y, S.clamp(hy, -70, 70) * D);
      this.hipL.rotation.x = lerp(this.hipL.rotation.x, tL * D); this.hipR.rotation.x = lerp(this.hipR.rotation.x, tR * D);
      this.hipL.userData.kn.rotation.x = lerp(this.hipL.userData.kn.rotation.x, kL * D); this.hipR.userData.kn.rotation.x = lerp(this.hipR.userData.kn.rotation.x, kR * D);
      this.shL.rotation.x = lerp(this.shL.rotation.x, aL * D); this.shR.rotation.x = lerp(this.shR.rotation.x, aR * D);
      this.shL.rotation.z = lerp(this.shL.rotation.z, -sideL * D); this.shR.rotation.z = lerp(this.shR.rotation.z, -sideR * D);
      this.shL.userData.el.rotation.x = lerp(this.shL.userData.el.rotation.x, eL * D); this.shR.userData.el.rotation.x = lerp(this.shR.userData.el.rotation.x, eR * D);
    }
    headWorld(v) { return this.head.getWorldPosition(v).add(new T.Vector3(0, 0.32, 0)); }
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  class TallymanView {
    constructor(a, mats, w, fv) {
      this.a = a; this.root = new T.Group(); this.phase = 0; this.speed = 0; this.tapClock = 0; this.tapPlayed = false; this.scratchT = 0;
      const skin = mats.colored(0x333538), scar = mats.colored(0xb3ad9e);
      const hips = this.hips = pivot(this.root, 0, 1.45, 0); part(hips, skin, 0, 0, 0, 0.28, 0.16, 0.16);
      const torso = this.torso = pivot(hips, 0, 0.06, 0); part(torso, skin, 0, 0.42, 0, 0.3, 0.82, 0.17);
      for (let i = 0; i < 6; i++) part(torso, scar, -0.08 + i * 0.03, 0.55, 0.087, 0.008, 0.14, 0.005); part(torso, scar, 0, 0.55, 0.088, 0.2, 0.008, 0.005);
      const head = this.head = pivot(torso, 0, 0.86, 0); part(head, skin, 0, 0.08, 0, 0.07, 0.2, 0.07); part(head, skin, 0, 0.32, 0.02, 0.16, 0.34, 0.19);
      const limb = (p, len, r) => { part(p, skin, 0, -len / 2, 0, r, len, r); return pivot(p, 0, -len, 0); };
      this.shL = pivot(torso, -0.2, 0.78, 0); this.shR = pivot(torso, 0.2, 0.78, 0); this.elL = limb(this.shL, 0.55, 0.07); this.elR = limb(this.shR, 0.55, 0.07);
      for (const el of [this.elL, this.elR]) { part(el, skin, 0, -0.27, 0, 0.06, 0.55, 0.06); for (let f = 0; f < 3; f++) part(el, skin, -0.025 + f * 0.025, -0.66, 0, 0.015, 0.2, 0.02); }
      this.hipL = pivot(hips, -0.09, -0.05, 0); this.hipR = pivot(hips, 0.09, -0.05, 0); this.knL = limb(this.hipL, 0.7, 0.09); this.knR = limb(this.hipR, 0.7, 0.09);
      for (const kn of [this.knL, this.knR]) { part(kn, skin, 0, -0.34, 0, 0.07, 0.7, 0.07); part(kn, skin, 0, -0.69, 0.05, 0.08, 0.04, 0.22); }
      this.proxy = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 2.6, 6), new T.MeshBasicMaterial({ visible: false })); this.proxy.position.y = 1.3; this.root.add(this.proxy);
      this.proxy.userData.interact = { kind: 'anomaly', id: a.id };
      // Chamber wall decals with the tally marks.
      const ch = w.fac.room(a.containRoom); this.decals = [];
      const dec = (x, y, z, ry, wd, ht, cw) => { const c = canvas(cw, 256), t = new T.CanvasTexture(c); const mt = new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
        const mesh = new T.Mesh(new T.PlaneGeometry(wd, ht), mt); mesh.position.set(x, y, z); mesh.rotation.y = ry; fv.rooms[ch.id].group.add(mesh); this.decals.push({ c, t }); };
      dec((ch.minX + ch.maxX) / 2, 2.2, ch.maxZ - 0.012, Math.PI, ch.width - 1.2, 2.8, 512);
      dec(ch.minX + 0.012, 2.0, (ch.minZ + ch.maxZ) / 2 + 1, Math.PI / 2, ch.depth - 3, 2.4, 512);
      dec(ch.maxX - 0.012, 1.9, ch.minZ + 2.6, -Math.PI / 2, 4.2, 2.0, 384);
      this.lastTally = -1; this.lastLearned = -2; this.decalT = 0;
    }
    updateDecals() {
      const t = this.a.beh, b = t.strongest(), learned = b >= 0 && t.hist[b] >= 2 ? b : -1;
      if (t.tally === this.lastTally && learned === this.lastLearned) return; this.lastTally = t.tally; this.lastLearned = learned;
      const share = Math.floor(t.tally / 3);
      this.decals.forEach((d, i) => { drawTally(d.c, i === 2 ? Math.min(share, 200) : share, i === 2 && learned >= 0 ? S.fmtTime(learned * 15) : null, learned >= 0 ? t.hist[learned] : 0); d.t.needsUpdate = true; });
    }
    animate(dt, speed, w, yaw, t, sound) {
      this.decalT -= dt; if (this.decalT <= 0) { this.decalT = 6; this.updateDecals(); }
      const pose = this.a.pose, walk = Math.min(1, speed / 1.2); this.phase += speed * dt * (pose === 'Slowed' ? 1.5 : 2.6);
      const s = Math.sin(this.phase), sway = pose === 'Waiting' ? 0 : Math.sin(t * 0.7) * 2;
      let tL = s * 22 * walk, tR = -s * 22 * walk, kL = Math.max(0, -s) * 30 * walk, kR = Math.max(0, s) * 30 * walk, aL = -s * 12 * walk + 3, aR = s * 12 * walk + 3, eL = -8, eR = -8, torso = 8 + sway * 0.5, hp = 0, hy = 0, roll = sway * 2;
      if (this.a.lookAt) {
        const p = w.posOf(this.a.lookAt), hw = this.head.getWorldPosition(new T.Vector3());
        const dx = p.x - hw.x, dz = p.z - hw.z, dy = 1.6 - hw.y, fl = Math.sqrt(dx * dx + dz * dz);
        if (fl > 0.1) { hy = S.clamp(S.deltaAngle(yaw, Math.atan2(dx, dz) * 180 / Math.PI), -80, 80); hp = S.clamp(-Math.atan2(dy, fl) * 180 / Math.PI, -30, 40); }
      }
      switch (pose) {
        case 'Scratching': aR = -100; eR = -20 + Math.sin(t * 6) * 25; torso = 15; hp = 10; this.scratchT -= dt; if (this.scratchT <= 0) { this.scratchT = 1.2 + Math.random() * 1.3; sound && sound('scratch', this.a.agent.pos); } break;
        case 'Watching': torso = 4; roll = 12; break;
        case 'Tapping': { this.tapClock += dt * 2.4; const ph = this.tapClock % 1; aR = -80 - S.clamp(1 - ph * 4, 0, 1) * 12; eR = -15; if (ph < 0.1 && !this.tapPlayed) { this.tapPlayed = true; sound && sound('knock', this.a.agent.pos); } if (ph > 0.5) this.tapPlayed = false; break; }
        case 'Probing': aL = aR = -85 + Math.sin(t * 22) * 2; eL = eR = -10; torso = 18; hp = 25; break;
        case 'Waiting': aL = aR = 2; eL = eR = 0; torso = 2; hp = 0; roll = 0; break;
        case 'Attacking': aR = -110; eR = 0; torso = 25; break;
        case 'Slowed': roll = Math.sin(t * 13) * 6; torso = 20; break;
      }
      const D = Math.PI / 180, k = Math.min(1, dt * (pose === 'Attacking' ? 14 : 5)), L = (o, p, v) => { o[p] += (v - o[p]) * k; };
      this.hips.position.y += (1.45 + Math.abs(Math.cos(this.phase)) * 0.04 * walk - this.hips.position.y) * k;
      L(this.torso.rotation, 'x', torso * D); L(this.torso.rotation, 'z', sway * D); L(this.head.rotation, 'x', hp * D); L(this.head.rotation, 'y', hy * D); L(this.head.rotation, 'z', roll * D);
      L(this.hipL.rotation, 'x', tL * D); L(this.hipR.rotation, 'x', tR * D); L(this.knL.rotation, 'x', kL * D); L(this.knR.rotation, 'x', kR * D);
      L(this.shL.rotation, 'x', aL * D); L(this.shR.rotation, 'x', aR * D); this.shL.rotation.z = 6 * D; this.shR.rotation.z = -6 * D; L(this.elL.rotation, 'x', eL * D); L(this.elR.rotation, 'x', eR * D);
    }
  }

  function cameraModel(cam, mats) {
    const g = new T.Group(); g.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    part(g, mats.dark, 0, 0.12, 0, 0.06, 0.24, 0.06);
    const pv = pivot(g, 0, 0, 0); pv.rotation.order = 'YXZ';
    part(pv, mats.white, 0, 0, 0.12, 0.14, 0.12, 0.3); part(pv, mats.black, 0, 0, 0.28, 0.1, 0.09, 0.03);
    const led = part(pv, mats.red, 0.05, 0.05, 0.27, 0.02, 0.02, 0.01);
    const lens = pivot(pv, 0, 0, 0.32);
    return { group: g, pivot: pv, led, lens, cam };
  }

  S.Render = { FacilityView, Humanoid, TallymanView, cameraModel, MB };
})(typeof window !== 'undefined' ? window : globalThis);
