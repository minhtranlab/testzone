// B1 proof: strict 1000-row grid (like the real Sheet). 30 attempts × 1 student, then 15 students × 1 attempt.
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const tabs = initialTabs();
for (let i = 1; i <= 15; i++) tabs.Students.push(['G' + String(i).padStart(2, '0'), 'Grid ' + i, 'AP Calc AB', 'Yes', '']);
const G = createGas(require('./paths').APP, require('./paths').WORK + '/gas', tabs);
G.admin('addMissingColumns'); G.admin('importQuestions');
const FORM = process.env.AP_FORM || 'MOCK-AP45';
const qs = G.ctx.formData_(FORM).questions;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ ' + m); } };
function attempt(code, k) {
  const r = G.call('getTest', [code, FORM, { fresh: true, device: 'grid' }]);
  const sid = r.session.session_id;
  const st = { v: 1, session_id: sid, form_id: FORM, seq: 1, seq_parts: ['A', 'B'], part_idx: 1, current_part: 'B', phase: 'submitting',
    part_starts: { A: Date.now() - 1000, B: Date.now() - 500 }, ended: { A: 'submit', B: 'submit' }, route: {}, warned: {}, parts: { A: { ans: {}, elim: {}, mark: {}, hl: {} }, B: { ans: {}, elim: {}, mark: {}, hl: {} } } };
  const ev = [];
  ['A', 'B'].forEach(p => {
    let t = 0; ev.push({ part: p, t_ms: 0, qid: null, type: 'part_start', value: p });
    qs.filter(q => q.part === p).forEach((q, i) => {
      ev.push({ part: p, t_ms: t, qid: q.qid, type: 'q_enter', value: i + 1 });
      const L = (i + k) % 3 ? q.key : (q.key === 'A' ? 'B' : 'A');
      ev.push({ part: p, t_ms: t + 20000, qid: q.qid, type: 'select', value: 'C' });
      ev.push({ part: p, t_ms: t + 40000, qid: q.qid, type: 'change', value: L });
      ev.push({ part: p, t_ms: t + 45000, qid: q.qid, type: 'mark', value: null });
      ev.push({ part: p, t_ms: t + 60000, qid: q.qid, type: 'q_leave', value: null });
      st.parts[p].ans[q.qid] = L; t += 60000;
    });
    for (let a = 0; a < 20; a++) ev.push({ part: p, t_ms: a * 60000, qid: null, type: 'autosave', value: null });
    ev.push({ part: p, t_ms: t, qid: null, type: 'part_end', value: 'submit' });
  });
  // two autosaves then submit (like a real run)
  const a1 = G.call('autosave', [code, sid, { state: st, events: ev.slice(0, 120), ev_from: 0 }]);
  ok(a1.ok, code + '#' + k + ' autosave 1');
  const a2 = G.call('autosave', [code, sid, { state: st, events: ev.slice(120, 200), ev_from: 120 }]);
  ok(a2.ok, code + '#' + k + ' autosave 2');
  const res = G.call('submit', [code, sid, { state: st, events: ev.slice(200), ev_from: 200 }]);
  ok(res.ok && res.n === 45, code + '#' + k + ' submit');
  const s = G.table('Sessions').find(x => x.session_id === sid);
  ok(s.status === 'completed', code + '#' + k + ' status completed');
  ok(G.table('Topic_Summary').length > 0, code + '#' + k + ' Topic_Summary not empty');
  return ev.length;
}
let nev = 0;
for (let k = 1; k <= 30; k++) nev += attempt('T01', k);
const s1 = { Events: G.table('Events').length, Responses: G.table('Responses').length, Sessions: G.table('Sessions').length };
console.log('after 30 attempts of T01:', JSON.stringify(s1), 'Events grid', G.sheets.Events.maxRows, 'grows', G.sheets.Events.grows);
ok(s1.Responses === 30 * 45 && s1.Events === nev, '30 attempts fully written (Responses 1350, Events ' + nev + ')');
for (let i = 1; i <= 15; i++) attempt('G' + String(i).padStart(2, '0'), 1);
const ts = G.table('Topic_Summary'), sr = G.table('Student_Report');
console.log('after +15 students: Topic_Summary', ts.length, 'rows (grid', G.sheets.Topic_Summary.maxRows + '), Student_Report', sr.length, ', Events', G.table('Events').length, '(grid', G.sheets.Events.maxRows + ')');
ok(new Set(ts.map(r => r.student_code)).size === 16, 'Topic_Summary has all 16 students');
ok(sr.length === 45, 'Student_Report 45 rows');
// failure injection: a write error inside rewriteTable_ must leave the old rows in place
const before = G.table('Topic_Summary').length;
const sh = G.sheets.Topic_Summary; const orig = sh.getRange.bind(sh); let armed = true;
sh.getRange = (r, c, nr, nc) => { const rg = orig(r, c, nr, nc); if (armed && r === 2 && nr > 1) { const sv = rg.setValues.bind(rg); rg.setValues = () => { armed = false; throw new Error('simulated quota error'); }; } return rg; };
let threw = false; try { G.ctx.rebuildStudent_('G01'); } catch (e) { threw = /simulated/.test(e.message); }
sh.getRange = orig;
ok(threw && G.table('Topic_Summary').length === before, 'rewriteTable_ write failure → error surfaced, Topic_Summary unchanged (' + before + ' rows)');
console.log(fails ? fails + ' FAILED' : 'GRID PROOF: all OK');
process.exit(fails ? 1 : 0);
