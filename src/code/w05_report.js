// LXG-05 · Build the weekly summary (email + Summary tab values).
// Sheet is the source for lead counts; Instantly analytics (if reachable) is the source for emails sent.
const WINDOW_DAYS = parseInt($env.REPORT_WINDOW_DAYS || '7', 10);
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const now = new Date();
const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
const inWin = v => { const d = new Date(s(v)); return !isNaN(d) && d >= since; };

const leads = $('Read Leads').all().map(i => i.json).filter(r => r['Lead ID']);
const hb = $('Read Heartbeat').all().map(i => i.json).filter(r => r['Workflow']);
const errs = $('Read Errors').all().map(i => i.json).filter(r => r['Timestamp']);
const camps = $('Instantly Campaigns').all().map(i => i.json);
const stats = $('Instantly Analytics').all().map(i => i.json);

const count = fn => leads.filter(fn).length;
const st = x => r => s(r['Current Status']) === x;
const added = count(r => inWin(r['Date Added']));
const enrolled = count(r => inWin(r['Date Enrolled']));
const contacted = count(r => inWin(r['Last Email Sent']));
const replies = count(r => inWin(r['Reply Date']));
const unsubs = count(r => s(r['Current Status']) === 'UNSUBSCRIBED' && inWin(r['Last Updated']));
const errorLeads = count(st('ERROR'));
const errorsWeek = errs.filter(e => inWin(e['Timestamp'])).length;
const totalReplies = count(r => s(r['Reply Date']));
const totalContacted = count(r => s(r['Last Email Sent']));
const replyRate = totalContacted ? (100 * totalReplies / totalContacted).toFixed(1) + '%' : 'n/a';

// ---- Instantly (best effort; the report must not fail just because Instantly is unreachable) ----
const campList = camps.flatMap(c => Array.isArray(c.items) ? c.items : (Array.isArray(c) ? c : [c])).filter(c => c && c.name);
const statusName = { 0: 'Draft', 1: 'Active', 2: 'Paused', 3: 'Completed' };
const activeCampaigns = campList.filter(c => c.status === 1).length;
const campaignStatus = campList.length
  ? campList.map(c => `${c.name}: ${statusName[c.status] || 'status ' + c.status}`).join('; ')
  : 'Instantly data unavailable (check API key / see execution log)';
const statRows = stats.flatMap(x => Array.isArray(x) ? x : (Array.isArray(x.items) ? x.items : [x])).filter(x => x && x.emails_sent_count !== undefined);
const instantlySent = statRows.length ? statRows.reduce((a, x) => a + (x.emails_sent_count || 0), 0) : null;

// ---- Health ----
const bad = hb.filter(h => s(h['Health']) && s(h['Health']) !== 'OK');
const health = hb.length ? (bad.length ? `ATTENTION: ${bad.map(h => `${h['Workflow']} (${h['Health']})`).join(', ')}` : 'All workflows OK') : 'No heartbeat data yet';
const lastSuccess = hb.map(h => s(h['Last Success'])).filter(Boolean).sort().pop() || 'n/a';

const D = d => d.toISOString().slice(0, 10);
const rows = [
  ['Leads added', added], ['Leads enrolled', enrolled], ['Leads contacted (an email sent)', contacted],
  ['Emails sent (all time, per Instantly)', instantlySent === null ? 'n/a' : instantlySent],
  ['Replies', replies], ['Reply rate (all time)', replyRate], ['Unsubscribes', unsubs], ['Errors logged', errorsWeek],
  ['Leads currently in ERROR', errorLeads], ['Active campaigns', activeCampaigns], ['Workflow health', health]
];
const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0">${k}</td><td style="padding:4px 0"><b>${v}</b></td></tr>`).join('');
const html = `<h2>LXG Outreach — weekly summary</h2><p>${D(since)} → ${D(now)}</p><table>${table}</table>` +
  `<p>Campaigns: ${campaignStatus}</p><p style="color:#666;font-size:12px">Open n8n to inspect workflows and executions. Open the Google Sheet for lead-level detail.</p>`;

const summaryRows = [
  ['Current campaign status', campaignStatus, 'Written by LXG - 05'],
  ['Last successful workflow run', lastSuccess, 'From Heartbeat tab'],
  ['Workflow health', health, 'From Heartbeat tab'],
  ['Emails sent (Instantly, all time)', instantlySent === null ? 'n/a' : instantlySent, 'Instantly analytics'],
  ['Last report generated', now.toISOString(), 'Written by LXG - 05']
].map(([Metric, Value, Notes]) => ({ json: { Metric, Value: String(Value), Notes } }));

return [{ json: { subject: `LXG Outreach — weekly summary (${D(now)})`, html, summaryRows: summaryRows.map(r => r.json) } }];
