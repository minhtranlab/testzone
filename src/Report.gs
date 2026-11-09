/**
 * Test Zone — analysis (rule-based, no AI). Everything in English (Minh, 2026-11-09: app AND Sheet in English).
 *   validity_()        reliable / not reliable attempt (thresholds in Settings)
 *   analyse_()         everything the Report tab, Student_Report and the result pages show for one attempt
 *   studentView_()     the result page of one attempt (student app + teacher mode; never any key)
 *   rebuildStudent_()  Topic_Summary + Student_Report rows of one student (called on every submit)
 *   (the Report tab of the Sheet is drawn by ReportTab.gs from analyse_())
 */

/* AP Calculus AB units (CED) */
var UNIT_EN_ = {
  1: 'Limits and Continuity', 2: 'Differentiation: Definition and Fundamental Properties',
  3: 'Differentiation: Composite, Implicit, and Inverse Functions', 4: 'Contextual Applications of Differentiation',
  5: 'Analytical Applications of Differentiation', 6: 'Integration and Accumulation of Change', 7: 'Differential Equations',
  8: 'Applications of Integration'
};
/* Result types. t = name (teacher + student), m = what it means. */
var TYPE_EN_ = {
  RIGHT: { t: 'Right', m: 'Right, in normal time.' },
  SLOW_RIGHT: { t: 'Slow but right', m: 'Right, but took more than 1.5 × the standard time. On the real test this costs time.' },
  FAST_WRONG: { t: 'Rushed and wrong', m: 'Wrong in less than half the standard time: skimmed the question or fell for a trap.' },
  SLOW_WRONG: { t: "Didn't know (slow and wrong)", m: 'Long time and still wrong: a gap in knowledge or no method.' },
  WRONG: { t: 'Wrong', m: 'Wrong in normal time: the timing does not show why — go over it with the student.' },
  BLANK: { t: 'Blank', m: 'No answer. Wrong answers cost nothing on the AP exam, so always answer.' }
};
var UNIT_STATUS_ = { BAD: 'Needs reteaching', SLOW: 'Slow', OK: 'OK', FEW: 'Too few to judge' };

/* SAT: domains (= "unit" tag) and skills (= "topic" tag), from data/taxonomy/sat_skills.csv */
var SAT_DOMAIN_EN_ = { INI: 'Information and Ideas', CAS: 'Craft and Structure', EOI: 'Expression of Ideas', SEC: 'Standard English Conventions',
  H: 'Algebra', P: 'Advanced Math', Q: 'Problem-Solving and Data Analysis', S: 'Geometry and Trigonometry' };
var SAT_DOMAIN_SECTION_ = { INI: 'RW', CAS: 'RW', EOI: 'RW', SEC: 'RW', H: 'Math', P: 'Math', Q: 'Math', S: 'Math' };
var SAT_DOMAIN_ORDER_ = ['INI', 'CAS', 'EOI', 'SEC', 'H', 'P', 'Q', 'S'];
var SAT_SKILL_ORDER_ = ['INI.CID', 'INI.COE-T', 'INI.COE-Q', 'INI.INF', 'CAS.WIC', 'CAS.TSP', 'CAS.CTC', 'EOI.SYN', 'EOI.TRA', 'SEC.BOU', 'SEC.FSS',
  'H.A', 'H.B', 'H.C', 'H.D', 'H.E', 'P.A', 'P.B', 'P.C', 'Q.A', 'Q.B', 'Q.C', 'Q.D', 'Q.E', 'Q.F', 'Q.G', 'S.A', 'S.B', 'S.C', 'S.D'];
var SECTION_EN_ = { RW: 'Reading and Writing', Math: 'Math' };

function isSatUnit_(u) { return Object.prototype.hasOwnProperty.call(SAT_DOMAIN_EN_, String(u)); }
function unitName_(u) { return isSatUnit_(u) ? SAT_DOMAIN_EN_[String(u)] : (UNIT_EN_[Number(u)] || ('Unit ' + u)); }
/** "Unit 6" (AP) / "Standard English Conventions" (SAT) */
function unitShort_(u) { return isSatUnit_(u) ? SAT_DOMAIN_EN_[String(u)] : 'Unit ' + u; }
/** "Unit 6 (Integration …)" (AP) / "Standard English Conventions (RW)" (SAT) */
function unitFull_(u) { return isSatUnit_(u) ? SAT_DOMAIN_EN_[String(u)] + ' (' + SAT_DOMAIN_SECTION_[String(u)] + ')' : 'Unit ' + u + ' (' + unitName_(u) + ')'; }
function unitOrder_(u) { var i = SAT_DOMAIN_ORDER_.indexOf(String(u)); return i >= 0 ? 100 + i : (Number(u) || 99); }
/** "Part A" (AP) / "RW1" (SAT module) */
function partLbl_(p, sat) { return sat ? String(p) : 'Part ' + p; }
/** AP "2 min per question" · SAT "71 s per question" */
function paceStr_(sec, sat) { return sat ? Math.round(sec) + ' s per question' : paceText_(sec); }
function typesFor_(sat) {
  if (!sat) return TYPE_EN_;
  var t = JSON.parse(JSON.stringify(TYPE_EN_));
  t.BLANK.m = 'No answer. Wrong answers cost nothing on the SAT, so always answer.';
  return t;
}
function isRightP_(p) { return p === 'RIGHT' || p === 'SLOW_RIGHT'; }
function isWrongP_(p) { return p === 'FAST_WRONG' || p === 'SLOW_WRONG' || p === 'WRONG'; }
function escHtml_(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function stripTags_(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
function toMs_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var d = new Date(String(v).replace(' ', 'T') + (String(v).length > 10 && !/[zZ+]/.test(String(v).slice(10)) ? '+07:00' : ''));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function paceText_(sec) { var m = Math.round(sec / 60 * 2) / 2; return m + ' min per question'; }
function plural_(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
/** "standard time (Part A ≈ 2 min per question, Part B ≈ 3 min per question)" */
function standardTimeText_(parts) {
  return 'standard time (' + parts.map(function (p) { return 'Part ' + p.part + ' ≈ ' + paceText_(p.pace); }).join(', ') + ')';
}

/**
 * rows: per-question objects with profile, time_total_sec, part; partTimesMin: {part: minutes used}; profile: exam profile.
 * Not reliable when: time used < valid_min_time_ratio × limit (SAT: per section), or ≥ valid_quick_ratio of answered
 * questions took < guess_min_time_sec, or ≥ valid_blank_ratio blank.
 */
function validity_(rows, partTimesMin, profile, S) {
  var n = rows.length;
  var blank = rows.filter(function (r) { return String(r.profile) === 'BLANK'; }).length;
  var answered = n - blank;
  var quick = rows.filter(function (r) { return String(r.profile) !== 'BLANK' && Number(r.time_total_sec) < S.guess_min_time_sec; }).length;
  var used = 0, limit = 0;
  var seen = {};
  rows.forEach(function (r) { seen[String(r.part)] = 1; });
  profile.parts.forEach(function (p) {
    if (!seen[p.part]) return;
    limit += p.time_limit_sec / 60;
    used += Number(partTimesMin[p.part]) || 0;
  });
  used = Math.round(used * 10) / 10; limit = Math.round(limit);
  var reasons = [];
  if (profile.sections && profile.sections.length) { // SAT: each section on its own (RW 64 min, Math 70 min)
    profile.sections.forEach(function (sec) {
      var su = 0, sl = 0;
      profile.parts.forEach(function (p) { if (seen[p.part] && sec.parts.indexOf(p.part) >= 0) { sl += p.time_limit_sec / 60; su += Number(partTimesMin[p.part]) || 0; } });
      su = Math.round(su * 10) / 10; sl = Math.round(sl);
      if (sl && su < S.valid_min_time_ratio * sl) reasons.push(sec.id + ': only ' + su + ' of ' + sl + ' minutes used');
    });
  } else if (limit && used < S.valid_min_time_ratio * limit) reasons.push('only ' + used + ' of ' + limit + ' minutes used');
  if (answered && quick / answered >= S.valid_quick_ratio) reasons.push(quick + ' of ' + answered + ' answers chosen in under ' + S.guess_min_time_sec + ' seconds');
  if (n && blank / n >= S.valid_blank_ratio) reasons.push(plural_(blank, 'question') + ' left blank');
  return { reliable: reasons.length === 0, reasons: reasons, used: used, limit: limit, quick: quick, answered: answered, blank: blank, n: n };
}

function topicNames_(formId) {
  var names = {};
  var fd = formData_(formId);
  if (fd) fd.questions.forEach(function (q) { if (q.tags && q.tags.topic) names[String(q.tags.topic)] = q.tags.topic_name || ''; });
  try { readTable_('Questions').rows.forEach(function (q) { if (q.topic && q.topic_name && String(q.form_id) === formId && typeof q.topic === 'string') names[q.topic] = String(q.topic_name); }); } catch (e) {}
  return names;
}

/** Everything about one completed attempt. session = Sessions row, rows = its Responses rows. */
function analyse_(session, rows, S, studentName) {
  var formId = String(session.form_id);
  var profile = profileFor_(formId);
  var sat = isSat_(profile);
  var types = typesFor_(sat);
  var tags = tagMap_(formId);
  var names = topicNames_(formId);
  // parts actually taken, in profile order
  var parts = [];
  profile.parts.forEach(function (p) {
    var pr = rows.filter(function (r) { return String(r.part) === p.part; });
    if (!pr.length) return;
    parts.push({ part: p.part, title: p.title, calculator: !!p.calculator, n: pr.length, limit_min: Math.round(p.time_limit_sec / 60),
                 pace: p.time_limit_sec / pr.length, used_min: partUsedMin_(session, p.part, p.time_limit_sec),
                 right: pr.filter(function (r) { return Number(r.correct) === 1; }).length });
  });
  var partOrder = parts.map(function (p) { return p.part; });
  var qs = rows.map(function (r) {
    var tg = tags[String(r.qid)] || {};
    var topic = String(tg.topic || r.topic || '?');
    var pp = parts.filter(function (p) { return p.part === String(r.part); })[0] || { pace: 1 };
    return { qid: String(r.qid), part: String(r.part), no: Number(r.display_no), unit: String(tg.unit || r.unit || '?'), topic: topic,
             name: names[topic] || tg.topic_name || '', p: String(r.profile), s: Number(r.time_total_sec) || 0, pace: pp.pace,
             flags: String(r.flags || ''), pattern: String(r.change_pattern || ''), diff: String(tg.difficulty || ''),
             answer: r.final_answer === undefined ? '' : String(r.final_answer) };
  }).sort(function (a, b) { return (partOrder.indexOf(a.part) - partOrder.indexOf(b.part)) || (a.no - b.no); });
  var n = qs.length;
  var right = qs.filter(function (q) { return isRightP_(q.p); }).length;
  var partTimes = {}; parts.forEach(function (p) { partTimes[p.part] = p.used_min; });
  var v = validity_(qs.map(function (q) { return { profile: q.p, time_total_sec: q.s, part: q.part }; }), partTimes, profile, S);
  // units → topics
  var unitsMap = {};
  qs.forEach(function (q) { (unitsMap[q.unit] = unitsMap[q.unit] || { u: q.unit, qs: [] }).qs.push(q); });
  var units = Object.keys(unitsMap).map(function (k) {
    var U = unitsMap[k], t = U.qs.length;
    var kk = U.qs.filter(function (q) { return isRightP_(q.p); }).length;
    var slow = U.qs.filter(function (q) { return q.p === 'SLOW_RIGHT' || q.p === 'SLOW_WRONG'; }).length;
    var st = unitStatus_(kk, t, slow, S);
    var tmap = {};
    U.qs.forEach(function (q) { (tmap[q.topic] = tmap[q.topic] || { code: q.topic, name: q.name, qs: [] }).qs.push(q); });
    var topics = Object.keys(tmap).map(function (c) { return tmap[c]; }).sort(function (a, b) { return topicCmp_(a.code, b.code); });
    return { u: U.u, name: unitName_(U.u), section: isSatUnit_(U.u) ? SAT_DOMAIN_SECTION_[U.u] : '', k: kk, t: t, slow: slow, status: st.label, cls: st.cls,
      topics: topics.map(function (T) {
        return { code: T.code, name: T.name, k: T.qs.filter(function (q) { return isRightP_(q.p); }).length, t: T.qs.length,
                 dots: T.qs.map(function (q) { return { part: q.part, no: q.no, p: q.p, s: q.s }; }) };
      }) };
  }).sort(function (a, b) { return unitOrder_(a.u) - unitOrder_(b.u); });
  var counts = {};
  Object.keys(types).forEach(function (k) { counts[k] = qs.filter(function (q) { return q.p === k; }).length; });
  var r2w = qs.filter(function (q) { return q.pattern === 'R→W'; }).length;
  var elimKey = qs.filter(function (q) { return q.flags.indexOf('ELIM_KEY') >= 0; }).length;
  // SAT sections: score + time per section, standard time per section (RW ≈ 71 s, Math ≈ 95 s — from the profile)
  var sections = sat ? sectionsOf_(profile).map(function (sec) {
    var ps = parts.filter(function (p) { return sec.parts.indexOf(p.part) >= 0; });
    var nn = ps.reduce(function (x, p) { return x + p.n; }, 0), lim = ps.reduce(function (x, p) { return x + p.limit_min; }, 0);
    return { id: sec.id, title: sec.title, n: nn, right: ps.reduce(function (x, p) { return x + p.right; }, 0),
             used: round_(ps.reduce(function (x, p) { return x + p.used_min; }, 0), 1), limit: lim,
             pace: nn ? ps.reduce(function (x, p) { return x + p.limit_min * 60; }, 0) / nn : 0 };
  }).filter(function (x) { return x.n; }) : [];
  var paces = sat ? sections.map(function (x) { return { label: x.id, sec: x.pace }; }) : parts.map(function (p) { return { label: 'Part ' + p.part, sec: p.pace }; });
  var stdText = sat ? 'standard time (' + paces.map(function (x) { return x.label + ' ≈ ' + paceStr_(x.sec, true); }).join(', ') + ')' : standardTimeText_(parts);
  // SAT estimated score (from the module scores; ticket #2)
  var estimate = null;
  if (sat) {
    var mods = {}; parts.forEach(function (p) { mods[p.part] = p.right; });
    try { estimate = satEstimate_(mods); } catch (e) { console.error('ESTIMATE FAILED: ' + e); }
  }
  var first = String(studentName || session.student_code).split(' (')[0];
  // summary (teacher)
  var summary;
  var wrongs = counts.FAST_WRONG + counts.SLOW_WRONG + counts.WRONG;
  var fastHigh = !v.reliable && n && right / n >= 0.8; // e.g. a retake done from memory
  if (!v.reliable) {
    summary = 'This attempt <b>cannot be used to judge the level</b>: ' + escHtml_(v.reasons.join(', ')) + '. ' +
      (fastHigh ? 'Many right answers but far too fast: the answers may be remembered from an earlier attempt. Give another form, or retake this one later, in real test conditions.'
                : 'Most likely random answers or an unfinished test. Ask for a retake in real test conditions.');
  } else {
    var weakU = units.filter(function (U) { return U.status === UNIT_STATUS_.BAD; });
    var goodU = units.filter(function (U) { return U.status === UNIT_STATUS_.OK; });
    var main;
    if (!wrongs) main = counts.BLANK ? 'No wrong answers, only ' + plural_(counts.BLANK, 'blank') + '.' : 'No wrong answers.';
    else if (counts.SLOW_WRONG >= counts.FAST_WRONG && counts.SLOW_WRONG >= counts.WRONG) main = 'Most wrong answers took <b>a long time and were still wrong</b> (' + counts.SLOW_WRONG + '/' + wrongs + '): gaps in knowledge, not carelessness.';
    else if (counts.FAST_WRONG >= counts.WRONG) main = 'Most wrong answers were <b>rushed</b> (' + counts.FAST_WRONG + '/' + wrongs + '): read the question more carefully, slow down.';
    else main = 'Most wrong answers took <b>normal time</b> (' + counts.WRONG + '/' + wrongs + '): the cause is not clear, go over each one with the student.';
    summary = escHtml_(first) + ' is solid in ' + (goodU.map(function (U) { return unitShort_(U.u); }).join(', ') || 'some areas') + '. ' +
      (weakU.length ? 'Most points lost in ' + weakU.map(function (U) { return unitFull_(U.u); }).join(' and ') + '. '
                    : (wrongs ? 'Wrong answers are spread out; no ' + (sat ? 'domain' : 'unit') + ' is below the reteach level. ' : '')) + main;
  }
  // actions (teacher, ≤ 4)
  var actions = [];
  var totalLimit = parts.reduce(function (a, p) { return a + p.limit_min; }, 0);
  if (!v.reliable && fastHigh) {
    actions.push('Next time give a new form (not taken yet), or wait a while before retaking this one.');
    actions.push('Time the full ' + totalLimit + ' minutes, like the real test, so the report shows real timing.');
  } else if (!v.reliable) {
    actions.push('Retake this form with the full ' + totalLimit + ' minutes, without stopping halfway.');
    actions.push('Remind the student: wrong answers cost nothing on the ' + (sat ? 'SAT' : 'AP exam') + ', but random answers hide what they really need to work on.');
  } else {
    units.filter(function (U) { return U.status === UNIT_STATUS_.BAD; }).sort(function (a, b) { return a.k / a.t - b.k / b.t; }).slice(0, 2).forEach(function (U) {
      var bad = U.topics.filter(function (T) { return T.dots.some(function (d) { return !isRightP_(d.p); }); }).map(function (T) { return sat ? T.name : T.code + ' ' + T.name; });
      actions.push(sat ? '<b>Reteach ' + escHtml_(unitFull_(U.u)) + '.</b> Missed skills: ' + bad.map(escHtml_).join('; ') + '.'
                       : '<b>Reteach Unit ' + U.u + ' – ' + escHtml_(U.name) + '.</b> Missed topics: ' + bad.map(escHtml_).join('; ') + '.');
    });
    if (counts.FAST_WRONG >= 2) actions.push('<b>Read carefully.</b> ' + counts.FAST_WRONG + ' answers were wrong because they were too fast: underline the conditions, reread the question before choosing.');
    if (counts.SLOW_RIGHT >= 2) actions.push('<b>Build speed.</b> ' + counts.SLOW_RIGHT + ' answers were right but took 1.5 × the standard time: timed practice on the same question types.');
    if (counts.BLANK) actions.push('<b>Never leave a blank.</b> ' + plural_(counts.BLANK, 'question') + ' left blank: with 2 minutes left, answer every remaining question.');
    if (r2w) actions.push('<b>Change answers only for a reason.</b> ' + plural_(r2w, 'answer') + ' changed from right to wrong.');
    if (!actions.length) actions.push('<b>Keep it up.</b> Give a new form at the same level or harder.');
  }
  actions = actions.slice(0, 4);
  var wrongList = qs.filter(function (q) { return !isRightP_(q.p); }).map(function (q) {
    var note = q.pattern === 'R→W' ? 'Chose the right answer, then changed it' : q.flags.indexOf('ELIM_KEY') >= 0 ? 'Crossed out the right answer' :
               q.flags.indexOf('GUESS_LIKELY') >= 0 ? 'Probably a guess' : q.pattern === 'cleared' ? 'Answered, then cleared' : '';
    return { part: q.part, no: q.no, topic: q.topic, name: q.name, type: types[q.p] ? types[q.p].t : q.p, s: q.s, blank: q.p === 'BLANK', note: note };
  });
  // timing sentence (also the Student_Report timing_pattern)
  var answeredQs = qs.filter(function (q) { return q.p !== 'BLANK'; });
  var slowN = answeredQs.filter(function (q) { return q.s > S.slow_ratio * q.pace; }).length;
  var fastN = answeredQs.filter(function (q) { return q.s < S.fast_ratio * q.pace; }).length;
  var timing = 'Used ' + parts.map(function (p) { return round_(p.used_min, 1) + '/' + p.limit_min + ' min ' + partLbl_(p.part, sat) + (p.used_min >= p.limit_min - 0.05 ? ' (time up)' : ''); }).join(', ') + '. ';
  if (answeredQs.length && fastN >= 0.8 * answeredQs.length) timing += 'Very fast overall: ' + fastN + '/' + answeredQs.length + ' answers in under half the ' + stdText + '.';
  else timing += 'Against the ' + stdText + ': ' + slowN + ' slower than 1.5 ×, ' + fastN + ' faster than half.';
  var sit = sittingsOf_(session, profile);
  return {
    sittings: sit.text, n_sittings: sit.n,
    session_id: String(session.session_id), student_code: normCode_(session.student_code), student: String(studentName || session.student_code),
    form_id: formId, form: formTitle_(profile, formId), attempt: Number(session.attempt_no),
    date: session.submitted_at ? fmtDate_(new Date(toMs_(session.submitted_at)), 'dd MMM yyyy, HH:mm') : '',
    n: n, right: right, pct: n ? Math.round(100 * right / n) : 0, parts: parts, used: v.used, limit: v.limit,
    valid: v.reliable, reasons: v.reasons, summary: summary, actions: actions, units: units, counts: counts, r2w: r2w, elimKey: elimKey,
    qs: qs.map(function (q) { return { qid: q.qid, part: q.part, no: q.no, p: q.p, s: q.s, pace: q.pace, diff: q.diff, unit: q.unit, topic: q.topic, name: q.name, answer: q.answer }; }),
    wrong: wrongList, std_text: stdText, timing: timing, types: types,
    sat: sat, sections: sections, paces: paces, estimate: estimate, estimate_text: estimate ? satEstimateText_(estimate) : '',
    score_line: sat ? sections.map(function (x) { return x.id + ' ' + x.right + '/' + x.n; }).join(' · ') + ' · total ' + right + '/' + n : ''
  };
}

/** "SAT · August 2026" / "AP Calculus AB · Practice Exam 2012 – Section I" */
function formTitle_(profile, formId) {
  var t = String((profile && profile.title) || formId), ex = String((profile && profile.exam) || '');
  return ex && t.indexOf(ex) !== 0 ? ex + ' · ' + t : t;
}

/** {n, text: "2 sittings: Part A 06/11 19:00–19:52 · Part B 08/11 20:10–21:00"} from the session's state_json. */
function sittingsOf_(session, profile) {
  var sat = isSat_(profile);
  var st = parseState_(session) || {};
  var starts = st.part_starts || {}, ends = st.part_end_at || {};
  var bits = [];
  profile.parts.forEach(function (p) {
    var a = starts[p.part]; if (!a) return;
    var b = ends[p.part] || (a + (Number(session['time_used_' + p.part + '_min']) || 0) * 60000);
    bits.push(partLbl_(p.part, sat) + ' ' + fmtDate_(new Date(a), 'dd/MM HH:mm') + '–' + fmtDate_(new Date(b), 'HH:mm'));
  });
  var n = Number(st.sit) || Number(session.n_sittings) || 1;
  return { n: n, text: bits.length ? plural_(n, 'sitting') + ': ' + bits.join(' · ') : '' };
}
function sittingsText_(session, profile) { return sittingsOf_(session, profile).text; }

function unitStatus_(k, t, slow, S) {
  if (t < S.min_questions_for_verdict) return { label: UNIT_STATUS_.FEW, cls: 'c-none' };
  if (k / t < S.weak_accuracy) return { label: UNIT_STATUS_.BAD, cls: 'c-bad' };
  if (slow / t >= S.unit_slow_ratio) return { label: UNIT_STATUS_.SLOW, cls: 'c-warn' };
  return { label: UNIT_STATUS_.OK, cls: 'c-good' };
}

/** Minutes used in one part: the Sessions column when it exists (AP: time_used_A_min …), else from the saved state
 *  (SAT modules: part_end_at − part_starts, written by the server when the module ended). */
function partUsedMin_(session, part, limitSec) {
  var col = 'time_used_' + part + '_min';
  if (Object.prototype.hasOwnProperty.call(session, col) && session[col] !== '') return Number(session[col]) || 0;
  var st = parseState_(session) || {};
  var a = (st.part_starts || {})[part], b = (st.part_end_at || {})[part];
  if (!a || !b) return 0;
  return round_(Math.min(limitSec * 1000, Math.max(0, b - a)) / 60000, 1);
}

function topicCmp_(a, b) {
  var ia = SAT_SKILL_ORDER_.indexOf(String(a)), ib = SAT_SKILL_ORDER_.indexOf(String(b));
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  var pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  return ((pa[0] || 0) - (pb[0] || 0)) || ((pa[1] || 0) - (pb[1] || 0));
}

/* ============================== result page (student app + teacher mode) ============================== */

var STUDENT_SITTINGS_NOTE_ = 'You took this test in 2 sessions on different days. Your score on the real test may be lower than this result.';
var ESTIMATE_NOTE_ = 'Estimated from public score charts for the real SAT (hard Module 2 route). This is a practice form, so your real score can differ.';

/** The result page of one attempt — same content for the student and for the teacher (teacher adds nothing secret here).
 *  No key, no explanations. a = analyse_() output. */
function studentView_(a, profile) {
  var sat = a.sat;
  var out = {
    ok: true, session_id: a.session_id, form_id: a.form_id, title: a.form, attempt: a.attempt, date: a.date, sat: sat,
    total: { right: a.right, n: a.n, pct: a.pct },
    parts: a.parts.map(function (p) { return { part: p.part, title: p.title, right: p.right, n: p.n, used_min: round_(p.used_min, 1), limit_min: p.limit_min }; }),
    sections: a.sections.map(function (s) { return { id: s.id, title: s.title || SECTION_EN_[s.id] || s.id, right: s.right, n: s.n }; }),
    valid: a.valid, reasons: a.reasons, n_sittings: a.n_sittings,
    sittings_note: a.n_sittings > 1 ? STUDENT_SITTINGS_NOTE_ : ''
  };
  if (a.estimate && (a.estimate.RW || a.estimate.Math)) {
    var e = a.estimate, pick = function (x) { return x ? { score: x.score, low: x.low, high: x.high, note: x.note } : null; };
    out.estimate = { total: e.total, RW: pick(e.RW), Math: pick(e.Math), note: ESTIMATE_NOTE_ };
  }
  // section → domain → skill (SAT) / units → topics (AP): "x/y correct"
  var groupDefs = sat ? out.sections.map(function (s) { return { id: s.id, title: s.title }; }) : [{ id: '', title: 'Units' }];
  out.groups = groupDefs.map(function (g) {
    var us = a.units.filter(function (U) { return sat ? U.section === g.id : true; });
    return { id: g.id, title: g.title, rows: us.map(function (U) {
      return { name: sat ? U.name : 'Unit ' + U.u + ' · ' + U.name, right: U.k, n: U.t,
               items: U.topics.map(function (T) { return { name: sat ? T.name : T.code + ' ' + T.name, right: T.k, n: T.t }; }) };
    }) };
  });
  // error types (plain English)
  out.types = ['FAST_WRONG', 'SLOW_WRONG', 'WRONG', 'SLOW_RIGHT', 'BLANK'].map(function (k) {
    return { type: k, label: a.types[k].t, n: a.counts[k] || 0, meaning: a.types[k].m };
  });
  // what to practise first (≤ 4): quick wins (easy/medium missed) → weakest skills → habits
  var practise = [];
  if (!a.valid) {
    practise.push('Take the test again in real test conditions: the full time, in one go, answering every question.');
  } else {
    var missedEM = a.qs.filter(function (q) { return !isRightP_(q.p) && (q.diff === 'E' || q.diff === 'M'); });
    var bySkill = {};
    missedEM.forEach(function (q) { var k = q.name || q.topic; (bySkill[k] = bySkill[k] || []).push(q); });
    Object.keys(bySkill).sort(function (x, y) { return bySkill[y].length - bySkill[x].length; }).slice(0, 2).forEach(function (k) {
      var list = bySkill[k];
      practise.push('Quick win — ' + k + ': you missed ' + plural_(list.length, 'easier question') + ' (' + list.map(function (q) { return partLbl_(q.part, sat) + ' Q' + q.no; }).join(', ') + ').');
    });
    var skills = [];
    a.units.forEach(function (U) { U.topics.forEach(function (T) { if (T.t >= 2 && T.k / T.t < 0.6) skills.push(T); }); });
    skills.sort(function (x, y) { return (x.k / x.t - y.k / y.t) || (y.t - x.t); });
    skills.forEach(function (T) {
      if (practise.length >= 3) return;
      var nm = sat ? T.name : T.code + ' ' + T.name;
      if (practise.some(function (p) { return p.indexOf(nm) >= 0; })) return;
      practise.push('Practise ' + nm + ': ' + T.k + ' of ' + T.t + ' right.');
    });
    if (a.counts.FAST_WRONG >= 2 && practise.length < 4) practise.push('Slow down: ' + a.counts.FAST_WRONG + ' answers were quick and wrong. Read every question to the end before you choose.');
    if (a.counts.BLANK && practise.length < 4) practise.push('Never leave a question blank: ' + plural_(a.counts.BLANK, 'blank') + '. A guess costs nothing.');
    if (a.counts.SLOW_RIGHT >= 2 && practise.length < 4) practise.push('Work on speed: ' + a.counts.SLOW_RIGHT + ' answers were right but slow.');
    if (!practise.length) practise.push('Great work. Try a new practice test at the same level.');
  }
  out.practise = practise.slice(0, 4);
  // questions for the review list: by part, ✓ ✗ – (no key)
  out.review = a.parts.map(function (p) {
    return { part: p.part, title: p.title, questions: a.qs.filter(function (q) { return q.part === p.part; }).map(function (q) {
      return { qid: q.qid, no: q.no, status: q.p === 'BLANK' ? 'blank' : (isRightP_(q.p) ? 'right' : 'wrong'), time_s: Math.round(q.s) };
    }) };
  });
  return out;
}

/* ============================== Topic_Summary + Student_Report (per student, on each submit) ============================== */

function rebuildStudent_(studentCode) {
  var codeN = normCode_(studentCode);
  var S = getSettings_();
  var st = findStudent_(codeN);
  var name = st ? String(st.name || '') : codeN;
  var sessions = readTable_('Sessions').rows.filter(function (r) {
    return normCode_(r.student_code) === codeN && (String(r.status) === 'completed' || String(r.status) === 'timeout');
  }).filter(function (r) { return !!regEntry_(String(r.form_id)); }); // a form without its data (old id) cannot be analysed
  var ids = {};
  sessions.forEach(function (s) { ids[String(s.session_id)] = s; });
  var resp = readTable_('Responses').rows.filter(function (r) { return ids[String(r.session_id)]; });
  var bySession = {};
  resp.forEach(function (r) { (bySession[String(r.session_id)] = bySession[String(r.session_id)] || []).push(r); });
  var updated = nowIso_();
  var reports = {};
  sessions.forEach(function (s) { reports[String(s.session_id)] = analyse_(s, bySession[String(s.session_id)] || [], S, name); });
  // Sessions.reliable / n_sittings always follow the current Settings (also for attempts made before these columns existed)
  sessions.forEach(function (s) {
    var a = reports[String(s.session_id)];
    var stt = parseState_(s) || {};
    var want = { reliable: a.valid ? 'Yes' : 'No', n_sittings: Number(stt.sit) || Number(s.n_sittings) || 1 };
    if (String(s.reliable) !== want.reliable || Number(s.n_sittings) !== want.n_sittings) updateRow_('Sessions', s._row, want);
  });
  var reliable = sessions.filter(function (s) { return reports[String(s.session_id)].valid; });

  // ---- Topic_Summary: per form = latest RELIABLE attempt; ALL = every reliable attempt of every form
  var topicRows = [];
  var latest = {};
  reliable.forEach(function (s) {
    var f = String(s.form_id);
    if (!latest[f] || Number(s.attempt_no) > Number(latest[f].attempt_no)) latest[f] = s;
  });
  Object.keys(latest).sort().forEach(function (f) {
    topicRows = topicRows.concat(topicSummaryRows_(codeN, f, bySession[String(latest[f].session_id)] || [], f, S, updated));
  });
  // ALL rows per exam: AP → "ALL", SAT → "ALL-SAT" (every reliable SAT attempt) — never mixed
  var byExam = {};
  reliable.forEach(function (s) {
    var pf = null; try { pf = profileFor_(String(s.form_id)); } catch (e) {}
    var ex = pf && isSat_(pf) ? 'ALL-SAT' : 'ALL';
    byExam[ex] = (byExam[ex] || []).concat(bySession[String(s.session_id)] || []);
  });
  ['ALL', 'ALL-SAT'].forEach(function (ex) {
    if (byExam[ex]) topicRows = topicRows.concat(topicSummaryRows_(codeN, ex, byExam[ex], null, S, updated));
  });
  rewriteTable_('Topic_Summary', function (r) { return normCode_(r.student_code) !== codeN; }, topicRows);

  // ---- Student_Report: one row per completed attempt, oldest first (by real time)
  var reportRows = sessions.slice().sort(function (a, b) { return toMs_(a.submitted_at) - toMs_(b.submitted_at); }).map(function (s) {
    return studentReportRow_(s, reports[String(s.session_id)], S);
  });
  rewriteTable_('Student_Report', function (r) { return normCode_(r.student_code) !== codeN || (!ids[String(r.session_id)] && !regEntry_(String(r.form_id))); }, reportRows);
}

function topicSummaryRows_(code, formLabel, rows, formId, S, updated) {
  var tagsByForm = {}, names = {};
  function tagOf(r) {
    var f = String(r.form_id);
    if (!tagsByForm[f]) { tagsByForm[f] = formData_(f) ? tagMap_(f) : {}; var nm = formData_(f) ? topicNames_(f) : {}; Object.keys(nm).forEach(function (k) { names[k] = nm[k]; }); }
    return tagsByForm[f][String(r.qid)] || {};
  }
  var byUnit = {};
  rows.forEach(function (r) {
    var tg = tagOf(r);
    var u = String(tg.unit || r.unit || '?'), t = String(tg.topic || r.topic || '?');
    (byUnit[u] = byUnit[u] || { rows: [], topics: {} }).rows.push(r);
    (byUnit[u].topics[t] = byUnit[u].topics[t] || []).push(r);
  });
  var out = [];
  Object.keys(byUnit).sort(function (a, b) { return unitOrder_(a) - unitOrder_(b); }).forEach(function (u) {
    if (isSatUnit_(u)) out.push(topicAgg_(code, formLabel, u, u, u + ' · ' + unitName_(u) + ' (' + SAT_DOMAIN_SECTION_[u] + ')', byUnit[u].rows, S, updated));
    else out.push(topicAgg_(code, formLabel, u, 'Unit ' + u, 'Unit ' + u + ' · ' + unitName_(u), byUnit[u].rows, S, updated));
    Object.keys(byUnit[u].topics).sort(topicCmp_).forEach(function (t) {
      out.push(topicAgg_(code, formLabel, u, t, names[t] || '', byUnit[u].topics[t], S, updated));
    });
  });
  return out;
}

function topicAgg_(code, formLabel, unit, topic, name, rows, S, updated) {
  var n = rows.length;
  var c = rows.filter(function (r) { return Number(r.correct) === 1; }).length;
  var cnt = function (p) { return rows.filter(function (r) { return String(r.profile) === p; }).length; };
  var avg = n ? rows.reduce(function (a, r) { return a + (Number(r.pace_ratio) || 0); }, 0) / n : 0;
  var counts = { FAST_WRONG: cnt('FAST_WRONG'), SLOW_WRONG: cnt('SLOW_WRONG'), WRONG: cnt('WRONG'), BLANK: cnt('BLANK'), SLOW_RIGHT: cnt('SLOW_RIGHT') };
  var st = unitStatus_(c, n, counts.SLOW_RIGHT + counts.SLOW_WRONG, S);
  var verdict = st.label + ' (' + c + '/' + n + ' right)';
  if (st.label === UNIT_STATUS_.BAD) {
    var dom = ['SLOW_WRONG', 'FAST_WRONG', 'BLANK', 'WRONG'].sort(function (a, b) { return counts[b] - counts[a]; })[0];
    if (counts[dom]) verdict += ': ' + counts[dom] + ' × "' + TYPE_EN_[dom].t + '"';
  }
  return {
    student_code: code, form_id: formLabel, unit: unit, topic: txt_(topic), topic_name: name, n_attempted: n, n_correct: c,
    accuracy: round_(n ? c / n : 0, 2), avg_pace_ratio: round_(avg, 2), n_fast_wrong: counts.FAST_WRONG, n_slow_wrong: counts.SLOW_WRONG,
    n_slow_right: counts.SLOW_RIGHT, n_blank: counts.BLANK,
    n_changed_R_to_W: rows.filter(function (r) { return String(r.change_pattern) === 'R→W'; }).length,
    verdict: verdict, updated_at: updated
  };
}

function studentReportRow_(s, a, S) {
  var weak = '', main = '—';
  if (!a.valid) { weak = '— (not reliable)'; main = 'Not judged (not reliable)'; }
  else {
    var cand = a.units.filter(function (U) { return U.status !== UNIT_STATUS_.FEW && U.k < U.t; })
      .sort(function (x, y) { return (x.k / x.t - y.k / y.t) || ((y.t - y.k) - (x.t - x.k)); });
    var bad = cand.filter(function (U) { return U.status === UNIT_STATUS_.BAD; });
    var pick = bad.concat(cand.filter(function (U) { return bad.indexOf(U) < 0; })).slice(0, 3);
    weak = pick.map(function (U) { return (isSatUnit_(U.u) ? U.name : 'Unit ' + U.u + ' ' + U.name) + ' (' + U.k + '/' + U.t + ')'; }).join('; ') ||
           (a.sat ? 'No weak domain' : 'No weak unit');
    var errs = ['SLOW_WRONG', 'FAST_WRONG', 'WRONG', 'BLANK'].filter(function (k) { return a.counts[k]; })
      .sort(function (x, y) { return a.counts[y] - a.counts[x]; });
    if (errs.length) main = a.types[errs[0]].t + ' (' + plural_(a.counts[errs[0]], 'question') + ')';
  }
  return {
    session_id: s.session_id, student_code: normCode_(s.student_code), form_id: s.form_id, attempt_no: s.attempt_no,
    submitted_at: a.date ? fmtDate_(new Date(toMs_(s.submitted_at)), 'yyyy-MM-dd HH:mm') : '',
    total_correct: a.right, percent: a.n ? round_(a.right / a.n, 4) : 0, weakest_topics: weak, main_error_profile: main,
    timing_pattern: a.timing, summary: (a.score_line ? a.score_line + '. ' : '') + stripTags_(a.summary), reliable: a.valid ? 'Yes' : 'No',
    sittings: a.sittings, estimated_score: a.estimate_text || ''
  };
}

/** Rebuild Topic_Summary + Student_Report for every student (e.g. after changing thresholds in Settings). */
function rebuildAll_() {
  var codes = {};
  readTable_('Sessions').rows.forEach(function (r) { codes[normCode_(r.student_code)] = 1; });
  Object.keys(codes).forEach(function (c) { rebuildStudent_(c); });
  var n = refreshReportList_(); // also creates the Report tab the first time
  return 'Rebuilt ' + Object.keys(codes).length + ' students; Report tab list: ' + n + ' attempts';
}
