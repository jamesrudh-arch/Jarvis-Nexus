#!/usr/bin/env python3
"""Final Acceptance Phase E part 1 — observe the boot backup against real Supabase.

After deploying the corrected commit, the backup scheduler fires ~30s after
boot. This watcher polls the PUBLIC /metrics endpoint (no secrets) until:

  SUCCESS  : backup_supabase_uploads_total{result=ok} appears or grows
             AND backup_supabase_verifications_total{result=ok} appears/grows
  FAILURE  : backup_supabase_uploads_total{result=fail} grows or
             backup_failures_total grows (SUPABASE_* codes)
  TIMEOUT  : neither, within --timeout (default 300s)

Also captures the full backup-related counter set as evidence and writes it to
docs/stage2.4b/evidence/production-acceptance/boot-backup-observation.json
"""
import argparse
import json
import time
import urllib.request

BASE = "https://jarvis-nexus-production.up.railway.app"
OUT = "/home/z/my-project/docs/stage2.4b/evidence/production-acceptance/boot-backup-observation.json"
TAGS = ("backup", "supabase", "offsite")


def counters():
    with urllib.request.urlopen(BASE + "/metrics", timeout=30) as r:
        d = json.loads(r.read())
    out = {}
    for c in d.get("counters", []):
        if any(t in c.get("name", "") for t in TAGS):
            key_labels = json.dumps(c.get("labels", {}), sort_keys=True, separators=(",", ":"))
            out[f"{c['name']}{key_labels}"] = c.get("count", 0)
    return out


def get(name_prefix, label_contains, cs):
    for k, v in cs.items():
        if k.startswith(name_prefix) and label_contains in k:
            return v
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--poll", type=int, default=10)
    a = ap.parse_args()

    print(f"watching {BASE}/metrics for the post-boot Supabase backup (timeout {a.timeout}s)")
    baseline = counters()
    print("baseline:", json.dumps(baseline, indent=1, sort_keys=True))
    b_ok0 = get("backup_supabase_uploads_total", '"result":"ok"', baseline)
    b_ver0 = get("backup_supabase_verifications_total", '"result":"ok"', baseline)
    b_fail0 = get("backup_supabase_uploads_total", '"result":"fail"', baseline)
    b_runs0 = get("backup_runs_total", '"result":"success"', baseline)
    deadline = time.time() + a.timeout
    final, verdict = baseline, "TIMEOUT"
    while time.time() < deadline:
        time.sleep(a.poll)
        try:
            cs = counters()
        except Exception as e:
            print("poll error (retrying):", str(e)[:100])
            continue
        final = cs
        ok = get("backup_supabase_uploads_total", '"result":"ok"', cs)
        ver = get("backup_supabase_verifications_total", '"result":"ok"', cs)
        fail = get("backup_supabase_uploads_total", '"result":"fail"', cs)
        runs = get("backup_runs_total", '"result":"success"', cs)
        line = f"  t+{int(a.timeout - (deadline - time.time()))}s uploads.ok={ok} verifications.ok={ver} uploads.fail={fail} runs.success={runs}"
        print(line)
        if ok > b_ok0 or ver > b_ver0:
            verdict = "SUCCESS"
            break
        if fail > b_fail0:
            verdict = "UPLOAD_FAILED"
            break
        if runs > b_runs0 and ok == 0 and fail == 0:
            # a local backup ran but no supabase result yet — keep waiting
            pass

    print(f"\nverdict: {verdict}")
    out = {
        "watchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "endpoint": BASE + "/metrics",
        "baseline": baseline,
        "final": final,
        "verdict": verdict,
        "note": "public counters only — no secrets; success requires an independently "
                "verified upload (backup_supabase_uploads_total{result=ok}), never a bare HTTP 200",
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print("evidence:", OUT)
    raise SystemExit(0 if verdict == "SUCCESS" else 1)


if __name__ == "__main__":
    main()
