#!/usr/bin/env bash
# clone_repo.sh — restore the JARVIS NEXUS repo from GitHub using stored credentials.
# SECURITY: token values are never echoed; .git/config sanitized after clone.
set -uo pipefail
source /home/z/my-project/credentials.env
DST=/home/z/my-project/repo

# Normalize repo slug (strip URL forms, keep owner/name)
case "$GITHUB_REPO" in
  https://github.com/*) SLUG="${GITHUB_REPO#https://github.com/}"; SLUG="${SLUG%.git}" ;;
  git@github.com:*)     SLUG="${GITHUB_REPO#git@github.com:}"; SLUG="${SLUG%.git}" ;;
  *)                    SLUG="${GITHUB_REPO%.git}" ;;
esac
[ -n "$SLUG" ] || { echo "FATAL: GITHUB_REPO empty"; exit 1; }
echo "repo slug: $SLUG"

rm -rf "$DST"
ok=""
for AUTH in x-access-token oauth2 plain; do
  case "$AUTH" in
    plain) URL="https://${GITHUB_TOKEN}@github.com/${SLUG}.git" ;;
    *)     URL="https://${AUTH}:${GITHUB_TOKEN}@github.com/${SLUG}.git" ;;
  esac
  if git clone --quiet "$URL" "$DST" 2>/tmp/clone_err.txt; then
    echo "CLONE OK (auth form: $AUTH)"
    ok=1; break
  fi
  echo "clone attempt failed (auth form: $AUTH):"
  sed -E 's#(x-access-token|oauth2):[^@]*@#\1:***@#; s#https://[A-Za-z0-9_]{20,}@github.com#https://***@github.com#' /tmp/clone_err.txt | head -4
done
[ -n "$ok" ] || { echo "CLONE FAILED"; exit 1; }

# Never leave the token in .git/config
git -C "$DST" remote set-url origin "https://github.com/${SLUG}.git"
echo "--- git log ---"
git -C "$DST" log --oneline -14
echo "--- working tree status ---"
git -C "$DST" status --short | head -8
echo "--- top-level tree ---"
ls "$DST"
