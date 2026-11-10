// SAT round 2 (#3): new student result page (all exams), read-only question review (never the key),
// teacher mode (teacher_code → students → result → question → "Show answer" only on request). AP mock form, 4 questions.
const H = require('./h'); const { check, sleep, shot } = H;
const FORM = 'MOCK-APCAB', CARD = 'Mock form', TCODE = 'TEACH-9X2Q';

(async () => {
  const E = await H.setup(); const G = E.st.gas;
  G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Settings.rows.push(['teacher_code', TCODE, '']);
  const qs = G.ctx.formData_(FORM).questions, key = (p, n) => qs.find(q => q.part === p && q.display_no === n).key;
  const other = k => ['A', 'B', 'C', 'D', 'E'].find(l => l !== k);
  const { page } = await E.newPage();
  const pick = L => page.click(`#qwrap .q.on .ch-row[data-l="${L}"] .ch`);
  const endPart = async () => { await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); };

  console.log('[student: take the mock test]');
  await H.login(page, E.url, 'T01'); await page.waitForSelector('.form-card');
  check(/^\d+ (h|min)/.test((await page.textContent(`.form-card:has-text("${CARD}") .fc-time`)).trim()) && !/Part A:|questions ·/.test(await page.textContent(`.form-card:has-text("${CARD}")`)), 'AP card: total time top right, no part lines');
  await page.click(`.form-card:has-text("${CARD}") .actions .btn-blue`); await page.waitForSelector('#btn-begin'); await H.waitMath(page);
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  await pick(key('A', 1)); await sleep(1200); await page.click('#btn-next');          // A1 right
  await pick(other(key('A', 2))); await sleep(1200); await page.click('#btn-next');   // A2 wrong
  await endPart();                                                                     // A3 blank
  await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await page.waitForSelector('#btn-begin'); await page.click('#btn-begin');
  await page.waitForSelector('#qwrap .q.on'); await pick(key('B', 1)); await sleep(800);   // B1 right
  await endPart();

  console.log('[result page]');
  await page.waitForSelector('#scr-result.on .score-total', { timeout: 20000 });
  const body = await page.textContent('#result-body');
  check((await page.textContent('.score-total')).trim() === '2 / 4', 'score 2 / 4');
  check(/Your Results/.test(body) && /Attempt 1/.test(body), 'header: Your Results · Attempt 1');
  check(/What to practise first/.test(body) && /Results by unit/.test(body) && /Types of mistakes/.test(body) && /Review your questions/.test(body), 'sections: practise first, by unit, types of mistakes, review list');
  check(/Rushed and wrong/.test(body) && /Didn't know \(slow and wrong\)/.test(body) && /Slow but right/.test(body) && /Blank/.test(body), 'error types in plain English');
  check(!(await page.$('.est')), 'AP: no estimated SAT score');
  check(!/correct answer is|Correct answer:/i.test(body), 'no correct answers on the result page');
  check(await page.$$eval('#result-body .rgrid .rcell.wrong', a => a.length) === 1 && await page.$$eval('#result-body .rgrid .rcell.blank', a => a.length) === 1, 'review list: 1 wrong, 1 blank');
  const practise = await page.$$eval('.res-list li', a => a.map(x => x.textContent));
  check(practise.length >= 1 && practise.length <= 4 && !practise.some(t => /\bQ\d|A-\d\d/.test(t)), 'what to practise first: 1–4 short tips, no question list (' + practise.join(' | ') + ')');
  check((await page.$$eval('.skill .qchip.wrong', a => a.map(x => x.firstChild.textContent))).includes('A-02') && await page.$$eval('.skill .qchip.blank', a => a.length) >= 1, 'skills: missed questions as chips (A-02 red, blank grey)');
  await shot(page, 'r2_result');
  {
    const L = await H.badgeLayout(page), dy = [...new Set(L.dy)], bh = [...new Set(L.badgeH)];
    console.log('   #27 cells ' + L.cells + ', R ' + L.R + ', S ' + L.S + ', symbol centres ' + dy.join('/') + ' px, badge heights ' + bh.join('/') + ' · types: ' + L.types.join(', '));
    check(L.cells === 4 && L.size && L.sym && L.R >= 1, '#27 grid: 40×46 cells; centre = ✓ / ✗ / R / S badge / nothing (blank)');
    check(dy.length === 1 && bh.every(h => Math.abs(h - 16.2) < 0.15), '#27 every badge at the same height as the ✓ / ✗ marks (' + dy[0] + ' px), badge 12.6 × 16.2');
    check(L.types.join() === "Rushed and wrong=rushed,Didn't know (slow and wrong)=slow,Wrong=✗,Slow but right=slow,Blank=·", '#27 types of mistakes: icon = cell with the tag inside');
    check(L.chipsWithBadge === 0 && L.oldKey === 0 && L.keys === L.parts && L.parts >= 1, '#27 chips show only the code, no separate S/R line, a small key under each grid');
    await page.evaluate(() => document.querySelector('.res-types').scrollIntoView());
    await page.screenshot({ path: H.SHOTS + '/r27_types_3x.png', clip: await page.evaluate(() => { const r = document.querySelector('.res-types').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  }
  await page.setViewportSize({ width: 1100, height: 420 });
  await page.evaluate(() => { document.querySelector('#result-body .rgrid .rcell.wrong').scrollIntoView({ block: 'center' }); });
  const y0 = await page.evaluate(() => document.querySelector('#scr-result').scrollTop);

  console.log('[review (student) = the test screen, read-only]');
  await page.click('#result-body .rgrid .rcell.wrong'); await page.waitForSelector('#scr-test.on.viewing #qwrap .q.on'); await sleep(400);
  const info = await page.textContent('#view-bar');
  check(new RegExp('Your answer: ' + other(key('A', 2))).test(info) && /✗ Incorrect/.test(info) && /Time: /.test(info) && /A-02/.test(info), 'review: code A-02, own answer, ✗ Incorrect, time');
  check(!(await page.$('#rv-show')) && !/Correct answer/.test(await page.textContent('#scr-test')), 'student review: no "Show answer", no correct answer');
  check(await page.$$eval('#qwrap .q.on .ch.sel', a => a.length) === 1 && await page.$$eval('#qwrap .q.on .ch.rv-key', a => a.length) === 0, 'review: the chosen answer is marked, the key is not');
  check(!(await page.isVisible('#timer')) && await page.isVisible('#btn-view-back') && await page.isVisible('#tool-annot') && !(await page.isVisible('#qwrap .q.on .q-elim')), 'test screen: no timer, Back to result, Highlight kept, no eliminator (read-only)');
  const sel0 = await page.$eval('#qwrap .q.on .ch.sel', x => x.closest('.ch-row').getAttribute('data-l'));
  await page.click(`#qwrap .q.on .ch-row:not([data-l="${sel0}"]) .ch`); await sleep(200);
  check(await page.$eval('#qwrap .q.on .ch.sel', x => x.closest('.ch-row').getAttribute('data-l')) === sel0, 'student cannot change the answer');
  const rv = E.st.rpcLog.filter(r => r.fn === 'getReview').map(r => r.res).join('');
  check(rv.length > 100 && !/"key"\s*:|key_source|"tags"/.test(rv), 'getReview payload: questions without key / tags');
  const saves = E.st.rpcLog.filter(r => r.fn === 'autosave' || r.fn === 'submit').length;
  await shot(page, 'r2_review_student');
  await page.click('#btn-next'); await sleep(300);
  check(/– Not answered/.test(await page.textContent('#view-bar')) && /Your answer: —/.test(await page.textContent('#view-bar')), 'next question: blank shown as not answered');
  await page.click('#btn-back'); await page.click('#btn-back'); await sleep(300);
  check(/✓ Correct/.test(await page.textContent('#view-bar')), 'back to question 1: ✓ Correct');
  check(E.st.rpcLog.filter(r => r.fn === 'autosave' || r.fn === 'submit').length === saves && !(await page.evaluate(() => Object.keys(localStorage).some(k => /^tz_s_view/.test(k)))), 'viewing saves nothing (no autosave, nothing on the device)');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  check(Math.abs(await page.evaluate(() => document.querySelector('#scr-result').scrollTop) - y0) < 2, 'Back to result: same result screen, same scroll position (' + y0 + ' → ' + await page.evaluate(() => document.querySelector('#scr-result').scrollTop + '/' + window.scrollY + ' h=' + document.querySelector('#scr-result').scrollHeight + ' ch=' + document.querySelector('#scr-result').clientHeight) + ')');
  await page.setViewportSize({ width: 1280, height: 860 });
  let err = ''; try { G.call('teacherAnswer', ['T01', G.table('Sessions')[0].session_id, qs[0].qid]); } catch (e) { err = e.message; }
  check(/Teacher code not valid/.test(err), 'a student code cannot call teacherAnswer');

  console.log('[teacher mode]');
  const sid = G.table('Sessions').find(r => r.student_code === 'T01').session_id;
  const { page: tp } = await E.newPage();
  await H.login(tp, E.url, TCODE.toLowerCase()); await tp.waitForSelector('#scr-teacher.on .t-card');
  check(/Test Student/.test(await tp.textContent('#t-list')) && /Mock form/.test(await tp.textContent('#t-list')), 'teacher: students with their attempts');
  check(!(await tp.evaluate(() => localStorage.getItem('tz_code'))), 'teacher code is not stored on the device');
  await shot(tp, 'r2_teacher_list');
  await tp.fill('#t-filter', 'nobody'); check(/No students match/.test(await tp.textContent('#t-list')), 'filter'); await tp.fill('#t-filter', '');
  await tp.click(`.t-open[data-sid="${sid}"]`); await tp.waitForSelector('#scr-result.on .score-total');
  check(/Test Student — Results/.test(await tp.textContent('#result-body')) && (await tp.textContent('.score-total')).trim() === '2 / 4', 'teacher sees the student\'s result page (same score)');
  { const L = await H.badgeLayout(tp); check(L.cells === 4 && L.size && L.sym && L.R >= 1 && new Set(L.dy).size === 1 && L.chipsWithBadge === 0 && L.keys === L.parts, '#27 teacher page: same cells + badges inside (R ' + L.R + ')'); }
  await tp.setViewportSize({ width: 1100, height: 420 });
  await tp.evaluate(() => { document.querySelector('#result-body .rgrid .rcell.wrong').scrollIntoView({ block: 'center' }); });
  const ty0 = await tp.evaluate(() => document.querySelector('#scr-result').scrollTop);
  await tp.click('#result-body .rgrid .rcell.wrong'); await tp.waitForSelector('#rv-show');
  check(/Student's answer/.test(await tp.textContent('#view-bar')) && !/Correct answer/.test(await tp.textContent('#view-bar')), 'teacher review: student\'s answer, key hidden');
  check(await tp.isVisible('#qwrap .q.on .q-elim') && await tp.isVisible('#tool-annot') && await tp.isVisible('#qwrap .q.on .q-mark') && !(await tp.isVisible('#timer')), 'teacher: the test screen with the tools (eliminator, annotate, mark), no timer');
  check(!E.st.rpcLog.some(r => r.fn === 'teacherAnswer'), 'no key requested before "Show answer"');
  await tp.click('#rv-show'); await tp.waitForSelector('#view-bar .rv-key');
  check(new RegExp('Correct answer: ' + key('A', 2)).test(await tp.textContent('#view-bar')) && await tp.$$eval('#qwrap .q.on .ch.rv-key', a => a.length) === 1, '"Show answer" → correct answer shown + marked');
  check(E.st.rpcLog.filter(r => r.fn === 'teacherAnswer').length === 1, 'one teacherAnswer call, only for that question');
  await tp.click('#qwrap .q.on .q-elim'); await tp.click('#qwrap .q.on .ch-row[data-l="A"] .strike'); await sleep(200);
  check(await tp.$$eval('#qwrap .q.on .ch-row.out', a => a.length) === 1, 'teacher can use the answer eliminator like in the test');
  await shot(tp, 'r2_teacher_show_answer');
  await tp.click('#btn-view-back'); await tp.waitForSelector('#scr-result.on');
  check(Math.abs(await tp.evaluate(() => document.querySelector('#scr-result').scrollTop) - ty0) < 2, 'teacher: Back to result keeps the scroll position (' + ty0 + ')');
  await tp.click('#res-home'); check(await tp.isVisible('#scr-teacher.on'), 'Back to students');
  const { page: bp } = await E.newPage();
  await H.login(bp, E.url, 'TEACH-0000'); await sleep(800);
  check(/Code not found/.test(await bp.textContent('#login-err')), 'wrong teacher code → normal "Code not found"');
  G.sheets.Settings.rows.forEach(r => { if (r[0] === 'teacher_code') r[1] = ''; });
  err = ''; try { G.call('teacherOverview', ['']); } catch (e) { err = e.message; }
  check(/Teacher code not valid/.test(err), 'teacher_code empty → teacher mode off');

  console.log('[unreliable attempt]');
  G.sheets.Settings.rows.forEach(r => { if (r[0] === 'valid_min_time_ratio') r[1] = 0.3; });
  const { page: up } = await E.newPage();
  await H.login(up, E.url, 'T04'); await up.waitForSelector('.form-card');
  await up.click(`.form-card:has-text("${CARD}") .actions .btn-blue`); await up.waitForSelector('#btn-begin'); await up.click('#btn-begin'); await up.waitForSelector('#qwrap .q.on');
  await up.click('#btn-nav'); await up.click('#nav-review'); await up.click('#btn-next'); await up.click('#modal-root .btns .btn-blue');
  await up.waitForSelector('#btn-cont'); await up.click('#btn-cont'); await up.click('#btn-begin'); await up.waitForSelector('#qwrap .q.on');
  await up.click('#btn-nav'); await up.click('#nav-review'); await up.click('#btn-next'); await up.click('#modal-root .btns .btn-blue');
  await up.waitForSelector('#scr-result.on .score-total', { timeout: 20000 });
  const ub = await up.textContent('#result-body');
  check(/This result can't be used to judge your level/.test(ub) && /only 0(\.\d)? of 10 minutes used/.test(ub) && /Take the test again in real test conditions/.test(ub), 'unreliable: says plainly it cannot be used, and why');
  check(!/Results by unit/.test(ub), 'unreliable: no skill table');
  await shot(up, 'r2_result_unreliable');

  H.englishOnly(E);
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
