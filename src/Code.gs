/**
 * Test Zone — server (Google Apps Script web app)
 * ------------------------------------------------
 * Server calls from the browser (only these):
 *   login(code) · listForms(code) · getTest(code, formId, opts) · autosave(code, sessionId, payload) · submit(code, sessionId, payload)
 * The answer key never leaves the server: getTest() whitelists the fields it sends.
 * All Sheet access is by header name (row 1), never by column position.
 * Form data (questions + keys) = one JSON file per form in the Drive folder FORM_FILES_FOLDER_ID, named <form_id>.json
 * (built by tools/build_data.py, never in the public GitHub repo). Forms_Registry.gs lists the forms' profiles only.
 * Source of truth: github.com/minhtranlab/testzone — every push to main deploys automatically (see README.md).
 */

var SHEET_ID = '1J4hiHL4qq-lcSlMZtzAwssIYpX36Wgff5NGhAYUZekY';           // "Test Zone – Data" (minhtranipad@gmail.com)
var FORM_FILES_FOLDER_ID = '1Nd3X_obFvl8Tkw_zweZA4sNp0-ITtLAo';      // Drive: Test Zone › Test Zone - Form Files (private)
var APP_VERSION = 'v1.12 (2026-11-11, new home)';
var APP_BUILD = 'dev';  // replaced by the GitHub Action with the commit id → the Sheet update (Update.gs) runs once per deploy

/* ============================== web app ============================== */

function doGet(e) {
  // Called by the GitHub Action right after each deploy: runs the Sheet update once per new version (Update.gs).
  // Returns a one-line status only (no Sheet data), so it is safe on the public URL.
  if (e && e.parameter && e.parameter.update === '1') {
    return ContentService.createTextOutput(runUpdateIfNeeded_()).setMimeType(ContentService.MimeType.TEXT);
  }
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle(getSettings_().app_name || 'Test Zone')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ============================== sheet helpers ============================== */

var _ss = null;
function ss_() {
  if (!_ss) {
    try { var a = SpreadsheetApp.getActiveSpreadsheet(); if (a && a.getId() === SHEET_ID) _ss = a; } catch (e) {}
    if (!_ss) _ss = SpreadsheetApp.openById(SHEET_ID); // web app context
  }
  return _ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}

/** Read a whole tab → {sh, headers, idx (name→0-based col), rows: [{_row, col: value…}]} */
function readTable_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastCol < 1) return { sh: sh, headers: [], idx: {}, rows: [] };
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    for (var c = 0; c < row.length; c++) { if (row[c] !== '' && row[c] !== null) { empty = false; break; } }
    if (empty) continue;
    var o = { _row: r + 1 };
    headers.forEach(function (h, i) { if (h) o[h] = row[i]; });
    rows.push(o);
  }
  return { sh: sh, headers: headers, idx: idx, rows: rows };
}

/** Header list of a tab (row 1). */
function headers_(name) {
  var sh = sheet_(name);
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** Make sure the tab's grid has at least lastRowNeeded rows / lastColNeeded columns (the Sheet grid does not grow by itself). */
function ensureGrid_(sh, lastRowNeeded, lastColNeeded) {
  var maxR = sh.getMaxRows();
  if (lastRowNeeded > maxR) sh.insertRowsAfter(maxR, lastRowNeeded - maxR + 500); // +500 spare → fewer grow calls
  if (lastColNeeded) {
    var maxC = sh.getMaxColumns();
    if (lastColNeeded > maxC) sh.insertColumnsAfter(maxC, lastColNeeded - maxC);
  }
}

function rowsFor_(headers, objs) {
  return objs.map(function (o) {
    return headers.map(function (h) { return (h in o && o[h] !== undefined && o[h] !== null) ? o[h] : ''; });
  });
}

/** Append objects as rows, mapping keys to headers by name. Unknown keys are ignored. Grows the grid first. */
function appendObjects_(name, objs) {
  if (!objs || !objs.length) return;
  var sh = sheet_(name);
  var headers = headers_(name);
  var data = rowsFor_(headers, objs);
  var start = sh.getLastRow() + 1;
  try {
    ensureGrid_(sh, start + data.length - 1, headers.length);
    sh.getRange(start, 1, data.length, headers.length).setValues(data);
  } catch (e) {
    console.error('WRITE FAILED appendObjects_(' + name + ', ' + data.length + ' rows at row ' + start + '): ' + e);
    throw e;
  }
}

/** Update named fields of one row (1-based sheet row). */
function updateRow_(name, rowNum, fields) {
  var sh = sheet_(name);
  var headers = headers_(name);
  var cur = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var changed = false;
  cur = cur.map(keepCell_); // cells not in `fields` are written back as they were (text stays text, #16 M1)
  headers.forEach(function (h, i) {
    if (h in fields && fields[h] !== undefined) { cur[i] = fields[h] === null ? '' : fields[h]; changed = true; }
  });
  try {
    if (changed) sh.getRange(rowNum, 1, 1, headers.length).setValues([cur]);
  } catch (e) {
    console.error('WRITE FAILED updateRow_(' + name + ', row ' + rowNum + '): ' + e);
    throw e;
  }
}

/** Rewrite a summary tab: keep rows where keep(row) is true, then add newObjs. Header row untouched.
 *  Safe order: grow grid → write the new block over rows 2.. → only then clear leftover rows below it.
 *  If the write throws, the old rows are still there (never an empty tab). */
function rewriteTable_(name, keep, newObjs) {
  var t = readTable_(name);
  var headers = t.headers;
  var kept = t.rows.filter(keep).map(function (o) {
    return headers.map(function (h) {
      var v = h in o ? o[h] : '';
      // text that looks like a number / fraction / formula (topic "6.10", SPR key "3/4") must stay text when written back
      return keepCell_(v);
    });
  });
  var all = kept.concat(rowsFor_(headers, newObjs));
  var sh = t.sh;
  var oldLast = sh.getLastRow();
  try {
    if (all.length) {
      ensureGrid_(sh, 1 + all.length, headers.length);
      sh.getRange(2, 1, all.length, headers.length).setValues(all);
    }
    var newLast = 1 + all.length;
    if (oldLast > newLast) sh.getRange(newLast + 1, 1, oldLast - newLast, headers.length).clearContent();
  } catch (e) {
    console.error('WRITE FAILED rewriteTable_(' + name + ', ' + all.length + ' rows): ' + e);
    throw e;
  }
}

function getSettings_() {
  var defaults = {
    app_name: 'Test Zone', fast_ratio: 0.5, slow_ratio: 1.5, guess_window_sec: 60, guess_min_time_sec: 15,
    weak_accuracy: 0.6, min_questions_for_verdict: 2, autosave_sec: 60, five_min_warning_sec: 300,
    desmos_api_key: '', show_results: 'score_and_right_wrong',
    valid_min_time_ratio: 0.3, valid_quick_ratio: 0.3, valid_blank_ratio: 0.3, unit_slow_ratio: 0.4
  };
  try {
    var t = readTable_('Settings');
    t.rows.forEach(function (r) {
      var k = String(r.key || '').trim();
      if (!k) return;
      var v = r.value;
      if (typeof defaults[k] === 'number') { var n = Number(v); if (v !== '' && !isNaN(n)) defaults[k] = n; }
      else defaults[k] = (v === null || v === undefined) ? '' : String(v).trim();
    });
  } catch (e) { /* defaults */ }
  if (!defaults.app_name) defaults.app_name = 'Test Zone';
  return defaults;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
}
function fmtDate_(d, pattern) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', pattern);
}
function round_(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
function normCode_(c) { return String(c || '').trim().toUpperCase(); }
/** Force text in Sheets (so topic "6.10" is not turned into the number 6.1). */
function txt_(v) { return (v === null || v === undefined || v === '') ? '' : "'" + String(v); }
function isYes_(v) { var s = String(v).trim().toLowerCase(); return s === 'yes' || s === 'y' || s === 'true' || s === '1' || v === true; }

/* ============================== forms (registry + Forms tab) ============================== */

/** Registry (Forms_Registry.gs): {form_id: {profile, load}}. Built once per execution. */
var _formReg = null, _formCache = {};
function formRegistry_() {
  if (!_formReg) _formReg = (typeof getFormRegistry_ === 'function') ? getFormRegistry_() : {};
  return _formReg;
}
/** One registry entry. An older registry maps form_id straight to the data object → wrap it. */
function regEntry_(formId) {
  var e = formRegistry_()[formId];
  if (!e) return null;
  if (typeof e.load !== 'function') return { profile: e.profile, load: function () { return e; }, legacy: e };
  if (typeof e.has === 'function' && !e.has()) {
    // No Data_*.gs in the project (normal since v1.5) → the form's JSON file on Drive, if it is there.
    if (!driveFormIndex_()[formId]) return null; // listed, but its file is not on Drive (yet)
    return { profile: e.profile, load: function () { return driveFormData_(formId); } };
  }
  return e;
}

/* ---------- form files on Drive (questions + keys; server only) ---------- */

/** {form_id: 'fileId:lastUpdatedMs'} for every "<form_id>.json" in the Form Files folder. Cached 10 min. */
var _driveIdx = null;
function driveFormIndex_() {
  if (_driveIdx) return _driveIdx;
  var cache = CacheService.getScriptCache(), hit = cache.get('tz_drive_idx');
  if (hit) { var h = JSON.parse(hit); if (h && Object.keys(h).length) return (_driveIdx = h); } // an empty index is never trusted
  var idx = {}, ok = false;
  try {
    var it = DriveApp.getFolderById(FORM_FILES_FOLDER_ID).getFiles();
    while (it.hasNext()) {
      var f = it.next(), m = /^(.+)\.json$/i.exec(f.getName());
      if (!m || f.isTrashed()) continue;
      var t = f.getLastUpdated().getTime();  // two files with one name → the newest wins
      if (!idx[m[1]] || t > Number(idx[m[1]].split(':')[1])) idx[m[1]] = f.getId() + ':' + t;
    }
    ok = true;
  } catch (err) { console.error('FORM FILES FOLDER NOT READABLE: ' + err); }
  // Forms.data_file_id typed by hand (e.g. a file in another account's folder shared with the script owner) wins
  try {
    readTable_('Forms').rows.forEach(function (r) {
      var id = String(r.data_file_id || '').trim(), f = String(r.form_id).trim();
      if (!id || !f || (idx[f] && idx[f].split(':')[0] === id)) return;
      try { idx[f] = id + ':' + DriveApp.getFileById(id).getLastUpdated().getTime(); }
      catch (e2) { console.error('Forms.data_file_id of ' + f + ' not readable: ' + e2); }
    });
  } catch (e3) { /* no Forms tab / column yet */ }
  // B1 (#21): a failed or empty read (e.g. a simple trigger without Drive rights) is NEVER cached or kept — the next call
  // tries Drive again; otherwise one bad read made every form "not available" for 10 minutes.
  if (!ok || !Object.keys(idx).length) return idx;
  cache.put('tz_drive_idx', JSON.stringify(idx), 600);
  return (_driveIdx = idx);
}

/** Parsed form JSON from Drive. The text is cached in chunks (CacheService values are ≤ 100 KB), keyed by file id +
 *  last-updated time, so a replaced file is picked up within 10 minutes. */
function driveFormData_(formId) {
  var ref = driveFormIndex_()[formId];
  if (!ref) return null;
  var cache = CacheService.getScriptCache(), base = 'tz_form_' + ref.replace(/[^A-Za-z0-9]/g, '_'), CH = 90000;
  var text = null, n = Number(cache.get(base + '_n'));
  if (n > 0) {
    var keys = []; for (var i = 0; i < n; i++) keys.push(base + '_' + i);
    var got = cache.getAll(keys), parts = [];
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) { parts = null; break; } parts.push(got[keys[j]]); }
    if (parts) text = parts.join('');
  }
  if (text === null) {
    text = DriveApp.getFileById(ref.split(':')[0]).getBlob().getDataAsString('UTF-8');
    var put = {}, k = 0;
    for (var p = 0; p < text.length; p += CH) put[base + '_' + (k++)] = text.slice(p, p + CH);
    put[base + '_n'] = String(k);
    try { cache.putAll(put, 21600); } catch (err) { console.warn('form cache put failed: ' + err); }
  }
  var data = JSON.parse(text);
  if (data.form_id !== formId) throw new Error('Form file ' + formId + '.json holds form ' + data.form_id);
  return data;
}
/** Forms whose Data_*.gs (build) or <form_id>.json on Drive (production) exists. */
function formIds_() { return Object.keys(formRegistry_()).filter(function (id) { return !!regEntry_(id); }); }

/** Form data object (profile + questions incl. keys) — server only. Parsed only when this form is needed (lazy).
 *  Keys: the Questions tab overrides the data file (Minh fixes keys in the Sheet) → grading, routing, reports use it. */
var _rawCache = {};
function formData_(formId) {
  if (Object.prototype.hasOwnProperty.call(_formCache, formId)) return _formCache[formId];
  var raw = formDataRaw_(formId);
  if (!raw) return (_formCache[formId] = null);
  var fd = JSON.parse(JSON.stringify(raw));
  var keys = sheetKeys_(formId);
  fd.questions.forEach(function (q) { if (Object.prototype.hasOwnProperty.call(keys, q.qid)) { q.key_data = q.key; q.key = keys[q.qid]; } });
  return (_formCache[formId] = fd);
}
/** The data file exactly as built (no Sheet overrides) — for checkSheet / importQuestions comparisons. */
function formDataRaw_(formId) {
  if (Object.prototype.hasOwnProperty.call(_rawCache, formId)) return _rawCache[formId];
  var e = regEntry_(formId);
  return (_rawCache[formId] = e ? e.load() : null);
}
/** {qid: key} from the Questions tab for one form: MCQ = letter, SPR = list split by "|". A cell Sheets turned into a
 *  date or left empty is ignored (logged) — the data-file key is used then. */
var _sheetKeys = null;
function sheetKeys_(formId) {
  if (!_sheetKeys) {
    _sheetKeys = {};
    try {
      readTable_('Questions').rows.forEach(function (r) {
        var f = String(r.form_id), v = r.key;
        if (v === '' || v === null || v === undefined) return;
        if (Object.prototype.toString.call(v) === '[object Date]') { console.warn('Questions key of ' + r.qid + ' is a date (type an apostrophe first) — data key used'); return; }
        var list = String(v).split('|').map(function (x) { return x.trim(); }).filter(String);
        if (!list.length) return;
        (_sheetKeys[f] = _sheetKeys[f] || {})[String(r.qid)] = { type: String(r.type || ''), list: list };
      });
    } catch (e) { /* no Questions tab: data keys */ }
  }
  var raw = formDataRaw_(formId), out = {}, m = _sheetKeys[formId] || {};
  if (!raw) return out;
  raw.questions.forEach(function (q) {
    var k = m[q.qid]; if (!k) return;
    out[q.qid] = (q.type || 'mcq') === 'spr' ? k.list : k.list[0].toUpperCase();
  });
  return out;
}

/** Profile = registry profile (question counts included), with n / time / calculator / title overridden by the Forms tab.
 *  Does not parse the form's data file. */
/** noDrive = true: the profile from the code registry even when the form file cannot be read here (the Report tab's
 *  simple trigger has no Drive rights — B1, #21). Otherwise null when the form has no data file (= not available). */
function profileFor_(formId, noDrive) {
  var e = noDrive ? formRegistry_()[formId] : regEntry_(formId);
  if (!e || !e.profile) return null;
  var p = JSON.parse(JSON.stringify(e.profile));
  var rows = [];
  try { rows = readTable_('Forms').rows.filter(function (r) { return String(r.form_id).trim() === formId; }); } catch (e2) {}
  p.parts.forEach(function (part) {
    var r = rows.filter(function (x) { return String(x.part).trim() === part.part; })[0];
    if (r) {
      var tm = Number(r.time_limit_min);
      if (r.time_limit_min !== '' && !isNaN(tm) && tm > 0) part.time_limit_sec = Math.round(tm * 60);
      if (r.calculator !== '' && r.calculator !== undefined) part.calculator = isYes_(r.calculator);
      if (r.part_title) part.title = String(r.part_title);
    }
    if (e.legacy) part.n = e.legacy.questions.filter(function (q) { return q.part === part.part; }).length;
  });
  return p;
}

/** Sections of a profile: SAT = [{id:'RW', parts:['RW1','RW2']}, {id:'Math', …}]; AP (no sections) = one per part. */
function sectionsOf_(profile) {
  if (profile.sections && profile.sections.length) return profile.sections;
  return profile.parts.map(function (p) { return { id: p.part, title: p.title, parts: [p.part] }; });
}
function sectionOfPart_(profile, part) {
  var s = sectionsOf_(profile).filter(function (x) { return x.parts.indexOf(part) >= 0; })[0];
  return s ? s.id : part;
}
function isSat_(profile) { return !!profile && String(profile.exam) === 'SAT'; }

/** Track rule: Students.track may hold several tracks (split by , ; / |). A form is shown when a track equals
 *  the form's exam or form_id, or is a prefix of the exam (e.g. "AP" → every AP exam), or is "ALL".
 *  "Calculus" and "Calc" are treated as the same word. */
function normTrack_(s) {
  return String(s || '').toLowerCase().replace(/calculus/g, 'calc').replace(/[^a-z0-9]/g, '');
}
function trackAllows_(track, exam, formId) {
  var e = normTrack_(exam), f = normTrack_(formId);
  return String(track || '').split(/[,;\/|]/).some(function (t) {
    var n = normTrack_(t);
    if (!n) return false;
    return n === 'all' || n === e || n === f || e.indexOf(n) === 0;
  });
}

/* ============================== auth ============================== */

function findStudent_(code) {
  code = normCode_(code);
  if (!code) return null;
  var rows = readTable_('Students').rows;
  for (var i = 0; i < rows.length; i++) {
    if (normCode_(rows[i].student_code) === code) return rows[i];
  }
  return null;
}

function requireStudent_(code) {
  var keys = loginKeys_(code, '');
  var st = findStudent_(code);
  if (!st && loginLockedAll_()) throw new Error('LOGIN: ' + LOCK_ALL_MSG); // a student already signed in keeps working
  if (loginLocked_(keys)) throw new Error('LOGIN: ' + LOCK_MSG);
  if (!st) loginFailed_(keys);
  if (!st || !isYes_(st.active)) throw new Error('LOGIN: This code is not valid or is locked. Ask your teacher.');
  return st;
}

/* ---- login lock-out (#16 m8): 10 wrong codes in 15 minutes → that code AND that device wait 15 minutes ---- */
var LOGIN_MAX_FAILS = 10, LOGIN_WINDOW_MS = 15 * 60 * 1000;
var LOCK_MSG = 'Too many wrong codes. Wait 15 minutes, then try again.';
function loginKeys_(code, deviceId) {
  var c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 60);
  var d = String(deviceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  var k = ['tz_lf_c_' + c];
  if (d) k.push('tz_lf_d_' + d);
  return k;
}
function failTimes_(cache, key, now) {
  var v = []; try { v = JSON.parse(cache.get(key) || '[]'); } catch (e) {}
  return (Array.isArray(v) ? v : []).filter(function (t) { return now - Number(t) < LOGIN_WINDOW_MS; });
}
/* #21 m8: plus a script-wide limit — 30 wrong codes in 15 minutes from anywhere (a new device id each try is still
   counted) → every sign-in waits 5 minutes. Per-code and per-device limits stay. */
var LOGIN_ALL_MAX = 30, LOGIN_ALL_WAIT_MS = 5 * 60 * 1000, ALL_KEY = 'tz_lf_all', ALL_LOCK_KEY = 'tz_lf_all_lock';
var LOCK_ALL_MSG = 'Too many wrong codes were tried. Sign-in is paused for 5 minutes. Please try again later.';
function loginLockedAll_() {
  var until = Number(CacheService.getScriptCache().get(ALL_LOCK_KEY)) || 0;
  return Date.now() < until;
}
function loginLocked_(keys) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  return keys.some(function (k) { return failTimes_(cache, k, now).length >= LOGIN_MAX_FAILS; });
}
function loginFailed_(keys) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  var all = failTimes_(cache, ALL_KEY, now); all.push(now);
  try { cache.put(ALL_KEY, JSON.stringify(all.slice(-(LOGIN_ALL_MAX + 5))), 1800); } catch (e) {}
  if (all.length >= LOGIN_ALL_MAX) { try { cache.put(ALL_LOCK_KEY, String(now + LOGIN_ALL_WAIT_MS), 600); cache.put(ALL_KEY, '[]', 1800); } catch (e) {} console.warn('LOGIN: ' + all.length + ' wrong codes in 15 min → all sign-ins wait 5 min'); }
  keys.forEach(function (k) { var t = failTimes_(cache, k, now); t.push(now); try { cache.put(k, JSON.stringify(t.slice(-50)), 1800); } catch (e) {} });
}

function login(code, deviceId) {
  var keys = loginKeys_(code, deviceId);
  if (loginLockedAll_()) return { ok: false, locked: true, msg: LOCK_ALL_MSG };
  if (loginLocked_(keys)) return { ok: false, locked: true, msg: LOCK_MSG };
  if (isTeacherCode_(code)) return { ok: true, teacher: true, app_name: getSettings_().app_name, version: APP_VERSION };
  var st = findStudent_(code);
  if (!st) {
    loginFailed_(keys);
    return { ok: false, msg: loginLockedAll_() ? LOCK_ALL_MSG : loginLocked_(keys) ? LOCK_MSG : 'Code not found. Check it or ask your teacher.' };
  }
  if (!isYes_(st.active)) return { ok: false, msg: 'This code is locked. Ask your teacher.' };
  var s = getSettings_();
  return { ok: true, student: { code: normCode_(st.student_code), name: String(st.name || ''), track: String(st.track || '') },
           app_name: s.app_name, version: APP_VERSION };
}

/* ============================== My Tests ============================== */

function listForms(code) {
  var st = requireStudent_(code);
  var codeN = normCode_(st.student_code);
  var forms = {};
  readTable_('Forms').rows.forEach(function (r) {
    var id = String(r.form_id).trim();
    if (!id) return;
    if (!forms[id]) forms[id] = { form_id: id, exam: String(r.exam || ''), parts: [], n: 0, minutes: 0 };
    var pp = null, fe0 = regEntry_(id); // empty part_title in the Forms tab → the profile's title
    if (fe0) pp = fe0.profile.parts.filter(function (x) { return x.part === String(r.part); })[0];
    forms[id].parts.push({ part: String(r.part), title: String(r.part_title || (pp && pp.title) || ''), n: Number(r.n_questions) || 0,
                           minutes: Number(r.time_limit_min) || 0, calculator: isYes_(r.calculator) });
    forms[id].n += Number(r.n_questions) || 0;
    forms[id].minutes += Number(r.time_limit_min) || 0;
  });
  var sessions = readTable_('Sessions').rows.filter(function (r) { return normCode_(r.student_code) === codeN; });
  var out = [];
  Object.keys(forms).forEach(function (id) {
    var f = forms[id];
    if (!trackAllows_(st.track, f.exam, id)) return;
    var fe = regEntry_(id);
    f.available = !!fe;
    f.title = fe ? (fe.profile.title || '') : '';
    if (fe && fe.profile.sections) f.break_min = Math.round(fe.profile.parts.reduce(function (m, p) { return Math.max(m, Number(p.break_after_sec) || 0); }, 0) / 60);
    f.scope = 'full';
    f.attempts = attemptsOf_(sessions, id, 'full', fe, f.n);
    out.push(f);
  });
  // assignments (#29): one card per active row, at the top; only the assigned parts, own attempts
  var asg = [];
  assignmentsFor_(codeN).forEach(function (a) {
    var f = forms[a.form_id];
    // an assignment is shown even outside the student's track; the whole form only when it is not already a normal card
    if (!f || (a.scope === 'full' && trackAllows_(st.track, f.exam, a.form_id))) return;
    var fe = regEntry_(a.form_id), sp = fe ? scopedProfile_(profileFor_(a.form_id), a.scope) : null;
    var parts = f.parts.filter(function (p) { return a.parts.indexOf(p.part) >= 0; });
    var n = parts.reduce(function (x, p) { return x + p.n; }, 0);
    var brk = sp && sp.sections ? Math.round(sp.parts.reduce(function (m, p) { return Math.max(m, Number(p.break_after_sec) || 0); }, 0) / 60) : 0;
    var label = a.label || 'Full test'; // #32 t1: the whole form assigned (student outside the track)
    asg.push({ form_id: a.form_id, exam: f.exam, scope: a.scope, assigned: true, label: label, available: !!fe,
               title: fe ? (fe.profile.title || '') + ' — ' + label : label, parts: parts, n: n, break_min: brk,
               minutes: parts.reduce(function (x, p) { return x + p.minutes; }, 0),
               attempts: attemptsOf_(sessions, a.form_id, a.scope, fe, n) });
  });
  // #32 n1: attempts whose card is gone (assignment set to No) stay reachable under "Past assignments" (View result only)
  var shown = {}; asg.concat(out).forEach(function (f) { shown[f.form_id + '|' + f.scope] = 1; });
  var pastKeys = {};
  sessions.forEach(function (s) { var k = String(s.form_id) + '|' + scopeOf_(s); if (!shown[k] && regEntry_(String(s.form_id))) pastKeys[k] = 1; });
  var past = Object.keys(pastKeys).map(function (k) {
    var fid = k.split('|')[0], scope = k.split('|')[1], fe = regEntry_(fid), f = forms[fid] || {};
    var lbl = scope === 'full' ? 'Full test' : scopeLabel_(fe.profile, scope);
    return { form_id: fid, scope: scope, exam: f.exam || fe.profile.exam || '', title: (fe.profile.title || fid) + ' — ' + lbl,
             attempts: attemptsOf_(sessions, fid, scope, fe, Number(f.n) || 0).filter(function (a) { return a.status !== 'abandoned'; }) };
  }).filter(function (x) { return x.attempts.length; });
  var hx = homeExtras_(st, asg, out, sessions); // #35: hero, pick-up, greeting (no estimate on the home)
  return { ok: true, forms: asg.concat(out), past: past, first_name: hx.first_name, welcome: hx.welcome, hero: hx.hero, pickup: hx.pickup };
}

/** Attempts of one card (form + scope) for My Tests. */
function attemptsOf_(sessions, formId, scope, fe, n) {
  return sessions.filter(function (s) { return String(s.form_id) === formId && scopeOf_(s) === scope; }).map(function (s) {
    return { session_id: String(s.session_id), attempt_no: Number(s.attempt_no) || 0, status: String(s.status || ''),
             started_at: dateStr_(s.started_at), submitted_at: dateStr_(s.submitted_at),
             total_correct: s.total_correct === '' ? null : Number(s.total_correct),
             total_questions: Number(s.total_questions) || n,
             paused: String(s.status) === 'paused' && fe ? pausedInfo_(s, profileOf_(s)) : null };
  }).sort(function (a, b) { return a.attempt_no - b.attempt_no; });
}

/** "Part A completed · 06 Nov, 19:52 — Continue Part B" data for a paused attempt (student-facing → English).
 *  SAT (sections): "Reading and Writing completed … — Continue Math". */
function pausedInfo_(s, profile) {
  var st = parseState_(s) || {};
  var ended = st.ended || {}, endAt = st.part_end_at || {};
  var title = function (p) { var d = profile.parts.filter(function (x) { return x.part === p; })[0]; return d ? (d.title || 'Part ' + p) : 'Part ' + p; };
  var done = (st.seq_parts || []).filter(function (p) { return ended[p]; });
  var last = done[done.length - 1];
  var out = { done: done.map(function (p) { return 'Part ' + p; }).join(', '), done_titles: done.map(title),
              at: last && endAt[last] ? fmtDate_(new Date(endAt[last]), 'dd MMM, HH:mm') : '',
              next: st.current_part ? 'Part ' + st.current_part : '', next_title: st.current_part ? title(st.current_part) : '' };
  if (profile.sections && profile.sections.length) {
    var secs = profile.sections;
    out.done = secs.filter(function (x) { return x.parts.every(function (p) { return ended[p] || (st.seq_parts || []).indexOf(p) < 0; }) && x.parts.some(function (p) { return ended[p]; }); })
                   .map(function (x) { return x.title || x.id; }).join(', ');
    var nx = st.current_part ? secs.filter(function (x) { return x.parts.indexOf(st.current_part) >= 0; })[0] : null;
    out.next = nx ? (nx.title || nx.id) : out.next;
  }
  return out;
}

function isOpenStatus_(v) { v = String(v); return v === 'in_progress' || v === 'paused'; }

/** Dates shown to students: "06 Nov, 19:52". */
function dateStr_(v) {
  if (!v) return '';
  var ms = Object.prototype.toString.call(v) === '[object Date]' ? v.getTime() : toMs_(v);
  return ms ? fmtDate_(new Date(ms), 'dd MMM, HH:mm') : String(v).slice(0, 16);
}

/* ============================== sessions ============================== */

function findSession_(sessionId) {
  var t = readTable_('Sessions');
  for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i].session_id) === String(sessionId)) return t.rows[i];
  return null;
}

function requireSession_(code, sessionId) {
  requireStudent_(code);
  var s = findSession_(sessionId);
  if (!s || normCode_(s.student_code) !== normCode_(code)) throw new Error('SESSION: This attempt was not found.');
  return s;
}

function parseState_(s) {
  try { return s.state_json ? JSON.parse(s.state_json) : null; } catch (e) { return null; }
}

/** Client-safe question object — whitelist only (never key, never tags). */
function clientQuestion_(q) {
  var o = {
    qid: q.qid, part: q.part, display_no: q.display_no, type: q.type || 'mcq',
    stem_html: q.stem_html || '', passage_html: q.passage_html || '',
    figures: (q.figures || []).map(function (f) { return { src: f.src || '', alt: f.alt || '', position: f.position || 'before_stem', width: f.width || null }; }),
    choices: (q.choices || []).map(function (c) { return { label: c.label, html: c.html }; })
  };
  return o;
}

/**
 * Start or resume an attempt.
 * opts: { resume: sessionId } → resume that in-progress attempt
 *       { fresh: true }       → abandon any in-progress attempt of this form and start a new one
 *       {}                    → resume the in-progress attempt if there is one, else new
 */
function getTest(code, formId, opts) {
  opts = opts || {};
  var st = requireStudent_(code);
  var codeN = normCode_(st.student_code);
  var fullProfile = profileFor_(formId);
  if (!fullProfile) throw new Error('FORM: This test is not available yet.');
  var fd = formData_(formId);
  if (!fd) throw new Error('FORM: This test is not available yet.');
  // scope (#29): a resumed attempt keeps its own; a new one = 'full' or the parts of an ACTIVE assignment of this student
  var scope = 'full';
  if (opts.resume) { var rs = findSession_(opts.resume); if (rs && normCode_(rs.student_code) === codeN) scope = scopeOf_(rs); }
  else if (opts.scope) {
    var pp = parseParts_(fullProfile, String(opts.scope).replace(/,/g, ' '));
    scope = pp ? scopeKey_(fullProfile, pp) : '';
    if (!scope || (scope !== 'full' && !hasAssignment_(codeN, formId, scope))) throw new Error('FORM: This assignment is no longer open. Ask your teacher.');
  }
  // the student's track, or an active assignment of this form (#29: a teacher may assign a form outside the track)
  if (!trackAllows_(st.track, fullProfile.exam, formId) && !hasAssignment_(codeN, formId, scope)) throw new Error('FORM: This test is not part of your program.');
  var profile = scopedProfile_(fullProfile, scope);
  var inScope = {}; profile.parts.forEach(function (p) { inScope[p.part] = 1; });
  var questions = fd.questions.filter(function (q) { return inScope[q.part]; });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var session, state = null, resumed = false, copy = '';
  try {
    var t = readTable_('Sessions');
    var mine = t.rows.filter(function (r) { return normCode_(r.student_code) === codeN && String(r.form_id) === formId && scopeOf_(r) === scope; });
    var open = mine.filter(function (r) { return isOpenStatus_(r.status); });
    if (opts.resume) open = open.filter(function (r) { return String(r.session_id) === String(opts.resume); });
    if (opts.fresh) {
      open.forEach(function (r) { updateRow_('Sessions', r._row, { status: 'abandoned', last_saved_at: nowIso_() }); });
      open = [];
    }
    copy = newCopyToken_();
    if (open.length) {
      session = open[open.length - 1];
      state = parseState_(session);
      resumed = true;
      updateRow_('Sessions', session._row, { copy_token: copy }); // this window is now the live copy; older ones stop (N1)
    } else {
      var attemptNo = mine.reduce(function (m, r) { return Math.max(m, Number(r.attempt_no) || 0); }, 0) + 1;
      var sid = 'S-' + fmtDate_(new Date(), 'yyyyMMdd') + '-' + codeN + '-' + formId + (scope === 'full' ? '' : '-' + scope.replace(/,/g, '')) + '-' + attemptNo;
      session = {
        session_id: sid, student_code: codeN, form_id: formId, attempt_no: attemptNo, scope: scope,
        started_at: nowIso_(), status: 'in_progress', total_questions: questions.length,
        device: txt_(String(opts.device || '').slice(0, 60)), events_saved: 0, last_saved_at: nowIso_(), copy_token: copy // m6: text (#21)
      };
      appendObjects_('Sessions', [session]);
    }
  } finally { lock.releaseLock(); }

  var s = getSettings_();
  var desmosKey = desmosKey_();
  return {
    ok: true,
    session: { session_id: String(session.session_id), attempt_no: Number(session.attempt_no), form_id: formId,
               student_name: String(st.name || ''), events_saved: Number(session.events_saved) || 0, scope: scope },
    resumed: resumed,
    state: state,
    copy: copy,
    server_now: Date.now(),
    profile: profile,
    questions: questions.map(clientQuestion_),
    settings: { app_name: s.app_name, autosave_sec: s.autosave_sec, five_min_warning_sec: s.five_min_warning_sec,
                desmos_api_key: desmosKey, show_results: s.show_results }
  };
}

/** Merge client state with what the server already knows. Server-side part start times always win (anti-reset). */
var LATE_GRACE_MS = 90 * 1000; // network latency allowance after a part's time limit

/**
 * limits: {part: time_limit_sec}; delta: the client's new events in this call.
 * After part start + limit + grace, the server keeps the last in-time answers for that part. A changed answer from
 * the client is only accepted when this call's events show it was chosen before the limit (offline student whose
 * last autosave failed); anything else that arrives late is ignored.
 */
function mergeState_(serverState, clientState, sessionStartMs, nowMs, limits, delta) {
  var st = clientState || {};
  var starts = (serverState && serverState.part_starts) || {};
  var cStarts = st.part_starts || {};
  Object.keys(cStarts).forEach(function (p) {
    if (!starts[p]) {
      var v = Number(cStarts[p]) || nowMs;
      if (v > nowMs) v = nowMs;
      if (sessionStartMs && v < sessionStartMs) v = sessionStartMs;
      starts[p] = v;
    }
  });
  st.part_starts = starts;
  // ended parts can never be reopened
  var ended = (serverState && serverState.ended) || {};
  st.ended = st.ended || {};
  Object.keys(ended).forEach(function (p) {
    if (!ended[p]) return;
    st.ended[p] = ended[p];
    // answers of a part the server already saw as ended are frozen (Part A locked after leaving it)
    if (serverState.parts && serverState.parts[p]) { st.parts = st.parts || {}; st.parts[p] = serverState.parts[p]; }
  });
  // late parts: freeze to the last in-time server state
  if (limits && serverState && serverState.parts) {
    Object.keys(starts).forEach(function (p) {
      var lim = Number(limits[p]) * 1000;
      if (!lim || nowMs <= starts[p] + lim + LATE_GRACE_MS || st.ended[p] && ended[p]) return;
      var base = serverState.parts[p];
      if (!base || !st.parts || !st.parts[p]) return;
      st.parts[p] = acceptInTime_(base, st.parts[p], p, lim, delta || []);
      st.ended[p] = st.ended[p] || 'timeout';
    });
  }
  // routing decided by the server stays
  if (serverState && serverState.route) st.route = serverState.route;
  // server-only bookkeeping (sittings / Part_Log) always comes from the server
  SERVER_KEYS_.forEach(function (k) { if (serverState && serverState[k] !== undefined) st[k] = serverState[k]; else delete st[k]; });
  return st;
}
var SERVER_KEYS_ = ['sit', 'part_sit', 'part_end_at', 'logged', 'pause_explicit'];

/* ---------------- sittings: pause between parts, finish another day ---------------- */
var PART_LOG_TAB = 'Part_Log';
var PART_LOG_HEADERS = ['session_id', 'student_code', 'form_id', 'attempt_no', 'part', 'started_at', 'ended_at', 'end_reason', 'time_used_min', 'sitting_no'];
var NEW_SITTING_GAP_MS = 30 * 60 * 1000; // closing the tab on the transition screen and coming back > 30 min later = new sitting

/**
 * Updates state.sit / part_sit / part_end_at / logged and returns the Part_Log rows for parts that just ended.
 * A part started after an explicit "Save and Continue Later", or > 30 min after the previous part ended, opens a new sitting.
 */
function trackSittings_(session, prevState, state, events, nowMs, limits, pauseRequested) {
  state.sit = state.sit || 1;
  state.part_sit = state.part_sit || {};
  state.part_end_at = state.part_end_at || {};
  state.logged = state.logged || {};
  if (pauseRequested) state.pause_explicit = true;
  var order = state.seq_parts || Object.keys(state.part_starts || {});
  var rows = [];
  order.forEach(function (p) {
    var start = state.part_starts[p];
    if (!start) return;
    // 1. which sitting did this part start in?
    if (!state.part_sit[p]) {
      var ends = Object.keys(state.part_end_at).map(function (k) { return state.part_end_at[k]; });
      var prevEnd = ends.length ? Math.max.apply(null, ends) : 0;
      if (prevEnd && (state.pause_explicit || start - prevEnd > NEW_SITTING_GAP_MS)) state.sit++;
      if (prevEnd) state.pause_explicit = false;
      state.part_sit[p] = state.sit;
    }
    // 2. part just ended → its Part_Log row
    if (!state.ended || !state.ended[p] || state.logged[p]) return;
    var lim = (Number(limits[p]) || 0) * 1000;
    var pe = null;
    (events || []).forEach(function (e) { if (String(e.part) === p && e.type === 'part_end') pe = e; });
    var used = pe ? Number(pe.t_ms) || 0 : Math.max(0, nowMs - start);
    if (lim) used = Math.min(used, lim);
    state.part_end_at[p] = start + used;
    state.logged[p] = true;
    rows.push({ session_id: String(session.session_id), student_code: normCode_(session.student_code), form_id: String(session.form_id),
                attempt_no: Number(session.attempt_no), part: p, started_at: fmtDate_(new Date(start), 'yyyy-MM-dd HH:mm:ss'),
                ended_at: fmtDate_(new Date(start + used), 'yyyy-MM-dd HH:mm:ss'), end_reason: String(state.ended[p]),
                time_used_min: round_(used / 60000, 1), sitting_no: state.part_sit[p] });
  });
  return rows;
}

function appendPartLog_(rows) {
  if (!rows.length) return;
  var ss = ss_();
  var sh = ss.getSheetByName(PART_LOG_TAB);
  if (!sh) { // self-heal: create the tab with its header
    sh = ss.insertSheet(PART_LOG_TAB);
    sh.getRange(1, 1, 1, PART_LOG_HEADERS.length).setValues([PART_LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.setTabColor('#9e9e9e'); } catch (e) {}
  }
  appendObjects_(PART_LOG_TAB, rows);
}

/** Between parts (≥ 1 part ended, next part not begun) the attempt is "paused": it can be finished any day. */
function statusFor_(state) {
  var cur = state.current_part;
  var anyEnded = Object.keys(state.ended || {}).some(function (p) { return state.ended[p]; });
  return (anyEnded && cur && !state.part_starts[cur] && !state.ended[cur] && state.phase !== 'submitting') ? 'paused' : 'in_progress';
}

function acceptInTime_(base, client, part, limitMs, delta) {
  var out = JSON.parse(JSON.stringify(base));
  out.ans = out.ans || {};
  var cAns = client.ans || {};
  var ids = {};
  Object.keys(cAns).concat(Object.keys(out.ans)).forEach(function (q) { ids[q] = 1; });
  Object.keys(ids).forEach(function (q) {
    if ((cAns[q] || '') === (out.ans[q] || '')) return;
    var last = null;
    delta.forEach(function (e) {
      if (String(e.part) === part && e.qid === q && (e.type === 'select' || e.type === 'change' || e.type === 'clear')) last = e;
    });
    if (!last || Number(last.t_ms) > limitMs) return; // no in-time evidence → keep server's answer
    var want = last.type === 'clear' ? '' : String(last.value);
    if (want === (cAns[q] || '')) { if (want) out.ans[q] = want; else delete out.ans[q]; }
  });
  return out;
}

/** Server-side check of what the browser sent (#16 m6): per part, answers only for that part's questions —
 *  MCQ = one of the question's choice letters, SPR = what fits the SAT answer box (sprValid_); eliminated = choice letters;
 *  marks = true. Anything else is dropped (and logged), so no answer text can carry a formula or junk into the Sheet. */
function cleanAnswers_(formId, state) {
  if (!state || !state.parts) return state;
  var fd = formDataRaw_(formId);
  if (!fd) return state;
  var byPart = {};
  fd.questions.forEach(function (q) { (byPart[q.part] = byPart[q.part] || {})[q.qid] = q; });
  var dropped = [];
  Object.keys(state.parts).forEach(function (p) {
    var ps = state.parts[p];
    if (!ps || typeof ps !== 'object' || !byPart[p]) { delete state.parts[p]; return; }
    var qs = byPart[p];
    var ans = {}, elim = {}, mark = {};
    Object.keys(ps.ans || {}).forEach(function (qid) {
      var q = qs[qid], v = cleanAnswer_(q, ps.ans[qid]);
      if (v === null) { dropped.push(qid); return; }
      if (v !== '') ans[qid] = v;
    });
    Object.keys(ps.elim || {}).forEach(function (qid) {
      var q = qs[qid];
      if (!q || (q.type || 'mcq') !== 'mcq' || !Array.isArray(ps.elim[qid])) return;
      var ok = choiceLetters_(q);
      elim[qid] = ps.elim[qid].map(function (l) { return String(l).toUpperCase(); }).filter(function (l, i, a) { return ok.indexOf(l) >= 0 && a.indexOf(l) === i; });
    });
    Object.keys(ps.mark || {}).forEach(function (qid) { if (qs[qid] && ps.mark[qid]) mark[qid] = true; });
    ps.ans = ans; ps.elim = elim; ps.mark = mark;
  });
  if (dropped.length) console.warn('ANSWERS DROPPED (not a valid answer): ' + dropped.join(', '));
  return state;
}
/** Answer events (select / change) carry only a valid answer (else ''), so first_answer / changes can't hold junk (#21 m6). */
function desmosKey_() { return getSettings_().desmos_api_key || 'dcb31709b452b1cf9dc26972add0fda6'; } // empty = Desmos public demo key (testing only)

function cleanEvents_(formId, events) {
  if (!Array.isArray(events)) return events;
  var fd = formDataRaw_(formId), qm = {};
  if (fd) fd.questions.forEach(function (q) { qm[q.qid] = q; });
  events.forEach(function (e) {
    if (!e || (e.type !== 'select' && e.type !== 'change')) return;
    var v = cleanAnswer_(qm[String(e.qid)], e.value);
    e.value = v === null ? '' : v;
  });
  return events;
}

/* ---- one live copy per attempt (#21 N1) ----
   getTest gives each opened window a new copy token (Sessions.copy_token). autosave / submit from a window whose token is
   not the current one are refused: that window shows "This test is open in another window" and stops (timer frozen,
   no auto-start, no time-up). A page from before v1.8 sends no token and is still accepted. */
function newCopyToken_() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
function staleCopy_(session, payload) {
  var cur = String(session.copy_token || ''), mine = payload && payload.copy ? String(payload.copy) : '';
  return !!(cur && mine && cur !== mine);
}
function otherCopy_() { return { ok: false, other_copy: true, msg: 'This test is open in another window. Close this one.', server_now: Date.now() }; }

function choiceLetters_(q) {
  var l = (q.choices || []).map(function (c) { return String(c.label).toUpperCase(); });
  return l.length ? l : ['A', 'B', 'C', 'D'];
}
/** The answer as it is stored, '' = blank, null = not a valid answer for this question. */
function cleanAnswer_(q, v) {
  if (!q) return null;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  var s = String(v).trim();
  if (!s) return '';
  if ((q.type || 'mcq') === 'spr') { s = s.replace(/\u2212/g, '-'); return sprValid_(s) ? s : null; }
  s = s.toUpperCase();
  return choiceLetters_(q).indexOf(s) >= 0 ? s : null;
}
/** What the SAT answer box accepts (same rule as the app's input): digits, at most one "." or "/", "-" only first,
 *  5 characters (6 with "-"), at least one digit. */
function sprValid_(s) {
  s = String(s);
  if (s.length > (s.charAt(0) === '-' ? 6 : 5)) return false;
  return /^-?\d*([.\/]\d*)?$/.test(s) && /\d/.test(s);
}

function qRowsTags_(formId, map) {
  try {
    readTable_('Questions').rows.forEach(function (r) {
      if (String(r.form_id) !== formId || !r.qid) return;
      map[String(r.qid)] = { unit: r.unit, topic: r.topic === '' ? '' : String(r.topic), topic_name: r.topic_name, difficulty: r.difficulty, type: String(r.type || 'mcq') };
    });
  } catch (e) {}
  return map;
}

function limitsFor_(formId) {
  var l = {};
  try { profileFor_(formId).parts.forEach(function (p) { l[p.part] = p.time_limit_sec; }); } catch (e) {}
  return l;
}

function sessionStartMs_(session) {
  var v = session.started_at;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d.getTime()) ? 0 : d.getTime() - 60 * 60 * 1000; // string w/o TZ: allow 1h slack
}

function eventRows_(sessionId, events) {
  var logged = nowIso_();
  return events.map(function (e) {
    var val = e.value;
    if (val !== null && val !== undefined && typeof val === 'object') val = JSON.stringify(val);
    // every text from the browser is written as TEXT: "6/5" must not become a date, "=…" never a formula (#16 M1, m6)
    return { session_id: sessionId, part: txt_(String(e.part || '').slice(0, 20)), t_ms: Math.round(Number(e.t_ms) || 0),
             qid: txt_(String(e.qid || '').slice(0, 60)), type: txt_(String(e.type || '').slice(0, 30)),
             value: (val === null || val === undefined) ? '' : txt_(String(val).slice(0, 500)), logged_at: logged };
  });
}

/** Append the part of the client event delta the server hasn't stored yet. Returns new events_saved. */
function storeEvents_(session, payload) {
  var saved = Number(session.events_saved) || 0;
  var from = Number(payload.ev_from) || 0;
  var evs = payload.events || [];
  var skip = Math.max(0, saved - from);
  var fresh = evs.slice(skip);
  if (fresh.length) appendObjects_('Events', eventRows_(String(session.session_id), fresh));
  return Math.max(saved, from + evs.length);
}

function compactState_(state) {
  var s = JSON.stringify(state);
  if (s.length > 45000 && state.parts) { // keep within one cell (50k chars): drop highlights first
    Object.keys(state.parts).forEach(function (p) { if (state.parts[p]) state.parts[p].hl = {}; });
    s = JSON.stringify(state);
  }
  return s;
}

/**
 * Autosave (≤ every autosave_sec, plus on part start / part end).
 * payload: { state, events: [delta], ev_from, route_part? }
 */
function autosave(code, sessionId, payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var session = requireSession_(code, sessionId);
    if (!isOpenStatus_(session.status)) {
      return { ok: false, closed: true, status: String(session.status), server_now: Date.now() };
    }
    if (staleCopy_(session, payload)) return otherCopy_(); // N1: nothing from an older window is taken (no answers, part start, time-up, pause)
    cleanEvents_(String(session.form_id), payload.events);
    var nowMs = Date.now();
    var serverState = parseState_(session);
    var limits = limitsFor_(String(session.form_id));
    var state = mergeState_(serverState, payload.state, sessionStartMs_(session), nowMs, limits, payload.events);
    cleanAnswers_(String(session.form_id), state);
    var logRows = trackSittings_(session, serverState, state, payload.events, nowMs, limits, !!payload.pause);
    var evSaved = storeEvents_(session, payload);
    var route = null;
    if (payload.route_part) {
      route = routeAfter_(session.form_id, payload.route_part, state);
      state.route = state.route || {};
      state.route[payload.route_part] = route;
    }
    var cur = state.current_part || '';
    var status = statusFor_(state);
    updateRow_('Sessions', session._row, {
      status: status, n_sittings: state.sit,
      current_part: cur,
      part_started_at: (cur && state.part_starts[cur]) ? fmtDate_(new Date(state.part_starts[cur]), 'yyyy-MM-dd HH:mm:ss') : '',
      last_saved_at: nowIso_(),
      events_saved: evSaved,
      state_json: compactState_(state),
      progress: progressText_(session, state, nowMs) // #32: readable live progress for the Sheet
    });
    appendPartLog_(logRows);
    return { ok: true, server_now: nowMs, events_saved: evSaved, part_starts: state.part_starts, ended: state.ended, route: route, status: status };
  } finally { lock.releaseLock(); }
}

/** Sessions.progress (#32): "M1 · 14/22 answered · Q15 · 12:30 left", "Break before Math · 7:30 left", "Paused before Math",
 *  "M2 · not started (directions)". Written at every autosave; "Submitted" at submit. */
function progressText_(session, state, nowMs) {
  try {
    var st = state || {}, cur = String(st.current_part || ''), prof = profileOf_(session, true);
    var sat = !!(prof.sections && prof.sections.length);
    var name = function (p) { return sat ? p : 'Part ' + p; };
    var secOf = function (p) { var x = (prof.sections || []).filter(function (s) { return s.parts.indexOf(p) >= 0; })[0]; return x ? (x.title || x.id) : name(p); };
    var mmss = function (sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); };
    if (st.pause_explicit && statusFor_(st) === 'paused') return 'Paused before ' + (cur ? secOf(cur) : 'the next part'); // Save and Continue Later
    if (st.phase === 'break' && st.break_until) return 'Break before ' + secOf(cur) + ' · ' + mmss((Number(st.break_until) - nowMs) / 1000) + ' left';
    if (!cur) return '';
    var def = prof.parts.filter(function (p) { return p.part === cur; })[0] || {};
    var start = (st.part_starts || {})[cur];
    if (!start) return name(cur) + ' · not started (directions)';
    var ps = (st.parts || {})[cur] || {}, ans = ps.ans || {};
    var answered = Object.keys(ans).filter(function (k) { return ans[k] !== '' && ans[k] !== null && ans[k] !== undefined; }).length;
    var left = (Number(def.time_limit_sec) || 0) - (nowMs - Number(start)) / 1000;
    return name(cur) + ' · ' + answered + '/' + (Number(def.n) || '?') + ' answered · Q' + ((Number(ps.cur) || 0) + 1) + ' · ' + (left > 0 ? mmss(left) + ' left' : 'time up');
  } catch (e) { return ''; }
}

/** Adaptive routing (SAT-ready): part.route = {from:'M1', min_correct:N, hard:'M2H', easy:'M2E'} on the routed group. */
function routeAfter_(formId, partId, state) {
  var fd = formData_(formId);
  var rule = (fd.profile.routing || []).filter(function (r) { return r.from === partId; })[0];
  if (!rule) return null;
  var ans = (state.parts && state.parts[partId] && state.parts[partId].ans) || {};
  var correct = fd.questions.filter(function (q) { return q.part === partId && isCorrect_(q, ans[q.qid]); }).length;
  return correct >= Number(rule.min_correct) ? rule.hard : rule.easy;
}

/* ============================== grading ============================== */

function isCorrect_(q, answer) {
  if (answer === undefined || answer === null || answer === '') return false;
  var keys = Array.isArray(q.key) ? q.key : [q.key];
  if ((q.type || 'mcq') === 'spr') return sprCorrect_(answer, keys);
  return keys.some(function (k) { return String(k).trim().toUpperCase() === String(answer).trim().toUpperCase(); });
}

/**
 * Student-produced response (SAT rules):
 *  - the box holds 5 characters (6 when the answer starts with "-"); anything longer is not a valid entry;
 *  - any form with exactly the key's value counts: 3/4 = .75 = 0.75 = 0.750 = 6/8;
 *  - a decimal that does not fit (2/3 = 0.666…) may be truncated or rounded, but must then FILL the box:
 *    .6666 .6667 0.666 0.667 are right, 0.66 / .67 are not; negatives likewise with 6 characters (-.3333, -0.333).
 *  keys = the key list (printed answer + accepted forms). EXACT values = fractions / integers in the list (and a decimal
 *  equal to one of them; if the list has only decimals and they all have one value, that value). A decimal key that is not
 *  exact (e.g. 0.651 next to 441/677) is a ROUNDED form: it only matches as typed text, never by value — so ".651"
 *  (too short) is wrong while "0.651" and ".6514" are right (QK 2026-11-09).
 */
function sprCorrect_(answer, keys) {
  var a = String(answer).trim().replace(/\u2212/g, '-');
  if (!a) return false;
  var neg = a.charAt(0) === '-', room = neg ? 6 : 5;
  if (a.length > room) return false;
  var ks = keys.map(function (k) { return String(k).trim().replace(/\u2212/g, '-'); }).filter(String);
  if (ks.indexOf(a) >= 0) return true; // typed exactly as a listed form
  var exact = sprExactValues_(ks);
  var av = sprParse_(a);
  if (!av) return false;
  return exact.some(function (kv) {
    if (av.n * kv.d === kv.n * av.d) return true; // same exact value
    if (av.dec === null || av.dec < 1 || a.length !== room) return false; // only a box-filling decimal may be cut off
    var p10 = Math.pow(10, av.dec), num = Math.abs(kv.n) * p10, sign = kv.n < 0 ? -1 : 1;
    var trunc = sign * Math.floor(num / kv.d), rnd = sign * Math.floor((2 * num + kv.d) / (2 * kv.d));
    return av.n === trunc || av.n === rnd;
  });
}

/** Exact values (as {n, d}) of an SPR key list — see sprCorrect_. */
function sprExactValues_(ks) {
  var parsed = ks.map(sprParse_).filter(Boolean);
  var exact = parsed.filter(function (k) { return k.dec === null || k.dec === 0; });
  var decs = parsed.filter(function (k) { return k.dec !== null && k.dec > 0; });
  if (!exact.length && decs.length) {
    var same = decs.every(function (k) { return k.n * decs[0].d === decs[0].n * k.d; });
    return same ? [decs[0]] : [];
  }
  return exact;
}

/** Exact value of an SPR entry as n/d (integers); dec = digits after the point for decimals, null for fractions. */
function sprParse_(s) {
  var m = String(s).match(/^(-?)(\d+)\/(\d+)$/);
  if (m) { var d = Number(m[3]); return d ? { n: (m[1] ? -1 : 1) * Number(m[2]), d: d, dec: null } : null; }
  m = String(s).match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || !(m[2] + (m[3] || '')).length) return null;
  var frac = m[3] || '';
  return { n: (m[1] ? -1 : 1) * Number((m[2] || '0') + frac), d: Math.pow(10, frac.length), dec: frac.length };
}

/** Tags: Questions tab (Minh may confirm/edit there) over the data file. */
function tagMap_(formId) {
  var fd = formData_(formId);
  var map = {};
  // no form file (Drive not readable here, e.g. the Report tab's simple trigger): the Questions tab has every tag (B1, #21)
  if (!fd) { qRowsTags_(formId, map); return map; }
  fd.questions.forEach(function (q) {
    var t = q.tags || {};
    map[q.qid] = { unit: t.unit, topic: t.topic, topic_name: t.topic_name, difficulty: t.difficulty, type: q.type || 'mcq' };
  });
  try {
    readTable_('Questions').rows.forEach(function (r) {
      var id = String(r.qid);
      if (!map[id] || String(r.form_id) !== formId) return;
      ['unit', 'topic', 'topic_name', 'difficulty'].forEach(function (k) {
        var v = r[k];
        if (v === '' || v === undefined || v === null) return;
        if (k === 'topic' && typeof v === 'number' && Number(map[id].topic) === v) return; // "6.10" read back as 6.1 → keep data text
        map[id][k] = String(v);
      });
    });
  } catch (e) {}
  return map;
}

/** Collect the full ordered event list for a session: rows already in Events + the client's unsent tail. */
function fullEvents_(session, payload) {
  var saved = Number(session.events_saved) || 0;
  var from = Number(payload.ev_from) || 0;
  var clientEvents = payload.events || [];
  if (from === 0 && saved <= clientEvents.length) return clientEvents; // client holds the whole log
  var t = readTable_('Events');
  var stored = t.rows.filter(function (r) { return String(r.session_id) === String(session.session_id); }).map(function (r) {
    return { part: String(r.part), t_ms: Number(r.t_ms) || 0, qid: String(r.qid || ''), type: String(r.type), value: r.value === '' ? null : r.value };
  });
  var skip = Math.max(0, saved - from);
  return stored.concat(clientEvents.slice(skip));
}

/** Derive per-question metrics for one part from its events. */
function deriveMetrics_(partEvents, qids) {
  var m = {};
  qids.forEach(function (id) {
    m[id] = { visits: 0, time_ms: 0, first_visit_ms: null, order: null, answers: [], calc: false, ever_marked: false,
              last_answer_t: null, eliminated_ever: {} };
  });
  var openQ = null, openT = 0, visitIdx = {}, order = 0, calcOpen = false, lastT = 0, partEndT = null;
  var resumeQ = null; // question that was on screen when the page went away (reload / crash / pagehide)
  function close(t) {
    if (openQ && m[openQ]) {
      var d = Math.max(0, t - openT);
      m[openQ].time_ms += d;
      if (visitIdx[openQ] === 1) m[openQ].first_visit_ms = (m[openQ].first_visit_ms || 0) + d; // first visit may span a reload
    }
    openQ = null;
  }
  partEvents.forEach(function (e) {
    var t = Number(e.t_ms) || 0, q = e.qid;
    switch (e.type) {
      case 'resume':
        if (openQ) resumeQ = openQ;
        close(lastT); // time while the page was gone is not counted
        resumeQ = resumeQ || '__any__';
        break;
      case 'q_enter':
        close(t);
        if (m[q]) {
          openQ = q; openT = t;
          var cont = resumeQ && (resumeQ === q || resumeQ === '__any__') && visitIdx[q];
          resumeQ = null;
          if (!cont) { m[q].visits++; visitIdx[q] = (visitIdx[q] || 0) + 1; } // same question after a reload = same visit
          if (m[q].order === null) m[q].order = ++order;
          if (calcOpen) m[q].calc = true;
        }
        break;
      case 'q_leave':
        if (openQ === q) { if (String(e.value) === 'pagehide') resumeQ = q; close(t); }
        break;
      case 'review_open':
      case 'part_end':
        resumeQ = null;
        close(t);
        if (e.type === 'part_end') partEndT = t;
        break;
      case 'select': case 'change':
        if (m[q]) { m[q].answers.push(String(e.value)); m[q].last_answer_t = t; }
        break;
      case 'clear':
        if (m[q]) m[q].last_answer_t = t;
        break;
      case 'mark':
        if (m[q]) m[q].ever_marked = true;
        break;
      case 'eliminate':
        if (m[q]) m[q].eliminated_ever[String(e.value)] = true;
        break;
      case 'calc_open':
        calcOpen = true;
        if (openQ && m[openQ]) m[openQ].calc = true;
        break;
      case 'calc_close':
        calcOpen = false;
        break;
    }
    if (e.type !== 'resume') lastT = Math.max(lastT, t);
  });
  close(lastT);
  return { metrics: m, part_end_t: partEndT === null ? lastT : partEndT };
}

function gradeSession_(session, state, events) {
  var formId = String(session.form_id);
  var fd = formData_(formId);
  var profile = profileOf_(session); // only the parts of this attempt (#29)
  var S = getSettings_();
  var tags = tagMap_(formId);
  var seq = (state && state.seq_parts) || profile.parts.map(function (p) { return p.part; });
  var responses = [], partScores = {}, partTimes = {}, partEndReason = {};
  seq.forEach(function (partId) {
    var part = profile.parts.filter(function (p) { return p.part === partId; })[0];
    if (!part) return;
    var qs = fd.questions.filter(function (q) { return q.part === partId; });
    var ps = (state && state.parts && state.parts[partId]) || {};
    var pEvents = events.filter(function (e) { return String(e.part) === partId; })
                        .sort(function (a, b) { return (Number(a.t_ms) || 0) - (Number(b.t_ms) || 0); });
    var d = deriveMetrics_(pEvents, qs.map(function (q) { return q.qid; }));
    var limitMs = part.time_limit_sec * 1000;
    var pace = part.time_limit_sec / Math.max(1, qs.length);
    var endEv = pEvents.filter(function (e) { return e.type === 'part_end'; }).pop();
    partEndReason[partId] = endEv ? String(endEv.value) : '';
    partTimes[partId] = Math.min(limitMs, d.part_end_t) / 60000;
    var score = 0;
    qs.forEach(function (q) {
      var mm = d.metrics[q.qid];
      var fin = (ps.ans && ps.ans[q.qid]) || '';
      var corr = fin ? isCorrect_(q, fin) : null;
      if (corr) score++;
      var vals = mm.answers.filter(function (v) { return v !== '' && v !== 'null'; });
      var first = vals.length ? vals[0] : (fin || '');
      var nCh = 0; for (var i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) nCh++;
      var firstCorr = first ? isCorrect_(q, first) : null;
      var pattern = 'none';
      if (first && !fin) pattern = 'cleared';
      else if (first && fin && first !== fin) pattern = (firstCorr ? 'R' : 'W') + '→' + (corr ? 'R' : 'W');
      var timeSec = mm.time_ms / 1000;
      // rushed / slow from the time norm of this question type + difficulty (Time_Norms tab, #24 F)
      var tp = timeProfile_(!!fin, !!corr, timeSec, timeNormFor_(isSat_(profile), partId, q.type, tags[q.qid]), pace, S);
      var ratio = tp.ratio, profileName = tp.profile;
      var elim = ((ps.elim && ps.elim[q.qid]) || []).slice().sort();
      var flags = [];
      if (pattern === 'R→W') flags.push('CHANGED_R_TO_W');
      if (pattern === 'W→R') flags.push('CHANGED_W_TO_R');
      // GUESS_LIKELY: answered with < guess_min_time_sec on the question (anywhere in the part),
      // or (old rule) answered in the last guess_window_sec of the part — both need little time on the question
      if (fin && timeSec < S.guess_min_time_sec) flags.push('GUESS_LIKELY');
      var keys = Array.isArray(q.key) ? q.key : [q.key];
      if ((q.type || 'mcq') === 'mcq' && elim.some(function (l) { return keys.indexOf(l) >= 0; })) flags.push('ELIM_KEY');
      var tg = tags[q.qid] || {};
      responses.push({
        session_id: session.session_id, student_code: session.student_code, form_id: formId, attempt_no: session.attempt_no,
        qid: q.qid, part: partId, display_no: q.display_no, unit: tg.unit, topic: txt_(tg.topic),
        final_answer: txt_(fin), correct: corr === null ? '' : (corr ? 1 : 0), first_answer: txt_(first), n_changes: nCh, // text (#16 M1)
        change_pattern: pattern, eliminated: elim.join(','), ever_marked: !!(mm.ever_marked || (ps.mark && ps.mark[q.qid])),
        final_marked: !!(ps.mark && ps.mark[q.qid]), visits: mm.visits, time_total_sec: round_(timeSec, 1),
        time_first_visit_sec: mm.first_visit_ms === null ? 0 : round_(mm.first_visit_ms / 1000, 1),
        pace_ratio: round_(ratio, 2), order_first_seen: mm.order === null ? '' : mm.order, calc_used: !!mm.calc,
        profile: profileName, flags: flags.join(','), tutor_note: '',
        _topic_name: tg.topic_name, _limit_ms: limitMs, _last_t: mm.last_answer_t
      });
    });
    partScores[partId] = { score: score, n: qs.length, title: part.title };
  });
  return { responses: responses, partScores: partScores, partTimes: partTimes, partEndReason: partEndReason, seq: seq };
}

/**
 * Submit (end of the last part). Idempotent: a second submit of the same session returns the stored result.
 * payload: { state, events: [delta], ev_from, device }
 */
function submit(code, sessionId, payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var session = requireSession_(code, sessionId);
    if (String(session.status) === 'completed' || String(session.status) === 'timeout') {
      return resultView_(session, responsesOf_(sessionId), false);
    }
    if (staleCopy_(session, payload)) return otherCopy_();
    cleanEvents_(String(session.form_id), payload.events);
    var nowMs = Date.now();
    var prevState = parseState_(session);
    var limits = limitsFor_(String(session.form_id));
    var state = mergeState_(prevState, payload.state, sessionStartMs_(session), nowMs, limits, payload.events);
    cleanAnswers_(String(session.form_id), state);
    var all = fullEvents_(session, payload);
    var logRows = trackSittings_(session, prevState, state, all, nowMs, limits, false);
    var evSaved = storeEvents_(session, payload);
    var g = gradeSession_(session, state, all);
    var cleanResp = g.responses.map(function (r) {
      var o = {}; Object.keys(r).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = r[k]; }); return o;
    });
    appendObjects_('Responses', cleanResp);
    var total = 0, n = 0;
    var fields = { submitted_at: nowIso_(), events_saved: evSaved, last_saved_at: nowIso_(), current_part: '', progress: 'Submitted',
                   state_json: compactState_(state), n_sittings: state.sit };
    Object.keys(g.partScores).forEach(function (p) { total += g.partScores[p].score; n += g.partScores[p].n; });
    // score_<X> / time_used_<X>_min per section: AP → per part (A, B); SAT → RW, Math (modules summed)
    sectionsOf_(profileOf_(session)).forEach(function (sec) {
      var taken = sec.parts.filter(function (p) { return g.partScores[p]; });
      if (!taken.length) return;
      fields['score_' + sec.id] = taken.reduce(function (a, p) { return a + g.partScores[p].score; }, 0);
      fields['time_used_' + sec.id + '_min'] = round_(taken.reduce(function (a, p) { return a + g.partTimes[p]; }, 0), 1);
    });
    var lastPart = g.seq[g.seq.length - 1];
    fields.status = g.partEndReason[lastPart] === 'timeout' ? 'timeout' : 'completed';
    fields.total_correct = total;
    fields.total_questions = n;
    fields.percent = n ? round_(total / n, 4) : 0;
    fields.n_blank = g.responses.filter(function (r) { return r.profile === 'BLANK'; }).length;
    fields.n_flagged = g.responses.filter(function (r) { return r.final_marked; }).length;
    if (payload.device) fields.device = txt_(String(payload.device).slice(0, 60));
    var secUsed = {}; Object.keys(fields).forEach(function (k) { var m = /^time_used_(.+)_min$/.exec(k); if (m) secUsed[m[1]] = fields[k]; });
    var v = validity_(g.responses, g.partTimes, profileOf_(session), getSettings_(), secUsed);
    fields.reliable = v.reliable ? 'Yes' : 'No';
    updateRow_('Sessions', session._row, fields);
    appendPartLog_(logRows);
    // summaries: a failure here must not lose the submit (Sessions/Responses are already written), but it is logged loudly
    try { rebuildStudent_(String(session.student_code)); } catch (e) { console.error('REBUILD FAILED for ' + session.student_code + ': ' + (e && e.stack || e)); }
    try { refreshReportList_(); } catch (e) { console.error('REPORT LIST FAILED: ' + (e && e.stack || e)); }
    var done = {}; Object.keys(session).forEach(function (k) { done[k] = session[k]; });
    Object.keys(fields).forEach(function (k) { done[k] = fields[k]; });
    try { return resultView_(done, cleanResp, false); }
    catch (e) { console.error('RESULT VIEW FAILED: ' + (e && e.stack || e)); return { ok: true, show: 'none', session_id: String(session.session_id), attempt: Number(session.attempt_no) }; }
  } finally { lock.releaseLock(); }
}

/* ============================== result page · review · teacher mode ============================== */

function responsesOf_(sessionId) {
  return readTable_('Responses').rows.filter(function (r) { return String(r.session_id) === String(sessionId); });
}
function isFinished_(s) { return String(s.status) === 'completed' || String(s.status) === 'timeout'; }

/** Result page of one attempt (studentView_, Report.gs). asTeacher → always the full page, + student name. */
function resultView_(session, rows, asTeacher) {
  var S = getSettings_();
  var st = findStudent_(session.student_code);
  var name = st ? String(st.name || '') : String(session.student_code);
  var profile = profileOf_(session);
  var a = analyse_(session, rows, S, name);
  var v = studentView_(a, profile, !!asTeacher);
  v.show = asTeacher ? 'score_and_right_wrong' : S.show_results;
  if (asTeacher) { v.student = name; v.student_code = normCode_(session.student_code); v.teacher = true; }
  if (v.show === 'none') return { ok: true, show: 'none', session_id: v.session_id, title: v.title, attempt: v.attempt };
  if (v.show === 'score_only') { v.groups = []; v.review = []; v.practise = []; v.types = []; }
  return v;
}

/** Questions of one finished attempt for the read-only review: the question as the student saw it + their answer,
 *  right / wrong, time. NEVER the key (clientQuestion_ whitelist; status comes from Responses). */
function reviewData_(session, rows) {
  var formId = String(session.form_id);
  var fd = formData_(formId), profile = profileOf_(session);
  if (!fd) throw new Error('FORM: This test is not available.');
  var by = {};
  rows.forEach(function (r) { by[String(r.qid)] = r; });
  var sat = isSat_(profile);
  // the parts as in the test (layout, calculator, reference, directions) so the review can use the test screen (#24 G)
  var parts = profile.parts.filter(function (p) { return rows.some(function (r) { return String(r.part) === p.part; }); }).map(function (p) {
    return { part: p.part, title: p.title, layout: p.layout || 'single', spr_layout: p.spr_layout || '', choices: p.choices || 5,
             calculator: !!p.calculator, reference: !!p.reference, annotate: p.annotate !== false, directions_html: p.directions_html || '' };
  });
  var qs = fd.questions.filter(function (q) { return by[q.qid]; }).map(function (q) {
    var r = by[q.qid], o = clientQuestion_(q);
    o.answer = answerText_(r.final_answer);
    o.status = String(r.profile) === 'BLANK' || o.answer === '' ? 'blank' : (Number(r.correct) === 1 ? 'right' : 'wrong');
    o.time_s = Math.round(Number(r.time_total_sec) || 0);
    o.code = qCode_(q.part, q.display_no, sat); o.badge = qBadge_(String(r.profile));
    return o;
  });
  return { ok: true, session_id: String(session.session_id), form_id: formId, title: formTitle_(profile, formId), parts: parts, questions: qs,
           question_font: profile.question_font || '', reference_sheet: profile.reference_sheet || '', reference_html: profile.reference_html || '',
           annotate_label: profile.annotate_label || '', settings: { desmos_api_key: desmosKey_() } };
}

/** My Tests → "View result" of a past attempt. */
function getResult(code, sessionId) {
  var s = requireSession_(code, sessionId);
  if (!isFinished_(s)) return { ok: false, msg: 'This attempt has not been submitted yet.' };
  return resultView_(s, responsesOf_(sessionId), false);
}

/** Result page → "Review questions" (read-only; never the correct answer). */
function getReview(code, sessionId) {
  var s = requireSession_(code, sessionId);
  if (!isFinished_(s)) throw new Error('SESSION: This attempt has not been submitted yet.');
  if (getSettings_().show_results !== 'score_and_right_wrong') throw new Error('SESSION: Question review is turned off.');
  return reviewData_(s, responsesOf_(sessionId));
}

/* ---- teacher mode: sign in with Settings!teacher_code (read-only; "Show answer" reveals one key on request) ---- */

function isTeacherCode_(code) {
  var t = String(getSettings_().teacher_code || '').trim().toUpperCase();
  return !!t && t.length >= 4 && String(code || '').trim().toUpperCase() === t;
}
function requireTeacher_(code) {
  if (!isTeacherCode_(code)) throw new Error('LOGIN: Teacher code not valid.');
}

/** Students → their finished attempts (newest first). */
function teacherOverview(code) {
  requireTeacher_(code);
  var students = readTable_('Students').rows;
  var sessions = readTable_('Sessions').rows.filter(function (s) { return isFinished_(s) && !isHidden_(s); }); // hidden (#32): not listed
  var titles = {};
  var out = students.map(function (st) {
    var c = normCode_(st.student_code);
    var mine = sessions.filter(function (s) { return normCode_(s.student_code) === c; })
      .sort(function (a, b) { return toMs_(b.submitted_at) - toMs_(a.submitted_at); });
    return { code: c, name: String(st.name || c), track: String(st.track || ''), active: isYes_(st.active),
      attempts: mine.map(function (s) {
        var f = String(s.form_id), tk = f + '|' + scopeOf_(s);
        if (!(tk in titles)) { var e = regEntry_(f); titles[tk] = e ? formTitle_(scopedProfile_(e.profile, scopeOf_(s)), f) : f; }
        return { session_id: String(s.session_id), form_id: f, title: titles[tk], attempt_no: Number(s.attempt_no) || 0, scope: scopeOf_(s),
                 date: dateStr_(s.submitted_at), right: s.total_correct === '' ? null : Number(s.total_correct),
                 n: Number(s.total_questions) || null, reliable: String(s.reliable || ''), sittings: Number(s.n_sittings) || 1,
                 available: !!regEntry_(f) };
      }) };
  }).sort(function (a, b) { return (b.attempts.length ? 1 : 0) - (a.attempts.length ? 1 : 0) || a.name.localeCompare(b.name); });
  return { ok: true, students: out };
}
function teacherSession_(code, sessionId) {
  requireTeacher_(code);
  var s = findSession_(sessionId);
  if (!s || !isFinished_(s)) throw new Error('SESSION: This attempt was not found.');
  return s;
}
function teacherResult(code, sessionId) {
  var s = teacherSession_(code, sessionId);
  return resultView_(s, responsesOf_(sessionId), true);
}
function teacherReview(code, sessionId) {
  var s = teacherSession_(code, sessionId);
  var r = reviewData_(s, responsesOf_(sessionId));
  var st = findStudent_(s.student_code); r.student = st ? String(st.name || '') : String(s.student_code);
  return r;
}
/** The key of ONE question of this attempt — only when the teacher presses "Show answer". */
function teacherAnswer(code, sessionId, qid) {
  var s = teacherSession_(code, sessionId);
  var fd = formData_(String(s.form_id));
  var q = fd && fd.questions.filter(function (x) { return x.qid === String(qid); })[0];
  if (!q) throw new Error('SESSION: Question not found.');
  var keys = Array.isArray(q.key) ? q.key : [q.key];
  return { ok: true, qid: q.qid, type: q.type || 'mcq', key: keys.map(String) };
}

