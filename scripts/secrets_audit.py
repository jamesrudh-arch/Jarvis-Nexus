#!/usr/bin/env python3
"""Secrets audit: scan ALL git-tracked files for secret patterns.
Exit non-zero if any potential secret is found in tracked content."""
import re
import subprocess
import sys

# Patterns matching the real credential formats used in this project
PATTERNS = [
    ("GitHub classic PAT", re.compile(r"ghp_[A-Za-z0-9]{36}")),
    ("GitHub fine-grained PAT", re.compile(r"github_pat_[A-Za-z0-9_]{22,}")),
    ("Kaggle API token", re.compile(r"Kaggle\s+Signature|KAGGLE_TOKEN_?\w*\s*=\s*\S{20,}")),
    ("Cloudflare API token value", re.compile(r"[A-Za-z0-9_-]{40}_[A-Za-z0-9_-]{13}")),
    ("Supabase secret key", re.compile(r"sb_secret_[A-Za-z0-9]{20,}")),
    ("Supabase PAT", re.compile(r"sbp_[A-Za-z0-9]{20,}")),
    ("Railway token", re.compile(r"railway_\w+|rlw_[A-Za-z0-9]{20,}")),
    ("Epic secret-like", re.compile(r"xyza7891[A-Za-z0-9]{24}")),
    ("R2 secret key (sha256-like in env assignment)", re.compile(r"R2_SECRET_ACCESS_KEY\s*=\s*[0-9a-f]{64}")),
    ("Generic password assignment (literal)", re.compile(r"(?i)(password|passwd|secret)[a-z_]*\s*[:=]\s*['\"][^'\"]{12,}['\"]")),
]

TEXT_EXTS = {
    ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".md", ".json", ".example",
    ".yml", ".yaml", ".toml", ".ini", ".cfg", ".sql", ".prisma", ".sh", ".css",
    ".cpp", ".h", ".uplugin", ".uproject", ".gitignore", ".env", "", ".txt",
}


# Files allowed to mention credential NAMES (template/docs) — but never values
tracked = subprocess.run(
    ["git", "ls-files"], capture_output=True, text=True, check=True
).stdout.splitlines()

hits = []
for path in tracked:
    ext = "." + path.rsplit(".", 1)[-1] if "." in path.rsplit("/", 1)[-1] else ""
    if ext.lower() not in TEXT_EXTS and not path.endswith(".env.example"):
        continue  # skip binaries (db, images, fonts, glb…)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except (IsADirectoryError, FileNotFoundError):
        continue
    if "\x00" in content[:4096]:
        continue  # binary safety net
    for name, rx in PATTERNS:
        for m in rx.finditer(content):
            snippet = m.group(0)
            # Skip obvious placeholders/examples and env-var reads (code, not values)
            if any(ph in snippet for ph in ("XXXX", "xxxx", "your-", "YOUR", "<", "example", "dummy", "process.env")):
                continue
            hits.append((path, name, snippet[:12] + "..."))

if hits:
    print(f"FAIL: {len(hits)} potential secret(s) in tracked files:")
    for path, name, snip in hits:
        print(f"  {path}: {name} ({snip})")
    sys.exit(1)
print(f"PASS: no secrets found in {len(tracked)} tracked files "
      "(credential NAMES in .env.example/docs are expected; no VALUES).")

# Also verify .env files are ignored
for f in (".env", ".env.local"):
    r = subprocess.run(["git", "check-ignore", "-v", f], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAIL: {f} is NOT gitignored!")
        sys.exit(1)
    print(f"PASS: {f} ignored via {r.stdout.strip().split(':')[0]}")
