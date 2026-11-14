#!/usr/bin/env bash
# GITHUB REMOTE WIPE (owner-authorized, credentials supplied 2026-11-14).
# 1. ls-remote BEFORE
# 2. rebuild push repo from VERIFIED backup bundles (full bundle + wipe-branch bundle)
# 3. fast-forward push e599eb9 -> main (NO force, NO history rewrite)
# 4. delete obsolete phase-* tags (commits stay reachable via main history + bundles)
# 5. ls-remote AFTER
# 6. fresh-clone verification (client's-eye view of the wiped repository)
set -uo pipefail
EV=/home/z/my-project/download/reset_20261114
REPO_URL=https://github.com/jamesrudh-arch/Jarvis-Nexus.git

echo "=== GITHUB REMOTE WIPE: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

echo
echo "--- 1. ls-remote BEFORE ---"
git ls-remote --heads --tags "$REPO_URL"

echo
echo "--- 2. rebuild push repo from verified bundles ---"
rm -rf /tmp/wipepush
git init -q -b main /tmp/wipepush
cd /tmp/wipepush
git fetch -q "$EV/git_full_backup_20261114.bundle" '+refs/*:refs/backup/*'
git fetch -q "$EV/git_wipe_branch.bundle" '+refs/heads/*:refs/heads/*'
echo "wipe commit present: $(git cat-file -t e599eb9) $(git log --oneline -1 e599eb9)"
echo "parent (deployed remote main): $(git log --oneline -1 535bfc3)"
echo "wipe commit tree contents: $(git ls-tree -r --name-only e599eb9 | tr '\n' ' ')"

echo
echo "--- 3. PUSH wipe commit to main (fast-forward, NO force) ---"
git remote add origin "$REPO_URL"
git push origin e599eb9:refs/heads/main 2>&1
echo "push main exit code: $?"

echo
echo "--- 4. DELETE obsolete remote tags ---"
TAGS=$(git ls-remote --tags "$REPO_URL" | awk '{print $2}' | sed 's|refs/tags/||' | sed 's|\^{}$||' | sort -u)
echo "remote tags found: $(echo $TAGS | tr '\n' ' ')"
for t in $TAGS; do
  git push origin --delete "$t" 2>&1
  echo "tag '$t' delete exit code: $?"
done

echo
echo "--- 5. ls-remote AFTER ---"
git ls-remote --heads --tags "$REPO_URL"

echo
echo "--- 6. fresh clone verification ---"
rm -rf /tmp/verifyclone
git clone -q "$REPO_URL" /tmp/verifyclone
cd /tmp/verifyclone
echo "clone HEAD: $(git rev-parse HEAD)"
echo "last commit: $(git log --oneline -1)"
echo "remote branches: $(git branch -r | tr '\n' ' ')"
echo "tag count: $(git tag | wc -l)"
echo "tracked file count: $(git ls-files | wc -l)"
echo "tracked files: $(git ls-files | tr '\n' ' ')"
echo "root directory listing: $(ls -A | tr '\n' ' ')"
echo "obsolete dirs present? $(ls -d src NEXUS_WORLD world prisma 2>/dev/null | tr '\n' ' ' || echo none)"

echo
echo "=== WIPE COMPLETE: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
