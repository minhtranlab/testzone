// Section 5: save between parts, finish another day; Part_Log; paused + Start over.
const H = require('./h'); const { check, sleep } = H;
const FORM = process.env.AP_FORM || 'MOCK-AP45', CARD = process.env.AP_CARD || (FORM === 'MOCK-AP45' ? 'Mock Exam 45' : 'Practice Exam 2012'), DAY = 864e5;
(async () => {
  const E = await H.setup(); const G = E.st.gas;
  G.admin('addMissingColumns'); G.admin('importQuestions');
  const keyOf = (p, n) => G.ctx.formData_(FORM).questions.find(q => q.part === p && q.display_no === n).key;
  async function finishA(page) {
    await page.click('#qwrap .q.on .ch-row[data-l="' + keyOf('A', 1) + '"] .ch');
    await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on');
    await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); await page.waitForSelector('#v-transition.on'); await sleep(800);
  }
  async function start(page, code) {
    await H.login(page, E.url, code); await page.waitForSelector('.form-card');
    await page.click(`.form-card:has-text("${CARD}") .actions .btn-blue`); await page.waitForSelector('#btn-begin'); await H.waitMath(page);
    await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  }
  // ---- 1. pause after A, come back 2 days later
  console.log('[pause → +2 days → Part B]');
  {
    const { page } = await E.newPage();
    await start(page, 'T01'); await sleep(1500); await finishA(page);
    check(/^Start Part B Now$/.test((await page.textContent('#btn-cont')).trim()) && /^Save and Continue Later$/.test((await page.textContent('#btn-pause')).trim()), 'transition screen: "Start Part B Now" + "Save and Continue Later"');
    await H.shot(page, 'pause_1_transition');
    await page.click('#btn-pause'); await page.waitForSelector('#scr-home.on .form-card');
    await sleep(300); await H.grab(page, 'toast_saved');
    const s = G.table('Sessions').find(x => x.student_code === 'T01');
    check(s.status === 'paused', 'Sessions.status = paused');
    check(/Part A completed · \d\d [A-Z][a-z]{2}, \d\d:\d\d — Attempt 1 is waiting for Part B/.test(await page.textContent(`.form-card:has-text("${CARD}")`)) && /^Continue Part B$/.test((await page.textContent(`.form-card:has-text("${CARD}") .btn-blue`)).trim()), 'My Tests: "Part A completed · dd MMM, HH:mm — Attempt 1 is waiting for Part B" + "Continue Part B"');
    await H.shot(page, 'pause_2_mytests');
    const pl1 = G.table('Part_Log').filter(r => r.session_id === s.session_id);
    check(pl1.length === 1 && pl1[0].part === 'A' && pl1[0].sitting_no === 1 && pl1[0].end_reason === 'submit', 'Part_Log row for Part A written at once (sitting 1)');
    await page.context().close();
    G.shift(2 * DAY);
    const p2 = (await E.newPage()).page;
    await H.login(p2, E.url, 'T01'); await p2.waitForSelector('.form-card .btn-blue:has-text("Continue Part B")');
    await p2.click('.form-card .btn-blue:has-text("Continue Part B")'); await p2.waitForSelector('#btn-begin'); await H.waitMath(p2);
    check(!(await p2.isVisible('#v-transition.on')) && /Part B/.test(await p2.textContent('#v-directions h1')), 'n3: "Continue Part B" lands on Part B directions (Begin), not the transition screen');
    await H.shot(p2, 'pause_3_partB_directions');
    check((await p2.textContent('#timer .digits')).trim() === '50:00', 'Part B directions: timer 50:00 (not started)');
    await p2.click('#btn-begin'); await p2.waitForSelector('#qwrap .q.on'); await sleep(1200);
    const tB = (await p2.textContent('#timer .digits')).trim();
    check(/^(50:00|49:5\d)$/.test(tB), 'Part B timer starts fresh at Begin: ' + tB);
    check(G.table('Sessions').find(x => x.session_id === s.session_id).status === 'in_progress', 'status back to in_progress while doing Part B');
    await p2.click('#qwrap .q.on .ch-row[data-l="' + keyOf('B', 1) + '"] .ch');
    await p2.click('#btn-nav'); await p2.click('#nav-review'); await p2.waitForSelector('#v-review.on');
    await p2.click('#btn-next'); await p2.click('#modal-root .btns .btn-blue'); await p2.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    const s2 = G.table('Sessions').find(x => x.session_id === s.session_id);
    const pl = G.table('Part_Log').filter(r => r.session_id === s.session_id);
    const gapDays = (new Date(pl[1].started_at) - new Date(pl[0].ended_at)) / DAY;
    check(s2.status === 'completed' && s2.n_sittings === 2, 'submitted: completed, n_sittings 2');
    check(pl.length === 2 && pl[1].part === 'B' && pl[1].sitting_no === 2 && gapDays > 1.9 && pl[1].time_used_min < 1, 'Part_Log: 2 rows, B in sitting 2, ~2 days after A ended');
    const sr = G.table('Student_Report').find(r => r.session_id === s.session_id);
    check(/^Làm 2 lần: Part A \d\d\/\d\d .* · Part B \d\d\/\d\d/.test(sr.sittings), 'Student_Report.sittings: ' + sr.sittings);
    G.ctx.refreshReportList_(); const rp = G.sheets.Report; const lab = rp.rows[1][17];
    rp.rows[1][1] = lab; G.ctx.onEdit({ range: rp._proxy.getRange(2, 2) });
    check(/^Làm 2 lần: Part A/.test(String(rp.rows[6][1])), 'Report tab header shows the sittings: ' + rp.rows[6][1]);
    await p2.context().close();
    G.resetShift();
  }
  // ---- 2. close the browser on the transition screen → paused; Start over → abandoned
  console.log('[close on transition → paused → Start over]');
  {
    const { page, ctx } = await E.newPage();
    await start(page, 'T04'); await sleep(1000); await finishA(page);
    await ctx.close();
    const s = G.table('Sessions').find(x => x.student_code === 'T04');
    check(s.status === 'paused', 'closing on the transition screen leaves the attempt paused');
    const p2 = (await E.newPage()).page;
    await H.login(p2, E.url, 'T04'); await p2.waitForSelector('.form-card .btn-outline:has-text("Start over")'); await H.grab(p2, 'mytests_paused_T04');
    await p2.click('.form-card .btn-outline:has-text("Start over")'); await p2.click('#modal-root .btns .btn-blue'); await p2.waitForSelector('#btn-begin');
    const ss = G.table('Sessions').filter(x => x.student_code === 'T04');
    check(ss[0].status === 'abandoned' && ss[1].status === 'in_progress' && ss[1].attempt_no === 2, 'Start over: paused attempt → abandoned, new attempt 2');
    await p2.context().close();
  }
  // ---- 3. no pause: Bắt đầu Part B ngay → one sitting
  console.log('[straight through]');
  {
    const { page } = await E.newPage();
    await start(page, 'T05'); await finishA(page);
    await page.click('#btn-cont'); await page.waitForSelector('#btn-begin'); await H.waitMath(page); await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
    await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on');
    await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); await page.waitForSelector('#scr-result.on .score-total', { timeout: 15000 });
    const s = G.table('Sessions').find(x => x.student_code === 'T05');
    const pl = G.table('Part_Log').filter(r => r.session_id === s.session_id);
    check(s.n_sittings === 1 && pl.length === 2 && pl.every(r => r.sitting_no === 1), 'no pause → n_sittings 1, both parts sitting 1');
    await page.context().close();
  }
  H.englishOnly(E);
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
