// #25 nice link: site/index.html (GitHub Pages wrapper) shows the app full screen in a cross-site iframe.
// The wrapper is served from 127.0.0.1 and the app from localhost (two different sites, like github.io → script.google.com).
// Desktop + iPad-size viewport: full screen, no double scroll, login, resume after reload, one live window, Save and Continue
// Later, Desmos, teacher mode. Plus static checks on the wrapper (only the deployment link, no secrets, no extra loads).
const http = require('http'), fs = require('fs'), path = require('path');
const H = require('./h'); const { check, sleep } = H;
const SITE = path.join(__dirname, '..', 'site');
const FORM = 'MOCK-AP45', CARD = 'Mock Exam 45', TCODE = 'TEACH-25-SITE';
const LIVE = 'https://script.google.com/macros/s/AKfycbxCLbgQdFZ0ykhVx5q0vw5dpTtwi4zSUnaWUrc59-7wQIhmyXIi3EWfQ19WOD84cm1D/exec';

console.log('[wrapper page: static]');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const urls = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []);
check(urls.length && urls.every(u => u === LIVE), 'site/index.html loads only the Apps Script deployment link (' + urls.length + 'x)');
check(!/<script[^>]+src=|<link[^>]+stylesheet|fonts\.g|analytics|gtag/i.test(html), 'no outside scripts, fonts or trackers');
check(!/TZ-[A-Z0-9]{4}-|MINH\d|teacher_code|desmos[^"]*key|api[_-]?key|token/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no codes, keys or tokens in the page');
check(fs.existsSync(path.join(SITE, 'icon.svg')) && fs.existsSync(path.join(SITE, 'icon-180.png')), 'icons (favicon + iPad home-screen icon)');
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8');
check(/XFrameOptionsMode\.ALLOWALL/.test(code), 'Code.gs: the web app may be shown inside the wrapper (XFrameOptionsMode.ALLOWALL)');

(async () => {
  const E = await H.setup(); const G = E.st.gas;
  G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Settings.rows.push(['teacher_code', TCODE, '']);
  const keyOf = (p, n) => G.ctx.formData_(FORM).questions.find(q => q.part === p && q.display_no === n).key;
  // the wrapper, with the app link pointed at the local app (different site)
  const wport = 9100 + Math.floor(Math.random() * 500);
  const page0 = html.split(LIVE).join(E.url);
  const ws = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page0); }
    const f = path.join(SITE, path.basename(u));
    if (fs.existsSync(f)) { res.writeHead(200); return res.end(fs.readFileSync(f)); }
    res.writeHead(404); res.end();
  }).listen(wport);
  const W = `http://127.0.0.1:${wport}/`;
  const appFrame = async page => {
    for (let i = 0; i < 100; i++) { const f = page.frames().find(x => x.url().startsWith(E.url)); if (f && await f.$('#login-code').catch(() => null)) return f; await sleep(100); }
    throw new Error('app frame not found');
  };
  const sess = sc => G.table('Sessions').filter(s => s.student_code === sc && s.form_id === FORM).pop();

  for (const [dev, sc] of [['desktop', 'T01'], ['ipad', 'T04'], ['ipad-portrait', 'T05']]) {
    console.log(`[${dev}: student ${sc}]`);
    const { ctx, page } = await E.newPage(dev);
    await page.goto(W); let f = await appFrame(page);
    const lay = await page.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, vw: innerWidth, vh: innerHeight, sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth }; });
    check(lay.x === 0 && lay.y === 0 && lay.w === lay.vw && lay.h === lay.vh && lay.sh <= lay.vh && lay.sw <= lay.vw, `app fills the screen (${lay.w}×${lay.h}), the wrapper itself never scrolls`);
    check(await page.title() === 'Test Zone' && await page.isVisible('#app.on'), 'tab title "Test Zone", app shown');
    await f.fill('#login-code', sc); await f.click('#login-btn'); await f.waitForSelector('.form-card');
    const inner = await f.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth }));
    check(inner.sw <= inner.vw, 'My Tests: no sideways scroll inside the app');
    await f.click(`.form-card:has-text("${CARD}") .actions .btn-blue`); await f.waitForSelector('#btn-begin'); await H.waitMath(f);
    await f.click('#btn-begin'); await f.waitForSelector('#qwrap .q.on');
    await f.click('#qwrap .q.on .ch-row[data-l="' + keyOf('A', 1) + '"] .ch'); await sleep(600);
    // reload the nice link: signed in again + back in the test with the answer (device storage in the framed app)
    await page.reload(); f = await appFrame(page);
    await f.waitForSelector('#qwrap .q.on', { timeout: 15000 }).catch(() => {});
    const backL = await f.evaluate(() => { const c = document.querySelector('#scr-test.on #qwrap .q.on .ch.sel'); return c ? c.closest('.ch-row').dataset.l : null; });
    check(backL === keyOf('A', 1), 'reload → signed in by itself, back in Part A with the answer kept');
    if (dev === 'desktop') { await page.screenshot({ path: path.join(H.SHOTS, 'site_desktop_test.png') }); }
    // a second window of the same attempt takes over; the first one stops
    const p2 = await ctx.newPage();
    await p2.goto(W); const f2 = await appFrame(p2);
    await f2.waitForSelector('#qwrap .q.on', { timeout: 15000 });
    const tok = sess(sc).copy_token;
    check(!!tok && (await f2.evaluate(() => window.TZ.copy)) === tok, 'second window: resumed by itself and is now the live copy');
    await f.click('#btn-nav'); await f.click('#nav-review'); await f.waitForSelector('#v-review.on');
    await f.click('#btn-next'); await f.click('#modal-root .btns .btn-blue');
    await f.waitForFunction(() => /open in another window/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    check(/This test is open in another window\. Close this one\./.test(await f.textContent('body')) && !sess(sc).status.match(/completed/), 'first window: "This test is open in another window. Close this one." and stopped');
    await page.close();
    // Save and Continue Later in the live window, then come back
    await f2.click('#btn-nav'); await f2.click('#nav-review'); await f2.waitForSelector('#v-review.on');
    await f2.click('#btn-next'); await f2.click('#modal-root .btns .btn-blue'); await f2.waitForSelector('#v-transition.on'); await sleep(500);
    await f2.click('#btn-pause'); await f2.waitForSelector('#scr-home.on .form-card');
    check(sess(sc).status === 'paused', 'Save and Continue Later → paused');
    await p2.reload(); const f3 = await appFrame(p2);
    await f3.waitForSelector('.form-card .btn-blue:has-text("Continue Part B")', { timeout: 15000 });
    check(true, 'reload → still signed in, card says "Continue Part B"');
    await f3.click('.form-card .btn-blue:has-text("Continue Part B")'); await f3.waitForSelector('#btn-begin'); await f3.click('#btn-begin'); await f3.waitForSelector('#qwrap .q.on');
    await f3.click('#tool-calc'); await sleep(500);
    check(await f3.isVisible('#calc-panel.on'), 'Part B: the Desmos calculator opens inside the nice link');
    if (dev !== 'desktop') await p2.screenshot({ path: path.join(H.SHOTS, `site_${dev}_calc.png`) });
    await ctx.close();
  }

  console.log('[teacher on the nice link]');
  {
    const { ctx, page } = await E.newPage('ipad');
    await page.goto(W); const f = await appFrame(page);
    await f.fill('#login-code', TCODE); await f.click('#login-btn'); await f.waitForSelector('#scr-teacher.on', { timeout: 15000 });
    const stored = await f.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    check(await f.isVisible('#scr-teacher.on') && !stored.includes(TCODE), 'teacher mode opens; the teacher code is not kept on the device');
    await page.screenshot({ path: path.join(H.SHOTS, 'site_ipad_teacher.png') });
    await ctx.close();
  }
  ws.close(); await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
