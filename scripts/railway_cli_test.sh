#!/usr/bin/env bash
# Test Railway CLI auth + deploy capabilities with the workspace token.
# Never prints the token value.
set -u
export RAILWAY_TOKEN="$(grep '^RAILWAY_TOKEN=' /home/z/my-project/.env | cut -d= -f2- | tr -d '"' | tr -d "'")"
export RAILWAY_API="https://backboard.railway.com/graphql/v2"

echo "=== whoami ==="
timeout 30 railway whoami 2>&1 | head -5
echo "=== status (project link) ==="
cd /home/z/my-project/NEXUS_WORLD 2>/dev/null || cd /home/z/my-project
timeout 30 railway status 2>&1 | head -10
echo "=== help up ==="
timeout 30 railway up --help 2>&1 | head -30
