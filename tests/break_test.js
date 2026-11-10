// SAT round 2 (#3) task 6: the 10:00 break countdown starts Math Module 1 by itself at 0:00 (Bluebook);
// the SAT result page shows the estimated score range. MOCK-SAT98.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const FORM = 'MOCK-SAT98', MIN = 60000;

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  const qs = G.ctx.formData_(FORM).questions, Q = (p, n) => qs.find(q => q.part === p && q.display_no === n);
  const { page } = await E.newPage();
  const endModule = async () => { await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); };
  const answer = async (p, n) => { for (let i = 1; i <= n; i++) { const q = Q(p, i); if (q.type !== 'spr') await page.click(`#qwrap .q.on .ch-row[data-l="${q.key}"] .ch`); else await page.fill('#qwrap .q.on .spr-in', String(q.key[0])); await page.click('#btn-next'); } };

  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .btn-blue');
  await page.click('.form-card .btn-blue'); await page.waitForSelector('#btn-begin'); await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  await answer('RW1', 22); await endModule();
  await page.waitForSelector('#qwrap .q.on'); await answer('RW2', 20); await endModule();

  console.log('[break countdown]');
  await page.waitForSelector('#v-break.on'); await sleep(1200);
  const c1 = (await page.textContent('#break-count')).trim();
  check(/^(10:00|9:5\d)$/.test(c1), 'countdown visible: ' + c1);
  check(/starts automatically/.test(await page.textContent('#break-msg')) && await page.isVisible('#btn-pause'), 'text: "starts automatically" + Save and Continue Later still offered');
  await shot(page, 'r2_break');
  // 10 minutes pass (server and browser clock move together)
  G.shift(10 * MIN + 5000);
  await page.evaluate(ms => { const n = Date.now.bind(Date); Date.now = () => n() + ms; }, 10 * MIN + 5000);
  await page.waitForSelector('#v-question.on #qwrap .q.on', { timeout: 8000 }).catch(() => {});
  const st = await page.evaluate(() => window.TZ.st);
  check(st.current_part === 'M1' && st.phase === 'test' && !!st.part_starts.M1 && !st.break_until, 'at 0:00 Math Module 1 starts by itself (phase test, M1 timer started)');
  check((await page.textContent('#tb-title')).trim() === 'Section 2, Module 1: Math', 'title: Section 2, Module 1: Math');
  const t = (await page.textContent('#timer .digits')).trim();
  check(/^3[45]:\d\d$/.test(t), 'M1 timer running from 35:00 (' + t + ')');
  await shot(page, 'r2_break_autostart');

  console.log('[result with estimate]');
  await answer('M1', 18); await endModule();
  await page.waitForSelector('#qwrap .q.on'); await answer('M2', 15); await endModule();
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  const res = E.st.rpcLog.filter(r => r.fn === 'submit').map(r => JSON.parse(r.res).result).pop();
  const e = res.estimate;
  check(e && e.RW && e.Math && e.total && e.total.score === e.RW.score + e.Math.score, 'estimate: total = shown RW + shown Math');
  check(/Estimated score/.test(await page.textContent('.est')) && new RegExp(e.total.low + '–' + e.total.high).test(await page.textContent('.est')), 'result page shows the estimated score range ' + e.total.low + '–' + e.total.high);
  check(e.RW.score === G.ctx.satSectionEstimate_('RW', 22, 20).score && e.Math.score === G.ctx.satSectionEstimate_('Math', 18, 15).score, `estimate = SC formula (RW 22+20 → ${e.RW.score}, Math 18+15 → ${e.Math.score})`);
  check(/Results by skill/.test(await page.textContent('#result-body')) && /Reading and Writing/.test(await page.textContent('.skill-card')), 'skills grouped by section → domain');
  check(!res.sittings_note, 'one sitting: no sittings note');
  console.log('[review = the test screen (#24 G), SAT]');
  check(await page.$$eval('.rgrid .rcell .bdg', a => a.length) >= 0 && !/questions correct/.test(await page.textContent('#result-body')), 'SAT result: no overall "x / 98 questions correct" line');
  await page.click('.res-part:has-text("Section 2, Module 1") .rgrid .rcell'); await page.waitForSelector('#scr-test.on.viewing #qwrap .q.on');
  check(await page.isVisible('#tool-calc') && await page.isVisible('#tool-ref') && !(await page.isVisible('#timer')) && /M1-01/.test(await page.textContent('#view-bar')), 'Math question: Calculator + Reference, no timer, code M1-01');
  await page.click('#tool-calc'); await sleep(300); check(await page.isVisible('#calc-panel.on'), 'the Desmos panel opens in the review');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  check(!(await page.isVisible('#calc-panel.on')), 'calculator closed when back on the result page');
  await page.click('.res-part:has-text("Section 1, Module 1") .rgrid .rcell'); await page.waitForSelector('#scr-test.on.viewing #qwrap .q.on');
  check(await page.$('#qwrap .q.on.split') && !(await page.isVisible('#tool-calc')) && await page.isVisible('#tool-annot'), 'RW question: split pane, Highlights & Notes, no calculator');
  await shot(page, 'r2_review_sat_rw');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  await shot(page, 'r2_result_sat');
  H.englishOnly(E);
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
