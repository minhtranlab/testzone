// SAT round 2 (#3): the per-deploy Sheet update on the real (old, Vietnamese) Sheet layout, and keys from the Questions tab.
const fs = require('fs'), path = require('path');
const { createGas } = require('./gas');
const { initialTabs } = require('./server');
const { APP, WORK } = require('./paths');
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const REG = path.join(WORK, 'sync_reg'), DRIVE = path.join(WORK, 'sync_drive');
for (const d of [REG, DRIVE]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
fs.copyFileSync(path.join(WORK, 'gas_sat98', 'Forms_Registry.gs'), path.join(REG, 'Forms_Registry.gs')); // MOCK-SAT98 + MOCK-APCAB
fs.copyFileSync(path.join(WORK, 'gas_sat98', 'MOCK-SAT98.json'), path.join(DRIVE, 'MOCK-SAT98.json'));
fs.copyFileSync(path.join(WORK, 'gas_sat98', 'MOCK-APCAB.json'), path.join(DRIVE, 'MOCK-APCAB.json'));
const FOLDER = /FORM_FILES_FOLDER_ID = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8'))[1];

// the Sheet as it is before the update: old headers, Vietnamese texts, old SAT form ids
const tabs = initialTabs();
tabs.Student_Report[0] = tabs.Student_Report[0].map(h => h === 'summary' ? 'summary_vi' : h);
tabs.Dictionary = [['tab', 'column', 'ý nghĩa', 'ví dụ'], ['Sessions', 'status', 'trạng thái', 'paused']];
tabs.README = [['Test Zone – Data'], ['Sheet này là database của app Test Zone.']];
tabs.Settings.push(['code_version', 'v1.5 · old', 'x']);
tabs.Settings[1][2] = 'Tên hiển thị trên app';
['RW1', 'RW2', 'M1', 'M2'].forEach(p => tabs.Forms.push(['SAT-2026-08-I2', 'SAT', p, '', p[0] === 'R' ? 27 : 22, p[0] === 'R' ? 32 : 35, p[0] === 'R' ? 'No' : 'Yes', 'Đề dự đoán bên thứ ba (không phải College Board) · Sample Test: 2026 08 ver 1']));
const G = createGas(APP, REG, tabs, { driveDir: DRIVE, folderId: FOLDER });
G.ctx.console = { log() {}, warn() {}, error() {}, info() {} };

console.log('[update on the old Sheet]');
const r = G.ctx.doGet({ parameter: { update: '1' } }).getContent();
check(/^Test Zone update: done · /.test(r), 'update ran: ' + r);
const head = name => G.sheets[name].rows[0].map(String);
check(head('Student_Report').includes('summary') && !head('Student_Report').includes('summary_vi') && head('Student_Report').includes('estimated_score'), 'Student_Report: summary_vi → summary, + estimated_score');
check(head('Dictionary').slice(0, 4).join() === 'tab,column,meaning,example', 'Dictionary headers in English');
const forms = G.table('Forms');
check(forms.filter(f => f.form_id === 'SAT-2026-08').length === 4 && !forms.some(f => f.form_id === 'SAT-2026-08-I2'), 'old SAT id renamed in Forms (SAT-2026-08-I2 → SAT-2026-08)');
check(forms.filter(f => f.form_id === 'SAT-2026-08').every(f => /^Third-party predicted form \(not College Board\) · Sample Test: 2026 08 ver 1$/.test(f.source)), 'Forms.source translated');
const m98 = forms.filter(f => f.form_id === 'MOCK-SAT98');
check(m98.length === 4 && m98.every(f => f.data_file_id === 'DRV_MOCK-SAT98.json') && m98.map(f => f.part + ':' + f.n_questions + ':' + f.time_limit_min).join() === 'RW1:27:32,RW2:27:32,M1:22:35,M2:22:35', 'Forms rows added for a form that has its Drive file (with data_file_id)');
check(forms.filter(f => f.form_id === 'MOCK-APCAB').every(f => f.data_file_id === 'DRV_MOCK-APCAB.json'), 'empty data_file_id filled for existing rows');
const set = G.table('Settings');
check(set.some(s => s.key === 'teacher_code' && s.value === '') && set.find(s => s.key === 'app_name').meaning === 'Name shown in the app', 'Settings: teacher_code row added (empty = off), meanings in English');
check(/^v1\.\d.* · dev$/.test(set.find(s => s.key === 'code_version').value), 'code_version stamp updated');
const readme = G.sheets.README.rows.map(r => (r || []).join(' ')).join('\n');
check(/Start in the Report tab/.test(readme) && !/Sheet này/.test(readme) && G.sheets.README.rows.length >= 30, 'README rewritten in English (old rows gone)');
check(G.table('Dictionary').length > 100 && !G.table('Dictionary').some(x => /trạng thái/.test(x.meaning || '')), 'Dictionary rewritten in English');
check(G.order.includes('Score_Scale') && G.sheets.Score_Scale.rows.length >= 152 && G.sheets.Score_Scale.rows[0][13] === 'key', 'Score_Scale tab created (scale A:L + rules N:P)');
G.sheets.Score_Scale.rows[1 + 0][13]; // rules row exists
const ru = G.sheets.Score_Scale.rows.findIndex(x => x && x[13] === 'm1_weak_cap');
G.sheets.Score_Scale.rows[ru][14] = 550; G.ctx._scoreScale = null;
check(G.ctx.satSectionEstimate_('RW', 14, 12).score <= 550, 'Score_Scale edited by Minh (cap 600 → 550) is used');
G.sheets.Score_Scale.rows[ru][14] = 600; G.ctx._scoreScale = null;
check(G.table('Questions').filter(q => q.form_id === 'MOCK-SAT98').length === 98, 'Questions rows imported for the new form');
const r2 = G.ctx.doGet({ parameter: { update: '1' } }).getContent();
check(/already up to date/.test(r2) && G.table('Forms').length === forms.length && G.table('Settings').filter(s => s.key === 'teacher_code').length === 1, 'second ping: nothing changes (idempotent)');
G.sheets.Score_Scale.rows[ru][14] = 580; G.ctx.APP_BUILD = 'next'; G.ctx.doGet({ parameter: { update: '1' } });
check(G.sheets.Score_Scale.rows[ru][14] === 580, 'next deploy keeps Minh\'s Score_Scale edits');

console.log('[keys from the Questions tab]');
const fresh = () => { G.ctx._formCache = {}; G.ctx._sheetKeys = null; };
const qrows = G.sheets.Questions.rows, hq = qrows[0], ik = hq.indexOf('key'), iq = hq.indexOf('qid');
const mcq = G.ctx.formDataRaw_('MOCK-SAT98').questions.find(q => q.type !== 'spr'), spr = G.ctx.formDataRaw_('MOCK-SAT98').questions.find(q => q.type === 'spr');
const other = ['A', 'B', 'C', 'D'].find(l => l !== mcq.key);
qrows.find(x => x[iq] === mcq.qid)[ik] = other.toLowerCase();
qrows.find(x => x[iq] === spr.qid)[ik] = '7/2|3.5';
fresh();
const fd = G.ctx.formData_('MOCK-SAT98'), m2 = fd.questions.find(q => q.qid === mcq.qid), s2 = fd.questions.find(q => q.qid === spr.qid);
check(m2.key === other && m2.key_data === mcq.key, `MCQ key from the Sheet (${mcq.key} → ${other}) overrides the data file`);
check(G.ctx.isCorrect_(m2, other) && !G.ctx.isCorrect_(m2, mcq.key), 'grading uses the Sheet key');
check(JSON.stringify(s2.key) === '["7/2","3.5"]' && G.ctx.isCorrect_(s2, '3.50') && G.ctx.isCorrect_(s2, '7/2'), 'SPR key list from the Sheet ("|" separated)');
check(G.ctx.formDataRaw_('MOCK-SAT98').questions.find(q => q.qid === mcq.qid).key === mcq.key, 'raw data file untouched');
qrows.find(x => x[iq] === spr.qid)[ik] = new Date('2026-07-02T00:00:00Z'); fresh();
check(JSON.stringify(G.ctx.formData_('MOCK-SAT98').questions.find(q => q.qid === spr.qid).key) === JSON.stringify(spr.key), 'a key cell Sheets turned into a date is ignored (data key used)');
const cs = G.ctx.checkSheet_();
check(/Key changed in the Sheet \(the Sheet key is used/.test(cs) && !/KEY DIFFERS/.test(cs), 'checkSheet lists key changes as information, not as a problem');
console.log(`\nsync_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
