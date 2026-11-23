// Browser smoke test (node Web/tests/browser-smoke.js [outDir]): serves Web/, starts a new game in Chromium,
// walks the player through new sectors, takes screenshots, reports console errors and frame times.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, '..', 'shots');
const ROOMS = (process.env.ROOMS || 'galHub,armory,morgue,operating,mtfGarage,d3common,escD,corrS4,obsGal9,corr9').split(',');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.webp': 'image/webp' };
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(res => server.listen(0, res)); const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // three.js r128 comes from the CDN; offline it is served from the copy the APK build caches (Tools/bundle_web.py)
  const local3 = [process.env.THREE_JS, path.join(ROOT, '..', 'android', 'build', 'three-0.128.0.min.js'), '/tmp/threejs/package/build/three.min.js'].find(f => f && fs.existsSync(f));
  if (local3) await page.route(/three\.js\/r128\/three\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(local3) }));
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:' + port + '/index.html');
  try { await page.waitForSelector('#mNew', { state: 'visible', timeout: 30000 }); } catch (e) { console.log('меню не появилось:\n' + errors.join('\n')); await page.screenshot({ path: path.join(OUT, 'crisis-boot.png') }); throw e; }
  await page.click('#mNew'); await page.waitForTimeout(300); await page.click('#roleList button.pc[data-prof="' + (process.env.PROF || 'guard') + '"]'); await page.waitForTimeout(200); await page.click('#rNext'); await page.waitForTimeout(300); await page.click('#cStart');
  await page.waitForFunction(() => window.__scp && window.__scp.playing, null, { timeout: 60000 }); await page.waitForTimeout(2500);
  const report = [];
  for (const id of ROOMS) {
    const info = await page.evaluate((id) => {
      const G = window.__scp, w = G.world, r = w.fac.room(id); if (!r) return { id, missing: true };
      const h = r.hubPoints[0] || r.center; w.player.pos = { x: h.x, y: r.floorY, z: h.z }; w.player.roomId = r.id;
      return { id, name: r.name, level: r.level };
    }, id);
    if (info.missing) { report.push(id + ': нет помещения'); continue; }
    await page.waitForTimeout(1200);
    const ft = await page.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { if (++n >= 30) res((performance.now() - t0) / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    await page.screenshot({ path: path.join(OUT, 'crisis-' + id + '.png') });
    report.push(id + ' (' + info.name + ', уровень ' + info.level + '): кадр ' + ft.toFixed(1) + ' мс');
  }
  // death scene: someone near the player dies (cause given), gore at full; screenshot of the fall and the body
  if (process.env.DEATH) {
    for (const cause of process.env.DEATH.split(',')) {
      const who = await page.evaluate((cause) => {
        const G = window.__scp, w = G.world, p = w.player; localStorage.setItem('scplife.settings.v2', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('scplife.settings.v2') || '{}'), { gore: 2 })));
        const n = w.active.find(x => !x.dead && x.role !== 'DClass' && x.agent.roomId && x.agent.transitT <= 0); if (!n) return null;
        const r = w.fac.room(n.agent.roomId), f = window.SCP.V.dirFromYaw(n.agent.yaw);
        p.pos = { x: n.agent.pos.x + f.x * 3, y: r.floorY, z: n.agent.pos.z + f.z * 3 }; p.roomId = r.id; G.P.yaw = (n.agent.yaw + 180) % 360; G.P.pitch = -12;
        window.SCP.Med.hurt(w, n.id, 30, cause, null, 'Тест'); window.SCP.Med.die(w, n.id, cause, null, 'Тест'); return n.displayName + ' (' + cause + ')';
      }, cause);
      await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, 'death-' + cause + '-a.png') });
      await page.waitForTimeout(3500); await page.screenshot({ path: path.join(OUT, 'death-' + cause + '-b.png') });
      report.push('гибель: ' + who);
    }
  }
  const sim = await page.evaluate(() => { const w = window.__scp.world; return { active: w.active.length, rooms: w.fac.roomList.length, t: w.now.toFixed(1) }; });
  console.log(report.join('\n')); console.log('мир:', JSON.stringify(sim));
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.slice(0, 20).join('\n') : 'ошибок в консоли нет');
  await browser.close(); server.close(); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(2); });
