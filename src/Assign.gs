/**
 * Test Zone — assign part of a form to one student (ticket #29, v1.10).
 *
 * Sheet tab Assignments (Minh fills it by hand): student_code · form · parts · active · note
 *   parts: SAT RW (= RW1 + RW2), MATH (= M1 + M2), RW1, RW2, M1, M2 — several with a comma ("M1, M2"); AP A, B.
 *   active = Yes → the student sees an extra card at the top of My Tests; No → the card is gone (attempts are kept).
 *
 * An attempt of an assignment is a normal Sessions row with scope = its parts ("M1" / "RW1,RW2"); full tests have
 * scope "full" (blank in rows from before v1.10 = full). Everything that reads an attempt takes the profile through
 * profileOf_(session): the form's profile limited to those parts (title "SAT · August 2026 — Math Module 1", only those
 * parts, the section break only when both RW and Math parts are in it). Keys, autosave, one live window: unchanged.
 */

var ASSIGN_TAB = 'Assignments';
var ASSIGN_HEADERS = ['student_code', 'form', 'parts', 'active', 'note'];
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
  rows.forEach(function (r) {
    if (normCode_(r.student_code) !== codeN || !isYes_(r.active)) return;
    var fid = String(r.form || '').trim(), prof = fid ? profileFor_(fid, true) : null;
    var parts = parseParts_(prof, r.parts);
    if (!parts) return;
    var scope = scopeKey_(prof, parts);
    if (seen[fid + '|' + scope]) return;
    seen[fid + '|' + scope] = 1;
    out.push({ form_id: fid, scope: scope, parts: parts, label: scopeLabel_(prof, scope), note: String(r.note || '') });
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
    var sat = formIds_().filter(function (f) { return /^SAT/.test(f); })[0] || formIds_()[0] || '';
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
    if (!String(r.student_code) && !String(r.form) && !String(r.parts)) return;
    var where = 'Assignments row ' + r._row + ': ';
    var prof = profileFor_(String(r.form || '').trim(), true);
    if (!codes[normCode_(r.student_code)]) { out.push('✗ ' + where + 'student_code ' + r.student_code + ' is not in Students'); problems++; return; }
    if (!prof) { out.push('✗ ' + where + 'form ' + r.form + ' is not a form id'); problems++; return; }
    if (!parseParts_(prof, r.parts)) { out.push('✗ ' + where + 'parts "' + r.parts + '" do not fit ' + r.form + ' (' + (isSat_(prof) ? 'RW, MATH, RW1, RW2, M1, M2' : prof.parts.map(function (p) { return p.part; }).join(', ')) + ')'); problems++; return; }
    if (isYes_(r.active)) act++;
  });
  out.unshift('· Assignments: ' + rows.length + ' rows, ' + act + ' active');
  return { lines: out, problems: problems };
}
