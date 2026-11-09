const H = require('./h'); const { check, sleep } = H;
(async () => {
  const E = await H.setup(); const G = E.st.gas;
  // m7: reload mid-visit = same visit, first visit not split
  const d = G.ctx.deriveMetrics_([
    { t_ms: 0, qid: 'q1', type: 'q_enter' }, { t_ms: 60000, qid: null, type: 'autosave' },
    { t_ms: 100000, qid: null, type: 'resume' }, { t_ms: 100000, qid: 'q1', type: 'q_enter' }, { t_ms: 140000, qid: 'q1', type: 'q_leave' },
    { t_ms: 140000, qid: 'q2', type: 'q_enter' }, { t_ms: 150000, qid: 'q2', type: 'q_leave' },
    { t_ms: 150000, qid: 'q1', type: 'q_enter' }, { t_ms: 160000, qid: 'q1', type: 'q_leave', value: 'pagehide' },
    { t_ms: 200000, qid: null, type: 'resume' }, { t_ms: 200000, qid: 'q1', type: 'q_enter' }, { t_ms: 210000, qid: 'q1', type: 'q_leave' }], ['q1', 'q2']);
  const m = d.metrics.q1;
  check(m.visits === 2 && m.time_first_visit_sec === undefined && m.first_visit_ms === 100000 && m.time_ms === 120000,
    `m7: reloads don't add visits (visits=${m.visits}, first=${m.first_visit_ms}ms, total=${m.time_ms}ms)`);
  // m4: iPad landscape (1080 CSS px) — calculator docks, question not covered
  {
    const { page } = await E.newPage('ipad'); await page.setViewportSize({ width: 1080, height: 810 });
    await H.login(page, E.url, 'T01'); await page.waitForSelector('.form-card');
    await page.click('.form-card:has-text("' + (process.env.AP_CARD || 'Mock Exam 45') + '") .actions .btn-blue'); await page.waitForSelector('#btn-begin');
    await page.evaluate(() => { const t = window.TZ; t.st.phase = 'transition'; t.st.ended.A = 'submit'; t.st.part_idx = 1; t.st.current_part = 'B'; t.api.persist(); });
    await page.reload(); await page.waitForSelector('#btn-begin'); await H.waitMath(page); // reload on the transition screen → Part B directions (n3)
    await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on'); await page.click('#tool-calc'); await sleep(1500);
    const cp = await (await page.$('#calc-panel')).boundingBox(), q = await (await page.$('#qwrap .q.on')).boundingBox();
    check(await page.$eval('#scr-test', e => e.classList.contains('calc-docked')) && q.x >= cp.x + cp.width - 2, `m4: 1080px landscape → docked, question starts right of calculator (calc ends ${Math.round(cp.x + cp.width)}, question at ${Math.round(q.x)})`);
    await page.screenshot({ path: H.SHOTS + '/ipad1080_calc_docked.png' });
    await page.context().close();
  }
  // m3: reopen while offline → code kept, auto sign-in when back online
  {
    const { page, ctx } = await E.newPage();
    await H.login(page, E.url, 'T04'); await page.waitForSelector('#scr-home.on');
    E.st.offline = true; await page.reload(); await sleep(1500);
    const v = await page.inputValue('#login-code'), msg = await page.textContent('#login-err');
    check(v === 'T04' && /automatically/.test(msg), 'm3: offline reopen keeps the code and says it will retry');
    E.st.offline = false; await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForSelector('#scr-home.on', { timeout: 15000 });
    check(true, 'm3: signed in automatically when back online');
    await page.context().close();
  }
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
