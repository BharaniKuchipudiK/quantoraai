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
/**
 * The Places-backed tools this gate MUST be able to bind to a call site.
 *
 * Declarative on purpose. Discovering Places tools purely by scanning `case`
 * blocks meant a tool whose dispatch shape changed was simply omitted: switching
 * search_hotels to double-quoted case labels, or routing it to a shared handler,
 * dropped THE tool this gate exists to police while `ok` stayed true and
 * `missing` stayed empty — a clean run over two of three tools.
 *
 * Naming them means a tool can no longer leave the gate by accident. Adding a
 * Places-backed tool is a deliberate line here; failing to bind one is a build
 * failure rather than a quieter report.
 */
export const KNOWN_PLACES_TOOLS = Object.freeze([
  'search_hotels',
  'search_attractions',
  'get_places_routing',
]);

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
 * Pull each Places-backed tool and THE MASK ITS OWN CALL SITE SENDS.
 *
 * The first version of this unioned every mask in the file. That made the gate
 * decorative for the one regression it exists to stop: deleting
 * `withPhotos: true` restored the original incident verbatim — photos still
 * advertised, no longer requested, the model improvising again — and the gate
 * reported a clean pass, because GOOGLE_PLACES_PHOTO_FIELD_MASK still existed
 * somewhere in the file. CLAUDE.md §4 asks what a gate does when the bug is
 * present; the honest answer was "nothing", which means it was not yet a gate.
 *
 * So a tool is now bound to its call site: the `case '<name>':` block decides
 * whether the photo fields are in play, and a tool counts as Places-backed
 * because it CALLS the Places search, not because its prose happens to contain
 * the words "Google Places" — get_places_routing says only "via Places" and was
 * silently outside the check.
 *
 * Every parse failure is loud. If the tool count does not match the number of
 * name: keys in the definitions array, or no Places tool is found, `ok` is
 * false and the gate fails rather than reporting a clean run over nothing.
 */
export function extractPlacesToolClaims(source = '') {
  const text = String(source || '');

  const arrayFields = (constName) => {
    const match = text.match(new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    if (!match) return [];
    return [...match[1].matchAll(/['"`]([a-zA-Z][\w.]*)['"`]/g)].map((entry) => entry[1]);
  };

  const baseMask = arrayFields('GOOGLE_PLACES_FIELD_MASK');
  // A mask that extends another: `${BASE},places.photos`
  const photoExtra = [...text.matchAll(/GOOGLE_PLACES_PHOTO_FIELD_MASK\s*=\s*`[^`]*`/g)]
    .flatMap((m) => [...m[0].matchAll(/,\s*([a-z][\w]*\.[\w.]+)/g)].map((e) => e[1]));

  // Tool entries. The description may sit on the same line or the next one, so
  // a reformat cannot quietly drop a tool out of the check.
  const tools = [...text.matchAll(/name:\s*'([a-z_]+)',\s*description:\s*'((?:[^'\\]|\\.)*)'/gs)]
    .map((m) => ({ name: m[1], description: m[2] }));

  // Every declared tool must have been parsed. A description that stops
  // matching is a gate that stops looking, and that must fail loudly.
  const declared = [...text.matchAll(/^\s{4}name:\s*'([a-z_]+)',\s*$/gm)].map((m) => m[1]);
  const declaredInline = [...text.matchAll(/^\s{4}name:\s*'([a-z_]+)',\s+description:/gm)].map((m) => m[1]);
  const expected = new Set([...declared, ...declaredInline]);

  const places = [];
  for (const tool of tools) {
    // Does this tool's own case block reach the Places search?
    const block = text.match(new RegExp(`case '${tool.name}':([\\s\\S]*?)\\n    case |case '${tool.name}':([\\s\\S]*?)\\n  \\}`));
    const body = block ? (block[1] || block[2] || '') : '';
    if (!/searchGooglePlaces\s*\(/.test(body)) continue;
    const withPhotos = /withPhotos:\s*true/.test(body);
    places.push({
      ...tool,
      withPhotos,
      fieldMask: [...baseMask, ...(withPhotos ? photoExtra : [])].join(','),
    });
  }

  const missing = [...expected].filter((name) => !tools.some((tool) => tool.name === name));
  /*
   * A known Places tool that could not be bound to a call site is a hole in the
   * gate, not a tool that stopped being Places-backed. Reported separately from
   * `missing` (which is about parsing the declaration) because the remedies
   * differ: this one means the dispatch shape moved.
   */
  const unbound = KNOWN_PLACES_TOOLS.filter((name) => !places.some((tool) => tool.name === name));
  const ok = baseMask.length > 0 && missing.length === 0 && unbound.length === 0;
  return { ok, tools, places, missing, unbound, baseMask: baseMask.join(',') };
}
