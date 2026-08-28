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
  market_data: {
    id: 'market_data',
    label: 'Live market and currency data',
    needs: 'a Supabase project holding the market tables',
    steps: [
      'Open your Supabase project and copy its URL and service-role key.',
      'Add them to this deployment as SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      'Redeploy — environment changes do not reach a running deployment until you do.',
    ],
    verify: 'Ask me to convert a currency. A real rate comes back, with its date and source.',
  },
  own_provider_key: {
    id: 'own_provider_key',
    label: 'Your own AI provider key',
    needs: 'a key you already hold from Anthropic, OpenRouter, OpenAI or Google',
    steps: [
      'Open Privacy Vault from the menu.',
      'Paste your key under Session-only provider keys.',
      'It stays in this session and is never written to disk or sent anywhere but the provider.',
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

  lines.push(
    '',
    one
      ? "Tell me when it's on and I'll pick this up exactly where we left it — you won't have to ask again."
      : "Tell me when they're on and I'll pick this up exactly where we left it — you won't have to ask again.",
  );
  return lines.join('\n');
}

/**
 * What has to survive while the user goes and opens a door.
 *
 * The whole promise above — "I'll pick this up exactly where we left it" —
 * depends on this outliving the turn. A door takes minutes to open, across a
 * page reload and sometimes a redeploy, and a request that has to be retyped
 * afterwards is a request that gets abandoned instead.
 *
 * Only what is needed to re-run the ask, and deliberately no credentials: this
 * is written where a session can find it later, and a secret that lives in
 * resumable state is a secret that leaks.
 */
export function pendingAskFor({ ask = '', doors = [], turnId = null, at = Date.now() } = {}) {
  if (!ask || !doors.length) return null;
  return {
    ask: String(ask).slice(0, 4000),
    waitingOn: doors.map((door) => door.id),
    turnId,
    at,
  };
}

/**
 * Is a parked ask ready to run again?
 *
 * Every door it was waiting on has to be open. Resuming while one is still shut
 * would produce the same refusal a second time, which reads as the platform not
 * having listened.
 */
export function pendingAskIsReady(pending, { enabled = {} } = {}) {
  if (!pending?.waitingOn?.length) return false;
  return pending.waitingOn.every((id) => doorStateFor(id, { enabled }) === 'open');
}
