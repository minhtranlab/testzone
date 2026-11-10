// #29 (v1.10) Assignments: one student takes only part of a form. Server side: the tab + dropdowns, part codes,
// the limited profile (parts, break, auto start, title), My Tests cards, getTest / submit per part code
// (RW1 only, M2 only, MATH, RW + MATH, AP B only), estimate shown / hidden, Sessions.scope, reports labelled.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.Students.push(['T10', 'Minh (test)', 'ALL', 'Yes', '']);
const G = createGas(APP, path.join(WORK, 'gas_sat98'), tabs);
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', AP = 'MOCK-APCAB';
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
const upd = G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');
const C = G.ctx;

console.log('[the Assignments tab]');
const A = G.sheets.Assignments;
check(A && A.rows[0].join() === 'student_code,form,parts,active,note', 'Sheet update created the tab: student_code · form · parts · active · note');
check(A.rows[1] && A.rows[1][0] === 'T10' && A.rows[1][2] === 'M1' && A.rows[1][3] === 'No', 'one example row for Minh (test): parts M1, active = No');
const dv = c => A.dv['2:' + c] || {};
check(dv(2).kind === 'list' && dv(2).list.includes(SAT) && dv(2).list.includes(AP) && dv(2).allowInvalid === false, 'form = dropdown of the form ids');
check(dv(3).kind === 'list' && ['RW', 'MATH', 'RW1', 'RW2', 'M1', 'M2', 'M1, M2', 'A', 'B'].every(x => dv(3).list.includes(x)) && dv(3).allowInvalid === true, 'parts = dropdown RW, MATH, RW1, RW2, M1, M2, "M1, M2", A, B (other combinations may be typed)');
check(dv(4).kind === 'list' && dv(4).list.join() === 'Yes,No' && dv(1).kind === 'range', 'active = Yes / No; student_code = dropdown from Students');
check(/Assignments: created/.test(String(G.table('Settings').find(r => r.key === 'code_version').meaning)), 'update line says "Assignments: created"');
const dict = G.table('Dictionary').filter(r => r.tab === 'Assignments').map(r => r.column).join();
check(dict === 'student_code,form,parts,active,note' && G.sheets.README.rows.some(r => r[0] === 'Assignments' && /Math Module 1/.test(r[1])), 'README + Dictionary explain the tab');

console.log('[part codes]');
const pS = C.profileFor_(SAT), pA = C.profileFor_(AP);
const pp = (p, t) => { const x = C.parseParts_(p, t); return x ? x.join(',') : 'null'; };
check(pp(pS, 'RW') === 'RW1,RW2' && pp(pS, 'math') === 'M1,M2' && pp(pS, 'M1, M2') === 'M1,M2' && pp(pS, 'M2,RW1') === 'RW1,M2' && pp(pS, 'RW, MATH') === 'RW1,RW2,M1,M2',
  'SAT: RW, MATH, "M1, M2" (any order / case) → parts in the form\'s order');
check(pp(pS, 'A') === 'null' && pp(pS, '') === 'null' && pp(pA, 'B') === 'B' && pp(pA, 'MATH') === 'null', 'codes that do not fit the form → no assignment');
const sp = sc => C.scopedProfile_(pS, sc);
const rw1 = sp('RW1'), m2 = sp('M2'), math = sp('M1,M2'), rwm1 = sp('RW1,M1'), apb = C.scopedProfile_(pA, 'B');
check(rw1.parts.map(p => p.part).join() === 'RW1' && rw1.sections.length === 1 && !rw1.parts[0].break_after_sec && rw1.title.endsWith('— Reading and Writing Module 1'), 'RW1: one module, no break, title "… — Reading and Writing Module 1"');
check(m2.parts[0].auto_start === false && m2.title.endsWith('— Math Module 2'), 'M2 alone: Directions + Begin (no auto start), "… — Math Module 2"');
check(math.parts[1].auto_start === true && math.parts.every(p => !p.break_after_sec) && math.title.endsWith('— Math') && math.n_total === 44, 'MATH: M1 → M2 straight on, no break, "… — Math"');
check(rwm1.parts[0].break_after_sec === 600 && rwm1.parts[0].pause_after === true && rwm1.title.endsWith('— Reading and Writing Module 1 + Math Module 1'), 'RW1 + M1: both sections → the normal 10-min break (with Save and Continue Later)');
check(C.scopedProfile_(pS, 'full') === pS && apb.parts.map(p => p.part).join() === 'B' && apb.title.endsWith('— Part B'), 'full = the form unchanged; AP B → "— Part B"');

// helpers: an assignment row, one attempt played through (rightN per part answered right, 30 s each)
const setRow = (code, form, parts, active) => {
  const h = A.rows[0], r = A.rows.find(x => x[0] === code && x[1] === form && x[2] === parts);
  if (r) r[h.indexOf('active')] = active; else A.rows.push([code, form, parts, active, '']);
};
function play(code, form, opts, rightPer) {
  const t = G.call('getTest', [code, form, Object.assign({ fresh: true }, opts)]);
  const sid = t.session.session_id, seq = t.profile.parts.map(p => p.part), now = Date.now();
  const st = { seq_parts: seq, current_part: seq[seq.length - 1], phase: 'submitting', part_starts: {}, ended: {}, parts: {} }, events = [];
  seq.forEach((p, i) => {
    st.part_starts[p] = now - (seq.length - i) * 40 * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {}, elim: {}, mark: {} };
    let tm = 1000;
    t.questions.filter(q => q.part === p).forEach((q, k) => {
      const key = C.formDataRaw_(form).questions.find(x => x.qid === q.qid).key, ok = k < (rightPer[p] || 0);
      const v = ok ? (Array.isArray(key) ? key[0] : key) : (q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key));
      events.push({ part: p, t_ms: tm, qid: q.qid, type: 'q_enter', value: null }, { part: p, t_ms: tm + 29000, qid: q.qid, type: 'select', value: v }, { part: p, t_ms: tm + 30000, qid: q.qid, type: 'q_leave', value: null });
      st.parts[p].ans[q.qid] = v; tm += 30000;
    });
    events.push({ part: p, t_ms: tm, qid: '', type: 'part_end', value: 'submit' });
  });
  G.call('submit', [code, sid, { state: st, events, ev_from: 0, copy: t.copy }]);
  return { t, sid, row: () => G.table('Sessions').find(r => r.session_id === sid), res: () => G.call('getResult', [code, sid]) };
}

console.log('[RW1 only]');
check(!G.call('listForms', ['T03']).forms.some(f => f.assigned), 'nothing assigned (example row active = No) → My Tests as before');
setRow('T03', SAT, 'RW1', 'Yes');
let home = G.call('listForms', ['T03']);
const card = home.forms[0];
check(card.assigned && card.scope === 'RW1' && card.label === 'Reading and Writing Module 1' && card.parts.length === 1 && card.minutes === 32 && card.attempts.length === 0,
  'card at the top: assigned, "… — Reading and Writing Module 1", 32 min, own (empty) attempt list');
check(home.forms.filter(f => f.form_id === SAT && !f.assigned).length === 1, 'the full test card is still there');
const a1 = play('T03', SAT, { scope: 'RW1' }, { RW1: 20 });
check(a1.t.profile.parts.length === 1 && a1.t.questions.length === 27 && a1.t.questions.every(q => q.part === 'RW1') && !JSON.stringify(a1.t.questions).includes('"key"'), 'getTest: only RW1 (27 questions), no keys');
check(a1.row().scope === 'RW1' && a1.row().status === 'completed' && Number(a1.row().total_questions) === 27 && Number(a1.row().total_correct) === 20, 'Sessions: scope RW1, completed, 20/27');
check(G.table('Responses').filter(r => r.session_id === a1.sid).length === 27, 'Responses: only the 27 questions of RW1');
let r = a1.res();
check(!r.estimate && r.sections.length === 1 && r.sections[0].id === 'RW' && r.sections[0].modules.length === 1 && r.total.n === 27, 'result: no estimated score, RW 20/27 with Module 1 only');
check(r.groups.length === 1 && r.types.length === 5 && r.practise.length >= 1 && r.review.length === 1, 'result: skills, mistake types, What to practise first, one question grid');
check(r.title === 'SAT · Mock SAT 98 — Reading and Writing Module 1' || /— Reading and Writing Module 1$/.test(r.title), 'result title "… — Reading and Writing Module 1" (' + r.title + ')');
home = G.call('listForms', ['T03']);
check(home.forms[0].attempts.length === 1 && home.forms[0].attempts[0].total_questions === 27 && home.forms.find(f => f.form_id === SAT && !f.assigned).attempts.length === 0, 'the attempt is on the assignment card only');

console.log('[M2 only]');
setRow('T03', SAT, 'M2', 'Yes');
const a2 = play('T03', SAT, { scope: 'M2' }, { M2: 11 });
check(a2.t.profile.parts.map(p => p.part).join() === 'M2' && a2.t.profile.parts[0].auto_start === false && a2.row().scope === 'M2', 'M2 only: one module, Directions + Begin, scope M2');
r = a2.res();
check(!r.estimate && r.sections.length === 1 && r.sections[0].id === 'Math' && r.sections[0].right === 11 && r.sections[0].n === 22, 'result: no estimate, Math 11/22');

console.log('[MATH]');
setRow('T03', SAT, 'MATH', 'Yes');
const a3 = play('T03', SAT, { scope: 'M1,M2' }, { M1: 16, M2: 12 });
r = a3.res();
check(a3.row().scope === 'M1,M2' && Number(a3.row().score_Math) === 28 && a3.row().score_RW === '', 'Sessions: scope M1,M2, score_Math 28, no RW score');
const direct = C.satSectionEstimate_('Math', 16, 12);
check(r.estimate && r.estimate.Math && r.estimate.Math.low === direct.low && r.estimate.Math.high === direct.high && !r.estimate.RW && !r.estimate.total,
  `result: Math estimated range only (${r.estimate && r.estimate.Math.low}–${r.estimate && r.estimate.Math.high}, = SC rules), no total`);

console.log('[RW + MATH, assigned to a student outside the SAT track]');
check(!G.call('listForms', ['T01']).forms.some(f => f.form_id === SAT), 'T01 (AP track) does not see the SAT form');
let refused = ''; try { G.call('getTest', ['T01', SAT, {}]); } catch (e) { refused = e.message; }
check(/not part of your program/.test(refused), 'and cannot open it');
setRow('T01', SAT, 'RW, MATH', 'Yes');
home = G.call('listForms', ['T01']);
check(home.forms[0].assigned && home.forms[0].scope === 'full' && home.forms[0].minutes === 134 && home.forms[0].break_min === 10, 'RW + MATH → an "Assigned" card of the whole form (2 h 14 min, 10-min break)');
const a4 = play('T01', SAT, {}, { RW1: 20, RW2: 15, M1: 16, M2: 12 });
r = a4.res();
check(a4.t.profile.parts.length === 4 && a4.t.profile.parts[1].break_after_sec === 600 && a4.row().scope === 'full', 'all 4 modules, the normal break, scope full');
check(r.estimate && r.estimate.total && r.estimate.RW && r.estimate.Math, 'result: total + RW + Math estimate');

console.log('[AP B only]');
setRow('T01', AP, 'B', 'Yes');
home = G.call('listForms', ['T01']);
const apCard = home.forms.find(f => f.assigned && f.form_id === AP);
check(apCard && apCard.scope === 'B' && apCard.parts.map(p => p.part).join() === 'B' && apCard.label === 'Part B', 'AP card "— Part B"');
const a5 = play('T01', AP, { scope: 'B' }, { B: 1 });
r = a5.res();
check(a5.t.profile.parts.map(p => p.part).join() === 'B' && a5.row().scope === 'B' && Number(a5.row().score_B) === 1 && a5.row().score_A === '' && r.parts.length === 1 && r.parts[0].part === 'B',
  'only Part B: scope B, score_B, result limited to Part B');

console.log('[rules]');
setRow('T03', SAT, 'M2', 'No');
let err = ''; try { G.call('getTest', ['T03', SAT, { scope: 'M2', fresh: true }]); } catch (e) { err = e.message; }
check(/no longer open/.test(err) && !G.call('listForms', ['T03']).forms.some(f => f.scope === 'M2'), 'active = No → card gone, a new attempt is refused');
err = ''; try { G.call('getTest', ['T03', SAT, { scope: 'M1' }]); } catch (e) { err = e.message; }
check(/no longer open/.test(err), 'parts that were never assigned → refused');
check(G.call('getResult', ['T03', a2.sid]).ok !== false, 'results of the old M2 attempt still open');
const t6 = G.call('getTest', ['T03', SAT, { scope: 'RW1' }]);
const t6b = G.call('getTest', ['T03', SAT, { resume: t6.session.session_id }]);
check(t6b.resumed && t6b.session.scope === 'RW1' && t6b.questions.length === 27, 'resume keeps the scope (only RW1 again)');
const tFull = G.call('getTest', ['T03', SAT, {}]);
check(!tFull.resumed && tFull.session.scope === 'full' && tFull.questions.length === 98, 'the full-test card does not pick up the open RW1 attempt');

console.log('[validity: the time of the parts done]');
G.sheets.Settings.rows.find(x => x[0] === 'valid_min_time_ratio')[1] = '0.9';
const v1 = G.call('getResult', ['T03', a1.sid]);
check(!v1.valid && v1.reasons.join() === 'RW: only 13.5 of 32 minutes used', 'RW1 alone: limit = 32 min of RW1 (' + v1.reasons.join('; ') + ')');
G.sheets.Settings.rows.find(x => x[0] === 'valid_min_time_ratio')[1] = '0';

console.log('[reports]');
const SR = G.table('Student_Report');
check(SR.find(x => x.session_id === a1.sid).scope === 'Part: Reading and Writing Module 1' && SR.find(x => x.session_id === a4.sid).scope === 'Full test' && SR.find(x => x.session_id === a5.sid).scope === 'Part B',
  'Student_Report.scope: "Part: Reading and Writing Module 1" / "Full test" / AP "Part B"');
check(SR.find(x => x.session_id === a3.sid).estimated_score.startsWith('Math ') && SR.find(x => x.session_id === a1.sid).estimated_score === '', 'Student_Report estimate: Math only for MATH, none for RW1');
const TS = [...new Set(G.table('Topic_Summary').filter(x => x.student_code === 'T03').map(x => x.form_id))];
check(TS.includes(SAT + ' · Part: Reading and Writing Module 1') && TS.includes(SAT + ' · Part: Math') && TS.includes('ALL-SAT') && !TS.includes(SAT), 'Topic_Summary keeps parts apart: ' + TS.join(' | '));
const list = G.sheets.Report.rows.slice(1).map(x => x[17]).filter(String);
check(list.some(l => /Part: Math Module 2/.test(l)) && list.some(l => /MOCK-SAT98 · Attempt/.test(l)), 'Report tab list: "… · Part: Math Module 2 · …"');
const a = C.renderReport_(C.ss_().getSheetByName('Report'), a2.sid);
check(G.sheets.Report.rows.some(x => /Part: Math Module 2 · Attempt 1/.test(String(x[1]))) && a.parts.length === 1, 'Report tab: "… · Part: Math Module 2 · Attempt 1", one module');
G.sheets.Settings.rows.push(['teacher_code', 'TEACH-29-XYZ', '']);
const tv = G.call('teacherOverview', ['TEACH-29-XYZ']).students.find(s => s.code === 'T03').attempts;
check(tv.some(x => x.scope === 'RW1' && /— Reading and Writing Module 1$/.test(x.title)) && tv.some(x => x.scope === 'M1,M2' && /— Math$/.test(x.title)), 'teacher list: attempts labelled with their parts');
const trr = G.call('teacherResult', ['TEACH-29-XYZ', a2.sid]);
check(!trr.estimate && trr.sections.length === 1 && /— Math Module 2/.test(trr.title), 'teacher result: same limited page');
const chk = C.checkSheet_();
check(/Assignments: \d+ rows, \d+ active/.test(chk), 'checkSheet: Assignments line');
A.rows.push(['T03', SAT, 'B', 'Yes', '']);
check(/parts "B" do not fit MOCK-SAT98/.test(C.checkSheet_()), 'checkSheet: a row with parts that do not fit the form is reported');

console.log(`\nqa29_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
