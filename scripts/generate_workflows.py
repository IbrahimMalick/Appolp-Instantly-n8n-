#!/usr/bin/env python3
"""Regenerate /workflows/*.json from /src (code nodes + schema).

The JSON files in /workflows are the deliverables you import into n8n. This script is only a
maintenance convenience: edit src/code/*.js (or the node layout below), run
    python3 scripts/generate_workflows.py
and commit the result. You can equally edit the JSON directly via the n8n UI and re-export;
just keep src/code in sync if you want to keep using this script (see scripts/README.md).
"""
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
CODE = ROOT / "src" / "code"
OUT = ROOT / "workflows"
SCHEMA = json.loads((ROOT / "src" / "schema.json").read_text())["tabs"]

NS = uuid.UUID("6f1c0c3e-5d1e-4c55-9a55-1f2d3c4b5a69")
SHEET_DOC = {"__rl": True, "value": "={{ $env.GOOGLE_SHEET_ID }}", "mode": "id"}

CRED_SHEETS = {"googleSheetsOAuth2Api": {"id": "", "name": "LXG Google Sheets"}}
CRED_INSTANTLY = {"httpHeaderAuth": {"id": "", "name": "LXG Instantly API"}}
CRED_APOLLO = {"httpHeaderAuth": {"id": "", "name": "LXG Apollo API"}}
CRED_N8N = {"httpHeaderAuth": {"id": "", "name": "LXG n8n API"}}
CRED_SMTP = {"smtp": {"id": "", "name": "LXG SMTP (alerts)"}}

INSTANTLY = "https://api.instantly.ai/api/v2"
APOLLO = "https://api.apollo.io/api/v1"
N8N_API = "($env.N8N_INTERNAL_API_URL || 'http://localhost:5678/api/v1')"


def uid(*parts):
    return str(uuid.uuid5(NS, "|".join(parts)))


class WF:
    def __init__(self, name):
        self.name = name
        self.nodes = []
        self.conns = {}

    def add(self, n):
        self.nodes.append(n)
        return n["name"]

    def link(self, a, b, out=0, to_idx=0):
        outs = self.conns.setdefault(a, {"main": []})["main"]
        while len(outs) <= out:
            outs.append([])
        outs[out].append({"node": b, "type": "main", "index": to_idx})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def export(self):
        return {
            "name": self.name,
            "nodes": self.nodes,
            "connections": self.conns,
            "active": False,
            "settings": {
                "executionOrder": "v1",
                "timezone": "Europe/London",
                "saveDataErrorExecution": "all",
                "saveDataSuccessExecution": "all",
                "saveManualExecutions": True,
            },
            "pinData": {},
            "meta": {"templateCredsSetupCompleted": False},
        }


def pos(col, row):
    return [260 * col, 220 * row]


def node(wf, name, type_, version, params, at, creds=None, **extra):
    n = {
        "parameters": params,
        "id": uid(wf.name, name),
        "name": name,
        "type": type_,
        "typeVersion": version,
        "position": pos(*at),
    }
    if creds:
        n["credentials"] = creds
    n.update(extra)
    return wf.add(n)


RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 4000}


def code(wf, name, file, at, each=False, **extra):
    src = (CODE / file).read_text().rstrip() + "\n"
    return node(wf, name, "n8n-nodes-base.code", 2,
                {"mode": "runOnceForEachItem" if each else "runOnceForAllItems", "language": "javaScript", "jsCode": src},
                at, **extra)


def manual(wf, at=(0, 0)):
    return node(wf, "Run manually", "n8n-nodes-base.manualTrigger", 1, {}, at)


def schedule(wf, name, rule, at=(0, 1)):
    return node(wf, name, "n8n-nodes-base.scheduleTrigger", 1.2, {"rule": {"interval": [rule]}}, at)


def note(wf, text, at=(0, -2), w=520, h=200, color=4):
    return node(wf, "Notes", "n8n-nodes-base.stickyNote", 1,
                {"content": text, "height": h, "width": w, "color": color}, at)


def sheet_cols(tab, mapping, matching):
    """defineBelow column mapping. mapping: {column: expression}."""
    return {
        "mappingMode": "defineBelow",
        "value": mapping,
        "matchingColumns": matching,
        "schema": [
            {"id": c, "displayName": c, "required": False, "defaultMatch": c in matching,
             "display": True, "type": "string", "canBeUsedToMatch": True, "removed": c not in mapping}
            for c in SCHEMA[tab]
        ],
    }


def sheet(wf, name, op, tab, at, cols=None, matching=None, src="$json", filters=None, **extra):
    """cols: list of column names written from `src[col]` (src is a JS expression, e.g. $json.lead)."""
    p = {
        "resource": "sheet",
        "operation": op,
        "documentId": SHEET_DOC,
        "sheetName": {"__rl": True, "value": tab, "mode": "name"},
    }
    if op == "read":
        if filters:
            p["filtersUI"] = {"values": [{"lookupColumn": c, "lookupValue": v} for c, v in filters]}
        p["options"] = {}
    else:
        mapping = {c: '={{ %s["%s"] }}' % (src, c) for c in cols}
        p["columns"] = sheet_cols(tab, mapping, matching or [])
        p["options"] = {"cellFormat": "RAW"}
    base = dict(RETRY)
    base.update(extra)
    return node(wf, name, "n8n-nodes-base.googleSheets", 4.5, p, at, creds=CRED_SHEETS, **base)


def http(wf, name, method, url, at, creds, body_expr=None, query=None, timeout=30000, batch=None, **extra):
    p = {
        "method": method,
        "url": url,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {"timeout": timeout},
    }
    if body_expr:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body_expr})
    if query:
        p.update({"sendQuery": True, "queryParameters": {"parameters": [{"name": k, "value": v} for k, v in query]}})
    if batch:
        p["options"]["batching"] = {"batch": {"batchSize": 1, "batchInterval": batch}}
    base = dict(RETRY)
    base.update(extra)
    return node(wf, name, "n8n-nodes-base.httpRequest", 4.2, p, at, creds=creds, **base)


def _cond(left, op_type, op, right=""):
    c = {"id": uid(left, op, str(right)), "leftValue": left, "rightValue": right, "operator": {"type": op_type, "operation": op}}
    if op_type == "boolean":
        c["operator"]["singleValue"] = True
    return c


def cond_wrap(conds, strict=False):
    return {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict" if strict else "loose"},
            "conditions": conds, "combinator": "and"}


def if_(wf, name, expr, at, **extra):
    return node(wf, name, "n8n-nodes-base.if", 2.2,
                {"conditions": cond_wrap([_cond(expr, "boolean", "true")]), "options": {}}, at, **extra)


def switch(wf, name, expr, values, at):
    rules = [{"conditions": cond_wrap([_cond(expr, "string", "equals", v)]), "renameOutput": True, "outputKey": v} for v in values]
    return node(wf, name, "n8n-nodes-base.switch", 3.2, {"rules": {"values": rules}, "options": {}}, at)


def email(wf, name, subject_expr, html_expr, at, to="={{ $env.ALERT_EMAIL_TO }}", **extra):
    return node(wf, name, "n8n-nodes-base.emailSend", 2.1, {
        "fromEmail": "={{ $env.ALERT_EMAIL_FROM }}", "toEmail": to,
        "subject": subject_expr, "emailFormat": "html", "html": html_expr, "options": {}}, at, creds=CRED_SMTP, **extra)


def save(wf):
    path = OUT / (FILES[wf.name])
    path.write_text(json.dumps(wf.export(), indent=2, ensure_ascii=False) + "\n")
    print("wrote", path.relative_to(ROOT))


FILES = {
    "LXG - 01 - Apollo Lead Intake": "lxg-01-apollo-lead-intake.json",
    "LXG - 02 - Lead Qualification": "lxg-02-lead-qualification.json",
    "LXG - 03 - Instantly Enrollment": "lxg-03-instantly-enrollment.json",
    "LXG - 04 - Reply Handler": "lxg-04-reply-handler.json",
    "LXG - 05 - Reporting": "lxg-05-reporting.json",
    "LXG - 06 - Health Monitor": "lxg-06-health-monitor.json",
    "LXG - 99 - Error Handler": "lxg-99-error-handler.json",
}

LEADS_ALL = SCHEMA["Leads"]
INTAKE_ALL = SCHEMA["Intake"]


# ───────────────────────────── 01 Apollo Lead Intake ─────────────────────────────
def wf01():
    w = WF("LXG - 01 - Apollo Lead Intake")
    note(w, "## LXG-01 Apollo Lead Intake\nPulls prospects (Apollo API **or** CSV fallback) and appends them to the **Intake** tab as PENDING.\n"
            "No filtering here — LXG-02 qualifies and de-duplicates.\n\n**Edit targeting:** open the *Config* node.\n"
            "**Source:** env `LEAD_SOURCE_MODE` = `csv` (default) or `apollo_api`.\n**Volume:** env `APOLLO_MAX_PER_RUN`.", at=(0, -2))
    manual(w, (0, 0))
    schedule(w, "Weekdays 07:00", {"field": "cronExpression", "expression": "0 7 * * 1-5"}, (0, 1))
    code(w, "Config", "w01_config.js", (1, 0))
    sheet(w, "Read Existing Intake", "read", "Intake", (2, 0), alwaysOutputData=True)
    code(w, "Collapse to one item", "w01_collapse.js", (3, 0))
    if_(w, "Use Apollo API?", "={{ $json.mode === 'apollo_api' }}", (4, 0))
    # Apollo branch (adapter)
    http(w, "Apollo Search People", "POST", f"{APOLLO}/mixed_people/api_search", (5, -1), CRED_APOLLO,
         body_expr="={{ JSON.stringify($json.search) }}", executeOnce=True,
         notes="ADAPTER: Apollo People API Search. Verify path/params against your plan (docs/apollo-setup.md).")
    code(w, "Apollo Prefilter (skip known)", "w01_apollo_prefilter.js", (6, -1))
    http(w, "Apollo Bulk Enrich", "POST", f"{APOLLO}/people/bulk_match", (7, -1), CRED_APOLLO,
         body_expr="={{ JSON.stringify($json) }}", batch=1500,
         notes="ADAPTER: enrichment uses Apollo credits. Verify endpoint/plan (docs/apollo-setup.md).")
    code(w, "Normalize Apollo", "w01_apollo_normalize.js", (8, -1))
    # CSV branch
    node(w, "Read CSV files", "n8n-nodes-base.readWriteFile", 1,
         {"operation": "read", "fileSelector": "/files/import/*.csv", "options": {}}, (5, 1), onError="continueRegularOutput", executeOnce=True,
         notes="Reads every .csv in ./import (mounted at /files/import). No file = quietly nothing to do.")
    node(w, "Extract CSV rows", "n8n-nodes-base.extractFromFile", 1,
         {"operation": "csv", "options": {"headerRow": True}}, (6, 1), onError="continueRegularOutput")
    code(w, "Normalize CSV", "w01_csv_normalize.js", (7, 1))
    code(w, "Build Intake Rows", "w01_finalize.js", (9, 0))
    sheet(w, "Append to Intake", "append", "Intake", (10, 0), cols=INTAKE_ALL, src="$json")
    w.chain("Run manually", "Config")
    w.link("Weekdays 07:00", "Config")
    w.chain("Config", "Read Existing Intake", "Collapse to one item", "Use Apollo API?")
    w.link("Use Apollo API?", "Apollo Search People", 0)
    w.chain("Apollo Search People", "Apollo Prefilter (skip known)", "Apollo Bulk Enrich", "Normalize Apollo", "Build Intake Rows")
    w.link("Use Apollo API?", "Read CSV files", 1)
    w.chain("Read CSV files", "Extract CSV rows", "Normalize CSV", "Build Intake Rows", "Append to Intake")
    return w


# ───────────────────────────── 02 Lead Qualification ─────────────────────────────
def wf02():
    w = WF("LXG - 02 - Lead Qualification")
    note(w, "## LXG-02 Lead Qualification\nTakes PENDING rows from **Intake**, applies filters + de-duplication + suppression checks.\n"
            "Qualified → appended to **Leads** as QUALIFIED. Everything else is marked on the Intake row with a Reason.\n\n"
            "**Edit rules:** open *Qualify & Dedupe* (CONFIG block at the top). Countries/email status via env vars.", at=(0, -2))
    manual(w, (0, 0))
    schedule(w, "Every 2 hours", {"field": "hours", "hoursInterval": 2}, (0, 1))
    sheet(w, "Read Pending Intake", "read", "Intake", (1, 0), filters=[("Intake Status", "PENDING")], alwaysOutputData=True)
    sheet(w, "Read Leads", "read", "Leads", (2, 0), executeOnce=True, alwaysOutputData=True)
    sheet(w, "Read Suppression", "read", "Suppression", (3, 0), executeOnce=True, alwaysOutputData=True)
    code(w, "Qualify & Dedupe", "w02_qualify.js", (4, 0))
    if_(w, "Qualified?", "={{ !!$json.lead }}", (5, 0))
    sheet(w, "Append to Leads", "append", "Leads", (6, -1), cols=LEADS_ALL, src="$json.lead")
    code(w, "Intake updates (qualified)", "w02_intake_qualified.js", (7, -1), executeOnce=True)
    sheet(w, "Update Intake", "update", "Intake", (8, 0),
          cols=["Intake ID", "Intake Status", "Reason", "Processed At"], matching=["Intake ID"], src="$json.intake")
    w.link("Run manually", "Read Pending Intake")
    w.link("Every 2 hours", "Read Pending Intake")
    w.chain("Read Pending Intake", "Read Leads", "Read Suppression", "Qualify & Dedupe", "Qualified?")
    w.link("Qualified?", "Append to Leads", 0)
    w.chain("Append to Leads", "Intake updates (qualified)", "Update Intake")
    w.link("Qualified?", "Update Intake", 1)
    return w


# ───────────────────────────── 03 Instantly Enrollment ─────────────────────────────
def wf03():
    w = WF("LXG - 03 - Instantly Enrollment")
    note(w, "## LXG-03 Instantly Enrollment\nEnrolls QUALIFIED leads into the right Instantly campaign and records the result.\n"
            "Instantly then sends Email 1 (Day 1), Email 2 (Day 4), Email 3 (Day 9) — timing is configured **in Instantly**.\n\n"
            "**Safety:** `DRY_RUN=true` (default) sends nothing. **Ramp:** `DAILY_ENROLL_CAP`, `ENROLL_BATCH_SIZE`.\n"
            "Suppressed addresses are re-checked here and never enrolled.", at=(0, -2))
    manual(w, (0, 0))
    schedule(w, "Every 30 minutes", {"field": "minutes", "minutesInterval": 30}, (0, 1))
    sheet(w, "Read Leads", "read", "Leads", (1, 0), alwaysOutputData=True)
    sheet(w, "Read Suppression", "read", "Suppression", (2, 0), executeOnce=True, alwaysOutputData=True)
    code(w, "Select Batch", "w03_select.js", (3, 0))
    switch(w, "Route", "={{ $json.action }}", ["enroll", "blocked", "dryrun"], (4, 0))
    http(w, "Instantly: Add Lead", "POST", f"{INSTANTLY}/leads", (5, -1), CRED_INSTANTLY,
         body_expr="={{ JSON.stringify($json.payload) }}", batch=1000, onError="continueErrorOutput",
         notes="Instantly API v2 POST /leads. Retries 3x, then goes to the error output (lead marked ERROR).")
    code(w, "Map Success", "w03_map_success.js", (6, -2), each=True)
    code(w, "Map Failure", "w03_map_failure.js", (6, -1), each=True)
    enr_cols = ["Lead ID", "Instantly ID", "Campaign", "Date Enrolled", "Current Status", "Error Status", "Retry Count", "Last Updated"]
    sheet(w, "Update: Enrolled", "update", "Leads", (7, -2), cols=enr_cols, matching=["Lead ID"])
    sheet(w, "Update: Enroll Failed", "update", "Leads", (7, -1),
          cols=["Lead ID", "Current Status", "Error Status", "Retry Count", "Last Updated"], matching=["Lead ID"])
    code(w, "Evaluate Run", "w03_evaluate.js", (8, -1), executeOnce=True)
    sheet(w, "Update: Blocked", "update", "Leads", (5, 0),
          cols=["Lead ID", "Current Status", "Error Status", "Stop Reason", "Last Updated"], matching=["Lead ID"], src="$json.update")
    code(w, "Dry Run Log", "w03_dryrun.js", (5, 1))
    w.link("Run manually", "Read Leads")
    w.link("Every 30 minutes", "Read Leads")
    w.chain("Read Leads", "Read Suppression", "Select Batch", "Route")
    w.link("Route", "Instantly: Add Lead", 0)
    w.link("Route", "Update: Blocked", 1)
    w.link("Route", "Dry Run Log", 2)
    w.link("Instantly: Add Lead", "Map Success", 0)
    w.link("Instantly: Add Lead", "Map Failure", 1)
    w.chain("Map Success", "Update: Enrolled")
    w.chain("Map Failure", "Update: Enroll Failed", "Evaluate Run")
    return w


# ───────────────────────────── 04 Reply Handler ─────────────────────────────
def wf04():
    w = WF("LXG - 04 - Reply Handler")
    note(w, "## LXG-04 Reply Handler (webhook)\nReceives Instantly events. URL: `https://<your-n8n-host>/webhook/lxg-instantly-events?token=<INSTANTLY_WEBHOOK_SECRET>`\n"
            "• **reply** → status REPLIED + reply date/meta (Instantly stops the sequence natively) → optional acknowledgement\n"
            "• **unsubscribe / opt-out reply** → UNSUBSCRIBED + added to **Suppression**\n• **email sent** → CONTACTED / FOLLOW_UP_PENDING / COMPLETED\n"
            "• **bounce** → STOPPED + suppressed\n\nAcknowledgement is OFF unless `ACK_ENABLED=true`, `DRY_RUN=false` and client copy is set in *Decide Action*.", at=(0, -2), h=240)
    node(w, "Instantly Webhook", "n8n-nodes-base.webhook", 2,
         {"httpMethod": "POST", "path": "lxg-instantly-events", "responseMode": "onReceived", "options": {}}, (0, 0),
         webhookId=uid(w.name, "webhook"))
    code(w, "Normalize Event", "w04_normalize.js", (1, 0))
    if_(w, "Authorized?", "={{ $json.authorized }}", (2, 0))
    sheet(w, "Find Lead", "read", "Leads", (3, 0), filters=[("Email", "={{ $json.email }}")], alwaysOutputData=True, executeOnce=True)
    code(w, "Decide Action", "w04_decide.js", (4, 0))
    switch(w, "Route Event", "={{ $json.action }}", ["REPLY", "UNSUBSCRIBE", "SENT", "BOUNCE", "META"], (5, 0))
    # NB: expressions must not reference Code nodes ($('Code node') throws "could not be cloned" in n8n 1.123),
    # so the decision is carried in $json and re-attached by small "Restore" Code nodes after Sheets writes.
    D = "$json.update"
    S = "$json.suppress"
    # REPLY
    sheet(w, "Record Reply", "appendOrUpdate", "Leads", (6, -2),
          cols=["Lead ID", "Email", "Current Status", "Reply Date", "Reply Meta", "Stop Reason", "Last Updated"], matching=["Lead ID"], src=D)
    code(w, "Restore: Reply", "w04_restore.js", (7, -2))
    if_(w, "Send Acknowledgement?", "={{ !!$json.ack }}", (8, -2))
    http(w, "Instantly: Send Acknowledgement", "POST", f"{INSTANTLY}/emails/reply", (9, -3), CRED_INSTANTLY,
         body_expr="={{ JSON.stringify($json.ack) }}", onError="continueErrorOutput",
         notes="ADAPTER: Instantly reply endpoint — verify path/body in current Instantly API docs before enabling (docs/instantly-setup.md).")
    code(w, "Ack Sent Result", "w04_ack_result.js", (10, -4))
    sheet(w, "Record Ack Sent", "appendOrUpdate", "Leads", (11, -4), cols=["Lead ID", "Email", "Ack Sent", "Last Updated"], matching=["Lead ID"])
    code(w, "Ack Failed Result", "w04_ack_failed.js", (10, -2))
    sheet(w, "Record Ack Failure", "appendOrUpdate", "Leads", (11, -2), cols=["Lead ID", "Email", "Error Status", "Last Updated"], matching=["Lead ID"])
    # UNSUBSCRIBE
    sheet(w, "Suppress Contact", "appendOrUpdate", "Suppression", (6, -1),
          cols=["Email", "Domain", "Reason", "Source", "Date Added"], matching=["Email"], src=S)
    code(w, "Restore: Unsubscribe", "w04_restore.js", (7, -1))
    sheet(w, "Record Unsubscribe", "appendOrUpdate", "Leads", (8, -1),
          cols=["Lead ID", "Email", "Current Status", "Reply Date", "Reply Meta", "Stop Reason", "Last Updated"], matching=["Lead ID"], src=D)
    # SENT
    sheet(w, "Record Send", "appendOrUpdate", "Leads", (6, 1),
          cols=["Lead ID", "Email", "Current Status", "Last Email Sent", "Last Step Sent", "Last Updated"], matching=["Lead ID"], src=D)
    # BOUNCE
    sheet(w, "Suppress Bounce", "appendOrUpdate", "Suppression", (6, 2),
          cols=["Email", "Domain", "Reason", "Source", "Date Added"], matching=["Email"], src=S)
    code(w, "Restore: Bounce", "w04_restore.js", (7, 2))
    sheet(w, "Record Bounce", "appendOrUpdate", "Leads", (8, 2),
          cols=["Lead ID", "Email", "Current Status", "Error Status", "Stop Reason", "Last Updated"], matching=["Lead ID"], src=D)
    # META
    sheet(w, "Record Meta", "appendOrUpdate", "Leads", (6, 3), cols=["Lead ID", "Email", "Reply Meta", "Last Updated"], matching=["Lead ID"], src=D)

    w.chain("Instantly Webhook", "Normalize Event", "Authorized?")
    w.link("Authorized?", "Find Lead", 0)
    w.chain("Find Lead", "Decide Action", "Route Event")
    w.link("Route Event", "Record Reply", 0)
    w.link("Route Event", "Suppress Contact", 1)
    w.link("Route Event", "Record Send", 2)
    w.link("Route Event", "Suppress Bounce", 3)
    w.link("Route Event", "Record Meta", 4)
    w.chain("Record Reply", "Restore: Reply", "Send Acknowledgement?")
    w.link("Send Acknowledgement?", "Instantly: Send Acknowledgement", 0)
    w.link("Instantly: Send Acknowledgement", "Ack Sent Result", 0)
    w.link("Instantly: Send Acknowledgement", "Ack Failed Result", 1)
    w.chain("Ack Sent Result", "Record Ack Sent")
    w.chain("Ack Failed Result", "Record Ack Failure")
    w.chain("Suppress Contact", "Restore: Unsubscribe", "Record Unsubscribe")
    w.chain("Suppress Bounce", "Restore: Bounce", "Record Bounce")
    return w


# ───────────────────────────── 05 Reporting ─────────────────────────────
def wf05():
    w = WF("LXG - 05 - Reporting")
    note(w, "## LXG-05 Reporting\nWeekly (Mondays 08:00 UK) summary email + refreshes n8n-owned rows on the **Summary** tab.\n"
            "Lead counts come from the Leads tab; emails sent / campaign status come from Instantly (if reachable — the report still sends if not).\n"
            "Change frequency: edit the schedule node. Recipient: env `ALERT_EMAIL_TO` (or `REPORT_EMAIL_TO` if set).", at=(0, -2))
    manual(w, (0, 0))
    schedule(w, "Mondays 08:00", {"field": "cronExpression", "expression": "0 8 * * 1"}, (0, 1))
    sheet(w, "Read Leads", "read", "Leads", (1, 0), alwaysOutputData=True)
    sheet(w, "Read Heartbeat", "read", "Heartbeat", (2, 0), executeOnce=True, alwaysOutputData=True)
    sheet(w, "Read Errors", "read", "Errors", (3, 0), executeOnce=True, alwaysOutputData=True)
    http(w, "Instantly Campaigns", "GET", f"{INSTANTLY}/campaigns", (4, 0), CRED_INSTANTLY, query=[("limit", "100")],
         executeOnce=True, onError="continueRegularOutput")
    http(w, "Instantly Analytics", "GET", f"{INSTANTLY}/campaigns/analytics", (5, 0), CRED_INSTANTLY,
         executeOnce=True, onError="continueRegularOutput")
    code(w, "Build Report", "w05_report.js", (6, 0))
    email(w, "Send Weekly Summary", "={{ $json.subject }}", "={{ $json.html }}", (7, -1),
          to="={{ $env.REPORT_EMAIL_TO || $env.ALERT_EMAIL_TO }}")
    code(w, "Summary rows", "w05_summary_rows.js", (7, 1))
    sheet(w, "Update Summary tab", "appendOrUpdate", "Summary", (8, 1), cols=["Metric", "Value", "Notes"], matching=["Metric"])
    w.link("Run manually", "Read Leads")
    w.link("Mondays 08:00", "Read Leads")
    w.chain("Read Leads", "Read Heartbeat", "Read Errors", "Instantly Campaigns", "Instantly Analytics", "Build Report")
    w.chain("Build Report", "Send Weekly Summary", "Summary rows", "Update Summary tab")
    return w


# ───────────────────────────── 06 Health Monitor ─────────────────────────────
def wf06():
    w = WF("LXG - 06 - Health Monitor")
    note(w, "## LXG-06 Health Monitor (heartbeat)\nHourly. Asks the n8n API for every `LXG - *` workflow's last success / last failure, writes the **Heartbeat** tab and emails an alert when a workflow is "
            "inactive, failing, stale or missing (max one alert per issue per 24h).\n\n"
            "Needs an n8n API key (Settings → n8n API) saved as credential *LXG n8n API*. Optional: `HEARTBEAT_PING_URL` for an external dead-man's-switch.", at=(0, -2), h=220)
    manual(w, (0, 0))
    schedule(w, "Hourly", {"field": "hours", "hoursInterval": 1}, (0, 1))
    http(w, "List Workflows", "GET", "={{ " + N8N_API + " + '/workflows?limit=250' }}", (1, 0), CRED_N8N, executeOnce=True)
    code(w, "Filter LXG Workflows", "w06_workflows.js", (2, 0))
    http(w, "Get Last Success", "GET", "={{ $json.urlSuccess }}", (3, -1), CRED_N8N)
    http(w, "Get Last Error", "GET", "={{ $json.urlError }}", (3, 1), CRED_N8N)
    node(w, "Wait for both", "n8n-nodes-base.merge", 3, {}, (4, 0))
    sheet(w, "Read Heartbeat", "read", "Heartbeat", (5, 0), executeOnce=True, alwaysOutputData=True)
    code(w, "Evaluate Health", "w06_evaluate.js", (6, 0))
    sheet(w, "Write Heartbeat", "appendOrUpdate", "Heartbeat", (7, 0), cols=SCHEMA["Heartbeat"], matching=["Workflow"])
    code(w, "Alert Gate", "w06_alert_gate.js", (8, 0), executeOnce=True)
    if_(w, "Any critical issue?", "={{ $json.sendAlert }}", (9, 0))
    email(w, "Send Health Alert", "={{ $json.subject }}", "={{ $json.html }}", (10, -1))
    if_(w, "External ping configured?", "={{ !!$env.HEARTBEAT_PING_URL }}", (11, 0), executeOnce=True)
    node(w, "Ping external monitor", "n8n-nodes-base.httpRequest", 4.2,
         {"method": "GET", "url": "={{ $env.HEARTBEAT_PING_URL }}", "options": {"timeout": 10000}}, (12, 0),
         onError="continueRegularOutput", executeOnce=True)
    w.link("Run manually", "List Workflows")
    w.link("Hourly", "List Workflows")
    w.chain("List Workflows", "Filter LXG Workflows")
    w.link("Filter LXG Workflows", "Get Last Success")
    w.link("Filter LXG Workflows", "Get Last Error")
    w.link("Get Last Success", "Wait for both", 0, 0)
    w.link("Get Last Error", "Wait for both", 0, 1)
    w.chain("Wait for both", "Read Heartbeat", "Evaluate Health", "Write Heartbeat", "Alert Gate", "Any critical issue?")
    w.link("Any critical issue?", "Send Health Alert", 0)
    w.link("Any critical issue?", "External ping configured?", 1)
    w.link("Send Health Alert", "External ping configured?")
    w.link("External ping configured?", "Ping external monitor", 0)
    return w


# ───────────────────────────── 99 Error Handler ─────────────────────────────
def wf99():
    w = WF("LXG - 99 - Error Handler")
    note(w, "## LXG-99 Error Handler\nSet as the *Error Workflow* of every other LXG workflow (scripts/link_error_workflow.py does this, or Workflow → Settings → Error workflow).\n"
            "On any failed automatic execution: emails the owner and logs a row on the **Errors** tab. The sheet log runs first (a Sheets outage cannot block the alert); the email is last so a mail failure is visible as a failed execution.\n"
            "Duplicate alerts (same workflow + message) are throttled to 1 per 15 min. No retries here by design.", at=(0, -2), h=220)
    node(w, "Error Trigger", "n8n-nodes-base.errorTrigger", 1, {}, (0, 0))
    code(w, "Format Error", "w99_format.js", (1, 0))
    sheet(w, "Log to Errors tab", "append", "Errors", (2, 0), cols=SCHEMA["Errors"], src="$json.row", onError="continueRegularOutput")
    code(w, "Restore Alert", "w99_restore.js", (3, 0))
    if_(w, "Send alert?", "={{ $json.sendAlert }}", (4, 0))
    email(w, "Send Error Email", "={{ $json.subject }}", "={{ $json.html }}", (5, 0),
          retryOnFail=True, maxTries=3, waitBetweenTries=5000)
    w.chain("Error Trigger", "Format Error", "Log to Errors tab", "Restore Alert", "Send alert?")
    w.link("Send alert?", "Send Error Email", 0)
    return w


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for f in (wf01, wf02, wf03, wf04, wf05, wf06, wf99):
        save(f())
