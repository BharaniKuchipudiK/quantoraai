import { OFFICE_OUTPUT_JSON_SCHEMAS } from './office-output-schemas.js';
import { PRESENTATION_TRANSPORT_JSON_SCHEMA } from './presentation-transport.js';

const PROVIDERS = new Set(['anthropic', 'gemini', 'openrouter']);
const FORMATS = new Set(['powerpoint', 'word', 'excel']);

function walkSchema(node, visitor, depth = 0) {
  if (!node || typeof node !== 'object') return;
  visitor(node, depth);
  if (node.properties) Object.values(node.properties).forEach((child) => walkSchema(child, visitor, depth + 1));
  if (node.items) walkSchema(node.items, visitor, depth + 1);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(node[key])) node[key].forEach((child) => walkSchema(child, visitor, depth + 1));
  }
}

export function officeSchemaForProvider(format) {
  if (!FORMATS.has(format)) throw new Error(`Unsupported Office format: ${format}`);
  return format === 'powerpoint' ? PRESENTATION_TRANSPORT_JSON_SCHEMA : OFFICE_OUTPUT_JSON_SCHEMAS[format];
}

export function inspectProviderSchema(provider, format, schema = officeSchemaForProvider(format)) {
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported Office provider: ${provider}`);
  const issues = [];
  let objectCount = 0;
  let propertyCount = 0;
  let maxDepth = 0;

  walkSchema(schema, (node, depth) => {
    maxDepth = Math.max(maxDepth, depth);
    if (node.type === 'object') {
      objectCount += 1;
      propertyCount += Object.keys(node.properties || {}).length;
      if (node.additionalProperties !== false) issues.push('Every structured-output object must set additionalProperties=false.');
      if (!Array.isArray(node.required)) issues.push('Every structured-output object must declare required fields explicitly.');
    }
    if (provider === 'gemini' && Array.isArray(node.enum) && node.enum.some((value) => typeof value !== 'string')) {
      issues.push('Gemini structured output cannot receive non-string enum values in the Office contract.');
    }
  });

  const bytes = Buffer.byteLength(JSON.stringify(schema), 'utf8');
  if (provider === 'anthropic') {
    if (bytes > 12_000) issues.push(`Anthropic Office schema exceeds Quantora grammar budget (${bytes} > 12000 bytes).`);
    if (propertyCount > 64) issues.push(`Anthropic Office schema exceeds Quantora property budget (${propertyCount} > 64).`);
    if (maxDepth > 7) issues.push(`Anthropic Office schema exceeds Quantora depth budget (${maxDepth} > 7).`);
  }

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    stats: { bytes, objectCount, propertyCount, maxDepth },
  };
}

export function assertProviderSchemaCompatible(provider, format, schema = officeSchemaForProvider(format)) {
  const result = inspectProviderSchema(provider, format, schema);
  if (!result.valid) {
    throw new Error(`Office ${provider} ${format} schema preflight failed: ${result.issues.join(' ')}`);
  }
  return schema;
}

export async function runProviderFailover(options) {
  const { providers = [], invoke, onFailure = null } = options || {};
  if (typeof invoke !== 'function') throw new Error('Provider failover requires an invoke callback.');
  const available = providers.filter((provider) => PROVIDERS.has(provider));
  if (!available.length) throw new Error('No model credential available for Office generation.');

  let lastError = null;
  for (const provider of available) {
    try {
      return await invoke(provider);
    } catch (error) {
      lastError = error;
      if (typeof onFailure === 'function') onFailure(provider, error);
    }
  }
  throw lastError || new Error('All Office generation providers failed.');
}
