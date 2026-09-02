function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : '');
    };
    reader.onerror = () => reject(new Error('Could not read Study source.'));
    reader.readAsDataURL(file);
  });
}

export async function ingestStudySourceFile(file) {
  if (!file) throw new Error('Choose a Study source first.');
  const dataBase64 = await toBase64(file);
  const response = await fetch('/api/study-source', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name || 'study-source',
      mimeType: file.type || '',
      dataBase64,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Study source could not be ingested.');
    error.reason = payload?.reason || null;
    throw error;
  }
  return payload?.source || null;
}

export function studySourceContextText(source, maxChars = 24_000) {
  if (!source || source.kind !== 'pdf' || !Array.isArray(source.pages)) return '';
  const blocks = source.pages
    .filter((page) => Number.isInteger(page?.page) && typeof page?.text === 'string' && page.text.trim())
    .map((page) => `[Source: ${source.filename}, page ${page.page}]\n${page.text.trim()}`);
  const text = blocks.join('\n\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
