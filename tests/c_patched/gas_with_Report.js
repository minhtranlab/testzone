// Independent QA harness (Chat C): Apps Script server emulation with an in-memory Google Sheet.
// Emulates Sheets value parsing (numbers, dates, leading apostrophe = text) and, optionally, the fixed grid size.
const fs = require('fs'), vm = require('vm'), path = require('path');
const APP = process.env.APPDIR || '/home/claude/qa/src/app';

const HEADERS = {
  README: ['README'], Interpretation: ['profile'], Dictionary: ['tab', 'column', 'ý nghĩa', 'ví dụ'],
  Student_Report: ['session_id','student_code','form_id','attempt_no','submitted_at','total_correct','percent','weakest_topics','main_error_profile','timing_pattern','summary_vi'],
  Topic_Summary: ['student_code','form_id','unit','topic','topic_name','n_attempted','n_correct','accuracy','avg_pace_ratio','n_fast_wrong','n_slow_wrong','n_slow_right','n_blank','n_changed_R_to_W','verdict','updated_at'],
  Students: ['student_code','name','track','active','note'],
  Sessions: ['session_id','student_code','form_id','attempt_no','started_at','submitted_at','status','score_A','score_B','total_correct','total_questions','percent','time_used_A_min','time_used_B_min','n_blank','n_flagged','device','current_part','part_started_at','last_saved_at','events_saved','state_json'],
  Responses: ['session_id','student_code','form_id','attempt_no','qid','part','display_no','unit','topic','final_answer','correct','first_answer','n_changes','change_pattern','eliminated','ever_marked','final_marked','visits','time_total_sec','time_first_visit_sec','pace_ratio','order_first_seen','calc_used','profile','flags','tutor_note'],
  Events: ['session_id','part','t_ms','qid','type','value','logged_at'],
  Questions: ['qid','form_id','part','display_no','orig_no','key','unit','topic','topic_name','topic2','practice','representation','difficulty','tag_status'],
  Forms: ['form_id','exam','part','part_title','n_questions','time_limit_min','calculator','source'],
  Settings: ['key','value','meaning']
};
// copied from the real Sheet (read-only via Sheets API, 2026-11-05)
const FORMS = [['APCAB-2012','AP Calculus AB','A','Section I, Part A','28','55','No','…'],['APCAB-2012','AP Calculus AB','B','Section I, Part B','17','50','Yes','…']];
const SETTINGS = [['app_name','Test Zone'],['fast_ratio','0.5'],['slow_ratio','1.5'],['guess_window_sec','60'],['guess_min_time_sec','15'],['weak_accuracy','0.6'],['min_questions_for_verdict','2'],['autosave_sec','60'],['five_min_warning_sec','300'],['desmos_api_key',''],['show_results','score_and_right_wrong']];

const TZ_OFF = 7 * 3600 * 1000; // Asia/Ho_Chi_Minh
function pad(n, w) { return String(n).padStart(w || 2, '0'); }
function formatDate(d, tz, pat) {
  const x = new Date(d.getTime() + TZ_OFF);
  return pat.replace('yyyy', x.getUTCFullYear()).replace('MM', pad(x.getUTCMonth() + 1)).replace('dd', pad(x.getUTCDate()))
    .replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace('ss', pad(x.getUTCSeconds()));
}

function createServer(opts) {
  opts = opts || {};
  const clock = { base: opts.t0 || Date.UTC(2026, 10, 6, 12, 0, 0), realStart: Date.now(), ff: 0, sync: null,
    now() { if (this.sync) return this.sync.page + (Date.now() - this.sync.real); return this.base + (Date.now() - this.realStart) + this.ff; },
    follow(pageNow) { this.sync = { page: pageNow, real: Date.now() }; } };
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(clock.now()); else super(...a); } static now() { return clock.now(); } }
  // ---------- sheet model ----------
  const parseCell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') {
      if (v.startsWith("'")) return v.slice(1);
      if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') return Number(v);
      const m = v.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)(?::(\d\d))?$/);
      if (m) return new RealDate(RealDate.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - TZ_OFF);
      if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
      return v;
    }
    return v;
  };
  const stats = { writes: {}, calls: [] };
  function makeSheet(name, header, rows, maxRows) {
    const data = [header.slice()].concat((rows || []).map(r => r.map(parseCell)));
    const sh = {
      name, data, maxRows: maxRows || 1000, maxCols: Math.max(26, header.length), frozen: 1,
      getLastRow() { for (let r = data.length - 1; r >= 0; r--) if (data[r] && data[r].some(c => c !== '' && c !== null && c !== undefined)) return r + 1; return 0; },
      getLastColumn() { let m = 0; data.forEach(r => r && r.forEach((c, i) => { if (c !== '' && c !== null && c !== undefined) m = Math.max(m, i + 1); })); return m; },
      getMaxRows() { return this.maxRows; }, getMaxColumns() { return this.maxCols; }, getFrozenRows() { return this.frozen; },
      insertRowsAfter(after, n) { this.maxRows += n; }, insertColumnsAfter(after, n) { this.maxCols += n; },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('The coordinates or dimensions of the range are invalid.');
        if (opts.strictGrid && (r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols)) throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
        const get = () => { const out = []; for (let i = 0; i < nr; i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) { const v = row[c - 1 + j]; o.push(v === undefined || v === null ? '' : v); } out.push(o); } return out; };
        return {
          getValues: get,
          getValue: () => get()[0][0],
          setValues(vals) {
            if (vals.length !== nr || vals.some(v => v.length !== nc)) throw new Error('setValues dimension mismatch ' + vals.length + 'x' + (vals[0] || []).length + ' vs ' + nr + 'x' + nc);
            for (let i = 0; i < nr; i++) { const rr = r - 1 + i; while (data.length <= rr) data.push([]); for (let j = 0; j < nc; j++) data[rr][c - 1 + j] = parseCell(vals[i][j]); }
            stats.writes[name] = (stats.writes[name] || 0) + 1; return this;
          },
          setValue(v) { return this.setValues([[v]]); },
          clearContent() { for (let i = 0; i < nr; i++) { const row = data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } return this; }
        };
      }
    };
    return sh;
  }
  const sheets = {};
  Object.keys(HEADERS).forEach(n => { sheets[n] = makeSheet(n, HEADERS[n], [], opts.maxRows && opts.maxRows[n]); });
  FORMS.forEach(r => sheets.Forms.data.push(r.map(parseCell)));
  SETTINGS.concat(opts.settings || []).forEach(r => sheets.Settings.data.push([r[0], parseCell(r[1]), '']));
  (opts.students || [['QA01', 'QA Student', 'AP Calc AB', 'Yes', '']]).forEach(r => sheets.Students.data.push(r.map(parseCell)));
  const ss = { getSheetByName: n => sheets[n] || null };

  const ctx = {
    console: { log() {}, error: (...a) => { stats.errors = (stats.errors || []).concat([a.join(' ')]); }, warn() {} },
    Date: FakeDate, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => ss },
    Utilities: { formatDate },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      createHtmlOutputFromFile: (n) => ({ getContent: () => fs.readFileSync(path.join(APP, n + '.html'), 'utf8') }),
      createTemplateFromFile: (n) => ({
        evaluate() {
          let src = fs.readFileSync(path.join(APP, n + '.html'), 'utf8');
          src = src.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (m, f) => ctx.include(f));
          if (/<\?/.test(src)) throw new Error('unhandled scriptlet in template');
          const o = { html: src, setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; }, getContent: () => src };
          return o;
        }
      })
    }
  };
  vm.createContext(ctx);
  ['Data_APCAB_2012.gs', 'Forms_Registry.gs', 'Code.gs', 'Report.gs', 'ReportTab.gs', 'Setup.gs'].concat(opts.extraFiles || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f }));
  // ---- google.script.run emulation: JSON round-trip, Dates in a return value → null (Apps Script behaviour) ----
  function hasDate(o) { if (o instanceof RealDate || (o && o.constructor && o.constructor.name === 'FakeDate')) return true; if (o && typeof o === 'object') return Object.keys(o).some(k => hasDate(o[k])); return false; }
  function run(fn, args) {
    stats.calls.push({ fn, t: clock.now() });
    if (opts.offline && opts.offline()) throw new Error('NetworkError: offline');
    if (typeof ctx[fn] !== 'function' || fn.endsWith('_')) throw new Error('Script function not found: ' + fn);
    const res = ctx[fn].apply(null, JSON.parse(JSON.stringify(args)));
    if (hasDate(res)) { stats.dateReturns = (stats.dateReturns || 0) + 1; return null; }
    return res === undefined ? null : JSON.parse(JSON.stringify(res));
  }
  function table(name) {
    const d = sheets[name].data, h = d[0];
    return d.slice(1).filter(r => r && r.some(c => c !== '' && c !== undefined)).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i] === undefined ? '' : r[i]); return o; });
  }
  return { ctx, sheets, clock, run, table, stats, formatDate };
}
module.exports = { createServer, formatDate };
