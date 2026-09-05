/*
 * What the packaging build signs, decided from the credentials that are
 * actually present.
 *
 * THE PROBLEM THIS SOLVES
 *
 * The first version of build/electron-builder.json hard-coded
 * `hardenedRuntime: true` and `notarize: true` for macOS. Those are not
 * descriptions of the app, they are demands for an Apple Developer ID
 * certificate and notarisation credentials. With no certificates configured —
 * which is the state of this repo until someone buys them — the release
 * workflow's own comment claimed it "still produces unsigned artifacts". That
 * claim was never run: there has never been a desktop-v* tag, so the
 * packaging path has never executed even once.
 *
 * Rather than leave a promise nobody has tested, the config now derives its
 * signing fields from the environment, so both states are explicit:
 *
 *   no certificates  -> identity null, hardened runtime off, notarisation off.
 *                       electron-builder produces an unsigned build instead of
 *                       failing on a credential it was told to expect. The
 *                       result is installable for testing and will be refused
 *                       by Gatekeeper once downloaded, which is correct and
 *                       must not be papered over.
 *   Developer ID     -> signed, hardened runtime on (notarisation requires it).
 *   + Apple account  -> notarised as well.
 *
 * Notarisation is only offered when the app is also signed, because Apple
 * cannot notarise an unsigned bundle; asking for it anyway is how a release
 * job fails at the last step after twenty minutes of packaging.
 */
const present = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ macSign: boolean, macNotarize: boolean, winSign: boolean }}
 */
function signingPolicy(env = {}) {
  const macSign = present(env.CSC_LINK);
  const macNotarize = macSign
    && present(env.APPLE_ID)
    && present(env.APPLE_APP_SPECIFIC_PASSWORD)
    && present(env.APPLE_TEAM_ID);
  return { macSign, macNotarize, winSign: present(env.WIN_CSC_LINK) };
}

/**
 * The full electron-builder configuration for the given environment.
 * @param {Record<string, string | undefined>} env
 */
function desktopBuildConfig(env = {}) {
  const { macSign, macNotarize } = signingPolicy(env);
  return {
    appId: 'app.quantoraai.desktop',
    productName: 'Quantora',
    directories: { output: 'release', buildResources: 'build' },
    files: ['dist/**/*', 'package.json'],
    protocols: [{ name: 'Quantora', schemes: ['quantora'] }],
    asarUnpack: ['**/node_modules/node-pty/**'],
    mac: {
      category: 'public.app-category.developer-tools',
      icon: 'build/icon.png',
      target: [
        { target: 'dmg', arch: ['arm64', 'x64'] },
        { target: 'zip', arch: ['arm64', 'x64'] },
      ],
      // `identity: null` is how electron-builder is told to skip signing on
      // purpose. Without it, it hunts the keychain and the failure reads like
      // a broken machine rather than a missing certificate.
      ...(macSign
        ? { hardenedRuntime: true, entitlements: 'build/entitlements.mac.plist', entitlementsInherit: 'build/entitlements.mac.plist' }
        : { identity: null, hardenedRuntime: false }),
      notarize: macNotarize,
    },
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.png' },
    linux: { target: ['AppImage', 'deb'], category: 'Development', icon: 'build/icon.png' },
    publish: { provider: 'github', owner: 'BharaniKuchipudiK', repo: 'quantoraai' },
  };
}

module.exports = { signingPolicy, desktopBuildConfig };
