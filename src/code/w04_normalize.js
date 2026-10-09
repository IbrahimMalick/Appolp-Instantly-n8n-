// LXG-04 · Validate the Instantly webhook and normalise it to one internal event shape.
// Auth: shared secret in ?token=... (or header x-lxg-token). Wrong/missing token -> ignored silently.
const secret = String($env.INSTANTLY_WEBHOOK_SECRET || '');
if (!secret) throw new Error('INSTANTLY_WEBHOOK_SECRET is not set — webhook cannot be authenticated');

const req = $input.first().json || {};
const q = req.query || {}, h = req.headers || {};
const b = req.body || {};
const token = q.token || h['x-lxg-token'] || '';
if (token !== secret) return [{ json: { authorized: false } }];

const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const eventType = s(b.event_type || b.event).toLowerCase();
const email = s(b.lead_email || b.email).toLowerCase();

// Event names follow Instantly's webhook event types (see docs/instantly-setup.md).
let category = 'IGNORED';
if (eventType === 'reply_received') category = 'REPLY';
else if (eventType === 'lead_unsubscribed' || eventType === 'unsubscribed') category = 'UNSUBSCRIBE';
else if (eventType === 'email_sent') category = 'SENT';
else if (eventType === 'email_bounced' || eventType === 'bounced') category = 'BOUNCE';
else if (eventType === 'auto_reply_received' || /^lead_/.test(eventType)) category = 'META';   // OOO + native interest labels

const replyText = s(b.reply_text || b.reply_text_snippet || b.text_body || '');
const OPT_OUT = /\b(unsubscribe|remove me|take me off|opt[- ]?out|stop (emailing|contacting|sending|messaging)|do not (contact|email)|don'?t (contact|email))\b/i;
const STEP_OFFSET = 0;       // set to 1 if Instantly reports steps 0-based (check your first test event)
const stepRaw = parseInt(b.step, 10);
const ts = b.timestamp ? new Date(b.timestamp) : new Date();

const meta = [
  `event=${eventType}`,
  b.step !== undefined && b.step !== '' ? `step=${b.step}` : '',
  s(b.email_account) ? `mailbox=${s(b.email_account)}` : '',
  s(b.reply_subject || b.subject) ? `subject=${s(b.reply_subject || b.subject).slice(0, 80)}` : ''
].filter(Boolean).join('; ').slice(0, 250);

return [{ json: {
  authorized: true,
  category,
  eventType,
  email,
  ts: isNaN(ts) ? new Date().toISOString() : ts.toISOString(),
  campaignId: s(b.campaign_id),
  campaignName: s(b.campaign_name),
  step: isNaN(stepRaw) ? null : stepRaw + STEP_OFFSET,
  emailAccount: s(b.email_account),
  replyToUuid: s(b.email_id || b.reply_to_uuid),
  replySubject: s(b.reply_subject || b.subject),
  optOutIntent: category === 'REPLY' && OPT_OUT.test(replyText),   // simple keyword guard, NOT AI classification
  meta
} }];
