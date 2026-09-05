/*
 * electron-builder reads this. The configuration itself lives in
 * signing-policy.cjs as a pure function of the environment, so what the build
 * will and will not sign can be asserted in a test instead of discovered
 * twenty minutes into a release job. See signing-policy.test.js.
 */
const { desktopBuildConfig, signingPolicy } = require('./signing-policy.cjs');

const policy = signingPolicy(process.env);
console.log(
  `[quantora] packaging with macSign=${policy.macSign} macNotarize=${policy.macNotarize} winSign=${policy.winSign}`,
);
if (!policy.macSign) {
  console.log('[quantora] no Developer ID certificate — the macOS build will be unsigned and Gatekeeper will refuse it once downloaded.');
}

module.exports = desktopBuildConfig(process.env);
