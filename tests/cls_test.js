// #44 part 1 (v1.15) classes in the browser (teacher): Students | Classes tabs, New class on the page, Archive / Show
// archived / Restore, class screen (test + part pickers, module times, What to go over, Grid + filters), a question opens
// in the test screen with every member's answer + Show answer. Desktop 1280 + phone 390.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-44-UI';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.sheets.Students.rows.push(['S1', 'Quynh Anh', 'SAT', 'Yes', ''], ['S2', 'Quynh Chi', 'SAT', 'Yes', ''], ['S3', 'Minh Khoa', 'SAT', 'Yes', '']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  const fd = G.ctx.formData_(SAT), m2 = fd.questions.filter(q => q.part === 'M2').sort((a, b) => a.display_no - b.display_no);
  const key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const now = Date.now();
  const take = (code, i) => { // full SAT attempt; M2 answers vary per student, RW / M1 all right
    const x = G.call('getTest', [code, SAT, { fresh: true }]); const seq = ['RW1', 'RW2', 'M1', 'M2'];
    const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} }; const evs = [];
    seq.forEach((p, k) => { st.part_starts[p] = now - (4 - k) * 36 * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {} }; let t = 0;
      x.questions.filter(q => q.part === p).forEach((q, j) => { const full = fd.questions.find(z => z.qid === q.qid);
        const w = p === 'M2' && ((j + i) % 3 === 0 || (j < 3 && i < 2)), sec = p === 'M2' && j === 4 && i === 0 ? 300 : p === 'M2' && j === 6 ? 6 : 50;
        const v = p === 'M2' && j === 21 && i === 2 ? null : (w ? wrong(full) : key(full));
        evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: 1 });
        if (v) { evs.push({ part: p, t_ms: (t + sec) * 1000, qid: q.qid, type: 'select', value: v }); st.parts[p].ans[q.qid] = v; }
        t += sec + 3; evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null }); });
      evs.push({ part: p, t_ms: t * 1000, qid: '', type: 'part_end', value: 'submit' }); });
    G.call('submit', [code, x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
  };
  take('S1', 0); take('S2', 1);
  G.sheets.Classes.rows.push(['OLD', 'Old group', 'S3', 'No', 'archived example']);

  const { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
  console.log('[Classes tab + New class]');
  await page.click('#t-tab-cl'); await page.waitForSelector('#t-classes .cl-new');
  check(await page.isVisible('#t-pane-cl') && !(await page.isVisible('#t-pane-st')) && /No classes yet/.test(await page.textContent('#t-classes')), 'Classes tab: no active class yet, archived one not shown');
  await page.click('.cl-new summary'); await page.fill('#cl-name', '2CE');
  await page.check('.cl-pick input[value="S1"]'); await page.check('.cl-pick input[value="S2"]');
  await page.click('#cl-create'); await page.waitForSelector('.cl-card[data-cid="2CE"]');
  const card = await page.textContent('.cl-card[data-cid="2CE"]');
  check(/2 students: Quynh Anh, Quynh Chi/.test(card) && /Last activity: .* · Quynh (Anh|Chi)/.test(card) && G.table('Classes').some(r => r.class_id === '2CE' && r.student_codes === 'S1, S2'), 'New class "2CE" (Quynh Anh, Quynh Chi) → card with last activity + Classes row');
  check(G.table('Students').find(r => r.student_code === 'S1').classes === '2CE', 'Students.classes mirror "2CE"');
  await page.check('#cl-show-arch'); await page.waitForSelector('.cl-card.archived');
  check(/archived/.test(await page.textContent('.cl-card.archived')), 'Show archived → the archived class with Restore');
  await shot(page, 'r44_classes_list');
  await page.click('.cl-card.archived .cl-rest'); await page.waitForSelector('.cl-card[data-cid="OLD"]:not(.archived)');
  await page.click('.cl-card[data-cid="OLD"] .cl-arch'); await page.waitForSelector('.cl-card[data-cid="OLD"].archived');
  check(G.table('Classes').find(r => r.class_id === 'OLD').active === 'No', 'Restore → Yes, Archive → No (in the Sheet)');

  console.log('[class screen]');
  await page.click('.cl-card[data-cid="2CE"] .cl-open'); await page.waitForSelector('#scr-result.on .cls-go');
  await page.selectOption('#cls-part', 'M2'); await page.waitForFunction(() => document.querySelectorAll('.cls-go .go-row').length === 22);
  const go = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.cls-go .go-row')].map(r => r.innerText.replace(/\s+/g, ' ')), times: [...document.querySelectorAll('.cls-times tr')].map(r => r.innerText.replace(/\s+/g, ' ')),
    sw: document.documentElement.scrollWidth <= innerWidth }));
  check(/^M2-0[1-3] .* 2 · Quynh Anh, Quynh Chi/.test(go.rows[0]) && /none/.test(go.rows[21]), `What to go over: "${go.rows[0].slice(0, 70)}…" first, right ones last`);
  check(go.times.length === 3 && /Quynh Anh .* Math Module 2 · 35:00 \d+\/22 \d+:\d\d \d+:\d\d \d+:\d\d/.test(go.times[1]), 'module times per student: "' + go.times[1] + '"');
  check(go.sw, 'no sideways page scroll');
  await shot(page, 'r44_class_go');
  await page.click('.cls-tabs button[data-tab="grid"]'); await page.waitForSelector('.cls-grid');
  const n0 = await page.$$eval('.cls-grid tr', r => r.length - 1);
  await page.click('.chip-f[data-f="S"]'); const nS = await page.$$eval('.cls-grid tr', r => r.length - 1);
  await page.click('.chip-f[data-f="S"]'); await page.click('.chip-f[data-f="wrong"]'); const nW = await page.$$eval('.cls-grid tr', r => r.length - 1);
  check(n0 === 22 && nS >= 1 && nS < n0 && nW > nS && nW < 22, `Grid: 22 rows; filter Slow → ${nS}, Wrong → ${nW}`);
  await page.click('.chip-f[data-f="wrong"]');
  const cell = await page.evaluate(() => document.querySelector('.cls-grid tr:nth-child(2) td:nth-child(2)').innerText.replace(/\s+/g, ' '));
  check(/^[A-D0-9—]+ \d+:\d\d$/.test(cell.trim()), 'grid cell: answer + time to answer ("' + cell.trim() + '")');
  await shot(page, 'r44_class_grid');

  console.log('[a question in the test screen]');
  await page.click('.cls-grid .qchip[data-qid]'); await page.waitForSelector('#scr-test.going #go-stu', { timeout: 20000 });
  check(/M2-01/.test(await page.textContent('#view-bar')) && (await page.textContent('#fb-name')) === 'Class 2CE' && !(await page.textContent('#go-strip')), '#47: question bar M2-01, nothing shown on open');
  check(!(await page.$('#qwrap .q.on .ch.sel, #qwrap .q.on .ch-row.sel')), 'no student answer pre-selected');
  await page.click('#go-stu'); const strip = await page.textContent('#go-strip');
  check(/Quynh Anh: /.test(strip) && /Quynh Chi: /.test(strip) && /to answer|on it/.test(strip), '"Student\'s answer" → each student\'s answer and time');
  await page.click('#go-show'); await page.waitForSelector('#fb-go .go-key');
  check(/Correct answer: /.test(await page.textContent('#fb-go')), 'Show answer → the key');
  await shot(page, 'r44_class_question');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on .cls-grid');
  check(true, 'back to the class screen (Grid kept)');
  await page.click('#res-home'); await page.waitForSelector('#scr-teacher.on #t-pane-cl:not([hidden]) .cl-card');
  check(true, 'Back to classes');
  await page.context().close();

  console.log('[phone]');
  const { page: ph } = await E.newPage('phone');
  await H.login(ph, E.url, TC.toLowerCase()); await ph.waitForSelector('#scr-teacher.on .t-card');
  await ph.click('#t-tab-cl'); await ph.waitForSelector('.cl-card[data-cid="2CE"]'); await ph.click('.cl-card[data-cid="2CE"] .cl-open'); await ph.waitForSelector('.cls-go');
  check(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the wide tables scroll inside their card, not the page');
  await shot(ph, 'r44_class_phone');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
