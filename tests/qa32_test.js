// #32 (v1.11) server side: README in Vietnamese with yellow question cells (rewritten by the Sheet update), Sessions.progress
// at every autosave, hide / show attempts (Sessions.hidden), Past assignments on My Tests, "Full test" label + checkSheet
// note for whole-form assignment rows, no "total" for a one-section part.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.README = [['Test Zone – Data'], ['This Sheet is the database of the Test Zone app. The app writes the data; …'], ['Start in the Report tab: pick an attempt in cell B2.', 'old English text']];
tabs.Students.push(['T10', 'Minh (test)', 'SAT', 'Yes', '']);
const G = createGas(APP, path.join(WORK, 'gas_sat98'), tabs);
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', AP = 'MOCK-APCAB', C = G.ctx;
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');

console.log('[README in Vietnamese, yellow question cells]');
const R = G.sheets.README, rows = R.rows.filter(r => (r || []).some(String));
const Qs = ['Xem kết quả một bài ở đâu?', 'Danh sách mọi bài của mọi em?', 'Xem từng câu em chọn gì, đúng sai?', 'Học sinh đang làm thì xem ở đâu?',
            'Bài "paused" là gì?', 'Ẩn bài cũ / bài thử?', 'Giao một phần đề?', 'Sửa đáp án?'];
const qRows = Qs.map(q => R.rows.findIndex(r => r && r[0] === q) + 1);
check(qRows.every(n => n > 0) && !R.rows.some(r => r && /old English text|database of the Test Zone app/.test(r.join(' '))), 'the Sheet update rewrote README: Minh\'s 8 questions, the old English rows are gone');
const fmt = (r, c) => R.fmt[r + ':' + c] || {};
check(qRows.every(n => fmt(n, 1).bg === '#fff2cc' && fmt(n, 2).bg === '#fff2cc' && fmt(n, 1).bold === true), 'each question row: light-yellow cells, question in bold');
check(qRows[0] <= 3 && /Report: chọn bài ở ô B2/.test(R.rows[qRows[0] - 1][1]) && /Student_Report/.test(R.rows[qRows[1] - 1][1]) && /progress/.test(R.rows[qRows[3] - 1][1]) && /Hide attempts/.test(R.rows[qRows[5] - 1][1]) && /Re-grade after a key change/.test(R.rows[qRows[7] - 1][1]),
  'answers: Report B2, Student_Report, Sessions progress, Hide attempts…, Re-grade after a key change');
check(rows.length <= 32 && R.rows.some(r => r && r[0] === 'Các tab khác') && !fmt(qRows[7] + 2, 1).bg, 'about one screen (' + rows.length + ' rows), then "Các tab khác" without yellow');
C.syncSheetTexts_();
check(R.rows.filter(r => r && r[0] === 'Sửa đáp án?').length === 1 && fmt(qRows[0], 1).bg === '#fff2cc', 'a second update writes the same README (no old text, still yellow)');
check(C.checkSheet_().indexOf('✗ README') < 0, 'checkSheet happy with README');

console.log('[Sessions.progress at every autosave]');
const t = G.call('getTest', ['T03', SAT, {}]), sid = t.session.session_id, now = Date.now();
const qM1 = t.questions.filter(q => q.part === 'M1' && q.type !== 'spr');
const row = () => G.table('Sessions').find(r => r.session_id === sid);
const st = { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'M1', phase: 'test', part_starts: { RW1: now - 80 * 60000, RW2: now - 48 * 60000, M1: now - (35 * 60 - 750) * 1000 },
  ended: { RW1: 'submit', RW2: 'submit' }, parts: { M1: { ans: {}, elim: {}, mark: {}, cur: 14 } } };
qM1.slice(0, 14).forEach(q => { st.parts.M1.ans[q.qid] = 'A'; });
G.call('autosave', ['T03', sid, { state: st, events: [], ev_from: 0, copy: t.copy }]);
check(/^M1 · 14\/22 answered · Q15 · 3[45]:\d\d left$/.test(row().progress) && row().last_saved_at, 'during M1: "' + row().progress + '", last_saved_at kept');
check(!G.table('Responses').some(r => r.session_id === sid), 'Responses rows still only at submit');
const st2 = JSON.parse(JSON.stringify(st)); st2.current_part = 'M2'; delete st2.part_starts.M1; st2.part_starts.M1 = now - 40 * 60000; st2.ended.M1 = 'submit'; st2.phase = 'directions';
G.call('autosave', ['T03', sid, { state: st2, events: [], ev_from: 0, copy: t.copy }]);
check(row().progress === 'M2 · not started (directions)', 'before Begin: "' + row().progress + '"');
const tB = G.call('getTest', ['T03', SAT, { fresh: true }]), sB = tB.session.session_id;
const stB = { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'M1', phase: 'break', break_until: now + 450000, part_starts: { RW1: now - 30 * 60000, RW2: now - 10 * 60000 }, ended: { RW1: 'submit', RW2: 'submit' }, parts: {} };
G.call('autosave', ['T03', sB, { state: stB, events: [], ev_from: 0, copy: tB.copy }]);
const rowB = () => G.table('Sessions').find(r => r.session_id === sB);
check(/^Break before Math · 7:[23]\d left$/.test(rowB().progress), 'break: "' + rowB().progress + '"');
G.call('autosave', ['T03', sB, { state: stB, events: [], ev_from: 0, copy: tB.copy, pause: true }]);
check(rowB().status === 'paused' && rowB().progress === 'Paused before Math', 'Save and Continue Later: paused, "Paused before Math"');
const tA = G.call('getTest', ['T01', AP, {}]), sA = tA.session.session_id;
G.call('autosave', ['T01', sA, { state: { seq_parts: ['A', 'B'], current_part: 'A', phase: 'test', part_starts: { A: now - 60000 }, ended: {}, parts: { A: { ans: { [tA.questions[0].qid]: 'B' }, cur: 1 } } }, events: [], ev_from: 0, copy: tA.copy }]);
check(/^Part A · 1\/3 answered · Q2 · [56]:\d\d left$/.test(G.table('Sessions').find(r => r.session_id === sA).progress), 'AP: "' + G.table('Sessions').find(r => r.session_id === sA).progress + '"');
// submit → "Submitted"
const fin = { seq_parts: ['A', 'B'], current_part: 'B', phase: 'submitting', part_starts: { A: now - 120000, B: now - 60000 }, ended: { A: 'submit', B: 'submit' }, parts: { A: { ans: {} }, B: { ans: {} } } };
G.call('submit', ['T01', sA, { state: fin, events: [], ev_from: 0, copy: tA.copy }]);
check(G.table('Sessions').find(r => r.session_id === sA).progress === 'Submitted', 'after submit: "Submitted"');

console.log('[hide / show attempts]');
// two submitted SAT attempts for Minh (test) (T10) and one for T03
const play = (code, form) => { const x = G.call('getTest', [code, form, { fresh: true }]); const seq = x.profile.parts.map(p => p.part);
  const s = { seq_parts: seq, current_part: seq[seq.length - 1], phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
  seq.forEach((p, i) => { s.part_starts[p] = now - (seq.length - i) * 60000; s.ended[p] = 'submit'; s.parts[p] = { ans: {} }; });
  G.call('submit', [code, x.session.session_id, { state: s, events: [], ev_from: 0, copy: x.copy }]); return x.session.session_id; };
const m1 = play('T10', SAT), m2 = play('T10', SAT), o1 = play('T01', AP);
const inReport = id => G.sheets.Report.rows.slice(1).some(r => r[18] === id);
const inSR = id => G.table('Student_Report').some(r => r.session_id === id);
const inTeacher = id => { G.sheets.Settings.rows.push(['teacher_code', 'TEACH-32', '']); return G.call('teacherOverview', ['TEACH-32']).students.some(s => s.attempts.some(a => a.session_id === id)); };
check(inReport(m1) && inSR(m1) && inTeacher(m1) && G.table('Topic_Summary').some(r => r.student_code === 'T10'), 'before: Minh (test) attempts in Report list, Student_Report, Topic_Summary, teacher list');
let n = C.setHidden_({ code: 'T10' }, true);
const hRows = G.table('Sessions').filter(r => r.student_code === 'T10');
check(n === 2 && hRows.every(r => r.hidden === 'Yes'), 'hide by student code: 2 attempts → Sessions.hidden = Yes');
check(!inReport(m1) && !inReport(m2) && !inSR(m1) && !inTeacher(m2) && !G.table('Topic_Summary').some(r => r.student_code === 'T10'), 'hidden: not in Report B2 list, Student_Report, Topic_Summary, teacher list');
check(G.table('Responses').some(r => r.session_id === m1) && hRows.length === 2 && inReport(o1) && inSR(o1), 'raw rows kept; other students untouched');
check(G.call('listForms', ['T10']).forms.find(f => f.form_id === SAT).attempts.length === 2, 'the student\'s own My Tests still lists the attempt');
// hide the attempt picked in Report!B2
const lab = G.sheets.Report.rows.slice(1).find(r => r[18] === o1)[17];
G.sheets.Report.rows[1][1] = lab;
check(C.pickedSessionId_() === o1 && C.setHidden_({ session_id: C.pickedSessionId_() }, true) === 1 && !inReport(o1) && !inSR(o1), 'hide the attempt picked in B2 (only that one)');
n = C.setHidden_({ code: 'T10' }, false);
check(n === 2 && inReport(m1) && inSR(m2) && !inReport(o1), 'Show hidden attempts (student code): back in the lists; the other hidden one stays hidden');
check(C.setHidden_({ all: true }, false) === 1 && inReport(o1), 'Show hidden attempts ALL');
check(C.checkSheet_().indexOf('✗ Sessions') < 0 && G.sheets.Sessions.rows[0].includes('progress') && G.sheets.Sessions.rows[0].includes('hidden'), 'Sessions has progress + hidden columns; checkSheet OK');

console.log('[Past assignments, Full test label, one-section part]');
G.sheets.Assignments.rows.push(['T03', SAT, 'M1', 'Yes', '']);
const x1 = G.call('getTest', ['T03', SAT, { scope: 'M1', fresh: true }]);
G.call('submit', ['T03', x1.session.session_id, { state: { seq_parts: ['M1'], current_part: 'M1', phase: 'submitting', part_starts: { M1: now - 60000 }, ended: { M1: 'submit' }, parts: { M1: { ans: {} } } }, events: [], ev_from: 0, copy: x1.copy }]);
G.sheets.Assignments.rows.find(r => r[0] === 'T03' && r[2] === 'M1')[3] = 'No';
const h = G.call('listForms', ['T03']);
check(!h.forms.some(f => f.assigned) && h.past.length === 1 && /— Math Module 1$/.test(h.past[0].title) && h.past[0].attempts.length === 1 && h.past[0].attempts[0].status === 'completed', 'active = No → card gone, the attempt under "Past assignments" (' + h.past[0].title + ')');
check(G.call('getResult', ['T03', h.past[0].attempts[0].session_id]).ok !== false, '… and its result still opens');
check(G.table('Student_Report').find(r => r.session_id === x1.session.session_id).summary.startsWith('Math 0/22. ') , 'one-section part: summary "Math 0/22." (no "total")');
G.sheets.Assignments.rows.push(['T01', SAT, 'RW, MATH', 'Yes', '']);
const full = G.call('listForms', ['T01']).forms.find(f => f.assigned);
check(full && full.label === 'Full test' && / — Full test$/.test(full.title), 'whole form assigned (outside the track): "… — Full test"');
check(/⚠ Assignments row \d+: parts "RW, MATH" = the whole form \(Full test\)/.test(C.checkSheet_()) && !/→ \d+ problem/.test(C.checkSheet_()), 'checkSheet notes the whole-form row (not counted as a problem)');

console.log(`\nqa32_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
