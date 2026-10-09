# scripts/

| File | Purpose |
|---|---|
| `import-workflows.sh` | Import `workflows/*.json` into the running Docker n8n (workflows arrive inactive). |
| `link_error_workflow.py` | Sets `LXG - 99 - Error Handler` as error workflow of all other `LXG - *` workflows via the n8n public API (idempotent, `--dry-run` supported). Needs `N8N_BASE_URL`, `N8N_API_KEY`. |
| `generate_workflows.py` | Rebuilds `workflows/*.json` from `src/code/*.js` + `src/schema.json`. Use if you edit Code-node sources in `src/`. If you edit workflows in the n8n UI instead, re-export the JSON and copy the code back into `src/code` (or stop using the generator). |
| `build_sheet_template.py` | Rebuilds `sheet-template/LXG-Outreach-Tracker.xlsx` (needs `pip install openpyxl`). |

After changing Code nodes: `python3 scripts/generate_workflows.py && node tests/run-logic-tests.js`.
