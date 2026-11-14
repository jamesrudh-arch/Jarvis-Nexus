#!/usr/bin/env python3
"""Scan downloaded JS bundles for leaked credentials.
Values to check are passed via environment variables so they are never
printed or hard-coded. Output contains ONLY booleans/counts, never values.
"""
import glob
import os
import re
import sys

AUDIT_DIR = "/home/z/my-project/audit/bundles"

# --- 1. Exact user-supplied credential checks (values from env) ---
# EOS values supplied by the user in chat (never printed)
eos_checks = {
    "EOS_CLIENT_ID": os.environ.get("EOS_CLIENT_ID", ""),
    "EOS_CLIENT_SECRET": os.environ.get("EOS_CLIENT_SECRET", ""),
    "EOS_PRODUCT_ID": os.environ.get("EOS_PRODUCT_ID", ""),
    "EOS_SANDBOX_ID": os.environ.get("EOS_SANDBOX_ID", ""),
    "EOS_DEPLOYMENT_ID": os.environ.get("EOS_DEPLOYMENT_ID", ""),
}

# --- 2. Generic secret patterns ---
generic_patterns = {
    "OpenAI-style key (sk-)": re.compile(r"sk-[A-Za-z0-9]{20,}"),
    "GitHub PAT (ghp_/gho_)": re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    "Anthropic key": re.compile(r"sk-ant-[A-Za-z0-9-]{20,}"),
    "Supabase service_role JWT": re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"),
    "Railway token": re.compile(r"[A-Za-z0-9]{30,}\.up\.railway\.app"),
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    "Private key block": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "Bearer literal tokens": re.compile(r"Bearer [A-Za-z0-9._-]{30,}"),
    "env-style secret assignments": re.compile(
        r"(?i)(client_secret|api_secret|secret_key|private_key)\s*[:=]\s*['\"][A-Za-z0-9+/_-]{16,}['\"]"
    ),
}

files = sorted(glob.glob(os.path.join(AUDIT_DIR, "*.js")))
all_text = {}
for f in files:
    with open(f, "r", errors="replace") as fh:
        all_text[os.path.basename(f)] = fh.read()

print("=" * 62)
print("BUNDLE SECRET SCAN — output shows presence only, never values")
print("=" * 62)
print(f"Bundles scanned: {len(files)} ({sum(len(t) for t in all_text.values()):,} bytes total)\n")

print("[1] User-supplied EOS credential leakage")
verdicts = []
for name, val in eos_checks.items():
    if not val:
        print(f"  {name}: SKIPPED (not provided)")
        continue
    hits = {fn: t.count(val) for fn, t in all_text.items() if val in t}
    if hits:
        verdicts.append((name, hits))
        print(f"  {name}: *** LEAKED *** in {hits}")
    else:
        print(f"  {name}: not present in any bundle")

if not verdicts:
    print("  => PASS: no user-supplied EOS credentials appear in public bundles")
print()

print("[2] Generic secret-pattern scan")
any_leak = False
for name, pat in generic_patterns.items():
    total = 0
    where = {}
    for fn, t in all_text.items():
        c = len(pat.findall(t))
        if c:
            where[fn] = c
            total += c
    if total:
        any_leak = True
        print(f"  {name}: {total} match(es) in {where}  <-- INSPECT")
    else:
        print(f"  {name}: 0 matches")

print()
print("[3] Supabase anon-key style JWTs (public-by-design, but verify role)")
jwt_pat = re.compile(r"eyJhbGciOi[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*")
jwt_count = 0
for fn, t in all_text.items():
    for m in jwt_pat.findall(t):
        jwt_count += 1
        # decode payload to check role claim without printing full key
        import base64, json
        try:
            pad = m.split(".")[1] + "=" * (-len(m.split(".")[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(pad))
            role = payload.get("role", "unknown")
            ref = payload.get("ref", "unknown")
            print(f"  JWT found in {fn}: role={role} ref={ref}")
        except Exception as e:
            print(f"  JWT found in {fn}: (undecodable)")
if jwt_count == 0:
    print("  none found")

print()
print("[4] URLs to third-party services (info disclosure review)")
urls = set()
for t in all_text.values():
    urls.update(re.findall(r"https://[A-Za-z0-9.-]+(?:supabase|openai|anthropic|groq|gemini|googleapis|huggingface|cloudflare|railway|epicgames|epic\.gg)[A-Za-z0-9./_-]*", t))
for u in sorted(urls)[:20]:
    print(f"  {u}")

print()
print("SCAN COMPLETE")
sys.exit(0)
