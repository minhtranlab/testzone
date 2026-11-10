// SAT reports in the Sheet: Report tab render (real-like + unreliable), Student_Report, Topic_Summary by domain/skill, ALL-SAT;
// per-section validity; AP + SAT attempts of one student never mixed. Server only (strict Sheet mock), HTML dumps for a visual check.
process.env.STRICT_VALID = '1';
const fs = require('fs');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { dump } = require('./sheetdump');
const OUT = process.env.SHOTS || require('./paths').WORK + '/shots_sat';
fs.mkdirSync(OUT, { recursive: true });
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.Students.push(['LAN-8K2', 'Lan', 'SAT', 'Yes', ''], ['BAO-4ZT', 'Bảo', 'ALL', 'Yes', '']);
tabs.Forms.push(...['RW1', 'RW2', 'M1', 'M2'].map(p => ['MOCK-SAT98', 'SAT', p, '', p[0] === 'R' ? 27 : 22, p[0] === 'R' ? 32 : 35, p[0] === 'R' ? 'No' : 'Yes', 'mock']));
const G = createGas(require('./paths').APP, require('./paths').WORK + '/gas_sat98', tabs);
G.admin('addMissingColumns'); G.admin('importQuestions');
const MIN = 60000, DAY = 864e5;

/** plan(q) → {p: 'R'|'W'|'B', s: seconds}; used: {part: minutes}; starts: {part: ms} */
function run(code, form, plan, used, starts) {
  const qs = G.ctx.formData_(form).questions, parts = [...new Set(qs.map(q => q.part))];
  G.shift(starts[parts[0]] - Date.now() - MIN);
  const r = G.call('getTest', [code, form, { device: 'harness' }]); G.resetShift();
  const sid = r.session.session_id;
  const st = { v: 1, session_id: sid, form_id: form, seq: 9, seq_parts: parts, part_idx: parts.length - 1, current_part: parts[parts.length - 1], phase: 'submitting',
    part_starts: { ...starts }, ended: Object.fromEntries(parts.map(p => [p, 'submit'])), route: {}, warned: {},
    parts: Object.fromEntries(parts.map(p => [p, { ans: {}, elim: {}, mark: {}, hl: {} }])) };
  const ev = [];
  parts.forEach(p => {
    let t = 0; ev.push({ part: p, t_ms: 0, qid: null, type: 'part_start', value: p });
    qs.filter(q => q.part === p).forEach(q => {
      const x = plan(q), ms = x.s * 1000;
      ev.push({ part: p, t_ms: t, qid: q.qid, type: 'q_enter', value: q.display_no });
      if (x.p !== 'B') {
        const right = x.p === 'R', k = Array.isArray(q.key) ? q.key[0] : q.key;
        const ans = q.type === 'spr' ? (right ? k : '999') : (right ? k : 'ABCD'.replace(k, '')[0]);
        ev.push({ part: p, t_ms: t + Math.max(1, ms - 500), qid: q.qid, type: 'select', value: ans });
        st.parts[p].ans[q.qid] = ans;
      }
      ev.push({ part: p, t_ms: t + ms, qid: q.qid, type: 'q_leave', value: null }); t += ms;
    });
    ev.push({ part: p, t_ms: Math.min(Math.max(t, used[p] * MIN), (p[0] === 'R' ? 32 : p[0] === 'M' ? 35 : 60) * MIN), qid: null, type: 'part_end', value: 'submit' });
  });
  const res = G.call('submit', [code, sid, { state: st, events: ev, ev_from: 0, device: 'harness' }]);
  if (!res.ok) throw new Error('submit failed');
  return { sid, res };
}

const now = Date.now();
// real-like: weak in SEC (grammar: wrong + slow) and P (advanced math), FAST_WRONG in Q, rest right at ~65 s (RW) / ~85 s (Math)
const realPlan = q => {
  const t = q.tags, n = q.display_no;
  if (t.unit === 'SEC') return n % 3 === 0 ? { p: 'R', s: 80 } : { p: 'W', s: 150 };
  if (t.unit === 'P') return n % 2 ? { p: 'W', s: 170 } : { p: 'R', s: 160 };
  if (t.unit === 'Q') return n % 2 ? { p: 'W', s: 25 } : { p: 'R', s: 70 };
  if (q.part === 'M2' && n >= 21) return { p: 'B', s: 8 };
  return { p: 'R', s: q.part[0] === 'R' ? 60 + (n % 4) * 5 : 80 + (n % 3) * 6 };
};
const used = { RW1: 31, RW2: 32, M1: 34, M2: 35 };
// RW in one sitting 3 days ago, Math 2 days later (saved at the break)
const real = run('LAN-8K2', 'MOCK-SAT98', realPlan, used,
  { RW1: now - 3 * DAY, RW2: now - 3 * DAY + 32 * MIN, M1: now - DAY, M2: now - DAY + 35 * MIN });
check(real.res.sections && real.res.sections.map(x => x.id + ':' + x.n).join() === 'RW:54,Math:44', 'student result carries section scores RW /54, Math /44');
check(real.res.estimate && real.res.estimate.total && real.res.estimate.total.high - real.res.estimate.total.low === 60 && real.res.estimate.RW.score % 10 === 0, 'student result: estimated score ' + JSON.stringify(real.res.estimate && real.res.estimate.total));
check(real.res.sittings_note === 'You took this test in 2 sittings. Your score on the real test may be lower than this result.', 'student result: 2-sittings note');
check(!/"key"|key_source/.test(JSON.stringify(real.res)) && real.res.review.length === 4 && real.res.review[0].questions.length === 27, 'student result: review list (4 modules), no key');
// unreliable: Math rushed (whole Math in 6 minutes, answers chosen in seconds); RW normal
const fastPlan = q => q.part[0] === 'M' ? { p: q.display_no % 2 ? 'R' : 'W', s: 8 } : { p: 'R', s: 65 };
const fast = run('LAN-8K2', 'MOCK-SAT98', fastPlan, { RW1: 30, RW2: 30, M1: 3, M2: 3 },
  { RW1: now - 5 * 3600e3, RW2: now - 5 * 3600e3 + 31 * MIN, M1: now - 5 * 3600e3 + 75 * MIN, M2: now - 5 * 3600e3 + 79 * MIN });

console.log('[Sessions / validity]');
const S = G.table('Sessions'), sr = S.find(r => r.session_id === real.sid), sf = S.find(r => r.session_id === fast.sid);
check(sr.reliable === 'Yes' && sr.n_sittings === 2 && sr.time_used_RW_min === 64 && sr.time_used_Math_min === 69, `real: reliable, 2 sittings, RW 64 / Math 69 min (${sr.time_used_RW_min}/${sr.time_used_Math_min})`);
check(sf.reliable === 'No', 'Math rushed in 6 of 70 minutes → not reliable (per-section rule, although the total is 66/134 min)');

console.log('[Student_Report]');
const R1 = G.table('Student_Report').find(r => r.session_id === real.sid), R2 = G.table('Student_Report').find(r => r.session_id === fast.sid);
check(/^RW \d+\/54 · Math \d+\/44 · total \d+\/98\. /.test(R1.summary), 'summary starts with the score line: ' + R1.summary.slice(0, 40));
check(/^\d{3,4} \(\d{3,4}–\d{3,4}\) · RW \d{3} \(\d{3}–\d{3}\)/.test(R1.estimated_score), 'Student_Report.estimated_score: ' + R1.estimated_score);
check(/Standard English Conventions \(\d+\/\d+\)/.test(R1.weakest_topics) && !/Unit/.test(R1.weakest_topics), 'weakest_topics by domain (English names): ' + R1.weakest_topics);
check(/^2 sittings: RW1 \d\d\/\d\d \d\d:\d\d–\d\d:\d\d · RW2 .* · M1 \d\d\/\d\d .* · M2 /.test(R1.sittings), 'sittings per module: ' + R1.sittings);
check(/min RW1/.test(R1.timing_pattern) && /usual time for each question type \(Time_Norms tab\): \d+ slow, \d+ rushed/.test(R1.timing_pattern), 'timing: per module + slow / rushed against Time_Norms (#24 F): ' + R1.timing_pattern);
check(/Math: only 6 of 70 minutes used/.test(R2.summary) && R2.weakest_topics === '— (not reliable)', 'unreliable reason names the section: ' + R2.summary.slice(0, 120));

console.log('[Topic_Summary]');
const TS = G.table('Topic_Summary').filter(r => r.student_code === 'LAN-8K2');
const perForm = TS.filter(r => r.form_id === 'MOCK-SAT98'), all = TS.filter(r => r.form_id === 'ALL-SAT');
check(perForm.length && all.length && !TS.some(r => r.form_id === 'ALL'), 'rows per form + ALL-SAT (no AP "ALL" for a SAT-only student)');
const dRows = perForm.filter(r => r.unit === r.topic);
check(dRows.map(r => r.unit).join() === 'INI,CAS,EOI,SEC,H,P,Q,S', 'domain rows in SAT order: ' + dRows.map(r => r.unit).join());
const sec = dRows.find(r => r.unit === 'SEC');
check(sec.topic_name === 'SEC · Standard English Conventions (RW)' && /^Needs reteaching/.test(sec.verdict), 'SEC domain row: ' + sec.topic_name + ' · ' + sec.verdict);
check(perForm.some(r => r.topic === 'SEC.BOU' && r.topic_name === 'Boundaries' && r.unit === 'SEC'), 'skill rows (SEC.BOU Boundaries) under their domain');
check(all.reduce((a, r) => a + (r.unit === r.topic ? r.n_attempted : 0), 0) === 98, 'ALL-SAT counts only the reliable attempt (98 questions)');

console.log('[Report tab — real]');
G.admin('rebuildAll');
const sh = G.sheets.Report;
const list = sh.rows.slice(1).map(r => r[17]).filter(Boolean);
check(list.length === 2 && list.every(l => /^Lan · MOCK-SAT98 · Attempt \d/.test(l)) && /⚠ not reliable$/.test(list[0]), 'dropdown: 2 SAT attempts, newest (unreliable) first');
const text = () => sh.rows.map(r => (r || []).slice(1, 6).map(v => v instanceof Date ? 'DATE!' : (v && v.formula) ? v.formula : String(v === undefined ? '' : v)).join(' | '));
const rowOf = re => text().findIndex(t => re.test(t)) + 1;
function pick(label) { sh.rows[1][1] = label; G.ctx.onEdit({ range: sh._proxy.getRange(2, 2) }); }
pick(list[1]); let T = text();
check(T.every(t => !t.includes('DATE!')), 'no text turned into a date');
check(/^RW \d+\/54 · Math \d+\/44 · total \d+\/98 \(\d+%\)/.test(T[rowOf(/^RW \d+\/54/) - 1]), 'header score line: ' + T[rowOf(/^RW \d+\/54/) - 1].split(' | ')[0]);
check(/^Modules: RW1 \d+\/27 · RW2 \d+\/27 · M1 \d+\/22 · M2 \d+\/22 · Time RW 64\/64 min, Math 69\/70 min/.test(T[rowOf(/^Modules: /) - 1]), 'modules + time per section: ' + T[rowOf(/^Modules: /) - 1].split(' | ')[0]);
check(/^Estimated score: \d{3,4} \(\d{3,4}–\d{3,4}\) · RW \d{3}/.test(T[rowOf(/^Estimated score: /) - 1]), 'Report header: ' + T[rowOf(/^Estimated score: /) - 1].split(' | ')[0]);
check(/^2 sittings: .* — not like the real test/.test(T[rowOf(/^2 sittings: /) - 1]), 'Report header flags the 2 sittings');
check(rowOf(/^Reliable attempt/) > 0, 'validity: reliable');
const iD = rowOf(/^Section \| Domain \| Right \| Share \| Verdict/);
const dom = T.map((t, i) => [t, i + 1]).filter(([t]) => /^(RW|Math) \| /.test(t));
check(iD > 0 && rowOf(/^By domain/) > 0 && dom.length === 8, '"By domain": 8 domain rows');
check(/^RW \| Standard English Conventions \| \d+\/\d+ \| =SPARKLINE.* \| Needs reteaching$/.test(dom.find(([t]) => /Standard English Conventions/.test(t))[0]), 'SEC row: RW | Standard English Conventions | k/t | bar | Needs reteaching');
check(/^Math \| Advanced Math \|/.test(dom.find(([t]) => /Advanced Math/.test(t))[0]), 'Math domain row with English name');
const bou = rowOf(/^ \| Boundaries \| /); check(bou > 0 && sh.rowDepth[bou] === 1, 'skill row "Boundaries" grouped under its domain');
const ini = dom.find(([t]) => /Information and Ideas/.test(t))[1];
check(!sh.hiddenRows[dom.find(([t]) => /Standard English Conventions/.test(t))[1] + 1] && (/\| OK$/.test(T[ini - 1]) ? sh.hiddenRows[ini + 1] : true), 'weak domain expanded, OK domains collapsed');
check(rowOf(/^Slow \/ rushed = against the usual time for each question type/) > 0, 'time text: slow / rushed against Time_Norms');
const iAct = rowOf(/^Next steps/); check(/^1\. Reteach (Standard English Conventions \(RW\)|Advanced Math \(Math\))\. Missed skills: /.test(T[iAct]), 'action 1: ' + T[iAct].slice(0, 90));
const iW = rowOf(/^Wrong and blank answers/); check(/^Question \| Skill \| Type \| Time \| Note/.test(T[iW]) && /^(RW1|RW2|M1|M2) \d+ \| [A-Z]/.test(T[iW + 1]), 'wrong list: "RW1 3 | Boundaries | …"');
check(sh.charts.length === 1 && sh.charts[0].ranges[0].getValues().length === 99 && sh.charts[0].ranges[0].getValues()[1][0] === 'RW1-1', 'chart: 98 questions labelled RW1-1 …');
const cd = sh.charts[0].ranges[0].getValues();
{ const fq = qs98 => qs98; const all = G.ctx.formDataRaw_('MOCK-SAT98').questions, tg = G.ctx.tagMap_('MOCK-SAT98');
  const want = q => Math.round(G.ctx.timeNormFor_(true, q.part, q.type, tg[q.qid]).target / 60 * 100) / 100;
  const q1 = all.find(q => q.part === 'RW1' && q.display_no === 1), q60 = all.filter(q => q.part === 'M1' || q.part === 'M2')[5];
  check(Math.abs(cd[1][5] - want(q1)) < 0.01 && new Set(cd.slice(1).map(r => r[5])).size > 3, 'chart usual-time line per question from Time_Norms (RW1-1 ' + cd[1][5] + ' min, ' + new Set(cd.slice(1).map(r => r[5])).size + ' different values)'); }
check(!T.some(t => /Unit|Part A|AP Calc/.test(t)), 'no AP wording (Unit / Part A / AP Calc) in a SAT report');
fs.writeFileSync(OUT + '/sat_report_real.html', '<meta charset="utf-8"><body style="margin:16px;background:#f2f2f2">' + dump(sh) + '</body>');

console.log('[Report tab — unreliable]');
pick(list[0]); T = text();
check(/^Not reliable: Math: only 6 of 70 minutes used · \d+ of \d+ answers chosen in under 15 seconds/.test(T[rowOf(/^Not reliable/) - 1]), 'unreliable line: ' + T[rowOf(/^Not reliable/) - 1].split(' | ')[0]);
check(rowOf(/The analysis is hidden/) > 0 && rowOf(/^By domain/) === 0 && sh.charts.length === 1, 'analysis hidden (no domain table), chart kept');
check(Object.values(sh.rowDepth).every(d => !d), 'groups of the previous render removed');
fs.writeFileSync(OUT + '/sat_report_guess.html', '<meta charset="utf-8"><body style="margin:16px;background:#f2f2f2">' + dump(sh) + '</body>');

console.log('[one student, AP + SAT]');
const apQs = G.ctx.formData_('MOCK-APCAB').questions;
const ap = run('BAO-4ZT', 'MOCK-APCAB', q => ({ p: 'R', s: 90 }), { A: 5, B: 3.5 }, { A: now - 9 * 3600e3, B: now - 9 * 3600e3 + 7 * MIN });
const sat2 = run('BAO-4ZT', 'MOCK-SAT98', realPlan, used, { RW1: now - 8 * 3600e3, RW2: now - 8 * 3600e3 + 32 * MIN, M1: now - 8 * 3600e3 + 75 * MIN, M2: now - 8 * 3600e3 + 110 * MIN });
const TB = G.table('Topic_Summary').filter(r => r.student_code === 'BAO-4ZT');
check(TB.some(r => r.form_id === 'ALL' && /^Unit/.test(r.topic)) && TB.some(r => r.form_id === 'ALL-SAT' && r.unit === 'SEC') &&
      !TB.some(r => r.form_id === 'ALL' && isNaN(Number(r.unit))) && !TB.some(r => r.form_id === 'ALL-SAT' && /^Unit/.test(r.topic)), 'AP → "ALL" (units only), SAT → "ALL-SAT" (domains only)');
const SB = G.table('Sessions').filter(r => r.student_code === 'BAO-4ZT');
check(SB.find(r => r.form_id === 'MOCK-APCAB').score_A !== '' && SB.find(r => r.form_id === 'MOCK-APCAB').score_RW === '' && SB.find(r => r.form_id === 'MOCK-SAT98').score_A === '', 'Sessions: AP fills score_A/B, SAT fills score_RW/Math');
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
