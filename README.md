# Test Zone

Bluebook-style mock-test web app for Minh's SAT / AP students. Google Apps Script web app + a Google Sheet as database.

| What | Where |
|---|---|
| **Live app (students)** | https://script.google.com/macros/s/AKfycbxCLbgQdFZ0ykhVx5q0vw5dpTtwi4zSUnaWUrc59-7wQIhmyXIi3EWfQ19WOD84cm1D/exec |
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

## What the app does (v1.6)
- Students sign in with their code (Students tab) → My Tests → AP Calc AB 2012 and the SAT forms (SAT · August 2026, September 2026 A / B, October 2026, November 2026; a form without its Drive file shows "Coming soon").
- Result page (all exams, English, never a key): score, estimated SAT score range (Score_Scale tab, SC's formula), results by section → domain → skill (AP: unit → topic), types of mistakes, "What to practise first", 2-sittings note, and a read-only review of every question (own answer, right / wrong, time).
- Teacher mode: sign in with `Settings → teacher_code` → students → attempts → the same result page → each question with the student's answer; **Show answer** fetches that one key only when pressed.
- SAT break: 10:00 countdown, Math Module 1 starts by itself at 0:00; "Save and Continue Later" only on the break screen.
- Keys: the Questions-tab `key` overrides the data file (grading, reports). SPR: accepted answers separated by `|`; a rounded decimal key (e.g. 0.651 next to 441/677) only matches as typed text.
- The Sheet is English: README / Interpretation / Dictionary / Settings meanings are written from `src/SheetText.gs` on every deploy (edit them there).

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
