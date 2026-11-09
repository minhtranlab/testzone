// Paste-order safety: new Code.gs with (1) the OLD Data_APCAB_2012.gs (global const) + NEW Forms_Registry.gs, and (2) OLD data + OLD registry.
// Either way AP must load, list and grade exactly as before. Missing SAT data files (registry lists them) → "not available", no crash.
const { createGas } = require('./gas'); const { initialTabs } = require('./server');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };
for (const [dir, label] of [[process.argv[2], 'old Data_APCAB_2012 (const) + new registry'], [process.argv[3], 'old Data_APCAB_2012 + old registry']]) {
  console.log('[' + label + ']');
  const G = createGas(require('./paths').APP, dir, initialTabs());
  const fd = G.ctx.formData_('APCAB-2012'), pf = G.ctx.profileFor_('APCAB-2012');
  check(fd && fd.questions.length === 45 && pf.parts.map(p => p.n).join() === '28,17', 'APCAB-2012 loads: 45 questions, parts 28/17');
  const lf = G.call('listForms', ['T01']); const f = lf.forms.find(x => x.form_id === 'APCAB-2012');
  check(f && f.available && f.title === 'Practice Exam 2012 – Section I', 'My Tests lists AP as available');
  const t = G.call('getTest', ['T01', 'APCAB-2012', {}]); check(t.ok && t.questions.length === 45 && !JSON.stringify(t).includes('"key"'), 'getTest works, no key');
  for (const id of ['SAT-2026-08-I2', 'SAT-2026-09-USA']) { // 08-I2: not in any registry · 09-USA: in the new registry, Data file not pasted
    let err = ''; try { G.call('getTest', ['T03', id, {}]); } catch (e) { err = e.message; }
    check(/FORM: This test is not available yet/.test(err), id + ' without its Data file → "not available yet" (' + err + ')');
  }
  G.sheets.Forms.rows.push(['SAT-2026-09-USA', 'SAT', 'RW1', '', 27, 32, 'No', 'x']);
  const lf3 = G.call('listForms', ['T03']).forms.find(x => x.form_id === 'SAT-2026-09-USA');
  check(lf3 && lf3.available === false, 'My Tests: SAT form without Data file shows as "Coming soon"');
}
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
