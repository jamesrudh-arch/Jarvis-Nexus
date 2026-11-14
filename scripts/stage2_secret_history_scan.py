#!/usr/bin/env python3
"""Stage 2 Phase 1.1 — full-history secret scan.

Scans EVERY blob of EVERY file across ALL commits for secret-shaped strings.
Reports: file path, commit, pattern matched, REDACTED preview only.
Never prints secret values.
"""
import re
import subprocess
import sys
import json

PATTERNS = [
    ("railway_token", re.compile(r"rlwy_(?:wksp|acc|proj|prj)_[A-Za-z0-9_]{20,}")),
    ("openai_key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9_\-]{30,}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}")),
    ("cloudflare_global_key", re.compile(r"(?i)cloudflare.{0,40}[A-Za-z0-9_\-]{37}\b")),
    ("cf_api_token_bearer", re.compile(r"\b[A-Za-z0-9_\-]{40}\b(?=.{0,80}api\.cloudflare)")),
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("supabase_service_key", re.compile(r"eyJ[a-zA-Z0-9_\-]{40,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}")),
    ("jwt_generic", re.compile(r"eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}")),
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("generic_api_key_assignment", re.compile(
        r"(?i)(api[_-]?key|token|secret|password|passwd|credential)[\"' ]{0,3}[:=][\"' ]{1,3}(?!$|null|undefined|process\.env|import\.meta|your[_-]|xxx|placeholder|example|changeme|\{\{|<)[A-Za-z0-9_\-\.\/+=]{24,}")),
    ("bearer_literal", re.compile(r"(?i)bearer\s+[A-Za-z0-9_\-=\.]{30,}")),
    ("kaggle_key", re.compile(r"(?i)kaggle.{0,30}(?<![A-Za-z0-9])[A-Za-z0-9]{32}(?![A-Za-z0-9])")),
    ("high_entropy_hex64", re.compile(r"\b[0-9a-f]{64}\b")),
]

BENIGN = re.compile(
    r"(?i)(hash|sha256|checksum|digest|commit|fingerprint|prev_hash|chain|content-hash|etag|sha-?256|merkle|image|screenshot|render|placeholder|test-vector|example|seed|mock)")


def redact(s, keep=6):
    return s[:keep] + f"...<{len(s)} chars>" if len(s) > keep else "***"

def main():
    # 1. enumerate all commits
    commits = subprocess.run(["git", "rev-list", "--all"], capture_output=True, text=True).stdout.split()
    findings = []
    scanned_blobs = set()
    blob_count = 0

    for c in commits:
        # list all blobs in this commit
        out = subprocess.run(["git", "ls-tree", "-r", c], capture_output=True, text=True).stdout
        for line in out.splitlines():
            if not line.strip():
                continue
            meta, path = line.split("\t", 1)
            parts = meta.split()
            otype, oid = parts[1], parts[2]
            if otype != "blob":
                continue
            # scan each unique blob once
            key = oid
            if key in scanned_blobs:
                continue
            scanned_blobs.add(key)
            # skip binary-ish large blobs (renders, screenshots) for speed but still scan for private keys
            blob = subprocess.run(["git", "cat-file", "blob", oid], capture_output=True).stdout
            blob_count += 1
            try:
                text = blob.decode("utf-8")
            except UnicodeDecodeError:
                # binary: only scan for private key blocks
                try:
                    text = blob.decode("utf-8", "replace")
                except Exception:
                    continue
            for name, pat in PATTERNS:
                for m in pat.finditer(text):
                    val = m.group(0)
                    # context line for benign filtering
                    start = max(0, m.start() - 60)
                    ctx = text[start:m.end() + 60].replace("\n", " ")
                    if BENIGN.search(ctx):
                        continue
                    findings.append({
                        "commit": c[:12],
                        "path": path,
                        "pattern": name,
                        "redacted": redact(val),
                        "context_shape": re.sub(r"[A-Za-z0-9_\-=\.\/+]{8,}", "<LONG>", ctx)[:160],
                    })

    # dedupe by (path, pattern, redacted)
    seen = set()
    uniq = []
    for f in findings:
        k = (f["path"], f["pattern"], f["redacted"])
        if k not in seen:
            seen.add(k)
            uniq.append(f)

    print(json.dumps({
        "commitsScanned": len(commits),
        "uniqueBlobsScanned": blob_count,
        "uniqueFindings": len(uniq),
    }, indent=2))
    for f in uniq[:200]:
        print(f"{f['commit']}\t{f['path']}\t{f['pattern']}\t{f['redacted']}\t| ctx: {f['context_shape']}")

if __name__ == "__main__":
    main()
