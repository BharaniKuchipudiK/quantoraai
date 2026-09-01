/**
 * A tool description is a capability claim, and until now nothing checked it.
 *
 * THE INCIDENT
 *
 * `search_hotels` told the model it was "REQUIRED for hotels, stays, property
 * ratings, websites, Google Maps links, or photos" and then, in the same
 * sentence, listed what it returns with photos absent. The field mask agreed
 * with the second half: twelve fields, no `places.photos`.
 *
 * So the model was instructed to use this tool for photos, called it, got none,
 * and improvised an explanation — "I cannot render embedded photo feeds" —
 * which is false. The traveller read an invented limitation caused by a
 * self-contradicting sentence in a tool definition.
 *
 * WHY THE EXISTING CLAIMS GATE MISSED IT
 *
 * `capability-claims.js` checks the capability CHIPS a workspace advertises to
 * a human against the modules that back them. That is a different surface. A
 * tool description is a promise made to the MODEL, and a promise to the model
 * reaches the traveller just as surely — via whatever the model says when the
 * promise is not kept.
 *
 * WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * Only Places-backed tools, and only against field-mask entries that exist in
 * the same file (see the union caveat on extractPlacesToolClaims). That keeps
 * it precise: every finding is a provable contradiction between two strings in
 * the same file, with an exact remedy. A gate that fired on
 * ambiguous evidence would be muted by the next person under pressure, and then
 * it would protect nothing.
 *
 * It does NOT attempt to parse every description, judge tone, or infer intent.
 * The vocabulary below is small and additive: a word earns its place here only
 * when a real incident proves the claim can be made without the field.
 */

/**
 * Words a Places-backed description may use, and the field mask entry each one
 * requires. Keyed on distinctive words rather than phrases, because the
 * descriptions are prose and phrasing drifts.
 */
export const PLACES_CLAIM_FIELDS = Object.freeze({
  photo: 'places.photos',
  photos: 'places.photos',
  rating: 'places.rating',
  ratings: 'places.rating',
  website: 'places.websiteUri',
  websites: 'places.websiteUri',
  address: 'places.formattedAddress',
  addresses: 'places.formattedAddress',
});

/** Tokenise a description into lowercase words for whole-word matching. */
function words(description) {
  return new Set(
    String(description || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/**
 * Find claims a description makes that its field mask cannot answer.
 *
 * `tools` is a list of { name, description }; `fieldMask` is the comma-joined
 * mask those tools' provider call actually sends. Returns one finding per
 * unbacked claim, naming the tool, the word, and the field that would make the
 * sentence true — an unactionable gate is one the next person mutes.
 */
export function findUnbackedToolClaims(tools = [], fieldMask = '') {
  const fields = new Set(
    String(fieldMask || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  const findings = [];
  for (const tool of tools || []) {
    const name = tool?.name || '(unnamed tool)';
    const present = words(tool?.description);
    const seen = new Set();
    for (const [claim, requiredField] of Object.entries(PLACES_CLAIM_FIELDS)) {
      if (!present.has(claim)) continue;
      if (fields.has(requiredField)) continue;
      if (seen.has(requiredField)) continue;
      seen.add(requiredField);
      findings.push({
        tool: name,
        claim,
        requiredField,
        detail: `${name} advertises "${claim}" but its field mask does not request ${requiredField}`,
      });
    }
  }
  return findings;
}

/**
 * Render findings as an actionable failure message.
 *
 * Written to be read at 2am by someone who did not write the tool: it names the
 * contradiction, the exact remedy, and the reason the softer remedy is also
 * legitimate. A gate that only says FAILED gets muted.
 */
export function describeUnbackedToolClaims(findings = []) {
  if (!findings.length) return '';
  const lines = findings.map((f) => `  ${f.tool}: claims "${f.claim}", mask is missing ${f.requiredField}`);
  return [
    `Tool claim gate FAILED — ${findings.length} tool description(s) promise what the request cannot return:`,
    '',
    ...lines,
    '',
    'A tool description is a promise made to the model, and the model passes it on.',
    'search_hotels advertised photos with no places.photos in its field mask, so the',
    'model invented a reason for their absence and the traveller read "I cannot render',
    'embedded photo feeds" — which was never true.',
    '',
    'Either add the field to the mask so the claim becomes true, or remove the word',
    'from the description so the claim is no longer made. Both are correct; saying',
    'nothing about a capability is always better than describing one that is absent.',
  ].join('\n');
}

/**
 * Pull the Places tool descriptions and field-mask entries out of source text.
 *
 * Reading source rather than importing it: the tool definitions live in a
 * TypeScript module that the gate runner cannot import directly, and adding a
 * build step to run a gate is how gates stop being run.
 *
 * The parse is deliberately strict and its failure mode is deliberately loud.
 * `parsed.ok` is false when the file no longer looks the way this expects, and
 * the gate FAILS on that rather than reporting a clean run over zero tools —
 * a check that silently examines nothing is worse than no check, because it
 * costs the same and buys false confidence.
 *
 * KNOWN LIMIT, STATED RATHER THAN IMPLIED: masks are unioned. A claim is
 * considered backed if the field appears in ANY Places mask in the file, not
 * necessarily the one that specific tool sends. That is enough to catch a field
 * nothing requests — the actual incident — and it keeps every finding an
 * unambiguous contradiction. Narrowing it to per-tool masks would need call-site
 * analysis, and a gate that guesses gets muted.
 */
export function extractPlacesToolClaims(source = '') {
  const text = String(source || '');

  // Every quoted entry inside a *_FIELD_MASK array, plus any appended literal.
  const maskFields = new Set();
  for (const block of text.matchAll(/FIELD_MASK\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const entry of block[1].matchAll(/['"`]([a-zA-Z][\w.]*)['"`]/g)) maskFields.add(entry[1]);
  }
  // A mask built by extending another: `${BASE},places.photos`
  for (const extra of text.matchAll(/FIELD_MASK\s*=\s*`[^`]*`/g)) {
    for (const entry of extra[0].matchAll(/,\s*([a-z][\w]*\.[\w.]+)/g)) maskFields.add(entry[1]);
  }

  // Tool entries: a name followed by its description in the same object.
  const tools = [];
  for (const match of text.matchAll(/name:\s*'([a-z_]+)',\s*\n\s*description:\s*'((?:[^'\\]|\\.)*)'/g)) {
    tools.push({ name: match[1], description: match[2] });
  }

  const places = tools.filter((tool) => /Google Places/i.test(tool.description));
  const ok = maskFields.size > 0 && places.length > 0;
  return { ok, tools, places, fieldMask: [...maskFields].join(',') };
}
