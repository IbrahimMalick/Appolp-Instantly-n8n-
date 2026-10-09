# Setup guide

Time: ~2–3 hours once the accounts exist. Nothing here sends a real email until you switch `DRY_RUN=false`.

## 0. Accounts checklist (client buys / creates)

- [ ] Outreach domain (separate from lxgsociety.com) + 2–3 mailboxes → [docs/domain-mailbox-setup.md](docs/domain-mailbox-setup.md)
- [ ] Apollo account (check API access on the plan) → [docs/apollo-setup.md](docs/apollo-setup.md)
- [ ] Instantly account with the mailboxes connected and warm-up started → [docs/instantly-setup.md](docs/instantly-setup.md)
- [ ] Google account (owns the tracking sheet)
- [ ] A VPS with Docker (Ubuntu 22.04/24.04, 1–2 GB RAM) and a DNS name (e.g. `n8n.yourdomain.com`) pointing to it
- [ ] An SMTP mailbox for alerts/reports (not an outreach mailbox)
- [ ] The final **email copy** for the 3-step sequence (and, optionally, the reply acknowledgement text)

## 1. Server

```bash
git clone <this repo> lxg-outreach && cd lxg-outreach
cp .env.example .env
openssl rand -hex 32     # -> N8N_ENCRYPTION_KEY   (back it up somewhere safe)
openssl rand -hex 24     # -> INSTANTLY_WEBHOOK_SECRET
nano .env                # set N8N_HOST, ALERT_EMAIL_TO/FROM, keys above. Leave DRY_RUN=true
docker compose up -d
docker compose logs -f n8n   # wait for "Editor is now accessible"
```
Open `https://<N8N_HOST>` and create the owner account. Ports 80/443 must be open (Caddy gets the TLS certificate automatically).

> No server yet / local testing: use any n8n 1.x install; webhooks then need a public URL (a tunnel), so the Reply Handler can only be tested with the sample payloads in `tests/fixtures`.

## 2. Google Sheet

1. Google Drive → upload `sheet-template/LXG-Outreach-Tracker.xlsx` → open → **File → Save as Google Sheets**.
2. Copy the sheet id from the URL (`/d/<ID>/edit`) into `.env` as `GOOGLE_SHEET_ID`, then `docker compose up -d` to apply.
3. Tabs: Leads, Intake, Suppression, Errors, Heartbeat, Summary. See [docs/google-sheet-schema.md](docs/google-sheet-schema.md). Do not rename tabs/headers.
4. Optional: add existing "do-not-contact" addresses/domains to **Suppression** now.

## 3. n8n credentials  (n8n → Credentials → Create)

Use exactly these names — the workflows look them up by name.

1. **LXG Google Sheets** — type *Google Sheets OAuth2 API*. Follow n8n's guide to create a Google Cloud OAuth client (redirect URL shown in n8n), enable the Google Sheets API, then *Sign in with Google*.
2. **LXG Instantly API** — type *Header Auth*: Name `Authorization`, Value `Bearer <key>`. Create the key in Instantly → Settings → Integrations → API Keys (v2). Minimum scopes: leads (create/read), campaigns (read), emails (create — only if you use the acknowledgement).
3. **LXG Apollo API** — *Header Auth*: Name `x-api-key`, Value = Apollo API key. Skip if you start in CSV mode.
4. **LXG n8n API** — first create a key (n8n → Settings → n8n API), then *Header Auth*: Name `X-N8N-API-KEY`, Value = that key.
5. **LXG SMTP (alerts)** — type *SMTP*: host, port, user, password of the alert mailbox (Gmail: use an App Password).

## 4. Import workflows

```bash
./scripts/import-workflows.sh        # imports the 7 JSON files from ./workflows (inactive)
```
(or in the UI: Workflows → Import from file, for each file in `workflows/`.)

Then in each workflow, open nodes with a red credential warning and pick the matching credential
(Google Sheets nodes → *LXG Google Sheets*, HTTP nodes → the Instantly/Apollo/n8n credential, email nodes → *LXG SMTP (alerts)*).
Tip: n8n offers to fill the same credential into all nodes of that type.

## 5. Link the Error Handler

```bash
export N8N_BASE_URL=https://<N8N_HOST>  N8N_API_KEY=<the n8n API key>
python3 scripts/link_error_workflow.py
```
(Manual alternative: each workflow → ⋯ → Settings → **Error workflow** → `LXG - 99 - Error Handler`.)

## 6. Instantly campaign + webhook

Follow [docs/instantly-setup.md](docs/instantly-setup.md): create the campaign(s) with the client's copy (steps at Day 1/4/9, **stop on reply = on**), copy the campaign id into `.env` (`INSTANTLY_CAMPAIGN_ID_DEFAULT`), and add the webhook:

`https://<N8N_HOST>/webhook/lxg-instantly-events?token=<INSTANTLY_WEBHOOK_SECRET>` for events: *reply_received, lead_unsubscribed, email_sent, email_bounced, auto_reply_received* (+ optionally the `lead_*` label events).

## 7. Safe first run (no emails)

1. Put `import/sample-sandbox-export.csv` in place (already there). Keep `LEAD_SOURCE_MODE=csv`, `DRY_RUN=true`.
2. Run **LXG - 01** manually → 4 rows appear on **Intake**. Run **LXG - 02** → 2 become `QUALIFIED` on **Leads** (golf shop, yacht club); Primark is rejected (`EXCLUDED_COMPANY_TYPE`) and the unverified email is rejected (`EMAIL_NOT_VERIFIED`) — see the Reason column on **Intake**.
3. Run **LXG - 03** → execution output shows `DRY RUN — would enroll N lead(s)` with the exact payload. Nothing is sent.
4. Run **LXG - 06** → **Heartbeat** tab fills; **LXG - 05** → summary email arrives.
5. Walk through the live checklist in [tests/SCENARIOS.md](tests/SCENARIOS.md) (webhook sample payloads with `curl`).
6. **Delete the sandbox rows** from Intake/Leads before real data (or keep them: they use `.example` domains and will never be enrolled while DRY_RUN is on).

## 8. Activate

Toggle ON: LXG - 01, 02, 03, 04, 05, 06. (LXG - 99 needs no activation.) Check **LXG - 04** shows a *Production URL*.

## 9. Go-live checklist (client approval required)

- [ ] Domain age/warm-up: mailboxes warmed for ≥ 2–3 weeks; SPF/DKIM/DMARC pass (docs/domain-mailbox-setup.md)
- [ ] Instantly campaign copy approved; **unsubscribe link/opt-out line present**; sequence = Day 1 / 4 / 9; stop-on-reply on
- [ ] Sending limits set low in Instantly (e.g. ≤ 20–30/day/mailbox to start) and `DAILY_ENROLL_CAP` low (10–20)
- [ ] Test webhook events produce the expected sheet changes (tests/SCENARIOS.md 7–9)
- [ ] Error alert test received by the owner (scenario 12)
- [ ] Client has confirmed their own legal basis / compliance for the target markets
- [ ] Set `DRY_RUN=false` in `.env` (and `ACK_ENABLED=true` only if the acknowledgement copy was supplied and approved), `docker compose up -d`

## 10. Ramp plan (suggested)

| Week | `DAILY_ENROLL_CAP` | Notes |
|---|---|---|
| 1 | 10–20 | watch bounce rate (<2%), replies, errors |
| 2 | 30–40 | |
| 3+ | 60–100 | ≈ 300–500 leads/week = ~60–100/day on 5 weekdays; needs enough mailboxes (see domain doc) |

Raise `DAILY_ENROLL_CAP` and `APOLLO_MAX_PER_RUN` gradually; never faster than warm-up and sending limits allow.
