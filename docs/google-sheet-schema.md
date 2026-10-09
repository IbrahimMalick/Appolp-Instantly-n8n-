# Google Sheet schema

Create it from `sheet-template/LXG-Outreach-Tracker.xlsx` (Drive → upload → *Save as Google Sheets*). Never rename tabs or
header cells — n8n maps by name. You may add your own columns **to the right** and reorder views with filters.
Dates/timestamps are ISO-8601 UTC text (e.g. `2026-01-06T09:00:00.000Z`). No credentials are ever written to the sheet; error
messages are scrubbed of tokens.

## Tab `Leads` (one row per qualified lead) — the business view

| Column | Meaning | Written by |
|---|---|---|
| Lead ID | `LXG-` + hash of lower-cased email (stable key) | 02 |
| First Name, Last Name, Job Title, Company, Domain, Email, Industry, Country | from Apollo/CSV | 02 |
| Apollo ID | Apollo person id (blank for CSV without it) | 02 |
| Instantly ID | Instantly lead id after enrollment | 03 |
| Campaign | Instantly campaign id used | 03 |
| Date Added | when first ingested | 02 |
| Date Enrolled | enrollment timestamp | 03 |
| Last Email Sent | from `email_sent` webhook | 04 |
| Reply Date | reply timestamp | 04 |
| Current Status | see below | 02/03/04 |
| Error Status | last error text (`ENROLL_FAILED: …`, `BOUNCED`, `ACK_FAILED: …`) | 03/04 |
| Last Updated | last write | all |
| *Extras:* Website, Company Type, City, Employee Count, Email Verification Status, Source (`apollo_api`/`csv`), Segment (golf, clubs, …), Last Step Sent (1–3), Reply Meta (event, step, mailbox, subject), Ack Sent (timestamp), Retry Count, Stop Reason | | |

**Current Status values:** `QUALIFIED` · `ENROLLED` · `CONTACTED` (email 1 sent) · `FOLLOW_UP_PENDING` (email 2 sent) ·
`COMPLETED` (email 3 sent, no reply) · `REPLIED` · `UNSUBSCRIBED` · `STOPPED` (bounce / suppressed) · `ERROR` · (`NEW` reserved).

## Tab `Intake` (audit trail of every prospect considered)

Intake ID, Date Added, Source, Apollo ID, First/Last/Full Name, Job Title, Company, Domain, Website, Email, Email Verification
Status, Industry, Company Type, Country, City, Employee Count, **Intake Status** (`PENDING` → `QUALIFIED` / `REJECTED` /
`DUPLICATE` / `SUPPRESSED`), **Reason** (e.g. `MISSING_EMAIL`, `DUPLICATE_EMAIL`, `SEGMENT:golf`), Processed At.
To re-test a row after changing rules, set its Intake Status back to `PENDING`.

## Tab `Suppression` (never contacted again)

Email · Domain · Reason (`UNSUBSCRIBED`, `OPT_OUT_REPLY`, `BOUNCED`, or yours) · Source · Date Added.
A row with only a **Domain** suppresses the whole domain. Add manually any time.

## Tab `Errors`  — Timestamp, Workflow, Execution ID, Failed Node, Error Message, Lead ID, Execution URL (written by LXG-99)

## Tab `Heartbeat` — Workflow, Expected Max Gap (h), Active, Last Success, Last Failure, Last Failure Message, Health, Last Checked, Last Alerted (written by LXG-06)

Health: `OK` · `FAILING` (last run failed after last success) · `STALE` (no success within expected gap) · `INACTIVE` · `MISSING` · `NEVER_RAN` (warning only).

## Tab `Summary`

Formula rows (simple `COUNTIF`/`SUMPRODUCT` over Leads/Intake/Suppression, covering 20,000 rows): total leads, qualified (awaiting
enrollment), enrolled, emails sent (from webhook events), follow-ups sent, replies, reply rate, unsubscribes, errors, intake
pending/rejected, suppression size. Rows written by LXG-05: current campaign status, Instantly emails sent, last successful
workflow run, workflow health, last report generated.
