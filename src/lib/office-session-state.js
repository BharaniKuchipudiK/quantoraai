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

export function lightweightOfficeArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return artifact;
  const { data: _binary, ...rest } = artifact;
  return rest;
}

export function sanitizeMessagesForPersistence(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    if (!message?.officeAttachment) return message;
    return {
      ...message,
      officeAttachment: lightweightOfficeArtifact(message.officeAttachment),
    };
  });
}

export function sanitizeSessionsForPersistence(sessions = []) {
  if (!Array.isArray(sessions)) return [];
  return sessions.map((session) => ({
    ...session,
    messages: sanitizeMessagesForPersistence(session?.messages || []),
  }));
}
