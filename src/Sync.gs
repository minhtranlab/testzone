/**
 * Test Zone — keeps the Sheet's structure and text in step with the code (run by Update.gs once per deploy).
 * Every step is idempotent. What each one may change:
 *   renameHeaders_()     row-1 header renames (old name → new name) when the old one is still there
 *   renameOldForms_()    Forms rows with the pre-2026-11-09 SAT ids → the new ids (no attempts exist for them)
 *   syncFormsTab_()      appends Forms rows for a form that has its Drive file but no rows; fills empty data_file_id
 *   ensureSettingsRows_() adds Settings rows the code needs (teacher_code), never changes a value
 *   syncSheetTexts_()    rewrites README, Interpretation, Dictionary (from SheetText.gs), the Settings meanings and
 *                        the Report tab's title lines
 */

var HEADER_RENAMES_ = {
  Student_Report: { summary_vi: 'summary' },
  Dictionary: { 'ý nghĩa': 'meaning', 'ví dụ': 'example' }
};
var OLD_FORM_IDS_ = {
  'SAT-2026-08-I2': 'SAT-2026-08', 'SAT-2026-09-USA': 'SAT-2026-09A', 'SAT-2026-09-I2': 'SAT-2026-09B',
  'SAT-2026-10-A': 'SAT-2026-10', 'SAT-2026-11-A': 'SAT-2026-11'
};
var SAT_SOURCE_EN_ = 'Third-party predicted form (not College Board)';

function renameHeaders_() {
  var log = [];
  Object.keys(HEADER_RENAMES_).forEach(function (tab) {
    var sh = ss_().getSheetByName(tab);
    if (!sh || sh.getLastColumn() < 1) return;
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    Object.keys(HEADER_RENAMES_[tab]).forEach(function (oldName) {
      var i = h.indexOf(oldName), nw = HEADER_RENAMES_[tab][oldName];
      if (i < 0 || h.indexOf(nw) >= 0) return;
      sh.getRange(1, i + 1).setValue(nw);
      log.push(tab + ': ' + oldName + ' → ' + nw);
    });
  });
  return log.length ? 'headers renamed: ' + log.join(', ') : 'headers OK';
}

function renameOldForms_() {
  var t = readTable_('Forms'), n = 0;
  t.rows.forEach(function (r) {
    var nw = OLD_FORM_IDS_[String(r.form_id).trim()];
    if (!nw) return;
    var src = String(r.source || '').replace(/^Đề dự đoán bên thứ ba \(không phải College Board\)/, SAT_SOURCE_EN_);
    updateRow_('Forms', r._row, { form_id: nw, source: src });
    n++;
  });
  return n ? 'Forms: ' + n + ' rows renamed to the new SAT ids' : 'Forms ids OK';
}

function syncFormsTab_() {
  var t = readTable_('Forms'), have = {}, added = 0, filled = 0;
  t.rows.forEach(function (r) { have[String(r.form_id).trim() + '|' + String(r.part).trim()] = r; });
  var idx = driveFormIndex_(), add = [];
  Object.keys(formRegistry_()).forEach(function (fid) {
    var e = regEntry_(fid);
    if (!e) return; // no data file yet → no rows (it would only show "Coming soon")
    e.profile.parts.forEach(function (p) {
      var r = have[fid + '|' + p.part];
      if (!r) {
        add.push({ form_id: fid, exam: e.profile.exam, part: p.part, part_title: p.title || '', n_questions: p.n,
                   time_limit_min: Math.round(p.time_limit_sec / 60), calculator: p.calculator ? 'Yes' : 'No',
                   source: isSat_(e.profile) ? SAT_SOURCE_EN_ : '', data_file_id: idx[fid] ? idx[fid].split(':')[0] : '' });
        added++;
      } else if ('data_file_id' in r && String(r.data_file_id) === '' && idx[fid]) {
        updateRow_('Forms', r._row, { data_file_id: idx[fid].split(':')[0] });
        filled++;
      }
    });
  });
  appendObjects_('Forms', add);
  return 'Forms: ' + added + ' rows added, ' + filled + ' data_file_id filled';
}

function ensureSettingsRows_() {
  var keys = readTable_('Settings').rows.map(function (r) { return String(r.key).trim(); });
  var add = SETTINGS_NEW_ROWS_.filter(function (r) { return keys.indexOf(r[0]) < 0; })
    .map(function (r) { return { key: r[0], value: r[1], meaning: SETTINGS_MEANING_[r[0]] || '' }; });
  appendObjects_('Settings', add);
  return add.length ? 'Settings rows added: ' + add.map(function (r) { return r.key; }).join(', ') : 'Settings rows OK';
}

/** Replace the whole content of a text tab (README, Interpretation, Dictionary). */
function writeTextTab_(name, rows) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var vals = rows.map(function (r) { var o = r.slice(); while (o.length < w) o.push(''); return o.map(function (v) { return typeof v === 'string' && /^[=+\-]/.test(v) ? "'" + v : v; }); });
  ensureGrid_(sh, vals.length + 1, w);
  var old = Math.max(sh.getLastRow(), 1), oldW = Math.max(sh.getLastColumn(), w);
  sh.getRange(1, 1, vals.length, w).setValues(vals);
  if (old > vals.length) sh.getRange(vals.length + 1, 1, old - vals.length, oldW).clearContent();
  if (oldW > w) sh.getRange(1, w + 1, vals.length, oldW - w).clearContent();
}

function syncSheetTexts_() {
  writeTextTab_('README', README_ROWS_);
  writeTextTab_('Interpretation', INTERPRETATION_ROWS_);
  writeTextTab_('Dictionary', DICTIONARY_ROWS_);
  var n = 0;
  readTable_('Settings').rows.forEach(function (r) {
    var m = SETTINGS_MEANING_[String(r.key).trim()];
    if (m && String(r.meaning) !== m) { updateRow_('Settings', r._row, { meaning: m }); n++; }
  });
  var rp = ss_().getSheetByName(REPORT_TAB);
  if (rp) { rp.getRange(1, 2).setValue(REPORT_TITLE_); rp.getRange(3, 2).setValue(REPORT_HINT_); }
  return 'texts: README ' + README_ROWS_.length + ', Interpretation ' + INTERPRETATION_ROWS_.length + ', Dictionary ' + DICTIONARY_ROWS_.length + ' rows; Settings meanings updated ' + n;
}
