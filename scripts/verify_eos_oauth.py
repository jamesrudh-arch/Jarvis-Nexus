#!/usr/bin/env python3
"""
JARVIS NEXUS session 7 — EOS REAL authentication verification (8-step protocol).

Reads EOS credentials from .env.local (never printed), performs the actual
client-credentials OAuth exchange against Epic's live endpoint, decodes the
returned JWT to verify identifier associations (product / deployment /
sandbox / scopes), validates expiry, re-authenticates to prove the grant is
repeatable, and prints ONLY non-secret evidence (claims, verdicts, masked
fingerprints).
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
for line in open(os.path.join(ROOT, ".env.local")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

CID = ENV.get("EPIC_CLIENT_ID", "")
SECRET = ENV.get("EPIC_CLIENT_SECRET", "")
PRODUCT = ENV.get("EPIC_PRODUCT_ID", "")
SANDBOX = ENV.get("EPIC_SANDBOX_IDS", "")
DEPLOY = ENV.get("EPIC_DEPLOYMENT_ID", "")

missing = [n for n, v in [("EPIC_CLIENT_ID", CID), ("EPIC_CLIENT_SECRET", SECRET),
                          ("EPIC_PRODUCT_ID", PRODUCT), ("EPIC_SANDBOX_IDS", SANDBOX),
                          ("EPIC_DEPLOYMENT_ID", DEPLOY)] if not v]
if missing:
    print(f"[abort] missing from .env.local: {missing}")
    sys.exit(1)
print(f"[1/locate] all 5 EOS variables present (values not printed)")
print(f"[2/config] client_id fingerprint: {CID[:9]}…{CID[-4:]} (len {len(CID)}), "
      f"secret len {len(SECRET)}, product {PRODUCT[:4]}…, sandbox {SANDBOX[:4]}…, deployment {DEPLOY[:4]}…")


def oauth(scope, deployment_id, endpoint="connect"):
    """endpoint: 'connect' = EOS Game Services (auth/v1/oauth/token, documented
    for client_credentials); 'eas' = Epic Account Services (oauth/v2/token)."""
    basic = base64.b64encode(f"{CID}:{SECRET}".encode()).decode()
    params = {"grant_type": "client_credentials"}
    if deployment_id:
        params["deployment_id"] = deployment_id
    if scope:
        params["scope"] = scope
    body = urllib.parse.urlencode(params).encode()
    url = ("https://api.epicgames.dev/auth/v1/oauth/token" if endpoint == "connect"
           else "https://api.epicgames.dev/epic/oauth/v2/token")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", f"Basic {basic}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"_exc": str(e)}


def jwt_claims(token):
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception as e:
        return {"_decode_error": str(e)}


# --- step 3: REAL authentication request (EOS Connect endpoint, documented for
#     client-credentials client access tokens) ---
st, tok = oauth("", DEPLOY)
print(f"\n[3/auth] POST https://api.epicgames.dev/auth/v1/oauth/token "
      f"grant=client_credentials deployment={DEPLOY[:8]}… → HTTP {st}")
if st != 200 or not tok.get("access_token"):
    print(f"        error body keys: {sorted(tok.keys())}")
    print(f"        errorCode: {tok.get('errorCode') or tok.get('error') or '?'}")
    # fall back to the EAS endpoint variant for the record
    st_eas, tok_eas = oauth("basic_profile", DEPLOY, endpoint="eas")
    print(f"        [cross-check] EAS oauth/v2 endpoint → HTTP {st_eas} "
          f"({tok_eas.get('errorCode') or 'ok'})")
    print("[verdict] AUTH FAILED — see detail above")
    sys.exit(2)

at = tok["access_token"]
exp_in = tok.get("expires_in")
print(f"        access_token: {at[:14]}…{at[-8:]} (len {len(at)}, JWT={at.count('.') == 2})")
print(f"        token_type={tok.get('token_type')} expires_in={exp_in}s")

# --- step 4: verify permissions / identifier associations from the claims ---
claims = jwt_claims(at)
print(f"\n[4/claims] decoded JWT payload (signature not shown):")
for k in sorted(claims.keys()):
    v = claims[k]
    s = json.dumps(v)
    print(f"        {k}: {s if len(s) < 100 else s[:97] + '…'}")

assoc = []
# EOS Connect client tokens carry clientId/productId/sandboxId/deploymentId + features
assoc.append(("claim clientId == configured", claims.get("clientId") == CID))
assoc.append(("claim deploymentId == configured", claims.get("deploymentId") == DEPLOY))
assoc.append(("claim productId == configured", claims.get("productId") == PRODUCT))
assoc.append(("claim sandboxId == configured", claims.get("sandboxId") == SANDBOX))
features = claims.get("features") or []
assoc.append((f"EOS features granted ({len(features)}: {', '.join(features[:6])}…)",
              len(features) > 0))
env_ok = claims.get("env") == "prod"
assoc.append(("env == prod (live production environment)", env_ok))
tt_ok = claims.get("tokenType") == "clientToken"
assoc.append(("tokenType == clientToken", tt_ok))
exp = claims.get("exp")
now = time.time()
assoc.append(("token not expired", isinstance(exp, (int, float)) and exp > now))
ok_all = True
print(f"\n[4/associations]")
for name, ok in assoc:
    print(f"        {'PASS' if ok else 'FAIL'}  {name}")
    ok_all = ok_all and ok

# --- step 5/6: real authorized operation = a second live grant (fresh token)
#     + a product-level grant (no deployment scoping), proving both scopes of
#     the credential work repeatably ---
st2, tok2 = oauth("", DEPLOY)
at2 = tok2.get("access_token", "")
same_jti = jwt_claims(at2).get("jti") != claims.get("jti") if at2 else None
print(f"\n[5/operation] repeat deployment grant → HTTP {st2}, fresh jti distinct: {same_jti}")
st3, tok3 = oauth("", "")
print(f"[5/operation] product-level grant (no deployment_id) → HTTP {st3} "
      f"(token: {'yes' if tok3.get('access_token') else 'no'})")
print(f"[6/verify]   first token exp − now = {int(exp - now)}s (>0 valid); "
      f"repeat expires_in = {tok2.get('expires_in')}s")

verdict = ok_all and st2 == 200 and bool(at2) and st3 == 200 and bool(tok3.get("access_token"))
print(f"\n[7/record] EOS OAUTH VERIFIED: {verdict}")
print("[7/record] evidence recorded without exposing the client secret or full tokens.")
sys.exit(0 if verdict else 3)
