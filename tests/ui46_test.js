// #46 (v1.15.1) in the browser: a not-reliable attempt keeps all the advice (only "Score not estimated — …"); teacher
// pages without explanation lines; short leaves (< 20 s) only in a grey list; Show answer from the preloaded keys (no server
// call, < 100 ms); class screen: section switch All · Reading and Writing · Math (remembered), ⚠ in the cells + filter,
// no instruction line.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const path = require('path');
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-46-UI';

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
  // full SAT attempt; minutes per part; plan(part, i) → r / w / b; leaves {part: {i: sec}}
  const take = (code, mins, plan, leaves) => {
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
  take('T03', 4, (p, i) => i % 3 ? 'r' : 'w');                                                   // not reliable (4 min per module)
  take('S1', 30, (p, i) => (i % 4 ? 'r' : 'w'), { RW1: { 2: 25, 4: 6 }, M1: { 1: 12 } });       // 25 s then right → ⚠; 6 s, 12 s → quiet
  take('S2', 30, (p, i) => (i % 3 ? 'r' : (i < 3 ? 'b' : 'w')));
  G.sheets.Classes.rows.push(['2CE', '2CE', 'S1, S2', 'Yes', '']);
  const OUT = H.SHOTS;

  console.log('[student: not reliable → only the score is held back]');
  let { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .fc-view'); await page.click('.form-card .fc-view'); await page.waitForSelector('#scr-result.on .res-score');
  const st = await page.evaluate(() => ({ noest: (document.querySelector('.res-noest') || {}).textContent || '', est: !!document.querySelector('.est, .sec-est'), box: !!document.querySelector('.res-box.bad'),
    tips: [...document.querySelectorAll('.res-list > li')].map(li => li.textContent.replace(/\s+/g, ' ')), skills: document.querySelectorAll('.skill-card').length, types: !!document.querySelector('.res-types') }));
  check(/^Score not estimated — RW: only \d+ of 64 minutes used/.test(st.noest) && !st.est && !st.box, 'one short line: "' + st.noest.slice(0, 70) + '…", no estimate, no red box');
  check(st.tips.length >= 2 && st.tips.some(t => /Practise: /.test(t)) && !st.tips.some(t => /Take the test again/.test(t)) && st.skills === 2 && st.types, 'tips with practice lines, Results by skill (2 sections), Types of mistakes all shown');
  await page.context().close();

  console.log('[teacher result: no explanation lines, quiet short leaves, instant Show answer]');
  ({ page } = await E.newPage('desktop1280'));
  await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
  await page.click('.t-card:has-text("Quynh Anh") .t-open'); await page.waitForSelector('#scr-result.on .rgrid');
  const tv = await page.evaluate(() => ({ body: document.getElementById('result-body').innerText, note: !!document.querySelector('.tgrid-note, .cls-note'),
    left: [...document.querySelectorAll('.mt-ig .ig-left')].map(x => x.textContent), short: [...document.querySelectorAll('.tgrid-short')].map(x => x.textContent), shortColor: (() => { const e = document.querySelector('.tgrid-short'); return e ? getComputedStyle(e).color : ''; })(),
    marks: [...document.querySelectorAll('.rgrid.tgrid .rcell .rl')].map(x => x.textContent + (x.classList.contains('fl') ? 'fl' : '')) }));
  check(!tv.note && !/Open a question|Under each number|Teacher note|From public score charts/.test(tv.body), 'no explanation lines on the teacher result page');
  check(tv.left.length === 1 && /^Left the test: 1× · 25 s · at V1-03$/.test(tv.left[0]) && tv.marks.join() === '!fl', 'headline only for the 25 s leave: "' + tv.left[0] + '", one ⚠ mark');
  check(tv.short.some(s => /V1-05 0:06/.test(s)) && tv.short.some(s => /M1-02 0:12/.test(s)) && tv.shortColor !== 'rgb(0, 0, 0)', 'short leaves only in the grey list: ' + tv.short.join(' / '));
  await page.locator('.res-part').first().screenshot({ path: path.join(OUT, 'r46_teacher_leaves.png') });
  await page.click('.rgrid .rcell[data-qid]'); await page.waitForSelector('#go-show');
  const before = E.st.rpcLog.length;
  const ms = await page.evaluate(() => new Promise(res => { const t0 = performance.now(); document.getElementById('go-show').click();
    const tick = () => document.querySelector('#fb-go .go-key') ? res(performance.now() - t0) : requestAnimationFrame(tick); tick(); }));
  const calls = E.st.rpcLog.slice(before).map(r => r.fn);
  check(ms < 100 && !calls.includes('teacherAnswer') && !calls.includes('teacherFormAnswer'), `Show answer: ${Math.round(ms)} ms, no server call (${calls.join(',') || 'none'})`);
  const studentPayloads = E.st.rpcLog.filter(r => /^(getResult|getReview|listForms|submit|getTest)$/.test(r.fn)).map(r => r.res).join('');
  check(!/answer_keys/.test(studentPayloads), 'no keys in any student call');
  await page.click('#btn-view-back'); await page.waitForSelector('#scr-result.on');
  await page.click('#res-home'); await page.waitForSelector('#scr-teacher.on');

  console.log('[class screen: section switch, ⚠, filter, no instruction line]');
  await page.evaluate(() => { try { localStorage.removeItem('tz.clsSec'); } catch (e) {} });
  await page.click('#t-tab-cl'); await page.waitForSelector('.cl-card[data-cid="2CE"]'); await page.click('.cl-card[data-cid="2CE"] .cl-open'); await page.waitForSelector('.cls-go');
  const v0 = await page.evaluate(() => ({ sec: [...document.querySelectorAll('.cls-sec button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')), rows: document.querySelectorAll('.cls-go .go-row').length, note: !!document.querySelector('.cls-note'), body: document.getElementById('result-body').innerText }));
  check(v0.sec.join() === 'All*,Reading and Writing,Math' && v0.rows === 98 && !v0.note && !/Most students wrong first|Shows the questions/.test(v0.body), 'switch "All · Reading and Writing · Math" (All), 98 rows, no instruction line');
  await page.click('.cls-sec button[data-sec="RW"]'); await page.waitForFunction(() => document.querySelectorAll('.cls-go .go-row').length === 54);
  const v1 = await page.evaluate(() => ({ codes: [...document.querySelectorAll('.cls-go .go-row .qchip')].map(b => b.textContent), times: [...document.querySelectorAll('.cls-times tr')].slice(1).map(r => r.innerText.replace(/\s+/g, ' ')),
    mark: document.querySelector('.cls-go .lf-mark') ? document.querySelector('.cls-go .lf-mark').title : '' }));
  check(v1.codes.every(c => /^V[12]-/.test(c)) && v1.times.every(t => /RW Module/.test(t)), 'Reading and Writing: 54 RW questions, module times RW only');
  check(v1.mark === 'Left the test 0:25, then answered right', '⚠ next to the answer, tooltip "' + v1.mark + '"');
  await shot(page, 'r46_class_rw');
  await page.click('.cls-tabs button[data-tab="grid"]'); await page.waitForSelector('.cls-grid');
  await page.click('.chip-f[data-f="lf"]'); await sleep(200);
  const g = await page.$$eval('.cls-grid tr', r => r.slice(1).map(x => x.innerText.replace(/\s+/g, ' ')));
  check(g.length === 1 && /^V1-03/.test(g[0]) && (await page.$$('.cls-grid .lf-mark')).length === 1, 'Grid filter "⚠ Left the test": V1-03 only, ⚠ in the cell');
  await page.click('.chip-f[data-f="lf"]');
  await page.reload(); await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card');
  await page.click('#t-tab-cl'); await page.waitForSelector('.cl-card[data-cid="2CE"]'); await page.click('.cl-card[data-cid="2CE"] .cl-open'); await page.waitForSelector('.cls-sec');
  check(await page.$eval('.cls-sec button.on', b => b.textContent) === 'Reading and Writing', 'the last section is remembered in this browser');
  await page.selectOption('#cls-part', 'M1'); await page.waitForFunction(() => document.querySelector('#cls-part') && document.querySelector('#cls-part').value === 'M1' && document.querySelector('.cls-sec button.on'));
  check(await page.$eval('.cls-sec button.on', b => b.textContent) === 'Math' && await page.$eval('.cls-sec button', b => b.disabled), 'a picked part decides the switch (M1 → Math)');
  await page.click('.cls-go .qchip, .cls-grid .qchip'); await page.waitForSelector('#go-show');
  const before2 = E.st.rpcLog.length; await page.click('#go-show'); await page.waitForSelector('#fb-go .go-key', { timeout: 500 });
  check(!E.st.rpcLog.slice(before2).some(r => /Answer$/.test(r.fn)), 'class screen Show answer: preloaded too');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
