// LXG-03 · Dry run: show what WOULD be enrolled. Nothing is sent, nothing is written.
const d = $input.first().json;
console.log(`DRY RUN — would enroll ${d.count} lead(s)`);
return [{ json: d }];
