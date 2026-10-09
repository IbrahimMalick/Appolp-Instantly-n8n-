// LXG-04 · Combine the event with the Leads row (if any) and decide exactly what to write.
// Terminal statuses are never overwritten by late/out-of-order events.
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const ev = $('Normalize Event').first().json;
const row = $input.all().map(i => i.json).find(r => r && r['Email'] && s(r['Email']).toLowerCase() === ev.email) || null;

const TERMINAL = ['REPLIED', 'UNSUBSCRIBED', 'STOPPED'];
const TOTAL_STEPS = parseInt($env.SEQUENCE_STEPS || '3', 10);
const ACK_ENABLED = String($env.ACK_ENABLED || 'false').toLowerCase() === 'true';
const DRY_RUN = String($env.DRY_RUN || 'true').toLowerCase() !== 'false';

// ---- Client-supplied acknowledgement copy. Leave the placeholder until the client approves wording. ----
const ACK_SUBJECT = 'Re: {{subject}}';
const ACK_BODY = 'CLIENT_COPY_PLACEHOLDER — Hi {{first_name}}, thanks for your reply. [client to supply]';
// ---------------------------------------------------------------------------------------------------------

const status = row ? s(row['Current Status']) : '';
const leadId = row ? row['Lead ID'] : 'LXG-' + hash(ev.email);
const base = { 'Lead ID': leadId, 'Email': ev.email, 'Last Updated': new Date().toISOString() };
const res = { ...ev, leadId, found: !!row, action: 'NONE', update: null, suppress: null, ack: null };

if (!ev.email) { res.action = 'NONE'; res.note = 'event has no lead email'; return [{ json: res }]; }

if (ev.category === 'REPLY' && ev.optOutIntent) {
  // Reply that asks to stop -> honour as unsubscribe (no acknowledgement).
  res.action = 'UNSUBSCRIBE';
  res.update = { ...base, 'Current Status': 'UNSUBSCRIBED', 'Reply Date': ev.ts, 'Reply Meta': ev.meta, 'Stop Reason': 'OPT_OUT_REPLY' };
  res.suppress = { 'Email': ev.email, 'Domain': '', 'Reason': 'OPT_OUT_REPLY', 'Source': 'instantly_webhook', 'Date Added': ev.ts };
} else if (ev.category === 'REPLY') {
  res.action = 'REPLY';
  const keep = status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'REPLIED';
  res.update = { ...base, 'Current Status': keep, 'Reply Date': ev.ts, 'Reply Meta': ev.meta, 'Stop Reason': 'REPLIED' };
  const canAck = ACK_ENABLED && !DRY_RUN && keep === 'REPLIED' && !(row && s(row['Ack Sent']))
    && ev.replyToUuid && ev.emailAccount && !ACK_BODY.includes('CLIENT_COPY_PLACEHOLDER');
  if (canAck) {
    const first = row ? s(row['First Name']) : '';
    const fill = t => t.replace(/{{first_name}}/g, first || 'there').replace(/{{subject}}/g, ev.replySubject.replace(/^re:\s*/i, ''));
    res.ack = { reply_to_uuid: ev.replyToUuid, eaccount: ev.emailAccount, subject: fill(ACK_SUBJECT), body: { text: fill(ACK_BODY) } };
  } else {
    res.ackSkipped = ACK_ENABLED ? (DRY_RUN ? 'DRY_RUN' : 'placeholder copy / missing ids / already sent') : 'ACK_ENABLED=false';
  }
} else if (ev.category === 'UNSUBSCRIBE') {
  res.action = 'UNSUBSCRIBE';
  // keep any existing reply info (the Record Unsubscribe node writes these columns too)
  res.update = { ...base, 'Current Status': 'UNSUBSCRIBED', 'Reply Date': row ? s(row['Reply Date']) : '', 'Reply Meta': row ? s(row['Reply Meta']) : '', 'Stop Reason': 'UNSUBSCRIBED' };
  res.suppress = { 'Email': ev.email, 'Domain': '', 'Reason': 'UNSUBSCRIBED', 'Source': 'instantly_webhook', 'Date Added': ev.ts };
} else if (ev.category === 'BOUNCE') {
  res.action = 'BOUNCE';
  res.update = { ...base, 'Current Status': TERMINAL.includes(status) ? status : 'STOPPED', 'Error Status': 'BOUNCED', 'Stop Reason': 'BOUNCED' };
  res.suppress = { 'Email': ev.email, 'Domain': '', 'Reason': 'BOUNCED', 'Source': 'instantly_webhook', 'Date Added': ev.ts };
} else if (ev.category === 'SENT') {
  res.action = 'SENT';
  const prev = row ? parseInt(row['Last Step Sent'] || '0', 10) || 0 : 0;
  const step = Math.max(prev, ev.step || 1);
  let next = status;
  if (!TERMINAL.includes(status)) next = step >= TOTAL_STEPS ? 'COMPLETED' : (step <= 1 ? 'CONTACTED' : 'FOLLOW_UP_PENDING');
  res.update = { ...base, 'Current Status': next || 'CONTACTED', 'Last Email Sent': ev.ts, 'Last Step Sent': String(step) };
} else if (ev.category === 'META' && row) {   // no stub rows for out-of-office / interest labels
  res.action = 'META';
  res.update = { ...base, 'Reply Meta': ev.meta };
}
return [{ json: res }];
