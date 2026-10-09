// LXG-03 · If EVERY enrollment in this run failed it is almost certainly systemic
// (bad API key, campaign missing, Instantly down) -> raise, so the Error Handler emails the owner.
const attempted = $('Select Batch').all().filter(i => i.json.action === 'enroll').length;
const failed = $('Map Failure').all().length;
if (attempted > 0 && failed === attempted) {
  throw new Error(`Instantly enrollment failed for all ${attempted} lead(s) in this run. First error: ${$('Map Failure').first().json['Error Status']}`);
}
return [{ json: { attempted, failed } }];
