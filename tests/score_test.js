// SAT estimated score (Score.gs) against SC's agreed examples (reports/SC_status.md, FINAL 2026-11-09) + edges + monotonicity.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { APP } = require('./paths');
const ctx = { console: { warn() {}, log() {} }, Math, JSON, Number, String, Object, ss_: () => { throw new Error('no sheet'); } };
vm.createContext(ctx);
for (const f of ['ScoreScale.gs', 'Score.gs']) vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx);
let F = 0, P = 0; const check = (c, m) => { if (c) P++; else { F++; console.log('  ✗ FAIL: ' + m); } };
const sec = (s, a, b) => ctx.satSectionEstimate_(s, a, b);
// worked examples: [RW M1, M2, RW score, Math M1, M2, Math score, total, note RW?, note Math?]
// #16 m1 (Brain): total = shown RW + shown Math → SC case 1 is now 740 + 740 = 1480 (was round10(est) = 1470)
const cases = [
  ['1 Strong', 26, 22, 740, 21, 18, 740, 1480], ['2 M2 collapses', 25, 7, 550, 20, 5, 550, 1100],
  ['3 Weak M1', 14, 12, 450, 10, 8, 420, 870], ['4 Good M1 weak M2', 24, 10, 530, 18, 7, 530, 1060],
  ['5 Middle', 20, 15, 540, 16, 12, 550, 1090], ['6 M1 just below', 18, 20, 590, 14, 15, 570, 1160], ['Minh 8 wrong RW', 23, 23, 720, 20, 17, 700, 1420]];
for (const [name, r1, r2, rs, m1, m2, ms, tot] of cases) {
  const e = ctx.satEstimate_({ RW1: r1, RW2: r2, M1: m1, M2: m2 });
  check(e.RW.score === rs, `${name}: RW ${r1}+${r2} → ${rs} (got ${e.RW.score})`);
  check(e.Math.score === ms, `${name}: Math ${m1}+${m2} → ${ms} (got ${e.Math.score})`);
  check(e.total.score === tot && e.total.low === tot - 30 && e.total.high === tot + 30, `${name}: total ${tot} (${tot - 30}–${tot + 30}) (got ${e.total.score})`);
}
const qa = ctx.satEstimate_({ RW1: 19, RW2: 9, M1: 15, M2: 7 });
check(qa.total.score === qa.RW.score + qa.Math.score, `QA m1: total = shown RW + shown Math (${qa.RW.score} + ${qa.Math.score} = ${qa.total.score})`);
check(/Module 2/.test(sec('RW', 25, 7).note) && /not counted/.test(sec('RW', 25, 7).method), 'case 2: "Module 2 not counted"');
check(/capped/.test(sec('RW', 14, 12).method) && /capped/.test(sec('Math', 10, 8).method), 'case 3: Module 1 below hard-route level, capped');
check(/capped/.test(sec('RW', 18, 20).method) && sec('RW', 24, 10).note === '', 'case 6 capped note; case 4 no note');
// top profiles checked by Minh (wrong answers in M1 / M2)
const rw = [[0, 0, 800], [2, 3, 750], [3, 3, 740], [3, 5, 710]], ma = [[0, 0, 800], [0, 2, 780], [0, 3, 760], [0, 4, 750], [1, 3, 750], [1, 4, 740], [1, 5, 720]];
for (const [w1, w2, s] of rw) check(sec('RW', 27 - w1, 27 - w2).score === s, `RW M1−${w1}/M2−${w2} → ${s} (got ${sec('RW', 27 - w1, 27 - w2).score})`);
for (const [w1, w2, s] of ma) check(sec('Math', 22 - w1, 22 - w2).score === s, `Math M1−${w1}/M2−${w2} → ${s} (got ${sec('Math', 22 - w1, 22 - w2).score})`);
// edges: raw 0, max, ranges clamped
const z = ctx.satEstimate_({ RW1: 0, RW2: 0, M1: 0, M2: 0 }), mx = ctx.satEstimate_({ RW1: 27, RW2: 27, M1: 22, M2: 22 });
check(z.RW.score === 200 && z.RW.low === 200 && z.Math.score === 200 && z.total.score === 400 && z.total.low === 400, 'raw 0 → 200 / 200 / 400, ranges clamped at the bottom');
check(mx.RW.score === 800 && mx.RW.high === 800 && mx.total.score === 1600 && mx.total.high === 1600 && mx.total.low === 1570, 'all right → 800 / 800 / 1600 (1570–1600)');
check(ctx.satEstimate_({ RW1: 20, RW2: 20 }).total === null && ctx.satEstimate_({ RW1: 20, RW2: 20 }).Math === null, 'one section only → no total');
// monotone + in range for every (M1, M2) pair
let mono = true, range = true, pairs = 0;
for (const [s, n] of [['RW', 27], ['Math', 22]]) for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
  pairs++; const e = sec(s, a, b).est;
  if (e < 200 || e > 800) range = false;
  if (a < n && sec(s, a + 1, b).est < e - 1e-9) mono = false;
  if (b < n && sec(s, a, b + 1).est < e - 1e-9) mono = false;
}
check(mono && range, `${pairs} (M1, M2) pairs: one more right answer never lowers the score; all 200–800`);
console.log(`score_test: ${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
