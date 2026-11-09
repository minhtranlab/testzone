/**
 * Test Zone — analysis for the Report tab and the summary tabs (rule-based, no AI).
 *   validity_()        reliable / not reliable attempt (thresholds in Settings)
 *   analyse_()         everything the Report tab and the Student_Report tab show for one attempt
 *   rebuildStudent_()  Topic_Summary + Student_Report rows of one student (called on every submit)
 *   (the Report tab of the Sheet is drawn by ReportTab.gs from analyse_())
 */

var UNIT_VI_ = {
  1: 'Giới hạn và liên tục', 2: 'Đạo hàm: định nghĩa và quy tắc cơ bản', 3: 'Đạo hàm hàm hợp, hàm ẩn, hàm ngược',
  4: 'Ứng dụng đạo hàm trong bài toán thực tế', 5: 'Khảo sát hàm bằng đạo hàm', 6: 'Tích phân và tích luỹ',
  7: 'Phương trình vi phân', 8: 'Ứng dụng tích phân'
};
var TYPE_VI_ = {
  RIGHT: { t: 'Đúng', m: 'Làm đúng trong thời gian hợp lý.' },
  SLOW_RIGHT: { t: 'Đúng nhưng chậm', m: 'Biết làm nhưng mất hơn 1,5 lần thời gian chuẩn. Thi thật dễ thiếu giờ.' },
  FAST_WRONG: { t: 'Sai vì vội', m: 'Làm nhanh hơn một nửa thời gian chuẩn mà vẫn sai: đọc lướt hoặc dính bẫy.' },
  SLOW_WRONG: { t: 'Sai vì chưa nắm bài', m: 'Làm lâu mà vẫn sai: hổng kiến thức hoặc không có cách làm.' },
  WRONG: { t: 'Sai (thời gian bình thường)', m: 'Không rõ nguyên nhân từ thời gian, cần hỏi lại học sinh.' },
  BLANK: { t: 'Bỏ trống', m: 'Không chọn đáp án. AP không trừ điểm câu sai, nên luôn phải điền.' }
};
var UNIT_STATUS_ = { BAD: 'Cần học lại', SLOW: 'Đúng nhưng chậm', OK: 'Ổn', FEW: 'Ít dữ liệu' };

/* SAT: domains (= "unit" tag) and skills (= "topic" tag), from data/taxonomy/sat_skills.csv */
var SAT_DOMAIN_VI_ = { INI: 'Thông tin và ý tưởng', CAS: 'Kỹ thuật và cấu trúc văn bản', EOI: 'Diễn đạt ý', SEC: 'Ngữ pháp chuẩn',
  H: 'Đại số tuyến tính', P: 'Toán nâng cao (phi tuyến)', Q: 'Giải toán và phân tích dữ liệu', S: 'Hình học và lượng giác' };
var SAT_DOMAIN_SECTION_ = { INI: 'RW', CAS: 'RW', EOI: 'RW', SEC: 'RW', H: 'Math', P: 'Math', Q: 'Math', S: 'Math' };
var SAT_DOMAIN_ORDER_ = ['INI', 'CAS', 'EOI', 'SEC', 'H', 'P', 'Q', 'S'];
var SAT_SKILL_ORDER_ = ['INI.CID', 'INI.COE-T', 'INI.COE-Q', 'INI.INF', 'CAS.WIC', 'CAS.TSP', 'CAS.CTC', 'EOI.SYN', 'EOI.TRA', 'SEC.BOU', 'SEC.FSS',
  'H.A', 'H.B', 'H.C', 'H.D', 'H.E', 'P.A', 'P.B', 'P.C', 'Q.A', 'Q.B', 'Q.C', 'Q.D', 'Q.E', 'Q.F', 'Q.G', 'S.A', 'S.B', 'S.C', 'S.D'];
var SECTION_VI_ = { RW: 'Đọc và Viết (RW)', Math: 'Toán (Math)' };

function isSatUnit_(u) { return Object.prototype.hasOwnProperty.call(SAT_DOMAIN_VI_, String(u)); }
function unitName_(u) { return isSatUnit_(u) ? SAT_DOMAIN_VI_[String(u)] : (UNIT_VI_[Number(u)] || ('Unit ' + u)); }
/** "Unit 6" (AP) / "Ngữ pháp chuẩn" (SAT) */
function unitShort_(u) { return isSatUnit_(u) ? SAT_DOMAIN_VI_[String(u)] : 'Unit ' + u; }
/** "Unit 6 (Tích phân …)" (AP) / "Ngữ pháp chuẩn (RW)" (SAT) */
function unitFull_(u) { return isSatUnit_(u) ? SAT_DOMAIN_VI_[String(u)] + ' (' + SAT_DOMAIN_SECTION_[String(u)] + ')' : 'Unit ' + u + ' (' + unitName_(u) + ')'; }
function unitOrder_(u) { var i = SAT_DOMAIN_ORDER_.indexOf(String(u)); return i >= 0 ? 100 + i : (Number(u) || 99); }
/** "Part A" (AP) / "RW1" (SAT module) */
function partLbl_(p, sat) { return sat ? String(p) : 'Part ' + p; }
/** AP "2 phút/câu" (unchanged) · SAT "71 giây/câu" */
function paceStr_(sec, sat) { return sat ? Math.round(sec) + ' giây/câu' : paceText_(sec); }
/** Error types; SAT only changes the blank-answer sentence. */
function typesFor_(sat) {
  if (!sat) return TYPE_VI_;
  var t = JSON.parse(JSON.stringify(TYPE_VI_));
  t.BLANK.m = 'Không điền đáp án. SAT không trừ điểm câu sai, nên luôn phải điền.';
  return t;
}
function isRightP_(p) { return p === 'RIGHT' || p === 'SLOW_RIGHT'; }
function isWrongP_(p) { return p === 'FAST_WRONG' || p === 'SLOW_WRONG' || p === 'WRONG'; }
function vnNum_(x) { return String(x).replace('.', ','); }
function escHtml_(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function stripTags_(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
function toMs_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var d = new Date(String(v).replace(' ', 'T') + (String(v).length > 10 && !/[zZ+]/.test(String(v).slice(10)) ? '+07:00' : ''));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function paceText_(sec) { var m = Math.round(sec / 60 * 2) / 2; return vnNum_(m) + ' phút/câu'; }
/** "thời gian chuẩn (Part A ≈ 2 phút/câu, Part B ≈ 3 phút/câu)" */
function standardTimeText_(parts) {
  return 'thời gian chuẩn (' + parts.map(function (p) { return 'Part ' + p.part + ' ≈ ' + paceText_(p.pace); }).join(', ') + ')';
}

/**
 * rows: per-question objects with profile, time_total_sec, part; partTimesMin: {part: minutes used}; profile: exam profile.
 * Not reliable when: time used < valid_min_time_ratio × limit, or ≥ valid_quick_ratio of answered questions took
 * < guess_min_time_sec, or ≥ valid_blank_ratio blank.
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
      if (sl && su < S.valid_min_time_ratio * sl) reasons.push(sec.id + ' chỉ dùng ' + vnNum_(su) + '/' + sl + ' phút');
    });
  } else if (limit && used < S.valid_min_time_ratio * limit) reasons.push('chỉ dùng ' + vnNum_(used) + '/' + limit + ' phút');
  if (answered && quick / answered >= S.valid_quick_ratio) reasons.push(quick + '/' + answered + ' câu chọn đáp án trong dưới ' + S.guess_min_time_sec + ' giây');
  if (n && blank / n >= S.valid_blank_ratio) reasons.push(blank + ' câu bỏ trống');
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
  var fd = formData_(formId);
  var qmeta = {};
  if (fd) fd.questions.forEach(function (q) { qmeta[q.qid] = q; });
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
             flags: String(r.flags || ''), pattern: String(r.change_pattern || '') };
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
    return { u: U.u, name: unitName_(U.u), k: kk, t: t, slow: slow, status: st.label, cls: st.cls, topics: topics.map(function (T) {
      return { code: T.code, name: T.name, dots: T.qs.map(function (q) { return { part: q.part, no: q.no, p: q.p, s: q.s }; }) };
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
  var stdText = sat ? 'thời gian chuẩn (' + paces.map(function (x) { return x.label + ' ≈ ' + paceStr_(x.sec, true); }).join(', ') + ')' : standardTimeText_(parts);
  var first = String(studentName || session.student_code).split(' (')[0];
  // summary
  var summary;
  var wrongs = counts.FAST_WRONG + counts.SLOW_WRONG + counts.WRONG;
  var fastHigh = !v.reliable && n && right / n >= 0.8; // e.g. a retake done from memory
  if (!v.reliable) {
    summary = 'Bài này <b>không dùng để đánh giá được</b>: ' + escHtml_(v.reasons.join(', ')) + '. ' +
      (fastHigh ? 'Đúng nhiều nhưng làm quá nhanh, có thể nhớ đáp án từ lần trước. Nên cho một đề khác, hoặc làm lại sau một thời gian, trong điều kiện thi thật.'
                : 'Nhiều khả năng học sinh chọn bừa hoặc bỏ dở. Nên cho làm lại trong điều kiện thi thật.');
  } else {
    var weakU = units.filter(function (U) { return U.status === UNIT_STATUS_.BAD; });
    var goodU = units.filter(function (U) { return U.status === UNIT_STATUS_.OK; });
    var main;
    if (!wrongs) main = counts.BLANK ? 'Không có câu sai, chỉ có ' + counts.BLANK + ' câu bỏ trống.' : 'Không có câu sai.';
    else if (counts.SLOW_WRONG >= counts.FAST_WRONG && counts.SLOW_WRONG >= counts.WRONG) main = 'Phần lớn câu sai là <b>làm lâu mà vẫn sai</b> (' + counts.SLOW_WRONG + '/' + wrongs + '), tức là hổng kiến thức chứ không phải do ẩu.';
    else if (counts.FAST_WRONG >= counts.WRONG) main = 'Phần lớn câu sai là <b>làm vội</b> (' + counts.FAST_WRONG + '/' + wrongs + '): đọc đề chưa kỹ, cần chậm lại.';
    else main = 'Phần lớn câu sai làm trong <b>thời gian bình thường</b> (' + counts.WRONG + '/' + wrongs + '): chưa rõ nguyên nhân, nên hỏi lại học sinh từng câu.';
    summary = escHtml_(first) + ' làm chắc ' + (goodU.map(function (U) { return unitShort_(U.u); }).join(', ') || 'một số phần') + '. ' +
      (weakU.length ? 'Mất điểm nhiều nhất ở ' + weakU.map(function (U) { return unitFull_(U.u); }).join(' và ') + '. '
                    : (wrongs ? 'Các câu sai rải rác nhiều phần, không ' + (sat ? 'mảng' : 'Unit') + ' nào dưới mức cần học lại. ' : '')) + main;
  }
  // actions (≤ 4)
  var actions = [];
  var totalLimit = parts.reduce(function (a, p) { return a + p.limit_min; }, 0);
  if (!v.reliable && fastHigh) {
    actions.push('Lần sau cho một đề khác (chưa làm), hoặc đợi một thời gian rồi mới cho làm lại đề này.');
    actions.push('Bấm giờ đủ ' + totalLimit + ' phút và làm như thi thật, để báo cáo phản ánh đúng thời gian làm bài.');
  } else if (!v.reliable) {
    actions.push('Cho làm lại đề này, bấm giờ đủ ' + totalLimit + ' phút, không bỏ dở.');
    actions.push('Nhắc học sinh: ' + (sat ? 'SAT' : 'AP') + ' không trừ điểm câu sai, nhưng chọn bừa thì báo cáo không cho biết em yếu ở đâu.');
  } else {
    units.filter(function (U) { return U.status === UNIT_STATUS_.BAD; }).sort(function (a, b) { return a.k / a.t - b.k / b.t; }).slice(0, 2).forEach(function (U) {
      var bad = U.topics.filter(function (T) { return T.dots.some(function (d) { return !isRightP_(d.p); }); }).map(function (T) { return sat ? T.name : T.code + ' ' + T.name; });
      actions.push(sat ? '<b>Dạy lại mảng ' + escHtml_(unitFull_(U.u)) + '.</b> Các câu sai thuộc kỹ năng: ' + bad.map(escHtml_).join('; ') + '.'
                       : '<b>Dạy lại Unit ' + U.u + ' – ' + escHtml_(U.name) + '.</b> Các câu sai thuộc: ' + bad.map(escHtml_).join('; ') + '.');
    });
    if (counts.FAST_WRONG >= 2) actions.push('<b>Luyện đọc đề kỹ.</b> ' + counts.FAST_WRONG + ' câu sai vì làm quá nhanh: gạch chân điều kiện, đọc lại câu hỏi trước khi chọn.');
    if (counts.SLOW_RIGHT >= 2) actions.push('<b>Luyện tốc độ.</b> ' + counts.SLOW_RIGHT + ' câu đúng nhưng mất gấp rưỡi thời gian chuẩn: cho bài cùng dạng có bấm giờ.');
    if (counts.BLANK) actions.push('<b>Không bỏ trống.</b> ' + counts.BLANK + ' câu bỏ trống: khi còn 2 phút, chọn đáp án cho mọi câu còn lại.');
    if (r2w) actions.push('<b>Đổi đáp án có căn cứ.</b> ' + r2w + ' câu đã chọn đúng rồi đổi sang sai.');
    if (!actions.length) actions.push('<b>Giữ phong độ.</b> Cho đề mới cùng mức hoặc khó hơn.');
  }
  actions = actions.slice(0, 4);
  var wrongList = qs.filter(function (q) { return !isRightP_(q.p); }).map(function (q) {
    var note = q.pattern === 'R→W' ? 'Đã chọn đúng rồi đổi' : q.flags.indexOf('ELIM_KEY') >= 0 ? 'Gạch bỏ chính đáp án đúng' :
               q.flags.indexOf('GUESS_LIKELY') >= 0 ? 'Có vẻ đoán' : q.pattern === 'cleared' ? 'Đã chọn rồi xoá' : '';
    return { part: q.part, no: q.no, topic: q.topic, name: q.name, type: types[q.p] ? types[q.p].t : q.p, s: q.s, blank: q.p === 'BLANK', note: note };
  });
  // timing sentence (also the Student_Report timing_pattern)
  var answeredQs = qs.filter(function (q) { return q.p !== 'BLANK'; });
  var slowN = answeredQs.filter(function (q) { return q.s > S.slow_ratio * q.pace; }).length;
  var fastN = answeredQs.filter(function (q) { return q.s < S.fast_ratio * q.pace; }).length;
  var timing = 'Dùng ' + parts.map(function (p) { return vnNum_(round_(p.used_min, 1)) + '/' + p.limit_min + ' phút ' + partLbl_(p.part, sat) + (p.used_min >= p.limit_min - 0.05 ? ' (hết giờ)' : ''); }).join(', ') + '. ';
  if (answeredQs.length && fastN >= 0.8 * answeredQs.length) timing += 'Cả bài làm rất nhanh: ' + fastN + '/' + answeredQs.length + ' câu đã chọn dưới một nửa ' + stdText + '.';
  else timing += 'So với ' + stdText + ': ' + slowN + ' câu chậm hơn 1,5 lần, ' + fastN + ' câu nhanh hơn một nửa.';
  return {
    sittings: sittingsText_(session, profile),
    session_id: String(session.session_id), student_code: normCode_(session.student_code), student: String(studentName || session.student_code),
    form_id: formId, form: (profile.exam || '') + ' · ' + (profile.title || formId), attempt: Number(session.attempt_no),
    date: session.submitted_at ? fmtDate_(new Date(toMs_(session.submitted_at)), 'dd/MM/yyyy HH:mm') : '',
    n: n, right: right, pct: n ? Math.round(100 * right / n) : 0, parts: parts, used: v.used, limit: v.limit,
    valid: v.reliable, reasons: v.reasons, summary: summary, actions: actions, units: units, counts: counts, r2w: r2w, elimKey: elimKey,
    qs: qs.map(function (q) { return { part: q.part, no: q.no, p: q.p, s: q.s, pace: q.pace }; }), wrong: wrongList,
    std_text: stdText, timing: timing, types: types,
    sat: sat, sections: sections, paces: paces,
    score_line: sat ? sections.map(function (x) { return x.id + ' ' + x.right + '/' + x.n; }).join(' · ') + ' · tổng ' + right + '/' + n : ''
  };
}

/** "Làm 2 lần: Part A 06/11 19:00–19:52 · Part B 08/11 20:10–21:00" (from the session's state_json). */
function sittingsText_(session, profile) {
  var sat = isSat_(profile);
  var st = parseState_(session) || {};
  var starts = st.part_starts || {}, ends = st.part_end_at || {};
  var bits = [];
  profile.parts.forEach(function (p) {
    var a = starts[p.part]; if (!a) return;
    var b = ends[p.part] || (a + (Number(session['time_used_' + p.part + '_min']) || 0) * 60000);
    bits.push(partLbl_(p.part, sat) + ' ' + fmtDate_(new Date(a), 'dd/MM HH:mm') + '–' + fmtDate_(new Date(b), 'HH:mm'));
  });
  if (!bits.length) return '';
  var n = Number(st.sit) || Number(session.n_sittings) || 1;
  return 'Làm ' + n + ' lần: ' + bits.join(' · ');
}

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

/* ============================== Topic_Summary + Student_Report (per student, on each submit) ============================== */

function rebuildStudent_(studentCode) {
  var codeN = normCode_(studentCode);
  var S = getSettings_();
  var st = findStudent_(codeN);
  var name = st ? String(st.name || '') : codeN;
  var sessions = readTable_('Sessions').rows.filter(function (r) {
    return normCode_(r.student_code) === codeN && (String(r.status) === 'completed' || String(r.status) === 'timeout');
  });
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
    var st = parseState_(s) || {};
    var want = { reliable: a.valid ? 'Yes' : 'No', n_sittings: Number(st.sit) || Number(s.n_sittings) || 1 };
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
  // ALL rows per exam: AP → "ALL" (as before), SAT → "ALL-SAT" (every reliable SAT attempt) — never mixed
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
  rewriteTable_('Student_Report', function (r) { return normCode_(r.student_code) !== codeN; }, reportRows);
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
  var verdict = st.label + ' (' + c + '/' + n + ' đúng)';
  if (st.label === UNIT_STATUS_.BAD) {
    var dom = ['SLOW_WRONG', 'FAST_WRONG', 'BLANK', 'WRONG'].sort(function (a, b) { return counts[b] - counts[a]; })[0];
    if (counts[dom]) verdict += ': ' + counts[dom] + ' câu "' + TYPE_VI_[dom].t + '"';
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
  if (!a.valid) { weak = '— (bài không đáng tin)'; main = 'Không đánh giá (bài không đáng tin)'; }
  else {
    var cand = a.units.filter(function (U) { return U.status !== UNIT_STATUS_.FEW && U.k < U.t; })
      .sort(function (x, y) { return (x.k / x.t - y.k / y.t) || ((y.t - y.k) - (x.t - x.k)); });
    var bad = cand.filter(function (U) { return U.status === UNIT_STATUS_.BAD; });
    var pick = bad.concat(cand.filter(function (U) { return bad.indexOf(U) < 0; })).slice(0, 3);
    weak = pick.map(function (U) { return (isSatUnit_(U.u) ? U.name : 'Unit ' + U.u + ' ' + U.name) + ' (' + U.k + '/' + U.t + ')'; }).join('; ') ||
           (a.sat ? 'Không có mảng yếu' : 'Không có Unit yếu');
    var errs = ['SLOW_WRONG', 'FAST_WRONG', 'WRONG', 'BLANK'].filter(function (k) { return a.counts[k]; })
      .sort(function (x, y) { return a.counts[y] - a.counts[x]; });
    if (errs.length) main = a.types[errs[0]].t + ' (' + a.counts[errs[0]] + ' câu)';
  }
  return {
    session_id: s.session_id, student_code: normCode_(s.student_code), form_id: s.form_id, attempt_no: s.attempt_no,
    submitted_at: a.date ? fmtDate_(new Date(toMs_(s.submitted_at)), 'yyyy-MM-dd HH:mm') : '',
    total_correct: a.right, percent: a.n ? round_(a.right / a.n, 4) : 0, weakest_topics: weak, main_error_profile: main,
    timing_pattern: a.timing, summary_vi: (a.score_line ? a.score_line + '. ' : '') + stripTags_(a.summary), reliable: a.valid ? 'Yes' : 'No', sittings: a.sittings
  };
}

/** Editor: rebuild Topic_Summary + Student_Report for every student (e.g. after changing thresholds in Settings). */
function rebuildAll_() {
  var codes = {};
  readTable_('Sessions').rows.forEach(function (r) { codes[normCode_(r.student_code)] = 1; });
  Object.keys(codes).forEach(function (c) { rebuildStudent_(c); });
  var n = refreshReportList_(); // also creates the Report tab the first time
  return 'Rebuilt ' + Object.keys(codes).length + ' students; Report tab list: ' + n + ' attempts';
}
