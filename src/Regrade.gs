/**
 * Test Zone — re-grade submitted attempts (ticket #16, QA M1 + M2). Runs in rebuildAll_() (Sheet update after each deploy,
 * menu "Refresh report" → no; editor function rebuildAll / menu "Update after new version" → yes).
 *
 *  1. Answer cells repaired (M1): before v1.7 an SPR answer such as 6/5 or 18.0 was written as a plain value, so the Sheet
 *     turned it into a date / number. The student's exact text is in Sessions.state_json (final answers) → Responses.final_answer
 *     is rewritten as text; Events.value cells that became dates / numbers are turned back into the typed text (matched with
 *     the final answer when possible); first_answer / n_changes / change_pattern are worked out again from those events.
 *  2. Re-grade (M2): Responses.correct follows the CURRENT key (Questions tab over the data file). When it changes, the row's
 *     profile (Right / Wrong …), change_pattern letters and CHANGED_* / ELIM_KEY flags follow, then the attempt's totals in
 *     Sessions. Every change is logged: attempt · qid · old → new. Time columns are never touched.
 * Topic_Summary, Student_Report, estimates and the Report tab are rebuilt from these rows by rebuildAll_() right after.
 */

/** A Responses / Events answer cell as the text the student typed ('' = blank). Legacy cells: Date → "M/d" (or the hint
 *  when it matches), number → its digits (or the hint when it is the same number). */
function answerText_(v, hint) {
  if (v === null || v === undefined || v === '') return '';
  hint = hint === undefined || hint === null ? '' : String(hint);
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return hint || '';
    var md = (v.getMonth() + 1) + '/' + v.getDate(), dm = v.getDate() + '/' + (v.getMonth() + 1);
    if (hint && (hint === md || hint === dm)) return hint;
    return sheetDayFirst_() ? dm : md;
  }
  if (typeof v === 'number') {
    if (hint && sprParse_(hint) && Number(hint) === v) return hint; // 18 ← "18.0", 7.2 ← "7.20"
    return String(v);
  }
  return String(v);
}
var _dayFirst = null;
function sheetDayFirst_() {
  if (_dayFirst === null) { try { _dayFirst = !/^en_US/.test(String(ss_().getSpreadsheetLocale())); } catch (e) { _dayFirst = false; } }
  return _dayFirst;
}
function sameCell_(cell, want) { return typeof cell === 'string' ? cell === want : (want === '' ? cell === '' : false); }

/** Re-grade every finished attempt from the current keys (+ repair answer cells). Returns a one-line summary. */
function regradeAll_() {
  var sessions = readTable_('Sessions').rows.filter(function (s) { return isFinished_(s) && !!regEntry_(String(s.form_id)); });
  if (!sessions.length) return 'Re-graded 0 answers (no submitted attempt)';
  var S = getSettings_();
  var ids = {}; sessions.forEach(function (s) { ids[String(s.session_id)] = s; });
  var resp = readTable_('Responses').rows.filter(function (r) { return ids[String(r.session_id)]; });
  var ev = readTable_('Events');
  var evBy = {}; // session → qid → [events]
  ev.rows.forEach(function (e) {
    var sid = String(e.session_id), t = String(e.type);
    if (!ids[sid] || (t !== 'select' && t !== 'change')) return;
    ((evBy[sid] = evBy[sid] || {})[String(e.qid)] = evBy[sid][String(e.qid)] || []).push(e);
  });
  var log = [], evFixed = 0, cellsFixed = 0, regraded = 0, touched = {};
  sessions.forEach(function (s) {
    var sid = String(s.session_id), fid = String(s.form_id);
    var fd = formData_(fid);
    if (!fd) return;
    var qmap = {}; fd.questions.forEach(function (q) { qmap[q.qid] = q; });
    var st = parseState_(s) || {}, ans = {};
    Object.keys(st.parts || {}).forEach(function (p) { var a = (st.parts[p] || {}).ans || {}; Object.keys(a).forEach(function (q) { ans[q] = String(a[q]); }); });
    var hasState = !!st.parts;
    resp.filter(function (r) { return String(r.session_id) === sid; }).forEach(function (r) {
      var q = qmap[String(r.qid)];
      if (!q) return;
      var fin = hasState ? (ans[q.qid] || '') : answerText_(r.final_answer);
      // events of this question: legacy date / number cells back to the typed text
      var evs = ((evBy[sid] || {})[q.qid] || []).slice().sort(function (a, b) { return (Number(a.t_ms) || 0) - (Number(b.t_ms) || 0); });
      var vals = evs.map(function (e) {
        var t = answerText_(e.value, fin);
        if (typeof e.value !== 'string' && e.value !== '') { updateRow_('Events', e._row, { value: txt_(t) }); e.value = t; evFixed++; }
        return t;
      }).filter(function (v) { return v !== '' && v !== 'null'; });
      var first = vals.length ? vals[0] : fin;
      var nCh = 0; for (var i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) nCh++;
      var corr = fin ? isCorrect_(q, fin) : null, firstCorr = first ? isCorrect_(q, first) : null;
      var pattern = 'none';
      if (first && !fin) pattern = 'cleared';
      else if (first && fin && first !== fin) pattern = (firstCorr ? 'R' : 'W') + '→' + (corr ? 'R' : 'W');
      var oldCorr = r.correct === '' ? '' : Number(r.correct), newCorr = corr === null ? '' : (corr ? 1 : 0);
      var f = {};
      if (!sameCell_(r.final_answer, fin)) f.final_answer = txt_(fin);
      if (!sameCell_(r.first_answer, first)) f.first_answer = txt_(first);
      if (Number(r.n_changes) !== nCh) f.n_changes = nCh;
      if (String(r.change_pattern) !== pattern) f.change_pattern = pattern;
      if (oldCorr !== newCorr) {
        f.correct = newCorr;
        var ratio = Number(r.pace_ratio) || 0, prof;
        if (!fin) prof = 'BLANK';
        else if (!corr) prof = ratio < S.fast_ratio ? 'FAST_WRONG' : (ratio > S.slow_ratio ? 'SLOW_WRONG' : 'WRONG');
        else prof = ratio > S.slow_ratio ? 'SLOW_RIGHT' : 'RIGHT';
        f.profile = prof;
        log.push(sid + ' · ' + q.qid + ': ' + (oldCorr === 1 ? 'right' : oldCorr === 0 ? 'wrong' : 'blank') + ' → ' + (newCorr === 1 ? 'right' : newCorr === 0 ? 'wrong' : 'blank') + ' (answer ' + (fin || '–') + ')');
        regraded++;
      }
      // flags that depend on the key / the answers
      var keys = Array.isArray(q.key) ? q.key : [q.key];
      var flags = String(r.flags || '').split(',').filter(function (x) { return x && ['CHANGED_R_TO_W', 'CHANGED_W_TO_R', 'ELIM_KEY'].indexOf(x) < 0; });
      if (pattern === 'R→W') flags.push('CHANGED_R_TO_W');
      if (pattern === 'W→R') flags.push('CHANGED_W_TO_R');
      var elim = String(r.eliminated || '').split(',').filter(String);
      if ((q.type || 'mcq') === 'mcq' && elim.some(function (l) { return keys.indexOf(l) >= 0; })) flags.push('ELIM_KEY');
      var order = ['CHANGED_R_TO_W', 'CHANGED_W_TO_R', 'GUESS_LIKELY', 'ELIM_KEY'];
      flags.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      if (flags.join(',') !== String(r.flags || '')) f.flags = flags.join(',');
      if (Object.keys(f).length) {
        updateRow_('Responses', r._row, f);
        Object.keys(f).forEach(function (k) { r[k] = f[k] === undefined ? r[k] : String(f[k]).replace(/^'/, ''); });
        r.correct = f.correct !== undefined ? f.correct : r.correct;
        if (f.correct === undefined) cellsFixed++;
        touched[sid] = true;
      }
    });
  });
  // totals of the attempts whose rows changed
  var totals = 0;
  sessions.forEach(function (s) {
    var sid = String(s.session_id);
    if (!touched[sid]) return;
    var rows = resp.filter(function (r) { return String(r.session_id) === sid; });
    var right = function (parts) { return rows.filter(function (r) { return (!parts || parts.indexOf(String(r.part)) >= 0) && Number(r.correct) === 1; }).length; };
    var want = { total_correct: right(null) };
    want.percent = rows.length ? round_(want.total_correct / rows.length, 4) : 0;
    sectionsOf_(profileFor_(String(s.form_id))).forEach(function (sec) {
      if (('score_' + sec.id) in s && rows.some(function (r) { return sec.parts.indexOf(String(r.part)) >= 0; })) want['score_' + sec.id] = right(sec.parts);
    });
    var f = {};
    Object.keys(want).forEach(function (k) { if (Number(s[k]) !== Number(want[k]) || s[k] === '') f[k] = want[k]; });
    if (Object.keys(f).length) { updateRow_('Sessions', s._row, f); totals++; log.push(sid + ' · totals: ' + JSON.stringify(f)); }
  });
  _formCache = {};
  var msg = 'Re-graded ' + regraded + ' answers (key changes) in ' + totals + ' attempts; repaired ' + cellsFixed + ' answer rows, ' + evFixed + ' event cells';
  console.log('REGRADE: ' + msg + (log.length ? '\n' + log.join('\n') : ''));
  return msg;
}
