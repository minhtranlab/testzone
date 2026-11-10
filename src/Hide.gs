/**
 * Test Zone — hide attempts (ticket #32, v1.11). Nothing is deleted: Sessions.hidden = Yes takes an attempt out of the
 * Report B2 list, Student_Report, Topic_Summary and the teacher lists; its raw rows (Sessions, Responses, Events,
 * Part_Log) stay. Menu Test Zone → "Hide attempts…" (a student code = all attempts of that student, or empty = the
 * attempt picked in Report!B2) and "Show hidden attempts" (a student code, or ALL). The student's own My Tests is unchanged.
 */

function isHidden_(s) { return isYes_(s && s.hidden); }

/** spec: { code } (all attempts of a student) · { session_id } · { all: true } (only for show). Returns the number changed. */
function setHidden_(spec, hide) {
  var t = readTable_('Sessions'), codes = {}, n = 0;
  t.rows.forEach(function (r) {
    var hit = spec.all || (spec.session_id && String(r.session_id) === String(spec.session_id)) ||
              (spec.code && normCode_(r.student_code) === normCode_(spec.code));
    if (!hit || isHidden_(r) === !!hide) return;
    updateRow_('Sessions', r._row, { hidden: hide ? 'Yes' : '' });
    codes[normCode_(r.student_code)] = 1; n++;
  });
  Object.keys(codes).forEach(function (c) { rebuildStudent_(c); });
  if (n) { refreshReportList_(); try { redrawReportTab_(); } catch (e) {} }
  return n;
}

/** The session id picked in Report!B2 ('' when nothing is picked). */
function pickedSessionId_() {
  var sh = ss_().getSheetByName(REPORT_TAB);
  if (!sh) return '';
  var label = String(sh.getRange(2, 2).getValue() || '');
  if (!label) return '';
  var vals = sh.getRange(2, RPT_LIST_COL, Math.max(sh.getLastRow(), 2), 2).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === label) return String(vals[i][1]);
  return '';
}

function hideAttemptsMenu() {
  requireEditor_();
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Hide attempts', 'Student code: hides ALL attempts of that student.\nLeave empty: hides the attempt picked in Report!B2.\n(Nothing is deleted. Menu Test Zone → Show hidden attempts brings them back.)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var code = String(r.getResponseText() || '').trim(), spec;
  if (code) {
    if (!findStudent_(normCode_(code))) { ui.alert('No student with code ' + code + ' in the Students tab.'); return; }
    spec = { code: code };
  } else {
    var sid = pickedSessionId_();
    if (!sid) { ui.alert('Pick an attempt in Report!B2 first, or type a student code.'); return; }
    spec = { session_id: sid };
  }
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { var n = setHidden_(spec, true); ui.alert(n + ' attempt(s) hidden.'); } finally { lock.releaseLock(); }
}

function showHiddenMenu() {
  requireEditor_();
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Show hidden attempts', 'Student code: shows the hidden attempts of that student again.\nType ALL: shows every hidden attempt again.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var code = String(r.getResponseText() || '').trim();
  if (!code) return;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { var n = setHidden_(/^all$/i.test(code) ? { all: true } : { code: code }, false); ui.alert(n + ' attempt(s) shown again.'); } finally { lock.releaseLock(); }
}
