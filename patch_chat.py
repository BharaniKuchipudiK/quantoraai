import sys

file_path = '/Users/bharanik/.gemini/antigravity/scratch/quantrora/api/chat.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

helper_function = """
// Background telemetry logging to Supabase
function logTelemetry(modelId: string, latencyMs: number, textLength: number, provider: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  
  // Estimate tokens (roughly 4 chars per token)
  const tokens = Math.ceil(textLength / 4);
  
  fetch(`${supabaseUrl}/rest/v1/telemetry`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      model_id: modelId,
      latency_ms: latencyMs,
      tokens_generated: tokens,
      provider: provider
    })
  }).catch(err => console.error("Telemetry error:", err));
}
"""

# Insert the helper function before export default async function handler
for i, line in enumerate(lines):
    if line.startswith('export default async function handler'):
        lines.insert(i, helper_function + "\n")
        break

# Inject logging into OpenRouter success
for i, line in enumerate(lines):
    if 'return res.status(200).json({' in line and 'provider: `OpenRouter' in lines[i+2]:
        # Wait, the response object spans multiple lines.
        # It's better to insert right before the return statement.
        pass

# Actually, it's easier to find the lines that assign latencyMs and insert the logTelemetry call right after.
# OpenRouter:
# const latencyMs = Date.now() - startTime;
# logTelemetry(modelId, latencyMs, reply.length, "OpenRouter");

for i, line in enumerate(lines):
    if 'const latencyMs = Date.now() - startTime;' in line:
        if 'reply' in lines[i-1]: # OpenRouter block
            lines.insert(i+1, '            logTelemetry(modelId, latencyMs, reply.length, "OpenRouter");\n')
        elif 'result' in lines[i-1]: # Gemini block
            lines.insert(i+1, '        logTelemetry(result.usedModel, latencyMs, result.text.length, "Gemini");\n')

with open(file_path, 'w') as f:
    f.writelines(lines)

print("Success")
