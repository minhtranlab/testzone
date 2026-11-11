/**
 * Test Zone — My Tests home, design "Mẫu 2 · Next test focus" (ticket #35, v1.12). Everything comes with listForms
 * (one server call). No estimated score on the home.
 *
 * hero   (big block): 1. an active assignment with no finished and no open attempt ("Assigned by your teacher");
 *                     2. else "Next test" = the first full test (My Tests order) with no finished and no open attempt;
 *                     3. else none.
 * pickup ("Pick up where you stopped"): every open attempt (in progress / paused, assignments too), with the live
 *         numbers from the saved state (answered, time left), the same data autosave keeps (Sessions.state_json).
 */

/** "Minh (test)" → "Minh". */
function firstName_(name) { return String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || ''; }

function isDone_(a) { return a.status === 'completed' || a.status === 'timeout'; }
function isOpen_(a) { return a.status === 'in_progress' || a.status === 'paused'; }

/** The hero block for one card (assignment or full test). */
function heroOf_(f, kind) {
  var prof = f.available ? scopedProfile_(profileFor_(f.form_id, true), f.scope || 'full') : null;
  var sat = !!(prof && prof.sections && prof.sections.length);
  var minutes = f.parts.reduce(function (a, p) { return a + (Number(p.minutes) || 0); }, 0);
  var calc = f.parts.some(function (p) { return p.calculator; });
  var ref = prof ? prof.parts.some(function (p) { return p.reference; }) : false;
  var facts = [{ b: String(f.n), t: 'questions' }];
  var title, of, start;
  if (kind === 'assignment') {
    title = f.label; of = String(f.title || '').replace(/ — .*$/, '');
    if (sat && prof.sections.length > 1) facts.push({ t: prof.sections.map(function (s) { return s.title || s.id; }).join(', then ') });
    if (calc) facts.push({ t: 'Desmos calculator' });
    if (ref) facts.push({ t: 'Reference sheet' });
    start = 'Start ' + f.label;
  } else {
    var full = String(f.title || '');
    title = sat ? full.replace(/^SAT\s*·\s*/, '') : full;
    of = sat ? 'SAT practice test' : (f.exam || '') + ' practice test';
    if (sat) { facts.push({ t: prof.sections.map(function (s) { return s.title || s.id; }).join(', then ') }); if (f.break_min) facts.push({ t: f.break_min + '-minute break' }); }
    else if (calc) facts.push({ t: 'Calculator in ' + f.parts.filter(function (p) { return p.calculator; }).map(function (p) { return 'Part ' + p.part; }).join(', ') });
    start = 'Start ' + (sat ? full : 'test');
  }
  var clock = minutes >= 60 ? Math.floor(minutes / 60) + ':' + ('0' + (minutes % 60)).slice(-2) : minutes + ':00';
  return { kind: kind, form_id: f.form_id, scope: f.scope || 'full', title: title, of: of, facts: facts,
           clock: clock, clock_unit: minutes >= 60 ? 'hours' : 'minutes', start: start };
}

/** Pick-up line of one open attempt. */
function pickupOf_(f, a, s, nowMs) {
  var prof = profileOf_(s, true), st = parseState_(s) || {}, cur = String(st.current_part || '');
  var sat = !!(prof.sections && prof.sections.length);
  var secOf = function (p) { return (prof.sections || []).filter(function (x) { return x.parts.indexOf(p) >= 0; })[0]; };
  var partName = function (p) {
    var sec = secOf(p);
    if (!sec) return 'Part ' + p;
    var full = profileFor_(String(s.form_id), true), fs = (full.sections || []).filter(function (x) { return x.id === sec.id; })[0] || sec;
    return (sec.title || sec.id) + ' · Module ' + (fs.parts.indexOf(p) + 1);
  };
  var seq = st.seq_parts || prof.parts.map(function (p) { return p.part; }), ended = st.ended || {};
  var out = { session_id: a.session_id, form_id: f.form_id, scope: f.scope || 'full', exam: f.exam, title: f.title, attempt_no: a.attempt_no };
  var started = cur && (st.part_starts || {})[cur] && !ended[cur];
  if (started) {
    var def = prof.parts.filter(function (p) { return p.part === cur; })[0] || {};
    var ans = ((st.parts || {})[cur] || {}).ans || {};
    var answered = Object.keys(ans).filter(function (k) { return ans[k] !== '' && ans[k] !== null && ans[k] !== undefined; }).length;
    var n = Number(def.n) || 0, left = Math.max(0, Math.round((Number(def.time_limit_sec) || 0) - (nowMs - Number(st.part_starts[cur])) / 1000));
    out.sub = partName(cur); out.answered = answered; out.n = n; out.left_sec = left; out.pct = n ? Math.round(100 * answered / n) : 0;
    out.line = answered + '/' + n + ' answered · ' + (left > 0 ? Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) + ' left' : 'time is up');
    out.button = 'Continue';
  } else if (!seq.some(function (p) { return ended[p] || (st.part_starts || {})[p]; })) {
    out.sub = 'Not started yet'; out.pct = 0; out.line = 'Opened, no part started'; out.button = 'Continue'; // opened, still on the first Directions
  } else {
    var pz = pausedInfo_(s, prof), doneParts = seq.filter(function (p) { return ended[p]; }).length;
    var sec = cur ? secOf(cur) : null, atBreak = sat && sec && prof.sections.length > 1 && prof.sections[0].parts.indexOf(cur) < 0 && sec.parts.indexOf(cur) === 0;
    out.sub = pz.done ? pz.done + ' done' : 'Not started';
    out.pct = seq.length ? Math.round(100 * doneParts / seq.length) : 0;
    out.line = (atBreak ? 'Paused at the break' : 'Paused') + (pz.next ? ' · ' + pz.next + ' next' : '');
    out.button = pz.next ? 'Continue ' + pz.next : 'Continue';
  }
  return out;
}

/** hero + pickup + greeting for listForms (asg = assignment cards, out = full-test cards). */
function homeExtras_(st, asg, out, sessions) {
  var nowMs = Date.now(), byId = {};
  sessions.forEach(function (s) { byId[String(s.session_id)] = s; });
  var hero = null;
  asg.forEach(function (f) { if (!hero && f.available && !f.attempts.some(isDone_) && !f.attempts.some(isOpen_)) hero = heroOf_(f, 'assignment'); });
  out.forEach(function (f) { if (!hero && f.available && !f.attempts.some(isDone_) && !f.attempts.some(isOpen_)) hero = heroOf_(f, 'next'); });
  var pickup = [];
  asg.concat(out).forEach(function (f) {
    f.attempts.filter(isOpen_).forEach(function (a) { var s = byId[a.session_id]; if (s) { try { pickup.push(pickupOf_(f, a, s, nowMs)); } catch (e) { console.warn('PICKUP: ' + e); } } });
  });
  var any = sessions.some(function (s) { return String(s.status) !== 'abandoned'; });
  return { first_name: firstName_(st.name), welcome: !any, hero: hero, pickup: pickup };
}
