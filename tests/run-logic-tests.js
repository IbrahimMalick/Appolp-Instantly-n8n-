#!/usr/bin/env node
/*
 * Offline logic tests for the LXG n8n workflows.
 *
 * What this DOES: extracts the Code nodes from workflows/*.json (the exact code that runs in n8n),
 * runs them in a sandbox with n8n-style stubs ($input, $('Node'), $env, ...) against sandbox data,
 * and checks the structural integrity of every workflow file.
 *
 * What this does NOT do: call Apollo, Instantly, Google Sheets or SMTP, or execute n8n itself.
 * Those are covered by the live checklist in tests/SCENARIOS.md. No emails are ever sent.
 *
 * Run:  node tests/run-logic-tests.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF_DIR = path.join(ROOT, 'workflows');
const workflows = {};
for (const f of fs.readdirSync(WF_DIR).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(WF_DIR, f), 'utf8'));
  workflows[f] = j;
}
const byPrefix = p => Object.entries(workflows).find(([f]) => f.startsWith(p))[1];

// ───────────── tiny harness ─────────────
let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; failures.push([name, e]); console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function throws(fn, re) { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error(`threw wrong error: ${e.message}`); return; } throw new Error('expected an error'); }

const J = a => a.map(json => ({ json }));

// Run one Code node. nodes = { 'Node Name': [items] } for $('Node Name'); each-mode uses item index 0 of input.
function runNode(wf, nodeName, { input = [], nodes = {}, env = {}, mode, pairedItem, staticData = {} } = {}) {
  const node = byPrefix(wf).nodes.find(n => n.name === nodeName);
  if (!node) throw new Error(`node not found: ${nodeName}`);
  const items = J(input);
  const mk = arr => ({ all: () => J(arr), first: () => J(arr)[0], last: () => J(arr).slice(-1)[0], item: pairedItem ? { json: pairedItem } : J(arr)[0] });
  const dollar = name => { if (!(name in nodes)) throw new Error(`test fixture missing node "${name}"`); return mk(nodes[name]); };
  const inputObj = { all: () => items, first: () => items[0], last: () => items[items.length - 1], item: items[0] };
  const logs = [];
  const fn = new Function('$input', '$', '$env', '$json', '$getWorkflowStaticData', 'console', node.parameters.jsCode);
  const out = fn(inputObj, dollar, env, input[0] || {}, () => staticData, { log: (...a) => logs.push(a.join(' ')) });
  return { out, logs, staticData };
}
const outJson = r => (Array.isArray(r.out) ? r.out.map(o => o.json) : [r.out.json]);

// ───────────── 0. structural checks ─────────────
console.log('\n[0] Workflow file integrity');
test('7 workflow files exist with the agreed names', () => {
  eq(Object.keys(workflows).sort(), [
    'lxg-01-apollo-lead-intake.json', 'lxg-02-lead-qualification.json', 'lxg-03-instantly-enrollment.json',
    'lxg-04-reply-handler.json', 'lxg-05-reporting.json', 'lxg-06-health-monitor.json', 'lxg-99-error-handler.json']);
});
for (const [f, wf] of Object.entries(workflows)) {
  test(`${f}: unique node names, valid connections, code compiles`, () => {
    const names = wf.nodes.map(n => n.name);
    eq(new Set(names).size, names.length, 'duplicate node names');
    for (const [src, c] of Object.entries(wf.connections)) {
      ok(names.includes(src), `connection source missing: ${src}`);
      for (const outs of c.main) for (const t of outs) ok(names.includes(t.node), `${src} -> missing ${t.node}`);
    }
    for (const n of wf.nodes.filter(n => n.type === 'n8n-nodes-base.code')) new Function('$input', '$', '$env', '$json', '$getWorkflowStaticData', n.parameters.jsCode);
    ok(wf.active === false, 'exports must be inactive until credentials are configured');
  });
  test(`${f}: no hardcoded secrets / ids`, () => {
    const s = JSON.stringify(wf);
    ok(!/sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9_\-]{20,}|AIza[0-9A-Za-z_\-]{20}|password"\s*:\s*"[^"]/i.test(s), 'looks like a secret');
    for (const n of wf.nodes) for (const c of Object.values(n.credentials || {})) ok(c.id === '' && /^LXG /.test(c.name), `credential ref must be a named placeholder (${n.name})`);
  });
}
test('no n8n expression references another node with $(...) (n8n 1.123 throws "could not be cloned" for Code-node sources)', () => {
  const walk = (v, f) => { if (typeof v === 'string') f(v); else if (v && typeof v === 'object') Object.values(v).forEach(x => walk(x, f)); };
  for (const [f, wf] of Object.entries(workflows)) for (const n of wf.nodes) {
    const params = { ...n.parameters }; if (n.type.endsWith('.code')) delete params.jsCode;
    walk(params, s => { if (s.startsWith('=') && /\$\(['"]/.test(s)) throw new Error(`${f} :: ${n.name} uses $('...') in an expression`); });
  }
});
test('every workflow with external calls has controlled retries (not infinite)', () => {
  for (const wf of Object.values(workflows)) for (const n of wf.nodes) {
    if (/httpRequest|googleSheets/.test(n.type) && n.retryOnFail) ok(n.maxTries <= 3, `${n.name} maxTries too high`);
  }
});
test('webhook responds immediately; reply handler writes before acknowledging', () => {
  const wf = byPrefix('lxg-04');
  eq(wf.nodes.find(n => n.type.endsWith('.webhook')).parameters.responseMode, 'onReceived');
  const c = wf.connections;
  ok(c['Record Reply'].main[0][0].node === 'Restore: Reply' && c['Restore: Reply'].main[0][0].node === 'Send Acknowledgement?', 'ack must come after the reply is recorded');
  ok(c['Suppress Contact'].main[0][0].node === 'Restore: Unsubscribe' && c['Restore: Unsubscribe'].main[0][0].node === 'Record Unsubscribe', 'suppression is written before the lead row');
});

// ───────────── 1-4. qualification & dedupe ─────────────
console.log('\n[1-4] Lead qualification / dedupe (LXG-02)');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'intake-rows.json'), 'utf8'));
const NOW = '2026-01-05T09:00:00.000Z';
const row = (o) => ({ 'Intake ID': 'IN-' + Math.random().toString(36).slice(2, 8), 'Date Added': NOW, 'Source': 'csv', 'Apollo ID': '', 'First Name': 'Alex', 'Last Name': 'Morgan',
  'Job Title': 'Owner', 'Company': 'Fairway Golf Pro Shop', 'Domain': 'fairwaygolf.co.uk', 'Website': 'https://fairwaygolf.co.uk', 'Email': 'alex@fairwaygolf.co.uk',
  'Email Verification Status': 'verified', 'Industry': 'Retail', 'Company Type': 'golf, pro shop', 'Country': 'United Kingdom', 'City': 'Leeds', 'Employee Count': '8', 'Intake Status': 'PENDING', ...o });
function qualify(pending, leads = [], supp = []) {
  const r = runNode('lxg-02', 'Qualify & Dedupe', { nodes: { 'Read Pending Intake': pending, 'Read Leads': leads, 'Read Suppression': supp } });
  return outJson(r);
}
test('1 valid lead -> QUALIFIED with Leads row, segment, status QUALIFIED', () => {
  const [d] = qualify([row({})]);
  eq(d.intake['Intake Status'], 'QUALIFIED');
  eq(d.lead['Current Status'], 'QUALIFIED');
  eq(d.lead['Segment'], 'golf');
  ok(/^LXG-/.test(d.lead['Lead ID']) && d.lead['Email'] === 'alex@fairwaygolf.co.uk');
});
test('2a duplicate lead (email already in Leads) -> DUPLICATE, not re-added', () => {
  const [d] = qualify([row({ 'Intake ID': 'IN-x', 'Date Added': 'later' })], [{ 'Lead ID': 'LXG-old', 'Email': 'ALEX@fairwaygolf.co.uk', 'Date Added': NOW, 'Domain': 'fairwaygolf.co.uk' }]);
  eq(d.intake['Intake Status'], 'DUPLICATE'); eq(d.lead, null);
});
test('2b duplicate: same domain + name, different email -> DUPLICATE', () => {
  const [d] = qualify([row({ 'Email': 'alex.morgan@fairwaygolf.co.uk' })], [{ 'Lead ID': 'LXG-old', 'Email': 'alex@fairwaygolf.co.uk', 'First Name': 'Alex', 'Last Name': 'Morgan', 'Domain': 'fairwaygolf.co.uk' }]);
  eq(d.intake['Reason'], 'DUPLICATE_DOMAIN_AND_NAME');
});
test('2c duplicate inside the same batch -> only one qualifies', () => {
  const r = qualify([row({ 'Intake ID': 'IN-1' }), row({ 'Intake ID': 'IN-2', 'Apollo ID': 'zzz' })]);
  eq(r.filter(x => x.lead).length, 1); eq(r.filter(x => x.intake['Intake Status'] === 'DUPLICATE').length, 1);
});
test('2d crash recovery: lead already appended with same Date Added -> QUALIFIED/RECOVERED, no second row', () => {
  const p = row({ 'Intake ID': 'IN-r' });
  const first = qualify([p])[0].lead;
  const [d] = qualify([p], [first]);
  eq(d.lead, null); eq(d.intake['Reason'], 'RECOVERED_ALREADY_IN_LEADS');
});
test('3 missing email -> REJECTED MISSING_EMAIL', () => { const [d] = qualify([row({ 'Email': '' })]); eq(d.intake['Reason'], 'MISSING_EMAIL'); eq(d.lead, null); });
test('3b malformed email -> REJECTED', () => { const [d] = qualify([row({ 'Email': 'not-an-email' })]); eq(d.intake['Reason'], 'INVALID_EMAIL_FORMAT'); });
test('4 unverified / invalid email status -> REJECTED', () => {
  for (const st of ['unverified', 'invalid', 'likely to engage', '']) { const [d] = qualify([row({ 'Email Verification Status': st })]); ok(/^EMAIL_NOT_VERIFIED/.test(d.intake['Reason']), st); }
});
test('suppressed email and suppressed domain -> SUPPRESSED', () => {
  eq(qualify([row({})], [], [{ 'Email': 'alex@fairwaygolf.co.uk' }])[0].intake['Intake Status'], 'SUPPRESSED');
  eq(qualify([row({})], [], [{ 'Domain': 'fairwaygolf.co.uk' }])[0].intake['Intake Status'], 'SUPPRESSED');
});
test('exclusions: fast fashion / supermarket / discount / mass-market rejected', () => {
  for (const c of ['Primark', 'Tesco Extra', 'Poundland Discount Store', 'Boohoo fast fashion', 'Sports Direct']) {
    const [d] = qualify([row({ 'Company': c, 'Domain': 'x.co.uk', 'Email': 'a@x.co.uk', 'Industry': 'Apparel & Fashion' })]);
    eq(d.intake['Reason'], 'EXCLUDED_COMPANY_TYPE', c);
  }
});
test('non-UK, wrong-seniority, non-target-business are rejected with reasons', () => {
  ok(/^COUNTRY_NOT_ALLOWED/.test(qualify([row({ 'Country': 'France' })])[0].intake['Reason']));
  eq(qualify([row({ 'Job Title': 'Marketing Director' })])[0].intake['Reason'], 'TITLE_EXCLUDED');
  eq(qualify([row({ 'Job Title': 'Sales Assistant' })])[0].intake['Reason'], 'TITLE_EXCLUDED');
  eq(qualify([row({ 'Job Title': 'Receptionist' })])[0].intake['Reason'], 'TITLE_NOT_DECISION_MAKER');
  eq(qualify([row({ 'Company': 'Acme Plumbing', 'Industry': 'Construction', 'Company Type': '', 'Domain': 'acmeplumbing.co.uk', 'Email': 'a@acmeplumbing.co.uk' })])[0].intake['Reason'], 'NO_TARGET_SEGMENT');
});
test('target roles accepted: owner, founder, director, buyer, head of buying, purchasing manager, retail buyer', () => {
  ['Owner', 'Founder', 'Co-Founder', 'Director', 'Managing Director', 'Buyer', 'Head of Buying', 'Purchasing Manager', 'Retail Buyer'].forEach((t, i) => {
    eq(qualify([row({ 'Job Title': t, 'Email': `p${i}@fairwaygolf.co.uk`, 'First Name': 'P' + i })])[0].intake['Intake Status'], 'QUALIFIED', t);
  });
});
test('General Manager only where appropriate (club yes, menswear boutique no)', () => {
  eq(qualify([row({ 'Job Title': 'General Manager', 'Company': 'Royal Country Club', 'Company Type': 'country club', 'Domain': 'rcc.co.uk', 'Email': 'gm@rcc.co.uk' })])[0].intake['Intake Status'], 'QUALIFIED');
  eq(qualify([row({ 'Job Title': 'General Manager', 'Company': 'Harris Menswear', 'Company Type': 'menswear', 'Domain': 'harris.co.uk', 'Email': 'gm@harris.co.uk' })])[0].intake['Reason'], 'GENERAL_MANAGER_NOT_APPROPRIATE_FOR_SEGMENT');
});
test('generic mailbox rejected when a named decision-maker exists (batch or Leads); allowed when alone', () => {
  const named = row({ 'Intake ID': 'IN-n' });
  const generic = row({ 'Intake ID': 'IN-g', 'Email': 'info@fairwaygolf.co.uk', 'First Name': 'Team', 'Last Name': '', 'Job Title': 'Owner' });
  const r = qualify([generic, named]);
  eq(r.find(x => x.intake['Intake ID'] === 'IN-g').intake['Reason'], 'GENERIC_EMAIL_NAMED_CONTACT_AVAILABLE');
  eq(r.find(x => x.intake['Intake ID'] === 'IN-n').intake['Intake Status'], 'QUALIFIED');
  eq(qualify([generic])[0].intake['Intake Status'], 'QUALIFIED');
});
test('fixture file: 12 sandbox rows produce the documented outcomes', () => {
  const rows = fixtures.pending.map(r => ({ 'Date Added': NOW, 'Source': 'csv', 'Intake Status': 'PENDING', ...r }));
  const res = qualify(rows, fixtures.leads, fixtures.suppression);
  for (const exp of fixtures.expected) {
    const got = res.find(x => x.intake['Intake ID'] === exp.id);
    ok(got, `no decision for ${exp.id}`);
    eq(got.intake['Intake Status'], exp.status, exp.id);
    if (exp.reason) ok(got.intake['Reason'].startsWith(exp.reason), `${exp.id} reason ${got.intake['Reason']}`);
  }
});

// ───────────── Intake (LXG-01) ─────────────
console.log('\n[01] Lead intake adapters (LXG-01)');
test('CSV adapter maps Apollo-export headers to canonical fields', () => {
  const r = runNode('lxg-01', 'Normalize CSV', { input: [{ 'First Name': 'Sam', 'Last Name': 'Lee', 'Title': 'Head of Buying', 'Company': 'Links Golf', 'Email': 'Sam@Links.co.uk',
    'Email Status': 'Verified', 'Industry': 'Retail', 'Website': 'https://www.links.co.uk/shop', 'Country': 'United Kingdom', 'City': 'York', '# Employees': '12', 'Apollo Contact Id': 'abc' }] });
  const [l] = outJson(r);
  eq([l.email, l.email_verification_status, l.company_domain, l.apollo_id, l.full_name], ['sam@links.co.uk', 'verified', 'links.co.uk', 'abc', 'Sam Lee']);
});
test('CSV adapter ignores blank/error rows (no file present is not a failure)', () => {
  eq(outJson(runNode('lxg-01', 'Normalize CSV', { input: [{}, { error: 'no files' }] })).length, 0);
});
test('Apollo adapter maps bulk_match response and tolerates nulls', () => {
  const r = runNode('lxg-01', 'Normalize Apollo', { input: [{ matches: [null, { id: 'p1', first_name: 'Jo', last_name: 'Bell', title: 'Owner', email: 'JO@club.co.uk', email_status: 'verified', city: 'Bath', country: 'United Kingdom',
    organization: { name: 'Bath Golf Club', primary_domain: 'club.co.uk', industry: 'Sports', keywords: ['golf', 'club'], estimated_num_employees: 30 } }] }] });
  const [l] = outJson(r); eq([l.email, l.company_domain, l.company_type, l.source], ['jo@club.co.uk', 'club.co.uk', 'golf, club', 'apollo_api']);
});
test('Apollo prefilter skips already-ingested Apollo IDs before enrichment and batches by 10; resets page when exhausted', () => {
  const people = Array.from({ length: 25 }, (_, i) => ({ id: 'a' + i }));
  const r = runNode('lxg-01', 'Apollo Prefilter (skip known)', { input: [{ people }], nodes: { Config: [{ page: 2, maxPerRun: 50 }], 'Read Existing Intake': [{ 'Apollo ID': 'a0' }, { 'Apollo ID': 'a1' }] } });
  eq(outJson(r).map(x => x.details.length), [10, 10, 3]); eq(r.staticData.apolloPage, 3);
  const r2 = runNode('lxg-01', 'Apollo Prefilter (skip known)', { input: [{ people: [] }], nodes: { Config: [{ page: 7, maxPerRun: 50 }], 'Read Existing Intake': [] } });
  eq(r2.staticData.apolloPage, 1);
});
test('Build Intake Rows: skips re-imports, honours per-run cap, defaults to PENDING', () => {
  const canon = (i) => ({ source: 'csv', apollo_id: '', email: `u${i}@x.co.uk`, first_name: 'U', last_name: String(i), full_name: 'U ' + i, company_name: 'X', company_domain: 'x.co.uk' });
  const first = outJson(runNode('lxg-01', 'Build Intake Rows', { input: [canon(1), canon(2), canon(3)], nodes: { Config: [{ maxPerRun: 2 }], 'Read Existing Intake': [] } }));
  eq(first.length, 2); eq(first[0]['Intake Status'], 'PENDING');
  const again = outJson(runNode('lxg-01', 'Build Intake Rows', { input: [canon(1), canon(2)], nodes: { Config: [{ maxPerRun: 5 }], 'Read Existing Intake': first.map(f => ({ 'Intake ID': f['Intake ID'] })) } }));
  eq(again.length, 0);
});

// ───────────── 5-6. enrollment ─────────────
console.log('\n[5-6] Instantly enrollment (LXG-03)');
const lead = (o = {}) => ({ 'Lead ID': 'LXG-1', 'First Name': 'Alex', 'Last Name': 'Morgan', 'Job Title': 'Owner', 'Company': 'Fairway Golf', 'Domain': 'fairwaygolf.co.uk', 'Email': 'alex@fairwaygolf.co.uk',
  'Industry': 'Retail', 'Country': 'United Kingdom', 'City': 'Leeds', 'Website': 'https://fairwaygolf.co.uk', 'Company Type': 'golf', 'Segment': 'golf', 'Current Status': 'QUALIFIED', 'Retry Count': '0', ...o });
const sel = (leads, env = {}, supp = []) => outJson(runNode('lxg-03', 'Select Batch', { env: { DRY_RUN: 'false', INSTANTLY_CAMPAIGN_ID_DEFAULT: 'camp-default', ...env }, nodes: { 'Read Leads': leads, 'Read Suppression': supp } }));
test('5 DRY_RUN defaults to true: nothing is enrolled, preview only', () => {
  const r = runNode('lxg-03', 'Select Batch', { env: { INSTANTLY_CAMPAIGN_ID_DEFAULT: 'c' }, nodes: { 'Read Leads': [lead()], 'Read Suppression': [] } });
  const o = outJson(r); eq(o.length, 1); eq(o[0].action, 'dryrun');
});
test('5 enrollment payload carries all personalization fields + routes campaign by segment', () => {
  const [e] = sel([lead()], { INSTANTLY_CAMPAIGN_MAP: '{"golf":"camp-golf"}' });
  eq(e.action, 'enroll'); eq(e.payload.campaign, 'camp-golf');
  eq([e.payload.first_name, e.payload.company_name, e.payload.custom_variables.job_title, e.payload.custom_variables.industry, e.payload.custom_variables.location],
    ['Alex', 'Fairway Golf', 'Owner', 'Retail', 'Leeds, United Kingdom']);
  eq(sel([lead({ Segment: 'fitness' })], { INSTANTLY_CAMPAIGN_MAP: '{"golf":"camp-golf"}' })[0].payload.campaign, 'camp-default');
});
test('5 successful enrollment -> ENROLLED with Instantly ID, campaign and enrol timestamp', () => {
  const src = sel([lead()])[0];
  const r = runNode('lxg-03', 'Map Success', { input: [{ id: 'inst-123', email: 'alex@fairwaygolf.co.uk' }], nodes: { 'Select Batch': [src] } });
  const o = outJson(r)[0]; eq([o['Current Status'], o['Instantly ID'], o['Campaign']], ['ENROLLED', 'inst-123', 'camp-default']); ok(o['Date Enrolled']);
});
test('5b Instantly 2xx with no id (already in workspace) -> ERROR, visible, counted', () => {
  const src = sel([lead()])[0];
  const o = outJson(runNode('lxg-03', 'Map Success', { input: [{}], nodes: { 'Select Batch': [src] } }))[0]; eq(o['Current Status'], 'ERROR'); eq(o['Retry Count'], '1');
});
test('6 Instantly API failure -> ERROR, attempt counted, secrets scrubbed', () => {
  const src = sel([lead()])[0];
  const o = outJson(runNode('lxg-03', 'Map Failure', { input: [{ error: 'Request failed 401 Authorization: Bearer abc123SECRET' }], nodes: { 'Select Batch': [src] } }))[0];
  eq(o['Current Status'], 'ERROR'); eq(o['Retry Count'], '1'); ok(!/abc123SECRET/.test(o['Error Status']), 'secret leaked');
});
test('6 failed leads are retried at most MAX_ENROLL_ATTEMPTS times, then left in ERROR', () => {
  eq(sel([lead({ 'Current Status': 'ERROR', 'Retry Count': '2' })]).length, 1);
  eq(sel([lead({ 'Current Status': 'ERROR', 'Retry Count': '3' })]).length, 0);
});
test('6 systemic failure (all leads failed) raises so the Error Handler emails the owner; partial failure does not', () => {
  const sb = sel([lead(), lead({ 'Lead ID': 'LXG-2', Email: 'b@x.co.uk' })]);
  throws(() => runNode('lxg-03', 'Evaluate Run', { nodes: { 'Select Batch': sb, 'Map Failure': [{ 'Error Status': 'ENROLL_FAILED: 401' }, { 'Error Status': 'x' }] } }), /failed for all 2/);
  runNode('lxg-03', 'Evaluate Run', { nodes: { 'Select Batch': sb, 'Map Failure': [{ 'Error Status': 'x' }] } });
});
test('volume ramp: daily cap and batch size are enforced', () => {
  const many = Array.from({ length: 30 }, (_, i) => lead({ 'Lead ID': 'L' + i, Email: `p${i}@x.co.uk` }));
  eq(sel(many, { ENROLL_BATCH_SIZE: '10' }).filter(x => x.action === 'enroll').length, 10);
  const today = new Date().toISOString();
  const done = Array.from({ length: 18 }, (_, i) => lead({ 'Lead ID': 'D' + i, Email: `d${i}@x.co.uk`, 'Current Status': 'ENROLLED', 'Date Enrolled': today }));
  eq(sel([...done, ...many], { DAILY_ENROLL_CAP: '20' }).filter(x => x.action === 'enroll').length, 2);
});
test('9 suppressed contacts are never enrolled (re-checked at enrollment time)', () => {
  const o = sel([lead()], {}, [{ Email: 'alex@fairwaygolf.co.uk' }]); eq(o.length, 1); eq(o[0].action, 'blocked'); eq(o[0].update['Current Status'], 'STOPPED');
  eq(sel([lead()], {}, [{ Domain: 'fairwaygolf.co.uk' }])[0].action, 'blocked');
});
test('8 leads already REPLIED / UNSUBSCRIBED / STOPPED are never picked up', () => {
  for (const st of ['REPLIED', 'UNSUBSCRIBED', 'STOPPED', 'ENROLLED', 'CONTACTED']) eq(sel([lead({ 'Current Status': st })]).length, 0, st);
});
test('missing campaign id is surfaced as ERROR, not silently skipped', () => {
  const o = outJson(runNode('lxg-03', 'Select Batch', { env: { DRY_RUN: 'false' }, nodes: { 'Read Leads': [lead()], 'Read Suppression': [] } }))[0];
  eq(o.action, 'blocked'); ok(/NO_CAMPAIGN_CONFIGURED/.test(o.update['Error Status']));
});

// ───────────── 7-9. reply / unsubscribe ─────────────
console.log('\n[7-9] Reply & unsubscribe handling (LXG-04)');
const ENV4 = { INSTANTLY_WEBHOOK_SECRET: 's3cret', DRY_RUN: 'false' };
const hook = (body, token = 's3cret') => ({ query: token ? { token } : {}, headers: {}, body });
const norm = (body, token) => outJson(runNode('lxg-04', 'Normalize Event', { input: [hook(body, token)], env: ENV4 }))[0];
const decide = (ev, row, env = {}) => outJson(runNode('lxg-04', 'Decide Action', { input: row ? [row] : [{}], nodes: { 'Normalize Event': [ev] }, env: { ...ENV4, ...env } }))[0];
const enrolledRow = (o = {}) => ({ 'Lead ID': 'LXG-1', 'Email': 'alex@fairwaygolf.co.uk', 'First Name': 'Alex', 'Current Status': 'CONTACTED', 'Last Step Sent': '1', ...o });
test('webhook rejects missing/wrong token (no processing) and refuses to run without a configured secret', () => {
  eq(norm({ event_type: 'reply_received', lead_email: 'a@b.co' }, 'wrong').authorized, false);
  eq(norm({ event_type: 'reply_received', lead_email: 'a@b.co' }, '').authorized, false);
  throws(() => runNode('lxg-04', 'Normalize Event', { input: [hook({})], env: {} }), /INSTANTLY_WEBHOOK_SECRET/);
});
test('7 reply -> REPLIED, reply date + metadata recorded', () => {
  const ev = norm({ event_type: 'reply_received', lead_email: 'Alex@fairwaygolf.co.uk', timestamp: '2026-01-07T10:00:00Z', step: 1, email_account: 'sales@outreach.example', reply_subject: 'Re: Wholesale' });
  eq(ev.category, 'REPLY');
  const d = decide(ev, enrolledRow());
  eq(d.action, 'REPLY'); eq(d.update['Current Status'], 'REPLIED'); eq(d.update['Reply Date'], '2026-01-07T10:00:00.000Z'); ok(/mailbox=sales@outreach.example/.test(d.update['Reply Meta']));
});
test('7 acknowledgement: off by default, never with placeholder copy, never in DRY_RUN', () => {
  const ev = norm({ event_type: 'reply_received', lead_email: 'alex@fairwaygolf.co.uk', email_id: 'uuid-1', email_account: 'sales@outreach.example' });
  eq(decide(ev, enrolledRow()).ack, null);
  eq(decide(ev, enrolledRow(), { ACK_ENABLED: 'true' }).ack, null);                    // placeholder copy still present
  eq(decide(ev, enrolledRow(), { ACK_ENABLED: 'true', DRY_RUN: 'true' }).ack, null);
});
test('7 acknowledgement sends once only (Ack Sent guard) and not to opt-outs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/code/w04_decide.js'), 'utf8').replace(/CLIENT_COPY_PLACEHOLDER — /g, '');
  const wf = JSON.parse(JSON.stringify(byPrefix('lxg-04'))); // run with approved copy
  const n = wf.nodes.find(n => n.name === 'Decide Action'); n.parameters.jsCode = n.parameters.jsCode.replace('CLIENT_COPY_PLACEHOLDER — ', '').replace('[client to supply]', 'Thanks!');
  workflows['__tmp04.json'] = wf;
  const run = (row) => outJson(runNode('__tmp04', 'Decide Action', { input: [row], nodes: { 'Normalize Event': [norm({ event_type: 'reply_received', lead_email: 'alex@fairwaygolf.co.uk', email_id: 'u', email_account: 'm@o.example', reply_subject: 'Re: Hi', reply_text: 'Sounds interesting' })] }, env: { ...ENV4, ACK_ENABLED: 'true' } }))[0];
  const d = run(enrolledRow()); ok(d.ack && d.ack.reply_to_uuid === 'u' && /Hi Alex/.test(d.ack.body.text), 'ack should be built');
  eq(run(enrolledRow({ 'Ack Sent': '2026-01-07T10:00:00Z' })).ack, null);
  const opt = outJson(runNode('__tmp04', 'Decide Action', { input: [enrolledRow()], nodes: { 'Normalize Event': [norm({ event_type: 'reply_received', lead_email: 'alex@fairwaygolf.co.uk', email_id: 'u', email_account: 'm', reply_text: 'Please remove me from your list' })] }, env: { ...ENV4, ACK_ENABLED: 'true' } }))[0];
  eq(opt.ack, null); eq(opt.action, 'UNSUBSCRIBE');
  delete workflows['__tmp04.json'];
});
test('8 sequence stops: late "email sent" event never overwrites REPLIED / UNSUBSCRIBED / STOPPED', () => {
  const ev = norm({ event_type: 'email_sent', lead_email: 'alex@fairwaygolf.co.uk', step: 2 });
  for (const st of ['REPLIED', 'UNSUBSCRIBED', 'STOPPED']) eq(decide(ev, enrolledRow({ 'Current Status': st })).update['Current Status'], st, st);
});
test('sequence progress statuses: step1 CONTACTED, step2 FOLLOW_UP_PENDING, step3 COMPLETED; step never goes backwards', () => {
  const st = (step, prev) => decide(norm({ event_type: 'email_sent', lead_email: 'alex@fairwaygolf.co.uk', step }), enrolledRow({ 'Current Status': 'ENROLLED', 'Last Step Sent': prev || '' })).update;
  eq(st(1)['Current Status'], 'CONTACTED'); eq(st(2)['Current Status'], 'FOLLOW_UP_PENDING'); eq(st(3)['Current Status'], 'COMPLETED');
  eq(st(1, '2')['Last Step Sent'], '2');
});
test('9 unsubscribe -> UNSUBSCRIBED + suppression row; preserves earlier reply info', () => {
  const ev = norm({ event_type: 'lead_unsubscribed', lead_email: 'alex@fairwaygolf.co.uk', timestamp: '2026-01-08T08:00:00Z' });
  const d = decide(ev, enrolledRow({ 'Reply Date': 'X', 'Reply Meta': 'Y' }));
  eq(d.action, 'UNSUBSCRIBE'); eq(d.update['Current Status'], 'UNSUBSCRIBED'); eq(d.suppress['Email'], 'alex@fairwaygolf.co.uk'); eq([d.update['Reply Date'], d.update['Reply Meta']], ['X', 'Y']);
});
test('9 unsubscribe for an address not in the Leads tab is still suppressed', () => {
  const d = decide(norm({ event_type: 'lead_unsubscribed', lead_email: 'ghost@nowhere.co.uk' }), null);
  eq(d.action, 'UNSUBSCRIBE'); eq(d.found, false); eq(d.suppress['Email'], 'ghost@nowhere.co.uk');
});
test('9 reply asking to stop is treated as unsubscribe (keyword guard, not AI)', () => {
  for (const t of ['unsubscribe', 'Please take me off this list', 'stop emailing me', 'opt out', 'do not contact me']) {
    const ev = norm({ event_type: 'reply_received', lead_email: 'a@b.co', reply_text: t }); eq(ev.optOutIntent, true, t);
  }
  eq(norm({ event_type: 'reply_received', lead_email: 'a@b.co', reply_text: 'Yes, send me your wholesale prices' }).optOutIntent, false);
});
test('9 unsubscribed contact is then rejected by qualification AND enrollment (no re-enrolment)', () => {
  const supp = [{ Email: 'alex@fairwaygolf.co.uk', Reason: 'UNSUBSCRIBED' }];
  eq(qualify([row({})], [], supp)[0].intake['Intake Status'], 'SUPPRESSED');
  eq(sel([lead()], {}, supp)[0].action, 'blocked');
});
test('bounce -> STOPPED + suppressed; out-of-office / interest labels only store metadata', () => {
  const b = decide(norm({ event_type: 'email_bounced', lead_email: 'alex@fairwaygolf.co.uk' }), enrolledRow());
  eq(b.update['Current Status'], 'STOPPED'); eq(b.suppress['Reason'], 'BOUNCED');
  const m = decide(norm({ event_type: 'auto_reply_received', lead_email: 'alex@fairwaygolf.co.uk' }), enrolledRow());
  eq(m.action, 'META'); ok(!('Current Status' in m.update), 'must not change status');
  eq(decide(norm({ event_type: 'lead_interested', lead_email: 'zz@x.co' }), null).action, 'NONE');
  eq(decide(norm({ event_type: 'something_else', lead_email: 'a@b.co' }), enrolledRow()).action, 'NONE');
});

// ───────────── 11-13. errors & heartbeat ─────────────
console.log('\n[11-13] Error handler & heartbeat (LXG-99 / LXG-06)');
test('11/12 error handler captures workflow, execution id, failed node, message, lead id; scrubs secrets', () => {
  const p = { execution: { id: '991', url: 'https://n8n.example/execution/991', lastNodeExecuted: 'Instantly: Add Lead', error: { message: '401 Bearer abcdef123456 [lead:LXG-9z] unauthorized' } }, workflow: { id: 'w', name: 'LXG - 03 - Instantly Enrollment' } };
  const o = outJson(runNode('lxg-99', 'Format Error', { input: [p] }))[0];
  eq([o.row['Workflow'], o.row['Execution ID'], o.row['Failed Node'], o.row['Lead ID']], ['LXG - 03 - Instantly Enrollment', '991', 'Instantly: Add Lead', 'LXG-9z']);
  ok(!/abcdef123456/.test(JSON.stringify(o)), 'secret leaked'); eq(o.sendAlert, true); ok(/execution\/991/.test(o.html));
});
test('12 repeated identical failures are throttled (email once, still logged each time)', () => {
  const sd = {}; const p = { execution: { id: '1', lastNodeExecuted: 'X', error: { message: 'boom' } }, workflow: { name: 'LXG - 04 - Reply Handler' } };
  eq(outJson(runNode('lxg-99', 'Format Error', { input: [p], staticData: sd }))[0].sendAlert, true);
  const second = outJson(runNode('lxg-99', 'Format Error', { input: [p], staticData: sd }))[0]; eq(second.sendAlert, false); ok(second.row['Error Message']);
});
test('11 error handler: sheet log runs first and cannot block the email; email failure stays visible; no loop back', () => {
  const wf = byPrefix('lxg-99'); eq(wf.connections['Format Error'].main[0].map(c => c.node), ['Log to Errors tab']);
  eq(wf.connections['Log to Errors tab'].main[0].map(c => c.node), ['Restore Alert']);
  eq(wf.connections['Restore Alert'].main[0].map(c => c.node), ['Send alert?']);
  eq(wf.nodes.find(n => n.name === 'Log to Errors tab').onError, 'continueRegularOutput');
  ok(!wf.nodes.find(n => n.name === 'Send Error Email').onError, 'mail failure must not be swallowed');
  ok(!JSON.stringify(wf.connections).includes('Error Trigger","type":"main","index":0}]]},"Error'), 'no loop');
});
test('heartbeat written before any alert email; alert failure cannot skip the heartbeat', () => {
  const c = byPrefix('lxg-06').connections;
  eq(c['Evaluate Health'].main[0].map(x => x.node), ['Write Heartbeat']); eq(c['Write Heartbeat'].main[0].map(x => x.node), ['Alert Gate']);
});
const ALL = ['LXG - 01 - Apollo Lead Intake', 'LXG - 02 - Lead Qualification', 'LXG - 03 - Instantly Enrollment', 'LXG - 04 - Reply Handler', 'LXG - 05 - Reporting', 'LXG - 06 - Health Monitor', 'LXG - 99 - Error Handler'];
const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();
function health({ wfs, succ, fail, prev = [] }) {
  const w = wfs || ALL.map(name => ({ id: 'id-' + name.slice(6, 8), name, active: true }));
  const exe = (arr, f, tag) => arr.map(x => { const at = f(x); return { data: at ? [{ id: tag + x.id, workflowId: x.id, stoppedAt: at }] : [] }; });
  const rows = outJson(runNode('lxg-06', 'Evaluate Health', { env: {}, nodes: {
    'Filter LXG Workflows': w, 'Get Last Success': exe(w, succ, 's'), 'Get Last Error': exe(w, x => fail && fail(x), 'f'), 'Read Heartbeat': prev } }));
  const ctl = outJson(runNode('lxg-06', 'Alert Gate', { nodes: { 'Evaluate Health': rows } }))[0];
  return { rows, ctl };
}
const okSucc = x => hoursAgo(1);
test('13 healthy system -> all OK, no alert', () => { const h = health({ succ: okSucc }); ok(h.rows.every(r => r.Health === 'OK'), JSON.stringify(h.rows.map(r => r.Health))); eq(h.ctl.sendAlert, false); });
test('13 heartbeat failure: stale workflow (no success within expected window) -> STALE + alert', () => {
  const h = health({ succ: x => x.name.includes('03') ? hoursAgo(10) : hoursAgo(1) });
  eq(h.rows.find(r => r.Workflow.includes('03')).Health, 'STALE'); eq(h.ctl.sendAlert, true); ok(/Enrollment/.test(h.ctl.html));
});
test('13 failing workflow (last run failed after last success) -> FAILING + alert', () => {
  const h = health({ succ: x => hoursAgo(5), fail: x => x.name.includes('04') ? hoursAgo(1) : null });
  eq(h.rows.find(r => r.Workflow.includes('04')).Health, 'FAILING'); eq(h.ctl.sendAlert, true);
});
test('13 inactive workflow and missing workflow are flagged', () => {
  const wfs = ALL.slice(0, 6).map(name => ({ id: 'id-' + name.slice(6, 8), name, active: !name.includes('02') }));
  const h = health({ wfs, succ: okSucc });
  eq(h.rows.find(r => r.Workflow.includes('02')).Health, 'INACTIVE'); eq(h.rows.find(r => r.Workflow.includes('99')).Health, 'MISSING');
});
test('13 error handler is not flagged for being inactive (error-trigger workflows run while inactive)', () => {
  const wfs = ALL.map(name => ({ id: 'id-' + name.slice(6, 8), name, active: !name.includes('99') }));
  eq(health({ wfs, succ: okSucc }).rows.find(r => r.Workflow.includes('99')).Health, 'OK');
});
test('13 alert throttling: same issue is not re-emailed within 24h', () => {
  const sc = x => x.name.includes('03') ? hoursAgo(10) : hoursAgo(1);
  const prev = [{ Workflow: 'LXG - 03 - Instantly Enrollment', Health: 'STALE', 'Last Alerted': hoursAgo(2) }];
  eq(health({ succ: sc, prev }).ctl.sendAlert, false);
  eq(health({ succ: sc, prev: [{ ...prev[0], 'Last Alerted': hoursAgo(30) }] }).ctl.sendAlert, true);
});
test('13 never-ran workflows are a warning, not a critical alert', () => {
  const h = health({ succ: x => x.name.includes('01') ? null : hoursAgo(1) });
  eq(h.rows.find(r => r.Workflow.includes('01')).Health, 'NEVER_RAN'); eq(h.ctl.sendAlert, false);
});

// ───────────── reporting ─────────────
console.log('\n[05] Reporting (LXG-05)');
test('weekly report computes counts, reply rate, health; survives Instantly being unreachable', () => {
  const iso = h => hoursAgo(h);
  const leads = [
    { 'Lead ID': '1', 'Date Added': iso(10), 'Date Enrolled': iso(8), 'Last Email Sent': iso(6), 'Current Status': 'CONTACTED' },
    { 'Lead ID': '2', 'Date Added': iso(10), 'Date Enrolled': iso(8), 'Last Email Sent': iso(6), 'Reply Date': iso(2), 'Current Status': 'REPLIED' },
    { 'Lead ID': '3', 'Date Added': iso(500), 'Last Email Sent': iso(400), 'Current Status': 'UNSUBSCRIBED', 'Last Updated': iso(3) },
    { 'Lead ID': '4', 'Date Added': iso(9), 'Current Status': 'ERROR' }];
  const r = outJson(runNode('lxg-05', 'Build Report', { env: {}, nodes: {
    'Read Leads': leads, 'Read Heartbeat': [{ Workflow: 'LXG - 03', Health: 'STALE', 'Last Success': iso(30) }], 'Read Errors': [{ Timestamp: iso(2) }, { Timestamp: iso(900) }],
    'Instantly Campaigns': [{ error: 'unreachable' }], 'Instantly Analytics': [{ error: 'unreachable' }] } }))[0];
  ok(/Leads added<\/td><td[^>]*><b>3<\/b>/.test(r.html), 'leads added'); ok(/Replies<\/td><td[^>]*><b>1<\/b>/.test(r.html)); ok(/Errors logged<\/td><td[^>]*><b>1<\/b>/.test(r.html));
  ok(/ATTENTION: LXG - 03 \(STALE\)/.test(r.html)); ok(/unavailable/.test(r.html));
  ok(/Reply rate \(all time\)<\/td><td[^>]*><b>33.3%<\/b>/.test(r.html), 'reply rate');
});
test('report uses Instantly analytics + campaign status when available', () => {
  const r = outJson(runNode('lxg-05', 'Build Report', { env: {}, nodes: { 'Read Leads': [], 'Read Heartbeat': [], 'Read Errors': [],
    'Instantly Campaigns': [{ items: [{ name: 'LXG UK Golf', status: 1 }, { name: 'Old', status: 2 }] }], 'Instantly Analytics': [{ emails_sent_count: 40 }, { emails_sent_count: 2 }] } }))[0];
  ok(/LXG UK Golf: Active/.test(r.html)); ok(/Active campaigns<\/td><td[^>]*><b>1<\/b>/.test(r.html)); ok(/per Instantly\)<\/td><td[^>]*><b>42<\/b>/.test(r.html));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
