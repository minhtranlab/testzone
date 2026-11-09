#!/usr/bin/env bash
# Builds the harness inputs into tests/.work (git-ignored). Uses only made-up fixture forms (tests/fixtures).
# Real forms (optional, local only, never in CI): TZ_DATA=<project folder>/data bash tests/setup.sh
set -euo pipefail
cd "$(dirname "$0")"
W=.work; rm -rf "$W/gas" "$W/gas_sat" "$W/gas_sat98" "$W/gas_real" "$W/gas_satreal"; mkdir -p "$W"
[ -d node_modules/mathjax ] || npm install --no-audit --no-fund >/dev/null
[ -s desmos.js ] || curl -sSfL -o desmos.js "https://www.desmos.com/api/v1.12/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
B="python3 ../tools/build_data.py"
$B fixtures/mock --out $W/gas >/dev/null && $B fixtures/mock_ap45 --out $W/gas >/dev/null
$B fixtures/mock --out $W/gas_sat >/dev/null && $B fixtures/satmock --out $W/gas_sat >/dev/null
$B fixtures/satmock98 --out $W/gas_sat98 >/dev/null && $B fixtures/mock --out $W/gas_sat98 >/dev/null
if [ -n "${TZ_DATA:-}" ]; then           # local only: real forms, for FORM=APCAB-2012 tests.js and sat_real.js
  $B "$TZ_DATA/ap-calc-ab-2012" --out $W/gas >/dev/null
  for d in "$TZ_DATA"/ap-calc-ab-2012 "$TZ_DATA"/SAT-*; do [ -f "$d/questions.json" ] && $B "$d" --out $W/gas_satreal >/dev/null || true; done
fi
echo "harness built in tests/$W: $(ls $W | tr '\n' ' ')"
