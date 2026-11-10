// #24 (v1.9 screens), server side: F time norms from SC's CSV (Time_Norms tab) · D/E question codes + S/R badges on a
// hand-made attempt · B no method text for students (teacher keeps a note) · C practise tips + practice-app mode from Settings.
// The browser side (card time, result layout, review = test screen) is in sat98.js, result_test.js and break_test.js.
const fs = require('fs'), path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { APP, WORK } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const G = createGas(APP, path.join(WORK, 'gas_sat98'), initialTabs());
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };
const FORM = 'MOCK-SAT98';
G.ctx.doGet({ parameter: { update: '1' } });   // columns, Settings rows (practice app), Time_Norms tab
G.sheets.Forms.rows.push([FORM, 'SAT', 'RW1', '', 27, 32, 'No', 'mock'], [FORM, 'SAT', 'RW2', '', 27, 32, 'No', 'mock'],
                         [FORM, 'SAT', 'M1', '', 22, 35, 'Yes', 'mock'], [FORM, 'SAT', 'M2', '', 22, 35, 'Yes', 'mock']);
G.admin('importQuestions');
const qs = G.ctx.formDataRaw_(FORM).questions, Q = id => qs.find(q => q.qid === FORM + '-' + id);
const wrongOf = q => ['A', 'B', 'C', 'D'].find(l => l !== q.key);

console.log('[F time norms = SC\'s CSV (data/taxonomy/sat_time_norms.csv → TimeNorms.gs → Time_Norms tab)]');
const csv = G.ctx.TIME_NORMS_DEFAULT_;
check(csv.length === 46 && csv[0].join() === 'section,skill,difficulty,qtype,target_sec,fast_below_sec,slow_above_sec', 'TimeNorms.gs: header + 45 rows');
check(G.order.includes('Time_Norms') && G.sheets.Time_Norms.rows.length === 46 && G.sheets.Time_Norms.rows[1].join() === csv[1].join(), 'Sheet update created the editable Time_Norms tab with the same rows');
const row = (sec, sk, d, t) => csv.find(r => r[0] === sec && r[1] === sk && r[2] === d && r[3] === t);
const nWIC = G.ctx.timeNormFor_(true, 'RW1', 'mcq', { topic: 'CAS.WIC', difficulty: 'E' }), rWIC = row('RW', 'CAS.WIC', 'E', 'mcq');
check(nWIC.target === +rWIC[4] && nWIC.fast === +rWIC[5] && nWIC.slow === +rWIC[6], `RW Words in Context, easy → ${rWIC.slice(4).join(' / ')} s`);
const nSpr = G.ctx.timeNormFor_(true, 'M2', 'spr', { topic: 'H.A', difficulty: 'H' }), rSpr = row('Math', '*', 'H', 'spr');
check(nSpr.target === +rSpr[4] && nSpr.slow === +rSpr[6], `Math hard SPR → ${rSpr.slice(4).join(' / ')} s (any skill)`);
const nAp = G.ctx.timeNormFor_(false, 'B', 'mcq', { topic: '2.8', difficulty: 'M' }), rAp = row('APCAB', 'PartB', 'M', 'mcq');
check(nAp.target === +rAp[4] && nAp.fast === +rAp[5], `AP Part B medium → ${rAp.slice(4).join(' / ')} s`);

console.log('[D/E a hand-made attempt: codes + badges]');
// time on each answered question (s) and right / wrong, chosen against the CSV rows above
const plan = {
  'RW1-01': [10, false],   // WIC easy: 10 < 20 → rushed and wrong (R)
  'RW1-02': [70, true],    // WIC easy: 70 > 60 → slow but right (S)
  'RW1-03': [35, true],    // normal, right
  'M1-01': [150, false],   // Math medium MCQ: 150 > 128 → slow and wrong (S)
  'M1-02': [80, false],    // normal, wrong
  'M1-03': [50, true]
};
const t = G.call('getTest', ['T03', FORM, { fresh: true }]);
const sid = t.session.session_id, now = Date.now();
const st = { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
const events = [];
st.seq_parts.forEach((p, i) => {
  st.part_starts[p] = now - (4 - i) * 30 * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {}, elim: {}, mark: {} };
  let tm = 1000;
  qs.filter(q => q.part === p).forEach(q => {
    const id = q.qid.slice(FORM.length + 1), pl = plan[id];
    events.push({ part: p, t_ms: tm, qid: q.qid, type: 'q_enter', value: null });
    const dur = pl ? pl[0] * 1000 : 2000;
    if (pl) { const v = pl[1] ? q.key : wrongOf(q); st.parts[p].ans[q.qid] = v; events.push({ part: p, t_ms: tm + dur - 500, qid: q.qid, type: 'select', value: v }); }
    events.push({ part: p, t_ms: tm + dur, qid: q.qid, type: 'q_leave', value: null });
    tm += dur;
  });
  events.push({ part: p, t_ms: tm, qid: '', type: 'part_end', value: 'submit' });
});
G.call('submit', ['T03', sid, { state: st, events, ev_from: 0, copy: t.copy }]);
const resp = G.table('Responses').filter(r => r.session_id === sid), prof = id => resp.find(r => r.qid === FORM + '-' + id).profile;
check(prof('RW1-01') === 'FAST_WRONG' && prof('RW1-02') === 'SLOW_RIGHT' && prof('RW1-03') === 'RIGHT' && prof('M1-01') === 'SLOW_WRONG' && prof('M1-02') === 'WRONG' && prof('M1-03') === 'RIGHT',
  'Responses.profile from the CSV thresholds: ' + Object.keys(plan).map(id => id + ' ' + prof(id)).join(', '));
const res = G.call('getResult', ['T03', sid]);
const ty = k => res.types.find(x => x.type === k);
const codes = k => ty(k).qs.map(q => q.code + (q.badge ? '[' + q.badge + ']' : '')).join(',');
check(codes('FAST_WRONG') === 'V1-01[R]' && codes('SLOW_RIGHT') === 'V1-02[S]' && codes('SLOW_WRONG') === 'M1-01[S]' && codes('WRONG') === 'M1-02' && ty('BLANK').qs.length === 92,
  `types of mistakes list their questions: R ${codes('FAST_WRONG')} · S ${codes('SLOW_RIGHT')} · S ${codes('SLOW_WRONG')} · ${codes('WRONG')} · 92 blank`);
const wic = res.groups.flatMap(g => g.rows).flatMap(r => r.items).find(it => it.name === 'Words in Context');
check(wic && wic.missed.some(q => q.code === 'V1-01' && q.badge === 'R' && q.status === 'wrong') && wic.slow.some(q => q.code === 'V1-02' && q.badge === 'S' && q.status === 'right'),
  'skill Words in Context: chips V1-01 (red, R) + V1-02 (green, S)');
const cell = id => res.review.flatMap(p => p.questions).find(q => q.qid === FORM + '-' + id);
check(cell('RW1-01').code === 'V1-01' && cell('RW1-01').badge === 'R' && cell('M1-01').code === 'M1-01' && cell('M1-01').badge === 'S' && cell('M1-03').badge === '' && cell('RW2-05').code === 'V2-05' && cell('M2-07').code === 'M2-07',
  'question grids: V1 / V2 / M1 / M2 codes + badges');
check(G.ctx.qCode_('A', 12, false) === 'A-12' && G.ctx.qCode_('B', 4, false) === 'B-04', 'AP codes A-12 / B-04');
const rv = G.call('getReview', ['T03', sid]);
check(rv.questions.find(q => q.qid === FORM + '-RW1-01').code === 'V1-01' && rv.parts.find(p => p.part === 'M1').calculator && rv.parts.find(p => p.part === 'M1').reference && rv.parts.find(p => p.part === 'RW1').layout === 'split' && rv.settings.desmos_api_key,
  'review data: codes + what the test screen needs (calculator, reference, split pane, Desmos key)');
check(!/"key"\s*:|key_source|"tags"/.test(JSON.stringify(rv)), 'review data: still no key / tags');

console.log('[B no method text for students]');
const js = JSON.stringify(res);
check(res.estimate && res.estimate.total && res.estimate.RW && !/public score charts|Module 2 (was )?not counted|"note"|teacher_note|below the level|leads to the harder/i.test(js), 'student result payload: estimate numbers only, no method text');
G.sheets.Settings.rows.push(['teacher_code', 'TEACH-24-XYZ', '']);
const tr = G.call('teacherResult', ['TEACH-24-XYZ', sid]);
check(/public score charts/.test(tr.estimate.teacher_note || ''), 'teacher result: a short method note');
check(res.sections.every(s => s.modules.length === 2) && res.sections.find(s => s.id === 'RW').modules.map(m => m.right + '/' + m.n).join() === '2/27,0/27', 'sections: raw + Module 1 / Module 2 scores');

console.log('[C what to practise first: short tips + practice-app mode (Settings)]');
const tips = res.practise;
check(tips.length >= 1 && tips.every(x => typeof x.text === 'string' && !/\bQ\d|V\d-\d\d|M\d-\d\d/.test(x.text)), 'tips: short text, no question list (' + tips.map(x => x.text).join(' | ') + ')');
const wtip = tips.find(x => /Boundaries/.test(x.text));
check(wtip && /^Quick win: Boundaries — you missed 3 easier questions\.$/.test(wtip.text) && wtip.mode === 'Grammar' && wtip.app === 'SAT practice app', 'Quick win: Boundaries — you missed 3 easier questions. → Practise: Grammar in the SAT practice app');
const ntip = tips.find(x => /^Needs work: Rhetorical Synthesis/.test(x.text));
check(ntip && ntip.mode === 'Rhetorical Synthesis', 'Needs work: Rhetorical Synthesis — 0 of 6 right. → Practise: Rhetorical Synthesis');
const set = G.table('Settings');
check(set.find(s => s.key === 'practice_mode EOI.TRA').value === 'Transition' && set.find(s => s.key === 'practice_mode SEC.BOU').value === 'Grammar' && set.find(s => s.key === 'practice_app_name').value === 'SAT practice app', 'Settings rows: mapping (11 verbal skills) + app name');
const hS = G.sheets.Settings.rows[0], rowS = k => G.sheets.Settings.rows.find(r => r[hS.indexOf('key')] === k);
rowS('practice_app_name')[hS.indexOf('value')] = 'Minh SAT Drills'; rowS('practice_mode SEC.BOU')[hS.indexOf('value')] = 'Punctuation';
const res2 = G.call('getResult', ['T03', sid]), w2 = res2.practise.find(x => /Boundaries/.test(x.text));
check(w2.mode === 'Punctuation' && w2.app === 'Minh SAT Drills', 'Minh edits Settings → the tip follows (Punctuation in the Minh SAT Drills)');
check(G.ctx.practiceMode_(G.ctx.getSettings_(), true, 'P.A') === '' && G.ctx.practiceMode_(G.ctx.getSettings_(), false, 'SEC.BOU') === '', 'Math skills and AP: no app line');

console.log('[F Minh edits Time_Norms → re-grade re-times]');
const hT = G.sheets.Time_Norms.rows[0];
const wicRow = G.sheets.Time_Norms.rows.find(r => r[1] === 'CAS.WIC' && r[2] === 'E');
wicRow[hT.indexOf('slow_above_sec')] = 80;  // 70 s is no longer slow
G.ctx._timeNorms = null;
const rb = G.admin('rebuildAll');
check(/re-timed [1-9]\d* rows/.test(rb) && G.table('Responses').find(r => r.qid === FORM + '-RW1-02' && r.session_id === sid).profile === 'RIGHT', 'slow_above 60 → 80: V1-02 (70 s) is now plain right; ' + rb.split('; ').pop());

console.log('[#28 t3 minutes rounded once: "can\'t be used" reason = Sessions time_used_<section>_min]');
rowS('valid_min_time_ratio')[hS.indexOf('value')] = 0.5;   // this mock form switches the time rule off; on for this check
const sRow = G.table('Sessions').find(r => r.session_id === sid), js28 = JSON.stringify(G.call('getResult', ['T03', sid]));
const mRW = /RW: only ([\d.]+) of 64 minutes used/.exec(js28), mM = /Math: only ([\d.]+) of 70 minutes used/.exec(js28);
check(mRW && Number(mRW[1]) === Number(sRow.time_used_RW_min) && mM && Number(mM[1]) === Number(sRow.time_used_Math_min),
  `reason RW ${mRW && mRW[1]} / Math ${mM && mM[1]} min = Sessions ${sRow.time_used_RW_min} / ${sRow.time_used_Math_min}`);
const prof28 = G.ctx.profileFor_(FORM, true), S28 = Object.assign({}, G.ctx.getSettings_(), { valid_min_time_ratio: 0.5 }), rows28 = [{ profile: 'RIGHT', time_total_sec: 60, part: 'RW1' }, { profile: 'RIGHT', time_total_sec: 60, part: 'RW2' }];
const v28 = G.ctx.validity_(rows28, { RW1: 5.25, RW2: 5.15 }, prof28, S28, { RW: 10.3 });   // modules 5.2 + 5.1 → the old text said 10.4
check(v28.reasons.some(r => r === 'RW: only 10.3 of 64 minutes used'), 'module minutes 5.25 + 5.15 with Sessions 10.3 → "RW: only 10.3 of 64 minutes used"');

console.log(`\nqa24_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
