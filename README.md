# Test Zone

Bluebook-style mock-test web app for Minh's SAT / AP students. Google Apps Script web app + a Google Sheet as database.

| What | Where |
|---|---|
| **Live app (students + teacher)** | **https://minhtranlab.github.io/testzone/** (nice link, see "Nice link" below) |
| Same app, script link (still works) | https://script.google.com/macros/s/AKfycbxCLbgQdFZ0ykhVx5q0vw5dpTtwi4zSUnaWUrc59-7wQIhmyXIi3EWfQ19WOD84cm1D/exec |
| Deployment id | in [`.deployment`](.deployment) — every deploy is a new version of this one deployment, so the link never changes |
| Sheet "Test Zone – Data" | `1J4hiHL4qq-lcSlMZtzAwssIYpX36Wgff5NGhAYUZekY` (Google account minhtranipad@gmail.com, private) |
| Apps Script project (bound to the Sheet) | script id in [`.clasp.json`](.clasp.json) |
| Form files (questions + keys) | private Drive folder "Test Zone - Form Files" `1Nd3X_obFvl8Tkw_zweZA4sNp0-ITtLAo`, one `<form_id>.json` per form |
| Project notes, rules, spec, question data | Minh's Mac folder `~/Desktop/01 - Tutoring/Test App - SAT AP and else` (not in this repo) |

## ⚠️ This repo is PUBLIC

Anyone can read every file here. The repo holds **code only**:
never commit question text, answer keys, figures, `data/`, `dist/`, `Sample Test/`, `Materials/`, built `Data_*.gs` / `Questions_*.csv` / `<form_id>.json`, the Desmos key, student or teacher codes, or any token.
`.gitignore` blocks the usual paths and `tests/no_leak_test.js` fails the build (nothing is deployed) if something slips in.
No GitHub Pages / website for this repo.

Students only ever get questions through the Apps Script server after logging in with their code; answer keys never leave the server.

## How to ship a change (every chat)

```bash
git pull --rebase                 # always start from the latest main
# … change files in src/ (app) or tools/ / tests/ …
bash tests/run_ci.sh              # the same suites the Action runs; must end with "ALL SUITES PASSED"
git add -A && git commit -m "what changed"
git push                          # to main
```

Then the GitHub Action **Test and deploy** runs (Actions tab): tests → `clasp push` → new version of the same deployment → Sheet update.
Green ✅ = live, about 3–6 minutes after the push. **Nobody pastes code or deploys by hand any more.**

Notes
- Bump `APP_VERSION` in `src/Code.gs` when students would notice the change; the Action writes the commit id into `APP_BUILD` itself.
- Pushes to other branches and pull requests run the tests only (no deploy).
- `clasp push` replaces **every** file of the Apps Script project with `src/`: anything edited in the online editor is overwritten on the next push. Edit here, not in the editor.

### What the Action does after deploying: the Sheet update
`Update.gs` runs once per deploy (the Action opens `<app link>?update=1`; the answer is one line of status text, never Sheet data):
header renames → `addMissingColumns_` (new columns at the end) → Forms rows (old SAT ids renamed, rows for forms with a Drive file, `data_file_id` filled) → Settings rows (teacher_code) → text tabs from `SheetText.gs` → `Score_Scale` (created once, then Minh's) → `importQuestions_` (rows for new forms; existing rows are kept) → `rebuildAll_` (Topic_Summary / Student_Report / Report list) → `checkSheet_` (read-only).
Result: Settings row `code_version` (value = version · commit, meaning = when + one-line result).
Fallback: Sheet menu **Test Zone → Update after new version** (runs it again).
All four steps are append-only / rebuild-only; they never delete or overwrite data that Minh or students wrote.
Anything bigger (renaming tabs, moving columns, rewriting rows) needs Minh's OK first and goes in its own reviewed step.

### When the Action is red ❌
Open the Actions tab → the red run → the red step:

| Red step | Meaning | What to do |
|---|---|---|
| Run all test suites | a test failed (look for `✗ FAIL` or `FAIL` in the log; `no_leak_test` = data/secret found in the repo) | fix, run `bash tests/run_ci.sh` locally, push again. Nothing was deployed. |
| Write clasp credentials | secret `CLASPRC_JSON` missing | see "If the Google login expires" |
| clasp push / New version | Google refused (`invalid_grant` = login expired or revoked; `User has not enabled the Apps Script API` = turned off at script.google.com/home/usersettings) | re-login, or ask Minh to turn the API back on |
| Sheet update | `FAILED` = a step of Update.gs threw (Apps Script editor → Executions shows which); "authorization required" = the code now needs a new Google permission | Minh opens the Apps Script editor once, runs `updateAfterNewVersion`, presses **Allow**; then re-run the Action |

Re-run: Actions → the run → **Re-run jobs**. The live app keeps the last good version until a deploy succeeds.

## Form data (questions + keys) — Drive, never git

```bash
# on the Mac, from this repo; data/ is in the project folder
python3 tools/build_data.py "<project folder>/data/<form folder>"   # → dist/<form_id>.json (+ Forms_Registry.gs, Data_*.gs, csv)
node tools/upload_form.mjs dist/<form_id>.json                     # upload / replace in the Drive folder (uses ~/.clasprc.json)
cp dist/Forms_Registry.gs src/                                    # profiles only (no questions/keys) — commit + push this
```
The server finds `<form_id>.json` by name in the Form Files folder, caches it (CacheService, ≤ 10 min to pick up a replaced file) and never sends keys to the browser.
A form listed in `Forms_Registry.gs` / the Forms tab but without a file on Drive shows as "Coming soon".

## What the app does (v1.10)
- Students sign in with their code (Students tab) → My Tests → AP Calc AB 2012 and the SAT forms (SAT · August 2026, September 2026 A / B, October 2026, November 2026; a form without its Drive file shows "Coming soon").
- Assignments (v1.10, Sheet tab `Assignments`): one row = one student + form + parts (`RW`, `MATH`, `RW1`, `RW2`, `M1`, `M2`, several with a comma; AP `A`, `B`) + active Yes. The student gets an extra card "Assigned by your teacher" at the top of My Tests: only those parts, normal order and time, the break only when RW + Math parts are assigned. Result limited to those parts; estimated score only for a whole section. `Sessions.scope` = `full` or the parts; Student_Report / Report tab show "Part: Math Module 1". Code: `src/Assign.gs`.
- My Tests: each card shows the title and the total time (light grey, top right); the section / module lines are on the start screen.
- Result page (all exams, English, never a key): SAT estimated score first (total, then RW / Math ranges with x/y correct and Module 1 / Module 2), no method text for students (teacher sees a short note); "What to practise first" = short tips + the mode of the practice app (Settings `practice_app_name`, `practice_mode <skill>`); results by skill with missed-question chips (V1-21, V2-05, M1-21, M2-07; AP A-12 / B-04); types of mistakes with badges **S** (slow) / **R** (rushed) on chips and grid cells.
- Slow / rushed: per question type and difficulty from the `Time_Norms` tab (created once from SC's `sat_time_norms.csv` via `tools/build_time_norms.py` → `src/TimeNorms.gs`; Minh may edit it, every re-grade re-times the rows).
- Opening a question (student or teacher) shows the real test screen (split pane, Highlight, Desmos + Reference in Math; timer hidden). Student: read-only, no key. Teacher: may select / eliminate (not saved) + **Show answer** (fetches that one key). **Back to result** keeps the scroll position.
- Teacher mode: sign in with `Settings → teacher_code` → students → attempts → the same result page.
- SAT break: 10:00 countdown, Math Module 1 starts by itself at 0:00; "Save and Continue Later" only on the break screen.
- Keys: the Questions-tab `key` overrides the data file (grading, reports). SPR: accepted answers separated by `|`; a rounded decimal key (e.g. 0.651 next to 441/677) only matches as typed text.
- The Sheet is English: README / Interpretation / Dictionary / Settings meanings are written from `src/SheetText.gs` on every deploy (edit them there).
- Every Sheet update (and menu **Re-grade after a key change**) re-grades submitted attempts from the current keys (`src/Regrade.gs`).
- One live window per attempt: each opening gets a new copy token (`Sessions.copy_token`); an older window is told "This test is open in another window. Close this one." and stops.
- Sign-in lock-out: 10 wrong codes in 15 min per code / per device → wait 15 min; 30 wrong codes in 15 min in total → every sign-in waits 5 min.
- Report tab: picking an attempt in B2 works without Drive (the simple trigger has no Drive rights; tags come from the Questions tab). The Drive form list is only cached after a successful read.

## Nice link (GitHub Pages, ticket #25)
- https://minhtranlab.github.io/testzone/ = `site/index.html`: one page that shows the Apps Script web app full screen (iframe). No code, data or keys on it; every rule stays on the Apps Script side. The script link above keeps working (same app).
- `src/Code.gs` serves the app with `XFrameOptionsMode.ALLOWALL` so it may be shown inside that page.
- Published from the `gh-pages` branch (only `site/` files): after changing `site/`, push `main` and run `bash tools/publish_site.sh`. Pages for this repo only; nothing on `minhtranlab.github.io` itself.
- Tested by `tests/site_test.js` (wrapper and app on two different sites: full screen, sign-in kept after reload, resume, one live window, Save and Continue Later, Desmos, teacher; desktop + iPad sizes).

## How to test live
- Use the test student **Minh (test)** only; never a real student's code. Never write the teacher code in a file, report, log or commit.
- **Close the test tab when you are done.** A tab left open on an attempt is a second window of that attempt (it is stopped now, but it was the cause of QA N1 in #20).
- Opening a form creates an attempt in Sessions; say in your report which test attempts you left (in progress / completed).

## Layout

```
src/        Apps Script project (pushed as is): Code.gs (server), Report.gs (analysis + result page), ReportTab.gs (Sheet Report tab),
            Score.gs + ScoreScale.gs (SAT estimate), Setup.gs (checkSheet …), Update.gs + Sync.gs + SheetText.gs (per-deploy Sheet update),
            Forms_Registry.gs (profiles), Index.html, Styles.html, Client.html, appsscript.json (scopes + web app: execute as owner, anyone)
tools/      build_data.py (form JSON + registry), upload_form.mjs (Drive), make_sat_profiles.py, build_score_scale.py, profiles/
tests/      harness: gas.js (Apps Script + Sheet mock), server.js + h.js (Playwright), suites, fixtures/ (made-up forms only)
.github/workflows/deploy.yml   the pipeline
```

## Tests
`bash tests/run_ci.sh` = setup + every suite on made-up fixture forms (what CI runs).
Local extra with the real forms (never in CI): `TZ_DATA="<project folder>/data" bash tests/setup.sh`, then e.g.
`DATA_DIR=tests/.work/gas FORM=APCAB-2012 CARD="Practice Exam 2012" node tests/tests.js`, `AP_FORM=APCAB-2012 node tests/pause_test.js`, `node tests/sat_real.js`.
Needs Node 22, Python 3 + Pillow, Playwright 1.63 with Chromium (`npm i playwright@1.63.0 && npx playwright install chromium` in `tests/`).

## Credentials
- GitHub secret **`CLASPRC_JSON`** = clasp login of minhtranipad@gmail.com (scopes: script projects/deployments/web-app deploy, drive.file, email). Only the deploy job on `main` can read it; it is never printed.
- **If the Google login expires** (Action says `invalid_grant`): a chat runs the two-step login (`clasp login --no-localhost`, or the helper used in ticket #7), Minh opens the link, chooses minhtranipad@gmail.com, presses Allow and pastes back the `http://localhost:8888/?…` address; the chat then runs `gh secret set CLASPRC_JSON --repo minhtranlab/testzone < ~/.clasprc.json`.
- The Apps Script project runs as Minh (web app "Execute as: Me", "Anyone"). Its scopes are listed in `src/appsscript.json`; adding a scope means Minh must press Allow once (see table above).
