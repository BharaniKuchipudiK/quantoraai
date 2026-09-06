/*
 * What the build under test shows (mirrors src/lib/platform-surfaces.js).
 *
 * The Quantum Playground and the Dream-to-Action canvas are parked: their
 * tabs render only when the bundle was built with
 * VITE_QUANTORA_EXPLORATORY_SURFACES=on. A gate that asserts the Journey tab
 * must therefore ask the same question the build did, from the same variable,
 * so it holds in both states instead of pinning one of them.
 */
export function exploratorySurfacesShown(env = process.env) {
  return String(env.VITE_QUANTORA_EXPLORATORY_SURFACES || '').trim().toLowerCase() === 'on';
}

/**
 * The global Journey/Canvas entry: present exactly when the build shows it.
 * @param {import('playwright').Page} page
 * @param {(locator: any, message: string) => Promise<void>} visible
 */
export async function assertJourneyEntry(page, visible, where = 'Studio') {
  const journey = page.getByRole('button', { name: /^Journey$/i }).first();
  if (exploratorySurfacesShown()) {
    await visible(journey, `Global Journey/Canvas navigation is missing from ${where}.`);
    return;
  }
  if (await journey.count()) {
    throw new Error(`The Journey/Canvas tab rendered in ${where} although this build parks it (src/lib/platform-surfaces.js; set VITE_QUANTORA_EXPLORATORY_SURFACES=on to show it).`);
  }
}
