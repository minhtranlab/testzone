// #48 part 2 (v1.17) the Assign tab on the teacher page: pick a test → parts → students (tick) or a class → due date / note
// → Assign writes Assignments rows (same format + class_id + due); duplicates are skipped; the list turns rows off (active
// = No) / on. Student home: an active assignment shows "Assigned: <test> · <parts>" (+ due date) instead of "Next test"
// (#29 / #35 logic kept: an assignment with an attempt no longer is the big block); a whole test assigned counts too.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-48-AS';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.sheets.Students.rows.push(['S1', 'Quynh Anh', 'SAT', 'Yes', ''], ['S2', 'Quynh Chi', 'SAT', 'Yes', '']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  G.sheets.Classes.rows.push(['2CE', '2CE', 'S1, S2', 'Yes', '']);
  const A = () => G.table('Assignments').filter(r => String(r.form));
  check(G.sheets.Assignments.rows[0].join() === 'student_code,form,parts,active,note,class_id,due', 'Assignments tab: + column "due" (added by the update)');

  const hero = async (code, dev) => {
    const { page } = await E.newPage(dev || 'desktop1280');
    await H.login(page, E.url, code); await page.waitForSelector('#home-list .hz-tiles');
    const h = await page.evaluate(() => { const e = document.querySelector('#hero .hz-eyebrow'); return e ? { eb: e.textContent.trim(), h1: document.querySelector('#hero h1').textContent, of: document.querySelector('#hero .hz-of').textContent } : null; });
    return { page, h };
  };
  let r0 = await hero('S1'); check(r0.h && r0.h.eb === 'Next test', 'before: S1 home shows "Next test"'); await r0.page.context().close();

  console.log('[teacher: Assign tab]');
  const { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
  check((await page.$$eval('.t-tabs button', b => b.map(x => x.textContent))).join() === 'Students,Classes,Assign', 'teacher tabs: Students · Classes · Assign');
  await page.click('#t-tab-as'); await page.waitForSelector('#as-form');
  check(/No assignment is on/.test(await page.textContent('#t-assign')), 'no assignment yet');
  await page.selectOption('#as-form', SAT); await page.waitForSelector('#t-assign input[name="as-part"]');
  const parts = await page.$$eval('#t-assign .as-parts label', l => l.map(x => x.textContent.trim()));
  check(parts.join(' | ') === 'Whole test | Reading and Writing | Math | Reading and Writing · Module 1 | Reading and Writing · Module 2 | Math · Module 1 | Math · Module 2', 'parts: ' + parts.join(' | '));
  await page.click('#as-go'); check(/Pick a class or at least one student/.test(await page.textContent('#as-err')), 'nobody picked → "Pick a class or at least one student."');
  await page.check('#t-assign input[name="as-part"][value="M1"]');
  await page.check('#t-assign input[name="as-cls"][value=""]');
  await page.check('#t-assign .as-st[value="S1"]'); await page.check('#t-assign .as-st[value="T03"]');
  await page.fill('#as-due', '2026-11-21'); await page.fill('#as-note', 'Before Saturday');
  await shot(page, 'r48_assign_form');
  await page.click('#as-go'); await page.waitForFunction(() => /Assigned \(2 rows\)/.test(document.querySelector('#toast').textContent));
  let rows = A();
  check(rows.length === 2 && rows.every(r => r.form === SAT && r.parts === 'M1' && r.active === 'Yes' && r.note === 'Before Saturday' && /2026-11-21$/.test(String(r.due)) && !r.class_id) && rows.map(r => r.student_code).sort().join() === 'S1,T03',
    'Assign → 2 rows: S1 + T03 · ' + SAT + ' · M1 · Yes · note · due 2026-11-21');
  await page.waitForSelector('#t-assign .as-list tr');
  check((await page.$$('#t-assign .as-list tr')).length === 2 && /Math Module 1/.test(await page.textContent('#t-assign .as-list')) && /Due Sat 21 Nov/.test(await page.textContent('#t-assign .as-list')), 'list: 2 current assignments, "Math Module 1", "Due Sat 21 Nov"');
  // again for S1 → skipped
  await page.selectOption('#as-form', SAT); await page.check('#t-assign input[name="as-part"][value="M1"]'); await page.check('#t-assign .as-st[value="S1"]');
  await page.click('#as-go'); await page.waitForFunction(() => /Already assigned: Quynh Anh/.test(document.querySelector('#toast').textContent));
  check(A().length === 2, 'the same assignment again → "Already assigned: Quynh Anh", no new row');
  // a class, whole RW section
  await page.selectOption('#as-form', SAT); await page.check('#t-assign input[name="as-part"][value="RW"]'); await page.check('#t-assign input[name="as-cls"][value="2CE"]');
  check(await page.$eval('#t-assign .as-stu', e => e.hidden), 'a class picked → the student ticks are hidden');
  await page.click('#as-go'); await page.waitForFunction(() => /Assigned \(1 row\)/.test(document.querySelector('#toast').textContent));
  const cr = A().find(r => r.class_id === '2CE');
  check(cr && cr.student_code === '' && cr.parts === 'RW' && cr.active === 'Yes', 'class 2CE → one row with class_id = 2CE, student_code empty, parts RW');
  // whole test to S2
  await page.selectOption('#as-form', SAT); await page.check('#t-assign input[name="as-part"][value="RW, MATH"]'); await page.check('#t-assign input[name="as-cls"][value=""]'); await page.check('#t-assign .as-st[value="S2"]');
  await page.click('#as-go'); await page.waitForFunction(() => /Assigned \(1 row\)/.test(document.querySelector('#toast').textContent));
  check(A().some(r => r.student_code === 'S2' && r.parts === 'RW, MATH'), 'whole test → parts "RW, MATH"');
  await page.waitForSelector('#t-assign .as-list tr:nth-child(4)');
  await shot(page, 'r48_assign_tab');
  check(/Assignments: 4 rows, 4 active/.test(G.admin('checkSheet')) && !/✗ Assignments/.test(G.admin('checkSheet')), 'checkSheet: the 4 rows fit (no ✗)');

  console.log('[student home]');
  let r = await hero('T03');
  check(r.h && /^Assigned: .+ · Math Module 1 · Due Sat 21 Nov$/.test(r.h.eb) && r.h.h1 === 'Math Module 1' && r.h.of === 'Before Saturday', 'T03: "' + r.h.eb + '" (note under it)');
  await shot(r.page, 'r48_home_assigned'); await r.page.context().close();
  r = await hero('S1', 'phone');
  check(r.h && /^Assigned: .+ · Math Module 1/.test(r.h.eb), 'S1 (phone): the first active assignment "' + r.h.eb + '"');
  await shot(r.page, 'r48_home_assigned_phone'); await r.page.context().close();
  r = await hero('S2');
  check(r.h && /^Assigned: .+ · Reading and Writing$|^Assigned: .+ · Whole test$/.test(r.h.eb), 'S2 (class RW + whole test): "' + r.h.eb + '"');
  await r.page.context().close();

  console.log('[turn off / on]');
  await page.click('#t-tab-st'); await page.click('#t-tab-as'); await page.waitForSelector('#t-assign .as-off');
  const RT = () => G.ctx.readTable_('Assignments').rows; const row = RT().find(x => x.student_code === 'T03')._row;
  await page.click(`#t-assign tr[data-row="${row}"] .as-off`); await page.waitForSelector('#t-assign .as-past');
  check(RT().find(x => x._row === row).active === 'No' && /Turned off \(1\)/.test(await page.textContent('#t-assign .as-past summary')), 'Turn off → active = No, listed under "Turned off (1)"');
  r = await hero('T03'); check(!r.h || r.h.eb === 'Next test', 'T03 home: back to "Next test"'); await r.page.context().close();
  await page.click('#t-assign .as-past summary'); await page.click(`#t-assign tr[data-row="${row}"] .as-on`); await page.waitForFunction(() => !document.querySelector('#t-assign .as-past'));
  check(RT().find(x => x._row === row).active === 'Yes', 'Turn on → Yes again');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
