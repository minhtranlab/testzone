// Test Zone — end-to-end harness (local only, not shipped)
const H = require('./h');
const { check, sleep, shot } = H;
const FORM = process.env.FORM || 'MOCK-APCAB';
const CARD = process.env.CARD || 'Mock form';

async function startTest(page, E, code) {
  await H.login(page, E.url, code);
  await page.waitForSelector('#scr-home.on .form-card');
  await page.click(`.form-card:has-text("${CARD}") .actions .btn-blue`);
  await page.waitForSelector('#btn-begin');
  await H.waitMath(page);
}
async function begin(page) { await page.click('#btn-begin'); await page.waitForSelector('#v-question.on .q.on'); await sleep(300); }
async function pick(page, L) { await page.click(`#qwrap .q.on .ch-row[data-l="${L}"] .ch`); }
async function next(page) { await page.click('#btn-next'); await sleep(150); }
async function confirm(page) { await page.click('#modal-root .btns .btn-blue'); }
async function toReviewAndEnd(page) {
  await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on');
  await page.click('#btn-next'); await page.waitForSelector('#modal-root.on'); await confirm(page);
}
const st = page => page.evaluate(() => JSON.parse(JSON.stringify(window.TZ.st)));
const timerSec = async page => { const t = await page.textContent('#timer .digits'); const [m, s] = t.split(':').map(Number); return m * 60 + s; };
const sessionsOf = (E, code) => E.st.gas.table('Sessions').filter(r => r.student_code === code);
const respOf = (E, sid) => E.st.gas.table('Responses').filter(r => r.session_id === sid);
const eventsOf = (E, sid) => E.st.gas.table('Events').filter(r => r.session_id === sid);

(async () => {
  const E = await H.setup();
  const G = E.st.gas;
  G.admin('addMissingColumns');
  G.admin('importQuestions');
  const qs = G.ctx.formData_(FORM).questions;
  const keyOf = (part, no) => qs.find(q => q.part === part && q.display_no === no).key;
  const nA = qs.filter(q => q.part === 'A').length, nB = qs.filter(q => q.part === 'B').length;
  console.log(`Form ${FORM}: A=${nA}, B=${nB}`);

  // ------------------------------------------------------------------ 0. login rules
  console.log('\n[0] login + track filter');
  {
    const { page } = await E.newPage();
    await H.login(page, E.url, 'T02');
    await page.waitForFunction(() => document.querySelector('#login-err').textContent.length > 5);
    check(/locked/.test(await page.textContent('#login-err')), 'inactive student T02 cannot sign in'); await H.grab(page, 'login_locked');
    await page.fill('#login-code', 'NOPE'); await page.click('#login-btn');
    await page.waitForFunction(() => /Code not found/.test(document.querySelector('#login-err').textContent)); await H.grab(page, 'login_notfound');
    check(true, 'unknown code rejected');
    await H.login(page, E.url, 'T03');
    await page.waitForSelector('#scr-home.on #home-list .empty');
    check(true, 'SAT-track student sees no AP forms');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 1. full run (desktop) + tools + screenshots
  console.log('\n[1] full run T01 (desktop)');
  const { page } = await E.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await startTest(page, E, 'T01');
  await shot(page, 'desktop_02_directions');
  await begin(page);
  check(await page.isVisible('#tool-calc') === false, 'no Calculator button in Part A');
  // Q1 right answer
  await pick(page, keyOf('A', 1));
  await shot(page, 'desktop_03_question_selected');
  await next(page);
  // Q2: wrong first then right (W→R), mark for review
  const wrong2 = ['A', 'B', 'C', 'D', 'E'].find(l => l !== keyOf('A', 2));
  await pick(page, wrong2); await sleep(200); await pick(page, keyOf('A', 2));
  await page.click('#qwrap .q.on .q-mark');
  // annotate: select first words of the stem and click Annotate
  await page.evaluate(() => {
    const stem = document.querySelector('#qwrap .q.on .stem');
    const w = document.createTreeWalker(stem, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.data.trim().length < 8) {}
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(12, n.data.length));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.click('#tool-annot');
  await sleep(200);
  check(await page.$$eval('#qwrap .q.on span.hl', x => x.length) > 0, 'Annotate highlights the selected stem text');
  check(await page.isVisible('#hl-toolbar.on'), 'highlight toolbar opens');
  await page.click('#hl-toolbar [data-c="p"]');
  check(await page.$$eval('#qwrap .q.on span.hl-p', x => x.length) > 0, 'highlight colour changes to pink');
  await shot(page, 'desktop_04_annotate');
  if (await page.isVisible('#hl-close')) await page.click('#hl-close'); // v1.13: a colour click already closes the toolbar
  await next(page);
  // Q3: eliminator on, eliminate key + one more, pick a wrong answer
  await page.click('#qwrap .q.on .q-elim');
  const k3 = keyOf('A', 3);
  const others3 = ['A', 'B', 'C', 'D', 'E'].filter(l => l !== k3);
  await page.click(`#qwrap .q.on .ch-row[data-l="${k3}"] .strike`);
  await page.click(`#qwrap .q.on .ch-row[data-l="${others3[0]}"] .strike`);
  await pick(page, others3[1]);
  // select-after-eliminate: eliminate then undo
  await page.click(`#qwrap .q.on .ch-row[data-l="${others3[2]}"] .strike`);
  await page.click(`#qwrap .q.on .ch-row[data-l="${others3[2]}"] .undo`);
  const s3 = await st(page);
  const q3id = qs.find(q => q.part === 'A' && q.display_no === 3).qid;
  check(JSON.stringify(s3.parts.A.elim[q3id].sort()) === JSON.stringify([k3, others3[0]].sort()), 'eliminated set = key + one other (undo worked)');
  await shot(page, 'desktop_05_eliminator');
  // navigator popover
  await page.click('#btn-nav'); await sleep(150);
  const cells = await page.$$eval('#nav-grid .gcell', a => a.map(c => c.className));
  check(cells.length === nA && cells[0].includes('ans') && cells[1].includes('mk') && cells[2].includes('cur'), 'navigator shows answered / marked / current');
  await shot(page, 'desktop_06_navigator');
  await page.click('#nav-review'); await page.waitForSelector('#v-review.on');
  await shot(page, 'desktop_07_review');
  // jump back from review to Q1 and back to review via Next…
  await page.click('#rev-grid .gcell[data-i="0"]');
  check((await st(page)).parts.A.cur === 0 && await page.isVisible('#v-question.on'), 'review page → click number → back to question');
  // Directions dropdown + More menu + zoom
  await page.click('#btn-dir'); await sleep(150); await shot(page, 'desktop_08_directions_popover'); await page.click('#dir-close');
  await page.click('#tool-more'); await sleep(100); await shot(page, 'desktop_09_more_menu');
  await page.click('#more-menu [data-act="zin"]');
  check((await st(page)).zoom === 1.1, 'zoom in → 110%');
  await page.click('#tool-more'); await page.click('#more-menu [data-act="zreset"]');
  // hide timer
  await page.click('#btn-hide'); check(await page.$eval('#timer', t => t.classList.contains('concealed')), 'timer can be hidden'); await page.click('#btn-hide');
  // end Part A
  await toReviewAndEnd(page);
  await page.waitForSelector('#v-transition.on');
  check((await st(page)).ended.A === 'submit', 'Part A ended (submit)');
  await shot(page, 'desktop_10_transition');
  await page.click('#btn-cont'); await page.waitForSelector('#btn-begin');
  await begin(page);
  check(await page.isVisible('#tool-calc'), 'Calculator button shown in Part B');
  // Part A locked
  await page.click('#btn-nav'); await sleep(100);
  check(await page.$$eval('#nav-grid .gcell', a => a.length) === nB, 'navigator in Part B only lists Part B questions');
  await page.click('#nav-x');
  check(await page.isDisabled('#btn-back'), 'Back disabled on first question of Part B (no way back to A)');
  // calculator
  await page.click('#tool-calc');
  await page.waitForFunction(() => window.TZ.calc, null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  check(await page.evaluate(() => !!window.TZ.calc), 'Desmos graphing calculator created');
  // drag panel
  const hb = await page.$('#calc-head .ttl'); const b0 = await hb.boundingBox();
  await page.mouse.move(b0.x + 10, b0.y + 5); await page.mouse.down(); await page.mouse.move(b0.x + 310, b0.y + 45, { steps: 5 }); await page.mouse.up();
  const b1 = await (await page.$('#calc-panel')).boundingBox();
  check(Math.abs(b1.x - (b0.x - 14 + 300)) < 40, 'calculator panel is draggable');
  await page.click('#calc-s'); await sleep(800);
  check(await page.evaluate(() => !!window.TZ.calcSci), 'Scientific toggle works');
  await page.click('#calc-g'); await sleep(300);
  await shot(page, 'desktop_11_calculator');
  await page.click('#calc-x');
  for (let i = 1; i <= nB; i++) { await pick(page, keyOf('B', i)); if (i < nB) await next(page); }
  await next(page); await page.waitForSelector('#v-review.on');
  await page.click('#btn-next'); await page.waitForSelector('#modal-root.on');
  check(/Submit/.test(await page.textContent('#modal-root')), 'last part confirm says Submit');
  await confirm(page);
  await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
  const expect1 = 2 + nB; // A1, A2 right, A3 wrong, rest of A blank, all B right
  check((await page.textContent('.score-total')).trim() === `${expect1} / ${nA + nB}`, `result shows ${expect1} / ${nA + nB}`);
  check(await page.$$eval('.rgrid .rcell.wrong', a => a.length) === 1, 'result grid marks 1 wrong');
  check(!/[A-E] is correct|Correct answer:/.test(await page.textContent('#result-body')), 'result shows no key / correct answers');
  await shot(page, 'desktop_12_result');
  // sheet checks
  const s1 = sessionsOf(E, 'T01')[0];
  check(s1.status === 'completed' && s1.total_correct === expect1 && s1.score_A === 2 && s1.score_B === nB, 'Sessions row: status, scores');
  check(s1.n_flagged === 1 && s1.n_blank === nA - 3 && /Mac|Linux|Windows/.test(s1.device), 'Sessions: n_flagged=1, n_blank, device');
  const r1 = respOf(E, s1.session_id);
  check(r1.length === nA + nB, 'Responses: one row per question');
  const q2 = r1.find(r => r.part === 'A' && r.display_no === 2), q3 = r1.find(r => r.part === 'A' && r.display_no === 3);
  check(q2.change_pattern === 'W→R' && q2.n_changes === 1 && q2.first_answer === wrong2 && /CHANGED_W_TO_R/.test(q2.flags), 'Q2: W→R, first answer, 1 change, flag');
  check(q2.ever_marked === true && q2.final_marked === true, 'Q2: marked flags');
  check(q3.correct === 0 && /ELIM_KEY/.test(q3.flags) && q3.eliminated === [k3, others3[0]].sort().join(','), 'Q3: wrong, ELIM_KEY, eliminated list');
  const qa1 = r1.find(r => r.part === 'A' && r.display_no === 1);
  check(qa1.visits === 2 && qa1.order_first_seen === 1 && qa1.time_total_sec > 0, 'Q1: 2 visits (returned from review), order 1, time > 0');
  const rb1 = r1.find(r => r.part === 'B' && r.display_no === 1);
  check(rb1.calc_used === true, 'B1: calc_used true');
  check(r1.every(r => typeof r.topic === 'string' && r.topic.length), 'Responses: topic kept as text');
  const ev1 = eventsOf(E, s1.session_id);
  const types = new Set(ev1.map(e => e.type));
  ['part_start', 'q_enter', 'q_leave', 'select', 'change', 'eliminate', 'uneliminate', 'mark', 'calc_open', 'calc_close', 'annotate', 'timer_hide', 'timer_show', 'nav_open', 'review_open', 'part_end', 'autosave']
    .forEach(t => check(types.has(t), 'Events contain ' + t));
  check(ev1.filter(e => e.type === 'part_end').every(e => e.value === 'submit'), 'part_end reason = submit');
  check(G.table('Topic_Summary').some(r => r.student_code === 'T01' && r.form_id === 'ALL') && G.table('Topic_Summary').some(r => r.student_code === 'T01' && r.form_id === FORM), 'Topic_Summary rebuilt (per form + ALL)');
  const rep1 = G.table('Student_Report').find(r => r.session_id === s1.session_id);
  check(rep1 && /is solid in|Most points lost|No wrong answers/.test(rep1.summary) && /^Unit \d/.test(rep1.weakest_topics) && rep1.reliable === 'Yes' && /^1 sitting: Part A/.test(rep1.sittings) && !('report_link' in rep1), 'Student_Report: readable summary, weakest units, reliable, sittings (no report_link)');
  console.log('    summary:', JSON.stringify(rep1 && rep1.summary));
  console.log('    timing_pattern:', rep1 && rep1.timing_pattern);
  // My Tests shows past attempt
  await page.click('#res-home'); await page.waitForSelector('.form-card .fc-view');
  check(/^1 done · last \d+\/\d+$/.test(await page.textContent('.form-card:has-text("' + CARD + '") .fc-s')) && /Take again/.test(await page.textContent('.form-card:has-text("' + CARD + '")')), 'My Tests tile "1 done · last x/y" + Take again');
  await shot(page, 'desktop_13_mytests_after');
  // view past result
  await page.click('.form-card:has-text("' + CARD + '") .fc-view'); await page.waitForSelector('.score-total');
  check((await page.textContent('.score-total')).trim() === `${expect1} / ${nA + nB}`, 'View result of past attempt');
  await page.context().close();

  // ------------------------------------------------------------------ 2. refresh-resume + server clock + server-only resume
  console.log('\n[2] refresh / resume (T04)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T04');
    await begin(page);
    await pick(page, keyOf('A', 1)); await next(page); await page.click('#qwrap .q.on .q-mark');
    await sleep(2500);
    const t0 = await timerSec(page);
    await page.reload();
    await page.waitForSelector('#v-question.on .q.on', { timeout: 15000 }); await sleep(400);
    const s = await st(page);
    const q1 = qs.find(q => q.part === 'A' && q.display_no === 1).qid, q2id = qs.find(q => q.part === 'A' && q.display_no === 2).qid;
    check(s.parts.A.cur === 1 && s.parts.A.ans[q1] === keyOf('A', 1) && s.parts.A.mark[q2id], 'reload → same question, answers + mark kept');
    const t1 = await timerSec(page);
    check(Math.abs(t0 - t1) <= 4, `timer continues after reload (${t0}s → ${t1}s)`);
    // server clock wins: shift server +120 s
    await page.evaluate(() => window.TZ.api.autosave());
    await sleep(500);
    G.shift(120000);
    await page.reload(); await page.waitForSelector('#v-question.on .q.on'); await sleep(400);
    const t2 = await timerSec(page);
    check(t1 - t2 >= 115 && t1 - t2 <= 126, `server clock decides remaining time (+120 s server → ${t1}s → ${t2}s)`);
    // server-only resume (device storage wiped)
    await page.evaluate(() => window.TZ.api.autosave()); await sleep(500);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#scr-login.on'); await page.fill('#login-code', 'T04'); await page.click('#login-btn');
    await page.waitForSelector('.form-card .btn-blue:has-text("Continue")');
    await shot(page, 'desktop_14_mytests_resume');
    await page.click('.form-card .btn-blue:has-text("Continue")');
    await page.waitForSelector('#v-question.on .q.on'); await sleep(300);
    const s2 = await st(page);
    check(s2.parts.A.ans[q1] === keyOf('A', 1) && s2.parts.A.cur === 1, 'resume from server state only (localStorage wiped)');
    const t3 = await timerSec(page);
    check(Math.abs(t3 - t2) <= 6, `timer still from server clock (${t2}s → ${t3}s)`);
    // eventually finish → time totals sane (no huge gap counted)
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await begin(page);
    await toReviewAndEnd(page); await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    const sess = sessionsOf(E, 'T04')[0];
    const rr = respOf(E, sess.session_id);
    check(rr.every(r => r.time_total_sec < 60), 'time per question excludes reload gaps');
    check(eventsOf(E, sess.session_id).filter(e => e.type === 'resume').length >= 2, 'resume events logged');
    G.resetShift();
    await page.context().close();
  }

  // ------------------------------------------------------------------ 3. timeout auto-end + 5-minute warning
  console.log('\n[3] timeout (T05)');
  {
    const forms = G.sheets.Forms.rows, set = G.sheets.Settings.rows;
    const fA = forms.find(r => r[0] === FORM && r[2] === 'A'), fB = forms.find(r => r[0] === FORM && r[2] === 'B');
    const oldA = fA[5], oldB = fB[5]; fA[5] = 0.25; fB[5] = 0.2;
    const w = set.find(r => r[0] === 'five_min_warning_sec'); const oldW = w[1]; w[1] = 8;
    const { page } = await E.newPage();
    await startTest(page, E, 'T05');
    await begin(page);
    await pick(page, keyOf('A', 1)); await next(page);
    await page.click('#btn-hide');
    await page.waitForSelector('#warn-banner.on', { timeout: 15000 });
    check(await page.$eval('#timer', t => t.classList.contains('red') && !t.classList.contains('concealed')), '5-min warning: banner, timer red and forced visible');
    await shot(page, 'desktop_15_warning');
    await page.waitForSelector('#v-transition.on', { timeout: 20000 });
    check((await st(page)).ended.A === 'timeout', 'Part A auto-ended at 0:00');
    await page.click('#btn-cont'); await begin(page);
    await page.waitForSelector('#scr-result.on .score-total', { timeout: 25000 });
    const sess = sessionsOf(E, 'T05')[0];
    check(sess.status === 'timeout' && sess.total_correct === 1, 'auto-submit at end of Part B; status timeout; answer kept');
    const pe = eventsOf(E, sess.session_id).filter(e => e.type === 'part_end');
    check(pe.length === 2 && pe.every(e => e.value === 'timeout'), 'part_end reason = timeout (×2)');
    check(eventsOf(E, sess.session_id).some(e => e.type === 'warning_5min'), 'warning_5min event logged');
    check(Math.abs(sess.time_used_A_min - 0.25) <= 0.05, 'time_used_A_min = full limit');
    fA[5] = oldA; fB[5] = oldB; w[1] = oldW;
    await page.context().close();
  }

  // ------------------------------------------------------------------ 4. all blank
  console.log('\n[4] all blank (T06)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T06'); await begin(page);
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await begin(page);
    await toReviewAndEnd(page); await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    check((await page.textContent('.score-total')).trim() === `0 / ${nA + nB}` && await page.$$eval('.rgrid .rcell.blank', a => a.length) === nA + nB, 'result 0 / N, all blank');
    const sess = sessionsOf(E, 'T06')[0];
    const rr = respOf(E, sess.session_id);
    check(rr.every(r => r.profile === 'BLANK' && r.correct === ''), 'Responses all BLANK, correct empty');
    check(sess.n_blank === nA + nB, 'Sessions n_blank = N');
    const rep = G.table('Student_Report').find(r => r.session_id === sess.session_id);
    check(/^Blank/.test(rep.main_error_profile), 'Student_Report main_error_profile = Blank');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 5. all correct
  console.log('\n[5] all correct (T07)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T07'); await begin(page);
    for (let i = 1; i <= nA; i++) { await pick(page, keyOf('A', i)); if (i < nA) await next(page); }
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await begin(page);
    for (let i = 1; i <= nB; i++) { await pick(page, keyOf('B', i)); if (i < nB) await next(page); }
    await toReviewAndEnd(page); await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    check((await page.textContent('.score-total')).trim() === `${nA + nB} / ${nA + nB}`, 'result N / N');
    const sess = sessionsOf(E, 'T07')[0];
    check(respOf(E, sess.session_id).every(r => r.correct === 1 && /RIGHT/.test(r.profile)), 'Responses all correct');
    const ts = G.table('Topic_Summary').filter(r => r.student_code === 'T07');
    check(ts.length > 0 && ts.every(r => /^(OK|Too few to judge|Slow)/.test(r.verdict)), 'Topic_Summary verdicts OK / Too few to judge');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 6. Part A locked server-side (tamper)
  console.log('\n[6] Part A frozen on server (T08)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T08'); await begin(page);
    const wrongA = i => ['A', 'B', 'C', 'D', 'E'].find(l => l !== keyOf('A', i));
    for (let i = 1; i <= nA; i++) { await pick(page, wrongA(i)); if (i < nA) await next(page); }
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont');
    await sleep(800); // autosave after part end
    await page.click('#btn-cont'); await begin(page);
    await page.evaluate(keys => { const s = window.TZ.st; Object.keys(keys).forEach(q => { s.parts.A.ans[q] = keys[q]; }); window.TZ.api.persist(); },
      Object.fromEntries(qs.filter(q => q.part === 'A').map(q => [q.qid, q.key])));
    await toReviewAndEnd(page); await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    const sess = sessionsOf(E, 'T08')[0];
    check(sess.score_A === 0, 'changing Part A answers after leaving it has no effect (score_A stays 0)');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 7. offline submit is never lost
  console.log('\n[7] offline submit (T09)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T09'); await begin(page);
    await pick(page, keyOf('A', 1));
    E.st.offline = true;
    await next(page); await pick(page, keyOf('A', 2));
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await begin(page);
    await toReviewAndEnd(page);
    await page.waitForFunction(() => /safe on this device/.test(document.body.textContent), null, { timeout: 15000 });
    check(true, 'offline submit → "answers safe on this device", retrying');
    await shot(page, 'desktop_16_offline_submit');
    await page.reload(); await sleep(1500);
    check(await page.isVisible('#scr-login.on'), 'reload while offline → sign-in screen (server unreachable)');
    E.st.offline = false;
    await page.reload();
    await page.waitForSelector('#scr-result.on .score-total', { timeout: 20000 });
    const sess = sessionsOf(E, 'T09')[0];
    check(sess.status === 'completed' && sess.total_correct === 2, 'pending submit sent after coming back online (2 correct kept)');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 8. retake + summaries
  console.log('\n[8] retake (T01 attempt 2)');
  {
    const { page } = await E.newPage();
    await startTest(page, E, 'T01'); await begin(page);
    await toReviewAndEnd(page); await page.waitForSelector('#btn-cont'); await page.click('#btn-cont'); await begin(page);
    await toReviewAndEnd(page); await page.waitForSelector('#scr-result.on');
    const ss = sessionsOf(E, 'T01');
    check(ss.length === 2 && ss[1].attempt_no === 2, 'second attempt → attempt_no 2');
    const ts = G.table('Topic_Summary').filter(r => r.student_code === 'T01');
    const all = ts.filter(r => r.form_id === 'ALL'), per = ts.filter(r => r.form_id === FORM);
    const sumN = rows => rows.filter(r => !/^Unit/.test(String(r.topic))).reduce((a, r) => a + r.n_attempted, 0);
    check(sumN(all) === 2 * (nA + nB) && sumN(per) === nA + nB, 'Topic_Summary: per-form = latest attempt, ALL = every attempt');
    check(G.table('Student_Report').filter(r => r.student_code === 'T01').length === 2, 'Student_Report: one row per attempt');
    check(G.table('Topic_Summary').some(r => r.student_code === 'T04'), 'other students\' summary rows kept');
    await page.context().close();
  }

  // ------------------------------------------------------------------ 9. key never sent to the browser
  console.log('\n[9] key leak check');
  {
    const toClient = E.st.rpcLog.map(r => r.res).join('\n');
    check(!/"key"\s*:/.test(toClient), 'no "key" field in any server→browser payload (' + E.st.rpcLog.length + ' responses)');
    check(!/"tags"\s*:|"topic"\s*:|"orig_no"/.test(toClient), 'no tags / orig_no in payloads');
    const gt = E.st.rpcLog.filter(r => r.fn === 'getTest').map(r => JSON.parse(r.res).result);
    check(gt.every(g => g.questions.every(q => Object.keys(q).sort().join() === 'choices,display_no,figures,part,passage_html,qid,stem_html,type')), 'getTest question objects are whitelisted fields only');
  }

  // ------------------------------------------------------------------ 10. checkSheet after everything
  console.log('\n[10] checkSheet');
  const cs = G.admin('checkSheet');
  check(/All good/.test(cs), 'checkSheet → All good');
  G.admin('syncSheetTexts');
  const dict = G.table('Dictionary');
  check(dict.length > 100 && dict.some(r => r.tab === 'Sessions' && r.column === 'score_RW / score_Math' && /Reading and Writing/.test(r.meaning)) && dict.some(r => r.tab === 'Forms' && r.column === 'data_file_id'), 'Dictionary written in English from SheetText.gs (incl. new columns)');
  check(!G.table('Interpretation').some(r => /[ạảãầấậẩẫăằắặẳẵẹẻẽềếệểễịỉĩọỏõồốộổỗơờớợởỡụủũưừứựửữỳỵỷỹđ]/i.test(JSON.stringify(r))), 'Interpretation in English (no Vietnamese letters; README is Vietnamese since v1.11)');

  H.englishOnly(E);
  const fails = H.summary();
  await E.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
