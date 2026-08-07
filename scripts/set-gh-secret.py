#!/usr/bin/env python3
"""Set a GitHub Actions repository secret (encrypted with libsodium sealed box)."""
import base64
import json
import os
import sys
import urllib.request

import nacl.bindings


def api(method: str, url: str, token: str, body=None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main() -> None:
    pat = os.environ["GH_PAT"]
    repo = os.environ["GH_REPO"]  # owner/name
    name = sys.argv[1]
    value = sys.argv[2]

    pk = api("GET", f"https://api.github.com/repos/{repo}/actions/secrets/public-key", pat)
    key_id = pk["key_id"]
    pubkey = base64.b64decode(pk["key"])

    encrypted = nacl.bindings.crypto_box_seal(value.encode(), pubkey)
    enc_b64 = base64.b64encode(encrypted).decode()

    api(
        "PUT",
        f"https://api.github.com/repos/{repo}/actions/secrets/{name}",
        pat,
        {"encrypted_value": enc_b64, "key_id": key_id},
    )
    print(f"secret {name} set")


if __name__ == "__main__":
    main()
