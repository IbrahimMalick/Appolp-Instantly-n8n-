// LXG-04 · Acknowledgement succeeded -> record it so it is never sent twice.
const d = $('Decide Action').first().json;
return [{ json: { 'Lead ID': d.leadId, 'Email': d.email, 'Ack Sent': new Date().toISOString(), 'Last Updated': new Date().toISOString() } }];
