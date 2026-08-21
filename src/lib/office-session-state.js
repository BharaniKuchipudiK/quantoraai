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

function stripOfficeHtmlFence(text = '') {
  const cleaned = String(text || '').replace(/```html[\s\S]*?```/gi, '').trim();
  return cleaned;
}

function officeStub(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  return {
    kind: attachment.kind || attachment.format || null,
    fileName: attachment.fileName || '',
    mimeType: attachment.mimeType || '',
    verification: attachment.verification || null,
    generation: attachment.generation || null,
  };
}

export function compactOfficeMessages(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let canonicalIndex = -1;
  let binary = null;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const artifact = list[index]?.officeAttachment;
    if (artifact?.data && !binary) binary = artifact.data;
    if (
      canonicalIndex < 0
      && artifact?.verification?.passed === true
      && artifact.spec
      && artifact.htmlPreview
      && artifact.verification?.previewFingerprint
    ) {
      canonicalIndex = index;
    }
  }

  return list.map((message, index) => {
    const attachment = message?.officeAttachment;
    const text = attachment
      ? (stripOfficeHtmlFence(message.text) || 'The Office file is in Preview. Use Download on the card below.')
      : message.text;
    if (!attachment) return message;

    if (index === canonicalIndex) {
      return {
        ...message,
        text,
        codeSnippet: undefined,
        officeAttachment: {
          ...officeStub(attachment),
          spec: attachment.spec,
          htmlPreview: attachment.htmlPreview,
          data: attachment.data || binary,
        },
      };
    }

    return {
      ...message,
      text,
      codeSnippet: undefined,
      officeAttachment: officeStub(attachment),
    };
  });
}
