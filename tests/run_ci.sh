#!/usr/bin/env bash
# Every suite that runs on made-up fixtures (= what the GitHub Action runs before deploying). Stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"
bash setup.sh
run() { echo "::group::$*"; env "$@"; echo "::endgroup::"; }
run node no_leak_test.js                         # repo holds no question data / keys / secrets
run node drive_test.js                           # forms from Drive JSON + Sheet update once per version
run node score_test.js                           # SAT estimated score vs SC's agreed examples
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
run node result_test.js                          # result page, read-only review, teacher mode + Show answer
run DATA_DIR=.work/gas_sat98 node break_test.js  # break countdown auto-starts Math; SAT estimate on the result
echo "ALL SUITES PASSED"
