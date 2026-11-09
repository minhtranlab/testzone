// #21 (re-test fixes v1.8), server only: B1 Report pick with no Drive rights + cold caches · N2 pick kept after a re-grade ·
// m6 device / answer events as text · m8 script-wide sign-in limit · N1 copy token (server side; the browser case is in copies_test.js)
const fs = require('fs'), path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { APP, WORK } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const REG = path.join(WORK, 'q21_reg'), DRIVE = path.join(WORK, 'q21_drive');
for (const d of [REG, DRIVE]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
fs.copyFileSync(path.join(WORK, 'gas_sat98', 'Forms_Registry.gs'), path.join(REG, 'Forms_Registry.gs'));
['MOCK-SAT98.json', 'MOCK-APCAB.json'].forEach(f => fs.copyFileSync(path.join(WORK, 'gas_sat98', f), path.join(DRIVE, f)));
const FOLDER = /FORM_FILES_FOLDER_ID = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8'))[1];
const G = createGas(APP, REG, initialTabs(), { driveDir: DRIVE, folderId: FOLDER });
const LOGS = []; G.ctx.console = { log(m) { LOGS.push(String(m)); }, warn(m) { LOGS.push(String(m)); }, error(m) { LOGS.push(String(m)); }, info() {} };
G.ctx.doGet({ parameter: { update: '1' } });  // Forms rows, Questions rows, columns (copy_token …)
const FORM = 'MOCK-SAT98';
const qs = G.ctx.formDataRaw_(FORM).questions;
const sess = sid => G.table('Sessions').find(s => s.session_id === sid);
const newExec = () => { G.ctx._driveIdx = null; G.ctx._rawCache = {}; G.ctx._formCache = {}; G.ctx._sheetKeys = null; }; // each Apps Script run starts with empty globals
const cold = () => { G.cache.clear(); G.ctx._driveIdx = null; G.ctx._rawCache = {}; G.ctx._formCache = {}; G.ctx._sheetKeys = null; };

/** a submitted attempt (answers = key for the first n MCQ of RW1) */
function attempt(code, n, extra = {}) {
  const t = G.call('getTest', [code, FORM, { fresh: true, device: extra.device || 'test' }]);
  const sid = t.session.session_id, now = Date.now();
  const st = { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], current_part: 'M2', phase: 'submitting', part_starts: {}, ended: {}, parts: {} };
  const events = [];
  st.seq_parts.forEach((p, i) => { st.part_starts[p] = now - (4 - i) * 60000; st.ended[p] = 'submit'; st.parts[p] = { ans: {}, elim: {}, mark: {} }; });
  qs.filter(q => q.part === 'RW1' && q.type !== 'spr').slice(0, n).forEach((q, i) => {
    st.parts.RW1.ans[q.qid] = q.key;
    events.push({ part: 'RW1', t_ms: 1000 + i * 30000, qid: q.qid, type: 'q_enter', value: null }, { part: 'RW1', t_ms: 21000 + i * 30000, qid: q.qid, type: 'select', value: q.key });
  });
  (extra.events || []).forEach(e => events.push(e));
  (extra.mutate || (() => {}))(st);
  const res = G.call('submit', [code, sid, { state: st, events, ev_from: 0, copy: t.copy }]);
  return { sid, res, t };
}

console.log('[B1 Drive denied (simple trigger) never caches an empty form list]');
check(Object.keys(G.ctx.driveFormIndex_()).length >= 2 && G.cache.has('tz_drive_idx'), 'normal read: index cached');
cold(); G.drive.denied = true;
const idx0 = G.ctx.driveFormIndex_();
check(!Object.keys(idx0).length && !G.cache.has('tz_drive_idx'), 'Drive denied: empty index, NOT cached');
check(G.ctx.formData_(FORM) === null, '(the form file cannot be read here)');
G.drive.denied = false;
check(Object.keys(G.ctx.driveFormIndex_()).length >= 2, 'next call (with Drive) reads the folder again — no 10-minute outage');
cold(); G.cache.set('tz_drive_idx', '{}');  // what v1.7 wrote in that case
check(Object.keys(G.ctx.driveFormIndex_()).length >= 2, 'an old empty cached index is ignored');

console.log('[B1 end to end: idle (cold caches) → teacher picks an attempt in Report!B2 → students]');
const A = attempt('T03', 10);
G.admin('rebuildAll');
const rp = G.sheets.Report, RF = G.ctx.RPT_FIRST, LC = G.ctx.RPT_LIST_COL;
const labelOf = sid => (rp.rows.find(r => r && r[LC] === sid) || [])[LC - 1];
const body = () => rp.rows.slice(RF - 1).map(r => (r || []).slice(0, 8).join(' ')).join('\n');
rp.rows[RF - 1] = rp.rows[RF - 1] || []; rp.rows[RF - 1][1] = 'OLD DRAWING of another attempt';
cold(); G.drive.denied = true;                // ≥ 10 min idle + simple trigger: no cache, no Drive rights
rp.rows[1][1] = labelOf(A.sid);
G.ctx.onEdit({ range: G.ctx.ss_().getSheetByName('Report').getRange(2, 2) });
check(!/OLD DRAWING|Could not draw/.test(body()) && /Attempt 1/.test(body()) && /Skill|skill|Domain|domain/.test(body()), 'B2 pick draws the attempt without Drive (tags from the Questions tab)');
check(!G.cache.has('tz_drive_idx'), 'nothing cached during the pick');
G.drive.denied = false; newExec();             // a student's call = a new web-app run (as the owner, with Drive)
const lf = G.call('listForms', ['T03']);
const card = (lf.forms || lf).find(f => f.form_id === FORM);
check(card && card.available !== false && !/Coming soon/i.test(JSON.stringify(card)), 'right after: students see the form (not "Coming soon")');
check(G.call('getTest', ['T03', FORM, {}]).ok === true, '… and can open it');
// a draw that fails anyway: old body removed + English line
const keep = G.ctx.renderSelected_; G.ctx.renderSelected_ = () => { throw new Error('Cannot read properties of null (reading x)'); };
rp.rows[RF - 1][1] = 'OLD DRAWING';
G.ctx.onEdit({ range: G.ctx.ss_().getSheetByName('Report').getRange(2, 2) });
G.ctx.renderSelected_ = keep;
check(!/OLD DRAWING|Cannot read/.test(body()) && /Could not draw this attempt\. Use the menu Test Zone → Refresh report\./.test(body()), 'failed draw: old drawing cleared, English message (no raw error)');

console.log('[N2 the B2 pick survives a re-grade]');
rp.rows[1][1] = labelOf(A.sid);
const q0 = qs.filter(q => q.part === 'RW1' && q.type !== 'spr')[0];
const hQ = G.sheets.Questions.rows[0];
G.sheets.Questions.rows.find(r => r[hQ.indexOf('qid')] === q0.qid)[hQ.indexOf('key')] = ['A', 'B', 'C', 'D'].find(l => l !== q0.key);
G.ctx._formCache = {}; G.ctx._sheetKeys = null;
const before = rp.rows[1][1];
G.ctx.regradeFromMenu = G.ctx.regradeFromMenu; G.ctx.requireEditor_ = () => true;
G.ctx.regradeFromMenu();
check(rp.rows[1][1] && rp.rows[1][1] !== before && rp.rows[1][1] === labelOf(A.sid) && /9\/98/.test(rp.rows[1][1]), 'B2 now shows the same attempt with its new score: ' + rp.rows[1][1]);
check(/Attempt 1/.test(body()) && !/Pick an attempt/.test(body()), 'and it is drawn again');
G.sheets.Questions.rows.find(r => r[hQ.indexOf('qid')] === q0.qid)[hQ.indexOf('key')] = q0.key; G.ctx._formCache = {}; G.ctx._sheetKeys = null;

console.log('[m6 rest: device + answer events]');
const B = attempt('T03', 0, {
  device: '=1+1',
  events: [{ part: 'RW1', t_ms: 500, qid: qs[0].qid, type: 'select', value: '=1+1' }, { part: 'RW1', t_ms: 900, qid: qs[0].qid, type: 'change', value: 'zz' }]
});
check(sess(B.sid).device === '=1+1' && !G.sheets.Sessions.rows.some(r => r.some(v => v && typeof v === 'object' && v.formula)), 'getTest device "=1+1" stored as text, not a formula');
const r0 = G.table('Responses').find(r => r.session_id === B.sid && r.qid === qs[0].qid);
check(r0.first_answer === '' && r0.change_pattern === 'none', 'junk answer events → no first_answer, no "cleared" pattern');
check(G.table('Events').filter(e => e.session_id === B.sid && e.qid === qs[0].qid && (e.type === 'select' || e.type === 'change')).every(e => e.value === ''), 'Events: junk answer values stored as blank');

console.log('[N1 copy token, server side]');
const t1 = G.call('getTest', ['T03', FORM, { fresh: true }]);
const t2 = G.call('getTest', ['T03', FORM, { resume: t1.session.session_id }]);
check(t1.copy && t2.copy && t1.copy !== t2.copy && sess(t1.session.session_id).copy_token === t2.copy, 'each getTest = a new live copy');
const base = () => JSON.parse(sess(t1.session.session_id).state_json || 'null') || { seq_parts: ['RW1', 'RW2', 'M1', 'M2'], parts: {}, part_starts: {}, ended: {} };
const stA = Object.assign(base(), { current_part: 'RW1', phase: 'test', part_starts: { RW1: Date.now() - 1000 } });
const r1 = G.call('autosave', ['T03', t1.session.session_id, { state: stA, events: [], ev_from: 0, copy: t1.copy }]);
check(r1.other_copy && !r1.ok && !base().part_starts.RW1, 'older copy: part start refused');
const r2 = G.call('autosave', ['T03', t1.session.session_id, { state: stA, events: [], ev_from: 0, copy: t2.copy }]);
check(r2.ok && !!base().part_starts.RW1, 'live copy: accepted');

console.log('[m8 script-wide sign-in limit]');
for (let i = 0; i < 29; i++) G.call('login', ['ZZ' + i, 'dev' + i]);
check(G.call('login', ['T03', 'devOK']).ok === true, '29 wrong codes from 29 devices: sign-in still works');
const last = G.call('login', ['ZZ29', 'dev29']);
check(/paused for 5 minutes/.test(last.msg), '30th wrong code → "Sign-in is paused for 5 minutes"');
check(G.call('login', ['T03', 'devNew']).locked === true, 'every sign-in waits (even a right code, new device)');
let thr = ''; try { G.call('listForms', ['NOPE']); } catch (e) { thr = e.message; }
check(/paused for 5 minutes/.test(thr) && G.call('listForms', ['T03']), 'unknown codes refused on other calls too; a signed-in student keeps working');
G.shift(5 * 60000 + 1000);
check(G.call('login', ['T03', 'devNew']).ok === true, '5 minutes later: sign-in works again');
G.resetShift();

console.log(`\nqa21_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
