// LXG-01 · Apollo: drop people we already ingested BEFORE spending enrichment credits,
// then split the rest into batches of 10 (bulk-match limit).
const res = $input.first().json || {};
const people = res.people || res.contacts || [];
const cfg = $('Config').first().json;
const sd = $getWorkflowStaticData('global');

const known = new Set(
  $('Read Existing Intake').all().map(i => String(i.json['Apollo ID'] || '')).filter(Boolean)
);

// advance / reset the search page (persisted only on production runs)
sd.apolloPage = people.length ? cfg.page + 1 : 1;

const fresh = people.filter(p => p && p.id && !known.has(String(p.id))).slice(0, cfg.maxPerRun);
const batches = [];
for (let i = 0; i < fresh.length; i += 10) batches.push(fresh.slice(i, i + 10));
console.log(`Apollo search: ${people.length} returned, ${fresh.length} new, ${batches.length} enrichment batches`);
return batches.map(b => ({ json: { details: b.map(p => ({ id: p.id })) } }));
