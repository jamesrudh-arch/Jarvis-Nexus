#!/usr/bin/env bash
# NEXUS WORLD — Phase 0 hardware / environment audit
# Reproducible evidence collector. Run: bash scripts/hardware_audit.sh
set -u
echo "=== NEXUS WORLD ENVIRONMENT AUDIT ==="
date -u +"Audit time (UTC): %Y-%m-%d %H:%M:%S"
echo
echo "--- CPU ---"
nproc
grep -m1 "model name" /proc/cpuinfo 2>/dev/null || echo "model name unavailable"
echo
echo "--- MEMORY ---"
free -h
echo
echo "--- SWAP ---"
swapon --show 2>/dev/null || echo "no swap"
echo
echo "--- DISK ---"
df -h / /home /tmp 2>/dev/null
echo
echo "--- GPU ---"
if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi | head -15; else echo "NO NVIDIA GPU (nvidia-smi not found)"; fi
ls /dev/dri 2>/dev/null || echo "no /dev/dri devices (no GPU passthrough)"
echo
echo "--- OS / KERNEL ---"
uname -a
head -3 /etc/os-release 2>/dev/null
echo
echo "--- RUNTIMES ---"
echo -n "Python: "; python3 --version 2>&1
echo -n "pip:    "; pip3 --version 2>&1 | awk '{print $1, $2}'
echo -n "Node:   "; node --version 2>&1
echo -n "npm:    "; npm --version 2>&1
echo -n "Git:    "; git --version 2>&1
echo
echo "--- DATABASES / SERVICES INSTALLED ---"
for cmd in psql mysql neo4j redis-server nats-server temporal docker podman; do
  if command -v "$cmd" >/dev/null 2>&1; then echo "$cmd: PRESENT"; else echo "$cmd: absent"; fi
done
echo
echo "--- LISTENING PORTS ---"
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | head -20
echo
echo "--- RELEVANT PYTHON PACKAGES ---"
pip3 list 2>/dev/null | grep -iE "django|neo4j|langchain|langgraph|faiss|torch|transformers|vllm|mesa|nats|temporal|redis|psycopg|fastapi|flask|inspect" || echo "none of the tracked packages installed"
echo
echo "=== AUDIT END ==="
