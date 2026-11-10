#!/usr/bin/env bash
# Publish site/ (the nice-link page, ticket #25) to the gh-pages branch → https://minhtranlab.github.io/testzone/
# Only site/ goes there (no code, no data). Run from the repo root after site/ changed on main.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
TMP=$(mktemp -d)
git fetch -q origin gh-pages 2>/dev/null && git worktree add -q "$TMP" origin/gh-pages --detach || { git worktree add -q --detach "$TMP" && (cd "$TMP" && git checkout -q --orphan gh-pages-new && git rm -rqf . ); }
find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp site/* "$TMP"/ && touch "$TMP/.nojekyll"
cd "$TMP" && git add -A
if git diff --cached --quiet; then echo "gh-pages: nothing to publish"; else
  git commit -q -m "site: publish from main $(git -C "$ROOT" rev-parse --short HEAD)" && git push -q origin HEAD:refs/heads/gh-pages && echo "gh-pages: published"; fi
cd "$ROOT" && git worktree remove --force "$TMP"
