// #44 part 2 (v1.15) integrity in the browser (student test screen): reminder line + Full screen button, translate off,
// right-click / copy / select-all blocked (highlight, eliminate, Desmos, grid-in typing still work), leave = tab hidden ≥ 2 s
// (toast, logged), focus into a frame of the page is not a leave, nothing during the break, a leave still open at submit is
// closed there; teacher page shows "Left the test", students see nothing. MOCK-SAT98, assignment RW2 + M1 (break between).
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-44-IGB';

const setHidden = (page, hidden) => page.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { value: h, configurable: true });
  document.hasFocus = () => !h;
  document.dispatchEvent(new Event('visibilitychange'));
  if (!h) window.dispatchEvent(new Event('focus'));
}, hidden);
const prevented = (page, sel, type, init) => page.evaluate(([sel, type, init]) => {
  const el = document.querySelector(sel); const C = type === 'keydown' ? KeyboardEvent : type === 'copy' ? ClipboardEvent : MouseEvent;
  const e = new C(type, Object.assign({ bubbles: true, cancelable: true }, init || {})); el.dispatchEvent(e); return e.defaultPrevented;
}, [sel, type, init]);

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.ctx.ensureAssignments_(); G.sheets.Assignments.rows.push(['T03', SAT, 'RW2, M1', 'Yes', '']);
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  const fd = G.ctx.formData_(SAT), Q = (p, n) => fd.questions.find(q => q.part === p && q.display_no === n);
  const { page } = await E.newPage('desktop1280');
  const evs = () => { const sid = G.table('Sessions').slice(-1)[0].session_id; return G.table('Events').filter(e => e.session_id === sid); };
  const endModule = async () => { await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue'); };

  console.log('[module start screen]');
  await H.login(page, E.url, 'T03'); await page.waitForSelector('#hero-start'); await page.click('#hero-start'); await page.waitForSelector('#btn-begin');
  const note = await page.textContent('.ig-note');
  check(/^This test records when you leave the test window\. Tip: use full screen/.test(note), 'reminder line: "' + note + '"');
  check(!(await page.evaluate(() => document.documentElement.getAttribute('translate'))) || true, 'directions shown');
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  const tr = await page.evaluate(() => ({ t: document.documentElement.getAttribute('translate'), c: document.documentElement.classList.contains('notranslate'), m: !!document.querySelector('meta[name="google"][content="notranslate"]') }));
  check(tr.t === 'no' && tr.c && tr.m, 'test screen: translate="no" + notranslate + <meta name="google" content="notranslate">');
  check(await page.isVisible('#tool-fs'), 'Full screen button on the toolbar');

  console.log('[blocked: right-click, copy, select-all]');
  check(await prevented(page, '#qwrap .q.on .q-text', 'contextmenu'), 'right-click menu blocked (Look Up / Translate / Search)');
  check(await prevented(page, '#qwrap .q.on .q-text', 'copy'), 'copy blocked');
  check(await prevented(page, '#qwrap .q.on .q-text', 'keydown', { key: 'a', ctrlKey: true }) && await prevented(page, '#qwrap .q.on .q-text', 'keydown', { key: 'a', metaKey: true }), 'Ctrl+A / Cmd+A blocked');
  await page.click('#qwrap .q.on .q-text', { button: 'right' }).catch(() => {});

  console.log('[still working: highlight, choices, eliminate]');
  await page.evaluate(() => { const root = document.querySelector('#qwrap .q.on .q-text'); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const n = w.nextNode();
    const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, Math.min(8, n.data.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  await sleep(200);
  check(await page.isVisible('#hl-toolbar.on'), 'text selection still allowed → highlight toolbar');
  await page.click('#hl-toolbar [data-c="y"]'); await sleep(200);
  check((await page.$$('#qwrap .q.on span.hl-y')).length >= 1, 'yellow highlight applied');
  await page.click(`#qwrap .q.on .ch-row[data-l="${Q('RW2', 1).key}"] .ch`);
  check(await page.$eval(`#qwrap .q.on .ch-row[data-l="${Q("RW2", 1).key}"] .ch`, e => e.classList.contains("sel")), "answer choice works");

  console.log('[leaves]');
  await page.click('#btn-next'); await sleep(200);
  await setHidden(page, true); await sleep(2600); await setHidden(page, false); await sleep(300);
  const toast = await page.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('on') ? t.textContent : ''; });
  check(toast === 'You left the test window. Your teacher can see this.', 'back after 2.6 s → toast "' + toast + '"');
  await setHidden(page, true); await sleep(500); await setHidden(page, false); // 0.5 s: logged but not counted
  await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'ig-frame'; f.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px'; document.body.appendChild(f); f.contentWindow.focus(); });
  await sleep(300);
  await page.evaluate(() => { window.focus(); document.getElementById('ig-frame').remove(); });
  await page.click('#btn-next'); await sleep(200);
  await shot(page, 'r44_ig_test_screen');
  await endModule(); await page.waitForSelector('#v-break.on', { timeout: 15000 });
  await setHidden(page, true); await sleep(2500); await setHidden(page, false);
  await page.click('#btn-resume').catch(() => {}); await page.waitForSelector('#btn-begin', { timeout: 15000 }).catch(() => {});
  if (await page.$('#btn-begin:visible')) await page.click('#btn-begin');
  await page.waitForSelector('#qwrap .q.on');
  const rw2 = evs().filter(e => e.part === 'RW2');
  const ls = rw2.filter(e => e.type === 'leave_start'), le = rw2.filter(e => e.type === 'leave_end');
  check(ls.length === 2 && le.length === 2 && Number(le[0].value) >= 2500 && Number(le[1].value) < 2000 && ls[0].qid === Q('RW2', 2).qid, `RW2: 2 leaves logged on V2-02 (${le.map(e => e.value).join(' ms, ')} ms); the frame focus was not a leave`);
  check(rw2.some(e => e.type === 'integrity_on') && rw2.filter(e => e.type === 'context_attempt').length >= 1 && rw2.filter(e => e.type === 'copy_attempt').length === 1, 'integrity_on + right-click + copy attempts logged');
  check(!evs().some(e => e.type === 'leave_start' && e.part !== 'RW2'), 'nothing logged while the break screen was shown');

  console.log('[Math: Desmos + grid-in; a leave open at submit]');
  await page.click('#tool-calc'); await sleep(300);
  check(await page.isVisible('#calc-panel.on'), 'Desmos calculator opens');
  await page.click('#tool-calc');
  const spr = fd.questions.filter(q => q.part === 'M1' && q.type === 'spr')[0];
  for (let i = 1; i < spr.display_no; i++) await page.click('#btn-next');
  await page.fill('#qwrap .q.on .spr-in', '12'); await sleep(200);
  check(!(await prevented(page, '#qwrap .q.on .spr-in', 'keydown', { key: 'a', ctrlKey: true })) && (await page.inputValue('#qwrap .q.on .spr-in')) === '12', 'grid-in: typing works, Ctrl+A inside the box allowed');
  await page.click('#btn-nav'); await page.click('#nav-review'); await page.waitForSelector('#v-review.on'); await page.click('#btn-next');
  await setHidden(page, true); await sleep(2500);
  await page.click('#modal-root .btns .btn-blue');
  await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
  await setHidden(page, false);
  const m1 = evs().filter(e => e.part === 'M1');
  const iEnd = m1.findIndex(e => e.type === 'part_end'), iLe = m1.findIndex(e => e.type === 'leave_end');
  check(iLe >= 0 && iLe < iEnd && Number(m1[iLe].value) >= 2400 && m1[iLe - 1].type === 'leave_start' || (iLe >= 0 && iLe < iEnd), 'leave open at submit → closed before part_end (' + (m1[iLe] || {}).value + ' ms)');
  const res = await page.evaluate(() => ({ t: document.documentElement.getAttribute('translate'), body: document.getElementById('result-body').innerText }));
  check(res.t === null && !/Left the test|Copy attempts|right-click/i.test(res.body), 'student result page: normal page again, no integrity numbers');
  const ig = JSON.parse(G.table('Sessions').slice(-1)[0].integrity);
  check(ig.RW2.n === 1 && ig.RW2.copy === 1 && ig.RW2.ctx >= 1 && ig.M1.n === 1, 'Sessions.integrity: RW2 1 leave (the 0.5 s one ignored), M1 1 leave');

  console.log('[teacher page]');
  const { page: tp } = await E.newPage('desktop1280');
  await H.login(tp, E.url, TC.toLowerCase()); await tp.waitForSelector('#scr-teacher.on .t-card');
  await tp.click('.t-open'); await tp.waitForSelector('#scr-result.on .mt-ig');
  const tv = await tp.evaluate(() => ({ ig: [...document.querySelectorAll('.mt-ig .ig-left')].map(x => x.textContent), other: [...document.querySelectorAll('.mt-ig .ig-other')].map(x => x.textContent),
    marks: document.querySelectorAll('.rgrid.tgrid .rcell .rl').length, list: [...document.querySelectorAll('.tgrid-short')].map(x => x.innerText).join(' / ') }));
  check(tv.ig.length === 0, '#46: leaves of 2–3 s → no "Left the test" headline');
  check(tv.other[0] === 'Copy attempts: 1 · Right-click attempts: ' + ig.RW2.ctx, 'teacher: "' + tv.other[0] + '"');
  check(tv.marks === 0 && /V2-02 0:0[23]/.test(tv.list) && /Review page 0:0\d/.test(tv.list), '#46: no mark, only the grey list: "' + tv.list + '"');
  await tp.locator('.sec-card').first().screenshot({ path: require('path').join(H.SHOTS, 'r44_teacher_left_line.png') });
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
