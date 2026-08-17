import { OFFICE_KIND } from './office-intent.js';

const OFFICE_MANIFEST_ID = 'quantora-office-manifest';
const MAX_CACHE_ENTRIES = 6;
const cache = new Map();

const META = {
  [OFFICE_KIND.POWERPOINT]: {
    extension: '.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  [OFFICE_KIND.WORD]: {
    extension: '.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  [OFFICE_KIND.EXCEL]: {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

export function normalizeOfficePreviewHtml(html) {
  return String(html || '').replace(/\r\n/g, '\n').trim();
}

export function fingerprintOfficePreview(html) {
  const text = normalizeOfficePreviewHtml(html);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function extractOfficeManifest(html) {
  const source = String(html || '');
  const re = new RegExp(`<script[^>]*id=["']${OFFICE_MANIFEST_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const match = source.match(re);
  if (!match) return null;
  try {
    const manifest = JSON.parse(match[1]);
    if (!manifest || manifest.version !== 1 || !META[manifest.kind] || !manifest.spec || !manifest.previewFingerprint) return null;
    return manifest;
  } catch {
    return null;
  }
}

export function stripOfficeManifest(html) {
  const source = String(html || '');
  const re = new RegExp(`<script[^>]*id=["']${OFFICE_MANIFEST_ID}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i');
  return source.replace(re, '');
}

export function manifestMatchesPreview(html, manifest = extractOfficeManifest(html)) {
  if (!manifest) return false;
  return fingerprintOfficePreview(stripOfficeManifest(html)) === manifest.previewFingerprint;
}

export function validateOfficeArtifactEnvelope(artifact, expectedKind = null, expectedFingerprint = null) {
  const issues = [];
  const kind = artifact?.kind || artifact?.format;
  const meta = META[kind];

  if (!artifact || typeof artifact !== 'object') issues.push('Office artifact payload is missing.');
  if (!meta) issues.push('Office artifact kind is unsupported.');
  if (expectedKind && kind !== expectedKind) issues.push(`Office artifact kind mismatch: expected ${expectedKind}, got ${kind || 'unknown'}.`);
  if (!artifact?.verification?.passed) issues.push('Office artifact did not pass server verification.');
  if (!artifact?.data || typeof artifact.data !== 'string' || artifact.data.length < 100) issues.push('Office artifact binary is missing.');
  if (meta && artifact?.mimeType !== meta.mimeType) issues.push('Office artifact MIME type does not match its format.');
  if (meta && !String(artifact?.fileName || '').toLowerCase().endsWith(meta.extension)) issues.push('Office artifact filename extension does not match its format.');
  if (expectedFingerprint && artifact?.verification?.previewFingerprint !== expectedFingerprint) issues.push('Office artifact was compiled from a different preview specification.');

  return { valid: issues.length === 0, issues, kind, meta };
}

export function cacheOfficeArtifact(artifact) {
  const fingerprint = artifact?.verification?.previewFingerprint;
  const validation = validateOfficeArtifactEnvelope(artifact);
  if (!fingerprint || !validation.valid) return false;

  if (cache.has(fingerprint)) cache.delete(fingerprint);
  cache.set(fingerprint, artifact);
  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  return true;
}

export function getCachedOfficeArtifact(fingerprint) {
  if (!fingerprint) return null;
  return cache.get(fingerprint) || null;
}

export function clearOfficeArtifactCache() {
  cache.clear();
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function downloadOfficeArtifact(artifact) {
  const validation = validateOfficeArtifactEnvelope(artifact);
  if (!validation.valid) throw new Error(validation.issues.join(' '));

  const blob = new Blob([base64ToBytes(artifact.data)], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artifact.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
