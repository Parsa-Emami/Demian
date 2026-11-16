#!/usr/bin/env python3
"""Independent, bounded public API health probe. No secrets or player data."""
import json
import os
import sys
import time
import urllib.request

ORIGIN = os.environ.get("DEMIAN_MONITOR_API_ORIGIN", "")
if ORIGIN != "https://api.demiancafe.ir":
    raise SystemExit("Step33 health probe disabled: exact reviewed API origin required")

url = ORIGIN + "/api/v1/arcade/health"
for attempt in range(2):
    try:
        request = urllib.request.Request(url, headers={
            "Accept": "application/json", "User-Agent": "DemianStep33Health/1"
        })
        with urllib.request.urlopen(request, timeout=8) as response:
            if response.status != 200:
                raise RuntimeError("API health non-200")
            payload = response.read(4096)
        result = json.loads(payload)
        if result.get("status") != "ok":
            raise RuntimeError("API health degraded")
        if not isinstance(result.get("release"), str):
            raise RuntimeError("API release marker missing")
        print("Step33 public health check: OK")
        raise SystemExit(0)
    except (Exception) as exc:
        # Never print response bodies, full URLs, headers or secrets.
        if attempt == 0:
            time.sleep(2)
        else:
            print("Step33 public health check FAILED (status/connectivity).", file=sys.stderr)
            raise SystemExit(1) from None
