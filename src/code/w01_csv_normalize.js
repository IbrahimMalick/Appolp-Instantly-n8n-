// LXG-01 · CSV fallback adapter. Accepts an Apollo contact export (or any CSV using
// similar headers). Header matching ignores case, spaces and punctuation.
const s = v => (v === null || v === undefined) ? '' : String(v).trim();
const key = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const host = u => s(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

const ALIASES = {
  first_name: ['firstname'],
  last_name: ['lastname'],
  full_name: ['fullname', 'name'],
  job_title: ['title', 'jobtitle'],
  company_name: ['company', 'companyname', 'organization', 'companynameforemails'],
  company_domain: ['companydomain', 'domain', 'primarydomain'],
  website: ['website', 'companywebsite', 'websiteurl'],
  email: ['email', 'emailaddress', 'workemail'],
  email_verification_status: ['emailstatus', 'emailverificationstatus', 'verificationstatus'],
  industry: ['industry'],
  company_type: ['companytype', 'keywords', 'companykeywords'],
  country: ['country', 'companycountry'],
  city: ['city', 'companycity'],
  employee_count: ['employees', 'employeecount', 'numemployees', 'estimatednumemployees'],
  apollo_id: ['apollocontactid', 'apolloid', 'apolloaccountid']
};

const out = [];
for (const it of $input.all()) {
  const row = {};
  for (const [k, v] of Object.entries(it.json)) row[key(k)] = v;
  const pick = f => { for (const a of ALIASES[f]) if (row[a] !== undefined && s(row[a]) !== '') return s(row[a]); return ''; };
  const first = pick('first_name'), last = pick('last_name');
  const website = pick('website');
  if (!first && !last && !pick('email') && !pick('company_name')) continue;   // blank line
  out.push({ json: {
    source: 'csv',
    apollo_id: pick('apollo_id'),
    first_name: first,
    last_name: last,
    full_name: pick('full_name') || `${first} ${last}`.trim(),
    job_title: pick('job_title'),
    company_name: pick('company_name'),
    company_domain: (pick('company_domain') || host(website)).toLowerCase(),
    website,
    email: pick('email').toLowerCase(),
    email_verification_status: pick('email_verification_status').toLowerCase(),
    industry: pick('industry'),
    company_type: pick('company_type').slice(0, 200),
    country: pick('country'),
    city: pick('city'),
    employee_count: pick('employee_count')
  } });
}
return out;
