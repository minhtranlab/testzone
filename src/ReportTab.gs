/**
 * Test Zone — the "Report" tab of the Sheet (teacher view; the app also has a teacher mode).
 *   Cell B2 = dropdown of attempts (newest first). Changing it → onEdit() draws the report of that attempt below.
 *   Menu "Test Zone → Refresh report" → refreshes the dropdown list and redraws the current attempt.
 * Content and wording follow reference/report-mockup.html; analysis comes from analyse_() in Report.gs.
 * Layout: plain, printable (≈ A4 width), white, black text, thin grey borders, colour only for meaning.
 */

var REPORT_TAB = 'Report';
var RPT_FIRST = 5;        // first row of the rendered report (rows 1–3 = title, dropdown, hint; row 4 empty)
var RPT_COLS = 5;         // content columns B..F
var RPT_DATA_COL = 10;    // J..O: data block for the time chart (grouped + collapsed)
var RPT_LIST_COL = 18;    // R:S: dropdown list (label, session_id), hidden
var RPT_META_COL = 20;    // T1: JSON of the last render (row groups) so the next render can remove them exactly; hidden
var RPT_TEXT_W = 794;     // px width of B:F (paragraph rows are merged across it)
var RPT_FONT = 'Arial';
var RPT_GREY = '#9e9e9e';
var RPT_COLOR = { bad: '#c62828', warn: '#a15c00', good: '#2e7d32', none: '#757575' };
var RPT_SYMBOL = { RIGHT: '✓', SLOW_RIGHT: '◔', FAST_WRONG: '✗', SLOW_WRONG: '✗', WRONG: '✗', BLANK: '–' };
var REPORT_TITLE_ = 'Attempt report · Test Zone';
var REPORT_HINT_ = 'Pick an attempt in cell B2 (type a student name to filter). List out of date? Menu Test Zone → Refresh report.';
var CHART_LEGEND_ = 'Bar colours: green = right · yellow = right but slow (more than 1.5 × the standard time) · red = wrong · grey = blank. Dashed line = standard time per question (module time ÷ number of questions).';

/* ============================== triggers + menu ============================== */

function onOpen() {
  try { SpreadsheetApp.getUi().createMenu('Test Zone').addItem('Refresh report', 'refreshReport')
      .addItem('Re-grade after a key change', 'regradeFromMenu')
      .addSeparator().addItem('Update after new version', 'updateAfterNewVersion').addToUi(); } catch (e) {}
}

/** Menu: a key was changed in the Questions tab → grade submitted attempts again, rebuild the summaries, redraw B2. */
function regradeFromMenu() {
  requireEditor_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var msg = rebuildAll_();
    redrawReportTab_();
    try { SpreadsheetApp.getActive().toast(msg, 'Test Zone', 10); } catch (e) {}
  } finally { lock.releaseLock(); }
}

/** Simple trigger: only reacts to Report!B2. Must stay fast (reads only what one attempt needs). */
function onEdit(e) {
  var r = e && e.range;
  if (!r || typeof r.getSheet !== 'function') return;
  var sh = r.getSheet();
  if (sh.getName() !== REPORT_TAB || r.getRow() !== 2 || r.getColumn() !== 2) return;
  drawPick_(sh);
}

/** Draw the attempt picked in B2. It needs no Drive access (tags come from the Questions tab when the form file cannot be
 *  read), so it works in the simple trigger too (B1, #21). If it still fails, the old drawing is removed — it must never
 *  look like the picked attempt — and an English line says what to do. */
function drawPick_(sh) {
  try { return renderSelected_(sh); }
  catch (err) {
    console.error('REPORT RENDER FAILED: ' + (err && err.stack || err));
    try { clearReport_(sh); } catch (e) {}
    sh.getRange(RPT_FIRST, 2).setValue('Could not draw this attempt. Use the menu Test Zone → Refresh report.');
    return null;
  }
}

/** Menu: refresh the dropdown list and redraw the selected attempt. */
function refreshReport() {
  requireEditor_();
  var sh = ensureReportTab_();
  refreshReportList_();
  renderSelected_(sh);
}

/* ============================== tab + dropdown ============================== */

function ensureReportTab_() {
  var ss = ss_();
  var sh = ss.getSheetByName(REPORT_TAB);
  if (!sh) {
    sh = ss.insertSheet(REPORT_TAB, 1); // right after README
    try { sh.setTabColor('#0b8043'); } catch (e) {}
  }
  if (String(sh.getRange(1, 2).getValue()) === '') setupReportHeader_(sh);
  return sh;
}

function setReportWidths_(sh) {
  sh.setColumnWidth(1, 16);
  [64, 300, 130, 110, 190].forEach(function (w, i) { sh.setColumnWidth(2 + i, w); }); // ≈ A4 portrait width
}

function setupReportHeader_(sh) {
  ensureGrid_(sh, 400, RPT_LIST_COL + 1);
  sh.setHiddenGridlines(true);
  setReportWidths_(sh);
  sh.getRange(1, 1, 3, 6).setFontFamily(RPT_FONT).setFontColor('#000000').setBackground('#ffffff');
  sh.getRange(1, 2).setValue(REPORT_TITLE_).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 2, 1, RPT_COLS).merge().setFontSize(11).setFontWeight('bold')
    .setBorder(true, true, true, true, false, false, '#9e9e9e', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(3, 2).setValue(REPORT_HINT_);
  sh.getRange(3, 2, 1, RPT_COLS).merge().setFontSize(9).setFontColor('#616161');
  sh.setRowHeight(2, 28);
  sh.setFrozenRows(3);
  sh.getRange(1, RPT_LIST_COL, 1, 2).setValues([['_label', '_session_id']]);
  sh.hideColumns(RPT_LIST_COL, 2);
}

/** Dropdown list: every submitted attempt, newest first. Label → session_id in the hidden columns R:S. */
function refreshReportList_() {
  var sh = ensureReportTab_();
  var students = {};
  readTable_('Students').rows.forEach(function (r) { students[normCode_(r.student_code)] = String(r.name || r.student_code); });
  var rel = {};
  try { readTable_('Student_Report').rows.forEach(function (r) { rel[String(r.session_id)] = String(r.reliable || ''); }); } catch (e) {}
  var list = readTable_('Sessions').rows.filter(function (s) { return String(s.status) === 'completed' || String(s.status) === 'timeout'; })
    .sort(function (a, b) { return (toMs_(b.submitted_at) - toMs_(a.submitted_at)) || (b._row - a._row); }); // newest first
  var seen = {};
  var rows = list.map(function (s) {
    var r = String(s.reliable || rel[String(s.session_id)] || '');
    var label = [students[normCode_(s.student_code)] || s.student_code, s.form_id, 'Attempt ' + s.attempt_no,
      s.submitted_at ? fmtDate_(new Date(toMs_(s.submitted_at)), 'dd/MM HH:mm') : '',
      (s.total_correct === '' ? '?' : s.total_correct) + '/' + (s.total_questions || '?'),
      r === 'No' ? '⚠ not reliable' : '✓'].join(' · ');
    if (seen[label]) label += ' #' + (++seen[label]); else seen[label] = 1;
    return [label, String(s.session_id)];
  });
  var old = Math.max(sh.getLastRow(), 2);
  // N2 (#21): the label holds the score, so a re-grade changes it — remember WHICH attempt is picked (by session id)
  var pickedSid = null, pick = String(sh.getRange(2, 2).getValue() || '');
  if (pick) sh.getRange(2, RPT_LIST_COL, old, 2).getValues().forEach(function (v) { if (!pickedSid && String(v[0]) === pick) pickedSid = String(v[1]); });
  ensureGrid_(sh, rows.length + 2, RPT_LIST_COL + 1);
  sh.getRange(2, RPT_LIST_COL, old, 2).clearContent();
  if (rows.length) sh.getRange(2, RPT_LIST_COL, rows.length, 2).setValues(rows);
  else sh.getRange(2, RPT_LIST_COL).setValue('(no submitted attempt yet)');
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(2, RPT_LIST_COL, Math.max(1, rows.length), 1), true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 2).setDataValidation(rule);
  if (pickedSid) { var nw = rows.filter(function (r) { return r[1] === pickedSid; })[0]; if (nw && nw[0] !== pick) sh.getRange(2, 2).setValue(nw[0]); }
  return rows.length;
}

function renderSelected_(sh) {
  var label = String(sh.getRange(2, 2).getValue() || '');
  if (!label) { clearReport_(sh); sh.getRange(RPT_FIRST, 2).setValue('Pick an attempt in cell B2.'); return null; }
  var n = Math.max(sh.getLastRow(), 2);
  var vals = sh.getRange(2, RPT_LIST_COL, n, 2).getValues();
  var sid = null;
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === label) { sid = String(vals[i][1]); break; }
  if (!sid) { clearReport_(sh); sh.getRange(RPT_FIRST, 2).setValue('Attempt not found. Menu Test Zone → Refresh report.'); return null; }
  return renderReport_(sh, sid);
}

/* ============================== render ============================== */

function clearReport_(sh) {
  var maxR = sh.getMaxRows(), lastCol = RPT_LIST_COL - 1; // never touch the hidden list (R:S)
  var n = maxR - RPT_FIRST + 2;
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  var body = sh.getRange(RPT_FIRST - 1, 1, n, lastCol);
  // row groups: remove exactly the ones the last render made (stored in T1); first time / unknown → scan once
  var meta = null;
  try { meta = JSON.parse(String(sh.getRange(1, RPT_META_COL).getValue() || 'null')); } catch (e) {}
  if (meta && meta.groups) {
    meta.groups.forEach(function (g) { try { var grp = sh.getRowGroup(g[0], 1); if (grp) grp.remove(); } catch (e) {} });
  } else {
    var last = sh.getLastRow();
    for (var r = RPT_FIRST; r <= last; r++) {
      var d = 0;
      try { d = sh.getRowGroupDepth(r); } catch (e) {}
      while (d > 0) { try { sh.getRowGroup(r, d).remove(); } catch (e) { break; } d--; }
    }
  }
  try { var cg = sh.getColumnGroup(RPT_DATA_COL, 1); if (cg) cg.remove(); } catch (e) {}
  body.breakApart();
  body.clear();
  body.clearDataValidations();
}

/** Draw the report of one attempt. Returns the analysis object (used by the test harness). */
function renderReport_(sh, sessionId) {
  var S = getSettings_();
  var s = findSession_(sessionId);
  if (!s) throw new Error('Attempt not found: ' + sessionId);
  var rows = readTable_('Responses').rows.filter(function (r) { return String(r.session_id) === String(sessionId); });
  var st = findStudent_(s.student_code);
  var a = analyse_(s, rows, S, st ? String(st.name || '') : '');
  clearReport_(sh);
  ensureGrid_(sh, RPT_FIRST + 260 + a.qs.length, RPT_LIST_COL + 1);

  var out = [], fmt = [];
  function add(vals, f) {
    var row = [];
    for (var i = 0; i < RPT_COLS; i++) row.push(vals[i] === undefined || vals[i] === null ? '' : vals[i]);
    out.push(row); fmt.push(f || {});
    return RPT_FIRST + out.length - 1;
  }
  function gap() { add([], { h: 10 }); }
  function heading(t) { gap(); add([t], { bold: true, size: 12, merge: true, bottom: true, h: 26 }); }
  function para(t, f) { var o = { merge: true, wrap: true }; Object.keys(f || {}).forEach(function (k) { o[k] = f[k]; }); return add([t], o); }

  // 1. header
  var partsTxt = a.parts.map(function (p) { return 'Part ' + p.part + ' ' + p.right + '/' + p.n; }).join(' · ');
  var paceTxt = a.paces.map(function (x) { return x.label + ' about ' + paceStr_(x.sec, a.sat); }).join(', ');
  add([a.student], { bold: true, size: 16, merge: true, h: 30 });
  para(a.form + ' · Attempt ' + a.attempt + ' · ' + a.date, { color: '#424242' });
  if (a.sittings) para(a.sittings + (a.n_sittings > 1 ? ' — not like the real test (done in ' + a.n_sittings + ' sittings); the score may be higher than on the real test.' : ''), { color: a.n_sittings > 1 ? RPT_COLOR.warn : '#424242', bold: a.n_sittings > 1 });
  if (a.sat) { // SAT: "RW 40/54 · Math 30/44 · total 70/98", the estimate, then the modules and the time per section
    para(a.score_line + ' (' + a.pct + '%)', { bold: true, size: 12 });
    if (a.estimate_text) para('Estimated score: ' + a.estimate_text, { bold: true, size: 11 });
    ['RW', 'Math'].forEach(function (k) { if (a.estimate && a.estimate[k] && a.estimate[k].note) para(k + ': ' + a.estimate[k].note, { color: RPT_COLOR.warn, size: 9 }); });
    para('Modules: ' + a.parts.map(function (p) { return p.part + ' ' + p.right + '/' + p.n; }).join(' · ') + ' · Time ' +
         a.sections.map(function (x) { return x.id + ' ' + x.used + '/' + x.limit + ' min'; }).join(', '), { color: '#424242' });
  } else para('Score ' + a.right + '/' + a.n + ' (' + a.pct + '%) · ' + partsTxt + ' · Time ' + a.used + '/' + a.limit + ' min', { bold: true, size: 11 });
  // 2. validity
  gap();
  if (a.valid) para('Reliable attempt: nearly the full time used, few rushed answers. The result can be used.', { color: RPT_COLOR.good, bold: true });
  else para('Not reliable: ' + a.reasons.join(' · ') + '.', { color: RPT_COLOR.bad, bold: true });
  // 3. summary
  heading('Summary');
  para(stripTags_(a.summary));
  // 4. actions
  heading('Next steps');
  a.actions.forEach(function (x, i) { para((i + 1) + '. ' + stripTags_(x)); });

  var groups = [];
  if (a.valid) {
    // 5. units → topics
    if (a.sat) {
      heading('By domain');
      para('One row per SAT domain (RW and Math); press + / − on the left to open / close its skills. "Too few to judge" = the form has only one question there.', { color: '#616161', size: 9 });
      add(['Section', 'Domain', 'Right', 'Share', 'Verdict'], { bold: true, bottom: true });
    } else {
      heading('By unit');
      para('One row per AP Calc unit; press + / − on the left to open / close its topics. "Too few to judge" = the form has only one question in that unit.', { color: '#616161', size: 9 });
      add(['Unit', 'Name', 'Right', 'Share', 'Verdict'], { bold: true, bottom: true });
    }
    a.units.forEach(function (U) {
      var color = { 'c-bad': RPT_COLOR.bad, 'c-warn': RPT_COLOR.warn, 'c-good': RPT_COLOR.good, 'c-none': RPT_COLOR.none }[U.cls];
      add([a.sat ? (SAT_DOMAIN_SECTION_[U.u] || '') : 'Unit ' + U.u, U.name, U.k + '/' + U.t,
           '=SPARKLINE(' + (U.t ? U.k / U.t : 0) + ',{"charttype","bar";"max",1;"color1","#616161"})', U.status],
          { boldCols: [0, 1], colorCol: { 4: color }, boldColsColor: true, line: true });
      var first = null, last = null;
      U.topics.forEach(function (T) {
        var r = add([a.sat ? '' : T.code, T.name, T.dots.map(function (d) { return RPT_SYMBOL[d.p] || '?'; }).join(' ')], { size: 9, color: '#424242', wrap: true, line: true });
        if (first === null) first = r; last = r;
      });
      if (first !== null) groups.push({ from: first, to: last, open: U.status === UNIT_STATUS_.BAD });
    });
    para('✓ right · ◔ right but slow · ✗ wrong · – blank', { color: '#616161', size: 9 });
    // 6. error types
    heading('Error types');
    para('Standard time = ' + (a.sat ? 'module' : 'part') + ' time ÷ number of questions: ' + paceTxt + '.', { color: '#616161', size: 9 });
    add(['Type', '', 'Questions', 'Meaning', ''], { bold: true, bottom: true, mergeBC: true, mergeEF: true });
    ['SLOW_WRONG', 'FAST_WRONG', 'WRONG', 'BLANK', 'SLOW_RIGHT'].forEach(function (k) {
      add([a.types[k].t, '', a.counts[k], a.types[k].m, ''], { mergeBC: true, mergeEF: true, wrap: true, line: true, boldCols: [0], grey: !a.counts[k] });
    });
    if (a.r2w) add(['Changed right → wrong', '', a.r2w, 'Chose the right answer, then changed it: not confident.', ''], { mergeBC: true, mergeEF: true, wrap: true, line: true, boldCols: [0] });
  } else {
    heading('Analysis');
    para('The analysis is hidden because the attempt is not reliable (no ' + (a.sat ? 'domain' : 'unit') + ' verdicts, no error types, no wrong-answer list). The time per question is still shown below so you can see how the student worked.', { color: '#616161' });
  }

  // 7. time per question (chart)
  heading('Time per question');
  para(CHART_LEGEND_, { size: 9, bold: true, wrap: true });
  para('One bar per question (minutes). Standard time: ' + paceTxt + '. A bar far above the line = slow; a very short red bar = rushed.', { color: '#616161', size: 9 });
  var chartRow = add([], {});
  for (var i = 0; i < 15; i++) add([], {});

  // 8. wrong / blank list
  if (a.valid) {
    heading('Wrong and blank answers (' + a.wrong.length + ')');
    if (!a.wrong.length) para('No wrong or blank answers.');
    else {
      add(['Question', a.sat ? 'Skill' : 'Topic', 'Type', 'Time', 'Note'], { bold: true, bottom: true });
      a.wrong.forEach(function (q) {
        add([q.part + ' ' + q.no, a.sat ? q.name : q.topic + ' ' + q.name, q.type, q.blank ? '–' : fmtSec_(q.s), q.note], { wrap: true, line: true });
      });
    }
  }

  // ---- write values, then formats — batched (one call per property for the whole block) so onEdit stays fast
  var top = RPT_FIRST, n = out.length;
  var all = sh.getRange(top, 2, n, RPT_COLS);
  all.setValues(out.map(function (row) { return row.map(asText_); }));
  var weights = [], colors = [], sizes = [], wraps = [];
  var black = [], grey = [];
  fmt.forEach(function (f, i) {
    var w = [], c = [], z = [], wr = [];
    for (var k = 0; k < RPT_COLS; k++) {
      var bold = !!f.bold || (f.boldCols && f.boldCols.indexOf(k) >= 0) || !!(f.colorCol && f.colorCol[k]);
      w.push(bold ? 'bold' : 'normal');
      c.push((f.colorCol && f.colorCol[k]) || (f.grey ? RPT_GREY : (f.color || '#000000')));
      z.push(f.size || 10);
      wr.push(!!f.wrap);
    }
    weights.push(w); colors.push(c); sizes.push(z); wraps.push(wr);
    var a1 = 'B' + (top + i) + ':F' + (top + i);
    if (f.bottom) black.push(a1);
    if (f.line) grey.push(a1);
  });
  all.setFontFamily(RPT_FONT).setVerticalAlignment('top').setHorizontalAlignment('left')
     .setFontWeights(weights).setFontColors(colors).setFontSizes(sizes).setWraps(wraps);
  if (black.length) sh.getRangeList(black).setBorder(null, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  if (grey.length) sh.getRangeList(grey).setBorder(null, null, true, null, null, null, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID);
  setReportWidths_(sh);
  sh.autoResizeRows(top - 1, Math.max(1, sh.getMaxRows() - top + 2)); // wrapped text gets its height; old fixed heights reset
  fmt.forEach(function (f, i) {
    var r = top + i;
    if (f.merge) sh.getRange(r, 2, 1, RPT_COLS).merge();
    if (f.mergeBC) sh.getRange(r, 2, 1, 2).merge();
    if (f.mergeEF) sh.getRange(r, 5, 1, 2).merge();
    // Sheets' auto-fit ignores merged cells → give wrapped merged rows an explicit height
    var h = f.h || 0;
    if (f.merge && f.wrap) h = Math.max(h, rowHeightFor_(out[i][0], RPT_TEXT_W, f.size || 10));
    if (f.mergeEF && f.wrap) h = Math.max(h, rowHeightFor_(out[i][3], 300, f.size || 10), rowHeightFor_(out[i][0], 364, f.size || 10));
    if (h) sh.setRowHeight(r, h);
  });

  // ---- topic row groups (+/− on the unit row), "Needs reteaching" open; remembered in T1 for the next clear
  sh.getRange(1, RPT_META_COL).setValue(JSON.stringify({ session: String(sessionId), groups: groups.map(function (g) { return [g.from, g.to]; }) }));
  sh.hideColumns(RPT_META_COL, 1);
  if (groups.length) {
    try { sh.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); } catch (e) {}
    groups.forEach(function (g) {
      sh.getRange(g.from, 1, g.to - g.from + 1, 1).shiftRowGroupDepth(1);
      var grp = sh.getRowGroup(g.from, 1);
      if (grp) { if (g.open) grp.expand(); else grp.collapse(); }
    });
  }

  // ---- chart: data block J..O (grouped + collapsed), stacked columns by result + line = standard time
  var data = [['Question', 'Right', 'Right but slow', 'Wrong', 'Blank', 'Standard time']];
  a.qs.forEach(function (q) {
    var m = Math.round(q.s / 60 * 100) / 100;
    var kind = q.p === 'RIGHT' ? 1 : q.p === 'SLOW_RIGHT' ? 2 : q.p === 'BLANK' ? 4 : 3;
    var row = [a.sat ? q.part + '-' + q.no : q.part + q.no, null, null, null, null, Math.round(q.pace / 60 * 100) / 100];
    row[kind] = m;
    data.push(row.map(function (v) { return v === null ? '' : v; }));
  });
  var dr = sh.getRange(chartRow, RPT_DATA_COL, data.length, 6);
  dr.setValues(data);
  sh.getRange(chartRow, RPT_DATA_COL, 1, 6).shiftColumnGroupDepth(1);
  try { var cg = sh.getColumnGroup(RPT_DATA_COL, 1); if (cg) cg.collapse(); } catch (e) {}
  var chart = sh.newChart().asComboChart()
    .addRange(dr)
    .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)
    .setPosition(chartRow, 2, 0, 0)
    .setOption('isStacked', true)
    .setOption('width', 800).setOption('height', 300)
    .setOption('legend', { position: 'bottom' })
    .setOption('vAxis', { title: 'minutes', minValue: 0 })
    .setOption('hAxis', { slantedText: true, slantedTextAngle: 90, textStyle: { fontSize: 8 } })
    .setOption('series', {
      0: { type: 'bars', color: RPT_COLOR.good }, 1: { type: 'bars', color: '#e0a100' },
      2: { type: 'bars', color: RPT_COLOR.bad }, 3: { type: 'bars', color: '#bdbdbd' },
      4: { type: 'line', color: '#000000', lineWidth: 1, lineDashStyle: [4, 4] }
    })
    .setOption('fontName', RPT_FONT)
    .build();
  sh.insertChart(chart);
  return a;
}

/** Estimated height (px) of a wrapped paragraph of `text` in a box `widthPx` wide (Arial). */
function rowHeightFor_(text, widthPx, sizePt) {
  var perLine = Math.max(10, Math.floor(widthPx / (sizePt * 0.72)));
  var lines = 0;
  String(text || '').split('\n').forEach(function (p) { lines += Math.max(1, Math.ceil(p.length / perLine)); });
  return Math.max(21, lines * Math.round(sizePt * 1.75) + 6);
}

/** Text that Sheets would turn into a number or date ("3/8", "6.10", "20/28") is written as text. */
function asText_(v) {
  if (typeof v !== 'string' || v === '' || v.charAt(0) === '=') return v;
  return /^[0-9][0-9.,\/:\- ]*$/.test(v) ? "'" + v : v;
}

function fmtSec_(s) { s = Math.round(s); var m = Math.floor(s / 60), r = s % 60; return m ? m + ':' + ('0' + r).slice(-2) : r + ' s'; }
