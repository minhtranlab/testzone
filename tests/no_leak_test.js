// The repo is PUBLIC: fail if question data, answer keys, figures or secrets slip in.
// Scans every file git would publish (tracked + new files that are not git-ignored).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const files = execSync('git ls-files -z --cached --others --exclude-standard', { cwd: ROOT }).toString().split('\0').filter(Boolean)
  .filter(f => fs.existsSync(path.join(ROOT, f)));
const DESMOS_DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6'; // Desmos's public demo key (documented by Desmos), not Minh's key
const problems = [];
const bad = (f, why) => problems.push(f + ': ' + why);

for (const f of files) {
  const inFixtures = f.startsWith('tests/fixtures/');
  // 1. paths that must never be in the repo
  if (/^(data|dist|Materials|Sample Test|qa|reports)\//.test(f)) bad(f, 'project-folder data path');
  if (/(^|\/)Data_[^/]*\.gs$/.test(f)) bad(f, 'built form data file (questions + keys)');
  if (/(^|\/)Questions_[^/]*\.csv$/.test(f)) bad(f, 'Questions export (keys)');
  if (/(^|\/)questions\.json$/.test(f) && !inFixtures) bad(f, 'question bank outside tests/fixtures');
  if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(f) && !inFixtures) bad(f, 'image/PDF outside tests/fixtures');
  if (/(^|\/)\.clasprc\.json$|creds?\.json$|\.pem$|\.p12$/.test(f)) bad(f, 'credentials file');
  if (/\.json$/.test(f) && /^(APCAB|SAT)-/.test(path.basename(f)) && !f.startsWith('tools/profiles/')) bad(f, 'form JSON (Drive file) in the repo');
  if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(f)) continue;

  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 2. fixtures must be the made-up mock forms only
  if (inFixtures && /questions\.json$/.test(f)) {
    if (!/^MOCK/.test(String(JSON.parse(s).form_id))) bad(f, 'fixture form_id must start with MOCK (made-up forms only)');
  }
  if (f.startsWith('tools/profiles/') && /"(key|questions|stem_html)"\s*:/.test(s)) bad(f, 'profile holds questions/keys');
  // 3. source shipped to Apps Script: no embedded form data
  if (f.startsWith('src/')) {
    if (/\\?"key\\?"\s*:\s*\\?["\[]/.test(s)) bad(f, 'answer key field ("key": …) in shipped source');
    if (/function FORM_\w+_\(\)\s*\{\s*return JSON\.parse/.test(s)) bad(f, 'embedded form data');
    if (/data:image\/[a-z]+;base64,[A-Za-z0-9+\/=]{2000,}/.test(s)) bad(f, 'embedded figure (base64 image)');
    if (/"stem_html"|\\"stem_html\\"/.test(s)) bad(f, 'question stem in shipped source');
  }
  // 4. secrets anywhere
  if (/\b1\/\/0[A-Za-z0-9_-]{20,}/.test(s)) bad(f, 'Google refresh token');
  if (/\bya29\.[A-Za-z0-9_-]{20,}/.test(s)) bad(f, 'Google access token');
  if (/\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(s)) bad(f, 'GitHub token');
  if (/"refresh_token"\s*:\s*"[^"]{10,}/.test(s)) bad(f, 'refresh_token value');
  if (/GOCSPX-[A-Za-z0-9_-]{10,}/.test(s)) bad(f, 'OAuth client secret');
  for (const m of s.match(/\b[0-9a-f]{32}\b/g) || []) if (m !== DESMOS_DEMO_KEY) bad(f, '32-hex string (API key?) ' + m.slice(0, 6) + '…');
  // 5. nothing big (form data is big)
  if (s.length > 400 * 1024 && !inFixtures) bad(f, 'file > 400 KB');
}

console.log(`no_leak_test: ${files.length} files scanned`);
if (problems.length) { console.log('FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('PASS: no question data, keys, figures or secrets');
