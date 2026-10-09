// LXG-01 · Build Intake rows. Skips anything already in the Intake tab, caps the run size.
// NOTE: this is NOT the dedupe/qualification step (that is LXG-02); this only prevents
// re-importing the exact same source record over and over.
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const cfg = $('Config').first().json;
const existing = new Set($('Read Existing Intake').all().map(i => i.json['Intake ID']).filter(Boolean));
const now = new Date().toISOString();
const rows = [];
let skipped = 0;

for (const { json: l } of $input.all()) {
  const natural = l.apollo_id || l.email || `${l.company_domain}|${l.full_name}`.toLowerCase();
  const id = 'IN-' + hash(`${l.source}|${natural}`);
  if (existing.has(id)) { skipped++; continue; }
  existing.add(id);
  if (rows.length >= cfg.maxPerRun) { skipped++; continue; }
  rows.push({ json: {
    'Intake ID': id, 'Date Added': now, 'Source': l.source, 'Apollo ID': l.apollo_id,
    'First Name': l.first_name, 'Last Name': l.last_name, 'Full Name': l.full_name,
    'Job Title': l.job_title, 'Company': l.company_name, 'Domain': l.company_domain,
    'Website': l.website, 'Email': l.email, 'Email Verification Status': l.email_verification_status,
    'Industry': l.industry, 'Company Type': l.company_type, 'Country': l.country, 'City': l.city,
    'Employee Count': l.employee_count, 'Intake Status': 'PENDING', 'Reason': '', 'Processed At': ''
  } });
}
console.log(`Intake: ${rows.length} new rows, ${skipped} skipped (already ingested or over per-run cap)`);
return rows;
