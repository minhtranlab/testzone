// Render a mock Sheet tab (values + formats + merges + groups + chart) to HTML, roughly as Google Sheets shows it.
const { shown } = require('./gas');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function dump(sh, opts = {}) {
  const lastCol = opts.cols || 6;
  let lastRow = 0; sh.rows.forEach((r, i) => { for (let c = 0; c < lastCol; c++) if (r[c] !== '' && r[c] !== undefined) lastRow = i + 1; });
  sh.charts.forEach(ch => { lastRow = Math.max(lastRow, ch.pos.r + 16); });
  const W = c => sh.colW[c] || 100, H = r => sh.rowH[r] || 21;
  const covered = {}, span = {};
  sh.merges.forEach(m => { span[m.r + ':' + m.c] = m; for (let i = 0; i < m.nr; i++) for (let j = 0; j < m.nc; j++) if (i || j) covered[(m.r + i) + ':' + (m.c + j)] = 1; });
  let y = 0; const rowTop = {};
  let html = `<div style="position:relative;font-family:Arial;font-size:10pt;background:#fff;width:${Array.from({ length: lastCol }, (_, i) => W(i + 1)).reduce((a, b) => a + b, 0) + 28}px">`;
  html += '<table style="border-collapse:collapse;table-layout:fixed">';
  html += '<colgroup><col style="width:28px">' + Array.from({ length: lastCol }, (_, i) => `<col style="width:${W(i + 1)}px">`).join('') + '</colgroup>';
  const anchors = {}; sh.charts.forEach(ch => { anchors[ch.pos.r] = ch; });
  let skipTo = 0;
  for (let r = 1; r <= lastRow; r++) {
    rowTop[r] = y;
    if (sh.hiddenRows[r] || r < skipTo) continue;
    if (anchors[r]) { html += `<tr><td></td><td colspan="${lastCol}">${chartSvg(sh, anchors[r], W)}</td></tr>`; skipTo = r + 16; continue; }
    y += H(r);
    // group toggle (control BEFORE → on the row above the group)
    let tog = '';
    if ((sh.rowDepth[r + 1] || 0) > (sh.rowDepth[r] || 0)) tog = sh.hiddenRows[r + 1] ? '⊞' : '⊟';
    if (sh.rowDepth[r]) tog = tog || '<span style="color:#bbb">│</span>';
    html += `<tr style="height:${H(r)}px"><td style="color:#555;font-size:12px;text-align:center;vertical-align:top;border-right:1px solid #eee">${tog}</td>`;
    for (let c = 1; c <= lastCol; c++) {
      const key = r + ':' + c; if (covered[key]) continue;
      const f = sh.fmt[key] || {}, m = span[key];
      let v = (sh.rows[r - 1] || [])[c - 1]; if (v === undefined) v = '';
      let txt;
      if (v && v.formula) { const k = /SPARKLINE\(([\d.]+)/.exec(v.formula); txt = k ? `<div style="height:9px;background:#eee;margin-top:5px"><div style="height:9px;width:${Math.round(100 * k[1])}%;background:#616161"></div></div>` : esc(v.formula); }
      else if (v instanceof Date) txt = `<span style="background:#fdd">DATE!${esc(v.toISOString().slice(0, 10))}</span>`;
      else txt = esc(v);
      const st = [`font-size:${f.size || 10}pt`, f.bold ? 'font-weight:bold' : '', f.color ? `color:${f.color}` : '', f.wrap ? 'white-space:normal' : 'white-space:nowrap;overflow:hidden',
        `vertical-align:${f.valign || 'bottom'}`, f.align ? `text-align:${f.align}` : (typeof v === 'number' ? 'text-align:right' : ''), f.bb ? `border-bottom:1px solid ${f.bb}` : '', f.box ? `border:1px solid ${f.box}` : '', 'padding:2px 4px'].filter(Boolean).join(';');
      html += `<td${m ? ` colspan="${m.nc}" rowspan="${m.nr}"` : ''} style="${st}">${txt}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html + '</div>';
}
function chartSvg(sh, ch, W) {
    const rg = ch.ranges[0], data = rg.getValues(); const head = data[0], rows = data.slice(1);
    const w = ch.options.width || 800, h = ch.options.height || 300, pl = 36, pb = 46, pt = 10;
    const max = Math.max(1, ...rows.map(r => Math.max(r[1] || 0, r[2] || 0, r[3] || 0, r[4] || 0, r[5] || 0))) * 1.1;
    const bw = (w - pl - 10) / rows.length, Y = v => pt + (h - pt - pb) * (1 - v / max);
    const ser = ch.options.series || {};
    let g = `<rect width="${w}" height="${h}" fill="#fff" stroke="#ccc"/>`;
    for (let v = 0; v <= max; v += 1) g += `<line x1="${pl}" x2="${w - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${pl - 4}" y="${Y(v) + 3}" font-size="9" text-anchor="end">${v}</text>`;
    rows.forEach((r, i) => { let base = 0; for (let k = 1; k <= 4; k++) { const val = Number(r[k]) || 0; if (!val) continue; g += `<rect x="${pl + i * bw + 1}" y="${Y(base + val)}" width="${bw - 2}" height="${Y(base) - Y(base + val)}" fill="${(ser[k - 1] || {}).color || '#888'}"/>`; base += val; }
      if (i % 5 === 0) g += `<text x="${pl + i * bw + bw / 2}" y="${h - pb + 12}" font-size="8" text-anchor="middle">${esc(r[0])}</text>`; });
    let d = ''; rows.forEach((r, i) => { d += (i ? 'L' : 'M') + (pl + i * bw + bw / 2) + ' ' + Y(Number(r[5]) || 0); });
    g += `<path d="${d}" fill="none" stroke="#000" stroke-dasharray="4 4"/>`;
    g += `<text x="${w / 2}" y="${h - 8}" font-size="10" text-anchor="middle">${head.slice(1).map((x, k) => `■ ${esc(x)}`).join('   ')}</text>`;
    return `<svg width="${w}" height="${h}">${g}</svg>`;
}

module.exports = { dump };
