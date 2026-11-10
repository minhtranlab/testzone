/**
 * Test Zone — time per question by question type + difficulty (ticket #24 F; norms from SC #23, FINAL 2026-11-10).
 * A question is "Rushed" when the time on it is below fast_below_sec, "Slow" above slow_above_sec. The norms are in the
 * Sheet tab Time_Norms (created once from TimeNorms.gs; Minh may edit it). Lookup:
 *   SAT RW    → (RW, skill code = topic, difficulty, mcq)
 *   SAT Math  → (Math, *, difficulty, mcq | spr)
 *   AP        → (APCAB, Part + part, difficulty, mcq)
 * No matching row → the old rule (part time / questions × fast_ratio / slow_ratio from Settings).
 */
var TIME_NORMS_TAB = 'Time_Norms';
var _timeNorms = null;

function ensureTimeNorms_() {
  var ss = ss_(), sh = ss.getSheetByName(TIME_NORMS_TAB);
  if (sh && sh.getLastRow() > 1) return 'Time_Norms: kept (exists)';
  if (!sh) sh = ss.insertSheet(TIME_NORMS_TAB);
  var rows = TIME_NORMS_DEFAULT_.map(function (r, i) {
    return i === 0 ? r : r.map(function (v, j) { return j >= 4 ? Number(v) : (typeof v === 'string' && /^[=+\-*]/.test(v) ? "'" + v : v); });
  });
  ensureGrid_(sh, rows.length + 5, rows[0].length);
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  try { sh.setFrozenRows(1); sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold'); } catch (e) {}
  _timeNorms = null;
  return 'Time_Norms: created (' + (rows.length - 1) + ' rows)';
}

/** key "section|skill|difficulty|qtype" → { target, fast, slow } (seconds) */
function timeNorms_() {
  if (_timeNorms) return _timeNorms;
  var rows = null;
  try {
    var sh = ss_().getSheetByName(TIME_NORMS_TAB);
    if (sh && sh.getLastRow() > 1) rows = readTable_(TIME_NORMS_TAB).rows;
  } catch (e) { rows = null; }
  if (!rows) {
    var h = TIME_NORMS_DEFAULT_[0];
    rows = TIME_NORMS_DEFAULT_.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }
  var m = {};
  rows.forEach(function (r) {
    var t = Number(r.target_sec), f = Number(r.fast_below_sec), s = Number(r.slow_above_sec);
    if (!(t > 0) || isNaN(f) || isNaN(s)) return;
    var k = [r.section, r.skill, r.difficulty, r.qtype].map(function (x) { return String(x === undefined ? '' : x).replace(/^'/, '').trim(); }).join('|');
    m[k] = { target: t, fast: f, slow: s };
  });
  return (_timeNorms = m);
}

/** The norm of one question: sat = SAT form, part = its part id, type = 'mcq' | 'spr', tg = its tags. null = none. */
function timeNormFor_(sat, part, type, tg) {
  tg = tg || {};
  var m = timeNorms_(), d = String(tg.difficulty || 'M').toUpperCase().charAt(0) || 'M';
  var qt = String(type || 'mcq') === 'spr' ? 'spr' : 'mcq';
  var sec = !sat ? 'APCAB' : (/^RW/.test(String(part)) ? 'RW' : 'Math');
  var skill = !sat ? 'Part' + String(part).charAt(0) : (sec === 'RW' ? String(tg.topic || '') : '*');
  return m[[sec, skill, d, qt].join('|')] || m[[sec, skill, d, 'mcq'].join('|')] || null;
}

/** Right / wrong + time → the question's type (RIGHT, SLOW_RIGHT, FAST_WRONG, SLOW_WRONG, WRONG, BLANK) and pace_ratio. */
function timeProfile_(answered, correct, timeSec, norm, pace, S) {
  var ratio, fast, slow;
  if (norm) { ratio = timeSec / norm.target; fast = timeSec < norm.fast; slow = timeSec > norm.slow; }
  else { ratio = timeSec / (pace || 1); fast = ratio < S.fast_ratio; slow = ratio > S.slow_ratio; }
  var p;
  if (!answered) p = 'BLANK';
  else if (!correct) p = fast ? 'FAST_WRONG' : (slow ? 'SLOW_WRONG' : 'WRONG');
  else p = slow ? 'SLOW_RIGHT' : 'RIGHT';
  return { profile: p, ratio: ratio };
}
