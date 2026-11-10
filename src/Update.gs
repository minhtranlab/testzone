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
 *   ensureTimeNorms_    → Time_Norms tab created once from TimeNorms.gs (then Minh's to edit; #24 F)
 *   resyncQuestions_    → after a data round renumbered items: rows whose qid now holds another item are rebuilt
 *                         from the data file (Minh's edits kept where the qid still holds the same item; Setup.gs)
 *   importQuestions_    → Questions-tab rows for forms that are new; existing rows (Minh's edits) are left as they are
 *   rebuildAll_         → re-grade attempts from the current keys + repair answer cells (Regrade.gs), then recompute
 *                         Topic_Summary / Student_Report / Report-tab list (script-built tabs only)
 *   redrawReportTab_    → the Report tab shows the attempt in B2 drawn by THIS version (or an English placeholder)
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
  // fresh list of form files (a file uploaded just before this deploy must be seen now, not after the 10-min cache)
  try { CacheService.getScriptCache().remove('tz_drive_idx'); _driveIdx = null; } catch (e) {}
  var steps = [
    ['headers', renameHeaders_],
    ['columns', addMissingColumns_],
    ['forms', function () { return renameOldForms_() + ' · ' + syncFormsTab_(); }],
    ['settings', ensureSettingsRows_],
    ['texts', syncSheetTexts_],
    ['score scale', ensureScoreScale_],
    ['time norms', ensureTimeNorms_],
    ['questions', function () { return resyncQuestions_() + '\n' + importQuestions_(); }],
    ['reports', rebuildAll_],
    ['report tab', redrawReportTab_],
    ['check', checkSheet_]
  ];
  var notes = [], failed = 0, log = [];
  steps.forEach(function (s) {
    try {
      var msg = String(s[1]() || '');
      log.push('[' + s[0] + '] ' + msg);
      if (['headers', 'forms', 'settings', 'score scale', 'time norms'].indexOf(s[0]) >= 0) notes.push(msg);
      if (s[0] === 'columns') notes.push(/Nothing to add/.test(msg) ? 'columns OK' : 'columns added: ' + (msg.match(/added column/g) || []).length);
      if (s[0] === 'questions') {
        var m = /Imported (\d+)/.exec(msg), rs = /resynced for (\d+)/.exec(msg);
        notes.push('questions added: ' + (m ? m[1] : '?') + (rs ? ', resynced forms: ' + rs[1] : ''));
      }
      if (s[0] === 'reports') { var rg = /Re-graded (\d+) answers \(key changes\) in (\d+) attempts; repaired (\d+)/.exec(msg); notes.push('reports rebuilt' + (rg ? ' (re-graded ' + rg[1] + ' answers in ' + rg[2] + ' attempts, ' + rg[3] + ' rows repaired)' : '')); }
      if (s[0] === 'report tab') notes.push(msg);
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

/** After a new version the Report tab must not keep a drawing made by the old code (QA m5): redraw the attempt in B2,
 *  or clear the body with an English placeholder when B2 is empty / no longer in the list. */
function redrawReportTab_() {
  var sh = ss_().getSheetByName(REPORT_TAB);
  if (!sh) return 'report tab: none yet';
  try {
    var a = renderSelected_(sh);
    if (a) return 'report tab: redrawn';
  } catch (e) { console.error('REPORT REDRAW FAILED: ' + (e && e.stack || e)); }
  clearReport_(sh);
  try { sh.getRange(2, 2).clearContent(); } catch (e) {}
  sh.getRange(RPT_FIRST, 2).setValue('Pick an attempt in cell B2.');
  return 'report tab: cleared (pick an attempt in B2)';
}

function writeStamp_(line) {
  var cur = currentStamp_();
  var fields = { key: UPDATE_SETTING, value: txt_(stamp_()),
                 meaning: 'Code version + commit whose Sheet update has run (set automatically after each deploy). Last run: ' + line };
  if (cur._row) updateRow_('Settings', cur._row, fields);
  else appendObjects_('Settings', [fields]);
}
