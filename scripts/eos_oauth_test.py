#!/usr/bin/env python3
"""REAL EOS OAuth client-credentials test against Epic's live endpoint.
Secrets are passed via environment variables; output NEVER prints the
client secret or the full access token (only status/metadata/prefix).
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

CLIENT_ID = os.environ.get("EOS_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("EOS_CLIENT_SECRET", "")
DEPLOYMENT_ID = os.environ.get("EOS_DEPLOYMENT_ID", "")
SANDBOX_ID = os.environ.get("EOS_SANDBOX_ID", "")
PRODUCT_ID = os.environ.get("EOS_PRODUCT_ID", "")

TOKEN_URL = "https://api.epicgames.dev/epic/oauth/v2/token"


def try_exchange(deployment_id: str, scope: str, label: str):
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    body = f"grant_type=client_credentials&deployment_id={deployment_id}&scope={scope}"
    req = urllib.request.Request(
        TOKEN_URL,
        data=body.encode(),
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read().decode())
            return label, res.status, data
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read().decode())
        except Exception:
            data = {}
        return label, e.code, data
    except Exception as e:
        return label, 0, {"exception": str(e)}


def describe(label, status, data):
    print(f"--- {label} -> HTTP {status}")
    if status == 200 and "access_token" in data:
        tok = data["access_token"]
        # Never print the token; print shape + claims
        parts = tok.split(".")
        print(f"    RESULT: SUCCESS")
        print(f"    token_type: {data.get('token_type')}")
        print(f"    expires_in: {data.get('expires_in')} s")
        print(f"    access_token: {tok[:14]}…({len(tok)} chars, {'JWT' if len(parts) == 3 else 'opaque'})")
        if len(parts) == 3:
            try:
                pad = parts[1] + "=" * (-len(parts[1]) % 4)
                claims = json.loads(base64.urlsafe_b64decode(pad))
                safe_claims = {
                    k: claims.get(k)
                    for k in ("iss", "aud", "exp", "iat", "scope", "organization_id", "product_id", "sandbox_id", "deployment_id", "client_id", "appid", "service_domain")
                    if k in claims
                }
                print(f"    claims (safe subset): {json.dumps(safe_claims, indent=6)}")
            except Exception as e:
                print(f"    (JWT payload not decodable: {e})")
        if data.get("refresh_token"):
            print("    refresh_token: present (not printed)")
        return True
    print(f"    RESULT: FAILED — {json.dumps(data)[:400]}")
    return False


print("=" * 64)
print("EPIC ONLINE SERVICES — LIVE CLIENT-CREDENTIALS OAUTH")
print("=" * 64)
print(f"client_id:      {CLIENT_ID}")
print(f"client_secret:  {'present (' + str(len(CLIENT_SECRET)) + ' chars)' if CLIENT_SECRET else 'MISSING'}")
print(f"product_id:     {PRODUCT_ID}")
print(f"deployment_id:  {DEPLOYMENT_ID}")
print(f"sandbox_id:     {SANDBOX_ID}")
print()

ok_any = False
# Test 1: with deployment_id (as the app does)
l, s, d = try_exchange(DEPLOYMENT_ID, "basic", "with deployment_id + scope=basic")
ok_any |= describe(l, s, d)
print()

if not ok_any:
    # Test 2: without deployment_id
    l, s, d = try_exchange("", "basic", "no deployment_id + scope=basic")
    ok_any |= describe(l, s, d)
    print()
    # Test 3: scope variations
    for sc in ("basic_profile", "friends_list", "openid"):
        l, s, d = try_exchange(DEPLOYMENT_ID, sc, f"with deployment_id + scope={sc}")
        ok_any |= describe(l, s, d)
        print()

print("VERDICT:", "AUTHENTICATION SUCCESSFUL" if ok_any else "AUTHENTICATION FAILED (see errors above)")
sys.exit(0 if ok_any else 1)
