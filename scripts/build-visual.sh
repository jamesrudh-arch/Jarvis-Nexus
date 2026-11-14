#!/bin/bash
# Stage 2 — build the visual application and assemble the standalone output.
# The standalone server does NOT copy static assets by itself; without this
# step client chunks 404 and the page never hydrates (interactivity dies).
set -eu
cd /home/z/my-project
bunx next build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
echo "standalone assembled: $(ls .next/standalone | tr '\n' ' ')"
