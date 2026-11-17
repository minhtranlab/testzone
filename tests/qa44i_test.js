// #44 part 2 (v1.15) integrity on the server: leave merge (blur + hidden = one), < 2 s ignored, open leave closed at the
// part end / by a resume, copy / right-click / full-screen counts, Responses.left_sec + LEFT_THEN_RIGHT (⚠), Sessions.integrity,
// teacher strings ("Left the test: 2× · 1 min 5 s · at M2-05, M2-08"), "—" for attempts without data, nothing for students.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const G = createGas(APP, path.join(WORK, 'gas_sat98'), initialTabs());
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', C = G.ctx, TC = 'TEACH-44-IG';
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');
G.sheets.Settings.rows.push(['teacher_code', TC, '']);

console.log('[integrityOfPart_: hand-made logs]');
const E = (t, type, qid, value) => ({ part: 'M2', t_ms: t * 1000, qid: qid || '', type, value: value === undefined ? null : value });
let g = C.integrityOfPart_([E(0, 'integrity_on'), E(10, 'leave_start', 'q1', 'blur'), E(10.2, 'leave_start', 'q1', 'hidden'), E(40, 'leave_end', 'q1', 30000)]);
check(g.on && g.n === 1 && g.sec === 30 && g.leaves[0].qid === 'q1', 'blur + hidden of the same leave = one leave of 30 s');
g = C.integrityOfPart_([E(0, 'integrity_on'), E(10, 'leave_start', 'q1', 'blur'), E(11.5, 'leave_end', 'q1', 1500)]);
check(g.on && g.n === 0 && g.sec === 0, 'a leave under 2 s is ignored');
g = C.integrityOfPart_([E(0, 'integrity_on'), E(100, 'leave_start', 'q2', 'hidden'), E(130, 'part_end', '', 'timeout')]);
check(g.n === 1 && g.sec === 30, 'a leave still open when the part ends is closed there (30 s)');
g = C.integrityOfPart_([E(0, 'integrity_on'), E(100, 'leave_start', 'q2', 'hidden'), E(160, 'resume', '', 'test'), E(170, 'leave_start', '', 'blur'), E(175, 'leave_end', '', 5000)]);
check(g.n === 2 && g.sec === 65 && g.leaves[1].qid === '', 'page closed while away → ends at the resume (60 s); a leave on the Review page has no question');
g = C.integrityOfPart_([E(0, 'integrity_on'), E(5, 'copy_attempt', 'q1'), E(6, 'context_attempt', 'q1'), E(7, 'context_attempt', 'q3'), E(8, 'fullscreen_exit')]);
check(g.copy === 1 && g.ctx === 2 && g.fs === 1 && g.n === 0, 'copy 1 · right-click 2 · full screen exit 1');
g = C.integrityOfPart_([E(0, 'part_start'), E(5, 'select', 'q1', 'A')]);
check(!g.on, 'no integrity_on → no data (shown as —)');

console.log('[submit: left_sec, LEFT_THEN_RIGHT, Sessions.integrity]');
G.sheets.Assignments.rows.push(['T03', SAT, 'M2', 'Yes', '']);
const fd = C.formData_(SAT), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
const run = (opts) => {
  const x = G.call('getTest', ['T03', SAT, { scope: 'M2', fresh: true }]);
  const qs = x.questions.filter(q => q.part === 'M2'), full = q => fd.questions.find(z => z.qid === q.qid), now = Date.now();
  const st = { seq_parts: ['M2'], current_part: 'M2', phase: 'submitting', part_starts: { M2: now - 34 * 60000 }, ended: { M2: 'submit' }, parts: { M2: { ans: {} } } };
  const ev = [{ part: 'M2', t_ms: 0, qid: '', type: 'part_start', value: 'M2' }]; let t = 0;
  if (opts.ig) ev.push({ part: 'M2', t_ms: 0, qid: '', type: 'integrity_on', value: 'v1.15' });
  const push = (dt, type, qid, value) => ev.push({ part: 'M2', t_ms: Math.round((t + dt) * 1000), qid: qid || '', type, value: value === undefined ? null : value });
  qs.forEach((q, i) => {
    push(0, 'q_enter', q.qid, i + 1);
    if (opts.ig && i === 4) { push(10, 'leave_start', q.qid, 'hidden'); push(55, 'leave_end', q.qid, 45000); push(60, 'select', q.qid, key(full(q))); } // left 45 s, then right → ⚠
    else if (opts.ig && i === 7) { push(5, 'select', q.qid, wrong(full(q))); push(20, 'leave_start', q.qid, 'blur'); push(40, 'leave_end', q.qid, 20000); }   // left 20 s, answer wrong → no ⚠
    else if (opts.ig && i === 9) { push(5, 'select', q.qid, key(full(q))); push(10, 'leave_start', q.qid, 'blur'); push(40, 'leave_end', q.qid, 30000); } // left 30 s AFTER answering → no ⚠
    else if (opts.ig && i === 2) { push(3, 'copy_attempt', q.qid); push(4, 'context_attempt', q.qid); push(6, 'context_attempt', q.qid); push(30, 'select', q.qid, key(full(q))); }
    else push(30, 'select', q.qid, i % 3 ? key(full(q)) : wrong(full(q)));
    const last = ev[ev.length - 1]; st.parts.M2.ans[q.qid] = last.type === 'select' ? last.value : (ev.filter(e => e.qid === q.qid && e.type === 'select').pop() || {}).value;
    t += 65; push(0, 'q_leave', q.qid);
  });
  push(0, 'part_end', '', 'submit');
  const res = G.call('submit', ['T03', x.session.session_id, { state: st, events: ev, ev_from: 0, copy: x.copy }]);
  return { sid: x.session.session_id, qs, res };
};
const A1 = run({ ig: true });
const rows = G.table('Responses').filter(r => r.session_id === A1.sid), row = i => rows.find(r => r.qid === A1.qs[i].qid);
check(Number(row(4).left_sec) === 45 && /LEFT_THEN_RIGHT/.test(row(4).flags), 'M2-05: left 45 s, then answered right → left_sec 45 + LEFT_THEN_RIGHT');
check(Number(row(7).left_sec) === 20 && !/LEFT_THEN_RIGHT/.test(row(7).flags), 'M2-08: left 20 s but wrong → no ⚠');
check(Number(row(9).left_sec) === 30 && !/LEFT_THEN_RIGHT/.test(row(9).flags), 'M2-10: left 30 s after answering → no ⚠');
check(Number(row(0).left_sec) === 0 && rows.every(r => r.left_sec !== ''), 'every question has left_sec (0 = never left on it)');
const sess = G.table('Sessions').find(s => s.session_id === A1.sid), ig = JSON.parse(sess.integrity);
check(ig.M2 && ig.M2.n === 3 && ig.M2.sec === 95 && ig.M2.copy === 1 && ig.M2.ctx === 2 && ig.M2.fs === 0, 'Sessions.integrity M2: 3 leaves, 95 s, copy 1, right-click 2');

console.log('[teacher strings, students see nothing]');
const tv = G.call('teacherResult', [TC.toLowerCase(), A1.sid]);
const mod = tv.sections.find(s => s.id === 'Math').modules[0].ig;
check(mod.left === 'Left the test: 3× · 1 min 35 s · at M2-05, M2-08, M2-10', '"' + mod.left + '"');
check(mod.other === 'Copy attempts: 1 · Right-click attempts: 2', '"' + mod.other + '"');
check(mod.qs.filter(q => q.flag).map(q => q.code).join() === 'M2-05' && mod.qs.length === 3, '⚠ list: M2-05 only');
const rq = tv.review.find(p => p.part === 'M2').questions;
check(rq[4].left_s === 45 && rq[4].left_flag === true && rq[7].left_s === 20 && !rq[7].left_flag && rq[0].left_s === undefined, 'teacher question list: left 45 s ⚠ on M2-05, 20 s on M2-08');
const tr = G.call('teacherReview', [TC.toLowerCase(), A1.sid]);
check(tr.questions.find(q => q.qid === A1.qs[4].qid).left_flag === true, 'teacher question screen: left 45 s ⚠');
const sv = JSON.stringify(G.call('getResult', ['T03', A1.sid])) + JSON.stringify(A1.res) + JSON.stringify(G.call('getReview', ['T03', A1.sid]));
check(!/Left the test|left_s|left_flag|"ig"|Copy attempts|integrity/.test(sv), 'student result + review: no integrity numbers');
const A0 = run({ ig: false });
const old = G.call('teacherResult', [TC.toLowerCase(), A0.sid]).sections.find(s => s.id === 'Math').modules[0].ig;
check(old.left === 'Left the test: —' && old.other === '' && G.table('Sessions').find(s => s.session_id === A0.sid).integrity === '' &&
      G.table('Responses').filter(r => r.session_id === A0.sid).every(r => r.left_sec === ''), 'attempt without integrity events: "Left the test: —" (not 0), left_sec blank');

console.log('[Report tab + class column]');
C.renderReport_(C.ensureReportTab_(), A1.sid);
const RT = G.sheets.Report.rows.map(rw => rw.slice(1, 6).map(v => String(v).replace(/^'/, '')).filter(String).join(' | '));
const iT = RT.findIndex(l => l === 'Test window');
check(iT > 0 && RT[iT + 2] === 'M2 | 3× · 1 min 35 s · at M2-05, M2-08, M2-10 | 1 / 2 | M2-05', 'Report "Test window": "' + RT[iT + 2] + '"');
C.renderReport_(C.ss_().getSheetByName('Report'), A0.sid);
const RT0 = G.sheets.Report.rows.map(rw => rw.slice(1, 6).map(v => String(v).replace(/^'/, '')).filter(String).join(' | '));
check(RT0[RT0.findIndex(l => l === 'Test window') + 2] === 'M2 | — | — | —', 'Report for an attempt without data: "—"');
G.sheets.Classes.rows.push(['IGC', 'IG class', 'T03', 'Yes', '']);
const cv = G.call('teacherClassView', [TC.toLowerCase(), 'IGC', { form_id: SAT, part: 'M2', picks: { T03: A1.sid } }]);
const m = cv.members[0];
check(m.modules[0].left_ig === '3× · 1 min 35 s · copy 1 · right-click 2' && cv.questions[4].cells.T03.left === 45 && cv.questions[4].cells.T03.lf, 'class screen: "Left the test" column "' + m.modules[0].left_ig + '", ⚠ on M2-05');

console.log('[Settings]');
const S = G.table('Settings');
check(S.find(r => r.key === 'integrity_on').value === 'Yes' && S.find(r => r.key === 'integrity_toast').value === 'Yes', 'Settings integrity_on = Yes, integrity_toast = Yes (added by the update)');
S.find(r => r.key === 'integrity_on'); G.sheets.Settings.rows.find(r => r[0] === 'integrity_on')[1] = 'No';
const off = G.call('getTest', ['T03', SAT, { scope: 'M2', fresh: true }]).settings;
check(off.integrity_on === 'No' && off.integrity_toast === 'Yes', 'integrity_on = No reaches the test page');
G.sheets.Settings.rows.find(r => r[0] === 'integrity_on')[1] = 'Yes';

console.log(`\nqa44i_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
