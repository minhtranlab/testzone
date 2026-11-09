/**
 * Test Zone — SAT estimated score range (ticket #2 "SC", FINAL agreed with Minh 2026-11-09; ticket #3 task 4).
 *
 * for each section s (RW: M1 of 27 + M2 of 27, Math: 22 + 22):
 *   x     = w_m1*M1 + w_m2*max(M2, m2_min_ratio*M1)      Module 2 counts more and never pulls the score down
 *   est   = interpolate(hard-route table of s, x)
 *   if M1 < m1_good[s]: est = min(est, m1_weak_cap)      note "Module 1 below the hard-route level"
 *   else if M2 < m2_floor[s]:                            note "Module 2 not counted"
 *   shown = round10(est), range shown ± half_width_section (clamped 200..800)
 * total = round10(est_RW + est_Math) ± half_width_total (clamped 400..1600)
 *
 * Numbers come from the Sheet tab Score_Scale (Minh may edit): the scale table (route, section, raw, scaled_est …) in
 * columns A:L and the rules (key, value, meaning) in columns N:P. ScoreScale.gs holds the same content as a fallback and
 * is what ensureScoreScale_() writes when the tab does not exist yet. These are estimates from public sources, not an
 * official College Board conversion; the result page says so.
 */

var SCORE_SCALE_TAB = 'Score_Scale';
var SCALE_COL0 = 1, RULES_COL0 = 14; // A and N

var _scoreScale = null;
/** {rules: {key: number}, hard: {RW: [scaled_est by raw], Math: […]}} */
function scoreScale_() {
  if (_scoreScale) return _scoreScale;
  var scale = SCORE_SCALE_DEFAULT_.scale, rules = SCORE_SCALE_DEFAULT_.rules;
  try {
    var sh = ss_().getSheetByName(SCORE_SCALE_TAB);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), RULES_COL0 + 2)).getValues();
      var sc = v.map(function (r) { return r.slice(SCALE_COL0 - 1, SCALE_COL0 - 1 + 12); }).filter(function (r) { return String(r[0]) !== ''; });
      var ru = v.map(function (r) { return r.slice(RULES_COL0 - 1, RULES_COL0 + 2); }).filter(function (r) { return String(r[0]) !== ''; });
      if (sc.length > 1 && String(sc[0][0]) === 'route') scale = sc;
      if (ru.length > 1 && String(ru[0][0]) === 'key') rules = ru;
    }
  } catch (e) { console.warn('Score_Scale tab not readable, defaults used: ' + e); }
  var R = {};
  rules.slice(1).forEach(function (r) { R[String(r[0]).trim()] = Number(r[1]); });
  var h = scale[0].map(String), iRoute = h.indexOf('route'), iSec = h.indexOf('section'), iRaw = h.indexOf('raw'), iEst = h.indexOf('scaled_est');
  var hard = { RW: [], Math: [] };
  scale.slice(1).forEach(function (r) {
    if (String(r[iRoute]) !== 'hard' || !hard[String(r[iSec])]) return;
    hard[String(r[iSec])][Number(r[iRaw])] = Number(r[iEst]);
  });
  return (_scoreScale = { rules: R, hard: hard });
}

function interpScale_(table, x) {
  var max = table.length - 1;
  x = Math.max(0, Math.min(max, x));
  var lo = Math.floor(x), hi = Math.ceil(x);
  if (lo === hi) return table[lo];
  return table[lo] + (table[hi] - table[lo]) * (x - lo);
}
/** Round to 10, halves to the even ten (545 → 540, 555 → 560) — same as SC's checked script (Python round). */
function round10_(x) {
  var y = x / 10, f = Math.floor(y), d = y - f;
  if (Math.abs(d - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) * 10;
  return Math.round(y) * 10;
}
function clamp_(x, a, b) { return Math.max(a, Math.min(b, x)); }

/** One section. sec = 'RW' | 'Math'; m1, m2 = correct answers in Module 1 / Module 2. */
function satSectionEstimate_(sec, m1, m2) {
  var S = scoreScale_(), R = S.rules, k = sec === 'RW' ? 'rw' : 'math';
  var x = R.w_m1 * m1 + R.w_m2 * Math.max(m2, R.m2_min_ratio * m1);
  var est = interpScale_(S.hard[sec], x), note = '', method = 'both modules';
  if (m1 < R['m1_good_' + k]) {
    est = Math.min(est, R.m1_weak_cap);
    note = 'Module 1 was below the level that leads to the harder Module 2. On the real test you would likely get the easier Module 2, so this estimate is capped at ' + R.m1_weak_cap + '.';
    method = 'Module 1 below hard-route level (capped)';
  } else if (m2 < R['m2_floor_' + k]) {
    note = 'Module 2 had very few correct answers, so it is not counted; the estimate comes from Module 1.';
    method = 'Module 2 not counted';
  }
  var hw = R.half_width_section, shown = round10_(est);
  return { section: sec, m1: m1, m2: m2, raw: m1 + m2, x: x, est: est, score: shown,
           low: clamp_(shown - hw, 200, 800), high: clamp_(shown + hw, 200, 800), note: note, method: method };
}

/** Whole SAT attempt. mods = {RW1, RW2, M1, M2} correct counts (a missing section → null). */
function satEstimate_(mods) {
  var R = scoreScale_().rules;
  var rw = (mods.RW1 !== undefined && mods.RW2 !== undefined) ? satSectionEstimate_('RW', mods.RW1, mods.RW2) : null;
  var m = (mods.M1 !== undefined && mods.M2 !== undefined) ? satSectionEstimate_('Math', mods.M1, mods.M2) : null;
  var out = { RW: rw, Math: m, total: null };
  if (rw && m) {
    var t = round10_(rw.est + m.est), hw = R.half_width_total;
    out.total = { score: t, low: clamp_(t - hw, 400, 1600), high: clamp_(t + hw, 400, 1600) };
  }
  return out;
}

/** "1420 (1390–1450) · RW 720 · Math 700" (Student_Report, Report tab). */
function satEstimateText_(e) {
  if (!e) return '';
  var bits = [];
  if (e.total) bits.push(e.total.score + ' (' + e.total.low + '–' + e.total.high + ')');
  ['RW', 'Math'].forEach(function (s) { if (e[s]) bits.push(s + ' ' + e[s].score + ' (' + e[s].low + '–' + e[s].high + ')' + (e[s].method !== 'both modules' ? ' [' + e[s].method + ']' : '')); });
  return bits.join(' · ');
}

/** Creates Score_Scale from the defaults when it does not exist (never overwrites Minh's edits). */
function ensureScoreScale_() {
  var ss = ss_(), sh = ss.getSheetByName(SCORE_SCALE_TAB);
  if (sh && sh.getLastRow() > 1) return 'Score_Scale: kept (exists)';
  if (!sh) sh = ss.insertSheet(SCORE_SCALE_TAB);
  var sc = SCORE_SCALE_DEFAULT_.scale, ru = SCORE_SCALE_DEFAULT_.rules;
  ensureGrid_(sh, Math.max(sc.length, ru.length) + 5, RULES_COL0 + 2);
  sh.getRange(1, SCALE_COL0, sc.length, sc[0].length).setValues(sc.map(function (r) { return r.map(function (v) { return v; }); }));
  sh.getRange(1, RULES_COL0, ru.length, 3).setValues(ru);
  try { sh.setFrozenRows(1); sh.getRange(1, 1, 1, RULES_COL0 + 2).setFontWeight('bold'); } catch (e) {}
  _scoreScale = null;
  return 'Score_Scale: created (' + (sc.length - 1) + ' scale rows, ' + (ru.length - 1) + ' rules)';
}
