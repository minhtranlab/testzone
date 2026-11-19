// #48 part 1 (v1.17) the result page, student AND teacher: long green bars on a grey track (only the main groups / domains; a skill = name · missed codes · x/y), practice
// lines hidden until the skill name / tip is clicked (no second "x/y right"), "Could be a lucky guess" (right, time to
// answer < lucky_guess_sec, not Standard English Conventions), no narrator / repeated legend lines, students see the time
// to answer under each question number (but no leave / SAT Math Lib level data). Phone: the bar under the label.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-48-RES';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  G.sheets.Settings.rows.forEach(r => { if (r[0] === 'valid_min_time_ratio' || r[0] === 'valid_quick_ratio') r[1] = 0.3; });
  const fd = G.ctx.formData_(SAT), full = qid => fd.questions.find(z => z.qid === qid);
  const key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const now = Date.now(), seq = ['RW1', 'RW2', 'M1', 'M2'];
  // plan(part, i, q) → [r|w|b, seconds to the answer]; every question 60 s on the clock
  const take = (code, plan) => {
    const x = G.call('getTest', [code, SAT, { fresh: true }]);
    const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} }, evs = []; let end = now;
    seq.slice().reverse().forEach(p => { st.part_starts[p] = end - 30 * 60000; end -= 30 * 60000 + 1000; });
    seq.forEach(p => { st.ended[p] = 'submit'; st.parts[p] = { ans: {} }; let t = 0;
      x.questions.filter(q => q.part === p).forEach((q, i) => { const f = full(q.qid), [k, at] = plan(p, i, f), v = k === 'b' ? null : k === 'w' ? wrong(f) : key(f);
        evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: 1 });
        if (v) { evs.push({ part: p, t_ms: (t + at) * 1000, qid: q.qid, type: 'select', value: v }); st.parts[p].ans[q.qid] = v; }
        t += 60; evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null }); });
      evs.push({ part: p, t_ms: t * 1000, qid: '', type: 'part_end', value: 'submit' }); });
    G.call('submit', [code, x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
    return x.session.session_id;
  };
  // fast right answers: RW1-01 (Words in Context, 3 s), RW1 SEC questions (2 s, grammar → not listed), M1-01 (4 s); M1-02 6 s (not listed)
  const secQ = fd.questions.filter(q => q.part === 'RW1' && /^SEC\./.test(q.tags.topic)).map(q => q.qid);
  const plan = (p, i, f) => {
    if (p === 'RW1' && i === 0) return ['r', 3];
    if (secQ.includes(f.qid)) return ['r', 2];
    if (p === 'M1' && i === 0) return ['r', 4];
    if (p === 'M1' && i === 1) return ['r', 6];
    return [i % 3 ? 'r' : (i % 2 ? 'b' : 'w'), 40];
  };
  const sid = take('T03', plan);
  const code = qid => { const q = full(qid); return (q.part[0] === 'R' ? 'V' + q.part[2] : q.part) + '-' + String(q.display_no).padStart(2, '0'); };

  console.log('[server: lucky guess]');
  const res = G.call('getResult', ['T03', sid]);
  const lucky = res.types.find(t => t.type === 'LUCKY');
  check(lucky && lucky.label === 'Could be a lucky guess' && lucky.status === 'right' && !lucky.badge, 'Types of mistakes: a "Could be a lucky guess" row, shown as right, no badge');
  check(lucky.qs.map(q => q.code).join() === ['V1-01', 'M1-01'].join(), 'listed: V1-01 (3 s) + M1-01 (4 s); not the ' + secQ.length + ' grammar answers in 2 s, not M1-02 (6 s): ' + lucky.qs.map(q => q.code).join(', '));
  check(String(G.table('Settings').find(r => r.key === 'lucky_guess_sec').value) === '5' && /lucky guess/.test(G.table('Settings').find(r => r.key === 'lucky_guess_sec').meaning), 'Settings lucky_guess_sec = 5 (added by the update, with its meaning)');
  G.sheets.Settings.rows.find(r => r[0] === 'lucky_guess_sec')[1] = 7;
  check(G.call('getResult', ['T03', sid]).types.find(t => t.type === 'LUCKY').qs.map(q => q.code).join() === 'V1-01,M1-01,M1-02', 'lucky_guess_sec = 7 → M1-02 (6 s) too');
  G.sheets.Settings.rows.find(r => r[0] === 'lucky_guess_sec')[1] = 5;
  const tv = G.call('teacherResult', [TC.toLowerCase(), sid]);
  check(tv.types.find(t => t.type === 'LUCKY').n === 2 && res.score === tv.score && res.total.right === tv.total.right, 'teacher: the same row; score and totals unchanged');
  const sq = [].concat(...res.review.map(p => p.questions));
  check(sq.every(q => q.ta_s !== undefined || q.status === 'blank') && !sq.some(q => 'left_s' in q || 'left_flag' in q), 'student review grid: time to answer on each answered question, no leave data');
  const cv = (G.sheets.Classes.rows.push(['C48', 'C48', 'T03', 'Yes', '']), G.call('teacherClassView', [TC.toLowerCase(), 'C48', { form_id: SAT, part: '', picks: {} }]));
  check(!/lucky|LUCKY/i.test(JSON.stringify(cv)), 'class screen: nothing about lucky guesses');

  for (const who of ['student', 'teacher']) {
    console.log('[' + who + ' result page, desktop]');
    const { page } = await E.newPage('desktop1280');
    if (who === 'student') { await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .fc-view'); await page.click('.form-card .fc-view'); }
    else { await H.login(page, E.url, TC.toLowerCase()); await page.waitForSelector('#scr-teacher.on .t-card'); await page.click('.t-open'); }
    await page.waitForSelector('#scr-result.on .skill-card');
    await page.$$eval('#result-body details.skill', ds => ds.forEach(d => { d.open = true; }));
    const bars = await page.evaluate(() => [...document.querySelectorAll('#result-body .skill summary')].map(s => { const b = s.querySelector('.bar'), i = b.querySelector('i'), bs = getComputedStyle(b), is = getComputedStyle(i);
      return { w: b.getBoundingClientRect().width / s.getBoundingClientRect().width, h: b.getBoundingClientRect().height, track: bs.backgroundColor, fill: is.backgroundColor, xyRight: s.querySelector('.xy').getBoundingClientRect().left > b.getBoundingClientRect().right }; }));
    check(bars.length >= 4 && bars.every(b => b.w > 0.5 && b.h >= 11 && b.fill === 'rgb(22, 163, 74)' && b.track === 'rgb(229, 231, 235)' && b.xyRight), who + ': ' + bars.length + ' domain bars, ' + Math.round(bars[0].w * 100) + '% of the row, ' + bars[0].h + ' px, green on grey, x/y on the right');
    const skb = await page.evaluate(() => [...document.querySelectorAll('#result-body .skill li')].map(li => { const n = li.querySelector('.it-name').getBoundingClientRect(), c = li.querySelector('.chips'), cr = c.getBoundingClientRect();
      return { bar: !!li.querySelector('.bar'), miss: c.children.length, beside: !c.children.length || (cr.left >= n.right - 1 && Math.abs(cr.top - n.top) < 8) }; }));
    check(skb.length > 10 && skb.every(x => !x.bar) && skb.filter(x => x.miss).length >= 5 && skb.every(x => x.beside), who + ': Minh: bars only on the 4 main groups; each skill = name · its missed codes right next to it · x/y (' + skb.filter(x => x.miss).length + ' skills with misses)');
    const pr = await page.evaluate(() => ({ boxes: [...document.querySelectorAll('#result-body .pr-box')].map(b => b.hidden), txt: [...document.querySelectorAll('#result-body .pr-box')].map(b => b.textContent).join(' | ') }));
    check(pr.boxes.length >= 1 && pr.boxes.every(Boolean), who + ': ' + pr.boxes.length + ' practice lines, all hidden');
    check(!/\d+\/\d+ right/.test(pr.txt), who + ': no "x/y right" inside a practice line');
    const tog = await page.$('#result-body .skill li .pr-tog') || await page.$('#result-body .res-list .pr-tog');
    await tog.click(); await sleep(100);
    const open1 = await tog.evaluate(t => !t.closest('li').querySelector('.pr-box').hidden && t.getAttribute('aria-expanded') === 'true');
    await tog.click(); await sleep(100);
    const shut = await tog.evaluate(t => t.closest('li').querySelector('.pr-box').hidden);
    check(open1 && shut, who + ': click the skill name → its practice line; click again → closed');
    if (who === 'teacher') { const mt = await page.evaluateHandle(() => [...document.querySelectorAll('#result-body .skill li .pr-tog')].find(t => /assign/.test(t.closest('li').querySelector('.pr-box').textContent)));
      await mt.click(); check(/SAT Math Lib — assign (Easy|Medium|Hard)/.test(await page.textContent('#result-body .skill li .pr-box:not([hidden])')), 'teacher: a Math line keeps "assign …" (teacher only)'); }
    else { await page.click('#result-body .res-list .pr-tog').catch(() => {}); check(!/assign /.test(await page.textContent('#result-body')), 'student: no "assign …" anywhere'); }
    const body = await page.textContent('#result-body');
    check(!/Open a question|answer shown|whether it was right|The correct answers are not shown/.test(body) && (await page.$$('#result-body .grid-key')).length === 1, who + ': no narrator line, one legend (above the question lists)');
    const lk = await page.evaluate(() => { const tr = [...document.querySelectorAll('.res-types tr')].find(r => /lucky guess/.test(r.textContent)); return tr ? tr.innerText.replace(/\s+/g, ' ') : ''; });
    check(/Could be a lucky guess 2 Right, but answered in under 5 seconds.*V1-01 M1-01/.test(lk), who + ': "' + lk + '"');
    const cells = await page.evaluate(() => [...document.querySelectorAll('#result-body .rgrid .rcell')].map(c => ({ rt: (c.querySelector('.rt') || {}).textContent || '', rl: !!c.querySelector('.rl') })));
    check(cells.length === 98 && cells.filter(c => /^\d:\d\d$/.test(c.rt)).length >= 60 && cells.find(c => c.rt === '0:03'), who + ': time under each question number (' + cells.filter(c => /^\d:\d\d$/.test(c.rt)).length + ' answered, V1-01 0:03)');
    if (who === 'student') check(!cells.some(c => c.rl) && !/Left the test|Solving time|SAT Math Lib.*level|Copy attempts/.test(body), 'student: no leave marks, no module solving/checking split, no level hints');
    await page.$$eval('#result-body details.skill', ds => ds.forEach((d, i) => { d.open = i === 1; }));
    await page.click('#result-body .skill li .pr-tog').catch(() => {});
    await page.locator('.skill-card').first().screenshot({ path: require('path').join(H.SHOTS, 'r48_bars_' + who + '.png') });
    await shot(page, 'r48_result_' + who);
    await page.context().close();
  }
  console.log('[phone]');
  const { page: ph } = await E.newPage('phone');
  await H.login(ph, E.url, 'T03'); await ph.waitForSelector('.form-card .fc-view'); await ph.click('.form-card .fc-view'); await ph.waitForSelector('#scr-result.on .skill-card');
  const pb = await ph.evaluate(() => { const s = document.querySelector('#result-body .skill summary'), b = s.querySelector('.bar'), n = s.querySelector('.sk-name');
    return { w: b.getBoundingClientRect().width / s.getBoundingClientRect().width, below: b.getBoundingClientRect().top >= n.getBoundingClientRect().bottom - 1, page: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  check(pb.w > 0.95 && pb.below && pb.page, 'phone: the bar takes the full width under the label (' + Math.round(pb.w * 100) + '%), no side scroll');
  await ph.locator('.skill-card').first().screenshot({ path: require('path').join(H.SHOTS, 'r48_bars_phone.png') });
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
