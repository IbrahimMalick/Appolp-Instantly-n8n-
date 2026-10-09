// LXG-02 · Qualify + deduplicate pending Intake rows.
// Output: one item per Intake row -> { intake: {...columns to write back}, lead: {...Leads row} | null }
// Rules live in the CONFIG block below — edit there to change targeting.

// ============================== CONFIG ==============================
const ALLOWED_COUNTRIES = (($env.ALLOWED_COUNTRIES || 'united kingdom,uk,great britain,gb,england,scotland,wales,northern ireland'))
  .toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const ALLOWED_EMAIL_STATUS = (($env.ALLOWED_EMAIL_STATUS || 'verified')).toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const REQUIRE_FIRST_NAME = String($env.REQUIRE_FIRST_NAME || 'true') === 'true';

const TITLE_INCLUDE = /\b(owner|co-?owner|founder|co-?founder|proprietor|director|buyer|head of buying|purchasing|procurement)\b/i;
const TITLE_GM = /\bgeneral manager\b/i;
const GM_SEGMENTS = ['clubs', 'golf', 'fitness', 'hospitality_gift', 'sailing'];   // "General Manager where appropriate"
const TITLE_EXCLUDE = /(assistant|\bintern\b|trainee|student|junior|apprentice|non-?executive|\b(finance|financial|hr|human resources|it|technology|marketing|legal|compliance|digital|sales|engineering|creative)\s+(director|manager)\b|director of (finance|hr|human resources|it|technology|marketing|legal|compliance|digital|sales|engineering))/i;

// First match wins. Matched against company + industry + keywords + domain.
const SEGMENTS = [
  ['clubs',            /country club|members'? club|private club|social club|polo club/],
  ['golf',             /\bgolf|pro ?shop/],
  ['equestrian',       /equestrian|\bhorse|\bequine|saddl|riding/],
  ['motorsport',       /motorsport|motor sport|\bracing\b|karting|motorcycle/],
  ['sailing',          /yacht|sailing|marina|\bmarine\b|rowing club/],
  ['fitness',          /\b(gym|fitness|pilates|yoga|crossfit|health club)\b/],
  ['hospitality_gift', /gift shop|\bgifts?\b|souvenir|tourist|visitor|\bhotel|resort|\bspa\b/],
  ['sporting_goods',   /sporting goods|sports retail|sports shop|sports store|outdoor/],
  ['menswear',         /menswear|men'?s wear|gentlemen|tailor|outfitter|clothier|haberdash/],
  ['lifestyle_retail', /lifestyle|boutique|concept store|premium retail|independent retail/]
];
// Anything matching this is rejected outright (fast fashion, discount, supermarkets, mass-market).
const EXCLUDE_COMPANY = new RegExp(
  '(fast ?fashion|discount|supermarket|hypermarket|budget|pound ?(shop|land|stretcher)|dollar|wholesale club|mass[- ]market|' +
  '\\b(primark|shein|boohoo|asos|prettylittlething|temu|asda|tesco|sainsbury|aldi|lidl|morrisons|poundland|b&m|matalan|' +
  'sports ?direct|jd sports|argos|walmart|costco|h&m|zara|next plc|new look|tk ?maxx)\\b)', 'i');
const GENERIC_LOCAL = /^(info|sales|hello|hi|admin|office|enquiries|enquiry|contact|support|team|mail|reception|bookings?|shop|store|accounts?|hr|jobs|careers|press|marketing|webmaster|orders|service)$/i;
// ====================================================================

function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const low = v => s(v).toLowerCase();
const domainOf = r => low(r['Domain']) || low(r['Email']).split('@')[1] || '';
const nameKey = (domain, first, last) => `${domain}|${low(first)} ${low(last)}`.trim();
const isGeneric = email => GENERIC_LOCAL.test(email.split('@')[0] || '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const nowIso = new Date().toISOString();
const pending = $('Read Pending Intake').all().map(i => i.json).filter(r => r['Intake ID']);
const leads = $('Read Leads').all().map(i => i.json).filter(r => r['Lead ID'] || r['Email']);
const supp = $('Read Suppression').all().map(i => i.json).filter(r => r['Email'] || r['Domain']);

const leadById = new Map(leads.map(r => [r['Lead ID'], r]));
const emails = new Set(leads.map(r => low(r['Email'])).filter(Boolean));
const names = new Set(leads.map(r => nameKey(domainOf(r), r['First Name'], r['Last Name'])));
const namedDomains = new Set(leads.filter(r => r['Email'] && !isGeneric(low(r['Email']))).map(domainOf));
const suppEmails = new Set(supp.map(r => low(r['Email'])).filter(Boolean));
const suppDomains = new Set(supp.map(r => low(r['Domain'])).filter(Boolean));

function segmentOf(r) {
  const text = low(`${r['Company']} ${r['Industry']} ${r['Company Type']} ${r['Domain']}`);
  for (const [seg, re] of SEGMENTS) if (re.test(text)) return seg;
  return '';
}

// Returns { ok, reason, segment }
function evaluate(r) {
  const email = low(r['Email']);
  if (!email) return { ok: false, reason: 'MISSING_EMAIL' };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'INVALID_EMAIL_FORMAT' };
  const domain = domainOf(r);
  if (suppEmails.has(email) || suppDomains.has(domain)) return { ok: false, status: 'SUPPRESSED', reason: 'ON_SUPPRESSION_LIST' };
  if (emails.has(email)) return { ok: false, status: 'DUPLICATE', reason: 'DUPLICATE_EMAIL' };
  if (names.has(nameKey(domain, r['First Name'], r['Last Name'])) && low(r['First Name'])) return { ok: false, status: 'DUPLICATE', reason: 'DUPLICATE_DOMAIN_AND_NAME' };
  if (!ALLOWED_COUNTRIES.includes(low(r['Country']))) return { ok: false, reason: `COUNTRY_NOT_ALLOWED:${s(r['Country']) || 'blank'}` };
  if (!ALLOWED_EMAIL_STATUS.includes(low(r['Email Verification Status']))) return { ok: false, reason: `EMAIL_NOT_VERIFIED:${s(r['Email Verification Status']) || 'blank'}` };
  const blob = `${r['Company']} ${r['Industry']} ${r['Company Type']} ${domain}`;
  if (EXCLUDE_COMPANY.test(blob)) return { ok: false, reason: 'EXCLUDED_COMPANY_TYPE' };
  const segment = segmentOf(r);
  if (!segment) return { ok: false, reason: 'NO_TARGET_SEGMENT' };
  const title = s(r['Job Title']);
  if (!title) return { ok: false, reason: 'MISSING_JOB_TITLE' };
  if (TITLE_EXCLUDE.test(title)) return { ok: false, reason: 'TITLE_EXCLUDED' };
  const titleOk = TITLE_INCLUDE.test(title) || (TITLE_GM.test(title) && GM_SEGMENTS.includes(segment));
  if (!titleOk) return { ok: false, reason: TITLE_GM.test(title) ? 'GENERAL_MANAGER_NOT_APPROPRIATE_FOR_SEGMENT' : 'TITLE_NOT_DECISION_MAKER' };
  if (isGeneric(email) && namedDomains.has(domain)) return { ok: false, reason: 'GENERIC_EMAIL_NAMED_CONTACT_AVAILABLE' };
  if (REQUIRE_FIRST_NAME && !s(r['First Name'])) return { ok: false, reason: 'MISSING_FIRST_NAME' };
  return { ok: true, segment };
}

function leadRow(r, segment) {
  const email = low(r['Email']);
  return {
    'Lead ID': 'LXG-' + hash(email), 'First Name': s(r['First Name']), 'Last Name': s(r['Last Name']),
    'Job Title': s(r['Job Title']), 'Company': s(r['Company']), 'Domain': domainOf(r), 'Email': email,
    'Industry': s(r['Industry']), 'Country': s(r['Country']), 'Apollo ID': s(r['Apollo ID']),
    'Instantly ID': '', 'Campaign': '', 'Date Added': s(r['Date Added']) || nowIso,
    'Date Enrolled': '', 'Last Email Sent': '', 'Reply Date': '', 'Current Status': 'QUALIFIED',
    'Error Status': '', 'Last Updated': nowIso, 'Website': s(r['Website']), 'Company Type': s(r['Company Type']),
    'City': s(r['City']), 'Employee Count': s(r['Employee Count']),
    'Email Verification Status': s(r['Email Verification Status']), 'Source': s(r['Source']),
    'Segment': segment, 'Last Step Sent': '', 'Reply Meta': '', 'Ack Sent': '', 'Retry Count': '0', 'Stop Reason': ''
  };
}

// Named people first, generic mailboxes last, so "named decision-maker wins" is deterministic.
const ordered = [...pending.filter(r => !isGeneric(low(r['Email']))), ...pending.filter(r => isGeneric(low(r['Email'])))];
const out = [];
for (const r of ordered) {
  const id = r['Intake ID'];
  const email = low(r['Email']);
  const lid = email ? 'LXG-' + hash(email) : '';

  // Crash-recovery: a previous run appended the lead but failed before updating Intake.
  if (lid && leadById.has(lid) && s(leadById.get(lid)['Date Added']) === s(r['Date Added'])) {
    out.push({ json: { intake: { 'Intake ID': id, 'Intake Status': 'QUALIFIED', 'Reason': 'RECOVERED_ALREADY_IN_LEADS', 'Processed At': nowIso }, lead: null } });
    continue;
  }
  const v = evaluate(r);
  if (v.ok) {
    const lead = leadRow(r, v.segment);
    emails.add(email); names.add(nameKey(domainOf(r), r['First Name'], r['Last Name']));
    if (!isGeneric(email)) namedDomains.add(domainOf(r));
    out.push({ json: { intake: { 'Intake ID': id, 'Intake Status': 'QUALIFIED', 'Reason': `SEGMENT:${v.segment}`, 'Processed At': nowIso }, lead } });
  } else {
    out.push({ json: { intake: { 'Intake ID': id, 'Intake Status': v.status || 'REJECTED', 'Reason': v.reason, 'Processed At': nowIso }, lead: null } });
  }
}
const q = out.filter(o => o.json.lead).length;
console.log(`Qualification: ${pending.length} pending -> ${q} qualified, ${pending.length - q} not qualified`);
return out;
