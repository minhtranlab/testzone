// Google Apps Script runtime mock: in-memory Spreadsheet (values + Sheets-like coercion + strict 1000-row grid +
// formats, merges, row/column groups, data validation, charts) + LockService + Utilities + Session + HtmlService.
// Any Sheet/Range method the code calls that is not implemented here throws "MOCK MISSING", so gaps surface.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const RealDate = Date;
let SHIFT = 0;
class SDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + SHIFT); else super(...a); }
  static now() { return RealDate.now() + SHIFT; }
}

// Sheets value coercion (USER_ENTERED-like): numbers, dates, d/m "dates", leading apostrophe = text, "=…" = formula
function convert(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (v.startsWith('=')) return { formula: v };
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(v)) return new RealDate(v.replace(' ', 'T') + (v.length > 10 ? '' : 'T00:00') + '+07:00');
    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v)) return new RealDate('2026-' + v.split('/')[1].padStart(2, '0') + '-' + v.split('/')[0].padStart(2, '0') + 'T00:00+07:00'); // "3/8" → a date!
    return v;
  }
  if (v === null || v === undefined) return '';
  return v;
}
const shown = v => (v && v.formula) ? v.formula : v;

let CALLS = 0;
function strict(obj, label) {
  return new Proxy(obj, { get(t, k) {
    if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON' || k === 'inspect') { if (typeof t[k] === 'function') CALLS++; return t[k]; }
    throw new Error('MOCK MISSING ' + label + '.' + String(k));
  } });
}

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  cells(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j); return this; }
  getRow() { return this.r; } getColumn() { return this.c; } getNumRows() { return this.nr; } getNumColumns() { return this.nc; } getSheet() { return this.sh._proxy; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sh.rows[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : shown(v)); }
      out.push(o);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some(r => r.length !== this.nc)) throw new Error(`setValues dims ${vals.length}x${vals[0] && vals[0].length} vs ${this.nr}x${this.nc} on ${this.sh.name}`);
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i;
      while (this.sh.rows.length <= ri) this.sh.rows.push([]);
      const row = this.sh.rows[ri];
      for (let j = 0; j < this.nc; j++) {
        const v = vals[i][j];
        if (typeof v === 'string' && v.length > 50000) throw new Error('Cell over 50000 chars on ' + this.sh.name);
        row[this.c - 1 + j] = convert(v);
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; }
  clear() { this.clearContent(); return this.cells((r, c) => { delete this.sh.fmt[r + ':' + c]; }); }
  clearDataValidations() { return this.cells((r, c) => { delete this.sh.dv[r + ':' + c]; }); }
  setNumberFormat() { return this; }
  style(k, v) { return this.cells((r, c) => { const key = r + ':' + c; (this.sh.fmt[key] = this.sh.fmt[key] || {})[k] = v; }); }
  setFontFamily(v) { return this.style('font', v); } setFontSize(v) { return this.style('size', v); } setFontWeight(v) { return this.style('bold', v === 'bold'); }
  setFontColor(v) { return this.style('color', v); } setBackground(v) { return this.style('bg', v); } setWrap(v) { return this.style('wrap', !!v); }
  styles(k, arr, f) { if (arr.length !== this.nr || arr.some(r => r.length !== this.nc)) throw new Error('style array dims on ' + k);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const key = (this.r + i) + ':' + (this.c + j); (this.sh.fmt[key] = this.sh.fmt[key] || {})[k] = f ? f(arr[i][j]) : arr[i][j]; } return this; }
  setFontWeights(a) { return this.styles('bold', a, v => v === 'bold'); } setFontColors(a) { return this.styles('color', a); }
  setFontSizes(a) { return this.styles('size', a); } setWraps(a) { return this.styles('wrap', a, v => !!v); }
  setVerticalAlignment(v) { return this.style('valign', v); } setHorizontalAlignment(v) { return this.style('align', v); } setFontStyle(v) { return this.style('italic', v === 'italic'); }
  setBorder(top, left, bottom, right, v, h, color) {
    if (bottom) for (let j = 0; j < this.nc; j++) { const key = (this.r + this.nr - 1) + ':' + (this.c + j); (this.sh.fmt[key] = this.sh.fmt[key] || {}).bb = color || '#000'; }
    if (top && left && right) this.style('box', color || '#000');
    return this;
  }
  merge() { this.sh.merges = this.sh.merges.filter(m => !(m.r === this.r && m.c === this.c)); this.sh.merges.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc }); return this; }
  breakApart() { const r1 = this.r, r2 = this.r + this.nr - 1, c1 = this.c, c2 = this.c + this.nc - 1;
    this.sh.merges = this.sh.merges.filter(m => m.r + m.nr - 1 < r1 || m.r > r2 || m.c + m.nc - 1 < c1 || m.c > c2); return this; }
  setDataValidation(rule) { return this.cells((r, c) => { this.sh.dv[r + ':' + c] = rule; }); }
  shiftRowGroupDepth(d) { if (d < 0 && process.env.PESSIMISTIC_GROUPS) for (let i = 0; i < this.nr; i++) if (!(this.sh.rowDepth[this.r + i] > 0)) throw new Error('no group to remove'); for (let i = 0; i < this.nr; i++) { const r = this.r + i; this.sh.rowDepth[r] = Math.max(0, (this.sh.rowDepth[r] || 0) + d); if (!this.sh.rowDepth[r]) delete this.sh.hiddenRows[r]; } return this; }
  shiftColumnGroupDepth(d) { for (let j = 0; j < this.nc; j++) { const c = this.c + j; this.sh.colDepth[c] = Math.max(0, (this.sh.colDepth[c] || 0) + d); if (!this.sh.colDepth[c]) delete this.sh.hiddenCols[c]; } return this; }
}

let STRICT = true; // real Sheets: a range past the grid throws
class Sheet {
  constructor(name, rows) {
    this.name = name; this.rows = rows; this.maxCols = 26; this.maxRows = 1000; this.grows = 0;
    this.fmt = {}; this.merges = []; this.dv = {}; this.rowDepth = {}; this.colDepth = {}; this.hiddenRows = {}; this.hiddenCols = {};
    this.colW = {}; this.rowH = {}; this.frozen = 1; this.charts = []; this.tab = null; this.gridHidden = false; this.groupCtl = 'AFTER';
    this._proxy = strict(this, 'Sheet');
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(a, n) { this.maxRows += n; this.grows++; }
  getLastRow() { let n = 0; this.rows.forEach((r, i) => { if (r.some(v => v !== '' && v !== null && v !== undefined)) n = i + 1; }); return n; }
  getLastColumn() { let c = 0; this.rows.forEach(r => r.forEach((v, j) => { if (v !== '' && v !== null && v !== undefined) c = Math.max(c, j + 1); })); return c; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(a, n) { this.maxCols += n; }
  getFrozenRows() { return this.frozen; } setFrozenRows(n) { this.frozen = n; return this; }
  setTabColor(c) { this.tab = c; return this; } setHiddenGridlines(b) { this.gridHidden = !!b; return this; }
  setColumnWidth(c, w) { this.colW[c] = w; return this; } setRowHeight(r, h) { this.rowH[r] = h; return this; }
  autoResizeRows(r, n) { for (let i = 0; i < n; i++) delete this.rowH[r + i]; return this; }
  setRowHeights(r, n, h) { for (let i = 0; i < n; i++) this.rowH[r + i] = h; return this; }
  hideColumns(c, n) { for (let i = 0; i < (n || 1); i++) this.hiddenCols[c + i] = true; return this; }
  setRowGroupControlPosition(p) { this.groupCtl = p; return this; }
  groupBlock(depthMap, i, depth) { if ((depthMap[i] || 0) < depth) return null; let a = i, b = i; while ((depthMap[a - 1] || 0) >= depth) a--; while ((depthMap[b + 1] || 0) >= depth) b++; return [a, b]; }
  getRowGroup(row, depth) { const blk = this.groupBlock(this.rowDepth, row, depth); if (!blk) return null; const sh = this;
    return strict({ collapse() { for (let r = blk[0]; r <= blk[1]; r++) sh.hiddenRows[r] = true; return this; }, expand() { for (let r = blk[0]; r <= blk[1]; r++) delete sh.hiddenRows[r]; return this; }, isCollapsed() { return !!sh.hiddenRows[blk[0]]; },
      remove() { for (let r = blk[0]; r <= blk[1]; r++) { sh.rowDepth[r] = Math.max(0, (sh.rowDepth[r] || 0) - 1); if (!sh.rowDepth[r]) delete sh.hiddenRows[r]; } } }, 'Group'); }
  getRowGroupDepth(r) { return this.rowDepth[r] || 0; }
  getColumnGroup(col, depth) { const blk = this.groupBlock(this.colDepth, col, depth); if (!blk) return null; const sh = this;
    return strict({ collapse() { for (let c = blk[0]; c <= blk[1]; c++) sh.hiddenCols[c] = true; return this; }, expand() { for (let c = blk[0]; c <= blk[1]; c++) delete sh.hiddenCols[c]; return this; },
      remove() { for (let c = blk[0]; c <= blk[1]; c++) { sh.colDepth[c] = Math.max(0, (sh.colDepth[c] || 0) - 1); if (!sh.colDepth[c]) delete sh.hiddenCols[c]; } } }, 'Group'); }
  getRangeList(list) { const sh = this; const rs = list.map(a1 => { const m = a1.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/); const c1 = colNum(m[1]), r1 = +m[2], c2 = colNum(m[3]), r2 = +m[4]; return sh.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1); });
    return strict({ setBorder(...a) { rs.forEach(r => r.setBorder(...a)); return this; }, getRanges() { return rs; } }, 'RangeList'); }
  getCharts() { return this.charts.slice(); } removeChart(c) { this.charts = this.charts.filter(x => x !== c); } insertChart(c) { this.charts.push(c); }
  newChart() { const spec = { type: null, ranges: [], options: {}, pos: null, hidden: null }; const b = strict({
    asComboChart() { spec.type = 'combo'; return b; }, asColumnChart() { spec.type = 'column'; return b; }, addRange(r) { spec.ranges.push(r); return b; },
    setHiddenDimensionStrategy(s) { spec.hidden = s; return b; }, setPosition(r, c, x, y) { spec.pos = { r, c }; return b; },
    setOption(k, v) { spec.options[k] = v; return b; }, build() { return spec; } }, 'ChartBuilder'); return b; }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') { const m = r.match(/^([A-Z]+)(\d+)$/); if (!m) throw new Error('MOCK MISSING A1 ' + r); c = colNum(m[1]); r = Number(m[2]); nr = 1; nc = 1; }
    nr = nr || 1; nc = nc || 1;
    if (STRICT && (r + nr - 1 > this.maxRows || c + nc - 1 > this.maxCols)) throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet. (' + this.name + ' r' + (r + nr - 1) + ' > ' + this.maxRows + ')');
    return strict(new Range(this, r, c, nr, nc), 'Range');
  }
}
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; }

function fmtDate(d, tz, pattern) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(p.month) - 1];
  return pattern.replace('yyyy', p.year).replace('MMM', '\u0001').replace('MM', p.month).replace('\u0001', MON).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

function createGas(appDir, dataDir, tabs, opts = {}) {
  const sheets = {}, order = [];
  Object.keys(tabs).forEach(n => { sheets[n] = new Sheet(n, tabs[n].map(r => r.map(convert))); order.push(n); });
  const ss = strict({
    getId: () => 'MOCK_ID', getSpreadsheetLocale: () => 'vi_VN', // convert() reads "3/8" day-first like vi_VN
    getSheetByName: n => sheets[n] ? sheets[n]._proxy : null,
    insertSheet(n, idx) { sheets[n] = new Sheet(n, []); if (idx === undefined) order.push(n); else order.splice(idx, 0, n); return sheets[n]._proxy; },
    getSheets: () => order.map(n => sheets[n]._proxy)
  }, 'Spreadsheet');
  const rule = () => { const o = { kind: null, src: null, allowInvalid: true }; const b = strict({
    requireValueInRange(r, show) { o.kind = 'range'; o.src = r; return b; }, setAllowInvalid(v) { o.allowInvalid = v; return b; }, build() { return o; } }, 'DV'); return b; };
  const ctx = {
    console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat, Promise,
    Date: SDate,
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss, newDataValidation: rule,
      BorderStyle: { SOLID: 'SOLID' }, GroupControlTogglePosition: { BEFORE: 'BEFORE', AFTER: 'AFTER' },
      getUi: () => { throw new Error('no UI in this context'); } },
    Charts: { ChartHiddenDimensionStrategy: { SHOW_BOTH: 'SHOW_BOTH' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    CacheService: { getScriptCache: () => cache },
    DriveApp: {
      getFolderById(id) {
        if (!opts.driveDir || id !== opts.folderId) throw new Error('Drive: no access to folder ' + id);
        const names = fs.readdirSync(opts.driveDir).filter(f => !f.startsWith('.'));
        let i = 0;
        return { getFiles: () => ({ hasNext: () => i < names.length, next: () => driveFile(names[i++]) }) };
      },
      getFileById(id) { const n = fs.readdirSync(opts.driveDir || '.').find(f => 'DRV_' + f === id); if (!n) throw new Error('Drive: no file ' + id); return driveFile(n); }
    },
    ContentService: { MimeType: { TEXT: 'TEXT' }, createTextOutput: t => ({ setMimeType() { return this; }, getContent: () => t }) },
    Utilities: { formatDate: fmtDate },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh', getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@x' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    HtmlService: { XFrameOptionsMode: { DEFAULT: 0, ALLOWALL: 1 } }
  };
  const store = new Map(), cstats = { gets: 0, puts: 0 }, dstats = { reads: 0 };
  const cache = {
    get(k) { cstats.gets++; return store.has(k) ? store.get(k) : null; },
    getAll(ks) { cstats.gets++; const o = {}; ks.forEach(k => { if (store.has(k)) o[k] = store.get(k); }); return o; },
    put(k, v) { if (String(v).length > 100000) throw new Error('Cache value too large'); cstats.puts++; store.set(k, String(v)); },
    putAll(o) { Object.keys(o).forEach(k => cache.put(k, o[k])); },
    remove(k) { store.delete(k); }
  };
  const driveFile = n => {
    const f = path.join(opts.driveDir, n);
    return { getName: () => n, getId: () => 'DRV_' + n, isTrashed: () => false, getLastUpdated: () => new RealDate(fs.statSync(f).mtimeMs),
      getBlob: () => ({ getDataAsString: () => { dstats.reads++; return fs.readFileSync(f, 'utf8'); } }) };
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(appDir).filter(f => /\.gs$/.test(f) && f !== 'Forms_Registry.gs' && !/^Data_/.test(f)).sort().map(f => path.join(appDir, f))
    .concat(fs.readdirSync(dataDir).filter(f => /^Data_.*\.gs$/.test(f)).map(f => path.join(dataDir, f)))
    .concat([opts.registry || path.join(dataDir, 'Forms_Registry.gs')]);
  files.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  return {
    ctx, sheets, order, cache: store, cstats, dstats,
    calls() { return CALLS; }, resetCalls() { CALLS = 0; },
    admin(fn) { return ctx[fn + '_'](); },
    call(fn, args) { if (typeof ctx[fn] !== 'function' || fn.endsWith('_')) throw new Error('No such server function: ' + fn); return ctx[fn](...args); },
    shift(ms) { SHIFT += ms; }, resetShift() { SHIFT = 0; },
    table(name) { const rows = sheets[name].rows; const h = rows[0]; return rows.slice(1).filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : shown(r[i])]))); }
  };
}

module.exports = { createGas, shown };
