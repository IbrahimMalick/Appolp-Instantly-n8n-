#!/usr/bin/env bash
# Send one sample Instantly webhook payload to your n8n (SANDBOX data only; no email is sent by this).
#   N8N_HOST=n8n.example.com INSTANTLY_WEBHOOK_SECRET=... tests/send-sample-webhook.sh reply_received
# Use /webhook-test/ instead of /webhook/ while the workflow is open in the editor with "Listen for test event".
set -euo pipefail
name="${1:?usage: $0 <fixture name, e.g. reply_received>}"
base="${N8N_BASE_URL:-https://${N8N_HOST:?set N8N_HOST or N8N_BASE_URL}}"
curl -sS -X POST "${base}/${WEBHOOK_PATH:-webhook}/lxg-instantly-events?token=${INSTANTLY_WEBHOOK_SECRET:?set INSTANTLY_WEBHOOK_SECRET}" \
  -H 'Content-Type: application/json' --data @"$(dirname "$0")/fixtures/webhooks/${name}.json"
echo
