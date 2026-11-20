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
 *     Sessions. Every change is logged: attempt · qid · old → new. time_total_sec / time_first_visit_sec are never touched.
 *  3. Time to final answer (#40): Responses.time_to_answer_sec is worked out again from the attempt's Events (past attempts
 *     too), and the rushed / slow type + pace_ratio follow it (Time_Norms), so old reports match new ones.
 * Topic_Summary, Student_Report, estimates and the Report tab are rebuilt from these rows by rebuildAll_() right after.
 */

/** A Responses / Events answer cell as the text the student typed ('' = blank). Legacy cells: Date → "M/d" (or the hint
 *  when it matches), number → its digits (or the hint when it is the same number). */
function answerText_(v, hint) {
  if (v === null || v === undefined || v === '') return '';
  hint = hint === undefined || hint === null ? '' : String(hint);
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return hint || '';
    var mmdd = fmtDate_(v, 'MM/dd').split('/').map(Number); // the Sheet's day, in the script time zone
    var md = mmdd[0] + '/' + mmdd[1], dm = mmdd[1] + '/' + mmdd[0];
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
  var evBy = {}, evAll = {}; // session → qid → [answer events]; session → part → [all events] (#40 time to answer)
  ev.rows.forEach(function (e) {
    var sid = String(e.session_id), t = String(e.type);
    if (!ids[sid]) return;
    ((evAll[sid] = evAll[sid] || {})[String(e.part)] = evAll[sid][String(e.part)] || []).push(e);
    if (t !== 'select' && t !== 'change') return;
    ((evBy[sid] = evBy[sid] || {})[String(e.qid)] = evBy[sid][String(e.qid)] || []).push(e);
  });
  var log = [], evFixed = 0, cellsFixed = 0, regraded = 0, retimed = 0, touched = {};
  var chg = [], names = {}; try { names = studentNames_(); } catch (e) {}  // #52: who changed, for the update log
  sessions.forEach(function (s) {
    var sid = String(s.session_id), fid = String(s.form_id);
    var fd = formData_(fid);
    if (!fd) return;
    var qmap = {}; fd.questions.forEach(function (q) { qmap[q.qid] = q; });
    var profile = profileFor_(fid, true), sat = isSat_(profile), tags = tagMap_(fid), nInPart = {};
    fd.questions.forEach(function (q) { nInPart[q.part] = (nInPart[q.part] || 0) + 1; });
    var st = parseState_(s) || {}, ans = {};
    Object.keys(st.parts || {}).forEach(function (p) { var a = (st.parts[p] || {}).ans || {}; Object.keys(a).forEach(function (q) { ans[q] = String(a[q]); }); });
    var hasState = !!st.parts;
    var ttfa = {}, lastT = {}, igP = {}, igCell = {}; // qid → ms | null (time to answer); qid → t of the final answer; part → integrity (#46)
    Object.keys(evAll[sid] || {}).forEach(function (p) {
      var pe = evAll[sid][p].map(function (e) { return { part: p, t_ms: Number(e.t_ms) || 0, qid: String(e.qid || ''), type: String(e.type), value: e.value === '' ? null : e.value }; })
        .sort(function (a, b) { return a.t_ms - b.t_ms; });
      var d = deriveMetrics_(pe, fd.questions.filter(function (q) { return q.part === p; }).map(function (q) { return q.qid; }));
      Object.keys(d.metrics).forEach(function (q) { ttfa[q] = d.metrics[q].ttfa_ms; lastT[q] = lastChangeT_(d.metrics[q].aev); });
      var ig = integrityOfPart_(pe); // #44 / #46: leaving the test window, again from the Events
      if (ig.on) { igP[p] = ig; igCell[p] = igCellOf_(ig); }
    });
    if (Object.keys(igCell).length) { // Sessions.integrity with the length of every leave (#46)
      var want = JSON.stringify(igCell);
      if (String(s.integrity || '') !== want) { updateRow_('Sessions', s._row, { integrity: want }); s.integrity = want; }
    }
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
      // the question's type (rushed / slow / …) from its time and the current Time_Norms (#24 F): recomputed every run
      var tSec = Number(r.time_total_sec) || 0, partDef = (profile.parts.filter(function (p) { return p.part === String(r.part); })[0]) || {};
      var ta = fin ? (ttfa[q.qid] === null || ttfa[q.qid] === undefined ? tSec : Math.min(tSec, ttfa[q.qid] / 1000)) : null;
      var taCell = ta === null ? '' : round_(ta, 1);
      if (String(r.time_to_answer_sec === undefined ? '' : r.time_to_answer_sec) === '' ? taCell !== '' : (taCell === '' || Math.abs(Number(r.time_to_answer_sec) - taCell) > 0.05)) f.time_to_answer_sec = taCell;
      var tp = timeProfile_(!!fin, !!corr, ta === null ? tSec : ta, timeNormFor_(sat, String(r.part), q.type, tags[q.qid]),
                            (partDef.time_limit_sec || 0) / Math.max(1, nInPart[String(r.part)] || 1), S);
      if (String(r.profile) !== tp.profile) f.profile = tp.profile;
      if (Math.abs((Number(r.pace_ratio) || 0) - round_(tp.ratio, 2)) > 0.005) f.pace_ratio = round_(tp.ratio, 2);
      if (oldCorr !== newCorr) {
        f.correct = newCorr;
        log.push(sid + ' · ' + q.qid + ': ' + (oldCorr === 1 ? 'right' : oldCorr === 0 ? 'wrong' : 'blank') + ' → ' + (newCorr === 1 ? 'right' : newCorr === 0 ? 'wrong' : 'blank') + ' (answer ' + (fin || '–') + ')');
        chg.push((names[normCode_(s.student_code)] || s.student_code) + ' ' + q.qid.replace(/^SAT-/, '') + ' "' + (fin || '–') + '" ' + (oldCorr === 1 ? 'right' : oldCorr === 0 ? 'wrong' : 'blank') + '→' + (newCorr === 1 ? 'right' : newCorr === 0 ? 'wrong' : 'blank')); // #52
        regraded++;
      }
      // flags that depend on the key / the answers
      var keys = Array.isArray(q.key) ? q.key : [q.key];
      var flags = String(r.flags || '').split(',').filter(function (x) { return x && ['CHANGED_R_TO_W', 'CHANGED_W_TO_R', 'ELIM_KEY'].indexOf(x) < 0; });
      if (pattern === 'R→W') flags.push('CHANGED_R_TO_W');
      if (pattern === 'W→R') flags.push('CHANGED_W_TO_R');
      var elim = String(r.eliminated || '').split(',').filter(String);
      if ((q.type || 'mcq') === 'mcq' && elim.some(function (l) { return keys.indexOf(l) >= 0; })) flags.push('ELIM_KEY');
      if (newCorr !== 1) flags = flags.filter(function (x) { return x !== 'LEFT_THEN_RIGHT'; }); // #44: only for a right answer
      var igq = igP[String(r.part)];
      if (igq) { // #46: ⚠ again with the current leave_flag_sec; left_sec from the Events
        flags = flags.filter(function (x) { return x !== 'LEFT_THEN_RIGHT'; });
        if (leftThenRight_(igq, q.qid, newCorr === 1, lastT[q.qid], flagSec_(S))) flags.push('LEFT_THEN_RIGHT');
        var ls = leftByQ_(igq)[q.qid] || 0;
        if (String(r.left_sec) === '' || Number(r.left_sec) !== ls) f.left_sec = ls;
      }
      var order = ['CHANGED_R_TO_W', 'CHANGED_W_TO_R', 'GUESS_LIKELY', 'ELIM_KEY', 'LEFT_THEN_RIGHT'];
      flags.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      if (flags.join(',') !== String(r.flags || '')) f.flags = flags.join(',');
      if (Object.keys(f).length) {
        updateRow_('Responses', r._row, f);
        Object.keys(f).forEach(function (k) { r[k] = f[k] === undefined ? r[k] : String(f[k]).replace(/^'/, ''); });
        r.correct = f.correct !== undefined ? f.correct : r.correct;
        if (f.profile) r.profile = f.profile;
        var onlyTime = Object.keys(f).every(function (k) { return k === 'profile' || k === 'pace_ratio' || k === 'time_to_answer_sec' || k === 'left_sec' || k === 'flags'; });
        if (onlyTime) retimed++; else if (f.correct === undefined) cellsFixed++;
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
  var msg = 'Re-graded ' + regraded + ' answers (key changes) in ' + totals + ' attempts; repaired ' + cellsFixed + ' answer rows, ' + evFixed + ' event cells; re-timed ' + retimed + ' rows (time to answer + Time_Norms)';
  if (chg.length) msg += ' — changed: ' + chg.slice(0, 12).join('; ') + (chg.length > 12 ? '; +' + (chg.length - 12) + ' more' : '');
  console.log('REGRADE: ' + msg + (log.length ? '\n' + log.join('\n') : ''));
  return msg;
}
