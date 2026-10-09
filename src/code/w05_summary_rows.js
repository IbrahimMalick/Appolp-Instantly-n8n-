// LXG-05 · One item per Summary row so the Sheets node can upsert them.
return $('Build Report').first().json.summaryRows.map(r => ({ json: r }));
