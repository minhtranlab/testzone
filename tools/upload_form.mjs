#!/usr/bin/env node
// Upload (or replace) a form file in the private Drive folder "Test Zone - Form Files".
//   node tools/upload_form.mjs dist/APCAB-2012.json [more.json …]
// Uses the clasp login in ~/.clasprc.json (scope drive.file: it can only see files it created itself).
// A file with the same name that this tool created before is updated in place (same file id); otherwise a new file.
// The script finds files by name (<form_id>.json) and picks up a change within 10 minutes (cache).
// NEVER put these files in the repo: they hold questions + answer keys.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { createRequire } from 'module';

const FOLDER = '1Nd3X_obFvl8Tkw_zweZA4sNp0-ITtLAo'; // My Drive › 📚 Academics › SAT › Test Zone › Test Zone - Form Files
const require = createRequire(import.meta.url);
let OAuth2Client;
for (const p of [process.cwd(), path.dirname(new URL(import.meta.url).pathname)]) {
  try { ({ OAuth2Client } = require(require.resolve('google-auth-library', { paths: [p, path.join(p, 'node_modules/@google/clasp')] }))); break; } catch (e) { /* next */ }
}
if (!OAuth2Client) { console.error('npm i @google/clasp first (it brings google-auth-library)'); process.exit(2); }

const rc = JSON.parse(fs.readFileSync(process.env.CLASPRC || path.join(os.homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const auth = new OAuth2Client({ clientId: rc.client_id, clientSecret: rc.client_secret });
auth.setCredentials({ refresh_token: rc.refresh_token });
const api = (url, opts = {}) => auth.request({ url, ...opts }).then(r => r.data);

for (const file of process.argv.slice(2)) {
  const name = path.basename(file);
  const text = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(text);
  if (!data.form_id || name !== data.form_id + '.json' || !Array.isArray(data.questions)) throw new Error(name + ': not a form file (<form_id>.json)');
  const q = encodeURIComponent(`name = '${name}' and '${FOLDER}' in parents and trashed = false`);
  const found = (await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`)).files || [];
  const boundary = 'tz' + Date.now();
  const meta = found.length ? { name } : { name, parents: [FOLDER], mimeType: 'application/json' };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
               `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  const url = found.length
    ? `https://www.googleapis.com/upload/drive/v3/files/${found[0].id}?uploadType=multipart&fields=id,name,size`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size`;
  const r = await api(url, { method: found.length ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  console.log(`${found.length ? 'updated' : 'created'} ${r.name} (${Math.round(r.size / 1024)} KB, ${data.questions.length} questions) id ${r.id}`);
}
