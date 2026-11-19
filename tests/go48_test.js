// #48 part 3 (v1.17) teacher go-over tools: the pen draws over BOTH panes (passage + question) on one layer; a stroke
// follows its pane when it scrolls and stays when the divider is dragged (pen off); cleared on the next question;
// Select = lasso → dashed box → drag moves, Delete removes, Undo brings back. Highlight toolbar: teacher has green + cross
// out, students keep 3 colours + underline. Notes: math first on a Math question, words first on Reading and Writing.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot, waitMath } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-48-GO';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  const fd = G.ctx.formData_(SAT), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const now = Date.now(), seq = ['RW1', 'RW2', 'M1', 'M2'];
  const x = G.call('getTest', ['T03', SAT, { fresh: true }]);
  const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} }, evs = []; let end = now;
  seq.slice().reverse().forEach(p => { st.part_starts[p] = end - 30 * 60000; end -= 30 * 60000 + 1000; });
  seq.forEach(p => { st.ended[p] = 'submit'; st.parts[p] = { ans: {} }; let t = 0;
    x.questions.filter(q => q.part === p).forEach((q, i) => { const f = fd.questions.find(z => z.qid === q.qid), v = i % 2 ? key(f) : wrong(f);
      evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: 1 }, { part: p, t_ms: (t + 40) * 1000, qid: q.qid, type: 'select', value: v }); st.parts[p].ans[q.qid] = v;
      t += 60; evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null }); });
    evs.push({ part: p, t_ms: t * 1000, qid: '', type: 'part_end', value: 'submit' }); });
  G.call('submit', ['T03', x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
  const Q = (p, n) => fd.questions.find(q => q.part === p && q.display_no === n);

  const { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card'); await page.click('.t-open'); await page.waitForSelector('#scr-result.on .rgrid');
  await page.click(`#result-body .rgrid .rcell[data-qid="${Q('RW1', 1).qid}"]`); await page.waitForSelector('#scr-test.going #go-show'); await sleep(300);
  await page.evaluate(() => { const p = document.querySelector('#qwrap .q.on .q-pass'); const d = document.createElement('div'); d.className = 'pad48'; d.style.height = '1400px'; p.appendChild(d); }); // a long passage (scrolls)
  // red / blue pixels per pane: {L: [count, mean y], R: [...]}
  const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas.pen-cv'); if (!c) return null;
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, k = c.width / c.getBoundingClientRect().width;
    const cr = c.getBoundingClientRect(), div = document.querySelector('#qwrap .q.on .q-divider').getBoundingClientRect(), o = { red: [0, 0, 0], blue: [0, 0, 0], n: 0, L: 0, R: 0, dash: 0 };
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (!d[i + 3]) continue; o.n++;
      const sx = cr.left + x / k; if (sx < div.left) o.L++; else o.R++;
      const r = d[i], gg = d[i + 1], b = d[i + 2], key = r > 150 && gg < 80 ? 'red' : (b > 150 && r < 80 ? 'blue' : '');
      if (key) { o[key][0]++; o[key][1] += cr.left + x / k; o[key][2] += cr.top + y / k; } }
    ['red', 'blue'].forEach(t => { if (o[t][0]) { o[t][1] = Math.round(o[t][1] / o[t][0]); o[t][2] = Math.round(o[t][2] / o[t][0]); } });
    return o; });
  const line = async (x0, y0, len, colour) => {
    if (colour) await page.click('#pen-bar [data-pc="' + colour + '"]');
    await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + i * len / 12, y0 + (i % 2) * 3); await page.mouse.up();
  };

  console.log('[pen over both panes]');
  await page.click('#tool-pen');
  const pass = await page.$eval('#qwrap .q.on .q-pass', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  const side = await page.$eval('#qwrap .q.on .q-side', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  const cv = await page.$eval('canvas.pen-cv', c => { const r = c.getBoundingClientRect(), t = document.getElementById('tmain').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, tl: t.left, tt: t.top, tw: t.width }; });
  check(Math.abs(cv.l - cv.tl) < 2 && Math.abs(cv.t - cv.tt) < 2 && cv.w > cv.tw - 20, 'one layer over the whole question area (' + Math.round(cv.w) + '×' + Math.round(cv.h) + ')');
  await line(pass.x + 40, pass.y + 140, 200, 'red');                      // on the passage
  await line(side.x + 40, side.y + 120, 200, 'blue');                     // on the question
  await line(pass.x + pass.w - 80, pass.y + 260, 220, 'green');           // across the divider
  let p1 = await px();
  check(p1.red[0] > 30 && p1.red[1] < pass.x + pass.w && p1.blue[0] > 30 && p1.blue[1] > side.x && p1.L > 60 && p1.R > 60, 'strokes on the left pane (passage) and the right pane (question): ' + JSON.stringify({ L: p1.L, R: p1.R }));
  await shot(page, 'r48_pen_both_panes');

  console.log('[strokes follow their pane]');
  await page.$eval('#qwrap .q.on .q-pass', e => { e.scrollTop = 60; }); await sleep(150);
  let p2 = await px();
  check(Math.abs((p1.red[2] - p2.red[2]) - 60) <= 3 && Math.abs(p1.blue[2] - p2.blue[2]) <= 2, 'passage scrolled 60 px → its red stroke moved up ' + (p1.red[2] - p2.red[2]) + ' px, the blue one on the question stayed');
  await page.$eval('#qwrap .q.on .q-pass', e => { e.scrollTop = 0; }); await sleep(150);
  await page.click('#pen-bar [data-pt="off"]');
  check((await px()).n > 100, 'Pen off → the drawing stays on screen');
  const dv = await page.$eval('#qwrap .q.on .q-divider', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 200 }; });
  await page.mouse.move(dv.x, dv.y); await page.mouse.down(); await page.mouse.move(dv.x - 120, dv.y, { steps: 6 }); await page.mouse.up(); await sleep(250);
  const p3 = await px(), side2 = await page.$eval('#qwrap .q.on .q-side', e => e.getBoundingClientRect().left);
  check(side2 < side.x - 100 && p3.red[0] > 30 && p3.blue[0] > 30 && Math.abs((p1.blue[1] - p3.blue[1]) - (side.x - side2)) <= 4 && Math.abs(p3.red[1] - p1.red[1]) <= 2,
    'divider dragged 120 px → strokes kept; the question stroke moved with its pane (' + (p1.blue[1] - p3.blue[1]) + ' px), the passage one stayed');
  await shot(page, 'r48_pen_divider_moved');

  console.log('[Select: lasso → move → Delete → Undo]');
  await page.click('#tool-pen'); await page.click('#pen-bar [data-pt="select"]');
  const r0 = (await px()).red;
  await page.mouse.move(r0[1] - 130, r0[2] - 30); await page.mouse.down();
  for (const [dx, dy] of [[130, -30], [130, 30], [-130, 30], [-130, -30]]) await page.mouse.move(r0[1] + dx, r0[2] + dy, { steps: 4 });
  await page.mouse.up(); await sleep(100);
  const sel = await page.evaluate(() => { const c = document.querySelector('canvas.pen-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - 31) < 6 && Math.abs(d[i + 1] - 95) < 6 && Math.abs(d[i + 2] - 214) < 6) n++; return n; });
  const bl = (await px()).blue[0];
  check(sel > bl + 50, 'a loop around the red stroke → a dashed blue box around it');
  await page.mouse.move(r0[1], r0[2]); await page.mouse.down(); await page.mouse.move(r0[1] + 60, r0[2] + 90, { steps: 8 }); await page.mouse.up(); await sleep(100);
  const r1 = (await px()).red;
  check(Math.abs(r1[1] - r0[1] - 60) <= 3 && Math.abs(r1[2] - r0[2] - 90) <= 3 && r1[0] > 30, 'drag inside the box → the red stroke moved by (60, 90): (' + (r1[1] - r0[1]) + ', ' + (r1[2] - r0[2]) + ')');
  await page.keyboard.press('Delete'); await sleep(80);
  check((await px()).red[0] === 0, 'Delete → the selected stroke is removed');
  await page.click('#pen-bar [data-pt="undo"]'); await sleep(80);
  const r2 = (await px()).red; check(r2[0] > 30 && Math.abs(r2[1] - r1[1]) <= 3, 'Undo → back (where it was moved to)');
  await page.click('#pen-bar [data-pt="undo"]'); await sleep(80);
  check(Math.abs((await px()).red[1] - r0[1]) <= 3, 'Undo again → the move is undone');
  await shot(page, 'r48_pen_select');
  await page.click('#btn-next'); await sleep(300);
  check((await px()).n === 0, 'next question → the drawing is gone');
  await page.click('#pen-bar [data-pt="off"]');

  console.log('[teacher highlight: green + cross out]');
  const selWords = (sel, n) => page.evaluate(([sel, n]) => { const root = document.querySelector(sel); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && t.data.trim().length < n) ; const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, n); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }, [sel, n]);
  await selWords('#qwrap .q.on .q-pass', 6); await page.waitForSelector('#hl-toolbar.on');
  const tbT = await page.$$eval('#hl-toolbar [data-c]', b => b.filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-c')).join(''));
  check(tbT === 'ybpgus', 'teacher toolbar: yellow, blue, pink, GREEN, underline, CROSS OUT (' + tbT + ')');
  await page.click('#hl-toolbar [data-c="s"]'); await sleep(150);
  const sEl = await page.$eval('#qwrap .q.on span.hl-s', e => getComputedStyle(e).textDecorationLine).catch(() => '');
  await selWords('#qwrap .q.on .q-side .stem', 5); await page.waitForSelector('#hl-toolbar.on'); await page.click('#hl-toolbar [data-c="g"]'); await sleep(150);
  check(/line-through/.test(sEl) && !!(await page.$('#qwrap .q.on span.hl-g')), 'cross out → line-through; green → a green highlight');
  await shot(page, 'r48_teacher_highlight');

  console.log('[notes: words first on RW, math first on Math]');
  await page.click('#tool-notes'); await page.waitForSelector('#notes-panel.on'); await sleep(500);
  const rw = await page.evaluate(() => ({ mq: document.querySelectorAll('#nt-ed .mq').length, focusMq: !!(document.activeElement && document.activeElement.closest('.mq')), hint: document.querySelector('#notes-panel .nt-hint').textContent }));
  await page.keyboard.type('Main idea: line 3');
  check(rw.mq === 0 && !rw.focusMq && rw.hint === '$ or Ctrl+M = math' && /Main idea: line 3/.test(await page.textContent('#nt-ed')) && !(await page.$('#nt-ed .mq')), 'RW question: the pad types words (hint "' + rw.hint + '")');
  await page.click('#notes-x');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  await page.click(`#result-body .rgrid .rcell[data-qid="${Q('M1', 2).qid}"]`); await page.waitForSelector('#scr-test.going #go-show'); await waitMath(page);
  await page.evaluate(() => { try { Object.keys(localStorage).filter(k => /^tz_notes_/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {} document.getElementById('nt-ed').innerHTML = ''; });
  await page.click('#tool-notes'); await page.waitForSelector('#nt-ed .mq.mq-focused', { timeout: 8000 }).catch(() => {});
  const m = await page.evaluate(() => ({ focusMq: !!document.querySelector('#nt-ed .mq.mq-focused'), hint: document.querySelector('#notes-panel .nt-hint').textContent }));
  await page.keyboard.type('1/2'); await page.keyboard.press('ArrowRight'); await page.keyboard.type('x');
  await page.keyboard.press('Enter'); await page.waitForFunction(() => document.querySelectorAll('#nt-ed .mq').length === 2);
  await page.keyboard.type('y=3');
  await page.keyboard.press('Control+t'); await sleep(100);
  await page.keyboard.type(' so ok');
  const mh = await page.evaluate(() => ({ n: document.querySelectorAll('#nt-ed .mq').length, frac: !!document.querySelector('#nt-ed .mq .mq-fraction'), lines: document.querySelectorAll('#nt-ed > div').length, text: document.getElementById('nt-ed').innerText.replace(/\s+/g, ' ') }));
  check(m.focusMq && m.hint === 'Math first · Ctrl+T = words' && mh.frac && mh.n === 2 && mh.lines >= 2, 'Math question: opens in a math field (hint "' + m.hint + '"), "/" → fraction, Enter → a new math line');
  check(/so ok/.test(mh.text), 'Ctrl+T → words inside the line ("' + mh.text.trim().slice(-30) + '")');
  await shot(page, 'r48_notes_math_first');
  await page.context().close();

  console.log('[students: 3 colours + underline, no cross out]');
  G.sheets.Assignments.rows.push(['T03', SAT, 'RW1', 'Yes', '']);
  const { page: sp } = await E.newPage('desktop1280');
  await H.login(sp, E.url, 'T03'); await sp.waitForSelector('#hero-start'); await sp.click('#hero-start'); await sp.waitForSelector('#btn-begin'); await sp.click('#btn-begin'); await sp.waitForSelector('#qwrap .q.on');
  await sp.evaluate(() => { const root = document.querySelector('#qwrap .q.on .q-pass'); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && t.data.trim().length < 6) ; const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  await sp.waitForSelector('#hl-toolbar.on');
  const tbS = await sp.$$eval('#hl-toolbar [data-c]', b => b.filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('data-c')).join(''));
  check(tbS === 'ybpu' && await sp.isVisible('#tool-annot'), 'student test screen: yellow, blue, pink, underline (no green, no cross out); Annotate button kept (' + tbS + ')');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
