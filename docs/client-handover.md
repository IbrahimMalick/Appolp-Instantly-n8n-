# Handover guide — for the business owner

You don't need to be technical. Four tools, four jobs:

| Tool | Think of it as | You look here to see… |
|---|---|---|
| **Google Sheet** | the *business performance* view | who is in the pipeline, who replied, who unsubscribed, weekly numbers |
| **n8n** | the *automation control room* | whether the robots are switched on, what ran, what failed, and why |
| **Instantly** | the *email / campaign* view | emails sent, opens/replies, mailbox health, the email wording |
| **Apollo** | the *prospecting* view | the pool of potential customers and the search that finds them |

## What happens automatically
1. Apollo supplies prospects (or you upload an Apollo export).
2. The system keeps only suitable ones (UK, verified email, an owner/buyer/director type, the right kind of business — not discount/fast-fashion chains) and removes duplicates and anyone who opted out before.
3. Suitable ones are put into the Instantly campaign. Instantly sends email 1, then email 2 after 4 days and email 3 after 9 days.
4. If someone **replies**, further emails stop automatically and the Sheet shows **REPLIED** — that's your cue to answer personally (check the Instantly inbox). If switched on, a short acknowledgement is sent.
5. If someone **unsubscribes** (or replies "remove me"), they're stopped and added to a permanent do-not-contact list.
6. Every Monday you get a summary email. If something breaks you get an alert email.

## Your day-to-day (5 minutes)
* **Monday:** read the summary email. Open the Sheet → *Summary* tab if you want detail.
* **Replies:** answer in Instantly (Unibox). Filter the Sheet's *Leads* tab by `Current Status = REPLIED`.
* **Anything red?** Sheet *Heartbeat* tab should say `OK` for every workflow.

## The Sheet, in plain words
* **Leads** – one row per prospect and where they are: QUALIFIED → ENROLLED → CONTACTED → FOLLOW_UP_PENDING → COMPLETED, or REPLIED / UNSUBSCRIBED / STOPPED / ERROR.
* **Intake** – every prospect considered, with the reason if they were rejected (handy to see why someone wasn't contacted).
* **Suppression** – the do-not-contact list. You can add an email or a whole company website here yourself at any time.
* **Summary** – the totals. **Errors** and **Heartbeat** – the technical logbook.

## Switching things on and off (n8n)
Log in to n8n → **Workflows**. Each `LXG - …` workflow has an on/off switch.
* **Pause new emails going out:** switch off **LXG - 03 - Instantly Enrollment** (and pause the campaign in Instantly to stop already-queued follow-ups).
* **Pause finding new prospects:** switch off **LXG - 01**.
* **Turn back on:** flip the switch on. Nothing is lost; the Sheet remembers where everyone is.
* **Run something now:** open the workflow → *Execute workflow*.
* **Something failed:** n8n → *Executions* → the red entry shows which step failed and why → fix it → press *Retry*. The alert email links straight to it.

## Changing things
* **Email wording:** Instantly → Campaigns → Sequences (the system never edits copy).
* **Who we target:** ask your developer to edit the Apollo search/qualification settings, or upload a new Apollo export (CSV) — see README.
* **How many per day:** a setting called `DAILY_ENROLL_CAP` (developer). Start low and raise slowly while the new email domain warms up.

## Please remember
* No one can guarantee emails reach the inbox or that people reply. Keep an eye on Instantly's mailbox health and bounce numbers.
* Don't send cold email from lxgsociety.com — only from the separate outreach domain.
* Legal compliance (GDPR/PECR/CAN-SPAM, honest sender details, opt-out wording) is your responsibility; the system only provides tools (unsubscribe handling, do-not-contact list, stop-on-reply).
* Keep safe: the n8n encryption key (`.env` → `N8N_ENCRYPTION_KEY`), the n8n login, and the Instantly/Apollo/Google logins. Never share them in email or the Sheet.
* The system starts in **test mode** (`DRY_RUN=true`) — no emails go out until the go-live checklist in SETUP.md is completed and approved.

## Who to call
A competent n8n developer can maintain this: start with ARCHITECTURE.md and TROUBLESHOOTING.md in the repository.
