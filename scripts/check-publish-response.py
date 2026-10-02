"""Fail publication when Chrome Web Store rejects the submission."""
import json
import sys

response = json.load(sys.stdin)
if response.get("status") != ["OK"]:
    raise SystemExit("Chrome Web Store rejected publication: " + json.dumps(response))
print("Chrome Web Store accepted the release for review.")
