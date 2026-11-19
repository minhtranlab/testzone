// #47 (v1.16) the teacher "go over" copied from SAT Math Lib (#50 goover50_test.js + #62 goover62_test.js), on Test Zone's
// screens: nothing shown on open; "Student's answer" (choice marked, time to answer, no ✓/✗) then "Show answer" (preloaded);
// Back / Next with "Wrong only" (ON from a result / class page; class = wrong or blank for ≥ 1 member; keeps the class
// section switch); "Details" drawer (closed by default); Notes pad (MathQuill, persists across questions, Copy rich + plain,
// Clear / End & clear); pen (4 colours, 2 widths, eraser, undo, gone on the next question); browser Back stays in the app;
// students unchanged, no keys in any student payload; laptop + iPad.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot, waitMath } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-47-GO';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.sheets.Students.rows.push(['S1', 'Quynh Anh', 'SAT', 'Yes', ''], ['S2', 'Quynh Chi', 'SAT', 'Yes', '']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  G.sheets.Settings.rows.forEach(r => { if (r[0] === 'valid_min_time_ratio' || r[0] === 'valid_quick_ratio') r[1] = 0.3; });
  const fd = G.ctx.formData_(SAT), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const now = Date.now();
  const take = (code, mins, plan, leaves) => {                         // a full SAT attempt; plan(part, i) → r / w / b
    const x = G.call('getTest', [code, SAT, { fresh: true }]); const seq = ['RW1', 'RW2', 'M1', 'M2'];
    const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} }, evs = []; let end = now;
    seq.slice().reverse().forEach(p => { st.part_starts[p] = end - mins * 60000; end -= mins * 60000 + 1000; });
    seq.forEach(p => { st.ended[p] = 'submit'; st.parts[p] = { ans: {} }; let t = 0; const qs = x.questions.filter(q => q.part === p), per = mins * 60 / qs.length;
      evs.push({ part: p, t_ms: 0, qid: '', type: 'integrity_on', value: 'v1.15' });
      qs.forEach((q, i) => { const f = fd.questions.find(z => z.qid === q.qid), k = plan(p, i), v = k === 'b' ? null : k === 'w' ? wrong(f) : key(f);
        evs.push({ part: p, t_ms: Math.round(t * 1000), qid: q.qid, type: 'q_enter', value: 1 });
        const lv = ((leaves || {})[p] || {})[i];
        if (lv) evs.push({ part: p, t_ms: Math.round((t + 1) * 1000), qid: q.qid, type: 'leave_start', value: 'hidden' }, { part: p, t_ms: Math.round((t + 1 + lv) * 1000), qid: q.qid, type: 'leave_end', value: lv * 1000 });
        if (v) { evs.push({ part: p, t_ms: Math.round((t + per * 0.9) * 1000), qid: q.qid, type: 'select', value: v }); st.parts[p].ans[q.qid] = v; }
        t += per; evs.push({ part: p, t_ms: Math.round(t * 1000), qid: q.qid, type: 'q_leave', value: null }); });
      evs.push({ part: p, t_ms: Math.round(t * 1000), qid: '', type: 'part_end', value: 'submit' }); });
    G.call('submit', [code, x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
    return x.session.session_id;
  };
  const sA = take('S1', 30, (p, i) => (i % 4 ? 'r' : (i === 8 ? 'b' : 'w')), { RW1: { 2: 25 } });   // V1-03: left 25 s, then right → ⚠
  const sB = take('S2', 30, (p, i) => (i % 3 ? 'r' : (i < 3 ? 'b' : 'w')));
  const sT = take('T03', 30, (p, i) => (i % 2 ? 'r' : 'w'));
  G.sheets.Classes.rows.push(['2CE', '2CE', 'S1, S2', 'Yes', '']);
  const T = (fn, ...a) => G.call(fn, [TC.toLowerCase(), ...a]);
  const trA = T('teacherReview', sA), stOf = {}; trA.questions.forEach(q => { stOf[q.code] = q; });
  const badA = trA.questions.filter(q => q.status === 'wrong' || q.status === 'blank').map(q => q.code);
  const codeOfQid = {}; trA.questions.forEach(q => { codeOfQid[q.qid] = q.code; });

  console.log('[server: keys only in the teacher payloads]');
  const stu = JSON.stringify(G.call('getReview', ['S1', sA])) + JSON.stringify(G.call('getResult', ['S1', sA])) + JSON.stringify(G.call('listForms', ['S1']));
  check(!/answer_keys|"key"/.test(stu) && Object.keys(trA.answer_keys).length === 98, 'student review / result / home: no key; teacher review: 98 keys (instant Show answer)');

  const bar = p => p.evaluate(() => ({ top: document.getElementById('view-bar').innerText.replace(/\s+/g, ' ').trim(), code: (document.querySelector('#view-bar .go-id b') || {}).textContent || '',
    sel: document.querySelectorAll('#qwrap .q.on .ch.sel').length, pick: [...document.querySelectorAll('#qwrap .q.on .ch-row.stu-pick')].map(r => r.getAttribute('data-l') + ':' + r.querySelector('.stu-tag').textContent),
    key: [...document.querySelectorAll('#qwrap .q.on .ch.rv-key')].map(c => c.closest('.ch-row').getAttribute('data-l')), spr: [...document.querySelectorAll('#qwrap .q.on .go-spr')].map(x => x.textContent),
    strip: document.getElementById('go-strip').innerText.replace(/\s+/g, ' ').trim(), fb: document.getElementById('fb-go').innerText.replace(/\s+/g, ' ').trim(),
    nav: document.getElementById('nav-label').textContent, wo: !!(document.getElementById('go-wrong') || {}).checked, drawer: document.getElementById('go-drawer').classList.contains('on') }));

  console.log('[result page → a wrong question: nothing shown on open]');
  let { page, ctx } = await E.newPage('desktop1280');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
  await page.click('.t-card:has-text("Quynh Anh") .t-open'); await page.waitForSelector('#scr-result.on .rgrid');
  E.st.rpcLog = [];
  const firstBad = badA.find(c => /^M1/.test(c) && fd.questions.find(q => q.qid === stOf[c].qid).type !== 'spr') || badA[0];
  await page.click(`#result-body .rgrid .rcell[data-qid="${stOf[firstBad].qid}"]`); await page.waitForSelector('#scr-test.going #go-show'); await waitMath(page);
  let b = await bar(page);
  check(b.code === firstBad && b.sel === 0 && !b.pick.length && !b.key.length && !b.strip && !/answer:|Time|Correct|✓|✗|rushed|slow|Left/.test(b.top), 'open ' + firstBad + ': top bar "' + b.top + '" — no answer, time, badge or key');
  check(/\(.+\)/.test(b.top) && b.wo && !b.drawer && b.nav === 'Question ' + (badA.filter(c => c.slice(0, 2) === firstBad.slice(0, 2)).indexOf(firstBad) + 1) + ' of ' + badA.filter(c => c.slice(0, 2) === firstBad.slice(0, 2)).length,
    'skill with its code on top, "Wrong only" ON, Details closed, ' + b.nav);
  check(await page.isVisible('#tool-notes') && await page.isVisible('#tool-pen') && await page.isVisible('#tool-calc') && await page.isVisible('#tool-ref') && /Student's answer\s*Show answer/.test(b.fb), 'Notes + Pen + Calculator + Reference on the toolbar; "Student\'s answer" + "Show answer" at the bottom');
  await shot(page, 'g47_open');

  console.log('[Student\'s answer, then Show answer]');
  const qa = stOf[firstBad];
  await page.click('#go-stu'); b = await bar(page);
  check(b.pick.join() === (qa.answer ? qa.answer + ':Quynh' : '') && /^Quynh Anh: /.test(b.strip) && (qa.answer ? /to answer/.test(b.strip) : /blank/.test(b.strip)) && !/✓|✗/.test(b.strip) && b.sel === 0,
    'Student\'s answer → choice ' + (qa.answer || 'blank') + ' marked "Quynh", strip "' + b.strip + '" (no ✓/✗)');
  const n0 = E.st.rpcLog.length;
  const ms = await page.evaluate(() => { const t0 = performance.now(); document.getElementById('go-show').click(); return document.querySelector('#qwrap .q.on .ch.rv-key') ? performance.now() - t0 : 9999; });
  b = await bar(page);
  check(ms < 100 && E.st.rpcLog.length === n0 && b.key.join() === key(fd.questions.find(q => q.qid === qa.qid)) && /Correct answer: /.test(b.fb) && /✗/.test(b.strip), 'Show answer → key ' + b.key + ' in ' + ms.toFixed(1) + ' ms, no server call; ✗ now on the student\'s answer');
  await shot(page, 'g47_answer_key');

  console.log('[Back / Next with Wrong only]');
  const seen = [b.code];
  for (let i = 0; i < 120; i++) { if (await page.$eval('#btn-next', e => e.disabled)) break; await page.click('#btn-next'); await sleep(60); const c = await page.$eval('#view-bar .go-id b', e => e.textContent); seen.push(c);
    if (i === 0) { const b1 = await bar(page); check(!b1.pick.length && !b1.key.length && !b1.strip && /Show answer/.test(b1.fb), 'Next → the next wrong question opens clean again (' + c + ')'); } }
  const after = badA.slice(badA.indexOf(firstBad));
  check(seen.join() === after.join(), 'Next walks the wrong + blank questions only, across modules: ' + seen.length + ' (' + seen.slice(0, 4).join(', ') + ' … ' + seen.slice(-2).join(', ') + ')');
  await page.click('#btn-back'); await sleep(80);
  check(await page.$eval('#view-bar .go-id b', e => e.textContent) === seen[seen.length - 2], 'Back → the previous wrong question');
  const here = await page.$eval('#view-bar .go-id b', e => e.textContent);
  await page.click('#go-wrong'); await sleep(300); b = await bar(page);
  check(!b.wo && b.code === here && / of (22|27)$/.test(b.nav), 'Wrong only OFF → all questions in test order, same question (' + b.nav + ')');
  await page.click('#btn-next'); await sleep(100);
  check(await page.$eval('#view-bar .go-id b', e => e.textContent) === trA.questions[trA.questions.findIndex(q => q.code === here) + 1].code, 'Next → the next question in test order');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on .rgrid');

  console.log('[Details drawer: time, R/S, left the test ⚠, skill]');
  await page.click(`#result-body .rgrid .rcell[data-qid="${stOf['V1-03'].qid}"]`); await page.waitForSelector('#scr-test.going #go-det'); await sleep(200);
  b = await bar(page);
  check(!b.wo && b.code === 'V1-03' && !b.drawer, 'a right question opened (V1-03) → "Wrong only" OFF, all questions; Details closed');
  await page.click('#go-det'); await page.waitForSelector('#go-drawer.on'); await sleep(250);
  const dr = await page.$eval('#go-dr-body', e => e.innerText.replace(/\s+/g, ' '));
  check(/Question V1-03/.test(dr) && /Skill .+\(.+\)/.test(dr) && /Time (\d+ min )?\d+ s to answer · total (\d+ min )?\d+ s/.test(dr) && /Pace/.test(dr) && /Left the test ⚠ 25 s on this question, then answered right/.test(dr), 'Details: "' + dr + '"');
  check(await page.$eval('#go-det', e => e.textContent) === 'Hide details', 'button reads "Hide details"');
  await page.click('#btn-next'); await sleep(200);
  const dr2 = await page.$eval('#go-dr-body', e => e.innerText.replace(/\s+/g, ' '));
  check(/Question V1-04/.test(dr2) && /Left the test —/.test(dr2), 'the drawer follows Next: "' + dr2.slice(0, 60) + '…"');
  await page.click('#go-dr-x'); await sleep(250);
  check(!(await bar(page)).drawer, '× closes the drawer');

  console.log('[Notes pad]');
  await page.click('#tool-notes'); await page.waitForSelector('#notes-panel.on #nt-ed');
  await page.click('#nt-ed');
  await page.keyboard.type('Slope = ');
  await page.keyboard.type('$'); await page.waitForSelector('#nt-ed .mq.mq-focused');
  await page.keyboard.type('3/4'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.type(', y = ');
  await page.keyboard.press('Control+m'); await page.waitForSelector('#nt-ed .mq.mq-focused');
  await page.keyboard.type('x^2'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.type('+1');
  await page.keyboard.press('Escape'); await page.keyboard.type(' ok');
  await page.keyboard.press('Enter'); await page.keyboard.type('Trap: answer C');
  check(await page.$('#nt-ed .mq .mq-fraction') && await page.$('#nt-ed .mq .mq-sup'), 'math typed: "/" → a fraction, "^" → a power');
  const selTxt = (t, n) => page.evaluate(([t, n]) => { const ed = document.querySelector('#nt-ed'); const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const i = x.nodeValue.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(x, i); r.setEnd(x, i + n); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } } }, [t, n]);
  await selTxt('Trap', 4); await page.click('#nt-tools [data-c="#d0263c"]');
  await selTxt('answer C', 8); await page.keyboard.press('Control+e');
  await selTxt('Slope', 5); await page.keyboard.press('Control+b');
  await page.click('#nt-ed'); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.click('#nt-tools [data-nt="ul"]'); await page.keyboard.type('check units');
  const edHtml = await page.$eval('#nt-ed', e => e.innerHTML);
  check(/rgb\(208, 38, 60\)|#d0263c/i.test(edHtml) && /rgb\(253, 230, 138\)|#fde68a/i.test(edHtml) && /font-weight:\s*bold|<b>/.test(edHtml) && /<li>/.test(edHtml), 'red text, yellow highlight (Ctrl+E), bold (Ctrl+B), bullet line');
  await sleep(600);
  await shot(page, 'g47_notes');
  await page.click('#btn-next'); await sleep(300);
  check((await page.$$('#nt-ed .mq')).length === 2 && /Trap/.test(await page.$eval('#nt-ed', e => e.innerText)) && await page.isVisible('#notes-panel'), 'Next question: the same notes (one pad per attempt)');
  await page.click('#nt-tools [data-nt="copy"]');
  await page.waitForFunction(() => /Copied/.test(document.querySelector('#toast').textContent), null, { timeout: 20000 });
  await page.evaluate(() => { const w = document.createElement('div'); w.id = 'paste-test'; w.style.cssText = 'position:fixed;left:20px;bottom:90px;width:700px;background:#fff;border:2px solid #333;padding:10px;z-index:200;font:14px Arial';
    w.innerHTML = '<b>Plain</b><textarea id="pt" style="width:100%;height:60px"></textarea><b>HTML</b><div id="ph" contenteditable="true" style="min-height:70px;border:1px solid #999;padding:6px"></div>'; document.body.appendChild(w); });
  await page.focus('#pt'); await page.keyboard.press('Control+v'); await page.focus('#ph'); await page.keyboard.press('Control+v'); await sleep(400);
  const plain = await page.$eval('#pt', e => e.value), rich = await page.$eval('#ph', e => e.innerHTML);
  check(/Slope = 3\/4, y = x\^2\+1 ok/.test(plain) && /Trap: answer C/.test(plain) && /• check units/.test(plain), 'Copy → plain text: "' + plain.replace(/\n/g, ' ⏎ ') + '"');
  check((rich.match(/<img/g) || []).length === 2 && /data:image\/png/.test(rich) && /208, 38, 60|d0263c/i.test(rich), 'Copy → rich: 2 math images + the red word');
  await page.evaluate(() => document.querySelector('#paste-test').remove());
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  check(!(await page.isVisible('#notes-panel')), 'Back to result → the notes panel closes');
  await page.click(`#result-body .rgrid .rcell[data-qid="${stOf[badA[0]].qid}"]`); await page.waitForSelector('#scr-test.going #go-show');
  await page.click('#tool-notes'); await page.waitForSelector('#notes-panel.on'); await sleep(500);
  check((await page.$$('#nt-ed .mq .mq-fraction')).length === 1 && /Trap/.test(await page.$eval('#nt-ed', e => e.innerText)), 'reopen the same attempt → the same notes (math still editable)');
  await page.click('#nt-tools [data-nt="clear"]'); await page.waitForSelector('#modal-root.on'); await page.click('#modal-root .btns button:last-child');
  check(await page.$eval('#nt-ed', e => e.innerText.trim() === '') && await page.evaluate(k => localStorage.getItem(k), 'tz_notes_' + sA) === null, 'Clear (confirmed) → empty, nothing kept');
  await page.keyboard.type('note 2'); await sleep(500);
  await page.click('#nt-tools [data-nt="end"]'); await page.waitForSelector('#modal-root.on'); await page.click('#modal-root .btns button:last-child');
  await page.waitForSelector('#scr-result.on');
  check(await page.evaluate(k => localStorage.getItem(k), 'tz_notes_' + sA) === null, 'End & clear → back to the result, the notes deleted');

  console.log('[pen on the question]');
  await page.click(`#result-body .rgrid .rcell[data-qid="${stOf['M1-03'].qid}"]`); await page.waitForSelector('#scr-test.going #go-show'); await waitMath(page); await sleep(300);
  await page.click('#tool-pen');
  check(await page.$eval('#pen-bar', e => !e.hidden) && !!(await page.$('#scr-test canvas.pen-cv')), 'Pen on → the pen bar + a canvas over the question area');
  const box = await (await page.$('#scr-test canvas.pen-cv')).boundingBox();
  const draw = async (y, colour, w) => {
    await page.click('#pen-bar [data-pc="' + colour + '"]'); if (w) await page.click('#pen-bar [data-pw="' + w + '"]');
    await page.mouse.move(box.x + 60, box.y + y); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 60 + i * 25, box.y + y + (i % 2) * 6);
    await page.mouse.up();
  };
  await draw(80, 'blue'); await draw(130, 'red', 2); await draw(180, 'green', 1); await draw(230, 'yellow', 2);
  const px = () => page.$eval('#scr-test canvas.pen-cv', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const o = { n: 0, blue: 0, red: 0, green: 0, yellow: 0 };
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; o.n++; const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; if (b > 150 && r < 80) o.blue++; else if (r > 150 && g < 80) o.red++; else if (g > 100 && r < 80 && b < 120) o.green++; else if (r > 200 && g > 150 && b < 60) o.yellow++; } return o; }).catch(() => ({ n: 0 }));
  const p1 = await px();
  check(p1.blue > 50 && p1.red > 50 && p1.green > 50 && p1.yellow > 50, '4 colours drawn (pixels ' + JSON.stringify(p1) + ')');
  check(!(await page.$('#qwrap .q.on .ch.sel')), 'while the pen is on, drawing over the choices picks nothing');
  await shot(page, 'g47_pen');
  await page.click('#pen-bar [data-pt="undo"]'); const p2 = await px(); check(p2.yellow < 10 && p2.blue > 50, 'Undo → the last stroke (yellow) goes');
  await page.click('#pen-bar [data-pt="eraser"]');
  await page.mouse.move(box.x + 60 + 6 * 25, box.y + 130); await page.mouse.down(); await page.mouse.move(box.x + 60 + 7 * 25, box.y + 132); await page.mouse.up();
  const p3 = await px(); check(p3.red < 10 && p3.blue > 50, 'Eraser on the red line → the red stroke goes');
  await page.click('#pen-bar [data-pt="clear"]'); const p3b = await px(); check(p3b.n === 0, 'Clear drawing → empty');
  await page.click('#pen-bar [data-pt="undo"]'); await page.click('#btn-next'); await sleep(400);
  const p4 = await px(); check(p4.n === 0, 'next question → the drawing is gone');
  await page.click('#pen-bar [data-pt="off"]');
  const ch = await page.$('#qwrap .q.on .ch'); if (ch) { await ch.click(); check(await ch.evaluate(e => e.classList.contains('sel')), 'Pen off → a click picks a choice again (not saved)'); }

  console.log('[the screenshot for Minh: Details open + notes + pen]');
  await page.click('#go-stu'); await page.click('#go-det'); await page.waitForSelector('#go-drawer.on');
  await page.click('#tool-notes'); await page.waitForSelector('#notes-panel.on'); await page.click('#nt-ed');
  await page.keyboard.type('Area = '); await page.keyboard.type('$'); await page.waitForSelector('#nt-ed .mq.mq-focused'); await page.keyboard.type('1/2'); await page.keyboard.press('ArrowRight'); await page.keyboard.type('bh');
  await page.keyboard.press('Escape'); await page.keyboard.type(' → check the units');
  await page.evaluate(() => { const p = document.getElementById('notes-panel'); p.style.left = '24px'; p.style.top = (document.getElementById('tmain').offsetTop + 260) + 'px'; p.style.width = '420px'; p.style.height = '220px'; });
  await page.click('#tool-pen'); const bx2 = await (await page.$('#scr-test canvas.pen-cv')).boundingBox();
  await page.click('#pen-bar [data-pc="red"]'); await page.mouse.move(bx2.x + 120, bx2.y + 95); await page.mouse.down(); for (let i = 1; i <= 14; i++) await page.mouse.move(bx2.x + 120 + i * 22, bx2.y + 98 + (i % 2) * 3); await page.mouse.up();
  await page.click('#pen-bar [data-pc="yellow"]'); await page.mouse.move(bx2.x + 120, bx2.y + 60); await page.mouse.down(); await page.mouse.move(bx2.x + 420, bx2.y + 60); await page.mouse.up();
  await sleep(300); await shot(page, 'g47_minh_details_notes_pen');
  await page.click('#pen-bar [data-pt="off"]'); await page.click('#notes-x');

  console.log('[browser Back stays in the app]');
  await page.goBack(); await page.waitForSelector('#scr-result.on .rgrid', { timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#scr-result.on .rgrid') && !(await page.isVisible('#notes-panel')), 'Back on a question → the result page');
  await page.goBack(); await page.waitForSelector('#scr-teacher.on', { timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#scr-teacher.on'), 'Back on the result → the teacher list');
  await page.goBack().catch(() => {}); await sleep(500);
  check(await page.isVisible('#scr-teacher.on') && /localhost/.test(page.url()), 'Back on the teacher list → stays there (' + page.url().replace(/^.*\//, '/') + ')');

  console.log('[class 2CE: Math section, wrong for ≥ 1 member, every member]');
  await page.evaluate(() => { try { localStorage.setItem('tz.clsSec', 'Math'); } catch (e) {} });
  await page.click('#t-tab-cl'); await page.waitForSelector('.cl-card[data-cid="2CE"]'); await page.click('.cl-card[data-cid="2CE"] .cl-open'); await page.waitForSelector('.cls-go');
  check(await page.$eval('.cls-sec button.on', e => e.textContent) === 'Math', 'class screen on the Math section');
  const cv = T('teacherClassView', '2CE', { form_id: SAT, part: '', picks: {} });
  const badC = cv.order.map(id => cv.questions.find(q => q.qid === id)).filter(q => /^M/.test(q.part) && Object.values(q.cells).some(c => c.st === 'wrong' || c.st === 'blank')).map(q => q.code);
  await page.click('.cls-go .qchip.wrong'); await page.waitForSelector('#scr-test.going #go-show'); await sleep(200);
  b = await bar(page);
  check(b.wo && b.nav === 'Question 1 of ' + badC.filter(c => c.slice(0, 2) === b.code.slice(0, 2)).length && /^M/.test(b.code) && b.sel === 0 && !b.strip, 'class: Wrong only ON, Math only, nothing shown (' + b.code + ', ' + b.nav + ')');
  const seenC = [b.code];
  for (let i = 0; i < 60; i++) { if (await page.$eval('#btn-next', e => e.disabled)) break; await page.click('#btn-next'); await sleep(50); seenC.push(await page.$eval('#view-bar .go-id b', e => e.textContent)); }
  const ordC = d => cv.questions.filter(q => q.code === d)[0];
  check(seenC.slice().sort().join() === badC.slice().sort().join() && seenC.every(c => /^M/.test(c)), 'class Next: ' + seenC.length + ' Math questions, each wrong or blank for at least one member');
  await page.click('#go-stu'); b = await bar(page);
  check(/Quynh Anh: /.test(b.strip) && /Quynh Chi: /.test(b.strip) && !/✓|✗/.test(b.strip), 'class Student\'s answer: every member "' + b.strip + '"');
  await page.click('#go-det'); await page.waitForSelector('#go-drawer.on'); await sleep(250);
  const drc = await page.$eval('#go-dr-body', e => e.innerText.replace(/\s+/g, ' '));
  check(/Student Answer Time/.test(drc) && /Quynh Anh/.test(drc) && /Quynh Chi/.test(drc), 'class Details: each member\'s answer + time ("' + drc.slice(0, 90) + '…")');
  await shot(page, 'g47_class');
  await page.click('#go-show'); b = await bar(page);
  check(/✓|✗/.test(b.strip) && /Correct answer|Correct:/.test(b.fb + b.spr.join()), 'class Show answer → key + ✓/✗ per member');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on .cls-go');
  check(true, '"Back to class" → the class screen');
  H.englishOnly(E);
  await ctx.close();

  console.log('[students: unchanged]');
  ({ page } = await E.newPage('desktop1280'));
  E.st.rpcLog = [];
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .fc-view'); await page.click('.form-card .fc-view'); await page.waitForSelector('#scr-result.on .rgrid');
  await page.click('#result-body .rgrid .rcell.wrong'); await page.waitForSelector('#scr-test.viewing #view-bar b');
  const sv = await page.evaluate(() => ({ bar: document.getElementById('view-bar').innerText, going: document.getElementById('scr-test').classList.contains('going'), sel: document.querySelectorAll('#qwrap .q.on .ch.sel').length,
    tools: ['#tool-notes', '#tool-pen'].map(s => getComputedStyle(document.querySelector(s)).display), fb: document.getElementById('fb-go').innerText, hash: location.hash }));
  check(/Your answer: /.test(sv.bar) && /✗ Incorrect/.test(sv.bar) && !sv.going && sv.sel === 1 && sv.tools.join() === 'none,none' && !sv.fb && !sv.hash, 'student review as before: "Your answer", ✗, own choice marked; no Notes / Pen / go-over buttons; no #hash');
  check(!E.st.rpcLog.some(r => /answer_keys|"key"/.test(r.res)), 'no key in any student payload (' + E.st.rpcLog.map(r => r.fn).join(', ') + ')');
  await page.context().close();

  console.log('[iPad: landscape + portrait]');
  for (const dev of ['ipad', 'ipad-portrait']) {
    const ip = (await E.newPage(dev)).page;
    await H.login(ip, E.url, TC.toLowerCase()); await ip.waitForSelector('#scr-teacher.on .t-card');
    await ip.tap('.t-card:has-text("Quynh Anh") .t-open'); await ip.waitForSelector('#scr-result.on .rgrid');
    await ip.tap(`#result-body .rgrid .rcell[data-qid="${stOf['M1-03'].qid}"]`); await ip.waitForSelector('#scr-test.going #go-show'); await waitMath(ip); await sleep(300);
    await ip.tap('#go-stu'); await ip.tap('#go-det'); await ip.waitForSelector('#go-drawer.on');
    await ip.tap('#tool-pen');
    const bx = await (await ip.$('#scr-test canvas.pen-cv')).boundingBox();
    for (const [c, y] of [['red', 70], ['blue', 120]]) { await ip.tap('#pen-bar [data-pc="' + c + '"]'); await ip.mouse.move(bx.x + 40, bx.y + y); await ip.mouse.down(); for (let i = 1; i < 10; i++) await ip.mouse.move(bx.x + 40 + i * 30, bx.y + y + (i % 2) * 8); await ip.mouse.up(); }
    const n = await ip.$eval('#scr-test canvas.pen-cv', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k; });
    await ip.tap('#tool-notes'); await ip.waitForSelector('#notes-panel.on'); await ip.click('#nt-ed'); await ip.keyboard.type('Area = '); await ip.keyboard.type('$'); await ip.waitForSelector('#nt-ed .mq.mq-focused'); await ip.keyboard.type('1/2bh');
    await sleep(400);
    const fit = await ip.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { page: document.documentElement.scrollWidth <= innerWidth + 1, notes: r('#notes-panel').right <= innerWidth + 1, fb: r('#fbar').bottom <= innerHeight + 1,
      btns: ['#go-stu', '#go-show', '#btn-next', '#go-det'].every(s => { const b = document.querySelector(s); if (!b) return true; const x = b.getBoundingClientRect(); return x.width > 0 && x.right <= innerWidth + 1 && x.bottom <= innerHeight + 1; }) }; });
    check(n > 200 && fit.page && fit.notes && fit.fb && fit.btns, dev + ': pen draws with touch (' + n + ' px), Notes + drawer + bottom buttons fit the screen ' + JSON.stringify(fit));
    await shot(ip, 'g47_' + dev.replace('-', '_'));
    await ip.context().close();
  }
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
