/**
 * Test Zone — test integrity (ticket #44 part 2, v1.15). Signs for the teacher, not proof.
 *
 * The student test screen (module start → submit, Review page and breaks too) blocks what a web page can block:
 * right-click / context menu (Look Up, Search, Translate), copy / cut / drag of question text, select-all, page translation.
 * It logs what it can see, as Events with the current question in qid:
 *   integrity_on      once per part (part start) → this part has integrity data ("—" for parts / attempts without it)
 *   leave_start       the test window was left (tab hidden or window blur; not when focus moves into a frame of the page)
 *   leave_end         back again; value = ms away. Leaves < 2 s are ignored here. A leave still open when the part
 *                     ends / at submit is closed there by the client; one never closed (page shut) ends at the next event
 *   copy_attempt · context_attempt · fullscreen_exit (only if the student had chosen full screen)
 * Break screens, the Directions screen and the time after submit are never counted (the client logs no leave there).
 *
 * At submit: Responses.left_sec (seconds away while on that question; '' = no data) + flag LEFT_THEN_RIGHT (left ≥ 20 s
 * on the question and then chose the right answer); Sessions.integrity = JSON per part {n, sec, at, copy, ctx, fs,
 * lv: [[qid, sec], …] one per leave}. #46: on the teacher pages only leaves ≥ leave_flag_sec (Settings, 20) count in the
 * "Left the test" headline and for ⚠; shorter ones (2–19 s) are listed in grey. The re-grade recomputes all of it.
 * Teacher result page (under each module), Report tab and the class screen show it; students never see these numbers.
 * Not possible from a web page: macOS Force Click / three-finger Look Up / Ctrl+Cmd+D, the iPad callout menu on a text
 * selection, screenshots, a second device.
 */

var LEAVE_MIN_MS = 2000, LEFT_FLAG_SEC = 20;
function flagSec_(S) { var v = Number((S || {}).leave_flag_sec); return v > 0 ? v : LEFT_FLAG_SEC; }

/** One part's events (sorted by t) → { on, n, sec, leaves: [{qid, t0, t1, sec}], copy, ctx, fs }. */
function integrityOfPart_(pEvents) {
  var out = { on: false, n: 0, sec: 0, leaves: [], copy: 0, ctx: 0, fs: 0 }, open = null;
  var close = function (t1, ms) {
    var d = ms !== null && ms !== undefined && isFinite(Number(ms)) && Number(ms) > 0 ? Number(ms) : Math.max(0, t1 - open.t0);
    if (d >= LEAVE_MIN_MS) { out.leaves.push({ qid: open.qid, t0: open.t0, t1: open.t0 + d, sec: Math.round(d / 1000) }); out.n++; out.sec += d / 1000; }
    open = null;
  };
  pEvents.forEach(function (e) {
    var t = Number(e.t_ms) || 0, ty = String(e.type);
    if (ty === 'integrity_on') out.on = true;
    else if (ty === 'leave_start') { out.on = true; if (!open) open = { t0: t, qid: String(e.qid || '') }; }
    else if (ty === 'leave_end') { if (open) close(t, e.value); }
    else if (ty === 'copy_attempt') out.copy++;
    else if (ty === 'context_attempt') out.ctx++;
    else if (ty === 'fullscreen_exit') out.fs++;
    else if (open && (ty === 'resume' || ty === 'part_end')) close(t, null);
  });
  out.sec = Math.round(out.sec);
  return out;
}

/** Seconds away per question of a part (only leaves that started on a question). */
function leftByQ_(ig) {
  var m = {};
  ig.leaves.forEach(function (l) { if (l.qid) m[l.qid] = (m[l.qid] || 0) + l.sec; });
  return m;
}

/** Left ≥ 20 s on this question and then chose the (right) final answer after coming back. lastChangeT = t of the final answer. */
function leftThenRight_(ig, qid, correct, lastChangeT, flagSec) {
  if (!correct || lastChangeT === null || lastChangeT === undefined) return false;
  return ig.leaves.some(function (l) { return l.qid === qid && l.sec >= (flagSec || LEFT_FLAG_SEC) && l.t1 <= lastChangeT + 1000; });
}
/** The Sessions.integrity entry of one part. */
function igCellOf_(ig) {
  return { n: ig.n, sec: ig.sec, at: ig.leaves.map(function (l) { return l.qid; }), copy: ig.copy, ctx: ig.ctx, fs: ig.fs,
           lv: ig.leaves.map(function (l) { return [l.qid, l.sec]; }) };
}
/** Leaves of a part cell: [{qid, sec}] (cells from v1.15 without lv: one leave per question in "at", seconds unknown → null). */
function leavesOf_(x) {
  if (!x) return [];
  if (x.lv) return x.lv.map(function (l) { return { qid: String(l[0] || ''), sec: Number(l[1]) || 0 }; });
  return (x.at || []).map(function (q) { return { qid: String(q || ''), sec: null }; });
}

/** Sessions.integrity cell → {part: {n, sec, at: [qid…], copy, ctx, fs}} (null = no data at all). */
function integrityCell_(session) {
  var v = String((session && session.integrity) || '').trim();
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

/**
 * Teacher text of one part's cell x (#46): left = "Left the test: 2× · 1 min 5 s · at M2-15, M2-18" counting only leaves
 * ≥ flagSec ('' when there is none; "Left the test: —" = no data), other = copy / right-click / full screen (only when
 * there are some), short = the shorter leaves [{code, sec}] for the grey list.
 */
function integrityText_(x, codeOf, flagSec) {
  if (!x) return { left: 'Left the test: —', other: '', short: [], long: [] };
  flagSec = flagSec || LEFT_FLAG_SEC;
  var where = function (q) { return q ? (codeOf(q) || q) : 'Review page'; };
  var lv = leavesOf_(x), known = !x.lv ? null : true;
  var long = known ? lv.filter(function (l) { return l.sec >= flagSec; }) : lv, short = known ? lv.filter(function (l) { return l.sec < flagSec; }) : [];
  var at = long.map(function (l) { return where(l.qid); }).filter(function (c, i, a) { return a.indexOf(c) === i; });
  var sec = known ? long.reduce(function (a, l) { return a + l.sec; }, 0) : x.sec;
  var left = long.length ? 'Left the test: ' + long.length + '× · ' + durText_(sec) + (at.length ? ' · at ' + at.join(', ') : '') : '';
  var bits = [];
  if (x.copy) bits.push('Copy attempts: ' + x.copy);
  if (x.ctx) bits.push('Right-click attempts: ' + x.ctx);
  if (x.fs) bits.push('Left full screen: ' + x.fs + '×');
  return { left: left, other: bits.join(' · '), short: short.map(function (l) { return { code: where(l.qid), qid: l.qid, sec: l.sec }; }),
           long: long.map(function (l) { return { code: where(l.qid), qid: l.qid, sec: l.sec }; }) };
}
function durText_(s) { s = Math.round(Number(s) || 0); var m = Math.floor(s / 60), r = s % 60; return m ? m + ' min ' + r + ' s' : r + ' s'; }
