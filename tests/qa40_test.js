// #40 (v1.14) time to final answer (A), teacher time per module (B), R / S from the time to answer (C, also re-grade),
// SAT Math Lib recommendation (D). Hand-made event logs on MOCK-SAT98 + MOCK-APCAB.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const G = createGas(APP, path.join(WORK, 'gas_sat98'), initialTabs());
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', AP = 'MOCK-APCAB', C = G.ctx;
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');

/* ---------- A: hand-made event logs ---------- */
console.log('[A: time to final answer from the events]');
const s = x => x * 1000;
const E = (t, type, qid, value) => ({ part: 'M1', t_ms: s(t), qid: qid || '', type, value: value === undefined ? null : value });
const enter = (t, q) => E(t, 'q_enter', q, 1), leave = (t, q) => E(t, 'q_leave', q), pick = (t, q, v) => E(t, 'select', q, v), chg = (t, q, v) => E(t, 'change', q, v);
const ta = (evs, q) => { const d = C.deriveMetrics_(evs, [q || 'q']); const m = d.metrics[q || 'q']; return { ta: m.ttfa_ms === null ? null : m.ttfa_ms / 1000, tot: m.time_ms / 1000, visits: m.visits }; };
let r;
r = ta([enter(0, 'q'), pick(30, 'q', 'A'), leave(50, 'q')]);
check(r.ta === 30 && r.tot === 50, `one visit: answer at 30 s, left at 50 s → time to answer 30 s (total ${r.tot} s)`);
r = ta([enter(0, 'q'), pick(20, 'q', 'A'), leave(40, 'q'), enter(100, 'q'), leave(130, 'q')]);
check(r.ta === 20 && r.tot === 70 && r.visits === 2, 'revisit that does not change the answer: not counted, nor the 20 s after answering (20 s of 70 s)');
r = ta([enter(0, 'q'), pick(20, 'q', 'A'), leave(40, 'q'), enter(100, 'q'), chg(115, 'q', 'B'), leave(130, 'q')]);
check(r.ta === 55, 'revisit that changes the answer: whole first visit (40 s) + the revisit up to the change (15 s) = 55 s');
r = ta([enter(0, 'q'), pick(20, 'q', 'A'), leave(40, 'q'), enter(100, 'q'), leave(130, 'q'), enter(200, 'q'), chg(210, 'q', 'B'), leave(230, 'q')]);
check(r.ta === 50, 'look-only revisit between two answers is left out: 40 + 0 + 10 = 50 s');
r = ta([enter(0, 'q'), leave(30, 'q'), enter(100, 'q'), pick(120, 'q', 'A'), leave(140, 'q')]);
check(r.ta === 50, 'visit before the first answer counts: 30 + 20 = 50 s');
r = ta([enter(0, 'q'), pick(20, 'q', 'A'), leave(40, 'q'), enter(100, 'q'), pick(110, 'q', 'A'), leave(130, 'q')]);
check(r.ta === 20, 'choosing the same answer again is not a change: 20 s');
r = ta([enter(0, 'q'), pick(10, 'q', 'A'), chg(20, 'q', 'B'), chg(30, 'q', 'A'), leave(60, 'q')]);
check(r.ta === 30, 'A → B → A in one visit: up to the last change (30 s)');
r = ta([enter(0, 'q'), leave(30, 'q')]);
check(r.ta === null && r.tot === 30, 'never answered: no time to answer (blank; 30 s kept as time on a blank question)');
r = ta([enter(0, 'q'), pick(10, 'q', 'A'), E(25, 'clear', 'q', 'A'), leave(30, 'q')]);
check(r.ta === null, 'answered, then cleared: blank');
r = ta([enter(0, 'q'), pick(20, 'q', 'A'), leave(30, 'q'), E(30, 'review_open'), E(90, 'q_enter', 'q', 1), chg(95, 'q', 'C'), leave(99, 'q')]);
check(r.ta === 35, 'the Review page is not counted: 30 s + back from Review, changed after 5 s = 35 s');
r = ta([enter(0, 'q'), pick(40, 'q', 'A'), leave(60, 'q'), E(60, 'review_open'), E(200, 'part_end', '', 'submit')]);
check(r.ta === 40 && r.tot === 60, 'time on the Review page after answering: still 40 s');
r = ta([enter(0, 'q'), E(20, 'q_leave', 'q', 'pagehide'), E(500, 'resume', '', 'test'), enter(500, 'q'), pick(510, 'q', 'B'), leave(520, 'q')]);
check(r.ta === 30 && r.visits === 1, 'reload in the middle of a visit: same visit, time while the page was gone not counted (20 + 10 = 30 s)');

/* ---------- submit with events: C (badge), B (module sums), A in Responses ---------- */
console.log('[C + B: submit an attempt with events]');
G.sheets.Assignments.rows.push(['T03', SAT, 'MATH', 'Yes', '']);
const x = G.call('getTest', ['T03', SAT, { scope: 'MATH', fresh: true }]);
const qs = { M1: x.questions.filter(q => q.part === 'M1'), M2: x.questions.filter(q => q.part === 'M2') };
const fd = C.formData_(SAT), key = qid => { const q = fd.questions.find(z => z.qid === qid); return String(Array.isArray(q.key) ? q.key[0] : q.key); };
const wrong = qid => { const q = fd.questions.find(z => z.qid === qid); return q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(qid)); };
const now = Date.now();
const st = { seq_parts: ['M1', 'M2'], current_part: 'M2', phase: 'submitting', part_starts: { M1: now - 70 * 60000, M2: now - 33 * 60000 }, ended: { M1: 'submit', M2: 'submit' },
             part_end_at: { M1: now - 40 * 60000, M2: now - 3 * 60000 }, parts: { M1: { ans: {} }, M2: { ans: {} } } };
const evs = []; let t = 0;
const visit = (part, q, sec, ans, at) => { evs.push({ part, t_ms: s(t), qid: q.qid, type: 'q_enter', value: 1 });
  if (ans) { evs.push({ part, t_ms: s(t + at), qid: q.qid, type: 'select', value: ans }); st.parts[part].ans[q.qid] = ans; }
  t += sec; evs.push({ part, t_ms: s(t), qid: q.qid, type: 'q_leave', value: null }); };
// M1: Q1 right in 30 s then checked for 370 s (total 400 s > slow 128 s) · Q2 right, slow to answer (200 s) · Q3 blank (60 s on it) · rest right in 40 s
visit('M1', qs.M1[0], 400, key(qs.M1[0].qid), 30);
visit('M1', qs.M1[1], 210, key(qs.M1[1].qid), 200);
visit('M1', qs.M1[2], 60, null);
qs.M1.slice(3).forEach(q => visit('M1', q, 45, key(q.qid), 40));
evs.push({ part: 'M1', t_ms: s(t), qid: '', type: 'review_open', value: null }, { part: 'M1', t_ms: s(t + 120), qid: '', type: 'part_end', value: 'submit' });
t = 0;
qs.M2.forEach((q, i) => visit('M2', q, 60, i < 8 ? wrong(q.qid) : key(q.qid), 50));
evs.push({ part: 'M2', t_ms: s(t), qid: '', type: 'part_end', value: 'submit' });
G.call('submit', ['T03', x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
const rows = G.table('Responses').filter(z => z.session_id === x.session.session_id), row = q => rows.find(z => z.qid === q.qid);
const r1 = row(qs.M1[0]), r2 = row(qs.M1[1]), r3 = row(qs.M1[2]);
check(Number(r1.time_total_sec) === 400 && Number(r1.time_to_answer_sec) === 30 && r1.profile === 'RIGHT',
  `C: 400 s on the question but answered after 30 s → ${r1.profile} (not slow), time_to_answer_sec ${r1.time_to_answer_sec}`);
check(Number(r2.time_to_answer_sec) === 200 && r2.profile === 'SLOW_RIGHT', `C: 200 s to answer (slow above 128 s) → ${r2.profile}`);
check(r3.profile === 'BLANK' && r3.time_to_answer_sec === '' && Number(r3.time_total_sec) === 60, 'A: blank question → no time to answer, 60 s kept in time_total_sec');
check(Math.abs(Number(r1.pace_ratio) - 30 / 85) < 0.01, 'pace_ratio = time to answer ÷ target (' + r1.pace_ratio + ')');

console.log('[B: teacher time per module]');
G.sheets.Settings.rows.push(['teacher_code', 'TEACH-40-UI', '']);
const tv = G.call('teacherResult', ['teach-40-ui', x.session.session_id]);
const mods = tv.sections.find(z => z.id === 'Math').modules, m1 = mods.find(z => z.part === 'M1').time, m2 = mods.find(z => z.part === 'M2').time;
const sumTa = part => Math.round(rows.filter(z => z.part === part && z.profile !== 'BLANK').reduce((a, z) => a + Number(z.time_to_answer_sec), 0));
check(m1 && m1.clock === 2100 && m1.solving === sumTa('M1') && m1.checking === m1.used - m1.solving && m1.left === m1.clock - m1.used && m1.blank === 60,
  `M1: clock 35:00 = solving ${m1.solving} s + checking ${m1.checking} s + left ${m1.left} s; blank ${m1.blank} s`);
check([m1, m2].every(m => m.solving + m.checking + m.left === m.clock) && m2.solving === sumTa('M2'), `module sums add up to the clock (M2: ${m2.solving} + ${m2.checking} + ${m2.left} = ${m2.clock})`);
const rq = tv.review.find(z => z.part === 'M1').questions;
check(rq[0].ta_s === 30 && rq[0].time_s === 400 && rq[2].ta_s === undefined, 'teacher question list: time to answer per question (30 s; blank → none)');
const tr = G.call('teacherReview', ['teach-40-ui', x.session.session_id]);
check(tr.questions.find(z => z.qid === qs.M1[0].qid).ta_s === 30, 'teacher review bar: time to answer 30 s');
const sv = G.call('getResult', ['T03', x.session.session_id]), sj = JSON.stringify(sv);
check(!/"time":\{|ta_s|"hint"|solving|checking/.test(sj), 'student result: no module times, no time to answer, no difficulty hint');
check(!/ta_s/.test(JSON.stringify(G.call('getReview', ['T03', x.session.session_id]))), 'student review: no time to answer');

console.log('[C: re-grade recomputes past attempts]');
// as before v1.14: no time_to_answer_sec, profile from the total time
G.sheets.Responses.rows.forEach((rw, i) => { if (i && rw[0] === x.session.session_id) { const h = G.sheets.Responses.rows[0]; rw[h.indexOf('time_to_answer_sec')] = ''; if (rw[h.indexOf('qid')] === qs.M1[0].qid) rw[h.indexOf('profile')] = 'SLOW_RIGHT'; } });
const msg = C.regradeAll_();
const after = G.table('Responses').find(z => z.session_id === x.session.session_id && z.qid === qs.M1[0].qid);
check(after.profile === 'RIGHT' && Number(after.time_to_answer_sec) === 30 && /re-timed \d+ rows/.test(msg), `re-grade: old SLOW_RIGHT → ${after.profile}, time_to_answer_sec ${after.time_to_answer_sec} from the Events ("${msg.replace(/.*; /, '')}")`);
check(G.table('Responses').filter(z => z.session_id === x.session.session_id && z.profile !== 'BLANK').every(z => z.time_to_answer_sec !== ''), 'every answered row has its time to answer again');
const noEv = rows.length; // an attempt without events keeps its total time (fallback)
check(noEv > 0 && C.taOf_({ profile: 'RIGHT', time_total_sec: 77, time_to_answer_sec: '' }) === 77 && C.taOf_({ profile: 'BLANK', time_total_sec: 9 }) === null, 'rows from before v1.14 without events: total time is used');

/* ---------- D: SAT Math Lib ---------- */
console.log('[D: 3 weakest skills]');
const S0 = C.getSettings_();
const Q = (topic, p) => ({ topic, p });
const many = (topic, list) => list.map(p => Q(topic, p));
let rec = C.smlRecs_([].concat(
  many('P.C', ['RIGHT', 'WRONG', 'WRONG', 'WRONG', 'WRONG']),                 // 20 %, no slow / rushed
  many('H.A', ['RIGHT', 'SLOW_WRONG', 'FAST_WRONG', 'WRONG', 'WRONG']),       // 20 %, 2 slow / rushed wrong → before P.C
  many('Q.F', ['WRONG', 'WRONG']),                                            // 0 % but rare → last
  [Q('S.D', 'WRONG')],                                                         // 1 question → skipped
  many('Q.B', ['RIGHT', 'RIGHT', 'WRONG']),                                   // 67 %
  many('S.A', ['RIGHT', 'RIGHT'])                                              // all right → not recommended
), true, S0);
check(rec.items.map(z => z.code).join(',') === 'H.A,P.C,Q.B', '3 weakest: H.A (tie at 20 %, more slow/rushed wrong) · P.C · Q.B; S.D (1 question) and S.A (all right) skipped');
rec = C.smlRecs_([].concat(many('Q.F', ['WRONG', 'WRONG']), many('Q.G', ['WRONG', 'RIGHT']), many('H.B', ['RIGHT', 'RIGHT', 'RIGHT', 'WRONG'])), true, S0);
check(rec.items.map(z => z.code).join(',') === 'H.B,Q.F,Q.G', 'rare skills (Q.F, Q.G) come after every other skill, even at 0 % (' + rec.items.map(z => z.code).join(',') + ')');
check(rec.items[0].name === 'Linear functions' && C.smlLine_(rec, rec.items[0]) === 'Practise in SAT Math Lib: Linear functions (H.B) — 10 questions', 'line: "' + C.smlLine_(rec, rec.items[0]) + '"');
check(C.smlRecs_([Q('INI.CID', 'WRONG'), Q('INI.CID', 'WRONG')], true, S0) === null && C.smlRecs_(many('P.C', ['WRONG', 'WRONG']), false, S0) === null, 'no Math questions / AP → no recommendation');
check(C.smlRecs_(many('P.C', ['WRONG', 'WRONG']), true, Object.assign({}, S0, { sml_app_name: '' })) === null, 'Settings sml_app_name empty → no SAT Math Lib lines');

console.log('[D: difficulty hint within the allowed levels]');
const H = (acc, k) => C.smlHint_(acc, C.SML_SKILLS_[k].allowed);
check(H(0.4, 'P.C') === 'Easy/Medium' && H(0.5, 'P.C') === 'Medium/Hard' && H(0.8, 'P.C') === 'Medium/Hard' && H(0.81, 'P.C') === 'Hard', '< 50 % Easy/Medium · 50–80 % Medium/Hard · > 80 % Hard');
check(H(0.3, 'S.D') === 'Medium' && H(0.3, 'S.C') === 'Medium' && H(0.9, 'S.C') === 'Hard', 'Circles (S.D) / Trig (S.C) have no Easy: < 50 % → Medium');
check(H(0.6, 'Q.D') === 'Medium' && H(0.9, 'Q.E') === 'Medium' && H(0.2, 'Q.E') === 'Easy/Medium', 'Q.D / Q.E have no Hard: 50–80 % → Medium, > 80 % → Medium');
check(C.SML_SKILLS_['Q.F'].rare && C.SML_SKILLS_['Q.G'].rare && Object.keys(C.SML_SKILLS_).length === 19, 'SmlSkills.gs: 19 Math skills, Q.F + Q.G rare');

console.log('[D: on the result pages]');
const stu = sv.sml, tea = tv.sml;
check(stu && stu.app === 'SAT Math Lib' && stu.url === 'https://minhtranlab.github.io/satmath/' && stu.items.length === 3 && stu.items.every(z => /^Practise in SAT Math Lib: .+ \([HPQS]\.[A-G]\) — 10 questions$/.test(z.line) && z.hint === undefined),
  'student: 3 lines "' + (stu && stu.items[0].line) + '", no hint');
check(tea && tea.items.length === 3 && tea.items.every(z => /^(Easy|Medium|Hard)(\/(Medium|Hard))?$/.test(z.hint) && z.of >= 2), 'teacher: same 3 skills + level to assign (' + tea.items.map(z => z.code + ' ' + z.right + '/' + z.of + ' ' + z.hint).join(' · ') + ')');
check(tea.items.map(z => z.code).join() === stu.items.map(z => z.code).join(), 'teacher and student: the same skills');
// a partial attempt: only M2 → only M2 skills
G.sheets.Assignments.rows.push(['T03', SAT, 'M2', 'Yes', '']);
const y = G.call('getTest', ['T03', SAT, { scope: 'M2', fresh: true }]);
const sy = { seq_parts: ['M2'], current_part: 'M2', phase: 'submitting', part_starts: { M2: now - 30 * 60000 }, ended: { M2: 'submit' }, parts: { M2: { ans: {} } } };
y.questions.forEach((q, i) => { sy.parts.M2.ans[q.qid] = i % 2 ? key(q.qid) : wrong(q.qid); });
const yr = G.call('submit', ['T03', y.session.session_id, { state: sy, events: [], ev_from: 0, copy: y.copy }]);
const m2Topics = new Set(y.questions.map(q => (fd.questions.find(z => z.qid === q.qid).tags || {}).topic));
check(yr.sml && yr.sml.items.length >= 1 && yr.sml.items.every(z => m2Topics.has(z.code)), 'partial attempt (M2 only): skills from M2 only (' + yr.sml.items.map(z => z.code).join(', ') + ')');
G.sheets.Assignments.rows.push(['T03', SAT, 'RW1', 'Yes', '']);
const w = G.call('getTest', ['T03', SAT, { scope: 'RW1', fresh: true }]);
const wr = G.call('submit', ['T03', w.session.session_id, { state: { seq_parts: ['RW1'], current_part: 'RW1', phase: 'submitting', part_starts: { RW1: now - 30 * 60000 }, ended: { RW1: 'submit' }, parts: { RW1: { ans: {} } } }, events: [], ev_from: 0, copy: w.copy }]);
check(!wr.sml, 'Reading and Writing only: no SAT Math Lib lines');
const ap = G.call('getTest', ['T01', AP, {}]);
const apr = G.call('submit', ['T01', ap.session.session_id, { state: { seq_parts: ['A', 'B'], current_part: 'B', phase: 'submitting', part_starts: { A: now - 60000, B: now - 30000 }, ended: { A: 'submit', B: 'submit' }, parts: { A: { ans: {} }, B: { ans: {} } } }, events: [], ev_from: 0, copy: ap.copy }]);
check(!apr.sml, 'AP: no SAT Math Lib lines');
const apT = G.call('teacherResult', ['teach-40-ui', ap.session.session_id]);
check(apT.parts.every(p => p.time && p.time.solving + p.time.checking + p.time.left === p.time.clock), 'AP teacher page: time per part adds up too');

console.log('[Report tab + Settings]');
const keys = G.table('Settings').map(z => z.key);
check(keys.includes('sml_app_name') && keys.includes('sml_link') && G.table('Settings').find(z => z.key === 'sml_link').value === 'https://minhtranlab.github.io/satmath/', 'Settings rows sml_app_name + sml_link added by the update');
check(G.sheets.Responses.rows[0].includes('time_to_answer_sec') && G.table('Dictionary').some(z => Object.values(z).includes('time_to_answer_sec')), 'Responses.time_to_answer_sec column + Dictionary row');
const sh = C.ss_().getSheetByName('Report') || C.ensureReportTab_();
C.renderReport_(C.ss_().getSheetByName('Report'), x.session.session_id);
const RT = G.sheets.Report.rows.map(rw => rw.slice(1, 6).map(v => String(v).replace(/^'/, '')).filter(String).join(' | '));
const iT = RT.findIndex(l => l === 'Time per module');
check(iT > 0 && /^Module \(clock\) \| Solving time \| Checking \/ review \| Time left at submit \| On blank questions$/.test(RT[iT + 2]) && /^M1 \(35:00\) \| 16:30 \| \d+:\d\d \| \d+:\d\d \| 1:00$/.test(RT[iT + 3]),
  'Report: "Time per module" table (' + RT[iT + 3] + ')');
const iS = RT.findIndex(l => l === 'Practise in SAT Math Lib');
check(iS > 0 && /^1\. Practise in SAT Math Lib: .+ — 10 questions · \d+\/\d+ right \(\d+%\).* · assign (Easy|Medium|Hard)/.test(RT[iS + 2]) && RT.slice(iS + 2, iS + 5).every(l => /^\d\. Practise in SAT Math Lib/.test(l)),
  'Report: 3 SAT Math Lib lines with the level ("' + RT[iS + 2] + '")');
const iW = RT.findIndex(l => /^Question \| Skill \| Type \| Time to answer/.test(l));
check(iW > 0, 'Report: wrong list column "Time to answer"');

console.log(`\nqa40_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
