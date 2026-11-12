// #36 (v1.13) Highlight like Bluebook: select text → a small toolbar right below the selection (yellow, blue, pink,
// underline, note; trash inside an existing highlight). One click applies and closes; click elsewhere / Esc closes;
// clicking a highlight reopens it; saved after reload; SAT passage pane; review (student) works, nothing saved there.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98';

/** select characters [a, b) of the text of sel (current question; text nodes in order, math skipped) and release the mouse */
async function selectText(page, sel, a, b, how) {
  const r = await page.evaluate(([sel, a, b, how]) => {
    const root = document.querySelector('#qwrap .q.on ' + sel);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('mjx-container, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const pos = k => { let n, acc = 0, last = null; w.currentNode = root; while ((n = w.nextNode())) { last = n; if (acc + n.data.length >= k) return [n, k - acc]; acc += n.data.length; } return [last, last.data.length]; };
    const [n1, o1] = pos(a), [n2, o2] = pos(b);
    const rg = document.createRange(); rg.setStart(n1, o1); rg.setEnd(n2, o2);
    const rs = rg.getClientRects(), f = rs[0], l = rs[rs.length - 1];
    if (how !== 'drag') { const s = getSelection(); s.removeAllRanges(); s.addRange(rg); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }
    return { text: rg.toString(), x1: f.left + 1, y1: f.top + f.height / 2, x2: l.right - 1, y2: l.top + l.height / 2, bottom: l.bottom, top: f.top };
  }, [sel, a, b, how]);
  if (how === 'drag') { await page.mouse.move(r.x1, r.y1); await page.mouse.down(); await page.mouse.move(r.x2, r.y2, { steps: 6 }); await page.mouse.up(); r.text = await page.evaluate(() => getSelection().toString()); }
  await sleep(120);
  return r;
}
const tb = page => page.evaluate(() => { const t = document.getElementById('hl-toolbar'), r = t.getBoundingClientRect();
  return { on: t.classList.contains('on'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, del: !document.getElementById('hl-del').classList.contains('hidden'),
           note: !document.getElementById('hl-note').classList.contains('hidden'), vw: innerWidth, vh: innerHeight }; });
const spans = (page, cls) => page.$$eval('#qwrap .q.on span.' + cls, x => x.map(e => e.textContent).join('|'));

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);

  console.log('[SAT Reading and Writing question: toolbar at the selection]');
  const { page } = await E.newPage();
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.hz-tiles .form-card');
  await page.click('.hz-tiles .form-card .btn-blue'); await page.waitForSelector('#btn-begin');
  await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  let r = await selectText(page, '.q-text', 0, 8, 'drag'), t = await tb(page);
  check(t.on && t.top >= r.bottom && t.top - r.bottom < 40 && t.left >= 0 && t.right <= t.vw && t.bottom <= t.vh && !t.del,
    `mouse drag over "${r.text}" → toolbar just below it (${Math.round(t.top - r.bottom)} px), inside the screen, no trash`);
  await shot(page, 'r36_toolbar_selection');
  await page.click('#hl-toolbar [data-c="y"]'); await sleep(150); t = await tb(page);
  check((await spans(page, 'hl-y')) === r.text && !t.on && await page.evaluate(() => getSelection().isCollapsed), 'yellow: one click → highlighted, toolbar closed, selection gone (' + JSON.stringify([await spans(page, 'hl-y'), r.text, t.on]) + ')');
  r = await selectText(page, '.q-text', 9, 15); await page.click('#hl-toolbar [data-c="b"]'); await sleep(120);
  check((await spans(page, 'hl-b')) === r.text, 'blue: "' + r.text + '"');
  r = await selectText(page, '.q-text', 16, 22); await page.click('#hl-toolbar [data-c="p"]'); await sleep(120);
  check((await spans(page, 'hl-p')) === r.text, 'pink: "' + r.text + '"');
  r = await selectText(page, '.q-text', 23, 28); await page.click('#hl-toolbar [data-c="u"]'); await sleep(120);
  check((await spans(page, 'hl-u')) === r.text && !(await tb(page)).on, 'underline: "' + r.text + '"');
  r = await selectText(page, '.q-text', 29, 34); await page.click('#hl-note-btn'); await sleep(120); t = await tb(page);
  check(t.on && t.note && await page.evaluate(() => document.activeElement.id === 'hl-note'), 'Add note: highlighted + the note box open with the cursor in it');
  await page.keyboard.type('check the units');
  await page.mouse.click(5, 300); await sleep(120);
  const st = await page.evaluate(() => { const p = window.TZ.st.parts[window.TZ.st.current_part]; return [].concat(...Object.values(p.hl)); });
  check(!(await tb(page)).on && st.some(h => h.note === 'check the units') && (await page.$$('#qwrap .q.on span.hl-note')).length === 1, 'note saved in the state, dotted underline; click elsewhere closes the toolbar');
  // Esc
  await selectText(page, '.q-text', 35, 40); check((await tb(page)).on, 'select again → toolbar'); await page.keyboard.press('Escape'); await sleep(80);
  check(!(await tb(page)).on, 'Esc closes it');
  await page.evaluate(() => getSelection().removeAllRanges());
  // click an existing highlight → same toolbar with the trash; delete
  await page.click('#qwrap .q.on span.hl-b'); await sleep(120); t = await tb(page);
  check(t.on && t.del, 'click a highlight → the same toolbar, now with the trash');
  await page.click('#hl-toolbar [data-c="p"]'); await sleep(120);
  check((await page.$$('#qwrap .q.on span.hl-b')).length === 0 && (await spans(page, 'hl-p')).split('|').length === 2 && !(await tb(page)).on, 'changing its colour (blue → pink) also closes the toolbar');
  await page.click('#qwrap .q.on span.hl-u'); await sleep(100); await page.click('#hl-del'); await sleep(120);
  check((await page.$$('#qwrap .q.on span.hl-u')).length === 0 && !(await tb(page)).on, 'trash deletes the highlight');
  // selection inside an existing highlight → trash offered
  await selectText(page, '.q-text', 1, 5); t = await tb(page);
  check(t.on && t.del, 'selecting inside a highlight → toolbar with the trash');
  await page.keyboard.press('Escape');
  // keyboard selection (Shift + arrows) also opens it
  await selectText(page, '.q-text-pass', 30, 36, 'nomouseup'); await page.keyboard.press('Escape'); // a selection made without the mouse
  await page.evaluate(() => { const s = getSelection(); const rg = s.getRangeAt(0); s.removeAllRanges(); s.addRange(rg); });
  await page.keyboard.press('Shift+ArrowRight'); await sleep(150);
  check((await tb(page)).on, 'keyboard selection (Shift + arrow keys) → toolbar');
  await page.keyboard.press('Escape');
  // saved after reload
  const before = await page.$$eval('#qwrap .q.on span.hl', x => x.map(e => e.className).sort().join(','));
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForSelector('#qwrap .q.on', { timeout: 15000 }); await sleep(300);
  const after = await page.$$eval('#qwrap .q.on span.hl', x => x.map(e => e.className).sort().join(','));
  check(before && after === before, 'after reload: the same highlights (' + after + ')');
  await page.context().close();

  console.log('[SAT passage pane + AP question]');
  const { page: p2 } = await E.newPage();
  await H.login(p2, E.url, 'T03'); await p2.waitForSelector('#pickup .hz-btn'); await p2.click('#pickup .hz-btn'); await p2.waitForSelector('#qwrap .q.on', { timeout: 15000 });
  await p2.click('#btn-next'); await sleep(200);
  r = await selectText(p2, '.q-text-pass', 4, 20, 'drag'); t = await tb(p2);
  check(t.on && t.top >= r.bottom && t.top - r.bottom < 40, 'passage: toolbar right below "' + r.text + '"');
  await p2.click('#hl-toolbar [data-c="b"]'); await sleep(120);
  const hl = await p2.evaluate(() => JSON.stringify(window.TZ.st.parts.RW1.hl));
  check((await p2.$$eval('#qwrap .q.on .q-text-pass span.hl-b', x => x.length)) >= 1 && /"r":"p"/.test(hl) && /"c":"b"/.test(hl), 'passage highlight (blue) saved with the passage marker');
  await shot(p2, 'r36_passage');
  await p2.context().close();
  const { page: pa } = await E.newPage();
  await H.login(pa, E.url, 'T01'); await pa.waitForSelector('.hz-tiles .form-card');
  await pa.click('.form-card:has-text("Mock form") .btn-blue'); await pa.waitForSelector('#btn-begin'); await H.waitMath(pa);
  await pa.click('#btn-begin'); await pa.waitForSelector('#qwrap .q.on');
  r = await selectText(pa, '.q-text', 0, 14, 'drag'); t = await tb(pa);
  check(t.on && t.top >= r.bottom - 1, 'AP question (with math): toolbar below the selection');
  await pa.click('#hl-toolbar [data-c="p"]'); await sleep(120);
  check((await pa.$$('#qwrap .q.on span.hl-p')).length >= 1 && !(await tb(pa)).on, 'AP: pink highlight, toolbar closed');
  await pa.context().close();

  console.log('[review: student (nothing saved) + iPad size]');
  const sid = G.table('Sessions').find(r => r.student_code === 'T01' && r.status === 'in_progress');
  const { page: p3 } = await E.newPage('ipad');
  await H.login(p3, E.url, 'T01'); await p3.waitForSelector('#qwrap .q.on, .hz-tiles .form-card');
  if (await p3.$('#scr-home.on')) { await p3.click('.form-card:has-text("Mock form") .btn-blue'); await p3.waitForSelector('#qwrap .q.on'); }
  for (const part of ['A', 'B']) { await p3.click('#btn-nav'); await p3.click('#nav-review'); await p3.waitForSelector('#v-review.on'); await p3.click('#btn-next'); await p3.click('#modal-root .btns .btn-blue');
    if (part === 'A') { await p3.waitForSelector('#v-transition.on'); await p3.click('#btn-cont'); await p3.waitForSelector('#btn-begin'); await p3.click('#btn-begin'); await p3.waitForSelector('#qwrap .q.on'); } }
  await p3.waitForSelector('#scr-result.on .rgrid', { timeout: 20000 });
  await p3.tap('#result-body .rgrid .rcell'); await p3.waitForSelector('#scr-test.on.viewing #qwrap .q.on');
  r = await selectText(p3, '.q-text', 0, 6); t = await tb(p3);
  check(t.on && t.top - r.bottom >= 20, 'student review, touch size: toolbar opens below (room for the selection handles: ' + Math.round(t.top - r.bottom) + ' px)');
  await p3.click('#hl-toolbar [data-c="y"]'); await sleep(100);
  const n3 = E.st.rpcLog.length; await sleep(300);
  const ny = (await p3.$$('#qwrap .q.on span.hl-y')).length;
  check(ny >= 1 && !E.st.rpcLog.slice(n3 - 2).some(x => x.fn === 'autosave') && !(await p3.evaluate(() => Object.keys(localStorage).some(k => /view:/.test(localStorage.getItem(k) || '')))), 'review: highlight works (' + ny + '), nothing saved');
  await shot(p3, 'r36_review_ipad');
  await p3.context().close();

  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
