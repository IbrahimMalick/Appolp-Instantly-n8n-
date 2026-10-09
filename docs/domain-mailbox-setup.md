# Outreach domain & mailbox setup

**Rule:** never send cold email from `lxgsociety.com`. Use a separate look-alike domain so any reputation problem cannot affect the main brand's mail.
No setup can guarantee inbox placement; this reduces avoidable risk.

## 1. Domain
* Buy a close variant, e.g. `lxgsociety.co`, `getlxgsociety.com`, `lxgsociety-uk.com`, `lxgheadwear.com` (plain, brand-obvious, no keywords like "mail" or "deals").
* Point its **website** (root/www) to a simple redirect or one-page site pointing to lxgsociety.com — recipients check.
* Sender identity: real person name, signature with company name and a postal/contact detail (legal requirements are the client's responsibility).

## 2. Mailboxes
* Google Workspace or Microsoft 365 mailboxes (or Instantly's partner mailboxes). 2–3 per domain at first, e.g. `martin@`, `sales@`.
* **Plan capacity:** ≤ 30–40 cold emails/mailbox/day at full ramp. 300–500 leads/week × 3 emails ≈ 1,500 emails/week ≈ 300/day ⇒ roughly 8–10 mailboxes (spread over 2–3 domains). Do not push a single mailbox/domain harder.
* Enable 2-step auth; create an **app password / use Instantly's OAuth connect** (Google/Microsoft OAuth is preferred over raw SMTP passwords).

## 3. DNS records (at the domain registrar / DNS host)
| Record | Purpose | Typical value |
|---|---|---|
| **MX** | receive mail | provider's MX (Google: `smtp.google.com` priority 1 for new Workspace; Microsoft: per tenant) |
| **SPF** (TXT on root) | authorised senders | Google: `v=spf1 include:_spf.google.com ~all` · Microsoft: `v=spf1 include:spf.protection.outlook.com ~all`. **Exactly one** SPF record. |
| **DKIM** (TXT/CNAME) | signs mail | generated in Workspace admin (*Apps → Gmail → Authenticate email*) or Microsoft Defender; publish then click *Start authentication* |
| **DMARC** (TXT `_dmarc`) | policy/reporting | start monitoring: `v=DMARC1; p=none; rua=mailto:dmarc@<outreach-domain>; adkim=s; aspf=s` — tighten to `quarantine` after a few clean weeks |
| **Custom tracking domain** (CNAME) | branded tracking links (Instantly → Settings → Tracking) | per Instantly's instructions; avoids shared tracking domains |

Verify with: Google Admin Toolbox *Check MX*, `dig TXT <domain>`, mail-tester.com (send a test), Instantly's built-in DNS check, and Gmail → *Show original* (SPF/DKIM/DMARC = PASS).

## 4. Connect to Instantly & warm up
1. Instantly → Email Accounts → Add (Google/Microsoft OAuth). Confirm "connected".
2. Enable **warm-up** on every mailbox. Leave it on **permanently** (typical guidance: 2–4 weeks before real campaigns, then keep a small warm-up running).
3. Set sending limits low (e.g. 10–15/day per mailbox in week 1 of campaigns) and raise gradually; keep a sensible time gap between sends.
4. Watch: bounce rate (keep < 2%), spam complaints, warm-up reputation score, account errors.

## 5. Ramp discipline (do not skip)
* New domain: **no real campaign for ≥ 2–3 weeks** of warm-up. Do not start aggressive volume on a new domain.
* Start `DAILY_ENROLL_CAP` at 10–20 and raise only when bounces/replies look healthy (SETUP.md §10).
* Only email verified addresses (the qualifier enforces `verified`).
* If bounce rate or spam rate spikes: pause the campaign in Instantly (n8n will simply keep leads `QUALIFIED`), fix, resume.

## 6. Compliance reminders (client's responsibility)
Identify the sender, provide an easy opt-out in every email, honour opt-outs promptly (the system stops on unsubscribe/stop-replies and keeps a suppression list), keep a lawful basis for B2B contact in each country (UK PECR/GDPR, EU rules, US CAN-SPAM differ), and keep records. This repo provides technical tools only and is not legal advice.
