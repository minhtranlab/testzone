#!/usr/bin/env bash
# Every suite that runs on made-up fixtures (= what the GitHub Action runs before deploying). Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"
bash setup.sh
run() { echo "::group::$*"; env "$@"; echo "::endgroup::"; }
run node no_leak_test.js                         # repo holds no question data / keys / secrets
run node drive_test.js                           # forms from Drive JSON + Sheet update once per version
run node score_test.js                           # SAT estimated score vs SC's agreed examples
run node qa16_test.js                           # #16 QA fixes: answers as text, re-grade, lock-out, answer check, Report tab
run node qa21_test.js                           # #21: Report pick without Drive (B1), pick kept (N2), m6 rest, sign-in limit, copy token
run node copies_test.js                         # #21 N1: two windows of one attempt (QA case)
run node qa35_test.js                           # #35 v1.12: home data — hero rule, pick-up, no estimate, past assignments
run node home_test.js                           # #35 v1.12: new home + sign-in in the browser (desktop 1280 + phone 390)
run node qa32_test.js                           # #32 v1.11: README (VN, yellow), Sessions.progress, hide / show attempts, past assignments
run node qa29_test.js                           # #29 v1.10: Assignments tab, part codes, scope, estimate per part, reports
run node assign_test.js                         # #29 v1.10: assignment cards + flows in the browser (RW1, MATH, RW1+M1 break, M2, AP B)
run node qa24_test.js                           # #24 v1.9: Time_Norms from CSV, codes + badges, no method text, practise tips
run node sync_test.js                            # per-deploy Sheet update on the old Sheet layout + Questions-tab keys
run node spr_test.js
run node guard_test.js
run node grid_proof.js
run node report_sheet_test.js
run node sat_report_test.js
run node tests.js                                # AP engine, mock form
run node pause_test.js
run node minors.js
run DATA_DIR=.work/gas_sat node sat.js           # adaptive routing engine
run DATA_DIR=.work/gas_sat98 node sat98.js       # SAT end to end
run node site_test.js                           # #25 nice link: GitHub Pages wrapper (cross-site frame), desktop + iPad sizes
run node result_test.js                          # result page, read-only review, teacher mode + Show answer
run DATA_DIR=.work/gas_sat98 node break_test.js  # break countdown auto-starts Math; SAT estimate on the result
echo "ALL SUITES PASSED"
