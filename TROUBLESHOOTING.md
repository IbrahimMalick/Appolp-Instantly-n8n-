# Troubleshooting

First look, always: **n8n → Executions** (filter *Error*). Open the red run: the failing node is highlighted and shows the
message. Also check the **Errors** tab of the sheet and the alert email (it contains a link to the execution).

| Symptom | Likely cause | Fix |
|---|---|---|
| No new rows on **Intake** | LXG-01 off, `LEAD_SOURCE_MODE=csv` but no CSV in `./import`, or everything already ingested | Execute LXG-01 manually and read the log ("Intake: N new rows, M skipped"). Add a CSV / switch to `apollo_api`. |
| Intake rows stay `PENDING` | LXG-02 inactive or failing | Check Executions; run LXG-02 manually. |
| Intake rows `REJECTED` unexpectedly | Rules too strict | Read the **Reason** column (`NO_TARGET_SEGMENT`, `TITLE_NOT_DECISION_MAKER`, `EMAIL_NOT_VERIFIED:…`, `COUNTRY_NOT_ALLOWED:…`). Adjust the CONFIG block in *Qualify & Dedupe* or the `ALLOWED_*` env vars; set the Intake row's status back to `PENDING` to re-test it. |
| Leads stay `QUALIFIED`, nothing enrolled | `DRY_RUN=true`; daily cap reached; LXG-03 inactive; no campaign id | Run LXG-03 manually and read the log line `Enrollment: eligible=… budget=… dryRun=…`. Set `INSTANTLY_CAMPAIGN_ID_DEFAULT`. |
| Lead `ERROR`: `ENROLL_FAILED: … 401/403` | Wrong/expired Instantly key or missing scope | Fix credential *LXG Instantly API* (value must start with `Bearer `). Set the lead's status back to `QUALIFIED` and `Retry Count` to `0`. |
| Lead `ERROR`: `NO_INSTANTLY_ID_RETURNED` | Lead already exists in the Instantly workspace (skipped) | Check Instantly; if it is in the right campaign set the lead to `ENROLLED` manually. |
| `NO_CAMPAIGN_CONFIGURED` | Env var empty | Set `INSTANTLY_CAMPAIGN_ID_DEFAULT` (and/or `INSTANTLY_CAMPAIGN_MAP`), `docker compose up -d`. |
| Replies not recorded | Webhook not registered / wrong URL / wrong `token` / LXG-04 inactive | Instantly → Webhooks: check URL ends `?token=<INSTANTLY_WEBHOOK_SECRET>`; LXG-04 must be **active** (test URLs are different from production URLs). Look at LXG-04 executions: a green run that stops at *Authorized?* means a wrong token. |
| Statuses never reach `CONTACTED` | `email_sent` event not subscribed | Add it to the webhook events. |
| Reply handler error `Can not get sheet 'By ID' … 'undefined'` | `GOOGLE_SHEET_ID` not set in the container | Set it in `.env`; `docker compose up -d`. |
| Google Sheets nodes fail with 401/403 | OAuth token expired / sheet not shared with that account / API not enabled | Re-connect *LXG Google Sheets* credential; make sure that Google account can edit the sheet. |
| Google Sheets `429` quota errors | Too many updates at once | Lower `ENROLL_BATCH_SIZE`/`APOLLO_MAX_PER_RUN`; node retry normally absorbs this. |
| No alert emails | SMTP credential wrong, or `ALERT_EMAIL_*` unset | Open LXG-99 → run a failing workflow, or execute *Send Error Email*. Gmail needs an App Password. |
| Error alerts don't fire for a workflow | Error workflow not linked | Re-run `scripts/link_error_workflow.py` or set it in Workflow → Settings. Note: manual test runs do **not** trigger the error workflow; production (scheduled/webhook) runs do. |
| Health Monitor error `401`/`unauthorized` on *List Workflows* | `LXG n8n API` credential missing/wrong | Create an API key in n8n Settings → n8n API; update the credential. |
| Heartbeat shows `STALE` | Workflow off, n8n was down, or trigger not firing | Toggle the workflow; check the server (`docker compose ps`, `logs n8n`). |
| Heartbeat shows `MISSING` | A workflow wasn't imported or was renamed | Names must start `LXG - NN - …` exactly. |
| Weekly summary shows "Instantly data unavailable" | API key/scope or endpoint change | Report still sends. Check *Instantly Campaigns / Analytics* nodes' output; verify scopes. |
| Emails going to spam / low replies | Deliverability — not an n8n matter | Check Instantly warm-up, SPF/DKIM/DMARC, bounce rate, volume, copy. See docs/domain-mailbox-setup.md. No placement guarantees are possible. |
| Contact got email after replying | Campaign "stop on reply" off, or reply arrived between sends | Turn on stop-on-reply in the Instantly campaign settings (see instantly-setup). |
| n8n unreachable | Server/container down, DNS, certificate | `docker compose ps`; `docker compose logs caddy n8n`. The optional external ping (`HEARTBEAT_PING_URL`) will email you when n8n goes silent. |
| "Credential not found / red node" after import | Credential names differ | Select the credential manually in the node (names: README §4). |

## Re-running things safely

* Re-running LXG-01/02/03 is safe: ingest, de-dupe and enrollment are idempotent (no duplicate leads; enrolled leads aren't picked again).
* To retry a single failed lead: on the **Leads** tab set `Current Status=QUALIFIED`, `Retry Count=0`, clear `Error Status`, run LXG-03.
* To suppress someone manually: add a row to **Suppression** (Email and/or Domain). To un-suppress, delete the row (client's legal call).
* Replay a webhook: n8n → LXG-04 → Executions → open the run → **Retry** / or `curl` a payload from `tests/fixtures`.

## Useful commands

```bash
docker compose ps
docker compose logs -f n8n
docker compose restart n8n
node tests/run-logic-tests.js          # logic regression tests, no network
```
