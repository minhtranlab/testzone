// #35 (v1.12) home + sign-in in the browser (design "Mẫu 2 · Next test focus"): centred sign-in with the 5 chips,
// greeting, hero ("Assigned by your teacher" / "Next test"), "Pick up where you stopped" only with open attempts
// (otherwise the hero spans the width), "All tests" tiles without estimate, Past assignments; desktop 1280 + phone 390.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const FORM = 'MOCK-SAT98';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.ensureAssignments_();
  G.sheets.Students.rows.push(['T12', 'Ben (new)', 'SAT', 'Yes', '']);

  console.log('[sign-in]');
  for (const dev of ['desktop1280', 'phone']) {
    const { page } = await E.newPage(dev);
    await page.goto(E.url); await page.waitForSelector('#login-code');
    const si = await page.evaluate(() => { const h = document.querySelector('.hz-si h1'), f = document.querySelector('.hz-form'), r = f.getBoundingClientRect(), hr = h.getBoundingClientRect();
      return { h: h.textContent, align: getComputedStyle(document.querySelector('.hz-si')).textAlign, chips: [...document.querySelectorAll('.hz-chips span')].map(x => x.textContent),
               centred: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 2 && Math.abs((hr.left + hr.right) / 2 - innerWidth / 2) < 2, ph: document.querySelector('#login-code').placeholder,
               sw: document.documentElement.scrollWidth <= innerWidth }; });
    check(si.h === 'Ready for your next test?' && si.align === 'center' && si.centred && si.ph === 'Student code' && si.sw &&
      si.chips.join(' · ') === 'SAT practice tests · AP Calculus AB · AP Calculus BC · Results by skill · Desmos calculator', `${dev}: centred sign-in, 5 chips (BC listed)`);
    await shot(page, 'r35_signin_' + dev);
    await page.context().close();
  }

  console.log('[new student: hero = first test, full width, no pick-up, no past]');
  for (const dev of ['desktop1280', 'phone']) {
    const { page } = await E.newPage(dev);
    await H.login(page, E.url, 'T12'); await page.waitForSelector('#hero');
    const v = await page.evaluate(() => ({ hello: document.getElementById('home-hello').textContent, eb: document.querySelector('.hz-eyebrow').textContent, solo: document.querySelector('.hz-next').classList.contains('solo'),
      pick: !!document.getElementById('pickup'), past: !!document.querySelector('.hz-past'), tiles: [...document.querySelectorAll('.hz-tiles .form-card')].map(t => t.querySelector('.fc-s').textContent),
      wide: document.getElementById('hero').getBoundingClientRect().width / document.querySelector('.hz-main').getBoundingClientRect().width, sw: document.documentElement.scrollWidth <= innerWidth,
      font: getComputedStyle(document.querySelector('#hero h1')).fontFamily }));
    check(v.hello === 'Hi Ben. Welcome to Test Zone.' && v.eb === 'Next test' && v.solo && !v.pick && !v.past && v.tiles.every(t => t === 'Not started') && v.wide > 0.85 && v.sw && /Bricolage/.test(v.font),
      `${dev}: "${v.hello}", Next test spans the width (${Math.round(v.wide * 100)} %), tiles "Not started", Bricolage titles`);
    await shot(page, 'r35_home_new_' + dev);
    await page.context().close();
  }

  console.log('[T03: assignment hero + pick-up + past]');
  const now = Date.now();
  const x = G.call('getTest', ['T03', FORM, {}]);
  G.call('autosave', ['T03', x.session.session_id, { state: { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'RW1', phase: 'test', part_starts: { RW1: now }, ended: {}, parts: { RW1: { ans: { [x.questions[0].qid]: 'A', [x.questions[1].qid]: 'B' }, elim: {}, mark: {}, hl: {}, cur: 2 } } }, events: [], ev_from: 0, copy: x.copy }]);
  G.sheets.Assignments.rows.push(['T03', FORM, 'M1', 'Yes', '']);
  const y = G.call('getTest', ['T03', FORM, { scope: 'M1' }]);
  const sy = { seq_parts: ['M1'], current_part: 'M1', phase: 'submitting', part_starts: { M1: now - 60000 }, ended: { M1: 'submit' }, parts: { M1: { ans: {} } } };
  G.call('submit', ['T03', y.session.session_id, { state: sy, events: [], ev_from: 0, copy: y.copy }]);
  G.sheets.Assignments.rows.find(r => r[2] === 'M1')[3] = 'No';
  G.sheets.Assignments.rows.push(['T03', FORM, 'M2', 'Yes', '']);
  for (const dev of ['desktop1280', 'phone']) {
    const { page } = await E.newPage(dev);
    await H.login(page, E.url, 'T03'); await page.waitForSelector('#hero');
    const v = await page.evaluate(() => ({ hello: document.getElementById('home-hello').textContent, eb: document.querySelector('.hz-eyebrow').textContent, h1: document.querySelector('#hero h1').textContent,
      clock: document.querySelector('.hz-clock').textContent, btn: document.getElementById('hero-start').textContent, solo: document.querySelector('.hz-next').classList.contains('solo'),
      pick: [...document.querySelectorAll('#pickup .hz-resume')].map(r => r.innerText.replace(/\s+/g, ' ')), bar: (document.querySelector('#pickup .hz-prog i') || {}).style.width,
      tiles: [...document.querySelectorAll('.hz-tiles .form-card')].map(t => t.querySelector('h2').textContent + ' | ' + t.querySelector('.fc-s').textContent),
      past: [...document.querySelectorAll('.hz-past .hz-prow')].map(r => r.innerText.replace(/\s+/g, ' ')), home: document.getElementById('home-list').innerText,
      side: document.querySelector('.hz-next').getBoundingClientRect().height }));
    check(v.hello === 'Hi Alex. Here is your next test.' || /^Hi \S+\. Here is your next test\.$/.test(v.hello), `${dev}: greeting "${v.hello}"`);
    check(v.eb === 'Assigned by your teacher' && v.h1 === 'Math Module 2' && v.clock === '35:00minutes' && v.btn === 'Start Math Module 2' && !v.solo, `${dev}: hero = the assignment "Math Module 2", ring 35:00, "Start Math Module 2", pick-up beside it`);
    check(v.pick.length === 1 && /Reading and Writing · Module 1/.test(v.pick[0]) && /2\/27 answered · 3[12]:\d\d left/.test(v.pick[0]) && v.bar === '7%', `${dev}: pick-up "${v.pick[0]}"`);
    check(v.tiles.length === 1 && /In progress/.test(v.tiles[0]) && !/estimat|\d{3}–\d{3}/i.test(v.home), `${dev}: All tests tile "${v.tiles[0]}" (the assignment is the big block), no estimate on the page`);
    check(v.past.length === 1 && /Math Module 1/.test(v.past[0]) && /View result/.test(v.past[0]), `${dev}: Past assignments "${v.past[0]}"`);
    await shot(page, 'r35_home_assigned_' + dev, { fullPage: true });
    await page.context().close();
  }
  { // actions (after the screenshots: they open attempts)
    let { page } = await E.newPage('desktop1280');
    await H.login(page, E.url, 'T03'); await page.waitForSelector('#pickup');
    await page.click('#pickup .hz-btn'); await page.waitForSelector('#qwrap .q.on', { timeout: 15000 });
    check((await page.textContent('#tb-title')).trim() === 'Section 1, Module 1: Reading and Writing', 'pick-up Continue → back in RW Module 1');
    await page.context().close();
    ({ page } = await E.newPage('desktop1280'));
    await H.login(page, E.url, 'T03'); await page.waitForSelector('#hero-start');
    await page.click('#hero-start'); await page.waitForSelector('#btn-begin');
    check((await page.textContent('#v-directions h1')).trim() === 'Section 2, Module 2: Math' && /Math Module 2/.test(await page.textContent('.test-overview')), 'hero Start → Math Module 2 directions');
    await page.context().close();
  }
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
