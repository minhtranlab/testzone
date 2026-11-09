// v1.5: form data comes from "<form_id>.json" files in the Drive folder (no Data_*.gs in the Apps Script project),
// and the Sheet update runs once per new version (Update.gs, started by the Action via ?update=1).
const fs = require('fs'), path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { APP, WORK } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

// Registry only (profiles) + Drive folder with the form JSON files — exactly the production layout.
const REG = path.join(WORK, 'drive_reg'), DRIVE = path.join(WORK, 'drive');
for (const d of [REG, DRIVE]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
fs.copyFileSync(path.join(WORK, 'gas_sat', 'Forms_Registry.gs'), path.join(REG, 'Forms_Registry.gs')); // MOCK-APCAB + MOCK-SAT
fs.copyFileSync(path.join(WORK, 'gas', 'MOCK-APCAB.json'), path.join(DRIVE, 'MOCK-APCAB.json'));        // MOCK-SAT: not uploaded
fs.writeFileSync(path.join(DRIVE, 'notes.txt'), 'not a form');
const FOLDER = /FORM_FILES_FOLDER_ID = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8'))[1];
const tabs = initialTabs();
const G = createGas(APP, REG, tabs, { driveDir: DRIVE, folderId: FOLDER });
const C = G.ctx;
C.console = { log() {}, warn() {}, error() {}, info() {} }; // keep the output to the checks
const fresh = () => { C._driveIdx = null; C._formCache = {}; C._formReg = null; }; // = a new Apps Script execution

console.log('Drive form files');
check(typeof C.FORM_MOCK_APCAB_ === 'undefined', 'no Data_*.gs loaded (production layout)');
check(JSON.stringify(G.admin('formIds')) === JSON.stringify(['MOCK-APCAB']), 'formIds_ = forms whose JSON is on Drive (MOCK-SAT listed in registry, not on Drive → hidden)');
const fd = C.formData_('MOCK-APCAB');
check(fd && fd.questions.length === 4 && fd.questions.every(q => q.key !== undefined), 'formData_ parses the Drive JSON (server side, keys present)');
check(G.dstats.reads === 1, 'one Drive read');
fresh(); C.formData_('MOCK-APCAB');
check(G.dstats.reads === 1, 'next execution: served from CacheService, no Drive read');
const nChunks = Number([...G.cache.entries()].find(([k]) => /^tz_form_.*_n$/.test(k))[1]);
check(nChunks >= 1, 'form text cached in ' + nChunks + ' chunk(s) of ≤ 90 000 chars');

// a big form (SAT mock with figures) is split into several cache chunks and re-joined exactly
const sat98 = JSON.parse(fs.readFileSync(path.join(WORK, 'gas_sat98', 'MOCK-SAT98.json'), 'utf8'));
sat98.questions[0].stem_html += '<p>' + 'x'.repeat(250000) + '</p>'; // real SAT forms are 0.2–1.1 MB
fs.writeFileSync(path.join(DRIVE, 'MOCK-SAT98.json'), JSON.stringify(sat98));
const big = fs.readFileSync(path.join(DRIVE, 'MOCK-SAT98.json'), 'utf8');
G.cache.clear(); fresh();
const reads0 = G.dstats.reads;
const d98 = C.driveFormData_('MOCK-SAT98');
fresh(); const d98b = C.driveFormData_('MOCK-SAT98');
const n98 = Number([...G.cache.entries()].find(([k]) => /MOCK-SAT98|MOCK_SAT98/.test(k) && /_n$/.test(k))[1]);
check(n98 === Math.ceil(big.length / 90000) && n98 > 1, `big form (${Math.round(big.length / 1024)} KB) → ${n98} chunks`);
check(JSON.stringify(d98b) === JSON.stringify(d98) && G.dstats.reads === reads0 + 1, 'chunks re-joined = same data, Drive read once');

// student path: login → My Tests → getTest; the key never reaches the browser
fresh();
const forms = G.call('listForms', ['T01']);
check(JSON.stringify(forms).includes('MOCK-APCAB'), 'listForms shows the Drive form to an AP student');
const t = G.call('getTest', ['T01', 'MOCK-APCAB', {}]);
const payload = JSON.stringify(t);
check(t && t.questions && t.questions.length === 4, 'getTest returns the 4 questions');
check(!/"key"|key_source|"tags"/.test(payload), 'getTest payload has no key / key_source / tags');

// a file whose content is another form is refused
fs.writeFileSync(path.join(DRIVE, 'MOCK-WRONG.json'), JSON.stringify({ form_id: 'MOCK-APCAB', profile: {}, questions: [] }));
G.cache.clear(); fresh();
let err = ''; try { C.driveFormData_('MOCK-WRONG'); } catch (e) { err = e.message; }
check(/holds form MOCK-APCAB/.test(err), 'file name / form_id mismatch → error, not served');
fs.rmSync(path.join(DRIVE, 'MOCK-WRONG.json'));

// folder not readable → no forms, no crash
const G2 = createGas(APP, REG, initialTabs(), { driveDir: DRIVE, folderId: 'OTHER' });
check(JSON.stringify(G2.admin('formIds')) === '[]', 'Drive folder not readable → no forms listed (logged), app still runs');

console.log('Update once per version (?update=1)');
G.cache.clear(); fresh();
const ver = C.APP_VERSION + ' · ' + C.APP_BUILD;
const r1 = C.doGet({ parameter: { update: '1' } }).getContent();
check(r1 === 'Test Zone update: done · ' + ver, 'first ping runs the update: "' + r1 + '"');
const st = G.table('Settings').find(r => r.key === 'code_version');
check(st && st.value === ver && /Last run: .*questions added: 4.*reports rebuilt.*checkSheet/.test(st.meaning), 'Settings.code_version = ' + ver + ' + one-line result');
check(G.table('Questions').filter(r => r.form_id === 'MOCK-APCAB').length === 4, 'Questions tab: 4 rows imported from the Drive form');
check(G.table('Sessions').length > 0 && Object.keys(G.table('Sessions')[0]).includes('score_RW'), 'missing Sessions columns added (score_RW …)');
check(G.order.includes('Report'), 'Report tab exists after the update');
const r2 = C.doGet({ parameter: { update: '1' } }).getContent();
check(r2 === 'Test Zone update: already up to date · ' + ver, 'second ping does nothing: "' + r2 + '"');
check(!/MOCK-APCAB|T01|key/i.test(r1 + r2), 'ping answers carry no Sheet data');
check(G.table('Questions').filter(r => r.form_id === 'MOCK-APCAB').length === 4, 'no duplicate Questions rows');
// a failing step keeps the old stamp so the next ping retries
const orig = C.rebuildAll_; C.rebuildAll_ = () => { throw new Error('boom'); };
C.APP_BUILD = 'abc1234'; const r3 = C.doGet({ parameter: { update: '1' } }).getContent();
check(/FAILED \(1 step/.test(r3) && G.table('Settings').find(r => r.key === 'code_version').value === ver, 'failed step → "FAILED", stamp unchanged (retried next time)');
C.rebuildAll_ = orig; const r4 = C.doGet({ parameter: { update: '1' } }).getContent();
check(r4 === 'Test Zone update: done · ' + C.APP_VERSION + ' · abc1234' && G.table('Settings').filter(r => r.key === 'code_version').length === 1, 'retry succeeds; still one code_version row');

console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
