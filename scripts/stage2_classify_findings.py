#!/usr/bin/env python3
"""Stage 2 Phase 1.1 — classify the 11 secret-scan findings as SYNTHETIC or REAL-RISK.

For each finding, reports structural markers only (contains 'test'/'fake'/'dummy',
character composition, whether it matches known synthetic fixtures) — never the value.
"""
import re
import json

def classify(name, value, extra=""):
    markers = {
        "contains_test": bool(re.search(r"(?i)test|fake|dummy|notareal|not-a-real|example|sample|placeholder|synthetic|fixture|xxxx|0000|1234|abcd", value)),
        "is_repeated_char": bool(re.fullmatch(r"(.)\1+", value)),
        "len": len(value),
        "charset": "hex" if re.fullmatch(r"[0-9a-f]+", value) else ("b64ish" if re.fullmatch(r"[A-Za-z0-9_\-]+", value) else "mixed"),
    }
    verdict = "SYNTHETIC-LIKELY" if markers["contains_test"] or markers["is_repeated_char"] else "NEEDS-MANUAL-REVIEW"
    print(f"{name}\n  markers: {json.dumps(markers)} {extra}\n  verdict: {verdict}\n")

print("=== F1: packages/railway/src/index.ts 'secret:' assignment (webhook default?) ===")
src = open("packages/railway/src/index.ts").read()
m = re.search(r"secret\s*[:=]\s*[\"']([A-Za-z0-9_\-\.]+)[\"']", src)
if m:
    classify("F1 railway webhook secret literal", m.group(1),
             extra="| surrounding: " + re.sub(r"[A-Za-z0-9_\-\.]{12,}", "<LONG>", src[max(0,m.start()-200):m.end()+100]).replace("\n"," ")[:200])

print("=== F2: tests/integration/railway-routes.test.ts const secret ===")
t1 = open("tests/integration/railway-routes.test.ts").read()
m = re.search(r"const\s+secret\s*=\s*[\"']([^\"']+)[\"']", t1)
if m:
    classify("F2 test webhook secret", m.group(1))

print("=== F3: tests/scenarios/railway-exercises.test.ts rlwy_ token ===")
t2 = open("tests/scenarios/railway-exercises.test.ts").read()
for m in re.finditer(r"(rlwy_[A-Za-z0-9_]+)", t2):
    classify("F3 scenario railway token", m.group(1))
    break

print("=== F4: tests/unit/railway-audit.test.ts rlwy_ token ===")
t3 = open("tests/unit/railway-audit.test.ts").read()
for m in re.finditer(r"(rlwy_[A-Za-z0-9_]+)", t3):
    classify("F4 audit-test railway token", m.group(1))
    break

print("=== F5/F6: tests/unit/railway-credentials.test.ts fixtures ===")
t4 = open("tests/unit/railway-credentials.test.ts").read()
for i, m in enumerate(re.finditer(r"(rlwy_[A-Za-z0-9_]+)", t4)):
    classify(f"F5 credentials-test rlwy_ #{i+1}", m.group(1))
    if i >= 2: break
for i, m in enumerate(re.finditer(r"(gh[pousr]_[A-Za-z0-9]+)", t4)):
    classify(f"F6 credentials-test github #{i+1}", m.group(1))
    if i >= 1: break

print("=== F7: CHANGELOG.md (historical commit 535bfc3) token mention ===")
import subprocess
blob = subprocess.run(["git", "show", "535bfc3:CHANGELOG.md"], capture_output=True, text=True).stdout
m = re.search(r"token[s]?\s*[:=]?\s*[\"']?([A-Za-z0-9_\-\.]{30,})[\"']?", blob)
if m:
    classify("F7 CHANGELOG token-shaped string", m.group(1),
             extra="| full line: " + re.sub(r"[A-Za-z0-9_\-\.]{25,}", "<LONG-REDACTED>", blob[m.start()-120:m.end()+80]).replace("\n"," "))

print("=== F8/F9: reference/Jarvis test_gate0_auth.py (historical) ===")
blob = subprocess.run(["git", "show", "535bfc3:reference/Jarvis/backend/tests/test_gate0_auth.py"], capture_output=True, text=True).stdout
for i, m in enumerate(re.finditer(r"token[\"' ]{0,3}[:=][\"' ]{1,3}([A-Za-z0-9_\-\.]{24,})", blob)):
    classify(f"F8 gate0 auth token #{i+1}", m.group(1))
    if i >= 1: break
for i, m in enumerate(re.finditer(r"Bearer\s+([A-Za-z0-9_\-=\.]{30,})", blob)):
    classify(f"F9 gate0 bearer #{i+1}", m.group(1))
    if i >= 0: break

print("=== F10: tests/unit/ownerAuth.test.mjs SECRET ===")
blob = subprocess.run(["git", "show", "535bfc3:tests/unit/ownerAuth.test.mjs"], capture_output=True, text=True).stdout
m = re.search(r"const\s+SECRET\s*=\s*[\"']([^\"']+)[\"']", blob)
if m:
    classify("F10 ownerAuth test SECRET", m.group(1))
