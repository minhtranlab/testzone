// Report tab in the Sheet: 2 mockup scenarios → render via onEdit(B2) → assert grid → HTML dump + screenshots.
process.env.STRICT_VALID = '1';
const fs = require('fs');
const { chromium } = require('playwright');
const { createGas, shown } = require('./gas');
const { initialTabs } = require('./server');
const { dump } = require('./sheetdump');
const DATA = require('./mockup_data.json');
const OUT = process.env.SHOTS || require('./paths').WORK + '/shots_sheet';
fs.mkdirSync(OUT, { recursive: true });
let F = 0, P = 0; const check = (c, m) => { if (c) { P++; console.log('  ✓ ' + m); } else { F++; console.log('  ✗ FAIL: ' + m); } };

const tabs = initialTabs();
tabs.Students.push(['AN-7Q4', 'An', 'AP Calc AB', 'Yes', ''], ['MINH-T3ST', 'Minh (bài thử)', 'AP Calc AB', 'Yes', '']);
const G = createGas(require('./paths').APP, require('./paths').WORK + '/gas', tabs);
G.admin('addMissingColumns'); G.admin('importQuestions');
const FORM = process.env.AP_FORM || 'MOCK-AP45', qs = G.ctx.formData_(FORM).questions;
const DAY = 864e5;

function run(code, d, startA, startB) {
  G.shift(startA - Date.now() - 60000); // the attempt is opened just before Part A starts
  const r = G.call('getTest', [code, FORM, { device: 'harness' }]); G.resetShift();
  const sid = r.session.session_id;
  const st = { v: 1, session_id: sid, form_id: FORM, seq: 9, seq_parts: ['A', 'B'], part_idx: 1, current_part: 'B', phase: 'submitting',
    part_starts: { A: startA, B: startB }, ended: { A: 'submit', B: 'submit' }, route: {}, warned: {}, parts: { A: { ans: {}, elim: {}, mark: {}, hl: {} }, B: { ans: {}, elim: {}, mark: {}, hl: {} } } };
  const ev = [];
  ['A', 'B'].forEach(p => {
    let t = 0; ev.push({ part: p, t_ms: 0, qid: null, type: 'part_start', value: p });
    d.qs.filter(x => x.part === p).forEach(x => {
      const q = qs.find(y => y.part === p && y.display_no === x.n), other = ['A', 'B', 'C', 'D', 'E'].find(l => l !== q.key), ms = x.s * 1000;
      ev.push({ part: p, t_ms: t, qid: q.qid, type: 'q_enter', value: x.n });
      if (x.p !== 'BLANK') {
        const right = x.p === 'RIGHT' || x.p === 'SLOW_RIGHT';
        if (x.f === 'R2W') { ev.push({ part: p, t_ms: t + ms * 0.4, qid: q.qid, type: 'select', value: q.key }); ev.push({ part: p, t_ms: t + ms * 0.9, qid: q.qid, type: 'change', value: other }); }
        else ev.push({ part: p, t_ms: t + Math.max(1, ms - 500), qid: q.qid, type: 'select', value: right ? q.key : other });
        st.parts[p].ans[q.qid] = right ? q.key : other;
        if (x.f === 'ELIM') st.parts[p].elim[q.qid] = [q.key];
      }
      ev.push({ part: p, t_ms: t + ms, qid: q.qid, type: 'q_leave', value: null }); t += ms;
    });
    const used = (p === 'A' ? d.usedA : d.usedB) * 60000;
    ev.push({ part: p, t_ms: Math.min(Math.max(t, used), (p === 'A' ? 55 : 50) * 60000), qid: null, type: 'part_end', value: 'submit' });
  });
  const res = G.call('submit', [code, sid, { state: st, events: ev, ev_from: 0, device: 'harness' }]);
  if (!res.ok) throw new Error('submit failed');
  return sid;
}
const now = Date.now();
// real-like attempt done in 2 sittings: Part A 3 days ago, Part B yesterday
const realSid = run('AN-7Q4', DATA.real, now - 3 * DAY, now - 1 * DAY);
// 2-minute random attempt, one sitting
const guessSid = run('MINH-T3ST', DATA.guess, now - 2 * 3600e3, now - 2 * 3600e3 + 2 * 60e3);

console.log('[Part_Log / Sessions]');
const pl = G.table('Part_Log');
check(G.order.includes('Part_Log') && pl.length === 4, 'Part_Log tab created by the app, 4 rows (2 per attempt)');
const plA = pl.find(r => r.session_id === realSid && r.part === 'A'), plB = pl.find(r => r.session_id === realSid && r.part === 'B');
check(plA.sitting_no === 1 && plB.sitting_no === 2 && plA.time_used_min >= 54 && plB.time_used_min === 50 && plA.end_reason === 'submit', 'real attempt: A sitting 1 (54 min), B sitting 2 (50 min)');
check(G.table('Sessions').find(s => s.session_id === realSid).n_sittings === 2 && G.table('Sessions').find(s => s.session_id === guessSid).n_sittings === 1, 'Sessions.n_sittings = 2 / 1');
const srReal = G.table('Student_Report').find(r => r.session_id === realSid);
check(/^Làm 2 lần: Part A \d\d\/\d\d \d\d:\d\d–\d\d:\d\d · Part B \d\d\/\d\d/.test(srReal.sittings), 'Student_Report.sittings: ' + srReal.sittings);
check(!('report_link' in srReal), 'Student_Report has no report_link');

console.log('[Report tab]');
const t0 = Date.now(); G.resetCalls();
const msg = G.admin('rebuildAll');
console.log('    ' + msg);
const sh = G.sheets.Report;
check(sh && G.order.indexOf('Report') === G.order.indexOf('README') + 1 && sh.tab === '#0b8043', 'Report tab created right after README, green tab');
check(sh.frozen === 3 && sh.gridHidden, 'rows 1–3 frozen, gridlines hidden');
const list = sh.rows.slice(1).map(r => r[17]).filter(Boolean);
check(list.length === 2 && new RegExp('^An · ' + FORM + ' · Lần 1 · \\d\\d/\\d\\d \\d\\d:\\d\\d · 28/45 · ✓$').test(list[1]) && new RegExp('^Minh \\(bài thử\\) · ' + FORM + ' · Lần 1 · .* · 6/45 · ⚠ không đáng tin$').test(list[0]),
  'dropdown list newest first, label format: ' + JSON.stringify(list));
const dv = sh.dv['2:2'];
check(dv && dv.kind === 'range' && dv.src.getRow() === 2 && dv.src.getColumn() === 18 && dv.src.getNumRows() === 2 && dv.allowInvalid === false, 'B2 data validation = list in hidden column R');
check(sh.hiddenCols[18] && sh.hiddenCols[19], 'list columns R:S hidden');

const text = () => sh.rows.map(r => (r || []).slice(1, 6).map(v => v instanceof Date ? 'DATE!' : (v && v.formula) ? v.formula : String(v)).join(' | '));
const rowOf = re => text().findIndex(t => re.test(t)) + 1;
function pick(label) { sh.rows[1][1] = label; G.ctx.onEdit({ range: sh._proxy.getRange(2, 2) }); }

// ---- real
G.resetCalls(); let t1 = Date.now(); pick(list[1]); const realMs = Date.now() - t1, realCalls = G.calls();
let T = text();
check(T.every(t => !t.includes('DATE!')), 'no text turned into a date (3/8, 20/28 …)');
check(T[4].startsWith('An |') && /Lần làm 1/.test(T[5]) && /^Làm 2 lần: Part A/.test(T[6]) && /^Điểm 28\/45 \(62%\) · Part A 20\/28 · Part B 8\/17 · Thời gian 10\d\/105 phút/.test(T[7]), 'header: name, form/attempt/date, sittings, score/parts/time');
check(rowOf(/^Bài làm nghiêm túc/) > 0 && sh.fmt[rowOf(/^Bài làm nghiêm túc/) + ':2'].color === '#2e7d32', 'validity line (green text)');
const iSum = rowOf(/^Tóm tắt/); check(iSum > 0 && /^An làm chắc Unit 1, Unit 2, Unit 4, Unit 7\. Mất điểm nhiều nhất/.test(T[iSum]), 'Tóm tắt (plain text, mockup wording)');
const iAct = rowOf(/^Việc nên làm tiếp/); check(/^1\. Dạy lại Unit 8 – Ứng dụng tích phân\./.test(T[iAct]) && /^4\. Luyện tốc độ\./.test(T[iAct + 3]), '4 numbered actions');
const iU = rowOf(/^Unit \| Chủ đề \| Đúng \| Tỉ lệ \| Nhận xét/); check(iU > 0, 'unit table header');
const unitRows = T.map((t, i) => [t, i + 1]).filter(([t]) => /^Unit \d \|/.test(t));
check(unitRows.length === 8, '8 unit rows');
const u6 = unitRows.find(([t]) => t.startsWith('Unit 6 |'));
check(/^Unit 6 \| Tích phân và tích luỹ \| 3\/8 \| =SPARKLINE\(0\.375,.* \| Cần học lại$/.test(u6[0]) && sh.fmt[u6[1] + ':6'].color === '#c62828', 'Unit 6 row: VN name, 3/8, SPARKLINE bar, "Cần học lại" in red');
check(/\| Đúng nhưng chậm$/.test(unitRows.find(([t]) => t.startsWith('Unit 3 |'))[0]) && /\| Ổn$/.test(unitRows.find(([t]) => t.startsWith('Unit 1 |'))[0]), 'Unit 3 Đúng nhưng chậm, Unit 1 Ổn');
const t64 = rowOf(/^6\.4 \| The Fundamental Theorem/); check(t64 > 0 && /\| ✗ ✗ \|/.test(T[t64 - 1]) && sh.rowDepth[t64] === 1, 'topic 6.4 row: English name + ✗ ✗, grouped under Unit 6');
const u1 = unitRows.find(([t]) => t.startsWith('Unit 1 |'))[1];
check(sh.hiddenRows[u1 + 1] && !sh.hiddenRows[u6[1] + 1] && sh.groupCtl === 'BEFORE', 'groups: Unit 1 topics collapsed, Unit 6 (Cần học lại) expanded, toggle on the unit row');
const iTy = rowOf(/^Kiểu \|  \| Số câu \| Ý nghĩa/); check(iTy > 0 && /^Sai vì chưa nắm bài \|  \| 7 \| Làm lâu mà vẫn sai/.test(T[iTy]) && /^Đổi đúng thành sai \|  \| 1 \|/.test(T[iTy + 5]), 'Sai kiểu gì table (7 / … / đổi đúng thành sai 1)');
const iT = rowOf(/^Thời gian từng câu/); check(iT > 0 && sh.charts.length === 1 && sh.charts[0].pos.r === iT + 2 && sh.charts[0].type === 'combo', 'one combo chart under "Thời gian từng câu"');
const cd = sh.charts[0].ranges[0].getValues();
check(cd.length === 46 && cd[0].join() === 'Câu,Đúng,Đúng nhưng chậm,Sai,Bỏ trống,Thời gian chuẩn' && cd[6][3] > 4 && cd[1][5] > 1.9 && cd[30][5] > 2.9, 'chart data: 45 questions, A6 in "Sai" column, standard line ≈2 / ≈3 min');
check(sh.charts[0].options.series[4].type === 'line' && sh.charts[0].options.isStacked && sh.charts[0].hidden === 'SHOW_BOTH' && sh.hiddenCols[10] && sh.colDepth[10] === 1, 'chart: stacked bars + dashed line, data block J:O grouped+collapsed, hidden data shown');
const iW = rowOf(/^Các câu sai và bỏ trống \(17\)/); check(iW > 0 && /^Câu \| Topic \| Kiểu \| Thời gian \| Ghi chú/.test(T[iW]) && /^A 6 \| 8\.2 Connecting Position/.test(T[iW + 1]) && /^B 17 \| 8\.7 .* \| Bỏ trống \| – \|/.test(T[iW + 17]), 'wrong/blank table: 17 rows, A 6 … B 17');
check(T.some(t => /Đã chọn đúng rồi đổi/.test(t)) && T.some(t => /Gạch bỏ chính đáp án đúng/.test(t)), 'notes: R→W and ELIM_KEY');
console.log(`    render: ${realMs} ms in the mock, ${realCalls} Sheet API calls`);
fs.writeFileSync(OUT + '/report_real.html', '<meta charset="utf-8"><body style="margin:16px;background:#f2f2f2">' + dump(sh) + '</body>');

// merged paragraph rows get an explicit height (Sheets auto-fit ignores merged cells)
const rSum = rowOf(/^An làm chắc/);
check(sh.rowH[rSum] >= 2 * 17 && sh.rowH[rowOf(/^1\. Dạy lại Unit 8/)] >= 3 * 17, 'wrapped merged rows have explicit heights (Tóm tắt ' + sh.rowH[rSum] + ' px, action 1 ' + sh.rowH[rowOf(/^1\. Dạy lại Unit 8/)] + ' px)');
check(/"groups":\[\[/.test(String(sh.rows[0][19])) && sh.hiddenCols[20], 'T1 remembers the row groups of this render (hidden)');
// ---- guess (switching selection must clear everything)
pick(list[0]); T = text();
console.log('    LINE:', T[rowOf(/^Kết quả không đáng tin/) - 1]); check(/^Kết quả không đáng tin: chỉ dùng 2,7\/105 phút · 20\/20 câu chọn đáp án trong dưới 15 giây · 25 câu bỏ trống\./.test(T[rowOf(/^Kết quả không đáng tin/) - 1]) && sh.fmt[rowOf(/^Kết quả không đáng tin/) + ':2'].color === '#c62828', 'unreliable: red line + 3 reasons');
check(/^1\. Cho làm lại đề này, bấm giờ đủ 105 phút/.test(T[rowOf(/^Việc nên làm tiếp/)]), 'actions = cho làm lại');
check(rowOf(/Phần phân tích bị ẩn vì bài không đáng tin/) > 0 && rowOf(/^Theo Unit/) === 0 && rowOf(/^Sai kiểu gì/) === 0 && rowOf(/^Các câu sai/) === 0, 'sections 5, 6, 8 hidden with the note');
check(sh.charts.length === 1 && Object.keys(sh.rowDepth).every(r => !sh.rowDepth[r]) && Object.keys(sh.hiddenRows).length === 0, 'previous chart removed, all row groups and hidden rows cleared');
check(/^Làm 1 lần: Part A/.test(T[6]), 'one sitting text');
const lastGuess = sh.getLastRow ? sh.rows.reduce((m, r, i) => (r || []).slice(0, 6).some(v => v !== '' && v !== undefined) ? i + 1 : m, 0) : 0;
fs.writeFileSync(OUT + '/report_guess.html', '<meta charset="utf-8"><body style="margin:16px;background:#f2f2f2">' + dump(sh) + '</body>');
pick(list[1]); check(sh.charts.length === 1 && text().filter(t => /^Unit \d \|/.test(t)).length === 8, 're-select real: rebuilt cleanly (1 chart, 8 units)');
// C's pessimistic case: negative shiftRowGroupDepth throws → groups must still not pile up
process.env.PESSIMISTIC_GROUPS = '1';
for (let k = 0; k < 3; k++) { pick(list[0]); pick(list[1]); }
delete process.env.PESSIMISTIC_GROUPS;
const depths = Object.values(sh.rowDepth).filter(Boolean);
check(Math.max(0, ...depths) === 1 && sh.charts.length === 1 && Math.max(0, ...Object.values(sh.colDepth).filter(Boolean)) === 1, '6 more B2 switches with a throwing negative shift: group depth stays 1, one chart, one column group');
// n1: rebuildAll fills Sessions.reliable / n_sittings even when they are empty (old attempts)
const hdr = G.sheets.Sessions.rows[0], ci = hdr.indexOf('reliable'), cn = hdr.indexOf('n_sittings');
G.sheets.Sessions.rows.slice(1).forEach(r => { r[ci] = ''; r[cn] = ''; });
G.admin('rebuildAll');
const S2 = G.table('Sessions');
check(S2.find(x => x.session_id === realSid).reliable === 'Yes' && S2.find(x => x.session_id === guessSid).reliable === 'No' && S2.find(x => x.session_id === realSid).n_sittings === 2 && S2.find(x => x.session_id === guessSid).n_sittings === 1, 'n1: rebuildAll refills Sessions.reliable (Yes/No) and n_sittings (2/1)');
// n2: a fast all-correct retake → excluded, but the text says "nhớ đáp án", not "chọn bừa"
const fast = { usedA: 14, usedB: 8.5, qs: qs.map(q => ({ part: q.part, n: q.display_no, p: 'RIGHT', s: 30 })) };
const fastSid = run('AN-7Q4', fast, Date.now() - 3600e3, Date.now() - 3000e3);
const srFast = G.table('Student_Report').find(r => r.session_id === fastSid);
check(srFast.reliable === 'No' && /có thể nhớ đáp án từ lần trước/.test(srFast.summary_vi) && !/chọn bừa/.test(srFast.summary_vi), 'n2: fast 45/45 → unreliable with "có thể nhớ đáp án từ lần trước"');
check(!G.table('Topic_Summary').some(r => r.student_code === 'AN-7Q4' && r.form_id === 'ALL' && r.n_attempted > 0 && String(r.topic).startsWith('Unit') && r.n_attempted > 45), 'n2: the fast retake stays out of Topic_Summary ALL');
// web-app path: a new submit refreshes the dropdown list
check(G.ctx.onEdit({ range: G.sheets.Students._proxy.getRange(2, 2) }) === undefined, 'onEdit on another tab is ignored');

(async () => {
  const b = await chromium.launch();
  for (const n of ['real', 'guess']) {
    const p = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
    await p.goto('file://' + OUT + '/report_' + n + '.html');
    await p.screenshot({ path: OUT + '/report_' + n + '.png', fullPage: true });
  }
  await b.close();
  console.log(`\n${P} passed, ${F} failed`);
  process.exit(F ? 1 : 0);
})();
