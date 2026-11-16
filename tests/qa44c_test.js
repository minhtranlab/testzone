// #44 part 1 (v1.15) classes: Classes tab from the Sheet + from the teacher page, Students.classes mirror (multi-class),
// class assignment → a card for every member, "What to go over" order on a hand-made 3-student case, grid values =
// Responses, not taken, hidden attempts stay hidden, archived class hidden, no keys in the class review.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.Students.push(['S1', 'Anh', 'AP', 'Yes', ''], ['S2', 'Binh', 'AP', 'Yes', ''], ['S3', 'Chi', 'AP', 'Yes', '']); // not on the SAT track: they only see assignments
const G = createGas(APP, path.join(WORK, 'gas_sat98'), tabs);
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', C = G.ctx, TC = 'TEACH-44-CLS';
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');
G.sheets.Settings.rows.push(['teacher_code', TC, '']);
const T = (fn, ...a) => G.call(fn, [TC.toLowerCase(), ...a]);

console.log('[Sheet: tabs and columns]');
check(G.sheets.Classes && G.sheets.Classes.rows[0].join() === 'class_id,name,student_codes,active,note', 'update made the Classes tab (class_id · name · student_codes · active · note)');
check(G.sheets.Students.rows[0].includes('classes') && G.sheets.Assignments.rows[0].includes('class_id'), 'Students.classes + Assignments.class_id columns added');
check(G.sheets.Classes.dv['2:4'] && G.sheets.Classes.dv['2:4'].kind === 'list', 'Classes.active dropdown Yes / No');

console.log('[class typed in the Sheet + multi-class student]');
G.sheets.Classes.rows.push(['MATHA', 'Math A', 'S1, s2,S3', 'Yes', ''], ['PAIR', 'Pair', 'S1, T03', 'Yes', '']);
C.onEdit({ range: { getSheet: () => C.ss_().getSheetByName('Classes'), getRow: () => 2, getColumn: () => 3 } });
const cls = st => G.table('Students').find(r => r.student_code === st).classes;
check(cls('S1') === 'MATHA, PAIR' && cls('S2') === 'MATHA' && cls('T03') === 'PAIR' && cls('T01') === '', 'Students.classes mirror after a Sheet edit: S1 "MATHA, PAIR", S2 "MATHA"');

console.log('[class made on the teacher page]');
check(T('teacherCreateClass', { name: '', codes: ['S1'] }).ok === false && T('teacherCreateClass', { name: 'X', codes: ['NOPE'] }).ok === false, 'no name / no known student → message, nothing written');
const mk = T('teacherCreateClass', { name: '2CE test', codes: ['s2', 'S3', 'NOPE', 'S3'] });
const row = G.table('Classes').find(r => r.class_id === mk.class_id);
check(mk.ok && mk.class_id === '2CETEST' && row && row.student_codes === 'S2, S3' && row.active === 'Yes', `new class → Classes row "${row && row.class_id} · ${row && row.name} · ${row && row.student_codes}"`);
check(T('teacherCreateClass', { name: '2CE test', codes: ['S1'] }).class_id === '2CETEST-2', 'same name again → unique id 2CETEST-2');
check(cls('S2') === 'MATHA, 2CETEST', 'mirror updated after the teacher page');
let thrown = false; try { G.call('teacherClasses', ['S1']); } catch (e) { thrown = /Teacher code/.test(e.message); }
check(thrown, 'class calls need the teacher code');

console.log('[assign to a class]');
G.sheets.Assignments.rows.push(['', SAT, 'M2', 'Yes', 'class test', 'MATHA']);
const cards = c => G.call('listForms', [c]).forms.filter(f => f.assigned).map(f => f.form_id + ' ' + f.scope);
check(['S1', 'S2', 'S3'].every(c => cards(c).join() === SAT + ' M2') && !cards('T03').length, 'Assignments row with class_id MATHA → a "Math Module 2" card for S1, S2, S3 (not for T03)');

console.log('[hand-made 3-student case on M2]');
const fd = C.formData_(SAT), m2 = fd.questions.filter(q => q.part === 'M2').sort((a, b) => a.display_no - b.display_no);
const key = q => String(Array.isArray(q.key) ? q.key[0] : q.key), wrong = q => q.type === 'spr' ? '99999' : ['A', 'B', 'C', 'D'].find(l => l !== key(q));
// plan[i] = per student [kind, seconds]: r = right, w = wrong, b = blank; 300 s = slow, 5 s = rushed, 60 s = normal
const N = 60, SL = 300, RU = 5;
const plan = {
  0: [['w', N], ['w', N], ['w', N]],      // Q1: 3 wrong
  1: [['w', SL], ['w', N], ['r', N]],     // Q2: 2 wrong, one slow → before Q3
  2: [['w', N], ['b', N], ['r', N]],      // Q3: 2 wrong / blank
  3: [['w', RU], ['r', N], ['r', N]],     // Q4: 1 rushed-wrong → before Q5
  4: [['w', N], ['r', N], ['r', N]],      // Q5: 1 wrong
  5: [['r', SL], ['r', N], ['r', N]],     // Q6: slow-right → before the right-and-fast ones
};
const now = Date.now();
const take = (code, i, opts) => {
  const x = G.call('getTest', [code, SAT, { scope: 'M2', fresh: true }]);
  const st = { seq_parts: ['M2'], current_part: 'M2', phase: 'submitting', part_starts: { M2: now - 34 * 60000 }, ended: { M2: 'submit' }, parts: { M2: { ans: {} } } };
  const evs = []; let t = 0;
  m2.forEach((q, k) => {
    const [kind, sec] = (plan[k] || [])[i] || ['r', N];
    evs.push({ part: 'M2', t_ms: t * 1000, qid: q.qid, type: 'q_enter', value: 1 });
    const v = kind === 'b' ? null : kind === 'w' ? ((opts || {}).alt ? key(q) : wrong(q)) : key(q);
    if (v) { evs.push({ part: 'M2', t_ms: (t + sec) * 1000, qid: q.qid, type: 'select', value: v }); st.parts.M2.ans[q.qid] = v; }
    t += sec + 2; evs.push({ part: 'M2', t_ms: t * 1000, qid: q.qid, type: 'q_leave', value: null });
  });
  evs.push({ part: 'M2', t_ms: t * 1000, qid: '', type: 'part_end', value: 'submit' });
  G.call('submit', [code, x.session.session_id, { state: st, events: evs, ev_from: 0, copy: x.copy }]);
  return x.session.session_id;
};
const sid = { S1: take('S1', 0), S2: take('S2', 1), S3: take('S3', 2) };
const s3b = take('S3', 2, { alt: true }); // a later attempt of S3, all right … then hidden
G.sheets.Sessions.rows.forEach((r, i) => { if (i && r[0] === s3b) r[G.sheets.Sessions.rows[0].indexOf('hidden')] = 'Yes'; });
const v = T('teacherClassView', 'MATHA', { form_id: SAT, part: 'M2' });
const codes = v.order.slice(0, 7).map(id => v.questions.find(q => q.qid === id).code);
check(codes.slice(0, 6).join() === 'M2-01,M2-02,M2-03,M2-04,M2-05,M2-06', 'What to go over: 3 wrong → 2 wrong with slow-wrong → 2 wrong → rushed-wrong → wrong → slow-right (' + codes.slice(0, 6).join(', ') + ')');
const last = v.questions.find(q => q.qid === v.order[v.order.length - 1]);
check(last.wrong === 0 && last.slow_right === 0 && last.code === 'M2-22', 'right and fast last (' + last.code + ')');
check(v.members.find(m => m.code === 'S3').session_id === sid.S3, 'hidden attempt of S3 is not used (the visible one is)');
check(v.members.find(m => m.code === 'S3').attempts.length === 1, 'hidden attempt not in the pick list');

console.log('[grid = Responses]');
const resp = G.table('Responses');
let same = true, n = 0;
v.questions.forEach(q => ['S1', 'S2', 'S3'].forEach(c => {
  const r = resp.find(x => x.session_id === sid[c] && x.qid === q.qid), cell = q.cells[c];
  const ta = r.profile === 'BLANK' ? null : Math.round(Number(r.time_to_answer_sec));
  const st = r.profile === 'BLANK' ? 'blank' : Number(r.correct) === 1 ? 'right' : 'wrong';
  if (cell.st !== st || cell.a !== String(r.final_answer) || cell.ta !== ta || cell.p !== r.profile) same = false; n++;
}));
check(same && n === 66, 'every grid cell (22 × 3) = Responses: answer, right / wrong / blank, time to answer, profile');
const q2 = v.questions[1];
check(q2.cells.S1.b === 'S' && q2.cells.S1.ta === 300 && v.questions[3].cells.S1.b === 'R', 'badges: Q2 S1 slow (S, 5:00), Q4 S1 rushed (R)');
const mod = v.members.find(m => m.code === 'S1').modules[0];
check(mod && mod.part === 'M2' && mod.solving + mod.checking + mod.left === mod.clock && mod.n === 22, `module totals per member (S1 M2: solving ${mod.solving} + checking ${mod.checking} + left ${mod.left} = ${mod.clock})`);

console.log('[not taken, whole form, picks]');
const pv = T('teacherClassView', 'PAIR', {});
check(pv.form_id === SAT && pv.members.find(m => m.code === 'T03').taken === false && pv.questions.every(q => q.cells.T03.st === 'none'), 'T03 has no attempt → "not taken" in every cell');
check(pv.questions.length === 98 && pv.questions.filter(q => q.cells.S1.st !== 'none').length === 22, 'all parts: 98 questions, S1 only in M2 (the rest "not taken")');
const s1b = take('S1', 1);
const pk = T('teacherClassView', 'MATHA', { form_id: SAT, part: 'M2', picks: { S1: sid.S1 } });
check(pk.members.find(m => m.code === 'S1').session_id === sid.S1 && pk.members.find(m => m.code === 'S1').attempts.length === 2 &&
      T('teacherClassView', 'MATHA', { form_id: SAT, part: 'M2' }).members.find(m => m.code === 'S1').session_id === s1b, 'latest attempt by default; another attempt can be picked');

console.log('[class review: questions without keys, answers of every member]');
const rv = T('teacherClassReview', 'MATHA', { form_id: SAT, part: 'M2', picks: { S1: sid.S1 } });
const js = JSON.stringify(rv.questions);
check(rv.questions.length === 22 && !/"key"|"keys"|"explanation"/.test(js), 'class review: 22 questions as in the test, no key in the payload');
check(rv.questions[0].members.length === 3 && rv.questions[0].members.every(m => m.st === 'wrong') && rv.questions[0].code === 'M2-01', 'each question lists every member\'s answer (M2-01: 3 × wrong)');
const ka = T('teacherFormAnswer', SAT, m2[0].qid);
check(ka.key.join() === key(m2[0]), 'Show answer on the class screen → the key of that question only');

console.log('[archive]');
check(T('teacherSetClassActive', 'MATHA', false).ok && G.table('Classes').find(r => r.class_id === 'MATHA').active === 'No', 'Archive → active = No (row kept)');
const list = T('teacherClasses');
check(list.classes.find(c => c.class_id === 'MATHA').active === false && list.classes.filter(c => c.active).length === 3, 'archived class still listed with active false (the page hides it unless "Show archived")');
check(!cards('S3').length && cls('S1') === 'PAIR, 2CETEST-2', 'archived class: no more assignment card, mirror without it');
check(T('teacherSetClassActive', 'MATHA', true).ok && cards('S3').length === 1, 'Restore → back');
const ck = C.checkSheet_();
check(/· Classes: 4 classes, 4 active/.test(ck), 'checkSheet: Classes line');

console.log(`\nqa44c_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
