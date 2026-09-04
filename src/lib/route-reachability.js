/**
 * Which serverless routes nothing in the product calls.
 *
 * THE GAP. `platform-dead-control-gate.mjs` checks ONE direction — every
 * `/api/...` path referenced from `src/` resolves to something that can serve
 * it. It exists because the Header once shipped a "Connect Stripe Account"
 * button POSTing to an endpoint that never existed.
 *
 * Nothing checked the reverse: a route that IS served and that nobody calls.
 * So the QIR Resource Governor and Context Manager — both complete, typed,
 * tested, deployed — sat unreachable with every gate green, and the Phase 0
 * re-audit found them by hand.
 *
 * `test:wiring` cannot see this either: it ratchets orphaned exports and
 * components, and an HTTP route is neither.
 *
 * REACHABILITY IS NOT A SUBSTRING MATCH.
 *
 * 47 vercel.json rewrites funnel friendly paths onto `/api/pipeline`. Today
 * that route is ALSO called directly (FeedbackWidget.jsx), so nothing currently
 * depends on following a rewrite — the branch below is defensive, and is driven
 * by route-reachability.test.js rather than by the repository's present state.
 *
 * It stays because the moment a route is reached only through its friendly
 * path, a gate without it would report the busiest endpoint in the product as
 * dead. A gate whose first run is mostly false positives is one nobody trusts
 * again.
 */

/** Route files that are not routes. */
const NOT_A_ROUTE = /(^_|\.test\.|\.d\.ts$)/;

/** @returns {string[]} `/api/<name>` for every deployed function file. */
export function routePathsFrom(fileNames) {
  return fileNames
    .filter((name) => /\.(ts|js|mjs)$/.test(name) && !NOT_A_ROUTE.test(name))
    .map((name) => `/api/${name.replace(/\.(ts|js|mjs)$/, '')}`)
    .sort();
}

/**
 * Every `/api/...` path mentioned in a body of source text.
 *
 * Deliberately greedy about what counts as a mention: a route reached by a
 * template literal, a constant, or a rewrite source is still reached. This gate
 * exists to find routes with NO caller at all, so a false "reachable" is far
 * cheaper than a false "dead" — the latter is what gets a gate deleted.
 */
export function referencedApiPaths(sources) {
  const found = new Set();
  for (const source of sources) {
    /*
     * A relative import path is not a call. `qir-durability.test.js` reads
     * '../../api/qir-resources.ts' to check a contract, and the first version of
     * this scan counted that as a caller — so the gate reported the very route
     * it was written to find as reachable. The lookbehind rejects a `/api/` that
     * follows a word character, a dot or a slash, which is what a module
     * specifier looks like and what an HTTP path never does.
     */
    for (const match of String(source).matchAll(/(?<![\w./])\/api\/[A-Za-z0-9_\-/]+/g)) {
      found.add(match[0]);
    }
  }
  return found;
}

/**
 * @param {{ routePaths: string[], referenced: Set<string>, rewrites: Array<{source:string,destination:string}> }} input
 * @returns {string[]} routes nothing calls, directly or through a rewrite.
 */
export function unreachableRoutes({ routePaths = [], referenced = new Set(), rewrites = [] } = {}) {
  const referencedList = [...referenced];

  /* A rewrite makes its destination reachable only if the SOURCE is called. */
  const viaRewrite = new Set();
  for (const rewrite of rewrites) {
    const source = String(rewrite?.source || '');
    const destination = String(rewrite?.destination || '').split('?')[0];
    if (!source || !destination) continue;
    if (referencedList.some((path) => path === source || path.startsWith(`${source}/`))) {
      viaRewrite.add(destination);
    }
  }

  return routePaths.filter((route) => {
    if (viaRewrite.has(route)) return false;
    /*
     * `/api/deploy` must not be counted as called by a reference to
     * `/api/deploy-gcp`. Match the whole segment, or a sub-path beneath it.
     */
    return !referencedList.some((path) => path === route || path.startsWith(`${route}/`));
  });
}

/**
 * Compare against the recorded exceptions.
 *
 * The baseline maps a route to WHY it has no in-repo caller — an OAuth callback
 * a provider redirects to, a webhook, a cron target. A bare list would let the
 * next person park a route there without saying why, which is how a ratchet
 * turns into a junk drawer.
 *
 * @param {string[]} unreachable
 * @param {Record<string,string>} baseline
 */
export function compareRoutesToBaseline(unreachable, baseline = {}) {
  const known = new Set(Object.keys(baseline));
  const added = unreachable.filter((route) => !known.has(route));
  const wired = [...known].filter((route) => !unreachable.includes(route));
  return { added, wired, total: unreachable.length, ok: added.length === 0 };
}
