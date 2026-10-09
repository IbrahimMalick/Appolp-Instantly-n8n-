#!/usr/bin/env node
/*
 * OPTIONAL developer check: validates every node in workflows/*.json against the node definitions
 * shipped with a locally installed n8n (operation names, parameter keys, typeVersions).
 *
 *   mkdir /tmp/n8n-check && cd /tmp/n8n-check && npm init -y && npm i n8n@<your N8N_VERSION>
 *   NODE_PATH=/tmp/n8n-check/node_modules node <repo>/tests/validate-with-n8n.js
 *
 * Needs no credentials and makes no network calls.
 */
const fs = require('fs'), path = require('path');
const base = path.dirname(require.resolve('n8n-nodes-base/package.json'));
const { NodeHelpers } = require('n8n-workflow');
const types = require(path.join(base, 'dist/types/nodes.json'));   // node descriptions incl. all versions

let bad = 0, checked = 0;
const dir = path.join(__dirname, '..', 'workflows');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const wf = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const n of wf.nodes) {
    const short = n.type.replace('n8n-nodes-base.', '');
    const desc = types.find(k => k.name === short && [].concat(k.version).includes(n.typeVersion));
    if (!desc) {
      const any = types.filter(k => k.name === short);
      console.log(any.length ? `✗ ${f} :: ${n.name}: typeVersion ${n.typeVersion} not supported (${any.map(a => [].concat(a.version)).flat()})` : `✗ ${f} :: ${n.name}: unknown node type ${n.type}`);
      bad++; continue;
    }
    checked++;
    const out = NodeHelpers.getNodeParameters(desc.properties, n.parameters, true, false, n, desc);
    const given = Object.keys(n.parameters);
    const kept = out ? Object.keys(out) : [];
    const dropped = given.filter(k => !kept.includes(k));
    if (dropped.length) { console.log(`✗ ${f} :: ${n.name}: parameters not valid for this node/operation: ${dropped.join(', ')}`); bad++; }
    // option-valued fields must be one of the allowed options
    for (const p of desc.properties) {
      if (p.type === 'options' && NodeHelpers.displayParameter(out, p, n, desc) && n.parameters[p.name] !== undefined && typeof n.parameters[p.name] === 'string' && !String(n.parameters[p.name]).startsWith('=')) {
        const allowed = (p.options || []).map(o => o.value);
        if (allowed.length && !allowed.includes(n.parameters[p.name])) { console.log(`✗ ${f} :: ${n.name}: ${p.name}="${n.parameters[p.name]}" not in [${allowed}]`); bad++; }
      }
    }
  }
}
console.log(bad ? `\n${bad} problem(s) (${checked} nodes checked)` : `\nAll ${checked} nodes valid against installed n8n definitions`);
process.exit(bad ? 1 : 0);
