// LXG-06 · Decide the health of every LXG workflow and which ones need an email alert.
// EXPECTED = how long a workflow may go without a successful run before it counts as stale.
// null = event-driven (webhook) so no staleness check, but failures are still flagged.
const EXPECTED = {
  'LXG - 01 - Apollo Lead Intake':     { maxGapH: 30 },     // daily
  'LXG - 02 - Lead Qualification':     { maxGapH: 6 },      // every 2h
  'LXG - 03 - Instantly Enrollment':   { maxGapH: 3 },      // every 30 min
  'LXG - 04 - Reply Handler':          { maxGapH: null },   // webhook
  'LXG - 05 - Reporting':              { maxGapH: 192 },    // weekly (8 days)
  'LXG - 06 - Health Monitor':         { maxGapH: 3 },      // hourly
  'LXG - 99 - Error Handler':          { maxGapH: null, needsActive: false }    // error-triggered: runs while inactive
};
const ALERT_THROTTLE_H = parseInt($env.ALERT_THROTTLE_HOURS || '24', 10);
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const now = new Date();
const hoursAgo = iso => iso ? (now - new Date(iso)) / 3600000 : Infinity;

const wfs = $('Filter LXG Workflows').all().map(i => i.json);
// Executions are matched to workflows by workflowId (each API response holds at most one execution).
const byWf = node => { const m = new Map(); for (const i of $(node).all()) for (const e of (i.json.data || [])) if (!m.has(e.workflowId)) m.set(e.workflowId, e); return m; };
const succM = byWf('Get Last Success'), failM = byWf('Get Last Error');
const prev = new Map($('Read Heartbeat').all().map(i => i.json).filter(r => r['Workflow']).map(r => [r['Workflow'], r]));

const rows = [], alerts = [];
const seen = new Set();
wfs.forEach(w => {
  seen.add(w.name);
  const exp = EXPECTED[w.name];
  const S = succM.get(w.id), F = failM.get(w.id);
  const ls = S ? (S.stoppedAt || S.startedAt) : '';
  const lf = F ? (F.stoppedAt || F.startedAt) : '';
  let health = 'OK', critical = false, why = '';
  if (!exp) { health = 'OK'; }
  else if (!w.active && exp.needsActive !== false) { health = 'INACTIVE'; critical = true; why = 'workflow is not active'; }
  else if (lf && (!ls || new Date(lf) > new Date(ls))) { health = 'FAILING'; critical = true; why = `last execution failed (${lf})`; }
  else if (exp.maxGapH && !ls) { health = 'NEVER_RAN'; why = 'no successful execution recorded yet'; }
  else if (exp.maxGapH && hoursAgo(ls) > exp.maxGapH) { health = 'STALE'; critical = true; why = `no success for ${Math.round(hoursAgo(ls))}h (limit ${exp.maxGapH}h)`; }
  const p = prev.get(w.name) || {};
  const throttled = s(p['Health']) === health && hoursAgo(s(p['Last Alerted'])) < ALERT_THROTTLE_H;
  const alertNow = critical && !throttled;
  const line = `• ${w.name}: ${health} — ${why}`;
  if (alertNow) alerts.push(line);
  rows.push({ json: {
    'Workflow': w.name, 'Expected Max Gap (h)': exp && exp.maxGapH ? String(exp.maxGapH) : 'event-driven',
    'Active': w.active ? 'yes' : 'NO', 'Last Success': ls, 'Last Failure': lf,
    'Last Failure Message': F ? `see n8n execution ${F.id}` : '', 'Health': health,
    'Last Checked': now.toISOString(), 'Last Alerted': alertNow ? now.toISOString() : s(p['Last Alerted']),
    _alert: alertNow ? line : ''
  } });
});
for (const name of Object.keys(EXPECTED)) {
  if (!seen.has(name)) {
    rows.push({ json: { 'Workflow': name, 'Expected Max Gap (h)': '', 'Active': 'MISSING', 'Last Success': '', 'Last Failure': '', 'Last Failure Message': '', 'Health': 'MISSING', 'Last Checked': now.toISOString(), 'Last Alerted': '' } });
    const p = prev.get(name) || {};
    if (!(s(p['Health']) === 'MISSING' && hoursAgo(s(p['Last Alerted'])) < ALERT_THROTTLE_H)) {
      const line = `• ${name}: MISSING — not found in n8n (import it)`;
      alerts.push(line);
      rows[rows.length - 1].json['Last Alerted'] = now.toISOString();
      rows[rows.length - 1].json._alert = line;
    }
  }
}
// Rows go to the Heartbeat tab; `_alert` (extra field, ignored by the sheet node) is read by the Alert Gate node.
return rows;
