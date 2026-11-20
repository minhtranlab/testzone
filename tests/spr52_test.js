// #52 (v1.17.2) grid-in (SPR) answers follow the official SAT / Bluebook entry rules: grader cases from the SAT directions,
// negatives with 6 characters, fractions that fit / equivalent fractions, 09A M2-11 (441/677: .6514 ✓ 0.651 ✓ .651 ✗ .6515 ✗,
// 441/677 cannot be typed), the input box (5 / 6 characters, allowed characters), "Show answer" prints only typeable
// entries, the re-grade of a past response, no key in a student payload.
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_sat98';
const H = require('./h'); const { check, sleep, shot } = H;
const SAT = 'MOCK-SAT98', TC = 'TEACH-52-SPR';

(async () => {
  const E = await H.setup(); const G = E.st.gas, C = G.ctx; G.admin('addMissingColumns'); G.admin('importQuestions');
  G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                           [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
  G.ctx.doGet({ parameter: { update: '1' } });
  G.sheets.Settings.rows.push(['teacher_code', TC, '']);

  console.log('[grader: the SAT directions]');
  const T = (a, k) => C.sprCorrect_(a, k.split('|'));
  const row = (k, list) => list.map(([a, want]) => T(a, k) === want);
  check(row('2/3', [['2/3', true], ['4/6', true], ['.6666', true], ['.6667', true], ['0.666', true], ['0.667', true], ['.66', false], ['.67', false], ['0.66', false], ['0.67', false]]).every(Boolean),
    '2/3: 2/3, 4/6, .6666, .6667, 0.666, 0.667 right; .66 .67 0.66 0.67 wrong');
  check(row('7/9', [['.7777', true], ['.7778', true], ['0.777', true], ['0.778', true], ['0.77', false], ['.78', false], ['0.78', false]]).every(Boolean), '7/9 (directions table): .7777 .7778 0.777 0.778 right; 0.77 .78 0.78 wrong');
  check(row('5/2', [['2.5', true], ['2.50', true], ['5/2', true], ['10/4', true], ['2 1/2', false], ['21/2', false]]).every(Boolean), '2.5: 2.5, 2.50, 5/2, 10/4 right; mixed "2 1/2" and 21/2 wrong');
  check(row('-2/7', [['-2/7', true], ['-.2857', true], ['-0.285', true], ['-0.286', true], ['-.28', false], ['-0.29', false], ['2/7', false]]).every(Boolean),
    'negative (6 characters): -2/7, -.2857, -0.285, -0.286 right; -.28, -0.29, 2/7 wrong');
  check(row('-1/3', [['-.3333', true], ['-0.333', true], ['-.33333', false], ['-0.3333', false]]).every(Boolean), 'negative: 7 characters can never count (-.33333, -0.3333)');
  check(row('1/2', [['2/4', true], ['.5', true], ['0.50', true], ['1.5/3', false], ['50%', false], ['$.5', false], ['0,5', false], [' 1/2 ', true]]).every(Boolean),
    'equivalent fraction 2/4 right; a decimal inside a fraction, %, $ and a comma wrong');
  check(row('12', [['12', true], ['12.0', true], ['012', true], ['12.01', false], ['123456', false]]).every(Boolean), 'whole numbers: 12, 12.0 right; 12.01, 6 characters wrong');
  console.log('[09A M2-11: key 441/677]');
  const K = '441/677|0.651|.6514';
  check(row(K, [['.6514', true], ['0.651', true], ['.651', false], ['.6515', false], ['0.652', false], ['441/677', false], ['0.6514', false]]).every(Boolean), '.6514 ✓ 0.651 ✓ .651 ✗ .6515 ✗ 0.652 ✗; 441/677 (7 characters) and 0.6514 (6) cannot be typed');
  check(C.sprShow_(K.split('|')).join(' or ') === '.6514 or 0.651', 'Show answer text: ".6514 or 0.651" (never 441/677)');
  const shows = { '3/4|0.75|.75': '3/4 or 0.75', '9/17|0.529|.5294': '9/17 or 0.529', '36/5|7.2|7.200': '36/5 or 7.2', '12.5|25/2': '12.5', '-1': '-1', '2/3': '2/3', '1000/3': '333.3' };
  const bad = Object.keys(shows).filter(k => C.sprShow_(k.split('|')).join(' or ') !== shows[k]);
  check(!bad.length, 'Show answer: the exact answer when it fits (+ one decimal form), else the box-filling decimal: ' + Object.keys(shows).map(k => k + ' → ' + shows[k]).join('; '));
  check(C.sprFill_({ n: 7, d: 9 }).join() === '.7777,.7778,0.777,0.778' && C.sprFill_({ n: -2, d: 7 }).join() === '-.2857,-0.285,-0.286', 'box-filling forms: 7/9 → .7777 .7778 0.777 0.778; -2/7 → -.2857 -0.285 -0.286');

  console.log('[a past response re-graded]');
  const fd = C.formData_(SAT), spr = fd.questions.filter(q => q.part === 'M1' && q.type === 'spr')[0];
  const qrow = G.sheets.Questions.rows.find(r => r[0] === spr.qid), kc = G.sheets.Questions.rows[0].indexOf('key');
  qrow[kc] = K;
  C._sheetKeys = null; Object.keys(C._formCache).forEach(k => delete C._formCache[k]); // the Sheet key wins (Minh's fixes); clear the caches
  G.sheets.Assignments.rows.push(['T03', SAT, 'M1', 'Yes', '']);
  const x = G.call('getTest', ['T03', SAT, { scope: 'M1', fresh: true }]), now = Date.now();
  const st = { seq_parts: ['M1'], current_part: 'M1', phase: 'submitting', part_starts: { M1: now - 30 * 60000 }, ended: { M1: 'submit' }, parts: { M1: { ans: {} } } };
  const ev = [{ part: 'M1', t_ms: 0, qid: '', type: 'part_start', value: 'M1' }];
  x.questions.filter(q => q.part === 'M1').forEach((q, i) => { ev.push({ part: 'M1', t_ms: i * 60000, qid: q.qid, type: 'q_enter', value: 1 });
    const v = q.qid === spr.qid ? '.6514' : null; if (v) { ev.push({ part: 'M1', t_ms: i * 60000 + 30000, qid: q.qid, type: 'select', value: v }); st.parts.M1.ans[q.qid] = v; }
    ev.push({ part: 'M1', t_ms: i * 60000 + 59000, qid: q.qid, type: 'q_leave', value: null }); });
  ev.push({ part: 'M1', t_ms: 22 * 60000, qid: '', type: 'part_end', value: 'submit' });
  G.call('submit', ['T03', x.session.session_id, { state: st, events: ev, ev_from: 0, copy: x.copy }]);
  const R = () => G.table('Responses').find(r => r.session_id === x.session.session_id && r.qid === spr.qid);
  check(String(R().correct) === '1', '".6514" graded right at submit');
  // an old row graded by value: ".651" stored as right (before #52)
  const rh = G.sheets.Responses.rows[0], ri = G.sheets.Responses.rows.findIndex(r => r[0] === x.session.session_id && r[rh.indexOf('qid')] === spr.qid);
  G.sheets.Responses.rows[ri][rh.indexOf('final_answer')] = '.651'; G.sheets.Responses.rows[ri][rh.indexOf('correct')] = 1;
  const sh = G.sheets.Sessions.rows[0], si = G.sheets.Sessions.rows.findIndex(r => r[0] === x.session.session_id), stj = JSON.parse(G.sheets.Sessions.rows[si][sh.indexOf('state_json')]);
  stj.parts.M1.ans[spr.qid] = '.651'; G.sheets.Sessions.rows[si][sh.indexOf('state_json')] = JSON.stringify(stj);
  const log = G.admin('rebuildAll');
  check(String(R().correct) === '0' && /changed: SAT Only MOCK-SAT98-M1-\d+ "\.651" right→wrong/.test(String(log)), 're-grade in the Sheet update: ".651" right → wrong, named in the log ("' + (String(log).match(/changed: [^\n]*/) || [''])[0] + '")');

  console.log('[browser: the grid-in box]');
  G.sheets.Assignments.rows.push(['T04', SAT, 'M1', 'Yes', '']);
  const { page } = await E.newPage('desktop1280');
  await H.login(page, E.url, 'T04'); await page.waitForSelector('#hero-start'); await page.click('#hero-start'); await page.waitForSelector('#btn-begin'); await page.click('#btn-begin'); await page.waitForSelector('#qwrap .q.on');
  for (let i = 1; i < spr.display_no; i++) await page.click('#btn-next');
  await page.waitForSelector('#qwrap .q.on .spr-in');
  const typed = async s => { await page.fill('#qwrap .q.on .spr-in', ''); await page.type('#qwrap .q.on .spr-in', s); await sleep(60); return { v: await page.inputValue('#qwrap .q.on .spr-in'), p: await page.textContent('#qwrap .q.on .spr-out') }; };
  const t1 = await typed('441/677'), t2 = await typed('-.333333'), t3 = await typed('1,5%$ a'), t4 = await typed('.6514'), t5 = await typed('-2-/7.');
  check(t1.v === '441/6' && t2.v === '-.3333' && t3.v === '15' && t4.v === '.6514' && t5.v === '-2/7', 'box: "441/677" stops at 5 characters (' + t1.v + '), "-" allows 6 (' + t2.v + '); only digits . / and a leading - (' + t3.v + ', ' + t5.v + ')');
  check(t4.p === '.6514', 'Answer Preview shows the entry as typed (' + t4.p + ')');
  const dir = await page.textContent('#qwrap .q.on .spr-dir-pane, .spr-dir-pane');
  check(/up to 5 characters for a positive answer and up to 6/.test(dir) && /fraction that does not fit/.test(dir) && /must fill the whole box/.test(dir) && /\.6666, \.6667, 0\.666 or 0\.667/.test(dir) && /Do not type symbols such as %, \$ or a comma/.test(dir),
    'directions: 5 / 6 characters; fraction that does not fit → decimal; truncate or round and fill the box (2/3 example); no symbols');
  await shot(page, 'r52_grid_in_box');
  await page.context().close();

  console.log('[Show answer: teacher; nothing for students]');
  const { page: tp } = await E.newPage('desktop1280');
  await H.login(tp, E.url, TC.toLowerCase()); await tp.waitForSelector('#scr-teacher.on .t-card'); await tp.click('.t-open'); await tp.waitForSelector('#scr-result.on .rgrid');
  await tp.click(`#result-body .rgrid .rcell[data-qid="${spr.qid}"]`); await tp.waitForSelector('#scr-test.going #go-show');
  await tp.click('#go-show'); await sleep(100);
  const ans = (await tp.textContent('#fb-go')).replace(/\s+/g, ' ');
  check(/Correct answer: \.6514 or 0\.651/.test(ans) && !/441\/677/.test(await tp.textContent('#scr-test')), 'teacher Show answer: "' + ans.trim() + '" — no 441/677 anywhere');
  await shot(tp, 'r52_show_answer');
  const tr = G.call('teacherReview', [TC.toLowerCase(), x.session.session_id]);
  check(tr.answer_keys[spr.qid].join() === '.6514,0.651' && G.call('teacherAnswer', [TC.toLowerCase(), x.session.session_id, spr.qid]).key.join() === '.6514,0.651', 'teacher payloads carry the typeable forms only');
  const stu = JSON.stringify(G.call('getReview', ['T03', x.session.session_id])) + JSON.stringify(G.call('getResult', ['T03', x.session.session_id]));
  check(!/answer_keys|"key"|6514|441\/677/.test(stu.replace(/"answer":"[^"]*"/g, '')), 'student review / result: no key');
  await E.close();
  process.exit(H.summary() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
