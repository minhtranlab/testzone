/**
 * Test Zone — Sheet update after a new version (replaces the editor steps Minh used to run by hand after a paste).
 *
 * Runs once per deploy (stamp = APP_VERSION + APP_BUILD, the commit id the Action writes into Code.gs), in this order (each step is safe to repeat):
 *   renameHeaders_      → header renames listed in Sync.gs (e.g. summary_vi → summary)
 *   addMissingColumns_  → new columns at the END of row 1; never touches existing cells
 *   renameOldForms_ + syncFormsTab_ → Forms rows for the current form ids, data_file_id filled (Sync.gs)
 *   ensureSettingsRows_ → Settings rows the code needs (teacher_code), values never changed
 *   syncSheetTexts_     → README / Interpretation / Dictionary / Settings meanings from SheetText.gs
 *   ensureScoreScale_   → Score_Scale tab created once from ScoreScale.gs (then Minh's to edit)
 *   importQuestions_    → Questions-tab rows for forms that are new; existing rows (Minh's edits) are left as they are
 *   rebuildAll_         → recompute Topic_Summary / Student_Report / Report-tab list (script-built tabs only)
 *   checkSheet_         → read-only check, result in the log
 * Then Settings row `code_version` = the stamp, and its `meaning` cell = when it ran + a one-line result.
 *
 * Who starts it:
 *   1. the GitHub Action, right after `clasp deploy`, opens <web app URL>?update=1 (doGet in Code.gs)
 *   2. fallback: Sheet menu "Test Zone → Update after new version" (runs it again even if the stamp is current)
 * The ?update=1 answer is one line of status text: no Sheet data ever goes back to the caller.
 */

var UPDATE_SETTING = 'code_version';

function stamp_() { return APP_VERSION + ' · ' + APP_BUILD; }

/** Web-app / Action entry: does the update only if Settings.code_version differs from this deploy's stamp. */
function runUpdateIfNeeded_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 'Test Zone update: busy (another update is running) · ' + stamp_();
  try {
    if (String(currentStamp_().value) === stamp_()) return 'Test Zone update: already up to date · ' + stamp_();
    return 'Test Zone update: ' + doUpdate_().status + ' · ' + stamp_();
  } finally {
    lock.releaseLock();
  }
}

/** Menu fallback (editor/owner only): always runs. */
function updateAfterNewVersion() {
  requireEditor_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var r = doUpdate_();
    try { SpreadsheetApp.getActive().toast(r.line, 'Test Zone ' + APP_VERSION, 10); } catch (e) {}
  } finally {
    lock.releaseLock();
  }
}

function currentStamp_() {
  var row = readTable_('Settings').rows.filter(function (r) { return String(r.key).trim() === UPDATE_SETTING; })[0];
  return row || { _row: 0, value: '' };
}

function doUpdate_() {
  var steps = [
    ['headers', renameHeaders_],
    ['columns', addMissingColumns_],
    ['forms', function () { return renameOldForms_() + ' · ' + syncFormsTab_(); }],
    ['settings', ensureSettingsRows_],
    ['texts', syncSheetTexts_],
    ['score scale', ensureScoreScale_],
    ['questions', importQuestions_],
    ['reports', rebuildAll_],
    ['check', checkSheet_]
  ];
  var notes = [], failed = 0, log = [];
  steps.forEach(function (s) {
    try {
      var msg = String(s[1]() || '');
      log.push('[' + s[0] + '] ' + msg);
      if (['headers', 'forms', 'settings', 'score scale'].indexOf(s[0]) >= 0) notes.push(msg);
      if (s[0] === 'columns') notes.push(/Nothing to add/.test(msg) ? 'columns OK' : 'columns added: ' + (msg.match(/added column/g) || []).length);
      if (s[0] === 'questions') { var m = /Imported (\d+)/.exec(msg); notes.push('questions added: ' + (m ? m[1] : '?')); }
      if (s[0] === 'reports') notes.push('reports rebuilt');
      if (s[0] === 'check') { var p = /→ (\d+) problem/.exec(msg); notes.push(p ? 'checkSheet: ' + p[1] + ' problem(s), see log' : 'checkSheet: all good'); }
    } catch (err) {
      failed++;
      notes.push(s[0] + ' FAILED');
      log.push('[' + s[0] + '] FAILED: ' + (err && err.stack || err));
    }
  });
  console.log('UPDATE ' + stamp_() + '\n' + log.join('\n'));
  var line = nowIso_() + ' · ' + notes.join(' · ');
  if (!failed) writeStamp_(line);   // a failed step leaves the old stamp → the next ping / menu click tries again
  return { status: failed ? 'FAILED (' + failed + ' step(s), see Apps Script Executions log)' : 'done', line: line };
}

function writeStamp_(line) {
  var cur = currentStamp_();
  var fields = { key: UPDATE_SETTING, value: txt_(stamp_()),
                 meaning: 'Code version + commit whose Sheet update has run (set automatically after each deploy). Last run: ' + line };
  if (cur._row) updateRow_('Settings', cur._row, fields);
  else appendObjects_('Settings', [fields]);
}
