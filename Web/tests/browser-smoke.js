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
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | '))); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
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
  // weapon: draw with the key, fire through the real input path, screenshot the first-person weapon and the impacts
  if (process.env.WEAPON) {
    await page.keyboard.press('KeyG'); await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, 'weapon-drawn.png') });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => { window.__scp.Input.taps.fire = true; }); await page.waitForTimeout(80); if (i === 0) await page.screenshot({ path: path.join(OUT, 'weapon-fire.png') }); await page.waitForTimeout(420); }
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, 'weapon-after.png') });
    const st = await page.evaluate(() => { const w = window.__scp.world, k = w.player.kit; return { cur: k && k.cur, drawn: k && k.drawn, ammo: k && k.ammo[k.cur], shots: k && k.shots, fx: (w.arms && w.arms.fx || []).length, lib: Object.keys(window.SCP.ArmsView.M.lib) }; });
    report.push('оружие: ' + JSON.stringify(st));
    // a breach: guards draw and respond
    await page.evaluate(() => { const w = window.__scp.world, a = w.anomaly('SCP-LF-141'); a.contained = false; a.breached = true; });
    await page.waitForTimeout(6000);
    const resp = await page.evaluate(() => { const w = window.__scp.world; return w.active.filter(n => n.combat).map(n => n.displayName + (n.kit && n.kit.drawn ? ' [' + n.kit.cur + ']' : '')).slice(0, 8); });
    report.push('реагирование: ' + resp.join(', '));
  }
  // the hands-on panels: repair with a mini-game, the store, the checkpoint pass, the sorting quota
  if (process.env.PANELS) {
    const click = async (re) => { const ok = await page.evaluate((src) => { const re = new RegExp(src); const b = [...document.querySelectorAll('#wActs button')].find(x => re.test(x.textContent) && !x.disabled); if (b) b.click(); return !!b; }, re); await page.waitForTimeout(400); return ok; };
    const wait = async (ms) => page.waitForTimeout(ms);
    // repair: a light fault next to the player
    const rep = await page.evaluate(() => { const G = window.__scp, w = G.world, S = window.SCP, r = w.fac.room('workshop') || w.fac.room('canteen'); w.player.pos = { x: r.center.x, y: r.floorY, z: r.center.z }; w.player.roomId = r.id; const f = w.infra.create('light', r.id); if (!f) return 'нет неисправности'; S.Proc.seed(w, f); f.cause = 'contact'; G.Repair.open(f, null); return f.text; });
    await wait(500); await click('Журнал'); await wait(2500); await click('Осмотреть'); await wait(3000); await click('Обесточить'); await wait(2500);
    await page.screenshot({ path: path.join(OUT, 'panel-repair.png') });
    const mini = await click('Подтянуть'); await wait(600); const miniShown = await page.evaluate(() => !document.getElementById('wMini').hidden);
    await page.screenshot({ path: path.join(OUT, 'panel-minigame.png') });
    await page.evaluate(() => document.getElementById('wStop').click()); await wait(3500);
    const log1 = await page.evaluate(() => [...document.querySelectorAll('#wLog li')].map(l => l.textContent));
    report.push('ремонт «' + rep + '»: мини-игра ' + (mini && miniShown ? 'показана' : 'НЕ показана') + ' · журнал: ' + log1.join(' | '));
    await page.evaluate(() => window.__scp.Work.close());
    // the store
    await page.evaluate(() => { const G = window.__scp, w = G.world; const r = w.fac.room('engStore'); w.player.pos = { x: r.center.x, y: r.floorY, z: r.center.z }; w.player.roomId = r.id; G.Store.open('engStore'); });
    await wait(500); await click('Весь склад'); await wait(500); await page.screenshot({ path: path.join(OUT, 'panel-store.png') });
    report.push('склад: кнопок ' + await page.evaluate(() => document.querySelectorAll('#wActs button').length));
    await page.evaluate(() => window.__scp.Work.close());
    // the checkpoint pass: somebody in line at the player's post
    const pass = await page.evaluate(() => { const G = window.__scp, w = G.world, S = window.SCP, cp = S.CP.CPS.cpC, poi = w.fac.poi(cp.poi); w.player.pos = { x: poi.pos.x, y: poi.pos.y, z: poi.pos.z }; w.player.roomId = poi.roomId; for (const t of w.tasks.list) if (t.kind === 'pass_control' && t.status === 'Active') t.status = 'Failed'; const st = S.CP.M(w).st.cpC; st.by = 'player'; const n = w.active.find(x => x.dept === 'science' && !x.dead); S.CP.enqueue(w, cp, n.id, n.cardId); G.Pass.open('cpC', n.id); return n.displayName; });
    await wait(500); await click('Сверить с базой'); await wait(2500); await click('Цель визита'); await wait(1800);
    await page.screenshot({ path: path.join(OUT, 'panel-pass.png') });
    const passInfo = await page.evaluate(() => document.getElementById('wInfo').textContent.slice(0, 160) + ' | ' + [...document.querySelectorAll('#wLog li')].map(l => l.textContent).join(' | '));
    await click('Пропустить'); report.push('пропуск (' + pass + '): ' + passInfo);
    // the sorting quota
    await page.evaluate(() => { const G = window.__scp, w = G.world; G.Sort.open({ status: 'Active', data: {}, steps: [] }); });
    for (let i = 0; i < 10; i++) { await click('В ящик'); await wait(900); }
    await page.screenshot({ path: path.join(OUT, 'panel-sort.png') });
    report.push('сортировка: ' + await page.evaluate(() => document.getElementById('wInfo').textContent));
    await page.evaluate(() => window.__scp.Work.close());
  }
  const sim = await page.evaluate(() => { const w = window.__scp.world; return { active: w.active.length, rooms: w.fac.roomList.length, t: w.now.toFixed(1) }; });
  console.log(report.join('\n')); console.log('мир:', JSON.stringify(sim));
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.slice(0, 20).join('\n') : 'ошибок в консоли нет');
  await browser.close(); server.close(); process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(2); });
