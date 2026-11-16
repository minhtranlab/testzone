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
 * on the question and then chose the right answer); Sessions.integrity = JSON per part {n, sec, at, copy, ctx, fs}.
 * Teacher result page (under each module), Report tab and the class screen show it; students never see these numbers.
 * Not possible from a web page: macOS Force Click / three-finger Look Up / Ctrl+Cmd+D, the iPad callout menu on a text
 * selection, screenshots, a second device.
 */

var LEAVE_MIN_MS = 2000, LEFT_FLAG_SEC = 20;

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
function leftThenRight_(ig, qid, correct, lastChangeT) {
  if (!correct || lastChangeT === null || lastChangeT === undefined) return false;
  return ig.leaves.some(function (l) { return l.qid === qid && l.sec >= LEFT_FLAG_SEC && l.t1 <= lastChangeT + 1000; });
}

/** Sessions.integrity cell → {part: {n, sec, at: [qid…], copy, ctx, fs}} (null = no data at all). */
function integrityCell_(session) {
  var v = String((session && session.integrity) || '').trim();
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

/** Teacher text: "Left the test: 3× · 2 min 10 s · at M2-15, M2-18" (+ copy / right-click / full screen). x = one part's cell. */
function integrityText_(x, codeOf) {
  if (!x) return { left: 'Left the test: —', other: '' };
  var at = (x.at || []).map(function (q) { return q ? (codeOf(q) || q) : 'Review page'; });
  var uniq = at.filter(function (c, i) { return at.indexOf(c) === i; });
  var left = x.n ? 'Left the test: ' + x.n + '× · ' + durText_(x.sec) + (uniq.length ? ' · at ' + uniq.join(', ') : '') : 'Left the test: never';
  var bits = [];
  bits.push(x.copy ? 'Copy attempts: ' + x.copy : 'No copy attempts');
  bits.push(x.ctx ? 'Right-click attempts: ' + x.ctx : 'no right-click attempts');
  if (x.fs) bits.push('Left full screen: ' + x.fs + '×');
  return { left: left, other: bits.join(' · ') };
}
function durText_(s) { s = Math.round(Number(s) || 0); var m = Math.floor(s / 60), r = s % 60; return m ? m + ' min ' + r + ' s' : r + ' s'; }
