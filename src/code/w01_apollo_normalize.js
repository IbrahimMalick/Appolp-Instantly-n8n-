// LXG-01 · Apollo adapter output -> canonical lead shape.
// Only maps fields Apollo returns; anything missing stays blank (qualification decides).
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const host = u => s(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

const out = [];
for (const it of $input.all()) {
  for (const m of (it.json.matches || it.json.people || [])) {
    if (!m) continue;
    const org = m.organization || {};
    const first = s(m.first_name), last = s(m.last_name);
    out.push({ json: {
      source: 'apollo_api',
      apollo_id: s(m.id),
      first_name: first,
      last_name: last,
      full_name: s(m.name) || `${first} ${last}`.trim(),
      job_title: s(m.title),
      company_name: s(org.name || m.organization_name),
      company_domain: s(org.primary_domain) || host(org.website_url),
      website: s(org.website_url),
      email: s(m.email).toLowerCase(),
      email_verification_status: s(m.email_status).toLowerCase(),
      industry: s(org.industry),
      company_type: [].concat(org.keywords || []).slice(0, 8).join(', ').slice(0, 200),
      country: s(m.country || org.country),
      city: s(m.city || org.city),
      employee_count: s(org.estimated_num_employees)
    } });
  }
}
return out;
