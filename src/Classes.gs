/**
 * Test Zone — classes: review a mock test with 2+ students at once (ticket #44 part 1, v1.15). Idea from SAT Math Lib's
 * class feature; the data stays in this Sheet.
 *
 * Sheet tab Classes: class_id · name · student_codes (comma list) · active (Yes / No) · note
 *   - made by typing in the Sheet OR on the teacher page ("Classes" → New class); a student may be in several classes;
 *   - active = No = archived (kept; the teacher page shows it under "Show archived" with Restore);
 *   - Students.classes = read-only mirror ("2CE, Math B"), rewritten after each change (teacher page, Sheet edit, update).
 * Assignments.class_id (optional): the row assigns its parts to every member of an active class (student_code may be blank).
 *
 * Teacher page → Classes → class screen: pick a form (and a part) → each member's latest attempt on it (or a picked one)
 *   "What to go over": one row per question, most members wrong first → slow-wrong → rushed-wrong → slow-right; right and
 *   fast last; "Grid": questions × members (answer, ✓ / ✗, R / S, time to answer) + each member's module times.
 * Hidden attempts (#32) are left out. Members who did not take the form / part: "not taken". Keys only through
 * "Show answer" (teacherFormAnswer), teacher code required for every call here.
 */

var CLASS_TAB = 'Classes';
var CLASS_HEADERS = ['class_id', 'name', 'student_codes', 'active', 'note'];

/** Classes rows → [{class_id, name, codes: ['QUYNHANH…'], active, note, _row}] (rows without members or id skipped). */
function classesAll_() {
  var rows = [];
  try { rows = readTable_(CLASS_TAB).rows; } catch (e) { return []; }
  var seen = {};
  return rows.map(function (r) {
    var id = String(r.class_id || '').trim() || String(r.name || '').trim();
    var codes = String(r.student_codes || '').split(/[\s,;]+/).map(normCode_).filter(String);
    var uniq = codes.filter(function (c, i) { return codes.indexOf(c) === i; });
    return { class_id: id, name: String(r.name || '').trim() || id, codes: uniq, active: String(r.active || '').trim() === '' ? true : isYes_(r.active),
             note: String(r.note || ''), _row: r._row };
  }).filter(function (c) {
    var k = c.class_id.toUpperCase();
    if (!c.class_id || seen[k]) return false;
    seen[k] = 1; return true;
  });
}
function classById_(id) {
  var k = String(id || '').trim().toUpperCase();
  return classesAll_().filter(function (c) { return c.class_id.toUpperCase() === k; })[0] || null;
}
/** Active classes of one student (codeN normalised). */
function classesOf_(codeN) { return classesAll_().filter(function (c) { return c.active && c.codes.indexOf(codeN) >= 0; }); }

/** Students.classes = the names of the student's active classes (read-only mirror). Returns the number of cells changed. */
function syncClassMirror_() {
  var t;
  try { t = readTable_('Students'); } catch (e) { return 0; }
  var col = t.headers.indexOf('classes');
  if (col < 0) return 0;
  var by = {};
  classesAll_().forEach(function (c) { if (c.active) c.codes.forEach(function (code) { (by[code] = by[code] || []).push(c.class_id); }); });
  var n = 0;
  t.rows.forEach(function (r) {
    var want = (by[normCode_(r.student_code)] || []).join(', ');
    if (String(r.classes || '') !== want) { t.sh.getRange(r._row, col + 1).setValue(want); n++; }
  });
  return n;
}

/** Sheet update step: the Classes tab (created once, empty) + dropdowns; Students.classes mirror refreshed. */
function ensureClasses_() {
  var ss = ss_(), sh = ss.getSheetByName(CLASS_TAB), made = false;
  if (!sh) {
    sh = ss.insertSheet(CLASS_TAB);
    sh.getRange(1, 1, 1, CLASS_HEADERS.length).setValues([CLASS_HEADERS]);
    try { sh.setFrozenRows(1); sh.getRange(1, 1, 1, CLASS_HEADERS.length).setFontWeight('bold'); sh.setColumnWidth(3, 320); sh.setColumnWidth(5, 300); } catch (e) {}
    made = true;
  }
  var n = Math.max(sh.getMaxRows() - 1, 100);
  ensureGrid_(sh, n + 1, CLASS_HEADERS.length);
  try {
    sh.getRange(2, 4, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build());
  } catch (e) { console.warn('CLASSES DROPDOWNS: ' + e); }
  var m = syncClassMirror_();
  return 'Classes: ' + (made ? 'created' : 'kept') + ', ' + classesAll_().length + ' classes, mirror ' + m + ' cells';
}

/** checkSheet_ lines: unknown student codes in a class. */
function checkClasses_() {
  var out = [], problems = 0, cls = classesAll_();
  if (!ss_().getSheetByName(CLASS_TAB)) return { lines: ['· Classes: not created yet (created by the update after a deploy)'], problems: 0 };
  var codes = {}; try { readTable_('Students').rows.forEach(function (r) { codes[normCode_(r.student_code)] = 1; }); } catch (e) {}
  cls.forEach(function (c) {
    var bad = c.codes.filter(function (x) { return !codes[x]; });
    if (bad.length) { out.push('✗ Classes row ' + c._row + ' (' + c.class_id + '): ' + bad.join(', ') + ' not in Students'); problems++; }
    if (!c.codes.length) out.push('⚠ Classes row ' + c._row + ' (' + c.class_id + '): no student codes');
  });
  out.unshift('· Classes: ' + cls.length + ' classes, ' + cls.filter(function (c) { return c.active; }).length + ' active');
  return { lines: out, problems: problems };
}

/* ============================== teacher calls ============================== */

function studentNames_() {
  var m = {};
  try { readTable_('Students').rows.forEach(function (r) { m[normCode_(r.student_code)] = String(r.name || r.student_code); }); } catch (e) {}
  return m;
}
function classSessions_(codes) {
  return readTable_('Sessions').rows.filter(function (s) { return isFinished_(s) && !isHidden_(s) && codes.indexOf(normCode_(s.student_code)) >= 0; })
    .sort(function (a, b) { return (toMs_(b.submitted_at) - toMs_(a.submitted_at)) || ((Number(b.attempt_no) || 0) - (Number(a.attempt_no) || 0)); });
}

/** Classes list: name, members, last activity (latest submitted, not hidden attempt of a member). */
function teacherClasses(code) {
  requireTeacher_(code);
  var names = studentNames_(), all = classesAll_();
  var sess = classSessions_([].concat.apply([], all.map(function (c) { return c.codes; })));
  var students = Object.keys(names).map(function (c) { return { code: c, name: names[c] }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { ok: true, students: students, classes: all.map(function (c) {
    var last = sess.filter(function (s) { return c.codes.indexOf(normCode_(s.student_code)) >= 0; })[0];
    return { class_id: c.class_id, name: c.name, active: c.active, note: c.note,
             members: c.codes.map(function (x) { return { code: x, name: names[x] || x, known: !!names[x] }; }),
             last: last ? { date: dateStr_(last.submitted_at), who: names[normCode_(last.student_code)] || normCode_(last.student_code) } : null };
  }).sort(function (a, b) { return (b.active - a.active) || a.name.localeCompare(b.name); }) };
}

/** New class from the teacher page: {name, codes:[…], note}. class_id = the name without spaces (unique). */
function teacherCreateClass(code, spec) {
  requireTeacher_(code);
  spec = spec || {};
  var name = String(spec.name || '').trim().slice(0, 60);
  var names = studentNames_();
  var codes = (spec.codes || []).map(normCode_).filter(function (c, i, a) { return c && names[c] && a.indexOf(c) === i; });
  if (!name) return { ok: false, msg: 'Type a class name.' };
  if (!codes.length) return { ok: false, msg: 'Pick at least one student.' };
  if (!ss_().getSheetByName(CLASS_TAB)) ensureClasses_();
  var base = name.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9_\-]/g, '') || 'CLASS', id = base, k = 2;
  var taken = {}; classesAll_().forEach(function (c) { taken[c.class_id.toUpperCase()] = 1; });
  while (taken[id]) id = base + '-' + (k++);
  appendObjects_(CLASS_TAB, [{ class_id: id, name: name, student_codes: codes.join(', '), active: 'Yes', note: String(spec.note || 'Made on the teacher page').slice(0, 200) }]);
  syncClassMirror_();
  return { ok: true, class_id: id };
}

/** Archive (active = No) / restore (Yes). */
function teacherSetClassActive(code, classId, active) {
  requireTeacher_(code);
  var c = classById_(classId);
  if (!c) return { ok: false, msg: 'Class not found.' };
  updateRow_(CLASS_TAB, c._row, { active: active ? 'Yes' : 'No' });
  syncClassMirror_();
  return { ok: true };
}

/**
 * The class screen data. opts: {form_id, part ('' = all parts), picks: {CODE: session_id}}.
 * → forms (any member finished, not hidden), parts of the form, members (chosen attempt, the others to pick from,
 *   module times), questions in "What to go over" order with one cell per member.
 */
function classData_(cls, opts) {
  opts = opts || {};
  var names = studentNames_(), sess = classSessions_(cls.codes);
  var forms = {};
  sess.forEach(function (s) {
    var f = String(s.form_id);
    if (!regEntry_(f)) return;
    var x = forms[f] = forms[f] || { form_id: f, who: {}, last: 0 };
    x.who[normCode_(s.student_code)] = 1; x.last = Math.max(x.last, toMs_(s.submitted_at));
  });
  var formList = Object.keys(forms).map(function (f) { var e = regEntry_(f); return { form_id: f, title: formTitle_(e.profile, f), n: Object.keys(forms[f].who).length, last: forms[f].last }; })
    .sort(function (a, b) { return (b.n - a.n) || (b.last - a.last); });
  var out = { class_id: cls.class_id, name: cls.name, active: cls.active, forms: formList.map(function (f) { return { form_id: f.form_id, title: f.title, n: f.n }; }) };
  var formId = opts.form_id && forms[opts.form_id] ? opts.form_id : (formList[0] || {}).form_id;
  if (!formId) { out.members = cls.codes.map(function (c) { return { code: c, name: names[c] || c, taken: false }; }); out.questions = []; return out; }
  var prof = profileFor_(formId, true), sat = isSat_(prof), fd = formData_(formId);
  var allParts = prof.parts.map(function (p) { return p.part; });
  var sel = opts.part && allParts.indexOf(opts.part) >= 0 ? [opts.part] : allParts;
  out.form_id = formId; out.form_title = formTitle_(prof, formId); out.sat = sat; out.part = sel.length === 1 && allParts.length > 1 ? sel[0] : '';
  var secOf = function (pt) { var x = (prof.sections || []).filter(function (z) { return z.parts.indexOf(pt) >= 0; })[0]; return x ? x.id : pt; };
  out.parts = prof.parts.map(function (p) { return { part: p.part, title: partTitleShort_(prof, p.part, sat), sec: sat ? secOf(p.part) : p.part }; });
  // #46: section switch "All · Reading and Writing · Math" (AP: the form's parts; none with one part)
  out.sections = sat ? (prof.sections || []).map(function (x) { return { id: x.id, title: x.id === 'RW' ? 'Reading and Writing' : (x.title || x.id) }; })
                     : prof.parts.map(function (p) { return { id: p.part, title: 'Part ' + p.part }; });
  var picks = opts.picks || {};
  var chosen = {}; // code → session
  out.members = cls.codes.map(function (c) {
    var mine = sess.filter(function (s) { return normCode_(s.student_code) === c && String(s.form_id) === formId &&
      scopePartsOf_(s, allParts).some(function (p) { return sel.indexOf(p) >= 0; }); });
    var pick = mine.filter(function (s) { return String(s.session_id) === String(picks[c] || ''); })[0] || mine[0];
    var m = { code: c, name: names[c] || c, taken: !!pick,
              attempts: mine.map(function (s) { return { session_id: String(s.session_id), label: '#' + (Number(s.attempt_no) || 1) + ' · ' + dateStr_(s.submitted_at) +
                (scopeOf_(s) === 'full' ? '' : ' · ' + scopeLabel_(prof, scopeOf_(s))) }; }) };
    if (pick) { chosen[c] = pick; m.session_id = String(pick.session_id); }
    return m;
  });
  // Responses of the chosen attempts (one read)
  var sids = {}; Object.keys(chosen).forEach(function (c) { sids[String(chosen[c].session_id)] = c; });
  var resp = {}; // code → qid → row
  readTable_('Responses').rows.forEach(function (r) { var c = sids[String(r.session_id)]; if (c) (resp[c] = resp[c] || {})[String(r.qid)] = r; });
  // module times per member (#40 B) for the selected parts of their attempt
  out.members.forEach(function (m) {
    if (!m.taken) return;
    var s = chosen[m.code], have = scopePartsOf_(s, allParts);
    m.modules = prof.parts.filter(function (p) { return sel.indexOf(p.part) >= 0 && have.indexOf(p.part) >= 0; }).map(function (p) {
      var rows = Object.keys(resp[m.code] || {}).map(function (k) { return resp[m.code][k]; }).filter(function (r) { return String(r.part) === p.part; });
      var t = moduleTimes_(rows, p.time_limit_sec, partUsedSec_(s, p.part, p.time_limit_sec));
      t.part = p.part; t.title = partTitleShort_(prof, p.part, sat);
      t.right = rows.filter(function (r) { return Number(r.correct) === 1; }).length; t.n = rows.length;
      var igc = integrityCell_(s), x = igc && igc[p.part]; // #44 part 2: "Left the test" column
      var it = integrityText_(x, function () { return ''; }, flagSec_(getSettings_())); // #46: only leaves ≥ leave_flag_sec
      t.left_ig = x ? (it.long.length ? it.long.length + '× · ' + durText_(it.long.reduce(function (a2, l) { return a2 + l.sec; }, 0)) : '') + (x.copy || x.ctx ? (it.long.length ? ' · ' : '') + 'copy ' + x.copy + ' · right-click ' + x.ctx : '') : '—';
      return t;
    });
  });
  var longQ = {}, fsec = flagSec_(getSettings_()); // member → qid → left ≥ leave_flag_sec on it (#46)
  Object.keys(chosen).forEach(function (c) {
    var igc = integrityCell_(chosen[c]); longQ[c] = {};
    if (igc) Object.keys(igc).forEach(function (pp) { integrityText_(igc[pp], function () { return ''; }, fsec).long.forEach(function (l) { if (l.qid) longQ[c][l.qid] = 1; }); });
  });
  var tn = topicNamesNoDrive_(formId, fd);
  var qs = (fd ? fd.questions : []).filter(function (q) { return sel.indexOf(q.part) >= 0; })
    .sort(function (a, b) { return (allParts.indexOf(a.part) - allParts.indexOf(b.part)) || (a.display_no - b.display_no); });
  out.questions = qs.map(function (q, i) {
    var topic = String((q.tags || {}).topic || '');
    var o = { qid: q.qid, part: q.part, no: q.display_no, code: qCode_(q.part, q.display_no, sat), topic: topic, skill: tn[topic] || (q.tags || {}).topic_name || '', order: i,
              cells: {}, wrong: 0, slow_wrong: 0, rushed_wrong: 0, slow_right: 0, taken: 0 };
    out.members.forEach(function (m) {
      var s = chosen[m.code], r = resp[m.code] && resp[m.code][q.qid];
      if (!s || scopePartsOf_(s, allParts).indexOf(q.part) < 0 || !r) { o.cells[m.code] = { st: 'none' }; return; }
      var p = String(r.profile), st = qStatus_(p), ta = taOf_(r);
      o.cells[m.code] = { st: st, a: answerText_(r.final_answer), b: qBadge_(p), p: p, ta: ta === null ? null : Math.round(ta), tot: Math.round(Number(r.time_total_sec) || 0) };
      var lf = Number(r.left_sec) || 0; // #44; #46: only a leave ≥ leave_flag_sec
      if (lf > 0 && longQ[m.code] && longQ[m.code][q.qid]) { o.cells[m.code].left = Math.round(lf); if (/LEFT_THEN_RIGHT/.test(String(r.flags || ''))) o.cells[m.code].lf = true; }
      o.taken++;
      if (st !== 'right') o.wrong++;
      if (p === 'SLOW_WRONG') o.slow_wrong++;
      if (p === 'FAST_WRONG') o.rushed_wrong++;
      if (p === 'SLOW_RIGHT') o.slow_right++;
    });
    return o;
  });
  out.order = out.questions.slice().sort(goOverCmp_).map(function (q) { return q.qid; });
  return out;
}
/** "What to go over" order: most members wrong (or blank) → slow-wrong → rushed-wrong → slow-right → test order. */
function goOverCmp_(a, b) {
  return (b.wrong - a.wrong) || (b.slow_wrong - a.slow_wrong) || (b.rushed_wrong - a.rushed_wrong) || (b.slow_right - a.slow_right) || (a.order - b.order);
}
/** Parts of an attempt (its scope) in the form's order. */
function scopePartsOf_(s, allParts) { var sc = scopeOf_(s); return sc === 'full' ? allParts.slice() : sc.split(',').filter(function (p) { return allParts.indexOf(p) >= 0; }); }
/** "RW Module 1" / "Math Module 2" / "Part A". */
function partTitleShort_(prof, part, sat) {
  if (!sat || !prof.sections) return 'Part ' + part;
  var sec = prof.sections.filter(function (x) { return x.parts.indexOf(part) >= 0; })[0];
  if (!sec) return 'Part ' + part;
  return (sec.id === 'RW' ? 'RW' : (sec.title || sec.id)) + ' Module ' + (sec.parts.indexOf(part) + 1);
}
function topicNamesNoDrive_(formId, fd) {
  var names = {};
  if (fd) fd.questions.forEach(function (q) { if (q.tags && q.tags.topic) names[String(q.tags.topic)] = q.tags.topic_name || ''; });
  try { readTable_('Questions').rows.forEach(function (q) { if (q.topic && q.topic_name && String(q.form_id) === formId && typeof q.topic === 'string') names[q.topic] = String(q.topic_name); }); } catch (e) {}
  return names;
}

function requireClass_(classId) {
  var c = classById_(classId);
  if (!c) throw new Error('SESSION: Class not found.');
  return c;
}
function teacherClassView(code, classId, opts) {
  requireTeacher_(code);
  var d = classData_(requireClass_(classId), opts);
  d.ok = true;
  return d;
}

/** The class screen → one question: the questions of the form part as in the test (no key) + each member's answer. */
function teacherClassReview(code, classId, opts) {
  requireTeacher_(code);
  var d = classData_(requireClass_(classId), opts);
  if (!d.form_id) throw new Error('SESSION: No attempt in this class yet.');
  var fd = formData_(d.form_id), prof = profileFor_(d.form_id);
  if (!fd) throw new Error('FORM: This test is not available.');
  var want = {}; d.questions.forEach(function (q) { want[q.qid] = q; });
  var parts = prof.parts.filter(function (p) { return d.questions.some(function (q) { return q.part === p.part; }); }).map(function (p) {
    return { part: p.part, title: p.title, layout: p.layout || 'single', spr_layout: p.spr_layout || '', choices: p.choices || 5,
             calculator: !!p.calculator, reference: !!p.reference, annotate: p.annotate !== false, directions_html: p.directions_html || '' };
  });
  var qs = fd.questions.filter(function (q) { return want[q.qid]; }).map(function (q) {
    var w = want[q.qid], o = clientQuestion_(q);
    o.answer = ''; o.status = 'class'; o.code = w.code;
    o.members = d.members.map(function (m) { var c = w.cells[m.code] || { st: 'none' }; return { name: m.name, st: c.st, a: c.a || '', b: c.b || '', ta: c.ta, tot: c.tot, left: c.left, lf: !!c.lf }; });
    return o;
  });
  addSkills_(d.form_id, qs); // "Nonlinear functions (P.C)" on the question bar
  var keys = {}; fd.questions.forEach(function (q) { if (want[q.qid]) keys[q.qid] = keyShow_(q); }); // #52: SPR = typeable forms // #46: Show answer with no wait
  return { ok: true, answer_keys: keys, class_id: d.class_id, class_name: d.name, form_id: d.form_id, title: formTitle_(prof, d.form_id), parts: parts, questions: qs,
           question_font: prof.question_font || '', reference_sheet: prof.reference_sheet || '', reference_html: prof.reference_html || '',
           annotate_label: prof.annotate_label || '', settings: { desmos_api_key: desmosKey_() } };
}

/** "Show answer" on the class screen (no attempt needed): the key of one question of a form. */
function teacherFormAnswer(code, formId, qid) {
  requireTeacher_(code);
  var fd = formData_(String(formId));
  var q = fd && fd.questions.filter(function (x) { return x.qid === String(qid); })[0];
  if (!q) throw new Error('SESSION: Question not found.');
  return { ok: true, qid: q.qid, type: q.type || 'mcq', key: keyShow_(q) }; // #52
}
