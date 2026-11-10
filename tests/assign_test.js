// #29 (v1.10) Assignments in the browser: the "Assigned by your teacher" card at the top of My Tests, only the assigned
// parts in normal order, the break only when RW + Math parts are assigned, Save and Continue Later only there, results
// limited to the parts done (estimate only for a whole section). MOCK-SAT98 + MOCK-APCAB.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const FORM = 'MOCK-SAT98', AP = 'MOCK-APCAB';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.ensureAssignments_();
  const A = G.sheets.Assignments, add = (c, f, p, act) => A.rows.push([c, f, p, act || 'Yes', '']);
  const off = (c, p) => { A.rows.filter(r => r[0] === c && r[2] === p).forEach(r => { r[3] = 'No'; }); };
  const qs = G.ctx.formData_(FORM).questions, Q = (p, n) => qs.find(q => q.part === p && q.display_no === n);
  const { page } = await E.newPage();
  const endModule = async () => { await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); };
  const answer = async (p, n) => { for (let i = 1; i <= n; i++) { const q = Q(p, i); if (q.type !== 'spr') await page.click(`#qwrap .q.on .ch-row[data-l="${q.key}"] .ch`); else await page.fill('#qwrap .q.on .spr-in', String(q.key[0])); await page.click('#btn-next'); } };
  const home = async () => { await page.click('#res-home'); await page.waitForSelector('#scr-home.on .form-card'); };
  const lastSession = () => G.table('Sessions').slice(-1)[0];

  console.log('[My Tests: the assignment card]');
  add('T03', FORM, 'RW1');
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .btn-blue');
  const first = await page.$eval('.form-card', c => ({ h: c.querySelector('h2').textContent, t: c.querySelector('.fc-time').textContent, a: (c.querySelector('.fc-assigned') || {}).textContent,
    color: c.querySelector('.fc-assigned') && getComputedStyle(c.querySelector('.fc-assigned')).color, cls: c.className, lines: /Section|Module 1:/.test(c.innerText) }));
  check(/— Reading and Writing Module 1$/.test(first.h) && first.t === '32 min' && first.a === 'Assigned by your teacher' && first.color === 'rgb(154, 154, 154)' && !first.lines,
    `top card: "${first.h}", "32 min" top right, grey "Assigned by your teacher", no module lines`);
  check((await page.$$('.form-card:not(.assigned)')).length === 1 && /Start test/.test(await page.textContent('.form-card:not(.assigned)')), 'the full SAT card is still there');
  await shot(page, 'r29_home');

  console.log('[RW1 only]');
  await page.click('.form-card.assigned .btn-blue'); await page.waitForSelector('#btn-begin');
  const ov = await page.textContent('.test-overview');
  check(/Reading and Writing Module 1/.test(ov) && /27 questions · 32 min/.test(ov) && !/Math|break/.test(ov), 'start screen: only the RW1 line (' + ov.replace(/\s+/g, ' ').slice(0, 90) + '…)');
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  check((await page.textContent('#tb-title')).trim() === 'Section 1, Module 1: Reading and Writing', 'test screen: RW1');
  await answer('RW1', 20); await endModule();
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  check(!(await page.$('.est')) && !(await page.$('.sec-est')) && (await page.$$('.sec-card')).length === 1 && /20\/27/.test(await page.textContent('.sec-raw')), 'result: no estimated score, one section card "20/27 correct"');
  check(/Module 1: 20\/27/.test(await page.textContent('.sec-mods')) && (await page.$$('.res-part')).length === 1 && /Reading and Writing Module 1/.test(await page.textContent('.res-meta')), 'Module 1 line, one question grid, title with the part');
  check(lastSession().scope === 'RW1', 'Sessions.scope RW1');
  await shot(page, 'r29_result_rw1');
  await home();
  check(/#1/.test(await page.textContent('.form-card.assigned .attempts')) && !(await page.$('.form-card:not(.assigned) .attempts')), 'the attempt is listed on the assignment card only');

  console.log('[MATH: M1 → M2 straight on, no break]');
  off('T03', 'RW1'); add('T03', FORM, 'MATH');
  await page.reload(); await page.waitForSelector('.form-card.assigned');
  check(/— Math$/.test(await page.textContent('.form-card.assigned h2')) && (await page.textContent('.form-card.assigned .fc-time')) === '1 h 10 min', 'card "… — Math", 1 h 10 min');
  await page.click('.form-card.assigned .btn-blue'); await page.waitForSelector('#btn-begin'); await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  await answer('M1', 16); await endModule();
  await page.waitForSelector('#qwrap .q.on'); await sleep(300);
  check((await page.textContent('#tb-title')).trim() === 'Section 2, Module 2: Math' && !(await page.$('#v-break.on')), 'M2 starts right after M1 (no break)');
  await answer('M2', 12); await endModule();
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  const est = await page.textContent('.sec-card');
  check(/Estimated score/.test(est) && /\d{3}–\d{3}/.test(est) && !(await page.$('.est')) && /28\/44/.test(est), 'result: Math card with "Estimated score" range, no total, 28/44');
  await shot(page, 'r29_result_math');
  await home();

  console.log('[RW1 + M1: the break, Save and Continue Later]');
  off('T03', 'MATH'); add('T03', FORM, 'RW1, M1');
  await page.reload(); await page.waitForSelector('.form-card.assigned');
  await page.click('.form-card.assigned .btn-blue'); await page.waitForSelector('#btn-begin'); await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  await answer('RW1', 5); await endModule();
  await page.waitForSelector('#v-break.on', { timeout: 15000 });
  check(await page.isVisible('#btn-pause') && /Math/.test(await page.textContent('#break-msg')), 'break screen after RW1 (Math next), Save and Continue Later offered');
  await page.click('#btn-pause'); await page.waitForSelector('#scr-home.on .form-card.assigned');
  check(/Continue Math/.test(await page.textContent('.form-card.assigned')) && lastSession().status === 'paused' && lastSession().scope === 'RW1,M1', 'My Tests: "Continue Math" on the assignment card, paused, scope RW1,M1');
  await page.click('.form-card.assigned .btn-blue'); await page.waitForSelector('#btn-begin');
  check((await page.textContent('#v-directions h1')).trim() === 'Section 2, Module 1: Math', 'continue → Math Module 1 directions');
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on'); await answer('M1', 3); await endModule();
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  check((await page.$$('.sec-card')).length === 2 && !(await page.$('.sec-est')) && (await page.$$('.res-part')).length === 2, 'result: RW 5/27 + Math 3/22, no estimate (single modules), two grids');
  await home();

  console.log('[M2 only: Directions + Begin, no transition]');
  off('T03', 'RW1, M1'); add('T03', FORM, 'M2');
  await page.reload(); await page.waitForSelector('.form-card.assigned');
  await page.click('.form-card.assigned .btn-blue'); await page.waitForSelector('#btn-begin');
  check((await page.textContent('#v-directions h1')).trim() === 'Section 2, Module 2: Math', 'M2 alone opens on its Directions (timer not running before Begin)');
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on'); await answer('M2', 7); await endModule();
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  check(!(await page.$('.sec-est')) && /7\/22/.test(await page.textContent('.sec-raw')), 'result: Math 7/22, no estimate');
  await home();
  off('T03', 'M2');
  await page.reload(); await page.waitForSelector('.form-card');
  check(!(await page.$('.form-card.assigned')), 'active = No → the card is gone');

  console.log('[AP: Part B only]');
  add('T01', AP, 'B');
  const { page: p2 } = await E.newPage();
  await H.login(p2, E.url, 'T01'); await p2.waitForSelector('.form-card.assigned');
  check(/— Part B$/.test(await p2.textContent('.form-card.assigned h2')), 'AP card "… — Part B"');
  await p2.click('.form-card.assigned .btn-blue'); await p2.waitForSelector('#btn-begin');
  check((await p2.textContent('#v-directions h1')).trim() === 'Section I, Part B', 'opens on Part B');
  await p2.click('#btn-begin'); await p2.waitForSelector('#qwrap .q.on');
  await p2.click('#btn-nav'); await p2.click('#nav-review'); await p2.waitForSelector('#v-review.on'); await p2.click('#btn-next'); await p2.click('#modal-root .btns .btn-blue');
  await p2.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  check(/0 \/ 1/.test(await p2.textContent('.score-total')) && (await p2.$$('.res-parts > div')).length === 1, 'result: Part B only (0 / 1)');
  check(lastSession().scope === 'B', 'Sessions.scope B');

  console.log('[teacher]');
  G.sheets.Settings.rows.push(['teacher_code', 'TEACH-29-UI', '']);
  const { page: tp } = await E.newPage();
  await H.login(tp, E.url, 'teach-29-ui'); await tp.waitForSelector('#scr-teacher.on .t-card');
  const tl = await tp.textContent('#scr-teacher');
  check(/— Reading and Writing Module 1/.test(tl) && /— Math Module 2/.test(tl) && /— Part B/.test(tl), 'teacher list: attempts labelled with their parts');
  await shot(tp, 'r29_teacher');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
