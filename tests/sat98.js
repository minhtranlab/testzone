// SAT end-to-end on the 98-question mock (MOCK-SAT98): RW1 → RW2 (auto) → break (+ Save and Continue Later) → M1 → M2 (auto) → result.
// Run: DATA_DIR=/home/claude/harness/gas_sat98 node sat98.js
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
process.env.SHOTS = process.env.SHOTS || require('./paths').WORK + '/shots_sat';
const H = require('./h'); const { check, sleep, shot } = H;
const FORM = 'MOCK-SAT98';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  const qs = G.ctx.formData_(FORM).questions, Q = (p, n) => qs.find(q => q.part === p && q.display_no === n);
  const { page } = await E.newPage();
  const q = sel => '#qwrap .q.on ' + sel;
  const on = async s => page.isVisible(s);

  console.log('[My Tests]');
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .btn-blue');
  const card = await page.textContent('.form-card');
  check(/SAT — Mock Practice Test/.test(card) && (await page.textContent('.form-card .fc-time')).trim() === '2 h 14 min' && !/Module 1|break between/.test(card),
        'card (#24 A): title + total time "2 h 14 min" on the same line, no module lines');
  check(await page.$eval('.form-card .fc-time', x => getComputedStyle(x).color) !== await page.$eval('.form-card h2', x => getComputedStyle(x).color) &&
        Math.abs(await page.$eval('.form-card .fc-time', x => x.getBoundingClientRect().top) - await page.$eval('.form-card h2', x => x.getBoundingClientRect().top)) < 12, 'card time: light grey, same line as the title');
  check(!/AP Calculus/.test(card), 'SAT-track student does not see AP forms');
  await shot(page, 'sat98_00_mytests');
  await page.click('.form-card .btn-blue');
  await page.waitForSelector('#btn-begin');
  const ov = await page.textContent('.test-overview');
  check(/Section 1, Module 1: Reading and Writing: 27 questions · 32 min · no calculator/.test(ov) && /Section 2, Module 2: Math: 22 questions · 35 min · calculator/.test(ov) &&
        /10-minute break between sections/.test(ov) && /2 h 14 min/.test(ov), 'start screen (#24 A): the 4 modules + 10-minute break + total time');

  console.log('[RW1]');
  await page.waitForSelector('#btn-begin');
  check(/This section tests reading and writing skills/.test(await page.textContent('#v-directions')) && /27\s*questions/.test(await page.textContent('#v-directions')), 'RW directions (own wording) + 27 questions');
  await shot(page, 'sat98_01_directions');
  const gt = E.st.rpcLog.filter(r => r.fn === 'getTest').pop().res;
  check(!/"key"|key_source|"tags"|topic_name|INI\.CID|"flags"/.test(gt), 'getTest payload: no key, no key_source, no tags/flags (' + Math.round(gt.length / 1024) + ' KB)');
  await page.click('#btn-begin'); await page.waitForSelector('#v-question.on .q.on'); await H.waitMath(page);
  check((await page.textContent('#tb-title')).trim() === 'Section 1, Module 1: Reading and Writing', 'top bar title = Section 1, Module 1: Reading and Writing');
  check(await on(q('.q-pass')) && await on(q('.q-side')) && await on(q('.q-divider')), 'split pane: passage left, divider, question right');
  check(await page.$$eval(q('.ch-row'), a => a.length) === 4, '4 answer choices A–D');
  check(await on('#tool-annot') && (await page.textContent('#tool-annot')).trim() === 'Highlights & Notes' && !(await on('#tool-calc')) && !(await on('#tool-ref')), 'RW tools: Highlights & Notes; no Calculator / Reference');
  check(await on('#practice-banner.on') && /practice test/i.test(await page.textContent('#practice-banner')), 'practice-test banner under the top bar');
  check((await page.textContent('#timer .digits')).trim() === '32:00' || (await page.textContent('#timer .digits')).trim() === '31:59', 'timer 32:00');
  await shot(page, 'sat98_02_rw_split');
  // highlight inside the PASSAGE
  await page.evaluate(() => {
    const pass = document.querySelector('#qwrap .q.on .q-text-pass');
    const w = document.createTreeWalker(pass, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.data.trim().length < 12) {}
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 12);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.click('#tool-annot'); await sleep(200);
  check(await page.$$eval(q('.q-text-pass span.hl'), x => x.length) > 0, 'Highlights & Notes works in the passage pane');
  await page.click('#hl-toolbar [data-c="b"]'); await page.click('#hl-close');
  // answer RW1: right on odd, wrong on even display numbers (1..20), rest blank
  for (let i = 1; i <= 27; i++) {
    const k = Q('RW1', i).key, L = i <= 20 ? (i % 2 ? k : 'ABCD'.replace(k, '')[0]) : null;
    if (L) await page.click(q(`.ch-row[data-l="${L}"] .ch`));
    if (Q('RW1', i).figures.length) { check(await page.$$eval(q('.q-fig img'), a => a.length && a[0].naturalWidth > 0), `RW1 ${i}: figure (bar graph) shown`); }
    await page.click('#btn-next');
  }
  await page.waitForSelector('#v-review.on');
  await page.reload(); await page.waitForSelector('#v-review.on, #v-question.on', { timeout: 15000 }); await sleep(500);
  const hl = await page.evaluate(() => JSON.stringify(window.TZ.st.parts.RW1.hl));
  check(/"r":"p"/.test(hl) && /"c":"b"/.test(hl), 'passage highlight (blue) survives a reload');
  if (!(await on('#v-review.on'))) { await page.click('#btn-nav'); await page.click('#nav-review'); }
  await page.click('#btn-next'); await page.waitForSelector('#modal-root.on');
  check(/Move on to the next module\?/.test(await page.textContent('#modal-root')), 'review → "Move on to the next module?"');
  await page.click('#modal-root .btns .btn-blue');

  console.log('[RW2 starts at once]');
  await page.waitForSelector('#v-question.on .q.on'); await sleep(300);
  let st = await page.evaluate(() => window.TZ.st);
  check(st.current_part === 'RW2' && st.phase === 'test' && st.part_starts.RW2 && (await page.textContent('#tb-title')).trim() === 'Section 1, Module 2: Reading and Writing',
    'RW2 opens right after RW1 (no directions / transition screen), its timer running');
  check(!(await on('#v-transition.on')) && !(await on('#btn-pause')), 'no "Save and Continue Later" between RW1 and RW2');
  for (let i = 1; i <= 27; i++) { if (i <= 15) await page.click(q(`.ch-row[data-l="${Q('RW2', i).key}"] .ch`)); await page.click('#btn-next'); }
  await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue');

  console.log('[break]');
  await page.waitForSelector('#v-break.on'); await sleep(400);
  const bc = (await page.textContent('#break-count')).trim();
  check(/^(10:00|9:5\d)$/.test(bc) && await on('#btn-resume') && await on('#btn-pause'), 'break: 10:00 countdown, Resume Testing + Save and Continue Later (' + bc + ')');
  check(!(await on('#tool-calc')) && !(await on('#btn-next')), 'break screen: no tools, no Next');
  await shot(page, 'sat98_03_break');
  await page.click('#btn-pause'); await page.waitForSelector('#scr-home.on .form-card'); await sleep(500);
  let S = G.table('Sessions').find(r => r.student_code === 'T03');
  check(S.status === 'paused' && S.score_RW === '' , 'Sessions.status = paused at the section break');
  const c2 = await page.textContent('.form-card');
  check(/Paused at the break/.test(c2) && /Continue Math/.test(c2), 'My Tests: "Paused at the break" + Continue Math');
  await shot(page, 'sat98_04_mytests_paused');
  await page.click('.form-card .btn-blue'); // Continue Math
  await page.waitForSelector('#btn-begin');
  check((await page.textContent('#tb-title')).trim() === 'Section 2, Module 1: Math', 'Continue Math → Math Module 1 directions');

  console.log('[M1]');
  await page.click('#btn-begin'); await page.waitForSelector('#v-question.on .q.on'); await H.waitMath(page);
  check(await on('#tool-calc') && await on('#tool-ref') && !(await on('#tool-annot')), 'Math tools: Calculator + Reference; no Highlights & Notes');
  check(!(await on(q('.q-pass'))) && await on(q('.q-elim')), 'Math MCQ: single pane with ABC eliminator');
  await shot(page, 'sat98_05_math_mcq');
  await page.click('#tool-ref'); await sleep(600); await H.waitMath(page);
  check(await page.$$eval('#ref-body .ref-cell svg', a => a.length) === 11 && await page.$$eval('#ref-body mjx-container', a => a.length) >= 9 &&
        /360 degrees/.test(await page.textContent('#ref-body')) && /180 degrees/.test(await page.textContent('#ref-body')), 'Reference sheet: 11 drawings, formulas typeset, 360° / 180° notes');
  await shot(page, 'sat98_06_reference');
  await page.click('#ref-x');
  await page.click('#tool-calc'); await page.waitForSelector('#calc-panel.on'); await sleep(800);
  check(await page.evaluate(() => !!window.TZ.calc), 'Desmos opens in Math');
  await page.click('#calc-x');
  // M1 answers: MCQ right on odd numbers; SPR typed below
  const spr = { 5: '3/4', 6: '12', 12: '-5', 13: '.6667', 19: '7/2', 20: '15' }; // keys: 3/4 · 12 · -5 · 2/3 · 3.5 · 15
  for (let i = 1; i <= 22; i++) {
    const qq = Q('M1', i);
    if (qq.type === 'spr') {
      check(await on(q('.spr-dir-pane')) && /Student-produced response directions/.test(await page.textContent(q('.spr-dir-pane'))), `M1 ${i} SPR: directions in the left pane`);
      if (i === 5) {
        await page.fill(q('.spr-in'), '0.7500'); check(await page.inputValue(q('.spr-in')) === '0.750', 'box holds 5 characters: 0.7500 → 0.750');
        await page.fill(q('.spr-in'), '-1.2/3'); check(await page.inputValue(q('.spr-in')) === '-1.23', 'only digits, one . or /, minus first: -1.2/3 → -1.23');
        await page.fill(q('.spr-in'), '5-x%'); check(await page.inputValue(q('.spr-in')) === '5', 'letters / symbols / inner minus dropped: 5-x% → 5');
        await page.fill(q('.spr-in'), '-12345'); check(await page.inputValue(q('.spr-in')) === '-12345', 'negative answer may use 6 characters');
      }
      await page.fill(q('.spr-in'), spr[i]); await sleep(1100);
      if (i === 5) { await H.waitMath(page); check(await page.$eval(q('.spr-out'), e => !!e.querySelector('mjx-container')), 'Answer Preview renders 3/4 as a fraction'); await shot(page, 'sat98_07_spr'); }
    } else if (i % 2) await page.click(q(`.ch-row[data-l="${qq.key}"] .ch`));
    else if (i === 7) { check(await page.$$eval(q('.q-fig img'), a => a.length && a[0].naturalWidth > 0), 'Math figure shown'); }
    await page.click('#btn-next');
  }
  await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue');

  console.log('[M2 starts at once → submit]');
  await page.waitForSelector('#v-question.on .q.on'); await sleep(300);
  st = await page.evaluate(() => window.TZ.st);
  check(st.current_part === 'M2' && st.phase === 'test' && (await page.textContent('#tb-title')).trim() === 'Section 2, Module 2: Math', 'M2 opens right after M1');
  for (let i = 1; i <= 22; i++) { const qq = Q('M2', i); if (qq.type !== 'spr' && i <= 10) await page.click(q(`.ch-row[data-l="${qq.key}"] .ch`)); await page.click('#btn-next'); }
  await page.waitForSelector('#v-review.on'); await page.click('#btn-next');
  check(/Submit your test\?/.test(await page.textContent('#modal-root')), 'last module → Submit your test?');
  await page.click('#modal-root .btns .btn-blue');
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 20000 });
  // expected: RW1 10 right (odd 1..19) + RW2 15 = 25 · M1: MCQ odd non-SPR + 6 SPR right · M2: MCQ 1..10 non-SPR
  const mcqOddM1 = qs.filter(x => x.part === 'M1' && x.type !== 'spr' && x.display_no % 2).length;
  const m2 = qs.filter(x => x.part === 'M2' && x.type !== 'spr' && x.display_no <= 10).length;
  const want = 25 + mcqOddM1 + 6 + m2;
  const tot = await H.satTotal(page);
  check(tot === want + ' / 98' && !/questions correct/.test(await page.textContent('#result-body')), 'result total ' + tot + ' (expected ' + want + ' / 98; all 6 typed SPR answers graded right)');
  const secs = await page.$$eval('.sec-card', a => a.map(x => x.textContent).join(' | '));
  check(/Reading and Writing[^|]*25\/54 correct/.test(secs) && new RegExp('Math[^|]*' + (mcqOddM1 + 6 + m2) + '/44 correct').test(secs) && /Module 1: \d+\/27/.test(secs), 'result: section cards RW x/54, Math y/44 + module scores (' + secs.slice(0, 160) + ')');
  await shot(page, 'sat98_08_result');
  S = G.table('Sessions').find(r => r.student_code === 'T03');
  check(S.status === 'completed' && S.score_RW === 25 && S.score_Math === mcqOddM1 + 6 + m2 && S.total_questions === 98 && S.time_used_RW_min > 0 && S.time_used_Math_min > 0 && S.score_A === '',
    `Sessions: score_RW ${S.score_RW}, score_Math ${S.score_Math}, time_used_RW/Math ${S.time_used_RW_min}/${S.time_used_Math_min}, score_A empty`);
  check(S.n_sittings === 2, 'Sessions.n_sittings = 2 (saved at the break)');
  const R = G.table('Responses').filter(r => r.session_id === S.session_id);
  check(R.length === 98 && R.filter(r => r.part === 'M1' && String(r.final_answer) && Q('M1', r.display_no).type === 'spr').every(r => r.correct === 1), 'Responses: 98 rows; typed SPR answers correct');
  check(R.find(r => r.qid === Q('RW1', 1).qid).unit === 'CAS' && R.find(r => r.qid === Q('RW1', 1).qid).topic === 'CAS.WIC', 'Responses carry domain (unit) + skill (topic)');
  const PL = G.table('Part_Log').filter(r => r.session_id === S.session_id);
  check(PL.map(r => r.part + ':' + r.sitting_no).join() === 'RW1:1,RW2:1,M1:2,M2:2', 'Part_Log: RW1, RW2 sitting 1 · M1, M2 sitting 2 (' + PL.map(r => r.part + ':' + r.sitting_no).join() + ')');
  const SR = G.table('Student_Report').find(r => r.session_id === S.session_id);
  check(/^RW 25\/54 · Math \d+\/44 · total \d+\/98\. /.test(SR.summary) && /^2 sittings: RW1 /.test(SR.sittings), 'Student_Report: score line first, sittings per module');
  H.englishOnly(E);
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
