// LXG-99 · Turn an n8n Error Trigger payload into a sheet row + alert email.
// Scrubs obvious secrets, extracts the lead id when a node put "[lead:LXG-...]" in its message,
// and throttles duplicate alerts (same workflow+message) to one per 15 minutes.
const p = $input.first().json || {};
const ex = p.execution || {}, wf = p.workflow || {};
const err = ex.error || {};
const scrub = t => String(t || '').replace(/Bearer\s+\S+/gi, 'Bearer ***').replace(/(api[_-]?key|token|password|secret)=\S+/gi, '$1=***').replace(/\s+/g, ' ').slice(0, 500);

const message = scrub(err.message || err.description || 'Unknown error');
const node = ex.lastNodeExecuted || err.node?.name || (err.node && err.node.name) || 'unknown';
const m = /\[lead:([\w-]+)\]/.exec(String(err.message || ''));
const leadId = m ? m[1] : '';
const ts = new Date().toISOString();

const sd = $getWorkflowStaticData('global');
sd.recent = sd.recent || {};
const key = `${wf.name}|${message.slice(0, 80)}`;
const last = sd.recent[key] ? new Date(sd.recent[key]) : null;
const throttled = last && (Date.now() - last.getTime()) < 15 * 60000;
if (!throttled) sd.recent[key] = ts;
for (const k of Object.keys(sd.recent)) if (Date.now() - new Date(sd.recent[k]).getTime() > 86400000) delete sd.recent[k];

const html = `<h3>n8n workflow failed: ${wf.name || 'unknown'}</h3>
<table cellpadding="3">
<tr><td>Time</td><td>${ts}</td></tr>
<tr><td>Execution ID</td><td>${ex.id || 'n/a'}</td></tr>
<tr><td>Failed node</td><td>${node}</td></tr>
<tr><td>Lead ID</td><td>${leadId || 'n/a'}</td></tr>
<tr><td>Error</td><td>${message}</td></tr></table>
<p>${ex.url ? `<a href="${ex.url}">Open this execution in n8n</a>` : 'Open n8n → Executions'}. Fix the cause, then use <b>Retry</b> on the execution or run the workflow manually.</p>`;

return [{ json: {
  row: { 'Timestamp': ts, 'Workflow': wf.name || '', 'Execution ID': String(ex.id || ''), 'Failed Node': node, 'Error Message': message, 'Lead ID': leadId, 'Execution URL': ex.url || '' },
  sendAlert: !throttled,
  subject: `[LXG ERROR] ${wf.name || 'workflow'} failed at "${node}"`,
  html
} }];
