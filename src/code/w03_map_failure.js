// LXG-03 · Instantly call failed (after node-level retries) -> mark ERROR, count the attempt.
const src = $('Select Batch').item.json;
const e = $json.error;
let msg = typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e || $json);
msg = String(msg).replace(/Bearer\s+\S+/gi, 'Bearer ***').replace(/\s+/g, ' ').slice(0, 200);
return { json: {
  'Lead ID': src.leadId,
  'Current Status': 'ERROR',
  'Error Status': `ENROLL_FAILED: ${msg}`,
  'Retry Count': String(src.retryCount + 1),
  'Last Updated': new Date().toISOString()
} };
