// #35 (v1.12) home data (listForms, one call): hero priority (open assignment → next test → none; new student),
// "Pick up where you stopped" only with open attempts (live numbers from the saved state), no estimate on the home,
// Past assignments only for students who had assignments.
const path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { WORK, APP } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.Students.push(['T11', 'Lan Anh (new)', 'ALL', 'Yes', '']);
const G = createGas(APP, path.join(WORK, 'gas_sat98'), tabs);
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const SAT = 'MOCK-SAT98', AP = 'MOCK-APCAB', C = G.ctx;
G.sheets.Forms.rows.push([SAT, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [SAT, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [SAT, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [SAT, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.ctx.doGet({ parameter: { update: '1' } });
G.admin('importQuestions');
const home = code => G.call('listForms', [code]);
const now = Date.now();
const finish = (code, form, opts) => { const x = G.call('getTest', [code, form, Object.assign({ fresh: true }, opts || {})]); const seq = x.profile.parts.map(p => p.part);
  const s = { seq_parts: seq, current_part: seq[seq.length - 1], phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
  seq.forEach((p, i) => { s.part_starts[p] = now - (seq.length - i) * 60000; s.ended[p] = 'submit'; s.parts[p] = { ans: {} }; });
  const q = x.questions.find(q => q.part === seq[0] && q.type !== 'spr'); s.parts[seq[0]].ans[q.qid] = 'A';
  G.call('submit', [code, x.session.session_id, { state: s, events: [], ev_from: 0, copy: x.copy }]); return x.session.session_id; };

console.log('[new student]');
let h = home('T11');
check(h.welcome === true && h.first_name === 'Lan' && h.hero && h.hero.kind === 'next' && h.hero.form_id === h.forms.find(f => f.available).form_id && h.pickup.length === 0,
  `new student: "Hi Lan. Welcome…", hero = first available test (${h.hero && h.hero.form_id}), no pick-up`);
check(!h.past.length, 'no Past assignments');
const sat0 = home('T03').hero;
check(sat0.title === 'Mock Practice Test (harness)' || sat0.title.length > 0, 'SAT next test: title "' + sat0.title + '", of "' + sat0.of + '", clock ' + sat0.clock + ' ' + sat0.clock_unit);
check(sat0.of === 'SAT practice test' && sat0.clock === '2:14' && sat0.clock_unit === 'hours' && sat0.facts[0].b === '98' && /then/.test(sat0.facts[1].t) && sat0.facts[2].t === '10-minute break' && /^Start /.test(sat0.start),
  'facts: 98 questions · Reading and Writing, then Math · 10-minute break; ring 2:14 hours');

console.log('[open assignment wins]');
G.sheets.Assignments.rows.push(['T03', SAT, 'M2', 'Yes', '']);
h = home('T03');
check(h.hero && h.hero.kind === 'assignment' && h.hero.title === 'Math Module 2' && h.hero.clock === '35:00' && h.hero.clock_unit === 'minutes' && h.hero.start === 'Start Math Module 2' && h.hero.facts.some(x => x.t === 'Desmos calculator'),
  'hero = the assignment: "Math Module 2", ring 35:00 minutes, "Start Math Module 2", Desmos calculator');
check(h.welcome === false || h.welcome === true, 'greeting flag present');

console.log('[next test: first with no finished and no open attempt]');
finish('T03', SAT, { scope: 'M2' }); // the assignment is done → no longer the hero
h = home('T03');
check(h.hero && h.hero.kind === 'next' && h.hero.form_id === SAT && h.welcome === false, 'assignment done → hero = next test (the SAT form, not started)');
// an AP student: form A in progress → next test = none of the others? T01 has only MOCK-APCAB (+ maybe more)
const t = G.call('getTest', ['T01', AP, {}]);
G.call('autosave', ['T01', t.session.session_id, { state: { seq_parts: ['A', 'B'], current_part: 'A', phase: 'test', part_starts: { A: now - 60000 }, ended: {}, parts: { A: { ans: { [t.questions[0].qid]: 'B' }, cur: 1 } } }, events: [], ev_from: 0, copy: t.copy }]);
h = home('T01');
const apForms = h.forms.filter(f => !f.assigned).map(f => f.form_id);
check(!h.hero || h.hero.form_id !== AP, 'a test in progress is never the hero (' + (h.hero ? h.hero.form_id : 'no hero') + '; forms ' + apForms.join(',') + ')');
check(h.pickup.length === 1 && h.pickup[0].session_id === t.session.session_id && h.pickup[0].sub === 'Part A' && h.pickup[0].answered === 1 && h.pickup[0].n === 3 &&
  /^1\/3 answered · [56]:\d\d left$/.test(h.pickup[0].line) && h.pickup[0].button === 'Continue' && h.pickup[0].pct === 33, 'pick-up: "' + h.pickup[0].line + '", bar 33 %, Continue');

console.log('[all done → no hero]');
G.call('submit', ['T01', t.session.session_id, { state: { seq_parts: ['A', 'B'], current_part: 'B', phase: 'submitting', part_starts: { A: now - 60000, B: now - 30000 }, ended: { A: 'submit', B: 'submit' }, parts: { A: { ans: {} }, B: { ans: {} } } }, events: [], ev_from: 0, copy: t.copy }]);
h = home('T01');
h.forms.filter(f => !f.assigned && f.available && !f.attempts.some(a => a.status === 'completed')).forEach(f => finish('T01', f.form_id));
h = home('T01');
check(h.hero === null && h.pickup.length === 0 && h.forms.every(f => !f.available || f.attempts.some(a => a.status === 'completed')), 'every test done, nothing open → no hero, no pick-up');

console.log('[pick-up: paused at the break, assignment attempts too]');
const x = G.call('getTest', ['T03', SAT, { fresh: true }]);
G.call('autosave', ['T03', x.session.session_id, { state: { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'M1', phase: 'break', break_until: now + 300000, part_starts: { RW1: now - 70 * 60000, RW2: now - 35 * 60000 }, ended: { RW1: 'submit', RW2: 'submit' }, parts: {} }, events: [], ev_from: 0, copy: x.copy, pause: true }]);
G.sheets.Assignments.rows.push(['T03', SAT, 'RW1', 'Yes', '']);
const y = G.call('getTest', ['T03', SAT, { scope: 'RW1', fresh: true }]);
G.call('autosave', ['T03', y.session.session_id, { state: { seq_parts: ['RW1'], current_part: 'RW1', phase: 'test', part_starts: { RW1: now - 10 * 60000 }, ended: {}, parts: { RW1: { ans: {}, cur: 0 } } }, events: [], ev_from: 0, copy: y.copy }]);
h = home('T03');
const pb = h.pickup.find(p => p.session_id === x.session.session_id), pa = h.pickup.find(p => p.session_id === y.session.session_id);
check(pb && pb.line === 'Paused at the break · Math next' && pb.button === 'Continue Math' && pb.sub === 'Reading and Writing done' && pb.pct === 50, 'paused SAT: "Reading and Writing done · Paused at the break · Math next", Continue Math, bar 50 %');
check(pa && pa.sub === 'Reading and Writing · Module 1' && /^0\/27 answered · 3[12]:\d\d left$/.test(pa.line) && / — Reading and Writing Module 1$/.test(pa.title), 'assignment attempt in the pick-up: "' + pa.sub + '" · "' + pa.line + '"');
check(h.hero === null || h.hero.kind !== 'assignment', 'the RW1 assignment is in progress → not the hero');

const z = G.call('getTest', ['T11', AP, {}]);
const pz0 = home('T11').pickup.find(p => p.session_id === z.session.session_id);
check(pz0 && pz0.sub === 'Not started yet' && pz0.line === 'Opened, no part started' && pz0.button === 'Continue', 'opened but no part started: "Not started yet · Opened, no part started"');

console.log('[no estimate on the home; past assignments]');
const js = JSON.stringify(h);
check(!/estimate|"low"|"high"|\b\d{3}–\d{3}\b/i.test(js), 'home payload has no estimated score');
G.sheets.Assignments.rows.forEach(r => { if (r[0] === 'T03') r[3] = 'No'; });
h = home('T03');
check(h.past.length >= 1 && h.past.some(p => /Math Module 2/.test(p.title)) && !home('T11').past.length, 'Past assignments only for students who had assignments');

console.log(`\nqa35_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
