#!/usr/bin/env python3
"""
JARVIS NEXUS — write the Unreal EOS plugin credential file from .env.local.

Emits world/Unreal/Plugins/JarvisNexusEOS/jarvis_nexus_eos.json (gitignored) from the
EPIC_* variables. Run this on the machine that launches the UE editor. The
values are never printed.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
for line in open(os.path.join(ROOT, ".env.local")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

cfg = {
    "clientId": ENV.get("EPIC_CLIENT_ID", ""),
    "clientSecret": ENV.get("EPIC_CLIENT_SECRET", ""),
    "productId": ENV.get("EPIC_PRODUCT_ID", ""),
    "deploymentId": ENV.get("EPIC_DEPLOYMENT_ID", ""),
    "sandboxId": ENV.get("EPIC_SANDBOX_IDS", "").split(",")[0].strip(),
}
missing = [k for k, v in cfg.items() if not v]
if missing:
    raise SystemExit(f"[abort] missing in .env.local: {missing}")

out = os.path.join(ROOT, "world", "Unreal", "Plugins", "JarvisNexusEOS", "jarvis_nexus_eos.json")
with open(out, "w") as f:
    json.dump(cfg, f, indent=2)
os.chmod(out, 0o600)
print(f"[ok] wrote {out} (mode 600, gitignored, values not printed)")
