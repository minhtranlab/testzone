/**
 * Test Zone — Sheet checks (run from the Apps Script editor — they refuse to run when called through the web app).
 *   checkSheet()          → verifies every tab's headers against what the code expects + Forms/Questions vs data files.
 *                           Read-only: never writes to the Sheet. Result in the log (View → Logs / Execution log).
 *   addMissingColumns()   → only if checkSheet says columns are missing: appends them at the END of row 1 and adds
 *                           their Dictionary rows. Never touches existing cells.
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
                   'weakest_topics', 'main_error_profile', 'timing_pattern', 'summary_vi',
                   // added in fix round 1 / 2:
                   'reliable', 'sittings'],
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
             'score_RW', 'score_Math', 'time_used_RW_min', 'time_used_Math_min'],
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
  Forms: ['form_id', 'exam', 'part', 'part_title', 'n_questions', 'time_limit_min', 'calculator', 'source'],
  Settings: ['key', 'value', 'meaning'],
  Dictionary: ['tab', 'column', 'ý nghĩa', 'ví dụ']
};

/** Dictionary rows for columns Chat B added (used by addMissingColumns). */
var NEW_COLUMN_DOCS = {
  'Sessions.current_part': ['Part đang làm (trống khi đã nộp). Dùng để tiếp tục bài khi tải lại trang', 'B'],
  'Sessions.part_started_at': ['Giờ server ghi nhận bắt đầu part đang làm; đồng hồ còn lại = thời gian part − (bây giờ − mốc này)', '2026-11-06 19:05:12'],
  'Sessions.last_saved_at': ['Lần app lưu tạm gần nhất (autosave)', '2026-11-06 19:31:40'],
  'Sessions.events_saved': ['Số event đã ghi vào tab Events cho lần làm này', '214'],
  'Sessions.state_json': ['Trạng thái bài đang làm (đáp án, đánh dấu, gạch đáp án…) dạng JSON để tiếp tục khi mất mạng/tải lại. Không sửa tay', '{"parts":{…}}'],
  'Sessions.reliable': ['Yes = bài làm nghiêm túc, dùng để đánh giá được. No = không đáng tin (làm quá nhanh, nhiều câu chọn dưới 15 giây hoặc bỏ trống nhiều; xem Interpretation). Bài No không tính vào Topic_Summary', 'No'],
  'Student_Report.reliable': ['Như Sessions.reliable', 'Yes'],
  'Student_Report.sittings': ['Làm mấy lần và giờ làm từng part', 'Làm 2 lần: Part A 06/11 19:00–19:52 · Part B 08/11 20:10–21:00'],
  'Sessions.n_sittings': ['Số lần ngồi làm: 1 = làm liền cả đề; 2 = nghỉ giữa các part rồi làm tiếp (có thể khác ngày)', '2'],
  'Sessions.score_RW': ['SAT: số câu đúng phần Reading and Writing (Module 1 + 2, tối đa 54). Đề AP để trống', '41'],
  'Sessions.score_Math': ['SAT: số câu đúng phần Math (Module 1 + 2, tối đa 44). Đề AP để trống', '33'],
  'Sessions.time_used_RW_min': ['SAT: số phút đã dùng cho Reading and Writing (tối đa 64)', '58.5'],
  'Sessions.time_used_Math_min': ['SAT: số phút đã dùng cho Math (tối đa 70)', '66.2'],
  'Questions.type': ['mcq = trắc nghiệm A–D; spr = học sinh tự điền đáp án (SAT Math)', 'spr'],
  'Questions.orig_module': ['SAT: module trong file đề gốc (để truy lại khi app đổi thứ tự module, vd đề 09-I2)', 'RW2'],
  'Questions.key_source': ['SAT: đáp án in trong file đề gốc (bên thứ ba). key = key_source cho tới khi thầy quyết định khác', 'C'],
  'Questions.flags': ['SAT: cờ của câu (off_spec = ngoài chương trình SAT, dup_in_form = gần trùng câu khác trong đề, key_disputed = đáp án đang xem lại, ocr_fixed = đã sửa lỗi chữ)', 'dup_in_form']
};

var REQUIRED_SETTINGS = ['app_name', 'fast_ratio', 'slow_ratio', 'guess_window_sec', 'guess_min_time_sec', 'weak_accuracy',
                         'min_questions_for_verdict', 'autosave_sec', 'five_min_warning_sec', 'desmos_api_key', 'show_results',
                         'valid_min_time_ratio', 'valid_quick_ratio', 'valid_blank_ratio', 'unit_slow_ratio'];

function checkSheet_() {
  var out = [], problems = 0;
  var ss = ss_();
  Object.keys(EXPECTED_HEADERS).forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh && (tab === 'Report' || tab === 'Part_Log')) { out.push('· ' + tab + ': not created yet (created automatically: Report by rebuildAll, Part_Log when a part ends)'); return; }
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
      formData_(fid).questions.forEach(function (q) {
        var r = have[q.qid];
        if (!r) { missing++; return; }
        var k = Array.isArray(q.key) ? q.key.join('|') : String(q.key);
        if (String(r.key).trim() !== k) keyDiff.push(q.qid + ' sheet=' + r.key + ' data=' + k);
      });
      if (missing) out.push('! Questions tab: ' + missing + ' questions of ' + fid + ' not imported yet (run importQuestions)');
      else out.push('✓ Questions tab: all ' + formData_(fid).questions.length + ' questions of ' + fid + ' present');
      if (keyDiff.length) { out.push('✗ KEY DIFFERS sheet vs data (grading uses the data file): ' + keyDiff.join('; ')); problems++; }
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
    if (!sh) { log.push('skip ' + tab + ' (tab missing — create it by hand)'); return; }
    var have = headers_(tab);
    var lastUsed = 0; have.forEach(function (h, i) { if (h !== '') lastUsed = i + 1; });
    var missing = exp.filter(function (h) { return have.indexOf(h) < 0; });
    missing.forEach(function (h, k) {
      var col = lastUsed + 1 + k;
      if (col > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
      sh.getRange(1, col).setValue(h);
      log.push(tab + ': added column ' + h);
      var doc = NEW_COLUMN_DOCS[tab + '.' + h];
      var dict = readTable_('Dictionary');
      var exists = dict.rows.some(function (r) { return String(r.tab) === tab && String(r.column) === h; });
      if (!exists) appendObjects_('Dictionary', [{ tab: tab, column: h, 'ý nghĩa': doc ? doc[0] : '(cột mới)', 'ví dụ': doc ? doc[1] : '' }]);
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
    formData_(fid).questions.forEach(function (q) {
      var row = questionRow_(fid, q);
      var r = existing[q.qid];
      if (!r) { add.push(row); return; }
      ['key', 'unit', 'topic', 'difficulty', 'tag_status'].forEach(function (k) {
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
