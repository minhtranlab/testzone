// Editor-only guard (Setup.gs requireEditor_) under the 4 identity situations Apps Script can give.
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };
const G = createGas(require('./paths').APP, require('./paths').WORK + '/gas', initialTabs());
const S = G.ctx.Session;
function as(active, effective, fn) {
  S.getActiveUser = () => ({ getEmail: () => { if (active === null) throw new Error('no scope'); return active; } });
  S.getEffectiveUser = () => ({ getEmail: () => { if (effective === null) throw new Error('no scope'); return effective; } });
  try { const r = G.ctx[fn](); return { ok: true, r }; } catch (e) { return { ok: false, msg: e.message }; }
}
for (const fn of ['checkSheet', 'addMissingColumns', 'importQuestions', 'rebuildAll', 'updateAfterNewVersion']) {
  let x = as('minh@gmail.com', 'minh@gmail.com', fn); check(x.ok && x.r === undefined, fn + ': editor (owner = owner) runs, returns nothing to the caller');
  x = as('', '', fn); check(x.ok && x.r === undefined, fn + ': email permission not granted ("" / "") runs (Minh 2026-11-06)');
  x = as(null, null, fn); check(x.ok, fn + ': getEmail throws (no scope) runs');
  x = as('', 'minh@gmail.com', fn); check(!x.ok && /editor/.test(x.msg), fn + ': web-app student ("" / owner) blocked');
  x = as('student@gmail.com', 'minh@gmail.com', fn); check(!x.ok, fn + ': other signed-in user blocked');
}
let x = as('', 'minh@gmail.com', 'refreshReport'); check(!x.ok, 'refreshReport (menu): web-app student blocked');
x = as('', '', 'refreshReport'); check(x.ok, 'refreshReport (menu): no-email case runs');
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
