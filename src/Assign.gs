/**
 * Test Zone — assign part of a form to one student (ticket #29, v1.10).
 *
 * Sheet tab Assignments (Minh fills it by hand): student_code · form · parts · active · note · class_id
 *   class_id (#44, optional): the row is for every member of that active class (Classes tab); student_code may be blank.
 *   parts: SAT RW (= RW1 + RW2), MATH (= M1 + M2), RW1, RW2, M1, M2 — several with a comma ("M1, M2"); AP A, B.
 *   active = Yes → the student sees an extra card at the top of My Tests; No → the card is gone (attempts are kept).
 *
 * An attempt of an assignment is a normal Sessions row with scope = its parts ("M1" / "RW1,RW2"); full tests have
 * scope "full" (blank in rows from before v1.10 = full). Everything that reads an attempt takes the profile through
 * profileOf_(session): the form's profile limited to those parts (title "SAT · August 2026 — Math Module 1", only those
 * parts, the section break only when both RW and Math parts are in it). Keys, autosave, one live window: unchanged.
 */

var ASSIGN_TAB = 'Assignments';
var ASSIGN_HEADERS = ['student_code', 'form', 'parts', 'active', 'note', 'class_id', 'due']; // due: #48 (optional date, shown on the home)
var PART_ALIASES_ = { RW: ['RW1', 'RW2'], MATH: ['M1', 'M2'] };
var PARTS_CHOICES_ = ['RW', 'MATH', 'RW1', 'RW2', 'M1', 'M2', 'M1, M2', 'RW1, M1', 'A', 'B'];

/** "M1, M2" / "math" / "RW" → ['M1', 'M2'] in the form's order. null when empty or a code does not fit this form. */
function parseParts_(profile, text) {
  if (!profile) return null;
  var all = profile.parts.map(function (p) { return p.part; }), want = {}, bad = false;
  String(text || '').toUpperCase().split(/[\s,;+\/&]+/).filter(String).forEach(function (c) {
    var list = isSat_(profile) && PART_ALIASES_[c] ? PART_ALIASES_[c] : [c];
    list.forEach(function (p) { if (all.indexOf(p) < 0) bad = true; else want[p] = 1; });
  });
  var out = all.filter(function (p) { return want[p]; });
  return bad || !out.length ? null : out;
}
/** parts → scope text: every part of the form = 'full', else 'M1' / 'RW1,RW2'. */
function scopeKey_(profile, parts) {
  return !parts || parts.length === profile.parts.length ? 'full' : parts.join(',');
}
/** Sessions.scope → 'full' or 'M1,M2' (blank = full: attempts from before v1.10). */
function scopeOf_(session) {
  var s = String((session && session.scope) || '').replace(/\s+/g, '').toUpperCase();
  return !s || s === 'FULL' ? 'full' : s;
}

/** "Math Module 1" · "Math" · "Reading and Writing Module 2 + Math" · AP "Part B" ('' for the full form). */
function scopeLabel_(profile, scope) {
  if (!profile || scope === 'full') return '';
  var keep = scope.split(',');
  if (profile.sections && profile.sections.length) {
    var bits = [];
    profile.sections.forEach(function (sec) {
      var inSec = sec.parts.filter(function (p) { return keep.indexOf(p) >= 0; });
      if (!inSec.length) return;
      var t = sec.title || SECTION_EN_[sec.id] || sec.id;
      if (inSec.length === sec.parts.length) bits.push(t);
      else inSec.forEach(function (p) { bits.push(t + ' Module ' + (sec.parts.indexOf(p) + 1)); });
    });
    return bits.join(' + ');
  }
  return keep.map(function (p) { return 'Part ' + p; }).join(' + ');
}

/** "Part: Math Module 1" (AP: "Part B") — the label in Student_Report, Topic_Summary and the Report tab. */
function partTag_(label) { return /^Part /.test(label) ? label : 'Part: ' + label; }

/** The form's profile limited to the scope's parts (a copy; the full profile when scope = full). */
function scopedProfile_(profile, scope) {
  if (!profile || !scope || scope === 'full') return profile;
  var keep = scope.split(','), full = profile.parts.map(function (p) { return p.part; });
  var p = JSON.parse(JSON.stringify(profile));
  p.parts = p.parts.filter(function (x) { return keep.indexOf(x.part) >= 0; });
  if (!p.parts.length) return profile;
  var brk = profile.parts.filter(function (x) { return Number(x.break_after_sec) > 0; })[0];
  p.parts.forEach(function (x, i) {
    var prevFull = full[full.indexOf(x.part) - 1], prevHere = i ? p.parts[i - 1].part : null;
    if (x.auto_start && prevFull !== prevHere) x.auto_start = false; // Module 2 without its Module 1: Directions + Begin
    x.break_after_sec = 0;
    delete x.pause_after;
  });
  if (p.sections && p.sections.length) {
    p.sections = p.sections.map(function (s) {
      var o = JSON.parse(JSON.stringify(s)); o.parts = s.parts.filter(function (x) { return keep.indexOf(x) >= 0; }); return o;
    }).filter(function (s) { return s.parts.length; });
    // the section break (and Save and Continue Later there) only when parts of both sections are assigned
    if (p.sections.length > 1 && brk) {
      var lastFirst = p.sections[0].parts[p.sections[0].parts.length - 1];
      p.parts.forEach(function (x) { if (x.part === lastFirst) { x.break_after_sec = brk.break_after_sec; if (brk.pause_after !== undefined) x.pause_after = brk.pause_after; } });
    }
  }
  p.routing = (p.routing || []).filter(function (r) { return keep.indexOf(r.from) >= 0; });
  p.n_total = p.parts.reduce(function (a, x) { return a + (Number(x.n) || 0); }, 0);
  p.scope = scope;
  p.scope_label = scopeLabel_(profile, scope);
  p.title = String(profile.title || profile.form_id || '') + ' — ' + p.scope_label;
  return p;
}

/** The profile of one attempt (limited to its parts). */
function profileOf_(session, noDrive) {
  return scopedProfile_(profileFor_(String(session.form_id), noDrive), scopeOf_(session));
}

/** Active assignments of one student: [{form_id, scope, parts, label, note}] (rows that do not fit a form are skipped). */
function assignmentsFor_(codeN) {
  var out = [], seen = {};
  var rows = [];
  try { rows = readTable_(ASSIGN_TAB).rows; } catch (e) { return out; }
  var inCls = {}; // #44: rows for a class → every member of the active class
  if (rows.some(function (r) { return String(r.class_id || '').trim(); })) classesOf_(codeN).forEach(function (c) { inCls[c.class_id.toUpperCase()] = 1; });
  rows.forEach(function (r) {
    var cid = String(r.class_id || '').trim().toUpperCase();
    if (!isYes_(r.active) || !(cid ? inCls[cid] : normCode_(r.student_code) === codeN)) return;
    var fid = String(r.form || '').trim(), prof = fid ? profileFor_(fid, true) : null;
    var parts = parseParts_(prof, r.parts);
    if (!parts) return;
    var scope = scopeKey_(prof, parts);
    if (seen[fid + '|' + scope]) return;
    seen[fid + '|' + scope] = 1;
    out.push({ form_id: fid, scope: scope, parts: parts, label: scopeLabel_(prof, scope), note: String(r.note || ''), due: dueOf_(r.due) });
  });
  return out;
}
function hasAssignment_(codeN, formId, scope) {
  return assignmentsFor_(codeN).some(function (a) { return a.form_id === formId && a.scope === scope; });
}

/** Sheet update step: the Assignments tab (created once with one example row, Minh (test), active = No) + its
 *  dropdowns (form ids, part codes, Yes / No, student codes) refreshed on every deploy. */
function ensureAssignments_() {
  var ss = ss_(), sh = ss.getSheetByName(ASSIGN_TAB), made = false;
  if (!sh) {
    sh = ss.insertSheet(ASSIGN_TAB);
    sh.getRange(1, 1, 1, ASSIGN_HEADERS.length).setValues([ASSIGN_HEADERS]);
    var test = null;
    try { test = readTable_('Students').rows.filter(function (r) { return /\(test\)/i.test(String(r.name)); })[0]; } catch (e) {}
    var sat = formIds_().filter(function (f) { var pf = profileFor_(f, true); return pf && isSat_(pf); })[0] || '';
    if (test && sat) sh.getRange(2, 1, 1, 5).setValues([[normCode_(test.student_code), sat, 'M1', 'No', 'Example: only Math Module 1. Set active to Yes to show it.']]);
    try { sh.setFrozenRows(1); sh.getRange(1, 1, 1, ASSIGN_HEADERS.length).setFontWeight('bold'); sh.setColumnWidth(5, 360); } catch (e) {}
    made = true;
  }
  var n = Math.max(sh.getMaxRows() - 1, 200);
  ensureGrid_(sh, n + 1, ASSIGN_HEADERS.length);
  var dv = function () { return SpreadsheetApp.newDataValidation(); };
  try {
    var stud = ss.getSheetByName('Students'), col = stud ? headers_('Students').indexOf('student_code') + 1 : 0;
    if (col) sh.getRange(2, 1, n, 1).setDataValidation(dv().requireValueInRange(stud.getRange(2, col, Math.max(stud.getMaxRows() - 1, 1), 1), true).setAllowInvalid(true).build());
    var forms = formIds_().length ? formIds_() : Object.keys(formRegistry_());
    sh.getRange(2, 2, n, 1).setDataValidation(dv().requireValueInList(forms, true).setAllowInvalid(false).build());
    sh.getRange(2, 3, n, 1).setDataValidation(dv().requireValueInList(PARTS_CHOICES_, true).setAllowInvalid(true)
      .setHelpText('SAT: RW, MATH, RW1, RW2, M1, M2 (several: M1, M2). AP: A, B.').build());
    sh.getRange(2, 4, n, 1).setDataValidation(dv().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build());
    var cls = classesAll_().map(function (c) { return c.class_id; }); // #44: optional class_id
    if (sh.getLastColumn() >= 6 && cls.length) sh.getRange(2, 6, n, 1).setDataValidation(dv().requireValueInList(cls, true).setAllowInvalid(true)
      .setHelpText('Optional: a class (tab Classes). The row is then for every member of the class; student_code can stay empty.').build());
  } catch (e) { console.warn('ASSIGNMENTS DROPDOWNS: ' + e); }
  return 'Assignments: ' + (made ? 'created' : 'kept') + ', dropdowns set';
}

/** checkSheet_ lines for the Assignments tab: rows that do not fit a form or a student. */
function checkAssignments_() {
  var out = [], problems = 0, rows = [];
  try { rows = readTable_(ASSIGN_TAB).rows; } catch (e) { return { lines: ['· Assignments: not created yet (created by the update after a deploy)'], problems: 0 }; }
  var codes = {}; try { readTable_('Students').rows.forEach(function (r) { codes[normCode_(r.student_code)] = 1; }); } catch (e) {}
  var act = 0;
  rows.forEach(function (r) {
    if (!String(r.student_code) && !String(r.form) && !String(r.parts) && !String(r.class_id || '')) return;
    var where = 'Assignments row ' + r._row + ': ';
    var prof = profileFor_(String(r.form || '').trim(), true);
    var cid = String(r.class_id || '').trim();
    if (cid) { var c = classById_(cid); if (!c) { out.push('✗ ' + where + 'class_id ' + cid + ' is not in Classes'); problems++; return; } if (!c.active) out.push('⚠ ' + where + 'class ' + cid + ' is archived (active = No): nobody gets this card'); }
    else if (!codes[normCode_(r.student_code)]) { out.push('✗ ' + where + 'student_code ' + r.student_code + ' is not in Students'); problems++; return; }
    if (!prof) { out.push('✗ ' + where + 'form ' + r.form + ' is not a form id'); problems++; return; }
    if (!parseParts_(prof, r.parts)) { out.push('✗ ' + where + 'parts "' + r.parts + '" do not fit ' + r.form + ' (' + (isSat_(prof) ? 'RW, MATH, RW1, RW2, M1, M2' : prof.parts.map(function (p) { return p.part; }).join(', ')) + ')'); problems++; return; }
    if (scopeKey_(prof, parseParts_(prof, r.parts)) === 'full') out.push('⚠ ' + where + 'parts "' + r.parts + '" = the whole form (Full test): only useful for a student whose track does not have ' + r.form + ' (others already see it)');
    if (isYes_(r.active)) act++;
  });
  out.unshift('· Assignments: ' + rows.length + ' rows, ' + act + ' active');
  return { lines: out, problems: problems };
}

/* ============================== #48 the Assign tab on the teacher page ============================== */
/** due cell → 'yyyy-MM-dd' ('' when blank / not a date). */
function dueOf_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') { try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return ''; } }
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v).replace(/^'/, '').trim());
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
/** The part choices of a form: whole test, each section (SAT), each part, same codes as the Assignments tab. */
function assignChoices_(prof) {
  var all = prof.parts.map(function (p) { return p.part; }), out = [{ v: isSat_(prof) ? 'RW, MATH' : all.join(', '), t: 'Whole test' }];
  if (isSat_(prof)) {
    (prof.sections || []).forEach(function (sec) { out.push({ v: sec.id === 'Math' ? 'MATH' : sec.id, t: sec.title || SECTION_EN_[sec.id] || sec.id }); });
    (prof.sections || []).forEach(function (sec) { sec.parts.forEach(function (p, i) { out.push({ v: p, t: (sec.title || SECTION_EN_[sec.id] || sec.id) + ' · Module ' + (i + 1) }); }); });
  } else all.forEach(function (p) { out.push({ v: p, t: 'Part ' + p }); });
  return out.filter(function (c) { return parseParts_(prof, c.v); });
}
/** Everything the Assign tab shows: forms + part choices, students, classes, the rows of the Assignments tab. */
function teacherAssignData(code) {
  requireTeacher_(code);
  if (!ss_().getSheetByName(ASSIGN_TAB)) ensureAssignments_();
  var forms = formIds_().map(function (f) { var pf = profileFor_(f, true); return pf ? { form_id: f, title: String(pf.title || f), choices: assignChoices_(pf) } : null; }).filter(Boolean);
  var students = []; try { students = readTable_('Students').rows.filter(function (r) { return String(r.student_code).trim() && isYes_(r.active); })
    .map(function (r) { return { code: normCode_(r.student_code), name: String(r.name || r.student_code), track: String(r.track || '') }; }); } catch (e) {}
  var names = studentNames_(), cls = classesAll_();
  var rows = readTable_(ASSIGN_TAB).rows.filter(function (r) { return String(r.form || '').trim() && (String(r.student_code || '').trim() || String(r.class_id || '').trim()); }).map(function (r) {
    var pf = profileFor_(String(r.form).trim(), true), parts = pf ? parseParts_(pf, r.parts) : null, cid = String(r.class_id || '').trim(), c = cid ? classById_(cid) : null;
    return { row: r._row, form_id: String(r.form).trim(), form_title: pf ? String(pf.title || r.form) : String(r.form), parts: String(r.parts || ''),
             label: parts ? (scopeKey_(pf, parts) === 'full' ? 'Whole test' : scopeLabel_(pf, scopeKey_(pf, parts))) : String(r.parts || '') + ' (does not fit)',
             who: cid ? (c ? c.name : cid) + ' (class)' : (names[normCode_(r.student_code)] || String(r.student_code)), class_id: cid, student_code: cid ? '' : normCode_(r.student_code),
             active: isYes_(r.active), note: String(r.note || ''), due: dueOf_(r.due) };
  });
  return { ok: true, forms: forms, students: students, classes: cls.filter(function (c) { return c.active; }).map(function (c) { return { class_id: c.class_id, name: c.name, n: c.codes.length }; }), rows: rows };
}
/** spec {form_id, parts, codes: [...], class_id, due, note} → one row per student, or one row for the class (class_id). */
function teacherAssign(code, spec) {
  requireTeacher_(code);
  spec = spec || {};
  var fid = String(spec.form_id || '').trim(), pf = fid ? profileFor_(fid, true) : null;
  if (!pf) return { ok: false, msg: 'Pick a test.' };
  var parts = parseParts_(pf, spec.parts);
  if (!parts) return { ok: false, msg: 'Pick the parts.' };
  var names = studentNames_(), cid = String(spec.class_id || '').trim(), c = cid ? classById_(cid) : null;
  var codes = cid ? [] : (spec.codes || []).map(normCode_).filter(function (x, i, a) { return x && names[x] && a.indexOf(x) === i; });
  if (cid && !c) return { ok: false, msg: 'Class not found.' };
  if (!cid && !codes.length) return { ok: false, msg: 'Pick at least one student or a class.' };
  var due = dueOf_(spec.due), note = String(spec.note || '').trim().slice(0, 200), scope = scopeKey_(pf, parts);
  if (spec.due && !due) return { ok: false, msg: 'The due date is not a date.' };
  if (!ss_().getSheetByName(ASSIGN_TAB)) ensureAssignments_();
  var have = {}; readTable_(ASSIGN_TAB).rows.forEach(function (r) {
    if (!isYes_(r.active) || String(r.form).trim() !== fid) return;
    var p2 = parseParts_(pf, r.parts); if (!p2 || scopeKey_(pf, p2) !== scope) return;
    have[String(r.class_id || '').trim() ? 'C:' + String(r.class_id).trim().toUpperCase() : 'S:' + normCode_(r.student_code)] = 1;
  });
  var partsText = scope === 'full' ? (isSat_(pf) ? 'RW, MATH' : parts.join(', ')) : String(spec.parts).toUpperCase().split(/[\s,;+\/&]+/).filter(String).join(', '); // the code the teacher picked (RW, MATH, M1 …)
  var rows = [], skipped = [];
  if (c) { if (have['C:' + c.class_id.toUpperCase()]) skipped.push(c.name); else rows.push({ student_code: '', form: fid, parts: partsText, active: 'Yes', note: note, class_id: c.class_id, due: txt_(due) }); }
  codes.forEach(function (x) { if (have['S:' + x]) skipped.push(names[x]); else rows.push({ student_code: x, form: fid, parts: partsText, active: 'Yes', note: note, class_id: '', due: txt_(due) }); });
  if (rows.length) appendObjects_(ASSIGN_TAB, rows);
  return { ok: true, n: rows.length, skipped: skipped };
}
/** Turn an Assignments row off (active = No; the student's attempts stay under "Past assignments") or on again. */
function teacherSetAssignment(code, row, active) {
  requireTeacher_(code);
  var r = readTable_(ASSIGN_TAB).rows.filter(function (x) { return x._row === Number(row); })[0];
  if (!r || !String(r.form || '').trim()) return { ok: false, msg: 'Assignment not found.' };
  updateRow_(ASSIGN_TAB, r._row, { active: active ? 'Yes' : 'No' });
  return { ok: true };
}
