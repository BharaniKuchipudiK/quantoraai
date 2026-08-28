/**
 * Capability doors — the third answer between "yes" and "no".
 *
 * WHY THIS EXISTS
 *
 * The planner's skill model has exactly two states. `available: true` means do
 * it; `available: false` means refuse. There is no way to say the thing that is
 * true most often:
 *
 *   "I can build this. You need to turn one thing on first, and here is how."
 *
 * So four real capabilities in this platform are doors with no handle. Each one
 * currently produces a correct refusal that abandons the person holding it:
 * market data "isn't connected on this deployment yet", a provider key should
 * be pasted somewhere the message does not name, deployment and Places need
 * environment variables nobody has been told about. Every one of those is
 * something the user could fix in two minutes if anybody said which two
 * minutes.
 *
 * That is the same failure as the FX conversion bug this platform shipped for
 * weeks: a refusal that is technically accurate and practically useless.
 *
 * THE DISTINCTION THIS MODULE ENFORCES
 *
 *   OPEN        the capability is on; build.
 *   CLOSED      it is off, and the user can open it. Say how, then resume.
 *   WALLED      nothing the user can do changes the answer. Refuse plainly.
 *
 * WALLED must stay honest. `unique_ai_mockups_at_scale` is a real no — it times
 * out or ships SVG fakes — and dressing a genuine no as a door would be a
 * crueller lie than the dead end it replaced, because the person would go
 * looking for a handle that is not there.
 */

/** @typedef {'open'|'closed'|'walled'} DoorState */

/**
 * The doors this platform actually has, and what opens each one.
 *
 * Deliberately only capabilities that exist in this codebase today. Adding a
 * door for a capability nobody built would be inventing a feature to justify a
 * mechanism, which is the move this whole line of work exists to refuse.
 */
export const CAPABILITY_DOORS = Object.freeze({
  market_prices: {
    id: 'market_prices',
    label: 'Stock prices and market history',
    needs: 'a Supabase project holding the market tables',
    steps: [
      'Open your Supabase project and copy its URL and service-role key.',
      'Add them to this deployment as SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      'Redeploy — environment changes do not reach a running deployment until you do.',
      'Run the Market Data Ingestion workflow once to fill the tables.',
    ],
    verify: 'Ask me for a stock price. A real close comes back, with its date and source.',
  },
  own_provider_key: {
    id: 'own_provider_key',
    label: 'Your own AI provider key',
    // Gemini and OpenRouter ONLY. The Vault renders exactly two inputs and
    // byokRequestHeaders forwards exactly two headers, so naming Anthropic or
    // OpenAI here would send somebody to a form that cannot take their key —
    // a door whose steps cannot be followed is worse than no door.
    needs: 'a Gemini or OpenRouter key you already hold',
    steps: [
      'Open Privacy Vault from the menu.',
      'Paste your Gemini or OpenRouter key under Session-only provider keys.',
      // The Vault's own copy is the accurate one, and it is accurate on purpose:
      // byokRequestHeaders attaches the key to a request to Quantora's /api/chat,
      // which reads it before calling the provider. Saying it goes nowhere but
      // the provider would misdescribe who handles a secret.
      'It stays in memory for this browser tab only, is attached to provider requests through Quantora, and is never written to storage.',
    ],
    verify: 'Start a build. The model label under the reply names your provider.',
  },
  deploy_to_web: {
    id: 'deploy_to_web',
    label: 'Publishing a build to a live URL',
    needs: 'a Vercel access token',
    steps: [
      'Create a token at vercel.com under Account Settings, Tokens.',
      'Add it to this deployment as VERCEL_ACCESS_TOKEN.',
      'Redeploy so the running functions can see it.',
    ],
    verify: 'Ask me to publish. You get back a URL that opens.',
  },
  places_lookup: {
    id: 'places_lookup',
    label: 'Real places and addresses',
    needs: 'a Google Maps API key with the Places API enabled',
    steps: [
      'Create an API key in the Google Cloud console.',
      'Enable the Places API on the same project — a key without it returns nothing.',
      'Add it to this deployment as GOOGLE_MAPS_API_KEY, then redeploy.',
    ],
    verify: 'Ask for somewhere near an address. Real listings come back instead of invented ones.',
  },
});

/**
 * Which state a door is in, given what this deployment can see.
 *
 * `walled` is never inferred — a capability is only walled when it is declared
 * so. Anything unknown is treated as walled rather than as a door, because
 * inventing steps for a capability nobody built would send somebody looking for
 * a handle that does not exist.
 */
export function doorStateFor(id, { enabled = {} } = {}) {
  if (!CAPABILITY_DOORS[id]) return 'walled';
  return enabled[id] === true ? 'open' : 'closed';
}

/**
 * The doors standing between this turn and the thing that was asked for.
 *
 * Returns them in declaration order and never repeats one, so a turn needing
 * the same capability twice asks for it once.
 */
export function doorsBlocking(requiredIds = [], { enabled = {} } = {}) {
  const seen = new Set();
  const blocking = [];
  for (const id of requiredIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (doorStateFor(id, { enabled }) === 'closed') blocking.push(CAPABILITY_DOORS[id]);
  }
  return blocking;
}

/**
 * What to say when a door is shut.
 *
 * Not an error and not an apology. The shape is deliberate: what I can do, what
 * is in the way, the numbered steps, and how you will know it worked. A person
 * who cannot read source can still follow three numbered steps, and telling
 * them how to verify means they never have to take my word for it.
 */
export function describeDoors(doors = [], { ask = '' } = {}) {
  if (!doors.length) return '';
  const lines = [];
  const one = doors.length === 1;

  lines.push(
    one
      ? `I can build ${ask ? `${ask}` : 'this'} — I need one thing switched on first.`
      : `I can build ${ask ? `${ask}` : 'this'} — I need ${doors.length} things switched on first.`,
  );

  for (const door of doors) {
    lines.push('', `**${door.label}** — needs ${door.needs}.`);
    door.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push(`*You'll know it worked:* ${door.verify}`);
  }

  /*
   * What this can honestly promise.
   *
   * The first version said "I'll pick this up exactly where we left it — you
   * won't have to ask again", and nothing in the code did that: the parked ask
   * lived on one plan object, was never written anywhere, and had no reader. A
   * promise the code does not keep is the exact failure this whole line of work
   * exists to remove, and it does not get an exception for being kind.
   *
   * Asking again is a real, small cost. Saying so is cheaper than owing
   * somebody a resume that never comes.
   */
  lines.push(
    '',
    one
      ? "Once it's on, ask me again and I'll build it."
      : "Once they're on, ask me again and I'll build it.",
  );
  return lines.join('\n');
}

/*
 * There was a pendingAskFor/pendingAskIsReady pair here, to park the ask across
 * the round trip. It is gone rather than shipped, because nothing wrote it and
 * nothing read it: the copy promised a resume that no code performed. Parking
 * an ask properly needs storage that survives a reload and a redeploy, and that
 * is worth building — as a thing that works, not as a sentence that claims to.
 */
