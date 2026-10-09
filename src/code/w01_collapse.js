// LXG-01 · Collapse the Intake rows read from the sheet into ONE item that carries the run config forward,
// so downstream nodes run once (not once per existing row).
return [{ json: $('Config').first().json }];
