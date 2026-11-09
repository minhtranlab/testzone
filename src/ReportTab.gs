/**
 * Test Zone — the "Report" tab of the Sheet (teacher view; the app itself is for students only).
 *   Cell B2 = dropdown of attempts (newest first). Changing it → onEdit() draws the report of that attempt below.
 *   Menu "Test Zone → Làm mới báo cáo" → refreshes the dropdown list and redraws the current attempt.
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

/* ============================== triggers + menu ============================== */

function onOpen() {
  try { SpreadsheetApp.getUi().createMenu('Test Zone').addItem('Làm mới báo cáo', 'refreshReport')
      .addSeparator().addItem('Update after new version', 'updateAfterNewVersion').addToUi(); } catch (e) {}
}

/** Simple trigger: only reacts to Report!B2. Must stay fast (reads only what one attempt needs). */
function onEdit(e) {
  var r = e && e.range;
  if (!r || typeof r.getSheet !== 'function') return;
  var sh = r.getSheet();
  if (sh.getName() !== REPORT_TAB || r.getRow() !== 2 || r.getColumn() !== 2) return;
  try { renderSelected_(sh); }
  catch (err) { console.error('REPORT RENDER FAILED: ' + (err && err.stack || err)); sh.getRange(RPT_FIRST, 2).setValue('Lỗi khi vẽ báo cáo: ' + err.message); }
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
  sh.getRange(1, 2).setValue('Báo cáo bài làm · Test Zone').setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 2, 1, RPT_COLS).merge().setFontSize(11).setFontWeight('bold')
    .setBorder(true, true, true, true, false, false, '#9e9e9e', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(3, 2).setValue('Chọn lần làm ở ô B2 (gõ tên học sinh để lọc). Danh sách cũ? Menu Test Zone → Làm mới báo cáo.');
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
    var label = [students[normCode_(s.student_code)] || s.student_code, s.form_id, 'Lần ' + s.attempt_no,
      s.submitted_at ? fmtDate_(new Date(toMs_(s.submitted_at)), 'dd/MM HH:mm') : '',
      (s.total_correct === '' ? '?' : s.total_correct) + '/' + (s.total_questions || '?'),
      r === 'No' ? '⚠ không đáng tin' : '✓'].join(' · ');
    if (seen[label]) label += ' #' + (++seen[label]); else seen[label] = 1;
    return [label, String(s.session_id)];
  });
  var old = Math.max(sh.getLastRow(), 2);
  ensureGrid_(sh, rows.length + 2, RPT_LIST_COL + 1);
  sh.getRange(2, RPT_LIST_COL, old, 2).clearContent();
  if (rows.length) sh.getRange(2, RPT_LIST_COL, rows.length, 2).setValues(rows);
  else sh.getRange(2, RPT_LIST_COL).setValue('(chưa có bài nộp)');
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(2, RPT_LIST_COL, Math.max(1, rows.length), 1), true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 2).setDataValidation(rule);
  return rows.length;
}

function renderSelected_(sh) {
  var label = String(sh.getRange(2, 2).getValue() || '');
  if (!label) { clearReport_(sh); sh.getRange(RPT_FIRST, 2).setValue('Chọn một lần làm ở ô B2.'); return null; }
  var n = Math.max(sh.getLastRow(), 2);
  var vals = sh.getRange(2, RPT_LIST_COL, n, 2).getValues();
  var sid = null;
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === label) { sid = String(vals[i][1]); break; }
  if (!sid) { clearReport_(sh); sh.getRange(RPT_FIRST, 2).setValue('Không tìm thấy lần làm này. Menu Test Zone → Làm mới báo cáo.'); return null; }
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
  if (!s) throw new Error('Không tìm thấy lần làm ' + sessionId);
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
  var paceTxt = a.paces.map(function (x) { return x.label + ' khoảng ' + paceStr_(x.sec, a.sat); }).join(', ');
  add([a.student], { bold: true, size: 16, merge: true, h: 30 });
  para(a.form + ' · Lần làm ' + a.attempt + ' · ' + a.date, { color: '#424242' });
  if (a.sittings) para(a.sittings, { color: '#424242' });
  if (a.sat) { // SAT: "RW 40/54 · Math 30/44 · tổng 70/98", then the modules and the time per section
    para(a.score_line + ' (' + a.pct + '%)', { bold: true, size: 12 });
    para('Module: ' + a.parts.map(function (p) { return p.part + ' ' + p.right + '/' + p.n; }).join(' · ') + ' · Thời gian ' +
         a.sections.map(function (x) { return x.id + ' ' + vnNum_(x.used) + '/' + x.limit + ' phút'; }).join(', '), { color: '#424242' });
  } else para('Điểm ' + a.right + '/' + a.n + ' (' + a.pct + '%) · ' + partsTxt + ' · Thời gian ' + vnNum_(a.used) + '/' + a.limit + ' phút', { bold: true, size: 11 });
  // 2. validity
  gap();
  if (a.valid) para('Bài làm nghiêm túc. Dùng gần đủ thời gian, ít câu chọn vội. Kết quả dùng để đánh giá được.', { color: RPT_COLOR.good, bold: true });
  else para('Kết quả không đáng tin: ' + a.reasons.join(' · ') + '.', { color: RPT_COLOR.bad, bold: true });
  // 3. summary
  heading('Tóm tắt');
  para(stripTags_(a.summary));
  // 4. actions
  heading('Việc nên làm tiếp');
  a.actions.forEach(function (x, i) { para((i + 1) + '. ' + stripTags_(x)); });

  var groups = [];
  if (a.valid) {
    // 5. units → topics
    if (a.sat) {
      heading('Theo mảng kiến thức');
      para('Mỗi dòng là một mảng (domain) của SAT, chia theo phần RW và Math; bấm dấu + / − bên trái để mở / đóng các kỹ năng (skill). "Ít dữ liệu" = đề chỉ có 1 câu thuộc mảng đó, chưa kết luận được.', { color: '#616161', size: 9 });
      add(['Phần', 'Mảng', 'Đúng', 'Tỉ lệ', 'Nhận xét'], { bold: true, bottom: true });
    } else {
      heading('Theo Unit');
      para('Mỗi dòng là một Unit của chương trình AP Calc; bấm dấu + / − bên trái để mở / đóng các topic. "Ít dữ liệu" = đề chỉ có 1 câu thuộc Unit đó, chưa kết luận được.', { color: '#616161', size: 9 });
      add(['Unit', 'Chủ đề', 'Đúng', 'Tỉ lệ', 'Nhận xét'], { bold: true, bottom: true });
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
      if (first !== null) groups.push({ from: first, to: last, open: U.status === 'Cần học lại' });
    });
    para('✓ đúng · ◔ đúng nhưng chậm · ✗ sai · – bỏ trống', { color: '#616161', size: 9 });
    // 6. error types
    heading('Sai kiểu gì');
    para('Thời gian chuẩn = thời gian của ' + (a.sat ? 'module' : 'part') + ' chia số câu: ' + paceTxt + '.', { color: '#616161', size: 9 });
    add(['Kiểu', '', 'Số câu', 'Ý nghĩa', ''], { bold: true, bottom: true, mergeBC: true, mergeEF: true });
    ['SLOW_WRONG', 'FAST_WRONG', 'WRONG', 'BLANK', 'SLOW_RIGHT'].forEach(function (k) {
      add([a.types[k].t, '', a.counts[k], a.types[k].m, ''], { mergeBC: true, mergeEF: true, wrap: true, line: true, boldCols: [0], grey: !a.counts[k] });
    });
    if (a.r2w) add(['Đổi đúng thành sai', '', a.r2w, 'Đã chọn đúng rồi đổi sang sai: thiếu tự tin.', ''], { mergeBC: true, mergeEF: true, wrap: true, line: true, boldCols: [0] });
  } else {
    heading('Phần phân tích');
    para('Phần phân tích bị ẩn vì bài không đáng tin (không xếp loại ' + (a.sat ? 'mảng' : 'Unit') + ', không phân tích kiểu sai, không liệt kê câu sai). Thời gian từng câu vẫn hiện bên dưới để thầy thấy học sinh đã làm thế nào.', { color: '#616161' });
  }

  // 7. time per question (chart)
  heading('Thời gian từng câu');
  para('Mỗi cột là một câu (phút). Đường gạch đứt là thời gian chuẩn (' + paceTxt + '). Cột cao vượt xa đường là câu làm chậm, cột rất thấp mà màu đỏ là câu làm vội.', { color: '#616161', size: 9 });
  var chartRow = add([], {});
  for (var i = 0; i < 15; i++) add([], {});

  // 8. wrong / blank list
  if (a.valid) {
    heading('Các câu sai và bỏ trống (' + a.wrong.length + ')');
    if (!a.wrong.length) para('Không có câu sai hay bỏ trống.');
    else {
      add(['Câu', a.sat ? 'Kỹ năng' : 'Topic', 'Kiểu', 'Thời gian', 'Ghi chú'], { bold: true, bottom: true });
      a.wrong.forEach(function (q) {
        add([q.part + ' ' + q.no, a.sat ? q.name : q.topic + ' ' + q.name, q.type, q.blank ? '–' : fmtSecVN_(q.s), q.note], { wrap: true, line: true });
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

  // ---- topic row groups (+/− on the unit row), "Cần học lại" open; remembered in T1 for the next clear
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
  var data = [['Câu', 'Đúng', 'Đúng nhưng chậm', 'Sai', 'Bỏ trống', 'Thời gian chuẩn']];
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
    .setOption('vAxis', { title: 'phút', minValue: 0 })
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

function fmtSecVN_(s) { s = Math.round(s); var m = Math.floor(s / 60), r = s % 60; return m ? m + 'p' + (r ? ('0' + r).slice(-2) : '') : r + 's'; }
