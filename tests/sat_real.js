// Real SAT forms (data/SAT-2026-*): every question rendered in the app (MathJax OK, figures load, layout per type), answered with the
// key (SPR typed) → 98/98; every accepted SPR key form graded right by the server; key never sent to the browser.
// Run: DATA_DIR=/home/claude/harness/gas_satreal FORMS=SAT-2026-09-USA,SAT-2026-10-A node sat_real.js
process.env.DATA_DIR = process.env.DATA_DIR || require('./paths').WORK + '/gas_satreal';
process.env.SHOTS = process.env.SHOTS || require('./paths').WORK + '/shots_sat_real';
const H = require('./h'); const { check, sleep, shot } = H;
const FORMS = (process.env.FORMS || 'SAT-2026-08-I2,SAT-2026-09-USA,SAT-2026-10-A,SAT-2026-11-A').split(',');
const typeable = k => /^-?(\d+|\d*\.\d+|\d+\.|\d+\/\d+)$/.test(k) && k.length <= (k[0] === '-' ? 6 : 5);

(async () => {
  const E = await H.setup(); const G = E.st.gas; G.admin('addMissingColumns'); G.admin('importQuestions');
  for (const FORM of FORMS) {
    console.log('\n=== ' + FORM);
    const fd = G.ctx.formData_(FORM), qs = fd.questions;
    G.sheets.Forms.rows.push(...fd.profile.parts.map(p => [FORM, 'SAT', p.part, '', qs.filter(q => q.part === p.part).length, p.time_limit_sec / 60, p.calculator ? 'Yes' : 'No', 'test']));
    // server: every typeable form in each SPR key list is graded right; a wrong number is not; MCQ key right, other letters wrong
    const spr = qs.filter(q => q.type === 'spr');
    const bad = [];
    spr.forEach(q => { q.key.filter(typeable).forEach(k => { if (!G.ctx.isCorrect_(q, k)) bad.push(q.qid + ':' + k); }); if (G.ctx.isCorrect_(q, '99999')) bad.push(q.qid + ':99999'); });
    qs.filter(q => q.type !== 'spr').forEach(q => { if (!G.ctx.isCorrect_(q, q.key) || G.ctx.isCorrect_(q, 'ABCD'.replace(q.key, '')[0])) bad.push(q.qid); });
    check(!bad.length, `server grading: ${spr.length} SPR (all ${spr.reduce((a, q) => a + q.key.filter(typeable).length, 0)} typeable key forms right, 99999 wrong) + ${qs.length - spr.length} MCQ` + (bad.length ? ' → ' + bad.join(', ') : ''));
    const untypeable = spr.filter(q => !q.key.some(typeable)).map(q => q.qid);
    check(!untypeable.length, 'every SPR question has at least one answer that fits the box' + (untypeable.length ? ' → ' + untypeable : ''));

    const { page, ctx } = await E.newPage();
    await H.login(page, E.url, 'T03');
    await page.waitForSelector('.form-card');
    const cards = await page.$$('.form-card');
    let card = null; for (const c of cards) if ((await c.textContent()).includes(fd.profile.title)) card = c;
    await (await card.$('.btn-blue')).click();
    await page.waitForSelector('#btn-begin');
    const gt = E.st.rpcLog.filter(r => r.fn === 'getTest').pop().res;
    check(!/"key"|key_source|"tags"|transcription_notes|source_page|orig_module/.test(gt) && !/flash\s*sat|stewie/i.test(gt), `getTest payload (${Math.round(gt.length / 1024)} KB): no key / key_source / tags / notes, no source names`);
    let probs = [], right = 0, shots = 0;
    for (const part of ['RW1', 'RW2', 'M1', 'M2']) {
      if (await page.isVisible('#btn-begin')) await page.click('#btn-begin');
      await page.waitForSelector('#v-question.on .q.on'); await H.waitMath(page);
      const pq = qs.filter(q => q.part === part);
      for (const q of pq) {
        await page.waitForFunction(n => window.TZ.st.parts[window.TZ.st.current_part].cur === n - 1, q.display_no);
        const info = await page.evaluate(() => {
          const b = document.querySelector('#qwrap .q.on');
          const vis = b.innerText;
          return { merr: b.querySelectorAll('mjx-merror').length, raw: /\\\(|\\\)|\\frac|\\\[/.test(vis), imgs: [...b.querySelectorAll('img')].map(i => i.complete && i.naturalWidth > 0),
                   pass: (b.querySelector('.q-text-pass') || {}).innerText || '', sprDir: !!b.querySelector('.spr-dir-pane'), nch: b.querySelectorAll('.ch-row').length,
                   overflowX: [...b.querySelectorAll('.q-pass, .q-side, .q-text')].some(e => e.scrollWidth > e.clientWidth + 2), split: b.classList.contains('split') };
        });
        const tag = q.qid.replace(FORM + '-', '');
        if (info.merr) probs.push(tag + ': MathJax error');
        if (info.raw) probs.push(tag + ': raw TeX visible');
        if (info.imgs.some(x => !x)) probs.push(tag + ': image not loaded');
        if (info.overflowX) probs.push(tag + ': horizontal overflow');
        if (part[0] === 'R' && (!info.split || info.pass.trim().length < 20)) probs.push(tag + ': RW without passage pane');
        if (q.type === 'spr' && !info.sprDir) probs.push(tag + ': SPR without directions pane');
        if (q.type !== 'spr' && info.nch !== 4) probs.push(tag + ': ' + info.nch + ' choices');
        if (q.type === 'spr') {
          const k = q.key.find(typeable);
          await page.fill('#qwrap .q.on .spr-in', k); await page.dispatchEvent('#qwrap .q.on .spr-in', 'blur');
        } else await page.click(`#qwrap .q.on .ch-row[data-l="${q.key}"] .ch`);
        right++;
        const wantShot = (q.figures.length || /<img|<table|<ul|Text 1/.test((q.passage_html || '') + q.stem_html + JSON.stringify(q.choices))) && shots < 14;
        if (wantShot) { shots++; await H.waitMath(page); await shot(page, `${FORM}_${tag}`); }
        await page.click('#btn-next');
      }
      await page.waitForSelector('#v-review.on'); await page.click('#btn-next'); await page.click('#modal-root .btns .btn-blue');
      if (part === 'RW2') { await page.waitForSelector('#v-break.on'); await page.click('#btn-resume'); }
    }
    check(!probs.length, `all 98 questions render cleanly (MathJax, figures, passage / SPR panes, 4 choices, no sideways scroll)` + (probs.length ? ' → ' + probs.join(' | ') : ''));
    await page.waitForSelector('#scr-result.on .res-score', { timeout: 30000 });
    const tot = await H.satTotal(page);
    check(tot === '98 / 98', `answered every question with its key in the app (SPR typed) → ${tot}`);
    check(/Reading and Writing[\s\S]*54\/54 correct[\s\S]*Math[\s\S]*44\/44 correct/.test(await page.textContent('.sec-cards')), 'section scores 54/54 · 44/44');
    await shot(page, `${FORM}_result`);
    await ctx.close();
  }
  // Questions tab: SPR keys stay text (3/4 must not become a date)
  const Q = G.table('Questions').filter(r => FORMS.includes(r.form_id));
  const frac = Q.find(r => r.type === 'spr' && /\//.test(String(r.key))); // a form may have no fraction key (09B alone)
  check(Q.length === 98 * FORMS.length && Q.every(r => !(r.key instanceof Date) && String(r.key) !== ''), `Questions tab: ${Q.length} rows, SPR keys kept as text` + (frac ? ` (e.g. ${frac.key})` : ''));
  H.englishOnly(E);
  H.summary(); await E.close();
})().catch(e => { console.error(e); process.exit(1); });
