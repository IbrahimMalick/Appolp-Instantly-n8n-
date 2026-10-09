// LXG-04 · Acknowledgement failed. The reply/stop is ALREADY recorded; just make the failure visible.
const d = $('Decide Action').first().json;
const e = $json.error;
let msg = typeof e === 'string' ? e : (e && e.message) || JSON.stringify(e || {});
msg = String(msg).replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 150);
return [{ json: { 'Lead ID': d.leadId, 'Email': d.email, 'Error Status': `ACK_FAILED: ${msg}`, 'Last Updated': new Date().toISOString() } }];
