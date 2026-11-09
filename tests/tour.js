const H = require('./h');
const { sleep, shot } = H;
(async () => {
  const E = await H.setup();
  E.st.gas.call('addMissingColumns', []);
  for (const dev of ['desktop', 'ipad', 'ipad-portrait']) {
    const code = { desktop: 'T01', ipad: 'T04', 'ipad-portrait': 'T05' }[dev];
    const { page } = await E.newPage(dev);
    await H.login(page, E.url, code);
    await page.waitForSelector('#scr-home.on .form-card');
    if (dev !== 'desktop') await shot(page, `${dev}_01_home`);
    await page.click('.form-card:has-text("Practice Exam 2012") .actions .btn-blue');
    await page.waitForSelector('#btn-begin'); await H.waitMath(page);
    await shot(page, `${dev}_02_directions`);
    await page.click('#btn-begin'); await page.waitForSelector('#v-question.on .q.on'); await sleep(500);
    const go = async n => { await page.click('#btn-nav'); await page.click(`#nav-grid .gcell[data-i="${n - 1}"]`); await sleep(250); };
    await page.click('#qwrap .q.on .ch-row[data-l="B"] .ch');
    await shot(page, `${dev}_03_A01`);
    for (const n of [8, 9, 17]) { await go(n); await shot(page, `${dev}_04_A${String(n).padStart(2, '0')}`); }
    await go(17); await page.click('#qwrap .q.on .q-elim'); await page.click('#qwrap .q.on .ch-row[data-l="A"] .strike'); await page.click('#qwrap .q.on .ch-row[data-l="C"] .ch');
    await page.evaluate(() => document.querySelector('#tmain').scrollTop = 400); await sleep(200);
    await shot(page, `${dev}_05_A17_elim_scrolled`);
    await page.click('#btn-nav'); await sleep(200); await shot(page, `${dev}_06_navigator`);
    await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await shot(page, `${dev}_07_review`);
    await page.click('#btn-next'); await page.waitForSelector('#modal-root.on'); await shot(page, `${dev}_08_confirm`);
    await page.click('#modal-root .btns .btn-blue'); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont');
    await page.waitForSelector('#btn-begin'); await H.waitMath(page); await page.click('#btn-begin'); await page.waitForSelector('#v-question.on .q.on'); await sleep(400);
    await page.click('#tool-calc'); await page.waitForFunction(() => window.TZ.calc, null, { timeout: 30000 }); await sleep(1500);
    await shot(page, `${dev}_09_B01_calc`);
    await page.click('#calc-x');
    for (const n of [5, 11, 13]) { await go(n); await shot(page, `${dev}_10_B${String(n).padStart(2, '0')}`); }
    await page.context().close();
  }
  await E.close();
})().catch(e => { console.error(e); process.exit(1); });
