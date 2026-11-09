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

module.exports = { setup, sleep, shot, grab, englishOnly, login, waitMath, check, summary, SHOTS };
