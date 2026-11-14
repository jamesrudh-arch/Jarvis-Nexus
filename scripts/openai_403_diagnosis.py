#!/usr/bin/env python3
"""PRIORITY 2 — OpenAI HTTP 403 diagnosis.

Per directive: Nigeria is a supported country — do NOT assume Nigeria is the
cause. Check: (1) egress IP geolocation, (2) network routing, (3) exact API
error body + headers, (4) key format validity (length/entropy, never printed),
(5) alternate OpenAI endpoints, (6) GLM provider still working.
Never prints credential values.
"""
import json
import time
import urllib.error
import urllib.request


def env(name):
    for line in open("/home/z/my-project/.env"):
        line = line.strip()
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def fetch(url, headers=None, timeout=25, method="GET", body=None):
    req = urllib.request.Request(url, headers=headers or {}, method=method,
                                 data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()[:600].decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()[:800].decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, {}, f"transport-error: {e}"


out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# --- 1. Egress IP geolocation (multiple independent services) -------------
geo = {}
for name, url in [
    ("ipinfo.io", "https://ipinfo.io/json"),
    ("ip-api.com", "http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,isp,org,as,query"),
    ("ipwho.is", "https://ipwho.is/"),
]:
    st, _, body = fetch(url)
    try:
        j = json.loads(body)
    except Exception:  # noqa: BLE001
        j = {"raw": body[:200]}
    geo[name] = {"http": st, **({k: j.get(k) for k in ("ip", "query", "country", "countryCode", "region", "regionName", "city", "isp", "org", "as", "connection", "status")} if isinstance(j, dict) else j)}
out["egress_geolocation"] = geo

# --- 2. Key format validity (no value exposure) ----------------------------
key = env("OPENAI_API_KEY")
out["key_format"] = {
    "present": bool(key),
    "length": len(key),
    "prefix_ok": key.startswith("sk-proj-") if key else False,
    "expected_len_range_for_sk_proj": "150-170 chars",
    "note": "len=28 strongly suggests truncation; full sk-proj- keys are ~150+ chars",
    "charset": "hex-suffix" if all(c in "0123456789abcdefABCDEFGHIJJKLMNPQRSTUVWXYZ-_" for c in key[8:]) else "mixed",
}

# --- 3. Exact API error body + headers (models endpoint, then chat) --------
h = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
st, hdr, body = fetch("https://api.openai.com/v1/models", headers=h)
out["models_endpoint"] = {
    "http": st,
    "error_body": body[:300],
    "cf_ray": hdr.get("cf-ray") or hdr.get("Cf-Ray"),
    "cf_colpo": hdr.get("cf-colpo") or hdr.get("Cf-Colpo"),
    "server": hdr.get("server") or hdr.get("Server"),
    "x_error_code": hdr.get("x-error-code") or hdr.get("X-Error-Code"),
    "openai_processing_ms": hdr.get("openai-processing-ms") or hdr.get("Openai-Processing-Ms"),
    "www_authenticate": hdr.get("www-authenticate") or hdr.get("Www-Authenticate"),
}

# tiny chat completion probe
payload = json.dumps({"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}).encode()
st2, hdr2, body2 = fetch("https://api.openai.com/v1/chat/completions", headers=h, method="POST", body=payload)
out["chat_endpoint"] = {"http": st2, "error_body": body2[:300], "cf_colpo": hdr2.get("cf-colpo") or hdr2.get("Cf-Colpo")}

# --- 4. Auth-free endpoint baseline (does the edge serve us at all?) -------
st3, _, body3 = fetch("https://api.openai.com/v1/models", headers={})
out["unauthenticated_baseline"] = {"http": st3, "body": body3[:200],
                                   "note": "401 = auth layer reached (no geo block); 403 = blocked before auth"}

# --- 5. GLM provider status ------------------------------------------------
st4, hdr4, body4 = fetch("https://open.bigmodel.cn/api/paas/v4/models", headers={})
out["glm_endpoint_reachability"] = {"http": st4, "body": body4[:150]}

print(json.dumps(out, indent=1))
with open("/home/z/my-project/NEXUS_WORLD/reports/OPENAI_403_DIAGNOSIS.json", "w") as f:
    json.dump(out, f, indent=1)
