import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheOfficeArtifact,
  clearOfficeArtifactCache,
  extractOfficeManifest,
  fingerprintOfficePreview,
  getCachedOfficeArtifact,
  manifestMatchesPreview,
  stripOfficeManifest,
  validateOfficeArtifactEnvelope,
} from './office-artifact-cache.js';

const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function htmlWithManifest() {
  const base = '<html><body><section>Deck</section></body></html>';
  const fingerprint = fingerprintOfficePreview(base);
  const manifest = JSON.stringify({ version: 1, kind: 'powerpoint', previewFingerprint: fingerprint, spec: { title: 'Deck', slides: [{ title: 'Deck' }] } });
  return { base, fingerprint, html: base.replace('</body>', `<script type="application/json" id="quantora-office-manifest">${manifest}</script></body>`) };
}

test('extracts the canonical Office manifest and detects preview drift', () => {
  const { html, fingerprint } = htmlWithManifest();
  const manifest = extractOfficeManifest(html);
  assert.equal(manifest.kind, 'powerpoint');
  assert.equal(manifest.previewFingerprint, fingerprint);
  assert.equal(manifestMatchesPreview(html, manifest), true);
  assert.equal(manifestMatchesPreview(html.replace('Deck', 'Changed'), manifest), false);
  assert.doesNotMatch(stripOfficeManifest(html), /quantora-office-manifest/);
});

test('caches only verified artifacts tied to the same preview fingerprint', () => {
  clearOfficeArtifactCache();
  const { fingerprint } = htmlWithManifest();
  const artifact = {
    kind: 'powerpoint',
    fileName: 'deck.pptx',
    mimeType: MIME,
    data: 'A'.repeat(200),
    verification: { passed: true, previewFingerprint: fingerprint },
  };
  assert.equal(cacheOfficeArtifact(artifact), true);
  assert.equal(getCachedOfficeArtifact(fingerprint), artifact);
  assert.equal(validateOfficeArtifactEnvelope(artifact, 'powerpoint', fingerprint).valid, true);
});

test('rejects a mismatched or unverified artifact', () => {
  const bad = {
    kind: 'powerpoint',
    fileName: 'deck.docx',
    mimeType: MIME,
    data: 'A'.repeat(200),
    verification: { passed: false, previewFingerprint: 'deadbeef' },
  };
  const result = validateOfficeArtifactEnvelope(bad, 'powerpoint', 'cafebabe');
  assert.equal(result.valid, false);
  assert.ok(result.issues.length >= 3);
});
