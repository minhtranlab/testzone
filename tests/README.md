# Test harness (Chat B)

Runs the real `src/` server code against an in-memory Apps Script + Sheet mock, and the real client in Chromium.

- `bash run_ci.sh` — everything CI runs, on made-up forms only (`fixtures/`: MOCK-APCAB 4 q, MOCK-AP45 45 q, MOCK-SAT routed mini SAT, MOCK-SAT98 98 q).
- `bash setup.sh` — builds `.work/` (git-ignored): `gas/` (MOCK-APCAB + MOCK-AP45), `gas_sat/` (+ MOCK-SAT), `gas_sat98/` (MOCK-SAT98 + MOCK-APCAB);
  with `TZ_DATA=<project folder>/data` also the real forms (local only).
- `gas.js` Apps Script mock (Sheets coercion, strict grid, formats, groups, charts, Lock/Cache/Drive/Content services) · `server.js` page + `/rpc` · `h.js` Playwright helpers.
- Suites: `no_leak_test` (public-repo guard) · `drive_test` (Drive form files + once-per-deploy Sheet update) · `spr_test` · `guard_test` · `grid_proof` ·
  `report_sheet_test` · `sat_report_test` · `tests` (AP engine) · `pause_test` · `minors` · `sat` (routing) · `sat98` (SAT end to end).
  Local only: `sat_real.js`, `compat_test.js`, `tour.js` (screenshots).
- Env: `APP_DIR` (default `../src`), `WORK_DIR` (default `.work`), `DATA_DIR`, `FORM`/`CARD` (tests.js), `AP_FORM`/`AP_CARD` (pause, report, grid, minors).
- `make_mock_ap45.py`, `make_satmock98.py` regenerate the fixtures (own made-up content).
