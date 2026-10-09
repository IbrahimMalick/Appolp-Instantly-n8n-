// LXG-03 · Pick the leads to enroll this run.
// Output items carry an `action`: enroll | blocked | dryrun  (routed by the Switch node).
const DRY_RUN = String($env.DRY_RUN || 'true').toLowerCase() !== 'false';        // safe default: no real sends
const DAILY_CAP = parseInt($env.DAILY_ENROLL_CAP || '20', 10);                    // volume ramp control
const BATCH = parseInt($env.ENROLL_BATCH_SIZE || '10', 10);                       // per 30-min run
const MAX_ATTEMPTS = parseInt($env.MAX_ENROLL_ATTEMPTS || '3', 10);               // controlled retries
const DEFAULT_CAMPAIGN = String($env.INSTANTLY_CAMPAIGN_ID_DEFAULT || '').trim();
let CAMPAIGN_MAP = {};
try { CAMPAIGN_MAP = JSON.parse($env.INSTANTLY_CAMPAIGN_MAP || '{}'); } catch (e) { throw new Error('INSTANTLY_CAMPAIGN_MAP is not valid JSON'); }

const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const low = v => s(v).toLowerCase();
const nowIso = new Date().toISOString();
const today = nowIso.slice(0, 10);

const leads = $('Read Leads').all().map(i => i.json).filter(r => r['Lead ID']);
const supp = $('Read Suppression').all().map(i => i.json);
const suppEmails = new Set(supp.map(r => low(r['Email'])).filter(Boolean));
const suppDomains = new Set(supp.map(r => low(r['Domain'])).filter(Boolean));

const enrolledToday = leads.filter(r => s(r['Date Enrolled']).startsWith(today)).length;
const budget = Math.max(0, Math.min(BATCH, DAILY_CAP - enrolledToday));

const eligible = leads.filter(r => {
  const st = s(r['Current Status']);
  if (st === 'QUALIFIED') return true;
  // retry only enrollment failures that never reached Instantly, and only a few times
  return st === 'ERROR' && !s(r['Instantly ID']) && !s(r['Date Enrolled']) && parseInt(r['Retry Count'] || '0', 10) < MAX_ATTEMPTS;
});

const out = [];
const preview = [];
let used = 0;
for (const r of eligible) {
  const email = low(r['Email']);
  const lid = r['Lead ID'];
  if (suppEmails.has(email) || suppDomains.has(low(r['Domain']))) {
    out.push({ json: { action: 'blocked', update: { 'Lead ID': lid, 'Current Status': 'STOPPED', 'Error Status': '', 'Stop Reason': 'SUPPRESSED', 'Last Updated': nowIso } } });
    continue;
  }
  if (used >= budget) continue;
  const campaign = CAMPAIGN_MAP[s(r['Segment'])] || DEFAULT_CAMPAIGN;
  if (!campaign) {
    out.push({ json: { action: 'blocked', update: { 'Lead ID': lid, 'Current Status': 'ERROR', 'Error Status': 'NO_CAMPAIGN_CONFIGURED (set INSTANTLY_CAMPAIGN_ID_DEFAULT)', 'Stop Reason': '', 'Last Updated': nowIso } } });
    continue;
  }
  used++;
  const location = [s(r['City']), s(r['Country'])].filter(Boolean).join(', ');
  const payload = {
    campaign,
    email,
    first_name: s(r['First Name']),
    last_name: s(r['Last Name']),
    company_name: s(r['Company']),
    website: s(r['Website']) || s(r['Domain']),
    skip_if_in_workspace: true,
    // Available in Instantly copy as {{job_title}}, {{industry}}, {{business_type}}, {{location}}, ...
    custom_variables: {
      job_title: s(r['Job Title']),
      industry: s(r['Industry']),
      business_type: s(r['Company Type']) || s(r['Segment']),
      segment: s(r['Segment']),
      location,
      city: s(r['City']),
      country: s(r['Country']),
      lxg_lead_id: lid
    }
  };
  if (DRY_RUN) preview.push({ leadId: lid, email, campaign, payload });
  else out.push({ json: { action: 'enroll', leadId: lid, campaign, payload, retryCount: parseInt(r['Retry Count'] || '0', 10) } });
}
if (DRY_RUN && preview.length) out.push({ json: { action: 'dryrun', note: 'DRY_RUN=true: nothing sent to Instantly, sheet not changed', count: preview.length, preview } });
console.log(`Enrollment: eligible=${eligible.length} enrolledToday=${enrolledToday} budget=${budget} dryRun=${DRY_RUN}`);
return out;
