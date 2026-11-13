# Baseline behavioral probes (run against commit 1fb4384)

These probes execute against a **baseline worktree** to prove the pre-hardening
code accepted exactly what the Gate 0 hardening now rejects. Their captured
output is in `../fail_on_old_code.txt`.

Reproduce:

```bash
git worktree add /tmp/gate0-oldcode 1fb4384
cd /tmp/gate0-oldcode
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cp <this-repo>/docs/security/evidence/probes/gate0_item*.py .
DATABASE_URL=sqlite:///backend/data/probe.db .venv/bin/python gate0_item3_oldcode_probe.py
DATABASE_URL=sqlite:///backend/data/probe4.db .venv/bin/python gate0_item4_oldcode_probe.py
cd - && git worktree remove --force /tmp/gate0-oldcode
```

Expected on baseline: every OLD CODE line shows the vulnerable behavior (200
accepted, no validation, no dry-run, no pre-restore backup, unvalidated WSS
URL embedded). The new suite asserts the opposite of each line and therefore
fails on baseline code and passes on gate0-security.
