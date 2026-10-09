# Project plan (initial deliverables)

This is the planning pack produced before implementation. The implemented system follows it; deviations are listed at the end.

## 1. Architecture diagram
See the Mermaid diagrams in [README.md](../README.md#1-architecture) and [ARCHITECTURE.md](../ARCHITECTURE.md).

## 2. Repository structure
See [README.md → Repository layout](../README.md#repository-layout).

## 3. Accounts & credentials checklist
| # | Item | Owner | Needed for | Status |
|---|---|---|---|---|
| 1 | Outreach domain (≠ lxgsociety.com) + DNS access | client | sending | **blocker for go-live** |
| 2 | 2–3 mailboxes (growing to ~8–10) | client | sending | blocker for go-live |
| 3 | Instantly account + API v2 key + campaign(s) + webhook | client | enrollment/replies | blocker for live tests |
| 4 | Apollo account; API access on plan? API key | client | API mode (CSV works without) | confirm plan |
| 5 | Google account; Sheet; OAuth client for n8n | client/dev | tracking | needed for any live run |
| 6 | VPS with Docker, DNS name for n8n | client/dev | hosting, webhook | needed for webhook |
| 7 | SMTP mailbox for alerts + owner email address | client | alerts/reports | needed for alerts |
| 8 | n8n API key | dev | health monitor + error-link script | created after n8n is up |
| 9 | Final email copy (3 steps) and optional acknowledgement text | client | Instantly | blocker for go-live |
| 10 | Written approval to send real email (`DRY_RUN=false`) | client | go-live | explicit approval required |

## 4. Google Sheet schema
[docs/google-sheet-schema.md](google-sheet-schema.md).

## 5. n8n workflow plan
| # | Workflow | Trigger | Input → Output | Failure behaviour |
|---|---|---|---|---|
| 01 | Apollo Lead Intake | cron weekdays / manual | Apollo API or CSV → Intake(PENDING) | error → LXG-99; no file = no-op |
| 02 | Lead Qualification | every 2 h / manual | Intake(PENDING) + Leads + Suppression → Leads(QUALIFIED) / Intake reasons | crash-safe ordering; error → LXG-99 |
| 03 | Instantly Enrollment | every 30 min / manual | Leads(QUALIFIED) → Instantly → Leads(ENROLLED/ERROR) | retry 3x per call; ≤3 attempts per lead; all-fail ⇒ run fails ⇒ alert |
| 04 | Reply Handler | Instantly webhook | events → Leads status, Suppression, optional ack | token check; sheet write before ack; ack failure only flagged |
| 05 | Reporting | cron Monday / manual | Leads, Heartbeat, Errors, Instantly → email + Summary | Instantly failure tolerated |
| 06 | Health Monitor | hourly / manual | n8n API → Heartbeat + alert | throttled alerts; optional external ping |
| 99 | Error Handler | error trigger | failed execution → Errors + email | log first, mail second, no retries |

## 6. Assumptions & blockers
**Assumptions**
* n8n 1.x (tested with 1.123.84), self-hosted via Docker; SQLite storage is adequate for the pilot.
* Instantly API v2 and Apollo public APIs behave as in their current docs (endpoints re-checked against the docs during development; **no live calls were possible** without credentials).
* One Instantly workspace; default campaign plus optional per-segment campaigns.
* "Qualified" is rule-based on Apollo fields (title, keywords/industry/company name, country, email status) — no AI research.
* Volume ramps from ~10–20/day; 300–500/week needs ~8–10 mailboxes and a warmed domain.
* The sheet is acceptable as the pilot's data store (≤ ~20–30k rows).

**Blockers / open questions for the client**
1. Domain, mailboxes, Instantly and Apollo accounts (not yet purchased).
2. Does the Apollo plan include API access (and enrichment credits)? Otherwise CSV mode is used.
3. Final email copy and (optional) acknowledgement copy.
4. Alert/report recipient address and an SMTP mailbox for sending alerts.
5. Hosting choice (VPS) and a DNS name for n8n's public webhook URL.
6. Confirmation of target-market legal basis (client responsibility).

**Deviations / additions vs the brief**
* Added **Intake** tab (queue + audit trail) and extra Leads columns; added status `COMPLETED`.
* Workflows do not call each other (sheet queue instead) so they import without ID dependencies.
* Error-workflow linking is a one-line script because n8n stores it by workflow ID.
* Unsubscribe is *handled* inside LXG-04 (the brief lists it as "Workflow 4" alongside reply handling).
