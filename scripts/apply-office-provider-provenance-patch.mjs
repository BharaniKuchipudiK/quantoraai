import fs from 'node:fs';

const path = 'api/generate-office.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'successful generation metadata declaration',
  '    let generationAttempts = 0;\n    const generationWarnings = [];',
  '    let generationAttempts = 0;\n    let successfulGeneration: { provider: string | null; model: string | null } | null = null;\n    const generationWarnings = [];',
);

replaceOnce(
  'provider result declaration',
  '          let rawResponse;\n          try {\n            rawResponse = await withTimeout(',
  '          let rawResponse;\n          let providerResult: any;\n          try {\n            providerResult = await withTimeout(',
);

replaceOnce(
  'provider result text extraction',
  "              'The AI model took too long to respond',\n            );\n          } catch (error) {",
  "              'The AI model took too long to respond',\n            );\n            rawResponse = typeof providerResult === 'string' ? providerResult : String(providerResult?.text || '');\n          } catch (error) {",
);

replaceOnce(
  'successful provider capture',
  '          validJson = validation.spec;\n          generationWarnings.push(...validation.warnings);\n        } catch (error) {',
  "          successfulGeneration = providerResult && typeof providerResult === 'object'\n            ? { provider: providerResult.provider || null, model: providerResult.model || null }\n            : null;\n          validJson = validation.spec;\n          generationWarnings.push(...validation.warnings);\n        } catch (error) {",
);

replaceOnce(
  'OpenRouter model declaration',
  "  const schema = outputSchemaFor(format);\n  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {",
  "  const schema = outputSchemaFor(format);\n  const model = process.env.OPENROUTER_OFFICE_MODEL || 'openai/gpt-4o-mini';\n  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {",
);

replaceOnce(
  'OpenRouter model payload',
  "      model: process.env.OPENROUTER_OFFICE_MODEL || 'openai/gpt-4o-mini',",
  '      model,',
);

replaceOnce(
  'OpenRouter provider result',
  "  if (!content.trim()) throw new Error('OpenRouter returned an empty completion');\n  return content;",
  "  if (!content.trim()) throw new Error('OpenRouter returned an empty completion');\n  return { text: content, provider: 'openrouter', model };",
);

replaceOnce(
  'Anthropic provider result',
  "  if (!String(content || '').trim()) throw new Error('Anthropic returned an empty completion');\n  return String(content).trim();",
  "  if (!String(content || '').trim()) throw new Error('Anthropic returned an empty completion');\n  return { text: String(content).trim(), provider: 'anthropic', model };",
);

replaceOnce(
  'Gemini model declaration',
  'async function callGemini(systemPrompt, promptWithContext, apiKey, format) {\n  const client = new GoogleGenAI({ apiKey });\n  let geminiError: any = null;',
  "async function callGemini(systemPrompt, promptWithContext, apiKey, format) {\n  const client = new GoogleGenAI({ apiKey });\n  const model = process.env.GEMINI_OFFICE_MODEL || 'gemini-flash-latest';\n  let geminiError: any = null;",
);

replaceOnce(
  'Gemini model payload',
  "        model: process.env.GEMINI_OFFICE_MODEL || 'gemini-flash-latest',",
  '        model,',
);

replaceOnce(
  'Gemini provider result',
  "      if (!text) throw new Error('Gemini returned an empty completion');\n      return text;",
  "      if (!text) throw new Error('Gemini returned an empty completion');\n      return { text, provider: 'gemini', model };",
);

replaceOnce(
  'generation response provenance',
  '        attempts: generationAttempts,\n        legacyCompatibility: legacyPowerPointCompile,',
  "        attempts: generationAttempts,\n        provider: isCompileRequest ? null : successfulGeneration?.provider || null,\n        model: isCompileRequest ? null : successfulGeneration?.model || null,\n        repaired: !isCompileRequest && generationAttempts > 1,\n        legacyCompatibility: legacyPowerPointCompile,",
);

replaceOnce(
  'success provenance log',
  '    return res.status(200).json({\n      success: true,',
  "    if (!isCompileRequest) {\n      console.info('Office generation succeeded', {\n        format,\n        operation,\n        provider: successfulGeneration?.provider || null,\n        model: successfulGeneration?.model || null,\n        attempts: generationAttempts,\n      });\n    }\n\n    return res.status(200).json({\n      success: true,",
);

fs.writeFileSync(path, source);
console.log('Applied asserted Office provider provenance patch.');
