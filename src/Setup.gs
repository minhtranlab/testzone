/**
 * Test Zone — Sheet checks (run from the Apps Script editor — they refuse to run when called through the web app).
 *   checkSheet()          → verifies every tab's headers against what the code expects + Forms/Questions vs data files.
 *                           Read-only: never writes to the Sheet. Result in the log (View → Logs / Execution log).
 *   addMissingColumns()   → only if checkSheet says columns are missing: appends them at the END of row 1.
 *                           Never touches existing cells. (Column meanings: Dictionary, from SheetText.gs.)
 *   importQuestions()     → appends Questions-tab rows (metadata + key, no stem) for every form in Forms_Registry.gs.
 *                           Existing qids are left as they are (Minh's tag edits are kept); differences are reported.
 *   rebuildAll()          → recompute Topic_Summary + Student_Report for every student.
 * The real work is in the private functions (trailing _), which google.script.run cannot call.
 */

/** Editor-only guard.
 *  The web app runs "as Me", so a student calling through it has an EMPTY active user while the effective user is the
 *  owner → blocked. In the editor both are the owner → allowed.
 *  If Google gives the script no email at all (the "See your primary Google Account email address" permission was not
 *  ticked when authorising), both are empty → allowed too (fix 2026-11-06: this used to block Minh in the editor).
 *  That is safe because the wrappers below never return anything to the caller (results go to the Execution log only)
 *  and every action is idempotent (re-check, add missing columns, add missing questions, recompute reports). */
function requireEditor_() {
  var a = '', e = '';
  try { a = String(Session.getActiveUser().getEmail() || ''); } catch (x) {}
  try { e = String(Session.getEffectiveUser().getEmail() || ''); } catch (x) {}
  if (e && a.toLowerCase() !== e.toLowerCase()) throw new Error('Run this function from the Apps Script editor.');
}
function checkSheet() { requireEditor_(); checkSheet_(); }
function addMissingColumns() { requireEditor_(); addMissingColumns_(); }
function importQuestions() { requireEditor_(); importQuestions_(); }
function rebuildAll() { requireEditor_(); console.log(rebuildAll_()); }

var EXPECTED_HEADERS = {
  README: null, Interpretation: null, // free text tabs, not checked
  Student_Report: ['session_id', 'student_code', 'form_id', 'attempt_no', 'submitted_at', 'total_correct', 'percent',
                   'weakest_topics', 'main_error_profile', 'timing_pattern', 'summary',
                   // added in fix round 1 / 2, SAT round 2:
                   'reliable', 'sittings', 'estimated_score',
                   // #29: full test or the assigned parts
                   'scope'],
  Topic_Summary: ['student_code', 'form_id', 'unit', 'topic', 'topic_name', 'n_attempted', 'n_correct', 'accuracy',
                  'avg_pace_ratio', 'n_fast_wrong', 'n_slow_wrong', 'n_slow_right', 'n_blank', 'n_changed_R_to_W', 'verdict', 'updated_at'],
  Students: ['student_code', 'name', 'track', 'active', 'note'],
  Sessions: ['session_id', 'student_code', 'form_id', 'attempt_no', 'started_at', 'submitted_at', 'status', 'score_A', 'score_B',
             'total_correct', 'total_questions', 'percent', 'time_used_A_min', 'time_used_B_min', 'n_blank', 'n_flagged', 'device',
             // added by Chat B (2026-11-05) for autosave / resume with a server-side clock:
             'current_part', 'part_started_at', 'last_saved_at', 'events_saved', 'state_json',
             // added in fix round 1 / 2:
             'reliable', 'n_sittings',
             // added in the SAT round (sections; AP keeps score_A/B, time_used_A/B):
             'score_RW', 'score_Math', 'time_used_RW_min', 'time_used_Math_min',
             // #21 N1: which open copy (browser tab / device) of the attempt is the live one
             'copy_token',
             // #29 assignments: 'full' or the parts of the attempt ('M1', 'RW1,RW2'); blank = full (older rows)
             'scope',
             // #32: live progress (written at every autosave) · hidden = Yes → out of Report / Student_Report / Topic_Summary / teacher lists
             'progress', 'hidden'],
  Part_Log: ['session_id', 'student_code', 'form_id', 'attempt_no', 'part', 'started_at', 'ended_at', 'end_reason', 'time_used_min', 'sitting_no'],
  Report: null,
  Responses: ['session_id', 'student_code', 'form_id', 'attempt_no', 'qid', 'part', 'display_no', 'unit', 'topic', 'final_answer',
              'correct', 'first_answer', 'n_changes', 'change_pattern', 'eliminated', 'ever_marked', 'final_marked', 'visits',
              'time_total_sec', 'time_first_visit_sec', 'pace_ratio', 'order_first_seen', 'calc_used', 'profile', 'flags', 'tutor_note'],
  Events: ['session_id', 'part', 't_ms', 'qid', 'type', 'value', 'logged_at'],
  Questions: ['qid', 'form_id', 'part', 'display_no', 'orig_no', 'key', 'unit', 'topic', 'topic_name', 'topic2', 'practice',
              'representation', 'difficulty', 'tag_status',
              // added in the SAT round:
              'type', 'orig_module', 'key_source', 'flags'],
  Forms: ['form_id', 'exam', 'part', 'part_title', 'n_questions', 'time_limit_min', 'calculator', 'source',
          // SAT round 2: Drive file of the form (filled automatically when blank; may also be typed to point at another file)
          'data_file_id'],
  Settings: ['key', 'value', 'meaning'],
  Assignments: ['student_code', 'form', 'parts', 'active', 'note'], // = ASSIGN_HEADERS (Assign.gs)
  Dictionary: ['tab', 'column', 'meaning', 'example'],
  Score_Scale: null
};

/* Column meanings: Dictionary tab, written from SheetText.gs on every deploy (Sync.gs). */

var REQUIRED_SETTINGS = ['app_name', 'fast_ratio', 'slow_ratio', 'guess_window_sec', 'guess_min_time_sec', 'weak_accuracy',
                         'min_questions_for_verdict', 'autosave_sec', 'five_min_warning_sec', 'desmos_api_key', 'show_results',
                         'valid_min_time_ratio', 'valid_quick_ratio', 'valid_blank_ratio', 'unit_slow_ratio', 'teacher_code'];

function checkSheet_() {
  var out = [], problems = 0;
  var ss = ss_();
  Object.keys(EXPECTED_HEADERS).forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh && (tab === 'Report' || tab === 'Part_Log' || tab === 'Score_Scale' || tab === 'Assignments')) { out.push('· ' + tab + ': not created yet (created automatically: Report by rebuildAll, Part_Log when a part ends, Score_Scale and Assignments by the update after a deploy)'); return; }
    if (!sh) { out.push('✗ ' + tab + ': TAB MISSING'); problems++; return; }
    var exp = EXPECTED_HEADERS[tab];
    if (!exp) { out.push('✓ ' + tab + ' (free text, not checked)'); return; }
    var have = headers_(tab).filter(function (h) { return h !== ''; });
    var missing = exp.filter(function (h) { return have.indexOf(h) < 0; });
    var extra = have.filter(function (h) { return exp.indexOf(h) < 0; });
    var frozen = sh.getFrozenRows ? sh.getFrozenRows() : 1;
    var line = (missing.length ? '✗ ' : '✓ ') + tab + ': ' + have.length + ' columns';
    if (missing.length) { line += ' · MISSING: ' + missing.join(', ') + ' (run addMissingColumns)'; problems++; }
    if (extra.length) line += ' · extra (ignored by code): ' + extra.join(', ');
    if (frozen < 1) line += ' · header row not frozen';
    out.push(line);
  });
  // Settings keys
  try {
    var keys = readTable_('Settings').rows.map(function (r) { return String(r.key).trim(); });
    var miss = REQUIRED_SETTINGS.filter(function (k) { return keys.indexOf(k) < 0; });
    out.push(miss.length ? '✗ Settings keys missing (defaults used): ' + miss.join(', ') : '✓ Settings: all keys present');
    var s = getSettings_();
    if (!s.desmos_api_key) out.push('! Settings.desmos_api_key is blank → Desmos demo key in use (testing only).');
  } catch (e) { out.push('✗ Settings: ' + e); problems++; }
  // Students
  try {
    var st = readTable_('Students').rows;
    var active = st.filter(function (r) { return isYes_(r.active); }).length;
    out.push('· Students: ' + st.length + ' rows, ' + active + ' active');
    var seen = {};
    st.forEach(function (r) { var c = normCode_(r.student_code); if (seen[c]) { out.push('✗ duplicate student_code ' + c); problems++; } seen[c] = 1; });
  } catch (e) {}
  // Assignments (#29)
  try { var ca = checkAssignments_(); out = out.concat(ca.lines); problems += ca.problems; } catch (e) { out.push('✗ Assignments: ' + e); problems++; }
  // Forms vs data files
  var formsRows = readTable_('Forms').rows;
  Object.keys(formRegistry_()).filter(function (fid) { return !regEntry_(fid); }).forEach(function (fid) {
    out.push('· ' + fid + ': listed in Forms_Registry but its form file is not in the Drive folder "Test Zone - Form Files" yet (shown as Coming soon)');
  });
  formIds_().forEach(function (fid) {
    var fd = formData_(fid);
    fd.profile.parts.forEach(function (p) {
      var n = fd.questions.filter(function (q) { return q.part === p.part; }).length;
      var r = formsRows.filter(function (x) { return String(x.form_id) === fid && String(x.part) === p.part; })[0];
      if (!r) { out.push('✗ Forms: no row for ' + fid + ' part ' + p.part); problems++; }
      else if (Number(r.n_questions) !== n) { out.push('! Forms: ' + fid + ' part ' + p.part + ' says n=' + r.n_questions + ', data file has ' + n); }
      else out.push('✓ Forms: ' + fid + ' part ' + p.part + ' n=' + n + ', ' + r.time_limit_min + ' min, calculator ' + r.calculator);
    });
  });
  formsRows.forEach(function (r) { if (!regEntry_(String(r.form_id))) out.push('· Forms: ' + r.form_id + ' part ' + r.part + ' has no form file on Drive yet (students see "Coming soon")'); });
  // Questions tab vs data
  try {
    var qrows = readTable_('Questions').rows;
    formIds_().forEach(function (fid) {
      var have = {};
      qrows.filter(function (r) { return String(r.form_id) === fid; }).forEach(function (r) { have[String(r.qid)] = r; });
      var missing = 0, keyDiff = [];
      formDataRaw_(fid).questions.forEach(function (q) {
        var r = have[q.qid];
        if (!r) { missing++; return; }
        var k = Array.isArray(q.key) ? q.key.join('|') : String(q.key);
        if (String(r.key).trim() !== k) keyDiff.push(q.qid + ' sheet=' + r.key + ' data=' + k);
      });
      if (missing) out.push('! Questions tab: ' + missing + ' questions of ' + fid + ' not imported yet (run importQuestions)');
      else out.push('✓ Questions tab: all ' + formData_(fid).questions.length + ' questions of ' + fid + ' present');
      if (keyDiff.length) out.push('· Key changed in the Sheet (the Sheet key is used for grading and reports): ' + keyDiff.join('; '));
    });
  } catch (e) {}
  out.push(problems ? ('→ ' + problems + ' problem(s).') : '→ All good.');
  var msg = out.join('\n');
  console.log(msg);
  return msg;
}

function addMissingColumns_() {
  var log = [];
  Object.keys(EXPECTED_HEADERS).forEach(function (tab) {
    var exp = EXPECTED_HEADERS[tab];
    if (!exp) return;
    var sh = ss_().getSheetByName(tab);
    if (!sh) { if (tab !== 'Assignments') log.push('skip ' + tab + ' (tab missing — create it by hand)'); return; } // Assignments: its own update step
    var have = headers_(tab);
    var lastUsed = 0; have.forEach(function (h, i) { if (h !== '') lastUsed = i + 1; });
    var missing = exp.filter(function (h) { return have.indexOf(h) < 0; });
    missing.forEach(function (h, k) {
      var col = lastUsed + 1 + k;
      if (col > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
      sh.getRange(1, col).setValue(h);
      log.push(tab + ': added column ' + h);
    });
  });
  var msg = log.length ? log.join('\n') : 'Nothing to add.';
  console.log(msg);
  return msg;
}

function importQuestions_() {
  var existing = {};
  readTable_('Questions').rows.forEach(function (r) { existing[String(r.qid)] = r; });
  var add = [], diffs = [];
  formIds_().forEach(function (fid) {
    formDataRaw_(fid).questions.forEach(function (q) {
      var row = questionRow_(fid, q);
      var r = existing[q.qid];
      if (!r) { add.push(row); return; }
      ['unit', 'topic', 'difficulty', 'tag_status'].forEach(function (k) { // key: the Sheet wins on purpose (checkSheet lists it)
        var want = String(row[k]).replace(/^'/, '');
        if (String(r[k]) !== want) diffs.push(q.qid + '.' + k + ': sheet=' + r[k] + ' data=' + want);
      });
    });
  });
  appendObjects_('Questions', add);
  var msg = 'Imported ' + add.length + ' new question rows.' + (diffs.length ? '\nLeft unchanged (sheet differs from data):\n' + diffs.join('\n') : '');
  console.log(msg);
  return msg;
}

/** Questions tab ↔ data files, after a data round renumbered items (#15). For each form that already has rows:
 *  a Sheet row is kept as it is (Minh's edits) only when its qid still holds the SAME item (identity below);
 *  otherwise the row is rebuilt from the data file. Rows for qids no longer in the data are dropped.
 *  A key Minh changed on an item that moved to a new qid follows the item (only when the identity is unique).
 *  Forms whose rows already match are not touched; forms with no rows yet are left to importQuestions_. */
function questionIdent_(r) {
  return ['orig_module', 'orig_no', 'key_source', 'type', 'topic'].map(function (k) {
    var v = r[k]; if (k === 'type' && (v === '' || v === undefined || v === null)) v = 'mcq';
    return String(v === undefined || v === null ? '' : v).replace(/^'/, '').trim();
  }).join('|');
}
function keepCell_(v) { // a value read back from the Sheet, written again as the same text
  return (typeof v === 'string' && (/^[=+\-]/.test(v) || /^[\d.\/\s:]+$/.test(v))) ? "'" + v : v;
}
function resyncQuestions_() {
  var t = readTable_('Questions'), byForm = {};
  t.rows.forEach(function (r) { var f = String(r.form_id).trim(); (byForm[f] = byForm[f] || []).push(r); });
  var changed = {}, out = [], log = [];
  formIds_().forEach(function (fid) {
    var rows = byForm[fid] || [];
    if (!rows.length) return;
    var byQid = {}, byIdent = {}, dataQids = {}, stale = false, kept = 0, rebuilt = 0, carried = 0, dropped = 0, mine = [];
    rows.forEach(function (r) {
      byQid[String(r.qid).trim()] = r;
      var id = questionIdent_(r); byIdent[id] = byIdent.hasOwnProperty(id) ? null : r;
    });
    formDataRaw_(fid).questions.forEach(function (q) {
      dataQids[q.qid] = true;
      var want = questionRow_(fid, q), r = byQid[q.qid];
      if (r && questionIdent_(r) === questionIdent_(want)) {
        var o = {}; t.headers.forEach(function (h) { if (h) o[h] = keepCell_(r[h]); });
        mine.push(o); kept++; return;
      }
      stale = true; rebuilt++;
      var old = byIdent[questionIdent_(want)];
      var oldKey = old ? String(old.key).replace(/^'/, '').trim() : '';
      if (old && oldKey !== '' && !(old.key instanceof Date) && oldKey !== String(want.key).replace(/^'/, '')) {
        want.key = txt_(oldKey); carried++; log.push(fid + ': key ' + oldKey + ' kept for ' + old.qid + ' → ' + q.qid);
      }
      mine.push(want);
    });
    rows.forEach(function (r) { if (!dataQids[String(r.qid).trim()]) { stale = true; dropped++; } });
    if (rows.length !== mine.length) stale = true;
    if (!stale) return;
    changed[fid] = true; out = out.concat(mine);
    log.unshift(fid + ': ' + kept + ' rows kept, ' + rebuilt + ' rebuilt from the data file, ' + dropped + ' dropped, ' + carried + ' Sheet keys carried');
  });
  var forms = Object.keys(changed);
  if (!forms.length) return 'Questions: every form matches its data file';
  rewriteTable_('Questions', function (r) { return !changed[String(r.form_id).trim()]; }, out);
  _sheetKeys = null; _formCache = {};
  var msg = 'Questions resynced for ' + forms.length + ' form(s):\n' + log.join('\n');
  console.log(msg);
  return msg;
}

function questionRow_(fid, q) {
  var t = q.tags || {};
  return {
    qid: q.qid, form_id: fid, part: q.part, display_no: q.display_no, orig_no: q.orig_no,
    key: txt_(Array.isArray(q.key) ? q.key.join('|') : q.key), // text: an SPR key such as 3/4 must not become a date
    unit: t.unit, topic: txt_(t.topic), topic_name: t.topic_name,
    topic2: txt_(t.topic2), practice: t.practice, representation: t.representation, difficulty: t.difficulty, tag_status: t.tag_status || 'est',
    type: q.type || 'mcq', orig_module: q.orig_module || '',
    key_source: txt_(Array.isArray(q.key_source) ? q.key_source.join('|') : (q.key_source === undefined ? '' : q.key_source)),
    flags: (t.flags || []).join(',')
  };
}
