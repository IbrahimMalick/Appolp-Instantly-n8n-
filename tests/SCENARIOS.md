# Test scenarios

Three layers:

1. **Offline logic tests** — `node tests/run-logic-tests.js` (73 checks). Runs the real Code-node code from `workflows/*.json` against sandbox data. No network, no credentials, no emails.
2. **n8n validation** — `tests/validate-with-n8n.js` checks every node/operation against an installed n8n (optional dev tool, see file header).
3. **Live checklist** (below) — run with real credentials, `DRY_RUN=true`, against a **test Google Sheet** and a **test Instantly campaign using mailboxes you own**. Do not send to real prospects without explicit approval.

Sandbox data: `tests/fixtures/intake-rows.json`, `import/sample-sandbox-export.csv`, `tests/fixtures/webhooks/*.json` (all `.example` domains).
Send a webhook sample: `N8N_HOST=… INSTANTLY_WEBHOOK_SECRET=… tests/send-sample-webhook.sh reply_received`.

| # | Scenario | Offline test (covers logic) | Live check | Expected |
|---|---|---|---|---|
| 1 | Valid lead | "1 valid lead", fixture T01/T02/T10/T12 | CSV → LXG-01 → LXG-02 | Intake `QUALIFIED`, Leads row `QUALIFIED` with Segment |
| 2 | Duplicate lead | 2a–2d (email, domain+name, in-batch, crash recovery) | Run LXG-02 after adding a Leads row with same email | Intake `DUPLICATE`, no second Leads row |
| 3 | Missing email | "3 missing email", "3b malformed" | CSV row with blank email | Intake `REJECTED` / `MISSING_EMAIL` |
| 4 | Invalid/unverified email | "4 unverified…" | CSV row with Email Status `Unverified` | Intake `REJECTED` / `EMAIL_NOT_VERIFIED:unverified` |
| 5 | Successful enrollment | "5 payload…", "5 successful enrollment…" | `DRY_RUN=true`: log shows payload. Then (approved test only) `DRY_RUN=false` with a test campaign + own mailbox | Dry run: nothing changes. Live: Leads `ENROLLED`, Instantly ID, Date Enrolled; lead visible in Instantly with variables (`{{job_title}}`, `{{location}}` render) |
| 6 | Instantly API failure | "6 Instantly API failure…", "systemic failure…", retry cap | Set a wrong key in *LXG Instantly API*, `DRY_RUN=false`, run LXG-03 | Leads `ERROR` + `ENROLL_FAILED…`, Retry Count 1; run turns red; alert email; fix key → set `QUALIFIED` → succeeds |
| 7 | Prospect replies | "7 reply → REPLIED…" | `send-sample-webhook.sh reply_received` for a lead that exists in the Leads tab | Leads `REPLIED`, Reply Date, Reply Meta; with ack disabled nothing is sent |
| 8 | Sequence stops | "8 sequence stops…" (terminal statuses never overwritten; REPLIED never re-enrolled) | After #7 send `email_sent_step2` | Status stays `REPLIED`. **In Instantly:** verify "stop on reply" actually halted the lead (send a real test reply from your own mailbox to your own campaign) |
| 9 | Unsubscribe | "9 unsubscribe…", opt-out keywords, no re-enrolment | `send-sample-webhook.sh lead_unsubscribed`; also `reply_optout` | Leads `UNSUBSCRIBED`; row in Suppression; re-ingesting that email → Intake `SUPPRESSED`; LXG-03 never enrolls it |
| 10 | Google Sheets failure | node retries ≤3 asserted; Sheets nodes onError behaviour reviewed | Temporarily un-share the sheet / break the credential, run LXG-02 | Execution red at the Sheets node; alert email arrives (alert does not depend on Sheets); no half-written state; after fixing, re-run recovers |
| 11 | n8n workflow failure | "11/12 error handler captures…" | Execute any workflow with a deliberately broken node **as a scheduled/production run** (manual runs don't trigger error workflows) | Execution red in n8n; LXG-99 runs |
| 12 | Error notification | throttling + secret scrubbing tests | Same as 11 | Row on Errors tab (workflow, execution ID, failed node, message, lead ID); email with link to the execution |
| 13 | Heartbeat failure | "13 …" (stale, failing, inactive, missing, throttled, never-ran) | Switch **LXG - 03** off for > 3 h (or temporarily lower its limit in LXG-06 Evaluate Health), run LXG-06 | Heartbeat `INACTIVE`/`STALE`; alert email once per 24 h |

Also verified during development against a real n8n 1.123.84 instance (with stubbed Google/SMTP): all 7 workflows import through the public API, the webhook rejects a wrong token and processes a right one, a failed execution triggers LXG-99 (log row written, alert attempted), and LXG-06 correctly reported inactive/failing workflows from the live n8n API. Live Apollo/Instantly/Google/SMTP calls were **not** exercised (no credentials).
