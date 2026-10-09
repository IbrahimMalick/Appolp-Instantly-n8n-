# Instantly setup (email / campaign view)

Instantly sends, times the follow-ups, warms up mailboxes, detects replies and hosts the copy. n8n only enrolls leads and records events.

## 1. API key
Instantly → Settings → Integrations → **API Keys** → create a v2 key. Needed scopes: leads (create/read), campaigns (read),
and emails (create) only if you enable the reply acknowledgement. Store it in n8n as credential **LXG Instantly API**
(Header Auth, name `Authorization`, value `Bearer <key>`).

## 2. Mailboxes
Connect the outreach mailboxes (see [domain-mailbox-setup.md](domain-mailbox-setup.md)) and turn **warm-up** on before sending.

## 3. Campaign(s)
Create a campaign (one default, or one per segment). Settings to apply:

* **Sequence:** Step 1 (Day 0/1), Step 2 delay **3 days** (→ Day 4), Step 3 delay **5 days** (→ Day 9) — Instantly counts delays from the previous step. Copy: supplied by the client; paste it into the steps. Subject/body can use `{{firstName}} {{lastName}} {{companyName}}` and the custom variables below.
* **Stop sending on reply: ON** (this is what actually stops the sequence; n8n then records `REPLIED`). Also leave unsubscribe handling on and include the unsubscribe link/opt-out line (client's legal call on exact wording and sender details).
* **Sending schedule / limits:** business hours in the recipient timezone; keep per-mailbox daily limits low while the domain is new.
* Do **not** add leads manually to a campaign that n8n also fills unless you intend them to bypass the Sheet.
* Copy the campaign id (from the URL) into `.env` → `INSTANTLY_CAMPAIGN_ID_DEFAULT` (and `INSTANTLY_CAMPAIGN_MAP` for per-segment campaigns). Keep campaigns **paused** until go-live.

### Variables n8n sends with every lead (`custom_variables` + standard fields)
| In Instantly copy | Content |
|---|---|
| `{{firstName}}` `{{lastName}}` `{{companyName}}` | standard |
| `{{job_title}}` | e.g. Owner |
| `{{industry}}` | Apollo industry |
| `{{business_type}}` | Apollo keywords or the segment |
| `{{segment}}` | golf, clubs, equestrian, … |
| `{{location}}` | "City, Country"; also `{{city}}` `{{country}}` |
| `{{lxg_lead_id}}` | internal id (don't show in copy) |

Verify on the first test lead (in a campaign set to a test mailbox you own) that variables render. Enrollment uses `POST /api/v2/leads` with `campaign`, `email`, `first_name`, `last_name`, `company_name`, `website`, `skip_if_in_workspace: true` and `custom_variables` (per Instantly's v2 API reference; the exact `custom_variables` behaviour should be confirmed on the first test).

## 4. Webhook → LXG-04
Instantly → Settings → Integrations → **Webhooks** → add:

* **URL:** `https://<N8N_HOST>/webhook/lxg-instantly-events?token=<INSTANTLY_WEBHOOK_SECRET>`
* **Events:** `reply_received`, `lead_unsubscribed`, `email_sent`, `email_bounced`, `auto_reply_received`. Optional (recorded as metadata only, no status change): `lead_interested`, `lead_not_interested`, `lead_out_of_office`, `lead_wrong_person`, `lead_meeting_booked`.
* Per Instantly's docs, payloads contain `event_type`, `timestamp`, `campaign_id`, `lead_email`, `step` (1-based), `email_account`, `email_id`, `reply_text`. A webhook can also be created via API (`POST /api/v2/webhooks`), but the UI is simplest.
* Use Instantly's webhook **test** feature, then check LXG-04's executions.

## 5. Optional acknowledgement
Off by default. To enable: client supplies the text → edit `ACK_SUBJECT` / `ACK_BODY` in *LXG-04 → Decide Action* (remove the `CLIENT_COPY_PLACEHOLDER` marker) → `.env`: `ACK_ENABLED=true` and `DRY_RUN=false`.
It is sent with Instantly's reply endpoint `POST /api/v2/emails/reply` (`reply_to_uuid` = webhook `email_id`, `eaccount` = the sending mailbox) so it threads from the same mailbox. It is **never** sent when: the reply asks to unsubscribe, it is an auto-reply, the lead already got one, or the sender/ids are missing. **Verify on a test reply first:** the reply endpoint expects the id of an existing email — confirm that the `email_id` in the reply event is accepted; if not, use `GET /api/v2/emails` to look up the latest message id (adapter node: *Instantly: Send Acknowledgement*).

## 6. Checking health in Instantly
Analytics (sent, replies, bounces), Accounts (warm-up score, connection errors), Campaign status. Bounce rate > 2–3% or account errors → pause and investigate before raising volume.

## What n8n deliberately does NOT do
Sequence timing, retries of sends, warm-up, reply threading, blocklist management inside Instantly. (Instantly already unsubscribes/blocks natively; n8n adds its own Suppression tab so n8n never re-enrolls those addresses.)
