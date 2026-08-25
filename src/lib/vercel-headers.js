/**
 * Resolve the headers Vercel actually serves for a path, straight from vercel.json.
 *
 * WHY THIS EXISTS
 * ---------------
 * Header policy used to be written twice: once in vercel.json (production) and
 * once, by hand, inside vite.config.ts and the browser gates' mock servers
 * (dev/test). The two drifted, and nothing compared them.
 *
 * The drift that cost us: the Preview shell (/preview/embed.html) is framed by a
 * document served with `Cross-Origin-Embedder-Policy: require-corp`. Under COEP
 * require-corp a browser refuses to load a nested document whose own response has
 * no COEP — CORP alone is NOT enough. vercel.json's `/preview/(.*)` rule set CORP
 * but not COEP, and the catch-all rule that carries COEP explicitly excludes
 * `preview/` via a negative lookahead. So in production the shell iframe was
 * blocked, `embed-ready` never fired, and Preview sat on "Verifying — running the
 * preview…" forever. Vite's dev/preview server applies COEP to the whole origin,
 * so it worked locally, and the browser gate served its own COEP header, so the
 * gate was green. Only production was broken.
 *
 * These helpers make vercel.json the single source of truth, so a framing
 * contract can be asserted against the file that actually ships.
 */

/**
 * Convert a Vercel `source` pattern into an anchored RegExp.
 * The patterns this project uses are already regex-shaped (`/preview/(.*)`,
 * `/((?!preview/|desk).*)`, `/desk`), so anchoring is all that is required.
 */
export function sourceToRegExp(source) {
  const raw = String(source || '');
  const body = raw.startsWith('^') ? raw.slice(1) : raw;
  const trimmed = body.endsWith('$') ? body.slice(0, -1) : body;
  return new RegExp(`^${trimmed}$`);
}

/**
 * Every header rule in `config.headers` whose source matches `path`.
 * Vercel applies all matching rules, so callers get them in file order.
 */
export function matchingHeaderRules(config, path) {
  const rules = Array.isArray(config?.headers) ? config.headers : [];
  return rules.filter((rule) => {
    try {
      return sourceToRegExp(rule.source).test(path);
    } catch {
      return false;
    }
  });
}

/**
 * Merged headers for `path`, keyed by lower-cased header name. Later matching
 * rules win, mirroring how a last-write-wins header set resolves.
 */
export function resolveHeadersForPath(config, path) {
  const out = {};
  for (const rule of matchingHeaderRules(config, path)) {
    for (const header of rule.headers || []) {
      out[String(header.key).toLowerCase()] = String(header.value);
    }
  }
  return out;
}

/** True when `path` is served with COEP require-corp. */
export function requiresCorp(config, path) {
  return resolveHeadersForPath(config, path)['cross-origin-embedder-policy'] === 'require-corp';
}

/**
 * The invariant that was violated in production.
 *
 * A document framed inside a COEP:require-corp parent must itself be served with
 * BOTH:
 *   - Cross-Origin-Resource-Policy (so the parent may embed the bytes), and
 *   - Cross-Origin-Embedder-Policy: require-corp (so the COEP inheritance check
 *     in "check a navigation response's adherence to its embedder policy" passes).
 *
 * Returns a list of human-readable violations; empty means the contract holds.
 *
 * @param {object} config parsed vercel.json
 * @param {{ framedPath: string, parentPaths: string[] }} opts
 */
export function checkFramedDocumentContract(config, { framedPath, parentPaths }) {
  const problems = [];
  const isolatingParents = parentPaths.filter((parent) => requiresCorp(config, parent));
  if (!isolatingParents.length) return problems;

  const framed = resolveHeadersForPath(config, framedPath);
  const parents = isolatingParents.join(', ');

  if (!framed['cross-origin-resource-policy']) {
    problems.push(
      `${framedPath} is framed by COEP:require-corp document(s) [${parents}] but is served `
      + 'without Cross-Origin-Resource-Policy — the parent cannot embed it.',
    );
  }
  if (framed['cross-origin-embedder-policy'] !== 'require-corp') {
    problems.push(
      `${framedPath} is framed by COEP:require-corp document(s) [${parents}] but is served `
      + `with Cross-Origin-Embedder-Policy: ${framed['cross-origin-embedder-policy'] || '(absent)'} `
      + '— the browser blocks the iframe navigation, so embed-ready never fires and Preview '
      + 'hangs on "Verifying — running the preview…". CORP alone is not enough.',
    );
  }
  return problems;
}
