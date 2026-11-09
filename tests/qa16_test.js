// Ticket #16 (QA fixes v1.7): M1 answers stay text · M2 re-grade after a key change · m1 total · m4 / m7 wording ·
// m5 Report tab redrawn after a new version · m6 server-side answer check · m8 login lock-out. Server only (no browser).
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { APP, WORK } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const LOGS = [];
const G = createGas(APP, path.join(WORK, 'gas_sat98'), initialTabs());
G.ctx.console = { log(m) { LOGS.push(String(m)); }, warn(m) { LOGS.push(String(m)); }, error(m) { LOGS.push(String(m)); }, info() {} };
const FORM = 'MOCK-SAT98';
G.admin('addMissingColumns'); G.admin('importQuestions');
G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
const qs = G.ctx.formDataRaw_(FORM).questions, Q = id => qs.find(q => q.qid === FORM + '-' + id);
const SEQ = ['RW1', 'RW2', 'M1', 'M2'];

/** One submitted attempt for T03: answers = {id: [typed values in order]} (last = final, '' = cleared). */
function attempt(answers, extra = {}) {
  const t = G.call('getTest', ['T03', FORM, { fresh: true }]);
  const sid = t.session.session_id, now = Date.now();
  const st = { seq_parts: SEQ, current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
  const events = [];
  SEQ.forEach((p, i) => {
    st.part_starts[p] = now - (4 - i) * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {}, elim: {}, mark: {} };
    let t0 = 1000;
    qs.filter(q => q.part === p).forEach(q => {
      events.push({ part: p, t_ms: t0, qid: q.qid, type: 'q_enter', value: null });
      const id = q.qid.slice(FORM.length + 1), vals = answers[id] || [];
      vals.forEach((v, k) => events.push({ part: p, t_ms: t0 + 20000 + k * 1000, qid: q.qid, type: v === '' ? 'clear' : (k ? 'change' : 'select'), value: v }));
      if (vals.length && vals[vals.length - 1] !== '') st.parts[p].ans[q.qid] = vals[vals.length - 1];
      t0 += 30000;
    });
    events.push({ part: p, t_ms: t0, qid: '', type: 'part_end', value: 'submit' });
  });
  (extra.mutate || (() => {}))(st, events);
  const res = G.call('submit', ['T03', sid, { state: st, events, ev_from: 0, device: extra.device || 'test' }]);
  return { sid, res };
}
const respOf = sid => G.table('Responses').filter(r => r.session_id === sid);
const rowOf = (sid, id) => respOf(sid).find(r => r.qid === FORM + '-' + id);
const anyFormula = () => Object.entries(G.sheets).filter(([n]) => n !== 'Report').map(([, sh]) => sh).some(sh => sh.rows.some(r => (r || []).some(v => v && typeof v === 'object' && v.formula)));

console.log('[M1 SPR answers stay text]');
const typed = { 'M1-05': ['6/5', '3/4'], 'M1-06': ['12/5'], 'M1-12': ['-2.5'], 'M1-13': ['9/17'], 'M1-19': ['18.0'], 'M1-20': ['7.20'], 'M2-18': ['18.0'], 'M2-21': ['5/2'] };
const mcqR = qs.filter(q => q.part === 'RW1' && q.type !== 'spr').slice(2, 6); // 4 MCQ answered with their key
mcqR.forEach(q => { typed[q.qid.slice(FORM.length + 1)] = [String(q.key)]; });
const A = attempt(typed);
const want = { 'M1-05': '3/4', 'M1-06': '12/5', 'M1-12': '-2.5', 'M1-13': '9/17', 'M1-19': '18.0', 'M1-20': '7.20', 'M2-18': '18.0', 'M2-21': '5/2' };
const bad = Object.keys(want).filter(id => rowOf(A.sid, id).final_answer !== want[id]);
check(!bad.length, 'Responses.final_answer = exactly what was typed: ' + Object.values(want).join(' ') + (bad.length ? ' ✗ ' + bad.map(id => id + '=' + rowOf(A.sid, id).final_answer).join(', ') : ''));
const r05 = rowOf(A.sid, 'M1-05');
check(r05.first_answer === '6/5' && r05.n_changes === 1 && r05.change_pattern === 'W→R' && r05.correct === 1, 'first_answer "6/5" → final "3/4": 1 change, W→R, right');
check(rowOf(A.sid, 'M1-19').first_answer === '18.0' && rowOf(A.sid, 'M1-19').change_pattern === 'none' && rowOf(A.sid, 'M2-21').correct === 1, '18.0 kept as typed (no fake change); 5/2 = 2.5 right');
const evs = G.table('Events').filter(e => e.session_id === A.sid && (e.type === 'select' || e.type === 'change')).map(e => e.value);
check(['6/5', '3/4', '12/5', '-2.5', '9/17', '18.0', '7.20'].every(v => evs.includes(v)) && evs.every(v => typeof v === 'string'), 'Events.value: every typed answer stored as text');
const rv = G.call('getReview', ['T03', A.sid]).questions, rvA = id => rv.find(q => q.qid === FORM + '-' + id).answer;
check(rvA('M1-06') === '12/5' && rvA('M1-13') === '9/17' && rvA('M1-19') === '18.0' && rvA('M1-20') === '7.20', 'review shows "12/5", "9/17", "18.0", "7.20"');

console.log('[M1 repair of old rows (written before v1.7)]');
const hR = G.sheets.Responses.rows[0], iFin = hR.indexOf('final_answer'), iFirst = hR.indexOf('first_answer');
const rawRow = id => G.sheets.Responses.rows.find(r => r[hR.indexOf('session_id')] === A.sid && r[hR.indexOf('qid')] === FORM + '-' + id);
// what the Sheet did to these cells before v1.7: plain values → a date / a number
rawRow('M1-06')[iFin] = new Date('2026-05-12T00:00:00+07:00'); rawRow('M1-06')[iFirst] = new Date('2026-05-12T00:00:00+07:00');
rawRow('M1-19')[iFin] = 18; rawRow('M1-19')[iFirst] = 18;
rawRow('M1-05')[iFirst] = new Date('2026-05-06T00:00:00+07:00');
const hE = G.sheets.Events.rows[0];
G.sheets.Events.rows.forEach(r => { if (r[0] === A.sid && r[hE.indexOf('qid')] === FORM + '-M1-05' && r[hE.indexOf('value')] === '6/5') r[hE.indexOf('value')] = new Date('2026-05-06T00:00:00+07:00'); });
G.sheets.Events.rows.forEach(r => { if (r[0] === A.sid && r[hE.indexOf('qid')] === FORM + '-M1-19' && r[hE.indexOf('type')] === 'select') r[hE.indexOf('value')] = 18; });
check(G.call('getReview', ['T03', A.sid]).questions.find(q => q.qid === FORM + '-M1-19').answer === '18', '(before repair the review shows "18")');
LOGS.length = 0;
const rb = G.admin('rebuildAll');
check(/repaired \d+ answer rows, [1-9]\d* event cells/.test(rb), 'rebuildAll repairs answer cells: ' + rb.split('.')[0]);
check(rowOf(A.sid, 'M1-06').final_answer === '12/5' && rowOf(A.sid, 'M1-19').final_answer === '18.0' && rowOf(A.sid, 'M1-19').first_answer === '18.0', 'final / first answers back to "12/5", "18.0" (from the saved state)');
check(rowOf(A.sid, 'M1-05').first_answer === '6/5' && rowOf(A.sid, 'M1-05').change_pattern === 'W→R', 'first_answer of the changed answer back to "6/5" (event cell repaired, W→R kept)');
check(G.table('Events').filter(e => e.session_id === A.sid).every(e => typeof e.value === 'string' || e.value === ''), 'Events: no date / number cells left');
check(/Re-graded 0 answers/.test(G.admin('rebuildAll')) && /repaired 0 answer rows, 0 event cells/.test(G.admin('rebuildAll')), 'second run: nothing to repair');

console.log('[M2 a key changed in the Questions tab re-grades submitted attempts]');
const s0 = G.table('Sessions').find(s => s.session_id === A.sid), q0 = mcqR[0], id0 = q0.qid;
const resBefore = G.call('getResult', ['T03', A.sid]);
const other = ['A', 'B', 'C', 'D'].find(l => l !== q0.key);
const hQ = G.sheets.Questions.rows[0];
G.sheets.Questions.rows.find(r => r[hQ.indexOf('qid')] === id0)[hQ.indexOf('key')] = other;
G.ctx._formCache = {}; G.ctx._sheetKeys = null;
LOGS.length = 0;
G.ctx.APP_BUILD = 'qa16'; const up = G.ctx.doGet({ parameter: { update: '1' } }).getContent();
check(/^Test Zone update: done/.test(up), 'new version → Sheet update ran: ' + up);
const r0 = respOf(A.sid).find(r => r.qid === id0);
check(r0.correct === 0 && /WRONG/.test(r0.profile), `${id0} answered ${q0.key}: correct 1 → 0, profile ${r0.profile}`);
const s1 = G.table('Sessions').find(s => s.session_id === A.sid);
check(s1.total_correct === s0.total_correct - 1 && s1.score_RW === s0.score_RW - 1 && s1.score_Math === s0.score_Math, `Sessions totals follow: ${s0.total_correct} → ${s1.total_correct}, RW ${s0.score_RW} → ${s1.score_RW}`);
check(LOGS.some(l => l.includes(A.sid + ' · ' + id0 + ': right → wrong')), 'log line: attempt · qid · right → wrong');
check(/re-graded 1 answers in 1 attempts/.test(G.table('Settings').find(s => s.key === 'code_version').meaning), 'Settings.code_version note: re-graded 1 answers in 1 attempts');
const resAfter = G.call('getResult', ['T03', A.sid]);
check(resAfter.total.right === resBefore.total.right - 1 && resAfter.sections.find(x => x.id === 'RW').right === resBefore.sections.find(x => x.id === 'RW').right - 1, `result page: ${resBefore.total.right} → ${resAfter.total.right} right`);
const rvq = G.call('getReview', ['T03', A.sid]).questions.find(q => q.qid === id0);
check(rvq.status === 'wrong', 'review: that question now ✗');
const sr = G.table('Student_Report').find(r => r.session_id === A.sid);
check(sr.total_correct === resAfter.total.right && (!resAfter.estimate || sr.estimated_score.startsWith(String(resAfter.estimate.total.score))), 'Student_Report row + estimate rebuilt: ' + sr.total_correct + ' · ' + sr.estimated_score);
const ts = G.table('Topic_Summary').filter(r => r.student_code === 'T03' && r.form_id === FORM).reduce((a, r) => a + (String(r.topic).includes('.') ? 0 : Number(r.n_correct)), 0);
check(ts === resAfter.total.right, 'Topic_Summary domain rows add up to the new score (' + ts + ')');
G.sheets.Questions.rows.find(r => r[hQ.indexOf('qid')] === id0)[hQ.indexOf('key')] = String(q0.key); G.ctx._formCache = {}; G.ctx._sheetKeys = null;
G.admin('rebuildAll');
check(respOf(A.sid).find(r => r.qid === id0).correct === 1 && G.table('Sessions').find(s => s.session_id === A.sid).total_correct === s0.total_correct, 'key back → right again, totals back');

console.log('[m1 total = shown RW + shown Math · m4 sittings · m7 student wording]');
const e = resAfter.estimate || G.ctx.satEstimate_({ RW1: 19, RW2: 9, M1: 15, M2: 7 });
check(e.total.score === e.RW.score + e.Math.score, `total ${e.total.score} = RW ${e.RW.score} + Math ${e.Math.score}`);
check(G.ctx.studentSittingsNote_(2) === 'You took this test in 2 sittings. Your score on the real test may be lower than this result.', 'sittings note: "You took this test in 2 sittings." (no "different days")');
const types = resAfter.types || [];
check(types.length && !types.some(t => /the student/.test(t.meaning)) && /review/.test(types.find(t => t.type === 'WRONG').meaning), 'result page types speak to the student (no "the student"); Sheet keeps the teacher wording');
check(/with the student/.test(G.ctx.TYPE_EN_.WRONG.m), 'teacher wording unchanged for the Sheet');

console.log('[m5 Report tab redrawn after a new version]');
const rp = G.sheets.Report, RF = G.ctx.RPT_FIRST;
rp.rows[1][1] = 'Lần 2 · old label'; rp.rows[RF - 1] = rp.rows[RF - 1] || []; rp.rows[RF - 1][1] = 'Tóm tắt (old Vietnamese render)';
G.ctx.APP_BUILD = 'qa16b'; G.ctx.doGet({ parameter: { update: '1' } });
const body = () => rp.rows.slice(RF - 1).map(r => (r || []).slice(0, 8).join(' ')).join('\n');
check(!/Tóm tắt|Lần/.test(body()) && /Pick an attempt in cell B2/.test(body()) && rp.rows[1][1] === '', 'stale B2 → old drawing cleared, English placeholder');
const label = rp.rows.slice(1).map(r => r[G.ctx.RPT_LIST_COL - 1]).find(l => l && String(l).includes(FORM));
rp.rows[1][1] = label; G.ctx.APP_BUILD = 'qa16c'; G.ctx.doGet({ parameter: { update: '1' } });
check(/redrawn/.test(G.table('Settings').find(s => s.key === 'code_version').meaning) && /Score|score/.test(body()), 'attempt in B2 → redrawn by the new version');

console.log('[m6 server-side answer check]');
const B = attempt({ 'RW1-01': ['=HYPERLINK("http://x","y")'], 'RW1-02': ['b'], 'M2-04': ['1234567'], 'M2-08': ['abc'], 'M2-11': ['=1/8'], 'M2-17': ['9'] }, {
  device: '=IMPORTXML("http://x")',
  mutate: (st, evs) => { st.parts.RW1.elim[FORM + '-RW1-03'] = ['A', '=1+1', 'z']; st.parts.RW1.ans[FORM + '-M1-01'] = 'A'; st.parts.Bogus = { ans: { x: '=2' } };
    evs.push({ part: 'RW1', t_ms: 99, qid: '=cell', type: '=type', value: '=1+1' }); }
});
check(rowOf(B.sid, 'RW1-01').final_answer === '' && rowOf(B.sid, 'RW1-02').final_answer === 'B', 'MCQ: a formula is dropped (blank), "b" → "B"');
check(rowOf(B.sid, 'M2-04').final_answer === '' && rowOf(B.sid, 'M2-08').final_answer === '' && rowOf(B.sid, 'M2-11').final_answer === '' && rowOf(B.sid, 'M2-17').correct === 1, 'SPR: too long / letters / "=1/8" dropped; "9" kept and right');
check(rowOf(B.sid, 'RW1-03').eliminated === 'A' && !respOf(B.sid).some(r => r.qid === FORM + '-M1-01' && r.part === 'RW1'), 'eliminated: only choice letters; an answer filed under another module is ignored');
check(!anyFormula(), 'no formula in any data tab (Events "=…" values, device, answers all text)');
check(G.table('Events').some(e => e.session_id === B.sid && e.value === '=1+1' && e.type === '=type') && G.table('Sessions').find(s => s.session_id === B.sid).device === '=IMPORTXML("http://x")', '…they are stored as plain text');
check(G.ctx.sprValid_('-0.333') && G.ctx.sprValid_('3/4') && G.ctx.sprValid_('.75') && !G.ctx.sprValid_('1/2/3') && !G.ctx.sprValid_('-') && !G.ctx.sprValid_('123456') && !G.ctx.sprValid_('1e5'), 'sprValid_: SAT box rules');

console.log('[m8 login lock-out]');
const L = (c, d) => G.call('login', [c, d]);
for (let i = 0; i < 9; i++) L('NOPE' + i, 'devA');
const tenth = L('NOPE9', 'devA');
check(!tenth.ok && /Wait 15 minutes/.test(tenth.msg), '10th wrong code on a device → "Too many wrong codes. Wait 15 minutes…"');
check(L('T03', 'devA').locked === true, 'that device: even a right code waits');
check(L('T03', 'devB').ok === true, 'another device: the right code works');
for (let i = 0; i < 10; i++) L('GUESS1', 'dev' + i);
check(L('GUESS1', 'devZ').locked === true && L('T01', 'devZ').ok === true, 'one wrong code tried 10 times (10 devices) → that code is locked; other codes still work');
let thrown = '';
for (let i = 0; i < 11; i++) { try { G.call('listForms', ['XX99']); } catch (err) { thrown = err.message; } }
check(/Too many wrong codes/.test(thrown), 'other server calls with a wrong code are counted too (listForms) → locked');
G.shift(16 * 60000);
check(L('T03', 'devA').ok === true, '16 minutes later the device can sign in again');
G.resetShift();

console.log('[m3 no raw error text for students]');
const html = fs.readFileSync(path.join(APP, 'Client.html'), 'utf8');
const fnSrc = html.match(/var NET_MSG = [^\n]+\n\s*function errMsg\(e\) \{[\s\S]*?\n  \}/)[0];
const c2 = { console: { warn() {} } }; vm.createContext(c2); vm.runInContext(fnSrc, c2);
check(c2.errMsg(new Error('NetworkError: Lỗi kết nối do HTTP 0')) === c2.NET_MSG && c2.errMsg(new Error('Exception: LOGIN: This code is locked. Ask your teacher.')) === 'This code is locked. Ask your teacher.', 'errMsg: library / browser text → one English line; the app\'s own messages unchanged');
check(!/Retrying automatically… \(' \+ esc\(errMsg/.test(html), 'submit retry message has no raw error text');

console.log(`\nqa16_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
