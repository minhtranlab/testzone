// #21 N1: one live copy per attempt. The QA case: the same attempt is open in two windows; the newer one finishes RW2 and
// presses "Save and Continue Later" at the break; the older one, left open, must not run RW2 out, start Math or submit.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep } = H;
const FORM = 'MOCK-SAT98', MIN = 60000;

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  const sess = () => G.table('Sessions').find(s => s.form_id === FORM && s.student_code === 'T03');
  const stateOf = () => JSON.parse(sess().state_json || '{}');
  const endModule = async page => { await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); };
  const shiftAll = async (ms, pages) => { G.shift(ms); for (const p of pages) await p.evaluate(d => { const n = Date.now.bind(Date); Date.now = () => n() + d; }, ms); };

  console.log('[window A opens the test]');
  const { page: A } = await E.newPage();
  await H.login(A, E.url, 'T03'); await A.waitForSelector('.form-card .btn-blue');
  await A.click('.form-card .btn-blue'); await A.waitForSelector('#btn-begin'); await A.click('#btn-begin'); await A.waitForSelector('#qwrap .q.on');
  await endModule(A); await A.waitForSelector('#qwrap .q.on'); // A is on RW2
  const tokA = sess().copy_token;
  check(!!tokA && (await A.evaluate(() => window.TZ.copy)) === tokA, 'getTest gave window A a copy token (= Sessions.copy_token)');

  console.log('[window B (another device) opens the same attempt later]');
  const { page: B } = await E.newPage();
  await H.login(B, E.url, 'T03'); await B.waitForSelector('.form-card .btn-blue');
  await B.click('.form-card .btn-blue'); await B.waitForSelector('#qwrap .q.on');
  check(sess().copy_token && sess().copy_token !== tokA, 'B is now the live copy (new token)');
  await endModule(B); await B.waitForSelector('#v-break.on');
  await B.click('#btn-pause'); await B.waitForSelector('#scr-home.on .form-card');
  const st0 = stateOf();
  check(sess().status === 'paused' && st0.pause_explicit && !st0.part_starts.M1, 'B: Save and Continue Later at the break → paused, Math not started');

  console.log('[window A was left open on RW2]');
  const saves0 = E.st.rpcLog.filter(r => r.fn === 'autosave').length;
  await shiftAll(33 * MIN, [A]);             // RW2 time runs out in A
  await A.waitForFunction(() => /open in another window/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const txt = await A.textContent('body');
  check(/This test is open in another window\. Close this one\./.test(txt), 'A: "This test is open in another window. Close this one."');
  const refused = E.st.rpcLog.filter(r => r.fn === 'autosave').slice(saves0).map(r => JSON.parse(r.res).result);
  check(refused.length >= 1 && refused.every(r => r.other_copy && !r.ok), 'A\'s saves were refused (other_copy)');
  await shiftAll(15 * MIN, [A]);             // break over + more: no auto-start of Math from A
  await sleep(2500);
  const st1 = stateOf();
  check(sess().status === 'paused' && !st1.part_starts.M1 && JSON.stringify(st1.ended) === JSON.stringify(st0.ended), 'server: still paused at the break, no Math start, no time-up from A');
  check(!G.table('Part_Log').some(r => r.session_id === sess().session_id && r.part === 'M1'), 'Part_Log: no Math part from A');
  const after = E.st.rpcLog.filter(r => r.fn === 'autosave' || r.fn === 'submit').length;
  await sleep(1500);
  check(E.st.rpcLog.filter(r => r.fn === 'autosave' || r.fn === 'submit').length === after && await A.evaluate(() => !window.TZ || !window.TZ.st || window.TZ.st.phase !== 'submitting'), 'A stopped: no more saves, no submit');

  console.log('[the student comes back in B]');
  await B.click('.form-card .btn-blue'); await B.waitForSelector('#btn-begin, #qwrap .q.on, #v-directions.on', { timeout: 15000 });
  const dot = (await B.textContent('#save-dot')).trim();
  check(!dot, 'N3: the footer of the re-opened test has no "Saved hh:mm" from before (' + (dot || 'empty') + ')');
  const sv = E.st.rpcLog.filter(r => r.fn === 'autosave').length;
  if (await B.isVisible('#btn-begin')) await B.click('#btn-begin');
  await B.waitForSelector('#qwrap .q.on'); await sleep(500);
  await sleep(800);
  const okSaves = E.st.rpcLog.filter(r => r.fn === 'autosave').slice(sv).map(r => JSON.parse(r.res).result);
  check(okSaves.length && okSaves.every(r => r.ok) && !!stateOf().part_starts.M1 && sess().status === 'in_progress', 'B resumes: Math starts, B\'s saves accepted');

  console.log('[server: a payload from before v1.8 (no token) is still accepted]');
  const legacy = G.call('autosave', ['T03', sess().session_id, { state: stateOf(), events: [], ev_from: Number(sess().events_saved) }]);
  check(legacy.ok === true, 'no copy token → accepted (pages loaded before the deploy keep working)');
  const stale = G.call('submit', ['T03', sess().session_id, { state: stateOf(), events: [], ev_from: Number(sess().events_saved), copy: tokA }]);
  check(stale.other_copy && sess().status === 'in_progress', 'submit from the old copy → refused, attempt still open');
  const fails = H.summary(); await E.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
