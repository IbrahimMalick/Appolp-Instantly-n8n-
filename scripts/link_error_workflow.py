#!/usr/bin/env python3
"""Set 'LXG - 99 - Error Handler' as the Error Workflow of every other 'LXG - *' workflow.

Why: n8n stores the error-workflow link by workflow ID, which only exists after import, so it cannot be
shipped inside the JSON files. Doing it by hand is also fine: open each workflow > ... > Settings > Error workflow.

Usage:
    export N8N_BASE_URL=https://n8n.example.com      # no trailing slash
    export N8N_API_KEY=...                           # n8n > Settings > n8n API > Create an API key
    python3 scripts/link_error_workflow.py [--dry-run]
Uses only the documented n8n public API (GET /api/v1/workflows, PUT /api/v1/workflows/{id}). Standard library only.
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("N8N_BASE_URL", "").rstrip("/")
KEY = os.environ.get("N8N_API_KEY", "")
HANDLER = "LXG - 99 - Error Handler"
ALLOWED_SETTINGS = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution",
                    "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds"}


def call(method, path, body=None):
    req = urllib.request.Request(f"{BASE}/api/v1{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-N8N-API-KEY": KEY, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    if not BASE or not KEY:
        sys.exit("Set N8N_BASE_URL and N8N_API_KEY first (see docstring).")
    dry = "--dry-run" in sys.argv
    wfs = []
    cursor = None
    while True:
        page = call("GET", "/workflows?limit=250" + (f"&cursor={cursor}" if cursor else ""))
        wfs += page["data"]
        cursor = page.get("nextCursor")
        if not cursor:
            break
    handler = [w for w in wfs if w["name"] == HANDLER]
    if len(handler) != 1:
        sys.exit(f"Expected exactly one workflow named '{HANDLER}', found {len(handler)}. Import it first.")
    hid = handler[0]["id"]
    for w in wfs:
        if not w["name"].startswith("LXG - ") or w["id"] == hid:
            continue
        settings = {k: v for k, v in (w.get("settings") or {}).items() if k in ALLOWED_SETTINGS}
        if settings.get("errorWorkflow") == hid:
            print(f"ok       {w['name']} (already linked)")
            continue
        settings["errorWorkflow"] = hid
        if dry:
            print(f"would set {w['name']} -> error workflow {hid}")
            continue
        call("PUT", f"/workflows/{w['id']}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": settings})
        print(f"linked   {w['name']}")


if __name__ == "__main__":
    main()
