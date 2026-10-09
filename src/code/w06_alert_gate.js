// LXG-06 · Build the alert email from the rows the Evaluate Health node flagged.
const lines = $('Evaluate Health').all().map(i => i.json._alert).filter(Boolean);
const sendAlert = lines.length > 0;
return [{ json: {
  sendAlert,
  subject: `[LXG ALERT] ${lines.length} workflow issue(s)`,
  html: sendAlert ? `<h3>LXG automation needs attention</h3><pre>${lines.join('\n')}</pre><p>Open n8n → Executions to see what happened. Fix the cause, then re-run or re-activate the workflow.</p>` : ''
} }];
