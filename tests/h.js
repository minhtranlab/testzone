// shared Playwright helpers
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./server');

const MJ = path.join(__dirname, 'node_modules/mathjax');
const DESMOS = path.join(__dirname, 'desmos.js');
const SHOTS = process.env.SHOTS || require('./paths').WORK + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });

async function routes(ctx) {
  await ctx.route('https://cdn.jsdelivr.net/npm/mathjax@3.2.2/**', r => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/mathjax@3.2.2/', '');
    const f = path.join(MJ, rel);
    if (fs.existsSync(f)) r.fulfill({ path: f, contentType: f.endsWith('.js') ? 'application/javascript' : undefined }); else r.continue();
  });
  await ctx.route(/www\.desmos\.com\/api\/v1\.12\/calculator\.js/, r => r.fulfill({ path: DESMOS, contentType: 'application/javascript' }));
}

async function setup(opts = {}) {
  const port = opts.port || 8090 + Math.floor(Math.random() * 800);
  const { server, st } = await start(port);
  const browser = await chromium.launch();
  const url = `http://localhost:${port}/`;
  async function newPage(device) {
    const ctxOpts = device === 'ipad'
      ? { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : device === 'ipad-portrait'
      ? { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: opts.dsf || 1 };
    const ctx = await browser.newContext(ctxOpts);
    await routes(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('PAGEERROR', e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) console.log('CONSOLE', m.text()); });
    return { ctx, page };
  }
  return { st, browser, url, newPage, close: async () => { await browser.close(); server.close(); } };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// English-only check: every rendered screen text is collected and grepped for Vietnamese letters
// letters only Vietnamese uses (not é/í/á/ñ… that appear in names inside real SAT passages, e.g. "Océane", "Solís")
const VI = /[ạảãầấậẩẫăằắặẳẵẹẻẽềếệểễịỉĩọỏõồốộổỗơờớợởỡụủũưừứựửữỳỵỷỹđ]/i;
const TEXTS = [];
async function grab(page, label) { try { TEXTS.push([label, await page.evaluate(() => document.body.innerText)]); } catch (e) {} }
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); await grab(page, name); }
function englishOnly(E) {
  const badDom = TEXTS.filter(([, t]) => VI.test(t)).map(([l, t]) => l + ': ' + (t.match(new RegExp('.{0,30}' + VI.source + '.{0,30}', 'i')) || [''])[0]);
  const badRpc = E.st.rpcLog.filter(r => VI.test(r.res)).map(r => r.fn + ': ' + (r.res.match(new RegExp('.{0,40}' + VI.source + '.{0,40}', 'i')) || [''])[0]);
  check(!badDom.length, 'English only: no Vietnamese in ' + TEXTS.length + ' rendered screens' + (badDom.length ? ' → ' + badDom.slice(0, 3).join(' | ') : ''));
  check(!badRpc.length, 'English only: no Vietnamese in ' + E.st.rpcLog.length + ' server→browser payloads' + (badRpc.length ? ' → ' + badRpc.slice(0, 3).join(' | ') : ''));
}
async function login(page, url, code) {
  await page.goto(url);
  await page.fill('#login-code', code);
  await page.click('#login-btn');
}
async function waitMath(page) { await page.waitForFunction(() => window.MathJax && MathJax.startup && MathJax.startup.promise).catch(() => {}); await sleep(300); }
let FAILS = 0, PASSES = 0;
function check(cond, msg) { if (cond) { PASSES++; console.log('  ✓ ' + msg); } else { FAILS++; console.log('  ✗ FAIL: ' + msg); } }
function summary() { console.log(`\n${PASSES} passed, ${FAILS} failed`); return FAILS; }

/** SAT result page (v1.9): no overall "x / 98" line — the raw total is the sum of the section cards ("25/54 correct"). */
async function satTotal(page) {
  const r = await page.$$eval('.sec-raw b', a => a.map(x => x.textContent));
  const t = r.reduce((acc, s) => { const [x, y] = s.split('/').map(Number); return [acc[0] + x, acc[1] + y]; }, [0, 0]);
  return t[0] + ' / ' + t[1];
}
module.exports = { setup, sleep, shot, grab, englishOnly, login, waitMath, check, summary, SHOTS, satTotal };

/** #27: badges sit inside the question cells (40 × 46: number row 20 px, symbol row 18 px); the badge centre = the ✓ / ✗ centre. */
async function badgeLayout(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('#result-body .rgrid .rcell')];
    const out = { cells: cells.length, size: true, sym: true, R: 0, S: 0, dy: [], badgeH: [], chipsWithBadge: document.querySelectorAll('#result-body .qchip .bdg, #result-body .qchip svg').length,
                  keys: document.querySelectorAll('#result-body .res-part .grid-key').length, parts: document.querySelectorAll('#result-body .res-part').length,
                  oldKey: document.querySelectorAll('#result-body .bdg-key, #result-body .res-legend').length, types: [] };
    cells.forEach(c => {
      const r = c.getBoundingClientRect(); if (Math.abs(r.width - 40) > 0.5 || Math.abs(r.height - 46) > 0.5) out.size = false;
      const rs = c.querySelector('.rs'), b = c.dataset.badge, st = c.classList.contains('right') ? 'right' : c.classList.contains('wrong') ? 'wrong' : 'blank';
      const svg = rs && rs.querySelector('svg'), txt = rs ? rs.textContent.trim() : '';
      const want = b ? (svg && svg.getAttribute('aria-label') === (b === 'R' ? 'rushed' : 'slow')) : st === 'right' ? txt === '✓' : st === 'wrong' ? txt === '✗' : txt === '' && !svg;
      if (!want || (b === 'R' && st !== 'wrong')) out.sym = false;
      if (b) out[b]++;
      // vertical centre of the symbol inside its cell (badge: the svg box; ✓ / ✗: a range around the glyph)
      let box; if (svg) { box = svg.getBoundingClientRect(); out.badgeH.push(+box.height.toFixed(1)); } else if (txt) { const rg = document.createRange(); rg.selectNodeContents(rs); box = rg.getBoundingClientRect(); }
      if (box) out.dy.push(+((box.top + box.height / 2) - r.top).toFixed(1));
    });
    document.querySelectorAll('#result-body .res-types tr').forEach(tr => { const rs = tr.querySelector('.tg .rcell .rs'); const svg = rs && rs.querySelector('svg');
      out.types.push(tr.querySelector('.tl').textContent + '=' + (svg ? svg.getAttribute('aria-label') : rs ? rs.textContent.trim() || '·' : '?')); });
    return out;
  });
}
module.exports.badgeLayout = badgeLayout;
