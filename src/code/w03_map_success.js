// LXG-03 · Instantly accepted the lead -> columns to write back.
const src = $('Select Batch').item.json;
const res = $json || {};
const id = res.id || (res.lead && res.lead.id) || '';
const now = new Date().toISOString();
if (!id) {
  // Instantly returned 2xx but no lead id (e.g. lead already existed in the workspace and was skipped).
  return { json: { 'Lead ID': src.leadId, 'Current Status': 'ERROR', 'Error Status': 'NO_INSTANTLY_ID_RETURNED (lead may already exist in Instantly)', 'Retry Count': String(src.retryCount + 1), 'Last Updated': now } };
}
return { json: { 'Lead ID': src.leadId, 'Instantly ID': String(id), 'Campaign': src.campaign, 'Date Enrolled': now, 'Current Status': 'ENROLLED', 'Error Status': '', 'Retry Count': '0', 'Last Updated': now } };
