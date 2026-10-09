#!/usr/bin/env bash
# Import (or re-import) all LXG workflows into the running n8n container.
# Imported workflows are INACTIVE — activate them in the UI after credentials are set (SETUP.md step 6).
# Re-importing overwrites a workflow of the same id; workflows exported from this repo have no id, so n8n
# creates NEW copies each time — delete old copies first if you re-import.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
echo
echo "Next: python3 scripts/link_error_workflow.py   (sets LXG - 99 as the error workflow of the others)"
