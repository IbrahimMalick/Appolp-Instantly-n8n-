// LXG-02 · After the Leads append succeeds, emit the Intake updates for the qualified rows.
// (Rejected rows take a separate branch and are updated immediately.)
return $('Qualify & Dedupe').all().filter(i => i.json.lead).map(i => ({ json: { intake: i.json.intake } }));
