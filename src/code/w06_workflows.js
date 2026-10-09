// LXG-06 · Keep only the LXG workflows from the n8n API response.
const data = ($input.first().json.data) || [];
const api = $env.N8N_INTERNAL_API_URL || 'http://localhost:5678/api/v1';
return data.filter(w => /^LXG - /.test(w.name)).map(w => ({ json: {
  id: w.id, name: w.name, active: !!w.active,
  urlSuccess: `${api}/executions?limit=1&status=success&workflowId=${w.id}`,
  urlError: `${api}/executions?limit=1&status=error&workflowId=${w.id}`
} }));
