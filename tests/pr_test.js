// #44 part 3 (v1.15) "What to practise first": every tip that names a skill gets ONE practice line right under it — RW
// "Practise: [mode] in SAT Vocab Practice", Math "Practise: [skill] in SAT Math Lib — 10 questions"; the [chip] is the link
// (new tab), the app name plain text; no separate SAT Math Lib box; tips without a skill get none. Teacher: a line under
// each weak skill (score + level for SAT Math Lib) and the skill on the question bar. Skill links from Settings patterns.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const path = require('path');
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-44-PR';

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);
  const fd = G.ctx.formData_(SAT), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
  const top = re => { const c = {}; fd.questions.filter(q => re.test(q.part) && /^[EM]$/.test((q.tags || {}).difficulty || '')).forEach(q => { const t = q.tags.topic; c[t] = (c[t] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
  const rwSkill = top(/^RW/), mSkill = top(/^M/);
  const x = G.call('getTest', ['T03', SAT, { fresh: true }]); const seq = ['RW1', 'RW2', 'M1', 'M2'], now = Date.now();
  const st = { seq_parts: seq, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} }, evs = [];
  seq.forEach((p, k) => { st.part_starts[p] = now - (4 - k) * 36 * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {} }; let t = 0;
    x.questions.filter(q => q.part === p).forEach(q => { const f = fd.questions.find(z => z.qid === q.qid), tp = (f.tags || {}).topic;
      const v = tp === rwSkill || tp === mSkill ? wrong(f) : key(f);
      evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: 1 }, { part: p, t_ms: (t + 50) * 1000, qid: q.qid, type: 'select', value: v });
      st.parts[p].ans[q.qid] = v; t += 55; evs.push({ part: p, t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null }); });
    evs.push({ part: p, t_ms: t * 1000, qid: '', type: 'part_end', value: 'submit' }); });
  G.call('submit', ['T03', x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
  const out = H.SHOTS;

  console.log('[student: one practice line under each skill tip]');
  const { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, 'T03'); await page.waitForSelector('.form-card .fc-view');
  await page.click('.form-card .fc-view'); await page.waitForSelector('#scr-result.on .res-list');
  const v = await page.evaluate(() => ({ tips: [...document.querySelectorAll('.res-list > li')].map(li => ({ text: li.firstChild.textContent, lines: [...li.querySelectorAll('.pr-app')].map(p => ({
      t: p.innerText.replace(/\s+/g, ' '), sec: p.getAttribute('data-sec'), href: (p.querySelector('a.pr-link') || {}).href || '', target: (p.querySelector('a.pr-link') || {}).target,
      chipInLink: !!p.querySelector('a.pr-link > mark.app-mode'), appPlain: !p.querySelector('mark.app-mode + *') })) })),
    box: !!document.querySelector('.sml-recs, .sml-line'), hint: /assign (Easy|Medium|Hard)|\d+\/\d+ right/.test(document.querySelector('.res-list').innerText) }));
  const rwTip = v.tips.find(t => t.lines[0] && t.lines[0].sec === 'RW'), mTip = v.tips.find(t => t.lines[0] && t.lines[0].sec === 'Math');
  check(rwTip && /^Practise: .+ in SAT Vocab Practice$/.test(rwTip.lines[0].t) && rwTip.lines[0].href === 'https://minhtranlab.github.io/sat-vocab/' && rwTip.lines[0].target === '_blank' && rwTip.lines[0].chipInLink,
    'RW tip "' + (rwTip || {}).text + '" → "' + (rwTip && rwTip.lines[0].t) + '", the [mode] chip opens SAT Vocab Practice in a new tab');
  check(mTip && /^Practise: .+ in SAT Math Lib — 10 questions$/.test(mTip.lines[0].t) && mTip.lines[0].href === 'https://minhtranlab.github.io/satmath/' && mTip.lines[0].chipInLink,
    'Math tip "' + (mTip || {}).text + '" → "' + (mTip && mTip.lines[0].t) + '", the [skill] chip opens SAT Math Lib');
  check(v.tips.every(t => t.lines.length <= 1) && v.tips.filter(t => !/^(Quick win|Needs work)/.test(t.text)).every(t => !t.lines.length), 'one line per skill tip; tips without a skill have none (' + v.tips.length + ' tips)');
  check(!v.box && !v.hint, 'no separate SAT Math Lib box; no score / level for the student');
  await page.evaluate(() => document.querySelector('.res-list').previousElementSibling.scrollIntoView());
  await sleep(200);
  const bx = await page.evaluate(() => { const a = document.querySelector('.res-list').previousElementSibling.getBoundingClientRect(), b = document.querySelector('.res-list').getBoundingClientRect(); return { y: a.top - 8, h: b.bottom - a.top + 20 }; });
  await page.screenshot({ path: path.join(out, 'r44_student_practise.png'), clip: { x: 0, y: Math.max(0, bx.y), width: 1280, height: Math.min(800, bx.h) } });

  console.log('[Settings: skill links]');
  G.sheets.Settings.rows.find(r => r[0] === 'practice_skill_link')[1] = 'https://minhtranlab.github.io/sat-vocab/?mode={mode}';
  G.sheets.Settings.rows.find(r => r[0] === 'sml_skill_link')[1] = 'https://minhtranlab.github.io/satmath/?skill={code}';
  await page.click('#res-home'); await page.waitForSelector('.form-card .fc-view'); await page.click('.form-card .fc-view'); await page.waitForSelector('#scr-result.on .res-list');
  const hrefs = await page.$$eval('.res-list a.pr-link', a => a.map(x => x.href));
  check(hrefs.some(h => /sat-vocab\/\?mode=[^{]+$/.test(h)) && hrefs.some(h => h === 'https://minhtranlab.github.io/satmath/?skill=' + encodeURIComponent(mSkill)), 'patterns filled → the chip opens that skill (' + hrefs.join(' · ') + ')');
  await page.context().close();

  console.log('[teacher: line under each weak skill, skill on the question bar]');
  const { page: tp } = await E.newPage('desktop1280');
  await H.login(tp, E.url, TC.toLowerCase()); await tp.waitForSelector('#scr-teacher.on .t-card');
  await tp.click('.t-open'); await tp.waitForSelector('#scr-result.on .it-pr');
  const t = await tp.evaluate(() => ({ items: [...document.querySelectorAll('.skill li')].map(li => ({ name: li.querySelector('.it-name').textContent, xy: (li.querySelector('.xy') || li).textContent, pr: (li.querySelector('.it-pr') || {}).innerText || '' })),
    box: !!document.querySelector('.sml-recs') }));
  const weak = t.items.filter(i => i.pr), allRightWithLine = t.items.filter(i => i.pr && /(\d+)\/\1/.test(i.xy));
  check(weak.length >= 2 && weak.some(i => /in SAT Math Lib — \d+\/\d+ right · assign (Easy|Medium|Hard)/.test(i.pr)) && weak.some(i => /in SAT Vocab Practice — \d+\/\d+ right$/.test(i.pr.trim())) && !t.box,
    'teacher: "' + weak.map(i => i.pr.trim()).slice(0, 2).join('" / "') + '"');
  check(!allRightWithLine.length, 'no line under an all-right skill');
  await tp.evaluate(() => { const li = document.querySelector('.it-pr').closest('li'); const d = li.closest('details'); if (d) d.open = true; document.querySelectorAll('.it-pr').forEach(x => { const dd = x.closest('details'); if (dd) dd.open = true; }); li.scrollIntoView({ block: 'center' }); });
  await sleep(200);
  const cb = await tp.evaluate(() => { const c = document.querySelector('.it-pr').closest('.card') || document.querySelector('.it-pr').closest('ul'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await tp.screenshot({ path: path.join(out, 'r44_teacher_weak_skills.png'), clip: { x: Math.max(0, cb.x - 8), y: Math.max(0, cb.y - 8), width: cb.w + 16, height: Math.min(cb.h + 16, 790) } });
  await tp.click('.rgrid .rcell[data-qid]'); await tp.waitForSelector('#view-bar .rv-skill', { timeout: 20000 });
  const bar = await tp.textContent('#view-bar');
  check(/^V1-01 · .+ \([A-Z]{3}\.[A-Z\-]+\)/.test(bar.trim()), 'teacher question bar: "' + bar.trim().split('Student')[0].trim() + '"');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
