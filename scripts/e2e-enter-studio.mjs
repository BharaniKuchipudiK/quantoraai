/**
 * Browser gates start on the marketing page. Studio is behind a signed-in
 * check: clicking Try Quantora before the session hydrates opens auth instead
 * of the desk. Wait for the signed-in header CTA (data-quantora-enter-studio),
 * then enter Studio and wait for the composer.
 */
export async function enterSignedInStudio(page) {
  if (!/\/desk\/?(\?|$)/.test(page.url())) {
    const enterStudio = page.locator('[data-quantora-enter-studio]').first();
    await enterStudio.waitFor({ state: 'visible', timeout: 15_000 });
    await enterStudio.click();
    await page.waitForURL(/\/desk\/?$/, { timeout: 20_000 });
  }
  const enteredAt = Date.now();

  const composer = page.locator('.app-shell--studio textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });

  const openSidebar = page.getByTitle('Open Chat History Sidebar').first();
  if (await openSidebar.isVisible().catch(() => false)) {
    await openSidebar.click();
  }

  return { composer, enteredAt, readyAt: Date.now() };
}
