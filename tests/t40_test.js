// #40 (v1.14) in the browser: teacher result page → time block under each module score + time to answer under each
// question number + in the question bar; student result page → no teacher numbers
// (no times / hints for the student). Desktop 1280 + phone 390.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const path = require('path');
const H = require('./h'); const { check, shot } = H;
const FORM = 'MOCK-SAT98', TCODE = 'TEACH-40-UI';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TCODE, '']);
  // a full SAT attempt with an event log: each question answered after 40–80 s, a few checked long after answering
  const fd = G.ctx.formData_(FORM), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key);
  const wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const x = G.call('getTest', ['T03', FORM, { fresh: true }]);
  const seq = ['RW1', 'RW2', 'M1', 'M2'], now = Date.now();
  const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
  const evs = [];
  seq.forEach((p, k) => {
    st.part_starts[p] = now - (4 - k) * 36 * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {} };
    let t = 0; const qs = x.questions.filter(q => q.part === p);
    qs.forEach((q, i) => {
      const full = fd.questions.find(z => z.qid === q.qid), at = 40 + (i * 7) % 40, stay = i % 6 === 0 ? 150 : 5, blank = i === qs.length - 1;
      const v = blank ? null : (/^M/.test(p) ? (i % 3 === 0 || (p === 'M2' && i % 2) ? wrong(full) : key(full)) : (i % 4 === 0 ? wrong(full) : key(full)));
      evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: i + 1 });
      if (v) { evs.push({ part: p, t_ms: (t + at) * 1000, qid: q.qid, type: 'select', value: v }); st.parts[p].ans[q.qid] = v; }
      t += at + stay; evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null });
    });
    evs.push({ part: p, t_ms: t * 1000, qid: '', type: 'review_open', value: null }, { part: p, t_ms: (t + 60) * 1000, qid: '', type: 'part_end', value: 'submit' });
  });
  G.call('submit', ['T03', x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
  const out = path.join(H.SHOTS);

  console.log('[teacher: time per module, time to answer]');
  for (const dev of ['desktop1280', 'phone']) {
    const { page } = await E.newPage(dev);
    await H.login(page, E.url, TCODE.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
    await page.click('.t-open'); await page.waitForSelector('#scr-result.on .sec-card .mod-time', { timeout: 20000 });
    const v = await page.evaluate(() => ({
      blocks: [...document.querySelectorAll('.sec-card .mod-time')].map(b => b.innerText.replace(/\s+/g, ' ')),
      rt: [...document.querySelectorAll('.rgrid.tgrid .rcell .rt')].map(x => x.textContent),
      sml: [...document.querySelectorAll('.it-pr .pr-app[data-sec="Math"]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      sw: document.documentElement.scrollWidth <= innerWidth }));
    const sums = v.blocks.map(b => { const n = [...b.matchAll(/(\d+):(\d\d)/g)].map(m => +m[1] * 60 + +m[2]); return n[0] === n[1] + n[2] + n[3]; });
    check(v.blocks.length === 4 && /^Module 1 · 32:00 Solving time \d+:\d\d Checking \/ review time \d+:\d\d Time left at submit \d+:\d\d Time on blank questions \d+:\d\d( Left the test: —)?$/.test(v.blocks[0]) && sums.every(Boolean),
      `${dev}: 4 module blocks ("${v.blocks[2]}"), solving + checking + left = clock`);
    check(v.rt.length === 98 && v.rt.filter(t => t === '–').length === 4 && v.rt.every(t => /^(\d+:\d\d|–)$/.test(t)), `${dev}: time to answer under each of the 98 numbers (blank: –)`);
    check(v.sml.length >= 3 && v.sml.every(t => /^Practise: .+ in SAT Math Lib — assign (Easy|Medium|Hard)/.test(t)), `${dev}: #44: a SAT Math Lib line + level under each weak Math skill ("${v.sml[0]}")`);
    check(v.sw, `${dev}: no sideways scroll`);
    if (dev === 'desktop1280') {
      await page.locator('.res-score').screenshot({ path: path.join(out, 'r40_teacher_module_time.png') });
      await page.locator('.res-part').nth(2).screenshot({ path: path.join(out, 'r40_teacher_grid_time.png') });
      await page.click('.rgrid.tgrid .rcell[data-qid]');
      await page.waitForSelector('#go-det', { timeout: 15000 }); await page.click('#go-det'); await page.waitForSelector('#go-drawer.on');
      const bar = await page.evaluate(() => (document.getElementById('go-dr-body') || {}).innerText || '');
      check(/Time \d+ (min \d+ )?s to answer · total \d+ (min \d+ )?s/.test(bar.replace(/\s+/g, ' ')), '#47 Details: "' + bar.replace(/\s+/g, ' ').replace(/.*(Time [^·]*· total [^A-Z]*).*/, '$1').trim() + '"');
    } else await page.locator('.sec-card').nth(1).screenshot({ path: path.join(out, 'r40_teacher_module_time_phone.png') });
    await page.context().close();
  }

  console.log('[student: no module times; #48: time to answer under each number]');
  for (const dev of ['desktop1280', 'phone']) {
    const { page } = await E.newPage(dev);
    await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .fc-view');
    await page.click('.form-card .fc-view'); await page.waitForSelector('#scr-result.on .res-score', { timeout: 20000 });
    const v = await page.evaluate(() => ({ times: !!document.querySelector('.mod-time, .it-pr'), rt: document.querySelectorAll('.rgrid .rt').length, body: document.getElementById('result-body').innerText, sw: document.documentElement.scrollWidth <= innerWidth }));
    check(!v.times && v.rt === 98 && !/Solving time|Checking|assign (Easy|Medium|Hard)/i.test(v.body) && v.sw, `${dev}: no module times, no level hint; #48: time under each of the 98 numbers; no sideways scroll`);
    await page.context().close();
  }
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
