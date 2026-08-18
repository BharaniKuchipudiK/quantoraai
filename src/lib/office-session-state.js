export function latestVerifiedOfficeArtifact(messages = [], expectedKind = null) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const artifact = list[index]?.officeAttachment;
    if (!artifact || artifact?.verification?.passed !== true) continue;
    const kind = artifact.kind || artifact.format || null;
    if (expectedKind && kind !== expectedKind) continue;
    if (!kind || !artifact.spec || !artifact.htmlPreview || !artifact?.verification?.previewFingerprint) continue;
    return artifact;
  }
  return null;
}
