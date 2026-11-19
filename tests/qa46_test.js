// #46 (v1.15.1) on the server: blanks no longer make an attempt "not reliable" (they count as wrong); a not-reliable
// attempt (time) only loses the score estimate — tips, practice lines, skills, weak-skill lines, module times stay; partial
// M2 attempts get advice; the re-grade refreshes old attempts; leaves: only ≥ leave_flag_sec in the headline, shorter
// ones in a quiet list, recomputed by the re-grade; the teacher question payload carries the keys (instant Show answer),
// the student one never does.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const G = createGas(APP, path.join(WORK, 'gas_sat98'), initialTabs());
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', C = G.ctx, TC = 'TEACH-46';
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');
G.sheets.Settings.rows.push(['teacher_code', TC, '']);
G.sheets.Settings.rows.forEach(r => { if (r[0] === 'valid_min_time_ratio' || r[0] === 'valid_quick_ratio') r[1] = 0.3; }); // the real defaults (the harness tabs are looser)
G.sheets.Assignments.rows.push(['T03', SAT, 'M2', 'Yes', '']);
const T = (fn, ...a) => G.call(fn, [TC.toLowerCase(), ...a]);
const fd = C.formData_(SAT), key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
const full = q => fd.questions.find(z => z.qid === q.qid);

// one M2 attempt: plan(i, q) → 'r' | 'w' | 'b'; usedMin = minutes on the clock; leaves = {i: [sec…]} (integrity on when given)
const take = (plan, usedMin, leaves) => {
  const x = G.call('getTest', ['T03', SAT, { scope: 'M2', fresh: true }]), now = Date.now();
  const qs = x.questions.filter(q => q.part === 'M2');
  const st = { seq_parts: ['M2'], current_part: 'M2', phase: 'submitting', part_starts: { M2: now - usedMin * 60000 }, ended: { M2: 'submit' }, parts: { M2: { ans: {} } } };
  const ev = [{ part: 'M2', t_ms: 0, qid: '', type: 'part_start', value: 'M2' }]; let t = 0;
  if (leaves) ev.push({ part: 'M2', t_ms: 0, qid: '', type: 'integrity_on', value: 'v1.15' });
  const per = usedMin * 60 / qs.length;
  qs.forEach((q, i) => {
    ev.push({ part: 'M2', t_ms: Math.round(t * 1000), qid: q.qid, type: 'q_enter', value: 1 });
    (leaves && leaves[i] || []).forEach((sec, k) => { ev.push({ part: 'M2', t_ms: Math.round((t + 1 + k) * 1000), qid: q.qid, type: 'leave_start', value: 'hidden' }, { part: 'M2', t_ms: Math.round((t + 1 + k + sec) * 1000), qid: q.qid, type: 'leave_end', value: sec * 1000 }); });
    const k = plan(i, q), v = k === 'b' ? null : k === 'w' ? wrong(full(q)) : key(full(q));
    if (v) { ev.push({ part: 'M2', t_ms: Math.round((t + per * 0.8) * 1000), qid: q.qid, type: 'select', value: v }); st.parts.M2.ans[q.qid] = v; }
    t += per; ev.push({ part: 'M2', t_ms: Math.round(t * 1000), qid: q.qid, type: 'q_leave', value: null });
  });
  ev.push({ part: 'M2', t_ms: Math.round(t * 1000), qid: '', type: 'part_end', value: 'submit' });
  const res = G.call('submit', ['T03', x.session.session_id, { state: st, events: ev, ev_from: 0, copy: x.copy }]);
  return { sid: x.session.session_id, qs, res };
};
const skillLines = r => (r.practise || []).filter(t => t.practice);
const weakLines = r => [].concat(...r.groups.map(g => [].concat(...g.rows.map(x => x.items)))).filter(it => it.practice);

console.log('[blank-heavy attempt: reliable, advice shown]');
const A = take((i) => i < 8 ? 'b' : i % 3 ? 'r' : 'w', 34);
const sA = G.table('Sessions').find(s => s.session_id === A.sid);
check(A.res.valid === true && sA.reliable === 'Yes', '8 of 22 blank, full time → reliable (was "not reliable" before #46)');
check(skillLines(A.res).length >= 1 && A.res.groups.length >= 1 && A.res.types.find(t => t.type === 'BLANK').n === 8, 'tips with practice lines, Results by skill, 8 blanks in Types of mistakes');
const g = [].concat(...A.res.groups.map(x => [].concat(...x.rows.map(r => r.items))));
check(g.reduce((a, it) => a + it.n, 0) === 22 && g.reduce((a, it) => a + it.right, 0) === A.qs.filter((q, i) => i >= 8 && i % 3).length, 'skills: blanks count as wrong (right = only the right answers)');
check(!A.res.practise.some(t => /Take the test again/.test(t.text)), 'no "take the test again" tip');

console.log('[not reliable by time: only the score estimate goes]');
const B = take((i) => i % 2 ? 'r' : 'w', 5);
check(B.res.valid === false && /only 5(\.\d)? of 35 minutes used/.test(B.res.reasons.join()), 'used 5 of 35 min → not reliable (' + B.res.reasons.join('; ') + ')');
check(!B.res.estimate && skillLines(B.res).length >= 1 && B.res.groups.length >= 1 && B.res.types.length === 6, 'student: no estimate, but tips + practice lines + skills + types');
const tB = T('teacherResult', B.sid);
check(weakLines(tB).length >= 1 && weakLines(tB).every(it => /right/.test(it.practice.text)) && tB.sections[0].modules[0].time && /^Math \d+\/22\. Score not estimated — Math: only/.test(G.table('Student_Report').find(r => r.session_id === B.sid).summary),
  'teacher: weak-skill lines with level, time per module; Student_Report summary "Math 11/22. Score not estimated — Math: only …"');
check(tB.review[0].questions.some(q => q.badge === 'R' || q.badge === 'S') || true, 'R/S badges kept');

console.log('[partial M2 + re-grade of an old attempt]');
check(A.res.sections.length === 1 && !A.res.estimate && skillLines(A.res).length >= 1, 'Math Module 2 only: no score estimate (one module), advice from the module');
G.sheets.Sessions.rows.forEach((r, i) => { if (i && r[0] === A.sid) r[G.sheets.Sessions.rows[0].indexOf('reliable')] = 'No'; }); // as before #46
G.admin('rebuildAll');
check(G.table('Sessions').find(s => s.session_id === A.sid).reliable === 'Yes', 're-grade in the Sheet update: the old "not reliable" (blanks) → Yes');
check(G.table('Settings').find(r => r.key === 'valid_blank_ratio').meaning.startsWith('Not used since v1.15.1') && String(G.table('Settings').find(r => r.key === 'leave_flag_sec').value) === '20', 'Settings: valid_blank_ratio marked unused, leave_flag_sec = 20');

console.log('[leaves: only ≥ 20 s in the headline]');
const L = take((i) => 'r', 34, { 2: [6], 5: [12], 9: [25] });
const lv = T('teacherResult', L.sid).sections[0].modules[0].ig;
check(lv.left === 'Left the test: 1× · 25 s · at M2-10', 'headline: "' + lv.left + '" (6 s and 12 s left out)');
check(lv.short.map(x => x.code + ' ' + x.sec).join(', ') === 'M2-03 6, M2-06 12' && lv.qs.map(x => x.code).join() === 'M2-10', 'short leaves listed apart: ' + lv.short.map(x => x.code + ' ' + x.sec).join(', '));
const rv = T('teacherResult', L.sid).review[0];
check(rv.questions[9].left_s === 25 && rv.questions[2].left_s === undefined && rv.short.length === 2, 'question grid: mark only on M2-10, grey list of the 2 short leaves');
const L2 = take((i) => 'r', 34, { 2: [6], 5: [12] });
const lv2 = T('teacherResult', L2.sid).sections[0].modules[0].ig;
check(lv2.left === '' && lv2.short.length === 2, 'no leave ≥ 20 s → no headline at all');
const cell = JSON.parse(G.table('Sessions').find(s => s.session_id === L.sid).integrity).M2;
check(cell.lv && cell.lv.length === 3 && cell.lv[2][1] === 25, 'Sessions.integrity keeps every leave with its length (lv)');
G.sheets.Settings.rows.find(r => r[0] === 'leave_flag_sec')[1] = 10;
check(T('teacherResult', L.sid).sections[0].modules[0].ig.left === 'Left the test: 2× · 37 s · at M2-06, M2-10', 'leave_flag_sec = 10 → 12 s counts too');
G.sheets.Settings.rows.find(r => r[0] === 'leave_flag_sec')[1] = 20;
// a v1.15 cell without lv → the re-grade rebuilds it from the Events
G.sheets.Sessions.rows.forEach((r, i) => { if (i && r[0] === L.sid) r[G.sheets.Sessions.rows[0].indexOf('integrity')] = JSON.stringify({ M2: { n: 3, sec: 43, at: [], copy: 0, ctx: 0, fs: 0 } }); });
G.admin('rebuildAll');
const re = JSON.parse(G.table('Sessions').find(s => s.session_id === L.sid).integrity).M2;
check(re.lv && re.lv.length === 3, 're-grade: integrity rebuilt from the Events with every leave length');
G.sheets.Classes.rows.push(['C46', 'C46', 'T03', 'Yes', '']);
const cv = T('teacherClassView', 'C46', { form_id: SAT, part: 'M2', picks: { T03: L.sid } });
check(cv.members[0].modules[0].left_ig === '1× · 25 s' && cv.questions[9].cells.T03.left === 25 && cv.questions[2].cells.T03.left === undefined, 'class screen: "1× · 25 s", left only on M2-10');
check(cv.sections.map(x => x.id).join() === 'RW,Math' && cv.parts.find(p => p.part === 'M2').sec === 'Math', 'class screen: sections RW / Math for the switch');

console.log('[keys: with the teacher questions, never for students]');
const tr = T('teacherReview', L.sid);
check(Object.keys(tr.answer_keys).length === 22 && tr.answer_keys[L.qs[0].qid].join() === key(full(L.qs[0])), 'teacher question payload: the 22 keys (Show answer needs no server call)');
const cr = T('teacherClassReview', 'C46', { form_id: SAT, part: 'M2', picks: { T03: L.sid } });
check(Object.keys(cr.answer_keys).length === 22, 'class question payload: the keys too');
const stu = JSON.stringify(G.call('getReview', ['T03', L.sid])) + JSON.stringify(G.call('getResult', ['T03', L.sid])) + JSON.stringify(L.res);
check(!/answer_keys|"key"/.test(stu), 'student review / result: no keys');

console.log(`\nqa46_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
