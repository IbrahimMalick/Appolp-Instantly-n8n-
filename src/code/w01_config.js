// LXG-01 · Config — EDIT THIS NODE to change Apollo targeting or run size.
// Everything operational (mode, caps) comes from environment variables so the
// owner never has to touch code for routine changes.
const mode = String($env.LEAD_SOURCE_MODE || 'csv').toLowerCase();      // 'apollo_api' | 'csv'
const maxPerRun = parseInt($env.APOLLO_MAX_PER_RUN || '50', 10);        // ramp-up control
const sd = $getWorkflowStaticData('global');
const page = parseInt(sd.apolloPage || '1', 10);

return [{ json: {
  mode,
  maxPerRun,
  page,
  // ---- Apollo "People API Search" parameters (used only when mode = apollo_api).
  // Parameter names follow Apollo's public docs; verify against your plan (see docs/apollo-setup.md).
  search: {
    person_titles: [
      'owner', 'founder', 'co-founder', 'director', 'managing director',
      'buyer', 'head of buying', 'purchasing manager', 'retail buyer', 'general manager'
    ],
    person_locations: ['United Kingdom'],
    q_organization_keyword_tags: [
      'golf', 'golf pro shop', 'country club', 'private members club', 'equestrian',
      'motorsport', 'boutique fitness', 'premium gym', 'gift shop', 'hotel gift shop',
      'yacht club', 'sailing club', 'sporting goods', 'menswear', 'lifestyle boutique'
    ],
    organization_num_employees_ranges: ['1,10', '11,50', '51,200'],
    page,
    per_page: Math.min(maxPerRun, 100)
  }
} }];
